// The referral freeze: with REFERRALS_ENABLED off every surface hides and every write route
// answers 410 "Referrals are paused"; with the flag on they come back. Existing referral tests
// run with the flag on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase, fakeKv, bigFixture } from './helpers/fakeSupabase.mjs';

const F = await import('../lib/features.js');
const res = () => { const r = { code: 0, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

test('the flag is off by default and reads through referralsEnabled', () => {
  assert.equal(F.REFERRALS_ENABLED, false);
  assert.equal(F.referralsEnabled(), false);
  F.overrideFeature('referrals', true); assert.equal(F.referralsEnabled(), true);
  F.overrideFeature('referrals'); assert.equal(F.referralsEnabled(), false);
});

test('off: assign, claim, create and consent answer 410; inbox and list answer empty. On: they proceed past the gate', async () => {
  const routes = ['assign', 'claim', 'create', 'consent'];
  for (const name of routes) {
    const { default: handler } = await import(`../pages/api/referrals/${name}.js`);
    const r = res(); await handler({ method: 'POST', body: {}, query: {}, headers: {} }, r);
    assert.equal(r.code, 410, `${name} off`); assert.equal(r.body.error, 'Referrals are paused.');
  }
  for (const name of ['inbox', 'list']) {
    const { default: handler } = await import(`../pages/api/referrals/${name}.js`);
    const r = res(); await handler({ method: 'GET', query: {}, headers: {} }, r);
    assert.equal(r.code, 200, `${name} off`); assert.equal(r.body.paused, true);
  }
  F.overrideFeature('referrals', true);
  try {
    for (const name of routes) {
      const { default: handler } = await import(`../pages/api/referrals/${name}.js`);
      const r = res(); await handler({ method: 'POST', body: {}, query: {}, headers: {}, cookies: {} }, r);
      assert.notEqual(r.code, 410, `${name} on reaches its own checks (answered ${r.code})`);
    }
  } finally { F.overrideFeature('referrals'); }
});

test('the dashboard load skips both KV lrange reads when off and runs them when on', async () => {
  const run = async () => {
    const { loadSignals } = await import('../lib/dashboardSignals.js');
    const { tables, kv, listings } = bigFixture();
    const { calls, restore } = fakeKv(kv);
    try {
      const signals = await loadSignals({ supabase: fakeSupabase(tables), user: { id: 'p-1', email: 'r@example.com' }, listings, admin: fakeSupabase(tables) });
      return { lrange: calls.filter((c) => c === 'lrange').length, inbox: signals.referralsInbox.length, sent: signals.referralsSent.length };
    } finally { restore(); }
  };
  const off = await run();
  assert.equal(off.lrange, 0, 'no lrange while paused'); assert.deepEqual([off.inbox, off.sent], [0, 0]);
  F.overrideFeature('referrals', true);
  try { const on = await run(); assert.equal(on.lrange, 2, 'both referral lists read when on'); } finally { F.overrideFeature('referrals'); }
});

test('no referral action kinds, no referral assistant action, while off', async () => {
  const { buildActions, KIND_ORDER } = await import('../lib/actions.js');
  assert.equal(KIND_ORDER.some((k) => /referr/i.test(k)), false);
  const { tables, listings } = bigFixture(); void tables;
  const items = buildActions({ listings, applicantsByListing: {}, now: '2026-09-07T12:00:00Z' });
  assert.equal(items.some((i) => /referr/i.test(i.kind + i.title + i.detail)), false);
  const src = readFileSync(new URL('../lib/assistantActions.js', import.meta.url), 'utf8');
  assert.match(src, /\.\.\.\(referralsEnabled\(\) \? \{ refer_applicant: \{/);
});

test('every referral surface reads the flag', () => {
  const files = ['components/dashboard/AssistantPanel.js', 'components/dashboard/HomeView.js', 'components/dashboard/ListingView.js', 'pages/refer/[token].js', 'pages/signup.js', 'lib/demoAdapter.js', 'lib/dashboardSignals.js', 'lib/assistantActions.js', 'pages/api/referrals/assign.js', 'pages/api/referrals/claim.js', 'pages/api/referrals/create.js', 'pages/api/referrals/consent.js', 'pages/api/referrals/inbox.js', 'pages/api/referrals/list.js'];
  for (const f of files) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /referralsEnabled\(\)/, f);
});
