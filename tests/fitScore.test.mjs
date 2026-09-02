import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFit, readVerification } from '../lib/fitScore.js';

// Fixed record for every case: a landlord reference, one reference, three years at the job.
const record = { prev_landlord_name: 'A. Patel', references: [{ name: 'R' }], years_at_job: '3', reason_for_moving: 'moving for work', disclosures: null };
const app = (income, extra = {}) => ({ ...record, annual_income: income, co_applicant: null, ...extra });
const report = ({ income = true, employer = true, nameMatch = 'match' } = {}) => ({
  analyzedAt: '2026-08-01T00:00:00Z', nameMatch, documents: [{ documentType: 'pay stub' }],
  comparisons: [{ field: 'Income', stated: '$90,000', found: '$90,000', status: income ? 'match' : 'close' }, { field: 'Employer', stated: 'X', found: 'X', status: employer ? 'match' : 'mismatch' }],
});
const fit = (income, rent, listing = {}, verification = null, extra = {}) => computeFit({ application: app(income, extra), listing: { monthly_rent: rent, ...listing }, verification });
const say = (label, f) => console.log(`  ${label}: score ${f.score} ${f.label}  A ${f.A} E ${f.E} R ${f.R}  ratio ${f.ratio}%`);

test('a. 170000 at 4700 then 1000', () => {
  const f1 = fit(170000, 4700), f2 = fit(170000, 1000); say('170000 @ 4700', f1); say('170000 @ 1000', f2);
  assert.equal(f1.A, 4.7); assert.equal(f1.score, 4.0); assert.equal(f1.label, 'stated');
  assert.equal(f2.A, 5.0); assert.equal(f2.score, 4.1); assert.equal(f2.label, 'stated');
  assert.equal(f1.model, 'fit-v2'); assert.equal(f1.R, 5.0); assert.equal(f1.E, 2.0);
});

test('b. 60000 at 2000 then 2600', () => {
  const f1 = fit(60000, 2000), f2 = fit(60000, 2600); say('60000 @ 2000', f1); say('60000 @ 2600', f2);
  assert.equal(f1.score, 3.6); assert.equal(f2.A, 2.3); assert.equal(f2.score, 2.8);
});

test('c. 90000 at 2500 stated, then income and employer matched', () => {
  const s = fit(90000, 2500), v = fit(90000, 2500, {}, report()); say('90000 @ 2500 stated', s); say('90000 @ 2500 verified', v);
  assert.equal(s.score, 4.0); assert.equal(s.label, 'stated');
  assert.equal(v.E, 5.0); assert.equal(v.score, 4.9); assert.equal(v.label, 'verified'); assert.equal(v.incomeSource, 'verified'); assert.equal(v.incomeUsed, 90000);
});

test('d. free text never enters: identical objects for different reason_for_moving and disclosures', () => {
  const x = fit(90000, 2500, {}, null, { reason_for_moving: 'moving closer to family', disclosures: 'a gap in employment while on leave' });
  const y = fit(90000, 2500, {}, null, { reason_for_moving: 'moving for work', disclosures: '' });
  assert.equal(JSON.stringify(x), JSON.stringify(y));
});

test('e. pref_min_annual_income 100000 on 90000 caps A at 2.0 with a missed criterion', () => {
  const f = fit(90000, 2500, { pref_min_annual_income: 100000 }); say('min income 100k on 90k', f);
  assert.equal(f.A, 2.0);
  const c = f.criteria.find((k) => k.key === 'pref_min_annual_income');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'Below your $100k minimum');
});

test('f. pref_requires_landlord_reference with no reference caps R at 2.0 with a missed criterion', () => {
  const f = fit(90000, 2500, { pref_requires_landlord_reference: true }, null, { prev_landlord_name: null }); say('requires landlord ref, none', f);
  assert.equal(f.R, 2.0);
  const c = f.criteria.find((k) => k.key === 'pref_requires_landlord_reference');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'No landlord reference');
});

test('g. pref_requires_employer_verification with income matched but employer not caps E at 2.0, label stated', () => {
  const f = fit(90000, 2500, { pref_requires_employer_verification: true }, report({ employer: false })); say('requires employer verification, income only', f);
  assert.equal(f.E, 2.0); assert.equal(f.label, 'stated');
  assert.equal(f.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'missed');
  const noReport = fit(90000, 2500, { pref_requires_employer_verification: true });
  assert.equal(noReport.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'unverified');
});

test('h. pref_rent_to_income_max_pct 30 on the 33% case: x 1.1, A below 4.0', () => {
  const f = fit(170000, 4700, { pref_rent_to_income_max_pct: 30 }); say('max 30% on 33%', f);
  assert.equal(f.ratio, 33); assert.equal(Math.round((f.ratio / 30) * 10) / 10, 1.1); assert.ok(f.A < 4.0, `A ${f.A}`);
  const c = f.criteria.find((k) => k.key === 'pref_rent_to_income_max_pct');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'Rent share 33% · your max 30%');
});

test('i. no rent, or income 0, returns null', () => {
  assert.equal(fit(90000, null), null); assert.equal(fit(90000, 0), null); assert.equal(fit(0, 2500), null); assert.equal(fit(null, 2500), null);
  assert.equal(computeFit({ application: app(90000), listing: null }), null);
});

test('j. a name mismatch report gives E 1.0', () => {
  const f = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' })); say('name mismatch', f);
  assert.equal(f.E, 1.0); assert.equal(f.label, 'stated');
  assert.equal(readVerification(report({ nameMatch: 'unclear' })).state, 'unclear');
});

test('the verified income figure is parsed from found; an implausible figure falls back to the stated annual', () => {
  const big = fit(90000, 2500, {}, { ...report(), comparisons: [{ field: 'Annual income', found: '$96,000', status: 'match' }] });
  assert.equal(big.incomeUsed, 96000); assert.equal(big.incomeSource, 'verified');
  const monthly = fit(90000, 2500, {}, { ...report(), comparisons: [{ field: 'Income', found: '$7,500 / month', status: 'match' }] });
  assert.equal(monthly.incomeUsed, 90000); assert.equal(monthly.incomeSource, 'verified');
  const co = fit(60000, 2000, {}, null, { co_applicant: { annualIncome: 60000 } });
  assert.equal(co.incomeUsed, 120000); assert.equal(co.ratio, 20);
});
