// The realtor circle and the brokerage record (lib/circle.js, lib/brokerage.js, pages/api/circle,
// pages/api/brokerage/confirm.js, pages/api/admin/brokerages.js, db/021-realtor-circle.sql):
//   · search never answers an email, a phone or anything private;
//   · a connection needs both sides;
//   · removing ends it for both, silently;
//   · a realtor who turned findable off is in no search;
//   · the request limits hold;
//   · joining through a realtor's invite link connects the new realtor to the inviter;
//   · a realtor cannot accept a request meant for someone else;
//   · the routes are realtor writes: session, entitlement, the caller's own id;
//   · a block is silent and stops requests;
//   · a brokerage is confirmed only by the broker of record's link and then the office;
//   · the timeline lines, and the app before db/021 has run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes, fakeDb, fakeKvStore, findKeys } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER } from './fixture.mjs';

const Ci = await import('../../lib/circle.js');
const B = await import('../../lib/brokerage.js');
const S = await import('../../lib/signupSource.js');
const E = await import('../../lib/eventTypes.js');
const circle = (await import('../../pages/api/circle/index.js')).default;
const brokerageRoute = (await import('../../pages/api/circle/brokerage.js')).default;
const confirmRoute = (await import('../../pages/api/brokerage/confirm.js')).default;
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');

const MAYA = { id: 'realtor-3', email: 'maya.private@brokerage.ca', user_metadata: {} };
const HIDDEN = { id: 'realtor-4', email: 'hidden@brokerage.ca', user_metadata: {} };
const person = (u, over) => ({ id: u.id, email: u.email, plan: 'founding', province: 'ON', created_at: '2026-05-01T15:00:00Z', phone: '416 555 0142', stripe_customer_id: 'cus_SECRET', invite_code: null, invited_by: null, signup_source: 'direct', circle_findable: null, does_rentals: null, service_areas: null, ...over });
// Sarah (the fixture's realtor), another realtor, Maya, and a realtor who turned findable off.
const world = () => {
  const t = tables();
  Object.assign(t.profiles.find((p) => p.id === USER.id), { phone: '416 555 0100', circle_findable: null, does_rentals: null, service_areas: null, invite_code: 'K7M2Q9XW4TPB3HNC', invited_by: null, signup_source: 'direct' });
  t.profiles = t.profiles.filter((p) => p.id === USER.id);
  t.profiles.push(
    person(OTHER, { full_name: 'Omar Haddad', brokerage: 'Lakeview Realty Inc., Brokerage' }),
    person(MAYA, { full_name: 'Maya Kowalski', brokerage: 'Harbourfront Residential Realty Inc., Brokerage', does_rentals: true, service_areas: ['Toronto', 'Mississauga'] }),
    person(HIDDEN, { full_name: 'Maya Hidden', brokerage: 'Harbourfront Residential Realty Inc., Brokerage', circle_findable: false }),
  );
  Object.assign(t, { circle_connections: [], brokerages: [], brokerage_members: [], events: [] });
  t.__kv = fakeKvStore();
  return t;
};
const call = async (t, user, body, route = circle, opts = {}) => {
  const s = installFakeStack({ tables: t, user, kv: t.__kv, ...opts });
  try { const res = fakeRes(); await route(fakeReq({ body, ...(opts.req || {}) }), res); return { code: res.code, body: res.body, s }; } finally { s.restore(); }
};
const rows = (t) => t.circle_connections;
const eventsOf = (t, id) => t.events.filter((e) => e.profile_id === id).map((e) => e.type);

test('search answers a name, a brokerage and initials, and nothing private', async () => {
  const t = world();
  const r = await call(t, USER, { action: 'search', q: 'maya' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.results.map((x) => x.name), ['Maya Kowalski']);
  assert.deepEqual(Object.keys(r.body.results[0]).sort(), ['brokerage', 'connectionId', 'id', 'initials', 'name', 'state']);
  assert.deepEqual(r.body.results[0], { id: MAYA.id, name: 'Maya Kowalski', brokerage: 'Harbourfront Residential Realty Inc., Brokerage', initials: 'MK', state: 'none', connectionId: null });
  // By brokerage too, and never the caller.
  const byBrokerage = await call(t, USER, { action: 'search', q: 'Lakeview' });
  assert.deepEqual(byBrokerage.body.results.map((x) => x.name), ['Omar Haddad']);
  assert.deepEqual((await call(t, USER, { action: 'search', q: 'Sarah' })).body.results, [], 'never the caller');
  // Nothing private, in any answer the screen gets about another realtor.
  await call(t, MAYA, { action: 'request', profileId: USER.id });
  for (const body of [{ action: 'search', q: 'ma' }, { action: 'search', q: 'realty' }, { action: 'load' }, { action: 'count' }]) {
    const out = await call(t, USER, body);
    const text = JSON.stringify(out.body);
    assert.doesNotMatch(text, /maya\.private|other@example|hidden@brokerage|416 555 0142|cus_SECRET/, `${body.action}: no email, phone or billing id`);
    assert.deepEqual(findKeys(out.body, ['email', 'phone', 'plan', 'stripe_customer_id', 'invite_code', 'invited_by', 'owner_token', 'ownerToken', 'listings', 'signup_source']).filter((k) => !/\.brokerage\./.test(k)), [], `${body.action}: no private key`);
  }
  // The search cannot be turned into a pattern, and two letters are the least it runs on.
  assert.equal(Ci.searchWords('%_%'), ''); assert.equal(Ci.searchWords("  ma%ya_(x),'  "), 'ma ya x');
  const short = await call(t, USER, { action: 'search', q: 'm' });
  assert.deepEqual(short.body, { available: true, results: [], tooShort: true });
  // A card is built in one place, from six columns.
  assert.match(code('lib/circle.js'), /const CARD_COLUMNS = 'id, full_name, brokerage, circle_findable, does_rentals, service_areas';/);
  assert.equal((code('lib/circle.js').match(/\.select\('email'\)/g) || []).length, 1, 'an email is read once, to send the request mail');
  assert.doesNotMatch(code('lib/circle.js'), /select\('\*'\)\.[^\n]*profiles|from\('profiles'\)\.select\('\*'\)/);
});

test('a connection needs both sides: asking is not connecting', async () => {
  const t = world();
  const asked = await call(t, USER, { action: 'request', profileId: MAYA.id });
  assert.equal(asked.code, 200); assert.equal(asked.body.state, 'sent');
  assert.equal(rows(t).length, 1); assert.equal(rows(t)[0].status, 'pending');
  let mine = (await call(t, USER, { action: 'load' })).body; let theirs = (await call(t, MAYA, { action: 'load' })).body;
  assert.deepEqual(mine.connections, []); assert.deepEqual(theirs.connections, [], 'nobody is connected yet');
  assert.deepEqual(mine.sent.map((x) => x.name), ['Maya Kowalski']); assert.deepEqual(theirs.requests.map((x) => x.name), ['Sarah Chen']);
  assert.equal((await call(t, MAYA, { action: 'count' })).body.pending, 1); assert.equal((await call(t, USER, { action: 'count' })).body.pending, 0);
  // The one who asked cannot make it a connection, by asking again or by accepting it themselves.
  assert.equal((await call(t, USER, { action: 'request', profileId: MAYA.id })).body.state, 'sent');
  assert.equal((await call(t, USER, { action: 'accept', id: rows(t)[0].id })).code, 404);
  assert.equal(rows(t).length, 1, 'one row for the pair'); assert.equal(rows(t)[0].status, 'pending');
  // The other side accepts: now both have each other.
  const ok = await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  assert.equal(ok.code, 200); assert.equal(rows(t)[0].status, 'accepted'); assert.ok(rows(t)[0].answered_at);
  mine = (await call(t, USER, { action: 'load' })).body; theirs = (await call(t, MAYA, { action: 'load' })).body;
  assert.deepEqual(mine.connections.map((x) => x.name), ['Maya Kowalski']); assert.deepEqual(theirs.connections.map((x) => x.name), ['Sarah Chen']);
  assert.deepEqual(mine.sent, []); assert.deepEqual(theirs.requests, []);
  assert.deepEqual(mine.connections[0].history, { sent: 0, received: 0, closed: 0 }, 'your own history with them, zero until handoffs exist');
  assert.deepEqual(Object.keys(mine.connections[0]).sort(), ['brokerage', 'connectionId', 'doesRentals', 'history', 'initials', 'name', 'record', 'serviceAreas', 'since'], 'no score, no rank, no count of followers');
  assert.deepEqual(mine.connections[0].serviceAreas, ['Toronto', 'Mississauga']);
  // Asking someone who already asked you is saying yes: both agreed.
  await call(t, OTHER, { action: 'request', profileId: USER.id });
  const both = await call(t, USER, { action: 'request', profileId: OTHER.id });
  assert.equal(both.body.state, 'connected');
  assert.equal(rows(t).length, 2, 'still one row per pair');
  // A decline connects nobody, and the one who asked still reads Requested.
  const t2 = world();
  await call(t2, USER, { action: 'request', profileId: MAYA.id });
  assert.equal((await call(t2, MAYA, { action: 'decline', id: rows(t2)[0].id })).code, 200);
  assert.equal(rows(t2)[0].status, 'declined');
  assert.deepEqual((await call(t2, MAYA, { action: 'load' })).body.connections, []);
  assert.deepEqual((await call(t2, USER, { action: 'load' })).body.sent.map((x) => x.name), ['Maya Kowalski'], 'a decline is not told');
  assert.equal((await call(t2, USER, { action: 'search', q: 'maya' })).body.results[0].state, 'sent');
});

test('removing ends it for both, and the other realtor is told nothing', async () => {
  const t = world();
  await call(t, USER, { action: 'request', profileId: MAYA.id });
  await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  const sentBefore = t.__kv; const eventsBefore = t.events.length;
  const s = installFakeStack({ tables: t, user: MAYA, kv: sentBefore });
  let mails;
  try { const res = fakeRes(); await circle(fakeReq({ body: { action: 'remove', id: rows(t)[0].id } }), res); assert.equal(res.code, 200); mails = s.resend.sent.length; } finally { s.restore(); }
  assert.equal(mails, 0, 'no mail');
  assert.equal(rows(t)[0].status, 'removed');
  assert.deepEqual((await call(t, USER, { action: 'load' })).body.connections, [], 'gone for the one who was removed');
  assert.deepEqual((await call(t, MAYA, { action: 'load' })).body.connections, [], 'and for the one who removed');
  assert.deepEqual(t.events.slice(eventsBefore).map((e) => [e.profile_id, e.type]), [[MAYA.id, 'circle_connection_removed']], 'the only line is on the remover\'s own timeline');
  // Either side can: Sarah removes this time, after connecting again.
  assert.equal((await call(t, USER, { action: 'request', profileId: MAYA.id })).body.state, 'sent');
  await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  assert.equal((await call(t, USER, { action: 'remove', id: rows(t)[0].id })).code, 200);
  assert.deepEqual((await call(t, MAYA, { action: 'load' })).body.connections, []);
  assert.equal(rows(t).length, 1, 'the same one row throughout');
  // Someone who is neither of the two cannot remove it.
  await call(t, USER, { action: 'request', profileId: MAYA.id }); await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  assert.equal((await call(t, OTHER, { action: 'remove', id: rows(t)[0].id })).code, 404);
  assert.equal(rows(t)[0].status, 'accepted');
});

test('a realtor who turned findable off is in no search, and cannot be asked', async () => {
  const t = world();
  for (const q of ['Maya', 'Hidden', 'Harbourfront', 'maya hidden']) {
    const r = await call(t, USER, { action: 'search', q });
    assert.equal(r.body.results.some((x) => x.id === HIDDEN.id || x.name === 'Maya Hidden'), false, q);
  }
  const ask = await call(t, USER, { action: 'request', profileId: HIDDEN.id });
  assert.equal(ask.code, 404); assert.equal(rows(t).length, 0);
  assert.deepEqual(ask.body, (await call(t, USER, { action: 'request', profileId: 'realtor-nobody' })).body, 'the same answer as for nobody');
  // Turning it off, and on again, is the realtor's own switch on their own row.
  assert.equal((await call(t, MAYA, { action: 'settings', findable: false })).code, 200);
  assert.equal(t.profiles.find((p) => p.id === MAYA.id).circle_findable, false);
  assert.deepEqual((await call(t, USER, { action: 'search', q: 'Kowalski' })).body.results, []);
  assert.equal((await call(t, MAYA, { action: 'load' })).body.me.findable, false);
  await call(t, MAYA, { action: 'settings', findable: true });
  assert.deepEqual((await call(t, USER, { action: 'search', q: 'Kowalski' })).body.results.map((x) => x.name), ['Maya Kowalski']);
  assert.equal(t.profiles.find((p) => p.id === USER.id).circle_findable, null, 'nobody else\'s row is touched');
  // Hidden can still ask others, and the one asked can answer.
  assert.equal((await call(t, HIDDEN, { action: 'request', profileId: USER.id })).body.state, 'sent');
  assert.deepEqual((await call(t, USER, { action: 'load' })).body.requests.map((x) => x.name), ['Maya Hidden']);
  // A suspended account is in no search either.
  t.profiles.find((p) => p.id === OTHER.id).suspended_at = '2026-11-01T00:00:00Z';
  assert.deepEqual((await call(t, USER, { action: 'search', q: 'Omar' })).body.results, []);
});

test('the request limits hold: a day\'s count, the number waiting, and no second ask after a decline', async () => {
  const t = world();
  for (let i = 0; i < 60; i++) t.profiles.push(person({ id: `bulk-${i}`, email: `bulk${i}@example.com` }, { full_name: `Bulk Realtor ${i}` }));
  for (let i = 0; i < Ci.REQUESTS_A_DAY; i++) assert.equal((await call(t, USER, { action: 'request', profileId: `bulk-${i}` })).code, 200, `request ${i + 1}`);
  const over = await call(t, USER, { action: 'request', profileId: `bulk-${Ci.REQUESTS_A_DAY}` });
  assert.equal(over.code, 429);
  assert.equal(rows(t).length, Ci.REQUESTS_A_DAY, 'nothing was written past the limit');
  assert.equal(Ci.REQUESTS_A_DAY, 20);
  // The limit is the realtor's own: another realtor still asks.
  assert.equal((await call(t, MAYA, { action: 'request', profileId: 'bulk-0' })).code, 200);
  // With the counter gone (a new day, or KV down), the number waiting still caps it.
  const t2 = world();
  for (let i = 0; i < 60; i++) t2.profiles.push(person({ id: `bulk-${i}`, email: `bulk${i}@example.com` }, { full_name: `Bulk Realtor ${i}` }));
  for (let i = 0; i < Ci.MAX_PENDING; i++) t2.circle_connections.push({ id: `c-${i}`, requester_id: USER.id, addressee_id: `bulk-${i}`, status: 'pending', created_at: '2026-11-01T00:00:00Z', answered_at: null, blocked_by: null });
  const capped = await call(t2, USER, { action: 'request', profileId: 'bulk-55' });
  assert.equal(capped.code, 429); assert.equal(rows(t2).length, Ci.MAX_PENDING);
  // A declined request is not sent again: no new row, no mail, no line on their timeline.
  const t3 = world();
  await call(t3, USER, { action: 'request', profileId: MAYA.id });
  await call(t3, MAYA, { action: 'decline', id: rows(t3)[0].id });
  const before = t3.events.length;
  const s = installFakeStack({ tables: t3, user: USER, kv: t3.__kv });
  try {
    const res = fakeRes(); await circle(fakeReq({ body: { action: 'request', profileId: MAYA.id } }), res);
    assert.equal(res.code, 200); assert.equal(res.body.state, 'sent');
    assert.equal(s.resend.sent.length, 0);
  } finally { s.restore(); }
  assert.equal(rows(t3)[0].status, 'declined'); assert.equal(t3.events.length, before);
  // After the wait it can be asked again; the one who declined can ask at any time.
  rows(t3)[0].answered_at = new Date(Date.now() - (Ci.ASK_AGAIN_DAYS + 1) * 86400000).toISOString();
  await call(t3, USER, { action: 'request', profileId: MAYA.id });
  assert.equal(rows(t3)[0].status, 'pending'); assert.equal(rows(t3).length, 1);
  // The search is limited too.
  assert.match(code('lib/circle.js'), /if \(await over\('search', userId, SEARCHES_AN_HOUR, 3600\)\) return \{ status: 429/);
});

test('joining through a realtor\'s invite link connects the new realtor to the inviter, once', async () => {
  const t = world();
  const NEW = { id: 'realtor-new', email: 'new@brokerage.ca' };
  t.profiles.push(person(NEW, { full_name: 'Noor Rahman', signup_source: null, created_at: '2026-11-18T15:00:00Z' }));
  const db = fakeDb(t);
  assert.equal(await S.recordSignupSource(db, NEW.id, 'ref:K7M2Q9XW4TPB3HNC'), true);
  assert.equal(t.profiles.find((p) => p.id === NEW.id).invited_by, USER.id, 'the credit, as before');
  assert.equal(rows(t).length, 1);
  assert.deepEqual({ requester_id: rows(t)[0].requester_id, addressee_id: rows(t)[0].addressee_id, status: rows(t)[0].status }, { requester_id: USER.id, addressee_id: NEW.id, status: 'accepted' });
  assert.ok(rows(t)[0].answered_at, 'already connected');
  assert.deepEqual((await call(t, USER, { action: 'load' })).body.connections.map((x) => x.name), ['Noor Rahman']);
  assert.deepEqual((await call(t, NEW, { action: 'load' })).body.connections.map((x) => x.name), ['Sarah Chen']);
  // A second call (the callback again) adds nothing, and never brings back a removed connection.
  await S.recordSignupSource(db, NEW.id, 'ref:K7M2Q9XW4TPB3HNC');
  assert.equal(rows(t).length, 1);
  await call(t, NEW, { action: 'remove', id: rows(t)[0].id });
  await S.recordSignupSource(db, NEW.id, 'ref:K7M2Q9XW4TPB3HNC');
  assert.equal(rows(t).length, 1); assert.equal(rows(t)[0].status, 'removed');
  // A code that credits nobody connects nobody; a profile already credited to someone else is not connected to this code's owner.
  const t2 = world(); const db2 = fakeDb(t2);
  t2.profiles.push(person(NEW, { full_name: 'Noor Rahman', signup_source: null }));
  await S.recordSignupSource(db2, NEW.id, 'ref:Z7M2Q9XW4TPB3HNZ'); await S.recordSignupSource(db2, NEW.id, 'apply');
  assert.equal(rows(t2).length, 0);
  await S.recordSignupSource(db2, NEW.id, 'ref:K7M2Q9XW4TPB3HNC');
  assert.equal(rows(t2).length, 0, 'the first touch was already written: no credit, no connection');
  // Before db/021 the credit is written as before and nothing throws.
  const t3 = world(); delete t3.circle_connections; t3.profiles.push(person(NEW, { full_name: 'Noor Rahman', signup_source: null }));
  assert.equal(await S.recordSignupSource(fakeDb(t3), NEW.id, 'ref:K7M2Q9XW4TPB3HNC'), true);
  assert.equal(t3.profiles.find((p) => p.id === NEW.id).invited_by, USER.id);
  // The invite link on the Circle screen is the realtor's one code from lib/realtorInvite.js.
  assert.equal((await call(t, USER, { action: 'load' })).body.invite.link, 'https://rentletter.ca/join?invite=K7M2Q9XW4TPB3HNC');
  assert.match(code('lib/circle.js'), /import \{ ensureInviteCode, inviteLink \} from '\.\/realtorInvite\.js';/);
});

test('a realtor cannot accept, decline or unblock a request meant for someone else', async () => {
  const t = world();
  await call(t, USER, { action: 'request', profileId: MAYA.id });
  const id = rows(t)[0].id;
  for (const who of [OTHER, HIDDEN, USER]) {
    for (const action of ['accept', 'decline']) {
      const r = await call(t, who, { action, id });
      assert.equal(r.code, 404, `${who.id} ${action}`);
      assert.equal(rows(t)[0].status, 'pending');
    }
  }
  assert.deepEqual((await call(t, OTHER, { action: 'accept', id })).body, (await call(t, OTHER, { action: 'accept', id: 'no-such-row' })).body, 'the same answer as for a row that is not there');
  assert.equal((await call(t, OTHER, { action: 'block', id })).code, 404);
  assert.equal((await call(t, USER, { action: 'accept', id: '' })).code, 400);
  // No id of the caller is read from the request: a requester named in the body is ignored.
  await call(t, OTHER, { action: 'request', profileId: MAYA.id, requesterId: USER.id, userId: USER.id, requester_id: USER.id });
  assert.equal(rows(t)[1].requester_id, OTHER.id);
  assert.doesNotMatch(code('pages/api/circle/index.js'), /body\.(userId|requesterId|requester_id|addressee_id)/);
  assert.match(code('pages/api/circle/index.js'), /const ctx = \{ admin, userId: user\.id \};/);
  // Maya, who was asked, can.
  assert.equal((await call(t, MAYA, { action: 'accept', id })).code, 200);
  assert.equal(rows(t)[0].status, 'accepted');
});

test('the routes are realtor writes: no session 401, a lapsed trial 402, only POST, and the caller\'s own id', async () => {
  const t = world();
  assert.equal((await call(t, null, { action: 'load' })).code, 401);
  assert.equal((await call(t, null, { action: 'save' }, brokerageRoute)).code, 401);
  const lapsed = world(); Object.assign(lapsed.profiles.find((p) => p.id === USER.id), { plan: 'trial', is_founder: false, trial_ends_at: '2026-01-08T00:00:00Z', created_at: '2026-01-01T00:00:00Z' });
  for (const [route, body] of [[circle, { action: 'request', profileId: MAYA.id }], [circle, { action: 'settings', findable: false }], [brokerageRoute, { action: 'save', legalName: 'X Realty', address: '1 Main St', brokerName: 'A B', brokerEmail: 'a@b.ca' }]]) {
    const r = await call(lapsed, USER, body, route, { env: { BILLING_OFF: 'false' } });
    assert.equal(r.code, 402, JSON.stringify(body));
  }
  delete process.env.BILLING_OFF;
  assert.equal(rows(lapsed).length, 0); assert.equal(lapsed.brokerages.length, 0, 'nothing was written behind the gate');
  assert.equal((await call(t, USER, { action: 'load' }, circle, { req: { method: 'GET' } })).code, 405);
  assert.equal((await call(t, USER, { action: 'nope' })).code, 400);
  for (const p of ['pages/api/circle/index.js', 'pages/api/circle/brokerage.js']) assert.match(code(p), /export default withRealtor\(/, p);
  // No browser reaches the tables: the migration adds no policy and no grant, and no page or component names them.
  assert.doesNotMatch(code('db/021-realtor-circle.sql'), /CREATE POLICY|GRANT /);
  for (const table of ['brokerages', 'brokerage_members', 'circle_connections']) assert.match(src('db/021-realtor-circle.sql'), new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`));
  assert.match(src('db/021-realtor-circle.sql'), /REVOKE ALL ON public\.brokerages, public\.brokerage_members, public\.circle_connections FROM anon, authenticated;/);
  for (const p of ['components/dashboard/CircleView.js', 'components/dashboard/MainNav.js', 'pages/circle.js']) assert.doesNotMatch(code(p), /from\('(circle_connections|brokerages|brokerage_members)'\)|owner_token|ownerToken/, p);
});

test('a block is silent, ends the connection and stops requests; only the one who blocked can lift it', async () => {
  const t = world();
  await call(t, MAYA, { action: 'request', profileId: USER.id });
  const id = rows(t)[0].id; const before = t.events.length;
  assert.equal((await call(t, USER, { action: 'block', id })).code, 200);
  assert.equal(rows(t)[0].status, 'blocked'); assert.equal(rows(t)[0].blocked_by, USER.id);
  assert.equal(t.events.length, before, 'no line on anyone\'s timeline');
  assert.deepEqual((await call(t, USER, { action: 'search', q: 'Maya' })).body.results, [], 'gone from the blocker\'s search');
  assert.deepEqual((await call(t, MAYA, { action: 'search', q: 'Sarah' })).body.results, [], 'and the blocker from theirs');
  const again = await call(t, MAYA, { action: 'request', profileId: USER.id });
  assert.equal(again.code, 200); assert.equal(again.body.state, 'sent', 'reads as sent');
  assert.equal(rows(t)[0].status, 'blocked'); assert.equal(rows(t).length, 1, 'and nothing was written');
  assert.deepEqual((await call(t, USER, { action: 'load' })).body.requests, []);
  assert.deepEqual((await call(t, USER, { action: 'load' })).body.blocked.map((x) => x.name), ['Maya Kowalski']);
  assert.deepEqual((await call(t, MAYA, { action: 'load' })).body.blocked, [], 'the blocked realtor is shown nothing');
  assert.equal((await call(t, MAYA, { action: 'unblock', id })).code, 404);
  assert.equal((await call(t, USER, { action: 'unblock', id })).code, 200);
  assert.equal(rows(t)[0].status, 'removed'); assert.equal(rows(t)[0].blocked_by, null);
});

test('a brokerage: the broker of record\'s single use link, then the office; never confirmed by the click alone', async () => {
  const t = world();
  const form = { action: 'save', legalName: 'Harbourfront Residential Realty Inc., Brokerage', address: '200 Queens Quay West, Toronto', phone: '416 555 0199', brokerName: 'Dana Whitfield', brokerEmail: 'Dana.Whitfield@Harbourfront.ca', hstNumber: '' };
  assert.equal((await call(t, USER, { ...form, brokerEmail: 'not an email' }, brokerageRoute)).code, 400);
  const s = installFakeStack({ tables: t, user: USER, kv: t.__kv });
  let mail; let saved;
  try { const res = fakeRes(); await brokerageRoute(fakeReq({ body: form }), res); assert.equal(res.code, 200); saved = res.body; mail = s.resend.sent; } finally { s.restore(); }
  assert.equal(mail.length, 1); assert.equal(mail[0].to, 'dana.whitfield@harbourfront.ca');
  const token = /\/brokerage\/confirm\/([A-Za-z0-9_-]{43})/.exec(mail[0].text)[1];
  const row = t.brokerages[0];
  assert.equal(row.status, 'unconfirmed'); assert.equal(row.created_by, USER.id); assert.equal(row.broker_of_record_email, 'dana.whitfield@harbourfront.ca');
  assert.equal(row.confirm_token_hash, B.hashToken(token)); assert.doesNotMatch(JSON.stringify(t.brokerages), new RegExp(token), 'the link itself is never stored');
  assert.equal(saved.brokerage.standing, 'sent'); assert.doesNotMatch(JSON.stringify(saved), new RegExp(token));
  assert.deepEqual(t.brokerage_members.map((m) => [m.profile_id, m.status]), [[USER.id, 'active']]);
  assert.deepEqual(eventsOf(t, USER.id), ['brokerage_added']);
  // The page reads and writes nothing; the office cannot confirm before the broker of record has.
  const db = fakeDb(t);
  const shown = await B.readConfirmation(db, token);
  assert.deepEqual(shown, { gone: false, legalName: form.legalName, address: form.address, phone: form.phone, brokerName: 'Dana Whitfield', realtorName: 'Sarah Chen' });
  assert.equal(db.updates.length, 0);
  assert.equal((await B.approveBrokerage(db, row.id)).status, 409);
  assert.equal(row.status, 'unconfirmed');
  // The broker of record confirms: recorded, the link is spent, and the record is still not confirmed.
  const yes = await call(t, null, { token, answer: 'confirm' }, confirmRoute);
  assert.equal(yes.code, 200);
  assert.ok(row.broker_confirmed_at); assert.equal(row.confirm_token_hash, null); assert.equal(row.status, 'unconfirmed', 'the click alone confirms nothing');
  assert.equal((await call(t, null, { token, answer: 'not_ours' }, confirmRoute)).code, 410, 'single use');
  assert.equal((await B.readConfirmation(fakeDb(t), token)).gone, true);
  assert.equal((await call(t, USER, { action: 'load' })).body.brokerage.standing, 'review');
  // The office reviews it: confirmed, and said on the realtor's timeline.
  assert.equal((await B.approveBrokerage(fakeDb(t), row.id)).status, 200);
  assert.equal(row.status, 'confirmed'); assert.ok(row.confirmed_at);
  assert.deepEqual(eventsOf(t, USER.id), ['brokerage_added', 'brokerage_confirmed']);
  // On the card of a connection: the record, and never the broker of record's email.
  await call(t, USER, { action: 'request', profileId: MAYA.id }); await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  const card = (await call(t, MAYA, { action: 'load' })).body.connections[0];
  assert.deepEqual(card.record, { legalName: form.legalName, address: form.address, phone: form.phone, brokerOfRecord: 'Dana Whitfield', confirmed: true });
  assert.doesNotMatch(JSON.stringify(await (async () => (await call(t, MAYA, { action: 'load' })).body)()), /dana\.whitfield@/);
  // Another realtor cannot touch this record: their save makes their own.
  const theirs = await call(t, MAYA, { ...form, legalName: 'Kowalski Realty Inc., Brokerage', brokerEmail: 'maya.private@brokerage.ca' }, brokerageRoute);
  assert.equal(theirs.code, 200); assert.equal(t.brokerages.length, 2); assert.equal(t.brokerages[0].legal_name, form.legalName);
  const flags = (await B.listBrokeragesForReview(fakeDb(t))).brokerages.find((b) => b.legalName.startsWith('Kowalski')).flags;
  assert.deepEqual(flags, ['The broker of record’s email is the realtor’s own.'], 'flagged for the office, never refused');
  // "This is not our agent": disputed, the membership too, and the realtor is told on their timeline.
  const t2 = world();
  const s2 = installFakeStack({ tables: t2, user: USER, kv: t2.__kv });
  let token2;
  try { const res = fakeRes(); await brokerageRoute(fakeReq({ body: form }), res); token2 = /confirm\/([A-Za-z0-9_-]{43})/.exec(s2.resend.sent[0].text)[1]; } finally { s2.restore(); }
  assert.equal((await call(t2, null, { token: token2, answer: 'not_ours' }, confirmRoute)).code, 200);
  assert.equal(t2.brokerages[0].status, 'disputed'); assert.equal(t2.brokerage_members[0].status, 'disputed');
  assert.deepEqual(eventsOf(t2, USER.id), ['brokerage_added', 'brokerage_disputed']);
  assert.equal((await B.approveBrokerage(fakeDb(t2), t2.brokerages[0].id)).status, 409, 'the office cannot confirm a disputed record');
  // An expired link, a wrong link and a wrong answer.
  const t3 = world();
  const s3 = installFakeStack({ tables: t3, user: USER, kv: t3.__kv });
  let token3;
  try { const res = fakeRes(); await brokerageRoute(fakeReq({ body: form }), res); token3 = /confirm\/([A-Za-z0-9_-]{43})/.exec(s3.resend.sent[0].text)[1]; } finally { s3.restore(); }
  assert.equal((await call(t3, null, { token: token3, answer: 'maybe' }, confirmRoute)).code, 400);
  assert.equal((await call(t3, null, { token: 'x'.repeat(43), answer: 'confirm' }, confirmRoute)).code, 410);
  t3.brokerages[0].confirm_expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call(t3, null, { token: token3, answer: 'confirm' }, confirmRoute)).code, 410);
  assert.equal(t3.brokerages[0].broker_confirmed_at ?? null, null);
  assert.equal(B.LINK_DAYS, 14);
  // The office route is behind the admin session.
  assert.match(src('pages/api/admin/brokerages.js'), /if \(!\(await requireAdmin\(req, res\)\)\) return;/);
  assert.match(src('pages/admin/brokerages.js'), /if \(!\(await isAdmin\(req\)\)\) return \{ redirect:/);
});

test('the timeline lines: a request on the asked realtor\'s, a connection on both, and the vocabulary in db/021', async () => {
  const t = world();
  const s = installFakeStack({ tables: t, user: USER, kv: t.__kv });
  let mail;
  try { const res = fakeRes(); await circle(fakeReq({ body: { action: 'request', profileId: MAYA.id } }), res); mail = s.resend.sent; } finally { s.restore(); }
  assert.deepEqual(t.events.map((e) => [e.profile_id, e.type, e.payload]), [[MAYA.id, 'circle_connection_requested', { realtorName: 'Sarah Chen' }]]);
  // The mail goes to the realtor who was asked, names the asker and their brokerage, and shows no address or number of theirs.
  assert.equal(mail.length, 1); assert.equal(mail[0].to, MAYA.email);
  assert.match(mail[0].text, /Sarah Chen, Demo Realty asked to join your circle/);
  assert.doesNotMatch(`${mail[0].text}${mail[0].html}`, /sarah@example\.com|416 555 0100/);
  await call(t, MAYA, { action: 'accept', id: rows(t)[0].id });
  assert.deepEqual(t.events.slice(1).map((e) => [e.profile_id, e.type, e.payload]), [[USER.id, 'circle_connected', { realtorName: 'Maya Kowalski' }], [MAYA.id, 'circle_connected', { realtorName: 'Sarah Chen' }]]);
  assert.equal(E.eventTitle(t.events[0]), 'Sarah Chen asked to join your circle');
  assert.equal(E.eventTitle(t.events[1]), 'Maya Kowalski is in your circle');
  assert.equal(E.eventHref(t.events[0], { home: '/dashboard', circle: '/circle', listing: (id) => `/listing/${id}`, profile: '/profile' }), '/circle');
  assert.equal(E.eventHref(t.events[0], { home: '/dashboard', listing: (id) => `/listing/${id}`, profile: '/profile' }), '/dashboard', 'the sandbox has no Circle');
  // db/021 holds the whole vocabulary, in order, and rewrites the check only while it is the old one.
  const sql = src('db/021-realtor-circle.sql');
  const listed = [...sql.split('CHECK (type IN (')[1].split('));')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(listed, [...E.EVENT_TYPES], 'db/021 holds the whole vocabulary, in order');
  assert.deepEqual(listed.slice(-6), ['circle_connection_requested', 'circle_connected', 'circle_connection_removed', 'brokerage_added', 'brokerage_confirmed', 'brokerage_disputed']);
  assert.match(sql, /IF to_regclass\('public\.events'\) IS NULL THEN RETURN; END IF;/);
  assert.match(sql, /IF cdef IS NOT NULL AND cdef LIKE '%brokerage_disputed%' THEN RETURN; END IF;/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS circle_connections_pair_idx\s+ON public\.circle_connections \(LEAST\(requester_id, addressee_id\), GREATEST\(requester_id, addressee_id\)\);/);
});

test('before db/021 has run the app works: the screen says not available, and nothing throws', async () => {
  const t = world(); delete t.circle_connections; delete t.brokerages; delete t.brokerage_members;
  for (const body of [{ action: 'load' }, { action: 'count' }, { action: 'search', q: 'maya' }, { action: 'request', profileId: MAYA.id }]) {
    const r = await call(t, USER, body);
    assert.equal(r.code, 200, body.action); assert.deepEqual(r.body, { available: false }, body.action);
  }
  assert.deepEqual((await call(t, USER, { action: 'save', legalName: 'X Realty', address: '1 Main St', brokerName: 'A B', brokerEmail: 'a@b.ca' }, brokerageRoute)).body, { available: false });
  assert.equal((await call(t, null, { token: 'x'.repeat(43), answer: 'confirm' }, confirmRoute)).code, 410);
  assert.deepEqual(await B.listBrokeragesForReview(fakeDb(t)), { available: false, brokerages: [] });
  // The columns absent too (the tables there, the profile columns not): still not available.
  const t2 = world();
  const absent = fakeDb(t2, { absentColumns: ['circle_findable', 'does_rentals', 'service_areas'] });
  assert.deepEqual(await Ci.loadCircle({ admin: absent, userId: USER.id }), { status: 200, body: { available: false } });
  // The screen draws that one line, and the navigation shows no badge.
  assert.match(code('components/dashboard/CircleView.js'), /if \(!j\.available\) \{ setState\('unavailable'\); return; \}/);
  assert.match(code('components/dashboard/MainNav.js'), /if \(live && r\.ok && j && j\.available\) setCirclePending\(j\.pending\);/);
});

test('the screens: Circle beside Listings, the card moved with a link left on the profile, and the words', () => {
  const nav = code('components/dashboard/MainNav.js');
  // The phone's tab bar (feat/dashboard-2026): Listings, Pipeline, New listing, Circle, Profile.
  assert.match(nav, /\['listings', home, 'Listings', 'home'\],\s*\['pipeline', viewHref\(home, 'pipeline'\), 'Pipeline', 'list'\],\s*\['new'\],\s*\['circle', adapter\.paths\.circle \|\| CIRCLE_PATH, 'Circle', 'users'\],\s*\['profile', adapter\.paths\.profile, 'Profile', 'user'\],/);
  assert.match(nav, /data-circle-badge=""/);
  assert.match(code('components/dashboard/HomeView.js'), /nav=\{locked \? null : 'listings'\}/);
  const view = code('components/dashboard/CircleView.js');
  assert.match(view, /<InviteRealtor full \/>/, 'the invite card is on the Circle screen');
  assert.match(code('components/dashboard/InviteRealtor.js'), /<a \{\.\.\.linkProps\('\/circle#invite-a-realtor'\)\} data-invite-open-circle=""/, 'and the profile page links to it');
  assert.match(view, />Not on Rentletter yet\? Invite them\.<\/p>/);
  assert.match(view, />Add to circle<\/button>/); assert.match(view, /Copy link/); assert.match(view, />Share by text<\/a>/);
  assert.match(view, /export const smsHref = \(link\) => `sms:\?&body=\$\{encodeURIComponent\(`Join me on Rentletter: \$\{link\}`\)\}`;/);
  assert.match(view, /<input id="cv-invite-link" className="cv-input" type="text" readOnly value=\{link\}/, 'the link is shown as text too');
  const shown = [view, nav].join('\n');
  assert.doesNotMatch(shown, /follower|ranking|leaderboard|score|rating|top realtor/i, 'no score, no ranking, no follower count');
  assert.doesNotMatch(shown, /supercharge|close faster|win more|referr/i);
  assert.doesNotMatch(shown, /reward|earn|bonus|commission|payout|discount/i, 'nothing is promised');
});
