// lib/application-state.js  PURE (no imports, safe on the server and in the browser).
// THE single source of truth for the state of an application on a listing and the state of a
// listing. Every status string in the codebase is defined here, every comparison goes through a
// constant or a function from here, and every write of a state goes through assertTransition or
// assertListingTransition (lib/applicationTransitions.js is the only writer).
//
// An application here means one applicant on one listing: a public.listing_applicants row.
// The enums below match db/001-application-state-enums.sql (tests/applicationState.test.mjs
// compares the two).
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
  [A.NOT_SELECTED]: Object.freeze([]),
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

export const isApplicationState = (s) => APPLICATION_STATES.includes(s);
export const isListingState = (s) => LISTING_STATES.includes(s);

export function canTransition(from, to) {
  if (!isApplicationState(to)) return false;
  if (from == null) return INITIAL_APPLICATION_STATES.includes(to);
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
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

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new TransitionError('application', from, to);
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
    } else if (!holdsListing(a.state) && canTransition(a.state, A.NOT_SELECTED)) {
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
// public.listing_applicants (db/schema-reference.sql) stay in place: the screens read them. The
// state column is written beside them, and these are their only definitions.
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

// What the tenant sees on their own page (pages/api/tenant/profile.js). Soft wording, never a
// reason. A withdrawal always wins: a tenant who withdrew is never told they were not selected.
export const TENANT_STATUS = Object.freeze({
  submitted: Object.freeze({ key: A.SUBMITTED, label: 'Submitted' }),
  not_selected: Object.freeze({ key: A.NOT_SELECTED, label: 'Not selected for this unit' }),
  withdrawn: Object.freeze({ key: 'withdrawn', label: 'Withdrawn' }),
});
export function tenantStatusFor(link) {
  if (link && link.withdrawn_at) return TENANT_STATUS.withdrawn;
  if (link && link.decision_status === DECISION_STATUS.REJECT) return TENANT_STATUS.not_selected;
  return TENANT_STATUS.submitted;
}

// Who moved it (public.application_events.actor_type).
export const ACTOR_TYPE = Object.freeze({ REALTOR: 'realtor', APPLICANT: 'applicant', SYSTEM: 'system' });
export const ACTOR_TYPES = Object.freeze(Object.values(ACTOR_TYPE));

// The people on one application (public.application_parties.role) and the kinds of income a
// party can list (public.income_sources.kind). The kind says how to read the amount. It is never
// a score input, never a rank, never a filter.
export const PARTY_ROLE = Object.freeze({ PRIMARY: 'primary', CO_APPLICANT: 'co_applicant', GUARANTOR: 'guarantor', OCCUPANT: 'occupant' });
export const PARTY_ROLES = Object.freeze(Object.values(PARTY_ROLE));
export const INCOME_KIND = Object.freeze({ EMPLOYMENT: 'employment', SELF_EMPLOYED: 'self_employed', PENSION: 'pension', OTHER: 'other' });
export const INCOME_KINDS = Object.freeze(Object.values(INCOME_KIND));
