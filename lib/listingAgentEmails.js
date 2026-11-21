// lib/listingAgentEmails.js  The one email a tenant's invite sends (pages/api/tenant/shares.js):
// to a listing agent who has no Rentletter account yet, saying a tenant would like to share
// their rental profile with them for a unit. It shares nothing: no fact of the tenant is in it
// beyond their name, and the link is the invite link of the realtor on that unit
// (lib/realtorInvite.js), where the listing agent can join. The tenant shares only afterwards,
// themselves, from their profile.
import { emailLogoHtml } from './brand/emailLogo.js';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const LISTING_AGENT_FROM = 'Rentletter <hello@rentletter.ca>';

export function listingAgentInviteEmail({ tenantName, listingName, joinUrl }) {
  const who = tenantName || 'A tenant'; const unit = listingName ? ` for ${listingName}` : '';
  return {
    subject: `${who} would like to share their rental profile with you`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
<tr><td style="padding-bottom:32px;">${emailLogoHtml()}</td></tr>
<tr><td style="padding-bottom:20px;"><p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">A rental profile</p><h1 style="font-family:'Inter',sans-serif;font-size:28px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0;">${esc(who)} would like to share their rental profile with you.</h1></td></tr>
<tr><td style="padding-bottom:28px;">
<p style="font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#3a3a3c;margin:0 0 18px;">They named you as the listing agent${esc(unit)}. Their profile is on Rentletter, which realtors use to organize rental applications. Nothing has been shared yet: once you have an account, they can share it with you themselves.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0f0f10;"><a href="${joinUrl}" style="display:inline-block;padding:16px 26px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;">Join Rentletter &rarr;</a></td></tr></table>
<p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:16px 0 0;line-height:1.55;">Join with this email address, and tell them once you have. If this was not meant for you, ignore it: nothing is shared.</p>
</td></tr>
<tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;"><p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">Rentletter &middot; Ontario &amp; BC &middot; rentletter.ca</p></td></tr>
</table></td></tr></table></body></html>`,
    text: `${who} would like to share their rental profile with you. They named you as the listing agent${unit}.\n\nNothing has been shared yet. Once you have a Rentletter account, they can share it with you themselves.\n\nJoin with this email address: ${joinUrl}\n\nIf this was not meant for you, ignore it: nothing is shared.`,
  };
}
