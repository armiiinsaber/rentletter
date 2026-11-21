// /api/referrals/assign — POST { referralId, listingId } (Realtor 2). Ownership of the listing
// is checked through the realtor's own client (RLS). Scores against THAT listing's rent.
import { requireRealtor } from '../../../lib/realtorAuth';
import { invalidateSignals } from '../../../lib/signalsCache';
import { getReferral, assignReferral, claimReferrals } from '../../../lib/referrals';
import { logServerError } from '../../../lib/serverLog';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { referralsEnabled, REFERRALS_PAUSED } from '../../../lib/features';
import { archivedById, ARCHIVED_REFUSAL } from '../../../lib/listingArchive';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!referralsEnabled()) return res.status(410).json(REFERRALS_PAUSED); // lib/features.js
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  // Write path: needs an unlocked plan (lib/entitlements.js) → 402 otherwise.
  if (!(await requireEntitlement(req, res, ctx.supabase, ctx.user))) return;
  const { referralId, listingId } = req.body || {};
  const ref = await getReferral(referralId);
  if (!ref) return res.status(404).json({ error: 'Referral not found.' });
  const { data: listing } = await ctx.supabase.from('listings').select('id, name, address, monthly_rent, bedrooms').eq('id', listingId).maybeSingle();
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  // An archived listing takes no applications (lib/listingArchive.js): asked only after the
  // ownership read above, and before the referral is claimed, copied or linked.
  if (await archivedById(getSupabaseAdminClient(), listing.id)) return res.status(ARCHIVED_REFUSAL.status).json(ARCHIVED_REFUSAL.body);
  try { await claimReferrals(ctx.user).catch(() => 0); const out = await assignReferral(ref, listing, ctx.user); invalidateSignals(ctx.user.id); return res.status(200).json({ ok: true, applicationNumber: ref.referredApplicationNumber, listingId: listing.id, applicationId: out.applicationId }); }
  catch (e) { logServerError('[referrals/assign]', e, { referralId, listingId }); return res.status(400).json({ error: e.message || 'Could not assign.' }); }
}
