// lib/retention.js  SERVER ONLY (takes the service role client).
// The retention rule is the policy's (pages/privacy.js, section 7): an application is deleted
// twelve months after its LAST ACTIVITY, and never while any of its junction rows belongs to an
// active listing. Last activity is the latest of the application's created_at and
// profile_updated_at, each junction row's created_at, reviewed_at, last_sent_at and confirmation
// timestamps, and each held document's uploaded_at under those rows.
// Dry run by default: the counts and the oldest ten application numbers are logged and nothing
// is deleted. RETENTION_ENFORCE=true deletes in batches of 100. Every run, dry or enforce, is
// recorded in retention_runs (db/retention-runs.sql, service role only); the table being absent
// is logged once and skipped. Held documents should be gone by then (lib/documentStore.js
// expiry); any still live under those junction rows are counted and logged, never dropped silently.
import { logServerError } from './serverLog.js';
import { listingOpen } from './listingState.js';

export const RETENTION_MONTHS = 12;
const BATCH = 100;
const MAX_BATCHES = 50;
let runsAbsentLogged = false;

// The cutoff: now minus twelve months, as an ISO string.
export function retentionCutoff(now = new Date()) {
  const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS); return d.toISOString();
}

const tsOf = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const latest = (...vals) => vals.reduce((m, v) => { const t = tsOf(v); return t != null && (m == null || t > m) ? t : m; }, null);

// lastActivity(application, junctions, documents) -> ISO string or null
//   junctions: the application's listing_applicants rows ({ created_at, reviewed_at, last_sent_at, confirmations })
//   documents: applicant_documents rows under those junctions ({ uploaded_at })
export function lastActivity(application, junctions = [], documents = []) {
  const a = application || {};
  let m = latest(a.created_at, a.profile_updated_at);
  for (const j of junctions || []) {
    m = latest(m == null ? null : new Date(m).toISOString(), j && j.created_at, j && j.reviewed_at, j && j.last_sent_at);
    const c = j && j.confirmations && typeof j.confirmations === 'object' ? j.confirmations : {};
    for (const k of Object.keys(c)) if (c[k] && typeof c[k] === 'object') m = latest(m == null ? null : new Date(m).toISOString(), c[k].at);
  }
  for (const d of documents || []) m = latest(m == null ? null : new Date(m).toISOString(), d && d.uploaded_at);
  return m == null ? null : new Date(m).toISOString();
}

const absentTable = (e) => e && (e.code === '42P01' || /does not exist|could not find/i.test(String(e.message || '')));

// One batch of expired applications, oldest first, each with its junction rows and last activity:
// [{ id, application_number, created_at, lastActivity, junctionIds, heldDocuments }]. Candidates
// are read by created_at (last activity is never earlier), then kept only when the last activity
// is before the cutoff and no junction row sits on an active listing.
export async function selectExpired(admin, cutoff, { limit = BATCH } = {}) {
  const { data, error } = await admin.from('applications').select('id, application_number, created_at, profile_updated_at').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  const apps = data || [];
  if (!apps.length) return [];
  const ids = apps.map((a) => a.id);
  const { data: junctions, error: jErr } = await admin.from('listing_applicants').select('id, application_id, listing_id, created_at, reviewed_at, last_sent_at, confirmations').in('application_id', ids);
  if (jErr) throw jErr;
  const js = junctions || [];
  const listingIds = [...new Set(js.map((j) => j.listing_id).filter(Boolean))];
  let listings = [];
  if (listingIds.length) {
    const { data: ls, error: lErr } = await admin.from('listings').select('id, status, closed_at').in('id', listingIds);
    if (lErr && !(lErr.code === '42703' || /status|closed_at/.test(String(lErr.message || '')))) throw lErr;
    listings = ls || [];
  }
  const open = new Set(listings.filter((l) => listingOpen(l)).map((l) => l.id));
  // A listing whose status columns are absent, or whose row is gone, is not active.
  const jIds = js.map((j) => j.id);
  let docs = [];
  if (jIds.length) {
    const { data: ds, error: dErr } = await admin.from('applicant_documents').select('id, listing_applicant_id, uploaded_at, deleted_at').in('listing_applicant_id', jIds);
    if (dErr && !absentTable(dErr) && !/applicant_documents/.test(String(dErr.message || ''))) throw dErr;
    docs = ds || [];
  }
  const cutoffT = Date.parse(cutoff);
  const out = [];
  for (const a of apps) {
    const mine = js.filter((j) => j.application_id === a.id);
    const myDocs = docs.filter((d) => mine.some((j) => j.id === d.listing_applicant_id));
    const last = lastActivity(a, mine, myDocs);
    const onActive = mine.some((j) => open.has(j.listing_id));
    if (onActive) continue;
    if (last != null && Date.parse(last) >= cutoffT) continue;
    out.push({ id: a.id, application_number: a.application_number, created_at: a.created_at, lastActivity: last, junctionIds: mine.map((j) => j.id), heldDocuments: myDocs.filter((d) => !d.deleted_at).length });
  }
  return out;
}

// Every run is a row in retention_runs. The table being absent is logged once and skipped.
export async function recordRun(admin, row) {
  try {
    const { error } = await admin.from('retention_runs').insert(row);
    if (error) {
      if (absentTable(error) || /retention_runs/.test(String(error.message || ''))) { if (!runsAbsentLogged) { runsAbsentLogged = true; console.warn('[retention] retention_runs is not set up (run db/retention-runs.sql); the run was not recorded'); } return false; }
      throw error;
    }
    return true;
  } catch (e) { logServerError('[retention] record run', e); return false; }
}

// runRetention(admin, { enforce, now, log }) -> { cutoff, enforce, applications, junctions, heldDocuments, deleted, oldest, recorded }
export async function runRetention(admin, { enforce = false, now = new Date(), log = console.log } = {}) {
  const cutoff = retentionCutoff(now);
  const out = { cutoff, enforce, applications: 0, junctions: 0, heldDocuments: 0, deleted: 0, oldest: [], recorded: false };
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await selectExpired(admin, cutoff);
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const jIds = rows.flatMap((r) => r.junctionIds);
    const held = rows.reduce((n, r) => n + r.heldDocuments, 0);
    out.applications += rows.length; out.junctions += jIds.length; out.heldDocuments += held;
    if (out.oldest.length < 10) out.oldest.push(...rows.slice(0, 10 - out.oldest.length).map((r) => `${r.application_number} (last activity ${String(r.lastActivity || r.created_at).slice(0, 10)})`));
    if (!enforce) break; // dry run: one batch is enough to report the shape; counts are of the first hundred
    if (held) log(`[retention] ${held} held document rows still live under expired applicants; they are left for the documents expiry and logged here`);
    if (jIds.length) { const { error } = await admin.from('listing_applicants').delete().in('id', jIds); if (error) throw error; }
    { const { error } = await admin.from('applications').delete().in('id', ids); if (error) throw error; }
    out.deleted += rows.length;
    if (rows.length < BATCH) break;
  }
  log(`[retention] ${enforce ? 'ENFORCE' : 'DRY RUN'} cutoff=${cutoff} rule=last activity older than ${RETENTION_MONTHS} months and no active listing applications=${out.applications} junctions=${out.junctions} heldDocuments=${out.heldDocuments} deleted=${out.deleted}`);
  out.recorded = await recordRun(admin, {
    ran_at: new Date(now).toISOString(), mode: enforce ? 'enforce' : 'dry',
    applications_considered: out.applications, applications_deleted: out.deleted,
    oldest_application_number: out.oldest.length ? out.oldest[0].split(' ')[0] : null,
    details: { cutoff, junctions: out.junctions, heldDocuments: out.heldDocuments, oldest: out.oldest },
  });
  return out;
}
