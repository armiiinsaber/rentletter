// lib/realtorWrites.js  SERVER ONLY (takes the service role client). The realtor's writes, one
// function per concern, each with the explicit ownership check, the event, the signals cache
// and the pending nudge set. The routes under pages/api are thin: withRealtor, then one of
// these. Every function answers { status, body } and never throws for a bad request.
//
// deps: { admin, userId, profile, invalidate(profileId), srem(linkId), now }
import { ownedApplicant } from './ownApplicant.js';
import { ownedListing, statusPatch } from './listingStatus.js';
import { recordEvent } from './events.js';
import { reasonLabel, SET_ASIDE_REASONS } from './setAsideReasons.js';
import { DECISION_STATUS, DECISION_PRIORITY } from './listingApplicantsVocabulary.js';
import { normalizeProvince } from './provinces.js';

const notOwned = (own) => ({ status: own === null ? 404 : 403, body: { error: own === null ? 'Not found.' : 'Not yours.' } });
const missingColumn = (error) => error && (error.code === '42703' || error.code === 'PGRST204' || /column|schema cache/i.test(String(error.message || '')));
const str = (v, n) => (v == null ? null : String(v).slice(0, n));

// The listing columns the edit form still writes (the ones that survived C2). Anything else in
// the body is dropped, so a client can never set profile_id, status, invite_token or a pref
// column the form no longer has.
export const LISTING_FIELDS = Object.freeze([
  'name', 'address', 'monthly_rent', 'bedrooms', 'allows_pets', 'allows_smoking', 'parking_included',
  'landlord_name', 'landlord_email', 'landlord_phone',
  'pref_min_annual_income', 'pref_rent_to_income_max_pct', 'pref_min_years_at_job',
  'pref_requires_landlord_reference', 'pref_requires_employer_verification', 'pref_notes',
]);
export const PROFILE_FIELDS = Object.freeze(['full_name', 'brokerage', 'phone', 'license_number', 'province', 'report_signature', 'onboarding_step', 'onboarding_completed_at']);
export const BRANDING_FIELDS = Object.freeze(['brand_color', 'brand_color_secondary', 'brand_palette', 'brand_fonts', 'logo_url']);
export const pickListingFields = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => LISTING_FIELDS.includes(k)));

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
  const { error } = await admin.from('listing_applicants').update(patch).eq('id', junction.id);
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: missingColumn(error) ? 'That column is not set up yet.' : 'Could not save your decision.' } };
  const name = await applicantName(admin, junction.application_id);
  const base = { profileId: userId, listingId: listing.id, applicationId: junction.application_id };
  const payload = { applicantName: name, listingName: listing.name || listing.address || null, linkId: junction.id };
  const was = junction.decision_status || DECISION_STATUS.NONE;
  if (status === DECISION_STATUS.REJECT) { await recordEvent(admin, { ...base, type: 'applicant_set_aside', payload: { ...payload, reason: reasonLabel(reasonCode) } }); await srem?.(junction.id); }
  else if (status != null && was === DECISION_STATUS.REJECT && status !== DECISION_STATUS.REJECT) await recordEvent(admin, { ...base, type: 'applicant_restored', payload });
  if (priority != null && priority !== (junction.decision_priority || DECISION_PRIORITY.NORMAL)) await recordEvent(admin, { ...base, type: 'applicant_marked_finalist', payload: { ...payload, removed: priority !== DECISION_PRIORITY.TOP } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, linkId: junction.id, changedAt, patch } };
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
  const { error } = await admin.from('listing_applicants').update({ withdrawn_at: withdrawnAt, decision_reason_code: null, decision_changed_at: new Date(now).toISOString() }).eq('id', junction.id);
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: missingColumn(error) ? 'Withdrawals are not set up yet (run db/listing-applicants-vocabulary.sql).' : 'Could not save that.' } };
  if (withdrawn) {
    const name = await applicantName(admin, junction.application_id);
    await recordEvent(admin, { profileId: userId, listingId: listing.id, applicationId: junction.application_id, type: 'applicant_withdrew', payload: { applicantName: name, listingName: listing.name || listing.address || null, linkId: junction.id } });
    await srem?.(junction.id);
  }
  invalidate?.(userId);
  return { status: 200, body: { ok: true, linkId: junction.id, withdrawnAt } };
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
  const { admin, userId, invalidate } = deps;
  const values = pickListingFields(body);
  if (!String(values.address || '').trim()) return { status: 400, body: { error: 'Address is required.' } };
  const row = { ...values, name: str(values.name, 80) || str(values.address, 80), profile_id: userId };
  const { data, error } = await admin.from('listings').insert(row).select().single();
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: error.message || 'Could not create the listing.' } };
  await recordEvent(admin, { profileId: userId, listingId: data.id, type: 'listing_created', payload: { listingName: data.name || data.address || null } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, listing: data } };
}

// Edit a listing: { listingId, ...fields }.
export async function updateListing(deps, body) {
  const { admin, userId, invalidate } = deps;
  const { listingId } = body || {};
  if (!listingId) return { status: 400, body: { error: 'listingId is required.' } };
  const own = await ownedListing(admin, listingId, userId);
  if (!own) return notOwned(own);
  const values = pickListingFields(body);
  if (!Object.keys(values).length) return { status: 400, body: { error: 'Nothing to update.' } };
  const { data, error } = await admin.from('listings').update(values).eq('id', own.id).select().single();
  if (error) return { status: missingColumn(error) ? 503 : 500, body: { error: error.message || 'Could not save changes.' } };
  await recordEvent(admin, { profileId: userId, listingId: own.id, type: 'listing_updated', payload: { listingName: data.name || data.address || null, fields: Object.keys(values) } });
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
  const closed = await admin.from('listings').update(statusPatch('closed', { now })).eq('id', own.id);
  if (closed.error && !missingColumn(closed.error)) return { status: 500, body: { error: 'Could not close the listing.' } };
  const { data: links } = await admin.from('listing_applicants').select('id').eq('listing_id', own.id);
  for (const l of links || []) await srem?.(l.id);
  await recordEvent(admin, { profileId: userId, listingId: null, type: 'listing_updated', payload: { status: 'deleted', listingName: own.name || own.address || null, listingId: own.id } });
  const { error } = await admin.from('listings').delete().eq('id', own.id);
  if (error) return { status: 500, body: { error: 'Could not delete the listing.' } };
  invalidate?.(userId);
  return { status: 200, body: { ok: true, listingId: own.id } };
}

// Profile columns that a later migration may not have added yet: dropped and retried once.
const OPTIONAL_PROFILE = ['brand_palette', 'brand_fonts', 'license_number', 'report_signature', 'onboarding_step', 'onboarding_completed_at'];
async function updateOwnProfile(admin, userId, patch) {
  const values = { ...patch };
  const skipped = [];
  for (let attempt = 0; attempt < 2; attempt++) {
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
  for (const k of PROFILE_FIELDS) if (k in (body || {})) patch[k] = body[k] == null ? null : (k === 'province' ? normalizeProvince(body[k]) : str(body[k], 200));
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
