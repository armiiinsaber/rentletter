// Every route that changes the state of an application or a listing goes through
// lib/applicationTransitions.js, which asserts the move against lib/application-state.js before
// it writes and records it in application_events. Found from the source (tests/helpers/
// stateRoutes.mjs), then driven through their handlers over the fake stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER } from './fixture.mjs';
import { ROOT, walk, stateChangingRoutes, stateChangingFunctions, exportedFunctions } from '../helpers/stateRoutes.mjs';

const decision = (await import('../../pages/api/applicants/decision.js')).default;
const withdraw = (await import('../../pages/api/applicants/withdraw.js')).default;
const reconsider = (await import('../../pages/api/applicants/reconsider.js')).default;
const requestDocuments = (await import('../../pages/api/applicants/request-documents.js')).default;
const status = (await import('../../pages/api/listings/status.js')).default;
const remove = (await import('../../pages/api/listings/delete.js')).default;
const tenantAnalyze = (await import('../../pages/api/upload/analyze-file.js')).default;
const tenantFinalize = (await import('../../pages/api/upload/finalize.js')).default;
const { mintRequest } = await import('../../lib/docRequest.js');
const { linkApplicantToListing } = await import('../../lib/supabaseBridge.js');
const T = await import('../../lib/applicationTransitions.js');
const { APPLICATION_STATE: A, LISTING_STATE: L } = await import('../../lib/application-state.js');

const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const pdf = (name) => ({ name, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 ${name}`).toString('base64') });
const fixture = (states = {}, listingStates = {}) => {
  const t = tables();
  for (const j of t.listing_applicants) if (states[j.id]) j.state = states[j.id];
  for (const l of t.listings) if (listingStates[l.id]) l.state = listingStates[l.id];
  return { ...t, application_events: [] };
};
let stack;
const up = ({ states, listingStates, user = USER, absentColumns = [], drop = [] } = {}) => {
  if (stack) stack.restore();
  const t = fixture(states, listingStates); for (const name of drop) delete t[name];
  stack = installFakeStack({ tables: t, user, absentColumns });
  return stack;
};
const row = (s, id) => s.db.tables.listing_applicants.find((j) => j.id === id);
const audit = (s, id) => s.db.tables.application_events.filter((e) => e.listing_applicant_id === id).map((e) => [e.from_state, e.to_state, e.actor_type]);
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const EXPECTED_ROUTES = [
  'pages/api/applicants/decision.js',
  'pages/api/applicants/reconsider.js',
  'pages/api/applicants/request-documents.js',
  'pages/api/applicants/withdraw.js',
  'pages/api/applications/mirror.js',
  'pages/api/listings/add-applicant.js',
  'pages/api/listings/delete.js',
  'pages/api/listings/status.js',
  'pages/api/referrals/assign.js',
  'pages/api/upload/finalize.js',
];

test('the routes that change a state, found from the source, and the one writer they all reach', () => {
  const routes = stateChangingRoutes();
  console.log(`routes that change a state:\n${routes.map((r) => `  ${r.route}  (through ${r.via.join(', ')})`).join('\n')}`);
  assert.deepEqual(routes.map((r) => r.route), EXPECTED_ROUTES);

  // Every writer in lib/applicationTransitions.js asserts before it writes.
  const fns = Object.fromEntries(exportedFunctions(src('lib/applicationTransitions.js')).map((f) => [f.name, f.body]));
  for (const [name, asserts] of [['transitionApplication', 'assertTransition('], ['transitionApplications', 'assertTransition('], ['recordStart', 'assertTransition('], ['startingState', 'assertTransition('], ['transitionListing', 'assertListingTransition(']]) {
    const body = fns[name]; assert.ok(body, name);
    const at = body.indexOf(asserts); assert.ok(at > 0, `${name} asserts`);
    const firstWrite = body.search(/\.(update|insert|upsert)\(/);
    if (firstWrite > 0) assert.ok(at < firstWrite, `${name} asserts before it writes`);
  }
  assert.match(fns.transitionApplicationIfAllowed, /return transitionApplication\(admin, args\);/, 'the soft move still goes through the asserting writer');

  // Nothing else writes a state, a finalist mark or a withdrawal to listing_applicants, and nothing
  // else writes listings.status or listings.state.
  const WRITERS = ['lib/applicationTransitions.js', 'lib/supabaseBridge.js'];
  const offenders = [];
  for (const p of [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'pages', 'api'))]) {
    const rel = relative(ROOT, p); if (WRITERS.includes(rel) || rel === 'lib/demoAdapter.js') continue;
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/from\('(listing_applicants|listings)'\)\s*\.(update|insert|upsert)\(([^;]*);/g)) {
      const [, table, , rest] = m;
      const bad = table === 'listing_applicants' ? /\b(state|decision_priority|decision_status|withdrawn_at)\b|^\s*patch\b/ : /\b(state|status)\b|statusPatch/;
      if (bad.test(rest)) offenders.push(`${rel}: ${table} ${rest.slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], 'a state is only ever written by lib/applicationTransitions.js');
  // The starting row in lib/supabaseBridge.js takes its state from the asserting helper.
  assert.match(src('lib/supabaseBridge.js'), /const state = startingState\(\);/);

  // Session, entitlement and explicit ownership are still on every realtor route found.
  for (const r of EXPECTED_ROUTES.filter((p) => !/upload\/finalize|applications\/mirror/.test(p))) {
    const text = src(r);
    assert.ok(/withRealtor\(/.test(text) || (/(auth\.getUser\(\)|requireRealtor\()/.test(text) && /requireEntitlement\(/.test(text)), `${r}: session and entitlement`);
  }
  assert.match(src('pages/api/applicants/request-documents.js'), /String\(ctx\.listing\.profile_id\) !== String\(user\.id\)/, 'explicit ownership on the document request');
  assert.ok(stateChangingFunctions().has('decideApplicant') && stateChangingFunctions().has('withdrawApplicant'));
});

test('no status literal is compared or assigned outside lib/application-state.js', () => {
  const offenders = [];
  const files = [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components'))];
  // Three vocabularies. A listing status next to a status; a decision value next to a decision
  // column; and the words only the state machine owns, anywhere at all.
  const LISTING = "'(?:active|rented|closed)'"; const DECISION = "'(?:none|shortlist|reject|top|normal)'";
  const re = new RegExp([
    `(?:\\bstatus\\s*(?:===|!==|=|:|\\|\\|)\\s*${LISTING}|${LISTING}\\s*(?:===|!==)\\s*(?:\\w+\\.)?status\\b|setStatus\\(${LISTING}|statusPatch\\(${LISTING}|\\[${LISTING},\\s*${LISTING})`,
    `(?:(?:decision_?[sS]tatus|decision_?[pP]riority|\\.priority|\\bwas)\\s*(?:===|!==|=|:|\\|\\|)\\s*${DECISION}|${DECISION}\\s*(?:===|!==)\\s*(?:\\w+\\.)?decision\\w*)`,
    "'(?:docs_pending|shortlisted|agreement_signed|deposit_received|lease_signed|moved_in|not_selected|withdrawn_by_applicant|withdrawn_by_realtor|fell_through|reconsidered)'",
  ].join('|'));
  // Not a listing or application status: a billing subscription, a consent or referral row, a
  // page's own view mode, a wizard step, an entitlement. Named file by file, with the reason.
  const NOT_A_STATE = {
    'lib/application-state.js': 'the definitions',
    'lib/stateLabels.js': 'the words each surface shows (a count word, not a state compared or written)',
    'lib/billing.js': 'Stripe subscription status', 'lib/entitlements.js': 'entitlement status', 'lib/adminData.js': 'entitlement status',
    'components/dashboard/StatusBadge.js': 'entitlement status', 'components/dashboard/LogoStudio.js': 'wizard step',
    'pages/apply/[token].js': 'the page\'s own view mode', 'lib/referrals.js': 'referral row', 'lib/pipeline.js': 'consent row', 'lib/pipelineState.js': 'consent row',
  };
  for (const p of files) {
    const rel = relative(ROOT, p); if (NOT_A_STATE[rel]) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\{\/\*)/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '');
      if (/subscription_status|rentalStatus|accountStatus|consent|referral|\.status === 'answered'/i.test(code)) return;
      if (re.test(code)) offenders.push(`${rel}:${i + 1}: ${code.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('decision: the finalist mark moves in play to shortlisted and back, audited; set aside moves nothing', async () => {
  const s = up({ states: { J1: A.SUBMITTED, J2: A.DOCS_PENDING } });
  let r = await call(decision, { linkId: 'J1', priority: 'top' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(row(s, 'J1').state, A.SHORTLISTED); assert.equal(row(s, 'J1').decision_priority, 'top');
  assert.deepEqual(audit(s, 'J1'), [[A.SUBMITTED, A.SHORTLISTED, 'realtor']]);
  assert.equal(s.db.tables.application_events[0].actor, USER.id); assert.equal(s.db.tables.application_events[0].reason, 'finalist_marked');
  r = await call(decision, { linkId: 'J1', priority: 'normal' });
  assert.equal(row(s, 'J1').state, A.SUBMITTED); assert.equal(audit(s, 'J1').length, 2);
  r = await call(decision, { linkId: 'J2', priority: 'top' });
  assert.equal(row(s, 'J2').state, A.SHORTLISTED, 'docs_pending is in play too');
  // Set aside and restore: the working sort, no move, no audit row.
  r = await call(decision, { linkId: 'J4', status: 'reject', reasonCode: 'income_below_min' });
  assert.equal(r.code, 200); assert.equal(row(s, 'J4').decision_status, 'reject'); assert.equal(row(s, 'J4').state, undefined); assert.deepEqual(audit(s, 'J4'), []);
  // Someone else's applicant: refused before anything.
  assert.equal((await call(decision, { linkId: 'J9', priority: 'top' })).code, 403);
  assert.equal(row(s, 'J9').state, undefined);
});

test('decision on an application that is past the realtor\'s sort: the mark is kept, the state does not move', async () => {
  const s = up({ states: { J1: A.NOT_SELECTED, J2: A.ACCEPTED } });
  for (const id of ['J1', 'J2']) {
    const before = row(s, id).state;
    const r = await call(decision, { linkId: id, priority: 'top' });
    assert.equal(r.code, 200); assert.equal(row(s, id).decision_priority, 'top'); assert.equal(row(s, id).state, before); assert.deepEqual(audit(s, id), []);
  }
});

test('withdraw: allowed from in play and from accepted, undone to where the mark says, refused from a terminal state with nothing written', async () => {
  const s = up({ states: { J1: A.SHORTLISTED, J2: A.ACCEPTED, J4: A.NOT_SELECTED, J5: A.MOVED_IN } });
  s.db.tables.listing_applicants.find((j) => j.id === 'J1').decision_priority = 'top';
  let r = await call(withdraw, { linkId: 'J1' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(row(s, 'J1').state, A.WITHDRAWN_BY_APPLICANT); assert.ok(row(s, 'J1').withdrawn_at);
  r = await call(withdraw, { linkId: 'J1', withdrawn: false });
  assert.equal(r.code, 200); assert.equal(row(s, 'J1').state, A.SHORTLISTED, 'back to shortlisted: the finalist mark is still on the row'); assert.equal(row(s, 'J1').withdrawn_at, null);
  assert.deepEqual(audit(s, 'J1'), [[A.SHORTLISTED, A.WITHDRAWN_BY_APPLICANT, 'realtor'], [A.WITHDRAWN_BY_APPLICANT, A.SHORTLISTED, 'realtor']]);
  assert.equal((await call(withdraw, { linkId: 'J2' })).code, 200); assert.equal(row(s, 'J2').state, A.WITHDRAWN_BY_APPLICANT, 'accepted may withdraw');
  for (const id of ['J4', 'J5']) {
    const before = { ...row(s, id) };
    r = await call(withdraw, { linkId: id });
    assert.equal(r.code, 409, id); assert.equal(r.body.code, 'illegal_transition'); assert.equal(r.body.to, A.WITHDRAWN_BY_APPLICANT);
    assert.deepEqual(row(s, id), before, 'nothing written'); assert.deepEqual(audit(s, id), []);
  }
  assert.equal(s.db.tables.events.filter((e) => e.type === 'applicant_withdrew').length, 2, 'no timeline event for a refused move');
});

test('listings/status rented: the winner accepted, every other application in play not_selected, the listing rented, all audited', async () => {
  const s = up({ states: { J1: A.SHORTLISTED, J2: A.SUBMITTED, J3: A.SUBMITTED, J4: A.DOCS_PENDING, J5: A.WITHDRAWN_BY_APPLICANT }, listingStates: { L1: L.LIVE, L2: L.LIVE } });
  const r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1', notify: false });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const l1 = s.db.tables.listings.find((l) => l.id === 'L1');
  assert.deepEqual([l1.status, l1.state, l1.rented_link_id], ['rented', L.RENTED, 'J1']);
  assert.deepEqual(['J1', 'J2', 'J3', 'J4', 'J5'].map((id) => row(s, id).state), [A.ACCEPTED, A.NOT_SELECTED, A.NOT_SELECTED, A.NOT_SELECTED, A.WITHDRAWN_BY_APPLICANT]);
  assert.equal(row(s, 'J6').state, undefined, 'another listing is not touched');
  assert.equal(s.db.tables.application_events.length, 4); assert.ok(s.db.tables.application_events.every((e) => e.reason === 'listing_rented' && e.actor === USER.id));
  assert.deepEqual(audit(s, 'J1'), [[A.SHORTLISTED, A.ACCEPTED, 'realtor']]);
});

test('listings/status reopen: the deal fell through, the listing is live again, and whoever was told no stays told', async () => {
  const s = up({ states: { J1: A.ACCEPTED, J2: A.NOT_SELECTED, J4: A.SHORTLISTED }, listingStates: { L1: L.RENTED } });
  Object.assign(s.db.tables.listings.find((l) => l.id === 'L1'), { status: 'rented', rented_link_id: 'J1' });
  let r = await call(status, { listingId: 'L1', status: 'active' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const l1 = s.db.tables.listings.find((l) => l.id === 'L1');
  assert.deepEqual([l1.status, l1.state, l1.rented_link_id], ['active', L.LIVE, null]);
  assert.equal(row(s, 'J1').state, A.FELL_THROUGH); assert.deepEqual(audit(s, 'J1'), [[A.ACCEPTED, A.FELL_THROUGH, 'realtor']]);
  assert.equal(row(s, 'J4').state, A.SHORTLISTED, 'still shortlisted, and actionable now that nothing holds the listing');
  // Renting it to someone already told no is refused, and nothing is written.
  r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J2' });
  assert.equal(r.code, 409); assert.equal(r.body.code, 'illegal_transition'); assert.deepEqual([r.body.from, r.body.to], [A.NOT_SELECTED, A.ACCEPTED]);
  assert.deepEqual([l1.status, l1.state], ['active', L.LIVE]); assert.equal(row(s, 'J4').state, A.SHORTLISTED);
  // Renting it to the shortlisted one works.
  r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J4', notify: false });
  assert.equal(r.code, 200); assert.equal(row(s, 'J4').state, A.ACCEPTED); assert.equal(row(s, 'J1').state, A.NOT_SELECTED, 'the one that fell through is closed out');
});

const reopened = (extra = {}) => {
  // L1 was rented to J1, the deal fell through, the listing is live again. J2 and J4 were told no.
  const s = up({ states: { J1: A.FELL_THROUGH, J2: A.NOT_SELECTED, J4: A.NOT_SELECTED, J5: A.SHORTLISTED, ...(extra.states || {}) }, listingStates: { L1: extra.listingState || L.LIVE } });
  return s;
};

test('reconsider: not_selected to reconsidered only while the listing is live, by its owner, with a reason', async () => {
  for (const [listingState, status0] of [[L.RENTED, 'rented'], [L.PAUSED, 'active'], [L.WITHDRAWN, 'closed'], [L.DRAFT, 'active']]) {
    const s = reopened({ listingState });
    Object.assign(s.db.tables.listings.find((l) => l.id === 'L1'), { status: status0 });
    const r = await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
    assert.equal(r.code, 409, listingState); assert.equal(r.body.code, 'illegal_transition'); assert.deepEqual([r.body.from, r.body.to], [A.NOT_SELECTED, A.RECONSIDERED]);
    assert.equal(row(s, 'J2').state, A.NOT_SELECTED, 'nothing written'); assert.equal(s.db.tables.application_events.length, 0);
  }
  const s = reopened();
  assert.equal((await call(reconsider, { linkId: 'J2' })).code, 400, 'no reason');
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'They seemed nice' })).code, 400, 'free text is not a reason');
  assert.equal((await call(reconsider, { linkId: 'J9', reason: 'winner_fell_through' })).code, 403, 'someone else\'s applicant');
  for (const id of ['J1', 'J5']) { const r = await call(reconsider, { linkId: id, reason: 'winner_fell_through' }); assert.equal(r.code, 409, `${id}: only not_selected enters`); }
  assert.equal(s.db.tables.application_events.length, 0); assert.equal(row(s, 'J2').state, A.NOT_SELECTED);
  const ok = await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  assert.equal(ok.code, 200, JSON.stringify(ok.body)); assert.equal(ok.body.state, A.RECONSIDERED); assert.equal(row(s, 'J2').state, A.RECONSIDERED);
  assert.equal(row(s, 'J4').state, A.NOT_SELECTED, 'nobody else is revived');
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).code, 409, 'a second time is refused: reconsidered is not not_selected');
  // a lapsed plan cannot do it, and nobody signed out can
  up({ user: null }); assert.equal((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).code, 401);
});

test('entering reconsidered writes exactly one application_events row, carrying the reason, and restores no document', async () => {
  const s = reopened();
  const gone = { id: 'D1', listing_applicant_id: 'J2', profile_id: USER.id, storage_path: `${USER.id}/J2/old.pdf`, kind: 'pay stub', expires_at: '2026-08-01T00:00:00Z', deleted_at: '2026-08-01T04:00:00Z', deleted_by: 'expired', opened_count: 0 };
  s.db.tables.applicant_documents.push({ ...gone });
  const r = await call(reconsider, { linkId: 'J2', reason: 'winner_withdrew' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const rows = s.db.tables.application_events.filter((e) => e.listing_applicant_id === 'J2');
  assert.equal(rows.length, 1); assert.equal(s.db.tables.application_events.length, 1, 'and no row for anyone else');
  assert.deepEqual([rows[0].from_state, rows[0].to_state, rows[0].actor_type, rows[0].actor, rows[0].reason], [A.NOT_SELECTED, A.RECONSIDERED, 'realtor', USER.id, 'winner_withdrew']);
  assert.deepEqual(s.db.tables.applicant_documents.find((d) => d.id === 'D1'), gone, 'the expired document stays deleted');
  assert.deepEqual(s.db.storageCalls, [], 'the bucket is not touched');
  assert.equal(s.db.updates.filter((u) => u.table === 'applicant_documents').length, 0);
  // The re invite (lib/reconsiderInvite.js) is the one email, and it restores nothing either.
  assert.equal(s.resend.sent.length, 1, 'exactly one email: the re invite');
});

test('without its audit row the move does not stand', async () => {
  const s = reopened();
  s.db.failWhen = (q) => (q.table === 'application_events' && q.op === 'insert' ? { code: 'XX000', message: 'insert failed' } : null);
  const r = await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' });
  assert.equal(r.code, 503); assert.equal(row(s, 'J2').state, A.NOT_SELECTED, 'the state went back'); assert.equal(s.db.tables.application_events.length, 0);
});

test('reconsidered to accepted is refused with 409; reconsidered to shortlisted to accepted is allowed', async () => {
  const s = reopened();
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'listing_reopened' })).code, 200);
  let r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J2', notify: false });
  assert.equal(r.code, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'illegal_transition'); assert.deepEqual([r.body.from, r.body.to], [A.RECONSIDERED, A.ACCEPTED]);
  const l1 = s.db.tables.listings.find((l) => l.id === 'L1');
  assert.deepEqual([l1.status, l1.state], ['active', L.LIVE], 'the listing did not move'); assert.equal(row(s, 'J2').state, A.RECONSIDERED); assert.equal(row(s, 'J5').state, A.SHORTLISTED);
  // The finalist mark is the way to shortlisted, then the winner.
  r = await call(decision, { linkId: 'J2', priority: 'top' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(row(s, 'J2').state, A.SHORTLISTED);
  r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J2', notify: false });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(row(s, 'J2').state, A.ACCEPTED); assert.equal(row(s, 'J5').state, A.NOT_SELECTED);
  assert.deepEqual(audit(s, 'J2'), [[A.NOT_SELECTED, A.RECONSIDERED, 'realtor'], [A.RECONSIDERED, A.SHORTLISTED, 'realtor'], [A.SHORTLISTED, A.ACCEPTED, 'realtor']]);
});

test('the other ways out of reconsidered: back to not_selected, or a withdrawal that cannot be undone into it', async () => {
  const s = reopened();
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).code, 200);
  let r = await call(reconsider, { linkId: 'J2', undo: true });
  assert.equal(r.code, 200); assert.equal(row(s, 'J2').state, A.NOT_SELECTED); assert.equal(s.db.tables.application_events.at(-1).reason, 'reconsider_undone');
  assert.equal((await call(reconsider, { linkId: 'J4', undo: true })).code, 409, 'only a reconsidered one goes back');
  assert.equal((await call(reconsider, { linkId: 'J4', reason: 'winner_fell_through' })).code, 200);
  assert.equal((await call(withdraw, { linkId: 'J4' })).code, 200); assert.equal(row(s, 'J4').state, A.WITHDRAWN_BY_APPLICANT);
  r = await call(withdraw, { linkId: 'J4', withdrawn: false });
  assert.equal(r.code, 409, 'undoing it would skip the shortlist'); assert.equal(row(s, 'J4').state, A.WITHDRAWN_BY_APPLICANT); assert.ok(row(s, 'J4').withdrawn_at);
  // Marking the listing rented closes out whoever is still reconsidered.
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).code, 200);
  assert.equal((await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J5', notify: false })).code, 200);
  assert.equal(row(s, 'J2').state, A.NOT_SELECTED);
});

test('listings/status: a listing move the map does not allow answers 409; someone else\'s listing is refused first', async () => {
  const s = up({ listingStates: { L1: L.WITHDRAWN } });
  Object.assign(s.db.tables.listings.find((l) => l.id === 'L1'), { status: 'closed' });
  const r = await call(status, { listingId: 'L1', status: 'rented' });
  assert.equal(r.code, 409); assert.deepEqual([r.body.from, r.body.to], [L.WITHDRAWN, L.RENTED]);
  assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').status, 'closed', 'nothing written');
  assert.equal((await call(status, { listingId: 'L9', status: 'rented' })).code, 403);
});

test('listings/delete: the listing is withdrawn through the writer before the rows go', async () => {
  const s = up({ listingStates: { L2: L.LIVE } });
  const seen = [];
  const from = s.db.from.bind(s.db);
  s.db.from = (t) => { const q = from(t); if (t === 'listings') { const u = q.update.bind(q); q.update = (p) => { seen.push(p); return u(p); }; } return q; };
  const r = await call(remove, { listingId: 'L2' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(seen.map((p) => [p.status, p.state]), [['closed', L.WITHDRAWN]]);
  assert.equal(s.db.tables.listings.some((l) => l.id === 'L2'), false);
});

test('request-documents then the tenant\'s upload: submitted to docs_pending and back, and a finalist is left alone', async () => {
  const s = up({ states: { J4: A.SUBMITTED, J2: A.SHORTLISTED } });
  let r = await call(requestDocuments, { listingId: 'L1', linkId: 'J4', applicationId: 'A4', sendEmail: false });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(row(s, 'J4').state, A.DOCS_PENDING); assert.deepEqual(audit(s, 'J4'), [[A.SUBMITTED, A.DOCS_PENDING, 'realtor']]);
  r = await call(requestDocuments, { listingId: 'L1', linkId: 'J2', applicationId: 'A2', sendEmail: false });
  assert.equal(r.code, 200); assert.equal(row(s, 'J2').state, A.SHORTLISTED); assert.deepEqual(audit(s, 'J2'), []);
  // The tenant uploads through the token the request minted.
  const token = (await call(requestDocuments, { listingId: 'L1', linkId: 'J4', applicationId: 'A4', sendEmail: false })).body.token;
  assert.equal((await call(tenantAnalyze, { token, index: 0, total: 1, file: pdf('letter.pdf') })).code, 200);
  const fin = await call(tenantFinalize, { token });
  assert.equal(fin.code, 200, JSON.stringify(fin.body));
  assert.equal(row(s, 'J4').state, A.SUBMITTED);
  assert.deepEqual(audit(s, 'J4'), [[A.SUBMITTED, A.DOCS_PENDING, 'realtor'], [A.DOCS_PENDING, A.SUBMITTED, 'applicant']]);
  assert.equal(s.db.tables.application_events.at(-1).actor, 'A4', 'the actor is an id, never a name or an email');
  assert.equal((await call(requestDocuments, { listingId: 'L9', linkId: 'J9', sendEmail: false })).code, 404, 'someone else\'s listing');
});

test('a new application on a listing starts in submitted, asserted and audited once (mirror, add-applicant, referral assign)', async () => {
  const s = up();
  const made = await linkApplicantToListing(s.db, 'L2', 'A1', 'lookup');
  assert.equal(made.created, true);
  const j = s.db.tables.listing_applicants.find((x) => x.listing_id === 'L2' && x.application_id === 'A1');
  assert.equal(j.state, A.SUBMITTED); assert.deepEqual(audit(s, j.id), [[null, A.SUBMITTED, 'applicant']]);
  assert.equal((await linkApplicantToListing(s.db, 'L2', 'A1', 'lookup')).created, false);
  assert.equal(audit(s, j.id).length, 1, 'a repeat link writes nothing');
  assert.throws(() => T.startingState(A.ACCEPTED), /cannot move from nothing to accepted/);
  await assert.rejects(() => T.recordStart(s.db, { linkId: j.id, to: A.MOVED_IN }), /cannot move/);
});

test('before the migration has run: no state column, no audit table, and every route works as it did', async () => {
  const s = up({ absentColumns: ['state'], drop: ['application_events'] });
  let r = await call(decision, { linkId: 'J1', priority: 'top' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(row(s, 'J1').decision_priority, 'top'); assert.equal('state' in row(s, 'J1'), false);
  r = await call(withdraw, { linkId: 'J2' });
  assert.equal(r.code, 200); assert.ok(row(s, 'J2').withdrawn_at);
  r = await call(withdraw, { linkId: 'J2', withdrawn: false });
  assert.equal(r.code, 200); assert.equal(row(s, 'J2').withdrawn_at, null);
  r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1', notify: false });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').status, 'rented');
  r = await call(status, { listingId: 'L1', status: 'active' });
  assert.equal(r.code, 200); assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').status, 'active');
  assert.equal((await call(reconsider, { linkId: 'J2', reason: 'winner_fell_through' })).code, 409, 'with no stored state nobody is not_selected on a live listing, so there is nobody to reconsider');
  r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J4', notify: false });
  assert.equal(r.code, 200, 'with no stored state a reopened listing can be rented to anyone still on it, as today');
  assert.equal((await linkApplicantToListing(s.db, 'L2', 'A2', 'invite')).created, true);
  assert.equal((await call(remove, { listingId: 'L2' })).code, 200);
  assert.equal(OTHER.id !== USER.id, true);
});

test('the writer itself: nothing is written when one move in a batch is refused', async () => {
  const s = up({ states: { J1: A.SUBMITTED, J2: A.MOVED_IN } });
  await assert.rejects(() => T.transitionApplications(s.db, [{ id: 'J1', from: A.SUBMITTED, to: A.NOT_SELECTED }, { id: 'J2', from: A.MOVED_IN, to: A.NOT_SELECTED }]), /cannot move from moved_in/);
  assert.equal(row(s, 'J1').state, A.SUBMITTED); assert.equal(s.db.tables.application_events.length, 0);
  await assert.rejects(() => T.transitionApplication(s.db, { junction: row(s, 'J1'), to: A.MOVED_IN }), /cannot move from submitted to moved_in/);
  assert.equal(row(s, 'J1').state, A.SUBMITTED);
  if (stack) stack.restore();
});
