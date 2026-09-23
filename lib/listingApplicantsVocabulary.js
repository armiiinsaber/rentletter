// lib/listingApplicantsVocabulary.js
// THE vocabulary for the constrained columns on public.listing_applicants. Every write, every
// comparison and every default in the codebase imports from here; there are no string literals
// for these columns anywhere else (including the demo adapter, the demo fixture and the
// assistant action registry).
//
// These values MUST match db/schema-reference.sql, which documents the database's check
// constraints. A value that is not in that file is rejected by Postgres at write time, and that
// failure is exactly what this module exists to make impossible.

// The values themselves live in lib/application-state.js, the single source of truth for every
// status in the codebase: none (active, ranked by fit, the insert default), shortlist (accepted
// by the constraint, never written by the app, read as active), reject (set aside with an OHRC
// safe reason); top (the realtor's finalist mark), normal (everyone else).
import { DECISION_STATUS, DECISION_PRIORITY, applicantStanding } from './application-state.js';
export { DECISION_STATUS, DECISION_PRIORITY };
export const DECISION_STATUS_VALUES = Object.freeze(Object.values(DECISION_STATUS));

export const DECISION_PRIORITY_VALUES = Object.freeze(Object.values(DECISION_PRIORITY));

export const ADDED_VIA = Object.freeze({
  INVITE: 'invite',
  LOOKUP: 'lookup',
  REFERRAL: 'referral',
});
export const ADDED_VIA_VALUES = Object.freeze(Object.values(ADDED_VIA));

// Derived states, from the dashboard applicant shape (camelCase, as fetchListingApplicants
// returns it). Withdrawal is its own column (withdrawn_at) and wins over decision_status.
// All four answer from lib/application-state.js applicantStanding: the state when the row carries
// one, the old columns only when it does not.
export const isWithdrawn = (a) => applicantStanding(a).withdrawn;
export const isSetAside = (a) => applicantStanding(a).setAside;
export const isActive = (a) => applicantStanding(a).active;
export const isFinalist = (a) => applicantStanding(a).finalist;

// One word for the card: 'withdrawn' | 'set_aside' | 'active'. Presentation vocabulary only,
// never written to the database.
export const APPLICANT_STATE = Object.freeze({ WITHDRAWN: 'withdrawn', SET_ASIDE: 'set_aside', ACTIVE: 'active' });
export function applicantState(a) {
  if (isWithdrawn(a)) return APPLICANT_STATE.WITHDRAWN;
  if (isSetAside(a)) return APPLICANT_STATE.SET_ASIDE;
  return APPLICANT_STATE.ACTIVE;
}
