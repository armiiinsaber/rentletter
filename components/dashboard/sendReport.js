// components/dashboard/sendReport.js  PURE, browser and tests.
// What the send sheet (components/dashboard/SendReportSheet.js) shows before a report goes to the
// landlord, read from what the Listings view already loads (components/dashboard/HomeView.js):
//   reportRows({ listing, applicants, profile })  the applicants the report carries, in its order,
//     each { rank, name, fit, linkId }. Built by lib/reportSnapshot.js buildSnapshot, the function
//     the send route freezes the report with, on the same applicants: the sheet lists exactly who
//     the landlord will read, in the order they will read them (withdrawn, set aside and a second
//     application from the same person left out; best Fit first).
//   fitWord(fit)  the word beside the Fit number (stated, docs match, check docs, verified), or the
//     line the listing page shows in its place when there is no number yet.
//   sendMissing(listing, profile)  { email, signature }: what the send still needs. The route
//     refuses a listing without a landlord email; the first send asks for the signing name
//     (lib/justInTime.js), as the listing page does.
import { buildSnapshot } from '../../lib/reportSnapshot.js';
import { INCOMPLETE_LINE } from '../../lib/fitScore.js';
import { needsSignature } from '../../lib/justInTime.js';

// The address check the send route makes (pages/api/listings/send-report.js).
export const LANDLORD_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NO_FIT_WORD = 'Rent share unknown';

export function reportRows({ listing, applicants, profile } = {}) {
  if (!listing) return [];
  const payload = buildSnapshot({ listing, applicants: applicants || [], profile: profile || {} });
  return payload.applicants.map((r) => ({ rank: r.rank, name: r.name, fit: r.fit, linkId: r.linkId }));
}

export function fitWord(fit) {
  if (fit && fit.score != null && fit.label) return fit.label;
  if (fit && fit.incomplete) return typeof fit.incomplete === 'string' ? fit.incomplete : (fit.incomplete.line || INCOMPLETE_LINE);
  return NO_FIT_WORD;
}

export const sendMissing = (listing, profile) => ({
  email: !LANDLORD_EMAIL.test(String((listing && listing.landlord_email) || '').trim()),
  signature: needsSignature(profile),
});
