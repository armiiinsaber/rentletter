// /api/referrals/inbox — Realtor 2's "Referred to you" list (approved referrals to their email).
import { requireRealtor } from '../../../lib/realtorAuth';
import { inboxFor } from '../../../lib/referrals';
export default async function handler(req, res) {
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  try { return res.status(200).json({ referrals: await inboxFor(ctx.user) }); }
  catch (e) { return res.status(500).json({ error: 'Could not load referrals.' }); }
}
