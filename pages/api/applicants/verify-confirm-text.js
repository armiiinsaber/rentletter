// /api/applicants/verify-confirm-text
// Realtor-authenticated. Stage-2 SINGLE-APPLICANT verification confirmation as paste-ready
// plain text for the landlord. Owner-only + strict two-key (linkId + applicationId). Reads the
// applicant's OWN doc_verifications (no re-analysis); deterministic text (no AI). Shows verified
// facts or the not-verified reason line. owner_token never exposed.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadApplicantVerification, verificationConfirmText } from '../../../lib/listingReportData';

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

  try {
    const admin = getSupabaseAdminClient();
    const loaded = await loadApplicantVerification(supabase, admin, listingId, linkId, applicationId, user.id);
    if (loaded.error) return res.status(loaded.status || 400).json({ error: loaded.error });

    const text = verificationConfirmText({
      realtorName: loaded.profile?.full_name || 'Your realtor',
      brokerage: loaded.profile?.brokerage || '',
      phone: loaded.profile?.phone || '',
      unitName: loaded.listing?.name || loaded.listing?.address || '',
      applicantName: loaded.applicantName,
      verification: loaded.verification,
    });
    return res.status(200).json({ text });
  } catch (e) {
    console.error('[verify-confirm-text] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not generate the verification text.' });
  }
}
