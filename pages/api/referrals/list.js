// /api/referrals/list?listingId= — Realtor 1's referrals for a listing, keyed by linkId.
// Status only (pending / declined / approved / expired / revoked) + who it went to.
import { requireRealtor } from '../../../lib/realtorAuth';
import { listFromRealtor, effectiveStatus } from '../../../lib/referrals';

export default async function handler(req, res) {
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  const listingId = String(req.query.listingId || '');
  const refs = (await listFromRealtor(ctx.user.id)).filter((r) => !listingId || r.from.listingId === listingId);
  const byLink = {};
  for (const r of refs) {
    const s = { id: r.id, status: effectiveStatus(r), to: { name: r.to.name, email: r.to.email, hasAccount: !!r.to.profileId }, createdAt: r.createdAt, decidedAt: r.decidedAt, assigned: !!r.assignedListingId };
    if (!byLink[r.from.linkId]) byLink[r.from.linkId] = s; // newest first already
  }
  return res.status(200).json({ byLink });
}
