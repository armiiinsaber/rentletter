// lib/listingForm.js  PURE, isomorphic. The affordability inputs of a listing, defined once for
// the create and edit form (components/listings/ListingSetupModal.js), the create route
// (lib/realtorWrites.js) and Fit (lib/fitScore.js).
//
// The rent share cap is the one affordability rule. It defaults to 40 for a new listing; the
// database column default stays 30 and a null cap reads as 40 everywhere. The minimum annual
// income is a second, separate criterion the realtor may type; it is never derived from the cap,
// and a stored minimum that equals rent × 12 / cap within 2% is the cap said twice, so Fit
// ignores it (effectiveMinIncome in lib/fitScore.js).
export const DEFAULT_RENT_SHARE_CAP = 40;
export const SAME_AS_CAP_PCT = 2;
export const CAP_HELPER = 'Most Toronto realtors use 35 to 40. A rigid cap is hard to defend; this is a guideline the score uses, not a cutoff.';
export const SAME_AS_CAP_NOTE = 'Same as your rent share cap; you do not need both.';

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const intOrNull = (v) => { if (v === '' || v === null || v === undefined) return null; const x = parseInt(v, 10); return Number.isNaN(x) ? null : x; };
export const numOrNull = (v) => { if (v === '' || v === null || v === undefined) return null; const x = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isNaN(x) ? null : x; };

// The annual income at which this rent is exactly cap% of monthly income.
export const derivedMinIncome = (rent, cap) => (n(rent) > 0 && n(cap) > 0 ? Math.round((n(rent) * 12 * 100) / n(cap)) : null);
// A typed minimum within 2% of the derived figure says the same thing as the cap.
export const sameAsCap = (min, derived) => n(min) > 0 && n(derived) > 0 && (Math.abs(n(min) - n(derived)) / n(derived)) * 100 <= SAME_AS_CAP_PCT;
const money = (v) => `$${Math.round(n(v)).toLocaleString('en-CA')}`;
// The muted line beside the minimum income field: "At 40% and $2,600, that is about $78,000 a year."
export function derivedLine(cap, rent) {
  const d = derivedMinIncome(rent, cap);
  return d ? `At ${n(cap)}% and ${money(rent)}, that is about ${money(d)} a year.` : null;
}
// The affordability part of the listing payload: the cap as typed, the minimum only when the
// realtor typed a positive number. Nothing is derived.
export function affordabilityPayload(form) {
  const min = numOrNull(form && form.pref_min_annual_income);
  return { pref_rent_to_income_max_pct: intOrNull(form && form.pref_rent_to_income_max_pct), pref_min_annual_income: min > 0 ? min : null };
}
