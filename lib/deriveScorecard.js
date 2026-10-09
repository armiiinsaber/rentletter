// lib/deriveScorecard.js  PURE, isomorphic. The rent share, derived at READ time from the
// listing's CURRENT rent. The scorecard itself is gone (Fit, lib/fitScore.js, is the number);
// only this ratio derivation remains, and withLiveScore applies it to a dashboard applicant.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// The primary applicant's gross annual income. Nothing of a co applicant or a guarantor enters a
// ratio or a score (docs/fit-v2.md): their income is shown beside the primary's, never added.
export function primaryAnnualIncome(application) {
  const app = application || {};
  return num(app.annual_income);
}

// Live rent share: listing.monthly_rent over the primary's monthly income, as a rounded percent.
// null when the rent or the income is missing or zero.
export function deriveRentToIncomePct(application, listing) {
  const rent = num(listing && listing.monthly_rent);
  const annual = primaryAnnualIncome(application);
  if (rent <= 0 || annual <= 0) return null;
  const monthly = Math.round(annual / 12);
  return monthly <= 0 ? null : Math.round((rent / monthly) * 100);
}

// One dashboard applicant (the fetchListingApplicants shape): the stored ratio stays when the live
// one cannot be computed, so the number and the synthesis line agree. The scorecard key is dropped.
export function withLiveScore(applicant, listing) {
  const app = applicant && applicant.application;
  if (!app) return applicant;
  const pct = deriveRentToIncomePct(app, listing);
  const { scorecard, ...rest } = app; void scorecard;
  return { ...applicant, application: { ...rest, rent_to_income_ratio: pct == null ? app.rent_to_income_ratio : pct } };
}
