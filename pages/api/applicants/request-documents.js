// /api/applicants/request-documents
// Realtor-authenticated. For ONE selected finalist applicant, mint (or reuse) a secure,
// single-applicant document-upload link the tenant can open to upload their own documents —
// removing the email round-trip. Coexists with the realtor-uploads-them path (ApplicantDocIntel).
//
// The token is unguessable (128-bit) and scoped to exactly this applicant (listing + junction +
// application binding). Stored in KV as docreq:{token} (+ a per-applicant reverse pointer). The
// realtor may optionally email the link to the tenant via Resend (uses the tenant's application
// email; never exposes owner_token or internal ids to the tenant). PRIVACY: no raw files here.
import { Resend } from 'resend';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant } from '../../../lib/applicantAnalysis';
import { kvReady, kvGetJson, kvSetJson, reqKey, appKey, newDocReqToken, isDocReqToken, DOCREQ_TTL } from '../../../lib/docRequest';

const resend = new Resend(process.env.RESEND_API_KEY);

function uploadUrl(token) { return `https://rentletter.ca/upload/${token}`; }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!kvReady()) return res.status(503).json({ error: 'Document-request service unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, applicationId, sendEmail } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });

  // Authorize: realtor owns the listing (RLS) AND this link is on it.
  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[request-documents] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });
  // Strict per-applicant binding (a stale linkId can never target a different applicant).
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    return res.status(409).json({ error: 'Applicant reference mismatch — please reload and try again.' });
  }

  const tenantName = String(ctx.application?.full_name || '').slice(0, 120);
  const tenantEmail = String(ctx.application?.email || '').trim().toLowerCase();
  const listingName = String(ctx.listing?.name || ctx.listing?.address || 'your rental').slice(0, 120);
  const address = String(ctx.listing?.address || '').slice(0, 160);

  // Realtor profile (name for co-branding the tenant page + email).
  const { data: profile } = await supabase.from('profiles').select('full_name, brokerage').eq('id', user.id).single();
  const realtorName = String(profile?.full_name || 'Your realtor').slice(0, 120);
  const brokerage = String(profile?.brokerage || '').slice(0, 160);

  try {
    // Reuse an existing pending/received request for this applicant so the link stays stable.
    const existingPtr = await kvGetJson(appKey(linkId));
    let token = existingPtr && isDocReqToken(existingPtr.token) ? existingPtr.token : null;
    let status = existingPtr?.status || 'requested';
    let requestedAt = existingPtr?.requestedAt || new Date().toISOString();

    if (!token) {
      token = newDocReqToken();
      status = 'requested';
      requestedAt = new Date().toISOString();
      const record = {
        listingId: String(listingId).slice(0, 64),
        linkId: String(linkId).slice(0, 64),
        applicationId: ctx.junction.application_id ? String(ctx.junction.application_id) : null,
        tenantName, listingName, address,
        realtorName, brokerage,
        status: 'requested',
        requestedAt,
        receivedAt: null,
        fileCount: 0,
      };
      await kvSetJson(reqKey(token), record, DOCREQ_TTL);
      await kvSetJson(appKey(linkId), { token, status: 'requested', requestedAt, receivedAt: null }, DOCREQ_TTL);
    }

    const url = uploadUrl(token);

    // Optional: email the secure link to the tenant (their application email).
    let emailed = false;
    let emailError = null;
    if (sendEmail) {
      if (!process.env.RESEND_API_KEY) { emailError = 'Email service not configured.'; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail)) { emailError = 'No valid email on file for this applicant.'; }
      else {
        try {
          const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f2eee3;font-family:-apple-system,'Inter',Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2eee3;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="background:#0f0f10;padding:20px 26px;color:#faf8f3;font-weight:800;font-size:18px;letter-spacing:-0.02em;">Rentletter</td></tr>
      <tr><td style="background:#fffdf8;padding:28px 26px;border:1px solid #ece5d6;border-top:none;">
        <p style="margin:0 0 12px;font-size:15px;color:#0f0f10;line-height:1.55;">Hi ${escapeHtml(tenantName || 'there')},</p>
        <p style="margin:0 0 18px;font-size:15px;color:#3a3a3c;line-height:1.6;">
          ${escapeHtml(realtorName)} has requested a few documents to finalize your rental application${address ? ` for <strong style="color:#0f0f10;">${escapeHtml(address)}</strong>` : ''}. You can upload them securely here:
        </p>
        <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#d72027;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px;">Upload your documents</a></p>
        <p style="margin:0 0 6px;font-size:13px;color:#86868b;line-height:1.6;">Your documents are analyzed to verify income, employment, and credit, then discarded — they are not stored. Only your realtor sees the verified summary.</p>
        <p style="margin:14px 0 0;font-size:12px;color:#86868b;">This link is private to you and expires in 7 days.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
          await resend.emails.send({
            from: 'Rentletter <hello@rentletter.ca>',
            to: tenantEmail,
            reply_to: user.email,
            subject: `${realtorName}: upload your documents for your rental application`,
            html,
          });
          emailed = true;
        } catch (e) {
          console.error('[request-documents] email error:', e?.message || e);
          emailError = 'Could not send the email. Share the link instead.';
        }
      }
    }

    return res.status(200).json({ ok: true, token, url, status, requestedAt, tenantEmail: tenantEmail || null, emailed, emailError });
  } catch (e) {
    console.error('[request-documents] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not create the document request.' });
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
