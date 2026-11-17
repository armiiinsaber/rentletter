// Where a realtor first came from (lib/signupSource.js): one short word from a closed list, set
// once on the first page, sent with the new account, written once to the new profile. Never a
// URL, never a query string beyond a ref code, never anything about a tenant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFirstTouch, isSignupSource, readFirstTouch, signupSourceFor, recordSignupSource, SIGNUP_SOURCE, FIRST_TOUCH_COOKIE } from '../lib/signupSource.js';
import { isReferralSource } from '../lib/kpis.js';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the first page is classified into one word, and nothing else of the address is kept', () => {
  const cases = [
    ['/', '', 'direct'], ['/faq', '', 'direct'], ['/signup', '', 'direct'], ['/realtors', '?utm_source=x', 'direct'],
    ['/signup', '?ref=1&from=Sarah%20Chen&email=maya%40remax.ca', 'realtor_referral'],
    ['/', '?ref=maya-k', 'ref:maya-k'], ['/signup', '?ref=AB_12&email=x%40y.ca', 'ref:AB_12'],
    ['/', '?ref=1', 'direct'], ['/', '?ref=has space', 'direct'], ['/', `?ref=${'x'.repeat(33)}`, 'direct'], ['/', '?ref=https://evil.example/x', 'direct'],
    ['/join/WELCOME24', '', 'invite'],
    ['/apply/a1b2c3d4e5f6a7b8c9d0', '?from=prefilltoken', 'apply'], ['/a/WWWWWWW', '', 'apply'],
    ['/r/abcdef0123456789', '', 'report'],
    ['/my-application', '?app=RL-2026-ABCD-1234&token=OWNERTOKENSECRET', 'my_application'], ['/my-application/RL-2026-ABCD-1234', '?token=OWNERTOKENSECRET', 'my_application'],
    ['/ref/rrrrrrrr', '', 'landlord_page'],
    ['/upload/t', '', 'tenant_page'], ['/party/t', '', 'tenant_page'], ['/keep/t', '', 'tenant_page'], ['/refer/t', '', 'tenant_page'],
  ];
  for (const [path, search, want] of cases) {
    const got = classifyFirstTouch(path, search);
    assert.equal(got, want, `${path}${search}`);
    assert.ok(isSignupSource(got), `${got} is on the list`);
    assert.doesNotMatch(got, /OWNERTOKENSECRET|RL-2026|a1b2c3|WELCOME24|remax|Sarah|prefilltoken|[/?&=@%]/, `${path}${search}: no token, code, number, email or address is kept`);
  }
  for (const path of ['/dashboard', '/listing/L1', '/admin', '/admin/commitment', '/profile', '/billing', '/onboarding', '/auth/callback', '/api/generate', '/demo/dashboard']) assert.equal(classifyFirstTouch(path, '?ref=abc'), null, `${path} is not a landing`);
});

test('which words count as a referral', () => {
  for (const s of ['realtor_referral', 'ref:maya-k', 'apply', 'report', 'my_application', 'tenant_page', 'landlord_page']) assert.equal(isReferralSource(s), true, s);
  for (const s of ['direct', 'invite']) { assert.equal(isSignupSource(s), true); assert.equal(isReferralSource(s), false, s); }
});

test('the cookie is read only when it holds a word on the list', () => {
  assert.equal(readFirstTouch(`a=1; ${FIRST_TOUCH_COOKIE}=apply; b=2`), 'apply');
  assert.equal(readFirstTouch(`${FIRST_TOUCH_COOKIE}=${encodeURIComponent('ref:maya-k')}`), 'ref:maya-k');
  for (const bad of ['', 'a=1', `${FIRST_TOUCH_COOKIE}=`, `${FIRST_TOUCH_COOKIE}=https%3A%2F%2Frentletter.ca%2Fapply%2Fx`, `${FIRST_TOUCH_COOKIE}=%E0%A4%A`, `${FIRST_TOUCH_COOKIE}=admin`]) assert.equal(readFirstTouch(bad), null, bad);
});

test('the word for a new account: what the form sent, else the cookie for a week old account, never for an old one', () => {
  const now = Date.parse('2026-11-17T17:00:00Z');
  const cookie = `${FIRST_TOUCH_COOKIE}=report`;
  assert.equal(signupSourceFor({ created_at: '2026-11-17T16:00:00Z', user_metadata: { signup_source: 'apply' } }, cookie, now), 'apply', 'the form\'s word wins: it was read on the device that signed up');
  assert.equal(signupSourceFor({ created_at: '2026-11-17T16:00:00Z', user_metadata: { signup_source: 'https://x.example' } }, cookie, now), 'report', 'a word off the list is ignored');
  assert.equal(signupSourceFor({ created_at: '2026-11-12T16:00:00Z', user_metadata: {} }, cookie, now), 'report');
  assert.equal(signupSourceFor({ created_at: '2026-10-01T16:00:00Z', user_metadata: {} }, cookie, now), null, 'an account from before stays unknown');
  assert.equal(signupSourceFor({ created_at: '2026-11-17T16:00:00Z', user_metadata: {} }, '', now), null);
  assert.equal(signupSourceFor(null, cookie, now), null);
});

test('the word is written once, to the caller\'s own profile, and only while it is empty', async () => {
  const t = { profiles: [{ id: 'P1', signup_source: null }, { id: 'P2', signup_source: 'direct' }, { id: 'P3', signup_source: null }] };
  const db = fakeSupabase(t);
  assert.equal(await recordSignupSource(db, 'P1', 'apply'), true);
  assert.equal(t.profiles[0].signup_source, 'apply');
  await recordSignupSource(db, 'P1', 'report'); assert.equal(t.profiles[0].signup_source, 'apply', 'the first touch is the first');
  await recordSignupSource(db, 'P2', 'apply'); assert.equal(t.profiles[1].signup_source, 'direct');
  assert.equal(t.profiles[2].signup_source, null, 'no other profile is touched');
  assert.equal(await recordSignupSource(db, 'P3', 'https://rentletter.ca/apply/token'), false); assert.equal(await recordSignupSource(db, 'P3', null), false); assert.equal(await recordSignupSource(db, '', 'apply'), false);
  assert.equal(db.updates.length, 3);
  // Before db/013 the column is absent: nothing throws, the profile reads unknown.
  const before = fakeSupabase({ profiles: [{ id: 'P1' }] }, { absentColumns: ['signup_source'] });
  assert.equal(await recordSignupSource(before, 'P1', 'apply'), false);
  assert.equal(await recordSignupSource({ from() { throw new Error('down'); } }, 'P1', 'apply'), false);
});

test('the wiring: the app sets it, the form sends it, the callback writes it, and the database holds the same list', () => {
  assert.match(src('pages/_app.js'), /useEffect\(\(\) => \{ rememberFirstTouch\(\); \}, \[\]\);/);
  assert.match(src('pages/signup.js'), /data: \{ signup_source: readFirstTouch\(document\.cookie\) \}/);
  const cb = src('pages/auth/callback.js');
  assert.match(cb, /if \(!recovery && process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/);
  assert.match(cb, /recordSignupSource\(getSupabaseAdminClient\(\), data\.user\.id, signupSourceFor\(data\.user, ctx\.req\.headers\.cookie\)\)/);
  const sql = src('db/013-kpi-daily.sql');
  assert.ok(sql.includes(`signup_source ~ '${SIGNUP_SOURCE.source}'`), 'db/013 checks the column against the same pattern the module uses');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS signup_source text;/);
  assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'profiles_signup_source_check'\)/);
});
