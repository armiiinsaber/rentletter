// lib/profileShares.js  SERVER ONLY (takes the service role client).
// Shares: a tenant's permission for one named realtor to read their profile
// (db/019-profile-shares.sql; docs/design/profile-and-circle.md sections 3.1, 4.4 and 6.1).
// A share is a grant to read, never a copy. This file makes, lists, ends and finds shares; the
// read itself is lib/profileShareStore.js, the one reader.
//   · a share is approved in exactly one place here, approveApplicationShare, and only for the
//     tenant whose own session called it (pages/api/tenant/shares.js): the tenant's profile id
//     comes from that session, never from a request. No realtor route calls it, and no function
//     here lets a realtor write a status;
//   · the recipient is fixed when the row is made (the database refuses a change);
//   · stopShare is the tenant's, at any time: the realtor's next read is refused;
//   · an application share lasts while the application is open (any state before accepted); the
//     realtor's documents window is 14 days from approval;
//   · before db/019 has run every function answers "absent", logged once, never thrown.
// Nothing here reads a tenant's facts, and nothing here selects an owner token.
import { logServerError } from './serverLog.js';
import { logVault } from './tenantVault.js';
import { applicantStanding } from './application-state.js';

export const SHARES = 'profile_shares';
export const DOCUMENTS_DAYS = 14;
export const APPLICATION_SCOPE = Object.freeze(['facts', 'checks', 'documents']);
const DAY_MS = 24 * 3600 * 1000;
const msg = (e) => String((e && e.message) || e || '');
let absentLogged = false;
export const sharesAbsent = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/profile_shares/i.test(msg(e)) && /(does not exist|could not find|not found)/i.test(msg(e))));
const noteAbsent = (where) => { if (!absentLogged) { absentLogged = true; console.warn(`[shares] profile_shares is not set up (run db/019-profile-shares.sql); skipped (${where})`); } };

// Is this share one a read may go through, now? Approved, not ended, and not past its own end.
export function shareLive(share, now = new Date()) {
  if (!share || share.status !== 'approved' || share.ended_at) return false;
  return !share.expires_at || Date.parse(share.expires_at) > new Date(now).getTime();
}
export const documentsOpen = (share, now = new Date()) => shareLive(share, now) && Array.isArray(share.scope) && share.scope.includes('documents') && !!share.documents_until && Date.parse(share.documents_until) > new Date(now).getTime();
// An application is open in any state before accepted. A row from before the state column is
// open unless it was withdrawn.
export function applicationOpen(junction) {
  if (!junction) return false;
  const standing = applicantStanding(junction); // the one read of an applicant's standing
  return standing.inPlay && standing.active;
}

// The tenant, signed in, applied to this realtor's listing with their profile: the share is
// approved by that act. One live share per tenant, realtor and listing: a second application to
// the same listing keeps the first.
//   -> { ok: true, share, created } | { ok: false, reason: 'absent' | 'failed' }
export async function approveApplicationShare(admin, { tenantProfileId, recipientProfileId, listingId, now = new Date() }) {
  try {
    if (!tenantProfileId || !recipientProfileId || !listingId) return { ok: false, reason: 'failed' };
    const at = new Date(now).toISOString();
    const found = await admin.from(SHARES).select('*').eq('tenant_profile_id', tenantProfileId).eq('recipient_profile_id', recipientProfileId).eq('purpose', 'application').eq('listing_id', listingId).eq('status', 'approved');
    if (found.error) { if (sharesAbsent(found.error)) { noteAbsent('approve'); return { ok: false, reason: 'absent' }; } throw found.error; }
    const live = (found.data || []).find((s) => shareLive(s, now));
    if (live) return { ok: true, share: live, created: false };
    const row = { tenant_profile_id: tenantProfileId, recipient_profile_id: recipientProfileId, purpose: 'application', listing_id: listingId, status: 'approved', scope: [...APPLICATION_SCOPE], approved_at: at, approved_via: 'session', documents_until: new Date(new Date(now).getTime() + DOCUMENTS_DAYS * DAY_MS).toISOString(), expires_at: null, ended_at: null, created_at: at };
    const ins = await admin.from(SHARES).insert(row).select('*').maybeSingle();
    if (ins.error) { if (sharesAbsent(ins.error)) { noteAbsent('approve'); return { ok: false, reason: 'absent' }; } throw ins.error; }
    const share = ins.data || row;
    await logVault(admin, { profileId: tenantProfileId, action: 'share_approved', actor: 'tenant', shareId: share.id, at });
    return { ok: true, share, created: true };
  } catch (e) { logServerError('[shares/approve]', e, {}); return { ok: false, reason: 'failed' }; }
}

// The tenant stops one of their own shares. The realtor's next read is refused.
//   -> { ok: true } | { ok: false, reason: 'absent' | 'missing' }
export async function stopShare(admin, { tenantProfileId, id, now = new Date() }) {
  const { data, error } = await admin.from(SHARES).select('id, status, ended_at').eq('id', id).eq('tenant_profile_id', tenantProfileId).maybeSingle();
  if (error) { if (sharesAbsent(error)) { noteAbsent('stop'); return { ok: false, reason: 'absent' }; } throw error; }
  if (!data || data.status !== 'approved' || data.ended_at) return { ok: false, reason: 'missing' };
  const at = new Date(now).toISOString();
  const up = await admin.from(SHARES).update({ status: 'revoked', ended_at: at }).eq('id', id).eq('tenant_profile_id', tenantProfileId);
  if (up.error) throw up.error;
  await logVault(admin, { profileId: tenantProfileId, action: 'share_revoked', actor: 'tenant', shareId: id, at });
  return { ok: true };
}

// A share ended on its own (its application is no longer open, or its date passed).
export async function expireShare(admin, share, { now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  const up = await admin.from(SHARES).update({ status: 'expired', ended_at: at }).eq('id', share.id).eq('status', 'approved');
  if (up.error) { logServerError('[shares/expire]', up.error, {}); return; }
  await logVault(admin, { profileId: share.tenant_profile_id, action: 'share_expired', actor: 'system', shareId: share.id, at });
}

// The tenant's own list: every share of theirs, newest first, each with the realtor's name and
// brokerage and the listing it is for.  -> { available, shares }
export async function listTenantShares(admin, tenantProfileId, { now = new Date() } = {}) {
  const { data, error } = await admin.from(SHARES).select('*').eq('tenant_profile_id', tenantProfileId).order('created_at', { ascending: false }).limit(50);
  if (error) { if (sharesAbsent(error)) { noteAbsent('list'); return { available: false, shares: [] }; } throw error; }
  const rows = data || [];
  const realtorIds = [...new Set(rows.map((r) => r.recipient_profile_id).filter(Boolean))];
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))];
  const realtors = new Map(); const listings = new Map();
  if (realtorIds.length) { const r = await admin.from('profiles').select('id, full_name, brokerage').in('id', realtorIds); for (const p of r.data || []) realtors.set(p.id, p); }
  if (listingIds.length) { const r = await admin.from('listings').select('id, name, address').in('id', listingIds); for (const l of r.data || []) listings.set(l.id, l); }
  return {
    available: true,
    shares: rows.map((s) => {
      const r = realtors.get(s.recipient_profile_id) || {}; const l = listings.get(s.listing_id) || {};
      return { id: s.id, purpose: s.purpose, realtorName: String(r.full_name || '').trim() || 'A realtor', realtorBrokerage: String(r.brokerage || '').trim() || null, listingName: String(l.name || l.address || '').trim() || null, approvedAt: s.approved_at || null, documentsUntil: documentsOpen(s, now) ? s.documents_until : null, live: shareLive(s, now), status: s.status, endedAt: s.ended_at || null };
    }),
  };
}

// For a realtor's applicant: the share, if any, this tenant gave this realtor for this listing.
// The newest row wins, so a stopped share is found and said. tenantProfileId: from the
// application's own record of the profile it was made from.
//   -> { share } | { share: null } | { absent: true }
export async function shareForApplicant(admin, { recipientProfileId, listingId, tenantProfileId }) {
  if (!recipientProfileId || !listingId || !tenantProfileId) return { share: null };
  const { data, error } = await admin.from(SHARES).select('*').eq('recipient_profile_id', recipientProfileId).eq('tenant_profile_id', tenantProfileId).eq('listing_id', listingId).eq('purpose', 'application').order('created_at', { ascending: false }).limit(1);
  if (error) { if (sharesAbsent(error)) { noteAbsent('find'); return { absent: true, share: null }; } throw error; }
  return { share: (data || [])[0] || null };
}
