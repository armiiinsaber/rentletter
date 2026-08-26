// components/admin/adminFetch.js — client-side fetch for the founder admin pages.
//
// The admin session lives in a KV store that replicates asynchronously, so the first request
// after sign-in can be told 401 even though the cookie is set and sent; and a cold serverless
// function can fail once with a 5xx / non-JSON body. Both look, to the founder, like
// "couldn't load" — until a manual reload. So:
//   • 401 → retried with backoff (a real sign-out stays a 401 after the retries)
//   • 5xx, non-JSON body, network error → retried once
// Returns { r, j } (r may be null on a network error; j is {} when the body wasn't JSON).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BACKOFF_401 = [250, 500, 1000, 1500];

export async function adminFetch(url, init = {}, { retry401 = BACKOFF_401.length, retry5xx = 1 } = {}) {
  let tries401 = 0, tries5xx = 0;
  for (;;) {
    let r = null, j = {};
    try { r = await fetch(url, init); j = await r.json().catch(() => ({})); } catch (e) { r = null; }
    if (r && r.status === 401 && tries401 < retry401) { await sleep(BACKOFF_401[Math.min(tries401, BACKOFF_401.length - 1)]); tries401 += 1; continue; }
    if ((!r || r.status >= 500) && tries5xx < retry5xx) { await sleep(1200); tries5xx += 1; continue; }
    return { r, j };
  }
}

// After /api/admin/login: resolve true once the session reads back (≈ up to 4 s), false if not.
export async function waitForAdminSession() {
  for (const ms of [0, 200, 400, 600, 800, 1000, 1000]) {
    if (ms) await sleep(ms);
    try { const r = await fetch('/api/admin/session', { cache: 'no-store' }); if (r.status === 200) return true; if (r.status !== 401) return true; } catch (e) { /* retry */ }
  }
  return false;
}
