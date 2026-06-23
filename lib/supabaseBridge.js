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
export async function fetchListingApplicants(admin, listingId) {
  const { data, error } = await admin
    .from('listing_applicants')
    .select(
      'id, decision_status, decision_priority, decision_notes, decision_reason_code, decision_changed_at, added_via, created_at, application:applications(*)'
    )
    .eq('listing_id', listingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => {
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
