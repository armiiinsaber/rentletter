// The re invite (lib/reconsiderInvite.js) through POST /api/applicants/reconsider over the fake
// stack: one send per applicant per listing, none on undo, the expired documents line only when
// the expiry removed a document, a failed send that leaves the move standing, and the owner
// token in the tenant's one link and nowhere on the realtor side. Plus the rule for where the
// Reconsider pill shows, over every listing state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER } from './fixture.mjs';

const reconsider = (await import('../../pages/api/applicants/reconsider.js')).default;
const applicantsRoute = (await import('../../pages/api/listings/applicants.js')).default;
const { reconsiderEmail, applicationUrl } = await import('../../lib/reconsiderInvite.js');
const { offersReconsider, offersShortlist, RECONSIDER_EMAIL, reconsideredLine, STATE_LABELS } = await import('../../lib/applicantState.js');
const { APPLICATION_STATE: A, LISTING_STATE: L } = await import('../../lib/application-state.js');

const TOKEN = 'ownerTokenSecret0123456789';
const call = async (handler, body, query) => { const res = fakeRes(); await handler(fakeReq({ body, query, method: body ? 'POST' : 'GET' }), res); return res; };
let stack;
// L1 was rented and reopened: J2 and J4 were told no. J2's application carries its owner token.
const up = ({ docs = [], failSend = false } = {}) => {
  if (stack) stack.restore();
  const t = { ...tables(), application_events: [] };
  for (const [id, state] of [['J1', A.FELL_THROUGH], ['J2', A.NOT_SELECTED], ['J4', A.NOT_SELECTED]]) Object.assign(t.listing_applicants.find((j) => j.id === id), { state, decision_priority: 'normal' });
  Object.assign(t.listings.find((l) => l.id === 'L1'), { state: L.LIVE, status: 'active' });
  Object.assign(t.applications.find((a) => a.id === 'A2'), { owner_token: TOKEN, full_name: 'Priya Sharma', email: 'priya@example.com' });
  t.applicant_documents.push(...docs);
  stack = installFakeStack({ tables: t, user: USER });
  if (failSend) stack.resend.emails.send = async () => { throw new Error('mail service down'); };
  return stack;
};
const sends = () => stack.resend.sent;

test('one send per applicant per listing: reconsider, undo, reconsider again sends once', async () => {
  const s = up();
  let r = await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.invite, { sent: true });
  assert.equal(sends().length, 1);
  r = await call(reconsider, { linkId: 'J2', undo: true });
  assert.equal(r.code, 200); assert.equal(r.body.invite, undefined, 'no invite on undo'); assert.equal(sends().length, 1, 'no send on undo');
  r = await call(reconsider, { linkId: 'J2', reason: 'listing_reopened' });
  assert.equal(r.code, 200); assert.deepEqual(r.body.invite, { sent: false, reason: 'already_invited' });
  assert.equal(sends().length, 1, 'still one');
  // Another applicant on the same listing gets their own one.
  assert.equal((await call(reconsider, { linkId: 'J4', reason: 'winner_fell_through' })).code, 200);
  assert.equal(sends().length, 2);
  assert.equal(s.db.tables.application_events.filter((e) => e.to_state === A.RECONSIDERED && e.listing_applicant_id === 'J2').length, 2, 'the audit holds both moves; the invite went with the first');
});

test('the message: from the realtor, reply to the realtor, the subject and the words as written, the tenant\'s own link', async () => {
  up();
  await call(reconsider, { linkId: 'J2', reason: 'winner_withdrew' });
  const m = sends()[0];
  assert.equal(m.to, 'priya@example.com'); assert.equal(m.reply_to, USER.email);
  assert.match(m.from, /^Sarah Chen via Rentletter <hello@rentletter\.ca>$/);
  assert.equal(m.subject, '210 Carlaw Ave, Unit 4: still interested?');
  const text = m.text;
  assert.match(text, /^Hi Priya,\n/);
  assert.ok(text.includes('The unit at 210 Carlaw Ave, Unit 4 is available again, and Sarah Chen would like to look at your application once more.'));
  assert.ok(text.includes('If you are still interested, open your application below.'));
  assert.ok(text.includes('If not, there is nothing to do.'));
  assert.ok(!text.includes(RECONSIDER_EMAIL.expired), 'no expired line without an expired document');
  const url = applicationUrl('RL-2026-TEST-B2B2', TOKEN);
  assert.ok(text.includes(`Open my application: ${url}`)); assert.ok(m.html.includes(`href="${url.replace(/&/g, '&amp;')}"`));
  // The token is in that one link and nowhere else in the message.
  assert.equal(text.split(TOKEN).length - 1, 1); assert.equal(m.html.split(TOKEN).length - 1, 1);
  // Neutral: nothing about why they were not chosen, no dash as punctuation.
  for (const body of [text, m.html.replace(/<[^>]+>/g, ' ')]) { assert.doesNotMatch(body, /\b(not selected|another applicant|chosen|reason|income|age|family|children|religion|disability|nationality)\b|[\u2013\u2014]| - /i); }
});

test('the expired documents line only when the expiry removed one of their documents', async () => {
  const doc = (id, deletedBy) => ({ id, listing_applicant_id: 'J2', profile_id: USER.id, storage_path: `${USER.id}/J2/${id}.pdf`, kind: 'pay stub', expires_at: '2026-08-01T00:00:00Z', deleted_at: deletedBy ? '2026-08-01T04:00:00Z' : null, deleted_by: deletedBy });
  up({ docs: [doc('D1', 'Sarah Chen')] });
  await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  assert.ok(!sends()[0].text.includes(RECONSIDER_EMAIL.expired), 'deleted by the realtor is not expiry');
  up({ docs: [doc('D1', 'expired')] });
  await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  const t = sends()[0].text;
  assert.ok(t.includes(RECONSIDER_EMAIL.expired));
  assert.ok(t.indexOf(RECONSIDER_EMAIL.expired) < t.indexOf(RECONSIDER_EMAIL.button), 'before the button');
  up({ docs: [doc('D1', 'expired (object remains)')] });
  await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  assert.ok(sends()[0].text.includes(RECONSIDER_EMAIL.expired));
});

test('a failed send leaves the reconsider standing and says so; the failure is logged', async () => {
  const s = up({ failSend: true });
  const logged = []; const orig = console.error; console.error = (...a) => logged.push(a.join(' '));
  let r;
  try { r = await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' }); } finally { console.error = orig; }
  assert.equal(r.code, 200); assert.equal(r.body.state, A.RECONSIDERED); assert.deepEqual(r.body.invite, { sent: false, reason: 'send_failed' });
  assert.equal(s.db.tables.listing_applicants.find((j) => j.id === 'J2').state, A.RECONSIDERED);
  assert.ok(logged.some((l) => /reconsiderInvite/.test(l)), 'logged');
  assert.ok(!logged.join(' ').includes(TOKEN), 'the log never carries the token');
});

test('no owner token in any realtor response', async () => {
  up();
  const bodies = [];
  bodies.push((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).body);
  bodies.push((await call(reconsider, { linkId: 'J2', undo: true })).body);
  bodies.push((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).body);
  bodies.push((await call(applicantsRoute, null, { listingId: 'L1' })).body);
  for (const b of bodies) { const j = JSON.stringify(b); assert.ok(!j.includes(TOKEN), j.slice(0, 120)); assert.ok(!/owner_?token/i.test(j)); }
});

test('Reconsider shows only for someone told no on a live listing; never on rented, paused, withdrawn or draft', () => {
  const told = { state: A.NOT_SELECTED };
  assert.equal(offersReconsider(told, { state: L.LIVE }), true);
  for (const state of [L.RENTED, L.PAUSED, L.WITHDRAWN, L.DRAFT]) assert.equal(offersReconsider(told, { state }), false, state);
  for (const status of ['rented', 'closed']) assert.equal(offersReconsider(told, { status }), false, `status ${status} with no state column`);
  for (const s of [A.SUBMITTED, A.SHORTLISTED, A.RECONSIDERED, A.ACCEPTED, A.FELL_THROUGH]) assert.equal(offersReconsider({ state: s }, { state: L.LIVE }), false, s);
  assert.equal(offersReconsider({ state: A.NOT_SELECTED, decision_status: 'reject' }, { state: L.LIVE }), false, 'a set aside card keeps its own line');
  assert.equal(offersShortlist({ state: A.RECONSIDERED }), true); assert.equal(offersShortlist({ state: A.NOT_SELECTED }), false);
});

test('the wording: the two new rows in the one label map, and the reconsidered line never ends on its separator', () => {
  assert.deepEqual({ ...STATE_LABELS.reconsidered }, { title: null, line: 'Reconsidered · {reason}', count: 'reconsidered', docs: null, reason: null });
  assert.deepEqual({ ...STATE_LABELS.not_selected }, { title: null, line: 'Not selected', count: 'not selected', docs: null, reason: null });
  assert.equal(reconsideredLine('winner_fell_through'), 'Reconsidered · the first choice fell through');
  assert.equal(reconsideredLine(undefined), 'Reconsidered');
  const m = reconsiderEmail({ address: 'X', realtorName: 'Sarah Chen', applicantName: '', url: 'https://rentletter.ca/my-application?app=A&token=B' });
  assert.match(m.text, /^Hi,\n/, 'no name, no empty greeting');
});
