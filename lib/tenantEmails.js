// lib/tenantEmails.js
// HTML for the tenant-profile emails (magic link, email-change confirmation). Same table-based
// paper/ink/red template as the other Rentletter emails. Links carry a single-use token; the
// template never includes anything else sensitive.
const SHELL = (inner) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:3px;height:20px;background:#d72027;"></td>
            <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
          </tr></table>
        </td></tr>
        ${inner}
        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">Rentletter &middot; Ontario &amp; BC &middot; rentletter.ca</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const BUTTON = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#d72027;">
  <a href="${href}" style="display:inline-block;padding:18px 32px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">${label}</a>
</td></tr></table>`;

export function magicLinkEmail(url) {
  return SHELL(`
        <tr><td style="padding-bottom:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Your tenant profile</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:34px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.08;margin:0;">Here&rsquo;s your link.</h1>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 24px;">
            Open your Rentletter profile to see your applications, update your details, and apply to your next listing in seconds.
          </p>
          ${BUTTON(url, 'Open my profile &rarr;')}
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:18px 0 0;line-height:1.55;">
            This link works once and expires in 15 minutes. If you didn&rsquo;t request it, you can ignore this email &mdash; nothing changes.
          </p>
        </td></tr>`);
}

export function emailChangeEmail(url, oldEmail) {
  return SHELL(`
        <tr><td style="padding-bottom:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Confirm your new email</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:34px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.08;margin:0;">Move your profile to this address?</h1>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 24px;">
            Someone asked to move the Rentletter tenant profile for <strong style="color:#0f0f10;">${oldEmail}</strong> to this email address. Confirm below and this address becomes the way you sign in. Until you confirm, nothing changes.
          </p>
          ${BUTTON(url, 'Yes, use this email &rarr;')}
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:18px 0 0;line-height:1.55;">
            This link works once and expires in 60 minutes. If this wasn&rsquo;t you, ignore this email.
          </p>
        </td></tr>`);
}
