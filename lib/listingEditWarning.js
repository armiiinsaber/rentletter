// lib/listingEditWarning.js  PURE. Editing the rent re scores every applicant on the listing
// (Fit reads the live listing rent, lib/deriveScorecard.js). The edit confirm carries one extra
// line only when the rent actually changes and someone is on the listing.
export const RENT_WARNING = 'Changing rent re scores every applicant on this listing.';
export function rentChanged(initial, payload) {
  const before = Number(initial?.monthly_rent) || 0, after = Number(payload?.monthly_rent) || 0;
  return before !== after;
}
export const needsRentConfirm = (initial, payload, activeApplicants) => rentChanged(initial, payload) && Number(activeApplicants) > 0;
