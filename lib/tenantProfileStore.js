// lib/tenantProfileStore.js
// SERVER-ONLY. The unified tenant profile: ONE profile per email, holding the durable facts a
// tenant reuses across listings, plus the list of applications they've submitted.
//
// MODEL — profile is the SOURCE, applications are SNAPSHOTS:
//   • A submitted application (app:{RL} in KV, mirrored to Supabase `applications`) is frozen at
//     what the realtor received. Editing the PROFILE never touches it.
//   • A new submission refreshes the profile's facts (the tenant just reviewed+confirmed them —
//     they are the most current truth) and appends the application to the profile's list.
//   • The per-application edit path (/api/application/manage `update`, owner-token auth) still
//     edits THAT snapshot in place and is flagged realtor-side as "edited after verification".
//
// STORAGE (graceful before db/tenant-profiles.sql runs):
//   KV (Upstash, same store as app:{RL}) is always written and read first:
//     tprofile:{emailKey}      → profile record                      (TTL 2y, refreshed on access)
//     tprofile_id:{profileId}  → emailKey pointer (sessions key by id so an email change is cheap)
//     tprofile_apps:{emailKey} → list of RLs (email → applications index)
//     tprofile_rl:{RL}         → profileId (snapshot → profile; survives an email change)
//     tprofile_alias:{emailKey}→ profileId for an email the profile USED to have
//     tmagic:{sha256(token)}   → { email }        15-min single-use recovery link
//     tsession:{sha256(token)} → { profileId }    30-day session (httpOnly cookie)
//     temail:{sha256(token)}   → { profileId, newEmail }  60-min email-change confirmation
//     trl:{scope}:{bucket}     → rate-limit counters
//   Supabase `tenant_profiles` (service role only) is the DURABLE copy: written through on every
//   save, read when KV has expired. If the table doesn't exist yet, writes/reads are skipped
//   with a one-line warning and KV alone carries the feature.
//
// Tokens are generated with crypto.randomBytes and stored HASHED — a KV dump yields nothing
// usable, and tokens are never logged.
import crypto from 'crypto';
import { kvGet, kvIncr, kvExpire } from './kv';
import { formFromApplication, EMPTY_FORM } from './tenantProfile';
import { getSupabaseAdminClient } from './supabase/admin';
import { isSupabaseConfigured } from './supabase/server';

const PROFILE_TTL = 2 * 365 * 24 * 3600;
export const MAGIC_TTL = 15 * 60;
export const SESSION_TTL = 30 * 24 * 3600;
export const EMAIL_CHANGE_TTL = 60 * 60;
export const COOKIE_NAME = 'rl_tenant';

const base = () => (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const auth = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });
export const kvReady = () => !!(base() && process.env.KV_REST_API_TOKEN);

async function kvSet(key, value, ttl) {
  const r = await fetch(`${base()}/set/${key}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`KV set ${r.status}`);
  if (ttl) await fetch(`${base()}/expire/${key}/${ttl}`, { method: 'POST', headers: auth() });
}
async function kvDel(key) { try { await fetch(`${base()}/del/${key}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLpush(key, value) { try { await fetch(`${base()}/lpush/${key}/${encodeURIComponent(value)}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLrange(key) {
  try { const r = await fetch(`${base()}/lrange/${key}/0/-1`, { headers: auth() }); const d = await r.json(); return Array.isArray(d?.result) ? d.result : []; } catch (e) { return []; }
}

// ── keys, tokens ────────────────────────────────────────────────────────────────────────
export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(e));
export const emailKey = (email) => crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 32);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
const newId = () => crypto.randomUUID();

// ── Supabase (durable copy; tolerant of the table not existing yet) ─────────────────────
let tableMissing = false;
function admin() { return isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null; }
function isMissingTable(err) { return /tenant_profiles|schema cache|relation .* does not exist/i.test(String(err?.message || '')); }
async function dbUpsert(profile) {
  const a = admin(); if (!a || tableMissing) return false;
  const row = {
    id: profile.id, email: profile.email, email_key: profile.emailKey,
    facts: profile.facts, applications: profile.applications,
    facts_updated_at: profile.factsUpdatedAt, profile_revision: profile.profileRevision,
    created_at: profile.createdAt, updated_at: profile.updatedAt,
  };
  const { error } = await a.from('tenant_profiles').upsert(row, { onConflict: 'id' });
  if (error) {
    if (isMissingTable(error)) { tableMissing = true; console.warn('[tenantProfileStore] tenant_profiles table missing — run db/tenant-profiles.sql (KV-only until then)'); }
    else console.error('[tenantProfileStore] upsert failed', error.message);
    return false;
  }
  return true;
}
async function dbGet(col, val) {
  const a = admin(); if (!a || tableMissing) return null;
  const { data, error } = await a.from('tenant_profiles').select('*').eq(col, val).maybeSingle();
  if (error) { if (isMissingTable(error)) tableMissing = true; return null; }
  if (!data) return null;
  return {
    id: data.id, email: data.email, emailKey: data.email_key, facts: data.facts || {}, applications: data.applications || [],
    factsUpdatedAt: data.facts_updated_at, profileRevision: data.profile_revision || 0, createdAt: data.created_at, updatedAt: data.updated_at,
  };
}
async function dbDelete(id) { const a = admin(); if (!a || tableMissing) return; try { await a.from('tenant_profiles').delete().eq('id', id); } catch (e) { /* ignore */ } }

// ── profile CRUD ────────────────────────────────────────────────────────────────────────
export function blankProfile(email) {
  const now = new Date().toISOString();
  return { id: newId(), email: normalizeEmail(email), emailKey: emailKey(email), facts: null, factsUpdatedAt: null, factsSource: null, applications: [], profileRevision: 0, createdAt: now, updatedAt: now, pendingEmail: null };
}

export async function getProfileByEmail(email) {
  if (!kvReady()) return null;
  const key = emailKey(email);
  let p = await kvGet(`tprofile:${key}`);
  if (!p) { p = await dbGet('email_key', key); if (p) await saveProfile(p, { db: false }); }
  if (!p) { const aliasId = await kvGet(`tprofile_alias:${key}`); if (aliasId) p = await getProfileById(aliasId); } // email was changed
  return p;
}
export async function getProfileById(id) {
  if (!kvReady() || !id) return null;
  const key = await kvGet(`tprofile_id:${id}`);
  if (key) { const p = await kvGet(`tprofile:${key}`); if (p) return p; }
  const p = await dbGet('id', id);
  if (p) await saveProfile(p, { db: false });
  return p;
}
export async function saveProfile(profile, { db = true } = {}) {
  profile.updatedAt = new Date().toISOString();
  await kvSet(`tprofile:${profile.emailKey}`, profile, PROFILE_TTL);
  await kvSet(`tprofile_id:${profile.id}`, profile.emailKey, PROFILE_TTL);
  if (db) await dbUpsert(profile);
  return profile;
}

// Facts = the flat form minus listing-specific fields. Kept flat so prefill is a spread.
export function factsFromApplication(app) {
  const f = formFromApplication(app);
  f.apartmentAddress = ''; f.apartmentDescription = '';
  return f;
}
export function cleanFacts(raw) {
  const f = { ...EMPTY_FORM };
  for (const k of Object.keys(EMPTY_FORM)) if (raw && raw[k] !== undefined && k !== 'apartmentAddress' && k !== 'apartmentDescription') f[k] = raw[k];
  f.apartmentAddress = ''; f.apartmentDescription = '';
  return f;
}

// Attach a submitted application to its email's profile (create the profile if needed) and
// refresh the profile facts from it. Idempotent. `app` is the KV app:{RL} record (caller has
// already authenticated: owner token, or the submission itself). Also the LAZY BACKFILL path.
export async function attachApplication(app, { refreshFacts = true, force = false } = {}) {
  if (!kvReady() || !app?.email || !isEmail(app.email) || !app.applicationNumber) return null;
  const rl = String(app.applicationNumber).toUpperCase();
  // The profile that already owns this snapshot wins (an email change leaves the snapshot's
  // email behind); otherwise resolve by email; otherwise create.
  let p = null;
  const ownerId = await kvGet(`tprofile_rl:${rl}`);
  if (ownerId) p = await getProfileById(ownerId);
  if (!p) p = await getProfileByEmail(app.email);
  if (!p) p = blankProfile(app.email);
  const ref = {
    applicationNumber: rl, ownerToken: app.ownerToken || null,
    submittedAt: app.createdAt || null, listingAddress: app.apartment?.address || null, listingDescription: app.apartment?.description || null,
  };
  const i = p.applications.findIndex((x) => x.applicationNumber === rl);
  if (i === -1) p.applications.push(ref); else p.applications[i] = { ...p.applications[i], ...ref };
  p.applications.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  // Newest submission wins — unless the profile was edited more recently than this submission.
  const newer = !p.factsUpdatedAt || !app.createdAt || new Date(app.createdAt) >= new Date(p.factsUpdatedAt);
  if (refreshFacts && (newer || force)) { p.facts = factsFromApplication(app); p.factsUpdatedAt = app.updatedAt || app.createdAt || new Date().toISOString(); p.factsSource = `application:${rl}`; }
  if (p.facts) p.facts.email = p.email; // the profile's sign-in email is the contact email
  await kvLpush(`tprofile_apps:${p.emailKey}`, rl);
  await kvSet(`tprofile_rl:${rl}`, p.id, PROFILE_TTL);
  await saveProfile(p);
  // Best-effort back-link on the mirrored application row (db/tenant-profiles.sql).
  const a = admin();
  if (a && !tableMissing) { try { await a.from('applications').update({ tenant_profile_id: p.id }).eq('application_number', rl); } catch (e) { /* column may not exist yet */ } }
  return p;
}

// Email → application numbers we know about: KV index ∪ mirrored Supabase rows.
export async function findApplicationNumbersByEmail(email) {
  const set = new Set((await kvLrange(`tprofile_apps:${emailKey(email)}`)).map(String));
  const a = admin();
  if (a) {
    try {
      const { data } = await a.from('applications').select('application_number').eq('email', normalizeEmail(email)).limit(50);
      for (const r of data || []) if (r.application_number) set.add(r.application_number);
    } catch (e) { /* ignore */ }
  }
  return [...set];
}

// Lazy backfill: build/refresh the profile for an email from every application we can find.
export async function ensureProfileForEmail(email) {
  let p = await getProfileByEmail(email);
  const rls = await findApplicationNumbersByEmail(email);
  const known = new Set((p?.applications || []).map((x) => x.applicationNumber));
  for (const rl of rls) {
    if (known.has(rl)) continue;
    const app = await kvGet(`app:${rl}`);
    if (app && normalizeEmail(app.email) === normalizeEmail(email)) p = await attachApplication(app);
  }
  return p;
}

// ── magic links, sessions, email change ─────────────────────────────────────────────────
export async function createMagicLink(email) {
  const t = newToken();
  await kvSet(`tmagic:${hash(t)}`, { email: normalizeEmail(email), createdAt: new Date().toISOString() }, MAGIC_TTL);
  return t;
}
export async function consumeMagicLink(t) {
  if (!t || String(t).length < 20) return null;
  const k = `tmagic:${hash(t)}`;
  const rec = await kvGet(k);
  if (!rec) return null;
  await kvDel(k); // single-use
  return rec.email || null;
}
export async function createSession(profileId) {
  const t = newToken();
  await kvSet(`tsession:${hash(t)}`, { profileId, createdAt: new Date().toISOString() }, SESSION_TTL);
  return t;
}
export async function destroySession(t) { if (t) await kvDel(`tsession:${hash(t)}`); }

export function readCookie(req, name = COOKIE_NAME) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return null;
}
export function setSessionCookie(res, token, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const val = clear ? '' : encodeURIComponent(token);
  const maxAge = clear ? 0 : SESSION_TTL;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
// Resolve the signed-in tenant from the cookie. Returns the profile or null.
export async function sessionProfile(req) {
  if (!kvReady()) return null;
  const t = readCookie(req);
  if (!t) return null;
  const s = await kvGet(`tsession:${hash(t)}`);
  if (!s?.profileId) return null;
  return getProfileById(s.profileId);
}

export async function createEmailChange(profileId, newEmail) {
  const t = newToken();
  await kvSet(`temail:${hash(t)}`, { profileId, newEmail: normalizeEmail(newEmail), createdAt: new Date().toISOString() }, EMAIL_CHANGE_TTL);
  return t;
}
export async function consumeEmailChange(t) {
  if (!t || String(t).length < 20) return null;
  const k = `temail:${hash(t)}`;
  const rec = await kvGet(k);
  if (!rec) return null;
  await kvDel(k);
  return rec;
}
// Re-key a profile under a new email. Refuses if the new email already has a profile (merge is
// a deliberate non-goal for now — surfaced to the tenant).
export async function applyEmailChange(profileId, newEmail) {
  const p = await getProfileById(profileId);
  if (!p) return { ok: false, reason: 'missing' };
  const existing = await getProfileByEmail(newEmail);
  if (existing && existing.id !== p.id) return { ok: false, reason: 'taken' };
  const oldKey = p.emailKey;
  const oldApps = await kvLrange(`tprofile_apps:${oldKey}`);
  p.email = normalizeEmail(newEmail); p.emailKey = emailKey(newEmail); p.pendingEmail = null;
  if (p.facts) p.facts.email = p.email;
  await saveProfile(p);
  for (const rl of oldApps) await kvLpush(`tprofile_apps:${p.emailKey}`, rl);
  await kvDel(`tprofile:${oldKey}`); await kvDel(`tprofile_apps:${oldKey}`);
  await kvSet(`tprofile_alias:${oldKey}`, p.id, PROFILE_TTL); // snapshots + backfill still resolve
  // If a stray profile was created for the old email in the meantime it is now unreachable by
  // email; nothing references it, and its KV TTL retires it.
  return { ok: true, profile: p };
}

// ── rate limiting (fail-open if KV counters unavailable) ────────────────────────────────
export async function rateLimited(scope, id, limit, windowSec) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `trl:${scope}:${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 24)}:${bucket}`;
  const n = await kvIncr(key);
  if (n === 1) await kvExpire(key, windowSec + 5);
  return n !== null && n > limit;
}
export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

// What the client may see. Owner tokens are included ONLY for the signed-in owner (they are the
// per-application credential the tenant already holds), never anywhere realtor-facing.
export function clientProfile(p) {
  return {
    id: p.id, email: p.email, facts: p.facts ? { ...p.facts, email: p.email } : null, factsUpdatedAt: p.factsUpdatedAt, factsSource: p.factsSource,
    profileRevision: p.profileRevision || 0, createdAt: p.createdAt, pendingEmail: p.pendingEmail || null,
    applications: (p.applications || []).map((a) => ({ ...a })),
  };
}
