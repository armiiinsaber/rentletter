// /api/verify/send-code
// Send a 6-digit verification code to the tenant's email before they can pay.
// Code is stored in KV with a 10-minute TTL.

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Simple in-memory rate limit by IP (best effort; for production use a real solution)
const rateLimits = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Rate limit: max 3 codes per email per 10 minutes
  const now = Date.now();
  const key = email.toLowerCase();
  const recent = rateLimits.get(key) || [];
  const fresh = recent.filter(ts => now - ts < 10 * 60 * 1000);
  if (fresh.length >= 3) {
    return res.status(429).json({ error: 'Too many codes requested. Please wait a few minutes.' });
  }
  fresh.push(now);
  rateLimits.set(key, fresh);

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Verification temporarily unavailable.' });
  }

  const code = generateCode();
  const normalizedEmail = email.trim().toLowerCase();

  // Store in KV with 10-minute TTL
  try {
    await fetch(`${process.env.KV_REST_API_URL}/set/verify:${normalizedEmail}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, sentAt: new Date().toISOString(), attempts: 0 }),
    });
    await fetch(`${process.env.KV_REST_API_URL}/expire/verify:${normalizedEmail}/600`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
  } catch (e) {
    console.error('KV store verification code failed:', e);
    return res.status(500).json({ error: 'Could not store verification code.' });
  }

  // Send the email
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Rentletter <hello@rentletter.ca>',
        to: normalizedEmail,
        subject: `${code} — your Rentletter verification code`,
        html: buildCodeEmail(code),
      });
    }
  } catch (emailErr) {
    console.error('Verification email failed:', emailErr);
    return res.status(500).json({ error: 'Could not send verification email.' });
  }

  return res.status(200).json({ ok: true, sentTo: normalizedEmail });
}

function buildCodeEmail(code) {
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
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">Verify your email</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:32px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.1;margin:0;">Your code is below.</h1>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">Enter this 6-digit code on the Rentletter page to continue.</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <div style="background:#0f0f10;color:#faf8f3;padding:32px;text-align:center;font-family:'Courier New',monospace;font-size:48px;font-weight:800;letter-spacing:0.4em;">${code}</div>
        </td></tr>
        <tr><td>
          <p style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.55;color:#86868b;margin:0;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
