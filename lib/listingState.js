// lib/listingState.js  PURE, shared by the browser, the routes and the tests.
// A listing's status (active, rented, closed) as the app reads it, the column patch one
// transition writes, the invite link's answer, the not selected recipient rule and the message.
export const LISTING_STATUSES = Object.freeze(['active', 'rented', 'closed']);
export const CONSENT_DAYS = 60;
const DAY = 86400000;

// The column values one transition writes. Reopening clears closed_at and the winner.
export function statusPatch(status, { now = new Date(), rentedLinkId = null } = {}) {
  if (!LISTING_STATUSES.includes(status)) return null;
  if (status === 'active') return { status: 'active', closed_at: null, rented_link_id: null };
  return { status, closed_at: new Date(now).toISOString(), rented_link_id: status === 'rented' ? (rentedLinkId || null) : null };
}

// The listing's status as the app reads it: absent columns read as active.
export const listingStatus = (l) => (l && LISTING_STATUSES.includes(l.status) ? l.status : 'active');
export const listingOpen = (l) => listingStatus(l) === 'active';

// What the invite link answers. record: the KV invite record (null when expired); listing: the
// row found by invite_token (null when deleted). Rented when the listing is rented or closed,
// and when the row is gone while the record remains.
export function inviteAnswer(record, listing) {
  if (!record) return { status: 404 };
  if (!listing || !listingOpen(listing)) return { status: 200, rented: true, realtorName: record.realtorName || null, listingName: record.listingName || null };
  return { status: 200, rented: false };
}

// The not selected recipients: every junction row that is active (not set aside, not withdrawn)
// and not the chosen one, whose application has an email. junctions: [{ id, decision_status,
// withdrawn_at, application: { id, full_name, email } }].
export function notSelectedRecipients(junctions, chosenLinkId) {
  const seen = new Set();
  const out = [];
  for (const j of junctions || []) {
    if (!j || j.id === chosenLinkId) continue;
    if (j.withdrawn_at || j.withdrawnAt) continue;
    if ((j.decision_status || j.decisionStatus || 'none') === 'reject') continue;
    const app = j.application || {};
    const email = String(app.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ linkId: j.id, applicationId: app.id || j.application_id || null, name: app.full_name || null, email });
  }
  return out;
}

export const consentExpiry = (now = new Date()) => new Date(new Date(now).getTime() + CONSENT_DAYS * DAY).toISOString();

// The message, in the realtor's voice, neutral: no winner, no score, no reason. It speaks as a
// person: "Hi {first name}," then the four lines, then the realtor's name. Both links open
// /keep/{token}; the answer is a tap on that page, never a page load (scanners open every link).
export const notSelectedFrom = (realtorName) => `${realtorName || 'Your realtor'} via Rentletter <hello@rentletter.ca>`;
export function notSelectedEmail({ listingName, realtorName, applicantName, keepUrl }) {
  const declineUrl = keepUrl;
  const unit = listingName || 'the unit';
  const who = realtorName || 'your realtor';
  const first = String(applicantName || '').trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : 'Hi,';
  const subject = `${unit}: an update from ${who}`;
  const lines = [
    `${unit} went to another applicant.`,
    'Thank you for applying.',
    `If you would like ${who} to keep your application in mind for similar units in the next ${CONSENT_DAYS} days, tap Keep me in mind.`,
    'Otherwise nothing else happens, and your documents are already deleted or will be within 14 days.',
  ];
  const text = `${greeting}\n\n${lines.join('\n')}\n\n${who}\n\nKeep me in mind: ${keepUrl}\nNo thanks: ${declineUrl}\n`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">${esc(greeting)}</p>
        ${lines.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        <p style="margin:12px 0 0;">${esc(who)}</p>
        <p style="margin:20px 0 0;"><a href="${keepUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:8px;font-weight:700;">Keep me in mind</a></p>
        <p style="margin:12px 0 0;font-size:14px;"><a href="${declineUrl}" style="color:#3a3a3c;">No thanks</a></p>
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">Sent through Rentletter on behalf of ${esc(who)}.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, lines, greeting, signoff: who };
}

