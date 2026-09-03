// lib/signalsCache.js  SERVER ONLY.
// A 60 second in memory cache for GET /api/assistant/signals, keyed by profile id. The bell on
// every page other than the dashboard reads through it, so a realtor moving between pages does
// not rerun the whole load each time. A module level Map: on Vercel each warm function instance
// has its own, and a write route that changes state clears the entry it can see; a badge that is
// a minute stale on another instance is acceptable.
const TTL_MS = 60 * 1000;
const cache = new Map();

export function getCachedSignals(profileId) {
  const hit = cache.get(profileId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(profileId); return null; }
  return hit.value;
}
export function setCachedSignals(profileId, value) { if (profileId && value) cache.set(profileId, { at: Date.now(), value }); }
// Called by every route that changes what the load reads: confirmations, analyses, document
// requests, report sends, dismissals, decisions reported through events, referral assignment.
export function invalidateSignals(profileId) { if (profileId) cache.delete(profileId); }
