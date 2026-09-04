// lib/reportSnapshotStore.js  SERVER ONLY (takes the service role client). The report_snapshots
// table (db/report-snapshots.sql): insert on send, the latest per listing for the realtor's
// side, one by token for the landlord page. Every read tolerates the table being absent
// (before the migration runs) with one log line, so nothing else changes.
import { newReportToken } from './applicationIds.js';
import { SNAPSHOT_DAYS } from './reportSnapshot.js';

let absentLogged = false;
export function snapshotsAbsent(error) {
  const m = String(error?.message || '');
  const absent = !!error && (error.code === '42P01' || error.code === 'PGRST205' || (/report_snapshots/.test(m) && /(does not exist|could not find|not found|schema cache)/i.test(m)));
  if (absent && !absentLogged) { absentLogged = true; console.warn('[report-snapshots] table not set up (run db/report-snapshots.sql); falling back to the live report'); }
  return absent;
}

export const expiryFor = (now = new Date()) => new Date(new Date(now).getTime() + SNAPSHOT_DAYS * 86400000).toISOString();

// Insert one snapshot. Returns { id, token, createdAt, expiresAt } or { absent: true }.
export async function insertSnapshot(admin, { listingId, profileId, payload, sentToName, sentToEmail, now = new Date() }) {
  const token = newReportToken();
  const row = { listing_id: listingId, profile_id: profileId, token, payload, sent_to_name: sentToName || null, sent_to_email: sentToEmail || null, expires_at: expiryFor(now) };
  const { data, error } = await admin.from('report_snapshots').insert(row).select('id, token, created_at, expires_at').single();
  if (error) { if (snapshotsAbsent(error)) return { absent: true }; throw error; }
  return { id: data.id, token: data.token, createdAt: data.created_at || new Date(now).toISOString(), expiresAt: data.expires_at };
}

// The client safe meta for the realtor's Present section.
export function snapshotMeta(row) {
  if (!row) return null;
  return { id: row.id, token: row.token, sentAt: row.created_at, sentToName: row.sent_to_name || null, openedCount: Number(row.opened_count) || 0, lastOpenedAt: row.last_opened_at || null, answers: row.answers && typeof row.answers === 'object' ? row.answers : {}, expiresAt: row.expires_at || null };
}

// The latest snapshot per listing: Map listingId -> { meta, links: { rank: linkId } }.
export async function latestSnapshots(admin, listingIds) {
  const ids = (listingIds || []).filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await admin.from('report_snapshots').select('id, listing_id, token, answers, opened_count, last_opened_at, sent_to_name, expires_at, created_at, payload').in('listing_id', ids).order('created_at', { ascending: false });
  if (error) { if (snapshotsAbsent(error)) return out; throw error; }
  for (const row of data || []) {
    const key = String(row.listing_id);
    if (out.has(key)) continue;
    const links = {};
    for (const a of (row.payload && row.payload.applicants) || []) if (a && a.linkId) links[a.rank] = a.linkId;
    out.set(key, { meta: snapshotMeta(row), links });
  }
  return out;
}

// Attach the latest snapshot's answer to each applicant: a.landlordAnswer = { answer, at, rank }.
export async function attachLandlordAnswers(admin, listingIds, applicants) {
  try {
    const latest = await latestSnapshots(admin, listingIds);
    for (const a of applicants || []) {
      a.landlordAnswer = null;
      const snap = latest.get(String(a.listingId || ''));
      if (!snap) continue;
      for (const [rank, linkId] of Object.entries(snap.links)) {
        const ans = snap.meta.answers[rank];
        if (linkId === a.linkId && ans && ans.answer) a.landlordAnswer = { answer: ans.answer, at: ans.at || null, rank: Number(rank), snapshotId: snap.meta.id };
      }
    }
  } catch (e) { for (const a of applicants || []) a.landlordAnswer = null; console.warn('[report-snapshots] answers skipped:', e?.message || e); }
}

// The landlord opened the page: opened_count and last_opened_at, and report_opened at most once
// an hour. Returns { recorded }.
export async function noteOpened(admin, row, { now = new Date(), recordEvent } = {}) {
  const lastOpened = row.last_opened_at ? new Date(row.last_opened_at).getTime() : 0;
  const { error } = await admin.from('report_snapshots').update({ opened_count: (Number(row.opened_count) || 0) + 1, last_opened_at: new Date(now).toISOString() }).eq('id', row.id);
  if (error) throw error;
  const due = new Date(now).getTime() - lastOpened > 3600000;
  if (due && recordEvent) await recordEvent(admin, { profileId: row.profile_id, listingId: row.listing_id || null, type: 'report_opened', payload: { snapshotId: row.id, sentToName: row.sent_to_name || null, listingName: row.payload?.listing?.address || null } });
  return { recorded: due };
}

export async function snapshotByToken(admin, token) {
  const { data, error } = await admin.from('report_snapshots').select('*').eq('token', String(token)).maybeSingle();
  if (error) { if (snapshotsAbsent(error)) return null; throw error; }
  return data || null;
}
