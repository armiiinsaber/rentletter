// lib/realtorUpload.js  SERVER ONLY (takes the service role client). The realtor's per file
// document upload: the same two phases the tenant path runs (pages/api/upload/analyze-file.js
// and finalize.js), behind the realtor's session, entitlement and ownership. One file per
// request, at most PER_FILE_BYTES decoded, so no request ever nears Vercel's 4.5MB body cap;
// then one finalize that combines the staged facts, writes the junction row, records the
// events and clears the cache. deps: { admin, userId, kv: { get, set, del }, analyze, store,
// listHeld, recordEvent, invalidate, now }. Every function answers { status, body }.
import { ALLOWED_DOC_MIME, MAX_DOCS } from './applicantAnalysis.js';
import { buildCombinedRun, stagedItem, PER_FILE_BYTES } from './uploadCombine.js';
import { withActiveReport } from './docVerifications.js';
import { verificationFacts } from './applicantSynthesis.js';

export const STAGING_TTL = 24 * 60 * 60;
export const stagingKeyFor = (userId, linkId) => `rstage:${userId}:${linkId}`;
const fileKeyOf = (name, size) => `${String(name || 'document').slice(0, 120)}::${size}`;

// The applicant, owned: the listing carries profile_id === userId and the junction row sits on
// it; a client supplied applicationId must match the row (never write onto another applicant).
async function ownedApplicant(admin, { listingId, linkId, applicationId }, userId) {
  const { data: listing, error } = await admin.from('listings').select('*').eq('id', String(listingId)).maybeSingle();
  if (error) throw error;
  if (!listing) return { status: 404, body: { error: 'Applicant not found.' } };
  if (String(listing.profile_id) !== String(userId)) return { status: 403, body: { error: 'Not your applicant.' } };
  const { data: junction, error: jErr } = await admin.from('listing_applicants').select('*, application:applications(*)').eq('id', String(linkId)).eq('listing_id', listing.id).maybeSingle();
  if (jErr) throw jErr;
  if (!junction) return { status: 404, body: { error: 'Applicant not found.' } };
  if (applicationId != null && String(junction.application_id) !== String(applicationId)) return { status: 409, body: { error: 'Applicant reference mismatch, please reload the page and try again.' } };
  const application = { ...(junction.application || {}) }; delete application.owner_token; delete application.cover_letter;
  return { listing, junction, application };
}

// Phase 1: one file. { listingId, linkId, applicationId, index, total, file: { name, type, data } }
export async function analyzeOneFile(deps, body) {
  const { admin, userId, kv, analyze, store, now = new Date() } = deps;
  const { listingId, linkId, applicationId, index, total } = body || {};
  let file = body && body.file;
  if (!listingId || !linkId) return { status: 400, body: { error: 'Missing applicant reference.' } };
  if (!file || typeof file !== 'object') return { status: 400, body: { error: 'No document received.' } };
  const mime = String(file.type || '').toLowerCase();
  const data = String(file.data || '');
  const name = String(file.name || 'document').slice(0, 120);
  if (!data || data.length < 16) { file.data = null; return { status: 400, body: { error: 'That file looks empty.' } }; }
  if (!ALLOWED_DOC_MIME.includes(mime)) { file.data = null; return { status: 400, body: { error: 'Only JPG, PNG, or PDF files are supported.' } }; }
  const size = Math.floor((data.length * 3) / 4);
  if (size > PER_FILE_BYTES) { file.data = null; return { status: 413, body: { error: 'This file is too large, please use a version under 3MB.' } }; }
  if (Number.isFinite(total) && total > MAX_DOCS) { file.data = null; return { status: 400, body: { error: `Up to ${MAX_DOCS} documents at a time.` } }; }
  const own = await ownedApplicant(admin, { listingId, linkId, applicationId }, userId);
  if (own.status) { file.data = null; return own; }
  const key = stagingKeyFor(userId, linkId);
  const staging = (await kv.get(key)) || {};
  if (!staging.items) staging.items = {};
  const fkey = fileKeyOf(name, size);
  if (staging.items[fkey]) { file.data = null; return { status: 200, body: { ok: true, skipped: true, filename: name, staged: Object.keys(staging.items).length } }; }
  if (Object.keys(staging.items).length >= MAX_DOCS) { file.data = null; return { status: 400, body: { error: `Up to ${MAX_DOCS} documents at a time.` } }; }
  let run = null;
  try { run = await analyze({ files: [file], application: own.application, listing: own.listing }); }
  catch (e) { run = null; }
  finally { file.data = null; file = null; }
  if (!run || !Array.isArray(run.documents) || !run.documents.length) return { status: 502, body: { error: `We couldn't read ${name}. Please try again.` } };
  // Held for the realtor's review, after this file's analysis succeeded; the first file of a
  // submission replaces the applicant's previously held files (lib/documentStore.js).
  if (store) {
    try { await store({ profileId: userId, listingId: own.listing.id, linkId, applicationId: own.junction.application_id, applicantName: own.application.full_name || null, uploadedBy: 'realtor', files: [{ mime, bytes: Buffer.from(data, 'base64'), name, kind: run.documents[0]?.documentType || 'unknown' }], replace: Object.keys(staging.items).length === 0 }); }
    catch (e) { /* a storage failure never blocks the analysis */ }
  }
  staging.items[fkey] = stagedItem(run, { index: Number.isFinite(index) ? index : Object.keys(staging.items).length, name, size });
  staging.total = Number.isFinite(total) ? total : Math.max(Object.keys(staging.items).length, staging.total || 0);
  staging.updatedAt = new Date(now).toISOString();
  await kv.set(key, staging, STAGING_TTL);
  return { status: 200, body: { ok: true, filename: name, documentType: run.documents[0]?.documentType || null, staged: Object.keys(staging.items).length } };
}

// Phase 2: combine, write, record, clear. { listingId, linkId, applicationId }
export async function finalizeAnalysis(deps, body) {
  const { admin, userId, kv, listHeld, recordEvent, invalidate, now = new Date() } = deps;
  const { listingId, linkId, applicationId } = body || {};
  if (!listingId || !linkId) return { status: 400, body: { error: 'Missing applicant reference.' } };
  const own = await ownedApplicant(admin, { listingId, linkId, applicationId }, userId);
  if (own.status) return own;
  const key = stagingKeyFor(userId, linkId);
  const staging = await kv.get(key);
  const items = staging && staging.items ? Object.values(staging.items) : [];
  if (!items.length) return { status: 400, body: { error: 'Add at least one document.' } };
  const run = { ...buildCombinedRun(items, own.application.full_name || ''), analyzedAt: new Date(now).toISOString(), source: 'realtor' };
  const newDocV = withActiveReport(own.junction.doc_verifications, run);
  const { error } = await admin.from('listing_applicants').update({ doc_verifications: newDocV }).eq('id', own.junction.id);
  invalidate?.(userId);
  let held = null;
  if (listHeld) { try { held = await listHeld(linkId); } catch (e) { held = null; } }
  if (error) return { status: 200, body: { result: run, verifications: [run], saved: false, held } };
  await kv.del(key);
  const facts = verificationFacts([run]);
  const outcome = facts.incomeVerified || facts.employmentVerified ? 'verification_completed' : 'verification_failed';
  await recordEvent?.(admin, { profileId: userId, listingId: own.listing.id, applicationId: own.junction.application_id, type: outcome, payload: { applicantName: own.application.full_name || null, listingName: own.listing.name || own.listing.address || null, linkId, by: 'realtor', documents: items.length } });
  return { status: 200, body: { result: run, verifications: [run], saved: true, held } };
}
