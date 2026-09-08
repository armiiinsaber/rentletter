// The second audit's small fixes, each as a behaviour test: the real function or the real route
// handler with a fake client, never a source text match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const res = () => { const r = { code: 0, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const post = (body, ip = '203.0.113.5') => ({ method: 'POST', body, headers: { 'x-forwarded-for': ip }, socket: {} });
const memLimiter = () => { const c = {}; return { incr: async (k) => { c[k] = (c[k] || 0) + 1; return c[k]; }, expire: async () => {} , c }; };

// 1. send.js: signed payload, validation, escaping, IP limit
test('send.js: 401 without or with a wrong signature, 400 on a bad number, escaped fields, 429 by IP, 200 with a fresh signature', async () => {
  process.env.SEND_SECRET = 'test-send-secret';
  const { createHandler } = await import('../pages/api/send.js');
  const { confirmationSignature, verifyConfirmation } = await import('../lib/sendSignature.js');
  const sent = []; const limiter = memLimiter();
  const now = Date.parse('2026-09-08T12:00:00Z');
  const handler = createHandler({ send: async (m) => sent.push(m), limiter, now: () => now });
  const appNum = 'RL-2026-ABCD-EFGH', ownerToken = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
  let r = res(); await handler(post({ email: 'a@b.co', applicationNumber: appNum, ownerToken }), r); assert.equal(r.code, 401, 'no signature');
  r = res(); await handler(post({ email: 'a@b.co', applicationNumber: appNum, ownerToken, signature: { sig: 'ff'.repeat(32), exp: now + 60000 } }), r); assert.equal(r.code, 401, 'wrong signature');
  const good = confirmationSignature({ applicationNumber: appNum, email: 'a@b.co', now });
  r = res(); await handler(post({ email: 'other@b.co', applicationNumber: appNum, ownerToken, signature: good }), r); assert.equal(r.code, 401, 'signed for another email');
  r = res(); await handler(post({ email: 'a@b.co', applicationNumber: 'RL-2026-<b>-EFGH', ownerToken, signature: good }), r); assert.equal(r.code, 400, 'bad number');
  r = res(); await handler(post({ email: 'a@b.co', applicationNumber: appNum, ownerToken: '<script>', signature: good }), r); assert.equal(r.code, 400, 'bad token');
  const late = createHandler({ send: async (m) => sent.push(m), limiter: memLimiter(), now: () => now + 16 * 60000 });
  r = res(); await late(post({ email: 'a@b.co', applicationNumber: appNum, ownerToken, signature: good }), r); assert.equal(r.code, 401, 'expired after 15 minutes');
  r = res(); await handler(post({ email: 'a@b.co', fullName: '<img src=x> Priya', applicationNumber: appNum, ownerToken, uploadUrl: 'https://rentletter.ca/upload/' + 'a'.repeat(32), signature: good }), r);
  assert.equal(r.code, 200); assert.equal(sent.length, 1); assert.equal(sent[0].to, 'a@b.co');
  assert.match(sent[0].html, /&lt;img\./); assert.doesNotMatch(sent[0].html, /<img/); assert.match(sent[0].html, new RegExp(ownerToken)); assert.match(sent[0].html, /upload\/a{32}/);
  assert.equal(verifyConfirmation({ applicationNumber: appNum, email: 'A@B.CO ', exp: good.exp, sig: good.sig }, { now }), true, 'case and whitespace on the email do not matter');
  for (let i = 0; i < 31; i++) { r = res(); await handler(post({ email: 'a@b.co', applicationNumber: appNum, signature: good }, '198.51.100.9'), r); }
  assert.equal(r.code, 429, 'the 31st call from one IP in the hour');
  delete process.env.SEND_SECRET;
  const noKey = createHandler({ send: async (m) => sent.push(m), limiter: memLimiter(), now: () => now });
  r = res(); await noKey(post({ email: 'a@b.co', applicationNumber: appNum, signature: good }), r); assert.equal(r.code, 401, 'no secret configured means nothing is signed and nothing sends');
});

// 2. the realtor upload stores one object and one row per file
test('realtor upload: the real store receives bytes and writes one upload and one row per file', async () => {
  const { analyzeOneFile } = await import('../lib/realtorUpload.js');
  const { storeAnalyzedDocuments } = await import('../lib/documentStore.js');
  const tables = { listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw' }], listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1', doc_verifications: null }], applications: [{ id: 'A1', full_name: 'Priya Nair' }], applicant_documents: [] };
  const admin = fakeSupabase(tables);
  const uploads = []; admin.storage = { from: () => ({ upload: async (path, bytes, opts) => { uploads.push({ path, bytes, opts }); return { data: { path }, error: null }; }, remove: async () => ({ data: [], error: null }) }) };
  const kv = (() => { const m = new Map(); return { get: async (k) => m.get(k) || null, set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } }; })();
  const run = { documents: [{ documentType: 'pay stub', extracted: {} }], comparisons: [], documentNames: [], confidence: 'high' };
  const deps = { admin, userId: 'me', kv, analyze: async () => run, store: (args) => storeAnalyzedDocuments(admin, args) };
  const png = Buffer.from('fake png bytes for the test 0123456789').toString('base64');
  const a = await analyzeOneFile(deps, { listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 0, total: 2, file: { name: 'one.png', type: 'image/png', data: png } });
  const b = await analyzeOneFile(deps, { listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 1, total: 2, file: { name: 'two.png', type: 'image/png', data: png + 'AA==' } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(uploads.length, 2, 'one storage upload per file'); assert.ok(Buffer.isBuffer(uploads[0].bytes), 'bytes, not base64 text'); assert.equal(uploads[0].opts.contentType, 'image/png');
  assert.equal(tables.applicant_documents.length, 2, 'one row per file'); assert.equal(tables.applicant_documents[0].kind, 'pay stub'); assert.equal(tables.applicant_documents[0].uploaded_by, 'realtor');
});

// 3. tenant upload caps
test('tenant analyze-file: a seventh file is refused and the token is rate limited', async () => {
  const { default: handler } = await import('../pages/api/upload/analyze-file.js');
  const token = 'a'.repeat(32);
  const staged = {}; for (let i = 0; i < 6; i++) staged[`f${i}.png::100`] = { index: i, filename: `f${i}.png` };
  const kv = fakeKv({ [`docreq:${token}`]: { linkId: 'J1', listingId: 'L1', applicationId: 'A1' }, [`docreq:${token}:staging`]: { items: staged } });
  try {
    const file = () => ({ name: 'seven.png', type: 'image/png', data: Buffer.from('x'.repeat(64)).toString('base64') }); // the route nulls file.data on refusal, so each call gets a fresh object
    let r = res(); await handler(post({ token, file: file(), index: 6, total: 7 }), r); assert.equal(r.code, 400, 'total above six'); assert.match(r.body.error, /Up to 6 documents/);
    r = res(); await handler(post({ token, file: file(), index: 6 }), r); assert.equal(r.code, 400, 'six already staged'); assert.match(r.body.error, /Up to 6 documents/);
    let last = null; for (let i = 0; i < 9; i++) { last = res(); await handler(post({ token, file: { ...file(), name: `r${i}.png` }, index: 6 }), last); }
    assert.equal(last.code, 429, 'the eleventh call on one token in the hour (two above plus nine here)'); assert.ok(kv.calls.filter((c) => c === 'incr').length >= 11);
  } finally { kv.restore(); }
});

// 4. the public writes
test('tag: limiter, a real number with an app record, the TTL survives the SET', async () => {
  const { createHandler } = await import('../pages/api/invite/tag.js');
  const token = 'b'.repeat(20); const store = { [`linvite:${token}`]: { listingId: 'L1', submissionCount: 1 }, 'app:RL-2026-ABCD-EFGH': { applicationNumber: 'RL-2026-ABCD-EFGH' } };
  const cmds = []; const expires = []; const lim = memLimiter();
  const kv = { get: async (k) => store[k] || null, incr: lim.incr, expire: async (k, s) => { expires.push([k, s]); }, ttl: async () => 1234, command: async (parts, body) => { cmds.push([parts, body]); if (parts[0] === 'set') store[parts[1]] = body; return 'OK'; } };
  const handler = createHandler({ kv, configured: () => true, now: () => Date.parse('2026-09-08T12:00:00Z') });
  let r = res(); await handler(post({ token, applicationNumber: 'RL-2026-<b>-EFGH' }), r); assert.equal(r.code, 400, 'not a real number shape');
  r = res(); await handler(post({ token, applicationNumber: 'RL-2026-ZZZZ-ZZZZ' }), r); assert.equal(r.code, 404, 'no app record');
  r = res(); await handler(post({ token, applicationNumber: 'rl-2026-abcd-efgh' }), r); assert.equal(r.code, 200);
  assert.deepEqual(cmds[0][0], ['lpush', `invite_submissions:${token}`, 'RL-2026-ABCD-EFGH']); assert.deepEqual(cmds[1][0], ['ltrim', `invite_submissions:${token}`, '0', '199']);
  assert.equal(store[`linvite:${token}`].submissionCount, 2); assert.deepEqual(expires.filter(([k]) => k === `linvite:${token}`), [[`linvite:${token}`, 1234]], 'the remaining TTL is set again after the SET');
  let last; for (let i = 0; i < 10; i++) { last = res(); await handler(post({ token, applicationNumber: 'RL-2026-ABCD-EFGH' }), last); }
  assert.equal(last.code, 429, 'the eleventh call on one token');
});

test('mirror: limiter, and applicant_applied is recorded once per application', async () => {
  const { createHandler } = await import('../pages/api/applications/mirror.js');
  const token = 'c'.repeat(20); const appNum = 'RL-2026-ABCD-EFGH';
  const tables = { listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', invite_token: token }], listing_applicants: [], applications: [], profiles: [{ id: 'me', full_name: 'Sarah' }], events: [] };
  const admin = fakeSupabase(tables);
  const events = []; const lim = memLimiter();
  const kv = { get: async (k) => (k === `app:${appNum}` ? { applicationNumber: appNum, email: 'a@b.co', tenant: { fullName: 'Priya Nair' }, employment: {}, rental: {}, apartment: {}, move: {}, household: {}, lifestyle: {}, references: [] } : null), lrange: async () => [appNum], incr: lim.incr, expire: async () => {}, ready: () => false };
  const handler = createHandler({ admin: () => admin, configured: () => true, kv, record: async (_a, listingId, type, extra) => events.push({ listingId, type, ...extra }) });
  let r = res(); await handler(post({ token, applicationNumber: appNum }), r); assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.linked, true);
  r = res(); await handler(post({ token, applicationNumber: appNum }), r); assert.equal(r.code, 200);
  r = res(); await handler(post({ token, applicationNumber: appNum }), r); assert.equal(r.code, 200);
  assert.equal(events.filter((e) => e.type === 'applicant_applied').length, 1, 'three mirrors, one event');
  assert.equal(tables.listing_applicants.length, 1, 'one junction row');
  let last; for (let i = 0; i < 8; i++) { last = res(); await handler(post({ token, applicationNumber: appNum }), last); }
  assert.equal(last.code, 429, 'the eleventh call on one token');
});

// 5. the prefill token is claimed on first read and stripped of co applicant age and relationship
test('prefill: the first read claims the token, a later read needs the nonce, the form carries no co applicant age or relationship', async () => {
  const P = await import('../lib/pipeline.js');
  const { rowToForm } = await import('../lib/pipelinePrefill.js');
  const token = P.newPrefillToken();
  const tables = { applications: [{ id: 'A1', full_name: 'Priya Nair', co_applicant: { name: 'Dev Nair', age: '34', relationship: 'Spouse', employer: 'Acme', jobTitle: 'Nurse', annualIncome: 70000 }, scorecard: null }] };
  const admin = fakeSupabase(tables);
  const kv = fakeKv({ [P.prefillKey(token)]: { applicationId: 'A1', consentId: 'C1' } });
  try {
    const first = await P.readPrefill(admin, token);
    assert.ok(first && first.nonce, 'the first read returns a nonce'); assert.equal(first.application.full_name, 'Priya Nair');
    assert.equal(kv.values[P.prefillKey(token)], undefined, 'the plain token key is gone'); assert.equal(kv.values[P.claimedKey(token)].nonce, first.nonce);
    assert.equal(kv.expires[P.claimedKey(token)], 48 * 3600, 'claimed for 48 hours');
    assert.equal(await P.readPrefill(admin, token), null, 'a second read without the nonce sees nothing');
    assert.equal(await P.readPrefill(admin, token, { nonce: 'wrong' }), null);
    const again = await P.readPrefill(admin, token, { nonce: first.nonce });
    assert.equal(again.application.id, 'A1'); assert.equal(again.nonce, null, 'no new cookie on a return visit');
    const form = rowToForm(first.application);
    assert.equal(form.hasCoApplicant, true); assert.equal(form.coApplicantName, 'Dev Nair'); assert.equal(form.coApplicantIncome, '70000');
    assert.equal(form.coApplicantAge, ''); assert.equal(form.coApplicantRelationship, '');
    assert.equal(form.ageConfirmed, true, 'a stored application counts as age confirmed');
    await P.consumePrefill(token); assert.equal(kv.values[P.claimedKey(token)], undefined);
  } finally { kv.restore(); }
  const { PREFILL_TTL } = await import('../lib/pipelineState.js'); assert.equal(PREFILL_TTL, 48 * 3600);
});

// 6. credentials out of the logs
test('the three public answer routes log six characters of the token, never the whole thing', async () => {
  const { logServerError } = await import('../lib/serverLog.js');
  void logServerError;
  const seen = []; const orig = console.error; console.error = (...a) => seen.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    const kv = fakeKv({});
    const long = 'Q'.repeat(40);
    for (const [path, body] of [['../pages/api/pipeline/answer.js', { token: long, answer: 'yes' }], ['../pages/api/references/answer.js', { token: long, answers: { rented: 'yes' } }]]) {
      const { default: handler } = await import(path);
      const r = res(); await handler(post(body), r);
      assert.equal(r.code, 500, `${path} reaches its catch with no real database`);
    }
    const { default: consent } = await import('../pages/api/pipeline/consent.js');
    const invite = 'd'.repeat(20); kv.values[`linvite:${invite}`] = { profileId: 'me' };
    const r = res(); await consent(post({ inviteToken: invite, email: 'a@b.co' }), r); assert.equal(r.code, 500);
    kv.restore();
    const logged = seen.join('\n');
    assert.doesNotMatch(logged, new RegExp(long), 'the full consent or reference token never reaches the log');
    assert.doesNotMatch(logged, new RegExp(invite), 'the full invite token never reaches the log');
    assert.match(logged, /QQQQQQ/); assert.match(logged, /dddddd/);
  } finally { console.error = orig; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

// 7. co applicant age and relationship are never written
test('the stored record carries a null co applicant age and relationship from both writers', async () => {
  const { buildApplicationFromForm, EMPTY_FORM, formFromApplication } = await import('../lib/tenantProfile.js');
  const rec = buildApplicationFromForm({}, { ...EMPTY_FORM, fullName: 'A', jobTitle: 'J', employer: 'E', annualIncome: '90000', email: 'a@b.co', hasCoApplicant: true, coApplicantName: 'Dev', coApplicantAge: '34', coApplicantRelationship: 'Spouse', coApplicantIncome: '50000' });
  assert.deepEqual(rec.coApplicant, { name: 'Dev', age: null, relationship: null, jobTitle: null, employer: null, annualIncome: 50000 });
  const f = formFromApplication({ coApplicant: { name: 'Dev', age: '34', relationship: 'Spouse', annualIncome: 50000 } });
  assert.equal(f.coApplicantAge, ''); assert.equal(f.coApplicantRelationship, ''); assert.equal(f.coApplicantName, 'Dev');
});

// 8. People through the route handler
test('GET /api/pipeline/people answers the realtor\'s people through the service role client', async () => {
  const { createHandler } = await import('../pages/api/pipeline/people.js');
  const days = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const tables = {
    listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', monthly_rent: 2600, status: 'active' }],
    pipeline_consents: [
      { id: 'C1', profile_id: 'me', listing_id: 'L0', application_id: 'A1', email: 'a1@x.co', status: 'consented', consented_at: days(-3), expires_at: days(50), invites: [] },
      { id: 'C2', profile_id: 'me', listing_id: 'L0', application_id: null, email: 'b@x.co', status: 'consented', consented_at: days(-2), expires_at: days(50), invites: [] },
      { id: 'C3', profile_id: 'them', listing_id: 'L9', application_id: null, email: 'c@x.co', status: 'consented', consented_at: days(-2), expires_at: days(50), invites: [] },
    ],
    applications: [{ id: 'A1', full_name: 'Person One', annual_income: 100000, years_at_job: '3', references: [] }],
    listing_applicants: [],
  };
  const handler = createHandler({ requireRealtor: async () => ({ supabase: fakeSupabase(tables), user: { id: 'me' }, profile: { id: 'me' } }), admin: () => fakeSupabase(tables) });
  const r = res(); await handler({ method: 'GET', headers: {} }, r);
  assert.equal(r.code, 200); assert.equal(r.body.people.length, 2); assert.deepEqual(r.body.people.map((p) => p.id), ['C1', 'C2']);
});

// 9. duplicates off the report
test('the snapshot folds a duplicate application: the sandbox pair yields one Sofia', async () => {
  const { buildDemoApplicants, DEMO_LISTINGS, DEMO_PROFILE } = await import('../lib/demoFixture.js');
  const { markDuplicates } = await import('../lib/duplicates.js');
  const { buildSnapshot } = await import('../lib/reportSnapshot.js');
  const { demoSnapshot } = await import('../lib/demoReport.js');
  const listing = DEMO_LISTINGS.find((l) => l.id === 'demo-carlaw');
  const applicants = markDuplicates(buildDemoApplicants()['demo-carlaw']);
  assert.equal(applicants.filter((a) => a.application.full_name === 'Sofia Russo').length, 2, 'the fixture has the pair');
  const payload = buildSnapshot({ listing, applicants, profile: DEMO_PROFILE });
  assert.equal(payload.applicants.filter((a) => a.name === 'Sofia Russo').length, 1, 'one Sofia on the payload');
  assert.equal(demoSnapshot('demo-carlaw').applicants.filter((a) => a.name === 'Sofia Russo').length, 1, 'the sandbox landlord page agrees');
});

// 10. a stored application never asks the date again
test('rowToForm marks any stored application age confirmed, with or without the flag', async () => {
  const { rowToForm } = await import('../lib/pipelinePrefill.js');
  const { demoPrefillRow } = await import('../lib/demoFixture.js');
  assert.equal(rowToForm({ id: 'A1', full_name: 'Old Row' }).ageConfirmed, true);
  assert.equal(rowToForm({ id: 'A1', full_name: 'New Row', scorecard: { ageConfirmed: true } }).ageConfirmed, true);
  assert.equal(rowToForm({}).ageConfirmed, false, 'an empty row is not an application');
  assert.equal(demoPrefillRow().scorecard.ageConfirmed, true, 'the sandbox row carries the flag');
});

// 11. nudge two's link lives seven days from the nudge
test('runNudges extends docreq:{token} by the request TTL on every nudge', async () => {
  const { runNudges } = await import('../lib/nudges.js');
  const requestedAt = new Date(Date.now() - 3 * 86400000).toISOString();
  const tables = { listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1', decision_status: 'none', withdrawn_at: null, doc_verifications: null }], listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', status: 'active' }], applications: [{ id: 'A1', full_name: 'Priya Nair', email: 'p@x.co' }], profiles: [{ id: 'me', full_name: 'Sarah', email: 's@x.co' }], events: [] };
  const expires = []; const sets = [];
  const kv = { smembers: async () => ['J1'], mget: async () => [{ token: 't'.repeat(32), status: 'requested', requestedAt, nudgedAt: [] }], set: async (k, v, ttl) => sets.push([k, v, ttl]), srem: async () => {}, expire: async (k, s) => expires.push([k, s]), appKey: (id) => `docreq-app:${id}`, reqKey: (t) => `docreq:${t}`, uploadUrl: (t) => `https://rentletter.ca/upload/${t}`, ttl: 7 * 86400 };
  const out = await runNudges({ admin: fakeSupabase(tables), kv, send: async () => {}, recordEvent: async () => true }, { log: () => {} });
  assert.equal(out.sent, 1);
  assert.deepEqual(expires, [[`docreq:${'t'.repeat(32)}`, 7 * 86400]], 'the record TTL is extended to seven days from the nudge');
  assert.equal(sets[0][2], 7 * 86400, 'the pointer keeps its seven day TTL too');
});
