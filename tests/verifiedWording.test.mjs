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

// The Fit words after a call to the employer (lib/fitScore.js): the basis, the Ability fact and the
// income fact in Truth say Employer confirmed; matching documents and a stated income keep their words.
const { computeFit } = await import('../lib/fitScore.js');
const { reportText, verifiedLine } = await import('../lib/reportText.js');
const FIT_NOW = Date.parse('2026-10-01T00:00:00Z');
const fitOf = (confirmations, verification = null) => computeFit({ application: { annual_income: 90000, employer: 'Acme Ltd', prev_landlord_name: 'A. Patel', years_at_previous: '4', created_at: '2026-09-01T00:00:00Z' }, listing: { monthly_rent: 2500 }, verification, confirmations, now: FIT_NOW });
const texts = (f) => f.pillars.flatMap((p) => p.facts.map((x) => x.text));

test('after a call to the employer the Fit words say Employer confirmed, never that the income was', () => {
  const called = fitOf({ employer: { at: '2026-09-20T00:00:00Z', by: 'Armin' } });
  assert.equal(called.label, 'verified');
  assert.equal(called.basis, 'Employer confirmed. Tenancy of 4 years stated.');
  assert.deepEqual(called.pillars.find((p) => p.name === 'ability').facts.map((x) => x.text), ['Employer confirmed, rent share 33%']);
  assert.deepEqual(called.pillars.find((p) => p.name === 'truth').facts.map((x) => x.text), ['Employer confirmed by you', 'Employer confirmed by you']);
  for (const line of [called.basis, ...texts(called)]) assert.doesNotMatch(line, /income confirmed|confirmed income|income verified|verified income/i, line);
  const docs = fitOf({}, { analyzedAt: '2026-08-01T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', stated: '$90,000', found: '$90,000', status: 'match' }, { field: 'Employer', stated: 'Acme Ltd', found: 'Acme', status: 'match' }] });
  assert.equal(docs.basis, 'Current income matches documents. Tenancy of 4 years stated.', 'documents keep their words');
  assert.ok(texts(docs).includes('Income matches documents'));
  const stated = fitOf({});
  assert.equal(stated.basis, 'Stated income. Tenancy of 4 years stated.'); assert.ok(texts(stated).includes('Income stated'));
});

test('the two Fit phrases are printed nowhere on the realtor, landlord or public side', () => {
  const sources = [...files('components'), ...files('pages'), ...files('lib'), ...files('scripts')];
  for (const p of sources) assert.doesNotMatch(read(p), /Current income confirmed|Income confirmed by you/, `${p} prints the old phrase`);
});

test('the pasted text carries what VERIFIED means once, under the list, with the date of the call', () => {
  const payload = demoSnapshot('demo-carlaw');
  const priya = payload.applicants.find((a) => a.fit && a.fit.label === 'verified');
  const line = `${MEANING} on ${shortDate(priya.confirmations.employer.at)}.`;
  const text = reportText(payload, { pageUrl: 'https://rentletter.ca/r/x' });
  assert.match(text, /\(VERIFIED\)/);
  assert.equal(text.split(MEANING).length - 1, 1, 'once per report');
  assert.ok(text.includes(`\n\n${line}\n\n`), 'a line of its own under the list');
  assert.ok(text.indexOf(line) > text.lastIndexOf(`${payload.applicants.length}. `), 'after the last applicant');
  // No applicant reads VERIFIED: no line.
  const none = { ...payload, applicants: payload.applicants.map((a) => ({ ...a, fit: a.fit && a.fit.label === 'verified' ? { ...a.fit, label: 'docs match' } : a.fit })) };
  assert.doesNotMatch(reportText(none), /\(VERIFIED\)/); assert.ok(!reportText(none).includes(MEANING));
  // A verified Fit without a number prints no VERIFIED, so no line.
  const incomplete = { ...payload, applicants: [{ ...priya, fit: { ...priya.fit, score: null, incomplete: 'Not enough to score yet' } }] };
  assert.ok(!reportText(incomplete).includes(MEANING));
  // Two called the same day: one date. Different days: each with their name. A call without its date: none.
  const twin = (at, name) => ({ ...priya, name, confirmations: { ...priya.confirmations, employer: { ...priya.confirmations.employer, at } } });
  assert.equal(verifiedLine([twin('2026-11-20T15:00:00Z', 'A'), twin('2026-11-20T18:00:00Z', 'B')]), `${MEANING} on ${shortDate('2026-11-20T15:00:00Z')}.`);
  assert.equal(verifiedLine([twin('2026-11-20T15:00:00Z', 'Ana Ruiz'), twin('2026-11-12T15:00:00Z', 'Ben Ode')]), `${MEANING}: Ana Ruiz on ${shortDate('2026-11-20T15:00:00Z')}, Ben Ode on ${shortDate('2026-11-12T15:00:00Z')}.`);
  assert.equal(verifiedLine([twin(null, 'A')]), `${MEANING}.`);
  // The line reads the frozen payload only: nothing is added to the report's data.
  assert.doesNotMatch(read('lib/reportSnapshot.js'), /verifiedLine|VERIFIED_MEANING/);
});
