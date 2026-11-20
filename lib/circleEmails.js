// lib/circleEmails.js  HTML and text for the two circle emails (the paper, ink and red table
// template the other emails use): a request to connect, to the realtor who is asked; and the
// brokerage confirmation, to the broker of record. Neither carries anything about a tenant, a
// listing or a number, and the request never shows the asking realtor's email or phone.
import { emailLogoHtml } from './brand/emailLogo.js';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SHELL = (inner) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
<tr><td style="padding-bottom:32px;">${emailLogoHtml()}</td></tr>
${inner}
<tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;"><p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">Rentletter &middot; Ontario &amp; BC &middot; rentletter.ca</p></td></tr>
</table></td></tr></table></body></html>`;
const H = (eyebrow, title) => `<tr><td style="padding-bottom:20px;"><p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">${eyebrow}</p><h1 style="font-family:'Inter',sans-serif;font-size:28px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0;">${title}</h1></td></tr>`;
const P = (html) => `<p style="font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#3a3a3c;margin:0 0 18px;">${html}</p>`;
const BTN = (href, label, bg = '#0f0f10') => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 10px 10px 0;"><tr><td style="background:${bg};"><a href="${href}" style="display:inline-block;padding:16px 26px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;">${label}</a></td></tr></table>`;
const SMALL = (html) => `<p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:8px 0 0;line-height:1.55;">${html}</p>`;

export const CIRCLE_FROM = 'Rentletter <hello@rentletter.ca>';

// To the realtor who is asked. Names the asking realtor and their brokerage, nothing else.
export function circleRequestEmail({ fromName, fromBrokerage, circleUrl }) {
  const who = `${fromName || 'A realtor'}${fromBrokerage ? `, ${fromBrokerage}` : ''}`;
  return {
    subject: `${fromName || 'A realtor'} asked to join your circle`,
    html: SHELL(`${H('Your circle', `${esc(fromName || 'A realtor')} asked to join your circle.`)}
<tr><td style="padding-bottom:28px;">
${P(`<strong style="color:#0f0f10;">${esc(who)}</strong> would like to connect with you on Rentletter. You are connected only if you accept.`)}
${BTN(circleUrl, 'Open Circle &rarr;')}
${SMALL('Accept or decline in Circle. A decline is not sent to them.')}
</td></tr>`),
    text: `${who} asked to join your circle on Rentletter. You are connected only if you accept.\n\nOpen Circle: ${circleUrl}\n\nA decline is not sent to them.`,
  };
}

// To the broker of record: one page that confirms the brokerage and the agent, or says the agent
// is not theirs. The link works once and stops working after 14 days.
export function brokerageConfirmEmail({ brokerName, realtorName, legalName, url }) {
  return {
    subject: `Confirm ${legalName || 'your brokerage'} on Rentletter`,
    html: SHELL(`${H('Broker of record', `Please confirm ${esc(legalName || 'your brokerage')}.`)}
<tr><td style="padding-bottom:28px;">
${P(`${brokerName ? `Hello ${esc(brokerName)}, ` : ''}<strong style="color:#0f0f10;">${esc(realtorName || 'A realtor')}</strong> uses Rentletter to organize rental applications, and named you as broker of record of <strong style="color:#0f0f10;">${esc(legalName || 'their brokerage')}</strong>.`)}
${P('The next page shows the brokerage details they entered. You can confirm them, or say this person is not your agent.')}
${BTN(url, 'Review and answer &rarr;')}
${SMALL('This link works once and stops working after 14 days. You do not need an account.')}
</td></tr>`),
    text: `${brokerName ? `Hello ${brokerName}, ` : ''}${realtorName || 'A realtor'} uses Rentletter to organize rental applications, and named you as broker of record of ${legalName || 'their brokerage'}.\n\nReview the details and confirm them, or say this person is not your agent:\n${url}\n\nThis link works once and stops working after 14 days. You do not need an account.`,
  };
}
