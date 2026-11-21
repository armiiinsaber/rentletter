// lib/profilePersonal.js  PURE, isomorphic. The three things a tenant may choose to add to their
// profile about themselves (db/022-full-tenant-profile.sql): a photo, a few words, and an offer
// to prepay rent. Each is optional, never required anywhere, and the tenant's to change or
// remove. The rules and the words that stand beside each live here, once.
//   · none of the three is in the profile's facts, so none is sent with an application and none
//     is an input to Fit (lib/fitScore.js), a document check or any reading by AI;
//   · the photo is never scored, never read by anything, and never goes on a landlord report;
//   · the words are the tenant's own. Nothing rewrites them unless the tenant asks for a
//     suggestion and then accepts it;
//   · prepaying is the tenant's own offer: never called a deposit, never something a landlord
//     can require.
export const ABOUT_MAX = 600;
export const PREPAY_MIN = 1;
export const PREPAY_MAX = 12;
export const PHOTO_MIME = Object.freeze(['image/jpeg', 'image/png']);
export const PHOTO_EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png' });
// The browser makes the photo small before it is sent (components/tenant/ProfilePersonal.js).
export const PHOTO_MAX_BYTES = 400 * 1024;

export const PHOTO_NOTE = 'Optional. Many landlords like to put a face to a name. Your photo is never used to score or rank you.';
export const ABOUT_PROMPTS = Object.freeze(['What you do', 'Why this home', 'How you live day to day']);
export const ABOUT_NOTE = 'Share what you’re comfortable with. You never need to mention family, religion or health.';
export const PREPAY_FIELD = 'I’m open to prepaying rent';
export const PREPAY_NOTE = 'Entirely your choice. A landlord can’t require it, and your rent deposit stays at one month.';
export const PREPAY_LABEL = 'Offered by the tenant';
export const LANDLORD_SWITCH = 'Realtors may include these in the report they send a landlord';

const chars = (s) => [...String(s)].length;
// The tenant's words as stored: line ends made plain, no more than one blank line in a row,
// trimmed.  -> { value: string | null } | { error }
export function cleanAbout(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { value: null };
  if (chars(text) > ABOUT_MAX) return { error: `Keep it to ${ABOUT_MAX} characters.` };
  return { value: text };
}
export const aboutLength = (raw) => chars(String(raw == null ? '' : raw));
// A number of months from 1 to 12, or null for no offer.  -> { value } | { error }
export function cleanPrepay(raw) {
  if (raw == null || raw === '' || raw === false) return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < PREPAY_MIN || n > PREPAY_MAX) return { error: `Choose ${PREPAY_MIN} to ${PREPAY_MAX} months.` };
  return { value: n };
}
// "Open to prepaying 3 months of rent": the offer in words, or null for none.
export const prepayLine = (months) => { const n = Number(months); return Number.isInteger(n) && n >= PREPAY_MIN && n <= PREPAY_MAX ? `Open to prepaying ${n} ${n === 1 ? 'month' : 'months'} of rent` : null; };
// What a file really is, from its first bytes: JPEG or PNG, or null for anything else.
export function photoKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  return null;
}
