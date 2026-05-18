// /api/landlord/auth/send-link
// Send a magic-link sign-in email to a landlord.

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

// Best-effort in-memory rate limit by email (production should use Redis with TTL)
const rateLimits = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Rate limit: 3 links per email per 10 min
  const now = Date.now();
  const recent = rateLimits.get(normalizedEmail) || [];
  const fresh = recent.filter(ts => now - ts < 10 * 60 * 1000);
  if (fresh.length >= 3) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes.' });
  }
  fresh.push(now);
  rateLimits.set(normalizedEmail, fresh);

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Sign-in temporarily unavailable.' });
  }

  // Generate a short-lived magic link token
  const linkToken = crypto.randomBytes(24).toString('hex');
  try {
    await fetch(`${process.env.KV_REST_API_URL}/set/llink:${linkToken}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, createdAt: new Date().toISOString() }),
    });
    // Magic link valid for 15 minutes
    await fetch(`${process.env.KV_REST_API_URL}/expire/llink:${linkToken}/900`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
  } catch (e) {
    console.error('Magic link store error:', e);
    return res.status(500).json({ error: 'Could not create sign-in link.' });
  }

  const linkUrl = `https://rentletter.ca/landlord?signin=${linkToken}`;
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Rentletter <hello@rentletter.ca>',
        to: normalizedEmail,
        subject: 'Sign in to your Rentletter landlord dashboard',
        html: buildLinkEmail(linkUrl),
      });
    }
  } catch (emailErr) {
    console.error('Magic link email failed:', emailErr);
    return res.status(500).json({ error: 'Could not send sign-in email.' });
  }

  return res.status(200).json({ ok: true });
}

function buildLinkEmail(url) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-bottom:18px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">Sign in</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:32px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.1;margin:0;">Sign in to your<br>landlord dashboard.</h1>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">Click the button below to sign in. Your applications, decisions, and notes will sync across devices.</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="${url}" style="display:inline-block;padding:16px 28px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Sign in →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td>
          <p style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.55;color:#86868b;margin:0;">This link expires in 15 minutes. If you didn't request it, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
