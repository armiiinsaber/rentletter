// POST /api/promos/validate  { code } → { valid, recipientName, grantType, trialDays }
// Public. Rate limited 10/min per IP (Upstash, same pattern as the tenant routes). Every
// non-valid outcome — unknown, inactive, spent, malformed, rate limited — returns the identical
// { valid: false } shape after the same minimum response time, so nothing about a code's
// existence leaks to an unauthenticated caller.
import { validatePromoCode, INVALID } from '../../../lib/promos';
import { rateLimited, clientIp } from '../../../lib/tenantProfileStore';

const MIN_MS = 180;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const t0 = Date.now();
  let out = { ...INVALID };
  try {
    if (!(await rateLimited('promo:validate', clientIp(req), 10, 60))) out = await validatePromoCode(req.body?.code);
  } catch (e) { out = { ...INVALID }; }
  const wait = MIN_MS - (Date.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return res.status(200).json(out);
}
