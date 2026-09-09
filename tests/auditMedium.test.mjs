// The second audit's medium fixes (docs/audit-2026-09-07.md items 8, 9, 16, 17, 21): the real
// functions and route handlers with fake clients. Item 15 is tests/retention.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const res = () => { const r = { code: 0, body: null, headers: {}, redirected: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.redirect = (c, u) => { r.code = c; r.redirected = u; return r; }; return r; };

// ── 8. the magic link and the email change are consumed on a tap, never on a GET
test('8: GET on the verify routes writes nothing and sends to the confirm page; POST consumes and signs in', async () => {
  const kv = fakeKv({});
  try {
    const store = await import('../lib/tenantProfileStore.js');
    const t = await store.createMagicLink('tenant@example.com');
    const setsAfterMint = kv.calls.filter((c) => c === 'set' || c === 'del').length;
    assert.deepEqual(await store.peekMagicLink(t), { email: 'tenant@example.com' });
    assert.deepEqual(await store.peekMagicLink(t), { email: 'tenant@example.com' }, 'a peek does not consume');
    assert.equal(kv.calls.filter((c) => c === 'set' || c === 'del').length, setsAfterMint, 'peeking wrote nothing');
    const { createHandler } = await import('../pages/api/tenant/verify.js');
    const consumed = []; const cookies = [];
    const handler = createHandler({ ready: () => true, consume: async (tok) => { consumed.push(tok); return store.consumeMagicLink(tok); }, ensure: async (email) => ({ id: 'P1', email }), save: async (p) => p, session: async () => 'sess', setCookie: (r, tok) => cookies.push(tok) });
    let r = res(); await handler({ method: 'GET', query: { t } }, r);
    assert.equal(r.code, 302); assert.equal(r.redirected, `/my-application/confirm?t=${encodeURIComponent(t)}`); assert.deepEqual(consumed, []); assert.deepEqual(cookies, []);
    assert.equal(kv.calls.filter((c) => c === 'del').length, 0, 'the GET consumed nothing');
    r = res(); await handler({ method: 'POST', body: { t } }, r);
    assert.equal(r.code, 303); assert.equal(r.redirected, '/my-application'); assert.deepEqual(consumed, [t]); assert.deepEqual(cookies, ['sess']);
    assert.equal(await store.peekMagicLink(t), null, 'used');
    r = res(); await handler({ method: 'POST', body: { t } }, r);
    assert.equal(r.redirected, '/my-application?link=expired', 'a used token is refused');
    // the email change
    const ec = await import('../pages/api/tenant/verify-email-change.js');
    const applied = [];
    const h2 = ec.createHandler({ ready: () => true, consume: async (tok) => (tok === 'good-token-abcdefghijklmnop' ? { profileId: 'P1', newEmail: 'new@example.com' } : null), apply: async (id, email) => { applied.push([id, email]); return { ok: true }; } });
    r = res(); await h2({ method: 'GET', query: { t: 'good-token-abcdefghijklmnop' } }, r);
    assert.equal(r.redirected, '/my-application/confirm?t=good-token-abcdefghijklmnop&k=email'); assert.deepEqual(applied, []);
    r = res(); await h2({ method: 'POST', body: { t: 'good-token-abcdefghijklmnop' } }, r);
    assert.equal(r.redirected, '/my-application?email=changed'); assert.deepEqual(applied, [['P1', 'new@example.com']]);
    r = res(); await h2({ method: 'POST', body: { t: 'other-token-abcdefghijklmnop' } }, r);
    assert.equal(r.redirected, '/my-application?email=expired');
    // the emails link to the confirm page
    const { readFileSync } = await import('node:fs');
    assert.match(readFileSync(new URL('../pages/api/tenant/request-link.js', import.meta.url), 'utf8'), /\/my-application\/confirm\?t=/);
    assert.match(readFileSync(new URL('../pages/api/tenant/profile.js', import.meta.url), 'utf8'), /\/my-application\/confirm\?t=\$\{encodeURIComponent\(token\)\}&k=email/);
  } finally { kv.restore(); }
});

// ── 9. ranked surfaces
test('9: joint income is exposed by Fit and labelled on the report cells; unit rules leave Compare', async () => {
  const { computeFit, incomeIsJoint, householdIncomeOf } = await import('../lib/fitScore.js');
  const { buildSnapshot } = await import('../lib/reportSnapshot.js');
  const { reportLines } = await import('../lib/landlordReportPdf.js');
  const { unitRulesApply, ruleLine } = await import('../lib/unitRules.js');
  const solo = { full_name: 'Solo Person', annual_income: 79000, years_at_job: '2', references: [] };
  const joint = { ...solo, full_name: 'Joint Person', co_applicant: { name: 'Partner Person', annualIncome: 38000 } };
  assert.equal(incomeIsJoint(solo), false); assert.equal(incomeIsJoint(joint), true); assert.equal(householdIncomeOf(joint), 117000);
  const listing = { monthly_rent: 2600, pref_rent_to_income_max_pct: 40 };
  const fj = computeFit({ application: joint, listing, verification: null, confirmations: {} }), fs = computeFit({ application: solo, listing, verification: null, confirmations: {} });
  assert.equal(fj.incomeJoint, true); assert.equal(fs.incomeJoint, false); assert.equal(fj.incomeUsed, 117000);
  const payload = buildSnapshot({ listing, applicants: [
    { linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations: {}, application: { ...joint, id: 'A1', fit: fj } },
    { linkId: 'J2', decisionStatus: 'none', withdrawnAt: null, confirmations: {}, application: { ...solo, id: 'A2', fit: fs } },
  ], profile: { id: 'P1', full_name: 'Sarah Chen' } });
  const byName = Object.fromEntries(payload.applicants.map((a) => [a.name, a]));
  assert.equal(byName['Joint Person'].numbers.incomeJoint, true); assert.equal(byName['Solo Person'].numbers.incomeJoint, false);
  const lines = reportLines(payload);
  assert.equal(lines.blocks.find((b) => b.name === 'Joint Person').numbers[0][1], '$117,000 (joint)');
  assert.equal(lines.blocks.find((b) => b.name === 'Solo Person').numbers[0][1], '$79,000');
  assert.equal(unitRulesApply({ pets: 'yes', smoking: 'yes' }), false, 'both allowed: no unit rules block');
  assert.equal(unitRulesApply({ pets: 'no', smoking: 'no' }), true); assert.equal(ruleLine({ pets: 'no', smoking: 'outdoor' }), 'no pets · smoking outdoors only');
  assert.equal(ruleLine({ pets: 'any', smoking: 'no' }), 'no smoking');
});

// ── 16. orphan storage
const storageStub = (listing = {}, { failRemove = false } = {}) => {
  const removed = []; const removeCalls = [];
  const from = () => ({
    remove: async (paths) => { removeCalls.push(paths); if (failRemove) return { data: null, error: { message: 'storage down' } }; removed.push(...paths); return { data: paths, error: null }; },
    list: async (prefix) => ({ data: (listing[prefix] || []).filter((e) => !removed.includes(`${prefix ? `${prefix}/` : ''}${e.name}`)), error: null }),
    upload: async () => ({ data: {}, error: null }),
  });
  return { storage: { from }, removed, removeCalls };
};

test('16a: deleting a listing removes every live object under it before the delete', async () => {
  const t = {
    listings: [{ id: 'L1', profile_id: 'me', name: '1 Test St', address: '1 Test St', status: 'active' }],
    listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1' }, { id: 'J2', listing_id: 'L1', application_id: 'A2' }],
    applicant_documents: [
      { id: 'd1', listing_applicant_id: 'J1', storage_path: 'me/J1/d1.pdf', deleted_at: null }, { id: 'd2', listing_applicant_id: 'J1', storage_path: 'me/J1/d2.pdf', deleted_at: null },
      { id: 'd3', listing_applicant_id: 'J2', storage_path: 'me/J2/d3.pdf', deleted_at: null }, { id: 'd0', listing_applicant_id: 'J2', storage_path: 'me/J2/d0.pdf', deleted_at: '2026-08-01T00:00:00Z', deleted_by: 'expired' },
    ],
    events: [],
  };
  const admin = fakeSupabase(t); const st = storageStub(); admin.storage = st.storage;
  const { deleteListing } = await import('../lib/realtorWrites.js');
  const r = await deleteListing({ admin, userId: 'me', invalidate: () => {}, srem: async () => {} }, { listingId: 'L1' });
  assert.equal(r.status, 200); assert.equal(r.body.purgedDocuments, 3);
  assert.deepEqual(st.removed.sort(), ['me/J1/d1.pdf', 'me/J1/d2.pdf', 'me/J2/d3.pdf']);
  assert.deepEqual(t.applicant_documents.filter((d) => d.deleted_by === 'listing deleted').map((d) => d.id).sort(), ['d1', 'd2', 'd3']);
  assert.equal(t.listings.length, 0, 'the listing is deleted after the purge');
});

test('16b: the weekly reconcile removes objects with no live row and marks live rows with no object', async () => {
  const bucket = { '': [{ name: 'p1', id: null }, { name: 'stray.txt', id: 'root-file' }], p1: [{ name: 'J1', id: null }, { name: 'J9', id: null }], 'p1/J1': [{ name: 'a.pdf', id: 'ia' }, { name: 'b.pdf', id: 'ib' }], 'p1/J9': [{ name: 'z.pdf', id: 'iz' }] };
  const t = { applicant_documents: [
    { id: 'ra', storage_path: 'p1/J1/a.pdf', deleted_at: null, deleted_by: null },
    { id: 'rb', storage_path: 'p1/J1/b.pdf', deleted_at: '2026-09-01T00:00:00Z', deleted_by: 'realtor (object remains)' },
    { id: 'rc', storage_path: 'p1/J1/c.pdf', deleted_at: null, deleted_by: null },
  ] };
  const admin = fakeSupabase(t); const st = storageStub(bucket); admin.storage = st.storage;
  const { reconcileStorage } = await import('../lib/documentStore.js');
  const lines = [];
  const out = await reconcileStorage(admin, { now: new Date('2026-09-13T03:00:00Z'), log: (l) => lines.push(l) });
  assert.deepEqual([out.profiles, out.objects, out.removed, out.missing, out.capped], [1, 3, 2, 1, false]);
  assert.deepEqual(st.removed.sort(), ['p1/J1/b.pdf', 'p1/J9/z.pdf'], 'the marked object and the orphan go; the live one stays; the stray root file is untouched');
  assert.equal(t.applicant_documents.find((r) => r.id === 'rb').deleted_by, 'reconciled');
  const rc = t.applicant_documents.find((r) => r.id === 'rc'); assert.equal(rc.deleted_by, 'missing'); assert.ok(rc.deleted_at);
  assert.equal(t.applicant_documents.find((r) => r.id === 'ra').deleted_at, null);
  assert.match(lines.join('\n'), /1 live row\(s\) with no object, marked missing: rc/);
  const small = fakeSupabase({ applicant_documents: [] }); small.storage = storageStub(bucket).storage;
  const capped = await reconcileStorage(small, { log: () => {}, maxObjects: 1 });
  assert.equal(capped.capped, true); assert.equal(capped.missing, 0, 'a capped run never marks rows missing');
});

test('16c: a failed storage remove marks the row with " (object remains)" on every purge path', async () => {
  const rows = () => [{ id: 'd1', listing_applicant_id: 'J1', storage_path: 'p/J1/d1.pdf', deleted_at: null, expires_at: '2026-01-01T00:00:00Z', profile_id: 'p' }];
  const { purgeStoredDocuments, purgeStoredDocument, expireDocuments, deletedByMark } = await import('../lib/documentStore.js');
  assert.equal(deletedByMark('realtor', null), 'realtor'); assert.equal(deletedByMark('expired', { message: 'x' }), 'expired (object remains)');
  let t = { applicant_documents: rows(), listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1' }], events: [] }; let admin = fakeSupabase(t); admin.storage = storageStub({}, { failRemove: true }).storage;
  const p = await purgeStoredDocuments(admin, { linkId: 'J1', deletedBy: 'Sarah Chen' });
  assert.equal(p.objectRemains, true); assert.equal(t.applicant_documents[0].deleted_by, 'Sarah Chen (object remains)');
  t = { applicant_documents: rows() }; admin = fakeSupabase(t); admin.storage = storageStub({}, { failRemove: true }).storage;
  await purgeStoredDocument(admin, { id: 'd1', linkId: 'J1' });
  assert.equal(t.applicant_documents[0].deleted_by, 'tenant removed (object remains)');
  t = { applicant_documents: rows(), listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1' }], events: [] }; admin = fakeSupabase(t); admin.storage = storageStub({}, { failRemove: true }).storage;
  await expireDocuments(admin, { now: new Date('2026-09-08T03:00:00Z') });
  assert.equal(t.applicant_documents[0].deleted_by, 'expired (object remains)');
});

// ── 17. the invite's source of truth
test('17: a listing older than 90 days with no KV record resolves from the row and gives generate its rent', async () => {
  const token = 'a'.repeat(20);
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  const t = { listings: [{ id: 'L1', profile_id: 'P1', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', allows_pets: 'no', allows_smoking: 'no', parking_included: 'no', status: 'active', closed_at: null, invite_token: token, created_at: old }], profiles: [{ id: 'P1', full_name: 'Sarah Chen', brokerage: 'Demo Realty', province: 'ON' }] };
  const admin = fakeSupabase(t);
  const { createHandler } = await import('../pages/api/invite/resolve.js');
  const { inviteRent, resolveInvite } = await import('../lib/inviteResolve.js');
  const handler = createHandler({ getAdmin: () => admin, record: async () => null });
  let r = res(); await handler({ method: 'GET', query: { token } }, r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, { realtorName: 'Sarah Chen', realtorBrokerage: 'Demo Realty', listingName: '210 Carlaw Ave, Unit 4', unit: { address: '210 Carlaw Ave, Unit 4, Toronto', monthlyRent: '2600', bedrooms: '2', allowsPets: 'no', allowsSmoking: 'no', parkingIncluded: 'no' }, province: 'ON' });
  assert.equal(await inviteRent(admin, token, null), 2600, 'generate reads the rent from the row: estimated_rent is never null for a live listing');
  t.listings[0].status = 'rented';
  r = res(); await handler({ method: 'GET', query: { token } }, r);
  assert.deepEqual(r.body, { rented: true, realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4' });
  // a deleted listing: no row, the record still answers rented; nothing at all is 404
  const gone = createHandler({ getAdmin: () => fakeSupabase({ listings: [], profiles: [] }), record: async () => ({ realtorName: 'Sarah Chen', listingName: 'Old unit', unit: { monthlyRent: '2400' } }) });
  r = res(); await gone({ method: 'GET', query: { token } }, r);
  assert.deepEqual(r.body, { rented: true, realtorName: 'Sarah Chen', listingName: 'Old unit' });
  assert.equal(await inviteRent(fakeSupabase({ listings: [] }), token, { unit: { monthlyRent: '2400' } }), 2400, 'no row: the record rent');
  const none = createHandler({ getAdmin: () => fakeSupabase({ listings: [], profiles: [] }), record: async () => null });
  r = res(); await none({ method: 'GET', query: { token } }, r); assert.equal(r.code, 404);
  r = res(); await handler({ method: 'GET', query: { token: 'nope' } }, r); assert.equal(r.code, 400);
  assert.equal((await resolveInvite(admin, token, null)).status, 200);
});

// ── 21. one label map
test('21: every surface reads the one label map, and one realtor name on the landlord page', async () => {
  const { STATE_LABELS, stateLabel, APPLICANT_STATES } = await import('../lib/applicantState.js');
  const { buildActions } = await import('../lib/actions.js');
  const { stateLine } = await import('../lib/listingStateLine.js');
  const { fitReason } = await import('../lib/fitScore.js');
  const { buildSnapshot, confirmedSummary } = await import('../lib/reportSnapshot.js');
  for (const s of APPLICANT_STATES) assert.ok(STATE_LABELS[s], `a row for ${s}`);
  for (const s of Object.keys(STATE_LABELS)) for (const k of ['title', 'line', 'count', 'docs', 'reason']) { assert.ok(k in STATE_LABELS[s], `${s}.${k}`); if (STATE_LABELS[s][k]) assert.doesNotMatch(STATE_LABELS[s][k], /[—–]/); }
  assert.equal(stateLabel('requested', 'title', { days: 4 }), 'Waiting 4 days'); assert.equal(stateLabel('verified', 'title'), null);
  const NOW = '2026-09-08T12:00:00Z'; const ago = (d) => new Date(Date.parse(NOW) - d * 86400000).toISOString();
  const report = (over = {}) => ({ analyzedAt: ago(2), nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', found: '$90,000', annual: 90000 }, { field: 'Employer', status: 'match' }], ...over });
  const app = (linkId, name, extra = {}) => ({ linkId, decisionStatus: 'none', withdrawnAt: null, confirmations: {}, lastSentAt: null, docRequest: null, docVerifications: [], application: { full_name: name, fit: { score: 4.2, label: 'stated' } }, ...extra });
  const L = { id: 'L1', name: 'Unit', created_at: ago(1) };
  const apps = [
    app('a-check', 'Check Person', { docVerifications: [report({ comparisons: [{ field: 'Income', status: 'mismatch' }] })] }),
    app('a-mismatch', 'Mismatch Person', { docVerifications: [report({ nameMatch: 'mismatch' })] }),
    app('a-new', 'New Person'),
    app('a-wait', 'Waiting Person', { docRequest: { status: 'requested', requestedAt: ago(5) } }),
    app('a-match', 'Match Person', { docVerifications: [report()] }),
  ];
  const items = buildActions({ listings: [L], applicantsByListing: { L1: apps }, people: [], now: NOW });
  const by = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(by.check_docs.title, STATE_LABELS.checked.title); assert.equal(by.mismatch.title, STATE_LABELS.mismatch.title);
  assert.equal(by.request.title, STATE_LABELS.new.title); assert.equal(by.request.reason, STATE_LABELS.new.line);
  assert.equal(by.waiting.title, stateLabel('requested', 'title', { days: 5 })); assert.equal(by.verify.title, 'Verify Match');
  assert.equal(stateLine(apps), `1 ${STATE_LABELS.matched.count} · 2 ${STATE_LABELS.checked.count} · 1 ${STATE_LABELS.requested.count} · 1 ${STATE_LABELS.new.count}`);
  const lower = { scoreExact: 3.0, E: 2.0, A: 4, R: 4, parts: {}, evidence: { hasReport: false } }, upper = { scoreExact: 4.5, E: 5, A: 4, R: 4, parts: {}, evidence: { hasReport: true } };
  assert.equal(fitReason(lower, upper), 'No documents yet'); assert.equal(STATE_LABELS.new.reason, 'no documents yet');
  assert.equal(fitReason({ ...lower, evidence: { hasReport: true, contradicted: true } }, upper), 'Documents did not match');
  // one name: a reference answered by email is recorded by 'reference'; the landlord sees the realtor's name
  const payload = buildSnapshot({ listing: { monthly_rent: 2600 }, applicants: [{ linkId: 'J1', decisionStatus: 'none', withdrawnAt: null, confirmations: { landlord_reference: { at: ago(1), by: 'reference' }, employer: { at: ago(1), by: 'You' } }, application: { id: 'A1', full_name: 'Test Person', annual_income: 90000, fit: { score: 4, label: 'verified', ratio: 35, incomeUsed: 90000, parts: {}, evidence: {}, criteria: [] } } }], profile: { id: 'P1', full_name: 'Sarah Chen' } });
  const a = payload.applicants[0];
  assert.equal(a.confirmations.landlord_reference.by, 'Sarah Chen'); assert.equal(a.confirmations.employer.by, 'Sarah Chen');
  assert.match(a.confirmedLine, /^Confirmed by Sarah Chen: employer, previous landlord \(by email\)/);
  assert.match(confirmedSummary({ landlord_reference: { at: ago(1), by: 'Sarah Chen' } }), /^Confirmed by Sarah Chen: previous landlord \(by email\)/);
});
