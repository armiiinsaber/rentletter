// The frozen landlord report: the payload's exclusions, the token shape, the page's 404 and
// expiry, the answer write and event, the realtor's line from the latest snapshot, the text
// template, and the absent table fallback in send-report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const { buildSnapshot, forLandlordPage, snapshotLine, answerLine } = await import('../lib/reportSnapshot.js');
const { reportSentence } = await import('../lib/reportSentence.js');
const { reportText } = await import('../lib/reportText.js');
const { isReportToken, newReportToken } = await import('../lib/applicationIds.js');
const { latestSnapshots, attachLandlordAnswers, insertSnapshot } = await import('../lib/reportSnapshotStore.js');
const { landlordAnsweredItem } = await import('../lib/actionsLandlord.js');
const { demoSnapshot } = await import('../lib/demoReport.js');

const listing = { id: 'L1', address: '210 Carlaw Ave, Unit 4, Toronto', name: '210 Carlaw Ave, Unit 4', monthly_rent: 2600, bedrooms: '2', pref_min_annual_income: 75000, pref_rent_to_income_max_pct: 40, pref_min_years_at_job: 1, pref_requires_landlord_reference: true, pref_requires_employer_verification: false, landlord_name: 'Marco Rossi', landlord_email: 'marco@example.com' };
const profile = { id: 'P1', full_name: 'Sarah Chen', brokerage: 'Demo Realty', phone: '416 555 0100', email: 'sarah@example.com', logo_url: 'https://x/logo.png' };
const fit = (score, label, ratio, parts = {}) => ({ score, scoreExact: score, label, ratio, incomeUsed: 92000, parts: { tenure: 1.3, tenancy: 1.4, refs: 0.8, landlordRef: true, ...parts }, evidence: {}, A: 5, E: 5, R: 5 });
const applicants = [
  { linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations: { employer: { at: '2026-09-02T00:00:00Z', by: 'Sarah Chen' } }, application: { id: 'A1', full_name: 'Priya Sharma', email: 'p@x.ca', phone: '416', owner_token: 'SECRET', job_title: 'Registered Nurse', employer: 'Sunnybrook', years_at_job: '5', annual_income: 92000, prev_landlord_name: 'Gail', references: [{}, {}], number_of_occupants: '1', reason_for_moving: 'x', disclosures: 'y', personality: 'z', cover_letter: 'w', decision_notes: 'n', fit: fit(4.8, 'verified', 34) } },
  { linkId: 'J2', decisionStatus: 'none', withdrawnAt: null, confirmations: {}, application: { id: 'A2', full_name: 'David Kowalski', email: 'd@x.ca', job_title: 'Analyst', employer: 'Acme', years_at_job: '2', annual_income: 80000, references: [], fit: fit(4.1, 'stated', 39, { tenure: 0.9, landlordRef: false, tenancy: 0.2 }) } },
  { linkId: 'J3', decisionStatus: 'reject', withdrawnAt: null, confirmations: {}, application: { id: 'A3', full_name: 'Aside Person', fit: fit(2.0, 'stated', 60) } },
  { linkId: 'J4', decisionStatus: 'none', withdrawnAt: '2026-09-01T00:00:00Z', confirmations: {}, application: { id: 'A4', full_name: 'Gone Person', fit: fit(4.9, 'stated', 20) } },
];

const walk = (v, path, out) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push([`${path}.${k}`, k]); walk(x, `${path}.${k}`, out); } };

test('the payload: active only in score order, the applicant keys, and none of the excluded facts', () => {
  const p = buildSnapshot({ listing, applicants, profile, now: new Date('2026-09-06T12:00:00Z') });
  assert.deepEqual(p.applicants.map((a) => [a.rank, a.name]), [[1, 'Priya Sharma'], [2, 'David Kowalski']], 'set aside and withdrawn never enter');
  const a = p.applicants[0];
  assert.deepEqual(Object.keys(a).sort(), ['confirmations', 'confirmedLine', 'employer', 'firstName', 'fit', 'jobTitle', 'landlordReference', 'lastName', 'linkId', 'name', 'numbers', 'rank', 'reason', 'sentence'].sort());
  assert.deepEqual(a.numbers, { annualIncome: 92000, rentSharePct: 34, yearsAtJob: 5, references: 2 });
  assert.equal(a.sentence, 'Registered Nurse at Sunnybrook, 5 years at the job. Income covers the rent at 34%. Landlord reference on file.');
  assert.equal(a.confirmedLine, 'Confirmed by Sarah Chen: employer · Sep 1');
  assert.ok(p.applicants[1].reason, 'the second applicant carries a reason line');
  const keys = []; walk(p.applicants, 'applicants', keys);
  const banned = ['email', 'phone', 'owner_token', 'ownerToken', 'application_id', 'applicationId', 'id', 'decision_notes', 'decisionNotes', 'number_of_occupants', 'occupants', 'reason_for_moving', 'disclosures', 'personality', 'cover_letter', 'coverLetter'];
  for (const [, k] of keys) assert.equal(banned.includes(k), false, `payload carries ${k}`);
  assert.equal(JSON.stringify(p.applicants).includes('SECRET'), false);
  assert.equal(p.counts.verified, 1); assert.equal(p.counts.applicants, 2);
  assert.equal(p.listing.criteriaLine, 'min $75k · max 40% rent share · 1 yr at job · landlord reference');
  assert.equal(p.realtor.signature, 'Sarah Chen · Demo Realty · 416 555 0100');
  const page = forLandlordPage(p);
  assert.equal(JSON.stringify(page).includes('linkId'), false, 'the page never sees the realtor side mapping');
  assert.equal(JSON.stringify(page).includes('J1'), false);
});

test('the sentence drops each clause when its fact is missing, and never carries a dash', () => {
  assert.equal(reportSentence({ jobTitle: 'Analyst', employer: 'Acme', yearsAtJob: 2, rentSharePct: 39, landlordReference: false }), 'Analyst at Acme, 2 years at the job. Income covers the rent at 39%.');
  assert.equal(reportSentence({ employer: 'Acme', yearsAtJob: 1 }), 'Acme, 1 year at the job.');
  assert.equal(reportSentence({ rentSharePct: 28, landlordReference: true }), 'Income covers the rent at 28%. Landlord reference on file.');
  assert.equal(reportSentence({}), '');
  assert.doesNotMatch(reportSentence({ jobTitle: 'Analyst', employer: 'Acme', yearsAtJob: 2.5, rentSharePct: 39 }), /[-—–]/);
});

test('the token: 32 characters of the alphabet', () => {
  for (let i = 0; i < 50; i++) { const t = newReportToken(); assert.equal(t.length, 32); assert.equal(isReportToken(t), true); }
  assert.equal(isReportToken('DEMO-demo-carlaw'), false); assert.equal(isReportToken('a'.repeat(32)), false); assert.equal(isReportToken(''), false);
});

test('the page: 404 for an unknown token, expired past expiry, opened count and report_opened at most once an hour (source)', () => {
  const src = readFileSync(new URL('../pages/r/[token].js', import.meta.url), 'utf8');
  assert.match(src, /if \(!isReportToken\(token\)\) return \{ notFound: true \}/);
  assert.match(src, /if \(!row\) return \{ notFound: true \}/);
  assert.match(src, /state: 'expired'/);
  assert.match(src, /noteOpened\(admin, row, \{ recordEvent \}\)/);
  const store = readFileSync(new URL('../lib/reportSnapshotStore.js', import.meta.url), 'utf8');
  assert.match(store, /opened_count: \(Number\(row\.opened_count\) \|\| 0\) \+ 1/);
  assert.match(store, /new Date\(now\)\.getTime\(\) - lastOpened > 3600000/);
  assert.match(src, /forLandlordPage\(row\.payload\)/, 'the page renders the stripped payload');
});

test('answers: the route writes answers[rank], records landlord_answered under the realtor, clears the cache (source), and the realtor side reads them', async () => {
  const src = readFileSync(new URL('../pages/api/report/answer.js', import.meta.url), 'utf8');
  assert.match(src, /checkSubmitLimits\(/); assert.match(src, /\[String\(r\)\]: \{ answer, at \}/); assert.match(src, /type: 'landlord_answered'/); assert.match(src, /invalidateSignals\(row\.profile_id\)/);
  const p = buildSnapshot({ listing, applicants, profile });
  const tables = { report_snapshots: [
    { id: 'S0', listing_id: 'L1', token: 'x'.repeat(32), payload: p, answers: {}, opened_count: 0, sent_to_name: 'Marco', created_at: '2026-09-01T00:00:00Z' },
    { id: 'S1', listing_id: 'L1', token: 'y'.repeat(32), payload: p, answers: { 1: { answer: 'meet', at: '2026-09-06T14:00:00Z' }, 2: { answer: 'pass', at: '2026-09-06T14:05:00Z' } }, opened_count: 3, sent_to_name: 'Marco Rossi', created_at: '2026-09-06T00:00:00Z' },
  ] };
  const admin = fakeSupabase(tables);
  const latest = await latestSnapshots(admin, ['L1']);
  assert.equal(latest.get('L1').meta.id, 'S1', 'the newest snapshot wins');
  assert.equal(snapshotLine(latest.get('L1').meta), 'Sent to Marco Rossi · Sep 5 · opened 3 times · 2 answers');
  const apps = [{ linkId: 'J1', listingId: 'L1', application: { full_name: 'Priya Sharma' } }, { linkId: 'J2', listingId: 'L1', application: { full_name: 'David Kowalski' } }, { linkId: 'J9', listingId: 'L1', application: {} }];
  await attachLandlordAnswers(admin, ['L1'], apps);
  assert.deepEqual(apps.map((a) => a.landlordAnswer && a.landlordAnswer.answer), ['meet', 'pass', null]);
  assert.equal(answerLine('meet'), 'wants to meet'); assert.equal(answerLine('pass'), 'not for me');
  const item = landlordAnsweredItem({ id: 'L1', name: 'Carlaw' }, apps);
  assert.equal(item.title, 'Landlord answered'); assert.equal(item.reason, '1 wants to meet'); assert.equal(item.panel, 'report'); assert.equal(item.signature, 'landlord:2026-09-06T14:05:00Z');
  assert.equal(landlordAnsweredItem({ id: 'L2' }, [{ landlordAnswer: null }]), null);
});

test('the text template: greeting, one line per applicant, the link, the sign off, no dashes and no model', () => {
  const p = buildSnapshot({ listing, applicants, profile });
  const t = reportText(p, { pageUrl: 'https://rentletter.ca/r/TOKEN' });
  assert.equal(t.split('\n')[0], 'Hi Marco,');
  assert.match(t, /^1\. Priya Sharma, Fit 4\.8 \(VERIFIED\)\. Registered Nurse at Sunnybrook, 5 years at the job\./m);
  assert.match(t, /Open the report to see them and tell me who you would like to meet: https:\/\/rentletter\.ca\/r\/TOKEN/);
  assert.match(t, /\nSarah Chen\nDemo Realty · 416 555 0100$/);
  assert.doesNotMatch(t, /[—–]/);
  assert.doesNotMatch(readFileSync(new URL('../pages/api/listings/report-text.js', import.meta.url), 'utf8'), /anthropic|Anthropic|messages\.create/);
  assert.ok(demoSnapshot('demo-carlaw').applicants.length >= 3, 'the sandbox builds the same payload');
});

test('send-report: the absent table falls back to the live report with one log line', async () => {
  const src = readFileSync(new URL('../pages/api/listings/send-report.js', import.meta.url), 'utf8');
  assert.match(src, /const pageUrl = snap\.absent \? null : reportPageUrl\(snap\.token\)/);
  assert.match(src, /buildLandlordReportPdf\(\{ payload, fonts/);
  const admin = fakeSupabase({});
  const warned = []; const orig = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  try {
    const r = await insertSnapshot(admin, { listingId: 'L1', profileId: 'P1', payload: { a: 1 }, sentToName: 'M', sentToEmail: 'm@x' });
    assert.deepEqual(r, { absent: true });
    const r2 = await insertSnapshot(admin, { listingId: 'L1', profileId: 'P1', payload: { a: 1 } });
    assert.deepEqual(r2, { absent: true });
  } finally { console.warn = orig; }
  assert.equal(warned.filter((w) => /report-snapshots\] table not set up/.test(w)).length, 1, 'logged once');
});
