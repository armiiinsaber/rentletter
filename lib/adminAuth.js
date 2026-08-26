// lib/adminAuth.js
// SERVER-ONLY. Founder-only admin gate for /admin. Single password from ADMIN_PASSWORD —
// never hardcoded, never logged, never returned. Compared in constant time on equal-length
// SHA-256 digests. Successful login → 1-year session token (crypto.randomBytes, stored HASHED in
// KV: asession:{sha256(token)}) in an HttpOnly; Secure; SameSite=Strict cookie.
// Every /api/admin/* route and the /admin page call requireAdmin() server-side.
// Actions are appended to KV admin_audit (capped list) so deletions leave a trail.
import crypto from 'crypto';
import { kvGet } from './kv';
import { rateLimited, clientIp, newToken } from './tenantProfileStore';

export const ADMIN_COOKIE = 'rl_admin';
// One year: the founder signs in once per device. Each sign-in mints its own token (its own KV
// key), so sessions are per device — signing out revokes that key only. No recovery flow by
// design: a lost password is rotated via ADMIN_PASSWORD in Vercel + redeploy.
export const ADMIN_SESSION_TTL = 365 * 24 * 3600;
const base = () => (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const auth = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
const hashHex = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

export const adminConfigured = () => !!process.env.ADMIN_PASSWORD && !!base() && !!process.env.KV_REST_API_TOKEN;

async function kvSet(key, value, ttl) {
  const r = await fetch(`${base()}/set/${key}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`KV set ${r.status}`);
  if (ttl) await fetch(`${base()}/expire/${key}/${ttl}`, { method: 'POST', headers: auth() });
}
async function kvDel(key) { try { await fetch(`${base()}/del/${key}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }

// Constant-time password check. Hashing both sides first means length never leaks.
export function passwordMatches(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== 'string' || !candidate) return false;
  return crypto.timingSafeEqual(sha(candidate), sha(expected));
}

export async function loginRateLimited(req) {
  return rateLimited('admin:login', clientIp(req), 5, 900); // 5 per 15 min per IP
}

export async function createAdminSession() {
  const t = newToken();
  await kvSet(`asession:${hashHex(t)}`, { createdAt: new Date().toISOString() }, ADMIN_SESSION_TTL);
  return t;
}
function readCookie(req) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === ADMIN_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}
export function setAdminCookie(res, token, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : ADMIN_SESSION_TTL}${secure}`);
}
export async function destroyAdminSession(req) { const t = readCookie(req); if (t) await kvDel(`asession:${hashHex(t)}`); }

// True when the request carries a live admin session. Pages + API routes call this.
export async function isAdmin(req) {
  if (!adminConfigured()) return false;
  const t = readCookie(req);
  if (!t || t.length < 20) return false;
  const s = await kvGet(`asession:${hashHex(t)}`);
  return !!s;
}
export async function requireAdmin(req, res) {
  if (await isAdmin(req)) return true;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(401).json({ error: 'Not signed in.' });
  return false;
}

// Audit trail: newest first, capped at 500 entries. Never contains tenant PII.
export async function audit(req, action, details = {}) {
  try {
    const entry = { at: new Date().toISOString(), action, ip: clientIp(req), ...details };
    await fetch(`${base()}/lpush/admin_audit/${encodeURIComponent(JSON.stringify(entry))}`, { method: 'POST', headers: auth() });
    await fetch(`${base()}/ltrim/admin_audit/0/499`, { method: 'POST', headers: auth() });
  } catch (e) { console.error('[admin] audit write failed', e?.message || e); }
}
export async function readAudit(limit = 50) {
  try {
    const r = await fetch(`${base()}/lrange/admin_audit/0/${limit - 1}`, { headers: auth() });
    const d = await r.json();
    return (Array.isArray(d?.result) ? d.result : []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}
