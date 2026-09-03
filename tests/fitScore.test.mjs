import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFit, readVerification, parseYears, compareFit, fitReason } from '../lib/fitScore.js';

// Fixed record for the audit cases: a landlord reference the realtor has CALLED (confirmations.landlord),
// four years at the previous address, one reference, three years at the job. R = 1.5 + 1.1 + 1.5 + 0.4 = 4.5.
const record = { prev_landlord_name: 'A. Patel', years_at_previous: '4', references: [{ name: 'R' }], years_at_job: '3', reason_for_moving: 'moving for work', disclosures: null };
const app = (income, extra = {}) => ({ ...record, annual_income: income, co_applicant: null, ...extra });
const report = ({ income = true, employer = true, nameMatch = 'match' } = {}) => ({
  analyzedAt: '2026-08-01T00:00:00Z', nameMatch, documents: [{ documentType: 'pay stub' }],
  comparisons: [{ field: 'Income', stated: '$90,000', found: '$90,000', status: income ? 'match' : 'close' }, { field: 'Employer', stated: 'X', found: 'X', status: employer ? 'match' : 'mismatch' }],
});
const CALLED = { landlord: { at: '2026-09-02T14:00:00Z', by: 'Armin' } };
const fit = (income, rent, listing = {}, verification = null, extra = {}, confirmations = CALLED) => computeFit({ application: app(income, extra), listing: { monthly_rent: rent, ...listing }, verification, confirmations });
const say = (label, f, old) => console.log(`  ${label}: score ${f.score} (exact ${f.scoreExact.toFixed(3)}) ${f.label}  A ${f.A} E ${f.E} R ${f.R}  ratio ${f.ratio}%${old ? `   [was ${old}]` : ''}`);

test('a. 170000 at 4700 then 1000 (was 4.0 stated and 4.1 stated, R 5.0)', () => {
  const f1 = fit(170000, 4700), f2 = fit(170000, 1000); say('170000 @ 4700', f1, '4.0 stated, R 5.0'); say('170000 @ 1000', f2, '4.1 stated, R 5.0');
  assert.equal(f1.A, 4.7); assert.equal(f1.score, 3.9); assert.equal(f1.label, 'stated');
  assert.equal(f2.A, 5.0); assert.equal(f2.score, 4.0); assert.equal(f2.label, 'stated');
  assert.equal(f1.model, 'fit-v2'); assert.equal(f1.R, 4.5); assert.equal(f1.E, 2.0);
});

test('b. 60000 at 2000 then 2600 (was 3.6 and 2.8)', () => {
  const f1 = fit(60000, 2000), f2 = fit(60000, 2600); say('60000 @ 2000', f1, '3.6'); say('60000 @ 2600', f2, '2.8');
  assert.equal(f1.score, 3.5); assert.equal(f2.A, 2.3); assert.equal(f2.score, 2.7);
});

test('c. 90000 at 2500 stated, then income and employer matched (was 4.0 stated and 4.9 docs match)', () => {
  const s = fit(90000, 2500), v = fit(90000, 2500, {}, report()); say('90000 @ 2500 stated', s, '4.0'); say('90000 @ 2500 matched', v, '4.9');
  assert.equal(s.score, 3.9); assert.equal(s.label, 'stated');
  assert.equal(v.E, 5.0); assert.equal(v.score, 4.8); assert.equal(v.label, 'docs match', 'documents matching is not verification'); assert.equal(v.incomeSource, 'verified'); assert.equal(v.incomeUsed, 90000);
});

test('d. free text never enters: identical objects for different reason_for_moving and disclosures', () => {
  const x = fit(90000, 2500, {}, null, { reason_for_moving: 'moving closer to family', disclosures: 'a gap in employment while on leave' });
  const y = fit(90000, 2500, {}, null, { reason_for_moving: 'moving for work', disclosures: '' });
  assert.equal(JSON.stringify(x), JSON.stringify(y));
});

test('e. pref_min_annual_income 100000 on 90000 caps A at 2.0 with a missed criterion (was 2.6)', () => {
  const f = fit(90000, 2500, { pref_min_annual_income: 100000 }); say('min income 100k on 90k', f, '2.6');
  assert.equal(f.A, 2.0); assert.equal(f.score, 2.5);
  const c = f.criteria.find((k) => k.key === 'pref_min_annual_income');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'Below your $100k minimum');
});

test('f. pref_requires_landlord_reference with no reference caps R at 2.0 with a missed criterion (was 3.4)', () => {
  const f = fit(90000, 2500, { pref_requires_landlord_reference: true }, null, { prev_landlord_name: null }); say('requires landlord ref, none', f, '3.4');
  assert.equal(f.R, 2.0); assert.equal(f.score, 3.4);
  const c = f.criteria.find((k) => k.key === 'pref_requires_landlord_reference');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'No landlord reference');
});

test('g. pref_requires_employer_verification with income matched but employer not caps E at 2.0, label check docs (was 4.0 stated)', () => {
  const f = fit(90000, 2500, { pref_requires_employer_verification: true }, report({ employer: false })); say('requires employer verification, income only', f, '4.0 stated');
  assert.equal(f.E, 2.0); assert.equal(f.label, 'check docs', 'the employer on the documents differs');
  assert.equal(f.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'missed');
  const noReport = fit(90000, 2500, { pref_requires_employer_verification: true });
  assert.equal(noReport.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'unverified');
});

test('h. pref_rent_to_income_max_pct 30 on the 33% case: x 1.1, A below 4.0 (was 3.3)', () => {
  const f = fit(170000, 4700, { pref_rent_to_income_max_pct: 30 }); say('max 30% on 33%', f, '3.3');
  assert.equal(f.ratio, 33); assert.equal(Math.round((f.ratio / 30) * 10) / 10, 1.1); assert.ok(f.A < 4.0, `A ${f.A}`); assert.equal(f.score, 3.2);
  const c = f.criteria.find((k) => k.key === 'pref_rent_to_income_max_pct');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, 'Rent share 33% · your max 30%');
});

test('i. no rent, or income 0, returns null', () => {
  assert.equal(fit(90000, null), null); assert.equal(fit(90000, 0), null); assert.equal(fit(0, 2500), null); assert.equal(fit(null, 2500), null);
  assert.equal(computeFit({ application: app(90000), listing: null }), null);
});

test('j. a name mismatch report gives E 1.0 and the label check docs (was 3.7 stated)', () => {
  const f = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' })); say('name mismatch', f, '3.7 stated');
  assert.equal(f.E, 1.0); assert.equal(f.label, 'check docs'); assert.equal(f.score, 3.6);
  assert.equal(readVerification(report({ nameMatch: 'unclear' })).state, 'unclear');
});

test('confirmations: a stated landlord only, case a (was 3.9 stated, R 4.5)', () => {
  const f = fit(170000, 4700, {}, null, {}, {}); say('170000 @ 4700, landlord name only', f, '3.9, R 4.5');
  assert.equal(f.R, 4.4); assert.equal(f.score, 3.8); assert.equal(f.label, 'stated');
});

test('confirmations: employer confirmed with no documents gives E 5.0 and the label verified (was 4.9)', () => {
  const f = fit(90000, 2500, {}, null, {}, { ...CALLED, employer: { at: '2026-09-02T14:00:00Z', by: 'Armin' } }); say('employer confirmed, no docs', f, '4.9');
  assert.equal(f.E, 5.0); assert.equal(f.label, 'verified'); assert.equal(f.score, 4.8);
  assert.equal(f.confirmations.employer.by, 'Armin');
  const req = fit(90000, 2500, { pref_requires_employer_verification: true }, null, {}, { employer: { at: 'x', by: 'Armin' } });
  assert.equal(req.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'met');
});

test('confirmations: id confirmed on a name mismatch report lifts E from 1.0 to the documents (was 3.7 and 4.9)', () => {
  const without = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' }));
  const withId = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' }), {}, { ...CALLED, id: { at: 'x', by: 'Armin' } });
  say('mismatch, no id', without, '3.7 stated'); say('mismatch, id confirmed', withId, '4.9');
  assert.equal(without.E, 1.0); assert.equal(withId.E, 5.0); assert.equal(withId.label, 'docs match');
});

test('the label is docs match, not verified, when only the documents matched (was 4.9)', () => {
  const f = fit(90000, 2500, {}, report()); say('docs matched, nothing confirmed', f, '4.9');
  assert.equal(f.label, 'docs match'); assert.equal(f.E, 5.0);
  assert.equal(fit(90000, 2500, {}, report({ employer: false })).label, 'check docs', 'the employer differs on the documents');
  assert.equal(fit(90000, 2500).label, 'stated');
});

// Record, continuous. Rent 1000 on 60000 (A saturated at 5.0), no documents, no pref, no confirmations.
const rec = (yearsJob, yearsPrev, refs, extra = {}, verification = null, listing = {}, confirmations = {}) => computeFit({
  application: { annual_income: 60000, co_applicant: null, years_at_job: yearsJob, years_at_previous: yearsPrev, prev_landlord_name: 'L. Wong', references: Array.from({ length: refs }, () => ({ name: 'r' })), ...extra },
  listing: { monthly_rent: 1000, ...listing }, verification, confirmations,
});

test('R. a, b, c, d: continuous record orders c > b > a > d on scoreExact', () => {
  const a = rec('2', '1', 0), b = rec('1', '3.3', 0), c = rec('5', '4.3', 0), d = rec('1', '3.3', 0, {}, report({ nameMatch: 'mismatch' }));
  say('a. 2 yrs job, 1 yr previous', a); say('b. 1 yr job, 3.3 yrs previous', b); say('c. 5 yrs job, 4.3 yrs previous', c); say('d. b with a name mismatch report', d);
  assert.deepEqual([a.score, b.score, c.score, d.score], [3.8, 3.8, 3.9, 3.5]);
  assert.ok(c.scoreExact > b.scoreExact && b.scoreExact > a.scoreExact && a.scoreExact > d.scoreExact, `${c.scoreExact} ${b.scoreExact} ${a.scoreExact} ${d.scoreExact}`);
  assert.equal(a.R, 3.3); assert.equal(b.R, 3.4); assert.equal(c.R, 4.2); assert.equal(d.label, 'check docs');
  assert.deepEqual(a.parts, { tenure: 0.9, tenancy: 0.9, refs: 0, landlordRef: true, yearsAtJob: 2, yearsAtPrevious: 1, refCount: 0 });
});

test('R. e: "3 years" and "3+" parse to 3, "three" parses to 0', () => {
  assert.equal(parseYears('3 years'), 3); assert.equal(parseYears('3+'), 3); assert.equal(parseYears('three'), 0); assert.equal(parseYears(null), 0); assert.equal(parseYears('1.5'), 1.5);
  assert.equal(rec('3 years', '1', 0).scoreExact, rec('3', '1', 0).scoreExact);
  assert.equal(rec('3+', '1', 0).scoreExact, rec('3', '1', 0).scoreExact);
  assert.equal(rec('three', '1', 0).parts.tenure, 0);
});

test('R. f: pref_min_years_at_job 2 on 1 year caps R at 3.0 with a missed criterion', () => {
  const f = rec('1', '4', 2, {}, null, { pref_min_years_at_job: 2 }); say('min 2 yrs on 1 yr, 4 yrs previous, 2 refs', f);
  assert.equal(f.R, 3.0);
  const c = f.criteria.find((k) => k.key === 'pref_min_years_at_job');
  assert.equal(c.status, 'missed'); assert.equal(c.detail, '1 yrs at employer · your min 2');
  assert.equal(rec('2', '4', 2, {}, null, { pref_min_years_at_job: 2 }).R, 4.6);
});

test('R. g: confirmations.landlord adds 0.3 and confirmations.reference adds 0.2', () => {
  const base = rec('2', '1', 0), landlord = rec('2', '1', 0, {}, null, {}, { landlord: { at: 'x', by: 'A' } }), reference = rec('2', '1', 0, {}, null, {}, { reference: { at: 'x', by: 'A' } });
  say('base', base); say('landlord called', landlord); say('reference called', reference);
  assert.equal(landlord.R, 3.6); assert.equal(reference.R, 3.5); assert.ok(landlord.scoreExact > base.scoreExact && reference.scoreExact > base.scoreExact);
  // the tenancy term is capped at 1.5: 4 years plus the call is 1.7 before the cap
  assert.equal(rec('2', '4', 0, {}, null, {}, { landlord: { at: 'x', by: 'A' } }).parts.tenancy, 1.5);
});

test('R. h: labels. income mismatch is check docs, with or without ID seen; name mismatch only with ID seen is docs match', () => {
  const incomeOff = rec('2', '1', 0, {}, report({ income: false }));
  const incomeOffId = rec('2', '1', 0, {}, report({ income: false }), {}, { id: { at: 'x', by: 'A' } });
  const nameOffId = rec('2', '1', 0, {}, report({ nameMatch: 'mismatch' }), {}, { id: { at: 'x', by: 'A' } });
  say('income did not match', incomeOff); say('income did not match, id seen', incomeOffId); say('name mismatch only, id seen', nameOffId);
  assert.equal(incomeOff.label, 'check docs'); assert.equal(incomeOffId.label, 'check docs'); assert.equal(nameOffId.label, 'docs match');
  const nothingCompared = rec('2', '1', 0, {}, { analyzedAt: 'x', nameMatch: 'match', documents: [{ documentType: 'government ID' }], comparisons: [] });
  assert.equal(nothingCompared.label, 'stated', 'a report that compared nothing leaves the number on stated facts');
});

test('R. i: the audit relationships hold on the new numbers', () => {
  const a1 = fit(170000, 4700), a2 = fit(170000, 1000), b1 = fit(60000, 2000), b2 = fit(60000, 2600), c1 = fit(90000, 2500), c2 = fit(90000, 2500, {}, report());
  console.log(`  4700 vs 1000: ${a1.score} vs ${a2.score} (exact gap ${(a2.scoreExact - a1.scoreExact).toFixed(3)})  2000 vs 2600: ${b1.score} vs ${b2.score} (gap ${(b1.scoreExact - b2.scoreExact).toFixed(3)})  stated vs matched: ${c1.score} vs ${c2.score} (gap ${(c2.scoreExact - c1.scoreExact).toFixed(3)})`);
  assert.ok(Math.abs(a2.score - a1.score) <= 0.1 + 1e-9, 'rent 4700 and 1000 on 170000 within 0.1');
  assert.ok(b1.scoreExact - b2.scoreExact >= 0.7, '2000 and 2600 on 60000 at least 0.7 apart');
  assert.ok(c2.scoreExact - c1.scoreExact >= 0.8, 'matched at least 0.8 above stated');
});

test('compareFit: scoreExact descending, no Fit last, ties by created_at ascending', () => {
  const row = (score, created, exact = score) => ({ application: { created_at: created, fit: score == null ? null : { score, scoreExact: exact } } });
  const list = [row(3.8, '2026-08-03', 3.76), row(null, '2026-08-01'), row(3.8, '2026-08-02', 3.786), row(3.9, '2026-08-05', 3.94), row(3.8, '2026-08-04', 3.76)];
  const order = [...list].sort(compareFit).map((r) => r.application.created_at);
  assert.deepEqual(order, ['2026-08-05', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-01']);
});

test('fitReason: at most eight words from record facts, omitted within 0.02, never the income level', () => {
  const upper = rec('5', '4.3', 2), lower = rec('2', '1', 0);
  const line = fitReason(lower, upper); console.log(`  reason under the lower: "${line}"`);
  assert.equal(line, 'Fewer references · shorter tenancy', 'the two facts with the largest weight in the gap');
  assert.ok(line.split(/\s+/).length <= 8);
  assert.equal(fitReason(rec('1', '3.3', 0, { prev_landlord_name: null, prev_address: '1 Main' }), rec('1', '3.3', 0)), 'No landlord reference');
  assert.equal(fitReason(rec('2', '1', 0, {}, report({ nameMatch: 'mismatch' })), rec('2', '1', 0)), 'Documents not matched');
  assert.equal(fitReason(rec('2', '1', 0), rec('2', '1', 2)), 'Fewer references');
  assert.equal(fitReason(computeFit({ application: { annual_income: 60000, years_at_job: '2', years_at_previous: '1', prev_landlord_name: 'L', references: [] }, listing: { monthly_rent: 2200 } }), rec('2', '1', 0)), 'Higher rent share');
  assert.equal(fitReason(rec('2', '1', 0), rec('2', '1', 0)), null);
  assert.equal(fitReason(rec('2', '1', 0), { ...rec('2', '1', 0), scoreExact: rec('2', '1', 0).scoreExact + 0.01 }), null);
  for (const r of ['Fewer references · shorter tenancy', 'No landlord reference', 'Documents not matched', 'Fewer references', 'Higher rent share']) assert.ok(!/income|\$/.test(r));
});
