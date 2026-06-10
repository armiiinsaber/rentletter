// /api/landlord/auth-request
// Landlord enters email → we generate a one-time magic-link token (15 min TTL)
// → email them the link → click it → /api/landlord/auth-verify creates 30-day session

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateMagicToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Authentication temporarily unavailable.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const token = generateMagicToken();

  // Store magic token in KV with 15-minute TTL, mapped to email
  try {
    await fetch(`${process.env.KV_REST_API_URL}/set/magic:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, createdAt: new Date().toISOString() }),
    });
    await fetch(`${process.env.KV_REST_API_URL}/expire/magic:${token}/900`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
  } catch (err) {
    console.error('KV magic token store failed:', err);
    return res.status(500).json({ error: 'Could not generate sign-in link. Please try again.' });
  }

  const magicUrl = `https://rentletter.ca/landlord?magic=${token}`;

  // Send the magic link email
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Rentletter <hello@rentletter.ca>',
        to: normalizedEmail,
        subject: 'Sign in to your Rentletter landlord dashboard',
        html: buildMagicLinkEmail(magicUrl),
      });
    } else {
      console.warn('RESEND_API_KEY not configured — magic link URL:', magicUrl);
    }
  } catch (err) {
    console.error('Magic link email send failed:', err);
    return res.status(500).json({ error: 'Could not send sign-in email. Please try again.' });
  }

  return res.status(200).json({ success: true, message: 'Check your email for a sign-in link (valid for 15 minutes).' });
}

function buildMagicLinkEmail(magicUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Sign in to your dashboard</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:38px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.05;margin:0;">Click to sign in.</h1>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 24px;">
            Use the link below to sign in to your Rentletter landlord dashboard. Your applications, shortlists, and notes will be available across devices.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="${magicUrl}" style="display:inline-block;padding:18px 32px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Sign in to dashboard &rarr;</a>
            </td></tr>
          </table>
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:18px 0 0;">
            This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">
            Rentletter &middot; Toronto &middot; rentletter.ca
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
