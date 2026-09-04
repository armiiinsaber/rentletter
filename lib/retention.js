// lib/retention.js  SERVER ONLY (takes the service role client).
// Twelve month retention for applications: the rows whose created_at is older than twelve
// months, their listing_applicants junction rows, and the scorecard (a column on the
// application row, so it goes with it). Dry run by default: counts and the oldest ten
// application numbers are logged and nothing is deleted. RETENTION_ENFORCE=true deletes in
// batches of 100 and records one retention_run event with the count. Held documents should be
// gone by then (lib/documentStore.js expiry); any still live under those junction rows are
// counted and logged, never silently dropped.
import { recordEvent } from './events.js';
import { logServerError } from './serverLog.js';

export const RETENTION_MONTHS = 12;
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

// runRetention(admin, { enforce, now, log }) -> { cutoff, enforce, applications, junctions, heldDocuments, deleted, oldest }
export async function runRetention(admin, { enforce = false, now = new Date(), log = console.log, profileIdForEvent = null } = {}) {
  const cutoff = retentionCutoff(now);
  const out = { cutoff, enforce, applications: 0, junctions: 0, heldDocuments: 0, deleted: 0, oldest: [] };
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
  log(`[retention] ${enforce ? 'ENFORCE' : 'DRY RUN'} cutoff=${cutoff} applications=${out.applications} junctions=${out.junctions} heldDocuments=${out.heldDocuments} deleted=${out.deleted} oldest=${JSON.stringify(out.oldest)}`);
  if (enforce && out.deleted > 0) {
    try { await recordEvent(admin, { profileId: profileIdForEvent, type: 'retention_run', payload: { count: out.deleted, cutoff } }); } catch (e) { logServerError('[retention] event', e); }
  }
  return out;
}
