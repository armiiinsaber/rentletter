// lib/realtorWrites.js  SERVER ONLY (takes the service role client). The realtor's writes, one
// function per concern, each with the explicit ownership check, the event, the signals cache
// and the pending nudge set. The routes under pages/api are thin: withRealtor, then one of
// these. Every function answers { status, body } and never throws for a bad request.
//
// deps: { admin, userId, profile, invalidate(profileId), srem(linkId), now }
import { ownedApplicant, realtorName } from './ownApplicant.js';
import { sendReconsiderInvite } from './reconsiderInvite.js';
import { purgeStoredDocuments } from './documentStore.js';
import { DEFAULT_RENT_SHARE_CAP } from './listingForm.js';
import { ownedListing, statusPatch } from './listingStatus.js';
import { recordEvent } from './events.js';
import { reasonLabel, SET_ASIDE_REASONS } from './setAsideReasons.js';
import { DECISION_STATUS, DECISION_PRIORITY } from './listingApplicantsVocabulary.js';
import { normalizeProvince } from './provinces.js';
import { displayLabel } from './listingAddress.js';
import { BOARD_FIELDS, PROFILE_BOARD_FIELDS, BOARD_OPTIONS, normalizeBoardDetails } from './boardDetails.js';
import { APPLICATION_STATE, ACTOR_TYPE, LEGACY_LISTING_STATUS, LISTING_DELETED, LISTING_STATE, RECONSIDER_REASONS, RECONSIDER_UNDONE, TransitionError, applicationStateOf, isTransitionError, oldColumnsOf, stateAfterDecision, stateAfterWithdrawal, reconsideredOldColumns } from './application-state.js';
import { transitionApplication, transitionListing, lastMove, refusal, listingRefusal } from './applicationTransitions.js';

const notOwned = (own) => ({ status: own === null ? 404 : 403, body: { error: own === null ? 'Not found.' : 'Not yours.' } });
const missingColumn = (error) => error && (error.code === '42703' || error.code === 'PGRST204' || /column|schema cache/i.test(String(error.message || '')));
const str = (v, n) => (v == null ? null : String(v).slice(0, n));

// The listing columns the edit form still writes (the ones that survived C2). Anything else in
// the body is dropped, so a client can never set profile_id, status, invite_token or a pref
// column the form no longer has.
// unit (db/listing-unit.sql), pref_ask_credit_report (db/credit-shared.sql) and the board details
// (db/012-board-details.sql, lib/boardDetails.js) are optional: a write that lands before the
// migration retries without the column the error names, until it lands or nothing optional is left.
export const OPTIONAL_LISTING_FIELDS = Object.freeze(['unit', 'pref_ask_credit_report', ...BOARD_FIELDS]);
export const LISTING_FIELDS = Object.freeze([
  'name', 'address', 'unit', 'monthly_rent', 'bedrooms', 'allows_pets', 'allows_smoking', 'parking_included',
  'landlord_name', 'landlord_email', 'landlord_phone',
  'pref_rent_to_income_max_pct',
  'pref_requires_landlord_reference', 'pref_requires_employer_verification', 'pref_ask_credit_report', 'pref_guarantor_accepted', 'pref_notes',
  ...BOARD_FIELDS,
]);
export const PROFILE_FIELDS = Object.freeze(['full_name', 'brokerage', 'phone', 'license_number', 'province', 'report_signature', 'onboarding_step', 'onboarding_completed_at', ...PROFILE_BOARD_FIELDS]);
export const BRANDING_FIELDS = Object.freeze(['brand_color', 'brand_color_secondary', 'brand_palette', 'brand_fonts', 'logo_url']);
export const pickListingFields = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => LISTING_FIELDS.includes(k)));
// The error a write gets back before db/listing-unit.sql has run, and the row without that column.
export const optionalColumnMissing = (error, row) => missingColumn(error) && OPTIONAL_LISTING_FIELDS.some((c) => c in (row || {}));
// The row without the optional column the error names; without every optional column when the
// error names none of them (an older message shape).
export const withoutOptional = (row, error = null) => {
  const slim = { ...(row || {}) };
  const named = OPTIONAL_LISTING_FIELDS.filter((c) => c in slim && String(error && error.message || '').includes(c));
  for (const c of named.length ? named : OPTIONAL_LISTING_FIELDS) delete slim[c];
  return slim;
};
// A listing write that keeps retrying without the optional columns the database does not have yet.
async function writeListing(run, row) {
  let values = row;
  let { data, error } = await run(values);
  for (let i = 0; error && optionalColumnMissing(error, values) && i < OPTIONAL_LISTING_FIELDS.length; i++) {
    const next = withoutOptional(values, error);
    if (Object.keys(next).length === Object.keys(values).length) break;
    values = next;
    ({ data, error } = await run(values));
  }
  return { data, error };
}
// The board details on a write (lib/boardDetails.js): cleaned, and refused when a deposit is above
// what the realtor's province allows. The rent they are measured against is the one being written,
// or the listing's current rent.
const boardFor = (values, profile, current) => normalizeBoardDetails(values, { province: profile && profile.province, monthlyRent: values.monthly_rent != null ? values.monthly_rent : current && current.monthly_rent });

async function applicantName(admin, applicationId) {
  try { const { data } = await admin.from('applications').select('full_name').eq('id', applicationId).maybeSingle(); return data?.full_name || null; } catch (e) { return null; }
}

// Set aside, restore, finalist, priority, notes: { linkId, status, reasonCode, notes, priority }.
export async function decideApplicant(deps, body) {
  const { admin, userId, invalidate, srem, now = new Date() } = deps;
  const { linkId, status, reasonCode, notes, priority } = body || {};
  if (!linkId) return { status: 400, body: { error: 'linkId is required.' } };
  if (status != null && !Object.values(DECISION_STATUS).includes(status)) return { status: 400, body: { error: 'Unknown status.' } };
  if (priority != null && !Object.values(DECISION_PRIORITY).includes(priority)) return { status: 400, body: { error: 'Unknown priority.' } };
  if (reasonCode != null && reasonCode !== '' && !SET_ASIDE_REASONS.some((r) => r.code === reasonCode)) return { status: 400, body: { error: 'Unknown reason.' } };
  if (status === DECISION_STATUS.REJECT && !reasonCode) return { status: 400, body: { error: 'A screenable reason is required to set aside.' } };
  const own = await ownedApplicant(admin, linkId, userId);
  if (!own) return notOwned(own);
  const { junction, listing } = own;
  const changedAt = new Date(now).toISOString();
  const patch = { decision_changed_at: changedAt };
  if (status != null) patch.decision_status = status;
  if ('reasonCode' in (body || {})) patch.decision_reason_code = reasonCode || null;
  if ('notes' in (body || {})) patch.decision_notes = str(notes, 2000) || null;
  if (priority != null) patch.decision_priority = priority;
  // The state that keeps step with the old columns as they will read after this write
  // (lib/application-state.js stateAfterDecision): marked and not set aside is shortlisted, a
  // shortlisted applicant who is set aside or loses the mark is submitted again, the mark is the
  // way back from reconsidered and fell_through, and past that the state does not move.
  const from = applicationStateOf(junction, listing);
  const before = oldColumnsOf(junction);
  const after = { decision_status: status != null ? status : before.decision, decision_priority: priority != null ? priority : before.priority };
  const to = stateAfterDecision(from, after);
  let moved;
  try { moved = await transitionApplication(admin, { junction, listing, to, patch, actor: userId, actorType: ACTOR_TYPE.REALTOR, reason: to ? (to === APPLICATION_STATE.SHORTLISTED ? 'finalist_marked' : 'finalist_removed') : null }); }
  catch (e) { if (isTransitionError(e)) return refusal(e); throw e; }
  const error = moved.error;
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: missingColumn(error) ? 'That column is not set up yet.' : 'Could not save your decision.' } };
  const name = await applicantName(admin, junction.application_id);
  const base = { profileId: userId, listingId: listing.id, applicationId: junction.application_id };
  const payload = { applicantName: name, listingName: displayLabel(listing) || null, linkId: junction.id };
  const was = before.decision;
  if (status === DECISION_STATUS.REJECT) { await recordEvent(admin, { ...base, type: 'applicant_set_aside', payload: { ...payload, reason: reasonLabel(reasonCode) } }); await srem?.(junction.id); }
  else if (status != null && was === DECISION_STATUS.REJECT && status !== DECISION_STATUS.REJECT) await recordEvent(admin, { ...base, type: 'applicant_restored', payload });
  if (priority != null && priority !== before.priority) await recordEvent(admin, { ...base, type: 'applicant_marked_finalist', payload: { ...payload, removed: priority !== DECISION_PRIORITY.TOP } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, linkId: junction.id, changedAt, patch, state: moved.stored ? moved.to : null } };
}

// Withdraw: { linkId, withdrawn } (withdrawn false undoes it, no event).
export async function withdrawApplicant(deps, body) {
  const { admin, userId, invalidate, srem, now = new Date() } = deps;
  const { linkId } = body || {};
  const withdrawn = (body || {}).withdrawn !== false;
  if (!linkId) return { status: 400, body: { error: 'linkId is required.' } };
  const own = await ownedApplicant(admin, linkId, userId);
  if (!own) return notOwned(own);
  const { junction, listing } = own;
  const withdrawnAt = withdrawn ? new Date(now).toISOString() : null;
  // Recording a withdrawal moves the application to withdrawn_by_applicant; undoing it returns
  // the application to where the finalist mark says it stood. Both are asserted before the write.
  const from = applicationStateOf(junction, listing);
  const to = stateAfterWithdrawal(from, junction, withdrawn);
  if (!withdrawn && from === APPLICATION_STATE.WITHDRAWN_BY_APPLICANT) {
    // Nothing but the realtor's own action enters reconsidered, so a withdrawal recorded from
    // there cannot be undone into it, and undoing it into submitted would skip the shortlist.
    const last = await lastMove(admin, junction.id);
    if (last && last.to_state === APPLICATION_STATE.WITHDRAWN_BY_APPLICANT && last.from_state === APPLICATION_STATE.RECONSIDERED) return refusal(new TransitionError('application', from, APPLICATION_STATE.RECONSIDERED));
  }
  let moved;
  try { moved = await transitionApplication(admin, { junction, listing, to, patch: { withdrawn_at: withdrawnAt, decision_reason_code: null, decision_changed_at: new Date(now).toISOString() }, actor: userId, actorType: ACTOR_TYPE.REALTOR, reason: withdrawn ? 'withdrawal_recorded' : 'withdrawal_undone' }); }
  catch (e) { if (isTransitionError(e)) return refusal(e); throw e; }
  const error = moved.error;
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: missingColumn(error) ? 'Withdrawals are not set up yet (run db/listing-applicants-vocabulary.sql).' : 'Could not save that.' } };
  if (withdrawn) {
    const name = await applicantName(admin, junction.application_id);
    await recordEvent(admin, { profileId: userId, listingId: listing.id, applicationId: junction.application_id, type: 'applicant_withdrew', payload: { applicantName: name, listingName: listing.name || listing.address || null, linkId: junction.id } });
    await srem?.(junction.id);
  }
  invalidate?.(userId);
  return { status: 200, body: { ok: true, linkId: junction.id, withdrawnAt, state: moved.stored ? moved.to : null } };
}

// Look again at an applicant who was told no: { linkId, reason } moves not_selected to
// reconsidered, { linkId, undo: true } moves reconsidered back to not_selected. The guard in
// lib/application-state.js allows the first only for a realtor, only while the listing is live,
// only with one of RECONSIDER_REASONS, and only with its audit row written.
// It changes the state and nothing else. Documents are not touched: a file past its 14 days
// stays deleted, and the applicant is asked for it again (pages/api/applicants/request-documents.js).
// The applicant hears about it through a re invite, never a silent change: lib/reconsiderInvite.js,
// sent once the move is stored, never on undo, at most once per applicant per listing. A failed
// send leaves the move standing; the answer says invite.sent false and the card shows it.
// deps.resend is the mailer (null when email is not configured); deps.userEmail the reply to.
export async function reconsiderApplicant(deps, body) {
  const { admin, userId, invalidate } = deps;
  const { linkId, reason } = body || {};
  const undo = (body || {}).undo === true;
  if (!linkId) return { status: 400, body: { error: 'linkId is required.' } };
  if (!undo && !RECONSIDER_REASONS.includes(reason)) return { status: 400, body: { error: 'A reason is required.' } };
  const own = await ownedApplicant(admin, linkId, userId);
  if (!own) return notOwned(own);
  // The whole listing row: the guard reads its state.
  const listing = await ownedListing(admin, own.junction.listing_id, userId);
  if (!listing) return notOwned(listing);
  const to = undo ? APPLICATION_STATE.NOT_SELECTED : APPLICATION_STATE.RECONSIDERED;
  const from = applicationStateOf(own.junction, listing);
  // Standing there already is not a move: refused like any other, never answered as a success.
  if (from === to || (undo && from !== APPLICATION_STATE.RECONSIDERED)) return refusal(new TransitionError('application', from, to));
  let moved;
  // Entering reconsidered also writes the old columns that match it (not withdrawn, not set
  // aside, not marked), in the same update, so the two never disagree.
  try { moved = await transitionApplication(admin, { junction: own.junction, listing, to, patch: undo ? {} : reconsideredOldColumns(deps.now), actor: userId, actorType: ACTOR_TYPE.REALTOR, reason: undo ? RECONSIDER_UNDONE : reason }); }
  catch (e) { if (isTransitionError(e)) return refusal(e); throw e; }
  if (moved.error || !moved.stored) return { status: 503, body: { error: 'That could not be recorded, so nothing was changed.' } };
  invalidate?.(userId);
  if (undo) return { status: 200, body: { ok: true, linkId: own.junction.id, state: moved.to } };
  const invite = await sendReconsiderInvite({ admin, resend: deps.resend || null, linkId: own.junction.id, listing, realtorName: realtorName(deps.profile, { email: deps.userEmail }), realtorEmail: deps.userEmail || null });
  return { status: 200, body: { ok: true, linkId: own.junction.id, state: moved.to, invite } };
}

// The card was opened for the first time: reviewed_at.
export async function markReviewed(deps, body) {
  const { admin, userId, now = new Date() } = deps;
  const { linkId } = body || {};
  if (!linkId) return { status: 400, body: { error: 'linkId is required.' } };
  const own = await ownedApplicant(admin, linkId, userId);
  if (!own) return notOwned(own);
  const at = new Date(now).toISOString();
  const { error } = await admin.from('listing_applicants').update({ reviewed_at: at }).eq('id', own.junction.id);
  if (error && !missingColumn(error)) return { status: 500, body: { error: 'Could not save that.' } };
  return { status: 200, body: { ok: true, reviewedAt: at, skipped: !!error } };
}

// Create a listing: the form's fields only, profile_id from the session.
export async function createListing(deps, body) {
  const { admin, userId, profile, invalidate } = deps;
  const values = pickListingFields(body);
  if (!String(values.address || '').trim()) return { status: 400, body: { error: 'Address is required.' } };
  const board = boardFor(values, profile, null);
  if (board.error) return { status: 400, body: { error: board.error } };
  const row = { ...values, ...board.values, name: str(values.name, 80) || str(values.address, 80), profile_id: userId };
  // The rent share cap defaults to 40 in code (lib/listingForm.js); the column default stays 30.
  if (!(Number(row.pref_rent_to_income_max_pct) > 0)) row.pref_rent_to_income_max_pct = DEFAULT_RENT_SHARE_CAP;
  const { data, error } = await writeListing((v) => admin.from('listings').insert(v).select().single(), row);
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: error.message || 'Could not create the listing.' } };
  await recordEvent(admin, { profileId: userId, listingId: data.id, type: 'listing_created', payload: { listingName: displayLabel(data) || null } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, listing: data } };
}

// Edit a listing: { listingId, ...fields }.
export async function updateListing(deps, body) {
  const { admin, userId, profile, invalidate } = deps;
  const { listingId } = body || {};
  if (!listingId) return { status: 400, body: { error: 'listingId is required.' } };
  const own = await ownedListing(admin, listingId, userId);
  if (!own) return notOwned(own);
  const picked = pickListingFields(body);
  if (!Object.keys(picked).length) return { status: 400, body: { error: 'Nothing to update.' } };
  const board = boardFor(picked, profile, own);
  if (board.error) return { status: 400, body: { error: board.error } };
  const values = { ...picked, ...board.values };
  const { data, error } = await writeListing((v) => admin.from('listings').update(v).eq('id', own.id).select().single(), values);
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: error.message || 'Could not save changes.' } };
  await recordEvent(admin, { profileId: userId, listingId: own.id, type: 'listing_updated', payload: { listingName: displayLabel(data) || null, fields: Object.keys(values) } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, listing: data } };
}

// Delete a listing: closed first through the status helper (the invite link answers rented
// from then on), the pending set cleared, the event recorded WITHOUT listing_id (the events
// row cascades with the listing otherwise), then the delete.
export async function deleteListing(deps, body) {
  const { admin, userId, invalidate, srem, now = new Date() } = deps;
  const { listingId } = body || {};
  if (!listingId) return { status: 400, body: { error: 'listingId is required.' } };
  const own = await ownedListing(admin, listingId, userId);
  if (!own) return notOwned(own);
  let closed;
  try { closed = await transitionListing(admin, { listing: own, to: LISTING_STATE.WITHDRAWN, patch: statusPatch(LEGACY_LISTING_STATUS.CLOSED, { now }) }); }
  catch (e) { if (isTransitionError(e)) return listingRefusal(e); throw e; }
  if (closed.error && !missingColumn(closed.error)) return { status: 500, body: { error: 'Could not close the listing.' } };
  const { data: links } = await admin.from('listing_applicants').select('id').eq('listing_id', own.id);
  // Every held object under the listing goes before the cascade takes the rows (lib/documentStore.js).
  let purged = 0;
  for (const l of links || []) { await srem?.(l.id); try { purged += (await purgeStoredDocuments(admin, { linkId: l.id, deletedBy: 'listing deleted' })).count || 0; } catch (e) { console.error('[deleteListing] purge', e?.message || e); } }
  await recordEvent(admin, { profileId: userId, listingId: null, type: 'listing_updated', payload: { status: LISTING_DELETED, listingName: displayLabel(own) || own.address || null, listingId: own.id } });
  const { error } = await admin.from('listings').delete().eq('id', own.id);
  if (error) return { status: 500, body: { error: 'Could not delete the listing.' } };
  invalidate?.(userId);
  return { status: 200, body: { ok: true, listingId: own.id, purgedDocuments: purged } };
}

// Profile columns that a later migration may not have added yet: dropped and retried once.
const OPTIONAL_PROFILE = ['brand_palette', 'brand_fonts', 'license_number', 'report_signature', 'onboarding_step', 'onboarding_completed_at', ...PROFILE_BOARD_FIELDS];
async function updateOwnProfile(admin, userId, patch) {
  const values = { ...patch };
  const skipped = [];
  for (let attempt = 0; attempt <= OPTIONAL_PROFILE.length; attempt++) {
    const { data, error } = await admin.from('profiles').update(values).eq('id', userId).select().single();
    if (!error) return { data, skipped };
    const absent = OPTIONAL_PROFILE.filter((c) => c in values && String(error.message || '').includes(c));
    if (!missingColumn(error) || !absent.length) return { error };
    for (const c of absent) { delete values[c]; skipped.push(c); }
    if (!Object.keys(values).length) return { data: null, skipped };
  }
  return { error: { message: 'Could not save.' } };
}

// The profile page's fields (and the signing name, and onboarding progress).
export async function updateProfile(deps, body) {
  const { admin, userId } = deps;
  const patch = {};
  for (const k of PROFILE_FIELDS) if (k in (body || {})) patch[k] = body[k] == null ? null : (k === 'province' ? normalizeProvince(body[k]) : k === 'board' ? (BOARD_OPTIONS.some((o) => o.value === body[k]) ? body[k] : null) : str(body[k], 200));
  if (!Object.keys(patch).length) return { status: 400, body: { error: 'Nothing to update.' } };
  const r = await updateOwnProfile(admin, userId, patch);
  if (r.error) return { status: 500, body: { error: r.error.message || 'Could not save.' } };
  return { status: 200, body: { ok: true, profile: r.data, skipped: r.skipped || [] } };
}

// The branding fields. Records branding_updated { what: the keys written }.
export async function updateBranding(deps, body) {
  const { admin, userId } = deps;
  const patch = {};
  const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : null);
  for (const k of BRANDING_FIELDS) {
    if (!(k in (body || {}))) continue;
    const v = body[k];
    if (k === 'brand_color' || k === 'brand_color_secondary') patch[k] = hex(v);
    else if (k === 'logo_url') patch[k] = v == null ? null : str(v, 500);
    else patch[k] = v && typeof v === 'object' ? v : null;
  }
  if (!Object.keys(patch).length) return { status: 400, body: { error: 'Nothing to update.' } };
  const r = await updateOwnProfile(admin, userId, patch);
  if (r.error) return { status: 500, body: { error: r.error.message || 'Could not save.' } };
  await recordEvent(admin, { profileId: userId, type: 'branding_updated', payload: { what: Object.keys(patch).join(', ') } });
  return { status: 200, body: { ok: true, profile: r.data, skipped: r.skipped || [] } };
}
