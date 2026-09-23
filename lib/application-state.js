// lib/application-state.js  PURE (no imports, safe on the server and in the browser).
// THE single source of truth for the state of an application on a listing and the state of a
// listing. Every status string in the codebase is defined here, every comparison goes through a
// constant or a function from here, and every write of a state goes through assertTransition or
// assertListingTransition (lib/applicationTransitions.js is the only writer).
//
// An application here means one applicant on one listing: a public.listing_applicants row.
// The enums below match db/001-application-state-enums.sql (tests/applicationState.test.mjs
// compares the two), with db/004-application-state-reconsider.sql on top of it.
//
// Ontario, after a yes: agreement to lease signed, the rent deposit delivered (last month's rent
// is the only deposit allowed), the Ontario Standard Lease signed, then keys and move in. The
// closing states follow that order and cannot be skipped.

export const APPLICATION_STATE = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  DOCS_PENDING: 'docs_pending',
  SHORTLISTED: 'shortlisted',
  ACCEPTED: 'accepted',
  AGREEMENT_SIGNED: 'agreement_signed',
  DEPOSIT_RECEIVED: 'deposit_received',
  LEASE_SIGNED: 'lease_signed',
  MOVED_IN: 'moved_in',
  NOT_SELECTED: 'not_selected',
  WITHDRAWN_BY_APPLICANT: 'withdrawn_by_applicant',
  WITHDRAWN_BY_REALTOR: 'withdrawn_by_realtor',
  FELL_THROUGH: 'fell_through',
  EXPIRED: 'expired',
  // Told no, then looked at again by the realtor after the deal with someone else fell through
  // (db/004-application-state-reconsider.sql). Entered from not_selected only, by a realtor
  // only, while the listing is live only, with a reason, and audited. Never the winner from
  // here: the way forward is shortlisted.
  RECONSIDERED: 'reconsidered',
});
export const APPLICATION_STATES = Object.freeze(Object.values(APPLICATION_STATE));

export const LISTING_STATE = Object.freeze({
  DRAFT: 'draft',
  LIVE: 'live',
  PAUSED: 'paused',
  RENTED: 'rented',
  WITHDRAWN: 'withdrawn',
});
export const LISTING_STATES = Object.freeze(Object.values(LISTING_STATE));

const A = APPLICATION_STATE;
const L = LISTING_STATE;

// from → the states it may move to. A state with an empty list is terminal.
export const ALLOWED_TRANSITIONS = Object.freeze({
  [A.DRAFT]: Object.freeze([A.SUBMITTED, A.WITHDRAWN_BY_APPLICANT, A.EXPIRED]),
  [A.SUBMITTED]: Object.freeze([A.DOCS_PENDING, A.SHORTLISTED, A.ACCEPTED, A.NOT_SELECTED, A.WITHDRAWN_BY_APPLICANT, A.WITHDRAWN_BY_REALTOR, A.EXPIRED]),
  [A.DOCS_PENDING]: Object.freeze([A.SUBMITTED, A.SHORTLISTED, A.ACCEPTED, A.NOT_SELECTED, A.WITHDRAWN_BY_APPLICANT, A.WITHDRAWN_BY_REALTOR, A.EXPIRED]),
  [A.SHORTLISTED]: Object.freeze([A.SUBMITTED, A.ACCEPTED, A.NOT_SELECTED, A.WITHDRAWN_BY_APPLICANT, A.WITHDRAWN_BY_REALTOR, A.EXPIRED]),
  [A.ACCEPTED]: Object.freeze([A.AGREEMENT_SIGNED, A.FELL_THROUGH, A.WITHDRAWN_BY_APPLICANT]),
  [A.AGREEMENT_SIGNED]: Object.freeze([A.DEPOSIT_RECEIVED, A.FELL_THROUGH]),
  [A.DEPOSIT_RECEIVED]: Object.freeze([A.LEASE_SIGNED, A.FELL_THROUGH]),
  [A.LEASE_SIGNED]: Object.freeze([A.MOVED_IN, A.FELL_THROUGH]),
  [A.FELL_THROUGH]: Object.freeze([A.SHORTLISTED, A.NOT_SELECTED, A.WITHDRAWN_BY_APPLICANT, A.EXPIRED]),
  // The realtor can undo a withdrawal they recorded (pages/api/applicants/withdraw.js).
  [A.WITHDRAWN_BY_APPLICANT]: Object.freeze([A.SUBMITTED, A.SHORTLISTED, A.EXPIRED]),
  [A.MOVED_IN]: Object.freeze([]),
  // Not an ending any more, but the only way out is the guarded move below: nobody is revived
  // by a cascade, a reopen or a finalist mark.
  [A.NOT_SELECTED]: Object.freeze([A.RECONSIDERED]),
  [A.RECONSIDERED]: Object.freeze([A.SHORTLISTED, A.WITHDRAWN_BY_APPLICANT, A.NOT_SELECTED]),
  [A.WITHDRAWN_BY_REALTOR]: Object.freeze([]),
  [A.EXPIRED]: Object.freeze([]),
});

export const ALLOWED_LISTING_TRANSITIONS = Object.freeze({
  [L.DRAFT]: Object.freeze([L.LIVE, L.WITHDRAWN]),
  [L.LIVE]: Object.freeze([L.PAUSED, L.RENTED, L.WITHDRAWN]),
  [L.PAUSED]: Object.freeze([L.LIVE, L.RENTED, L.WITHDRAWN]),
  [L.RENTED]: Object.freeze([L.LIVE, L.WITHDRAWN]),
  [L.WITHDRAWN]: Object.freeze([L.LIVE]),
});

// A row that does not exist yet has no state: it may only be created in one of these.
export const INITIAL_APPLICATION_STATES = Object.freeze([A.DRAFT, A.SUBMITTED]);
export const INITIAL_LISTING_STATES = Object.freeze([L.DRAFT, L.LIVE]);

// Who moved it (public.application_events.actor_type).
export const ACTOR_TYPE = Object.freeze({ REALTOR: 'realtor', APPLICANT: 'applicant', SYSTEM: 'system' });
export const ACTOR_TYPES = Object.freeze(Object.values(ACTOR_TYPE));

// Why a realtor looked again. A code about the deal, never about the person, never free text.
export const RECONSIDER_REASON = Object.freeze({
  WINNER_FELL_THROUGH: 'winner_fell_through',
  WINNER_WITHDREW: 'winner_withdrew',
  LISTING_REOPENED: 'listing_reopened',
});
export const RECONSIDER_REASONS = Object.freeze(Object.values(RECONSIDER_REASON));
export const RECONSIDER_UNDONE = 'reconsider_undone';

// A move in the map that also needs the right moment. The context is { actorType, listingState,
// reason }; a guarded move with no context, or the wrong one, is refused like any other.
export const TRANSITION_GUARDS = Object.freeze({
  [`${A.NOT_SELECTED}>${A.RECONSIDERED}`]: Object.freeze({ actorTypes: Object.freeze([ACTOR_TYPE.REALTOR]), listingStates: Object.freeze([L.LIVE]), reasons: RECONSIDER_REASONS, audited: true }),
});
export const guardFor = (from, to) => TRANSITION_GUARDS[`${from}>${to}`] || null;
const guardPasses = (guard, context) => {
  if (!guard) return true;
  const c = context || {};
  return guard.actorTypes.includes(c.actorType) && guard.listingStates.includes(c.listingState) && guard.reasons.includes(c.reason);
};

export const isApplicationState = (s) => APPLICATION_STATES.includes(s);
export const isListingState = (s) => LISTING_STATES.includes(s);

export function canTransition(from, to, context = null) {
  if (!isApplicationState(to)) return false;
  if (from == null) return INITIAL_APPLICATION_STATES.includes(to);
  return (ALLOWED_TRANSITIONS[from] || []).includes(to) && guardPasses(guardFor(from, to), context);
}
export function canTransitionListing(from, to) {
  if (!isListingState(to)) return false;
  if (from == null) return INITIAL_LISTING_STATES.includes(to);
  return (ALLOWED_LISTING_TRANSITIONS[from] || []).includes(to);
}

// The error both asserts throw. Routes answer it with 409 (lib/applicationTransitions.js refusal).
export class TransitionError extends Error {
  constructor(kind, from, to) {
    super(`${kind} cannot move from ${from == null ? 'nothing' : from} to ${to}`);
    this.name = 'TransitionError';
    this.code = 'illegal_transition';
    this.kind = kind; this.from = from == null ? null : from; this.to = to;
  }
}
export const isTransitionError = (e) => !!e && e.code === 'illegal_transition';

export function assertTransition(from, to, context = null) {
  if (!canTransition(from, to, context)) throw new TransitionError('application', from, to);
  return to;
}
export function assertListingTransition(from, to) {
  if (!canTransitionListing(from, to)) throw new TransitionError('listing', from, to);
  return to;
}

export const isTerminal = (state) => isApplicationState(state) && ALLOWED_TRANSITIONS[state].length === 0;

// Labels, in the product's voice: the fewest words that say where it stands.
export const APPLICATION_STATE_LABELS = Object.freeze({
  [A.DRAFT]: 'Draft',
  [A.SUBMITTED]: 'Submitted',
  [A.DOCS_PENDING]: 'Documents pending',
  [A.SHORTLISTED]: 'Shortlisted',
  [A.ACCEPTED]: 'Accepted',
  [A.AGREEMENT_SIGNED]: 'Agreement signed',
  [A.DEPOSIT_RECEIVED]: 'Deposit received',
  [A.LEASE_SIGNED]: 'Lease signed',
  [A.MOVED_IN]: 'Moved in',
  [A.NOT_SELECTED]: 'Not selected',
  [A.WITHDRAWN_BY_APPLICANT]: 'Withdrew',
  [A.WITHDRAWN_BY_REALTOR]: 'Withdrawn',
  [A.FELL_THROUGH]: 'Fell through',
  [A.EXPIRED]: 'Expired',
  [A.RECONSIDERED]: 'Reconsidered',
});
export const LISTING_STATE_LABELS = Object.freeze({
  [L.DRAFT]: 'Draft',
  [L.LIVE]: 'Live',
  [L.PAUSED]: 'Paused',
  [L.RENTED]: 'Rented',
  [L.WITHDRAWN]: 'Withdrawn',
});
export const applicationStateLabel = (state) => APPLICATION_STATE_LABELS[state] || '';
export const listingStateLabel = (state) => LISTING_STATE_LABELS[state] || '';

// ── who is in play ───────────────────────────────────────────────────────────────
// An application in one of these holds the listing: nobody else on it can be accepted.
export const HOLDING_STATES = Object.freeze([A.ACCEPTED, A.AGREEMENT_SIGNED, A.DEPOSIT_RECEIVED, A.LEASE_SIGNED, A.MOVED_IN]);
export const holdsListing = (state) => HOLDING_STATES.includes(state);
// Still being considered by the realtor.
export const IN_PLAY_STATES = Object.freeze([A.SUBMITTED, A.DOCS_PENDING, A.SHORTLISTED]);
export const isInPlay = (state) => IN_PLAY_STATES.includes(state);
// An application the realtor can act on now: in play, and nobody else holds the listing.
export function isActionable(state, siblingStates = []) {
  return isInPlay(state) && !(siblingStates || []).some(holdsListing);
}

// ── the cascades (pure: they name the moves, lib/applicationTransitions.js writes them) ─────
// applications: [{ id, state }]. Every move a cascade returns is one assertTransition allows.

// Marking a listing rented: the winner (when there is one) is accepted, and every other
// application still in play, or left over from a deal that fell through, is not selected.
// A withdrawal stays a withdrawal, and a terminal state stays where it is.
export function rentedCascade(applications, winnerId = null) {
  const moves = [];
  for (const a of applications || []) {
    if (!a || !isApplicationState(a.state)) continue;
    const isWinner = winnerId != null && String(a.id) === String(winnerId);
    if (isWinner) {
      if (holdsListing(a.state)) continue;
      assertTransition(a.state, A.ACCEPTED);
      moves.push({ id: a.id, from: a.state, to: A.ACCEPTED });
    } else if (holdsListing(a.state)) {
      // Someone else held the listing and it is now rented to the winner: their deal fell
      // through. A tenant who has moved in cannot be displaced, and that refusal stops the request.
      assertTransition(a.state, A.FELL_THROUGH);
      moves.push({ id: a.id, from: a.state, to: A.FELL_THROUGH });
    } else if (canTransition(a.state, A.NOT_SELECTED)) {
      moves.push({ id: a.id, from: a.state, to: A.NOT_SELECTED });
    }
  }
  return moves;
}

// A deal fell through: that application moves to fell_through, the listing returns to live, and
// the applications still shortlisted are actionable again because nothing holds the listing.
export function fellThroughCascade({ listingState, applications, applicationId }) {
  const target = (applications || []).find((a) => a && String(a.id) === String(applicationId));
  if (!target) throw new TransitionError('application', null, A.FELL_THROUGH);
  assertTransition(target.state, A.FELL_THROUGH);
  const listing = listingState === L.LIVE ? null : { from: listingState, to: assertListingTransition(listingState, L.LIVE) };
  const after = (applications || []).map((a) => (String(a.id) === String(applicationId) ? { ...a, state: A.FELL_THROUGH } : a));
  const siblings = (one) => after.filter((a) => a !== one).map((a) => a.state);
  return {
    application: { id: target.id, from: target.state, to: A.FELL_THROUGH },
    listing,
    listingState: L.LIVE,
    actionable: after.filter((a) => a.state === A.SHORTLISTED && isActionable(a.state, siblings(a))).map((a) => a.id),
  };
}

// Reopening a rented listing is a deal that fell through for whoever held it.
export function reopenCascade(applications) {
  return (applications || []).filter((a) => a && holdsListing(a.state) && canTransition(a.state, A.FELL_THROUGH)).map((a) => ({ id: a.id, from: a.state, to: A.FELL_THROUGH }));
}

// ── the columns that came before the state column ────────────────────────────────
// public.listings.status (db/listing-status.sql) and the decision columns on
// public.listing_applicants (db/schema-reference.sql) stay in place and no column is retired.
// Every write keeps them in step with the state, every read goes through applicantStanding and
// listingStanding below (the state first, these columns only as the fallback), and these are
// their only definitions.
export const LEGACY_LISTING_STATUS = Object.freeze({ ACTIVE: 'active', RENTED: 'rented', CLOSED: 'closed' });
export const LEGACY_LISTING_STATUSES = Object.freeze(Object.values(LEGACY_LISTING_STATUS));
export const isLegacyListingStatus = (s) => LEGACY_LISTING_STATUSES.includes(s);
const LEGACY_TO_LISTING_STATE = Object.freeze({
  [LEGACY_LISTING_STATUS.ACTIVE]: L.LIVE,
  [LEGACY_LISTING_STATUS.RENTED]: L.RENTED,
  [LEGACY_LISTING_STATUS.CLOSED]: L.WITHDRAWN,
});
export const listingStateFromLegacy = (status) => LEGACY_TO_LISTING_STATE[status] || L.LIVE;
// The listing's state: the state column when it is there, the status column otherwise.
export const listingStateOf = (listing) => (listing && isListingState(listing.state) ? listing.state : listingStateFromLegacy(listing && listing.status));
export const isLegacyRented = (status) => status === LEGACY_LISTING_STATUS.RENTED;
export const isLegacyClosed = (status) => status === LEGACY_LISTING_STATUS.CLOSED;
export const isLegacyActive = (status) => status === LEGACY_LISTING_STATUS.ACTIVE;
// The word the timeline payload carries when a listing row is removed. Not a state: the row is gone.
export const LISTING_DELETED = 'deleted';

export const DECISION_STATUS = Object.freeze({
  NONE: 'none',           // active, ranked by fit (the insert default)
  SHORTLIST: 'shortlist', // accepted by the constraint; never written by the app, read as active
  REJECT: 'reject',       // set aside with an OHRC safe reason
});
export const DECISION_PRIORITY = Object.freeze({
  TOP: 'top',       // the realtor's finalist mark
  NORMAL: 'normal', // everyone else
});

// The state of a listing_applicants row: the state column when it is there, otherwise the same
// mapping db/003-application-state-backfill.sql applies. Set aside (decision_status reject) is
// the realtor's working sort and can be undone, so it does not move the state.
export function applicationStateOf(junction, listing = null) {
  const j = junction || {};
  if (isApplicationState(j.state)) return j.state;
  if (j.withdrawn_at || j.withdrawnAt) return A.WITHDRAWN_BY_APPLICANT;
  if (listing && isLegacyRented(listing.status)) {
    return listing.rented_link_id != null && String(listing.rented_link_id) === String(j.id) ? A.ACCEPTED : A.NOT_SELECTED;
  }
  const decision = j.decision_status || j.decisionStatus || DECISION_STATUS.NONE;
  const priority = j.decision_priority || j.decisionPriority || DECISION_PRIORITY.NORMAL;
  if (decision === DECISION_STATUS.SHORTLIST) return A.SHORTLISTED;
  if (decision !== DECISION_STATUS.REJECT && priority === DECISION_PRIORITY.TOP) return A.SHORTLISTED;
  return A.SUBMITTED;
}

// ── ONE READ PATH ────────────────────────────────────────────────────────────────
// Every screen, route, PDF, email and cron asks these two functions where a row stands. They
// answer from the state column, and fall back to the old columns only when the state is null or
// the column is absent. Nothing outside this file reads status, decision_status,
// decision_priority or withdrawn_at (tests/stateReads.test.mjs fails when something does).
//
// Two things the state does not carry, read here and nowhere else:
//   set aside      the realtor's working sort (decision_status reject). It can be undone, so it
//                  is not a state, and no state replaces it.
//   the mark       the finalist mark (decision_priority top). While an applicant is in play the
//                  mark and shortlisted are the same fact and the state answers. Past that
//                  (accepted, not_selected, and so on) the state has moved on and the mark is
//                  whatever the realtor left on the row.

// The old columns of a row, whichever shape it arrives in (the table's, or the dashboard's).
export function oldColumnsOf(row) {
  const r = row || {};
  // The answers take names no column has (decision, priority, withdrawnOn), so a read of a row
  // and a read of this answer can be told apart (tests/stateReads.test.mjs).
  return {
    decision: r.decision_status ?? r.decisionStatus ?? DECISION_STATUS.NONE,
    priority: r.decision_priority ?? r.decisionPriority ?? DECISION_PRIORITY.NORMAL,
    withdrawnOn: r.withdrawn_at ?? r.withdrawnAt ?? null,
    changedAt: r.decision_changed_at ?? r.decisionChangedAt ?? null,
  };
}
// What the old columns say about an applicant in play: shortlisted or not.
const markOf = (cols) => cols.decision === DECISION_STATUS.SHORTLIST || (cols.decision !== DECISION_STATUS.REJECT && cols.priority === DECISION_PRIORITY.TOP);

// Where an applicant stands. row: a listing_applicants row or the dashboard's applicant.
export function applicantStanding(row, listing = null) {
  const cols = oldColumnsOf(row);
  const state = applicationStateOf(row, listing);
  const withdrawn = state === A.WITHDRAWN_BY_APPLICANT || state === A.WITHDRAWN_BY_REALTOR;
  const setAside = !withdrawn && cols.decision === DECISION_STATUS.REJECT;
  return {
    state,
    stored: isApplicationState(row && row.state),
    withdrawn,
    withdrawnSince: withdrawn ? (cols.withdrawnOn || cols.changedAt || null) : null,
    setAside,
    active: !withdrawn && !setAside,
    finalist: isInPlay(state) ? state === A.SHORTLISTED : (cols.priority === DECISION_PRIORITY.TOP || cols.decision === DECISION_STATUS.SHORTLIST),
    notSelected: state === A.NOT_SELECTED,
    inPlay: isInPlay(state),
    changedAt: cols.changedAt,
  };
}
// How much a realtor has done on this row: one for a decision, one for a withdrawal (used to
// keep the richer of two duplicate rows, lib/supabaseBridge.js).
export const standingWeight = (row) => (oldColumnsOf(row).decision !== DECISION_STATUS.NONE ? 1 : 0) + (applicantStanding(row).withdrawn ? 1 : 0);
// What the dashboard's applicant carries from its listing_applicants row: the state, and the old
// columns beside it for the fallback and for the two facts the state does not hold.
export const carriedColumns = (row) => ({
  state: isApplicationState(row && row.state) ? row.state : null,
  decisionStatus: (row && row.decision_status) || DECISION_STATUS.NONE,
  decisionPriority: (row && row.decision_priority) || null,
  withdrawnAt: (row && row.withdrawn_at) || null,
});
// The same for a listing row handed to the browser.
export const carriedListingColumns = (l) => ({ state: isListingState(l && l.state) ? l.state : null, status: listingStanding(l).legacyStatus, closed_at: (l && l.closed_at) || null, rented_link_id: (l && l.rented_link_id) || null });
// The dashboard's own copy of a listing after POST /api/listings/status answers.
export const withLocalListingStatus = (listing, answer) => ({ ...listing, status: answer.status, state: isListingState(answer.state) ? answer.state : listingStateFromLegacy(answer.status), closed_at: answer.closedAt ?? null, rented_link_id: answer.rentedLinkId ?? null });

// Where a listing stands. Open means taking applications: live, and nothing else.
export function listingStanding(listing) {
  const state = listingStateOf(listing);
  return {
    state,
    stored: isListingState(listing && listing.state),
    open: state === L.LIVE,
    rented: state === L.RENTED,
    withdrawn: state === L.WITHDRAWN,
    // The old word for it, for the payloads and the copy that still speak it.
    legacyStatus: state === L.RENTED ? LEGACY_LISTING_STATUS.RENTED : state === L.WITHDRAWN ? LEGACY_LISTING_STATUS.CLOSED : LEGACY_LISTING_STATUS.ACTIVE,
    closedAt: (listing && listing.closed_at) || null,
    rentedLinkId: state === L.RENTED ? ((listing && listing.rented_link_id) || null) : null,
  };
}

// ── KEEPING BOTH IN STEP ─────────────────────────────────────────────────────────
// The state a write must move to so the state and the old columns say the same thing. Pure, and
// shared by the routes (lib/realtorWrites.js), the sandbox (lib/demoAdapter.js) and the
// dashboard's optimistic update. null means the state stays where it is. The move itself is
// still asserted by the caller: these name it, they do not allow it.

// After a decision write. colsAfter: the old columns as they will read once it lands.
export function stateAfterDecision(from, colsAfter) {
  const mark = markOf(oldColumnsOf(colsAfter));
  if (isInPlay(from)) {
    if (mark && from !== A.SHORTLISTED) return A.SHORTLISTED;
    if (!mark && from === A.SHORTLISTED) return A.SUBMITTED;
    return null;
  }
  // The mark is also the way back for someone looked at again, or whose deal fell through.
  if ((from === A.RECONSIDERED || from === A.FELL_THROUGH) && mark) return A.SHORTLISTED;
  return null;
}
// After a withdrawal is recorded (withdrawn true) or undone (false).
export function stateAfterWithdrawal(from, colsAfter, withdrawn) {
  if (withdrawn) return from === A.WITHDRAWN_BY_APPLICANT ? null : A.WITHDRAWN_BY_APPLICANT;
  if (from !== A.WITHDRAWN_BY_APPLICANT) return null;
  return markOf(oldColumnsOf(colsAfter)) ? A.SHORTLISTED : A.SUBMITTED;
}
// The old columns an applicant carries on entering reconsidered: not withdrawn, not set aside,
// not marked. The mark is then the realtor's one way to shortlist them.
export const reconsideredOldColumns = (now = new Date()) => ({ decision_status: DECISION_STATUS.NONE, decision_reason_code: null, decision_priority: DECISION_PRIORITY.NORMAL, withdrawn_at: null, decision_changed_at: new Date(now).toISOString() });
// The same, in the dashboard's applicant shape, for its own copy and the sandbox.
export const reconsideredLocalColumns = (now = new Date()) => ({ decisionStatus: DECISION_STATUS.NONE, decisionReasonCode: null, decisionPriority: DECISION_PRIORITY.NORMAL, withdrawnAt: null, decisionChangedAt: new Date(now).toISOString() });

// The dashboard's optimistic update: the patch it is about to send, applied to its own copy of
// the applicant, state included, by the same rules the server applies.
export function withLocalDecision(applicant, patch, changedAt = new Date().toISOString()) {
  const next = { ...applicant, ...patch, decisionChangedAt: changedAt };
  if (!isApplicationState(applicant && applicant.state)) return next;
  const to = 'withdrawnAt' in (patch || {}) ? stateAfterWithdrawal(applicant.state, next, !!patch.withdrawnAt) : stateAfterDecision(applicant.state, next);
  return to && canTransition(applicant.state, to) ? { ...next, state: to } : next;
}

// ── DO THE TWO AGREE? ────────────────────────────────────────────────────────────
// The old columns say less than the state: they cannot tell not_selected from submitted on a
// reopened listing, or name docs_pending, fell_through, reconsidered or a closing step. So the
// two disagree only when the old columns CONTRADICT the state. The same rules, in SQL, are
// db/state-parity-check.sql and db/005-application-state-resync.sql (npm run
// verify:migrations compares the three on every combination).
export const DISAGREEMENT = Object.freeze({
  WITHDRAWN_AT_SET: 'withdrawn_at is set and the state is not withdrawn_by_applicant',
  WITHDRAWN_AT_EMPTY: 'the state is withdrawn_by_applicant and withdrawn_at is empty',
  WINNER_NOT_HOLDING: 'the row is the winner of a rented listing and the state does not hold it',
  HOLDING_NOT_WINNER: 'the state holds a listing that is not rented to this row',
  IN_PLAY_ON_RENTED: 'the listing is rented to someone else and the state is still open',
  MARK_NOT_SHORTLISTED: 'the finalist mark is on and the state is not shortlisted',
  SHORTLISTED_NO_MARK: 'the state is shortlisted and the finalist mark is off',
});
export function applicantDisagreement(row, listing = null) {
  const state = row && row.state;
  if (!isApplicationState(state)) return null; // nothing stored, nothing to contradict
  const cols = oldColumnsOf(row);
  const w = !!cols.withdrawnOn;
  if (w && state !== A.WITHDRAWN_BY_APPLICANT) return DISAGREEMENT.WITHDRAWN_AT_SET;
  if (!w && state === A.WITHDRAWN_BY_APPLICANT) return DISAGREEMENT.WITHDRAWN_AT_EMPTY;
  if (w) return null;
  const rented = !!listing && isLegacyRented(listing.status);
  const winner = rented && listing.rented_link_id != null && String(listing.rented_link_id) === String(row.id);
  if (winner && !holdsListing(state)) return DISAGREEMENT.WINNER_NOT_HOLDING;
  if (!winner && holdsListing(state)) return DISAGREEMENT.HOLDING_NOT_WINNER;
  if (rented && !winner && (isInPlay(state) || state === A.RECONSIDERED)) return DISAGREEMENT.IN_PLAY_ON_RENTED;
  const mark = markOf(cols);
  if (mark && (state === A.SUBMITTED || state === A.DOCS_PENDING)) return DISAGREEMENT.MARK_NOT_SHORTLISTED;
  if (!mark && state === A.SHORTLISTED) return DISAGREEMENT.SHORTLISTED_NO_MARK;
  return null;
}
// What the resync sets a disagreeing row to: what the old columns say, and never a row in
// reconsidered (only the realtor's own action moves someone out of it).
export function resyncTarget(row, listing = null) {
  if (!applicantDisagreement(row, listing) || row.state === A.RECONSIDERED) return null;
  return applicationStateOf({ ...row, state: null }, listing);
}
export function listingDisagreement(listing) {
  if (!listing || !isListingState(listing.state) || !isLegacyListingStatus(listing.status)) return null;
  const s = listing.state;
  if (isLegacyRented(listing.status)) return s === L.RENTED ? null : 'status is rented and the state is not';
  if (isLegacyClosed(listing.status)) return s === L.WITHDRAWN ? null : 'status is closed and the state is not withdrawn';
  return s === L.LIVE || s === L.DRAFT || s === L.PAUSED ? null : 'status is active and the state is rented or withdrawn';
}

// What the tenant sees on their own page (pages/api/tenant/profile.js). Soft wording, never a
// reason. A withdrawal always wins: a tenant who withdrew is never told they were not selected.
export const TENANT_STATUS = Object.freeze({
  submitted: Object.freeze({ key: A.SUBMITTED, label: 'Submitted' }),
  not_selected: Object.freeze({ key: A.NOT_SELECTED, label: 'Not selected for this unit' }),
  withdrawn: Object.freeze({ key: 'withdrawn', label: 'Withdrawn' }),
});
// A reconsidered applicant still reads not selected: what they are told next is a re invite from
// the realtor, never a line that changed on its own.
export function tenantStatusFor(link, listing = null) {
  const st = applicantStanding(link, listing);
  if (st.withdrawn) return TENANT_STATUS.withdrawn;
  if (st.setAside || st.notSelected || st.state === A.RECONSIDERED) return TENANT_STATUS.not_selected;
  return TENANT_STATUS.submitted;
}

// The people on one application (public.application_parties.role) and the kinds of income a
// party can list (public.income_sources.kind). The kind says how to read the amount. It is never
// a score input, never a rank, never a filter.
export const PARTY_ROLE = Object.freeze({ PRIMARY: 'primary', CO_APPLICANT: 'co_applicant', GUARANTOR: 'guarantor', OCCUPANT: 'occupant' });
export const PARTY_ROLES = Object.freeze(Object.values(PARTY_ROLE));
export const INCOME_KIND = Object.freeze({ EMPLOYMENT: 'employment', SELF_EMPLOYED: 'self_employed', OTHER: 'other' });
export const INCOME_KINDS = Object.freeze(Object.values(INCOME_KIND));
