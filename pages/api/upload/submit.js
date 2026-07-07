// /api/upload/submit
// PUBLIC. The tenant submits their documents from the secure /upload/[token] page.
//
// PROCESS-AND-DISCARD: the raw file bytes are received into this function's memory ONLY. They
// are NEVER written to disk, a Storage bucket, or logs, and are dropped as soon as this handler
// returns. The documents are handed to the SAME analysis engine the realtor-upload path uses
// (lib/applicantAnalysis.runDocumentAnalysis) so the persisted result is IDENTICAL regardless of
// who uploaded. Only the STRUCTURED result (extracted facts — no images) is persisted, onto the
// exact applicant this docreq token maps to, guarded by the same two-key (linkId + application_id)
// check as the realtor path so a stale token can never write onto a different applicant's row.
import { kvReady, kvGetJson, kvSetJson, reqKey, appKey, isDocReqToken, DOCREQ_TTL } from '../../../lib/docRequest';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { runDocumentAnalysis, generateApplicantInsight, ALLOWED_DOC_MIME, MAX_DOCS } from '../../../lib/applicantAnalysis';

// Accept the base64 batch through Next's default 1MB body cap (matches analyze-documents). The
// handler runs up to two Claude calls (analysis + insight), so allow extra function duration.
export const config = { api: { bodyParser: { sizeLimit: '26mb' } }, maxDuration: 60 };

const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB decoded, across all files
// Document-oriented types (superset of what the analyzer reads; broad here so tenants aren't
// blocked — analysis only reads the subset it supports, see ALLOWED_DOC_MIME).
const OK_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  let { token, files } = req.body || {};
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Add at least one document.' });
  if (files.length > MAX_FILES) return res.status(400).json({ error: `Up to ${MAX_FILES} files at a time.` });

  // Validate size/type without storing anything. Byte count is derived from the base64 length.
  let totalBytes = 0;
  for (const f of files) {
    const data = String(f?.data || '');
    if (!data || data.length < 16) return res.status(400).json({ error: 'One of the files looks empty.' });
    const mime = String(f?.type || '').toLowerCase();
    if (mime && !OK_MIME.has(mime)) return res.status(400).json({ error: 'Please upload PDF, image, or Word documents.' });
    totalBytes += Math.floor((data.length * 3) / 4);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: 'Those documents are too large together (max 25MB). Try fewer or smaller files.' });
  }

  const rec = await kvGetJson(reqKey(token));
  if (!rec) return res.status(404).json({ error: 'This upload link has expired or is no longer active.' });

  const fileCount = files.length;
  const receivedAt = new Date().toISOString();

  // ── Analyze the documents through the SAME engine as the realtor-upload path ──────────────
  // The docreq token is the authorization here (this route is public): it was minted by the
  // realtor and maps to exactly one applicant. We load that applicant with the admin client and
  // enforce the two-key guard before writing. Everything below is best-effort — a failure never
  // loses the tenant's effort: the request is still marked "received" and the realtor notified.
  let boundToApplicant = false; // junction found AND application_id matches the token record
  let verified = false;         // a structured analysis run was persisted
  try {
    const supaOk = isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supaOk && rec.linkId && rec.listingId) {
      const admin = getSupabaseAdminClient();
      const { data: junction } = await admin
        .from('listing_applicants')
        .select('*, application:applications(*)')
        .eq('id', rec.linkId)
        .eq('listing_id', rec.listingId)
        .maybeSingle();

      // STRICT two-key guard: the row we write (id = linkId) MUST be the exact applicant this
      // token was minted for. A linkId/application_id mismatch → refuse to write any analysis.
      const bound = junction && rec.applicationId != null &&
        String(junction.application_id) === String(rec.applicationId);
      if (junction && !bound) {
        console.error('[upload/submit] applicant binding mismatch — linkId row application_id',
          junction.application_id, '!== token applicationId', rec.applicationId, '(refusing to write)');
      }

      if (bound) {
        boundToApplicant = true;
        const application = { ...(junction.application || {}) };
        delete application.owner_token;  // never handled/exposed here
        delete application.cover_letter; // not needed for analysis
        const { data: listing } = await admin.from('listings').select('*').eq('id', rec.listingId).maybeSingle();

        // Only the analyzer-supported subset (jpg/png/pdf), capped like the realtor path.
        const analyzable = files
          .filter((f) => ALLOWED_DOC_MIME.includes(String(f?.type || '').toLowerCase()))
          .slice(0, MAX_DOCS);

        let run = null;
        if (analyzable.length) {
          try {
            // PROCESS-AND-DISCARD happens inside: bytes are nulled before this returns.
            run = await runDocumentAnalysis({ files: analyzable, application, listing });
          } catch (e) {
            console.error('[upload/submit] analysis error:', e?.code || e?.message || e);
          }
        }

        if (run) {
          // Persist ONLY the structured result — tagged as a tenant self-upload — onto this
          // applicant's row, accumulating across analyses (most recent last). Same shape and
          // same target as the realtor path, so the realtor's view renders it identically.
          try {
            const existing = junction.doc_verifications;
            const verifications = Array.isArray(existing) ? [...existing, { ...run, source: 'tenant' }] : [{ ...run, source: 'tenant' }];
            const { data: upRows, error: upErr } = await admin
              .from('listing_applicants')
              .update({ doc_verifications: verifications })
              .eq('id', rec.linkId)
              .select('id, application_id');
            if (upErr) {
              console.error('[upload/submit] persist error:', upErr.message);
            } else {
              verified = (upRows || []).length > 0;
              console.log('[verif-trace][tenant-upload] linkId=%s applicationId=%s affectedRows=%j',
                rec.linkId, rec.applicationId, (upRows || []).map((r) => ({ id: r.id, application_id: r.application_id })));
            }
          } catch (e) {
            console.error('[upload/submit] persist exception:', e?.message || e);
          }

          // Auto-generate the OHRC-safe insight (best-effort) so the realtor sees the complete
          // read on next load — the tenant uploads asynchronously and isn't there to click it.
          if (verified) {
            try {
              const insight = await generateApplicantInsight({ application, listing, verificationRun: run });
              if (insight) await admin.from('listing_applicants').update({ ai_insight: insight }).eq('id', rec.linkId);
            } catch (e) {
              console.error('[upload/submit] insight error:', e?.code || e?.message || e);
            }
          }
        }

        // Notification markers (GROUP 3): the realtor's on-load notification center derives a
        // "documents received (& verified)" event from these timestamps, exactly like it derives
        // new/withdrawal events. Isolated + best-effort so a not-yet-migrated column can't break
        // the receipt. docs_verified distinguishes "received & verified" from "received".
        try {
          await admin.from('listing_applicants')
            .update({ docs_submitted_at: receivedAt, docs_verified: verified })
            .eq('id', rec.linkId);
        } catch (e) {
          console.warn('[upload/submit] notification marker skipped:', e?.message || e);
        }
      }
    }
  } catch (e) {
    // Never let an analysis hiccup error the tenant out — their upload was received.
    console.error('[upload/submit] pipeline error:', e?.message || e);
  }

  // PROCESS-AND-DISCARD: explicitly drop all references to the raw bytes. (runDocumentAnalysis
  // already nulled the analyzed subset; this covers every file unconditionally.)
  for (const f of files) { if (f) f.data = null; }
  files = null;
  req.body.files = null;

  // Acknowledge receipt in KV (drives the realtor's "Received" badge and the tenant's done state).
  try {
    await kvSetJson(reqKey(token), { ...rec, status: 'received', receivedAt, fileCount, verified }, DOCREQ_TTL);
    if (rec.linkId) {
      const ptr = await kvGetJson(appKey(rec.linkId));
      await kvSetJson(appKey(rec.linkId), { ...(ptr || {}), token, status: 'received', requestedAt: (ptr && ptr.requestedAt) || rec.requestedAt || null, receivedAt, fileCount }, DOCREQ_TTL);
    }
  } catch (e) {
    console.error('[upload/submit] status write error:', e?.message || e);
    // The tenant's docs were received; a status-write hiccup shouldn't error them out.
  }

  return res.status(200).json({ ok: true, received: fileCount });
}
