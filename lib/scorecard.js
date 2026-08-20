// lib/scorecard.js
// The landlord scorecard, calculated server-side from application facts. Single source of
// truth: used by /api/generate (first submission) AND /api/application/manage `update`
// (tenant edits their profile), so an edited profile is re-scored exactly like a fresh one.
// The tenant never sees this — it's for the realtor's ranking only.
import {
  rentAffordabilityScore, employmentStabilityScore,
  rentalHistoryScore, overallScore,
} from './scoring';

// ─── LANDLORD SCORECARD CALCULATION ─────────────────────────
// Calculated server-side from form data — the tenant never sees this
export function calculateScorecard(data) {
  const {
    yearsAtJob, householdAnnualIncome, householdRentToIncomeRatio, hasCoApplicant,
    previousAddress, yearsAtPrevious, previousLandlordName, referencesCount,
    reasonForMoving, redFlags,
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
      : 'First-time renter — alternative documentation';

  // Long-term intent
  let longTermIntent = 4;
  const reason = (reasonForMoving || '').toLowerCase();
  const strongIntentKeywords = ['new job', 'job', 'school', 'university', 'partner', 'family', 'closer to work', 'commute', 'permanent', 'long-term', 'settle'];
  const shortIntentKeywords = ['temporary', 'short-term', 'few months', 'travel'];
  if (strongIntentKeywords.some(k => reason.includes(k))) longTermIntent = 5;
  else if (shortIntentKeywords.some(k => reason.includes(k))) longTermIntent = 3;
  else longTermIntent = 4;
  const longTermIntentNote = strongIntentKeywords.find(k => reason.includes(k))
    ? `Clear long-term reason: ${strongIntentKeywords.find(k => reason.includes(k))}`
    : 'General life-stage move';

  // Disclosures
  let disclosures = 5;
  let disclosuresNote = 'No items to address';
  if (redFlags && redFlags.trim().length > 0) {
    const flagText = redFlags.toLowerCase();
    if (flagText.includes('bankruptcy') || flagText.includes('eviction')) {
      disclosures = 3;
      disclosuresNote = 'Significant items addressed honestly';
    } else if (flagText.includes('credit') || flagText.includes('gap')) {
      disclosures = 4;
      disclosuresNote = 'Minor items addressed with context';
    } else {
      disclosures = 4;
      disclosuresNote = 'Items proactively disclosed';
    }
  }

  return {
    incomeStability: { score: incomeStability, note: incomeStabilityNote },
    rentAffordability: { score: rentAffordability, note: rentAffordabilityNote },
    rentalHistory: { score: rentalHistory, note: rentalHistoryNote },
    longTermIntent: { score: longTermIntent, note: longTermIntentNote },
    disclosures: { score: disclosures, note: disclosuresNote },
    overall: overallScore({
      incomeStability, rentAffordability, rentalHistory, longTermIntent, disclosures,
    }),
  };
}
