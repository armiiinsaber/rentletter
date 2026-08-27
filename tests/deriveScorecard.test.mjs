import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScorecard, deriveRentToIncomePct, withLiveScore } from '../lib/deriveScorecard.js';
import { rentAffordabilityScore, employmentStabilityScore, rentalHistoryScore, overallScore } from '../lib/scoring.js';

// A stored scorecard exactly as submit would have written it for rent 4700 on 170000 gross.
// (built with the same lib/scoring.js curves calculateScorecard uses; lib/scorecard.js itself
// imports './scoring' without an extension, which Node's ESM loader cannot resolve in a test)
const storedRatio = Math.round((4700 / Math.round(170000 / 12)) * 100);
const parts = { incomeStability: employmentStabilityScore(3), rentAffordability: rentAffordabilityScore(170000, storedRatio), rentalHistory: rentalHistoryScore({ yearsAtPrevious: 2, previousLandlordName: 'A. Patel', previousAddress: '1 Main St', referencesCount: 2 }), longTermIntent: 5, disclosures: 5 };
const stored = {
  incomeStability: { score: parts.incomeStability, note: '3+ years at same employer' },
  rentAffordability: { score: parts.rentAffordability, note: `${storedRatio}% of monthly income` },
  rentalHistory: { score: parts.rentalHistory, note: '2 years with reference available' },
  longTermIntent: { score: 5, note: 'Clear long-term reason: closer to work' },
  disclosures: { score: 5, note: 'No items to address' },
  overall: overallScore(parts),
};
const application = { annual_income: 170000, co_applicant: null, scorecard: stored, rent_to_income_ratio: 33 };

test('a. rent 4700 then rent 1000 for the same applicant: the second overall is strictly higher', () => {
  const at4700 = deriveScorecard(stored, application, { monthly_rent: 4700 });
  const at1000 = deriveScorecard(stored, application, { monthly_rent: 1000 });
  console.log(`  overall at rent 4700: ${at4700.overall}   overall at rent 1000: ${at1000.overall}`);
  assert.ok(at1000.overall > at4700.overall, `${at1000.overall} > ${at4700.overall}`);
  assert.equal(at4700.overall, stored.overall, 'unchanged rent reproduces the stored number');
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: 1000 }), 7);
  assert.match(at1000.rentAffordability.note, /^7% of monthly income$/);
});

test('b. missing monthly_rent returns the stored scorecard unchanged', () => {
  assert.equal(deriveScorecard(stored, application, {}), stored);
  assert.equal(deriveScorecard(stored, application, { monthly_rent: 0 }), stored);
  assert.equal(deriveScorecard(stored, application, null), stored);
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: null }), null);
});

test('c. missing income returns the stored scorecard unchanged', () => {
  assert.equal(deriveScorecard(stored, { annual_income: null }, { monthly_rent: 2000 }), stored);
  assert.equal(deriveScorecard(stored, { annual_income: 0, co_applicant: { annualIncome: 0 } }, { monthly_rent: 2000 }), stored);
  assert.equal(deriveRentToIncomePct({ annual_income: 'abc' }, { monthly_rent: 2000 }), null);
  assert.equal(deriveScorecard(null, application, { monthly_rent: 2000 }), null, 'no stored scorecard: nothing is invented');
});

test('d. the four application only components are byte identical to the stored ones', () => {
  const out = deriveScorecard(stored, application, { monthly_rent: 1000 });
  for (const k of ['incomeStability', 'rentalHistory', 'longTermIntent', 'disclosures']) assert.equal(JSON.stringify(out[k]), JSON.stringify(stored[k]), k);
  assert.notEqual(JSON.stringify(out.rentAffordability), JSON.stringify(stored.rentAffordability));
});

test('household income adds the co applicant, and withLiveScore keeps the stored ratio when the live one is unknown', () => {
  const dual = { annual_income: 60000, co_applicant: { annualIncome: 60000 }, scorecard: stored, rent_to_income_ratio: 40 };
  assert.equal(deriveRentToIncomePct(dual, { monthly_rent: 2000 }), 20);
  assert.match(deriveScorecard(stored, dual, { monthly_rent: 2000 }).rentAffordability.note, /combined household/);
  const row = withLiveScore({ linkId: 'l', application: dual }, { monthly_rent: null });
  assert.equal(row.application.rent_to_income_ratio, 40);
  assert.equal(row.application.scorecard, stored);
  assert.equal(withLiveScore({ linkId: 'l', application: dual }, { monthly_rent: 2000 }).application.rent_to_income_ratio, 20);
});
