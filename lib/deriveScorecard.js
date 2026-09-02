// lib/deriveScorecard.js
// The applicant score, derived at READ time from the listing's CURRENT rent. calculateScorecard
// runs once at submit with a rent frozen into the application; this re derives only the part
// that depends on the listing (rentAffordability, and therefore overall) and carries the four
// application only components through untouched. Same curves (lib/scoring.js), never forked.
// Pure and isomorphic: no imports beyond scoring, no I/O, no text parsing.
import { rentAffordabilityScore, overallScore } from './scoring.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Household gross annual income exactly as pages/api/generate.js computes it: applicant gross
// plus the co applicant's gross when one is present. 0 when unknown.
export function householdAnnualIncome(application) {
  const app = application || {};
  const gross = num(app.annual_income);
  const co = app.co_applicant ? num(app.co_applicant.annualIncome ?? app.co_applicant.annual_income) : 0;
  return gross + co;
}

// Live rent share: listing.monthly_rent over household monthly income, as a rounded percent.
// null when the rent or the income is missing or zero.
export function deriveRentToIncomePct(application, listing) {
  const rent = num(listing && listing.monthly_rent);
  const annual = householdAnnualIncome(application);
  if (rent <= 0 || annual <= 0) return null;
  const monthly = Math.round(annual / 12);
  if (monthly <= 0) return null;
  return Math.round((rent / monthly) * 100);
}

export const SCORECARD_MODEL = 'scorecard-v2';

// Reduce any stored scorecard (v1 rows carry five components) to the v2 shape: the two
// application only components carried through, the given rentAffordability, and an overall that
// is the mean of those three. longTermIntent and disclosures are never returned: they scored
// keyword matches on free text, which are proxies for protected grounds.
function toV2(stored, rentAffordability) {
  const incomeStability = stored.incomeStability || { score: 0, note: '' };
  const rentalHistory = stored.rentalHistory || { score: 0, note: '' };
  return {
    incomeStability,
    rentAffordability,
    rentalHistory,
    overall: overallScore({ incomeStability: incomeStability.score, rentAffordability: rentAffordability && rentAffordability.score, rentalHistory: rentalHistory.score }),
    model: SCORECARD_MODEL,
  };
}

// Same shape calculateScorecard returns (scorecard-v2). When the live rent or the income is
// missing the stored components are kept as they are, but the result is still the v2 shape: the
// two deleted components are stripped and overall is recomputed from the remaining three, so no
// reader ever sees a number derived from a free text answer. Never null when given an object,
// never an invented number.
export function deriveScorecard(storedScorecard, application, listing) {
  const stored = storedScorecard && typeof storedScorecard === 'object' ? storedScorecard : null;
  if (!stored) return storedScorecard;
  const ratio = deriveRentToIncomePct(application, listing);
  if (ratio == null) return toV2(stored, stored.rentAffordability || { score: 3, note: 'Rent not specified' });
  const annual = householdAnnualIncome(application);
  const hasCo = !!(application && application.co_applicant && num(application.co_applicant.annualIncome ?? application.co_applicant.annual_income) > 0);
  return toV2(stored, { score: rentAffordabilityScore(annual, ratio), note: `${ratio}% of ${hasCo ? 'combined household' : 'monthly'} income` });
}

// Apply both to one dashboard applicant (the fetchListingApplicants shape). The stored ratio
// stays when the live one cannot be computed, so the score and the synthesis line agree.
export function withLiveScore(applicant, listing) {
  const app = applicant && applicant.application;
  if (!app) return applicant;
  const pct = deriveRentToIncomePct(app, listing);
  return { ...applicant, application: { ...app, scorecard: deriveScorecard(app.scorecard, app, listing), rent_to_income_ratio: pct == null ? app.rent_to_income_ratio : pct } };
}
