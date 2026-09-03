// lib/assistantStore.js  CLIENT.
// One small store per page load for everything the bell, the panel and the Noticed block share:
// the signals (fetched once when the page did not bring them), the realtor's dismissals
// ({ key: signature }, kept in KV per profile through /api/assistant/dismiss) and the keys that
// were on the list the last time the panel was opened (the bell pulses for a key not in it).
// Dismissing is optimistic; the write follows and a failure reverts.
import { useSyncExternalStore } from 'react';

let state = { signals: null, dismissed: {}, lastOpenedKeys: null, recordLoaded: false, fetching: false };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
export const getAssistantState = () => state;
const patch = (p) => { state = { ...state, ...p }; emit(); };
export const setSignals = (signals) => patch({ signals });
export const setRecord = (rec) => patch({ dismissed: rec?.dismissed && typeof rec.dismissed === 'object' ? rec.dismissed : {}, lastOpenedKeys: Array.isArray(rec?.lastOpenedKeys) ? rec.lastOpenedKeys : [], recordLoaded: true });

// Load once per page: the signals when not given, and the dismissal record. Later calls no op.
export async function loadAssistant(adapter, given) {
  if (given && !state.signals) patch({ signals: given });
  if (state.fetching) return;
  const needSignals = !given && !state.signals;
  if (!needSignals && state.recordLoaded) return;
  patch({ fetching: true });
  try {
    const [sig, rec] = await Promise.all([
      needSignals ? adapter.fetch('/api/assistant/signals').then((r) => r.json()).catch(() => null) : null,
      state.recordLoaded ? null : adapter.fetch('/api/assistant/dismiss').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const next = {};
    if (sig && sig.signals) next.signals = sig.signals;
    if (!state.recordLoaded) { next.dismissed = rec?.dismissed && typeof rec.dismissed === 'object' ? rec.dismissed : {}; next.lastOpenedKeys = Array.isArray(rec?.lastOpenedKeys) ? rec.lastOpenedKeys : []; next.recordLoaded = true; }
    patch({ ...next, fetching: false });
  } catch (e) { patch({ fetching: false }); }
}

export async function dismissAction(adapter, item) {
  const before = state.dismissed;
  patch({ dismissed: { ...before, [item.key]: item.signature } });
  try {
    const r = await adapter.fetch('/api/assistant/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: item.key, signature: item.signature }) });
    if (!r.ok) throw new Error('not saved');
    return null;
  } catch (e) { patch({ dismissed: before }); return 'Could not save that. Try again.'; }
}

// The panel opened on these keys: the bell stops pulsing for them.
export async function markOpened(adapter, keys) {
  const list = Array.from(new Set(keys || []));
  patch({ lastOpenedKeys: list });
  try { await adapter.fetch('/api/assistant/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openedKeys: list }) }); } catch (e) { /* the next open tries again */ }
}

const serverState = state;
export function useAssistantStore() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => serverState);
}
