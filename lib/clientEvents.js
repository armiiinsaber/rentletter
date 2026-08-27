// lib/clientEvents.js  BROWSER. Report a realtor action that was written to Supabase directly
// from the page so it lands on the timeline. Fire and forget: a failure changes nothing about
// the action itself. Only CLIENT_EVENT_TYPES are accepted by the route.
export function reportEvent(adapter, { type, listingId = null, linkId = null, payload = {} }) {
  try {
    const f = adapter && adapter.fetch ? adapter.fetch : (typeof fetch === 'function' ? fetch : null);
    if (!f) return;
    f('/api/events/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, listingId, linkId, payload }) }).catch(() => {});
  } catch (e) { /* never in the way of the action */ }
}
