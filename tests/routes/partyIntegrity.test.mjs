// A co applicant's or guarantor's document checks, through the real handlers over the fake stack:
// the party's pay stub raises its flag on the party's own report (pages/api/upload/finalize.js),
// never the primary's; Request a new copy (pages/api/applicants/request-documents.js with partyId)
// reaches that party alone, behind the session, the entitlement and the ownership check, and the
// party's email never comes back to the realtor's browser. A party on another application, one whose
// form is not in, and one who withdrew are refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER } from './fixture.mjs';

const requestDocuments = (await import('../../pages/api/applicants/request-documents.js')).default;
const tenantAnalyze = (await import('../../pages/api/upload/analyze-file.js')).default;
const tenantFinalize = (await import('../../pages/api/upload/finalize.js')).default;
const { appKey, kvGetJson } = await import('../../lib/docRequest.js');
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const pdf = (name) => ({ name, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 ${name}`).toString('base64') });

const PARTIES = [
  { id: 'P1', application_id: 'A4', role: 'guarantor', status: 'submitted', full_name: 'Pat Guarantor', email: 'pat@example.com', employer: 'Northwind Sample Clinic Inc.', job_title: 'Clinic Coordinator', annual_income: 85000, doc_verifications: null },
  { id: 'P2', application_id: 'A4', role: 'co_applicant', status: 'invited', full_name: 'Jordan Lee', email: 'jordan@example.com', doc_verifications: null },
  { id: 'P3', application_id: 'A1', role: 'guarantor', status: 'submitted', full_name: 'Sam Other', email: 'sam@example.com', doc_verifications: null },
  { id: 'P4', application_id: 'A4', role: 'co_applicant', status: 'withdrawn', full_name: 'Ola Lindqvist', email: 'ola@example.com', doc_verifications: null },
];
let stack;
const up = (user = USER) => {
  if (stack) stack.restore();
  const t = tables(); t.application_parties = PARTIES.map((p) => ({ ...p }));
  stack = installFakeStack({ tables: t, user });
  return stack;
};
const ask = (body) => call(requestDocuments, { listingId: 'L1', linkId: 'J4', applicationId: 'A4', ...body });

test('a guarantor\'s stub: the flag on the guarantor\'s own report, and the new copy request to the guarantor alone', async () => {
  const s = up();
  const primaryEmail = s.db.tables.applications.find((a) => a.id === 'A4').email;
  // The guarantor's own request, then their stub whose net is not gross less deductions.
  const minted = await ask({ partyId: 'P1', sendEmail: false });
  assert.equal(minted.code, 200, JSON.stringify(minted.body));
  assert.equal((await call(tenantAnalyze, { token: minted.body.token, index: 0, total: 1, file: pdf('pay stub netoff (Pat Guarantor).pdf') })).code, 200);
  const fin = await call(tenantFinalize, { token: minted.body.token });
  assert.equal(fin.code, 200, JSON.stringify(fin.body));
  const pat = s.db.tables.application_parties.find((p) => p.id === 'P1');
  assert.deepEqual((pat.doc_verifications.active.integrity || []).map((f) => f.type), ['pay_arithmetic']);
  assert.match(pat.doc_verifications.active.integrity[0].sentence, /does not equal gross less deductions \(\$312 apart\)\.$/);
  assert.equal(s.db.tables.listing_applicants.find((j) => j.id === 'J4').doc_verifications, null, 'nothing on the primary\'s report');
  const held = s.db.tables.applicant_documents.find((d) => d.id === pat.doc_verifications.active.integrity[0].documentId);
  assert.equal(held.application_party_id, 'P1', 'the flag points at the guarantor\'s own held file');
  // Request a new copy: renewed, emailed to the guarantor, nothing to the primary.
  const primaryPointer = await kvGetJson(appKey('J4'));
  const before = s.resend.sent.length;
  const r = await ask({ partyId: 'P1', sendEmail: true, renew: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.emailed, true);
  const mails = s.resend.sent.slice(before);
  assert.deepEqual(mails.map((m) => m.to), ['pat@example.com']);
  assert.ok(!mails.some((m) => String(m.to).toLowerCase() === String(primaryEmail).toLowerCase()), 'never the primary');
  assert.match(mails[0].subject, /upload your documents/); assert.match(mails[0].html, /Hi Pat Guarantor,/); assert.match(mails[0].html, /for the rental application you joined/);
  assert.notEqual(r.body.token, minted.body.token, 'a new link'); assert.ok(mails[0].html.includes(r.body.url));
  assert.equal((await kvGetJson(appKey('J4', 'P1'))).token, r.body.token, 'the guarantor\'s own request');
  assert.deepEqual(await kvGetJson(appKey('J4')), primaryPointer, 'the primary\'s request is untouched');
  assert.equal(r.body.tenantEmail, null); assert.equal(r.body.sentToName, 'Pat Guarantor');
  assert.ok(!JSON.stringify(r.body).includes('pat@example.com'), 'the guarantor\'s email stays on the server');
  const ev = s.db.tables.events.filter((e) => e.type === 'documents_requested').at(-1);
  assert.equal(ev.payload.partyId, 'P1');
  // The primary's own request still goes to the primary.
  const own = await ask({ sendEmail: true, renew: true });
  assert.equal(own.code, 200); assert.equal(s.resend.sent.at(-1).to, String(primaryEmail).toLowerCase()); assert.equal(own.body.sentToName, null);
});

test('a party request is refused for another application\'s party, a form not in, a withdrawn party, another realtor and no session', async () => {
  up();
  let r = await ask({ partyId: 'P3', sendEmail: true });
  assert.equal(r.code, 404); assert.equal(r.body.error, 'That person is not on this application.');
  r = await ask({ partyId: 'P2', sendEmail: true });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'That person has not sent their form yet.');
  r = await ask({ partyId: 'P4', sendEmail: true });
  assert.equal(r.code, 409); assert.equal(r.body.error, 'That person is no longer on this application.');
  r = await ask({ partyId: 'nobody', sendEmail: true });
  assert.equal(r.code, 404);
  assert.equal(stack.resend.sent.length, 0, 'nothing sent');
  up(OTHER);
  r = await ask({ partyId: 'P1', sendEmail: true });
  assert.ok([403, 404].includes(r.code), `another realtor: ${r.code}`); assert.equal(stack.resend.sent.length, 0);
  up(null);
  assert.equal((await ask({ partyId: 'P1', sendEmail: true })).code, 401);
  stack.restore();
});
