import { note } from './queryTrace.js';
// lib/kv.js
// Tiny server-side read helpers for Upstash KV (the canonical store for tenant
// applications). Used by the KV→Supabase bridge. Read-only; writes stay in the
// existing routes (generate.js, pages/api/invite/tag.js).
function kvBase() {
  return (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

export function kvConfigured() {
  return !!(kvBase() && process.env.KV_REST_API_TOKEN);
}

export async function kvGet(key) {
  if (!kvConfigured()) return null;
  const done = note('kv', 'get');
  try {
    const r = await fetch(`${kvBase()}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    if (!d?.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch (e) {
    return null;
  } finally { done(); }
}

export async function kvLrange(key) {
  if (!kvConfigured()) return [];
  const done = note('kv', 'lrange');
  try {
    const r = await fetch(`${kvBase()}/lrange/${key}/0/-1`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    return Array.isArray(d?.result) ? d.result : [];
  } catch (e) {
    return [];
  } finally { done(); }
}

// Atomic counter increment (used for soft per-realtor rate caps). Returns the new
// value, or null if KV is unavailable (caller should fail-open, not hard-block).
export async function kvIncr(key) {
  if (!kvConfigured()) return null;
  try {
    const r = await fetch(`${kvBase()}/incr/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    return typeof d?.result === 'number' ? d.result : null;
  } catch (e) {
    return null;
  }
}

// The remaining TTL in seconds (-1 none, -2 missing, null when KV is unavailable).
export async function kvTtl(key) {
  if (!kvConfigured()) return null;
  try {
    const r = await fetch(`${kvBase()}/ttl/${key}`, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
    const d = await r.json();
    return typeof d?.result === 'number' ? d.result : null;
  } catch (e) { return null; }
}

// One Upstash REST command by path segments (lpush, ltrim, set with a JSON body when `body` is given).
export async function kvCommand(parts, body) {
  if (!kvConfigured()) return null;
  try {
    const r = await fetch(`${kvBase()}/${parts.map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const d = await r.json();
    return d?.result ?? null;
  } catch (e) { return null; }
}

export async function kvExpire(key, seconds) {
  if (!kvConfigured()) return;
  try {
    await fetch(`${kvBase()}/expire/${key}/${seconds}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
  } catch (e) { /* best-effort */ }
}
