// /api/referrals/claim  POST: claim the referrals addressed to the signed in realtor's email by
// their profile id (attribution that survives a later email change). This write used to run
// inside the inbox read (lib/referrals.js inboxFor); the inbox card calls it once when it shows
// unclaimed referrals, and the assign route runs the same claim. Returns { claimed }.
import { requireRealtor } from '../../../lib/realtorAuth';
import { claimReferrals } from '../../../lib/referrals';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  try { return res.status(200).json({ ok: true, claimed: await claimReferrals(ctx.user) }); }
  catch (e) { console.warn('[referrals/claim] failed:', e?.message || e); return res.status(200).json({ ok: false, claimed: 0 }); }
}
