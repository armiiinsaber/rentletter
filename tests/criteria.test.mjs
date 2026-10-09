// The criteria are honest and the report shows the math: a null cap reads 40, no income floor
// exists anywhere (a stored one on a listing older than db/010 is read by nothing), and the
// landlord report carries one row per rule in force plus the one Fit line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const { computeFit, capOf } = await import('../lib/fitScore.js');
const { DEFAULT_RENT_SHARE_CAP, affordabilityPayload, CAP_HELPER } = await import('../lib/listingForm.js');
const { buildSnapshot, criteriaRows, criteriaLine, FIT_LINE } = await import('../lib/reportSnapshot.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { reportText } = await import('../lib/reportText.js');
const { createListing } = await import('../lib/realtorWrites.js');

const APP = { full_name: 'Test Person', annual_income: 90000, years_at_job: '1', years_at_previous: '2', prev_landlord_name: 'A. Owner', references: [{ name: 'R' }], employer: 'Northwind Sample Clinic Inc.' };
const BASE = { monthly_rent: 2600, pref_requires_landlord_reference: true, pref_requires_employer_verification: true };
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
  assert.doesNotMatch(CAP_HELPER + FIT_LINE, /[\u2014\u2013]/);
});

test('the payload carries the cap alone: nothing derived, no floor stored, the create route defaults to 40', async () => {
  assert.deepEqual(affordabilityPayload({ pref_rent_to_income_max_pct: '40' }), { pref_rent_to_income_max_pct: 40 });
  assert.deepEqual(affordabilityPayload({ pref_rent_to_income_max_pct: 35, pref_min_annual_income: '104000' }), { pref_rent_to_income_max_pct: 35 }, 'a floor typed into an old form is dropped');
  // the create route: a listing created without a cap gets 40 in code; the column default stays 30
  const admin = fakeSupabase({ listings: [], events: [] });
  const r = await createListing({ admin, userId: 'me', invalidate: () => {} }, { address: '1 Test St', monthly_rent: 2600, pref_min_annual_income: 90000 });
  assert.equal(r.status, 200); assert.equal(r.body.listing.pref_rent_to_income_max_pct, 40); assert.equal('pref_min_annual_income' in r.body.listing, false, 'the floor is never written');
  const kept = await createListing({ admin, userId: 'me', invalidate: () => {} }, { address: '2 Test St', monthly_rent: 2600, pref_rent_to_income_max_pct: 35 });
  assert.equal(kept.body.listing.pref_rent_to_income_max_pct, 35);
});

test('a stored income floor on a listing older than db/010 is read by nothing: identical Fit, no row, no line', () => {
  const floored = { monthly_rent: 2600, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 };
  const withMin = computeFit({ application: APP, listing: floored, verification: null, confirmations: {} });
  const without = computeFit({ application: APP, listing: { monthly_rent: 2600, pref_rent_to_income_max_pct: 40 }, verification: null, confirmations: {} });
  assert.equal(JSON.stringify(withMin), JSON.stringify(without));
  assert.equal(withMin.criteria.some((c) => /min/i.test(c.key + c.label)), false, 'no floor criterion');
  assert.equal(criteriaLine(floored), 'max 40% rent share');
  assert.equal(buildSnapshot({ listing: floored, applicants: [], profile: PROFILE }).listing.criteria.minAnnualIncome, undefined);
});

test('the rows on the payload: $2,600, $90,000, 35%, with and without a stored floor', () => {
  const plain = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40 });
  assert.deepEqual(plain.rows, [
    { key: 'rentShare', status: 'met', text: 'Rent share 35% · your max 40%' },
    { key: 'landlordReference', status: 'met', text: 'Landlord reference · on file' },
    { key: 'employer', status: 'unverified', text: 'Employer · not confirmed' },
  ]);
  const withMin = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 104000 });
  assert.deepEqual(withMin.rows, plain.rows, 'a stored floor adds no row');
  const confirmed = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40 }, { employer: { at: '2026-09-06T00:00:00Z', by: 'Sarah Chen' } });
  assert.deepEqual(confirmed.rows.at(-1), { key: 'employer', status: 'met', text: 'Employer · confirmed by Sarah Chen' });
  // A stored pref_min_years_at_job (a listing older than db/009) is read by nothing: no row, no cap.
  const strict = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 30, pref_min_years_at_job: 2, pref_requires_landlord_reference: true });
  assert.deepEqual(strict.rows.slice(0, 2), [{ key: 'rentShare', status: 'missed', text: 'Rent share 35% · your max 30%' }, { key: 'landlordReference', status: 'met', text: 'Landlord reference · on file' }]);
  assert.equal(strict.fit.criteria.some((c) => /years_at_job/.test(c.key)), false);
  const documents = { analyzedAt: '2026-09-01T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'employment letter' }], comparisons: [{ field: 'Income', status: 'match', annual: 90000 }, { field: 'Employer', status: 'match', found: APP.employer }] };
  const matched = computeFit({ application: APP, listing: { ...BASE, pref_rent_to_income_max_pct: 40 }, verification: documents, confirmations: {} });
  assert.deepEqual(criteriaRows(matched, { ...BASE, pref_rent_to_income_max_pct: 40 }, {}, 'Sarah Chen').at(-1), { key: 'employer', status: 'met', text: 'Employer · matched on documents' });
  assert.equal(plain.payload.listing.fitLine, FIT_LINE);
  assert.equal(FIT_LINE, 'Fit out of 5, over what was assessed: ability to pay this rent now, how far each fact is confirmed, and what a previous landlord reported. What is missing is left out, never counted against.');
  for (const r of [...plain.rows, ...withMin.rows]) assert.doesNotMatch(r.text, /[\u2014\u2013]/);
});

test('the PDF lines and the text report carry the rows and the one line', () => {
  const { payload } = rowsFor({ ...BASE, pref_rent_to_income_max_pct: 40 });
  const lines = reportLines(payload);
  assert.deepEqual(lines.blocks[0].criteria, [['met', 'Rent share 35% · your max 40%'], ['met', 'Landlord reference · on file'], ['unverified', 'Employer · not confirmed']]);
  assert.equal(lines.footer.fitLine, FIT_LINE);
  assert.match(lines.footer.criteria, /criteria: max 40% rent share · landlord reference · employer verification\./);
  const text = reportText(payload, { pageUrl: 'https://rentletter.ca/r/t' });
  assert.match(text, /\n   ✓ Rent share 35% · your max 40%\n   ✓ Landlord reference · on file\n     Employer · not confirmed\n/);
  assert.match(text, new RegExp(FIT_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(text, /[\u2014\u2013]/);
});
