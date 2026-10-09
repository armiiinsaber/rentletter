// lib/listingForm.js  PURE, isomorphic. The affordability input of a listing, defined once for
// the create and edit form (components/listings/ListingSetupModal.js), the create route
// (lib/realtorWrites.js) and Fit (lib/fitScore.js).
//
// The rent share cap is the one affordability rule. It defaults to 40 for a new listing; the
// database column default stays 30 and a null cap reads as 40 everywhere. No income floor exists
// anywhere in the product (docs/fit-v2.md): a fixed income floor is the rent to income cutoff
// the OHRC's rental housing policy calls illegal outside subsidized housing.
export const DEFAULT_RENT_SHARE_CAP = 40;
export const CAP_HELPER = 'Most Toronto realtors use 35 to 40. A rigid cap is hard to defend; this is a guideline the score uses, not a cutoff.';

export const intOrNull = (v) => { if (v === '' || v === null || v === undefined) return null; const x = parseInt(v, 10); return Number.isNaN(x) ? null : x; };
export const numOrNull = (v) => { if (v === '' || v === null || v === undefined) return null; const x = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isNaN(x) ? null : x; };

// The affordability part of the listing payload: the cap as typed. Nothing is derived.
export function affordabilityPayload(form) {
  return { pref_rent_to_income_max_pct: intOrNull(form && form.pref_rent_to_income_max_pct) };
}
