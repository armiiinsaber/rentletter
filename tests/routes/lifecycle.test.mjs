// The lifecycle musts (docs/lifecycle-audit-2026-09.md), through the route handlers over the fake
// stack: the submit chain lands when the mirror fails once; the accepted and fell through
// messages go once, with the move; one keep me in mind row per person and listing and never a
// second not selected message; who was not reached comes back by name; a rented invite page
// consent starts pending and is confirmed on /keep; a frozen report refuses answers after a
// reopen; the two audited routes answer 402 when the plan is locked; the tenant's standing line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes, fakeCtx } from '../helpers/fakeStack.mjs';
import { tables, USER, INVITE_TOKEN, ago } from './fixture.mjs';

const generate = (await import('../../pages/api/generate.js')).default;
const tag = (await import('../../pages/api/invite/tag.js')).default;
const mirror = (await import('../../pages/api/applications/mirror.js')).default;
const status = (await import('../../pages/api/listings/status.js')).default;
const consent = (await import('../../pages/api/pipeline/consent.js')).default;
const keepAnswer = (await import('../../pages/api/pipeline/answer.js')).default;
const reportAnswer = (await import('../../pages/api/report/answer.js')).default;
const reportPage = await import('../../pages/r/[token].js');
const eventsRead = (await import('../../pages/api/events/read.js')).default;
const claim = (await import('../../pages/api/referrals/claim.js')).default;
const { runSubmitChain } = await import('../../lib/submitChain.js');
const { standingForApplication } = await import('../../lib/tenantStanding.js');
const { TENANT_LINES } = await import('../../lib/applicantState.js');
const { overrideFeature } = await import('../../lib/features.js');
const { getSupabaseAdminClient } = await import('../../lib/supabase/admin.js');
const { APPLICATION_STATE: A, LISTING_STATE: L } = await import('../../lib/application-state.js');
const { newReportToken } = await import('../../lib/applicationIds.js');
const TOKEN = newReportToken();

const call = async (handler, body, { user, ip } = {}) => { const res = fakeRes(); await handler(fakeReq({ body, ip }), res); return res; };
const FORM = { inviteToken: INVITE_TOKEN, fullName: 'Nadia Test', email: 'nadia@example.com', phone: '416 555 0199', ageConfirmed: true, jobTitle: 'Nurse', employer: 'Northwind Sample Clinic Inc.', yearsAtJob: '3', annualIncome: '90000', moveInDate: '2026-11-01', apartmentAddress: '210 Carlaw Ave, Unit 4', apartmentDescription: '2 BR', mode: 'application' };
let stack;
const up = (t = tables(), user = USER, env = {}) => { if (stack) stack.restore(); stack = installFakeStack({ tables: t, user, env }); return stack; };
const withStates = (states = {}, listingStates = {}) => { const t = tables(); for (const j of t.listing_applicants) if (states[j.id]) j.state = states[j.id]; for (const l of t.listings) if (listingStates[l.id]) l.state = listingStates[l.id]; return { ...t, application_events: [] }; };
const row = (s, id) => s.db.tables.listing_applicants.find((j) => j.id === id);
const sentTo = (s, email) => s.resend.sent.filter((m) => m.to === email);

test('E1: the mirror fails once, the chain retries, and the application lands on the listing once', async () => {
  const s = up(tables(), null);
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2500' }, submissionCount: 0 };
  try {
    const g = await call(generate, FORM);
    assert.equal(g.code, 200, JSON.stringify(g.body));
    const { applicationNumber } = g.body;
    let failed = 0;
    s.db.failWhen = (q) => (q.table === 'applications' && q.op !== 'select' && failed === 0 ? (failed++, { code: 'XX000', message: 'connection reset' }) : null);
    const calls = [];
    const post = async (url, body) => { const h = url === '/api/invite/tag' ? tag : mirror; const r = await call(h, body); calls.push({ url, code: r.code }); return { ok: r.code < 400, status: r.code, json: r.body }; };
    const out = await runSubmitChain({ post, token: INVITE_TOKEN, applicationNumber, sleep: async () => {} });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(calls.map((c) => `${c.url} ${c.code}`), ['/api/invite/tag 200', '/api/applications/mirror 500', '/api/applications/mirror 200'], 'the first mirror failed, the second landed');
    const rows = s.db.tables.applications.filter((a) => a.application_number === applicationNumber);
    assert.equal(rows.length, 1, 'one application row');
    assert.equal(s.db.tables.listing_applicants.filter((j) => String(j.application_id) === String(rows[0].id) && j.listing_id === 'L1').length, 1, 'one junction row under the listing');
    assert.match(out.docRequest.token, /^[a-f0-9]{32}$/);
    // Four failures: the chain reports not done, and nothing claims the application reached the listing.
    let n = 0; s.db.failWhen = (q) => (q.table === 'applications' && q.op !== 'select' && n++ < 4 ? { code: 'XX000', message: 'down' } : null);
    const held = await runSubmitChain({ post, token: INVITE_TOKEN, applicationNumber, sleep: async () => {} });
    assert.equal(held.ok, false); assert.equal(held.step, 'mirror'); assert.equal(held.attempts, 4);
  } finally { s.db.failWhen = null; s.restore(); }
});

test('E2, E23, E11, E27: accepted once, fell through once, one consent row per person and listing, who was not reached', async () => {
  const t = withStates({ J1: A.SHORTLISTED, J2: A.SUBMITTED, J3: A.SUBMITTED, J4: A.SUBMITTED, J5: A.SUBMITTED }, { L1: L.LIVE });
  t.applications.find((a) => a.id === 'A4').email = ''; // in play, no email on file
  t.pipeline_consents.push({ id: 'PC2', profile_id: USER.id, listing_id: 'L1', application_id: 'A2', email: 'ab2b2@example.com', status: 'pending', expires_at: new Date(Date.now() + 40 * 86400000).toISOString(), token: 'k'.repeat(32) });
  const s = up(t);
  try {
    // 1. Mark rented to J1: the accepted message to A1, the not selected message to A5 (A2 already has a row for this listing, A4 has no email, A3 is set aside).
    let r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const accepted = sentTo(s, 'aA1A1@example.com');
    assert.equal(accepted.length, 1); assert.equal(accepted[0].subject, '210 Carlaw Ave, Unit 4: your application was accepted');
    assert.match(accepted[0].text, /^Hi Applicant,\n\nSarah Chen has chosen your application for 210 Carlaw Ave, Unit 4\. They will be in touch about the next steps\./);
    assert.equal(accepted[0].from, 'Sarah Chen via Rentletter <hello@rentletter.ca>'); assert.equal(accepted[0].reply_to, USER.email);
    assert.equal(sentTo(s, 'aB2B2@example.com').length, 0, 'a person with a keep me in mind row for this listing is not mailed again');
    assert.equal(sentTo(s, 'a1.work@example.com').length, 1, 'the not selected message to the one without a row');
    assert.equal(s.db.tables.pipeline_consents.filter((c) => c.listing_id === 'L1').length, 2, 'one new row (A5) beside the one A2 had: never a duplicate');
    assert.deepEqual(r.body.notReached, [{ name: 'Applicant D4D4', reason: 'no_email' }], `who was not reached, by name (${JSON.stringify(r.body)})`);
    assert.equal(r.body.notified, 1); assert.equal(r.body.alreadyAsked, 1);
    // 2. Reopen: the fell through message to A1, once.
    r = await call(status, { listingId: 'L1', status: 'active' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(row(s, 'J1').state, A.FELL_THROUGH);
    const fell = sentTo(s, 'aA1A1@example.com').filter((m) => m.subject === '210 Carlaw Ave, Unit 4: an update');
    assert.equal(fell.length, 1); assert.match(fell[0].text, /The agreement for 210 Carlaw Ave, Unit 4 is not going ahead\. Sarah Chen will reach you directly if anything changes\./);
    assert.deepEqual(r.body.notReached, []);
    // 3. Rented again, to someone outside Rentletter: nobody moves (everyone is already told no), so
    // no accepted and no fell through message; the one who fell through is told the unit went
    // elsewhere, once, and gets a row (the recipient email is lower cased); A2 and A5 have rows
    // already and are never mailed again.
    const before = s.resend.sent.length;
    r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: null });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(sentTo(s, 'aa1a1@example.com').length, 1, 'the one who fell through is told no once');
    assert.equal(sentTo(s, 'aA1A1@example.com').length, 2, 'accepted once and fell through once, nothing more');
    assert.equal(sentTo(s, 'a1.work@example.com').length, 1, 'A5 was asked before: not again');
    assert.equal(sentTo(s, 'aB2B2@example.com').length + sentTo(s, 'ab2b2@example.com').length, 0, 'A2 had a row before anything: never mailed');
    assert.equal(s.resend.sent.length - before, 1, JSON.stringify(r.body));
    assert.equal(s.db.tables.pipeline_consents.filter((c) => c.listing_id === 'L1').length, 3);
    assert.equal(r.body.alreadyAsked, 2); assert.deepEqual(r.body.notReached, []);
    // A fourth rented changes nothing and mails no one.
    r = await call(status, { listingId: 'L1', status: 'active' }); assert.equal(r.code, 200);
    r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: null }); assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(s.resend.sent.length - before, 1, 'the second not selected message to the same person for the same listing never sends'); assert.equal(r.body.alreadyAsked, 3);
  } finally { s.restore(); }
});

test('E15: a rented invite consent starts pending, is mailed a keep link in the realtor\'s name, never duplicates, and is confirmed by the tap', async () => {
  const t = tables(); t.listings.find((l) => l.id === 'L1').invite_token = INVITE_TOKEN;
  const s = up(t, null);
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', profileId: USER.id };
  try {
    let r = await call(consent, { inviteToken: INVITE_TOKEN, email: 'Someone@Example.com' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.message, 'Check your email to confirm.');
    const rows = s.db.tables.pipeline_consents.filter((c) => c.listing_id === 'L1' && c.email === 'someone@example.com');
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending'); assert.equal(rows[0].profile_id, USER.id);
    const mail = s.resend.sent.at(-1);
    assert.equal(mail.to, 'someone@example.com'); assert.equal(mail.subject, '210 Carlaw Ave, Unit 4: confirm keep me in mind'); assert.equal(mail.from, 'Sarah Chen via Rentletter <hello@rentletter.ca>'); assert.equal(mail.reply_to, USER.email);
    assert.ok(mail.text.includes(`/keep/${rows[0].token}`), 'the keep link carries the row token');
    // Asked again: the same row, the link mailed again, no second row.
    r = await call(consent, { inviteToken: INVITE_TOKEN, email: 'someone@example.com' }, { ip: '203.0.113.11' });
    assert.equal(r.code, 200); assert.equal(s.db.tables.pipeline_consents.filter((c) => c.listing_id === 'L1' && c.email === 'someone@example.com').length, 1); assert.equal(s.resend.sent.length, 2);
    // The tap on /keep confirms; a third ask changes nothing and sends nothing.
    r = await call(keepAnswer, { token: rows[0].token, answer: 'yes' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(rows[0].status, 'consented');
    r = await call(consent, { inviteToken: INVITE_TOKEN, email: 'someone@example.com' }, { ip: '203.0.113.12' });
    assert.equal(r.code, 200); assert.equal(r.body.answered, true); assert.equal(s.resend.sent.length, 2);
    assert.equal(s.db.tables.pipeline_consents.filter((c) => c.listing_id === 'L1' && c.email === 'someone@example.com').length, 1);
  } finally { s.restore(); }
});

test('E22: a frozen report says the listing was reopened and refuses an answer after it', async () => {
  const snap = (t) => t.report_snapshots.push({ id: 'S1', listing_id: 'L1', profile_id: USER.id, token: TOKEN, created_at: ago(3), expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), answers: {}, payload: { generatedAt: ago(3), listing: { address: '210 Carlaw Ave, Unit 4' }, realtor: { name: 'Sarah Chen' }, applicants: [{ rank: 1, name: 'Applicant A1A1', fit: null }] } });
  let t = tables(); snap(t);
  let s = up(t, null);
  try {
    assert.equal((await reportPage.getServerSideProps(fakeCtx({ params: { token: TOKEN } }))).props.state, 'ok', 'before any reopen the report opens');
    assert.equal((await call(reportAnswer, { token: TOKEN, rank: 1, answer: 'meet' })).code, 200);
  } finally { s.restore(); }
  t = tables(); snap(t);
  t.events.push({ id: 'e2', profile_id: USER.id, listing_id: 'L1', type: 'listing_updated', payload: { status: 'rented' }, created_at: ago(2) });
  t.events.push({ id: 'e3', profile_id: USER.id, listing_id: 'L1', type: 'listing_updated', payload: { status: 'active' }, created_at: ago(1) });
  s = up(t, null);
  try {
    const props = (await reportPage.getServerSideProps(fakeCtx({ params: { token: TOKEN } }))).props;
    assert.equal(props.state, 'reopened'); assert.equal(props.payload, null);
    const r = await call(reportAnswer, { token: TOKEN, rank: 1, answer: 'meet' });
    assert.equal(r.code, 409); assert.equal(r.body.code, 'reopened'); assert.equal(r.body.error, 'This listing was reopened. Ask your realtor for a fresh report.');
    assert.deepEqual(s.db.tables.report_snapshots[0].answers, {}, 'nothing landed');
  } finally { s.restore(); }
  // A reopen BEFORE the snapshot is not a reopen of this report.
  t = tables(); snap(t); t.events.push({ id: 'e4', profile_id: USER.id, listing_id: 'L1', type: 'listing_updated', payload: { status: 'active' }, created_at: ago(9) });
  s = up(t, null);
  try { assert.equal((await reportPage.getServerSideProps(fakeCtx({ params: { token: TOKEN } }))).props.state, 'ok'); } finally { s.restore(); }
});

test('E36, E37: events/read and referrals/claim answer 402 when the plan is locked, and write when it is not', async () => {
  overrideFeature('referrals', true);
  try {
    let s = up(tables({ plan: 'trial', profileOver: { trial_ends_at: ago(2) } }));
    try {
      assert.equal((await call(eventsRead, {})).code, 402); assert.equal(s.db.tables.event_reads, undefined, 'no watermark row');
      assert.equal((await call(claim, {})).code, 402);
    } finally { s.restore(); }
    const t = tables(); t.event_reads = [];
    s = up(t);
    try { const r = await call(eventsRead, {}); assert.equal(r.code, 200); assert.equal(s.db.tables.event_reads.length, 1); assert.equal(s.db.tables.event_reads[0].profile_id, USER.id); }
    finally { s.restore(); }
    s = up(tables(), null);
    try { assert.equal((await call(eventsRead, {})).code, 401); assert.equal((await call(claim, {})).code, 401); } finally { s.restore(); }
  } finally { overrideFeature('referrals', undefined); }
});

test('E4: the tenant standing line follows the state, then the old columns, and is null with no listing', async () => {
  const s = up(withStates({ J1: A.SHORTLISTED, J2: A.ACCEPTED }, { L1: L.LIVE }));
  try {
    const admin = getSupabaseAdminClient();
    assert.deepEqual((await standingForApplication(admin, 'RL-2026-TEST-A1A1')).line, TENANT_LINES[A.SHORTLISTED]);
    assert.equal((await standingForApplication(admin, 'rl-2026-test-b2b2')).line, 'Accepted. The realtor will be in touch about the next steps.');
    const aside = await standingForApplication(admin, 'RL-2026-TEST-C3C3'); assert.equal(aside.state, A.SUBMITTED); assert.equal(aside.line, 'Not selected for this unit.', 'a set aside row with no state reads from the old columns, as tenantStatusFor does');
    assert.equal(await standingForApplication(admin, 'RL-2026-NONE-0000'), null);
    Object.assign(row(s, 'J1'), { state: A.NOT_SELECTED });
    assert.equal((await standingForApplication(admin, 'RL-2026-TEST-A1A1')).line, 'Not selected for this unit.');
    Object.assign(row(s, 'J1'), { state: A.RECONSIDERED });
    assert.equal((await standingForApplication(admin, 'RL-2026-TEST-A1A1')).line, 'Being looked at again for this unit.');
  } finally { s.restore(); }
});
