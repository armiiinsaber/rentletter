// BILLING_OFF (lib/billingOff.js): how the flag reads, what the server gate answers under it, and
// where it is read. While billing is off the gate still runs and still loads the profile; the
// entitlement scan (tests/routes/entitlementScan.test.mjs) proves every route still calls it. The
// browser walk is tests/routes/billingOffWebkit.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { billingOff } = await import('../lib/billingOff.js');
const { requireEntitlement } = await import('../lib/requireEntitlement.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// A realtor whose trial ended, a server client that counts its profile reads, and a response.
const LAPSED = { id: 'U1', plan: 'trial', is_founder: false, subscription_status: null, created_at: '2025-01-01T00:00:00Z', trial_ends_at: '2025-01-08T00:00:00Z' };
const client = (profile) => { const c = { reads: 0 }; c.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { c.reads += 1; return { data: profile }; } }) }) }); return c; };
const res = () => { const r = { code: 0, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
async function withEnv(vars, fn) {
  const kept = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const put = (o) => { for (const [k, v] of Object.entries(o)) { if (v == null) delete process.env[k]; else process.env[k] = v; } };
  put(vars); try { return await fn(); } finally { put(kept); }
}

test('the flag: true or 1 turns billing off, false or 0 keeps it on, unset is off in production alone', () => {
  for (const v of ['true', 'TRUE', ' 1 ', '1']) for (const env of ['production', 'development', undefined]) assert.equal(billingOff(v, env), true, `${v} in ${env}`);
  for (const v of ['false', 'False', '0']) for (const env of ['production', 'development', undefined]) assert.equal(billingOff(v, env), false, `${v} in ${env}`);
  for (const v of [undefined, '', 'yes']) {
    assert.equal(billingOff(v, 'production'), true, `${v} in production`);
    for (const env of ['development', 'test', undefined]) assert.equal(billingOff(v, env), false, `${v} in ${env}`);
  }
});

test('billing off: a realtor past their trial is entitled, and the gate still reads the profile', async () => {
  for (const env of [{ BILLING_OFF: 'true', NODE_ENV: 'development' }, { BILLING_OFF: undefined, NODE_ENV: 'production' }]) {
    await withEnv(env, async () => {
      const c = client(LAPSED); const r = res();
      const gate = await requireEntitlement({}, r, c, { id: 'U1' });
      assert.ok(gate, JSON.stringify(env));
      assert.equal(gate.entitlement.canUseProduct, true);
      assert.equal(gate.entitlement.status, 'trial_expired', 'the verdict itself is unchanged (lib/entitlements.js)');
      assert.equal(gate.profile.id, 'U1');
      assert.equal(c.reads, 1, 'the profile is still loaded');
      assert.equal(r.code, 0, 'nothing sent');
    });
  }
});

test('billing on: the same realtor gets 402, as before the flag', async () => {
  for (const env of [{ BILLING_OFF: 'false', NODE_ENV: 'production' }, { BILLING_OFF: undefined, NODE_ENV: 'development' }, { BILLING_OFF: undefined, NODE_ENV: undefined }]) {
    await withEnv(env, async () => {
      const r = res();
      assert.equal(await requireEntitlement({}, r, client(LAPSED), { id: 'U1' }), null, JSON.stringify(env));
      assert.equal(r.code, 402); assert.equal(r.body.code, 'payment_required'); assert.equal(r.body.status, 'trial_expired');
    });
  }
});

test('the flag is read where the trial, the plans and the paywall show, and nowhere in the verdict', () => {
  assert.match(src('next.config.js'), /env: \{ BILLING_OFF: process\.env\.BILLING_OFF \|\| '' \}/, 'the browser gets the same value');
  const reads = {
    'lib/requireEntitlement.js': /billingOff\(\) \? \{ \.\.\.verdict, canUseProduct: true \} : verdict/,
    'components/dashboard/HomeView.js': /const free = billingOff\(\);[\s\S]*const trialDays = !free &&[\s\S]*const locked = !free && !entitlement\.canUseProduct/,
    'components/dashboard/ListingView.js': /const locked = !billingOff\(\) && !entitlement\.canUseProduct/,
    'components/dashboard/StatusBadge.js': /if \(billingOff\(\)\) return null;/,
    'pages/billing.js': /if \(billingOff\(\)\) return \{ redirect: \{ destination: '\/dashboard'/,
    'pages/join/[code].js': /if \(billingOff\(\)\) return 'Free to join\. Pay only when a rental lands\.';/,
  };
  for (const [f, re] of Object.entries(reads)) assert.match(src(f), re, f);
  assert.doesNotMatch(src('lib/entitlements.js'), /billingOff/, 'the verdict stays the same: the admin founder count reads it');
});
