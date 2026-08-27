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

// Same shape calculateScorecard returns. Falls back to the stored scorecard, unchanged, when the
// inputs are missing; never null, never an invented number.
export function deriveScorecard(storedScorecard, application, listing) {
  const stored = storedScorecard && typeof storedScorecard === 'object' ? storedScorecard : null;
  const ratio = deriveRentToIncomePct(application, listing);
  if (ratio == null || !stored) return storedScorecard;
  const annual = householdAnnualIncome(application);
  const hasCo = !!(application && application.co_applicant && num(application.co_applicant.annualIncome ?? application.co_applicant.annual_income) > 0);
  const rentAffordability = rentAffordabilityScore(annual, ratio);
  const s = (k) => num(stored[k] && stored[k].score);
  return {
    ...stored,
    rentAffordability: { score: rentAffordability, note: `${ratio}% of ${hasCo ? 'combined household' : 'monthly'} income` },
    overall: overallScore({
      incomeStability: s('incomeStability'), rentAffordability,
      rentalHistory: s('rentalHistory'), longTermIntent: s('longTermIntent'), disclosures: s('disclosures'),
    }),
  };
}

// Apply both to one dashboard applicant (the fetchListingApplicants shape). The stored ratio
// stays when the live one cannot be computed, so the score and the synthesis line agree.
export function withLiveScore(applicant, listing) {
  const app = applicant && applicant.application;
  if (!app) return applicant;
  const pct = deriveRentToIncomePct(app, listing);
  return { ...applicant, application: { ...app, scorecard: deriveScorecard(app.scorecard, app, listing), rent_to_income_ratio: pct == null ? app.rent_to_income_ratio : pct } };
}
