// POST /api/stripe/webhook — Stripe → Rentletter. Raw body (parser off) verified against
// STRIPE_WEBHOOK_SECRET; an unverified request is 400 and writes nothing. Then the event id is
// inserted into stripe_events BEFORE anything else: a duplicate means a replay → 200, no-op.
// Handled types mirror the subscription onto the profile (lib/billing.js); unhandled types are
// logged once and acknowledged with 200 so Stripe stops retrying.
import { verifyStripeSignature, readRawBody } from '../../../lib/stripe';
import { recordEvent, handleStripeEvent } from '../../../lib/billing';
import { logServerError } from '../../../lib/serverLog';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Webhook not configured.' });
  const raw = await readRawBody(req);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ error: 'Bad signature.' });
  let evt; try { evt = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'Bad payload.' }); }
  if (!evt?.id || !evt?.type) return res.status(400).json({ error: 'Bad event.' });
  try {
    const { fresh } = await recordEvent(evt);
    if (!fresh) return res.status(200).json({ received: true, duplicate: true });
    const r = await handleStripeEvent(evt);
    if (!r.handled) console.log(`[stripe/webhook] ${evt.type} (${evt.id}): ${r.note}`);
    return res.status(200).json({ received: true, handled: !!r.handled });
  } catch (e) {
    // 500 → Stripe retries with the same event id; recordEvent makes the retry safe.
    logServerError('[stripe/webhook]', e, { type: evt.type, id: evt.id });
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
