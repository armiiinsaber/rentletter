// /api/invite/resolve
// PUBLIC endpoint. Tenants land on /apply/[token]; the page calls this
// to look up listing info to show the tenant.
import { normalizeProvince } from '../../../lib/provinces';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { inviteAnswer } from '../../../lib/listingStatus';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  // Sandbox tokens: the demo listing's link answers active, its closed twin answers rented, no KV.
  if (/^demo\d{16}$/.test(String(token || ''))) {
    const rented = String(token).endsWith('9');
    return res.status(200).json(rented ? { rented: true, realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4' } : { realtorName: 'Sarah Chen', realtorBrokerage: 'Demo Realty', listingName: '210 Carlaw Ave, Unit 4', unit: { address: '210 Carlaw Ave, Unit 4, Toronto', monthlyRent: '2600', bedrooms: '2', allowsPets: 'no', allowsSmoking: 'no', parkingIncluded: 'no' }, province: 'ON' });
  }
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
    // The listing's status: rented or closed, or a row that is gone while this record remains,
    // answers rented (lib/listingStatus.js inviteAnswer). Without the service role the link
    // answers as before.
    if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      let listing = null;
      try { const { data: row } = await getSupabaseAdminClient().from('listings').select('id, status, closed_at').eq('invite_token', String(token)).maybeSingle(); listing = row || null; } catch (e) { listing = { status: 'active' }; }
      const answer = inviteAnswer(invite, listing);
      if (answer.rented) return res.status(200).json({ rented: true, realtorName: answer.realtorName, listingName: answer.listingName });
    }

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
