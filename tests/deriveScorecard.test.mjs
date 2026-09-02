import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScorecard, deriveRentToIncomePct, withLiveScore, SCORECARD_MODEL } from '../lib/deriveScorecard.js';
import { rentAffordabilityScore, employmentStabilityScore, rentalHistoryScore, overallScore } from '../lib/scoring.js';
import { calculateScorecard } from '../lib/scorecard.js';

// A STORED v1 scorecard exactly as production rows carry it: five components, five way average.
const storedRatio = Math.round((4700 / Math.round(170000 / 12)) * 100);
const parts = { incomeStability: employmentStabilityScore(3), rentAffordability: rentAffordabilityScore(170000, storedRatio), rentalHistory: rentalHistoryScore({ yearsAtPrevious: 2, previousLandlordName: 'A. Patel', previousAddress: '1 Main St', referencesCount: 2 }) };
const round1 = (n) => Math.round(n * 10) / 10;
const stored = {
  incomeStability: { score: parts.incomeStability, note: '3+ years at same employer' },
  rentAffordability: { score: parts.rentAffordability, note: `${storedRatio}% of monthly income` },
  rentalHistory: { score: parts.rentalHistory, note: '2 years with reference available' },
  longTermIntent: { score: 3, note: 'General life-stage move' },
  disclosures: { score: 3, note: 'Significant items addressed honestly' },
  overall: round1((parts.incomeStability + parts.rentAffordability + parts.rentalHistory + 3 + 3) / 5), // the v1 five way average, which v2 must never reproduce
};
const application = { annual_income: 170000, co_applicant: null, scorecard: stored, rent_to_income_ratio: 33 };
const V2_KEYS = ['incomeStability', 'rentAffordability', 'rentalHistory', 'overall', 'model'];
const base = { yearsAtJob: '3', householdAnnualIncome: 90000, householdRentToIncomeRatio: 33, hasCoApplicant: false, previousAddress: '1 Main St', yearsAtPrevious: '2', previousLandlordName: 'A. Patel', referencesCount: 2 };

test('a. reason for moving never moves the score: "closer to family" equals "for work"', () => {
  const family = calculateScorecard({ ...base, reasonForMoving: 'moving closer to family' });
  const work = calculateScorecard({ ...base, reasonForMoving: 'moving for work' });
  assert.equal(family.overall, work.overall);
  assert.deepEqual(family, work);
  assert.equal(family.model, 'scorecard-v2');
});

test('b. the "anything to address" box never moves the score: an employment gap equals an empty box', () => {
  const gap = calculateScorecard({ ...base, redFlags: 'a gap in employment while on leave' });
  const empty = calculateScorecard({ ...base, redFlags: '' });
  assert.equal(gap.overall, empty.overall);
  assert.deepEqual(gap, empty);
  assert.deepEqual(Object.keys(gap).sort(), [...V2_KEYS].sort());
});

test('c. a stored five component scorecard derives to exactly the v2 keys, overall the three component mean', () => {
  const out = deriveScorecard(stored, application, { monthly_rent: 4700 });
  assert.deepEqual(Object.keys(out).sort(), [...V2_KEYS].sort());
  assert.equal(out.model, SCORECARD_MODEL);
  assert.equal(out.overall, round1((out.incomeStability.score + out.rentAffordability.score + out.rentalHistory.score) / 3));
  assert.equal(overallScore({ incomeStability: 4, rentAffordability: 4, rentalHistory: 4, longTermIntent: 1, disclosures: 1 }), 4, 'overallScore ignores the two extra keys');
  assert.equal('longTermIntent' in out, false); assert.equal('disclosures' in out, false);
});

test('d. the reported case: 170000 income, rent 4700 then rent 1000', () => {
  const at4700 = deriveScorecard(stored, application, { monthly_rent: 4700 });
  const at1000 = deriveScorecard(stored, application, { monthly_rent: 1000 });
  console.log(`  overall at rent 4700: ${at4700.overall}   overall at rent 1000: ${at1000.overall}`);
  assert.ok(at1000.overall >= at4700.overall, `${at1000.overall} >= ${at4700.overall}`);
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: 1000 }), 7);
  assert.match(at1000.rentAffordability.note, /^7% of monthly income$/);
});

test('the two carried components are byte identical to the stored ones; the two deleted keys are absent', () => {
  const out = deriveScorecard(stored, application, { monthly_rent: 1000 });
  for (const k of ['incomeStability', 'rentalHistory']) assert.equal(JSON.stringify(out[k]), JSON.stringify(stored[k]), k);
  assert.notEqual(JSON.stringify(out.rentAffordability), JSON.stringify(stored.rentAffordability));
  assert.equal(out.longTermIntent, undefined); assert.equal(out.disclosures, undefined);
});

test('missing rent or income keeps the stored components, but still strips the deleted keys and recomputes overall from three', () => {
  for (const [app, listing] of [[application, {}], [application, { monthly_rent: 0 }], [application, null], [{ annual_income: null, scorecard: stored }, { monthly_rent: 2000 }], [{ annual_income: 0, co_applicant: { annualIncome: 0 }, scorecard: stored }, { monthly_rent: 2000 }]]) {
    const out = deriveScorecard(stored, app, listing);
    assert.deepEqual(Object.keys(out).sort(), [...V2_KEYS].sort());
    assert.equal(JSON.stringify(out.rentAffordability), JSON.stringify(stored.rentAffordability), 'stored affordability kept');
    assert.equal(out.overall, round1((stored.incomeStability.score + stored.rentAffordability.score + stored.rentalHistory.score) / 3));
    assert.notEqual(out.overall, stored.overall, 'the five way average is never shown again');
  }
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: null }), null);
  assert.equal(deriveRentToIncomePct({ annual_income: 'abc' }, { monthly_rent: 2000 }), null);
  assert.equal(deriveScorecard(null, application, { monthly_rent: 2000 }), null, 'no stored scorecard: nothing is invented');
});

test('household income adds the co applicant, and withLiveScore keeps the stored ratio when the live one is unknown', () => {
  const dual = { annual_income: 60000, co_applicant: { annualIncome: 60000 }, scorecard: stored, rent_to_income_ratio: 40 };
  assert.equal(deriveRentToIncomePct(dual, { monthly_rent: 2000 }), 20);
  assert.match(deriveScorecard(stored, dual, { monthly_rent: 2000 }).rentAffordability.note, /combined household/);
  const row = withLiveScore({ linkId: 'l', application: dual }, { monthly_rent: null });
  assert.equal(row.application.rent_to_income_ratio, 40);
  assert.equal(row.application.scorecard.model, 'scorecard-v2');
  assert.equal(withLiveScore({ linkId: 'l', application: dual }, { monthly_rent: 2000 }).application.rent_to_income_ratio, 20);
});
