// /api/landlord/send-to-landlord
// Sends a co-branded shortlist email FROM the signed-in realtor TO their landlord client.

import { Resend } from 'resend';
import { bump, logEvent, COUNTERS } from '../../../lib/stats';

const resend = new Resend(process.env.RESEND_API_KEY);

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  const clean = String(sessionToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) return null;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data?.result) return null;
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return record;
  } catch (e) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  const { applications, decisions, unit, realtorProfile, landlordEmail, note, shareUrl, isUpdate } = req.body || {};

  if (!Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: 'No applications to send.' });
  }
  const cleanedLandlordEmail = String(landlordEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedLandlordEmail)) {
    return res.status(400).json({ error: 'Invalid landlord email.' });
  }
  if (!realtorProfile?.isRealtor || !realtorProfile?.fullName) {
    return res.status(400).json({ error: 'Set up your realtor profile first.' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email service not configured.' });
  }

  const realtorName = String(realtorProfile.fullName || '').slice(0, 120);
  const realtorBrokerage = String(realtorProfile.brokerage || '').slice(0, 200);
  const realtorPhone = String(realtorProfile.phone || '').slice(0, 40);
  const realtorEmail = session.email; // Reply-to goes to the realtor
  const personalNote = String(note || '').slice(0, 1000);

  const shortlisted = applications.filter(a => decisions?.[a.applicationNumber]?.status === 'shortlist');
  if (shortlisted.length === 0) {
    return res.status(400).json({ error: 'Shortlist some applicants first before sending.' });
  }

  const unitLine = unit && (unit.address || unit.monthlyRent)
    ? `${escapeHtml(unit.address || 'Your unit')}${unit.monthlyRent ? ` · $${escapeHtml(unit.monthlyRent)}/mo` : ''}${unit.bedrooms ? ` · ${escapeHtml(unit.bedrooms)} bed` : ''}`
    : null;

  const subject = isUpdate
    ? `Updated shortlist from ${realtorName} — ${shortlisted.length} candidate${shortlisted.length === 1 ? '' : 's'}${unit?.address ? ` for ${String(unit.address).slice(0, 60)}` : ''}`
    : `Shortlist from ${realtorName} — ${shortlisted.length} candidate${shortlisted.length === 1 ? '' : 's'}${unit?.address ? ` for ${String(unit.address).slice(0, 60)}` : ''}`;

  const shortlistedRows = shortlisted.map(a => {
    const score = a.scorecard?.overall || 0;
    const dec = decisions[a.applicationNumber] || {};
    const notes = dec.notes ? `<div style="font-size:12px;color:#3a3a3c;margin-top:6px;line-height:1.5;"><em>Note from ${escapeHtml(realtorName)}: ${escapeHtml(dec.notes.slice(0, 250))}${dec.notes.length > 250 ? '…' : ''}</em></div>` : '';
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e3ddd0;">
        <div style="font-size:16px;font-weight:700;color:#0f0f10;margin-bottom:4px;">${escapeHtml(a.tenant?.fullName || 'Applicant')}</div>
        <div style="font-size:13px;color:#3a3a3c;line-height:1.55;">
          ${escapeHtml(a.employment?.jobTitle || '')}${a.employment?.employer ? ` at ${escapeHtml(a.employment.employer)}` : ''}<br>
          ${a.employment?.annualIncome ? `$${Number(a.employment.annualIncome).toLocaleString()}/yr · ` : ''}Score ${score}/5 · ${escapeHtml(a.applicationNumber || '')}
        </div>
        ${notes}
      </td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;">

        <!-- Realtor branding header -->
        <tr><td style="padding-bottom:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
            <tr><td style="padding:22px 26px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#c8c2b3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">From your realtor</p>
              <p style="font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:#faf8f3;margin:0 0 4px;letter-spacing:-0.02em;">${escapeHtml(realtorName)}</p>
              ${realtorBrokerage ? `<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0 0 2px;">${escapeHtml(realtorBrokerage)}</p>` : ''}
              ${realtorPhone ? `<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0;">${escapeHtml(realtorPhone)} · <a href="mailto:${escapeHtml(realtorEmail)}" style="color:#c8c2b3;text-decoration:none;">${escapeHtml(realtorEmail)}</a></p>` : `<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0;"><a href="mailto:${escapeHtml(realtorEmail)}" style="color:#c8c2b3;text-decoration:none;">${escapeHtml(realtorEmail)}</a></p>`}
            </td></tr>
          </table>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 10px;">Your shortlist</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0 0 12px;">
            ${shortlisted.length} candidate${shortlisted.length === 1 ? '' : 's'} I'd recommend.
          </h1>
          ${unitLine ? `<p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0 0 16px;line-height:1.55;">For: <strong>${unitLine}</strong></p>` : ''}
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">
            Reviewed by ${escapeHtml(realtorName)} · sent ${new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' })}
          </p>
        </td></tr>

        <!-- Optional personal note from realtor -->
        ${personalNote ? `
        <tr><td style="padding-top:24px;">
          <div style="background:#f2eee3;padding:20px;border-left:3px solid #d72027;">
            <p style="font-family:'Inter',sans-serif;font-size:10px;color:#86868b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">Note from ${escapeHtml(realtorName)}</p>
            <p style="font-family:'Inter',sans-serif;font-size:14px;color:#0f0f10;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(personalNote)}</p>
          </div>
        </td></tr>
        ` : ''}

        <!-- Share URL CTA — interactive landlord view -->
        ${shareUrl ? `
        <tr><td style="padding-top:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
            <tr><td style="padding:22px 24px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#f0b8bb;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 8px;">
                ${isUpdate ? 'Updated shortlist' : 'View, compare, and discuss'}
              </p>
              <h2 style="font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:#faf8f3;letter-spacing:-0.02em;margin:0 0 8px;line-height:1.2;">
                ${isUpdate ? 'Your realtor updated this shortlist.' : 'See your shortlist online.'}
              </h2>
              <p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;line-height:1.6;margin:0 0 18px;">
                Open the live page below to see full candidate details, compare them side-by-side, add notes for your realtor, or remove anyone you've ruled out. No sign-up required — just your private link.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="background:#d72027;">
                  <a href="${shareUrl}" style="display:inline-block;padding:14px 26px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                    Open my shortlist →
                  </a>
                </td></tr>
              </table>
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.55;margin:14px 0 0;">
                Link valid for 14 days. Anything you do there is visible to your realtor.
              </p>
            </td></tr>
          </table>
        </td></tr>
        ` : ''}

        <!-- Candidate list -->
        <tr><td style="padding-top:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:10px;color:#86868b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Candidates included</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${shortlistedRows}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:32px;padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;line-height:1.6;margin:0 0 14px;">
            Reply to this email to discuss the candidates or schedule next steps. Each candidate has a verified Rentletter application number — let me know which you'd like to move forward with.
          </p>
        </td></tr>

        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.6;margin:0;">
            This shortlist was prepared by ${escapeHtml(realtorName)} using Rentletter, an independent screening platform for Canadian rentals. Tenant data is self-reported by applicants. Verify references independently before signing a lease.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: cleanedLandlordEmail,
      reply_to: realtorEmail, // Replies go directly to the realtor
      subject,
      html,
    });
    if (result?.error) {
      console.error('[send-to-landlord] Resend error:', result.error);
      return res.status(500).json({ error: 'Email send failed. Try again.' });
    }
    // Also CC the realtor a copy (fire-and-forget)
    try {
      await resend.emails.send({
        from: 'Rentletter <hello@rentletter.ca>',
        to: realtorEmail,
        subject: `[Copy] ${subject}`,
        html: `<p style="font-family:Inter,sans-serif;color:#86868b;font-size:13px;padding:16px;background:#f2eee3;">Copy of the email you just sent to ${escapeHtml(cleanedLandlordEmail)}.</p>${html}`,
      });
    } catch (e) { /* non-fatal */ }
    // Instrument
    bump(COUNTERS.EMAILS_SENT);
    logEvent('emails', { realtorEmail, landlordEmail: cleanedLandlordEmail, candidates: shortlisted.length });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-to-landlord] exception:', e?.message || e);
    return res.status(500).json({ error: 'Email send failed. Try again.' });
  }
}
