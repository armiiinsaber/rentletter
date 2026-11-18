// The fact whitelist and the proved email (docs/design/profile-and-circle.md phase 2;
// lib/profileFacts.js, lib/profileShareStore.js, lib/tenantProfileStore.js,
// db/015-profile-verified-email.sql).
//   · the whitelist is one closed list; the database view holds the same one;
//   · nothing outside it reaches a share payload: every key of the apply form and a set of
//     planted keys (Fit, rank, notes, household, protected grounds) is pushed at the builder,
//     and only the whitelisted ones come out. A new form key fails this test until it is
//     deliberately put on the list or left off it;
//   · every shared fact carries its source and date, and nothing is called verified;
//   · the server's last check refuses a payload it did not build;
//   · the realtor side reads the view, never the table that holds owner tokens;
//   · the email is proved by the magic link or a confirmed change of address, and by nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as F from '../lib/profileFacts.js';
import { readShareableProfile, SHAREABLE_VIEW, SHAREABLE_COLUMNS } from '../lib/profileShareStore.js';
import { EMPTY_FORM } from '../lib/tenantProfile.js';
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, out = []) => { for (const f of readdirSync(join(ROOT, dir))) { const p = `${dir}/${f}`; if (statSync(join(ROOT, p)).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; };

// The list, pinned. Changing it is a decision: this line and the view in db/015 change with it.
const WHITELIST = ['fullName', 'email', 'phone', 'employer', 'jobTitle', 'employmentType', 'yearsAtJob', 'annualIncome', 'previousAddress', 'yearsAtPrevious', 'previousLandlordName', 'previousLandlordContact', 'moveInDate', 'pets'];
// What must never be on it: the score and any rank, a realtor's words, household size, and the
// protected grounds of the Ontario and BC Human Rights Codes or a proxy for one.
const NEVER = [
  'fit', 'fitScore', 'fit_score', 'score', 'scorecard', 'criteria', 'rank', 'ranking', 'priority', 'decision', 'decisionStatus', 'shortlisted', 'recommendation',
  'note', 'notes', 'realtorNote', 'realtorNotes', 'setAsideReason', 'checklist', 'confirmations', 'verified', 'docsVerified',
  'numberOfOccupants', 'occupants', 'household', 'householdSize', 'children', 'dependents', 'familyStatus', 'maritalStatus', 'hasCoApplicant',
  'coApplicantName', 'coApplicantAge', 'coApplicantEmployer', 'coApplicantJobTitle', 'coApplicantIncome', 'coApplicantRelationship',
  'age', 'ageConfirmed', 'dateOfBirth', 'dob', 'gender', 'sex', 'sexualOrientation', 'genderIdentity', 'race', 'ancestry', 'colour', 'ethnicOrigin', 'placeOfOrigin', 'citizenship', 'immigrationStatus',
  'religion', 'creed', 'disability', 'serviceAnimal', 'incomeSource', 'incomeKind', 'publicAssistance', 'sourceOfIncome', 'lawfulSourceOfIncome', 'politicalBelief', 'criminalRecord',
  'smoker', 'netIncome', 'netIncomeSource', 'currentRent', 'businessName', 'reference1Name', 'reference1Contact', 'reference2Name', 'ownerToken', 'owner_token', 'applications', 'coverLetter',
];

test('the whitelist: one closed list, every key a key of the apply form', () => {
  assert.deepEqual([...F.PROFILE_FACT_KEYS], WHITELIST);
  assert.ok(Object.isFrozen(F.PROFILE_FACT_KEYS) && Object.isFrozen(F.PROFILE_FACTS) && F.PROFILE_FACTS.every(Object.isFrozen), 'frozen: nothing adds to it at run time');
  for (const k of F.PROFILE_FACT_KEYS) assert.ok(Object.prototype.hasOwnProperty.call(EMPTY_FORM, k), `${k} is a key the tenant typed`);
  for (const k of NEVER) assert.equal(F.isProfileFactKey(k), false, `${k} is not shareable`);
  assert.deepEqual(F.PROFILE_FACTS.map((f) => f.label), ['Name', 'Email', 'Phone', 'Employer', 'Job title', 'Employment type', 'Time at job', 'Income before tax', 'Current address', 'Time at that address', 'Landlord reference', 'Landlord contact', 'Move in date', 'Pets']);
  // One place: no other file under lib, pages or components declares a list of shareable facts.
  const copies = [...walk('lib'), ...walk('pages'), ...walk('components')].filter((p) => p !== 'lib/profileFacts.js' && /PROFILE_FACT_KEYS\s*=|PROFILE_FACTS\s*=/.test(src(p)));
  assert.deepEqual(copies, []);
});

test('the database view holds the same list, and nothing else of a profile', () => {
  const sql = src('db/015-profile-verified-email.sql');
  const list = /WHERE f\.key IN \(([^)]*)\)/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(list, WHITELIST, 'db/015 and lib/profileFacts.js name the same keys');
  const view = /CREATE OR REPLACE VIEW public\.tenant_profile_shareable[\s\S]*?FROM public\.tenant_profiles p/.exec(sql)[0];
  assert.doesNotMatch(view, /applications|owner|p\.email\b|p\.\*|SELECT \*/, 'the view never selects the application list, an owner token or the whole row');
  assert.match(view, /WITH \(security_invoker = true\)/);
  assert.match(sql, /REVOKE ALL ON public\.tenant_profile_shareable FROM anon, authenticated;/);
  assert.match(sql, /IF to_regclass\('public\.tenant_profiles'\) IS NULL THEN/);
  assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_no_fit_result'\) THEN/);
  for (const l of sql.split('\n').filter((x) => /^\s*ALTER TABLE .* ADD COLUMN/.test(x))) assert.match(l, /ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(sql, /DROP |DELETE |UPDATE public|TRUNCATE/, 'nothing dropped, no row changed');
});

// Every key the form has, and every planted key, each holding a value that names its key.
const planted = () => { const facts = {}; for (const k of new Set([...Object.keys(EMPTY_FORM), ...WHITELIST, ...NEVER])) facts[k] = `value-of-${k}`; return facts; };

test('nothing outside the whitelist reaches a share payload', () => {
  const facts = planted();
  facts.nested = { fitScore: 91, numberOfOccupants: 4 }; facts.fullName = 'Maya Okafor';
  const payload = F.sharePayload({ id: 'P1', facts, factsUpdatedAt: '2026-11-10T15:00:00Z', emailVerifiedAt: '2026-11-12T15:00:00Z', applications: [{ ownerToken: 'OWNERTOKENSECRET' }], notes: 'my strongest applicant', fitScore: 91 }, []);
  assert.deepEqual(Object.keys(payload), ['profileId', 'emailProvedAt', 'facts', 'checks']);
  assert.deepEqual(payload.facts.map((f) => f.key), WHITELIST, 'the whitelisted facts, in the list\'s order');
  for (const f of payload.facts) assert.deepEqual(Object.keys(f), ['key', 'label', 'value', 'source', 'at', 'line']);
  const sent = JSON.stringify(payload);
  for (const k of Object.keys(facts)) if (!WHITELIST.includes(k)) assert.ok(!sent.includes(`value-of-${k}`) && !sent.includes(`"${k}"`), `${k} never leaves the profile`);
  assert.ok(!/OWNERTOKENSECRET|strongest|91|nested/.test(sent), 'nothing else on the row leaves either');
  // The same through the plain filter.
  assert.deepEqual(Object.keys(F.shareableFacts(facts)), WHITELIST);
  assert.deepEqual(F.shareableFacts({ fullName: '  ', numberOfOccupants: '4' }), {}, 'an empty answer is not a fact, and household size is never one');
  assert.deepEqual(F.shareableFacts(null), {}); assert.deepEqual(F.shareableFacts('x'), {});
  // The form itself: a key added to it tomorrow is not shared until it is put on the list.
  const formOnly = Object.keys(EMPTY_FORM).filter((k) => !WHITELIST.includes(k));
  assert.ok(formOnly.includes('numberOfOccupants') && formOnly.includes('smoker') && formOnly.includes('coApplicantRelationship') && formOnly.includes('dateOfBirth'), 'the form still asks things a share never shows');
  assert.equal(F.sharePayload({ facts: Object.fromEntries(formOnly.map((k) => [k, `value-of-${k}`])) }).facts.length, 0);
});

test('every shared fact carries its source and date, and nothing is called verified', () => {
  const payload = F.sharePayload({ id: 'P1', facts: { fullName: 'Maya Okafor', annualIncome: '84000' }, factsUpdatedAt: '2026-11-10T15:00:00Z' }, [
    { kind: 'income_annual_gross', value: { cents: 8400000, incomeKind: 'assistance', employer: 'Northwind' }, read_at: '2026-11-11T04:30:00Z', source_document_id: 'D1', tenant_profile_id: 'P1' },
    { kind: 'identity_name_matches', value: { matches: true, dateOfBirth: '1995-02-03', documentNumber: 'A123', photo: 'x' }, read_at: '2026-11-11T15:00:00Z' },
    { kind: 'date_of_birth', value: { dob: '1995-02-03' }, read_at: '2026-11-11T15:00:00Z' },
    { kind: 'income_annual_gross', value: { source: 'assistance' }, read_at: '2026-11-11T15:00:00Z' },
  ]);
  assert.deepEqual(payload.facts, [
    { key: 'fullName', label: 'Name', value: 'Maya Okafor', source: 'typed', at: '2026-11-10T15:00:00Z', line: 'Typed by the tenant on November 10, 2026' },
    { key: 'annualIncome', label: 'Income before tax', value: '84000', source: 'typed', at: '2026-11-10T15:00:00Z', line: 'Typed by the tenant on November 10, 2026' },
  ]);
  assert.deepEqual(payload.checks, [
    { kind: 'income_annual_gross', label: 'Income before tax', value: { cents: 8400000 }, source: 'document', at: '2026-11-11T04:30:00Z', line: 'Read from a document on November 10, 2026' },
    { kind: 'identity_name_matches', label: 'Name on ID', value: { matches: true }, source: 'document', at: '2026-11-11T15:00:00Z', line: 'Read from a document on November 11, 2026' },
  ], 'the amount without its type, the match without the date of birth or the number; a kind outside the list and a value with nothing allowed are dropped; the date is Toronto\'s');
  assert.equal(F.sourceLine('typed', null), 'Typed by the tenant'); assert.equal(F.sourceLine('document', 'not a date'), 'Read from a document');
  assert.equal(F.sourceLine('anything else', '2026-11-10T15:00:00Z'), 'Typed by the tenant on November 10, 2026', 'an unknown source never reads as a document');
  assert.doesNotMatch(JSON.stringify(payload), /verif/i);
  // No word of the module's output says verified: only its comments explain why.
  const code = src('lib/profileFacts.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /['"`][^'"`\n]*verif/i, 'no string the module can output holds the word');
  assert.deepEqual([...F.PROFILE_CHECK_KINDS], ['identity_name_matches', 'identity_document_current', 'income_annual_gross', 'employer_name', 'employment_start']);
});

test('the server refuses a payload it did not build', () => {
  const good = () => F.sharePayload({ id: 'P1', facts: { fullName: 'Maya Okafor' }, factsUpdatedAt: '2026-11-10T15:00:00Z' }, [{ kind: 'income_annual_gross', value: { cents: 1 }, read_at: '2026-11-11T15:00:00Z' }]);
  assert.equal(F.assertSharePayload(good()).facts.length, 1);
  const bad = (change, what) => { const p = good(); change(p); assert.throws(() => F.assertSharePayload(p), /share payload refused/, what); };
  bad((p) => { p.fitScore = 91; }, 'a key beside the four');
  bad((p) => { p.facts.push({ key: 'numberOfOccupants', label: 'Household', value: '4', source: 'typed', at: null, line: 'Typed by the tenant' }); }, 'a fact outside the whitelist');
  bad((p) => { p.facts[0].note = 'my strongest applicant'; }, 'a note on a fact');
  bad((p) => { p.facts[0].rank = 1; }, 'a rank on a fact');
  bad((p) => { p.facts[0].line = 'Verified'; }, 'a fact called verified');
  bad((p) => { p.facts[0].source = 'realtor'; }, 'a source that is neither');
  bad((p) => { p.facts[0].value = { fitScore: 91 }; }, 'a value that is not text');
  bad((p) => { p.checks[0].kind = 'date_of_birth'; }, 'a check outside the list');
  bad((p) => { p.checks[0].value.incomeKind = 'assistance'; }, 'a key the kind does not allow');
  bad((p) => { p.checks[0].line = 'Verified on November 11, 2026'; }, 'a check called verified');
  bad((p) => { p.checks = null; }, 'no list');
  for (const p of [null, [], 'x']) assert.throws(() => F.assertSharePayload(p), /share payload refused/);
});

test('the realtor side reads the view, never the table that holds owner tokens', async () => {
  assert.equal(SHAREABLE_VIEW, 'tenant_profile_shareable'); assert.equal(SHAREABLE_COLUMNS, 'id, facts, facts_updated_at, email_verified_at');
  const db = fakeSupabase({
    tenant_profile_shareable: [{ id: 'P1', facts: { fullName: 'Maya Okafor', numberOfOccupants: '4' }, facts_updated_at: '2026-11-10T15:00:00Z', email_verified_at: '2026-11-12T15:00:00Z' }],
    tenant_profiles: [{ id: 'P1', email: 'maya@mail.ca', facts: { fullName: 'Maya Okafor', numberOfOccupants: '4' }, applications: [{ ownerToken: 'OWNERTOKENSECRET' }] }],
  });
  const r = await readShareableProfile(db, 'P1');
  assert.deepEqual(r, { ok: true, payload: { profileId: 'P1', emailProvedAt: '2026-11-12T15:00:00Z', facts: [{ key: 'fullName', label: 'Name', value: 'Maya Okafor', source: 'typed', at: '2026-11-10T15:00:00Z', line: 'Typed by the tenant on November 10, 2026' }], checks: [] } }, 'even a view that let a key through is cut down again by the code');
  assert.deepEqual(db.queries.map((q) => [q.table, q.select]), [['tenant_profile_shareable', 'id, facts, facts_updated_at, email_verified_at']], 'one read, of the view, by those columns');
  assert.deepEqual(await readShareableProfile(db, 'missing'), { ok: false, reason: 'not found' });
  assert.deepEqual(await readShareableProfile(null, 'P1'), { ok: false, reason: 'not found' });
  const absent = fakeSupabase({}, { failWhen: () => ({ code: 'PGRST205', message: "Could not find the table 'public.tenant_profile_shareable' in the schema cache" }) });
  assert.deepEqual(await readShareableProfile(absent, 'P1'), { ok: false, reason: 'absent' }, 'before db/015 has run');
  // Nothing else reads the profile table: the tenant's own store, and no realtor route or library.
  const readers = [...walk('lib'), ...walk('pages')].filter((p) => /from\('tenant_profiles'\)/.test(src(p)));
  // lib/adminData.js is the founder office's count of profiles, behind the admin gate: not a realtor.
  assert.deepEqual(readers, ['lib/adminData.js', 'lib/tenantProfileStore.js']);
  assert.doesNotMatch(src('lib/adminData.js'), /from\('tenant_profiles'\)\.select\('[^']*(applications|facts|\*)/, 'and the office reads no facts and no owner token from it');
  const store = src('lib/profileShareStore.js');
  assert.doesNotMatch(store.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /tenant_profiles|owner|applications/);
  for (const dir of ['pages/api/listings', 'pages/api/applicants', 'pages/api/documents', 'pages/api/profile', 'pages/api/pipeline', 'pages/api/events', 'pages/api/assistant']) for (const p of walk(dir)) assert.doesNotMatch(src(p), /tenantProfileStore|tenant_profiles/, `${p} never reaches a tenant's profile`);
});

test('the email is proved by the magic link or a confirmed change of address, and by nothing else', async () => {
  // A KV stand in that keeps a value exactly as it was sent, as Upstash does (a pointer is a
  // quoted string and reads back as one).
  const mem = new Map(); const lists = new Map(); const realFetch = globalThis.fetch;
  const env = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  process.env.KV_REST_API_URL = 'http://kv.exact'; process.env.KV_REST_API_TOKEN = 'test';
  globalThis.fetch = async (url, init = {}) => {
    const seg = String(url).slice('http://kv.exact/'.length).split('/').map(decodeURIComponent); const [cmd, key] = seg;
    const json = (result) => ({ ok: true, status: 200, json: async () => ({ result }) });
    if (cmd === 'set') { mem.set(key, String(init.body)); return json('OK'); }
    if (cmd === 'get') return json(mem.has(key) ? mem.get(key) : null);
    if (cmd === 'del') { mem.delete(key); lists.delete(key); return json(1); }
    if (cmd === 'lpush') { lists.set(key, [seg[2], ...(lists.get(key) || [])]); return json(1); }
    if (cmd === 'lrange') return json(lists.get(key) || []);
    if (cmd === 'incr') { const n = (Number(mem.get(key)) || 0) + 1; mem.set(key, String(n)); return json(n); }
    return json(1);
  };
  const kv = { restore() { globalThis.fetch = realFetch; if (env.url === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = env.url; if (env.token === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = env.token; } };
  try {
    const S = await import('../lib/tenantProfileStore.js');
    const fresh = await S.saveProfile(S.blankProfile('Maya@Mail.ca'), { db: false });
    assert.equal(S.emailVerifiedAt(fresh), null, 'a profile made by a submission has proved nothing');
    assert.equal(S.emailVerifiedAt(null), null);
    const before = Date.now();
    const token = await S.createSession(fresh.id);
    const proved = await S.getProfileById(fresh.id);
    assert.ok(Date.parse(proved.emailVerifiedAt) >= before && proved.lastActiveAt === proved.emailVerifiedAt, 'the session opened by the magic link records the proof and the visit');
    assert.equal(S.emailVerifiedAt(proved), proved.emailVerifiedAt);
    // A session for a profile that is gone still opens; nothing is invented.
    assert.ok(await S.createSession('00000000-0000-4000-8000-000000000000'));
    // Signed in: the profile comes back, and the visit is not rewritten within the day.
    const viaCookie = await S.sessionProfile({ headers: { cookie: `rl_tenant=${encodeURIComponent(token)}` } });
    assert.equal(viaCookie.lastActiveAt, proved.lastActiveAt);
    const stale = { ...proved, lastActiveAt: new Date(Date.now() - S.ACTIVE_TOUCH_MS - 60000).toISOString() };
    await S.saveProfile(stale, { db: false });
    const later = await S.sessionProfile({ headers: { cookie: `rl_tenant=${encodeURIComponent(token)}` } });
    assert.ok(Date.parse(later.lastActiveAt) >= before && later.emailVerifiedAt === proved.emailVerifiedAt, 'a day later the visit is recorded again; the proof keeps its date');
    // A change of address, confirmed from the new address: proved again, now.
    const changed = await S.applyEmailChange(fresh.id, 'maya.k@mail.ca');
    assert.equal(changed.ok, true); assert.equal(changed.profile.email, 'maya.k@mail.ca');
    assert.ok(Date.parse(changed.profile.emailVerifiedAt) >= Date.parse(proved.emailVerifiedAt));
    // Attaching a submitted application proves nothing.
    const attached = await S.attachApplication({ applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'OWNERTOKENSECRETOWNERTOKENSECRET', email: 'omar@mail.ca', createdAt: '2026-11-01T15:00:00Z', tenant: { fullName: 'Omar', email: 'omar@mail.ca' }, employment: {}, rental: {}, apartment: {}, move: {}, household: {}, lifestyle: {}, references: [] });
    assert.equal(S.emailVerifiedAt(attached), null, 'typing an address on an application is not proof of it');
  } finally { kv.restore(); }
  const store = src('lib/tenantProfileStore.js');
  assert.deepEqual([...store.matchAll(/p\.emailVerifiedAt = /g)].length, 2, 'the proof is set in two places: the magic link\'s session and the confirmed change of address');
  assert.match(store, /if \(error && Object\.keys\(extra\)\.length && isMissingProvedColumn\(error\)\) \{/, 'before db/015 the row is written without the new columns');
  // The public shape a tenant's browser gets is unchanged, and the realtor side still gets none of it.
  const client = /export function clientProfile\(p\) \{[\s\S]*?\n\}/.exec(store)[0];
  assert.doesNotMatch(client, /emailVerifiedAt|lastActiveAt/);
});
