// lib/billing.js — SERVER-ONLY. Checkout, portal, and the webhook's state machine. Every write
// goes through the service-role client. The ONLY thing that turns these columns into access is
// lib/entitlements.js — this file mirrors Stripe, it never decides anything.
import { getSupabaseAdminClient } from './supabase/admin';
import { stripe, StripeError } from './stripe';
import { priceId, GRACE_DAYS } from './billingConfig';
import { getEntitlement } from './entitlements';

const admin = () => getSupabaseAdminClient();
const MISSING = (e) => e && (e.code === '42P01' || /relation .* does not exist|could not find the table|schema cache/i.test(e.message || ''));
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

// The Stripe customer for a profile: reuse stripe_customer_id, else create and store it.
export async function ensureCustomer(profile, email) {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const c = await stripe('POST', '/customers', { email: email || profile.email || undefined, name: profile.full_name || undefined, metadata: { profile_id: profile.id } }, { idempotencyKey: `cust:${profile.id}` });
  const { error } = await admin().from('profiles').update({ stripe_customer_id: c.id }).eq('id', profile.id);
  if (error) throw new Error(error.message);
  return c.id;
}

// Hosted Checkout in subscription mode. Refuses founding members and anyone already subscribed.
export async function createCheckout({ profile, email, interval }) {
  const e = getEntitlement(profile);
  if (e.status === 'founding') throw new StripeError('Founding members don’t need a subscription, you already have full access.', 400, 'already_founding');
  if (e.status === 'paid' || e.status === 'past_due') throw new StripeError('You already have a subscription. Manage it from the billing portal.', 400, 'already_subscribed');
  const price = priceId(interval); if (!price) throw new StripeError('That plan isn’t configured yet.', 503, 'price_missing');
  const customer = await ensureCustomer(profile, email);
  const s = await stripe('POST', '/checkout/sessions', {
    mode: 'subscription', customer, client_reference_id: profile.id,
    line_items: [{ price, quantity: 1 }],
    metadata: { profile_id: profile.id },
    subscription_data: { metadata: { profile_id: profile.id } },
    allow_promotion_codes: 'false',
    success_url: `${site()}/landlord?checkout=success`, cancel_url: `${site()}/landlord?checkout=canceled`,
  });
  return { url: s.url, id: s.id };
}

export async function createPortal({ profile }) {
  if (!profile.stripe_customer_id) throw new StripeError('No billing account yet.', 400, 'no_customer');
  const s = await stripe('POST', '/billing_portal/sessions', { customer: profile.stripe_customer_id, return_url: `${site()}/landlord` });
  return { url: s.url };
}

// ── Webhook ─────────────────────────────────────────────────────────────────────────────────
// Insert the event id FIRST. A duplicate id means Stripe is replaying (or retried after a
// timeout) → the caller returns 200 and does nothing else.
export async function recordEvent(evt) {
  const { error } = await admin().from('stripe_events').insert({ id: evt.id, type: evt.type });
  if (!error) return { fresh: true };
  if (error.code === '23505' || /duplicate key/i.test(error.message || '')) return { fresh: false };
  if (MISSING(error)) throw new Error('stripe_events table is missing — run db/stripe-lifecycle.sql');
  throw new Error(error.message);
}

// Resolve the profile: stripe_customer_id first, then metadata.profile_id. Never by email.
async function findProfile({ customerId, profileId }) {
  const sb = admin();
  if (customerId) { const { data } = await sb.from('profiles').select('*').eq('stripe_customer_id', customerId).maybeSingle(); if (data) return data; }
  if (profileId) { const { data } = await sb.from('profiles').select('*').eq('id', profileId).maybeSingle(); if (data) return data; }
  return null;
}
const patch = async (id, values) => { const { error } = await admin().from('profiles').update(values).eq('id', id); if (error) throw new Error(error.message); };
const intervalOf = (sub) => sub?.items?.data?.[0]?.price?.recurring?.interval || sub?.plan?.interval || null;

// Mirror a subscription object onto the profile.
export async function applySubscription(profile, sub) {
  const status = String(sub?.status || '');
  const base = { stripe_customer_id: profile.stripe_customer_id || (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id) || null, stripe_subscription_id: sub.id };
  if (status === 'active' || status === 'trialing') {
    return patch(profile.id, { ...base, plan: 'paid', subscription_status: status, billing_interval: intervalOf(sub), current_period_end: iso(sub.current_period_end), grace_ends_at: null, canceled_at: null });
  }
  if (status === 'canceled') return endSubscription(profile, sub);
  if (status === 'past_due' || status === 'unpaid') {
    // plan unchanged; grace starts on invoice.payment_failed — keep an existing window, open one if none
    return patch(profile.id, { ...base, subscription_status: status, billing_interval: intervalOf(sub), current_period_end: iso(sub.current_period_end), grace_ends_at: profile.grace_ends_at || new Date(Date.now() + GRACE_DAYS * 86400000).toISOString() });
  }
  // incomplete / incomplete_expired / paused: mirror the status only
  return patch(profile.id, { ...base, subscription_status: status, current_period_end: iso(sub.current_period_end) });
}
export async function endSubscription(profile, sub) {
  return patch(profile.id, { plan: 'none', subscription_status: 'canceled', canceled_at: new Date().toISOString(), grace_ends_at: null, current_period_end: iso(sub?.current_period_end) || profile.current_period_end || null, stripe_subscription_id: sub?.id || profile.stripe_subscription_id || null });
}

export async function handleStripeEvent(evt) {
  const obj = evt.data?.object || {};
  const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
  const meta = obj.metadata || {};
  switch (evt.type) {
    case 'checkout.session.completed': {
      const profile = await findProfile({ customerId, profileId: meta.profile_id || obj.client_reference_id });
      if (!profile) return { handled: false, note: 'no profile for checkout session' };
      const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;
      if (customerId && !profile.stripe_customer_id) await patch(profile.id, { stripe_customer_id: customerId });
      if (subId) { const sub = await stripe('GET', `/subscriptions/${subId}`); await applySubscription({ ...profile, stripe_customer_id: profile.stripe_customer_id || customerId }, sub); }
      return { handled: true };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const profile = await findProfile({ customerId, profileId: meta.profile_id });
      if (!profile) return { handled: false, note: 'no profile for subscription' };
      await applySubscription(profile, obj); return { handled: true };
    }
    case 'customer.subscription.deleted': {
      const profile = await findProfile({ customerId, profileId: meta.profile_id });
      if (!profile) return { handled: false, note: 'no profile for subscription' };
      await endSubscription(profile, obj); return { handled: true };
    }
    case 'invoice.payment_failed': {
      const profile = await findProfile({ customerId, profileId: obj.subscription_details?.metadata?.profile_id });
      if (!profile) return { handled: false, note: 'no profile for invoice' };
      await patch(profile.id, { subscription_status: 'past_due', grace_ends_at: new Date(Date.now() + GRACE_DAYS * 86400000).toISOString() });
      return { handled: true };
    }
    case 'invoice.payment_succeeded': {
      const profile = await findProfile({ customerId, profileId: obj.subscription_details?.metadata?.profile_id });
      if (!profile) return { handled: false, note: 'no profile for invoice' };
      if (profile.subscription_status === 'past_due' || profile.subscription_status === 'unpaid' || profile.grace_ends_at) await patch(profile.id, { subscription_status: 'active', grace_ends_at: null, ...(profile.plan === 'paid' ? {} : {}) });
      return { handled: true };
    }
    default:
      return { handled: false, note: 'unhandled type' };
  }
}
