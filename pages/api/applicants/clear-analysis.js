// /api/applicants/clear-analysis
// Realtor-authenticated. Clears (nulls) doc_verifications + ai_insight on ONE applicant's own
// listing_applicants row. Uses the SAME authorization + strict two-key binding (linkId +
// applicationId) as analyze-documents, so a realtor can only clear an applicant on a listing
// they own, and only the exact intended row is ever cleared. Used to remove stale/incorrect
// verification (e.g. data mis-saved before the write-guard fix) so the applicant reverts to
// "Not verified — no documents provided" on the dashboard AND the landlord report.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant } from '../../../lib/applicantAnalysis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, applicationId } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });

  // Authorize: realtor must own the listing AND this link must be on it.
  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[clear-analysis] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  // STRICT per-applicant binding: only clear the row that matches BOTH the linkId AND the
  // intended application — never a different applicant's row.
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    console.error('[clear-analysis] applicant binding mismatch — linkId row application_id',
      ctx.junction.application_id, '!== expected', applicationId, '(refusing to clear)');
    return res.status(409).json({ error: 'Applicant reference mismatch — please reload the page and try again.' });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { error: upErr } = await admin
      .from('listing_applicants')
      .update({ doc_verifications: null, ai_insight: null })
      .eq('id', linkId);
    if (upErr) {
      console.error('[clear-analysis] clear error:', upErr.message);
      return res.status(500).json({ error: 'Could not clear the analysis. Please try again.' });
    }
  } catch (e) {
    console.error('[clear-analysis] clear exception:', e?.message || e);
    return res.status(500).json({ error: 'Could not clear the analysis. Please try again.' });
  }

  return res.status(200).json({ ok: true, cleared: true });
}
