// lib/accountStatus.js
// Derive display status from a Supabase profiles row (mirrors the old
// evaluateAccount in lib/account.js). Display only — no billing this stage.
export function evaluateProfile(p) {
  if (!p) return { status: 'unknown', daysLeft: null, locked: false, signupNumber: null };
  if (p.is_founder || p.subscription_status === 'founder') {
    return { status: 'founder', daysLeft: null, locked: false, signupNumber: p.signup_number ?? null };
  }
  if (p.subscription_status === 'active') {
    return { status: 'active', daysLeft: null, locked: false, signupNumber: p.signup_number ?? null };
  }
  if (p.subscription_status === 'pending') {
    return { status: 'pending', daysLeft: null, locked: false, signupNumber: null };
  }
  if (p.trial_ends_at) {
    const daysLeft = Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000));
    return { status: daysLeft > 0 ? 'trial' : 'lapsed', daysLeft, locked: daysLeft <= 0, signupNumber: p.signup_number ?? null };
  }
  return { status: 'lapsed', daysLeft: 0, locked: true, signupNumber: p.signup_number ?? null };
}
