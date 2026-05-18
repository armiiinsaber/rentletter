// /api/verify/check-code
// Verify the 6-digit code the tenant entered. Returns a short-lived verifiedEmail token.

import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Code must be 6 digits' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Verification temporarily unavailable.' });
  }

  try {
    const lookupRes = await fetch(`${process.env.KV_REST_API_URL}/get/verify:${normalizedEmail}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await lookupRes.json();
    if (!data?.result) {
      return res.status(404).json({ error: 'Code expired or not found. Please request a new one.' });
    }
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

    // Increment attempts
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) {
      // Burn the code
      await fetch(`${process.env.KV_REST_API_URL}/del/verify:${normalizedEmail}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      return res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });
    }

    if (record.code !== cleanCode) {
      // Save attempt count
      await fetch(`${process.env.KV_REST_API_URL}/set/verify:${normalizedEmail}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(record),
      });
      return res.status(401).json({ error: `Incorrect code. ${5 - record.attempts} attempt${5 - record.attempts === 1 ? '' : 's'} remaining.` });
    }

    // Success — burn the code and issue a verified-email token (valid 30 min)
    await fetch(`${process.env.KV_REST_API_URL}/del/verify:${normalizedEmail}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Generate a verified-email token
    const token = crypto.randomBytes(24).toString('hex');
    await fetch(`${process.env.KV_REST_API_URL}/set/vtoken:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, verifiedAt: new Date().toISOString() }),
    });
    await fetch(`${process.env.KV_REST_API_URL}/expire/vtoken:${token}/1800`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    return res.status(200).json({ ok: true, verifiedEmail: normalizedEmail, verificationToken: token });
  } catch (e) {
    console.error('Verify check error:', e);
    return res.status(500).json({ error: 'Verification failed.' });
  }
}
