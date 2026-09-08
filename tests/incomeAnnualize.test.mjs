// Income annualization is arithmetic, done in code, across every stub. Numbers from the brief with
// a made up name and employer; no real pay stub data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualizeFromStubs, frequencyOf, incomeComparison, MATCH_PCT, CLOSE_PCT } from '../lib/incomeAnnualize.js';
import { buildCombinedRun } from '../lib/uploadCombine.js';
import { readVerification, computeFit } from '../lib/fitScore.js';

const semi = (start, end, gross, extra = {}) => ({ periodStart: start, periodEnd: end, payDate: end, grossForPeriod: gross, ...extra });
const THREE = [semi('2026-07-01', '2026-07-15', 3541.67, { hours: 86.67 }), semi('2026-07-16', '2026-07-31', 3631.67, { hours: 86.67 }), semi('2026-08-01', '2026-08-15', 1771.05, { hours: 40.63, regularRate: 43.58 })];

test('frequency from the dates: 1st to 15th and 16th to month end are semi monthly, 14 days biweekly, 7 weekly, a calendar month monthly, else the printed word, else null', () => {
  assert.equal(frequencyOf({ periodStart: '2026-07-01', periodEnd: '2026-07-15' }), 'semimonthly');
  assert.equal(frequencyOf({ periodStart: '2026-02-16', periodEnd: '2026-02-28' }), 'semimonthly');
  assert.equal(frequencyOf({ periodStart: '2026-07-06', periodEnd: '2026-07-19' }), 'biweekly');
  assert.equal(frequencyOf({ periodStart: 'July 6, 2026', periodEnd: 'July 12, 2026' }), 'weekly');
  assert.equal(frequencyOf({ periodStart: '2026-07-01', periodEnd: '2026-07-31' }), 'monthly');
  assert.equal(frequencyOf({ payFrequency: 'Bi-weekly' }), 'biweekly');
  assert.equal(frequencyOf({}), null);
});

test('three semi monthly stubs, one partial by hours: 85,000 from two of three, one excluded', () => {
  const r = annualizeFromStubs(THREE, 85000);
  assert.equal(r.annual, 85000); assert.equal(r.stubsUsed, 2); assert.equal(r.partial, 1); assert.equal(r.confidence, 'high');
  assert.equal(r.explanation, '$3,541.67 semi monthly × 24 from 2 of 3 stubs; 1 partial period excluded');
  // the stipend stub is a full period; with two full stubs the lower middle value is the median, so the $90 stipend does not lift the figure
  assert.equal(annualizeFromStubs(THREE.slice(0, 2)).annual, 85000);
  assert.equal(annualizeFromStubs([THREE[0], THREE[1], semi('2026-08-16', '2026-08-31', 3631.67, { hours: 86.67 })]).annual, Math.round(3631.67 * 24), 'three full stubs take the true median');
});

test('a partial period is also detected from the gross when no hours are printed', () => {
  const stubs = [semi('2026-07-01', '2026-07-15', 3541.67), semi('2026-07-16', '2026-07-31', 3541.67), semi('2026-08-01', '2026-08-15', 1771.05)];
  const r = annualizeFromStubs(stubs);
  assert.equal(r.annual, 85000); assert.equal(r.partial, 1);
});

test('only a partial stub with an hourly rate: the rate based figure, flagged as a single partial period', () => {
  const r = annualizeFromStubs([semi('2026-08-01', '2026-08-15', 1771.05, { hours: 40.63, regularRate: 43.58 })]);
  assert.equal(r.annual, Math.round(43.58 * 86.67 * 24)); assert.equal(r.basis, 'single partial period'); assert.equal(r.confidence, 'low');
  assert.match(r.explanation, /^\$43\.58\/hour × 86\.67 hours semi monthly × 24; only partial periods on file \(1 stub\)$/);
  const noRate = annualizeFromStubs([semi('2026-08-01', '2026-08-15', 1771.05, { hours: 40.63 })]);
  assert.equal(noRate.annual, null); assert.equal(noRate.explanation, 'only partial periods');
});

test('two biweekly stubs at 2,700 give 70,200; no dates and no printed frequency give null', () => {
  const r = annualizeFromStubs([{ periodStart: '2026-07-06', periodEnd: '2026-07-19', grossForPeriod: 2700 }, { periodStart: '2026-07-20', periodEnd: '2026-08-02', grossForPeriod: 2700 }]);
  assert.equal(r.annual, 70200); assert.equal(r.explanation, '$2,700.00 biweekly × 26 from 2 of 2 stubs');
  const none = annualizeFromStubs([{ grossForPeriod: 2700 }]);
  assert.equal(none.annual, null); assert.equal(none.explanation, 'pay period dates and frequency could not be read');
  assert.equal(annualizeFromStubs([]).annual, null);
});

test('the comparison: within 5% match, within 15% close, else mismatch, never mismatch on a single partial period', () => {
  const docs = (stubs) => stubs.map((s, i) => ({ filename: `s${i}.pdf`, documentType: 'pay stub', unrecognized: false, extracted: s }));
  assert.equal(MATCH_PCT, 5); assert.equal(CLOSE_PCT, 15);
  const three = incomeComparison(docs(THREE), 85000);
  assert.equal(three.status, 'match'); assert.equal(three.annual, 85000); assert.equal(three.found, three.explanation); assert.equal(three.stated, '$85,000');
  assert.equal(incomeComparison(docs(THREE), 92000).status, 'close', '85,000 against 92,000 is 7.6% off');
  assert.equal(incomeComparison(docs(THREE), 120000).status, 'mismatch');
  const partialOnly = incomeComparison(docs([THREE[2]]), 120000);
  assert.equal(partialOnly.status, 'close', 'a single partial period never says mismatch'); assert.equal(partialOnly.basis, 'single partial period');
  assert.equal(incomeComparison(docs([{ grossForPeriod: 2700 }]), 85000).status, 'not_found');
  assert.equal(incomeComparison([], 85000).status, 'not_found');
  const letter = incomeComparison([{ documentType: 'employment letter', unrecognized: false, extracted: { annualSalaryPrinted: 85000 } }], 85000);
  assert.equal(letter.status, 'match'); assert.equal(letter.basis, 'employment letter');
  const stubsWinOverLetter = incomeComparison([...docs(THREE), { documentType: 'employment letter', unrecognized: false, extracted: { annualSalaryPrinted: 60000 } }], 85000);
  assert.equal(stubsWinOverLetter.annual, 85000, 'stubs are the basis when they exist');
});

test('finalize: the comparison runs once over every staged pay document, not per file', () => {
  const items = THREE.map((s, i) => ({ index: i, filename: `s${i}.pdf`, document: { filename: `s${i}.pdf`, documentType: 'pay stub', unrecognized: false, extracted: { ...s, applicantName: 'Test Person', employer: 'Test Employer Ltd.' } }, comparisons: [{ field: 'Income', stated: '$85,000', found: i === 2 ? '$42,505' : '$85,000', status: i === 2 ? 'mismatch' : 'match' }, { field: 'Employer', stated: 'Test Employer Ltd.', found: 'Test Employer Ltd.', status: 'match' }], confidence: 'high' }));
  const run = buildCombinedRun(items, 'Test Person', 85000);
  const income = run.comparisons.filter((c) => /income/i.test(c.field));
  assert.equal(income.length, 1, 'one income row');
  assert.equal(income[0].status, 'match', 'the per file mismatch from the partial stub does not survive'); assert.equal(income[0].annual, 85000);
  assert.equal(run.comparisons.find((c) => c.field === 'Employer').status, 'match');
  assert.equal(run.crossReference.some((c) => /income/i.test(c.field)), false, 'no model side income cross reference');
  const v = readVerification(run);
  assert.equal(v.incomeMatched, true); assert.equal(v.incomeFound, 85000); assert.equal(v.incomeExplanation, '$3,541.67 semi monthly × 24 from 2 of 3 stubs; 1 partial period excluded');
  const fit = computeFit({ application: { annual_income: 85000, years_at_job: '3', references: [] }, listing: { monthly_rent: 2600 }, verification: run, confirmations: {} });
  assert.equal(fit.incomeSource, 'verified'); assert.equal(fit.incomeUsed, 85000);
  // an older report with a bare figure still reads
  const old = readVerification({ documents: [{ documentType: 'pay stub' }], nameMatch: 'match', comparisons: [{ field: 'Income', stated: '$85,000', found: '$85,000', status: 'match' }] });
  assert.equal(old.incomeFound, 85000);
});
