// lib/kv.js
// Tiny server-side read helpers for Upstash KV (the canonical store for tenant
// applications). Used by the KV→Supabase bridge. Read-only; writes stay in the
// existing routes (generate.js, tag-invite-submission.js).
function kvBase() {
  return (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

export function kvConfigured() {
  return !!(kvBase() && process.env.KV_REST_API_TOKEN);
}

export async function kvGet(key) {
  if (!kvConfigured()) return null;
  try {
    const r = await fetch(`${kvBase()}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    if (!d?.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch (e) {
    return null;
  }
}

export async function kvLrange(key) {
  if (!kvConfigured()) return [];
  try {
    const r = await fetch(`${kvBase()}/lrange/${key}/0/-1`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    return Array.isArray(d?.result) ? d.result : [];
  } catch (e) {
    return [];
  }
}
