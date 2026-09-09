// /api/invite/resolve
// PUBLIC endpoint. Tenants land on /apply/[token]; the page calls this to look up the listing.
// The listings row is the source of truth (lib/inviteResolve.js): a listing older than the KV
// record's 90 days still resolves. KV is read only as the fallback answer for a deleted listing,
// and as the whole answer when the service role is not configured.
import { normalizeProvince } from '../../../lib/provinces';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { resolveInvite } from '../../../lib/inviteResolve';

async function kvRecord(token) {
  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  if (!base || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${base}/get/linvite:${token}`, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
    const data = await r.json();
    if (!data?.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch (e) { return null; }
}

export function createHandler({ getAdmin = () => (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null), record = kvRecord } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { token } = req.query;
    // Sandbox tokens: the demo listing's link answers active, its closed twin answers rented, no KV.
    if (/^demo\d{16}$/.test(String(token || ''))) {
      const rented = String(token).endsWith('9');
      return res.status(200).json(rented ? { rented: true, realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4' } : { realtorName: 'Sarah Chen', realtorBrokerage: 'Demo Realty', listingName: '210 Carlaw Ave, Unit 4', unit: { address: '210 Carlaw Ave, Unit 4, Toronto', monthlyRent: '2600', bedrooms: '2', allowsPets: 'no', allowsSmoking: 'no', parkingIncluded: 'no' }, province: 'ON' });
    }
    if (!token || !/^[a-f0-9]{20}$/.test(String(token))) return res.status(400).json({ error: 'Invalid invite link.' });
    try {
      const admin = getAdmin();
      if (admin) {
        const rec = await record(String(token));
        const r = await resolveInvite(admin, String(token), rec);
        return res.status(r.status).json(r.body);
      }
      // No service role: the KV record is the whole answer, as before.
      const invite = await record(String(token));
      if (!invite) return res.status(404).json({ error: 'This invite link has expired or is invalid. Please contact your realtor for a new link.' });
      return res.status(200).json({ realtorName: invite.realtorName, realtorBrokerage: invite.realtorBrokerage, listingName: invite.listingName, unit: invite.unit, province: normalizeProvince(invite.province) });
    } catch (e) {
      console.error('[resolve-invite] error:', e);
      return res.status(500).json({ error: 'Could not load invite.' });
    }
  };
}
export default createHandler();
