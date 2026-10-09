// The rent share derived at read time from the listing's current rent. The scorecard itself is
// gone (lib/scoring.js and lib/scorecard.js were deleted); Fit is the number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRentToIncomePct, primaryAnnualIncome, withLiveScore } from '../lib/deriveScorecard.js';

const application = { annual_income: 120000, rent_to_income_ratio: 25 };

test('the live rent share follows the listing rent and the primary applicant\'s income alone', () => {
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: 4700 }), 47);
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: 1000 }), 10);
  assert.equal(deriveRentToIncomePct(application, { monthly_rent: null }), null);
  assert.equal(deriveRentToIncomePct({ annual_income: 0 }, { monthly_rent: 2000 }), null);
  // A co applicant's income is shown beside the primary's, never added (docs/fit-v2.md).
  const dual = { annual_income: 60000, co_applicant: { annualIncome: 60000 } };
  assert.equal(primaryAnnualIncome(dual), 60000);
  assert.equal(deriveRentToIncomePct(dual, { monthly_rent: 2000 }), 40);
});

test('withLiveScore sets the ratio and keeps the stored one when the live one is unknown; no scorecard is touched', () => {
  const row = withLiveScore({ linkId: 'l', application: { ...application, scorecard: null } }, { monthly_rent: null });
  assert.equal(row.application.rent_to_income_ratio, 25);
  assert.equal(withLiveScore({ linkId: 'l', application }, { monthly_rent: 2000 }).application.rent_to_income_ratio, 20);
  assert.equal('scorecard' in withLiveScore({ linkId: 'l', application }, { monthly_rent: 2000 }).application, false);
  assert.equal(withLiveScore({ linkId: 'l' }, { monthly_rent: 2000 }).linkId, 'l');
});
