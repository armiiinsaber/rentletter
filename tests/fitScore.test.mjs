// Fit v2 (lib/fitScore.js, docs/fit-v2.md): the three pillars, the label rule, the criteria rows,
// the sort order and the reason line. The exclusion, recency, guardrail, flag and frozen snapshot
// proofs are in tests/fitV2.test.mjs; the forbidden inputs scan in tests/fitForbidden.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFit, readVerification, parseYears, compareFit, fitReason, fitLine, recencyWeight, PILLAR_WEIGHT } from '../lib/fitScore.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
// Fixed record: a previous landlord named, four years at the previous address (a dated Conduct
// fact, stated at the application's date), one reference. Three years at the job: read by nothing.
const record = { prev_landlord_name: 'A. Patel', years_at_previous: '4', references: [{ name: 'R' }], years_at_job: '3', created_at: '2026-09-01T00:00:00Z', reason_for_moving: 'moving for work', disclosures: null };
const app = (income, extra = {}) => ({ ...record, annual_income: income, co_applicant: null, ...extra });
const report = ({ income = true, employer = true, nameMatch = 'match', analyzedAt = '2026-08-01T00:00:00Z' } = {}) => ({
  analyzedAt, nameMatch, documents: [{ documentType: 'pay stub' }],
  comparisons: [{ field: 'Income', stated: '$90,000', found: '$90,000', status: income ? 'match' : 'mismatch' }, { field: 'Employer', stated: 'Acme Ltd', found: employer ? 'Acme' : 'Other Corp', status: employer ? 'match' : 'mismatch' }],
});
const fit = (income, rent, listing = {}, verification = null, extra = {}, confirmations = {}) => computeFit({ application: app(income, { employer: 'Acme Ltd', ...extra }), listing: { monthly_rent: rent, ...listing }, verification, confirmations, now: NOW });
const pillar = (f, name) => f.pillars.find((p) => p.name === name);
const say = (label, f) => console.log(`  ${label}: ${fitLine(f)} ${f.label}  Ability ${f.A} Truth ${f.E} Conduct ${f.R}  ratio ${f.ratio}%  basis "${f.basis}"`);

test('Ability: the rent share curve on the primary income, scored over the pillars present', () => {
  const f1 = fit(170000, 4700), f2 = fit(170000, 1000), f3 = fit(60000, 2000), f4 = fit(60000, 2600);
  say('170000 @ 4700', f1); say('170000 @ 1000', f2); say('60000 @ 2000', f3); say('60000 @ 2600', f4);
  assert.equal(f1.ratio, 33); assert.equal(f1.A, 4.7); assert.equal(f2.A, 5.0); assert.equal(f3.A, 4.0); assert.equal(f4.A, 2.3);
  assert.equal(f1.model, 'fit-v2'); assert.equal(f1.of, 3); assert.equal(f1.assessed, 3, 'Truth is assessed at its lowest level, stated');
  assert.deepEqual(f1.notAssessed, []); assert.equal(f1.E, 2.0); assert.equal(f1.R, 4.5, 'four years at the previous address, stated last month');
  // the weighted mean over the three pillars
  assert.equal(f1.scoreExact, ((PILLAR_WEIGHT.ability * 4.7 + PILLAR_WEIGHT.truth * 2) + PILLAR_WEIGHT.conduct * 4.5) / ((PILLAR_WEIGHT.ability + PILLAR_WEIGHT.truth) + PILLAR_WEIGHT.conduct));
  assert.deepEqual([f1.score, f2.score, f3.score, f4.score], [3.9, 4.0, 3.5, 2.7]);
  assert.equal(fitLine(f1), 'Fit 3.9 on 3 of 3'); assert.equal(f1.basis, 'Stated income. Tenancy of 4 years stated.');
  assert.equal(f1.notAssessedLine, null);
});

test('Ability: absolute income beyond this rent never enters, and nobody else\'s income does', () => {
  const a = fit(170000, 1000), b = fit(900000, 1000);
  assert.equal(a.A, b.A); assert.equal(a.scoreExact, b.scoreExact);
  const solo = fit(90000, 2500), joint = fit(90000, 2500, {}, null, { co_applicant: { name: 'Partner', annualIncome: 80000 } });
  assert.equal(JSON.stringify(joint), JSON.stringify(solo), 'the old co_applicant jsonb changes nothing');
  assert.equal(solo.incomeUsed, 90000); assert.equal('incomeJoint' in solo, false, 'no joint figure exists on the number');
});

test('Truth: stated alone reads 2.0 and is assessed; documents read 4.0 and docs match; the realtor\'s confirmation reads 5.0 and verified', () => {
  const s = fit(90000, 2500), d = fit(90000, 2500, {}, report()), c = fit(90000, 2500, {}, null, {}, { employer: { at: '2026-09-20T00:00:00Z', by: 'Armin' } });
  say('stated', s); say('documents matched', d); say('employer confirmed, no documents', c);
  assert.equal(pillar(s, 'truth').assessed, true); assert.equal(s.E, 2.0); assert.equal(s.label, 'stated');
  assert.equal(d.E, 4.0); assert.equal(d.label, 'docs match', 'documents matching is not verification'); assert.equal(d.incomeSource, 'verified'); assert.equal(d.incomeUsed, 90000);
  assert.equal(d.assessed, 3); assert.equal(d.score, 4.5); assert.equal(d.basis, 'Current income matches documents. Tenancy of 4 years stated.');
  assert.equal(c.E, 5.0); assert.equal(c.label, 'verified'); assert.equal(c.score, 4.8); assert.equal(c.basis, 'Current income confirmed. Tenancy of 4 years stated.');
  assert.equal(c.confirmations.employer.by, 'Armin');
  assert.deepEqual(pillar(d, 'truth').facts.map((f) => [f.text, f.date, f.weight]), [['Income matches documents', 'Aug 2026', 1], ['Employer matches documents', 'Aug 2026', 1], ['Identity matches documents', 'Aug 2026', 1]]);
});

test('Truth: a contradiction reads check docs and the documents confirm nothing; ID confirmed by the realtor passes the name gate', () => {
  const name = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' }));
  const income = fit(90000, 2500, {}, report({ income: false }));
  const employer = fit(90000, 2500, {}, report({ employer: false }));
  say('name mismatch', name); say('income mismatch', income); say('employer mismatch', employer);
  for (const f of [name, income, employer]) assert.equal(f.label, 'check docs');
  assert.equal(name.E, 2.0, 'the documents confirm nothing: Truth stays at stated'); assert.equal(name.score, fit(90000, 2500).score, 'the number is the stated one, nothing subtracted');
  assert.deepEqual(name.flags.map((x) => x.key), ['identity']); assert.deepEqual(income.flags.map((x) => x.key), ['income_mismatch']); assert.deepEqual(employer.flags.map((x) => x.key), ['employer_mismatch']);
  const withId = fit(90000, 2500, {}, report({ nameMatch: 'mismatch' }), {}, { id: { at: '2026-09-21T00:00:00Z', by: 'Armin' } });
  assert.equal(withId.label, 'docs match'); assert.equal(withId.E, 4.3, 'income 4 twice, employer 4, identity 5');
  assert.equal(readVerification(report({ nameMatch: 'unclear' })).state, 'unclear');
  // close is not check docs: within 15% the label stays docs match, the number rests on the stated income
  const closeReport = { ...report(), comparisons: [{ field: 'Income', stated: '$85,000', found: '$90,000 a year on the letter', annual: 90000, status: 'close' }, { field: 'Employer', stated: 'X', found: 'X', status: 'match' }] };
  const close = fit(85000, 2500, {}, closeReport);
  assert.equal(close.label, 'docs match'); assert.equal(close.incomeSource, 'stated'); assert.equal(close.evidence.contradicted, false);
  const nothing = fit(90000, 2500, {}, { analyzedAt: '2026-09-01T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'government ID' }], comparisons: [] });
  assert.equal(nothing.label, 'stated', 'a report that compared nothing leaves the label on stated facts');
  assert.equal(nothing.E, 2.5, 'the identity on the document is one docs level fact beside the stated ones');
});

test('Conduct: the previous landlord\'s outcome by month, the calls, the stated tenancy; nothing from the job', () => {
  const ref = { at: '2026-09-20T00:00:00Z', by: 'reference', rentOnTime: 'always', damage: 'none', again: 'yes', from: { m: 1, y: 2026 }, to: { m: 9, y: 2026 } };
  const good = fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null }, { landlord_reference: ref });
  const late = fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null }, { landlord_reference: { ...ref, rentOnTime: 'often_late', damage: 'significant', again: 'no' } });
  const called = fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null }, { landlord: { at: '2026-09-20T00:00:00Z', by: 'You' } });
  const none = fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null });
  say('rent always on time, 8 months', good); say('often late', late); say('landlord called', called); say('no history', none);
  assert.equal(good.R, 5.0); assert.equal(late.R, 1.6); assert.equal(called.R, 4.0); assert.equal(pillar(none, 'conduct').assessed, false);
  assert.equal(good.basis, 'Stated income. Rent paid on time, last 8 months.'); assert.equal(called.basis, 'Stated income. Previous landlord called.');
  assert.ok(pillar(good, 'conduct').facts.every((f) => f.date), 'every Conduct fact carries a date');
  assert.equal(fit(90000, 2500, {}, null, { years_at_job: '12' }).scoreExact, fit(90000, 2500, {}, null, { years_at_job: '' }).scoreExact, 'years at the job move nothing');
  assert.equal(fit(90000, 2500, {}, null, { years_at_previous: '4', prev_landlord_name: '' }).R, null, 'years at an address with no landlord named is not a tenancy fact');
});

test('parseYears and recencyWeight', () => {
  assert.equal(parseYears('3 years'), 3); assert.equal(parseYears('3+'), 3); assert.equal(parseYears('three'), 0); assert.equal(parseYears(null), 0); assert.equal(parseYears('1.5'), 1.5);
  assert.equal(recencyWeight('2026-09-01T00:00:00Z', NOW), 1); assert.equal(recencyWeight('2025-03-01T00:00:00Z', NOW), 0.5); assert.equal(recencyWeight('2024-03-01T00:00:00Z', NOW), 0); assert.equal(recencyWeight(null, NOW), 1);
});

test('criteria: the rows the landlord reads; none moves the number; no tenure row', () => {
  const min = fit(90000, 2500, { pref_min_annual_income: 100000 }), free = fit(90000, 2500);
  assert.equal(min.scoreExact, free.scoreExact, 'a minimum is a row, never a cap');
  const c = min.criteria.find((k) => k.key === 'pref_min_annual_income'); assert.equal(c.status, 'missed'); assert.equal(c.detail, 'Below your $100k minimum');
  const ref = fit(90000, 2500, { pref_requires_landlord_reference: true }, null, { prev_landlord_name: null });
  assert.equal(ref.criteria.find((k) => k.key === 'pref_requires_landlord_reference').detail, 'No landlord reference');
  const emp = fit(90000, 2500, { pref_requires_employer_verification: true }, report({ employer: false }));
  assert.equal(emp.criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'missed');
  assert.equal(fit(90000, 2500, { pref_requires_employer_verification: true }).criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'unverified');
  assert.equal(fit(90000, 2500, { pref_requires_employer_verification: true }, null, {}, { employer: { at: '2026-09-20T00:00:00Z', by: 'A' } }).criteria.find((k) => k.key === 'pref_requires_employer_verification').status, 'met');
  const share = fit(170000, 4700, { pref_rent_to_income_max_pct: 30 }).criteria.find((k) => k.key === 'pref_rent_to_income_max_pct');
  assert.equal(share.status, 'missed'); assert.equal(share.detail, 'Rent share 33% · your max 30%');
  assert.equal(fit(90000, 2500, { pref_min_years_at_job: 2 }).criteria.some((k) => /years_at_job|tenure/i.test(k.key + k.label)), false);
  assert.equal(fit(90000, null), null); assert.equal(fit(0, 2500), null); assert.equal(computeFit({ application: app(90000), listing: null }), null);
});

test('free text never enters: identical objects for different reason_for_moving and disclosures', () => {
  const x = fit(90000, 2500, {}, null, { reason_for_moving: 'moving closer to family', disclosures: 'a gap in employment while on leave' });
  const y = fit(90000, 2500, {}, null, { reason_for_moving: 'moving for work', disclosures: '' });
  assert.equal(JSON.stringify(x), JSON.stringify(y));
});

test('edited after documents: the documents confirm nothing and the label reads check docs; a confirmation after the edit restores', () => {
  const rep = report({ analyzedAt: '2026-08-10T00:00:00Z' });
  const matched = fit(90000, 2500, {}, rep);
  const edited = fit(90000, 2500, {}, rep, { profile_updated_at: '2026-08-20T00:00:00Z' });
  const confirmedAfter = fit(90000, 2500, {}, rep, { profile_updated_at: '2026-08-20T00:00:00Z' }, { employer: { at: '2026-08-25T00:00:00Z', by: 'A' } });
  const confirmedBefore = fit(90000, 2500, {}, rep, { profile_updated_at: '2026-08-20T00:00:00Z' }, { employer: { at: '2026-08-15T00:00:00Z', by: 'A' } });
  assert.equal(matched.E, 4.0); assert.equal(matched.label, 'docs match');
  assert.equal(edited.E, 2.0); assert.equal(edited.label, 'check docs'); assert.equal(edited.evidence.edited, true); assert.deepEqual(edited.flags.map((f) => f.key), ['edited']);
  assert.equal(confirmedAfter.E, 5.0, 'income and employer confirmed; the identity on the documents adds nothing to a confirmed Truth'); assert.equal(confirmedAfter.label, 'verified');
  assert.equal(confirmedBefore.E, 2.0); assert.equal(confirmedBefore.label, 'check docs');
  assert.equal(fitReason(edited, matched), 'Profile edited after documents');
});

test('compareFit: scoreExact descending, no Fit last, ties by created_at ascending', () => {
  const row = (score, created, exact = score) => ({ application: { created_at: created, fit: score == null ? null : { score, scoreExact: exact } } });
  const list = [row(3.8, '2026-08-03', 3.76), row(null, '2026-08-01'), row(3.8, '2026-08-02', 3.786), row(3.9, '2026-08-05', 3.94), row(3.8, '2026-08-04', 3.76)];
  assert.deepEqual([...list].sort(compareFit).map((r) => r.application.created_at), ['2026-08-05', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-01']);
  const incomplete = { application: { created_at: '2026-08-01', fit: { score: null, scoreExact: null, incomplete: { line: 'x' } } } };
  assert.equal([incomplete, row(2.0, '2026-08-02')].sort(compareFit)[0].application.created_at, '2026-08-02', 'not enough to score sorts last');
});

test('fitReason: at most eight words from the pillars, omitted within 0.02 or without a number, never the income level', () => {
  const stated = fit(90000, 2500), docs = fit(90000, 2500, {}, report());
  assert.equal(fitReason(stated, docs), 'No documents yet');
  assert.equal(fitReason(fit(90000, 2500, {}, report({ nameMatch: 'mismatch' })), docs), 'Documents did not match');
  assert.equal(fitReason(fit(60000, 2200), fit(90000, 2200)), 'Higher rent share');
  assert.equal(fitReason(fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null }, { employer: { at: '2026-09-20T00:00:00Z', by: 'A' } }), fit(90000, 2500, {}, null, {}, { employer: { at: '2026-09-20T00:00:00Z', by: 'A' } })), 'No reference outcome yet');
  assert.equal(fitReason(stated, stated), null);
  assert.equal(fitReason(stated, { ...stated, scoreExact: stated.scoreExact + 0.01 }), null);
  assert.equal(fitReason(fit(90000, 2500, {}, null, { prev_landlord_name: null, years_at_previous: null }), docs), 'No documents yet · no reference outcome yet');
  for (const r of ['No documents yet', 'Documents did not match', 'Higher rent share', 'No reference outcome yet', 'Fewer months on time', 'No documents yet · no reference outcome yet']) { assert.ok(r.split(/\s+/).length <= 8); assert.ok(!/\$|income level/.test(r)); }
});
