// /api/landlord/create-invite-link
// Realtor creates a listing-scoped invite link tenants use to apply.
// Tenant lands on /apply/[token], submits the form, RL number auto-tagged
// to the realtor's listing.

import crypto from 'crypto';

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  const clean = String(sessionToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) return null;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data?.result) return null;
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return record;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, listingName, unit, realtorProfile, existingInvite } = req.body || {};

  if (!listingId) {
    return res.status(400).json({ error: 'Listing required.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  // Use existing token or mint a new one. Realtors reuse the same link for a given listing
  // unless they explicitly regenerate it.
  const token = (existingInvite && /^[a-f0-9]{20}$/.test(String(existingInvite)))
    ? String(existingInvite)
    : crypto.randomBytes(10).toString('hex'); // 20-char token, shorter URL

  const payload = {
    realtorEmail: session.email,
    realtorName: String(realtorProfile?.fullName || '').slice(0, 120),
    realtorBrokerage: String(realtorProfile?.brokerage || '').slice(0, 200),
    realtorPhone: String(realtorProfile?.phone || '').slice(0, 40),
    listingId: String(listingId).slice(0, 32),
    listingName: String(listingName || 'Listing').slice(0, 80),
    unit: unit && typeof unit === 'object' ? unit : null,
    createdAt: new Date().toISOString(),
    submissionCount: 0,
  };

  try {
    // Preserve submission count if updating existing
    if (existingInvite) {
      try {
        const r = await fetch(`${base}/get/linvite:${token}`, {
          headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        });
        const d = await r.json();
        if (d?.result) {
          const prev = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
          payload.submissionCount = prev.submissionCount || 0;
          payload.createdAt = prev.createdAt || payload.createdAt;
        }
      } catch (e) { /* fall through */ }
    }

    const setRes = await fetch(`${base}/set/linvite:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!setRes.ok) {
      return res.status(500).json({ error: 'Could not create invite link.' });
    }
    // 90-day expiry (long-lived; realtors may want to reuse for ongoing listings)
    await fetch(`${base}/expire/linvite:${token}/7776000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    return res.status(200).json({
      ok: true,
      token,
      url: `https://rentletter.ca/apply/${token}`,
    });
  } catch (e) {
    console.error('[create-invite-link] error:', e);
    return res.status(500).json({ error: 'Could not create invite link.' });
  }
}
