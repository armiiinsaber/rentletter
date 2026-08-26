// POST /api/billing/checkout  { interval: 'month' | 'year' } → { url }
// Authenticated (realtor session). Creates/reuses the Stripe customer, opens a hosted Checkout
// Session in subscription mode. Refuses founding members and existing subscribers.
import { requireRealtor } from '../../../lib/realtorAuth';
import { rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { createCheckout } from '../../../lib/billing';
import { stripeConfigured } from '../../../lib/stripe';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripeConfigured()) return res.status(503).json({ error: 'Billing isn’t set up yet.' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  if (await rateLimited('billing:checkout', ctx.user.id, 10, 600)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  if (await rateLimited('billing:checkout:ip', clientIp(req), 20, 600)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const interval = req.body?.interval === 'year' ? 'year' : req.body?.interval === 'month' ? 'month' : null;
  if (!interval) return res.status(400).json({ error: 'Pick monthly or annual.' });
  // Full profile row (billing columns) via the service role — the RLS client's select is trimmed.
  const { data: profile } = await ctx.supabase.from('profiles').select('*').eq('id', ctx.user.id).maybeSingle();
  try { const s = await createCheckout({ profile: profile || { id: ctx.user.id }, email: ctx.user.email, interval }); return res.status(200).json({ url: s.url }); }
  catch (e) { if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message }); logServerError('[billing/checkout]', e); return res.status(500).json({ error: 'Could not start checkout.' }); }
}
