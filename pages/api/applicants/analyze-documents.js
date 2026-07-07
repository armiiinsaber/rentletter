// /api/applicants/analyze-documents
// Realtor-authenticated batch document intelligence. The realtor drops UP TO 6 documents
// (jpg/png/pdf, base64) for one applicant; ALL are read in ONE Claude vision call that
// categorizes each, extracts ONLY screenable facts, cross-references them, and compares to
// the application's stated values. Returns ONE organized report.
//
// PROCESS-AND-DISCARD: the raw file bytes exist ONLY in this function's memory for the
// single Claude call. They are NEVER written to disk, Storage/buckets, or logs, and are
// dropped as soon as the call returns. Only the STRUCTURED RESULT (no images) is persisted
// to listing_applicants.doc_verifications. OHRC-safe by construction (prompt + facts shape).
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import {
  authorizeApplicant, runDocumentAnalysis,
  ALLOWED_DOC_MIME, MAX_DOCS, MAX_TOTAL_BYTES,
} from '../../../lib/applicantAnalysis';

// Allow the batch payload (≤6 docs, base64) through Next's default 1MB body cap.
export const config = { api: { bodyParser: { sizeLimit: '26mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, applicationId, files } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Add at least one document.' });
  if (files.length > MAX_DOCS) return res.status(400).json({ error: `Up to ${MAX_DOCS} documents at a time.` });

  // Validate each file (type + decode size) and total payload. We measure bytes from the
  // base64 length; we do NOT store the bytes.
  let totalBytes = 0;
  for (const f of files) {
    const mime = String(f?.type || '').toLowerCase();
    if (!ALLOWED_DOC_MIME.includes(mime)) return res.status(400).json({ error: 'Only JPG, PNG, or PDF files are supported.' });
    const data = String(f?.data || '');
    if (!data || data.length < 16) return res.status(400).json({ error: 'One of the files looks empty.' });
    totalBytes += Math.floor((data.length * 3) / 4);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: 'Those documents are too large together (max 25MB). Try fewer or smaller files.' });
  }

  // Authorize: realtor must own the listing AND this link must be on it.
  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[analyze-documents] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  // STRICT per-applicant binding: the row we are about to write (id = linkId) MUST be the exact
  // applicant these documents were uploaded for. Cross-check the application_id so a stale/wrong
  // linkId can NEVER persist analysis onto a DIFFERENT applicant's listing_applicants row.
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    console.error('[analyze-documents] applicant binding mismatch — linkId row application_id',
      ctx.junction.application_id, '!== expected', applicationId, '(refusing to write)');
    return res.status(409).json({ error: 'Applicant reference mismatch — please reload the page and try again.' });
  }

  // Run the SAME shared analysis engine the tenant self-upload path uses, so the persisted
  // result is IDENTICAL regardless of who uploaded. PROCESS-AND-DISCARD happens inside (the raw
  // bytes are nulled before it returns; nothing raw is written to disk, Storage, or logs).
  let run;
  try {
    run = await runDocumentAnalysis({ files, application: ctx.application, listing: ctx.listing });
  } catch (e) {
    if (e?.code === 'unreadable') {
      return res.status(502).json({ error: 'The analysis came back unreadable. Please try again.' });
    }
    // 'ai_error' | 'config' | anything else → generic read failure (bytes already discarded).
    return res.status(502).json({ error: 'Could not read those documents. Please try again.' });
  }

  // Persist ONLY the structured result. Accumulate across analyses (most recent last).
  let verifications = [run];
  try {
    const admin = getSupabaseAdminClient();
    const existing = ctx.junction.doc_verifications;
    verifications = Array.isArray(existing) ? [...existing, run] : [run];
    // [temp diagnostic] .select() returns the affected rows so we can confirm the write hits
    // EXACTLY ONE row (the intended applicant's), not multiple.
    const { data: upRows, error: upErr } = await admin
      .from('listing_applicants')
      .update({ doc_verifications: verifications })
      .eq('id', linkId)
      .select('id, application_id');
    console.log('[verif-trace][write] linkId=%s applicationId=%s junction.id=%s junction.application_id=%s affectedRows=%j',
      linkId, applicationId, ctx.junction?.id, ctx.junction?.application_id, (upRows || []).map((r) => ({ id: r.id, application_id: r.application_id })));
    if (upErr) {
      console.error('[analyze-documents] persist error:', upErr.message);
      // Still return the result so the realtor sees it; warn that it wasn't saved.
      return res.status(200).json({ result: run, verifications, saved: false });
    }
  } catch (e) {
    console.error('[analyze-documents] persist exception:', e?.message || e);
    return res.status(200).json({ result: run, verifications, saved: false });
  }

  return res.status(200).json({ result: run, verifications, saved: true });
}
