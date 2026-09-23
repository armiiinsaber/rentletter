// One read path (lib/application-state.js applicantStanding and listingStanding), the mapping
// between the state and the old columns in both directions for every combination, and the scan
// that fails when a file outside the module reads status, decision_status, decision_priority or
// withdrawn_at on listings or listing_applicants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../lib/application-state.js';

const { APPLICATION_STATE: A, LISTING_STATE: L, DECISION_STATUS: D, DECISION_PRIORITY: P } = S;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.js$/.test(n)) out.push(p); } return out; };

// Every old column combination, in every place a row can be.
const PLACES = [
  ['on a live listing', (id) => ({ status: 'active', rented_link_id: null })],
  ['on a closed listing', (id) => ({ status: 'closed', rented_link_id: null })],
  ['the winner of a rented listing', (id) => ({ status: 'rented', rented_link_id: id })],
  ['someone else on a rented listing', (id) => ({ status: 'rented', rented_link_id: 'another-row' })],
];
const OLD = [];
for (const decision_status of Object.values(D)) for (const decision_priority of Object.values(P)) for (const withdrawn_at of [null, '2026-09-10T00:00:00Z']) OLD.push({ decision_status, decision_priority, withdrawn_at });
const visible = (st) => ({ withdrawn: st.withdrawn, setAside: st.setAside, active: st.active, finalistPill: st.finalist && !st.setAside });

test('old columns to state: the db/003 mapping, for all 12 combinations in all 4 places, and the result always agrees with where it came from', () => {
  let n = 0;
  for (const [place, listingFor] of PLACES) for (const old of OLD) {
    const row = { id: 'row-1', ...old }; const listing = listingFor(row.id);
    const mark = old.decision_status === D.SHORTLIST || (old.decision_status !== D.REJECT && old.decision_priority === P.TOP);
    const want = old.withdrawn_at ? A.WITHDRAWN_BY_APPLICANT : listing.status === 'rented' ? (listing.rented_link_id === row.id ? A.ACCEPTED : A.NOT_SELECTED) : mark ? A.SHORTLISTED : A.SUBMITTED;
    assert.equal(S.applicationStateOf(row, listing), want, `${place}: ${JSON.stringify(old)}`);
    assert.equal(S.applicantDisagreement({ ...row, state: want }, listing), null, `${place}: what the old columns say never contradicts them`);
    assert.equal(S.resyncTarget({ ...row, state: want }, listing), null);
    n++;
  }
  assert.equal(n, 48);
});

test('state to old columns: for all 15 states, 12 combinations and 4 places, the two disagree exactly when the old columns contradict the state', () => {
  const holding = [A.ACCEPTED, A.AGREEMENT_SIGNED, A.DEPOSIT_RECEIVED, A.LEASE_SIGNED, A.MOVED_IN];
  let n = 0; let disagree = 0;
  for (const state of S.APPLICATION_STATES) for (const [place, listingFor] of PLACES) for (const old of OLD) {
    const row = { id: 'row-1', state, ...old }; const listing = listingFor(row.id);
    const w = !!old.withdrawn_at; const rented = listing.status === 'rented'; const winner = rented && listing.rented_link_id === row.id;
    const mark = old.decision_status === D.SHORTLIST || (old.decision_status !== D.REJECT && old.decision_priority === P.TOP);
    // Written out again here, on purpose, so the module and the SQL have something to be held to.
    let want = null;
    if (w !== (state === A.WITHDRAWN_BY_APPLICANT)) want = w ? S.DISAGREEMENT.WITHDRAWN_AT_SET : S.DISAGREEMENT.WITHDRAWN_AT_EMPTY;
    else if (w) want = null;
    else if (winner && !holding.includes(state)) want = S.DISAGREEMENT.WINNER_NOT_HOLDING;
    else if (!winner && holding.includes(state)) want = S.DISAGREEMENT.HOLDING_NOT_WINNER;
    else if (rented && !winner && [A.SUBMITTED, A.DOCS_PENDING, A.SHORTLISTED, A.RECONSIDERED].includes(state)) want = S.DISAGREEMENT.IN_PLAY_ON_RENTED;
    else if (mark && [A.SUBMITTED, A.DOCS_PENDING].includes(state)) want = S.DISAGREEMENT.MARK_NOT_SHORTLISTED;
    else if (!mark && state === A.SHORTLISTED) want = S.DISAGREEMENT.SHORTLISTED_NO_MARK;
    const why = `${state}, ${place}, ${JSON.stringify(old)}`;
    assert.equal(S.applicantDisagreement(row, listing), want, why);
    // The resync: what the old columns say, never a row in reconsidered, and the result agrees.
    const target = S.resyncTarget(row, listing);
    if (!want || state === A.RECONSIDERED) assert.equal(target, null, why);
    else { assert.equal(target, S.applicationStateOf({ ...row, state: null }, listing), why); assert.equal(S.applicantDisagreement({ ...row, state: target }, listing), null, why); }
    // No visual change: wherever the two agree, reading the state shows what reading the old columns showed.
    // (withdrawn_by_realtor is the one state the old columns have no way to show: nothing writes it
    // yet, and a row that carries it reads withdrawn, which is the point of reading the state.)
    if (!want && state !== A.WITHDRAWN_BY_REALTOR) assert.deepEqual(visible(S.applicantStanding(row, listing)), visible(S.applicantStanding({ ...row, state: null }, listing)), `${why}: the same card either way`);
    // Where they disagree the state is what is read.
    const st = S.applicantStanding(row, listing);
    assert.equal(st.state, state); assert.equal(st.stored, true);
    assert.equal(st.withdrawn, state === A.WITHDRAWN_BY_APPLICANT || state === A.WITHDRAWN_BY_REALTOR, why);
    assert.equal(st.setAside, !st.withdrawn && old.decision_status === D.REJECT, `${why}: set aside has no state and is read from its column, here and nowhere else`);
    assert.equal(st.finalist, [A.SUBMITTED, A.DOCS_PENDING, A.SHORTLISTED].includes(state) ? state === A.SHORTLISTED : (old.decision_priority === P.TOP || old.decision_status === D.SHORTLIST), why);
    n++; if (want) disagree++;
  }
  assert.equal(n, 15 * 12 * 4); assert.ok(disagree > 0 && disagree < n);
});

test('the fallback: no state, a null state, an unknown state and the dashboard\'s own shape all read the old columns', () => {
  for (const state of [undefined, null, '', 'nonsense']) {
    assert.equal(S.applicantStanding({ state, withdrawn_at: '2026-09-01' }).withdrawn, true);
    assert.equal(S.applicantStanding({ state, decision_status: 'reject' }).setAside, true);
    assert.equal(S.applicantStanding({ state, decision_priority: 'top' }).finalist, true);
    assert.equal(S.applicantStanding({ state, decision_priority: 'top' }).stored, false);
    assert.equal(S.listingStanding({ state, status: 'rented' }).rented, true);
  }
  assert.deepEqual(visible(S.applicantStanding({ decisionStatus: 'reject', decisionPriority: 'top', withdrawnAt: null })), { withdrawn: false, setAside: true, active: false, finalistPill: false });
  assert.equal(S.applicantStanding({ state: A.SUBMITTED, withdrawnAt: '2026-09-01' }).withdrawn, false, 'a stored state wins over the old column');
  assert.equal(S.applicantStanding({ state: A.WITHDRAWN_BY_APPLICANT, decision_changed_at: '2026-09-02' }).withdrawnSince, '2026-09-02', 'and the time falls back to when the row last changed');
  assert.equal(S.applicantStanding(null).state, A.SUBMITTED); assert.equal(S.listingStanding(null).open, true, 'an absent row reads as it always did');
});

test('listings, both directions: every state against every status', () => {
  const agree = { active: [L.LIVE, L.DRAFT, L.PAUSED], rented: [L.RENTED], closed: [L.WITHDRAWN] };
  for (const status of S.LEGACY_LISTING_STATUSES) {
    const fromOld = S.listingStanding({ status });
    assert.equal(fromOld.legacyStatus, status); assert.equal(fromOld.open, status === 'active');
    assert.equal(S.listingDisagreement({ status, state: fromOld.state }), null);
    for (const state of S.LISTING_STATES) {
      const st = S.listingStanding({ status, state, closed_at: '2026-09-02', rented_link_id: 'J1' });
      assert.equal(st.state, state, 'the state column is what is read');
      assert.equal(st.open, state === L.LIVE, `${state}: open means live and nothing else`);
      assert.equal(st.legacyStatus, state === L.RENTED ? 'rented' : state === L.WITHDRAWN ? 'closed' : 'active');
      assert.equal(st.rentedLinkId, state === L.RENTED ? 'J1' : null);
      assert.equal(S.listingDisagreement({ status, state }) === null, agree[status].includes(state), `${status} with ${state}`);
    }
  }
});

test('every write keeps both in step: the state a decision or a withdrawal names always agrees with the columns it leaves behind', () => {
  const live = { status: 'active', rented_link_id: null };
  for (const from of [A.SUBMITTED, A.DOCS_PENDING, A.SHORTLISTED, A.RECONSIDERED, A.FELL_THROUGH, A.NOT_SELECTED, A.ACCEPTED, A.EXPIRED]) for (const old of OLD.filter((o) => !o.withdrawn_at)) {
    const to = S.stateAfterDecision(from, old);
    if (to) assert.equal(S.canTransition(from, to), true, `${from} to ${to} is a move the map allows`);
    if ([A.SUBMITTED, A.DOCS_PENDING, A.SHORTLISTED].includes(from)) assert.equal(S.applicantDisagreement({ id: 'r', state: to || from, ...old }, live), null, `${from} with ${JSON.stringify(old)}`);
    if ([A.NOT_SELECTED, A.ACCEPTED, A.EXPIRED].includes(from)) assert.equal(to, null, `${from}: a decision never moves it`);
  }
  assert.equal(S.stateAfterDecision(A.SHORTLISTED, { decision_status: 'reject', decision_priority: 'top' }), A.SUBMITTED, 'set aside a shortlisted applicant: submitted again');
  assert.equal(S.stateAfterDecision(A.SUBMITTED, { decision_status: 'none', decision_priority: 'top' }), A.SHORTLISTED, 'restore with the mark still on: shortlisted again');
  assert.equal(S.stateAfterDecision(A.DOCS_PENDING, { decision_status: 'reject', decision_priority: 'normal' }), null, 'set aside while waiting on documents: still waiting');
  assert.equal(S.stateAfterDecision(A.RECONSIDERED, { decision_priority: 'top' }), A.SHORTLISTED); assert.equal(S.stateAfterDecision(A.FELL_THROUGH, { decision_priority: 'top' }), A.SHORTLISTED);
  assert.equal(S.stateAfterWithdrawal(A.SUBMITTED, {}, true), A.WITHDRAWN_BY_APPLICANT); assert.equal(S.stateAfterWithdrawal(A.WITHDRAWN_BY_APPLICANT, {}, true), null);
  assert.equal(S.stateAfterWithdrawal(A.WITHDRAWN_BY_APPLICANT, { decision_priority: 'top' }, false), A.SHORTLISTED); assert.equal(S.stateAfterWithdrawal(A.WITHDRAWN_BY_APPLICANT, { decision_status: 'reject', decision_priority: 'top' }, false), A.SUBMITTED);
  assert.equal(S.stateAfterWithdrawal(A.SUBMITTED, {}, false), null, 'undoing a withdrawal that the state never had moves nothing');
  // Entering reconsidered: the old columns it writes agree with it, on a live listing.
  const cols = S.reconsideredOldColumns(new Date('2026-09-20T00:00:00Z'));
  assert.deepEqual(cols, { decision_status: 'none', decision_reason_code: null, decision_priority: 'normal', withdrawn_at: null, decision_changed_at: '2026-09-20T00:00:00.000Z' });
  assert.equal(S.applicantDisagreement({ id: 'r', state: A.RECONSIDERED, ...cols }, live), null);
  // The dashboard's optimistic copy moves by the same rules.
  assert.equal(S.withLocalDecision({ state: A.SUBMITTED, decisionStatus: 'none', decisionPriority: 'normal' }, { withdrawnAt: '2026-09-20' }).state, A.WITHDRAWN_BY_APPLICANT);
  assert.equal(S.withLocalDecision({ state: A.SHORTLISTED, decisionStatus: 'none', decisionPriority: 'top' }, { decisionStatus: 'reject' }).state, A.SUBMITTED);
  assert.equal(S.withLocalDecision({ state: A.NOT_SELECTED, decisionPriority: 'normal' }, { withdrawnAt: '2026-09-20' }).state, A.NOT_SELECTED, 'a move the map refuses is not made locally either');
  assert.equal('state' in S.withLocalDecision({ decisionStatus: 'none' }, { decisionStatus: 'reject' }), false, 'a row that carries no state is left to the fallback');
});

test('what the tenant reads comes from the state: told no stays told no while reconsidered', () => {
  assert.equal(S.tenantStatusFor({ state: A.NOT_SELECTED }).key, 'not_selected');
  assert.equal(S.tenantStatusFor({ state: A.RECONSIDERED }).key, 'not_selected', 'never a line that changed on its own');
  assert.equal(S.tenantStatusFor({ state: A.SHORTLISTED }).key, 'submitted'); assert.equal(S.tenantStatusFor({ state: A.ACCEPTED }).key, 'submitted');
  assert.equal(S.tenantStatusFor({ state: A.WITHDRAWN_BY_APPLICANT }).key, 'withdrawn'); assert.equal(S.tenantStatusFor({ state: A.SUBMITTED, decision_status: 'reject' }).key, 'not_selected');
});

test('no file outside lib/application-state.js reads status, decision_status, decision_priority or withdrawn_at on these two tables', () => {
  const COLS = '(?:decision_status|decisionStatus|decision_priority|decisionPriority|withdrawn_at|withdrawnAt)';
  const READS = [
    // a property read of one of the applicant columns that is not the left side of an assignment
    [new RegExp(`[\\w\\])?]\\.${COLS}\\b(?!\\s*=[^=])`), 'reads an applicant column'],
    // a listing row's status compared, tested or handed to one of the old status helpers
    [/[\w\])?]\.status\s*(?:===|!==)\s*(?:LEGACY_LISTING_STATUS|'(?:active|rented|closed)')/, 'compares a listing status'],
    [/isLegacy(?:Rented|Closed|Active)\(\s*[\w?.]+\.status\b/, 'tests a listing row\'s status'],
    [/(?:LISTING_STATUSES|LEGACY_LISTING_STATUSES)\.includes\(\s*[\w?.]+\.status\b/, 'tests a listing row\'s status'],
    [/listingStateFromLegacy\(\s*(?:l|listing|row|own)\??\.status\b/, 'maps a listing row\'s status'],
  ];
  // Not a read of a row. patch: what the dashboard is about to send, named by the keys it sends.
  // b: the sandbox's copy of a request body, whose status is the status being asked for. d: one
  // entry of the sandbox's landlord link, a payload and not a table row.
  const ALLOWED = [/\bpatch\.(?:decisionStatus|decisionPriority|withdrawnAt)\b/, /\bb\.status\b/, /\bd\.(?:status|withdrawnAt)\b/];
  const offenders = [];
  for (const p of [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components'))]) {
    const rel = relative(ROOT, p); if (rel === 'lib/application-state.js') continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\{\/\*)/.test(line)) return;
      let code = line.replace(/\/\/.*$/, '');
      for (const ok of ALLOWED) code = code.replace(new RegExp(ok.source, 'g'), 'not_a_row');
      for (const [re, what] of READS) if (re.test(code)) offenders.push(`${rel}:${i + 1} ${what}: ${code.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
  // The scan has teeth: each of these is caught.
  for (const bad of ["if (j.withdrawn_at) return;", "a.decisionStatus === x", "const p = row.decision_priority || 'normal';", "if (l.status === 'rented') {}", "isLegacyClosed(listing.status)", "x?.withdrawnAt"]) assert.ok(READS.some(([re]) => re.test(bad)), bad);
  for (const fine of ["patch.decision_status = status;", "f.a.withdrawnAt = null;", "select('id, decision_status, withdrawn_at')", "{ withdrawn_at: null }", "res.status(200)", "isLegacyRented(status)"]) assert.ok(!READS.some(([re]) => re.test(fine)), fine);
});
