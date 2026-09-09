// THE TEST THAT WOULD HAVE CAUGHT THE THREE DAY LOSS. From 717bdd0 to 9a68bab the realtor's per
// file upload stored nothing: lib/realtorUpload.js handed `data` (a base64 string) to a store that
// required `bytes` (a Buffer), and the only test injected a fake store that accepted anything. Here
// both upload paths, the realtor's and the tenant's, run through their REAL route handlers with the
// fake Anthropic and a fake storage that, like the real bucket, refuses a body that is not bytes.
// One object per file, one row per file, the staging key, the finalize writing doc_verifications,
// the pending set entry removed, the held list showing the files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER } from './fixture.mjs';

const realtorAnalyze = (await import('../../pages/api/applicants/analyze-file.js')).default;
const realtorFinalize = (await import('../../pages/api/applicants/finalize-analysis.js')).default;
const tenantAnalyze = (await import('../../pages/api/upload/analyze-file.js')).default;
const tenantFinalize = (await import('../../pages/api/upload/finalize.js')).default;
const { mintRequest, PENDING_KEY } = await import('../../lib/docRequest.js');
const { fetchListingApplicants, attachDocVerifications } = await import('../../lib/supabaseBridge.js');
const { stagingKeyFor } = await import('../../lib/realtorUpload.js');
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const pdf = (name) => ({ name, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 synthetic test file ${name} `.repeat(4)).toString('base64') });

test('the realtor path: analyze-file per file, finalize-analysis once', async () => {
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    const first = await call(realtorAnalyze, { listingId: 'L1', linkId: 'J2', applicationId: 'A2', index: 0, total: 2, file: pdf('employment-letter.pdf') });
    assert.equal(first.code, 200, JSON.stringify(first.body)); assert.equal(first.body.documentType, 'employment letter');
    const second = await call(realtorAnalyze, { listingId: 'L1', linkId: 'J2', applicationId: 'A2', index: 1, total: 2, file: pdf('stub-july.pdf') });
    assert.equal(second.code, 200, JSON.stringify(second.body)); assert.equal(second.body.documentType, 'pay stub'); assert.equal(second.body.staged, 2);
    assert.equal(s.anthropic.calls.length, 2, 'one analysis per file');
    // one object per file, with Buffer bytes: the fake storage refuses anything else, as the bucket does
    const uploads = s.db.storageCalls.filter((c) => c[0] === 'upload');
    assert.equal(uploads.length, 2); for (const [, bucket, path] of uploads) { assert.equal(bucket, 'applicant-documents'); assert.match(path, new RegExp(`^${USER.id}/J2/[0-9a-f-]{36}\\.pdf$`)); assert.ok(Buffer.isBuffer(s.db.objects[bucket][path].bytes)); }
    const rows = s.db.tables.applicant_documents.filter((d) => d.listing_applicant_id === 'J2');
    assert.equal(rows.length, 2); assert.deepEqual(rows.map((d) => [d.uploaded_by, d.kind, d.profile_id]).sort(), [['realtor', 'employment letter', USER.id], ['realtor', 'pay stub', USER.id]]);
    assert.ok(rows.every((d) => d.bytes > 0 && d.storage_path && d.expires_at && !d.deleted_at));
    const staging = s.kv.values[stagingKeyFor(USER.id, 'J2')];
    assert.equal(Object.keys(staging.items).length, 2, 'the staging key holds both files'); assert.ok(s.kv.ttl(stagingKeyFor(USER.id, 'J2')) > 0);
    // finalize: the report on the junction row, the event, the held list, the staging key gone
    const fin = await call(realtorFinalize, { listingId: 'L1', linkId: 'J2', applicationId: 'A2' });
    assert.equal(fin.code, 200, JSON.stringify(fin.body)); assert.equal(fin.body.saved, true);
    assert.equal(fin.body.held.length, 2, 'the held list shows the files'); assert.ok(fin.body.held.every((h) => h.id && !('storagePath' in h) && !('storage_path' in h)));
    const j2 = s.db.tables.listing_applicants.find((j) => j.id === 'J2');
    assert.equal(j2.doc_verifications.active.documents.length, 2); assert.equal(j2.doc_verifications.active.source, 'realtor'); assert.equal(j2.doc_verifications.active.nameMatch, 'mismatch', 'the fake letter names Test Person, the applicant is Applicant B2B2');
    assert.equal(s.kv.values[stagingKeyFor(USER.id, 'J2')], undefined, 'staging cleared');
    assert.equal(s.db.tables.events.filter((e) => /^verification_(completed|failed)$/.test(e.type) && e.application_id === 'A2').length, 1);
    // a wrong owner and a foreign listing are refused before anything is analyzed
    const foreign = await call(realtorAnalyze, { listingId: 'L9', linkId: 'J9', applicationId: 'A6', index: 0, total: 1, file: pdf('x.pdf') });
    assert.equal(foreign.code, 403); assert.equal(s.anthropic.calls.length, 2);
  } finally { s.restore(); }
});

test('the tenant path: the request minted at submission, analyze-file per file, finalize once', async () => {
  const s = installFakeStack({ tables: tables(), user: null });
  try {
    const minted = await mintRequest({ listingId: 'L1', linkId: 'J4', applicationId: 'A4', tenantName: 'Applicant D4D4', listingName: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', realtorName: 'Sarah Chen', brokerage: 'Demo Realty' });
    assert.ok(s.kv.sets[PENDING_KEY].has('J4'), 'in the pending set (nudges)');
    const first = await call(tenantAnalyze, { token: minted.token, index: 0, total: 2, file: pdf('letter.pdf') });
    assert.equal(first.code, 200, JSON.stringify(first.body)); assert.equal(first.body.documentType, 'employment letter');
    const second = await call(tenantAnalyze, { token: minted.token, index: 1, total: 2, file: pdf('stub-1.pdf') });
    assert.equal(second.code, 200, JSON.stringify(second.body)); assert.equal(second.body.staged, 2);
    const uploads = s.db.storageCalls.filter((c) => c[0] === 'upload');
    assert.equal(uploads.length, 2); for (const [, bucket, path] of uploads) { assert.match(path, new RegExp(`^${USER.id}/J4/`)); assert.ok(Buffer.isBuffer(s.db.objects[bucket][path].bytes)); }
    const rows = s.db.tables.applicant_documents.filter((d) => d.listing_applicant_id === 'J4');
    assert.equal(rows.length, 2); assert.ok(rows.every((d) => d.uploaded_by === 'tenant' && d.profile_id === USER.id));
    const staging = s.kv.values[`docreq:${minted.token}:staging`];
    assert.equal(Object.keys(staging.items).length, 2); assert.ok(staging.items[Object.keys(staging.items)[0]].documentId, 'the held row id rides on the staged entry (remove-file)');
    const fin = await call(tenantFinalize, { token: minted.token });
    assert.equal(fin.code, 200, JSON.stringify(fin.body)); assert.deepEqual([fin.body.received, fin.body.verified], [2, true]);
    const j4 = s.db.tables.listing_applicants.find((j) => j.id === 'J4');
    assert.equal(j4.doc_verifications.active.documents.length, 2); assert.equal(j4.doc_verifications.active.source, 'tenant');
    assert.equal(s.kv.values[`docreq:${minted.token}`].status, 'received'); assert.equal(s.kv.values['docreq-app:J4'].status, 'received');
    assert.equal(s.kv.sets[PENDING_KEY].has('J4'), false, 'the pending set entry is removed');
    assert.equal(s.kv.values[`docreq:${minted.token}:staging`], undefined);
    assert.equal(s.db.tables.events.filter((e) => e.type === 'documents_uploaded' && e.application_id === 'A4').length, 1);
    // the realtor's view: the held list shows the files
    const applicants = await fetchListingApplicants(s.db, 'L1'); await attachDocVerifications(s.db, 'L1', applicants);
    const held = applicants.find((a) => a.linkId === 'J4').storedDocuments;
    assert.equal(held.length, 2); assert.deepEqual(held.map((h) => h.kind).sort(), ['employment letter', 'pay stub']); assert.ok(held.every((h) => h.uploadedBy === 'tenant' && h.deletedAt == null));
    // a second finalize is a no op success
    const again = await call(tenantFinalize, { token: minted.token });
    assert.equal(again.code, 200); assert.equal(again.body.alreadyDone, true);
  } finally { s.restore(); }
});
