// /api/upload/finalize
// PUBLIC. Phase 2 of the tenant document upload: called ONCE after every file has been analyzed
// by /api/upload/analyze-file. It reads the staged per-document facts, assembles the SAME run
// shape the realtor batch produces (so the realtor-facing DocIntelReport renders identically),
// and writes doc_verifications / docs_submitted_at / docs_verified onto the exact applicant this token maps to —
// under the same two-key (linkId + application_id) write guard as the realtor path.
//
// No document analysis happens here (no image bytes are present), only structured facts, so there
// is no 4.5MB / 60s exposure. On success it marks the docreq
// received, sets the realtor's notification marker, and clears the staging keys. A transient save
// failure returns an error WITHOUT marking received or clearing staging, so the client can retry
// finalize only (no re-analysis).
import { kvReady, kvGetJson, kvSetJson, kvDel, kvSrem, reqKey, appKey, stagingKey, isDocReqToken, DOCREQ_TTL } from '../../../lib/docRequest';
import { invalidateSignals } from '../../../lib/signalsCache';
import { recordForListing } from '../../../lib/events';
import { verificationFacts } from '../../../lib/applicantSynthesis';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { buildCombinedRun } from '../../../lib/uploadCombine';
import { withActiveReport } from '../../../lib/docVerifications';

// Only a token in the body. Modest duration, no large body.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  const { token } = req.body || {};
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });

  const rec = await kvGetJson(reqKey(token));
  if (!rec) return res.status(404).json({ error: 'This upload link has expired or is no longer active.' });

  const staging = await kvGetJson(stagingKey(token));
  const items = staging && staging.items ? Object.values(staging.items) : [];
  if (!items.length) {
    // Idempotent: a duplicate finalize after success (staging already cleared) is a no-op success.
    if (rec.status === 'received') return res.status(200).json({ ok: true, received: rec.fileCount || 0, verified: !!rec.verified, alreadyDone: true });
    return res.status(400).json({ error: 'No analyzed documents to finish. Please add your documents and try again.' });
  }

  const receivedAt = new Date().toISOString();
  const fileCount = items.length;

  let verified = false;
  let persistAttempted = false;
  let persistFailed = false;

  const supaOk = isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaOk && rec.linkId && rec.listingId) {
    try {
      const admin = getSupabaseAdminClient();
      const { data: junction } = await admin
        .from('listing_applicants').select('*, application:applications(*)')
        .eq('id', rec.linkId).eq('listing_id', rec.listingId).maybeSingle();

      // STRICT two-key guard: only write to the exact applicant this token was minted for.
      const bound = junction && rec.applicationId != null && String(junction.application_id) === String(rec.applicationId);
      if (junction && !bound) {
        console.error('[upload/finalize] applicant binding mismatch — linkId row application_id',
          junction.application_id, '!== token applicationId', rec.applicationId, '(refusing to write)');
      }

      if (bound) {
        persistAttempted = true;
        const application = { ...(junction.application || {}) };
        delete application.owner_token;
        delete application.cover_letter;
        const { data: listing } = await admin.from('listings').select('*').eq('id', rec.listingId).maybeSingle();

        const run = buildCombinedRun(items, application.full_name || '', application.annual_income);

        // Persist the combined result — tagged as a tenant self-upload — as the ACTIVE report,
        // preserving any archived history. Same column, row, and shape as the realtor path.
        const newDocV = withActiveReport(junction.doc_verifications, { ...run, source: 'tenant' });
        const { data: upRows, error: upErr } = await admin
          .from('listing_applicants').update({ doc_verifications: newDocV }).eq('id', rec.linkId).select('id, application_id');

        if (upErr) { console.error('[upload/finalize] persist error:', upErr.message); persistFailed = true; }
        else if (!(upRows || []).length) { console.error('[upload/finalize] persist affected 0 rows'); persistFailed = true; }
        else {
          verified = true;
          {
            const facts = verificationFacts(newDocV);
            const outcome = facts.incomeVerified || facts.employmentVerified ? 'verification_completed' : 'verification_failed';
            await recordForListing(admin, rec.listingId, 'documents_uploaded', { applicationId: junction.application_id, linkId: rec.linkId, payload: { applicantName: application.full_name || null, documents: items.length } });
            await recordForListing(admin, rec.listingId, outcome, { applicationId: junction.application_id, linkId: rec.linkId, payload: { applicantName: application.full_name || null, by: 'tenant', nameMatch: run.nameMatch || null } });
          }
          if (listing?.profile_id) invalidateSignals(listing.profile_id); // the realtor's bell picks the upload up within the minute


          // Notification marker (best-effort, isolated so a not-yet-migrated column can't fail it).
          try {
            await admin.from('listing_applicants').update({ docs_submitted_at: receivedAt, docs_verified: true }).eq('id', rec.linkId);
          } catch (e) { console.warn('[upload/finalize] notification marker skipped:', e?.message || e); }
        }
      }
    } catch (e) {
      console.error('[upload/finalize] persist exception:', e?.message || e);
      persistFailed = true;
    }
  }

  // Transient save failure → keep staging, let the client retry finalize only (no re-analysis).
  if (persistAttempted && persistFailed) {
    return res.status(502).json({ error: 'We received your documents but couldn’t finish saving them. Please tap Submit to finish.' });
  }

  // Terminal (verified, or nothing-to-persist because Supabase is off / unbound): acknowledge
  // receipt in KV and clear the staging keys.
  try {
    await kvSetJson(reqKey(token), { ...rec, status: 'received', receivedAt, fileCount, verified }, DOCREQ_TTL);
    if (rec.linkId) {
      const ptr = await kvGetJson(appKey(rec.linkId));
      await kvSetJson(appKey(rec.linkId), { ...(ptr || {}), token, status: 'received', requestedAt: (ptr && ptr.requestedAt) || rec.requestedAt || null, receivedAt, fileCount }, DOCREQ_TTL);
      await kvSrem(rec.linkId); // the report exists: no more reminders (lib/nudges.js)
    }
    await kvDel(stagingKey(token));
  } catch (e) {
    console.error('[upload/finalize] status write error:', e?.message || e);
  }

  return res.status(200).json({ ok: true, received: fileCount, verified });
}
