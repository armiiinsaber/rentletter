// lib/listingArchive.js
// Archive, restore and delete listings, for the realtor who owns them (db/025-listing-archive.sql;
// pages/api/listings/archive.js and pages/api/listings/remove.js).
//   deleteCheck(applications)  PURE. The one check that decides whether a listing can be deleted:
//                              only when none of its applications is real. An application from a
//                              +test address (name+test@, name+test2@) is a test, never a real one,
//                              and an application with no email is real.
//   archiveListings(deps, body) { listingIds, archived } sets or clears listings.archived_at.
//                              Nothing else is touched: applications, shares, events and reports stay
//                              as they are and stay readable. Before db/025 has run it answers 503
//                              with available: false and writes nothing.
//   removeListings(deps, body) { listingIds } deletes each listing the check allows, with its test
//                              applications, through the one delete there is (lib/realtorWrites.js
//                              deleteListing: its documents purged, the event recorded). A listing
//                              with a real application is skipped and counted; one listing alone
//                              that cannot be deleted answers 409 with the line that says why.
//   archivedByInvite(admin, token) whether the listing behind an apply link is archived; false
//                              before db/025 has run or on any error, so the form shows as before.
//   archivedById(admin, id)    the same, for a listing a realtor names by its id.
//   inviteArchived(token)      the same as archivedByInvite, for a public route that holds no
//                              client: the service role client is made here, when there is one.
//   ARCHIVED_REFUSAL           what every route that creates an application answers for an
//                              archived listing, before anything is written, mailed or recorded:
//                              409 with the one line the apply page shows. The routes: generate,
//                              invite/tag, applications/mirror, listings/add-applicant and
//                              referrals/assign.
// Every write is the caller's after the session and the entitlement (lib/realtorRoute.js withRealtor),
// and here an explicit ownership check on EVERY listing id in the request: one listing that is not the
// realtor's, or not there, fails the whole request and nothing is written.
import { deleteListing } from './realtorWrites.js';
import { ownedListing } from './listingStatus.js';
import { recordEvent } from './events.js';
import { displayLabel } from './listingAddress.js';

// The rule itself is pure and shared with the screen (lib/listingArchiveRule.js), so the dashboard
// says before a delete what the route will say: one check, in one place.
export { TEST_ADDRESS, isTestApplication, NOT_DELETABLE_LINE, deleteCheck, archiveAvailable, isArchived, skippedLine, ARCHIVED_LINE, ARCHIVED_CODE } from './listingArchiveRule.js';
import { deleteCheck, archiveAvailable, NOT_DELETABLE_LINE, skippedLine, ARCHIVED_LINE, ARCHIVED_CODE } from './listingArchiveRule.js';
export const ARCHIVED_REFUSAL = Object.freeze({ status: 409, body: Object.freeze({ error: ARCHIVED_LINE, code: ARCHIVED_CODE }) });
export const MAX_IDS = 100;

const absentColumn = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /archived_at/.test(String(error.message || '')));

// The ids of the request: strings, each once, between 1 and MAX_IDS.
export function listingIdsFrom(body) {
  const raw = body && Array.isArray(body.listingIds) ? body.listingIds : body && body.listingId ? [body.listingId] : null;
  if (!raw || !raw.length || raw.length > MAX_IDS) return null;
  const ids = [...new Set(raw.map((x) => String(x == null ? '' : x).trim()))];
  return ids.every((x) => x && x.length <= 64) ? ids : null;
}

// Every id the realtor's own, each through the one ownership check for a listing (lib/listingStatus.js
// ownedListing: the row read through the service role must carry profile_id === userId):
// { listings } or { status, body } for the first that is not there (404) or not theirs (403).
export async function ownedListings(admin, ids, userId) {
  const listings = [];
  for (const id of ids) {
    const own = await ownedListing(admin, id, userId);
    if (own === null) return { status: 404, body: { error: 'Listing not found.' } };
    if (own === false) return { status: 403, body: { error: 'Not your listing.' } };
    listings.push(own);
  }
  return { listings };
}

// The applications on each listing, each with its email: { [listingId]: [{ linkId, applicationId, email }] }.
async function applicationsOn(admin, ids) {
  const { data: links, error } = await admin.from('listing_applicants').select('id, listing_id, application_id').in('listing_id', ids);
  if (error) throw error;
  const appIds = [...new Set((links || []).map((k) => k.application_id).filter(Boolean).map(String))];
  const emails = new Map();
  if (appIds.length) {
    const { data: apps, error: aErr } = await admin.from('applications').select('id, email').in('id', appIds);
    if (aErr) throw aErr;
    for (const a of apps || []) emails.set(String(a.id), a.email || '');
  }
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  for (const k of links || []) (out[String(k.listing_id)] = out[String(k.listing_id)] || []).push({ linkId: k.id, applicationId: k.application_id, email: k.application_id != null ? (emails.get(String(k.application_id)) ?? '') : '' });
  return out;
}

export async function archiveListings(deps, body) {
  const { admin, userId, invalidate, now = new Date() } = deps;
  const ids = listingIdsFrom(body);
  if (!ids || typeof (body || {}).archived !== 'boolean') return { status: 400, body: { error: 'listingIds and archived (true or false) are required.' } };
  const own = await ownedListings(admin, ids, userId);
  if (!own.listings) return own;
  if (!archiveAvailable(own.listings)) return { status: 503, body: { error: 'Archive is not set up yet.', available: false } };
  const at = body.archived ? new Date(now).toISOString() : null;
  const { error } = await admin.from('listings').update({ archived_at: at }).in('id', ids).eq('profile_id', userId);
  if (error) { if (absentColumn(error)) return { status: 503, body: { error: 'Archive is not set up yet.', available: false } }; throw error; }
  for (const l of own.listings) await recordEvent(admin, { profileId: userId, listingId: l.id, type: 'listing_updated', payload: { archived: !!body.archived, listingName: displayLabel(l) || l.name || null } });
  invalidate?.(userId);
  return { status: 200, body: { ok: true, archived: !!body.archived, archivedAt: at, listingIds: ids } };
}

export async function removeListings(deps, body) {
  const { admin, userId } = deps;
  const ids = listingIdsFrom(body);
  if (!ids) return { status: 400, body: { error: 'listingIds is required.' } };
  const own = await ownedListings(admin, ids, userId);
  if (!own.listings) return own;
  const apps = await applicationsOn(admin, ids);
  const checks = Object.fromEntries(ids.map((id) => [id, deleteCheck(apps[id])]));
  const allowed = ids.filter((id) => checks[id].deletable);
  const skipped = ids.filter((id) => !checks[id].deletable);
  // One listing on its own that cannot go: said, and nothing written.
  if (ids.length === 1 && skipped.length === 1) return { status: 409, body: { error: NOT_DELETABLE_LINE, deleted: [], skipped: 1, skippedIds: skipped } };
  const deleted = []; const failed = [];
  for (const id of allowed) {
    const r = await deleteListing(deps, { listingId: id });
    if (r.status !== 200) { failed.push(id); continue; }
    deleted.push(id);
    // Its applicant rows: the database cascades them with the listing; said here as well, so the
    // check below reads the same wherever it runs.
    await admin.from('listing_applicants').delete().eq('listing_id', id);
    // Its test applications go with it, each once no other listing holds it.
    for (const a of apps[id]) {
      if (!a.applicationId) continue;
      const { data: still } = await admin.from('listing_applicants').select('id').eq('application_id', a.applicationId);
      if ((still || []).length) continue;
      const { error } = await admin.from('applications').delete().eq('id', a.applicationId);
      if (error) console.warn('[listings/remove] a test application stayed:', error.message);
    }
  }
  return { status: 200, body: { ok: true, deleted, skipped: skipped.length, skippedIds: skipped, failed, line: skippedLine(skipped.length) } };
}

export async function archivedByInvite(admin, token) {
  if (!admin || !token) return false;
  try {
    const { data, error } = await admin.from('listings').select('id, archived_at').eq('invite_token', String(token)).maybeSingle();
    if (error || !data) return false;
    return !!data.archived_at;
  } catch (e) { return false; }
}

export async function archivedById(admin, listingId) {
  if (!admin || !listingId) return false;
  try {
    const { data, error } = await admin.from('listings').select('id, archived_at').eq('id', String(listingId)).maybeSingle();
    if (error || !data) return false;
    return !!data.archived_at;
  } catch (e) { return false; }
}

export async function inviteArchived(token) {
  if (!/^[a-f0-9]{20}$/.test(String(token || ''))) return false;
  try {
    const { isSupabaseConfigured } = await import('./supabase/server.js');
    if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
    const { getSupabaseAdminClient } = await import('./supabase/admin.js');
    return await archivedByInvite(getSupabaseAdminClient(), token);
  } catch (e) { return false; }
}
