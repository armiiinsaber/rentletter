// lib/onboarding.js
// Pure helpers for first run onboarding. NOT an access decision (that is lib/entitlements.js):
// this only answers "must the dashboard send them to /onboarding". Onboarding asks the display
// name and nothing else; province, the signing name and branding are asked just in time
// (lib/justInTime.js). A profile with a display name is complete, whatever onboarding_step says.
export const isOnboarded = (profile) => !!String(profile?.full_name || '').trim();
export function needsOnboarding(profile) {
  if (!profile) return false; // no row yet: the dashboard builds its fallback, never locks anyone out
  return !isOnboarded(profile);
}
