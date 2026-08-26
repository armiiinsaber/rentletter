// POST /api/promos/redeem  { code } → { ok, status, message }
// Authenticated (the realtor's Supabase session). Redeems for the signed-in profile via the
// atomic redeem_promo_code() function — a double submit resolves to one grant.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { redeemPromoCode } from '../../../lib/promos';
import { rateLimited, clientIp } from '../../../lib/tenantProfileStore';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ ok: false, status: 'unavailable', message: 'Service temporarily unavailable.' });
  const { data: { user } } = await getSupabaseServerClient(req, res).auth.getUser();
  if (!user) return res.status(401).json({ ok: false, status: 'unauthenticated', message: 'Not signed in.' });
  if (await rateLimited('promo:redeem', clientIp(req), 10, 60)) return res.status(429).json({ ok: false, status: 'rate_limited', message: 'Too many attempts. Try again in a minute.' });
  const r = await redeemPromoCode({ code: req.body?.code, profileId: user.id });
  return res.status(200).json(r);
}
