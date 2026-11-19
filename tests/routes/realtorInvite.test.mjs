// Invite a realtor (lib/realtorInvite.js, lib/signupSource.js, pages/api/profile/invite.js,
// pages/join/index.js, db/017-realtor-invites.sql): every realtor has one invite link, and a
// realtor who signs up from it is recorded as invited by the link's owner. One level, no reward.
//   · the invite is credited on a completed signup, through the one first touch path;
//   · a visit alone credits nobody;
//   · a realtor can never be credited as inviting themselves;
//   · the credit cannot change after signup, from the callback or from the profile route;
//   · a realtor reads their own link and their own list, never another realtor's;
//   · the route is a realtor write: session, entitlement, and every query keyed by the caller;
//   · the app works before db/017 has run.
// The tenant referral system (pages/api/referrals, lib/referrals.js) shares nothing with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes, fakeDb } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER } from './fixture.mjs';

const S = await import('../../lib/signupSource.js');
const R = await import('../../lib/realtorInvite.js');
const W = await import('../../lib/realtorWrites.js');
const invite = (await import('../../pages/api/profile/invite.js')).default;
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(`../../${dir}`, import.meta.url))) { const p = `${dir}/${f}`; if (statSync(new URL(`../../${p}`, import.meta.url)).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; };

const CODE = { sarah: 'K7M2Q9XW4TPB3HNC', other: 'B7M2Q9XW4TPB3HNC', nobody: 'Z7M2Q9XW4TPB3HNZ' };
const NEW = { id: 'realtor-new', email: 'maya@brokerage.ca' };
// Sarah and another realtor, each with a code, and a profile that has just been created.
const world = (over = {}) => {
  const t = tables();
  const sarah = t.profiles.find((p) => p.id === USER.id);
  Object.assign(sarah, { invite_code: CODE.sarah, invited_by: null, signup_source: 'direct' });
  if (!t.profiles.some((p) => p.id === OTHER.id)) t.profiles.push({ id: OTHER.id, email: OTHER.email, full_name: 'Other Realtor', plan: 'founding', created_at: '2026-05-01T15:00:00Z' });
  Object.assign(t.profiles.find((p) => p.id === OTHER.id), { invite_code: CODE.other, invited_by: null, signup_source: 'direct' });
  t.profiles.push({ id: NEW.id, email: NEW.email, full_name: 'Maya Kowalski', plan: 'trial', created_at: '2026-11-18T15:00:00Z', invite_code: null, invited_by: null, signup_source: null, stripe_customer_id: 'cus_SECRET', ...over });
  return t;
};
const row = (t, id) => t.profiles.find((p) => p.id === id);
const call = async (t, user, body = {}) => {
  const s = installFakeStack({ tables: t, user });
  try { const res = fakeRes(); await invite(fakeReq({ body }), res); return { res, s }; } finally { s.restore(); }
};

test('the invite link is a first touch: /join?invite=<code> is kept as ref:<code>, and replaces a word that is not a realtor\'s code', () => {
  assert.equal(S.classifyFirstTouch('/join', `?invite=${CODE.sarah}`), `ref:${CODE.sarah}`);
  assert.equal(S.classifyFirstTouch('/join/', `?invite=${CODE.sarah}&utm_source=x`), `ref:${CODE.sarah}`);
  assert.ok(S.isSignupSource(`ref:${CODE.sarah}`), 'the word passes the list db/013 checks: no new pattern');
  assert.equal(S.inviteCodeOf(`ref:${CODE.sarah}`), CODE.sarah);
  for (const bad of ['', 'short', CODE.sarah.toLowerCase(), `${CODE.sarah}X`, 'K7M2Q9XW4TPB3HN0', 'realtor-1', 'sarah@example.com', '../admin']) {
    assert.equal(S.isInviteCode(bad), false, bad);
    assert.equal(S.classifyFirstTouch('/join', `?invite=${encodeURIComponent(bad)}`), 'direct', `${bad}: not a code, an ordinary landing`);
  }
  assert.equal(S.classifyFirstTouch('/', `?invite=${CODE.sarah}`), 'direct', 'only on /join');
  assert.equal(S.inviteCodeOf('ref:maya-k'), null); assert.equal(S.inviteCodeOf('apply'), null); assert.equal(S.inviteCodeOf(null), null);
  // The cookie: the first touch is the first, except that an invite link takes the place of a word that is not a code.
  assert.equal(S.firstTouchToSet(null, `ref:${CODE.sarah}`), `ref:${CODE.sarah}`);
  assert.equal(S.firstTouchToSet('direct', `ref:${CODE.sarah}`), `ref:${CODE.sarah}`, 'the link a person signs up from is the one credited');
  assert.equal(S.firstTouchToSet('ref:maya-k', `ref:${CODE.sarah}`), `ref:${CODE.sarah}`);
  assert.equal(S.firstTouchToSet(`ref:${CODE.sarah}`, `ref:${CODE.other}`), null, 'a code already held stays');
  assert.equal(S.firstTouchToSet(`ref:${CODE.sarah}`, 'direct'), null);
  assert.equal(S.firstTouchToSet('apply', 'report'), null, 'any other first touch is never overwritten');
  assert.equal(S.firstTouchToSet('apply', null), null); assert.equal(S.firstTouchToSet(null, 'direct'), 'direct');
  assert.match(src('lib/signupSource.js'), /const source = firstTouchToSet\(readFirstTouch\(document\.cookie\), classifyFirstTouch\(window\.location\.pathname, window\.location\.search\)\);/);
});

test('the invite is credited on a completed signup: the word the form sent, the callback\'s one write, the owner of the code', async () => {
  const t = world(); const db = fakeDb(t);
  // What the callback does (pages/auth/callback.js): the word for the new account, then the one write.
  const user = { id: NEW.id, created_at: '2026-11-18T15:00:00Z', user_metadata: { signup_source: `ref:${CODE.sarah}` } };
  const word = S.signupSourceFor(user, '', Date.parse('2026-11-18T15:05:00Z'));
  assert.equal(word, `ref:${CODE.sarah}`);
  assert.equal(await S.recordSignupSource(db, NEW.id, word), true);
  assert.equal(row(t, NEW.id).invited_by, USER.id, 'invited by the owner of the code');
  assert.equal(row(t, NEW.id).signup_source, `ref:${CODE.sarah}`);
  assert.equal(db.updates.length, 1, 'the word and the credit in one write');
  assert.deepEqual(db.updates[0].payload, { signup_source: `ref:${CODE.sarah}`, invited_by: USER.id });
  assert.equal(row(t, USER.id).invited_by, null); assert.equal(row(t, OTHER.id).invited_by, null, 'nobody else is touched');
  // From the cookie instead (the form sent nothing): the same path.
  const t2 = world(); const db2 = fakeDb(t2);
  const fromCookie = S.signupSourceFor({ id: NEW.id, created_at: '2026-11-18T15:00:00Z', user_metadata: {} }, `${S.FIRST_TOUCH_COOKIE}=${encodeURIComponent(`ref:${CODE.other}`)}`, Date.parse('2026-11-18T15:05:00Z'));
  await S.recordSignupSource(db2, NEW.id, fromCookie);
  assert.equal(row(t2, NEW.id).invited_by, OTHER.id);
  // The wiring is the existing one: the callback's call is unchanged, and never runs on a recovery link.
  const cb = src('pages/auth/callback.js');
  assert.match(cb, /if \(!recovery && process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/);
  assert.match(cb, /recordSignupSource\(getSupabaseAdminClient\(\), data\.user\.id, signupSourceFor\(data\.user, ctx\.req\.headers\.cookie\)\)/);
  assert.doesNotMatch(cb, /invited_by|invite_code/, 'the callback has no second path');
  // invited_by is written in exactly one place in the app.
  const writers = [...walk('lib'), ...walk('pages'), ...walk('components')].filter((p) => /invited_by:/.test(code(p)) && /\.update\(/.test(code(p)));
  assert.deepEqual(writers, ['lib/signupSource.js']);
});

test('a visit alone credits nobody', async () => {
  const t = world(); const before = JSON.stringify(t.profiles);
  // The landing page reads no database and writes nothing: it has no server client at all.
  const page = code('pages/join/index.js');
  assert.doesNotMatch(page, /supabase|getSupabase|admin|fetch\(|Set-Cookie|\.update\(|\.insert\(/i);
  const { default: Join, getServerSideProps } = await import('../../pages/join/index.js');
  assert.equal(typeof Join, 'function');
  const res = fakeRes();
  assert.deepEqual(await getServerSideProps({ query: { invite: CODE.sarah }, res }), { props: {} });
  assert.deepEqual(await getServerSideProps({ query: { invite: 'nope' }, res }), { redirect: { destination: '/signup', permanent: false } });
  assert.deepEqual(await getServerSideProps({ query: {}, res }), { redirect: { destination: '/signup', permanent: false } });
  assert.equal(JSON.stringify(t.profiles), before);
  // Sarah opens her invite section after the visit: nobody is on the list.
  const { res: r } = await call(t, USER);
  assert.equal(r.code, 200); assert.deepEqual(r.body.invited, []);
  // A realtor who already has an account and opens someone's link is not credited either: the
  // write is guarded by the empty first touch, which a completed signup has already filled.
  const db = fakeDb(t);
  await S.recordSignupSource(db, OTHER.id, `ref:${CODE.sarah}`);
  assert.equal(row(t, OTHER.id).invited_by, null); assert.equal(row(t, OTHER.id).signup_source, 'direct');
  // And an account more than a week old never takes a word from the cookie at all.
  assert.equal(S.signupSourceFor({ id: OTHER.id, created_at: '2026-05-01T15:00:00Z', user_metadata: {} }, `${S.FIRST_TOUCH_COOKIE}=${encodeURIComponent(`ref:${CODE.sarah}`)}`, Date.parse('2026-11-18T15:00:00Z')), null);
});

test('a self invite is refused: a realtor is never credited as inviting themselves, and it is not counted as a referral', async () => {
  const t = world({ invite_code: CODE.nobody }); const db = fakeDb(t);
  assert.equal(await S.recordSignupSource(db, NEW.id, `ref:${CODE.nobody}`), true);
  assert.equal(row(t, NEW.id).invited_by, null, 'no credit');
  assert.equal(row(t, NEW.id).signup_source, 'direct', 'and the first touch is written as direct');
  assert.equal(db.updates.some((u) => 'invited_by' in u.payload), false, 'invited_by was never in a write');
  // A code that belongs to nobody credits nobody.
  const t2 = world(); const db2 = fakeDb(t2);
  await S.recordSignupSource(db2, NEW.id, 'ref:A7M2Q9XW4TPB3HNA');
  assert.equal(row(t2, NEW.id).invited_by, null); assert.equal(row(t2, NEW.id).signup_source, 'direct');
  // The database refuses it as well (db/017).
  const sql = src('db/017-realtor-invites.sql');
  assert.match(sql, /CONSTRAINT profiles_not_invited_by_self CHECK \(invited_by IS NULL OR invited_by <> id\)/);
});

test('the credit cannot change after signup', async () => {
  const t = world(); const db = fakeDb(t);
  await S.recordSignupSource(db, NEW.id, `ref:${CODE.sarah}`);
  assert.equal(row(t, NEW.id).invited_by, USER.id);
  // A later callback with another realtor's code, with no code, and with a plain word.
  for (const later of [`ref:${CODE.other}`, 'direct', 'apply', 'ref:A7M2Q9XW4TPB3HNA']) {
    await S.recordSignupSource(db, NEW.id, later);
    assert.equal(row(t, NEW.id).invited_by, USER.id, `${later}: the credit is what it was`);
    assert.equal(row(t, NEW.id).signup_source, `ref:${CODE.sarah}`, `${later}: and so is the first touch`);
  }
  // A realtor who signed up with no invite can never be given one afterwards.
  const t2 = world(); const db2 = fakeDb(t2);
  await S.recordSignupSource(db2, NEW.id, 'direct');
  await S.recordSignupSource(db2, NEW.id, `ref:${CODE.sarah}`);
  assert.equal(row(t2, NEW.id).invited_by, null); assert.equal(row(t2, NEW.id).signup_source, 'direct');
  // The realtor's own profile route writes neither column, whatever the body names.
  const admin = fakeDb(t);
  const r = await W.updateProfile({ admin, userId: NEW.id, profile: row(t, NEW.id), invalidate: () => {} }, { full_name: 'Maya K', invited_by: OTHER.id, invite_code: CODE.nobody });
  assert.equal(r.status, 200); assert.equal(row(t, NEW.id).full_name, 'Maya K');
  assert.equal(row(t, NEW.id).invited_by, USER.id); assert.equal(row(t, NEW.id).invite_code, null);
  // The invite route never writes the credit and writes a code only while there is none.
  const lib = code('lib/realtorInvite.js');
  assert.doesNotMatch(lib, /invited_by:/, 'lib/realtorInvite.js never writes invited_by');
  assert.match(lib, /\.update\(\{ invite_code: newInviteCode\(\) \}\)\.eq\('id', userId\)\.is\('invite_code', null\)/);
  // And the database keeps both columns from the browser roles and keeps a set value from any role (db/017, proved by verify:migrations).
  const sql = src('db/017-realtor-invites.sql');
  assert.match(sql, /IF current_user IN \('anon', 'authenticated'\) THEN\s+NEW\.invite_code := OLD\.invite_code; NEW\.invited_by := OLD\.invited_by;/);
  assert.match(sql, /CREATE TRIGGER profiles_keep_invite BEFORE INSERT OR UPDATE ON public\.profiles/);
});

test('the invite section: a realtor\'s own stable link, and the realtors who joined through it by name and date only', async () => {
  const t = world();
  Object.assign(row(t, USER.id), { invite_code: null }); // from before db/017: no code until the section is opened
  Object.assign(row(t, NEW.id), { invited_by: USER.id, signup_source: `ref:${CODE.sarah}` });
  t.profiles.push({ id: 'realtor-older', email: 'older@brokerage.ca', full_name: '', plan: 'founding', created_at: '2026-10-02T15:00:00Z', invited_by: USER.id, invite_code: null });
  const { res, s } = await call(t, USER);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.available, true);
  assert.ok(S.isInviteCode(res.body.code), 'a code was made on the first open');
  assert.equal(row(t, USER.id).invite_code, res.body.code);
  assert.equal(res.body.link, `https://rentletter.ca/join?invite=${res.body.code}`);
  assert.notEqual(res.body.code, USER.id); assert.ok(!res.body.code.toLowerCase().includes('sarah'), 'not the id, not the email');
  assert.deepEqual(res.body.invited, [{ name: 'Maya Kowalski', joinedAt: '2026-11-18T15:00:00Z' }, { name: null, joinedAt: '2026-10-02T15:00:00Z' }], 'newest first, name and join date');
  assert.deepEqual(Object.keys(res.body).sort(), ['available', 'code', 'invited', 'link']);
  const sent = JSON.stringify(res.body);
  for (const never of [NEW.email, NEW.id, 'cus_SECRET', 'trial', 'older@brokerage.ca', 'realtor-older', 'listing', 'applicant']) assert.ok(!sent.includes(never), `the answer never holds ${never}`);
  // The list reads two columns and no other.
  const lists = s.db.queries.filter((q) => q.table === 'profiles' && (q.filters || []).some((f) => f[1] === 'invited_by'));
  assert.deepEqual([...new Set(lists.map((q) => q.select))], ['full_name, created_at']);
  // Stable: a second open answers the same code and writes nothing.
  const again = await call(t, USER);
  assert.equal(again.res.body.code, res.body.code);
  assert.equal(again.s.db.updates.length, 0, 'no write once the code exists');
  // 16 characters from the alphabet with no look alikes, different every time, from the system's random source.
  const made = new Set(Array.from({ length: 200 }, () => R.newInviteCode()));
  assert.equal(made.size, 200); for (const c of made) assert.match(c, /^[A-HJKMNP-Z2-9]{16}$/);
  assert.match(code('lib/realtorInvite.js'), /import \{ randomInt \} from 'node:crypto'/);
  assert.doesNotMatch(code('lib/realtorInvite.js'), /Math\.random/);
});

test('a realtor cannot read another realtor\'s invite list or code', async () => {
  const t = world();
  Object.assign(row(t, NEW.id), { invited_by: USER.id });
  t.profiles.push({ id: 'realtor-theirs', email: 'theirs@brokerage.ca', full_name: 'Invited By Other', plan: 'founding', created_at: '2026-10-20T15:00:00Z', invited_by: OTHER.id, invite_code: null });
  // Whatever the body or the query names, the answer is the caller's own.
  for (const body of [{}, { userId: USER.id }, { profileId: USER.id, id: USER.id, invited_by: USER.id, code: CODE.sarah }]) {
    const s = installFakeStack({ tables: t, user: OTHER });
    try {
      const res = fakeRes(); await invite(fakeReq({ body, query: { userId: USER.id, id: USER.id } }), res);
      assert.equal(res.code, 200);
      assert.equal(res.body.code, CODE.other, 'their own code');
      assert.deepEqual(res.body.invited, [{ name: 'Invited By Other', joinedAt: '2026-10-20T15:00:00Z' }], 'their own list');
      const sent = JSON.stringify(res.body);
      assert.ok(!sent.includes(CODE.sarah) && !sent.includes('Maya Kowalski'), 'nothing of the other realtor\'s');
      // Every query the route made on profiles for the invite is keyed by the caller's own id.
      for (const q of s.db.queries.filter((x) => x.table === 'profiles' && !x.rls && /invite_code|full_name, created_at/.test(String(x.select)))) assert.ok(q.filters.some((f) => (f[1] === 'id' || f[1] === 'invited_by')), JSON.stringify(q));
    } finally { s.restore(); }
  }
  const mine = await call(t, USER);
  assert.deepEqual(mine.res.body.invited.map((r) => r.name), ['Maya Kowalski']);
  assert.equal(mine.res.body.code, CODE.sarah);
  // The route reads nothing from the request.
  const route = code('pages/api/profile/invite.js');
  assert.doesNotMatch(route, /req\.(body|query)/);
  assert.match(route, /loadRealtorInvite\(\{ admin, userId: user\.id \}\)/);
  // No policy opens another profile's row (db/017 adds none), and no page reads the columns from the browser.
  assert.doesNotMatch(code('db/017-realtor-invites.sql'), /CREATE POLICY|GRANT /);
  const readers = [...walk('pages'), ...walk('components')].filter((p) => /invited_by|invite_code/.test(code(p)));
  assert.deepEqual(readers, []);
});

test('the route is a realtor write: no session 401, a lapsed trial 402, only POST', async () => {
  let { res } = await call(world(), null);
  assert.equal(res.code, 401);
  const lapsed = world(); Object.assign(row(lapsed, USER.id), { plan: 'trial', is_founder: false, trial_ends_at: '2026-01-08T00:00:00Z', created_at: '2026-01-01T00:00:00Z', invite_code: null });
  const s = installFakeStack({ tables: lapsed, user: USER, env: { BILLING_OFF: 'false' } });
  try {
    res = fakeRes(); await invite(fakeReq({ body: {} }), res);
    assert.equal(res.code, 402, 'the entitlement gate');
    assert.equal(row(lapsed, USER.id).invite_code, null, 'nothing was written behind the gate');
    res = fakeRes(); await invite(fakeReq({ method: 'GET' }), res); assert.equal(res.code, 405);
  } finally { s.restore(); delete process.env.BILLING_OFF; }
  assert.match(code('pages/api/profile/invite.js'), /export default withRealtor\(/);
});

test('before db/017 has run the app works: no section, no credit, the first touch still written', async () => {
  const t = tables(); // the fixture's profiles carry neither column
  t.profiles.push({ id: NEW.id, email: NEW.email, full_name: 'Maya Kowalski', plan: 'trial', created_at: '2026-11-18T15:00:00Z', signup_source: null });
  const s = installFakeStack({ tables: t, user: USER });
  try {
    // The fake database answers 42703 for a column that is not there, as PostgREST does.
    const absent = fakeDb(t, { absentColumns: ['invite_code', 'invited_by'] });
    const r = await R.loadRealtorInvite({ admin: absent, userId: USER.id });
    assert.deepEqual(r, { status: 200, body: { available: false } });
    assert.equal(absent.updates.length, 0);
    assert.equal(await S.recordSignupSource(absent, NEW.id, `ref:${CODE.sarah}`), true);
    assert.equal(row(t, NEW.id).signup_source, 'direct', 'no code belongs to anybody yet: an ordinary signup');
    assert.equal('invited_by' in row(t, NEW.id), false);
    assert.equal(await S.recordSignupSource(absent, NEW.id, 'apply'), true);
  } finally { s.restore(); }
  // The section draws nothing unless the route says it is available, and never in the sandbox.
  const ui = code('components/dashboard/InviteRealtor.js');
  assert.match(ui, /if \(adapter\.kind !== 'real'\) return undefined;/);
  assert.match(ui, /if \(live && r\.ok && j && j\.available && j\.link\) setData\(j\);/);
  assert.match(ui, /if \(!data\) return null;/);
});

test('the words: "Invite a realtor" everywhere, no reward promised, and the tenant referral system is not touched', () => {
  const ui = src('components/dashboard/InviteRealtor.js'); const landing = src('pages/join/index.js');
  assert.match(ui, />Invite a realtor<\/h2>/);
  assert.match(code('components/dashboard/ProfileView.js'), /<InviteRealtor \/>/);
  const shown = [ui, landing].map((s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).join('\n');
  assert.doesNotMatch(shown, /reward|earn|bonus|commission|credit toward|free month|payout|\$\d|cash|gift|perk|discount/i, 'nothing is promised');
  assert.doesNotMatch(shown, /referr/i, 'never called a referral');
  // Its own names: nothing here reuses the tenant referral system's tables, routes or event names.
  for (const p of ['lib/realtorInvite.js', 'pages/api/profile/invite.js', 'components/dashboard/InviteRealtor.js', 'pages/join/index.js']) {
    assert.doesNotMatch(code(p), /referral_received|referral_accepted|lib\/referrals|api\/referrals|from\('referrals'\)|\/refer\b/, p);
  }
  assert.doesNotMatch(code('db/017-realtor-invites.sql'), /referrals|referral_/);
});
