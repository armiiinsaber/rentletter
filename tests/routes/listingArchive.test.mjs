// Archive, restore and delete listings (db/025-listing-archive.sql, lib/listingArchive.js,
// pages/api/listings/archive.js, pages/api/listings/remove.js), on the fake stack:
//   · not signed in: 401, nothing written;
//   · one listing that is not the realtor's, alone or in a bulk request, fails the whole request;
//   · a real application blocks a delete, with the one line that says why;
//   · a +test application does not: the listing and its test applications go;
//   · bulk delete skips the listings with a real application and says how many;
//   · archive and restore change listings.archived_at and nothing else: applications, shares,
//     events and reports as they were, and every KPI the same;
//   · the apply link of an archived listing says it takes no applications, and restored it opens;
//   · before db/025 has run: archive answers available false and writes nothing, the apply link
//     opens as before, and delete works as it does after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER, INVITE_TOKEN } from './fixture.mjs';

const A = await import('../../lib/listingArchive.js');
const archive = (await import('../../pages/api/listings/archive.js')).default;
const remove = (await import('../../pages/api/listings/remove.js')).default;
const apply = await import('../../pages/apply/[token].js');
const { loadKpiData } = await import('../../lib/kpiStore.js');
const { computeKpis } = await import('../../lib/kpis.js');
const code = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');

// The fixture with db/025 run: every listing carries archived_at, null. L1 has the realtor's real
// applicants; L3 has only test applicants; L4 has none.
const world = ({ migrated = true } = {}) => {
  const t = tables();
  t.listings.find((l) => l.id === 'L1').invite_token = INVITE_TOKEN;
  t.listings.push({ id: 'L3', profile_id: USER.id, name: '9 Test Lane', address: '9 Test Lane, Toronto', monthly_rent: 1900, bedrooms: '1', status: 'active', created_at: '2026-09-01T12:00:00Z' });
  t.listings.push({ id: 'L4', profile_id: USER.id, name: '4 Empty Rd', address: '4 Empty Rd, Toronto', monthly_rent: 2100, bedrooms: '1', status: 'active', created_at: '2026-09-02T12:00:00Z' });
  t.applications.push({ id: 'AT1', application_number: 'RL-2026-TEST-T1T1', full_name: 'Test One', email: 'sarah+test@example.com' }, { id: 'AT2', application_number: 'RL-2026-TEST-T2T2', full_name: 'Test Two', email: 'Sarah+Test2@Brokerage.ca' });
  t.listing_applicants.push({ id: 'JT1', listing_id: 'L3', application_id: 'AT1', decision_status: 'none', created_at: '2026-09-03T12:00:00Z' }, { id: 'JT2', listing_id: 'L3', application_id: 'AT2', decision_status: 'none', created_at: '2026-09-03T13:00:00Z' });
  Object.assign(t, { profile_shares: [{ id: 'S1', listing_id: 'L1', recipient_profile_id: USER.id, status: 'approved' }], report_snapshots: [{ id: 'R1', listing_id: 'L1', token: 'r1', created_at: '2026-09-05T12:00:00Z' }] });
  if (migrated) for (const l of t.listings) l.archived_at = null;
  return t;
};
const once = async (t, route, body, user = USER, opts = {}) => {
  const s = installFakeStack({ tables: t, user, ...opts });
  try { const res = fakeRes(); await route(fakeReq({ body }), res); return { code: res.code, body: res.body, db: s.db }; } finally { s.restore(); }
};
const snap = (t) => JSON.parse(JSON.stringify({ applications: t.applications, listing_applicants: t.listing_applicants, profile_shares: t.profile_shares, report_snapshots: t.report_snapshots, pipeline_consents: t.pipeline_consents, reference_responses: t.reference_responses }));

test('the one check: only a listing with no real application can be deleted', () => {
  assert.deepEqual(A.deleteCheck([]), { deletable: true, real: 0, tests: 0, reason: null });
  assert.equal(A.deleteCheck([{ email: 'sarah+test@example.com' }, { email: 'a+TEST7@x.ca' }]).deletable, true, '+test addresses are tests');
  for (const email of ['sarah@example.com', 'test@example.com', 'sarah.test@x.ca', 'sarah+tester', '', null]) {
    const c = A.deleteCheck([{ email: 'sarah+test@example.com' }, { email }]);
    assert.equal(c.deletable, false, `${email} is a real application`);
    assert.equal(c.reason, 'This listing has applications, so it can be archived but not deleted.');
  }
  // The routes use it, and nothing else decides: one function, in one file, the screen's too.
  assert.match(code('lib/listingArchive.js'), /const checks = Object\.fromEntries\(ids\.map\(\(id\) => \[id, deleteCheck\(apps\[id\]\)\]\)\);/);
  assert.equal((code('lib/listingArchiveRule.js').match(/export function deleteCheck\(/g) || []).length, 1);
  assert.doesNotMatch(code('lib/listingArchive.js'), /function deleteCheck\(/, 'not written twice');
});

test('not signed in: 401 and nothing written', async () => {
  for (const [route, body] of [[archive, { listingIds: ['L1'], archived: true }], [remove, { listingIds: ['L4'] }]]) {
    const t = world(); const before = JSON.stringify(t.listings);
    const r = await once(t, route, body, null);
    assert.equal(r.code, 401);
    assert.equal(JSON.stringify(t.listings), before);
  }
});

test('not the owner: one listing that is not the realtor\'s fails the whole request', async () => {
  const t = world();
  const a = await once(t, archive, { listingIds: ['L1', 'L9'], archived: true });
  assert.equal(a.code, 403);
  assert.ok(t.listings.every((l) => l.archived_at === null), 'nothing archived, not even the realtor\'s own');
  const d = await once(t, remove, { listingIds: ['L4', 'L9'] });
  assert.equal(d.code, 403);
  assert.ok(t.listings.some((l) => l.id === 'L4') && t.listings.some((l) => l.id === 'L9'), 'nothing deleted');
  const missing = await once(t, remove, { listingIds: ['L4', 'nope'] });
  assert.equal(missing.code, 404, 'a listing that is not there fails it too');
  assert.ok(t.listings.some((l) => l.id === 'L4'));
  // The other realtor cannot touch the realtor's listings either.
  assert.equal((await once(t, archive, { listingIds: ['L1'], archived: true }, OTHER)).code, 403);
});

test('a real application blocks a delete, and the screen gets the line that says why', async () => {
  const t = world(); const before = snap(t);
  const r = await once(t, remove, { listingIds: ['L1'] });
  assert.equal(r.code, 409);
  assert.equal(r.body.error, 'This listing has applications, so it can be archived but not deleted.');
  assert.ok(t.listings.some((l) => l.id === 'L1'));
  assert.deepEqual(snap(t), before, 'nothing written');
});

test('a test application does not block it: the listing and its test applications go', async () => {
  const t = world();
  const r = await once(t, remove, { listingIds: ['L3'] });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.deleted, ['L3']);
  assert.equal(t.listings.some((l) => l.id === 'L3'), false, 'the listing is gone');
  assert.equal(t.applications.some((a) => a.id === 'AT1' || a.id === 'AT2'), false, 'its test applications are gone');
  assert.equal(t.listing_applicants.some((k) => k.listing_id === 'L3'), false);
  assert.ok(t.applications.some((a) => a.id === 'A1'), 'every other application stays');
  assert.ok(t.events.some((e) => e.type === 'listing_updated' && e.payload && e.payload.status === 'deleted' && e.payload.listingId === 'L3'), 'the delete is on the timeline');
});

test('bulk delete skips a listing with a real application and says how many', async () => {
  const t = world();
  const r = await once(t, remove, { listingIds: ['L1', 'L3', 'L4'] });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.deleted.sort(), ['L3', 'L4']);
  assert.equal(r.body.skipped, 1); assert.deepEqual(r.body.skippedIds, ['L1']);
  assert.equal(r.body.line, '1 listing has applications, so it was not deleted. Archive it instead.');
  assert.ok(t.listings.some((l) => l.id === 'L1'));
});

test('archive and restore: archived_at alone changes, and every KPI is the same', async () => {
  const t = world(); const before = snap(t);
  const kpisBefore = computeKpis((await loadKpiData(installFakeStack({ tables: t }).db)).data, Date.parse('2026-09-20T12:00:00Z'));
  const r = await once(t, archive, { listingIds: ['L1', 'L2'], archived: true });
  assert.equal(r.code, 200);
  assert.ok(t.listings.filter((l) => l.id === 'L1' || l.id === 'L2').every((l) => typeof l.archived_at === 'string'));
  assert.equal(t.listings.find((l) => l.id === 'L9').archived_at, null, 'the other realtor\'s listing is untouched');
  assert.deepEqual(snap(t), before, 'applications, shares, reports, Pipeline and references as they were');
  assert.equal(t.listings.find((l) => l.id === 'L1').status, 'active', 'its status is not touched');
  const kpisAfter = computeKpis((await loadKpiData(installFakeStack({ tables: t }).db)).data, Date.parse('2026-09-20T12:00:00Z'));
  assert.deepEqual(kpisAfter, kpisBefore, 'no KPI moves because a listing was archived');
  const events = t.events.filter((e) => e.type === 'listing_updated' && e.payload && 'archived' in e.payload);
  assert.equal(events.length, 2); assert.ok(events.every((e) => !('status' in e.payload)), 'never read as a reopen by the landlord report');
  const back = await once(t, archive, { listingIds: ['L1'], archived: false });
  assert.equal(back.code, 200);
  assert.equal(t.listings.find((l) => l.id === 'L1').archived_at, null, 'restored');
  assert.deepEqual(snap(t), before);
  assert.equal((await once(t, archive, { listingIds: ['L1'] })).code, 400, 'archived must be said');
});

test('the apply link of an archived listing says it takes no applications', async () => {
  const t = world();
  const props = async () => { const s = installFakeStack({ tables: t, env: { SUPABASE_SERVICE_ROLE_KEY: 'x' } }); try { return (await apply.getServerSideProps({ params: { token: INVITE_TOKEN }, query: {}, req: { headers: {} }, res: { setHeader() {} } })).props; } finally { s.restore(); } };
  assert.equal((await props()).archived, undefined, 'open as always');
  await once(t, archive, { listingIds: ['L1'], archived: true });
  assert.equal((await props()).archived, true);
  assert.match(code('pages/apply/[token].js'), /\{noWidow\('This listing is no longer taking applications\.'\)\}/);
  await once(t, archive, { listingIds: ['L1'], archived: false });
  assert.equal((await props()).archived, undefined, 'restored, it opens again');
});

test('before db/025 has run: no archive, the apply link as before, delete the same', async () => {
  const t = world({ migrated: false }); const before = JSON.stringify(t.listings);
  const r = await once(t, archive, { listingIds: ['L1'], archived: true }, USER, { absentColumns: ['archived_at'] });
  assert.equal(r.code, 503); assert.equal(r.body.available, false);
  assert.equal(JSON.stringify(t.listings), before, 'nothing written');
  assert.equal(A.archiveAvailable(t.listings), false, 'the dashboard shows no archive control');
  assert.equal(A.archiveAvailable(world().listings), true);
  const s = installFakeStack({ tables: t, absentColumns: ['archived_at'], env: { SUPABASE_SERVICE_ROLE_KEY: 'x' } });
  try { assert.equal((await apply.getServerSideProps({ params: { token: INVITE_TOKEN }, query: {}, req: { headers: {} }, res: { setHeader() {} } })).props.archived, undefined); } finally { s.restore(); }
  const d = await once(t, remove, { listingIds: ['L3'] }, USER, { absentColumns: ['archived_at'] });
  assert.equal(d.code, 200); assert.deepEqual(d.body.deleted, ['L3']);
  // The dashboard reads the column's presence and nothing else.
  assert.match(code('components/dashboard/HomeView.js'), /const canArchive = archiveAvailable\(listings\);/);
});

test('the routes are realtor writes: session, entitlement, then the ownership of every id', () => {
  for (const p of ['pages/api/listings/archive.js', 'pages/api/listings/remove.js']) assert.match(code(p), /export default withRealtor\(/, p);
  const lib = code('lib/listingArchive.js');
  assert.match(lib, /for \(const id of ids\) \{\s*const own = await ownedListing\(admin, id, userId\);\s*if \(own === null\) return \{ status: 404,[^\n]*\n\s*if \(own === false\) return \{ status: 403,/, 'every id through the one ownership check');
  assert.match(lib, /const own = await ownedListings\(admin, ids, userId\);\s*if \(!own\.listings\) return own;/);
  assert.equal((lib.match(/await ownedListings\(admin, ids, userId\)/g) || []).length, 2, 'both writes check every id first');
  assert.doesNotMatch(lib, /owner_token/);
});
