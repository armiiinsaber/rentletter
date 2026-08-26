// lib/reportSignature.js
// The signing name on landlord reports, resolved in ONE place. Some accounts are run by an
// assistant on behalf of one or more agents, so the person signing a given report is not always
// the account holder: profiles.report_signature wins when set, otherwise the display name.
// Pure and client safe (no I/O). Every report render path (PDF, text, email) calls this.
export const SIGNATURE_MAX = 80;
export const cleanSignature = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, SIGNATURE_MAX);
export function signingName(profile, fallback = 'Your realtor') {
  const sig = cleanSignature(profile?.report_signature);
  if (sig) return sig;
  const name = cleanSignature(profile?.full_name);
  return name || fallback;
}
