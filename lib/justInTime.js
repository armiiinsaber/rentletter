// lib/justInTime.js  PURE, shared by the dashboard pieces that ask for a profile fact at the
// moment it is first needed, instead of at sign up (pages/onboarding.js asks the display name
// only). Province at the first listing, the signing name at the first send, the branding hint at
// the first View as landlord or send. None of these blocks the realtor.
const has = (v) => !!String(v || '').trim();
export const needsProvince = (profile) => !has(profile?.province);
export const needsSignature = (profile) => !has(profile?.report_signature);
export const defaultSignature = (profile) => [profile?.full_name, profile?.brokerage].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
export const needsBrandingHint = (profile) => !has(profile?.logo_url) && !has(profile?.brokerage);
export const BRANDING_HINT = 'The report carries your name only.';
export const BRANDING_HINT_LINK = 'Add a logo and brokerage on your profile.';
