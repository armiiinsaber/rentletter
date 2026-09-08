// A tenant can remove a document until they submit: the real route handler with fake KV and a fake
// service role client. Nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';
// The route and the store are loaded after the loader is registered (extensionless imports inside pages/api).
const { createHandler } = await import('../pages/api/upload/remove-file.js');
const { purgeStoredDocument, storeAnalyzedDocuments } = await import('../lib/documentStore.js');

const TOKEN = 'c'.repeat(32);
const res = () => { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const post = (body) => ({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.9' }, socket: {} });
const memLimiter = (start = 0) => { const c = {}; return { incr: async (k) => { c[k] = (c[k] || start) + 1; return c[k]; }, expire: async () => {}, c }; };

// KV as the routes see it: one request record and one staging record, three analysed files.
const kvOf = () => {
  const values = {
    [`docreq:${TOKEN}`]: { linkId: 'J1', listingId: 'L1', applicationId: 'A1', status: 'active' },
    [`docreq:${TOKEN}:staging`]: { items: {
      'stub-1.pdf::10': { index: 0, filename: 'stub-1.pdf', documentId: 'd1', document: { documentType: 'pay stub' } },
      'stub-2.pdf::10': { index: 1, filename: 'stub-2.pdf', documentId: 'd2', document: { documentType: 'pay stub' } },
      'letter.pdf::10': { index: 2, filename: 'letter.pdf', documentId: 'd3', document: { documentType: 'employment letter' } },
    } },
  };
  const sets = [];
  return { values, sets, getJson: async (k) => values[k] ?? null, setJson: async (k, v, ttl) => { values[k] = JSON.parse(JSON.stringify(v)); sets.push({ k, ttl }); } };
};
// The fake client plus a storage stub that records removed paths.
const adminOf = () => {
  const admin = fakeSupabase({ applicant_documents: [
    { id: 'd1', listing_applicant_id: 'J1', storage_path: 'p1/J1/d1.pdf', deleted_at: null, deleted_by: null },
    { id: 'd2', listing_applicant_id: 'J1', storage_path: 'p1/J1/d2.pdf', deleted_at: null, deleted_by: null },
    { id: 'd3', listing_applicant_id: 'J1', storage_path: 'p1/J1/d3.pdf', deleted_at: null, deleted_by: null },
    { id: 'dx', listing_applicant_id: 'J2', storage_path: 'p1/J2/dx.pdf', deleted_at: null, deleted_by: null },
  ] });
  const removed = [];
  admin.storage = { from: () => ({ remove: async (paths) => { removed.push(...paths); return { data: paths, error: null }; } }) };
  return { admin, removed, rows: admin.tables ? admin.tables.applicant_documents : null };
};

test('remove-file: deletes the staged entry, the stored object and marks the row tenant removed, and returns the remaining set', async () => {
  const kv = kvOf(); const { admin, removed } = adminOf(); const limiter = memLimiter();
  const handler = createHandler({ ready: () => true, getJson: kv.getJson, setJson: kv.setJson, limiter, getAdmin: () => admin, purge: purgeStoredDocument });
  const r = res(); await handler(post({ token: TOKEN, index: 1 }), r);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.removed, 1); assert.equal(r.body.purged, 1); assert.equal(r.body.staged, 2);
  assert.deepEqual(Object.keys(kv.values[`docreq:${TOKEN}:staging`].items), ['stub-1.pdf::10', 'letter.pdf::10'], 'the staged facts for that file are gone');
  assert.equal(kv.sets[0].ttl, 24 * 60 * 60, 'staging keeps its 24h TTL');
  assert.deepEqual(removed, ['p1/J1/d2.pdf'], 'exactly that file\'s object is removed');
  const { data: row } = await admin.from('applicant_documents').select('*').eq('id', 'd2').maybeSingle();
  assert.equal(row.deleted_by, 'tenant removed'); assert.ok(row.deleted_at, 'the row is marked, not dropped');
  const { data: other } = await admin.from('applicant_documents').select('*').eq('id', 'd1').maybeSingle();
  assert.equal(other.deleted_at, null, 'the other files are untouched');
  const by = Object.fromEntries(r.body.set.items.map((it) => [it.key, it]));
  assert.equal(by.paystubs.count, 1); assert.equal(by.paystubs.met, true); assert.equal(by.letter.met, true); assert.equal(r.body.set.complete, true);
  const keys = Object.keys(limiter.c);
  assert.ok(keys.some((k) => k.includes('remove') && k.includes(TOKEN)), `its own limiter key: ${keys}`); assert.ok(!keys.some((k) => k.includes('upload:')), 'never the analysis budget');
  // remove the last stub too: the pay stub row is no longer met and the set is incomplete
  const r2 = res(); await handler(post({ token: TOKEN, index: 0 }), r2);
  const by2 = Object.fromEntries(r2.body.set.items.map((it) => [it.key, it]));
  assert.equal(by2.paystubs.count, 0); assert.equal(by2.paystubs.met, false); assert.equal(r2.body.set.complete, false);
  assert.deepEqual(removed, ['p1/J1/d2.pdf', 'p1/J1/d1.pdf']);
});

test('remove-file: a wrong token, an unknown token, an unknown index, a received request and the limiter are refused', async () => {
  const kv = kvOf(); const { admin, removed } = adminOf();
  const handler = createHandler({ ready: () => true, getJson: kv.getJson, setJson: kv.setJson, limiter: memLimiter(), getAdmin: () => admin });
  let r = res(); await handler(post({ token: 'not-a-token', index: 0 }), r); assert.equal(r.code, 400);
  r = res(); await handler(post({ token: 'd'.repeat(32), index: 0 }), r); assert.equal(r.code, 404, 'no request record for that token');
  r = res(); await handler(post({ token: TOKEN, index: 7 }), r); assert.equal(r.code, 404); assert.equal(r.body.error, 'That file is not in this submission.');
  r = res(); await handler(post({ token: TOKEN }), r); assert.equal(r.code, 400);
  r = res(); await handler({ method: 'GET', body: {}, headers: {} }, r); assert.equal(r.code, 405);
  kv.values[`docreq:${TOKEN}`].status = 'received';
  r = res(); await handler(post({ token: TOKEN, index: 0 }), r); assert.equal(r.code, 409);
  assert.deepEqual(removed, [], 'nothing was purged on any refused call');
  assert.equal(Object.keys(kv.values[`docreq:${TOKEN}:staging`].items).length, 3, 'nothing was unstaged');
  const limited = createHandler({ ready: () => true, getJson: kv.getJson, setJson: kv.setJson, limiter: memLimiter(10), getAdmin: () => admin });
  kv.values[`docreq:${TOKEN}`].status = 'active';
  r = res(); await limited(post({ token: TOKEN, index: 0 }), r); assert.equal(r.code, 429);
  const down = createHandler({ ready: () => false });
  r = res(); await down(post({ token: TOKEN, index: 0 }), r); assert.equal(r.code, 503);
});

test('purgeStoredDocument is scoped to the applicant, and the store returns the row ids the staging keeps', async () => {
  const { admin, removed } = adminOf();
  const wrong = await purgeStoredDocument(admin, { id: 'dx', linkId: 'J1', deletedBy: 'tenant removed' });
  assert.equal(wrong.count, 0); assert.deepEqual(removed, [], 'another applicant\'s row id does nothing');
  const gone = await purgeStoredDocument(admin, { id: 'd3', linkId: 'J1' });
  assert.equal(gone.count, 1); assert.deepEqual(removed, ['p1/J1/d3.pdf']);
  const again = await purgeStoredDocument(admin, { id: 'd3', linkId: 'J1' });
  assert.equal(again.count, 0, 'a marked row is not purged twice');
  // the store: one uploaded file gives one id, which analyze-file keeps as documentId on the staged entry
  const store = fakeSupabase({ applicant_documents: [], events: [] });
  const uploads = [];
  store.storage = { from: () => ({ upload: async (path) => { uploads.push(path); return { data: { path }, error: null }; }, remove: async () => ({ data: [], error: null }) }) };
  const out = await storeAnalyzedDocuments(store, { profileId: 'p1', listingId: 'L1', linkId: 'J1', applicationId: 'A1', applicantName: 'Test Person', uploadedBy: 'tenant', files: [{ mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 synthetic'), kind: 'pay stub' }] });
  assert.equal(out.stored, 1); assert.equal(out.ids.length, 1); assert.match(out.ids[0], /^[0-9a-f-]{36}$/);
  const { data: rows } = await store.from('applicant_documents').select('*');
  assert.equal(rows[0].id, out.ids[0]); assert.equal(uploads.length, 1);
});
