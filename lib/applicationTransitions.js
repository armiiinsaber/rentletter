// lib/applicationTransitions.js  SERVER ONLY (takes the service role client). The ONLY writer of
// public.listing_applicants.state and public.listings.state. Every move is asserted against
// lib/application-state.js before anything is written, and every application move writes one
// row to public.application_events (db/002-application-state-tables.sql).
//
// The callers are routes that have already run the session, requireEntitlement and the explicit
// ownership check (or, on the tenant's upload path, the request token bound to this applicant).
//
// Before db/002 has run the state column and the audit table are absent: the write is retried
// without the state, the columns the screens read are still written, and one line is logged.
import {
  APPLICATION_STATE, ACTOR_TYPE, ACTOR_TYPES,
  assertTransition, assertListingTransition, canTransition, isTransitionError,
  applicationStateOf, listingStateOf, guardFor,
} from './application-state.js';

export { isTransitionError };

const msg = (e) => String((e && e.message) || '');
// The state column is not there yet (42703 from Postgres, PGRST204 from PostgREST).
export const stateColumnAbsent = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /schema cache/i.test(msg(error))) && /\bstate\b/.test(msg(error));
// The audit table is not there yet (42P01 from Postgres, PGRST205 from PostgREST).
export const auditTableAbsent = (error) => !!error && (error.code === '42P01' || error.code === 'PGRST205' || /application_events/.test(msg(error)) && /(does not exist|could not find|schema cache)/i.test(msg(error)));

let warnedColumn = false; let warnedAudit = false;
const warnColumn = () => { if (!warnedColumn) { warnedColumn = true; console.warn('[applicationTransitions] the state column is not set up yet (run db/001, db/002 and db/003 application state files); carrying on without it'); } };
const warnAudit = () => { if (!warnedAudit) { warnedAudit = true; console.warn('[applicationTransitions] application_events is not set up yet (run db/002-application-state-tables.sql); the move is not audited'); } };

// What a route answers when a move is refused.
export const refusal = (e) => ({ status: 409, body: { error: 'That application cannot move there from where it stands.', code: 'illegal_transition', from: e.from, to: e.to } });
export const listingRefusal = (e) => ({ status: 409, body: { error: 'That listing cannot move there from where it stands.', code: 'illegal_transition', from: e.from, to: e.to } });

const auditRow = (move, { actor = null, actorType = ACTOR_TYPE.SYSTEM, reason = null } = {}) => ({
  listing_applicant_id: move.id,
  from_state: move.from == null ? null : move.from,
  to_state: move.to,
  actor: actor == null ? null : String(actor).slice(0, 80),
  actor_type: ACTOR_TYPES.includes(actorType) ? actorType : ACTOR_TYPE.SYSTEM,
  reason: reason == null ? null : String(reason).slice(0, 200),
});

async function writeAudit(admin, rows) {
  if (!rows.length) return false;
  try {
    const { error } = await admin.from('application_events').insert(rows);
    if (error) { if (auditTableAbsent(error)) warnAudit(); else console.warn('[applicationTransitions] audit not written:', error.message); return false; }
    return true;
  } catch (e) { console.warn('[applicationTransitions] audit not written:', msg(e)); return false; }
}

// Move ONE application. junction is the listing_applicants row (ownedApplicant reads it whole),
// listing is its listing when the caller has it. patch carries the other columns the same write
// sets (decision_priority, withdrawn_at, ...), so the state and those columns land in one update.
// Throws a TransitionError when the move is not allowed, before anything is written.
// Returns { changed, from, to, stored, error }.
export async function transitionApplication(admin, { junction, listing = null, to, patch = {}, actor = null, actorType = ACTOR_TYPE.REALTOR, reason = null }) {
  const from = applicationStateOf(junction, listing);
  const changed = to != null && to !== from;
  // A guarded move (lib/application-state.js TRANSITION_GUARDS) is asserted against who is
  // moving it, the listing's state and the reason. No listing handed in means no listing state,
  // and the guard refuses.
  const context = { actorType, listingState: listing ? listingStateOf(listing) : null, reason };
  if (changed) assertTransition(from, to, context);
  const guard = changed ? guardFor(from, to) : null;
  const values = changed ? { ...patch, state: to } : { ...patch };
  if (!Object.keys(values).length) return { changed: false, from, to: from, stored: false, error: null };
  let { error } = await admin.from('listing_applicants').update(values).eq('id', junction.id);
  let stored = changed && !error;
  if (error && changed && stateColumnAbsent(error)) {
    warnColumn(); stored = false;
    error = Object.keys(patch).length ? (await admin.from('listing_applicants').update({ ...patch }).eq('id', junction.id)).error : null;
  }
  if (error) return { changed: false, from, to: from, stored: false, error };
  const audited = stored ? await writeAudit(admin, [auditRow({ id: junction.id, from, to }, { actor, actorType, reason })]) : false;
  // A move that must be audited does not stand without its row: the state goes back.
  if (guard && guard.audited && !audited) {
    if (stored) await admin.from('listing_applicants').update({ state: from }).eq('id', junction.id);
    return { changed: false, from, to: from, stored: false, error: { code: 'audit_required', message: 'This move must be recorded, and the record could not be written.' } };
  }
  return { changed, from, to: changed ? to : from, stored, error: null };
}

// The same, for a move that only happens when the application stands where it can be made from
// (a document request moves submitted to docs_pending and leaves a shortlisted applicant alone).
// onlyFrom names the states the move may start from; anything else is left where it is.
export async function transitionApplicationIfAllowed(admin, { onlyFrom = null, ...args }) {
  const from = applicationStateOf(args.junction, args.listing || null);
  const skip = from === args.to || !canTransition(from, args.to) || (Array.isArray(onlyFrom) && !onlyFrom.includes(from));
  if (skip) return { changed: false, from, to: from, stored: false, error: null };
  return transitionApplication(admin, args);
}

// A new application on a listing starts in submitted: asserted like any other move, and audited.
export function startingState(to = APPLICATION_STATE.SUBMITTED) { return assertTransition(null, to); }
export async function recordStart(admin, { linkId, to = APPLICATION_STATE.SUBMITTED, actor = null, actorType = ACTOR_TYPE.APPLICANT, reason = null }) {
  if (!linkId) return false;
  assertTransition(null, to);
  return writeAudit(admin, [auditRow({ id: linkId, from: null, to }, { actor, actorType, reason })]);
}

// Move MANY applications at once (the cascades in lib/application-state.js): one update per
// target state, one insert for the audit. Every move is asserted first; nothing is written when
// one of them is refused. moves: [{ id, from, to }].
export async function transitionApplications(admin, moves, { actor = null, actorType = ACTOR_TYPE.REALTOR, reason = null } = {}) {
  const list = (moves || []).filter((m) => m && m.id != null && m.to !== m.from);
  // No context: a cascade can never make a guarded move (nobody is reconsidered in bulk).
  for (const m of list) assertTransition(m.from, m.to);
  if (!list.length) return { moved: 0, stored: false };
  const byTarget = new Map();
  for (const m of list) { if (!byTarget.has(m.to)) byTarget.set(m.to, []); byTarget.get(m.to).push(m.id); }
  for (const [to, ids] of byTarget) {
    const { error } = await admin.from('listing_applicants').update({ state: to }).in('id', ids);
    if (error) { if (stateColumnAbsent(error)) { warnColumn(); return { moved: 0, stored: false }; } throw error; }
  }
  await writeAudit(admin, list.map((m) => auditRow(m, { actor, actorType, reason })));
  return { moved: list.length, stored: true };
}

// The last recorded move of one application, or null (no row, or no table yet).
export async function lastMove(admin, linkId) {
  try {
    const { data, error } = await admin.from('application_events').select('from_state, to_state, reason, created_at').eq('listing_applicant_id', String(linkId)).order('created_at', { ascending: false }).limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  } catch (e) { return null; }
}

// Move a LISTING. patch is the status patch the screens read (lib/listingState.js statusPatch);
// the state lands in the same update. Throws a TransitionError before anything is written.
// Returns { changed, from, to, stored, error }.
export async function transitionListing(admin, { listing, to, patch = {} }) {
  const from = listingStateOf(listing);
  const changed = to != null && to !== from;
  if (changed) assertListingTransition(from, to);
  const values = changed ? { ...patch, state: to } : { ...patch };
  if (!Object.keys(values).length) return { changed: false, from, to: from, stored: false, error: null };
  let { error } = await admin.from('listings').update(values).eq('id', listing.id);
  let stored = changed && !error;
  if (error && changed && stateColumnAbsent(error)) {
    warnColumn(); stored = false;
    error = Object.keys(patch).length ? (await admin.from('listings').update({ ...patch }).eq('id', listing.id)).error : null;
  }
  return { changed: changed && !error, from, to: changed && !error ? to : from, stored, error: error || null };
}
