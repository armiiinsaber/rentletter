// lib/supabaseBridge.js
// Server-ONLY KV→Supabase bridge helpers. Mirror a KV application into the
// canonical Supabase `applications` table (no realtor RLS — service-role only)
// and link it to a listing via `listing_applicants`. Never call from the client.
import { kvAppToRow, OPTIONAL_COLUMNS } from './applicationMap';
import { kvReady, kvMgetJson, appKey } from './docRequest';
import { logServerError } from './serverLog';
import { computeFit } from './fitScore';
import { withLiveScore } from './deriveScorecard';
import { listStoredDocuments, toClientDocument } from './documentStore';
import { DECISION_STATUS } from './listingApplicantsVocabulary';
import { normalizeDocV, hasAnyDocV } from './docVerifications';

// Upsert the application body (match on unique application_number). Returns its id.
export async function upsertApplication(admin, app) {
  const row = kvAppToRow(app);
  const write = (r) => admin.from('applications').upsert(r, { onConflict: 'application_number' }).select('id').single();
  let { data, error } = await write(row);
  // Graceful before db/profile-edits.sql has run: PostgREST reports an unknown column as
  // PGRST204 ("Could not find the '…' column") / Postgres 42703. Retry without the optional
  // columns rather than failing the whole mirror.
  if (error && OPTIONAL_COLUMNS.some((c) => String(error.message || '').includes(c)) ) {
    console.warn('[supabaseBridge] optional columns missing (run db/profile-edits.sql) — retrying without:', OPTIONAL_COLUMNS.join(', '));
    const slim = { ...row };
    for (const c of OPTIONAL_COLUMNS) delete slim[c];
    ({ data, error } = await write(slim));
  }
  if (error) throw error;
  return data.id;
}

// Link an application to a listing. Idempotent: if the link already exists it is
// left untouched (preserving the realtor's decision fields). addedVia: one of ADDED_VIA in
// lib/listingApplicantsVocabulary.js.
export async function linkApplicantToListing(admin, listingId, applicationId, addedVia) {
  const { error } = await admin
    .from('listing_applicants')
    .upsert(
      { listing_id: listingId, application_id: applicationId, added_via: addedVia, decision_status: DECISION_STATUS.NONE },
      { onConflict: 'listing_id,application_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

// Read the applicants for MANY listings in ONE junction select (application body embedded,
// doc_verifications and ai_insight in the same row), grouped by listing in memory. The caller
// hands in the listing rows (rent and pref_* columns) so nothing is selected twice. CALLER MUST
// have already authorized that the realtor owns every listing. owner_token and cover_letter are
// stripped here, at the same point as before, before anything reaches the realtor.
//
// Guarantees EXACTLY ONE applicant per application per listing with a UNIQUE linkId: if the
// same application is linked to the same listing more than once (possible when the DB is
// missing UNIQUE(listing_id, application_id)), the duplicate junction rows are collapsed to one.
//
// Optional columns added by later migrations: doc_verifications and ai_insight (db/doc-intel),
// reviewed_at (db/reviewed-at.sql), withdrawn_at (db/listing-applicants-vocabulary.sql),
// confirmations and last_sent_at (db/screening.sql). Tried all at once; if that fails, each
// column is probed on its own and only the ones the DB has are kept.
//
// Returns { [listingId]: applicants }. Each applicant already carries docVerifications,
// docArchived, aiInsight and fit (attachDocVerifications is the pure mapping step over the rows
// fetched here, run once per applicant), and, with sideData (default), docRequest (one KV mget)
// and storedDocuments (one query) for every applicant across all listings.
const JUNCTION_COLS = 'id, listing_id, application_id, decision_status, decision_priority, decision_notes, decision_reason_code, decision_changed_at, added_via, created_at';
const OPTIONAL_JUNCTION_COLS = ['doc_verifications', 'ai_insight', 'reviewed_at', 'withdrawn_at', 'confirmations', 'last_sent_at'];
export const JUNCTION_SELECT = (present) => `${JUNCTION_COLS}${present.length ? `, ${present.join(', ')}` : ''}, application:applications(*)`;

export async function fetchApplicantsForListings(admin, listingRows, { sideData = true } = {}) {
  const listings = (listingRows || []).filter((l) => l && l.id);
  const byListing = {};
  for (const l of listings) byListing[l.id] = [];
  if (!listings.length) return byListing;
  const ids = listings.map((l) => l.id);
  const q = (present) => admin.from('listing_applicants').select(JUNCTION_SELECT(present)).in('listing_id', ids).order('created_at', { ascending: true });
  let present = OPTIONAL_JUNCTION_COLS;
  let sel = await q(present);
  if (sel.error) {
    present = [];
    for (const col of OPTIONAL_JUNCTION_COLS) {
      const probe = await admin.from('listing_applicants').select(col).in('listing_id', ids).limit(1);
      if (!probe.error) present.push(col);
    }
    sel = await q(present);
  }
  if (sel.error) throw sel.error;
  const hasReviewedAt = present.includes('reviewed_at');
  const rows = sel.data || [];

  // Collapse duplicate junction rows per listing: one per application_id, keeping the richest
  // row (one with analysis or a realtor decision), and never emit a duplicate linkId.
  const seenLink = new Set();
  const byKey = new Map();
  const score = (r) => (hasAnyDocV(r.doc_verifications) ? 2 : 0)
    + (r.decision_status && r.decision_status !== DECISION_STATUS.NONE ? 1 : 0) + (r.withdrawn_at ? 1 : 0);
  for (const r of rows) {
    if (!r || seenLink.has(r.id)) continue;
    seenLink.add(r.id);
    const key = `${r.listing_id}|${r.application_id != null ? `app:${r.application_id}` : `row:${r.id}`}`;
    const prev = byKey.get(key);
    if (!prev || score(r) > score(prev)) byKey.set(key, r);
  }
  const deduped = [...byKey.values()];
  if (deduped.length !== rows.length) console.warn('[supabaseBridge] collapsed %d listing_applicants rows to %d applicants (duplicate junction rows; missing UNIQUE(listing_id, application_id)?)', rows.length, deduped.length);

  const listingById = new Map(listings.map((l) => [String(l.id), l]));
  for (const row of deduped) {
    const liveListing = listingById.get(String(row.listing_id)) || {};
    const app = { ...(row.application || {}) };
    delete app.owner_token; // never expose to the realtor
    delete app.cover_letter; // not needed for review
    const applicant = withLiveScore({
      linkId: row.id,
      decisionStatus: row.decision_status || DECISION_STATUS.NONE,
      decisionPriority: row.decision_priority || null,
      withdrawnAt: row.withdrawn_at || null,
      // The realtor's confirmations and the last report send (db/screening.sql); {} and null before it runs.
      confirmations: row.confirmations && typeof row.confirmations === 'object' ? row.confirmations : {},
      lastSentAt: row.last_sent_at || null,
      decisionNotes: row.decision_notes || '',
      decisionReasonCode: row.decision_reason_code || null,
      decisionChangedAt: row.decision_changed_at || null,
      addedVia: row.added_via || null,
      // Per-applicant reviewed state (db/reviewed-at.sql). reviewTracking=false before the
      // migration → the UI shows no markers rather than flagging everyone.
      reviewedAt: hasReviewedAt ? (row.reviewed_at || null) : null,
      reviewTracking: hasReviewedAt,
      application: app,
    }, liveListing);
    // The live listing and the row's own analysis columns ride along, non enumerable (never
    // serialized): attachDocVerifications maps them and computes Fit.
    Object.defineProperty(applicant, 'fitListing', { value: liveListing, enumerable: false });
    Object.defineProperty(applicant, 'docRow', { value: { id: row.id, application_id: row.application_id, doc_verifications: row.doc_verifications, ai_insight: row.ai_insight }, enumerable: false });
    (byListing[row.listing_id] = byListing[row.listing_id] || []).push(applicant);
  }
  const all = Object.values(byListing).flat();
  mapDocVerifications(all);
  if (sideData) await attachSideData(admin, all);
  return byListing;
}

// Read all applicants for ONE listing: the listing's current rent and pref_* columns (the score
// and the rent share are derived from them at read time, lib/deriveScorecard.js), then the shared
// multi listing read. The caller runs attachDocVerifications next, as before.
export async function fetchListingApplicants(admin, listingId) {
  const { data: listingRow, error } = await admin.from('listings').select('id, profile_id, monthly_rent, pref_rent_to_income_max_pct, pref_min_annual_income, pref_min_years_at_job, pref_requires_landlord_reference, pref_requires_employer_verification').eq('id', listingId).maybeSingle();
  if (error) logServerError('[supabaseBridge] listing read', error, { listingId });
  const live = listingRow || { id: listingId };
  const byListing = await fetchApplicantsForListings(admin, [live], { sideData: false });
  return byListing[listingId] || [];
}

// Attach the realtor-side doc_verifications + ai_insight to each applicant using STRICT two-key
// attribution: an applicant only inherits from the junction row matching BOTH its own linkId
// AND its own application_id, never another row's value. A PURE mapping over the rows already
// fetched (no query). Shared by every read path so attribution is identical. Then the side data
// (document requests, one KV call; held documents, one query) for the list. Mutates + returns.
export async function attachDocVerifications(admin, listingId, applicants) {
  const list = applicants || [];
  mapDocVerifications(list);
  await attachSideData(admin, list);
  return list;
}

function mapDocVerifications(list) {
  for (const a of list) {
    if (a.docVerifications !== undefined && a.aiInsight !== undefined) continue; // already mapped
    const e = a.docRow || null;
    const ownApp = a.application?.id;
    const own = e && String(e.id) === String(a.linkId) && String(e.application_id) === String(ownApp) ? e : null;
    if (e && !own) console.warn('[supabaseBridge] attribution mismatch linkId=%s applicantApp=%s rowApp=%s (ignoring)', a.linkId, ownApp, e.application_id);
    // Normalize the doc_verifications shape (old bare-array OR new {active,archived}). The
    // dashboard consumes docVerifications as a display array, [active] or [], so the existing
    // ApplicantDocIntel logic is unchanged; docArchived carries the archive history.
    const n = normalizeDocV(own?.doc_verifications);
    a.docVerifications = n.active ? [n.active] : [];
    a.docArchived = n.archived;
    a.aiInsight = own?.ai_insight || null;
    attachFit(a, n.active || null);
  }
}

async function attachSideData(admin, list) {
  await Promise.all([attachDocRequests(list), attachStoredDocuments(admin, list)]);
}

// applicant.storedDocuments: the files held for the realtor's review (db/documents.sql), live and
// deleted, without storage paths. null when the table is not set up (the panel then shows no
// documents section), [] when none. One query for the whole list.
async function attachStoredDocuments(admin, list) {
  try {
    const { byLink, absent } = await listStoredDocuments(admin, list.map((a) => a.linkId));
    for (const a of list) a.storedDocuments = absent ? null : (byLink.get(a.linkId) || []).map(toClientDocument);
  } catch (e) {
    console.warn('[documents] read skipped:', e?.message || e);
    for (const a of list) a.storedDocuments = null;
  }
}

// applicant.docRequest: the tenant document request pointer request-documents.js keeps in KV
// ({ status, requestedAt, receivedAt, nudgedAt }), so the card can say "requested" before any report
// exists. One mget for the whole list; null when there is none or KV is not configured.
async function attachDocRequests(list) {
  if (!list.length) return;
  if (!kvReady()) { for (const a of list) if (a.docRequest === undefined) a.docRequest = null; return; }
  try {
    const ptrs = await kvMgetJson(list.map((a) => appKey(a.linkId)));
    list.forEach((a, i) => { const ptr = ptrs[i]; a.docRequest = ptr ? { status: ptr.status || 'requested', requestedAt: ptr.requestedAt || null, receivedAt: ptr.receivedAt || null, nudgedAt: Array.isArray(ptr.nudgedAt) ? ptr.nudgedAt : [] } : null; });
  } catch (e) { for (const a of list) a.docRequest = null; }
}

// application.fit: Fit (lib/fitScore.js) from the live listing carried by the fetch and the
// ACTIVE document report. Computed here, after the report is attached, never stored.
function attachFit(a, activeReport) {
  const listing = a && a.fitListing;
  if (!listing || !a.application) return;
  a.application = { ...a.application, fit: computeFit({ application: a.application, listing, verification: activeReport, confirmations: a.confirmations || {} }) };
}
