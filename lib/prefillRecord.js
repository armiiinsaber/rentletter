// lib/prefillRecord.js  Where a submitted application's answers came from, recorded by the
// server at submit (docs/design/profile-and-circle.md section 5, db/014-prefill-record.sql), so
// lib/kpis.js can count true profile reuse.
//
// The browser never says where its answers came from. When the apply page fills the form from
// somewhere, the server hands it a single use TICKET that holds the source (and, for a profile,
// the profile id and its revision). The page sends the ticket back with the submission; the
// mirror (pages/api/applications/mirror.js) reads it, checks it belongs to this tenant, writes the
// columns once and deletes it. No ticket means the form was typed fresh: 'none'.
//
//   PREFILL_SOURCE                         the closed list (the CHECK in db/014 holds the same)
//   prefillColumns({ ticket, session, appEmail })   PURE: the five columns for one application
//   mintTicket(payload), readTicket(id), deleteTicket(id)   KV, 48 hours, single use
//   sessionProof(req)                      the signed in tenant: { profileId, email, provedAt } | null
//   recordPrefill(admin, { applicationId, ticketId, req })  the write; never throws
//
// A ticket is bound to whoever may use it:
//   bound 'session'  minted for a signed in tenant: at submit the same profile must be signed in
//   bound 'email'    minted from a Pipeline invite on the server: the application's email must be
//                    the profile's email
//   bound 'none'     previous_application and pipeline_invite carry no profile and need no check
// A ticket that fails its check is ignored: the application is recorded as typed fresh.
// email_verified_at_submit is separate from the source: it is when the signed in tenant proved
// the address (the magic link that opened the session), set only when that address is the one on
// the application. Never an owner token, a fact or an email in a ticket: ids and a hash only.
import crypto from 'crypto';
import { kvGet, kvCommand, kvExpire, kvConfigured } from './kv.js';

export const PREFILL_SOURCE = Object.freeze({ NONE: 'none', PROFILE: 'profile', PREVIOUS_APPLICATION: 'previous_application', PIPELINE_INVITE: 'pipeline_invite', PASS_ON: 'pass_on' });
export const PREFILL_SOURCES = Object.freeze(Object.values(PREFILL_SOURCE));
// The sources that are the tenant reusing their profile (the ones the KPI counts).
export const PROFILE_SOURCES = Object.freeze([PREFILL_SOURCE.PROFILE, PREFILL_SOURCE.PASS_ON]);
export const isProfileSource = (s) => PROFILE_SOURCES.includes(s);
export const TICKET_TTL = 48 * 3600;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
export const isTicketId = (v) => TICKET.test(String(v || ''));
const ticketKey = (id) => `prefillticket:${id}`;
const norm = (e) => String(e || '').trim().toLowerCase();
export const emailHash = (email) => crypto.createHash('sha256').update(norm(email)).digest('hex').slice(0, 32);

// PURE. ticket: what readTicket returned (or null). session: what sessionProof returned (or
// null). appEmail: the email on the application. Returns the columns db/014 adds.
export function prefillColumns({ ticket = null, session = null, appEmail = '' } = {}) {
  let source = PREFILL_SOURCE.NONE; let profileId = null; let revision = null;
  const t = ticket && PREFILL_SOURCES.includes(ticket.source) ? ticket : null;
  if (t && isProfileSource(t.source)) {
    const rev = Number(t.revision);
    const whole = !!t.profileId && Number.isInteger(rev) && rev >= 0;
    const mine = t.bound === 'session' ? !!session && String(session.profileId) === String(t.profileId)
      : t.bound === 'email' ? !!t.emailKey && !!norm(appEmail) && t.emailKey === emailHash(appEmail)
        : false;
    if (whole && mine) { source = t.source; profileId = String(t.profileId); revision = rev; }
  } else if (t && t.source !== PREFILL_SOURCE.NONE) {
    source = t.source;
  }
  const proved = !!session && !!norm(session.email) && norm(session.email) === norm(appEmail);
  return {
    prefill_source: source,
    prefill_profile_id: profileId,
    prefill_profile_revision: revision,
    email_verified_at_submit: proved ? (session.provedAt || null) : null,
    // The kinds of document check sent with the application. The profile holds no documents yet
    // (the vault is a later phase), so a reuse today is of typed answers: an empty list.
    reused_checks: profileId ? [] : null,
  };
}

// ── tickets (KV) ────────────────────────────────────────────────────────────────────────────
export async function mintTicket(payload, { command = kvCommand, expire = kvExpire, ready = kvConfigured, now = () => new Date() } = {}) {
  if (!ready() || !payload || !PREFILL_SOURCES.includes(payload.source)) return null;
  const id = crypto.randomBytes(32).toString('base64url');
  const rec = { source: payload.source, bound: payload.bound || 'none', profileId: payload.profileId || null, revision: payload.revision ?? null, emailKey: payload.emailKey || null, createdAt: now().toISOString() };
  // The same two calls every KV write here makes: the JSON body, then the expiry.
  const ok = await command(['set', ticketKey(id)], rec);
  if (!ok) return null;
  await expire(ticketKey(id), TICKET_TTL);
  return id;
}
export async function readTicket(id, { get = kvGet } = {}) {
  if (!isTicketId(id)) return null;
  const rec = await get(ticketKey(id));
  return rec && typeof rec === 'object' ? rec : null;
}
export async function deleteTicket(id, { command = kvCommand } = {}) {
  if (!isTicketId(id)) return;
  await command(['del', ticketKey(id)]);
}

// ── the signed in tenant ───────────────────────────────────────────────────────────────────
// The tenant session cookie (lib/tenantProfileStore.js: rl_tenant, tsession:{sha256(token)} →
// { profileId, createdAt }). createdAt is when the magic link was consumed: the proof of the
// address. Read here and not through sessionProfile, which does not return it.
export async function sessionProof(req, { get = kvGet } = {}) {
  try {
    const raw = String(req?.headers?.cookie || '');
    let token = null;
    for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === 'rl_tenant') token = decodeURIComponent(v.join('=')); }
    if (!token) return null;
    const s = await get(`tsession:${crypto.createHash('sha256').update(String(token)).digest('hex')}`);
    if (!s || !s.profileId) return null;
    const key = await get(`tprofile_id:${s.profileId}`);
    const profile = key ? await get(`tprofile:${key}`) : null;
    if (!profile || !profile.email) return null;
    return { profileId: String(s.profileId), email: norm(profile.email), revision: Number(profile.profileRevision) || 0, provedAt: s.createdAt || null };
  } catch (e) { return null; }
}

// The columns are not there yet (db/014 has not run).
export const prefillAbsent = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /prefill_source|prefill_profile|email_verified_at_submit|reused_checks/.test(String(e.message || '')));

// SERVER. Writes the record on one application, once: a row that already holds a source is left
// alone, so a repeated mirror call (a retry, a refresh) changes nothing and can never turn a
// reuse into 'none' after its ticket was spent. admin is the service role client. Never throws,
// and before db/014 has run it writes nothing.
export async function recordPrefill(admin, { applicationId, ticketId = null, req = null } = {}, deps = {}) {
  const { read = readTicket, drop = deleteTicket, proof = sessionProof } = deps;
  try {
    if (!admin || !applicationId) return { written: false, reason: 'no application' };
    const { data: row, error } = await admin.from('applications').select('email, prefill_source').eq('id', applicationId).maybeSingle();
    if (error) return { written: false, reason: prefillAbsent(error) ? 'absent' : 'read failed' };
    if (!row) return { written: false, reason: 'no application' };
    if (row.prefill_source) return { written: false, reason: 'already recorded' };
    const [ticket, session] = await Promise.all([ticketId ? read(ticketId) : null, proof(req)]);
    const columns = prefillColumns({ ticket, session, appEmail: row.email });
    const { error: writeError } = await admin.from('applications').update(columns).eq('id', applicationId).is('prefill_source', null);
    if (writeError) return { written: false, reason: prefillAbsent(writeError) ? 'absent' : 'write failed' };
    if (ticketId) await drop(ticketId);
    return { written: true, columns };
  } catch (e) { return { written: false, reason: 'failed' }; }
}
