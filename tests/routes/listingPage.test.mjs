// The listing page load: pages/listing/[id].js getServerSideProps and the refresh route
// pages/api/listings/applicants.js over the fake stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeCtx, fakeReq, fakeRes, findKeys } from '../helpers/fakeStack.mjs';
import { tables, USER, ago, NOW, DAY } from './fixture.mjs';

const page = await import('../../pages/listing/[id].js');
const route = (await import('../../pages/api/listings/applicants.js')).default;
const { compareFit } = await import('../../lib/fitScore.js');

const withSnapshot = () => { const t = tables(); t.report_snapshots.push({ id: 'S1', listing_id: 'L1', profile_id: USER.id, token: 't'.repeat(32), payload: { applicants: [{ rank: 1, linkId: 'J1', name: 'Applicant A1A1' }, { rank: 2, linkId: 'J2', name: 'Applicant B2B2' }] }, answers: { 1: { answer: 'meet', at: ago(1) } }, opened_count: 2, last_opened_at: ago(1), sent_to_name: 'Marco Rossi', expires_at: new Date(NOW + 80 * DAY).toISOString(), created_at: ago(2) }); return t; };

test('another realtor\'s listing id redirects to the index', async () => {
  const s = installFakeStack({ tables: withSnapshot(), user: USER });
  try { assert.deepEqual(await page.getServerSideProps(fakeCtx({ params: { id: 'L9' } })), { redirect: { destination: '/dashboard', permanent: false } }); } finally { s.restore(); }
});

test('the owner\'s listing: the applicants with Fit, the snapshot meta, the reference answers, the document requests, the duplicate marks, no owner_token', async () => {
  const s = installFakeStack({ tables: withSnapshot(), user: USER });
  s.kv.values['docreq-app:J2'] = { token: 'f'.repeat(32), status: 'requested', requestedAt: ago(2), receivedAt: null, nudgedAt: [ago(1)] };
  try {
    s.db.queries.length = 0; s.kv.calls.length = 0;
    const r = await page.getServerSideProps(fakeCtx({ params: { id: 'L1' } }));
    const { initialListing, initialApplicants, initialProfile } = r.props;
    console.log(`  listing page load: supabase queries=${s.db.queries.length} kv calls=${s.kv.calls.length}`);
    assert.equal(initialProfile.id, USER.id); assert.equal(initialListing.id, 'L1');
    assert.deepEqual(initialApplicants.map((a) => a.linkId), ['J1', 'J2', 'J3', 'J4', 'J5'], 'the loader returns creation order; the view sorts with compareFit');
    const sorted = [...initialApplicants].sort(compareFit);
    assert.equal(sorted.at(-1).linkId, 'J4', 'null Fit last'); assert.equal(sorted[0].linkId, 'J1');
    for (let i = 1; i < sorted.length - 1; i++) assert.ok(sorted[i - 1].application.fit.scoreExact >= sorted[i].application.fit.scoreExact, 'descending scoreExact');
    const by = Object.fromEntries(initialApplicants.map((a) => [a.linkId, a]));
    assert.equal(by.J1.application.fit.label, 'verified'); assert.equal(by.J4.application.fit, null);
    assert.equal(by.J3.decisionStatus, 'reject'); assert.equal(by.J3.decisionReasonCode, 'income_below_min');
    assert.deepEqual([initialListing.snapshot.token, initialListing.snapshot.openedCount, initialListing.snapshot.sentToName], ['t'.repeat(32), 2, 'Marco Rossi'], 'the latest snapshot meta');
    assert.deepEqual(by.J1.landlordAnswer && [by.J1.landlordAnswer.answer, by.J1.landlordAnswer.rank], ['meet', 1]);
    assert.equal(by.J1.referenceResponse.status, 'answered'); assert.equal(by.J1.referenceResponse.answers.paidOnTime, 'always');
    assert.equal(by.J2.docRequest.status, 'requested'); assert.equal(by.J2.docRequest.nudgedAt.length, 1); assert.equal(by.J1.docRequest, null);
    assert.equal(by.J5.duplicateOf, 'J1'); assert.equal(by.J1.duplicateOf, undefined);
    assert.ok(Array.isArray(by.J1.storedDocuments), 'the held documents list is present (empty here)');
    assert.deepEqual(findKeys(r.props, ['owner_token', 'cover_letter']), []);
    // the refresh route answers the same shape
    const res = fakeRes(); await route(fakeReq({ method: 'GET', query: { listingId: 'L1' } }), res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.applicants.map((a) => [a.linkId, a.application.fit && a.application.fit.score]), initialApplicants.map((a) => [a.linkId, a.application.fit && a.application.fit.score]));
    assert.deepEqual(findKeys(res.body, ['owner_token', 'cover_letter']), []);
    const foreign = fakeRes(); await route(fakeReq({ method: 'GET', query: { listingId: 'L9' } }), foreign);
    assert.equal(foreign.code, 404);
    const anon = installFakeStack({ tables: withSnapshot(), user: null }); try { const r2 = fakeRes(); await route(fakeReq({ method: 'GET', query: { listingId: 'L1' } }), r2); assert.equal(r2.code, 401); } finally { anon.restore(); }
  } finally { s.restore(); }
});
