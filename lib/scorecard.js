// lib/scorecard.js
// The landlord scorecard, calculated server-side from application facts. Single source of
// truth: used by /api/generate (first submission) AND /api/application/manage `update`
// (tenant edits their profile), so an edited profile is re-scored exactly like a fresh one.
// The tenant never sees this; it is for the realtor's ranking only.
//
// scorecard-v2: three components, all screenable tenancy facts (employment tenure, rent
// affordability, rental history and references). The free text fields (reason for moving,
// "anything to address") are NOT read here: keyword matching on them scored proxies for
// protected grounds under the Ontario Human Rights Code and the BC Human Rights Code.
import {
  rentAffordabilityScore, employmentStabilityScore,
  rentalHistoryScore, overallScore,
} from './scoring.js';

export const SCORECARD_MODEL = 'scorecard-v2';

// ─── LANDLORD SCORECARD CALCULATION ─────────────────────────
// Calculated server-side from form data — the tenant never sees this
export function calculateScorecard(data) {
  const {
    yearsAtJob, householdAnnualIncome, householdRentToIncomeRatio, hasCoApplicant,
    previousAddress, yearsAtPrevious, previousLandlordName, referencesCount,
  } = data;

  // Employment tenure/stability — smooth ramp (see lib/scoring.js). Note keeps the years phrasing.
  const jobYears = parseFloat(yearsAtJob) || 0;
  const incomeStability = employmentStabilityScore(jobYears);
  const incomeStabilityNote = jobYears >= 3
    ? `${Math.floor(jobYears)}+ years at same employer`
    : jobYears > 0
      ? `${jobYears} year(s) at current employer`
      : 'New position';

  // Rent affordability — smooth Toronto-calibrated blend of rent-to-income + a diminishing
  // income-level buffer, on HOUSEHOLD income when there is a co-applicant (see lib/scoring.js).
  let rentAffordability = 3;
  let rentAffordabilityNote = 'Rent not specified';
  if (householdRentToIncomeRatio !== null && householdRentToIncomeRatio !== undefined) {
    rentAffordability = rentAffordabilityScore(householdAnnualIncome, householdRentToIncomeRatio);
    rentAffordabilityNote = `${householdRentToIncomeRatio}% of ${hasCoApplicant ? 'combined household' : 'monthly'} income`;
  }

  // Rental history + references — smooth base from prior tenancy, references corroborate.
  const histYears = parseFloat(yearsAtPrevious) || 0;
  const rentalHistory = rentalHistoryScore({
    yearsAtPrevious: histYears, previousLandlordName, previousAddress, referencesCount,
  });
  const rentalHistoryNote = histYears > 0 && previousLandlordName
    ? `${histYears} years with reference available`
    : previousAddress
      ? `${histYears || 'Some'} years prior, limited references`
      : 'First time renter · alternative documentation';

  return {
    incomeStability: { score: incomeStability, note: incomeStabilityNote },
    rentAffordability: { score: rentAffordability, note: rentAffordabilityNote },
    rentalHistory: { score: rentalHistory, note: rentalHistoryNote },
    overall: overallScore({ incomeStability, rentAffordability, rentalHistory }),
    model: SCORECARD_MODEL,
  };
}
