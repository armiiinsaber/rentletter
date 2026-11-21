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
//   · a share made by one tap apply is said on the realtor's timeline (profile_share_approved),
//     and so is the tenant stopping it (profile_share_revoked), on that applicant's own line of
//     the timeline: the event names the tenant and the listing and holds no fact of the profile;
//   · the application a share was made with records the kinds of document check the share
//     carries (applications.reused_checks, db/014), so the office counts reused documents;
//   · before db/019 has run every function answers "absent", logged once, never thrown.
//   · a share has a role (db/024-share-roles.sql): realtor ("Your realtor": the realtor of the
//     listing the tenant applied to) or listing_agent ("Listing agent": another realtor the tenant
//     chose for that unit). Both are made by the tenant's own session and by nothing else: no
//     function here takes a realtor's word for a tenant, and a listing agent invited by email
//     gets nothing until they have an account and the tenant then shares with them;
//   · a listing agent share carries, beside the profile, the screening score the tenant's
//     application holds on that listing (Fit, lib/fitScore.js): the number, its label and how
//     much was assessed, and nothing else of the realtor's file. The tenant's private profile
//     strength is not in this file, in any share, or in anything a realtor is sent.
// Nothing here reads a tenant's facts, and nothing here selects an owner token.
import { logServerError } from './serverLog.js';
import { logVault, shareableChecks } from './tenantVault.js';
import { applicantStanding } from './application-state.js';
import { recordEvent } from './events.js';
import { displayLabel } from './listingAddress.js';
import { PROFILE_CHECK_KINDS } from './profileFacts.js';

export const SHARES = 'profile_shares';
export const INVITES = 'profile_share_invites';
export const ROLE = Object.freeze({ REALTOR: 'realtor', LISTING_AGENT: 'listing_agent' });
export const ROLE_LABEL = Object.freeze({ realtor: 'Your realtor', listing_agent: 'Listing agent' });
// A share from before db/024 has no role: it is one with the tenant's realtor.
// What a tenant is shown of a realtor they might share with: a name, a brokerage and initials,
// the same three things a realtor's own Circle search shows (lib/circle.js publicCard).
const publicCard = (p) => { const name = String((p && p.full_name) || '').trim(); const parts = name.split(/\s+/).filter(Boolean); return { id: p.id, name: name || 'Name not added yet', brokerage: String((p && p.brokerage) || '').trim() || null, initials: ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?' }; };
export const roleOf = (share) => (share && share.role === ROLE.LISTING_AGENT ? ROLE.LISTING_AGENT : ROLE.REALTOR);
const roleAbsent = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /role/i.test(msg(e))) && /(does not exist|could not find|schema cache)/i.test(msg(e));
const invitesAbsent = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/profile_share_invites/i.test(msg(e)) && /(does not exist|could not find|not found)/i.test(msg(e))));
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

// The realtor's own applicant a share is about: the application on the share's listing that
// records this tenant's profile as the one it was made from (db/014 prefill_profile_id, else the
// back link tenant_profile_id, the same two ids lib/profileShareRoutes.js reads). The newest
// wins. Three columns of the application are selected, and never its owner token.
//   -> { linkId, applicationId, name, fromProfile } | null
async function applicantOfShare(admin, { tenantProfileId, listingId }) {
  try {
    const links = await admin.from('listing_applicants').select('id, application_id, created_at').eq('listing_id', listingId);
    const ids = (links.data || []).map((l) => l.application_id).filter(Boolean);
    if (links.error || !ids.length) return null;
    let apps = await admin.from('applications').select('id, full_name, prefill_profile_id, tenant_profile_id').in('id', ids);
    if (apps.error) apps = await admin.from('applications').select('id, full_name, tenant_profile_id').in('id', ids);
    const mine = new Map((apps.data || []).filter((a) => String(a.prefill_profile_id || a.tenant_profile_id || '') === String(tenantProfileId)).map((a) => [a.id, a]));
    const link = [...links.data].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).find((l) => mine.has(l.application_id));
    if (!link) return null;
    const app = mine.get(link.application_id);
    return { linkId: link.id, applicationId: app.id, name: String(app.full_name || '').trim() || null, fromProfile: String(app.prefill_profile_id || '') === String(tenantProfileId) };
  } catch (e) { logServerError('[shares/applicant]', e, {}); return null; }
}

// One line on the realtor's timeline, on that applicant: who, and for which listing. No fact of
// the profile is in it. Never throws; with no applicant to put it on, nothing is written.
async function noteOnTimeline(admin, share, type) {
  try {
    const who = await applicantOfShare(admin, { tenantProfileId: share.tenant_profile_id, listingId: share.listing_id });
    if (!who) return;
    const { data: listing } = await admin.from('listings').select('id, name, address').eq('id', share.listing_id).maybeSingle();
    const listingName = displayLabel(listing) || (listing && listing.address) || null;
    // Which kind of share it was (db/024). A listing agent's line names the tenant and the unit and
    // points at no listing or applicant of theirs: the listing is the tenant's realtor's.
    if (roleOf(share) === ROLE.LISTING_AGENT) await recordEvent(admin, { profileId: share.recipient_profile_id, type, payload: { applicantName: who.name, listingName, role: ROLE.LISTING_AGENT } });
    else await recordEvent(admin, { profileId: share.recipient_profile_id, listingId: share.listing_id, applicationId: who.applicationId, type, payload: { applicantName: who.name, listingName, linkId: who.linkId, role: ROLE.REALTOR } });
  } catch (e) { logServerError('[shares/timeline]', e, {}); }
}

// The reuse record (db/014): the application made with this share says which kinds of document
// check the share carries, so lib/kpis.js counts a reuse of documents. Kinds only, from the
// closed list; only on an application that already records this profile as its source. Never throws.
async function recordReusedChecks(admin, share) {
  try {
    if (!Array.isArray(share.scope) || !share.scope.includes('checks')) return;
    const who = await applicantOfShare(admin, { tenantProfileId: share.tenant_profile_id, listingId: share.listing_id });
    if (!who || !who.fromProfile) return;
    const held = new Set((await shareableChecks(admin, share.tenant_profile_id)).map((c) => c.kind));
    const kinds = PROFILE_CHECK_KINDS.filter((k) => held.has(k));
    if (!kinds.length) return;
    const up = await admin.from('applications').update({ reused_checks: kinds }).eq('id', who.applicationId).eq('prefill_profile_id', share.tenant_profile_id);
    if (up.error) logServerError('[shares/reused]', up.error, {});
  } catch (e) { logServerError('[shares/reused]', e, {}); }
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
    if (live) { await recordReusedChecks(admin, live); return { ok: true, share: live, created: false }; }
    const row = { tenant_profile_id: tenantProfileId, recipient_profile_id: recipientProfileId, purpose: 'application', listing_id: listingId, status: 'approved', scope: [...APPLICATION_SCOPE], approved_at: at, approved_via: 'session', documents_until: new Date(new Date(now).getTime() + DOCUMENTS_DAYS * DAY_MS).toISOString(), expires_at: null, ended_at: null, created_at: at };
    // The role is written where db/024 has run; before it, the row has none and reads as realtor.
    let ins = await admin.from(SHARES).insert({ ...row, role: ROLE.REALTOR }).select('*').maybeSingle();
    if (ins.error && roleAbsent(ins.error)) ins = await admin.from(SHARES).insert(row).select('*').maybeSingle();
    if (ins.error) { if (sharesAbsent(ins.error)) { noteAbsent('approve'); return { ok: false, reason: 'absent' }; } throw ins.error; }
    const share = ins.data || row;
    await logVault(admin, { profileId: tenantProfileId, action: 'share_approved', actor: 'tenant', shareId: share.id, at });
    await recordReusedChecks(admin, share);
    await noteOnTimeline(admin, share, 'profile_share_approved');
    return { ok: true, share, created: true };
  } catch (e) { logServerError('[shares/approve]', e, {}); return { ok: false, reason: 'failed' }; }
}

// The tenant stops one of their own shares. The realtor's next read is refused.
//   -> { ok: true } | { ok: false, reason: 'absent' | 'missing' }
export async function stopShare(admin, { tenantProfileId, id, now = new Date() }) {
  const { data, error } = await admin.from(SHARES).select('*').eq('id', id).eq('tenant_profile_id', tenantProfileId).maybeSingle();
  if (error) { if (sharesAbsent(error)) { noteAbsent('stop'); return { ok: false, reason: 'absent' }; } throw error; }
  if (!data || data.status !== 'approved' || data.ended_at) return { ok: false, reason: 'missing' };
  const at = new Date(now).toISOString();
  const up = await admin.from(SHARES).update({ status: 'revoked', ended_at: at }).eq('id', id).eq('tenant_profile_id', tenantProfileId);
  if (up.error) throw up.error;
  await logVault(admin, { profileId: tenantProfileId, action: 'share_revoked', actor: 'tenant', shareId: id, at });
  if (data.purpose === 'application' && data.listing_id) await noteOnTimeline(admin, data, 'profile_share_revoked');
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
      return { id: s.id, purpose: s.purpose, role: roleOf(s), roleLabel: ROLE_LABEL[roleOf(s)], realtorName: String(r.full_name || '').trim() || 'A realtor', realtorBrokerage: String(r.brokerage || '').trim() || null, listingName: String(l.name || l.address || '').trim() || null, approvedAt: s.approved_at || null, documentsUntil: documentsOpen(s, now) ? s.documents_until : null, live: shareLive(s, now), status: s.status, endedAt: s.ended_at || null };
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

// ── Sharing with the listing agent (db/024-share-roles.sql) ──────────────────────────────────
// Everything below that makes or changes a share is called only by the tenant's own route
// (pages/api/tenant/shares.js), with the tenant's profile id from their session.

// The unit a tenant's application is on: the listing, its realtor, and whether the application
// is still open. Only an application that records this tenant's profile, or carries their
// address, is theirs. Two columns of the application are read, never its owner token.
//   -> { ok: true, listing: { id, label, realtorId }, linkId } | { ok: false, reason: 'missing' | 'closed' }
export async function unitOfApplication(admin, { tenantProfileId, applicationNumber }) {
  let app = await admin.from('applications').select('id, prefill_profile_id, tenant_profile_id').eq('application_number', applicationNumber).maybeSingle();
  if (app.error) app = await admin.from('applications').select('id, tenant_profile_id').eq('application_number', applicationNumber).maybeSingle();
  if (!app.data || String(app.data.prefill_profile_id || app.data.tenant_profile_id || '') !== String(tenantProfileId)) return { ok: false, reason: 'missing' };
  const { data: links } = await admin.from('listing_applicants').select('*').eq('application_id', app.data.id);
  const open = [...(links || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).find((l) => applicationOpen(l));
  if (!open) return { ok: false, reason: (links || []).length ? 'closed' : 'missing' };
  const { data: listing } = await admin.from('listings').select('id, profile_id, name, address').eq('id', open.listing_id).maybeSingle();
  if (!listing || !listing.profile_id) return { ok: false, reason: 'missing' };
  return { ok: true, linkId: open.id, listing: { id: listing.id, label: displayLabel(listing) || listing.address || 'this listing', realtorId: listing.profile_id } };
}

// The same, from the listing: this tenant's open application on it, if they have one.
export async function unitOfListing(admin, { tenantProfileId, listingId }) {
  const who = await applicantOfShare(admin, { tenantProfileId, listingId });
  if (!who) return { ok: false, reason: 'missing' };
  const { data: junction } = await admin.from('listing_applicants').select('*').eq('id', who.linkId).maybeSingle();
  if (!applicationOpen(junction)) return { ok: false, reason: 'closed' };
  const { data: listing } = await admin.from('listings').select('id, profile_id, name, address').eq('id', listingId).maybeSingle();
  if (!listing || !listing.profile_id) return { ok: false, reason: 'missing' };
  return { ok: true, linkId: who.linkId, listing: { id: listing.id, label: displayLabel(listing) || listing.address || 'this listing', realtorId: listing.profile_id } };
}

// The tenant's open applications as units to share for: the listing and its realtor's name.
//   -> [{ applicationNumber, listingName, realtorName }]
export async function unitsOfTenant(admin, { tenantProfileId, applicationNumbers = [] }) {
  const out = [];
  for (const applicationNumber of [...new Set(applicationNumbers)].slice(0, 20)) {
    try {
      const unit = await unitOfApplication(admin, { tenantProfileId, applicationNumber });
      if (!unit.ok) continue;
      const { data: realtor } = await admin.from('profiles').select('full_name').eq('id', unit.listing.realtorId).maybeSingle();
      out.push({ applicationNumber, listingName: unit.listing.label, realtorName: String((realtor && realtor.full_name) || '').trim() || 'Your realtor' });
    } catch (e) { logServerError('[shares/units]', e, {}); }
  }
  return out;
}

// Realtors a tenant may find to share with: by name or brokerage, as a name, a brokerage and
// initials (what a realtor's own Circle search shows, lib/circle.js) and never a
// realtor who turned findable off, a suspended account, or the tenant's own realtor on that unit.
export async function findListingAgents(admin, { q, excludeId = null }) {
  const words = String(q || '').normalize('NFKC').replace(/[%_\\*(),"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (words.length < 2) return { results: [], tooShort: true };
  const cols = 'id, full_name, brokerage, circle_findable, does_rentals, service_areas';
  const read = async (col) => { let r = await admin.from('profiles').select(`${cols}, suspended_at`).ilike(col, `%${words}%`).limit(40); if (r.error) r = await admin.from('profiles').select(cols).ilike(col, `%${words}%`).limit(40); return r; };
  const [byName, byBrokerage] = await Promise.all([read('full_name'), read('brokerage')]);
  if (byName.error || byBrokerage.error) return { results: [], unavailable: true };
  const found = new Map();
  for (const p of [...(byName.data || []), ...(byBrokerage.data || [])]) found.set(String(p.id), p);
  const results = [...found.values()].filter((p) => p.circle_findable !== false && !p.suspended_at && String(p.full_name || '').trim() && String(p.id) !== String(excludeId))
    .map((p) => { const c = publicCard(p); return { id: c.id, name: c.name, brokerage: c.brokerage, initials: c.initials }; })
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
  return { results };
}

// The tenant shares their profile with a listing agent for one of their units. The recipient is
// a realtor with an account who is not that unit's own realtor. One live share per tenant,
// realtor and listing (db/019): asking again keeps the first.
//   -> { ok: true, share, created } | { ok: false, reason: 'absent' | 'self' | 'no realtor' | 'failed' }
export async function approveListingAgentShare(admin, { tenantProfileId, recipientProfileId, listing, now = new Date() }) {
  try {
    if (!tenantProfileId || !recipientProfileId || !listing || !listing.id) return { ok: false, reason: 'failed' };
    if (String(recipientProfileId) === String(listing.realtorId)) return { ok: false, reason: 'self' };
    let who = await admin.from('profiles').select('id, suspended_at').eq('id', recipientProfileId).maybeSingle();
    if (who.error) who = await admin.from('profiles').select('id').eq('id', recipientProfileId).maybeSingle();
    if (!who.data || who.data.suspended_at) return { ok: false, reason: 'no realtor' };
    const at = new Date(now).toISOString();
    const found = await admin.from(SHARES).select('*').eq('tenant_profile_id', tenantProfileId).eq('recipient_profile_id', recipientProfileId).eq('purpose', 'application').eq('listing_id', listing.id).eq('status', 'approved');
    if (found.error) { if (sharesAbsent(found.error)) { noteAbsent('agent'); return { ok: false, reason: 'absent' }; } throw found.error; }
    const live = (found.data || []).find((s) => shareLive(s, now));
    if (live) return { ok: true, share: live, created: false };
    const row = { tenant_profile_id: tenantProfileId, recipient_profile_id: recipientProfileId, purpose: 'application', listing_id: listing.id, role: ROLE.LISTING_AGENT, status: 'approved', scope: [...APPLICATION_SCOPE], approved_at: at, approved_via: 'session', documents_until: new Date(new Date(now).getTime() + DOCUMENTS_DAYS * DAY_MS).toISOString(), expires_at: null };
    const ins = await admin.from(SHARES).insert(row).select('*').maybeSingle();
    // Before db/024 a share cannot say it is a listing agent's, so none is made.
    if (ins.error) { if (sharesAbsent(ins.error) || roleAbsent(ins.error)) { noteAbsent('agent'); return { ok: false, reason: 'absent' }; } throw ins.error; }
    const share = ins.data || row;
    await logVault(admin, { profileId: tenantProfileId, action: 'share_approved', actor: 'tenant', shareId: share.id, at });
    await noteOnTimeline(admin, share, 'profile_share_approved');
    return { ok: true, share, created: true };
  } catch (e) { logServerError('[shares/agent]', e, {}); return { ok: false, reason: 'failed' }; }
}

// A listing agent with no account yet: the tenant's invite. It shares nothing. It records the
// address the tenant typed, so their page can say when that realtor has joined and offer Share.
//   -> { ok: true, invite, created } | { ok: false, reason: 'absent' | 'failed' }
export async function inviteListingAgent(admin, { tenantProfileId, listingId, email, now = new Date() }) {
  try {
    const address = String(email || '').trim().toLowerCase();
    const held = await admin.from(INVITES).select('*').eq('tenant_profile_id', tenantProfileId).eq('listing_id', listingId).eq('email', address).eq('status', 'sent').maybeSingle();
    if (held.error) { if (invitesAbsent(held.error)) return { ok: false, reason: 'absent' }; throw held.error; }
    if (held.data) return { ok: true, invite: held.data, created: false };
    const ins = await admin.from(INVITES).insert({ tenant_profile_id: tenantProfileId, listing_id: listingId, email: address, status: 'sent', created_at: new Date(now).toISOString() }).select('*').maybeSingle();
    if (ins.error) { if (invitesAbsent(ins.error)) return { ok: false, reason: 'absent' }; throw ins.error; }
    return { ok: true, invite: ins.data, created: true };
  } catch (e) { logServerError('[shares/invite]', e, {}); return { ok: false, reason: 'failed' }; }
}
// The tenant's waiting invites, each with whether that address now belongs to a realtor: only
// that yes, and their card, never anything else of the account.
//   -> { available, invites: [{ id, email, listingId, listingName, sentAt, joined: card | null }] }
export async function listListingAgentInvites(admin, tenantProfileId) {
  const { data, error } = await admin.from(INVITES).select('*').eq('tenant_profile_id', tenantProfileId).eq('status', 'sent').order('created_at', { ascending: false }).limit(20);
  if (error) { if (invitesAbsent(error)) return { available: false, invites: [] }; throw error; }
  const rows = data || [];
  const listings = new Map();
  const ids = [...new Set(rows.map((r) => r.listing_id))];
  if (ids.length) { const r = await admin.from('listings').select('id, name, address').in('id', ids); for (const l of r.data || []) listings.set(l.id, l); }
  const invites = [];
  for (const r of rows) {
    let joined = null;
    const found = await admin.from('profiles').select('id, full_name, brokerage, circle_findable, does_rentals, service_areas').eq('email', r.email).maybeSingle();
    if (!found.error && found.data) { const c = publicCard(found.data); joined = { id: c.id, name: c.name, brokerage: c.brokerage, initials: c.initials }; }
    const l = listings.get(r.listing_id) || {};
    invites.push({ id: r.id, email: r.email, listingId: r.listing_id, listingName: displayLabel(l) || l.address || null, sentAt: r.created_at || null, joined });
  }
  return { available: true, invites };
}
// One of the tenant's own invites, ended: cancelled by them, or shared once the realtor joined.
export async function endListingAgentInvite(admin, { tenantProfileId, id, status = 'cancelled', now = new Date() }) {
  const up = await admin.from(INVITES).update({ status, ended_at: new Date(now).toISOString() }).eq('id', id).eq('tenant_profile_id', tenantProfileId).eq('status', 'sent').select('id');
  if (up.error) { if (invitesAbsent(up.error)) return { ok: false, reason: 'absent' }; throw up.error; }
  return (up.data || []).length ? { ok: true } : { ok: false, reason: 'missing' };
}
export async function listingAgentInvite(admin, { tenantProfileId, id }) {
  const { data, error } = await admin.from(INVITES).select('*').eq('id', id).eq('tenant_profile_id', tenantProfileId).eq('status', 'sent').maybeSingle();
  return error ? null : data || null;
}

// ── For the listing agent (pages/api/profile-shares/shared-with-me.js) ──────────────────────
// The shares a tenant gave THIS realtor as listing agent, newest first: which unit and since
// when, and nothing of the tenant (their name is read with the profile, and that read is logged).
//   -> { available, shares: [{ id, listingName, sharedAt, ended }] }
export async function sharesForListingAgent(admin, recipientProfileId) {
  const { data, error } = await admin.from(SHARES).select('*').eq('recipient_profile_id', recipientProfileId).eq('role', ROLE.LISTING_AGENT).order('created_at', { ascending: false }).limit(50);
  if (error) { if (sharesAbsent(error) || roleAbsent(error)) return { available: false, shares: [] }; throw error; }
  const rows = (data || []).filter((s) => s.status === 'approved' || s.status === 'revoked' || s.status === 'expired');
  const listings = new Map();
  const ids = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))];
  if (ids.length) { const r = await admin.from('listings').select('id, name, address').in('id', ids); for (const l of r.data || []) listings.set(l.id, l); }
  return { available: true, shares: rows.map((s) => { const l = listings.get(s.listing_id) || {}; return { id: s.id, listingName: displayLabel(l) || l.address || null, sharedAt: s.approved_at || null, ended: s.status === 'revoked' ? 'stopped' : shareLive(s) ? null : 'ended' }; }) };
}
// One share by its id, for the realtor it names as listing agent and nobody else, with whether
// the application it was made for is still open.
//   -> { share, open } | null
export async function listingAgentShare(admin, { id, recipientProfileId }) {
  const { data, error } = await admin.from(SHARES).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  if (String(data.recipient_profile_id) !== String(recipientProfileId) || roleOf(data) !== ROLE.LISTING_AGENT) return null;
  const who = await applicantOfShare(admin, { tenantProfileId: data.tenant_profile_id, listingId: data.listing_id });
  let open = false;
  if (who) { const { data: junction } = await admin.from('listing_applicants').select('*').eq('id', who.linkId).maybeSingle(); open = applicationOpen(junction); }
  return { share: data, open, applicant: who };
}
// The screening score a listing agent share carries: Fit (lib/fitScore.js) as the tenant's
// application holds it on that listing, read the way the listing's own page reads it. The
// number, its label and how much was assessed: never the checklist, a note, a decision, a rank
// or anything else of the realtor's file, and never the tenant's profile strength.
//   -> { score, label, assessed, of, listingName } | null
export async function screeningForShare(admin, share) {
  try {
    if (roleOf(share) !== ROLE.LISTING_AGENT || !share.listing_id) return null;
    const who = await applicantOfShare(admin, { tenantProfileId: share.tenant_profile_id, listingId: share.listing_id });
    if (!who) return null;
    // Loaded here and not at the top: the listing's own reader, only when a listing agent's view asks.
    const { fetchListingApplicants, attachDocVerifications } = await import('./supabaseBridge.js');
    const applicants = await fetchListingApplicants(admin, share.listing_id);
    await attachDocVerifications(admin, share.listing_id, applicants);
    const mine = (applicants || []).find((a) => String(a.linkId) === String(who.linkId));
    const fit = mine && mine.application ? mine.application.fit : null;
    if (!fit || fit.score == null) return null;
    const { data: listing } = await admin.from('listings').select('id, name, address').eq('id', share.listing_id).maybeSingle();
    return { score: Number(fit.score), label: fit.label || null, assessed: fit.assessed ?? null, of: fit.of ?? null, listingName: displayLabel(listing) || (listing && listing.address) || null };
  } catch (e) { logServerError('[shares/screening]', e, {}); return null; }
}

