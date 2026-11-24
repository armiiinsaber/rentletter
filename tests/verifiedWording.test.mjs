// What "verified" may say. The only thing recorded is that the realtor tapped Called employer
// (confirmations.employer, or confirmations["party:<id>:employer"] for a co applicant or a
// guarantor): nobody confirmed the income. So the card line and a party's facts say Employer
// confirmed, the old income phrases are printed nowhere, and beside the Fit word verified the
// landlord report page and its PDF carry one small line saying what verified means, with the date
// of the call the report froze. The FAQ answers the background check question in the owner's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { synthesisLine } = await import('../lib/applicantSynthesis.js');
const P = await import('../lib/parties.js');
const { demoSnapshot } = await import('../lib/demoReport.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { shortDate } = await import('../lib/reportSnapshot.js');

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const files = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const MEANING = 'Verified means the realtor confirmed the employer by phone';

test('the card line says Employer confirmed once the realtor called, never verified income', () => {
  const app = { annual_income: 90000, rent_to_income_ratio: 34, prev_landlord_name: 'J. Wong' };
  const called = { linkId: 'l1', application: app, docVerifications: [], confirmations: { employer: { at: '2026-09-02T14:00:00Z', by: 'Armin' } } };
  assert.equal(synthesisLine(called), 'Employer confirmed, income at 2.9x rent, landlord reference on file');
  assert.equal(synthesisLine({ ...called, application: {} }), 'Employer confirmed, no reference yet');
});

test('a co applicant or guarantor whose employer was confirmed reads Employer confirmed, everywhere their facts go', () => {
  const party = { id: 'P1', role: 'guarantor', status: P.PARTY_STATUS.SUBMITTED, employer: 'Acme', jobTitle: 'Clerk', annualIncome: 85000, docVerifications: [] };
  const conf = { [P.partyConfirmKey('P1')]: { at: '2026-09-02T14:00:00Z', by: 'Armin' } };
  assert.equal(P.partyVerificationLabel(party, conf), 'employer confirmed');
  assert.deepEqual(P.partyFacts(party, conf), ['Acme, Clerk', 'Income $85,000 a year', 'Employer confirmed']);
  assert.deepEqual(P.partyFacts(party, {}), ['Acme, Clerk', 'Income $85,000 a year', 'Income stated'], 'the other labels keep their words');
});

test('the old income phrases are printed nowhere on the realtor, landlord or public side', () => {
  const sources = [...files('components'), ...files('pages'), ...files('lib'), 'scripts/film/capture.mjs'];
  for (const p of sources) assert.doesNotMatch(read(p), /Verified income|Income verified|Income \$\{[^}]*\}.{0,4}verified/i, `${p} prints the old phrase`);
});

test('beside the Fit word VERIFIED the PDF carries what it means, with the date of the call, and nowhere else', () => {
  const payload = demoSnapshot('demo-carlaw');
  const blocks = reportLines(payload).blocks;
  let seen = 0;
  payload.applicants.forEach((a, i) => {
    if (a.fit && a.fit.label === 'verified') { seen++; assert.equal(blocks[i].verified, `${MEANING} on ${shortDate(a.confirmations.employer.at)}.`); assert.equal(blocks[i].word, 'VERIFIED'); }
    else assert.equal(blocks[i].verified, null, `${a.name}: no line without the word`);
  });
  assert.ok(seen >= 1, 'the sandbox has a verified applicant');
  // A frozen confirmation without its date: the line ends at by phone. No new data is read.
  const undated = { ...payload, applicants: [{ ...payload.applicants[0], confirmations: { employer: { at: null, by: 'Sarah Chen' } } }] };
  assert.equal(reportLines(undated).blocks[0].verified, `${MEANING}.`);
});

test('the landlord page prints the same line, beside the Fit lines, only for the word verified', () => {
  const page = read('pages/r/[token].js');
  assert.match(page, /a\.fit\.label !== 'verified'\) return null;/);
  assert.ok(page.includes('return `Verified means the realtor confirmed the employer by phone${on}.`;'), 'the same words as the PDF');
  assert.match(page, /const on = at && !Number\.isNaN\(new Date\(at\)\.getTime\(\)\) \? ` on \$\{shortDate\(at\)\}` : '';/);
  assert.match(page, /\{verifiedMeaning\(a\) \? <div data-verified-meaning=""/);
  // The line reads the frozen snapshot only: the page adds nothing to the report's data.
  assert.doesNotMatch(read('lib/reportSnapshot.js'), /verifiedMeaning|Verified means/);
});

test('the FAQ answers the background check question in the owner\'s words', () => {
  const faq = read('pages/faq.js');
  assert.match(faq, /q: 'Does it run credit or background checks\?',\n    a: "Rentletter reads each applicant's documents, matches them against what the applicant wrote, and records the checks you make yourself, such as a call to the employer\. Full background checks are being added to the product\. Until then, run credit checks through the service you already use\.",/);
  assert.doesNotMatch(faq, /not a verification or credit check product/);
});

test('the pages that describe what is true today stay word for word', () => {
  assert.match(read('pages/compliance.js'), /Rentletter does not perform credit checks, criminal record checks, or background verification\./);
  assert.match(read('pages/terms.js'), /Automated output is not a background check, credit check, or guarantee/);
});
