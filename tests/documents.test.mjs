// node --test tests/   (npm test). Pure modules with a mocked service role client: nothing here
// touches the network, Supabase, or the bucket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RETENTION_DAYS, expiryFor, daysUntil, isIdKind } from '../lib/documentRetention.js';
import { storagePathFor, storeAnalyzedDocuments, purgeStoredDocuments, expireDocuments, cronGate, toClientDocument } from '../lib/documentStore.js';
import { ownedApplicant } from '../lib/ownApplicant.js';

const OWNER_TOKEN = 'ot_9f8e7d6c5b4a3210fixture';
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// A tiny chainable mock of the parts of supabase-js the store and the ownership helper use.
// `respond(q)` receives { table, op, filters, payload, limit, single } and returns { data, error }.
function mockAdmin(respond, storage = {}) {
  const calls = [];
  const from = (table) => {
    const q = { table, op: 'select', filters: [], payload: null, limit: null, single: false };
    const chain = {
      select(sel) { if (q.op === 'select') q.select = sel; return chain; },
      update(p) { q.op = 'update'; q.payload = p; return chain; },
      insert(p) { q.op = 'insert'; q.payload = p; return chain; },
      eq(k, v) { q.filters.push(['eq', k, v]); return chain; },
      in(k, v) { q.filters.push(['in', k, v]); return chain; },
      is(k, v) { q.filters.push(['is', k, v]); return chain; },
      lt(k, v) { q.filters.push(['lt', k, v]); return chain; },
      limit(n) { q.limit = n; return chain; },
      maybeSingle() { q.single = true; return chain; },
      then(res, rej) { calls.push(q); return Promise.resolve(respond(q, calls)).then(res, rej); },
    };
    return chain;
  };
  const uploads = [], removes = [];
  const admin = {
    from,
    storage: { from: () => ({
      upload: async (path, bytes, opts) => { uploads.push({ path, bytes, opts }); calls.push({ table: 'storage', op: 'upload', path }); return storage.upload ? storage.upload(path) : { data: { path }, error: null }; },
      remove: async (paths) => { removes.push(paths); calls.push({ table: 'storage', op: 'remove', paths }); return { data: paths, error: null }; },
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
    }) },
  };
  return { admin, calls, uploads, removes };
}

test('expiryFor adds RETENTION_DAYS (14) to the upload time', () => {
  assert.equal(RETENTION_DAYS, 14);
  assert.equal(expiryFor('2026-09-02T10:00:00.000Z'), '2026-09-16T10:00:00.000Z');
  assert.equal(daysUntil('2026-09-16T10:00:00.000Z', Date.parse('2026-09-07T09:00:00Z')), 10);
  assert.equal(daysUntil('2026-09-01T10:00:00.000Z', Date.parse('2026-09-07T09:00:00Z')), 0);
  assert.ok(isIdKind('government ID') && isIdKind('passport') && isIdKind("driver's licence") && !isIdKind('pay stub'));
});

test('the storage path is profile/junction/uuid.ext and never contains owner_token', async () => {
  const p = storagePathFor({ profileId: 'p1', linkId: 'j1', mime: 'application/pdf', id: 'u1' });
  assert.equal(p, 'p1/j1/u1.pdf');
  // The store function is handed an application carrying owner_token (as the upload routes hold
  // one in scope); the path it writes must not contain it, nor any applicant field.
  const { admin, uploads } = mockAdmin((q) => (q.op === 'insert' ? { data: null, error: null } : { data: [], error: null }));
  const r = await storeAnalyzedDocuments(admin, { profileId: 'p1', listingId: 'L1', linkId: 'j1', applicationId: 'a1', applicantName: 'Ana Ruiz', uploadedBy: 'tenant', application: { owner_token: OWNER_TOKEN, full_name: 'Ana Ruiz' }, files: [{ mime: 'image/png', bytes: Buffer.from('png'), kind: 'government id' }] });
  assert.equal(r.stored, 1);
  assert.equal(uploads.length, 1);
  assert.ok(!uploads[0].path.includes(OWNER_TOKEN));
  assert.ok(!uploads[0].path.includes('Ana'));
  assert.match(uploads[0].path, /^p1\/j1\/[0-9a-f-]{36}\.png$/);
  const c = toClientDocument({ id: 'd1', storage_path: 'p1/j1/x.png', profile_id: 'p1', kind: 'government id' });
  assert.equal(c.storage_path, undefined); assert.equal(c.profile_id, undefined);
});

test('ownership: a junction row whose listing belongs to another profile is rejected', async () => {
  const listingOf = (owner) => (q) => q.table === 'listing_applicants' ? { data: { id: 'j1', listing_id: 'L1', application_id: 'a1' }, error: null } : { data: { id: 'L1', name: '12 Main', profile_id: owner }, error: null };
  assert.equal(await ownedApplicant(mockAdmin(listingOf('someone-else')).admin, 'j1', 'me'), false);
  const own = await ownedApplicant(mockAdmin(listingOf('me')).admin, 'j1', 'me');
  assert.equal(own.listing.id, 'L1'); assert.equal(own.junction.id, 'j1');
  assert.equal(await ownedApplicant(mockAdmin(() => ({ data: null, error: null })).admin, 'missing', 'me'), null);
  // Each route runs the explicit check after the entitlement gate, and none reads listings under RLS.
  for (const f of ['pages/api/documents/open.js', 'pages/api/documents/delete.js', 'pages/api/applicants/confirm.js']) {
    const s = src(f);
    assert.ok(s.includes('requireEntitlement(req, res, supabase, user)'), `${f} entitlement`);
    assert.ok(s.indexOf('ownedApplicant(admin') > s.indexOf('requireEntitlement('), `${f} ownership after entitlement`);
    assert.ok(!s.includes("supabase.from('listings')"), `${f} must not rely on an RLS listing read`);
  }
});

test('reanalyze: the previous stored rows are removed and marked before the new ones are inserted', async () => {
  const { admin, calls, removes } = mockAdmin((q) => {
    if (q.table === 'applicant_documents' && q.op === 'select') return { data: [{ id: 'old1', storage_path: 'p1/j1/old1.pdf' }, { id: 'old2', storage_path: 'p1/j1/old2.jpg' }], error: null };
    return { data: null, error: null };
  });
  const r = await storeAnalyzedDocuments(admin, { profileId: 'p1', listingId: 'L1', linkId: 'j1', applicationId: 'a1', uploadedBy: 'realtor', replace: true, files: [{ mime: 'application/pdf', bytes: Buffer.from('pdf'), kind: 'pay stub' }] });
  assert.equal(r.stored, 1);
  const mark = calls.findIndex((c) => c.op === 'update' && c.payload?.deleted_by === 'reanalyze');
  const firstInsert = calls.findIndex((c) => c.op === 'insert');
  const removeAt = calls.findIndex((c) => c.op === 'remove');
  assert.ok(mark >= 0 && firstInsert >= 0 && removeAt >= 0);
  assert.ok(removeAt < mark && mark < firstInsert, `remove ${removeAt} < mark ${mark} < insert ${firstInsert}`);
  assert.deepEqual(removes[0], ['p1/j1/old1.pdf', 'p1/j1/old2.jpg']);
  assert.deepEqual(calls[mark].filters, [['in', 'id', ['old1', 'old2']]]);
});

test('purge and expire mark rows with the right deleted_by, and an absent table is skipped', async () => {
  const purge = mockAdmin((q) => (q.op === 'select' ? { data: [{ id: 'd1', storage_path: 'p1/j1/d1.png' }], error: null } : { data: null, error: null }));
  assert.deepEqual(await purgeStoredDocuments(purge.admin, { linkId: 'j1', deletedBy: 'Armin' }), { count: 1, absent: false });
  assert.equal(purge.calls.find((c) => c.op === 'update').payload.deleted_by, 'Armin');
  let selects = 0;
  const exp = mockAdmin((q) => {
    if (q.table === 'applicant_documents' && q.op === 'select') { selects++; return { data: selects === 1 ? [{ id: 'e1', storage_path: 'p1/j1/e1.pdf', listing_applicant_id: 'j1', profile_id: 'p1' }] : [], error: null }; }
    if (q.table === 'listing_applicants') return { data: [{ id: 'j1', listing_id: 'L1', application_id: 'a1' }], error: null };
    return { data: null, error: null };
  });
  const r = await expireDocuments(exp.admin, { now: new Date('2026-09-17T03:00:00Z') });
  assert.deepEqual(r, { expired: 1, applicants: 1 });
  assert.equal(exp.calls.find((c) => c.op === 'update').payload.deleted_by, 'expired');
  const absent = mockAdmin(() => ({ data: null, error: { code: '42P01', message: 'relation "public.applicant_documents" does not exist' } }));
  assert.deepEqual(await purgeStoredDocuments(absent.admin, { linkId: 'j1', deletedBy: 'x' }), { count: 0, absent: true });
  assert.deepEqual(await storeAnalyzedDocuments(absent.admin, { profileId: 'p1', linkId: 'j1', uploadedBy: 'tenant', files: [{ mime: 'image/png', bytes: Buffer.from('x'), kind: 'unknown' }] }), { stored: 0, absent: true });
});

test('the cron gate returns 503 without CRON_SECRET and 401 with a wrong bearer', () => {
  assert.deepEqual(cronGate({ headers: { authorization: 'Bearer abc' } }, {}), { status: 503 });
  assert.deepEqual(cronGate({ headers: { authorization: 'Bearer wrong' } }, { CRON_SECRET: 'abc' }), { status: 401 });
  assert.deepEqual(cronGate({ headers: {} }, { CRON_SECRET: 'abc' }), { status: 401 });
  assert.equal(cronGate({ headers: { authorization: 'Bearer abc' } }, { CRON_SECRET: 'abc' }), null);
  const s = src('pages/api/cron/expire-documents.js');
  assert.ok(s.indexOf('cronGate(req)') < s.indexOf('expireDocuments('), 'the route gates before it expires');
  assert.match(src('vercel.json'), /"\/api\/cron\/expire-documents"[\s\S]*"0 3 \* \* \*"/);
});
