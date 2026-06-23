// /api/listings/send-report
// Realtor-authenticated. Emails the white-label landlord report (PDF attached) to the
// landlord_email captured on the listing, with the realtor as reply-to. Supabase auth
// + RLS ownership; service-role read of the shortlist. Reuses the PDF builder.
import { Resend } from 'resend';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadReportContext } from '../../../lib/listingReportData';
import { buildLandlordReportPdf } from '../../../lib/landlordReportPdf';

const resend = new Resend(process.env.RESEND_API_KEY);

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email service not configured.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, note } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });

  try {
    const admin = getSupabaseAdminClient();
    const ctx = await loadReportContext(supabase, admin, listingId, user.id);
    if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
    if (ctx.shortlisted.length === 0) return res.status(400).json({ error: 'Shortlist some applicants first.' });

    const landlordEmail = String(ctx.listing.landlord_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(landlordEmail)) {
      return res.status(400).json({ error: "Add the landlord's email to this listing first (Edit listing)." });
    }

    const realtorName = String(ctx.profile?.full_name || 'Your realtor').slice(0, 120);
    const brokerage = String(ctx.profile?.brokerage || '').slice(0, 120);
    const phone = String(ctx.profile?.phone || '').slice(0, 40);
    const realtorEmail = user.email;
    const unitName = String(ctx.listing.name || ctx.listing.address || 'your unit');
    const personalNote = String(note || '').slice(0, 1000);
    const n = ctx.shortlisted.length;

    const bytes = await buildLandlordReportPdf(ctx);

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:#0f0f10;padding:22px 26px;">
        <p style="font-size:10px;color:#c8c2b3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">From your realtor</p>
        <p style="font-size:20px;font-weight:800;color:#faf8f3;margin:0 0 4px;letter-spacing:-0.02em;">${esc(realtorName)}</p>
        ${brokerage ? `<p style="font-size:13px;color:#c8c2b3;margin:0 0 2px;">${esc(brokerage)}</p>` : ''}
        ${phone ? `<p style="font-size:13px;color:#c8c2b3;margin:0;">${esc(phone)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 4px 0;">
        <h1 style="font-size:24px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;margin:0 0 10px;">${n} candidate${n === 1 ? '' : 's'} for ${esc(unitName).slice(0, 60)}</h1>
        <p style="font-size:14px;color:#3a3a3c;line-height:1.6;margin:0 0 14px;">The full ranked shortlist is attached as a PDF. Reply to this email to discuss next steps.</p>
        ${personalNote ? `<div style="background:#f2eee3;padding:16px;border-left:3px solid #d72027;margin:0 0 14px;"><p style="font-size:14px;color:#0f0f10;line-height:1.6;margin:0;white-space:pre-wrap;">${esc(personalNote)}</p></div>` : ''}
      </td></tr>
      <tr><td style="padding:20px 4px 0;border-top:1px solid #e3ddd0;margin-top:20px;">
        <p style="font-size:11px;color:#86868b;line-height:1.6;margin:14px 0 0;">Prepared by ${esc(realtorName)}. Tenant data is self-reported; verify references independently. Screening must comply with the Ontario Human Rights Code. Powered by Rentletter.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: landlordEmail,
      reply_to: realtorEmail,
      subject: `Shortlist from ${realtorName} — ${n} candidate${n === 1 ? '' : 's'} for ${unitName.slice(0, 60)}`,
      html,
      attachments: [{ filename: `shortlist-${new Date().toISOString().slice(0, 10)}.pdf`, content: Buffer.from(bytes) }],
    });
    if (result?.error) {
      console.error('[send-report] Resend error:', result.error);
      return res.status(500).json({ error: 'Email send failed. Try again.' });
    }
    return res.status(200).json({ ok: true, sentTo: landlordEmail });
  } catch (e) {
    console.error('[listings/send-report] error:', e?.message || e);
    return res.status(500).json({ error: 'Email send failed. Try again.' });
  }
}
