// lib/tenantVault.js  SERVER ONLY (takes the service role client).
// The tenant's vault: the one place a tenant's own documents are written to, listed from and
// removed from the private bucket tenant-vault and the tables tenant_profile_documents,
// tenant_profile_checks and profile_access_log (db/018-profile-vault.sql;
// docs/design/profile-and-circle.md sections 4.2, 4.3, 4.5 and 7). lib/documentStore.js, the
// realtor's 14 day store, is the model and is untouched. Rules that hold in every function here:
//   · every call is for ONE tenant profile, whose id comes from the tenant's own session
//     (pages/api/tenant/vault.js), from the expiry job, or from the one share reader
//     (lib/profileShareStore.js), which has already checked that the tenant approved a share for
//     the realtor asking. Nothing else on the realtor side imports this file
//     (tests/routes/profileVault.test.mjs), and the three functions at the foot are the only ones
//     that reader calls: the facts read, the list of files, and the one signed link;
//   · a file is stored only after the read of that file succeeded, and never when it is a credit
//     report or cannot be recognised;
//   · the storage path is {tenant_profile_id}/{uuid}.{ext}: no filename, no email, never an
//     owner token;
//   · a delete removes the file first, then marks the row: the row keeps its kind and its dates
//     for 30 days so the reconcile can prove the object is gone, and holds no content hash;
//   · the facts read from a document outlive it (source_document_id empties), until the tenant
//     removes them or the profile has been idle for 12 months;
//   · the tables or the bucket being absent (db/018 not run) answers "not available", logged once,
//     never thrown.
import { logServerError } from './serverLog.js';
import { PROFILE_CHECK_KINDS } from './profileFacts.js';
import { VAULT_BUCKET, VAULT_EXT, VAULT_MAX_DOCUMENTS, expiryFor, canRenew, renewedExpiry, freshUntil, idleCutoff, tombstoneCutoff, checksFromDocument } from './tenantVaultRules.js';

const randomUUID = () => globalThis.crypto.randomUUID();
const BATCH = 100;
const DOCS = 'tenant_profile_documents';
const CHECKS = 'tenant_profile_checks';
const LOG = 'profile_access_log';
let absentLogged = false;

// The vault is not set up yet: PostgREST says "Could not find the table", Postgres says the
// relation does not exist (42P01), storage says Bucket not found.
export function vaultAbsent(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return error.code === '42P01' || error.code === 'PGRST205' || (/tenant_profile_documents|tenant_profile_checks|profile_access_log/i.test(m) && /(does not exist|could not find|not found)/i.test(m)) || /bucket not found/i.test(m);
}
function noteAbsent(where) {
  if (absentLogged) return;
  absentLogged = true;
  console.warn(`[vault] the vault is not set up (run db/018-profile-vault.sql); skipped (${where})`);
}

// The tenant's own log. Best effort for the tenant's own acts: a line that cannot be written is
// reported to the server log and never stands in the way of a delete.
// For a realtor's read through a share the line is not best effort: the caller reads the answer
// (true when the line was written) and refuses the read when it was not.
//   shareId, actorProfileId, actorLabel: the share the act went through and who acted (a
//   realtor's name and brokerage as they were then, so the log still reads right later).
export async function logVault(admin, { profileId, action, actor = 'tenant', documentId = null, at = null, shareId = null, actorProfileId = null, actorLabel = null }) {
  try {
    const row = { tenant_profile_id: profileId, actor_type: actor, action, document_id: documentId, ...(shareId ? { share_id: shareId } : {}), ...(actorProfileId ? { actor_profile_id: actorProfileId } : {}), ...(actorLabel ? { actor_label: String(actorLabel).slice(0, 200) } : {}), ...(at ? { at } : {}) };
    const { error } = await admin.from(LOG).insert(row);
    if (error && !vaultAbsent(error)) logServerError('[vault/log]', error, { action });
    return !error;
  } catch (e) { logServerError('[vault/log]', e, { action }); return false; }
}

// What the tenant's browser receives: never the storage path, never the content hash.
export const toClientDocument = (r) => ({ id: r.id, kind: r.kind, mime: r.mime, bytes: r.bytes, uploadedAt: r.uploaded_at || null, readAt: r.read_at || null, expiresAt: r.expires_at, renewedAt: r.renewed_at || null, canRenew: canRenew(r.kind) });
export const toClientCheck = (r) => ({ id: r.id, kind: r.kind, value: r.value, agreesWithTyped: r.agrees_with_typed ?? null, sourceKind: r.source_kind, readAt: r.read_at, freshUntil: r.fresh_until, documentHeld: !!r.source_document_id });

// Everything the tenant's own page shows: live documents, the facts read, and who has viewed the
// profile (lines a realtor wrote; none can exist before shares do).
//   { available, documents, checks, views }
export async function listVault(admin, profileId) {
  const empty = { available: false, documents: [], checks: [], views: [] };
  if (!admin || !profileId) return empty;
  const docs = await admin.from(DOCS).select('*').eq('tenant_profile_id', profileId).is('deleted_at', null);
  if (docs.error) { if (vaultAbsent(docs.error)) { noteAbsent('list'); return empty; } throw docs.error; }
  const checks = await admin.from(CHECKS).select('*').eq('tenant_profile_id', profileId);
  if (checks.error) { if (vaultAbsent(checks.error)) { noteAbsent('list'); return empty; } throw checks.error; }
  const log = await admin.from(LOG).select('id, share_id, actor_label, action, at').eq('tenant_profile_id', profileId).eq('actor_type', 'realtor').order('at', { ascending: false }).limit(200);
  const order = (list, col) => [...(list || [])].sort((a, b) => String(a[col] || '').localeCompare(String(b[col] || '')));
  return {
    available: true,
    documents: order(docs.data, 'uploaded_at').map(toClientDocument),
    checks: PROFILE_CHECK_KINDS.map((k) => (checks.data || []).find((c) => c.kind === k)).filter(Boolean).map(toClientCheck),
    views: log.error ? [] : (log.data || []).map((l) => ({ id: l.id, shareId: l.share_id || null, who: l.actor_label || null, action: l.action, at: l.at })),
  };
}

// Store one file whose read SUCCEEDED, and record the facts read from it.
//   { profileId, facts, bytes: Buffer, mime, doc (the reader's description), vaultKind, hash, now }
//   -> { ok: true, document, checks } | { ok: false, reason: 'absent' | 'full' | 'storage' | 'row' }
// A newer read of a fact replaces the older one (one per kind and profile). Never throws.
export async function storeVaultDocument(admin, { profileId, facts, bytes, mime, doc, vaultKind, hash = null, now = new Date() }) {
  try {
    const live = await admin.from(DOCS).select('id').eq('tenant_profile_id', profileId).is('deleted_at', null);
    if (live.error) { if (vaultAbsent(live.error)) { noteAbsent('store'); return { ok: false, reason: 'absent' }; } throw live.error; }
    if ((live.data || []).length >= VAULT_MAX_DOCUMENTS) return { ok: false, reason: 'full' };
    const id = randomUUID();
    const at = new Date(now).toISOString();
    const path = `${profileId}/${id}.${VAULT_EXT[mime] || 'bin'}`;
    const up = await admin.storage.from(VAULT_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) {
      if (vaultAbsent(up.error)) { noteAbsent('upload'); return { ok: false, reason: 'absent' }; }
      logServerError('[vault/store] storage upload', up.error, { mime, bytes: bytes.length });
      return { ok: false, reason: 'storage' };
    }
    const row = { id, tenant_profile_id: profileId, storage_path: path, kind: vaultKind, mime, bytes: bytes.length, content_hash: hash ? String(hash).slice(0, 64) : null, uploaded_at: at, read_at: at, expires_at: expiryFor(vaultKind, at), object_removed: false };
    const ins = await admin.from(DOCS).insert(row);
    if (ins.error) {
      await admin.storage.from(VAULT_BUCKET).remove([path]).catch(() => {});
      if (vaultAbsent(ins.error)) { noteAbsent('insert'); return { ok: false, reason: 'absent' }; }
      logServerError('[vault/store] row insert', ins.error, {});
      return { ok: false, reason: 'row' };
    }
    await logVault(admin, { profileId, action: 'document_added', documentId: id, at });
    const recorded = [];
    for (const c of checksFromDocument(doc, vaultKind, facts)) {
      const check = { tenant_profile_id: profileId, kind: c.kind, value: c.value, agrees_with_typed: c.agrees_with_typed, source_kind: c.source_kind, source_document_id: id, read_at: at, fresh_until: freshUntil(c.kind, at) };
      const { data, error } = await admin.from(CHECKS).upsert(check, { onConflict: 'tenant_profile_id,kind' }).select('*').maybeSingle();
      if (error) { logServerError('[vault/store] check', error, { kind: c.kind }); continue; }
      recorded.push(toClientCheck(data || check));
      await logVault(admin, { profileId, action: 'check_recorded', documentId: id, at });
    }
    return { ok: true, document: toClientDocument(row), checks: recorded };
  } catch (e) {
    logServerError('[vault/store]', e, {});
    return { ok: false, reason: 'row' };
  }
}

// Remove files and mark their rows, the one way a document leaves the vault. The file goes first;
// object_removed records whether the bucket confirmed it, and the reconcile retries the rest.
async function removeRows(admin, rows, { by, at }) {
  if (!rows.length) return { removed: 0, objectRemains: false };
  const { error: rmErr } = await admin.storage.from(VAULT_BUCKET).remove(rows.map((r) => r.storage_path));
  if (rmErr) logServerError('[vault/remove] storage remove', rmErr, { count: rows.length, by });
  const ids = rows.map((r) => r.id);
  const { error } = await admin.from(DOCS).update({ deleted_at: at, deleted_by: by, content_hash: null, object_removed: !rmErr }).in('id', ids);
  if (error) throw error;
  // The facts read from these files stay, pointing at no document.
  const unlink = await admin.from(CHECKS).update({ source_document_id: null }).in('source_document_id', ids);
  if (unlink.error && !vaultAbsent(unlink.error)) logServerError('[vault/remove] unlink checks', unlink.error, {});
  return { removed: rows.length, objectRemains: !!rmErr };
}

// The tenant deletes one of their own documents: the file and the row's content, at once.
//   -> { ok: true } | { ok: false, reason: 'absent' | 'missing' }
export async function deleteVaultDocument(admin, { profileId, id, now = new Date() }) {
  const { data, error } = await admin.from(DOCS).select('id, storage_path').eq('id', id).eq('tenant_profile_id', profileId).is('deleted_at', null);
  if (error) { if (vaultAbsent(error)) { noteAbsent('delete'); return { ok: false, reason: 'absent' }; } throw error; }
  if (!(data || []).length) return { ok: false, reason: 'missing' };
  const at = new Date(now).toISOString();
  const out = await removeRows(admin, data, { by: 'tenant', at });
  await logVault(admin, { profileId, action: 'document_deleted', documentId: id, at });
  return { ok: true, objectRemains: out.objectRemains };
}

// The tenant renews a file that may be renewed: 90 days from today.
//   -> { ok: true, document } | { ok: false, reason: 'absent' | 'missing' | 'not_renewable' }
export async function renewVaultDocument(admin, { profileId, id, now = new Date() }) {
  const { data, error } = await admin.from(DOCS).select('*').eq('id', id).eq('tenant_profile_id', profileId).is('deleted_at', null).maybeSingle();
  if (error) { if (vaultAbsent(error)) { noteAbsent('renew'); return { ok: false, reason: 'absent' }; } throw error; }
  if (!data) return { ok: false, reason: 'missing' };
  if (!canRenew(data.kind)) return { ok: false, reason: 'not_renewable' };
  const at = new Date(now).toISOString();
  const patch = { expires_at: renewedExpiry(at), renewed_at: at };
  const up = await admin.from(DOCS).update(patch).eq('id', id).eq('tenant_profile_id', profileId);
  if (up.error) throw up.error;
  await logVault(admin, { profileId, action: 'document_renewed', documentId: id, at });
  return { ok: true, document: toClientDocument({ ...data, ...patch }) };
}

// The tenant removes one fact read from a document: gone, not hidden.
export async function removeVaultCheck(admin, { profileId, id, now = new Date() }) {
  const { data, error } = await admin.from(CHECKS).select('id').eq('id', id).eq('tenant_profile_id', profileId);
  if (error) { if (vaultAbsent(error)) { noteAbsent('remove-check'); return { ok: false, reason: 'absent' }; } throw error; }
  if (!(data || []).length) return { ok: false, reason: 'missing' };
  const del = await admin.from(CHECKS).delete().eq('id', id).eq('tenant_profile_id', profileId);
  if (del.error) throw del.error;
  await logVault(admin, { profileId, action: 'check_removed', at: new Date(now).toISOString() });
  return { ok: true };
}

// The daily expiry: every live file past expires_at, in batches of 100. The file is removed, the
// row marked expired, one document_expired line written per file to its tenant's log.
// Exactly what is due: a file that expires later, or is already deleted, is not touched.
//   -> { expired, profiles, absent }
export async function expireVaultDocuments(admin, { now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  const result = { expired: 0, profiles: 0, absent: false };
  const profiles = new Set();
  for (let batch = 0; batch < 50; batch++) {
    const { data, error } = await admin.from(DOCS).select('id, storage_path, tenant_profile_id').is('deleted_at', null).lt('expires_at', at).limit(BATCH);
    if (error) { if (vaultAbsent(error)) { noteAbsent('expire'); result.absent = true; return result; } throw error; }
    const rows = data || [];
    if (!rows.length) break;
    await removeRows(admin, rows, { by: 'expiry', at });
    for (const r of rows) { profiles.add(r.tenant_profile_id); await logVault(admin, { profileId: r.tenant_profile_id, action: 'document_expired', actor: 'system', documentId: r.id, at }); }
    result.expired += rows.length;
    if (rows.length < BATCH) break;
  }
  result.profiles = profiles.size;
  return result;
}

// The twelve month rule, for the vault alone: a profile nobody has signed in to for 12 months
// loses its stored documents and the facts read from them. The profile itself, its notice and
// the full delete are a later phase. activityFor(ids) answers { id: iso } or null when it cannot
// be read (lib/tenantProfileStore.js profileActivity): unknown is never treated as idle.
//   -> { profiles, documents, checks, absent }
export async function expireIdleVaults(admin, { now = new Date(), activityFor }) {
  const at = new Date(now).toISOString();
  const cutoff = idleCutoff(now);
  const result = { profiles: 0, documents: 0, checks: 0, absent: false };
  const docs = await admin.from(DOCS).select('id, storage_path, tenant_profile_id').is('deleted_at', null).limit(5000);
  if (docs.error) { if (vaultAbsent(docs.error)) { noteAbsent('idle'); result.absent = true; return result; } throw docs.error; }
  const checks = await admin.from(CHECKS).select('id, tenant_profile_id').limit(5000);
  if (checks.error) { if (vaultAbsent(checks.error)) { noteAbsent('idle'); result.absent = true; return result; } throw checks.error; }
  const ids = [...new Set([...(docs.data || []), ...(checks.data || [])].map((r) => r.tenant_profile_id))];
  if (!ids.length) return result;
  const activity = await activityFor(ids);
  if (!activity) return result;
  for (const profileId of ids) {
    const last = activity[profileId];
    if (!last || !(String(last) < cutoff)) continue; // active, or unknown
    const mine = (docs.data || []).filter((r) => r.tenant_profile_id === profileId);
    if (mine.length) {
      await removeRows(admin, mine, { by: 'expiry', at });
      for (const r of mine) await logVault(admin, { profileId, action: 'document_expired', actor: 'system', documentId: r.id, at });
      result.documents += mine.length;
    }
    const facts = (checks.data || []).filter((r) => r.tenant_profile_id === profileId);
    if (facts.length) {
      const del = await admin.from(CHECKS).delete().eq('tenant_profile_id', profileId);
      if (del.error) throw del.error;
      await logVault(admin, { profileId, action: 'check_removed', actor: 'system', at });
      result.checks += facts.length;
    }
    result.profiles++;
  }
  return result;
}

// The reconcile, in the same daily run: a deleted row whose file the bucket did not confirm
// removed is tried again, and a deleted row past 30 days whose file is gone is removed.
//   -> { retried, swept, absent }
export async function reconcileVault(admin, { now = new Date() } = {}) {
  const result = { retried: 0, swept: 0, absent: false };
  const left = await admin.from(DOCS).select('id, storage_path').not('deleted_at', 'is', null).eq('object_removed', false).limit(BATCH);
  if (left.error) { if (vaultAbsent(left.error)) { noteAbsent('reconcile'); result.absent = true; return result; } throw left.error; }
  if ((left.data || []).length) {
    const { error: rmErr } = await admin.storage.from(VAULT_BUCKET).remove(left.data.map((r) => r.storage_path));
    if (rmErr) logServerError('[vault/reconcile] storage remove', rmErr, { count: left.data.length });
    else { const up = await admin.from(DOCS).update({ object_removed: true }).in('id', left.data.map((r) => r.id)); if (up.error) throw up.error; result.retried = left.data.length; }
  }
  const old = await admin.from(DOCS).select('id').not('deleted_at', 'is', null).eq('object_removed', true).lt('deleted_at', tombstoneCutoff(now)).limit(BATCH);
  if (old.error) throw old.error;
  if ((old.data || []).length) {
    const del = await admin.from(DOCS).delete().in('id', old.data.map((r) => r.id));
    if (del.error) throw del.error;
    result.swept = old.data.length;
  }
  return result;
}

// ── For the one share reader (lib/profileShareStore.js), and nothing else ────────────────────
// Each is called only after that reader has found an approved, live share for the realtor asking.

// The facts read from the tenant's documents, as lib/profileFacts.js sharePayload takes them.
//   -> [{ kind, value, read_at }] ; [] before db/018
export async function shareableChecks(admin, profileId) {
  const { data, error } = await admin.from(CHECKS).select('kind, value, read_at').eq('tenant_profile_id', profileId);
  if (error) { if (vaultAbsent(error)) return []; throw error; }
  return data || [];
}
// The kinds of stored file a realtor may ever open, through any share: proof of income and the
// employment letter. Never the ID: a realtor sees the identity check as a fact ("Name matches
// ID", with its date) and never the image. Never 'other'.
export const SHARE_DOCUMENT_KINDS = Object.freeze(['income', 'employment']);
// The tenant's stored files a share with documents in scope may open: what each is and when it
// was read, never a path or a hash, and never an ID.  -> [{ id, kind, readAt }]
export async function shareableDocuments(admin, profileId) {
  const { data, error } = await admin.from(DOCS).select('id, kind, read_at, uploaded_at').eq('tenant_profile_id', profileId).is('deleted_at', null);
  if (error) { if (vaultAbsent(error)) return []; throw error; }
  return (data || []).filter((d) => SHARE_DOCUMENT_KINDS.includes(d.kind)).sort((a, b) => String(a.uploaded_at || '').localeCompare(String(b.uploaded_at || ''))).map((d) => ({ id: d.id, kind: d.kind, readAt: d.read_at || d.uploaded_at || null }));
}
// THE one place a link to a stored file is made: 60 seconds, for one live file of this profile
// that is proof of income or an employment letter. An ID is refused here, whoever asks: no link
// to an ID image is ever made.
//   -> { ok: true, url, mime, kind } | { ok: false, reason: 'missing' | 'refused' | 'failed' }
export async function signVaultDocument(admin, { profileId, documentId, seconds = 60 }) {
  const { data, error } = await admin.from(DOCS).select('id, storage_path, mime, kind').eq('id', documentId).eq('tenant_profile_id', profileId).is('deleted_at', null).maybeSingle();
  if (error) { if (vaultAbsent(error)) return { ok: false, reason: 'missing' }; throw error; }
  if (!data) return { ok: false, reason: 'missing' };
  if (!SHARE_DOCUMENT_KINDS.includes(data.kind)) return { ok: false, reason: 'refused' };
  const { data: signed, error: sErr } = await admin.storage.from(VAULT_BUCKET).createSignedUrl(data.storage_path, seconds, { download: false });
  if (sErr || !signed?.signedUrl) { logServerError('[vault/sign]', sErr || new Error('no url'), {}); return { ok: false, reason: 'failed' }; }
  return { ok: true, url: signed.signedUrl, mime: data.mime, kind: data.kind };
}
