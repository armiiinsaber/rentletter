// POST /api/billing/portal → { url }   Authenticated. Stripe Billing Portal for the profile's
// customer — cancelling, updating the card, invoices all happen there. Reachable while locked.
import { requireRealtor } from '../../../lib/realtorAuth';
import { rateLimited } from '../../../lib/tenantProfileStore';
import { createPortal } from '../../../lib/billing';
import { stripeConfigured } from '../../../lib/stripe';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripeConfigured()) return res.status(503).json({ error: 'Billing isn’t set up yet.' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  if (await rateLimited('billing:portal', ctx.user.id, 10, 600)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { data: profile } = await ctx.supabase.from('profiles').select('id, stripe_customer_id').eq('id', ctx.user.id).maybeSingle();
  try { const s = await createPortal({ profile: profile || { id: ctx.user.id } }); return res.status(200).json({ url: s.url }); }
  catch (e) { if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message }); logServerError('[billing/portal]', e); return res.status(500).json({ error: 'Could not open the billing portal.' }); }
}
