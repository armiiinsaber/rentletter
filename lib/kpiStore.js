// lib/kpiStore.js  SERVER ONLY. Reads the rows lib/kpis.js counts, and reads and writes the daily
// snapshot table (db/013-kpi-daily.sql). The caller hands in the service role client: the founder
// office (pages/api/admin/commitment.js, behind requireAdmin) and the two crons (behind
// CRON_SECRET). No realtor route reads this, and nothing here selects a tenant's name, phone,
// owner_token or documents: an application is read for its id, its email and where its answers
// came from (the reuse record), to count people.
import { computeKpis, snapshotRow, monthlySeries, parseExcludeIds, addMonths, monthOf, RENTAL_MOVES } from './kpis.js';

const msg = (e) => String((e && e.message) || e || '');
// The reuse record on an application (db/014-prefill-record.sql, lib/prefillRecord.js): what lib/kpis.js profileReuse reads.
const PREFILL_COLUMNS = ['prefill_source', 'prefill_profile_id', 'email_verified_at_submit', 'reused_checks'];
const tableAbsent = (error) => !!error && (error.code === '42P01' || error.code === 'PGRST205' || /(does not exist|could not find the table|schema cache)/i.test(msg(error)));
const columnAbsent = (error, column) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /(does not exist|could not find)/i.test(msg(error))) && msg(error).includes(column);

// Every row of a table, a thousand at a time, in key order (PostgREST answers at most a thousand
// rows to one request). filter(q) narrows the query.
async function readAll(admin, table, columns, { key = 'id', filter = (q) => q } = {}) {
  const rows = []; let last = null;
  for (let page = 0; page < 1000; page++) {
    let q = filter(admin.from(table).select(columns)).order(key, { ascending: true }).limit(1000);
    if (last != null) q = q.gt(key, last);
    const { data, error } = await q;
    if (error) return { rows, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    last = data[data.length - 1][key];
  }
  return { rows, error: null };
}

export const kpiOptions = (env = process.env) => ({ excludeIds: parseExcludeIds(env.KPI_EXCLUDE_PROFILE_IDS) });

// The rows behind every metric. A table that is not there yet reads as empty (application_events
// before db/002, signup_source before db/013), and the name of what was missing is returned.
export async function loadKpiData(admin) {
  const missing = [];
  const [profiles, listings, links, events, applications] = await Promise.all([
    readAll(admin, 'profiles', '*'),
    readAll(admin, 'listings', 'id, profile_id'),
    readAll(admin, 'listing_applicants', 'id, listing_id, application_id, created_at, state').then((r) => (columnAbsent(r.error, 'state') ? readAll(admin, 'listing_applicants', 'id, listing_id, application_id, created_at') : r)),
    readAll(admin, 'application_events', 'id, listing_applicant_id, from_state, to_state, created_at', { filter: (q) => q.in('to_state', [...RENTAL_MOVES]) }),
    // The reuse record (db/014-prefill-record.sql). Before it has run the columns are absent: read without them.
    readAll(admin, 'applications', `id, email, ${PREFILL_COLUMNS.join(', ')}`).then((r) => (PREFILL_COLUMNS.some((c) => columnAbsent(r.error, c)) ? readAll(admin, 'applications', 'id, email') : r)),
  ]);
  for (const [name, r] of [['profiles', profiles], ['listings', listings], ['listing_applicants', links], ['applications', applications]]) if (r.error) throw new Error(`${name}: ${msg(r.error)}`);
  if (events.error) { if (tableAbsent(events.error)) missing.push('application_events'); else throw new Error(`application_events: ${msg(events.error)}`); }
  if (profiles.rows.length && !profiles.rows.some((p) => Object.prototype.hasOwnProperty.call(p, 'signup_source'))) missing.push('profiles.signup_source');
  // Tracked once the rows carry the record's column at all (a null in it is a legacy row: unknown).
  const prefillTracked = applications.rows.some((a) => Object.prototype.hasOwnProperty.call(a, 'prefill_source'));
  return {
    data: {
      profiles: profiles.rows.map((p) => ({ id: p.id, email: p.email || null, created_at: p.created_at || null, signup_source: p.signup_source ?? null })),
      listings: listings.rows.map((l) => ({ id: l.id, profile_id: l.profile_id })),
      links: links.rows.map((k) => ({ id: k.id, listing_id: k.listing_id, application_id: k.application_id, created_at: k.created_at, state: k.state ?? null })),
      events: events.rows.map((e) => ({ listing_applicant_id: e.listing_applicant_id, from_state: e.from_state ?? null, to_state: e.to_state, created_at: e.created_at })),
      applications: applications.rows.map((a) => (prefillTracked ? { id: a.id, email: a.email || null, prefill_source: a.prefill_source ?? null, prefill_profile_id: a.prefill_profile_id ?? null, email_verified_at_submit: a.email_verified_at_submit ?? null, reused_checks: Array.isArray(a.reused_checks) ? a.reused_checks : null } : { id: a.id, email: a.email || null })),
      prefillTracked,
    },
    missing,
  };
}

// The snapshot rows from the last 14 months (the chart draws 12). exists is false before db/013.
export async function readSnapshots(admin, clock) {
  const since = `${addMonths(monthOf(clock), -13)}-01`;
  const r = await readAll(admin, 'kpi_daily', '*', { key: 'day', filter: (q) => q.gte('day', since) });
  if (r.error) { if (tableAbsent(r.error)) return { exists: false, rows: [] }; throw new Error(`kpi_daily: ${msg(r.error)}`); }
  return { exists: true, rows: r.rows };
}

// What the office shows: the numbers counted now, and the chart's months when the table exists.
export async function loadCommitment(admin, clock = Date.now(), env = process.env) {
  const [{ data, missing }, history] = await Promise.all([loadKpiData(admin), readSnapshots(admin, clock)]);
  const kpis = computeKpis(data, clock, kpiOptions(env));
  return { kpis, history: { exists: history.exists, days: history.rows.length, series: history.exists ? monthlySeries(history.rows, clock) : null }, missing };
}

// The daily run: count, then write that Toronto date's row (a second run the same day replaces it).
export async function writeSnapshot(admin, clock = Date.now(), env = process.env) {
  const { data, missing } = await loadKpiData(admin);
  const kpis = computeKpis(data, clock, kpiOptions(env));
  const row = snapshotRow(kpis, clock);
  const { error } = await admin.from('kpi_daily').upsert(row, { onConflict: 'day' });
  if (error) { if (tableAbsent(error)) return { stored: false, reason: 'kpi_daily is not set up yet (run db/013-kpi-daily.sql)', row, kpis, missing }; throw new Error(`kpi_daily: ${msg(error)}`); }
  return { stored: true, row, kpis, missing };
}
