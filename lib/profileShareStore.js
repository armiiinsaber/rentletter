// lib/profileShareStore.js  SERVER ONLY (takes the service role client). The one read of a
// tenant's profile on behalf of a realtor (docs/design/profile-and-circle.md sections 4.12 and
// 6.2). It reads the view public.tenant_profile_shareable (db/015-profile-verified-email.sql),
// never the table public.tenant_profiles: the table holds each application's owner token
// (applications) and every answer the tenant typed, and the view holds neither. What comes back
// is lib/profileFacts.js sharePayload, checked by assertSharePayload before it is returned.
//
// A realtor reads through a share (db/019-profile-shares.sql, lib/profileShares.js) and in no
// other way. readSharedProfile and openSharedDocument are the two reads; both check the share
// first (the realtor asking is its recipient, the tenant approved it, it has not ended), both
// write a line to the tenant's own log BEFORE they answer, and a read that cannot be logged is
// refused. tests/profileFacts.test.mjs fails if realtor facing code reads the table instead.
//
//   readShareableProfile(admin, profileId, checks) -> { ok: true, payload } | { ok: false, reason }
//     reason: 'absent' (db/015 has not run), 'not found', 'failed'
//   readSharedProfile(admin, { share, viewer, now }) -> { ok: true, payload, documents } | { ok: false, reason }
//     reason: 'no share' | 'not yours' | 'ended' | 'not logged' | the reasons above
//   openSharedDocument(admin, { share, viewer, documentId, now }) -> { ok: true, url, mime, kind } | { ok: false, reason }
//     reason: as above, and 'closed' (documents are not in this share, or their 14 days are over),
//     'missing'. An ID is never opened through a pass on.
//   viewer: { id, label } the signed in realtor and their name and brokerage, for the log.
import { sharePayload, assertSharePayload } from './profileFacts.js';
import { shareLive, documentsOpen } from './profileShares.js';
import { logVault, shareableChecks, shareableDocuments, signVaultDocument } from './tenantVault.js';

export const SHAREABLE_VIEW = 'tenant_profile_shareable';
export const SHAREABLE_COLUMNS = 'id, facts, facts_updated_at, email_verified_at';
const msg = (e) => String((e && e.message) || e || '');
export const viewAbsent = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204' || /(does not exist|could not find|schema cache)/i.test(msg(e)));

export async function readShareableProfile(admin, profileId, checks = []) {
  try {
    if (!admin || !profileId) return { ok: false, reason: 'not found' };
    const { data, error } = await admin.from(SHAREABLE_VIEW).select(SHAREABLE_COLUMNS).eq('id', String(profileId)).maybeSingle();
    if (error) return { ok: false, reason: viewAbsent(error) ? 'absent' : 'failed' };
    if (!data) return { ok: false, reason: 'not found' };
    return { ok: true, payload: assertSharePayload(sharePayload(data, checks)) };
  } catch (e) { return { ok: false, reason: 'failed' }; }
}

// The check every read through a share starts with. No row, no read.
function shareRefusal(share, viewer, now) {
  if (!share || !share.id) return 'no share';
  if (!viewer || !viewer.id || String(share.recipient_profile_id) !== String(viewer.id)) return 'not yours';
  if (!shareLive(share, now)) return 'ended';
  return null;
}
const scoped = (share, part) => Array.isArray(share.scope) && share.scope.includes(part);

// THE read of a tenant's profile for a realtor: the whitelisted facts and the facts read from
// documents, each with its source and date, and the list of files the share may open. Logged
// first, as profile_viewed, with the realtor's name as it is now.
export async function readSharedProfile(admin, { share, viewer, now = new Date() }) {
  try {
    const refused = shareRefusal(share, viewer, now);
    if (refused) return { ok: false, reason: refused };
    const at = new Date(now).toISOString();
    const logged = await logVault(admin, { profileId: share.tenant_profile_id, action: 'profile_viewed', actor: 'realtor', shareId: share.id, actorProfileId: viewer.id, actorLabel: viewer.label, at });
    if (!logged) return { ok: false, reason: 'not logged' };
    const checks = scoped(share, 'checks') ? await shareableChecks(admin, share.tenant_profile_id) : [];
    const read = await readShareableProfile(admin, share.tenant_profile_id, checks);
    if (!read.ok) return read;
    if (!scoped(share, 'facts')) read.payload.facts = [];
    const documents = documentsOpen(share, now) ? (await shareableDocuments(admin, share.tenant_profile_id)).filter((d) => share.purpose === 'application' || d.kind !== 'id') : [];
    return { ok: true, payload: assertSharePayload(read.payload), documents, documentsUntil: documents.length ? share.documents_until : null };
  } catch (e) { return { ok: false, reason: 'failed' }; }
}

// One stored file, opened through a share: only while documents are in the share and its 14 days
// run, only a file of that tenant, never an ID on a pass on. Logged first, as document_opened;
// then a 60 second link.
export async function openSharedDocument(admin, { share, viewer, documentId, now = new Date() }) {
  try {
    const refused = shareRefusal(share, viewer, now);
    if (refused) return { ok: false, reason: refused };
    if (!documentsOpen(share, now)) return { ok: false, reason: 'closed' };
    const allowed = (await shareableDocuments(admin, share.tenant_profile_id)).find((d) => String(d.id) === String(documentId) && (share.purpose === 'application' || d.kind !== 'id'));
    if (!allowed) return { ok: false, reason: 'missing' };
    const logged = await logVault(admin, { profileId: share.tenant_profile_id, action: 'document_opened', actor: 'realtor', shareId: share.id, actorProfileId: viewer.id, actorLabel: viewer.label, documentId: allowed.id, at: new Date(now).toISOString() });
    if (!logged) return { ok: false, reason: 'not logged' };
    return await signVaultDocument(admin, { profileId: share.tenant_profile_id, documentId: allowed.id, seconds: 60 });
  } catch (e) { return { ok: false, reason: 'failed' }; }
}
