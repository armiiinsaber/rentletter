// lib/reconsiderInvite.js  SERVER ONLY (takes the service role client). The re invite an applicant
// receives when a realtor looks at their application again (lib/realtorWrites.js
// reconsiderApplicant). Never on undo, and at most once per applicant per listing.
//
// Once only: application_events is append only, so nothing can be written onto the reconsider
// row after the send. The record is the table itself: the invite goes with the FIRST row that
// moves this listing_applicants row into reconsidered, and never with a later one (after an Undo
// and a second Reconsider). A first send that fails is not retried; the card says so.
//
// The button opens the tenant's own application page, the same link the confirmation email
// carries (pages/api/send.js:117). The owner token is read here, on the server, and goes into
// that one URL only: it is never returned to the realtor, never logged, never in any other link.
//
// Every string is in lib/applicantState.js (RECONSIDER_EMAIL). Neutral: nothing about why they
// were not chosen, nothing on any protected ground.
import { RECONSIDER_EMAIL } from './applicantState.js';
import { APPLICATION_STATE } from './application-state.js';
import { notSelectedFrom } from './listingState.js';
import { displayLabel } from './listingAddress.js';
import { logServerError } from './serverLog.js';

const fill = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

// The tenant's own page for this application.
export const applicationUrl = (applicationNumber, ownerToken, site = siteBase()) => `${site}/my-application?app=${encodeURIComponent(applicationNumber)}&token=${encodeURIComponent(ownerToken)}`;

// The message. Pure. { subject, text, html, lines }.
export function reconsiderEmail({ address, realtorName, applicantName, url, documentsExpired = false }) {
  const where = address || 'the unit';
  const who = realtorName || 'your realtor';
  const first = String(applicantName || '').trim().split(/\s+/)[0];
  const vars = { address: where, realtor: who, first };
  const greeting = first ? fill(RECONSIDER_EMAIL.greeting, vars) : RECONSIDER_EMAIL.greetingNoName;
  const lines = RECONSIDER_EMAIL.lines.map((l) => fill(l, vars));
  const before = documentsExpired ? [RECONSIDER_EMAIL.expired] : [];
  const subject = fill(RECONSIDER_EMAIL.subject, vars);
  const text = [greeting, '', ...lines, ...before, '', `${RECONSIDER_EMAIL.button}: ${url}`, '', RECONSIDER_EMAIL.after, '', fill(RECONSIDER_EMAIL.footer, vars)].join('\n');
  const p = (t, extra = '') => `<p style="margin:0 0 12px;${extra}">${esc(t)}</p>`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:16px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        ${p(greeting)}
        ${lines.map((l) => p(l)).join('')}
        ${before.map((l) => p(l)).join('')}
        <p style="margin:20px 0 0;"><a href="${esc(url)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:999px;font-weight:700;">${esc(RECONSIDER_EMAIL.button)}</a></p>
        <p style="margin:20px 0 0;">${esc(RECONSIDER_EMAIL.after)}</p>
        <p style="margin:20px 0 0;font-size:12px;color:#3a3a3c;">${esc(fill(RECONSIDER_EMAIL.footer, vars))}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, lines, greeting, documentsExpired };
}

// Has this applicant already been moved into reconsidered before the move just written?
export async function isFirstReconsider(admin, linkId) {
  const { data, error } = await admin.from('application_events').select('id, to_state').eq('listing_applicant_id', String(linkId)).eq('to_state', APPLICATION_STATE.RECONSIDERED);
  if (error) return false; // no audit table, no certainty: never send twice, so do not send
  return (data || []).length === 1;
}

// Did the 14 day expiry remove any of their documents (lib/documentStore.js:156 marks them)?
export async function documentsExpiredFor(admin, linkId) {
  try {
    const { data } = await admin.from('applicant_documents').select('id, deleted_by').eq('listing_applicant_id', String(linkId));
    return (data || []).some((d) => /^expired/.test(String(d.deleted_by || '')));
  } catch (e) { return false; }
}

// Send the invite after a stored reconsider. Never throws. Returns what the realtor may see:
// { sent: true } or { sent: false, reason }, and nothing else (no token, no URL, no address).
export async function sendReconsiderInvite({ admin, resend, linkId, listing, realtorName, realtorEmail }) {
  try {
    if (!(await isFirstReconsider(admin, linkId))) return { sent: false, reason: 'already_invited' };
    const { data: junction } = await admin.from('listing_applicants').select('id, application_id').eq('id', String(linkId)).maybeSingle();
    if (!junction) return { sent: false, reason: 'no_application' };
    const { data: app } = await admin.from('applications').select('id, full_name, email, application_number, owner_token').eq('id', junction.application_id).maybeSingle();
    const email = String(app?.email || '').trim();
    if (!app || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { sent: false, reason: 'no_email' };
    if (!app.application_number || !app.owner_token) return { sent: false, reason: 'no_link' };
    if (!resend) return { sent: false, reason: 'no_mailer' };
    const mail = reconsiderEmail({
      address: displayLabel(listing, 'the unit'), realtorName, applicantName: app.full_name,
      url: applicationUrl(app.application_number, app.owner_token), documentsExpired: await documentsExpiredFor(admin, linkId),
    });
    const r = await resend.emails.send({ from: notSelectedFrom(realtorName), to: email, reply_to: realtorEmail || undefined, subject: mail.subject, html: mail.html, text: mail.text });
    if (r && r.error) throw new Error(r.error.message || 'send failed');
    return { sent: true };
  } catch (e) {
    logServerError('[reconsiderInvite] send', e, { linkId });
    return { sent: false, reason: 'send_failed' };
  }
}
