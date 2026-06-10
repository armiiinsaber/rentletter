// /api/landlord/email-summary
// Send the signed-in landlord an email containing a summary of their current shortlist + decisions.
// They can forward this to a co-owner, partner, or business associate.

import { Resend } from 'resend';

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

  const sessionToken = req.headers['x-rl-session'] || req.body?.sessionToken;
  const session = await getSession(sessionToken);
  if (!session?.email) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const { applications, decisions, unit, realtorProfile } = req.body || {};
  if (!Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: 'No applications to summarize.' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email service not configured.' });
  }

  const isRealtor = !!(realtorProfile && realtorProfile.isRealtor && realtorProfile.fullName);
  const realtorName = isRealtor ? String(realtorProfile.fullName || '').slice(0, 120) : '';
  const realtorBrokerage = isRealtor ? String(realtorProfile.brokerage || '').slice(0, 200) : '';
  const realtorPhone = isRealtor ? String(realtorProfile.phone || '').slice(0, 40) : '';

  // Compute summary
  const shortlisted = applications.filter(a => decisions?.[a.applicationNumber]?.status === 'shortlist');
  const rejected = applications.filter(a => decisions?.[a.applicationNumber]?.status === 'reject');
  const undecided = applications.filter(a => !decisions?.[a.applicationNumber]?.status || decisions[a.applicationNumber].status === 'none');

  // Build the email
  const subjectPrefix = isRealtor ? `[${realtorName}] ` : '';
  const subject = `${subjectPrefix}Rentletter shortlist — ${shortlisted.length} favourite${shortlisted.length === 1 ? '' : 's'} of ${applications.length}`;

  const unitLine = unit && (unit.address || unit.monthlyRent)
    ? `${escapeHtml(unit.address || 'Unit')}${unit.monthlyRent ? ` · $${escapeHtml(unit.monthlyRent)}/mo` : ''}${unit.bedrooms ? ` · ${escapeHtml(unit.bedrooms)} bed` : ''}`
    : null;

  const shortlistedRows = shortlisted.map(a => {
    const score = a.scorecard?.overall || 0;
    const dec = decisions[a.applicationNumber] || {};
    const notes = dec.notes ? `<div style="font-size:12px;color:#3a3a3c;margin-top:6px;line-height:1.5;"><em>${escapeHtml(dec.notes.slice(0, 200))}${dec.notes.length > 200 ? '…' : ''}</em></div>` : '';
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e3ddd0;">
        <div style="font-size:16px;font-weight:700;color:#0f0f10;margin-bottom:4px;">${escapeHtml(a.tenant?.fullName)}</div>
        <div style="font-size:13px;color:#3a3a3c;line-height:1.55;">
          ${escapeHtml(a.employment?.jobTitle || '')} at ${escapeHtml(a.employment?.employer || '')}<br>
          $${(a.employment?.annualIncome || 0).toLocaleString()}/yr · Score ${score}/5 · ${escapeHtml(a.applicationNumber)}
        </div>
        ${notes}
      </td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #e3ddd0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
          ${isRealtor ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
            <tr><td style="background:#0f0f10;padding:14px 16px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#c8c2b3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 4px;">Prepared by</p>
              <p style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:#faf8f3;margin:0 0 2px;">${escapeHtml(realtorName)}</p>
              ${realtorBrokerage ? `<p style="font-family:'Inter',sans-serif;font-size:12px;color:#c8c2b3;margin:0;">${escapeHtml(realtorBrokerage)}</p>` : ''}
              ${realtorPhone ? `<p style="font-family:'Inter',sans-serif;font-size:12px;color:#c8c2b3;margin:2px 0 0;">${escapeHtml(realtorPhone)}</p>` : ''}
            </td></tr>
          </table>
          ` : ''}
        </td></tr>
        <tr><td style="padding-top:32px;padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 10px;">${isRealtor ? 'Shortlist summary' : 'Your shortlist'}</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0 0 12px;">
            ${shortlisted.length} favourite${shortlisted.length === 1 ? '' : 's'} of ${applications.length}.
          </h1>
          ${unitLine ? `<p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0 0 16px;line-height:1.55;">For: <strong>${unitLine}</strong></p>` : ''}
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">
            ${rejected.length} rejected · ${undecided.length} still to review · sent ${new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </td></tr>
        ${shortlisted.length > 0 ? `
        <tr><td style="padding-top:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${shortlistedRows}
          </table>
        </td></tr>
        ` : `
        <tr><td style="padding-top:24px;padding-bottom:16px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;color:#86868b;font-style:italic;margin:0;">You haven't shortlisted anyone yet.</p>
        </td></tr>
        `}
        <tr><td style="padding-top:32px;padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="https://rentletter.ca/landlord" style="display:inline-block;padding:14px 24px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Open my dashboard →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.6;margin:0;">
            Forward this email to a co-owner, business partner, or leasing agent. Sign in at rentletter.ca/landlord with this same email to see the full details and notes.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: session.email,
      subject,
      html,
    });
    if (result?.error) {
      console.error('[email-summary] Resend returned error:', result.error);
      return res.status(500).json({ error: 'Could not send the email. Please try again.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[email-summary] Resend exception:', e?.message || e);
    return res.status(500).json({ error: 'Could not send the email. Please try again.' });
  }
}
