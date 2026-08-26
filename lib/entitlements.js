// lib/entitlements.js
// THE single place that decides whether a realtor can use the product. Pure: a profile row in,
// a verdict out — no network, no Supabase, no Date except the injectable `now`. Nothing else in
// the codebase may read profile.plan to decide access; import getEntitlement instead.
//
//   getEntitlement(profile, now?) → { status, canUseProduct, trialEndsAt, daysLeft, reason }
//     status: 'founding' | 'trialing' | 'trial_expired' | 'paid' | 'past_due' | 'none'
//
// Legacy: accounts from before db/billing-and-promos.sql sit at plan = 'none'. The first-50
// founders were recorded as is_founder / subscription_status = 'founder' — they keep founding
// access here (that flag is read only by this function). Everyone else at 'none' is reported as
// 'none' with canUseProduct false; NOTHING enforces that yet (gating UI ships with checkout).
const DAY = 86400000;
const PAST_DUE = new Set(['past_due', 'unpaid', 'incomplete', 'incomplete_expired']);

export function getEntitlement(profile, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const p = profile || {};
  const plan = String(p.plan || 'none');
  const legacyFounder = plan === 'none' && (p.is_founder === true || p.subscription_status === 'founder');
  const out = (status, canUseProduct, reason, extra = {}) => ({ status, canUseProduct, trialEndsAt: null, daysLeft: null, reason, ...extra });

  if (plan === 'founding' || legacyFounder) return out('founding', true, legacyFounder ? 'Founding member (first 50)' : 'Founding member');
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
