// lib/supabaseBridge.js
// Server-ONLY KV→Supabase bridge helpers. Mirror a KV application into the
// canonical Supabase `applications` table (no realtor RLS — service-role only)
// and link it to a listing via `listing_applicants`. Never call from the client.
import { kvAppToRow } from './applicationMap';

// Upsert the application body (match on unique application_number). Returns its id.
export async function upsertApplication(admin, app) {
  const row = kvAppToRow(app);
  const { data, error } = await admin
    .from('applications')
    .upsert(row, { onConflict: 'application_number' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// Link an application to a listing. Idempotent: if the link already exists it is
// left untouched (preserving the realtor's decision fields). added_via: 'invite' | 'lookup'.
export async function linkApplicantToListing(admin, listingId, applicationId, addedVia) {
  const { error } = await admin
    .from('listing_applicants')
    .upsert(
      { listing_id: listingId, application_id: applicationId, added_via: addedVia, decision_status: 'none' },
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
  // Prefer selecting doc_verifications so de-dup can KEEP the junction row that actually holds
  // the analysis; fall back gracefully if that column doesn't exist yet.
  let sel = await admin.from('listing_applicants')
    .select(`${COLS}, doc_verifications, application:applications(*)`)
    .eq('listing_id', listingId).order('created_at', { ascending: true });
  if (sel.error) {
    sel = await admin.from('listing_applicants')
      .select(`${COLS}, application:applications(*)`)
      .eq('listing_id', listingId).order('created_at', { ascending: true });
  }
  if (sel.error) throw sel.error;
  const rows = sel.data || [];

  // Collapse duplicate junction rows → one per application_id, keeping the richest row (one
  // with analysis or a realtor decision), and never emit a duplicate linkId.
  const seenLink = new Set();
  const byApp = new Map();
  const score = (r) => (Array.isArray(r.doc_verifications) && r.doc_verifications.length ? 2 : 0)
    + (r.decision_status && r.decision_status !== 'none' ? 1 : 0);
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
    return {
      linkId: row.id,
      decisionStatus: row.decision_status || 'none',
      decisionPriority: row.decision_priority || null,
      decisionNotes: row.decision_notes || '',
      decisionReasonCode: row.decision_reason_code || null,
      decisionChangedAt: row.decision_changed_at || null,
      addedVia: row.added_via || null,
      application: app,
    };
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
      a.docVerifications = own?.doc_verifications || null;
      a.aiInsight = own?.ai_insight || null;
      console.log('[verif-trace][%s] linkId=%s app_id=%s ownDocVerif=%s', ctxLabel, a.linkId, ownApp, a.docVerifications != null);
    }
  } catch (e) {
    console.warn('[verif-trace][%s] doc_verifications read skipped: %s', ctxLabel, e?.message || e);
    for (const a of list) { if (a.docVerifications === undefined) a.docVerifications = null; if (a.aiInsight === undefined) a.aiInsight = null; }
  }
  return list;
}
