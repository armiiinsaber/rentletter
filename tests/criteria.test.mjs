// The criteria are honest and the report shows the math: a null cap reads 40, the derived minimum
// is information only, a stored minimum that restates the cap is ignored, and the landlord report
// carries one row per rule in force plus the one Fit line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const { computeFit, capOf, effectiveMinIncome } = await import('../lib/fitScore.js');
const { DEFAULT_RENT_SHARE_CAP, derivedMinIncome, sameAsCap, derivedLine, affordabilityPayload, CAP_HELPER, SAME_AS_CAP_NOTE } = await import('../lib/listingForm.js');
const { buildSnapshot, criteriaRows, criteriaLine, FIT_LINE } = await import('../lib/reportSnapshot.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { reportText } = await import('../lib/reportText.js');
const { createListing } = await import('../lib/realtorWrites.js');

const APP = { full_name: 'Test Person', annual_income: 90000, years_at_job: '1', years_at_previous: '2', prev_landlord_name: 'A. Owner', references: [{ name: 'R' }], employer: 'Northwind Sample Clinic Inc.' };
const BASE = { monthly_rent: 2600, pref_min_years_at_job: 1, pref_requires_landlord_reference: true, pref_requires_employer_verification: true };
const PROFILE = { id: 'P1', full_name: 'Sarah Chen', brokerage: 'Demo Realty' };
const rowsFor = (listing, confirmations = {}) => {
  const fit = computeFit({ application: APP, listing, verification: null, confirmations });
  const payload = buildSnapshot({ listing, applicants: [{ linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations, application: { ...APP, id: 'A1', fit } }], profile: PROFILE });
  return { fit, payload, rows: payload.applicants[0].criteria };
};

test('the null cap reads 40: Fit, the report footer, the snapshot and the helpers', () => {
  assert.equal(DEFAULT_RENT_SHARE_CAP, 40);
  assert.equal(capOf({ monthly_rent: 2600 }), 40); assert.equal(capOf({ pref_rent_to_income_max_pct: null }), 40); assert.equal(capOf({ pref_rent_to_income_max_pct: 35 }), 35);
  const fit = computeFit({ application: APP, listing: { monthly_rent: 2600 }, verification: null, confirmations: {} });
  const share = fit.criteria.find((c) => c.key === 'pref_rent_to_income_max_pct');
  assert.deepEqual([share.rule, share.value, share.status], [40, 35, 'met']);
  assert.match(criteriaLine({ monthly_rent: 2600 }), /^max 40% rent share/);
  assert.equal(buildSnapshot({ listing: { monthly_rent: 2600 }, applicants: [], profile: PROFILE }).listing.criteria.maxRentSharePct, 40);
  assert.doesNotMatch(CAP_HELPER + SAME_AS_CAP_NOTE + FIT_LINE, /[—–]/);
});

test('the derived minimum is information only: not stored unless typed, the same as cap note within 2%', async () => {
  assert.equal(derivedMinIncome(2600, 40), 78000); assert.equal(derivedMinIncome(2600, 30), 104000); assert.equal(derivedMinIncome(0, 40), null);
  assert.equal(derivedLine(40, 2600), 'At 40% and $2,600, that is about $78,000 a year.');
  assert.deepEqual(affordabilityPayload({ pref_rent_to_income_max_pct: '40', pref_min_annual_income: '' }), { pref_rent_to_income_max_pct: 40, pref_min_annual_income: null }, 'nothing derived, nothing stored');
  assert.deepEqual(affordabilityPayload({ pref_rent_to_income_max_pct: 40, pref_min_annual_income: '104000' }), { pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 }, 'a typed minimum is stored');
  assert.deepEqual(affordabilityPayload({ pref_rent_to_income_max_pct: 40, pref_min_annual_income: '78000' }), { pref_rent_to_income_max_pct: 40, pref_min_annual_income: 78000 }, 'stored even when it equals the cap, if they insist');
  assert.equal(sameAsCap(78000, 78000), true); assert.equal(sameAsCap(79000, 78000), true, 'within 2%'); assert.equal(sameAsCap(80000, 78000), false); assert.equal(sameAsCap(null, 78000), false);
  // the create route: a listing created without a cap gets 40 in code; the column default stays 30
  const admin = fakeSupabase({ listings: [], events: [] });
  const r = await createListing({ admin, userId: 'me', invalidate: () => {} }, { address: '1 Test St', monthly_rent: 2600 });
  assert.equal(r.status, 200); assert.equal(r.body.listing.pref_rent_to_income_max_pct, 40); assert.equal(r.body.listing.pref_min_annual_income, undefined);
  const kept = await createListing({ admin, userId: 'me', invalidate: () => {} }, { address: '2 Test St', monthly_rent: 2600, pref_rent_to_income_max_pct: 35 });
  assert.equal(kept.body.listing.pref_rent_to_income_max_pct, 35);
});

test('a stored minimum equal to rent × 12 / cap within 2% is no minimum: $2,600 at 30% with $104,000', () => {
  const restated = { monthly_rent: 2600, pref_rent_to_income_max_pct: 30, pref_min_annual_income: 104000 };
  assert.equal(effectiveMinIncome(restated), 0);
  assert.equal(effectiveMinIncome({ ...restated, pref_min_annual_income: 106000 }), 0, '1.9% off still restates the cap');
  assert.equal(effectiveMinIncome({ ...restated, pref_min_annual_income: 110000 }), 110000, '5.8% off is its own rule');
  assert.equal(effectiveMinIncome({ monthly_rent: 2600, pref_min_annual_income: 78000 }), 0, 'a null cap reads 40, so 78,000 restates it');
  const withMin = computeFit({ application: APP, listing: restated, verification: null, confirmations: {} });
  const without = computeFit({ application: APP, listing: { ...restated, pref_min_annual_income: null }, verification: null, confirmations: {} });
  assert.equal(withMin.score, without.score); assert.equal(withMin.A, without.A); assert.equal(withMin.evidence.incomeCapped, false);
  assert.equal(withMin.criteria.some((c) => c.key === 'pref_min_annual_income'), false, 'no second criterion');
  assert.equal(criteriaLine(restated), 'max 30% rent share');
  const real = computeFit({ application: APP, listing: { monthly_rent: 2600, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 }, verification: null, confirmations: {} });
  assert.equal(real.A, 2.0); assert.equal(real.evidence.incomeCapped, true, 'at 40% the same $104,000 is a real second rule');
});

test('the rows on the payload: $2,600, $90,000, 35%, with and without the $104,000 minimum', () => {
  const plain = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40 });
  assert.deepEqual(plain.rows, [
    { key: 'rentShare', status: 'met', text: 'Rent share 35% · your max 40%' },
    { key: 'tenure', status: 'met', text: 'At job 1 yr · your min 1 yr' },
    { key: 'landlordReference', status: 'met', text: 'Landlord reference · on file' },
    { key: 'employer', status: 'unverified', text: 'Employer · not verified' },
  ]);
  const withMin = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 });
  assert.deepEqual(withMin.rows[1], { key: 'minIncome', status: 'missed', text: 'Income $90,000 · your min $104,000' });
  assert.equal(withMin.rows.length, 5);
  const confirmed = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40 }, { employer: { at: '2026-09-06T00:00:00Z', by: 'Sarah Chen' } });
  assert.deepEqual(confirmed.rows.at(-1), { key: 'employer', status: 'met', text: 'Employer · confirmed by Sarah Chen' });
  const strict = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 30, pref_min_years_at_job: 2, pref_requires_landlord_reference: true });
  assert.deepEqual(strict.rows.slice(0, 2), [{ key: 'rentShare', status: 'missed', text: 'Rent share 35% · your max 30%' }, { key: 'tenure', status: 'missed', text: 'At job 1 yr · your min 2 yrs' }]);
  const documents = { analyzedAt: '2026-09-01T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'employment letter' }], comparisons: [{ field: 'Income', status: 'match', annual: 90000 }, { field: 'Employer', status: 'match', found: APP.employer }] };
  const matched = computeFit({ application: APP, listing: { ...BASE, pref_rent_to_income_max_pct: 40 }, verification: documents, confirmations: {} });
  assert.deepEqual(criteriaRows(matched, { ...BASE, pref_rent_to_income_max_pct: 40 }, {}, 'Sarah Chen').at(-1), { key: 'employer', status: 'met', text: 'Employer · matched on documents' });
  assert.equal(plain.payload.listing.fitLine, FIT_LINE);
  assert.equal(FIT_LINE, 'Fit out of 5: half is affordability against this rent and your criteria, a third is what was verified, a fifth is tenure and references.');
  for (const r of [...plain.rows, ...withMin.rows]) assert.doesNotMatch(r.text, /[—–]/);
});

test('the PDF lines and the text report carry the rows and the one line', () => {
  const { payload } = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 });
  const lines = reportLines(payload);
  assert.deepEqual(lines.blocks[0].criteria, [['met', 'Rent share 35% · your max 40%'], ['missed', 'Income $90,000 · your min $104,000'], ['met', 'At job 1 yr · your min 1 yr'], ['met', 'Landlord reference · on file'], ['unverified', 'Employer · not verified']]);
  assert.equal(lines.footer.fitLine, FIT_LINE);
  assert.match(lines.footer.criteria, /min \$104k · max 40% rent share/);
  const text = reportText(payload, { pageUrl: 'https://rentletter.ca/r/t' });
  assert.match(text, /\n   ✓ Rent share 35% · your max 40%\n   • Income \$90,000 · your min \$104,000\n   ✓ At job 1 yr · your min 1 yr\n   ✓ Landlord reference · on file\n     Employer · not verified\n/);
  assert.match(text, new RegExp(FIT_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(text, /[—–]/);
});
