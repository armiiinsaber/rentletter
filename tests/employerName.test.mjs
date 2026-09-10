// Employer names compared properly: lib/employerName.js, and the read time recompute in
// lib/fitScore.js readVerification, lib/applicantSynthesis.js and lib/listingReportData.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
const { normalizeEmployer, employerStatus, employerRowStatus, EMPLOYER_NOISE } = await import('../lib/employerName.js');
const { duplicateMatch } = await import('../lib/duplicates.js');
const { readVerification, computeFit } = await import('../lib/fitScore.js');
const { verificationFacts, synthesisLine } = await import('../lib/applicantSynthesis.js');
const { landlordVerification } = await import('../lib/listingReportData.js');
const { authorityComparisons } = await import('../lib/documentAuthority.js');

test('normalizeEmployer: the four forms', () => {
  const forms = ['Livenation', 'Live Nation', 'Live Nation Canada Inc', 'LIVE NATION ENTERTAINMENT'].map(normalizeEmployer);
  console.log('  ' + forms.join(' | '));
  assert.deepEqual(forms, ['livenation', 'livenation', 'livenation', 'livenationentertainment']);
  assert.deepEqual(EMPLOYER_NOISE, ['inc', 'incorporated', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'canada', 'the', 'llc', 'llp', 'plc', 'group', 'holdings']);
  assert.equal(normalizeEmployer('The Loblaw Companies Limited'), 'loblawcompanies');
  assert.equal(normalizeEmployer('Sunnybrook Health Sciences Centre'), 'sunnybrookhealthsciencescentre');
  assert.equal(normalizeEmployer("Sofia's Cafe Inc."), 'sofiascafe');
  assert.equal(normalizeEmployer('Johnson & Johnson'), 'johnsonandjohnson');
  assert.equal(normalizeEmployer('Élan Co.'), 'elan');
  assert.equal(normalizeEmployer(''), ''); assert.equal(normalizeEmployer(null), '');
});

test('employerStatus: each pair, and a true mismatch', () => {
  const pairs = [
    ['Livenation', 'Live Nation', 'match'], ['Livenation', 'Live Nation Canada Inc', 'match'], ['Live Nation', 'Live Nation Canada Inc', 'match'],
    ['Livenation', 'LIVE NATION ENTERTAINMENT', 'close'], ['Live Nation Canada Inc', 'LIVE NATION ENTERTAINMENT', 'close'], ['LIVE NATION ENTERTAINMENT', 'Live Nation', 'close'],
    ['Shopify', 'Loblaw', 'mismatch'], ['Shopify Inc.', 'Shopify', 'match'], ['RBC', 'RBC Royal Bank', 'close'], ['TD', 'TD Bank Group', 'mismatch'], // under three characters a form never counts as contained
    ['Shopify', '', 'not_found'], [null, 'Shopify', 'not_found'],
  ];
  for (const [a, b, want] of pairs) { const got = employerStatus(a, b); console.log(`  ${JSON.stringify(a)} vs ${JSON.stringify(b)} -> ${got}`); assert.equal(got, want, `${a} vs ${b}`); }
});

test('the duplicate check uses the same normalization for the employer half', () => {
  const app = (over) => ({ application: { full_name: 'Ana Ruiz', employer: 'Live Nation Canada Inc', phone: '', email: '', ...over } });
  assert.equal(duplicateMatch(app({ email: 'a@x.ca' }), app({ email: 'b@x.ca', employer: 'Livenation' })), 'name and employer');
  assert.equal(duplicateMatch(app({ email: 'a@x.ca' }), app({ email: 'b@x.ca', employer: 'Loblaw' })), null);
});

test('the read time recompute: an older report that stored a mismatch for Livenation reads matched, in Fit, the synthesis line and the landlord report', () => {
  const report = { analyzedAt: '2026-09-01T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'employment letter' }], comparisons: [
    { field: 'Employer', stated: 'Livenation', found: 'Live Nation Canada Inc', status: 'mismatch' },
    { field: 'Income', stated: '$96,000', found: '$96,000 a year as printed on the employment letter', annual: 96000, status: 'match' },
  ] };
  assert.equal(employerRowStatus(report.comparisons[0]), 'match');
  const v = readVerification(report);
  assert.equal(v.employerMatched, true); assert.equal(v.employerMismatch, false); assert.equal(v.incomeMatched, true);
  const app = { full_name: 'Alexandra Papadopoulos Whitfield', annual_income: 96000, employer: 'Livenation', years_at_job: '4', prev_landlord_name: 'H. Park', references: [] };
  const fit = computeFit({ application: app, listing: { monthly_rent: 2600, pref_rent_to_income_max_pct: 40 }, verification: report, confirmations: {} });
  assert.equal(fit.label, 'docs match'); assert.equal(fit.E, 5.0, 'income and employer both matched');
  const facts = verificationFacts([report]);
  assert.equal(facts.employmentVerified, true); assert.equal(facts.employerMismatch, false);
  assert.match(synthesisLine({ application: { ...app, rent_to_income_ratio: 33 }, docVerifications: [report] }), /^Documented income/);
  const lv = landlordVerification([report]);
  assert.equal(lv.employmentVerified, true); assert.equal(lv.employerName, 'Live Nation Canada Inc');
  // a real mismatch still reads as one, and a row without both values keeps its stored status
  const bad = { ...report, comparisons: [{ field: 'Employer', stated: 'Shopify', found: 'Loblaw', status: 'match' }] };
  assert.equal(readVerification(bad).employerMismatch, true); assert.equal(readVerification(bad).employerMatched, false);
  assert.equal(employerRowStatus({ field: 'Employer', stated: null, found: 'Loblaw', status: 'not_found' }), 'not_found');
  // a fresh analysis computes the same answer
  const fresh = authorityComparisons([{ filename: 'l.pdf', documentType: 'employment letter', unrecognized: false, extracted: { applicantName: 'A P W', employer: 'Live Nation Canada Inc', annualSalaryPrinted: 96000 } }], { statedEmployer: 'Livenation', statedAnnualIncome: 96000 });
  assert.equal(fresh.find((c) => c.field === 'Employer').status, 'match');
});
