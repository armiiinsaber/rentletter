// lib/accountStatus.js
// Display adapter over lib/entitlements.js — the ONLY thing that decides access. Kept so the
// existing imports (StatusBadge, admin read model) keep working; it adds nothing of its own.
import { getEntitlement } from './entitlements';

export function evaluateProfile(p, now) {
  if (!p) return { status: 'unknown', daysLeft: null, locked: false, signupNumber: null, entitlement: null };
  const e = getEntitlement(p, now);
  return { status: e.status, daysLeft: e.daysLeft, locked: !e.canUseProduct, trialEndsAt: e.trialEndsAt, reason: e.reason, signupNumber: p.signup_number ?? null, entitlement: e };
}
