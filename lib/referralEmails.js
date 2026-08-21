// lib/referralEmails.js — HTML for the handoff emails (same paper/ink/red table template).
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SHELL = (inner) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
<tr><td style="padding-bottom:32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:3px;height:20px;background:#d72027;"></td><td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td></tr></table></td></tr>
${inner}
<tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;"><p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">Rentletter &middot; Ontario &amp; BC &middot; rentletter.ca</p></td></tr>
</table></td></tr></table></body></html>`;
const H = (eyebrow, title) => `<tr><td style="padding-bottom:20px;"><p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">${eyebrow}</p><h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.1;margin:0;">${title}</h1></td></tr>`;
const P = (html) => `<p style="font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#3a3a3c;margin:0 0 18px;">${html}</p>`;
const BTN = (href, label, bg = '#d72027') => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 10px 10px 0;"><tr><td style="background:${bg};"><a href="${href}" style="display:inline-block;padding:16px 26px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;">${label}</a></td></tr></table>`;
const SMALL = (html) => `<p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:8px 0 0;line-height:1.55;">${html}</p>`;

// To the APPLICANT — the consent request. Decline is as prominent as approve.
export function consentEmail({ url, fromName, fromBrokerage, toName, toBrokerage, applicantFirst }) {
  const from = `${esc(fromName || 'Your realtor')}${fromBrokerage ? ` (${esc(fromBrokerage)})` : ''}`;
  const to = `${esc(toName || 'another realtor')}${toBrokerage ? ` at ${esc(toBrokerage)}` : ''}`;
  return SHELL(`${H('Your approval is needed', `${from} would like to share your application.`)}
<tr><td style="padding-bottom:28px;">
${P(`${applicantFirst ? `Hi ${esc(applicantFirst)}, ` : ''}${from} thinks <strong style="color:#0f0f10;">${to}</strong> may have units that fit you, and would like to share your rental application with them.`)}
${P(`<strong style="color:#0f0f10;">Nothing is shared until you say so.</strong> Your application details &mdash; employment, income, rental history, household, references, and your intro &mdash; would go to ${to}. Documents are never shared.`)}
${BTN(url, 'Review what would be shared &rarr;', '#0f0f10')}
${SMALL('You can approve or decline on the next page. Declining is fine and your current application is unaffected. This link works once and expires in 7 days.')}
</td></tr>`);
}
// To REALTOR 2 — approved, has an account.
export function receivedEmail({ fromName, fromBrokerage, applicantName, note, dashboardUrl }) {
  return SHELL(`${H('Referred to you', `${esc(fromName || 'A realtor')} referred an applicant to you.`)}
<tr><td style="padding-bottom:28px;">
${P(`<strong style="color:#0f0f10;">${esc(applicantName || 'An applicant')}</strong> approved sharing their application with you${fromBrokerage ? ` via ${esc(fromName)} at ${esc(fromBrokerage)}` : ''}.${note ? ` Note from ${esc(fromName || 'them')}: &ldquo;${esc(note)}&rdquo;` : ''}`)}
${P('Open your dashboard, assign them to one of your listings, and they&rsquo;re ranked against that unit like any other applicant &mdash; no retyping, no re-collecting.')}
${BTN(dashboardUrl, 'Open my dashboard &rarr;')}
</td></tr>`);
}
// To REALTOR 2 — approved, NO account yet. The referral is the reason to join.
export function inviteEmail({ fromName, fromBrokerage, applicantName, note, signupUrl }) {
  return SHELL(`${H('An applicant is waiting for you', `${esc(fromName || 'A realtor')} referred an applicant to you on Rentletter.`)}
<tr><td style="padding-bottom:28px;">
${P(`<strong style="color:#0f0f10;">${esc(applicantName || 'An applicant')}</strong> approved sharing their full rental application with you${fromBrokerage ? ` &mdash; referred by ${esc(fromName)} at ${esc(fromBrokerage)}` : ''}.${note ? ` Their note: &ldquo;${esc(note)}&rdquo;` : ''}`)}
${P('Create a free Rentletter account with this email address and the application is already in your dashboard: employment, income, rental history, references. Assign it to a listing and it&rsquo;s ranked for that unit in seconds.')}
${BTN(signupUrl, 'Sign up and see the referral &rarr;')}
${SMALL('Rentletter organizes your applicants. Run credit checks wherever you already do.')}
</td></tr>`);
}
// To REALTOR 1 — the outcome. A decline says only that.
export function outcomeEmail({ approved, applicantName, toName, dashboardUrl }) {
  return SHELL(`${H('Referral update', approved ? `${esc(applicantName || 'The applicant')} approved the referral.` : `${esc(applicantName || 'The applicant')} declined the referral.`)}
<tr><td style="padding-bottom:28px;">
${P(approved ? `Their application is now with <strong style="color:#0f0f10;">${esc(toName || 'the receiving realtor')}</strong>. The referral is recorded on both sides.` : 'That&rsquo;s the whole message &mdash; no reason is collected, and there&rsquo;s nothing to follow up. Your own listing and application are unaffected.')}
${BTN(dashboardUrl, 'Open my dashboard &rarr;', '#0f0f10')}
</td></tr>`);
}
