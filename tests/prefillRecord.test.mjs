// The reuse record (lib/prefillRecord.js, db/014-prefill-record.sql,
// docs/design/profile-and-circle.md section 5): where a submitted application's answers came
// from, decided by the server at submit and written once.
//   · the columns for a fresh application, a profile reuse, a proved and an unproved email,
//     and a ticket that does not belong to the tenant who submits;
//   · the ticket: single use, 48 hours, holding ids and a hash, never a fact or a token;
//   · the write: once per application, never over a record already there, nothing before db/014;
//   · the mirror writes it, the ticket route hands a ticket only to a caller who can prove the
//     source, and the browser cannot name a source;
//   · the list of sources is the one the migration's CHECK holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as P from '../lib/prefillRecord.js';
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const PROFILE = '7b0f5c1e-1111-4111-8111-000000000001';
const PROVED = '2026-11-10T15:00:00.000Z';
const session = (over = {}) => ({ profileId: PROFILE, email: 'maya@mail.ca', revision: 3, provedAt: PROVED, ...over });
const res = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const post = (body, cookie = '') => ({ method: 'POST', body, headers: { cookie, 'x-forwarded-for': '203.0.113.9' }, socket: {} });

test('the columns: typed fresh, a profile reuse, a proved email, an unproved one', () => {
  assert.deepEqual(P.prefillColumns({ appEmail: 'maya@mail.ca' }), { prefill_source: 'none', prefill_profile_id: null, prefill_profile_revision: null, email_verified_at_submit: null, reused_checks: null }, 'no ticket, nobody signed in: typed fresh, nothing proved');
  assert.deepEqual(P.prefillColumns({ session: session(), appEmail: ' Maya@Mail.ca ' }), { prefill_source: 'none', prefill_profile_id: null, prefill_profile_revision: null, email_verified_at_submit: PROVED, reused_checks: null }, 'typed fresh while signed in: the email is proved, the source is still none');
  const ticket = { source: 'profile', bound: 'session', profileId: PROFILE, revision: 3 };
  assert.deepEqual(P.prefillColumns({ ticket, session: session(), appEmail: 'maya@mail.ca' }), { prefill_source: 'profile', prefill_profile_id: PROFILE, prefill_profile_revision: 3, email_verified_at_submit: PROVED, reused_checks: [] }, 'filled from the signed in profile');
  assert.deepEqual(P.prefillColumns({ ticket, session: session(), appEmail: 'someone.else@mail.ca' }), { prefill_source: 'profile', prefill_profile_id: PROFILE, prefill_profile_revision: 3, email_verified_at_submit: null, reused_checks: [] }, 'the profile was reused, the email on the application is another one: not proved');
  assert.equal(P.prefillColumns({ ticket: { ...ticket, revision: 0 }, session: session(), appEmail: 'maya@mail.ca' }).prefill_profile_revision, 0, 'revision 0 is a revision');
});

test('a profile ticket counts only for the tenant it was made for', () => {
  const ticket = { source: 'profile', bound: 'session', profileId: PROFILE, revision: 3 };
  const fresh = { prefill_source: 'none', prefill_profile_id: null, prefill_profile_revision: null, reused_checks: null };
  const cols = (o) => { const c = P.prefillColumns(o); delete c.email_verified_at_submit; return c; };
  assert.deepEqual(cols({ ticket, session: null, appEmail: 'maya@mail.ca' }), fresh, 'signed out before the submit');
  assert.deepEqual(cols({ ticket, session: session({ profileId: 'another-profile' }), appEmail: 'maya@mail.ca' }), fresh, 'another tenant is signed in');
  assert.deepEqual(cols({ ticket: { ...ticket, profileId: null }, session: session(), appEmail: 'maya@mail.ca' }), fresh, 'no profile in the ticket');
  assert.deepEqual(cols({ ticket: { ...ticket, revision: 'x' }, session: session(), appEmail: 'maya@mail.ca' }), fresh, 'no revision in the ticket');
  assert.deepEqual(cols({ ticket: { ...ticket, bound: 'none' }, session: session(), appEmail: 'maya@mail.ca' }), fresh, 'a profile ticket bound to nobody');
  assert.deepEqual(cols({ ticket: { source: 'reused', profileId: PROFILE, revision: 3 }, session: session(), appEmail: 'maya@mail.ca' }), fresh, 'a source outside the list');
  // Bound to an email (the Pipeline invite filled from the profile, minted on the server).
  const byEmail = { source: 'profile', bound: 'email', profileId: PROFILE, revision: 2, emailKey: P.emailHash('Maya@mail.ca') };
  assert.deepEqual(P.prefillColumns({ ticket: byEmail, appEmail: 'maya@mail.ca' }), { prefill_source: 'profile', prefill_profile_id: PROFILE, prefill_profile_revision: 2, email_verified_at_submit: null, reused_checks: [] }, 'the same email: a reuse, and nothing proved without a session');
  assert.deepEqual(cols({ ticket: byEmail, appEmail: 'omar@mail.ca' }), fresh, 'the email was changed before the submit');
  // The two sources that carry no profile.
  for (const source of ['previous_application', 'pipeline_invite']) assert.deepEqual(cols({ ticket: { source, bound: 'none', profileId: PROFILE, revision: 9 }, appEmail: 'maya@mail.ca' }), { ...fresh, prefill_source: source }, `${source} never names a profile`);
  assert.deepEqual(cols({ ticket: { source: 'pass_on', bound: 'session', profileId: PROFILE, revision: 1 }, session: session(), appEmail: 'maya@mail.ca' }), { prefill_source: 'pass_on', prefill_profile_id: PROFILE, prefill_profile_revision: 1, reused_checks: [] });
});

test('the ticket: minted in KV for 48 hours, read back, single use, holding no fact', async () => {
  const kv = fakeKv({}); process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://kv.test'; process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'test';
  try {
    const id = await P.mintTicket({ source: 'profile', bound: 'session', profileId: PROFILE, revision: 3, email: 'maya@mail.ca', ownerToken: 'OWNERTOKENSECRET', facts: { fullName: 'Maya' } }, { now: () => new Date('2026-11-17T15:00:00Z') });
    assert.ok(P.isTicketId(id), 'a 43 character random id');
    const stored = kv.values[`prefillticket:${id}`];
    assert.deepEqual(typeof stored === 'string' ? JSON.parse(stored) : stored, { source: 'profile', bound: 'session', profileId: PROFILE, revision: 3, emailKey: null, createdAt: '2026-11-17T15:00:00.000Z' }, 'the source, who it is bound to, the profile id and revision: no email, no owner token, no fact');
    assert.equal(P.TICKET_TTL, 48 * 3600);
    assert.equal(kv.expires[`prefillticket:${id}`], P.TICKET_TTL, 'the expiry is set');
    assert.equal((await P.readTicket(id)).source, 'profile');
    await P.deleteTicket(id);
    assert.equal(await P.readTicket(id), null, 'gone after the delete');
    assert.equal(await P.readTicket('not-a-ticket'), null); assert.equal(await P.readTicket(''), null);
    assert.equal(await P.mintTicket({ source: 'typed' }), null, 'no ticket for a source outside the list');
    assert.notEqual(await P.mintTicket({ source: 'pipeline_invite' }), await P.mintTicket({ source: 'pipeline_invite' }), 'every ticket is its own');
  } finally { kv.restore(); }
});

test('the signed in tenant: the session cookie gives the profile, its email and when the address was proved', async () => {
  const kv = fakeKv({ [`tsession:${sha('SESSIONTOKEN')}`]: { profileId: PROFILE, createdAt: PROVED }, [`tprofile_id:${PROFILE}`]: JSON.stringify('emailkey1'), 'tprofile:emailkey1': { id: PROFILE, email: 'Maya@Mail.ca', profileRevision: 3, applications: [{ applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'OWNERTOKENSECRET' }] } });
  try {
    const s = await P.sessionProof({ headers: { cookie: 'other=1; rl_tenant=SESSIONTOKEN' } });
    assert.deepEqual(s, { profileId: PROFILE, email: 'maya@mail.ca', revision: 3, provedAt: PROVED });
    assert.equal(await P.sessionProof({ headers: { cookie: 'rl_tenant=WRONG' } }), null);
    assert.equal(await P.sessionProof({ headers: {} }), null); assert.equal(await P.sessionProof(null), null);
  } finally { kv.restore(); }
});

test('the proof time is the profile\'s email_verified_at when it holds one, else the session\'s', async () => {
  const LATER = '2026-11-14T09:30:00.000Z'; // a change of address confirmed after the session began
  const seed = (profile) => fakeKv({ [`tsession:${sha('SESSIONTOKEN')}`]: { profileId: PROFILE, createdAt: PROVED }, [`tprofile_id:${PROFILE}`]: JSON.stringify('emailkey1'), 'tprofile:emailkey1': { id: PROFILE, email: 'maya@mail.ca', profileRevision: 3, ...profile } });
  const req = { headers: { cookie: 'rl_tenant=SESSIONTOKEN' } };
  let kv = seed({ emailVerifiedAt: LATER });
  try {
    assert.equal((await P.sessionProof(req)).provedAt, LATER, 'the profile\'s own record of when the address was proved');
    // And it is what the application is stamped with at submit.
    const db = fakeSupabase({ applications: [{ id: 'A1', email: 'maya@mail.ca', prefill_source: null }] });
    const out = await P.recordPrefill(db, { applicationId: 'A1', req });
    assert.equal(out.written, true); assert.equal(out.columns.email_verified_at_submit, LATER);
    assert.equal(db.tables.applications[0].email_verified_at_submit, LATER);
  } finally { kv.restore(); }
  for (const profile of [{}, { emailVerifiedAt: null }, { emailVerifiedAt: '' }]) {
    kv = seed(profile);
    try { assert.equal((await P.sessionProof(req)).provedAt, PROVED, 'none on the profile (before db/015, or nothing written): the session, as before'); } finally { kv.restore(); }
  }
  // The proof is read from the profile's record, never by a second reader of the profile table
  // (tests/profileFacts.test.mjs pins who may read tenant_profiles).
  assert.doesNotMatch(src('lib/prefillRecord.js'), /from\('tenant_profiles'\)/);
});

test('the write: once per application, never over a record already there', async () => {
  const tables = { applications: [{ id: 'A1', email: 'maya@mail.ca', owner_token: 'OWNERTOKENSECRET', prefill_source: null }, { id: 'A2', email: 'omar@mail.ca', prefill_source: 'none' }] };
  const admin = fakeSupabase(tables);
  const dropped = [];
  const deps = { read: async (id) => (id === 'T1' ? { source: 'profile', bound: 'session', profileId: PROFILE, revision: 3 } : null), drop: async (id) => dropped.push(id), proof: async () => session() };
  const first = await P.recordPrefill(admin, { applicationId: 'A1', ticketId: 'T1', req: {} }, deps);
  assert.equal(first.written, true);
  assert.deepEqual({ ...tables.applications[0] }, { id: 'A1', email: 'maya@mail.ca', owner_token: 'OWNERTOKENSECRET', prefill_source: 'profile', prefill_profile_id: PROFILE, prefill_profile_revision: 3, email_verified_at_submit: PROVED, reused_checks: [] });
  assert.deepEqual(dropped, ['T1'], 'the ticket is spent');
  // A repeated mirror call: the ticket is gone, and the record stays what it was.
  const again = await P.recordPrefill(admin, { applicationId: 'A1', ticketId: 'T1', req: {} }, { ...deps, read: async () => null });
  assert.deepEqual(again, { written: false, reason: 'already recorded' });
  assert.equal(tables.applications[0].prefill_source, 'profile', 'a reuse never turns into typed fresh');
  assert.deepEqual(await P.recordPrefill(admin, { applicationId: 'A2', req: {} }, deps), { written: false, reason: 'already recorded' });
  assert.deepEqual(await P.recordPrefill(admin, { applicationId: 'missing', req: {} }, deps), { written: false, reason: 'no application' });
  assert.deepEqual(await P.recordPrefill(null, { applicationId: 'A1' }, deps), { written: false, reason: 'no application' });
});

test('before db/014 has run nothing is written and nothing throws', async () => {
  const absent = { code: '42703', message: 'column applications.prefill_source does not exist' };
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: absent }) }) }), update: () => { throw new Error('no write before the columns exist'); } }) };
  assert.deepEqual(await P.recordPrefill(admin, { applicationId: 'A1', ticketId: 'T1', req: {} }, { read: async () => null, drop: async () => {}, proof: async () => null }), { written: false, reason: 'absent' });
  assert.equal(P.prefillAbsent(absent), true); assert.equal(P.prefillAbsent({ code: 'PGRST204', message: "Could not find the 'reused_checks' column" }), true); assert.equal(P.prefillAbsent(null), false);
  const throwing = { from: () => { throw new Error('down'); } };
  assert.deepEqual(await P.recordPrefill(throwing, { applicationId: 'A1' }, {}), { written: false, reason: 'failed' });
});

test('the mirror writes the record: a fresh application, then one filled from the signed in profile', async () => {
  const { createHandler } = await import('../pages/api/applications/mirror.js');
  const token = 'd'.repeat(20);
  const tables = { listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', invite_token: token }], listing_applicants: [], applications: [], profiles: [{ id: 'me', full_name: 'Sarah' }], events: [] };
  const admin = fakeSupabase(tables);
  const apps = { 'RL-2026-ABCD-EFGH': 'maya@mail.ca', 'RL-2026-JKMN-PQRS': 'maya@mail.ca', 'RL-2026-STUV-WXYZ': 'omar@mail.ca' };
  const kv = { get: async (k) => { const n = k.replace(/^app:/, ''); return apps[n] ? { applicationNumber: n, email: apps[n], tenant: { fullName: 'A Tenant', email: apps[n] }, employment: {}, rental: {}, apartment: {}, move: {}, household: {}, lifestyle: {}, references: [] } : null; }, lrange: async () => Object.keys(apps), incr: async () => 1, expire: async () => {}, ready: () => false };
  const seen = [];
  const tickets = { TICKET1: { source: 'profile', bound: 'session', profileId: PROFILE, revision: 3 } };
  const prefill = (a, o) => { seen.push(o.ticketId); return P.recordPrefill(a, o, { read: async (id) => tickets[id] || null, drop: async (id) => { delete tickets[id]; }, proof: async (req) => (/rl_tenant=MAYA/.test(req.headers.cookie || '') ? session() : null) }); };
  const handler = createHandler({ admin: () => admin, configured: () => true, kv, record: async () => {}, prefill });
  const row = (n) => tables.applications.find((a) => a.application_number === n);
  let r = res(); await handler(post({ token, applicationNumber: 'RL-2026-STUV-WXYZ' }), r); assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(row('RL-2026-STUV-WXYZ').prefill_source, 'none', 'typed fresh, nobody signed in'); assert.equal(row('RL-2026-STUV-WXYZ').email_verified_at_submit, null);
  r = res(); await handler(post({ token, applicationNumber: 'RL-2026-ABCD-EFGH', prefillTicket: 'TICKET1' }, 'rl_tenant=MAYA'), r); assert.equal(r.code, 200);
  assert.deepEqual([row('RL-2026-ABCD-EFGH').prefill_source, row('RL-2026-ABCD-EFGH').prefill_profile_id, row('RL-2026-ABCD-EFGH').prefill_profile_revision, row('RL-2026-ABCD-EFGH').email_verified_at_submit], ['profile', PROFILE, 3, PROVED]);
  assert.equal(tickets.TICKET1, undefined, 'the ticket is spent');
  // The retry of the same mirror, and a second application that tries the spent ticket.
  r = res(); await handler(post({ token, applicationNumber: 'RL-2026-ABCD-EFGH', prefillTicket: 'TICKET1' }, 'rl_tenant=MAYA'), r); assert.equal(r.code, 200);
  assert.equal(row('RL-2026-ABCD-EFGH').prefill_source, 'profile', 'a retry leaves the record');
  r = res(); await handler(post({ token, applicationNumber: 'RL-2026-JKMN-PQRS', prefillTicket: 'TICKET1' }, 'rl_tenant=MAYA'), r); assert.equal(r.code, 200);
  assert.deepEqual([row('RL-2026-JKMN-PQRS').prefill_source, row('RL-2026-JKMN-PQRS').prefill_profile_id, row('RL-2026-JKMN-PQRS').email_verified_at_submit], ['none', null, PROVED], 'a spent ticket buys nothing: typed fresh, with the email still proved');
  assert.deepEqual(seen, [null, 'TICKET1', 'TICKET1', 'TICKET1']);
  // The answer to the browser carries nothing of the record.
  assert.doesNotMatch(JSON.stringify(r.body), /prefill|profile|verified/);
});

test('the ticket route: a ticket only for a source the caller can prove', async () => {
  const { default: handler } = await import('../pages/api/tenant/prefill-ticket.js');
  const kv = fakeKv({
    [`tsession:${sha('SESSIONTOKEN')}`]: { profileId: PROFILE, createdAt: PROVED }, [`tprofile_id:${PROFILE}`]: JSON.stringify('emailkey1'), 'tprofile:emailkey1': { id: PROFILE, email: 'maya@mail.ca', profileRevision: 3 },
    'app:RL-2026-ABCD-EFGH': { applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'OWNERTOKENSECRETOWNERTOKENSECRET' },
    'app:RL-2026-JKMN-PQRS': { applicationNumber: 'RL-2026-JKMN-PQRS', ownerToken: 'OWNERTOKENSECRETOWNERTOKENSECRET', revoked: true },
  });
  process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://kv.test'; process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'test';
  const stored = (id) => { const v = kv.values[`prefillticket:${id}`]; return typeof v === 'string' ? JSON.parse(v) : v; };
  try {
    let r = res(); await handler({ method: 'GET', headers: {} }, r); assert.equal(r.code, 405);
    r = res(); await handler(post({ source: 'profile' }), r); assert.deepEqual([r.code, r.body], [200, { ok: false }], 'nobody signed in: no ticket');
    r = res(); await handler(post({ source: 'profile', profileId: 'another', revision: 99 }, 'rl_tenant=SESSIONTOKEN'), r);
    assert.equal(r.body.ok, true); assert.deepEqual(Object.keys(r.body).sort(), ['ok', 'ticket']);
    const t = stored(r.body.ticket);
    assert.deepEqual([t.source, t.bound, t.profileId, t.revision], ['profile', 'session', PROFILE, 3], 'the profile and revision are the session\'s, whatever the body says');
    r = res(); await handler(post({ source: 'previous_application', applicationNumber: 'rl-2026-abcd-efgh', ownerToken: 'OWNERTOKENSECRETOWNERTOKENSECRET' }), r);
    assert.equal(r.body.ok, true); assert.deepEqual([stored(r.body.ticket).source, stored(r.body.ticket).profileId], ['previous_application', null]);
    assert.ok(!JSON.stringify(stored(r.body.ticket)).includes('OWNERTOKENSECRET'), 'the owner token is compared, never kept');
    r = res(); await handler(post({ source: 'previous_application', applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'WRONG' }), r); assert.deepEqual(r.body, { ok: false });
    r = res(); await handler(post({ source: 'previous_application', applicationNumber: 'RL-2026-JKMN-PQRS', ownerToken: 'OWNERTOKENSECRETOWNERTOKENSECRET' }), r); assert.deepEqual(r.body, { ok: false }, 'a revoked application fills nothing');
    r = res(); await handler(post({ source: 'pipeline_invite', token: 'nope' }), r); assert.deepEqual(r.body, { ok: false });
    for (const source of ['pass_on', 'none', 'anything', undefined]) { r = res(); await handler(post({ source }), r); assert.deepEqual(r.body, { ok: false }, `${source}: not a source a browser can ask for`); }
  } finally { kv.restore(); }
});

test('the browser never names the source, and no realtor route touches a ticket', () => {
  const apply = src('pages/apply/[token].js');
  assert.doesNotMatch(apply, /prefill_source|prefillSource\s*:/, 'the apply page sends a ticket, never a source');
  assert.match(apply, /url === '\/api\/applications\/mirror' && prefillTicket\.current \? \{ \.\.\.body, prefillTicket: prefillTicket\.current \} : body/);
  assert.doesNotMatch(src('pages/api/generate.js'), /prefill/i, 'the application record the tenant submits holds no source');
  const mirror = src('pages/api/applications/mirror.js');
  assert.match(mirror, /await prefill\(admin, \{ applicationId, ticketId: req\.body\?\.prefillTicket \|\| null, req \}\);/);
  assert.doesNotMatch(mirror, /req\.body\?\.(prefill_source|prefillSource|profileId)/);
  for (const dir of ['pages/api/listings', 'pages/api/applicants', 'pages/api/referrals', 'pages/api/pipeline', 'pages/api/documents', 'pages/api/profile']) {
    for (const f of readdirOf(dir)) assert.doesNotMatch(src(`${dir}/${f}`), /prefillTicket|prefillticket:|mintTicket|readTicket/, `${dir}/${f}`);
  }
  const lib = src('lib/prefillRecord.js');
  assert.doesNotMatch(lib, /owner_token|ownerToken/, 'the record and the ticket never hold an owner token');
});
function readdirOf(dir) { return readdirSyncSafe(new URL(`../${dir}/`, import.meta.url)); }
import { readdirSync } from 'node:fs';
function readdirSyncSafe(u) { return readdirSync(u).filter((f) => f.endsWith('.js')); }

test('the list of sources is the one the migration holds, and the migration is guarded', () => {
  const sql = src('db/014-prefill-record.sql');
  const list = /prefill_source IS NULL OR prefill_source IN \(([^)]*)\)/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(list, [...P.PREFILL_SOURCES]);
  assert.deepEqual([...P.PROFILE_SOURCES], ['profile', 'pass_on']);
  const statements = sql.split('\n').filter((l) => /^(ALTER TABLE|CREATE)/.test(l));
  for (const l of statements) assert.match(l, /IF NOT EXISTS/, l);
  for (const name of ['applications_prefill_source_check', 'applications_prefill_profile_pair', 'applications_prefill_record_whole']) assert.match(sql, new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_constraint WHERE conname = '${name}'\\) THEN\\s+ALTER TABLE public\\.applications ADD CONSTRAINT ${name} `));
  assert.doesNotMatch(sql, /REFERENCES|DROP |DELETE |UPDATE public/, 'no foreign key, nothing dropped, no row changed');
});
