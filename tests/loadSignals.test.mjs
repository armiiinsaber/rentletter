// The dashboard load against a 12 listing, 36 applicant fixture through fake clients: the
// query count is measured (RL_QUERY_TRACE) and the output invariants hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeSupabase, fakeKv, bigFixture } from './helpers/fakeSupabase.mjs';
register('./helpers/loader.mjs', import.meta.url);

const { loadSignals } = await import('../lib/dashboardSignals.js');
const { summarize } = await import('../lib/queryTrace.js');
const { applicantState } = await import('../lib/applicantState.js');
const { buildActions } = await import('../lib/actions.js');

test('loadSignals: 12 listings, 3 applicants each, measured', async () => {
  process.env.RL_QUERY_TRACE = '1';
  const { tables, kv, listings } = bigFixture();
  const { restore } = fakeKv(kv);
  const admin = fakeSupabase(tables); const rls = fakeSupabase(tables);
  const user = { id: 'p-1', email: 'r@example.com' };
  let trace = null;
  const origLog = console.log; console.log = (...a) => { if (String(a[0]).startsWith('[query-trace]')) trace = a.join(' '); else origLog(...a); };
  const t0 = Date.now();
  const signals = await loadSignals({ supabase: rls, user, listings, admin });
  const wall = Date.now() - t0;
  console.log = origLog;
  restore(); delete process.env.RL_QUERY_TRACE;
  console.log('  ' + trace, `(measured wall ${wall}ms)`);
  // the contract: same applicants, same Fit, same states, same action items, same feed
  const all = Object.values(signals.applicantsByListing).flat();
  assert.equal(Object.keys(signals.applicantsByListing).length, 12);
  assert.equal(all.length, 36);
  for (const a of all) { assert.ok(!('owner_token' in a.application), 'owner_token stripped'); assert.ok(!('cover_letter' in a.application), 'cover_letter stripped'); assert.ok(a.application.fit && a.application.fit.score != null, 'fit attached'); assert.ok(Array.isArray(a.docVerifications)); assert.ok(a.storedDocuments !== undefined); assert.ok(a.docRequest !== undefined); }
  const states = all.map((a) => applicantState({ junction: a, verification: a.docVerifications[0] || null }).state).reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
  const fitSum = Math.round(all.reduce((s, a) => s + a.application.fit.scoreExact, 0) * 1000) / 1000;
  const actions = buildActions({ listings: signals.listings, applicantsByListing: signals.applicantsByListing, now: '2026-09-02T12:00:00Z' });
  const digest = { states, fitSum, actionKinds: actions.map((i) => i.kind).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}), feed: signals.notifications.length, unread: signals.notifications.filter((n) => n.unread).length, requested: all.filter((a) => a.docRequest).length, withReports: all.filter((a) => a.docVerifications.length).length, held: all.filter((a) => (a.storedDocuments || []).length).length };
  console.log('  digest', JSON.stringify(digest));
  // The contract, taken from the load as it ran before the single query refactor (commit 1893b78
  // on this fixture): the same applicants, states, Fit, action items and feed.
  assert.deepEqual(digest, { states: { set_aside: 12, requested: 12, matched: 12 }, fitSum: 128.15, actionKinds: { verify: 12, waiting: 12 }, feed: 40, unread: 25, requested: 12, withReports: 12, held: 12 });
  // The budget: under 10 Supabase queries, 3 KV calls, a sequential depth of 3 or less.
  const m = String(trace).match(/supabase=(\d+) kv=(\d+) depth=(\d+)/);
  assert.ok(m, 'trace line present'); assert.ok(Number(m[1]) < 10, `supabase ${m[1]}`); assert.ok(Number(m[2]) <= 3, `kv ${m[2]}`); assert.ok(Number(m[3]) <= 3, `depth ${m[3]}`);
  void summarize;
});
