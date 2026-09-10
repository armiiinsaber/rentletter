// The dashboard load, end to end: pages/dashboard.js getServerSideProps over the fake stack
// (tests/helpers/fakeStack.mjs), a realtor with two listings and five applicants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeCtx, findKeys } from '../helpers/fakeStack.mjs';
import { tables, USER, ago, NOW, DAY } from './fixture.mjs';

const page = await import('../../pages/dashboard.js');
const gssp = (stack) => page.getServerSideProps(fakeCtx());
let stack;
const up = (opts = {}) => { if (stack) stack.restore(); stack = installFakeStack({ tables: tables(opts.fixture || {}), user: opts.user === undefined ? USER : opts.user, kv: opts.kv }); return stack; };

test('no session: redirect to sign in', async () => {
  up({ user: null });
  assert.deepEqual(await gssp(), { redirect: { destination: '/signin?next=/dashboard', permanent: false } });
});

test('a failed profile read is retried once, then the request goes back to sign in', async () => {
  const s = up();
  let profileReads = 0;
  s.db.failWhen = (q) => { if (q.table === 'profiles' && q.op === 'select') { profileReads++; return { code: 'PGRST301', message: 'JWT expired' }; } return null; };
  const r = await gssp();
  assert.equal(profileReads, 2, 'one retry');
  assert.match(r.redirect.destination, /^\/signin\?error=We%20could%20not%20confirm%20your%20session/);
  assert.match(r.redirect.destination, /next=%2Fdashboard$/);
  // a read that fails once and succeeds on the retry renders the dashboard
  let n = 0; s.db.failWhen = (q) => (q.table === 'profiles' && q.op === 'select' && n++ === 0 ? { code: 'PGRST301', message: 'JWT expired' } : null);
  const ok = await gssp();
  assert.ok(ok.props, 'rendered'); assert.equal(ok.props.initialProfile.full_name, 'Sarah Chen');
});

test('a suspended profile is refused and signed out', async () => {
  up({ fixture: { profileOver: { suspended_at: ago(1) } } });
  const r = await gssp();
  assert.match(r.redirect.destination, /suspended/);
});

test('a fresh profile with no name goes to onboarding', async () => {
  up({ fixture: { profileOver: { full_name: '' } } });
  assert.deepEqual(await gssp(), { redirect: { destination: '/onboarding', permanent: false } });
});

test('the entitlement each profile gets, as a value', async () => {
  const cases = [
    ['founder', { plan: 'founding' }, 'founding', true],
    ['trialling', { plan: 'trial', trial_ends_at: new Date(NOW + 5 * DAY).toISOString() }, 'trialing', true],
    ['paid', { plan: 'paid', subscription_status: 'active' }, 'paid', true],
    ['past due in grace', { plan: 'paid', subscription_status: 'past_due', grace_ends_at: new Date(Date.now() + 3 * DAY).toISOString() }, 'past_due', true],
    ['lapsed trial', { plan: 'trial', trial_ends_at: ago(2) }, 'trial_expired', false],
  ];
  for (const [label, over, status, can] of cases) {
    up({ fixture: { profileOver: over } });
    const r = await gssp();
    assert.ok(r.props, `${label}: the dashboard renders (the paywall is soft, decided by the entitlement)`);
    assert.equal(r.props.entitlement.status, status, label);
    assert.equal(r.props.entitlement.canUseProduct, can, label);
  }
});

test('loadSignals: the listings, the applicants with Fit, the Pipeline rows, no owner_token or cover_letter anywhere, inside the query budget', async () => {
  const s = up();
  s.kv.values['docreq-app:J2'] = { token: 'f'.repeat(32), status: 'requested', requestedAt: ago(2), receivedAt: null, nudgedAt: [] };
  s.db.queries.length = 0; s.kv.calls.length = 0;
  const r = await gssp();
  const sig = r.props.initialSignals;
  assert.equal(r.props.userId, USER.id);
  assert.deepEqual(r.props.initialListings.map((l) => l.id), ['L2', 'L1'], 'the realtor\'s own listings, newest first; the other realtor\'s L9 never appears');
  assert.deepEqual(sig.listings.map((l) => l.id), ['L2', 'L1']);
  assert.equal(sig.applicantsByListing.L1.length, 5); assert.equal(sig.applicantsByListing.L2.length, 1);
  const byLink = Object.fromEntries(sig.applicantsByListing.L1.map((a) => [a.linkId, a]));
  assert.equal(byLink.J1.application.fit.label, 'verified', 'the employer confirmation makes A1 verified');
  assert.equal(typeof byLink.J2.application.fit.score, 'number');
  assert.equal(byLink.J4.application.fit, null, 'no income: no Fit');
  assert.equal(byLink.J2.docRequest.status, 'requested', 'the KV pointer rides on the applicant');
  assert.equal(byLink.J5.duplicateOf, 'J1', 'the same phone as A1: marked, not merged');
  assert.equal(sig.people.length, 1); assert.equal(sig.people[0].name, 'Applicant F6F6');
  assert.deepEqual(findKeys(r.props, ['owner_token', 'cover_letter']), [], 'never a raw owner_token or cover_letter in the props');
  const supabase = s.db.queries.length; const kv = s.kv.calls.length; const rls = s.db.queries.filter((q) => q.rls).length;
  const byTable = {}; for (const q of s.db.queries) byTable[`${q.rls ? 'rls' : 'admin'}.${q.table}`] = (byTable[`${q.rls ? 'rls' : 'admin'}.${q.table}`] || 0) + 1;
  console.log(`  dashboard load: supabase queries=${supabase} (rls=${rls}, loadSignals=${supabase - rls}) kv calls=${kv} ${JSON.stringify(byTable)}`);
  // lib/dashboardSignals.js documents the load as four independent reads plus the Pipeline source's
  // three; tests/loadSignals.test.mjs pins loadSignals at under 10 Supabase queries and 3 KV calls on
  // a fixture without People. Here People adds its two extra reads and the landlord answers add one,
  // so loadSignals is 10 and the page (profile and listings on top) is 13.
  assert.ok(supabase - rls <= 10, `loadSignals inside 10 queries, got ${supabase - rls}`); assert.ok(supabase <= 13, `page load inside 13 queries, got ${supabase}`); assert.ok(kv <= 3, `kv calls ${kv}`);
});
