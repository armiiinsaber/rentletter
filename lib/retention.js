// lib/retention.js  SERVER ONLY (takes the service role client).
// Twelve month retention for applications: the rows whose created_at is older than twelve
// months, their listing_applicants junction rows, and the scorecard (a column on the
// application row, so it goes with it). Dry run by default: counts and the oldest ten
// application numbers are logged and nothing is deleted. RETENTION_ENFORCE=true deletes in
// batches of 100 and records one retention_run event with the count. Held documents should be
// gone by then (lib/documentStore.js expiry); any still live under those junction rows are
// counted and logged, never silently dropped.
// Second selection (dry run only, logged, nothing deleted): applications whose every junction
// row sits on a rented or closed listing closed more than 90 days ago, minus any applicant with
// a consented, non expired pipeline_consents row (they asked to be kept in mind). Tolerates the
// listing status columns and the consents table being absent (db/listing-status.sql not run).
import { recordEvent } from './events.js';
import { logServerError } from './serverLog.js';

export const RETENTION_MONTHS = 12;
export const CLOSED_LISTING_DAYS = 90;
const BATCH = 100;
const MAX_BATCHES = 50;

// The cutoff: now minus twelve months, as an ISO string for the created_at comparison.
export function retentionCutoff(now = new Date()) {
  const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS); return d.toISOString();
}

// One batch of expired applications, oldest first: { id, application_number, created_at }.
export async function selectExpired(admin, cutoff, limit = BATCH) {
  const { data, error } = await admin.from('applications').select('id, application_number, created_at').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  return data || [];
}

// The closed listing selection: application ids that would fall under the 90 day rule.
//   selectClosedListingApplications(admin, now) -> { applications: [ids], listings: n, skipped: 'reason' | null }
export async function selectClosedListingApplications(admin, now = new Date()) {
  const cutoff = new Date(new Date(now).getTime() - CLOSED_LISTING_DAYS * 86400000).toISOString();
  const absent = (e) => e && (e.code === '42703' || e.code === '42P01' || /status|closed_at|pipeline_consents/.test(String(e.message || '')));
  const { data: listings, error: lErr } = await admin.from('listings').select('id, status, closed_at').in('status', ['rented', 'closed']).lt('closed_at', cutoff);
  if (lErr) { if (absent(lErr)) return { applications: [], listings: 0, skipped: 'listing status columns absent' }; throw lErr; }
  const closedIds = new Set((listings || []).map((l) => l.id));
  if (!closedIds.size) return { applications: [], listings: 0, skipped: null };
  const { data: onClosed, error: jErr } = await admin.from('listing_applicants').select('application_id, listing_id').in('listing_id', [...closedIds]);
  if (jErr) throw jErr;
  const appIds = [...new Set((onClosed || []).map((j) => j.application_id))];
  if (!appIds.length) return { applications: [], listings: closedIds.size, skipped: null };
  // Every junction row of the application must be on a closed listing: one live listing keeps it.
  const { data: allRows, error: aErr } = await admin.from('listing_applicants').select('application_id, listing_id').in('application_id', appIds);
  if (aErr) throw aErr;
  const keep = new Set();
  for (const j of allRows || []) if (!closedIds.has(j.listing_id)) keep.add(j.application_id);
  let candidates = appIds.filter((id) => !keep.has(id));
  if (candidates.length) {
    const { data: consents, error: cErr } = await admin.from('pipeline_consents').select('application_id, status, expires_at').in('application_id', candidates).eq('status', 'consented');
    if (cErr) { if (!absent(cErr)) throw cErr; }
    else {
      const nowT = new Date(now).getTime();
      const consented = new Set((consents || []).filter((c) => c.application_id && (!c.expires_at || new Date(c.expires_at).getTime() >= nowT)).map((c) => c.application_id));
      candidates = candidates.filter((id) => !consented.has(id));
    }
  }
  return { applications: candidates, listings: closedIds.size, skipped: null };
}

// runRetention(admin, { enforce, now, log }) -> { cutoff, enforce, applications, junctions, heldDocuments, deleted, oldest }
export async function runRetention(admin, { enforce = false, now = new Date(), log = console.log, profileIdForEvent = null } = {}) {
  const cutoff = retentionCutoff(now);
  const out = { cutoff, enforce, applications: 0, junctions: 0, heldDocuments: 0, deleted: 0, oldest: [], closedListingApplications: 0, closedListings: 0 };
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await selectExpired(admin, cutoff);
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const { data: junctions, error: jErr } = await admin.from('listing_applicants').select('id, listing_id').in('application_id', ids);
    if (jErr) throw jErr;
    const jIds = (junctions || []).map((j) => j.id);
    let held = 0;
    if (jIds.length) {
      const { data: docs, error: dErr } = await admin.from('applicant_documents').select('id').in('listing_applicant_id', jIds).is('deleted_at', null);
      if (dErr && dErr.code !== '42P01' && !/applicant_documents/.test(String(dErr.message || ''))) throw dErr;
      held = (docs || []).length;
    }
    out.applications += rows.length; out.junctions += jIds.length; out.heldDocuments += held;
    if (out.oldest.length < 10) out.oldest.push(...rows.slice(0, 10 - out.oldest.length).map((r) => `${r.application_number} (${String(r.created_at).slice(0, 10)})`));
    if (!enforce) break; // dry run: one batch is enough to report the shape; counts are of the first hundred
    if (held) log(`[retention] ${held} held document rows still live under expired applicants; they are left for the documents expiry and logged here`);
    if (jIds.length) { const { error } = await admin.from('listing_applicants').delete().in('id', jIds); if (error) throw error; }
    { const { error } = await admin.from('applications').delete().in('id', ids); if (error) throw error; }
    out.deleted += rows.length;
    if (rows.length < BATCH) break;
  }
  // The closed listing selection is reported alongside; nothing is deleted under it yet.
  try { const c = await selectClosedListingApplications(admin, now); out.closedListingApplications = c.applications.length; out.closedListings = c.listings; if (c.skipped) log(`[retention] closed listing selection skipped: ${c.skipped}`); } catch (e) { logServerError('[retention] closed listing selection', e); }
  log(`[retention] ${enforce ? 'ENFORCE' : 'DRY RUN'} cutoff=${cutoff} applications=${out.applications} junctions=${out.junctions} heldDocuments=${out.heldDocuments} deleted=${out.deleted} closedListingApplications=${out.closedListingApplications} closedListings=${out.closedListings} (${CLOSED_LISTING_DAYS} days, dry run only) oldest=${JSON.stringify(out.oldest)}`);
  if (enforce && out.deleted > 0) {
    try { await recordEvent(admin, { profileId: profileIdForEvent, type: 'retention_run', payload: { count: out.deleted, cutoff } }); } catch (e) { logServerError('[retention] event', e); }
  }
  return out;
}
