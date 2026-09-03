// /api/assistant/signals  GET: the assistant's inputs for the signed in realtor (the same load
// pages/landlord.js does server side). The bell and the panel use it on pages that did not
// receive initialSignals. Realtor authenticated; the applicants come from the realtor's own
// listings only (fetchListingApplicants strips owner_token).
import { requireRealtor } from '../../../lib/realtorAuth';
import { getCachedSignals, setCachedSignals } from '../../../lib/signalsCache';
import { loadSignals } from '../../../lib/dashboardSignals';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    // 60 seconds per profile in memory (lib/signalsCache.js); the write routes clear it.
    const cached = getCachedSignals(ctx.user.id);
    if (cached) return res.status(200).json({ signals: cached, profile: { full_name: ctx.profile?.full_name || null }, cached: true });
    const signals = await loadSignals({ supabase: ctx.supabase, user: ctx.user });
    setCachedSignals(ctx.user.id, signals);
    return res.status(200).json({ signals, profile: { full_name: ctx.profile?.full_name || null } });
  } catch (e) {
    console.warn('[assistant/signals] failed:', e?.message || e);
    return res.status(200).json({ signals: null });
  }
}
