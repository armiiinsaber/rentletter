// components/dashboard/AssistantBell.js
// The bell IS the assistant. Its badge counts the action list (lib/actions.js) less what the
// realtor dismissed; it pulses only when an item is on the list that was not there the last
// time the panel was opened. Tapping it opens the panel (AssistantPanel). The page's signals
// come in as `signals` when the page loaded them; otherwise the shared store fetches them once
// per page load, together with the dismissal record (lib/assistantStore.js). Anyone can open
// the panel by dispatching the 'rl:assistant-open' window event.
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Icon } from '../ui';
import { C, R } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { buildActions, visibleActions } from '../../lib/actions.js';
import { useAssistantStore, loadAssistant, setSignals } from '../../lib/assistantStore';
import AssistantPanel from './AssistantPanel';

export const OPEN_EVENT = 'rl:assistant-open';

export default function AssistantBell({ profile, signals: given = null, onAction }) {
  const adapter = useAdapter();
  const store = useAssistantStore();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (given) setSignals(given); }, [given]);
  useEffect(() => { loadAssistant(adapter, given); }, [adapter, given]);
  useEffect(() => { const h = () => setOpen(true); window.addEventListener(OPEN_EVENT, h); return () => window.removeEventListener(OPEN_EVENT, h); }, []);
  const close = useCallback(() => setOpen(false), []);

  const signals = given || store.signals;
  const items = useMemo(() => {
    if (!signals) return [];
    try { return visibleActions(buildActions({ listings: signals.listings || [], applicantsByListing: signals.applicantsByListing || {} }), store.dismissed); } catch (e) { return []; }
  }, [signals, store.dismissed]);
  const count = items.length;
  // Something arrived since the panel was last opened: the badge pulses (the rl-dot keyframes,
  // components/ui.js, inside the reduced motion query).
  const hasNew = Array.isArray(store.lastOpenedKeys) && items.some((i) => !store.lastOpenedKeys.includes(i.key));
  const label = count > 9 ? '9+' : String(count);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={count > 0 ? `Assistant, ${count} thing${count === 1 ? '' : 's'} to do` : 'Assistant'} aria-haspopup="dialog" aria-expanded={open}
        style={{ height: 34, width: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: R.pill, background: open ? C.paperDeep : C.card, border: `1px solid ${C.ruleDark}`, color: C.inkSoft, cursor: 'pointer', position: 'relative', padding: 0 }}>
        <Icon name="bell" size={17} color={C.inkSoft} />
        {count > 0 && <span aria-hidden="true" className={hasNew ? 'rl-dot' : ''} data-new={hasNew ? 'true' : 'false'} style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 var(--s-1)', boxSizing: 'border-box', background: C.red, color: '#fff', borderRadius: 9, fontSize: 'var(--t-eyebrow)', fontWeight: 800, lineHeight: '17px', textAlign: 'center', border: `2px solid ${C.paper}` }}>{label}</span>}
      </button>
      <AssistantPanel open={open} onClose={close} signals={signals} items={items} profile={profile} onAction={onAction} />
    </>
  );
}
