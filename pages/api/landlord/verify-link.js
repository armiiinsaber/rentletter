// /api/landlord/auth/verify-link
// Exchange a magic-link token for a longer-lived session token.

import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { linkToken } = req.body;
  if (!linkToken) return res.status(400).json({ error: 'Link token required' });

  const clean = String(linkToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) {
    return res.status(400).json({ error: 'Invalid link format' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Sign-in temporarily unavailable.' });
  }

  try {
    // Look up the magic-link token
    const lookupRes = await fetch(`${process.env.KV_REST_API_URL}/get/llink:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await lookupRes.json();
    if (!data?.result) {
      return res.status(404).json({ error: 'Sign-in link expired or invalid. Please request a new one.' });
    }
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

    // Burn the magic-link token (single-use)
    await fetch(`${process.env.KV_REST_API_URL}/del/llink:${clean}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Issue a session token (30 days)
    const sessionToken = crypto.randomBytes(24).toString('hex');
    await fetch(`${process.env.KV_REST_API_URL}/set/lsession:${sessionToken}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: record.email, signedInAt: new Date().toISOString() }),
    });
    await fetch(`${process.env.KV_REST_API_URL}/expire/lsession:${sessionToken}/2592000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    return res.status(200).json({ ok: true, email: record.email, sessionToken });
  } catch (e) {
    console.error('Verify magic link error:', e);
    return res.status(500).json({ error: 'Sign-in failed.' });
  }
}
