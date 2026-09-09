// The tenant submit, as the apply page calls it: pages/api/generate.js, invite/tag.js,
// applications/mirror.js, then send.js with the signature generate returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, INVITE_TOKEN } from './fixture.mjs';

const generate = (await import('../../pages/api/generate.js')).default;
const tag = (await import('../../pages/api/invite/tag.js')).default;
const mirror = (await import('../../pages/api/applications/mirror.js')).default;
const send = (await import('../../pages/api/send.js')).default;
const { ID_ALPHABET, isApplicationNumber, isOwnerToken } = await import('../../lib/applicationIds.js');
const call = async (handler, body, ip) => { const res = fakeRes(); await handler(fakeReq({ body, ip }), res); return res; };
const until = async (fn, tries = 100) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } return null; };
const FORM = { inviteToken: INVITE_TOKEN, fullName: '<b>Test</b> Person', email: 'tenant@example.com', phone: '416 555 0199', ageConfirmed: true, jobTitle: 'Nurse', employer: 'Northwind Sample Clinic Inc.', yearsAtJob: '3', annualIncome: '90000', previousAddress: '1 Old St', yearsAtPrevious: '2', previousLandlordName: 'A. Owner', currentRent: '2100', moveInDate: '2026-11-01', numberOfOccupants: '1', smoker: 'no', pets: '', reference1Name: 'R One', reference1Relationship: 'Manager', reference1Contact: '416 555 0100' };

test('generate, tag, mirror, send, then a second mirror', async () => {
  const s = installFakeStack({ tables: tables(), user: null, env: { RESEND_API_KEY: 're_fake' } });
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2500' }, submissionCount: 0 }; // the KV record says 2500; the row says 2600
  try {
    // 1. generate: the number and the token, the KV record with its TTL, the rent from the listings row
    const g = await call(generate, FORM);
    assert.equal(g.code, 200, JSON.stringify(g.body));
    const { applicationNumber, ownerToken, emailSig } = g.body;
    const re4 = `[${ID_ALPHABET}]{4}`;
    assert.match(applicationNumber, new RegExp(`^RL-\\d{4}-${re4}-${re4}$`)); assert.ok(isApplicationNumber(applicationNumber));
    assert.equal(ownerToken.length, 32); assert.ok(isOwnerToken(ownerToken)); assert.match(ownerToken, new RegExp(`^[${ID_ALPHABET}]{32}$`));
    assert.ok(emailSig && emailSig.sig && emailSig.exp, 'the send signature');
    // storeApplication is fire and forget in the route: wait for the record and its expiry to land
    const stored = await until(() => (s.kv.ttl(`app:${applicationNumber}`) > 0 ? s.kv.values[`app:${applicationNumber}`] : null));
    assert.ok(stored, 'the application record lands in KV'); assert.equal(s.kv.ttl(`app:${applicationNumber}`), 31536000, 'one year');
    assert.equal(stored.apartment.estimatedRent, 2600, 'the rent comes from the listings row, not the stale KV record');
    assert.equal(stored.apartment.rentToIncomeRatio, 35); assert.equal(stored.tenant.ageConfirmed, true); assert.equal(stored.scorecard, null);
    assert.equal(stored.ownerToken, ownerToken);
    // 2. the rate limit: ten an hour per invite token; the eleventh answers 429
    for (let i = 0; i < 9; i++) assert.equal((await call(generate, FORM)).code, 200, `call ${i + 2}`);
    const eleventh = await call(generate, FORM);
    assert.equal(eleventh.code, 429); assert.match(eleventh.body.error, /Too many applications through this link/);
    // 3. tag then mirror
    const t = await call(tag, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(t.code, 200, JSON.stringify(t.body));
    assert.equal(s.kv.values[`linvite:${INVITE_TOKEN}`].submissionCount, 1);
    const m = await call(mirror, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(m.code, 200, JSON.stringify(m.body)); assert.equal(m.body.mirrored, true); assert.equal(m.body.linked, true);
    const row = s.db.tables.applications.find((a) => a.application_number === applicationNumber);
    assert.ok(row, 'the application row'); assert.equal(row.estimated_rent, 2600); assert.equal(row.age_confirmed, true); assert.equal(row.scorecard, null); assert.equal(row.full_name, '<b>Test</b> Person');
    const links = s.db.tables.listing_applicants.filter((j) => String(j.application_id) === String(row.id));
    assert.equal(links.length, 1); assert.equal(links[0].listing_id, 'L1'); assert.equal(links[0].added_via, 'invite');
    const applied = s.db.tables.events.filter((e) => e.type === 'applicant_applied' && String(e.application_id) === String(row.id));
    assert.equal(applied.length, 1); assert.equal(applied[0].profile_id, USER.id);
    assert.match(m.body.docRequest.token, /^[a-f0-9]{32}$/); assert.equal(m.body.docRequest.url, `https://rentletter.ca/upload/${m.body.docRequest.token}`);
    assert.equal(s.kv.values[`docreq:${m.body.docRequest.token}`].linkId, links[0].id);
    assert.equal(s.kv.values[`docreq-app:${links[0].id}`].status, 'requested');
    assert.ok(s.kv.sets['docreq-pending'].has(links[0].id), 'the pending set carries the link for the nudges');
    assert.equal(s.db.tables.events.filter((e) => e.type === 'documents_requested' && e.payload && e.payload.auto).length, 1);
    // 4. the confirmation email with the signature; escaped fields; 401 without it
    const sent = await call(send, { email: FORM.email, fullName: FORM.fullName, applicationNumber, ownerToken, uploadUrl: m.body.docRequest.url, signature: emailSig });
    assert.equal(sent.code, 200, JSON.stringify(sent.body));
    assert.equal(s.resend.sent.length, 1);
    const mail = s.resend.sent[0];
    assert.equal(mail.to, FORM.email); assert.ok(mail.html.includes('&lt;b&gt;Test&lt;/b&gt;'), 'the first name is escaped'); assert.equal(mail.html.includes('<b>Test</b>'), false);
    assert.ok(mail.html.includes(applicationNumber)); assert.ok(mail.html.includes(m.body.docRequest.url)); assert.ok(mail.html.includes(ownerToken));
    const unsigned = await call(send, { email: FORM.email, fullName: FORM.fullName, applicationNumber, ownerToken });
    assert.equal(unsigned.code, 401); assert.equal(s.resend.sent.length, 1);
    // 5. a second mirror: no second event, no second junction row
    const m2 = await call(mirror, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(m2.code, 200); assert.equal(m2.body.docRequest.token, m.body.docRequest.token, 'the live request is reused');
    assert.equal(s.db.tables.listing_applicants.filter((j) => String(j.application_id) === String(row.id)).length, 1);
    assert.equal(s.db.tables.events.filter((e) => e.type === 'applicant_applied' && String(e.application_id) === String(row.id)).length, 1);
    assert.equal(s.db.tables.events.filter((e) => e.type === 'documents_requested').length, 1);
  } finally { s.restore(); }
});
