// /api/landlord/auth/send-link
// Send a magic-link sign-in email to a landlord.

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

// Best-effort in-memory rate limit by email (production should use Redis with TTL)
const rateLimits = new Map();

// Normalize KV URL once (handle accidental trailing slash)
function kvBase() {
  const raw = process.env.KV_REST_API_URL || '';
  return raw.replace(/\/+$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Rate limit: 3 links per email per 10 min
  const now = Date.now();
  const recent = rateLimits.get(normalizedEmail) || [];
  const fresh = recent.filter(ts => now - ts < 10 * 60 * 1000);
  if (fresh.length >= 3) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes.' });
  }
  fresh.push(now);
  rateLimits.set(normalizedEmail, fresh);

  const base = kvBase();
  if (!base || !process.env.KV_REST_API_TOKEN) {
    console.error('[send-link] KV not configured:', { hasUrl: !!base, hasToken: !!process.env.KV_REST_API_TOKEN });
    return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again in a moment.' });
  }

  // Generate a short-lived magic link token (for OTHER devices)
  const linkToken = crypto.randomBytes(24).toString('hex');
  // Also generate a session token for THIS device (immediate sign-in, 30 days)
  const sessionToken = crypto.randomBytes(24).toString('hex');

  try {
    // Store the magic-link token (for use on another device within 15 min)
    const setUrl = `${base}/set/llink:${linkToken}`;
    const setRes = await fetch(setUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, createdAt: new Date().toISOString() }),
    });
    if (!setRes.ok) {
      const errText = await setRes.text().catch(() => '');
      console.error('[send-link] KV set failed:', setRes.status, errText);
      return res.status(500).json({ error: 'Could not create sign-in link. Please try again.' });
    }
    // Magic link valid for 15 minutes
    await fetch(`${base}/expire/llink:${linkToken}/900`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Also create a session for THIS device — instant sign-in, valid 30 days
    await fetch(`${base}/set/lsession:${sessionToken}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, signedInAt: new Date().toISOString() }),
    });
    await fetch(`${base}/expire/lsession:${sessionToken}/2592000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Create or fetch account record (handles founder vs trial logic)
    try {
      const { getOrCreateAccount } = await import('../../../../lib/account');
      await getOrCreateAccount(normalizedEmail);
    } catch (acctErr) {
      console.error('[send-link] account create failed (non-fatal):', acctErr?.message || acctErr);
    }
  } catch (e) {
    console.error('[send-link] KV store error:', e?.message || e);
    return res.status(500).json({ error: 'Could not create sign-in link. Please try again.' });
  }

  const linkUrl = `https://rentletter.ca/landlord?signin=${linkToken}`;
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('[send-link] RESEND_API_KEY missing');
      return res.status(503).json({ error: 'Email service not configured.' });
    }
    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: normalizedEmail,
      subject: 'Sign in to your Rentletter landlord dashboard',
      html: buildLinkEmail(linkUrl),
    });
    if (result?.error) {
      console.error('[send-link] Resend returned error:', result.error);
      // Don't fail the whole request — the user is already signed in on this device.
      // Just note that email sending failed.
      return res.status(200).json({
        ok: true,
        sessionToken,
        email: normalizedEmail,
        emailSent: false,
        emailError: 'We signed you in on this device, but the email to your inbox failed.',
      });
    }
  } catch (emailErr) {
    console.error('[send-link] Resend exception:', emailErr?.message || emailErr);
    return res.status(200).json({
      ok: true,
      sessionToken,
      email: normalizedEmail,
      emailSent: false,
      emailError: 'We signed you in on this device, but the email to your inbox failed.',
    });
  }

  return res.status(200).json({
    ok: true,
    sessionToken,
    email: normalizedEmail,
    emailSent: true,
  });
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
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">Use on another device</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0;">Sign in on your phone<br>or other device.</h1>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">You're already signed in on the device where you requested this link. Use the button below to also sign in on your phone or another computer — your shortlist, notes, and unit details will be there waiting.</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="${url}" style="display:inline-block;padding:16px 28px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Sign in on this device →</a>
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
