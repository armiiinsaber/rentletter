// /api/applicants/verify-confirm-pdf
// Realtor-authenticated. Stage-2 SINGLE-APPLICANT verification confirmation as a white-label
// PDF for the landlord. Owner-only + strict two-key (linkId + applicationId) — same guards as
// analyze-documents. Reads the applicant's OWN doc_verifications (no re-analysis); shows the
// verified facts or a clear "Not verified …" line (e.g. document-name mismatch). owner_token
// never exposed.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadApplicantVerification } from '../../../lib/listingReportData';
import { buildVerificationPdf } from '../../../lib/landlordReportPdf';
import { loadPairingFonts } from '../../../lib/pdfFonts';

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

    const fonts = loadPairingFonts(loaded.profile?.brand_fonts);
    const bytes = await buildVerificationPdf({
      profile: loaded.profile,
      listing: loaded.listing,
      applicantName: loaded.applicantName,
      verification: loaded.verification,
      fonts,
    });

    const slug = String(loaded.applicantName || 'applicant').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="verification-${slug}-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.setHeader('Content-Length', bytes.length);
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    console.error('[verify-confirm-pdf] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not generate the verification PDF.' });
  }
}
