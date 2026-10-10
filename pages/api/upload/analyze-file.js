// /api/upload/analyze-file
// PUBLIC. Phase 1 of the tenant document upload: analyze ONE document per request. The old
// batched submit hit BOTH of Vercel's walls — the 4.5MB request-body cap (a 26mb bodyParser
// cannot override it) and the 60s function limit from two chained Claude calls. Splitting into
// one-file-per-request keeps every request small and every call short.
//
// The docreq token is the authorization (this route is public): it was minted by the realtor and
// maps to exactly one applicant. We run the SAME shared engine the realtor path uses
// (lib/applicantAnalysis.runDocumentAnalysis) on a ONE-ELEMENT array — no forked logic — and
// stage ONLY the extracted facts under docreq:{token}:staging. The AI reads and discards: the
// raw bytes live in memory for this single Claude call and are nulled inside the engine. AFTER the
// analysis of this file succeeds, the original is written once to the private bucket for the
// realtor's review (lib/documentStore.js, 14 days or until deleted, db/documents.sql); nothing raw
// goes to KV or logs. Nothing is written to listing_applicants here, that happens once, in
// /api/upload/finalize.
// A credit report (lib/creditShared.js) is kept only when its name matches the applicant, it shows
// a legible date within 90 days, and (when the tenant added it as one, `expect`) it reads as a
// credit report. A refused file is never written to the bucket: its bytes end with this request,
// and document_rejected is recorded for the realtor's listing with the reason.
import { kvReady, kvGetJson, kvSetJson, reqKey, stagingKey, isDocReqToken, STAGING_TTL } from '../../../lib/docRequest';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { runDocumentAnalysis, ALLOWED_DOC_MIME, MAX_DOCS } from '../../../lib/applicantAnalysis';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { storeAnalyzedDocuments, kindOf } from '../../../lib/documentStore';
import { creditRejection, CREDIT_KIND } from '../../../lib/creditShared';
import { recordForListing } from '../../../lib/events';
import { fileFacts } from '../../../lib/documentFile';

// One document per request → a single base64 file (client-capped at ~3MB raw ≈ 4MB base64, under
// Vercel's 4.5MB body cap). ONE Claude vision call: allow a modest duration for multi-page PDFs.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } }, maxDuration: 30 };

const fileKeyOf = (name, size) => `${String(name || 'document').slice(0, 120)}::${size}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  const { token, index, total } = req.body || {};
  const expect = req.body && req.body.expect === CREDIT_KIND ? CREDIT_KIND : null; // the credit row's own picker
  let file = req.body && req.body.file;
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!file || typeof file !== 'object') return res.status(400).json({ error: 'No document received.' });
  // The token is the only credential, so it is also the rate limit key (10 an hour per token, 30 per IP).
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `upload:${token}`, ip: clientIp });
  if (!limited.ok) { file.data = null; return res.status(429).json({ error: limited.message }); }
  if (Number.isFinite(total) && total > MAX_DOCS) { file.data = null; return res.status(400).json({ error: `Up to ${MAX_DOCS} documents at a time.` }); }

  const mime = String(file.type || '').toLowerCase();
  const data = String(file.data || '');
  const name = String(file.name || 'document').slice(0, 120);
  if (!data || data.length < 16) { file.data = null; return res.status(400).json({ error: 'That file looks empty.' }); }
  if (!ALLOWED_DOC_MIME.includes(mime)) { file.data = null; return res.status(400).json({ error: 'Please upload a PDF or image (JPG or PNG).' }); }
  const size = Math.floor((data.length * 3) / 4);
  // Per-file guard mirrors the client (~3MB raw) — keeps us safely under the platform body cap.
  if (size > 4 * 1024 * 1024) { file.data = null; return res.status(413).json({ error: 'This file is too large, please upload a version under 3MB.' }); }

  const rec = await kvGetJson(reqKey(token));
  if (!rec) { file.data = null; return res.status(404).json({ error: 'This upload link has expired or is no longer active.' }); }

  const fkey = fileKeyOf(name, size);

  // Idempotent re-submit: if this exact file was already staged (partial-failure retry), skip the
  // Claude call and report success so the client can move on.
  const staging = (await kvGetJson(stagingKey(token))) || {};
  if (!staging.items) staging.items = {};
  if (staging.items[fkey]) {
    file.data = null;
    return res.status(200).json({ ok: true, skipped: true, filename: name, documentType: staging.items[fkey].document?.documentType || null });
  }
  // The same cap the realtor path enforces (lib/realtorUpload.js): six files per submission.
  if (Object.keys(staging.items).length >= MAX_DOCS) { file.data = null; return res.status(400).json({ error: `Up to ${MAX_DOCS} documents at a time.` }); }

  // Load THIS applicant (token is the authorization; the admin client only ever touches the single
  // applicant the token maps to). Needed so runDocumentAnalysis can compare the document to the
  // application's STATED values. Null-safe: if it can't bind, analysis still runs (comparisons come
  // back not-found) and the real two-key write guard is enforced later in finalize.
  // A party's request (rec.partyId, lib/partyStore.js): the party's own row stands in for the
  // application, so the name on the documents is checked against the party, not the primary, and
  // the primary's stated facts never enter the analysis of a party's files.
  let application = null, listing = null, admin = null, party = null;
  try {
    const supaOk = isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supaOk && rec.linkId && rec.listingId) {
      admin = getSupabaseAdminClient();
      const { data: junction } = await admin
        .from('listing_applicants').select('*, application:applications(*)')
        .eq('id', rec.linkId).eq('listing_id', rec.listingId).maybeSingle();
      const bound = junction && rec.applicationId != null && String(junction.application_id) === String(rec.applicationId);
      if (bound && rec.partyId) {
        const { data: p } = await admin.from('application_parties').select('*').eq('id', rec.partyId).eq('application_id', junction.application_id).maybeSingle();
        party = p || null;
      }
      if (bound && rec.partyId && !party) { file.data = null; return res.status(404).json({ error: 'This upload link is no longer active.' }); }
      if (bound) {
        application = party
          ? { id: junction.application_id, full_name: party.full_name, annual_income: party.annual_income, employer: party.employer || party.business_name, job_title: party.job_title, years_at_job: party.years_at_job }
          : { ...(junction.application || {}) };
        delete application.owner_token;  // never handled/exposed here
        delete application.cover_letter; // not needed for analysis
        const { data: l } = await admin.from('listings').select('*').eq('id', rec.listingId).maybeSingle();
        listing = l || null;
      }
    }
  } catch (e) { console.error('[upload/analyze-file] applicant load error:', e?.message || e); }

  // Analyze this ONE document with the shared engine (one-element array — identical behavior to the
  // realtor batch, just N=1). runDocumentAnalysis nulls the bytes internally (process-and-discard).
  let run = null;
  try {
    run = await runDocumentAnalysis({ files: [file], application, listing });
  } catch (e) {
    console.error('[upload/analyze-file] analysis error:', e?.code || e?.message || e);
  } finally {
    if (file) file.data = null; // belt-and-suspenders discard
    if (req.body) req.body.file = null;
    file = null;
  }
  if (!run || !Array.isArray(run.documents) || !run.documents.length) {
    return res.status(502).json({ error: `We couldn't read ${name}. Please try again.` });
  }

  // A credit report that cannot be kept: nothing is stored, nothing is staged, the reason is recorded.
  const refused = creditRejection(run.documents[0], application ? application.full_name : null, { expected: expect === CREDIT_KIND });
  if (refused) {
    if (admin && application && listing) {
      try { await recordForListing(admin, rec.listingId, 'document_rejected', { applicationId: application.id || rec.applicationId || null, linkId: rec.linkId, payload: { kind: CREDIT_KIND, reason: refused.code, applicantName: application.full_name || null, by: 'tenant' } }); }
      catch (e) { console.error('[upload/analyze-file] reject event:', e?.message || e); }
    }
    return res.status(422).json({ error: refused.message, rejected: refused.code, filename: name });
  }

  // Held for the realtor's review: the original bytes (`data`, kept in scope for exactly this) go
  // to the private bucket ONLY here, after the analysis of this file succeeded. The first file of
  // a submission replaces the applicant's previously held files. A storage failure is logged and
  // the analysis result still returns. Skipped when the token could not be bound to an applicant.
  let documentId = null; // the held row, so the tenant can remove this file before they submit (remove-file.js)
  // Two facts from the bytes while this request holds them (lib/documentFile.js): the content hash
  // kept on the held row, and whether a PDF was saved in a general purpose editor after it was made.
  const facts = await fileFacts(Buffer.from(data, 'base64'), mime);
  if (admin && application && listing && listing.profile_id) {
    const firstOfSubmission = Object.keys(staging.items).length === 0;
    const stored = await storeAnalyzedDocuments(admin, { profileId: listing.profile_id, listingId: rec.listingId, linkId: rec.linkId, applicationId: application.id || rec.applicationId || null, applicantName: application.full_name || null, uploadedBy: 'tenant', replace: firstOfSubmission, partyId: rec.partyId || null, files: [{ mime, bytes: Buffer.from(data, 'base64'), kind: kindOf(run.documents[0]), hash: facts.hash }] });
    documentId = stored && Array.isArray(stored.ids) ? stored.ids[0] || null : null;
  }

  // Stage ONLY the extracted facts for this file (no images, no raw bytes).
  const perFile = {
    index: Number.isFinite(index) ? index : Object.keys(staging.items).length,
    filename: name,
    size,
    document: run.documents[0],
    comparisons: Array.isArray(run.comparisons) ? run.comparisons : [],
    documentName: (run.documentNames && run.documentNames[0]) || null,
    confidence: run.confidence || 'medium',
    documentId,
    fileEdited: facts.editedAfterCreation === true,
  };
  staging.items[fkey] = perFile;
  staging.total = Number.isFinite(total) ? total : Math.max(Object.keys(staging.items).length, staging.total || 0);
  staging.updatedAt = new Date().toISOString();
  await kvSetJson(stagingKey(token), staging, STAGING_TTL);

  return res.status(200).json({
    ok: true, filename: name, index: perFile.index,
    documentType: perFile.document?.documentType || null,
    staged: Object.keys(staging.items).length,
  });
}
