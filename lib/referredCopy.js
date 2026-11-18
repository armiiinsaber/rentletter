// lib/referredCopy.js  PURE, isomorphic. The receiving realtor's copy of a referred application
// (lib/referrals.js) holds the fact whitelist (lib/profileFacts.js) and nothing else. Every other
// field of that copy was NOT SHARED: it is stored null and read as unknown, never as the apply
// form's blank. A blank is a false fact: "1 occupant", "non smoker", "0 references", "no pets",
// "age not confirmed" were never said by this tenant to this realtor.
//
// UNSHARED_COLUMNS is the one list, by applications column:
//   age_confirmed        the form's blank is false        → would read as a failed confirmation
//   number_of_occupants  the form's blank is '1'          → would read as a household of one
//   smoker               the form's blank is 'no'         → would read as "Non-smoker"
//   pets                 the form's blank is none         → would read as "None"
//   references           the form's blank is an empty list → would read as "0 provided"
//   co_applicant         none                             → would read as applying alone
//   net_income, net_income_source, current_rent, business_name   blank: left out everywhere
// move_in_date is on the whitelist; when the tenant gave none the copy holds null, never the
// form's "as soon as possible".
//
// A copy stays unshared until the tenant edits it themselves from their own profile page
// (profile_revision above 0): from then on its answers are the tenant's own, given to this
// realtor. number_of_occupants is the exception: on a referred application it is never read by a
// realtor at all (lib/supabaseBridge.js).
import { assertSharePayload } from './profileFacts.js';

export const UNSHARED_COLUMNS = Object.freeze(['age_confirmed', 'number_of_occupants', 'smoker', 'pets', 'references', 'co_applicant', 'net_income', 'net_income_source', 'current_rent', 'business_name']);
export const NOT_SHARED = 'Not shared';

// row: an applications row (or the application object a realtor screen holds).
export const isUnsharedCopy = (row) => !!row && !!row.referral_meta && !(Number(row.profile_revision) > 0);
export const notShared = (row, column) => UNSHARED_COLUMNS.includes(column) && (isUnsharedCopy(row) || (column === 'number_of_occupants' && !!row && !!row.referral_meta));

// The row as a realtor may read it: referral_meta cut to who referred and when (an older row may
// hold the referring realtor's note and document summary), household size null, and on an
// unshared copy every unshared column null whatever the row holds. Nothing is written back.
export function referredRowForRealtor(row) {
  if (!row || !row.referral_meta) return row;
  const m = row.referral_meta;
  const out = { ...row, referral_meta: { id: m.id || null, fromName: m.fromName || null, fromBrokerage: m.fromBrokerage || null, approvedAt: m.approvedAt || null, factsSource: m.factsSource || null }, number_of_occupants: null };
  if (isUnsharedCopy(row)) for (const c of UNSHARED_COLUMNS) out[c] = null;
  return out;
}

// The receiving realtor's copy as stored (the KV app:{RL} record): the payload's facts stay, and
// every other field is null. The builder (lib/tenantProfile.js buildApplicationFromForm) writes
// '1' occupant, 'no' smoker, an empty reference list, age not confirmed and a move in date of "as
// soon as possible" for a form that says nothing; none of those was said by this tenant.
//   app: what the builder returned. payload: lib/profileFacts.js sharePayload, checked again here.
export function withUnshared(app, payload) {
  const has = new Set(assertSharePayload(payload).facts.map((x) => x.key));
  return {
    ...app,
    tenant: { ...(app.tenant || {}), ageConfirmed: null },
    employment: { ...(app.employment || {}), businessName: null, netIncome: null, netIncomeSource: null },
    rental: { ...(app.rental || {}), currentRent: null },
    move: { ...(app.move || {}), moveInDate: has.has('moveInDate') ? ((app.move && app.move.moveInDate) || null) : null },
    household: { numberOfOccupants: null, smoker: null, evParkingNeeded: null },
    coApplicant: null,
    lifestyle: { ...(app.lifestyle || {}), pets: null },
    references: null,
  };
}

// The number of references on file, or null when they were not shared (unknown, never zero).
export function referenceCount(row) {
  if (notShared(row, 'references')) return null;
  return Array.isArray(row && row.references) ? row.references.length : 0;
}
