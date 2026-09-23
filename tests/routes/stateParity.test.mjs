// Every write keeps the state and the old columns in agreement, and every read comes from the
// state: mark rented, not selected, set aside and restore, withdraw, reconsider and reopen, each
// through its handler over the fake stack, then lib/application-state.js applicantDisagreement
// and listingDisagreement over every row the request could have touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER } from './fixture.mjs';

const decision = (await import('../../pages/api/applicants/decision.js')).default;
const withdraw = (await import('../../pages/api/applicants/withdraw.js')).default;
const reconsider = (await import('../../pages/api/applicants/reconsider.js')).default;
const status = (await import('../../pages/api/listings/status.js')).default;
const { fetchListingApplicants } = await import('../../lib/supabaseBridge.js');
const { notificationsFor } = await import('../../lib/notificationsFeed.js');
const V = await import('../../lib/listingApplicantsVocabulary.js');
const { listingOpen } = await import('../../lib/listingState.js');
const S = await import('../../lib/application-state.js');
const { APPLICATION_STATE: A, LISTING_STATE: L } = S;

const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
let stack;
// Production after db/003: every row carries the state its old columns give it.
const up = (mutate = () => {}) => {
  if (stack) stack.restore();
  const t = { ...tables(), application_events: [] };
  for (const j of t.listing_applicants) { j.decision_priority = j.decision_priority || 'normal'; }
  mutate(t);
  for (const l of t.listings) l.state = S.listingStateOf(l);
  for (const j of t.listing_applicants) j.state = S.applicationStateOf({ ...j, state: null }, t.listings.find((l) => l.id === j.listing_id));
  stack = installFakeStack({ tables: t, user: USER });
  return stack;
};
const row = (s, id) => s.db.tables.listing_applicants.find((j) => j.id === id);
const listing = (s, id) => s.db.tables.listings.find((l) => l.id === id);
function agree(s, when) {
  for (const j of s.db.tables.listing_applicants) assert.equal(S.applicantDisagreement(j, listing(s, j.listing_id)), null, `${when}: ${j.id} (${j.state}, ${j.decision_status}, ${j.decision_priority}, withdrawn ${!!j.withdrawn_at})`);
  for (const l of s.db.tables.listings) assert.equal(S.listingDisagreement(l), null, `${when}: listing ${l.id} (${l.state}, ${l.status})`);
}

test('the fixture starts in agreement, as production does after db/003', () => { agree(up(), 'start'); });

test('mark rented: the winner, everyone not selected, and the listing agree; the reads come from the state', async () => {
  const s = up();
  const r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J2', notify: false });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.state, L.RENTED, 'the answer carries the state for the dashboard\'s own copy');
  agree(s, 'after mark rented');
  assert.deepEqual(['J1', 'J2', 'J3', 'J4', 'J5'].map((id) => row(s, id).state), [A.NOT_SELECTED, A.ACCEPTED, A.NOT_SELECTED, A.NOT_SELECTED, A.NOT_SELECTED]);
  assert.equal(listingOpen(listing(s, 'L1')), false);
  // Reopen: the deal fell through, the rest stay told no, and the two still agree (the old
  // columns cannot say not_selected on a live listing, and they do not contradict it).
  assert.equal((await call(status, { listingId: 'L1', status: 'active' })).code, 200);
  agree(s, 'after reopen'); assert.equal(row(s, 'J2').state, A.FELL_THROUGH); assert.equal(row(s, 'J1').state, A.NOT_SELECTED); assert.equal(listingOpen(listing(s, 'L1')), true);
  // Rented again to someone new while the first deal still stood elsewhere: see the next test.
});

test('renting over a standing deal: the one who held it fell through, and nobody holds a listing that is not theirs', async () => {
  const s = up((t) => { Object.assign(t.listings.find((l) => l.id === 'L1'), { status: 'rented', rented_link_id: 'J1', closed_at: '2026-09-01T00:00:00Z' }); });
  assert.equal(row(s, 'J1').state, A.ACCEPTED); agree(s, 'start, rented to J1');
  // J2 was told no, so J2 cannot be the winner: 409, nothing written.
  let r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J2', notify: false });
  assert.equal(r.code, 409); agree(s, 'after the refused move'); assert.equal(listing(s, 'L1').rented_link_id, 'J1');
  // Closing a rented listing: the deal fell through for the one who held it.
  r = await call(status, { listingId: 'L1', status: 'closed' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(row(s, 'J1').state, A.FELL_THROUGH); agree(s, 'after closing a rented listing');
});

test('not selected and set aside: a shortlisted applicant who is set aside is submitted again, and restored is shortlisted again', async () => {
  const s = up();
  assert.equal((await call(decision, { linkId: 'J1', priority: 'top' })).code, 200); assert.equal(row(s, 'J1').state, A.SHORTLISTED); agree(s, 'after the mark');
  let r = await call(decision, { linkId: 'J1', status: 'reject', reasonCode: 'income_below_min' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.state, A.SUBMITTED);
  assert.deepEqual([row(s, 'J1').state, row(s, 'J1').decision_status, row(s, 'J1').decision_priority], [A.SUBMITTED, 'reject', 'top']); agree(s, 'after set aside');
  r = await call(decision, { linkId: 'J1', status: 'none', reasonCode: null });
  assert.equal(r.code, 200); assert.equal(row(s, 'J1').state, A.SHORTLISTED, 'the mark was still on the row'); agree(s, 'after restore');
  assert.equal((await call(decision, { linkId: 'J1', priority: 'normal' })).code, 200); assert.equal(row(s, 'J1').state, A.SUBMITTED); agree(s, 'after the mark came off');
  const moves = s.db.tables.application_events.filter((e) => e.listing_applicant_id === 'J1').map((e) => [e.from_state, e.to_state]);
  assert.deepEqual(moves, [[A.SUBMITTED, A.SHORTLISTED], [A.SHORTLISTED, A.SUBMITTED], [A.SUBMITTED, A.SHORTLISTED], [A.SHORTLISTED, A.SUBMITTED]], 'one audit row per move, in the same request');
  // J3 starts set aside in the fixture: restoring moves no state, and the two agree before and after.
  assert.equal((await call(decision, { linkId: 'J3', status: 'none', reasonCode: null })).code, 200); assert.equal(row(s, 'J3').state, A.SUBMITTED); agree(s, 'after restoring J3');
});

test('withdraw and undo: both columns move together, from in play and from shortlisted', async () => {
  const s = up((t) => { t.listing_applicants.find((j) => j.id === 'J2').decision_priority = 'top'; });
  for (const [id, back] of [['J1', A.SUBMITTED], ['J2', A.SHORTLISTED]]) {
    let r = await call(withdraw, { linkId: id });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.state, A.WITHDRAWN_BY_APPLICANT); assert.ok(row(s, id).withdrawn_at); agree(s, `after withdrawing ${id}`);
    r = await call(withdraw, { linkId: id, withdrawn: false });
    assert.equal(r.code, 200); assert.equal(row(s, id).state, back); assert.equal(row(s, id).withdrawn_at, null); agree(s, `after undoing ${id}`);
  }
});

test('reconsider: the old columns are written with the state, in the same update, and the two agree all the way to the winner', async () => {
  const s = up((t) => { Object.assign(t.listing_applicants.find((j) => j.id === 'J3'), { decision_priority: 'top' }); }); // J3: set aside, with the mark left on
  assert.equal((await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1', notify: false })).code, 200);
  assert.equal((await call(status, { listingId: 'L1', status: 'active' })).code, 200);
  assert.equal(row(s, 'J3').state, A.NOT_SELECTED); agree(s, 'reopened');
  const updates0 = s.db.updates.length;
  const r = await call(reconsider, { linkId: 'J3', reason: 'winner_fell_through' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const j3 = row(s, 'J3');
  assert.deepEqual([j3.state, j3.decision_status, j3.decision_reason_code, j3.decision_priority, j3.withdrawn_at], [A.RECONSIDERED, 'none', null, 'normal', null], 'no longer set aside, no mark, not withdrawn');
  const mine = s.db.updates.slice(updates0).filter((u) => u.table === 'listing_applicants');
  assert.equal(mine.length, 1, 'one update carries the state and the old columns together'); assert.ok('state' in mine[0].payload && 'decision_status' in mine[0].payload && 'decision_priority' in mine[0].payload);
  agree(s, 'after reconsider');
  assert.equal((await call(decision, { linkId: 'J3', priority: 'top' })).code, 200); assert.equal(row(s, 'J3').state, A.SHORTLISTED); agree(s, 'after the mark');
  assert.equal((await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J3', notify: false })).code, 200); assert.equal(row(s, 'J3').state, A.ACCEPTED); agree(s, 'rented to the reconsidered applicant');
  // The one whose deal fell through comes back the same way.
  assert.equal((await call(status, { listingId: 'L1', status: 'active' })).code, 200); assert.equal(row(s, 'J3').state, A.FELL_THROUGH);
  assert.equal((await call(decision, { linkId: 'J3', priority: 'normal' })).code, 200); assert.equal((await call(decision, { linkId: 'J3', priority: 'top' })).code, 200);
  assert.equal(row(s, 'J3').state, A.SHORTLISTED); agree(s, 'fell through, then marked again');
});

test('the reads come from the state: where a row has drifted, the dashboard, the feed and the helpers show the state', async () => {
  const s = up((t) => { /* nothing */ });
  // Drift by hand, the way db/state-parity-check.sql would find it: the state says withdrawn, the old column is empty.
  Object.assign(row(s, 'J1'), { state: A.WITHDRAWN_BY_APPLICANT, withdrawn_at: null, decision_changed_at: '2026-09-07T10:00:00Z' });
  Object.assign(listing(s, 'L2'), { state: L.PAUSED });
  const applicants = await fetchListingApplicants(s.db, 'L1');
  const j1 = applicants.find((a) => a.linkId === 'J1');
  assert.equal(j1.state, A.WITHDRAWN_BY_APPLICANT, 'the bridge carries the state to the dashboard');
  assert.equal(V.isWithdrawn(j1), true); assert.equal(V.isActive(j1), false);
  assert.equal(listingOpen(listing(s, 'L2')), false, 'paused is not open, whatever status says');
  const feed = await notificationsFor({ supabase: s.db, admin: s.db, userId: USER.id, listings: s.db.tables.listings.filter((l) => l.profile_id === USER.id) });
  assert.ok(feed.items.some((i) => i.type === 'withdrawn' && i.id === 'wd:J1'), 'the feed reads the withdrawal from the state');
  // And with no state column at all, everything reads as it did.
  stack.restore(); const t = tables(); t.listing_applicants.find((j) => j.id === 'J1').withdrawn_at = '2026-09-07T10:00:00Z';
  stack = installFakeStack({ tables: t, user: USER, absentColumns: ['state'] });
  const old = (await fetchListingApplicants(stack.db, 'L1')).find((a) => a.linkId === 'J1');
  assert.equal(old.state, null); assert.equal(V.isWithdrawn(old), true);
  stack.restore(); stack = null;
});
