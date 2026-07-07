// /api/applicants/insight
// Realtor-authenticated. Produces ONE short, professional, OHRC-safe insight paragraph for
// an applicant, drawing on the application's screenable facts AND the document-verification /
// cross-reference results (if any). It states the read on financial fit, tenure, references,
// employment stability, and verified/mismatched facts — never a protected ground, never a
// reject recommendation. Persisted to listing_applicants.ai_insight.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant, generateApplicantInsight } from '../../../lib/applicantAnalysis';
import { activeReport } from '../../../lib/docVerifications';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, applicationId } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });

  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[insight] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  // STRICT per-applicant binding (same as analyze-documents): the row we persist ai_insight to
  // MUST be the exact applicant requested. Reject a linkId/applicationId mismatch.
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    console.error('[insight] applicant binding mismatch — linkId row application_id',
      ctx.junction.application_id, '!== expected', applicationId, '(refusing to write)');
    return res.status(409).json({ error: 'Applicant reference mismatch — please reload the page and try again.' });
  }

  // The ACTIVE document-verification report (structured facts only — no images were ever stored).
  const latest = activeReport(ctx.junction.doc_verifications);

  // Generate via the SHARED insight engine (same one the tenant-upload path auto-runs), so a
  // realtor-generated insight and a tenant-triggered one are produced identically.
  let insight;
  try {
    insight = await generateApplicantInsight({ application: ctx.application, listing: ctx.listing, verificationRun: latest });
  } catch (e) {
    if (e?.code === 'empty') return res.status(502).json({ error: 'The insight came back empty. Please try again.' });
    if (e?.code === 'blocked') return res.status(422).json({ error: 'The insight was withheld for compliance. Please try again.' });
    // 'ai_error' | 'config' | anything else.
    return res.status(502).json({ error: 'Could not generate the insight. Please try again.' });
  }

  let saved = true;
  try {
    const admin = getSupabaseAdminClient();
    const { error: upErr } = await admin.from('listing_applicants').update({ ai_insight: insight }).eq('id', linkId);
    if (upErr) { console.error('[insight] persist error:', upErr.message); saved = false; }
  } catch (e) {
    console.error('[insight] persist exception:', e?.message || e);
    saved = false;
  }

  return res.status(200).json({ insight, saved });
}
