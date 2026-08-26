// lib/onboarding.js
// Pure helpers for first run onboarding. NOT an access decision (that is lib/entitlements.js):
// this only answers "which step next" and "must the dashboard send them to /onboarding".
export const STEPS = ['identity', 'province', 'branding', 'listing'];

// The step a returning profile resumes at. onboarding_step stores the NEXT step to show.
export function nextStep(profile) {
  const s = profile?.onboarding_step;
  if (s === 'done') return 'done';
  if (STEPS.includes(s)) return s;
  return 'identity';
}

// Identity and province are required; branding and the first listing are not. So the dashboard
// redirects only while one of the two required steps is still ahead. Until db/onboarding.sql has
// run the column does not exist (undefined): treat that as "no onboarding", never lock anyone.
export function needsOnboarding(profile) {
  if (!profile || profile.onboarding_step === undefined) return false;
  const s = nextStep(profile);
  if (s === 'done' || s === 'branding' || s === 'listing') return false;
  const hasIdentity = !!(String(profile.full_name || '').trim() && String(profile.brokerage || '').trim());
  const hasProvince = !!profile.province;
  return !(hasIdentity && hasProvince);
}
