// /api/listings/send-report  POST { listingId }
// Realtor authenticated, entitlement gated, RLS ownership through loadReportContext. Every send
// freezes a snapshot (lib/reportSnapshot.js) into report_snapshots with a 90 day expiry, emails
// the landlord one button to the private page https://rentletter.ca/r/{token} with the PDF
// built from the same payload attached, sets last_sent_at, records report_sent. When the table
// is not set up yet, the send falls back to today's behaviour (PDF only, no page) with one log line.
import { Resend } from 'resend';
import { invalidateSignals } from '../../../lib/signalsCache';
import { recordEvent } from '../../../lib/events';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadReportContext } from '../../../lib/listingReportData';
import { buildLandlordReportPdf } from '../../../lib/landlordReportPdf';
import { logServerError } from '../../../lib/serverLog';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { buildSnapshot } from '../../../lib/reportSnapshot';
import { insertSnapshot, snapshotMeta } from '../../../lib/reportSnapshotStore';

let lastSentWarned = false;
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reportPageUrl = (token) => `https://rentletter.ca/r/${token}`;
export const reportFrom = (realtorName) => `${realtorName || 'Your realtor'} via Rentletter <hello@rentletter.ca>`;

// The four line body. pageUrl null: the fallback without a page (table not set up).
export function reportEmail({ payload, pageUrl, landlordName }) {
  const r = payload.realtor || {};
  const n = payload.counts?.applicants || 0;
  const v = payload.counts?.verified || 0;
  const address = payload.listing?.address || payload.listing?.name || 'your unit';
  const subject = `${address}: applicants from ${r.name}`;
  const lines = [
    `${r.name}${r.brokerage ? ` of ${r.brokerage}` : ''} is sending you the applicants for ${address}.`,
    `${n} applicant${n === 1 ? '' : 's'}, ranked best fit first${v ? `, ${v} verified` : ''}.`,
    pageUrl ? 'Open the report to see them and tell me who you would like to meet.' : 'The ranked list is attached as a PDF. Reply to this email to tell me who you would like to meet.',
  ];
  const text = `Hi ${landlordName || 'there'},\n\n${lines.join('\n')}\n${pageUrl ? `\nOpen the report: ${pageUrl}\n` : ''}\n${r.name}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">Hi ${esc(landlordName || 'there')},</p>
        ${lines.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        ${pageUrl ? `<p style="margin:20px 0 0;"><a href="${pageUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:8px;font-weight:700;">Open the report</a></p>` : ''}
        <p style="margin:20px 0 0;">${esc(r.name)}</p>
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">Sent through Rentletter on behalf of ${esc(r.name)}. Applicant data is self reported; verify references independently.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, lines };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  if (!(await requireEntitlement(req, res, supabase, user))) return;

  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });

  try {
    const admin = getSupabaseAdminClient();
    const ctx = await loadReportContext(supabase, admin, listingId, user.id);
    if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
    if (ctx.active.length === 0) return res.status(400).json({ error: 'No applicants to present yet.' });
    const landlordEmail = String(ctx.listing.landlord_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(landlordEmail)) return res.status(400).json({ error: "Add the landlord's email to this listing first (Edit listing)." });

    // FREEZE: the payload every surface reads from now on.
    const payload = buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: { ...ctx.profile, email: ctx.profile?.email || user.email } });
    const landlordName = ctx.listing.landlord_name || null;
    const snap = await insertSnapshot(admin, { listingId: ctx.listing.id, profileId: user.id, payload, sentToName: landlordName, sentToEmail: landlordEmail });
    const pageUrl = snap.absent ? null : reportPageUrl(snap.token);

    const bytes = await buildLandlordReportPdf({ payload });
    const mail = reportEmail({ payload, pageUrl, landlordName });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: reportFrom(payload.realtor.name), to: landlordEmail, reply_to: user.email,
      subject: mail.subject, html: mail.html, text: mail.text,
      attachments: [{ filename: `applicants-${new Date().toISOString().slice(0, 10)}.pdf`, content: Buffer.from(bytes) }],
    });
    if (result?.error) { console.error('[send-report] Resend error:', result.error); return res.status(500).json({ error: 'Email send failed. Try again.' }); }

    // Every applicant on this report: last_sent_at = now (db/screening.sql). Tolerated when absent.
    try {
      const ids = ctx.active.map((r) => r.linkId).filter(Boolean);
      if (ids.length) { const { error: sentErr } = await admin.from('listing_applicants').update({ last_sent_at: new Date().toISOString() }).in('id', ids); if (sentErr && !lastSentWarned) { lastSentWarned = true; console.warn('[send-report] last_sent_at not recorded:', sentErr.message); } }
    } catch (e) { if (!lastSentWarned) { lastSentWarned = true; console.warn('[send-report] last_sent_at not recorded:', e?.message || e); } }
    await recordEvent(admin, { profileId: user.id, listingId: ctx.listing.id, type: 'report_sent', payload: { listingName: ctx.listing.name || ctx.listing.address || null, landlordEmail, landlordName, snapshotId: snap.absent ? null : snap.id, applicants: payload.counts.applicants } });
    invalidateSignals(user.id);
    const meta = snap.absent ? null : snapshotMeta({ id: snap.id, token: snap.token, created_at: snap.createdAt, sent_to_name: landlordName, opened_count: 0, answers: {}, expires_at: snap.expiresAt });
    return res.status(200).json({ ok: true, sentTo: landlordEmail, snapshot: meta, pageUrl });
  } catch (e) {
    logServerError('[listings/send-report]', e, { listingId });
    return res.status(500).json({ error: 'Email send failed. Try again.', code: 'report_failed' });
  }
}
