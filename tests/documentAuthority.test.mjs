// Each document speaks only for the facts it is authoritative for, and the strongest source wins.
// Invented names and employers; the number shapes are the brief's. No real document data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITY, kindOf, resolveFact, resolveNameMatch, authorityComparisons, incomeComparison, crossReference, textStatus } from '../lib/documentAuthority.js';
import { buildCombinedRun } from '../lib/uploadCombine.js';
import { readVerification, computeFit } from '../lib/fitScore.js';
import { applicantState } from '../lib/applicantState.js';
import { verificationFacts } from '../lib/applicantSynthesis.js';

const NOW = new Date('2026-09-08T12:00:00Z');
const A = 'Northwind Sample Clinic Inc.', B = 'Old Harbour Logistics Ltd.';
const semi = (start, end, gross, extra = {}) => ({ periodStart: start, periodEnd: end, payDate: end, grossForPeriod: gross, applicantName: 'Test Person', employer: A, ...extra });
const STUBS = [semi('2026-07-01', '2026-07-15', 3541.67, { hours: 86.67 }), semi('2026-07-16', '2026-07-31', 3631.67, { hours: 86.67 }), semi('2026-08-01', '2026-08-15', 1771.05, { hours: 40.63, regularRate: 43.58 })];
const doc = (documentType, extracted, filename = `${documentType}.pdf`) => ({ filename, documentType, unrecognized: false, extracted });
const stubDocs = () => STUBS.map((s, i) => doc('pay stub', s, `stub-${i + 1}.pdf`));
const letterDoc = (salary = 85000, extra = {}) => doc('employment letter', { applicantName: 'Test Person', employer: A, jobTitle: 'Clinic Coordinator', employmentType: 'Full-time', startDate: 'March 1, 2023', annualSalaryPrinted: salary, ...extra });
const creditDoc = (employer = B) => doc('credit report', { applicantName: 'Test Person', employer, creditScore: 712, scoreBand: 'Good', bureau: 'Equifax', reportDate: 'Aug 30, 2026' });
const STATED = { statedName: 'Test Person', statedAnnualIncome: 85000, statedEmployer: A, statedJobTitle: 'Clinic Coordinator', statedEmploymentTenureYears: '3' };
const APP = { full_name: 'Test Person', annual_income: 85000, employer: A, job_title: 'Clinic Coordinator', years_at_job: '3', references: [] };
const LISTING = { monthly_rent: 2600 };
const runOf = (documents) => ({ analyzedAt: NOW.toISOString(), documents, nameMatch: resolveNameMatch('Test Person', documents), comparisons: authorityComparisons(documents, STATED, { now: NOW }), crossReference: crossReference(documents) });
const row = (run, field) => run.comparisons.find((c) => c.field === field);

test('the authority table as specified: letter 3 on employer, title, salary, start date; stub 3 on employer and period gross; credit report 0 on employer and income', () => {
  assert.deepEqual(AUTHORITY['employment letter'], { employer: 3, title: 3, 'annual salary': 3, 'start date': 3, name: 2 });
  assert.deepEqual(AUTHORITY['pay stub'], { employer: 3, 'period gross': 3, name: 2 });
  assert.deepEqual(AUTHORITY['tax slip'], { 'annual income': 2, employer: 1, name: 2 });
  assert.deepEqual(AUTHORITY['bank statement'], { deposits: 1, name: 2 });
  assert.deepEqual(AUTHORITY['government ID'], { name: 3 });
  assert.deepEqual(AUTHORITY['credit report'], { name: 2, employer: 0, income: 0 });
  assert.deepEqual(AUTHORITY.other, {});
  assert.equal(kindOf(doc('Earnings statement', {})), 'pay stub'); assert.equal(kindOf(doc('tax document (T4)', {})), 'tax slip'); assert.equal(kindOf(doc('notice of assessment', {})), 'tax slip');
  assert.equal(kindOf(doc('driver licence', {})), 'government ID'); assert.equal(kindOf(doc('utility bill', {})), 'other'); assert.equal(kindOf({ documentType: 'pay stub', unrecognized: true }), 'other');
  assert.equal(kindOf(doc('consumer report', { creditScore: 700 })), 'credit report', 'a score makes it a credit report whatever the label');
});

test('resolveFact: the strongest source wins, lower sources that disagree are also seen, a level 0 line is historical, no authority is not on documents', () => {
  const r = resolveFact('employer', [creditDoc(B), doc('pay stub', semi('2026-07-01', '2026-07-15', 3541.67, { employer: 'Northwind Clinic' })), letterDoc()]);
  assert.equal(r.value, A); assert.equal(r.source.kind, 'employment letter'); assert.equal(r.source.level, 3); assert.equal(r.status, 'resolved');
  assert.deepEqual(r.alsoSeen.map((e) => [e.line, e.historical]), [['pay stub shows Northwind Clinic', false], [`credit report lists ${B} (historical)`, true]]);
  const same = resolveFact('employer', [letterDoc(), doc('pay stub', semi('2026-07-01', '2026-07-15', 3541.67, { employer: 'NORTHWIND SAMPLE CLINIC' }))]);
  assert.equal(same.alsoSeen.length, 0, 'case and a corporate suffix are not a disagreement');
  const none = resolveFact('employer', [creditDoc(B)]);
  assert.equal(none.status, 'not on documents'); assert.equal(none.value, null); assert.equal(none.alsoSeen.length, 0);
  assert.equal(resolveFact('annual salary', stubDocs()).status, 'not on documents', 'a stub has no authority on an annual figure');
  assert.equal(textStatus('Northbridge Analytics', 'Northbridge Analytics Inc.'), 'match'); assert.equal(textStatus('Northbridge Analytics', 'Northbridge Health'), 'close'); assert.equal(textStatus(A, B), 'mismatch'); assert.equal(textStatus(A, null), 'not_found');
});

test('letter at A and 85,000, stubs annualize to 85,000 at A, credit report lists B: employer matched, income matched, B also seen as historical, label docs match', () => {
  const run = runOf([letterDoc(), ...stubDocs(), creditDoc(B)]);
  const emp = row(run, 'Employer');
  assert.equal(emp.status, 'match'); assert.equal(emp.found, A); assert.equal(emp.source, 'employment letter');
  assert.deepEqual(emp.alsoSeen, [`credit report lists ${B} (historical)`]);
  const inc = row(run, 'Income');
  assert.equal(inc.status, 'match'); assert.equal(inc.annual, 85000); assert.equal(inc.basis, 'letter and pay stubs agree');
  assert.equal(inc.explanation, '$85,000 a year on the letter, pay stubs annualize to $85,000 (letter and pay stubs agree)'); assert.equal(inc.found, inc.explanation);
  assert.equal(run.crossReference.some((c) => c.field === 'Employer' && c.status === 'discrepancy'), false, 'the credit report never enters the employer cross reference');
  assert.equal(run.nameMatch, 'match');
  const v = readVerification(run);
  assert.equal(v.employerMatched, true); assert.equal(v.incomeMatched, true); assert.equal(v.incomeFound, 85000);
  assert.deepEqual(v.employerAlsoSeen, [`credit report lists ${B} (historical)`]); assert.equal(v.employerSince, 'since Mar 2023');
  const fit = computeFit({ application: APP, listing: LISTING, verification: run, confirmations: {} });
  assert.equal(fit.label, 'docs match'); assert.equal(fit.incomeSource, 'verified'); assert.equal(fit.E, 5);
  assert.equal(applicantState({ junction: { application: APP }, verification: run }).state, 'matched');
  assert.equal(verificationFacts([run]).employerMismatch, false);
});

test('letter only: employer and income matched from the letter', () => {
  const run = runOf([letterDoc()]);
  assert.equal(row(run, 'Employer').status, 'match'); assert.equal(row(run, 'Income').status, 'match'); assert.equal(row(run, 'Income').basis, 'employment letter');
  assert.equal(row(run, 'Income').explanation, '$85,000 a year as printed on the employment letter');
  assert.equal(row(run, 'Job title').status, 'match'); assert.equal(row(run, 'Job title').informational, true);
  assert.equal(computeFit({ application: APP, listing: LISTING, verification: run, confirmations: {} }).label, 'docs match');
});

test('stubs only from A with a credit report listing B: matched, B also seen', () => {
  const run = runOf([...stubDocs(), creditDoc(B)]);
  const emp = row(run, 'Employer');
  assert.equal(emp.status, 'match'); assert.equal(emp.source, 'pay stub'); assert.deepEqual(emp.alsoSeen, [`credit report lists ${B} (historical)`]);
  assert.equal(row(run, 'Income').status, 'match'); assert.equal(row(run, 'Income').basis, 'median full period');
  assert.equal(computeFit({ application: APP, listing: LISTING, verification: run, confirmations: {} }).label, 'docs match');
  const noDiff = runOf([...stubDocs(), creditDoc(A)]);
  assert.deepEqual(row(noDiff, 'Employer').alsoSeen, [], 'a credit report that agrees is not listed');
});

test('credit report only: nothing matched, documents on file, the checked state', () => {
  const run = runOf([creditDoc(B)]);
  assert.equal(row(run, 'Employer').status, 'not_found'); assert.equal(row(run, 'Employer').found, null); assert.deepEqual(row(run, 'Employer').alsoSeen, []);
  assert.equal(row(run, 'Income').status, 'not_found'); assert.equal(row(run, 'Income').explanation, 'no pay stub or employment letter on file');
  assert.equal(run.nameMatch, 'match', 'a credit report is level 2 on the name');
  const v = readVerification(run);
  assert.equal(v.state, 'ok'); assert.equal(v.incomeMatched, false); assert.equal(v.employerMatched, false); assert.equal(v.employerMismatch, false);
  const fit = computeFit({ application: APP, listing: LISTING, verification: run, confirmations: {} });
  assert.equal(fit.label, 'stated'); assert.equal(fit.evidence.contradicted, false);
  assert.equal(applicantState({ junction: { application: APP }, verification: run }).state, 'checked');
});

test('letter at 90,000 and stubs at 85,000: the letter is the figure, income close, both figures shown', () => {
  const run = runOf([letterDoc(90000), ...stubDocs()]);
  const inc = row(run, 'Income');
  assert.equal(inc.status, 'close'); assert.equal(inc.annual, 90000); assert.equal(inc.basis, 'employment letter');
  assert.equal(inc.explanation, '$90,000 a year on the letter; pay stubs annualize to $85,000 ($3,541.67 semi monthly × 24 from 2 of 3 stubs; 1 partial period excluded)');
  assert.deepEqual(inc.stubs, { annual: 85000, explanation: '$3,541.67 semi monthly × 24 from 2 of 3 stubs; 1 partial period excluded', basis: 'median full period' }); assert.deepEqual(inc.letter, { annual: 90000 });
  const fit = computeFit({ application: APP, listing: LISTING, verification: run, confirmations: {} });
  assert.equal(fit.label, 'docs match', 'close is not check docs'); assert.equal(fit.incomeSource, 'stated'); assert.equal(fit.evidence.contradicted, false);
  const v = readVerification(run);
  assert.equal(v.incomeClose, true); assert.equal(v.incomeMismatch, false); assert.equal(v.incomeMatched, false);
  assert.equal(applicantState({ junction: { application: APP }, verification: run }).state, 'matched');
  const t4 = incomeComparison([doc('tax document (T4)', { employer: A, annualSalaryPrinted: 84000 })], 85000);
  assert.equal(t4.basis, 'tax slip'); assert.equal(t4.status, 'match'); assert.equal(t4.annual, 84000);
});

test('name: a level 3 ID that matches wins over a bank statement in another name; a same level mismatch still flags', () => {
  const id = doc('government ID', { applicantName: 'Test Person' }); const bank = doc('bank statement', { applicantName: 'Other Human' });
  assert.equal(resolveNameMatch('Test Person', [id, bank]), 'match');
  assert.equal(resolveNameMatch('Test Person', [bank]), 'mismatch');
  assert.equal(resolveNameMatch('Test Person', [letterDoc(), doc('pay stub', semi('2026-07-01', '2026-07-15', 3541.67, { applicantName: 'Other Human' }))]), 'mismatch', 'letter and stub are both level 2');
  assert.equal(resolveNameMatch('Test Person', [doc('bank statement', { applicantName: 'T. Person' })]), 'match');
  assert.equal(resolveNameMatch('Test Person', [doc('utility bill', { applicantName: 'Other Human' })]), 'unclear', 'an other document has no authority on the name');
  assert.equal(resolveNameMatch('Test Person', []), 'unclear');
  const run = { documents: [id, bank], nameMatch: resolveNameMatch('Test Person', [id, bank]), comparisons: [] };
  assert.equal(readVerification(run).state, 'ok');
});

test('start date: within a year of the stated tenure reads since, a larger gap reads letter says since, and neither moves Fit', () => {
  const within = row(runOf([letterDoc(85000, { startDate: 'March 1, 2023' })]), 'Employer');
  assert.equal(within.since, 'since Mar 2023'); assert.equal(within.sinceGap, false);
  const gapRun = runOf([letterDoc(85000, { startDate: 'March 1, 2026' })]);
  assert.equal(row(gapRun, 'Employer').since, 'letter says since Mar 2026'); assert.equal(row(gapRun, 'Employer').sinceGap, true);
  const noDate = runOf([letterDoc(85000, { startDate: null })]);
  assert.equal(row(noDate, 'Employer').since, undefined);
  const a = computeFit({ application: APP, listing: LISTING, verification: gapRun, confirmations: {} }), b = computeFit({ application: APP, listing: LISTING, verification: noDate, confirmations: {} });
  assert.equal(a.score, b.score); assert.equal(a.R, b.R); assert.equal(a.label, 'docs match');
  assert.equal(readVerification(gapRun).employerSince, 'letter says since Mar 2026');
  const titleOff = runOf([letterDoc(85000, { jobTitle: 'Receptionist' })]);
  assert.equal(row(titleOff, 'Job title').status, 'mismatch');
  assert.equal(computeFit({ application: APP, listing: LISTING, verification: titleOff, confirmations: {} }).score, b.score, 'title is informational');
});

test('finalize recomputes every row from the staged documents; per file rows are never merged', () => {
  const items = [letterDoc(), ...stubDocs(), creditDoc(B)].map((d, i) => ({ index: i, filename: d.filename, document: d, comparisons: [{ field: 'Employer', stated: A, found: i === 4 ? B : A, status: i === 4 ? 'mismatch' : 'match' }], confidence: 'high' }));
  const run = buildCombinedRun(items, 'Test Person', STATED);
  assert.equal(run.comparisons.filter((c) => c.field === 'Employer').length, 1);
  assert.equal(row(run, 'Employer').status, 'match', 'the credit report file\'s mismatch row does not survive');
  assert.deepEqual(row(run, 'Employer').alsoSeen, [`credit report lists ${B} (historical)`]);
  assert.equal(row(run, 'Income').status, 'match'); assert.equal(run.nameMatch, 'match');
  assert.equal(run.crossReference.find((c) => c.field === 'Employer').status, 'consistent');
  assert.match(run.overallSummary, /Employer, Job title, Income verified against the application/);
  const legacy = buildCombinedRun(items, 'Test Person', 85000);
  assert.equal(row(legacy, 'Income').status, 'match'); assert.equal(row(legacy, 'Employer').status, 'not_found', 'a bare number carries no stated employer');
});
