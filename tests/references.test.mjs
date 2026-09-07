// Reference outcome capture: the six questions and the hide rule, the request route's refusals,
// the answer route both ways with the confirmation write, expired and repeat, the GET writing
// nothing, Fit unchanged by any answer set, and the report line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const Q = await import('../lib/referenceQuestions.js');
const S = await import('../lib/referenceStore.js');
const { computeFit } = await import('../lib/fitScore.js');
const { confirmedSummary } = await import('../lib/reportSnapshot.js');

const NOW = new Date('2026-09-09T15:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();
const db = () => ({
  listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', monthly_rent: 2600, pref_rent_to_income_max_pct: 40, pref_requires_landlord_reference: true }, { id: 'L2', profile_id: 'other', name: 'Theirs' }],
  listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1', confirmations: {} }, { id: 'J2', listing_id: 'L2', application_id: 'A2', confirmations: {} }],
  applications: [{ id: 'A1', full_name: 'Priya Sharma', annual_income: 92000, years_at_job: '5', prev_landlord_name: 'Gail Mercer', prev_address: '54 Boston Ave', years_at_previous: '1', references: [{ name: 'A' }], prev_landlord_contact: 'gail.mercer@email.com · (416) 555-0110' }, { id: 'A2', full_name: 'Not Mine' }],
  profiles: [{ id: 'me', full_name: 'Sarah Chen', brokerage: 'Demo Realty' }],
  reference_responses: [],
  events: [],
});

test('the six questions: fixed text, closed options, Prefer not to say on each, No hides 2 to 6', () => {
  assert.equal(Q.QUESTIONS.length, 6);
  assert.deepEqual(Q.QUESTIONS.map((q) => q.text('Priya')), ['Did Priya rent from you?', 'Roughly when?', 'Was rent paid on time?', 'Any damage beyond normal wear?', 'Was proper notice given when they left?', 'Would you rent to them again?']);
  for (const q of Q.QUESTIONS) assert.ok(q.options.some(([c]) => c === Q.PNS), q.key);
  assert.deepEqual(Q.QUESTIONS[2].options.map(([, l]) => l), ['Always', 'Mostly', 'Often late', 'Prefer not to say']);
  assert.equal(Q.visibleQuestions({ rented: 'no' }).length, 1); assert.equal(Q.visibleQuestions({ rented: 'yes' }).length, 6); assert.equal(Q.visibleQuestions({}).length, 6);
  assert.deepEqual(Q.normalizeAnswers({ rented: 'no', rentOnTime: 'always', again: 'yes' }), { rented: 'no', notTheirTenant: true });
  assert.equal(Q.normalizeAnswers({ rented: 'yes', rentOnTime: 'sometimes' }), null, 'an unknown value is refused');
  assert.equal(Q.normalizeAnswers({ rented: 'yes', damage: 'the carpet was ruined' }), null, 'no free text');
  const full = Q.normalizeAnswers({ rented: 'yes', when: { from: { m: 3, y: 2023 }, to: { m: 8, y: 2026 } }, rentOnTime: 'always', damage: 'none', notice: 'yes' }, { now: NOW });
  assert.equal(full.again, Q.PNS, 'a missing answer reads Prefer not to say');
  assert.equal(Q.answerSummary(full), 'Rented from them: Yes · When: Mar 2023 to Aug 2026 · Rent on time: Always · Damage: None · Notice: Yes · Would rent again: no answer');
  assert.equal(Q.answerSummary({ rented: 'no', notTheirTenant: true }), 'Not their tenant');
  const mail = Q.referenceEmail({ applicantName: 'Priya Sharma', realtorName: 'Sarah Chen', brokerage: 'Demo Realty', answerUrl: 'https://rentletter.ca/ref/t' });
  assert.equal(mail.subject, 'A quick reference for Priya S.'); assert.equal(mail.signoff, 'Sarah Chen, Demo Realty'); assert.doesNotMatch(mail.text + mail.html, /[–—]| - /);
  const page = readFileSync(new URL('../pages/ref/[token].js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /<textarea|type="text"/, 'no free text field on the page');
});

test('request: ownership, an email on file, one pending at a time, the row with a 14 day expiry', async () => {
  const tables = db(); const admin = fakeSupabase(tables);
  const first = await S.createRequest(admin, { linkId: 'J1', profileId: 'me', sentTo: 'gail.mercer@email.com', now: NOW });
  assert.equal(first.status, 200); assert.ok(S.isReferenceToken(first.token)); assert.equal(first.row.expires_at, days(14)); assert.equal(first.row.status, 'pending');
  const again = await S.createRequest(admin, { linkId: 'J1', profileId: 'me', sentTo: 'gail.mercer@email.com', now: NOW });
  assert.equal(again.status, 409, 'a pending request under 5 days refuses');
  const later = await S.createRequest(admin, { linkId: 'J1', profileId: 'me', sentTo: 'gail.mercer@email.com', now: new Date(NOW.getTime() + 6 * 86400000) });
  assert.equal(later.status, 200, 'send again after 5 days');
  assert.deepEqual(await S.createRequest(fakeSupabase({ listings: [] }), { linkId: 'J1', profileId: 'me', sentTo: 'x@y.z', now: NOW }).then((r) => r.status), 503, 'absent table');
  const src = readFileSync(new URL('../pages/api/references/request.js', import.meta.url), 'utf8');
  assert.match(src, /withRealtor\(/); assert.match(src, /ownedApplicant\(admin, linkId, user\.id\)/); assert.match(src, /No email on file/); assert.match(src, /reference_requested/);
  assert.doesNotMatch(src, /application\.email|app\.email/, 'the tenant is never emailed');
  assert.equal(Q.emailIn('gail.mercer@email.com · (416) 555-0110'), 'gail.mercer@email.com'); assert.equal(Q.emailIn('416-555-0110'), null);
});

test('answer: the GET reads and writes nothing; the tap writes answers, the confirmation and refuses a repeat; expired refuses', async () => {
  const tables = db(); const admin = fakeSupabase(tables);
  const { token } = await S.createRequest(admin, { linkId: 'J1', profileId: 'me', sentTo: 'g@e.com', now: NOW });
  const before = JSON.stringify(tables);
  const read = await S.readRequest(admin, token, { now: NOW });
  assert.deepEqual([read.found, read.expired, read.answered, read.realtorName, read.applicantName], [true, false, false, 'Sarah Chen', 'Priya Sharma']);
  assert.equal(JSON.stringify(tables), before, 'the read changed nothing');
  const bad = await S.answerRequest(admin, token, { rented: 'yes', rentOnTime: 'whenever' }, { now: NOW });
  assert.equal(bad.status, 400);
  const yes = await S.answerRequest(admin, token, { rented: 'yes', when: { from: { m: 3, y: 2023 }, to: { m: 8, y: 2026 } }, rentOnTime: 'often_late', damage: 'minor', notice: 'no', again: 'no' }, { now: NOW });
  assert.equal(yes.status, 200);
  const row = tables.reference_responses[0];
  assert.equal(row.status, 'answered'); assert.equal(row.answered_at, NOW.toISOString()); assert.equal(row.answers.rentOnTime, 'often_late');
  assert.deepEqual(tables.listing_applicants[0].confirmations, { landlord_reference: { at: NOW.toISOString(), by: 'reference' } });
  assert.equal((await S.answerRequest(admin, token, { rented: 'yes' }, { now: NOW })).status, 409, 'already answered');
  assert.equal((await S.readRequest(admin, token)).answered, true);
  // the No path
  const t2 = (await S.createRequest(admin, { linkId: 'J2', profileId: 'other', sentTo: 'x@y.z', now: NOW })).token;
  const no = await S.answerRequest(admin, t2, { rented: 'no', damage: 'significant' }, { now: NOW });
  assert.equal(no.status, 200); assert.deepEqual(tables.reference_responses[1].answers, { rented: 'no', notTheirTenant: true });
  assert.deepEqual(tables.listing_applicants[1].confirmations, { landlord_reference: { at: NOW.toISOString(), by: 'reference' } });
  // expired
  const t3 = (await S.createRequest(admin, { linkId: 'J1', profileId: 'me', sentTo: 'g@e.com', now: new Date(NOW.getTime() + 6 * 86400000) })).token;
  assert.equal((await S.answerRequest(admin, t3, { rented: 'yes' }, { now: new Date(NOW.getTime() + 30 * 86400000) })).status, 410);
  assert.equal((await S.readRequest(admin, t3, { now: new Date(NOW.getTime() + 30 * 86400000) })).expired, true);
  assert.equal((await S.readRequest(admin, 'not-a-real-token-at-all')).found, false);
  const page = readFileSync(new URL('../pages/ref/[token].js', import.meta.url), 'utf8');
  assert.doesNotMatch(page.split('export default')[0], /\.update\(|\.insert\(/, 'the page never writes on load');
  assert.match(page, /readRequest\(getSupabaseAdminClient\(\), token\)/);
  const route = readFileSync(new URL('../pages/api/references/answer.js', import.meta.url), 'utf8');
  assert.match(route, /checkSubmitLimits/); assert.match(route, /reference_answered/);
});

test('Fit: the emailed confirmation counts exactly as the call; no answer set moves the number', () => {
  const { listings, applications } = db();
  const app = applications[0], listing = listings[0];
  const base = computeFit({ application: app, listing, verification: null, confirmations: {} });
  const called = computeFit({ application: app, listing, verification: null, confirmations: { landlord: { at: days(0), by: 'You' } } });
  const emailed = computeFit({ application: app, listing, verification: null, confirmations: { landlord_reference: { at: days(0), by: 'reference' } } });
  assert.ok(called.scoreExact > base.scoreExact, 'the call adds to R');
  assert.equal(emailed.scoreExact, called.scoreExact, 'the emailed answer counts the same');
  assert.equal(emailed.score, called.score);
  const both = computeFit({ application: app, listing, verification: null, confirmations: { landlord: { at: days(0), by: 'You' }, landlord_reference: { at: days(0), by: 'reference' } } });
  assert.equal(both.scoreExact, called.scoreExact, 'both together add once');
  // the answers themselves are never read by Fit: Always and Often late, None and Significant, No on 1, all identical
  const sets = [
    { rented: 'yes', rentOnTime: 'always', damage: 'none', notice: 'yes', again: 'yes' },
    { rented: 'yes', rentOnTime: 'often_late', damage: 'significant', notice: 'no', again: 'no' },
    { rented: 'no', notTheirTenant: true },
    { rented: Q.PNS, rentOnTime: Q.PNS, damage: Q.PNS, notice: Q.PNS, again: Q.PNS },
  ];
  const scores = sets.map((answers) => computeFit({ application: { ...app, referenceAnswers: answers }, listing, verification: null, confirmations: { landlord_reference: { at: days(0), by: 'reference', answers } } }).scoreExact);
  assert.deepEqual(scores, sets.map(() => called.scoreExact));
  const src = readFileSync(new URL('../lib/fitScore.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /rentOnTime|notTheirTenant|\.answers|answers\[/, 'Fit never reads an answer');
  // a pending request (no confirmation yet) changes nothing
  assert.equal(computeFit({ application: app, listing, verification: null, confirmations: {} }).scoreExact, base.scoreExact);
});

test('the report line lists previous landlord (by email); the answers never reach the snapshot', () => {
  assert.equal(confirmedSummary({ landlord_reference: { at: '2026-09-09T12:00:00Z', by: 'reference' } }), 'Confirmed by the realtor: previous landlord (by email) · Sep 9');
  assert.equal(confirmedSummary({ employer: { at: '2026-09-08T12:00:00Z', by: 'Sarah Chen' }, landlord_reference: { at: '2026-09-09T12:00:00Z', by: 'reference' } }), 'Confirmed by Sarah Chen: employer, previous landlord (by email) · Sep 9');
  const snap = readFileSync(new URL('../lib/reportSnapshot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(snap, /referenceResponse|answerSummary/);
  const pdf = readFileSync(new URL('../lib/landlordReportPdf.js', import.meta.url), 'utf8');
  assert.doesNotMatch(pdf, /referenceResponse|answerSummary/);
});
