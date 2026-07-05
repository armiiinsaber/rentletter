// /api/landlord/resolve-invite
// PUBLIC endpoint. Tenants land on /apply/[token]; the page calls this
// to look up listing info to show the tenant.
import { normalizeProvince } from '../../../lib/provinces';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || !/^[a-f0-9]{20}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid invite link.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  try {
    const r = await fetch(`${base}/get/linvite:${token}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data?.result) {
      return res.status(404).json({ error: 'This invite link has expired or is invalid. Please contact your realtor for a new link.' });
    }
    const invite = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

    // Return only the public-safe fields (realtor name/brokerage, listing info)
    return res.status(200).json({
      realtorName: invite.realtorName,
      realtorBrokerage: invite.realtorBrokerage,
      listingName: invite.listingName,
      unit: invite.unit,
      // Applicable province (owning realtor's). Older invites without it default to Ontario.
      province: normalizeProvince(invite.province),
    });
  } catch (e) {
    console.error('[resolve-invite] error:', e);
    return res.status(500).json({ error: 'Could not load invite.' });
  }
}
