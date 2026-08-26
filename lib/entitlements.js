// lib/entitlements.js
// THE single place that decides whether a realtor can use the product. Pure: a profile row in,
// a verdict out — no network, no Supabase, no Date except the injectable `now`. Nothing else in
// the codebase may read profile.plan to decide access; import getEntitlement instead.
//
//   getEntitlement(profile, now?) → { status, canUseProduct, trialEndsAt, daysLeft, reason }
//     status: 'founding' | 'trialing' | 'trial_expired' | 'paid' | 'past_due' | 'none'
//
// plan is the only input for founding status. The first-50 founders recorded under the old
// scheme (is_founder / subscription_status = 'founder') are backfilled to plan = 'founding' by
// db/billing-and-promos.sql; this function does not read those legacy fields.
//
// TEMPORARY, deliberate: 'past_due' returns canUseProduct: true. Until Stripe grace handling
// lands there is no dunning window to honour, so a payment hiccup must not lock anyone out.
// Once grace handling exists, past_due must become canUseProduct: false at the end of grace.
const DAY = 86400000;
const PAST_DUE = new Set(['past_due', 'unpaid', 'incomplete', 'incomplete_expired']);

export function getEntitlement(profile, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const p = profile || {};
  const plan = String(p.plan || 'none');
  const out = (status, canUseProduct, reason, extra = {}) => ({ status, canUseProduct, trialEndsAt: null, daysLeft: null, reason, ...extra });

  if (plan === 'founding') return out('founding', true, 'Founding member');
  if (plan === 'paid') {
    if (PAST_DUE.has(String(p.subscription_status || ''))) return out('past_due', true, 'Payment past due');
    return out('paid', true, 'Subscribed');
  }
  if (plan === 'trial') {
    const ends = p.trial_ends_at ? new Date(p.trial_ends_at) : null;
    const endsAt = ends && !Number.isNaN(ends.getTime()) ? ends.toISOString() : null;
    if (!endsAt) return out('trial_expired', false, 'Trial has no end date', { trialEndsAt: null, daysLeft: 0 });
    const msLeft = ends.getTime() - t;
    if (msLeft > 0) { const daysLeft = Math.ceil(msLeft / DAY); return out('trialing', true, `Trial, ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, { trialEndsAt: endsAt, daysLeft }); }
    return out('trial_expired', false, 'Trial ended', { trialEndsAt: endsAt, daysLeft: 0 });
  }
  return out('none', false, 'No plan');
}
