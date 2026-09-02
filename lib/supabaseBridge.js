// lib/supabaseBridge.js
// Server-ONLY KV→Supabase bridge helpers. Mirror a KV application into the
// canonical Supabase `applications` table (no realtor RLS — service-role only)
// and link it to a listing via `listing_applicants`. Never call from the client.
import { kvAppToRow, OPTIONAL_COLUMNS } from './applicationMap';
import { kvReady, kvGetJson, appKey } from './docRequest';
import { computeFit } from './fitScore';
import { withLiveScore } from './deriveScorecard';
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

// Read all applicants for a listing (junction + joined application body) using the
// admin client. CALLER MUST have already authorized that the realtor owns the
// listing. owner_token (and the cover letter) are stripped before returning.
//
// Guarantees EXACTLY ONE applicant per application with a UNIQUE linkId: if the same
// application is linked to the same listing more than once (possible when the DB is missing
// UNIQUE(listing_id, application_id)), the duplicate junction rows are collapsed to one — so a
// downstream read can never see two applicants sharing/cross-mapping a linkId.
export async function fetchListingApplicants(admin, listingId) {
  const COLS = 'id, application_id, decision_status, decision_priority, decision_notes, decision_reason_code, decision_changed_at, added_via, created_at';
  // Optional columns added by later migrations: doc_verifications (so de-dup can KEEP the
  // junction row holding the analysis), reviewed_at (db/reviewed-at.sql) and withdrawn_at
  // (db/listing-applicants-vocabulary.sql). Tried all at once; if that fails, each column is
  // probed on its own and only the ones the DB has are kept.
  const OPTIONAL = ['doc_verifications', 'reviewed_at', 'withdrawn_at'];
  const q = (extra) => admin.from('listing_applicants')
    .select(`${COLS}${extra.length ? `, ${extra.join(', ')}` : ''}, application:applications(*)`)
    .eq('listing_id', listingId).order('created_at', { ascending: true });
  let present = OPTIONAL;
  let sel = await q(present);
  if (sel.error) {
    present = [];
    for (const col of OPTIONAL) {
      const probe = await admin.from('listing_applicants').select(col).eq('listing_id', listingId).limit(1);
      if (!probe.error) present.push(col);
    }
    sel = await q(present);
  }
  if (sel.error) throw sel.error;
  const hasReviewedAt = present.includes('reviewed_at');
  const rows = sel.data || [];
  // The listing's CURRENT rent: the score and the rent share are derived from it at read time
  // (lib/deriveScorecard.js), so an edited rent shows up everywhere without a recompute hook.
  const { data: listingRow } = await admin.from('listings').select('monthly_rent, pref_rent_to_income_max_pct, pref_min_annual_income, pref_min_years_at_job, pref_requires_landlord_reference, pref_requires_employer_verification').eq('id', listingId).maybeSingle();
  const liveListing = listingRow || {};

  // Collapse duplicate junction rows → one per application_id, keeping the richest row (one
  // with analysis or a realtor decision), and never emit a duplicate linkId.
  const seenLink = new Set();
  const byApp = new Map();
  const score = (r) => (hasAnyDocV(r.doc_verifications) ? 2 : 0)
    + (r.decision_status && r.decision_status !== DECISION_STATUS.NONE ? 1 : 0) + (r.withdrawn_at ? 1 : 0);
  for (const r of rows) {
    if (!r || seenLink.has(r.id)) continue; // never emit a duplicate linkId
    seenLink.add(r.id);
    const key = r.application_id != null ? `app:${r.application_id}` : `row:${r.id}`;
    const prev = byApp.get(key);
    if (!prev || score(r) > score(prev)) byApp.set(key, r);
  }
  const deduped = [...byApp.values()];
  if (deduped.length !== rows.length) {
    console.warn('[verif-trace][fetch] listing=%s collapsed %d listing_applicants rows -> %d applicants (duplicate junction rows — missing UNIQUE(listing_id, application_id)?)',
      listingId, rows.length, deduped.length);
  }

  return deduped.map((row) => {
    const app = { ...(row.application || {}) };
    delete app.owner_token; // never expose to the realtor
    delete app.cover_letter; // not needed for review
    const applicant = withLiveScore({
      linkId: row.id,
      decisionStatus: row.decision_status || DECISION_STATUS.NONE,
      decisionPriority: row.decision_priority || null,
      withdrawnAt: row.withdrawn_at || null,
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
    // The live listing rides along, non enumerable (never serialized), so attachDocVerifications
    // can compute Fit once the document report is known.
    Object.defineProperty(applicant, 'fitListing', { value: liveListing, enumerable: false });
    return applicant;
  });
}

// Attach the realtor-side doc_verifications + ai_insight to each applicant using STRICT
// two-key attribution: an applicant only inherits from the listing_applicants row matching
// BOTH its own linkId AND its own application_id — never another row's value. Shared by every
// read path (dashboard, applicants refresh, landlord report) so attribution is identical.
// Mutates + returns the applicants. Graceful if the columns don't exist yet.
export async function attachDocVerifications(admin, listingId, applicants, ctxLabel = 'read') {
  const list = applicants || [];
  try {
    const { data: extras, error } = await admin
      .from('listing_applicants').select('id, application_id, doc_verifications, ai_insight').eq('listing_id', listingId);
    if (error) throw error;
    const rows = Array.isArray(extras) ? extras : [];
    const m = new Map(rows.map((e) => [e.id, e]));
    console.log('[verif-trace][%s] listing=%s extras=%j', ctxLabel, listingId,
      rows.map((e) => ({ id: e.id, application_id: e.application_id, hasDocVerif: e.doc_verifications != null })));
    for (const a of list) {
      const e = m.get(a.linkId);
      const ownApp = a.application?.id;
      const own = e && String(e.application_id) === String(ownApp) ? e : null;
      if (e && !own) console.warn('[verif-trace][%s] ATTRIBUTION MISMATCH linkId=%s applicantApp=%s rowApp=%s (ignoring)', ctxLabel, a.linkId, ownApp, e.application_id);
      // Normalize the doc_verifications shape (old bare-array OR new {active,archived}). The
      // dashboard consumes docVerifications as a display array — [active] or [] — so the existing
      // ApplicantDocIntel logic is unchanged; docArchived carries the archive history.
      const n = normalizeDocV(own?.doc_verifications);
      a.docVerifications = n.active ? [n.active] : [];
      a.docArchived = n.archived;
      a.aiInsight = own?.ai_insight || null;
      attachFit(a, n.active || null);
      console.log('[verif-trace][%s] linkId=%s app_id=%s ownActive=%s archived=%d', ctxLabel, a.linkId, ownApp, !!n.active, n.archived.length);
    }
    await attachDocRequests(list);
  } catch (e) {
    console.warn('[verif-trace][%s] doc_verifications read skipped: %s', ctxLabel, e?.message || e);
    for (const a of list) { if (a.docVerifications === undefined) a.docVerifications = []; if (a.docArchived === undefined) a.docArchived = []; if (a.aiInsight === undefined) a.aiInsight = null; attachFit(a, null); }
  }
  return list;
}

// applicant.docRequest: the tenant document request pointer request-documents.js keeps in KV
// ({ status, requestedAt, receivedAt }), so the card can say "requested" before any report
// exists. Best effort, in parallel, null when there is none or KV is not configured.
async function attachDocRequests(list) {
  if (!kvReady()) { for (const a of list) if (a.docRequest === undefined) a.docRequest = null; return; }
  await Promise.all(list.map(async (a) => {
    try { const ptr = await kvGetJson(appKey(a.linkId)); a.docRequest = ptr ? { status: ptr.status || 'requested', requestedAt: ptr.requestedAt || null, receivedAt: ptr.receivedAt || null } : null; }
    catch (e) { a.docRequest = null; }
  }));
}

// application.fit: Fit (lib/fitScore.js) from the live listing carried by fetchListingApplicants
// and the ACTIVE document report. Computed here, after the report is attached, never stored.
function attachFit(a, activeReport) {
  const listing = a && a.fitListing;
  if (!listing || !a.application) return;
  a.application = { ...a.application, fit: computeFit({ application: a.application, listing, verification: activeReport }) };
}
