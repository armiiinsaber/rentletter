// lib/listingApplicantsVocabulary.js
// THE vocabulary for the constrained columns on public.listing_applicants. Every write, every
// comparison and every default in the codebase imports from here; there are no string literals
// for these columns anywhere else (including the demo adapter, the demo fixture and the
// assistant action registry).
//
// These values MUST match db/schema-reference.sql, which documents the database's check
// constraints. A value that is not in that file is rejected by Postgres at write time, and that
// failure is exactly what this module exists to make impossible.

export const DECISION_STATUS = Object.freeze({
  NONE: 'none',           // active, ranked by fit (the insert default)
  SHORTLIST: 'shortlist', // accepted by the constraint; never written by the app, read as active
  REJECT: 'reject',       // set aside with an OHRC safe reason
});
export const DECISION_STATUS_VALUES = Object.freeze(Object.values(DECISION_STATUS));

export const DECISION_PRIORITY = Object.freeze({
  TOP: 'top',       // the realtor's finalist mark
  NORMAL: 'normal', // everyone else
});
export const DECISION_PRIORITY_VALUES = Object.freeze(Object.values(DECISION_PRIORITY));

export const ADDED_VIA = Object.freeze({
  INVITE: 'invite',
  LOOKUP: 'lookup',
  REFERRAL: 'referral',
});
export const ADDED_VIA_VALUES = Object.freeze(Object.values(ADDED_VIA));

// Derived states, from the dashboard applicant shape (camelCase, as fetchListingApplicants
// returns it). Withdrawal is its own column (withdrawn_at) and wins over decision_status.
export const isWithdrawn = (a) => !!a?.withdrawnAt;
export const isSetAside = (a) => !isWithdrawn(a) && a?.decisionStatus === DECISION_STATUS.REJECT;
export const isActive = (a) => !isWithdrawn(a) && a?.decisionStatus !== DECISION_STATUS.REJECT;
export const isFinalist = (a) => a?.decisionPriority === DECISION_PRIORITY.TOP;

// One word for the card: 'withdrawn' | 'set_aside' | 'active'. Presentation vocabulary only,
// never written to the database.
export const APPLICANT_STATE = Object.freeze({ WITHDRAWN: 'withdrawn', SET_ASIDE: 'set_aside', ACTIVE: 'active' });
export function applicantState(a) {
  if (isWithdrawn(a)) return APPLICANT_STATE.WITHDRAWN;
  if (isSetAside(a)) return APPLICANT_STATE.SET_ASIDE;
  return APPLICANT_STATE.ACTIVE;
}
