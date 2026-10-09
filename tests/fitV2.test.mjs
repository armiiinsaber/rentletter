// Fit v2 proofs (docs/fit-v2.md): missing is not scored, now over then, Ability alone is never a
// number, flags never subtract, source labels never feed the number, credit and parties stay
// outside, and a report already sent keeps the Fit it froze.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { computeFit, fitLine, fitLines, INCOMPLETE_LINE, PILLARS } = await import('../lib/fitScore.js');
const { SOURCE_LABELS } = await import('../lib/stateLabels.js');
const { buildSnapshot, forLandlordPage } = await import('../lib/reportSnapshot.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { reportText } = await import('../lib/reportText.js');

const NOW = Date.parse('2026-10-01T00:00:00Z');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const monthsAgo = (n) => new Date(NOW - n * 30.4375 * 86400000).toISOString();
const ym = (n) => { const d = new Date(NOW - n * 30.4375 * 86400000); return { m: d.getUTCMonth() + 1, y: d.getUTCFullYear() }; };
const base = { full_name: 'Test Person', annual_income: 120000, employer: 'Acme Ltd', created_at: monthsAgo(1), references: [] };
const listing = { monthly_rent: 2000 };
const docs = { analyzedAt: monthsAgo(1), nameMatch: 'match', documents: [{ documentType: 'pay stub', extracted: { payDate: monthsAgo(1).slice(0, 10) } }], comparisons: [{ field: 'Income', stated: '$120,000', found: '$120,000', status: 'match' }, { field: 'Employer', stated: 'Acme Ltd', found: 'Acme', status: 'match' }] };
const confirmed = { employer: { at: monthsAgo(0.5), by: 'You' } };
const ref = (over = {}) => ({ at: monthsAgo(0.5), by: 'reference', rentOnTime: 'always', damage: 'none', again: 'yes', from: ym(9), to: ym(1), ...over });
const fit = (application = {}, confirmations = {}, verification = null, l = listing) => computeFit({ application: { ...base, ...application }, listing: l, verification, confirmations, now: NOW });
const pillar = (f, name) => f.pillars.find((p) => p.name === name);

test('missing is not scored: no rental history and strong ability scores at least as high as the same applicant with a good history', () => {
  const noHistory = fit({}, confirmed);
  const goodHistory = fit({}, { ...confirmed, landlord_reference: ref() });
  const fairHistory = fit({}, { ...confirmed, landlord_reference: ref({ rentOnTime: 'mostly' }) });
  console.log(`  no history ${fitLine(noHistory)}, good history ${fitLine(goodHistory)}, fair history ${fitLine(fairHistory)}`);
  assert.equal(pillar(noHistory, 'conduct').assessed, false); assert.deepEqual(noHistory.notAssessed, ['Conduct']);
  assert.equal(noHistory.assessed, 2); assert.equal(fitLine(noHistory), 'Fit 5.0 on 2 of 3');
  assert.ok(noHistory.scoreExact >= goodHistory.scoreExact, `${noHistory.scoreExact} >= ${goodHistory.scoreExact}`);
  assert.ok(noHistory.scoreExact > fairHistory.scoreExact, 'a fair history is a fact; no history is no fact');
  // the score is the mean over the two pillars present, never a three pillar mean with a zero in it
  const a = pillar(noHistory, 'ability').value, t = pillar(noHistory, 'truth').value;
  assert.equal(noHistory.scoreExact, (0.5 * a + 0.3 * t) / 0.8);
  assert.equal(noHistory.notAssessedLine, 'Conduct not assessed: no reference outcome or tenancy yet.');
  for (const p of noHistory.pillars) assert.ok(typeof p.assessed === 'boolean' && (p.assessed ? typeof p.value === 'number' : p.value === null));
  assert.deepEqual(noHistory.pillars.map((p) => p.name), [...PILLARS]);
});

test('now over then: late payments 30 months ago beside 8 recent clean months score the same as the 8 clean months alone', () => {
  const recent = ref({ from: { m: 2, y: 2026 }, to: ym(0) }); // February to October 2026: eight months
  const old = ref({ at: monthsAgo(30), rentOnTime: 'often_late', damage: 'significant', again: 'no', from: ym(36), to: ym(30) });
  const clean = fit({}, { ...confirmed, landlord_reference: [recent] });
  const withOld = fit({}, { ...confirmed, landlord_reference: [old, recent] });
  console.log(`  clean ${fitLine(clean)} "${clean.basis}"; with a late tenancy 30 months ago ${fitLine(withOld)} "${withOld.basis}"`);
  assert.equal(withOld.scoreExact, clean.scoreExact); assert.equal(withOld.basis, clean.basis);
  assert.match(clean.basis, /Rent paid on time, last 8 months\.$/);
  const context = pillar(withOld, 'conduct').facts.filter((f) => f.weight === 0);
  assert.ok(context.length > 0 && context.every((f) => f.date && /often late|significant|not rent again/.test(f.text)), 'the old facts stay as dated context');
  // 12 to 24 months: half weight, pulled toward the middle
  const poor = { rentOnTime: 'often_late', damage: 'significant', again: 'no' };
  const now1 = fit({}, { ...confirmed, landlord_reference: ref({ ...poor, from: ym(3), to: ym(1) }) });
  const mid = fit({}, { ...confirmed, landlord_reference: ref({ ...poor, at: monthsAgo(18), from: ym(20), to: ym(18) }) });
  const gone = fit({}, { ...confirmed, landlord_reference: ref({ ...poor, at: monthsAgo(30), from: ym(32), to: ym(30) }) });
  assert.ok(now1.R < mid.R && mid.R < 3.0, `${now1.R} < ${mid.R} < 3`); assert.equal(pillar(gone, 'conduct').assessed, false);
  // every dated Ability and Conduct fact carries a date; a stale pay stub halves the income fact
  for (const f of [clean, withOld]) for (const n of ['ability', 'conduct']) for (const x of pillar(f, n).facts) assert.ok(x.at && x.date, `${n}: ${x.text}`);
  const fresh = fit({}, {}, docs), stale = fit({}, {}, { ...docs, documents: [{ documentType: 'pay stub', extracted: { payDate: monthsAgo(18).slice(0, 10) } }] });
  assert.ok(stale.A < fresh.A && stale.A > 3, `${stale.A} between 3 and ${fresh.A}`);
});

test('guardrail: Ability alone is never a number, on the card, the checklist, the report, the PDF and the text', () => {
  const only = fit({ prev_landlord_name: null });
  assert.equal(only.score, null); assert.equal(only.scoreExact, null); assert.equal(only.A, 5.0);
  assert.equal(only.incomplete.line, INCOMPLETE_LINE); assert.equal(INCOMPLETE_LINE, 'Not enough to score yet');
  assert.match(only.incomplete.next, /^Documents or a confirmation would complete it/);
  assert.equal(fitLine(only), 'Not enough to score yet'); assert.deepEqual(fitLines(only), ['Not enough to score yet']);
  const payload = buildSnapshot({ listing: { ...listing, address: '1 Test St, Toronto' }, applicants: [{ linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations: {}, application: { ...base, id: 'A1', fit: only } }], profile: { id: 'P1', full_name: 'Sarah Chen' }, now: new Date(NOW) });
  const frozen = payload.applicants[0].fit;
  assert.equal(frozen.score, null); assert.equal(frozen.incomplete, 'Not enough to score yet');
  const block = reportLines(payload).blocks[0];
  assert.equal(block.fit, null); assert.equal(block.word, 'NOT ENOUGH TO SCORE YET'); assert.deepEqual(block.fitLines, ['Not enough to score yet']);
  const text = reportText(payload, { pageUrl: 'https://rentletter.ca/r/t' });
  assert.match(text, /1\. Test Person, Not enough to score yet\./); assert.doesNotMatch(text, /Fit \d/);
  // the card: the number renders only inside the overall != null branch; the incomplete branch prints the line
  const lv = src('components/dashboard/ListingView.js');
  const number = lv.indexOf('data-fit-number'), branch = lv.indexOf('{overall != null ? ('), incomplete = lv.indexOf('data-fit-incomplete');
  assert.ok(branch > 0 && number > branch && incomplete > number, 'the number sits inside the overall != null branch, the incomplete state after it');
  assert.equal((lv.match(/<AnimatedScore /g) || []).length, 1);
  assert.match(lv, /fit && fit\.incomplete \? \(/); assert.doesNotMatch(lv.slice(incomplete, incomplete + 400), /toFixed/);
  assert.match(src('components/dashboard/ScreeningChecklist.js'), /fitLine\(fit\)/);
  assert.match(src('pages/r/[token].js'), /a\.fit && a\.fit\.incomplete \? null : <span style=\{eyebrow\}>Rent share unknown/, 'the landlord page prints no number and no word at the right; the line below says it');
});

test('guardrail: a guarantor is the listing\'s setting, never asked per applicant, never read by Fit', () => {
  for (const p of ['lib/fitScore.js', 'lib/deriveScorecard.js']) assert.doesNotMatch(src(p).replace(/\/\/.*$/gm, ''), /guarantor/i, p);
  // the realtor's screening surfaces: the checklist never mentions one; the card's one mention is the listing's own setting
  assert.doesNotMatch(src('components/dashboard/ScreeningChecklist.js'), /guarantor/i, 'no per applicant guarantor prompt on the checklist');
  assert.deepEqual(src('components/dashboard/ListingView.js').match(/guarantor[^\n]*/gi), ['Guarantor accepted" value={yn(l.pref_guarantor_accepted !== false)} />'], 'the card reads the listing setting and asks nothing per applicant');
  assert.match(src('components/listings/ListingSetupModal.js'), /pref_guarantor_accepted/, 'the one switch is on the listing');
  assert.match(src('db/008-application-parties-invites.sql'), /listings ADD COLUMN IF NOT EXISTS pref_guarantor_accepted/);
});

test('flags are shown, never subtracted', () => {
  const clean = fit({}, {}, docs);
  const noisy = fit({}, {}, { ...docs, documents: [...docs.documents, { documentType: 'unknown', unrecognized: true }], crossReference: [{ field: 'Employer', status: 'discrepancy', detail: 'x' }, { field: 'Address', status: 'consistent' }] });
  assert.deepEqual(noisy.flags.map((f) => f.key), ['documents_disagree', 'unreadable']);
  assert.equal(noisy.scoreExact, clean.scoreExact); assert.equal(noisy.label, clean.label);
  assert.deepEqual(noisy.flags.map((f) => f.text), ['Employer differs between documents', '1 document could not be read']);
  const mismatch = fit({}, {}, { ...docs, nameMatch: 'mismatch' });
  assert.deepEqual(mismatch.flags.map((f) => f.key), ['identity']); assert.equal(mismatch.label, 'check docs');
  assert.equal(mismatch.scoreExact, fit({}).scoreExact, 'a contradiction leaves the number where the stated facts put it');
  const editedConfirmed = fit({ profile_updated_at: monthsAgo(0.8) }, confirmed, docs);
  assert.deepEqual(editedConfirmed.flags.map((f) => f.key), ['edited']); assert.equal(editedConfirmed.label, 'verified');
  for (const f of [noisy, mismatch, editedConfirmed]) for (const x of f.flags) assert.doesNotMatch(x.text, /[\u2014\u2013-]/);
});

test('source labels exist, are reserved, and feed nothing', () => {
  assert.deepEqual(SOURCE_LABELS, { creditShared: 'credit shared by applicant', idConfirmed: 'ID confirmed', bankDeposits: 'income from bank deposits' });
  const f = fit({}, { ...confirmed, id: { at: monthsAgo(0.5), by: 'You' }, landlord_reference: ref() }, docs);
  for (const p of f.pillars) for (const x of p.facts) assert.equal(Object.values(SOURCE_LABELS).includes(x.text), false, x.text);
  assert.equal(Object.values(SOURCE_LABELS).includes(f.label), false);
  // a bank statement read for deposits and a credit report change nothing; a credit report alone is no report
  const bank = { documentType: 'bank statement', extracted: { accountHolder: 'Test Person', deposits: [{ amount: 5000 }], documentDate: monthsAgo(1).slice(0, 10) } };
  const credit = { documentType: 'credit report', extracted: { score: 800 } };
  assert.equal(JSON.stringify(fit({}, {}, { ...docs, documents: [...docs.documents, bank, credit] })), JSON.stringify(fit({}, {}, docs)));
  assert.equal(JSON.stringify(fit({}, {}, { ...docs, documents: [credit], comparisons: [] })), JSON.stringify(fit({})));
  // savings with a printed closing balance is the one bank statement fact Ability reads, dated
  const saved = fit({ annual_income: 48000 }, {}, { ...docs, comparisons: [], documents: [{ ...bank, extracted: { ...bank.extracted, closingBalance: 12000 } }] });
  const unsaved = fit({ annual_income: 48000 }, {}, { ...docs, comparisons: [], documents: [bank] });
  assert.ok(saved.A > unsaved.A); assert.equal(saved.savingsMonths, 6); assert.match(pillar(saved, 'ability').facts[1].text, /^Savings cover 6 months of rent$/); assert.ok(pillar(saved, 'ability').facts[1].date);
});

test('a report already sent keeps the Fit it froze; only a new render uses v2', () => {
  // A payload frozen under v1: the shape pages/r/[token].js, the PDF and the text received then.
  const frozen = { version: 1, generatedAt: '2026-08-20T00:00:00Z', listing: { address: '1 Test St', rent: 2000, criteria: {}, criteriaLine: 'max 40% rent share', fitLine: 'old line' }, realtor: { name: 'Sarah Chen', signature: 'Sarah Chen' }, counts: { applicants: 1, verified: 0 },
    applicants: [{ rank: 1, firstName: 'Test', lastName: 'Person', name: 'Test Person', fit: { score: 3.9, label: 'stated' }, numbers: { annualIncome: 120000, rentSharePct: 20, yearsAtJob: 3, references: 0 }, criteria: [], sentence: 'x.', credit: { shared: false, label: 'No credit report shared', lines: [] }, parties: [], linkId: 'J1' }] };
  const before = JSON.stringify(frozen);
  const block = reportLines(frozen).blocks[0];
  assert.equal(block.fit, '3.9'); assert.equal(block.word, 'STATED'); assert.deepEqual(block.fitLines, []);
  assert.match(reportText(frozen), /1\. Test Person, Fit 3\.9 \(STATED\)\./);
  assert.equal(forLandlordPage(frozen).applicants[0].fit.score, 3.9); assert.deepEqual(fitLines(frozen.applicants[0].fit), []);
  assert.equal(JSON.stringify(frozen), before, 'rendering a frozen payload rewrites nothing');
  // the same applicant rendered today gets v2: a different number, the coverage and the basis
  const live = fit({ prev_landlord_name: 'A. Patel', years_at_previous: '2' }, confirmed, docs);
  const fresh = buildSnapshot({ listing: { ...listing, address: '1 Test St' }, applicants: [{ linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations: confirmed, application: { ...base, id: 'A1', fit: live } }], profile: { id: 'P1', full_name: 'Sarah Chen' }, now: new Date(NOW) });
  assert.equal(fresh.applicants[0].fit.model, 'fit-v2'); assert.equal(fresh.applicants[0].fit.assessed, 3); assert.notEqual(fresh.applicants[0].fit.score, 3.9);
  assert.deepEqual(reportLines(fresh).blocks[0].fitLines, [`Fit ${live.score.toFixed(1)} on 3 of 3`, live.basis]);
  // the page renders the stored payload and never recomputes
  const page = src('pages/r/[token].js');
  assert.match(page, /forLandlordPage\(row\.payload\)/); assert.doesNotMatch(page, /computeFit|fitFor\(/);
  assert.doesNotMatch(src('lib/reportSnapshotStore.js'), /computeFit/);
});

test('credit and parties stay outside: the byte identical tests compare against v2 and the pillars name neither', () => {
  assert.match(src('tests/creditShared.test.mjs'), /Fit is byte identical with and without a credit report/);
  assert.match(src('tests/parties.test.mjs'), /Fit is byte identical with zero, one or two parties/);
  const f = fit({}, { ...confirmed, landlord_reference: ref() }, docs);
  assert.doesNotMatch(JSON.stringify(f.pillars) + f.basis + f.notAssessedLine, /credit|guarantor|co applicant|party/i);
});

test('the words: no dash as punctuation on any Fit surface, no green or amber token on the touched report header', () => {
  for (const p of ['lib/fitScore.js', 'docs/fit-v2.md', 'db/009-drop-min-years-at-job.sql', 'lib/jointIncome.js']) assert.doesNotMatch(src(p), /[\u2014\u2013]/, p);
  // file names carry hyphens; every other hyphen in the document and the migration is punctuation
  const prose = (s) => s.replace(/\S*[/.]\S*/g, '');
  assert.doesNotMatch(prose(src('docs/fit-v2.md')), /(^|\s)-\s|\w-\w/m, 'no hyphen as punctuation in the document');
  assert.doesNotMatch(prose(src('db/009-drop-min-years-at-job.sql')).replace(/^--/gm, ''), /(^|\s)-\s|\w-\w/m);
  const header = src('pages/r/[token].js').split('data-fit-line')[0];
  assert.doesNotMatch(header, /C\.green|C\.amber/);
  const f = fit({}, { ...confirmed, landlord_reference: ref() }, docs);
  for (const s of [f.basis, f.notAssessedLine || '', ...f.pillars.flatMap((p) => p.facts.map((x) => x.text)), ...f.flags.map((x) => x.text)]) assert.doesNotMatch(s, /[\u2014\u2013]|\s-\s/, s);
});
