// lib/documentStore.js  SERVER ONLY (takes the service role client).
// The one place documents are written to, listed from, and removed from the private bucket
// applicant-documents and the table applicant_documents (db/documents.sql). Rules that hold in
// every function here:
//   · a file is stored only after the AI analysis of that file succeeded (callers pass the bytes
//     they kept for exactly that purpose; nothing here is reachable before analysis);
//   · the storage path is {profile_id}/{listing_applicant_id}/{uuid}.{ext}: no filename, no
//     applicant field, never owner_token;
//   · the table being absent (db/documents.sql not run) is logged once and skipped, never thrown;
//   · nothing here throws into a calling path; failures go through lib/serverLog.js.
import { expiryFor } from './documentRetention.js';
import { recordEvent } from './events.js';
import { logServerError } from './serverLog.js';

// Web Crypto: present in Node 19+ and every browser, so nothing Node only is imported here.
const randomUUID = () => globalThis.crypto.randomUUID();

export const DOCUMENTS_BUCKET = 'applicant-documents';
export const EXT_FOR_MIME = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' });
const BATCH = 100;

let absentLogged = false;
let cronLogged = false;

// The table or bucket is not set up yet. PostgREST says "Could not find the table", Postgres
// says relation does not exist (42P01), storage says Bucket not found.
export function tableAbsent(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return error.code === '42P01' || /applicant_documents/i.test(m) && /(does not exist|could not find|not found)/i.test(m) || /bucket not found/i.test(m);
}
function noteAbsent(where) {
  if (absentLogged) return;
  absentLogged = true;
  console.warn(`[documents] applicant_documents is not set up (run db/documents.sql); storage skipped (${where})`);
}

// The document type the AI identified, lowercased, or unknown.
export function kindOf(doc) {
  const t = doc && doc.documentType;
  return typeof t === 'string' && t.trim() ? t.trim().toLowerCase().slice(0, 60) : 'unknown';
}

export function storagePathFor({ profileId, linkId, mime, id }) {
  return `${profileId}/${linkId}/${id || randomUUID()}.${EXT_FOR_MIME[String(mime || '').toLowerCase()] || 'bin'}`;
}

// What the realtor's browser receives: never the storage path, never the profile id.
export function toClientDocument(row) {
  return {
    id: row.id, kind: row.kind || 'unknown', mime: row.mime || null, bytes: row.bytes ?? null,
    uploadedBy: row.uploaded_by || null, uploadedAt: row.uploaded_at || null, expiresAt: row.expires_at || null,
    deletedAt: row.deleted_at || null, deletedBy: row.deleted_by || null,
    openedCount: row.opened_count ?? 0, lastOpenedAt: row.last_opened_at || null,
  };
}

// The deleted_by value: the reason, plus ' (object remains)' when the storage remove failed, so
// the weekly reconcile (reconcileStorage) finds the object and removes it.
export const OBJECT_REMAINS = ' (object remains)';
export const deletedByMark = (by, rmErr) => `${String(by || 'realtor').slice(0, 60)}${rmErr ? OBJECT_REMAINS : ''}`;

// Every stored document (live and deleted) for a set of junction rows, keyed by junction id.
// { byLink: Map<linkId, row[]>, absent } ; absent true when the table is not set up.
export async function listStoredDocuments(admin, linkIds) {
  const ids = (linkIds || []).filter(Boolean);
  if (!ids.length) return { byLink: new Map(), absent: false };
  const { data, error } = await admin.from('applicant_documents').select('*').in('listing_applicant_id', ids);
  if (error) { if (tableAbsent(error)) { noteAbsent('list'); return { byLink: new Map(), absent: true }; } throw error; }
  const byLink = new Map();
  for (const row of data || []) { if (!byLink.has(row.listing_applicant_id)) byLink.set(row.listing_applicant_id, []); byLink.get(row.listing_applicant_id).push(row); }
  for (const rows of byLink.values()) rows.sort((a, b) => String(a.uploaded_at || '').localeCompare(String(b.uploaded_at || '')));
  return { byLink, absent: false };
}

// Remove every live file for one applicant from the bucket and mark the rows. { count, absent }.
export async function purgeStoredDocuments(admin, { linkId, deletedBy }) {
  const { data: rows, error } = await admin.from('applicant_documents').select('id, storage_path').eq('listing_applicant_id', linkId).is('deleted_at', null);
  if (error) { if (tableAbsent(error)) { noteAbsent('purge'); return { count: 0, absent: true }; } throw error; }
  const live = rows || [];
  if (!live.length) return { count: 0, absent: false };
  const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove(live.map((r) => r.storage_path));
  if (rmErr) logServerError('[documents/purge] storage remove', rmErr, { linkId, count: live.length });
  const { error: upErr } = await admin.from('applicant_documents').update({ deleted_at: new Date().toISOString(), deleted_by: deletedByMark(deletedBy || 'realtor', rmErr) }).in('id', live.map((r) => r.id));
  if (upErr) throw upErr;
  return { count: live.length, absent: false, objectRemains: !!rmErr };
}

// Store the originals of files whose analysis SUCCEEDED. files: [{ mime, bytes: Buffer, kind }].
// replace: purge the applicant's previous stored files first (a re analysis replaces).
// Returns { stored, ids, absent }: ids are the applicant_documents row ids in file order. Never throws.
export async function storeAnalyzedDocuments(admin, { profileId, listingId, linkId, applicationId, applicantName, uploadedBy, files, replace = false }) {
  const out = { stored: 0, ids: [], absent: false };
  try {
    if (!admin || !profileId || !linkId || !Array.isArray(files) || !files.length) return out;
    if (replace) {
      const purged = await purgeStoredDocuments(admin, { linkId, deletedBy: 'reanalyze' });
      if (purged.absent) { out.absent = true; return out; }
    }
    const uploadedAt = new Date().toISOString();
    for (const f of files) {
      if (!f || !f.bytes || !f.mime) continue;
      const id = randomUUID();
      const path = storagePathFor({ profileId, linkId, mime: f.mime, id });
      const { error: upErr } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false });
      if (upErr) {
        if (tableAbsent(upErr)) { noteAbsent('upload'); out.absent = true; return out; }
        logServerError('[documents/store] storage upload', upErr, { linkId, mime: f.mime, bytes: f.bytes.length });
        continue;
      }
      const row = { id, listing_applicant_id: linkId, profile_id: profileId, storage_path: path, kind: f.kind || 'unknown', mime: f.mime, bytes: f.bytes.length, uploaded_by: uploadedBy === 'tenant' ? 'tenant' : 'realtor', uploaded_at: uploadedAt, expires_at: expiryFor(uploadedAt) };
      const { error: insErr } = await admin.from('applicant_documents').insert(row);
      if (insErr) {
        await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
        if (tableAbsent(insErr)) { noteAbsent('insert'); out.absent = true; return out; }
        logServerError('[documents/store] row insert', insErr, { linkId });
        continue;
      }
      out.stored++; out.ids.push(id);
    }
    if (out.stored > 0) await recordEvent(admin, { profileId, listingId, applicationId, type: 'document_stored', payload: { count: out.stored, by: uploadedBy === 'tenant' ? 'tenant' : 'realtor', linkId, applicantName: applicantName || null } });
  } catch (e) {
    logServerError('[documents/store]', e, { linkId });
  }
  return out;
}

// One held file, by row id, scoped to its applicant: the tenant removing a file before they submit
// (pages/api/upload/remove-file.js, deleted_by 'tenant removed'). The object is removed and the row
// is marked, the same way the realtor's purge works. Returns { count, absent }.
export async function purgeStoredDocument(admin, { id, linkId, deletedBy = 'tenant removed' }) {
  if (!admin || !id || !linkId) return { count: 0 };
  const { data: rows, error } = await admin.from('applicant_documents').select('id, storage_path').eq('id', id).eq('listing_applicant_id', linkId).is('deleted_at', null);
  if (error) { if (tableAbsent(error)) { noteAbsent('purge-one'); return { count: 0, absent: true }; } throw error; }
  const live = rows || [];
  if (!live.length) return { count: 0 };
  const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove(live.map((r) => r.storage_path));
  if (rmErr) logServerError('[documents/purge-one] storage remove', rmErr, { linkId, id });
  const { error: upErr } = await admin.from('applicant_documents').update({ deleted_at: new Date().toISOString(), deleted_by: deletedByMark(deletedBy || 'tenant removed', rmErr) }).in('id', live.map((r) => r.id));
  if (upErr) logServerError('[documents/purge-one] row update', upErr, { linkId, id });
  return { count: live.length };
}

// The daily expiry: every live file past expires_at, in batches of 100, files removed, rows
// marked expired, one documents_expired event per applicant. { expired, applicants }.
export async function expireDocuments(admin, { now = new Date() } = {}) {
  const nowIso = new Date(now).toISOString();
  const result = { expired: 0, applicants: 0 };
  for (let batch = 0; batch < 50; batch++) {
    const { data, error } = await admin.from('applicant_documents').select('id, storage_path, listing_applicant_id, profile_id').is('deleted_at', null).lt('expires_at', nowIso).limit(BATCH);
    if (error) { if (tableAbsent(error)) { noteAbsent('expire'); return result; } throw error; }
    const rows = data || [];
    if (!rows.length) break;
    const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove(rows.map((r) => r.storage_path));
    if (rmErr) logServerError('[documents/expire] storage remove', rmErr, { count: rows.length });
    const { error: upErr } = await admin.from('applicant_documents').update({ deleted_at: nowIso, deleted_by: deletedByMark('expired', rmErr) }).in('id', rows.map((r) => r.id));
    if (upErr) throw upErr;
    result.expired += rows.length;
    const groups = new Map();
    for (const r of rows) { if (!groups.has(r.listing_applicant_id)) groups.set(r.listing_applicant_id, { profileId: r.profile_id, count: 0 }); groups.get(r.listing_applicant_id).count++; }
    const { data: junctions } = await admin.from('listing_applicants').select('id, listing_id, application_id').in('id', [...groups.keys()]);
    for (const [linkId, g] of groups) {
      const j = (junctions || []).find((x) => x.id === linkId);
      await recordEvent(admin, { profileId: g.profileId, listingId: j?.listing_id || null, applicationId: j?.application_id || null, type: 'documents_expired', payload: { count: g.count, linkId } });
      result.applicants++;
    }
    if (rows.length < BATCH) break;
  }
  return result;
}

// The weekly reconcile (Sundays, inside the documents cron): the bucket listed by profile prefix
// against applicant_documents. An object with no LIVE row is removed (an orphan from a deleted
// listing, an enforced retention, or a failed remove marked ' (object remains)'); a live row with
// no object is logged and marked deleted_by 'missing'. Batches of 100, capped at maxObjects.
//   reconcileStorage(admin, { now, log, maxObjects }) -> { profiles, objects, removed, missing, capped }
export async function reconcileStorage(admin, { now = new Date(), log = console.log, maxObjects = 2000 } = {}) {
  const result = { profiles: 0, objects: 0, removed: 0, missing: 0, capped: false, absent: false };
  const bucket = admin.storage.from(DOCUMENTS_BUCKET);
  const listAll = async (prefix) => {
    const out = [];
    for (let offset = 0; offset < 10000; offset += BATCH) {
      const { data, error } = await bucket.list(prefix, { limit: BATCH, offset });
      if (error) { if (tableAbsent(error)) { result.absent = true; return out; } throw error; }
      const items = data || [];
      out.push(...items);
      if (items.length < BATCH) break;
    }
    return out;
  };
  // Objects: {profile}/{link}/{file}. A folder entry has no id; a file has one.
  const paths = [];
  const profiles = await listAll('');
  if (result.absent) { noteAbsent('reconcile'); return result; }
  for (const p of profiles) {
    if (p.id) continue; // a stray file at the root is not ours to touch
    result.profiles++;
    const links = await listAll(p.name);
    for (const l of links) {
      if (l.id) { paths.push(`${p.name}/${l.name}`); continue; }
      const files = await listAll(`${p.name}/${l.name}`);
      for (const f of files) { if (f.id) paths.push(`${p.name}/${l.name}/${f.name}`); if (paths.length >= maxObjects) break; }
      if (paths.length >= maxObjects) break;
    }
    if (paths.length >= maxObjects) { result.capped = true; break; }
  }
  result.objects = paths.length;
  // The rows for those paths, in chunks, live and deleted.
  const rows = [];
  for (let i = 0; i < paths.length; i += BATCH) {
    const { data, error } = await admin.from('applicant_documents').select('id, storage_path, deleted_at, deleted_by').in('storage_path', paths.slice(i, i + BATCH));
    if (error) { if (tableAbsent(error)) { noteAbsent('reconcile'); result.absent = true; return result; } throw error; }
    rows.push(...(data || []));
  }
  const liveByPath = new Map(rows.filter((r) => !r.deleted_at).map((r) => [r.storage_path, r]));
  const orphans = paths.filter((p) => !liveByPath.has(p));
  for (let i = 0; i < orphans.length; i += BATCH) {
    const chunk = orphans.slice(i, i + BATCH);
    const { error } = await bucket.remove(chunk);
    if (error) { logServerError('[documents/reconcile] storage remove', error, { count: chunk.length }); continue; }
    result.removed += chunk.length;
    // rows that carried ' (object remains)' are now clean
    const marked = rows.filter((r) => chunk.includes(r.storage_path) && r.deleted_at && String(r.deleted_by || '').endsWith(OBJECT_REMAINS));
    if (marked.length) await admin.from('applicant_documents').update({ deleted_by: 'reconciled' }).in('id', marked.map((r) => r.id));
  }
  // Live rows whose object is gone: only within the prefixes that were listed in full.
  if (!result.capped) {
    const listedPrefixes = new Set(paths.map((p) => p.split('/')[0]));
    const { data: live, error } = await admin.from('applicant_documents').select('id, storage_path').is('deleted_at', null);
    if (error) { if (!tableAbsent(error)) throw error; }
    const pathSet = new Set(paths);
    const missing = (live || []).filter((r) => listedPrefixes.has(String(r.storage_path || '').split('/')[0]) && !pathSet.has(r.storage_path));
    if (missing.length) {
      log(`[documents/reconcile] ${missing.length} live row(s) with no object, marked missing: ${missing.slice(0, 10).map((r) => r.id).join(', ')}`);
      for (let i = 0; i < missing.length; i += BATCH) { const { error: upErr } = await admin.from('applicant_documents').update({ deleted_at: new Date(now).toISOString(), deleted_by: 'missing' }).in('id', missing.slice(i, i + BATCH).map((r) => r.id)); if (upErr) logServerError('[documents/reconcile] mark missing', upErr); }
      result.missing = missing.length;
    }
  }
  log(`[documents/reconcile] profiles=${result.profiles} objects=${result.objects} removed=${result.removed} missing=${result.missing}${result.capped ? ' capped' : ''}`);
  return result;
}

// The cron route's gate. { status } to refuse (503 when CRON_SECRET is unset, logged once; 401
// on a wrong bearer), null to proceed.
export function cronGate(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) { if (!cronLogged) { cronLogged = true; console.error('[cron/expire-documents] CRON_SECRET is not set; refusing'); } return { status: 503 }; }
  const header = String((req && req.headers && req.headers.authorization) || '');
  if (header !== `Bearer ${secret}`) return { status: 401 };
  return null;
}
