// lib/events.js  SERVER ONLY (takes the service role client). The one way an event is written.
// recordEvent never throws into the calling path: a failed write is logged and the action that
// triggered it carries on. There is no update or delete anywhere: events are append only.
import { EVENT_TYPES } from './eventTypes.js';

const clean = (payload) => {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v == null) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
};

// { profileId, listingId?, applicationId?, type, payload? } -> true when written, false otherwise.
export async function recordEvent(admin, ev) {
  try {
    if (!admin || !ev || !ev.profileId || !EVENT_TYPES.includes(ev.type)) return false;
    const row = { profile_id: ev.profileId, listing_id: ev.listingId || null, application_id: ev.applicationId || null, type: ev.type, payload: clean(ev.payload) };
    const { error } = await admin.from('events').insert(row);
    if (error) { console.warn('[events] not recorded:', ev.type, error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[events] not recorded:', ev && ev.type, e && e.message ? e.message : e);
    return false;
  }
}

// For paths that know a listing but not its owner (tenant routes, referrals): resolve the
// realtor and the display names, then record. Never throws.
export async function recordForListing(admin, listingId, type, { applicationId = null, linkId = null, payload = {} } = {}) {
  try {
    if (!admin || !listingId) return false;
    const { data: listing } = await admin.from('listings').select('id, profile_id, name, address').eq('id', listingId).maybeSingle();
    if (!listing || !listing.profile_id) return false;
    let applicantName = payload.applicantName || null;
    if (!applicantName && applicationId) {
      const { data: app } = await admin.from('applications').select('full_name').eq('id', applicationId).maybeSingle();
      applicantName = app && app.full_name ? app.full_name : null;
    }
    return recordEvent(admin, { profileId: listing.profile_id, listingId: listing.id, applicationId, type, payload: { ...payload, listingName: listing.name || listing.address || null, applicantName, linkId } });
  } catch (e) {
    console.warn('[events] not recorded:', type, e && e.message ? e.message : e);
    return false;
  }
}

// A tenant edited their application. For every listing where that applicant already has an
// analyzed document report, the listing's realtor gets profile_edited_after_verification.
export async function recordProfileEditEvents(admin, applicationNumber, hasDocuments) {
  try {
    if (!admin || !applicationNumber) return 0;
    const { data: app } = await admin.from('applications').select('id, full_name').eq('application_number', applicationNumber).maybeSingle();
    if (!app) return 0;
    const { data: links } = await admin.from('listing_applicants').select('id, listing_id, doc_verifications').eq('application_id', app.id);
    let n = 0;
    for (const l of links || []) {
      if (!hasDocuments(l.doc_verifications)) continue;
      if (await recordForListing(admin, l.listing_id, 'profile_edited_after_verification', { applicationId: app.id, linkId: l.id, payload: { applicantName: app.full_name } })) n++;
    }
    return n;
  } catch (e) {
    console.warn('[events] profile edit events skipped:', e && e.message ? e.message : e);
    return 0;
  }
}
