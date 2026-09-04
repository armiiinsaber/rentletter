// lib/rateLimit.js
// The public invite link's submission limits, counted in KV with a one hour window: 10 an hour
// per invite token, 30 an hour per IP. The eleventh (or thirty first) gets a 429 with a plain
// message. Pure over an injected counter ({ incr(key) -> count | null, expire(key, seconds) }),
// so it is tested with a mock and fails open when KV is unavailable (incr returns null).
export const LIMITS = Object.freeze({ token: 10, ip: 30, windowSeconds: 3600 });
export const MESSAGES = Object.freeze({
  token: 'Too many applications through this link in the last hour. Please try again later.',
  ip: 'Too many applications from this connection in the last hour. Please try again later.',
});

const bucket = (now) => Math.floor(now / (LIMITS.windowSeconds * 1000));
const clean = (v) => String(v || '').replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 80);

export async function checkSubmitLimits(kv, { token, ip, now = Date.now() } = {}) {
  const checks = [];
  if (token) checks.push({ kind: 'token', key: `rl:apply:token:${clean(token)}:${bucket(now)}`, limit: LIMITS.token });
  if (ip) checks.push({ kind: 'ip', key: `rl:apply:ip:${clean(ip)}:${bucket(now)}`, limit: LIMITS.ip });
  for (const c of checks) {
    let count = null;
    try { count = await kv.incr(c.key); } catch (e) { count = null; }
    if (count == null) continue; // KV unavailable: fail open, never block a tenant on our outage
    if (count === 1) { try { await kv.expire(c.key, LIMITS.windowSeconds); } catch (e) { /* the bucket key already carries the hour */ } }
    if (count > c.limit) return { ok: false, status: 429, kind: c.kind, message: MESSAGES[c.kind], count };
  }
  return { ok: true };
}
