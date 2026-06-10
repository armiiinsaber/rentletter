// /lib/stats.js
// Lightweight instrumentation for tracking product metrics.
// All ops are fire-and-forget — failures must never affect the request.

const BASE = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const AUTH = { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` };

const COUNTERS = {
  SIGNUPS: 'stat:total_signups',
  APPLICATIONS_GENERATED: 'stat:total_letters_generated',
  WORKSPACE_SAVES: 'stat:total_workspace_saves',
  SHARES_CREATED: 'stat:total_shares_created',
  SHARES_VIEWED: 'stat:total_shares_viewed',
  LANDLORD_ACTIONS: 'stat:total_landlord_actions',
  EMAILS_SENT: 'stat:total_emails_sent',
};

/** Increment a named counter by 1. Fire-and-forget. */
export async function bump(counterKey) {
  if (!BASE || !process.env.KV_REST_API_TOKEN) return;
  try {
    await fetch(`${BASE}/incr/${counterKey}`, { method: 'POST', headers: AUTH });
  } catch (e) { /* swallow */ }
}

/** Log an event into a capped list. Keeps last 200 events per stream. */
export async function logEvent(stream, payload) {
  if (!BASE || !process.env.KV_REST_API_TOKEN) return;
  try {
    const eventStr = JSON.stringify({ ts: new Date().toISOString(), ...payload });
    await fetch(`${BASE}/lpush/events:${stream}/${encodeURIComponent(eventStr)}`, {
      method: 'POST', headers: AUTH,
    });
    // Trim to last 200 to bound storage
    await fetch(`${BASE}/ltrim/events:${stream}/0/199`, {
      method: 'POST', headers: AUTH,
    });
  } catch (e) { /* swallow */ }
}

/** Track unique signups — uses a set to dedupe by email. */
export async function trackUniqueSignup(email) {
  if (!BASE || !process.env.KV_REST_API_TOKEN || !email) return;
  try {
    const cleanEmail = String(email).toLowerCase().trim();
    // sadd returns 1 if new, 0 if already in set
    const r = await fetch(`${BASE}/sadd/set:known_users/${encodeURIComponent(cleanEmail)}`, {
      method: 'POST', headers: AUTH,
    });
    const data = await r.json();
    if (data?.result === 1) {
      // First time seeing this user — bump signup counter
      await bump(COUNTERS.SIGNUPS);
      await logEvent('signups', { email: cleanEmail });
    }
  } catch (e) { /* swallow */ }
}

/** Get a counter value (0 if not set). */
export async function getCounter(counterKey) {
  if (!BASE || !process.env.KV_REST_API_TOKEN) return 0;
  try {
    const r = await fetch(`${BASE}/get/${counterKey}`, { headers: AUTH });
    const d = await r.json();
    if (d?.result == null) return 0;
    return Number(d.result) || 0;
  } catch (e) { return 0; }
}

/** Read recent events from a stream (latest first). */
export async function getRecentEvents(stream, limit = 20) {
  if (!BASE || !process.env.KV_REST_API_TOKEN) return [];
  try {
    const r = await fetch(`${BASE}/lrange/events:${stream}/0/${limit - 1}`, { headers: AUTH });
    const d = await r.json();
    const items = Array.isArray(d?.result) ? d.result : [];
    return items.map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

/** Get count of unique users in the set. */
export async function getUniqueUserCount() {
  if (!BASE || !process.env.KV_REST_API_TOKEN) return 0;
  try {
    const r = await fetch(`${BASE}/scard/set:known_users`, { headers: AUTH });
    const d = await r.json();
    return Number(d?.result) || 0;
  } catch (e) { return 0; }
}

export { COUNTERS };
