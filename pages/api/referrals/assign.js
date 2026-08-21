// /api/referrals/assign — POST { referralId, listingId } (Realtor 2). Ownership of the listing
// is checked through the realtor's own client (RLS). Scores against THAT listing's rent.
import { requireRealtor } from '../../../lib/realtorAuth';
import { getReferral, assignReferral } from '../../../lib/referrals';
import { logServerError } from '../../../lib/serverLog';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  const { referralId, listingId } = req.body || {};
  const ref = await getReferral(referralId);
  if (!ref) return res.status(404).json({ error: 'Referral not found.' });
  const { data: listing } = await ctx.supabase.from('listings').select('id, name, address, monthly_rent, bedrooms').eq('id', listingId).maybeSingle();
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  try { const out = await assignReferral(ref, listing, ctx.user); return res.status(200).json({ ok: true, applicationNumber: ref.referredApplicationNumber, listingId: listing.id, applicationId: out.applicationId }); }
  catch (e) { logServerError('[referrals/assign]', e, { referralId, listingId }); return res.status(400).json({ error: e.message || 'Could not assign.' }); }
}
