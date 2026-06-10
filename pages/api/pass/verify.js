// /api/pass/verify.js
// Check if a pass token is valid and unexpired.
// Used by the landing page when ?pass= is in the URL.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { passToken } = req.body;
  if (!passToken) return res.status(400).json({ error: 'Missing pass token' });

  // Normalize and validate format
  const normalized = String(passToken).trim().toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid pass token format', valid: false });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Pass verification temporarily unavailable', valid: false });
  }

  try {
    const lookupRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/pass:${normalized}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );

    if (!lookupRes.ok) {
      return res.status(500).json({ error: 'Lookup failed', valid: false });
    }

    const data = await lookupRes.json();
    if (!data || !data.result) {
      return res.status(404).json({ error: 'Pass not found or expired', valid: false });
    }

    let pass;
    try {
      pass = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (parseErr) {
      return res.status(500).json({ error: 'Pass data corrupted', valid: false });
    }

    // Double-check expiration (even though KV TTL should handle it)
    if (new Date(pass.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Pass has expired', valid: false, expired: true });
    }

    const daysRemaining = Math.ceil((new Date(pass.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    return res.status(200).json({
      valid: true,
      email: pass.email,
      expiresAt: pass.expiresAt,
      daysRemaining,
      lettersGenerated: pass.lettersGenerated || 0,
    });
  } catch (err) {
    console.error('Pass verify error:', err);
    return res.status(500).json({ error: 'Verification failed', valid: false });
  }
}
