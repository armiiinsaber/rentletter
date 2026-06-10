// /api/landlord/view-shared
// PUBLIC endpoint. Resolves a share token and returns candidate data + activity.
// Landlord accesses via the link in the email — no sign-up required.

import { bump, COUNTERS } from '../../../lib/stats';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || !/^[a-f0-9]{40}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid share token.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  try {
    const tokenRes = await fetch(`${base}/get/lshare:${token}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData?.result) {
      return res.status(404).json({ error: 'This share link has expired or is invalid. Ask your realtor to send a new one.' });
    }
    const sharePayload = typeof tokenData.result === 'string' ? JSON.parse(tokenData.result) : tokenData.result;

    // Filter out apps the landlord removed
    const removedSet = new Set(sharePayload.landlordRemovedApps || []);
    const activeAppNumbers = (sharePayload.applicationNumbers || []).filter(n => !removedSet.has(n));

    // Get applicants — prefer embedded snapshots in the share token (self-contained),
    // fall back to KV lookup for older shares that don't have embedded data.
    let applicants = [];
    const embedded = Array.isArray(sharePayload.applicants) ? sharePayload.applicants : [];

    if (embedded.length > 0) {
      // Use embedded snapshots
      applicants = embedded.filter(a => a?.applicationNumber && activeAppNumbers.includes(a.applicationNumber));
    } else {
      // Legacy path: fetch each applicant from KV (works only for real, non-demo applications)
      for (const appNumber of activeAppNumbers) {
        try {
          const r = await fetch(`${base}/get/app:${appNumber}`, {
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
          });
          const d = await r.json();
          if (d?.result) {
            const appData = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
            if (appData && !appData.revoked) {
              applicants.push(appData);
            }
          }
        } catch (e) { /* skip */ }
      }
    }

    // Log the view (silent — for realtor's activity feed)
    try {
      const updated = {
        ...sharePayload,
        landlordActivity: [
          ...(sharePayload.landlordActivity || []),
          { type: 'view', ts: new Date().toISOString() },
        ].slice(-100), // keep last 100 events
      };
      await fetch(`${base}/set/lshare:${token}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updated),
      });
    } catch (e) { /* non-fatal */ }

    // Instrument
    bump(COUNTERS.SHARES_VIEWED);

    return res.status(200).json({
      realtor: {
        name: sharePayload.realtorName,
        brokerage: sharePayload.realtorBrokerage,
        phone: sharePayload.realtorPhone,
        email: sharePayload.realtorEmail,
      },
      unit: sharePayload.unit,
      preferences: sharePayload.preferences || null,
      applicants,
      decisions: sharePayload.decisions || {},
      landlordNotes: sharePayload.landlordNotes || {},
      createdAt: sharePayload.createdAt,
      updatedAt: sharePayload.updatedAt,
    });
  } catch (e) {
    console.error('[view-shared] error:', e);
    return res.status(500).json({ error: 'Could not load shared candidates.' });
  }
}
