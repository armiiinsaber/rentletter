// components/dashboard/AssistantBell.js
// The bell IS the assistant. Its badge counts only what needs the realtor (the Noticed cards,
// lib/noticed.js), never the pile of things that already happened. Tapping it opens the full
// height panel (AssistantPanel). The dashboard hands the inputs in as `signals` (they came with
// the page); every other page fetches them once here. Anyone can open the panel by dispatching
// the 'rl:assistant-open' window event (the dashboard's compact block does).
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../ui';
import { C, R } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { computeNotices, readDismissed } from '../../lib/noticed';
import AssistantPanel from './AssistantPanel';

export const OPEN_EVENT = 'rl:assistant-open';

export default function AssistantBell({ profile, signals: given = null, onAction }) {
  const adapter = useAdapter();
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState(given);
  const [tick, setTick] = useState(0); // bumps when a card is dismissed or acted on
  useEffect(() => { if (given) setSignals(given); }, [given]);
  useEffect(() => {
    if (given) return undefined;
    let cancel = false;
    (async () => {
      try { const r = await adapter.fetch('/api/assistant/signals'); const j = await r.json().catch(() => ({})); if (!cancel && j.signals) setSignals(j.signals); } catch (e) { /* the bell stays quiet */ }
    })();
    return () => { cancel = true; };
  }, [adapter, given]);
  useEffect(() => { const h = () => setOpen(true); window.addEventListener(OPEN_EVENT, h); return () => window.removeEventListener(OPEN_EVENT, h); }, []);
  const close = useCallback(() => { setOpen(false); setTick((t) => t + 1); }, []);

  let count = 0;
  if (signals) {
    try {
      const s = signals;
      count = computeNotices({ scope: 'home', listings: s.listings || [], applicantsByListing: s.applicantsByListing || {}, notifications: s.notifications || [], referralsSent: s.referralsSent || [], referralsInbox: s.referralsInbox || [], profile, dismissed: readDismissed() }).length;
    } catch (e) { count = 0; }
  }
  void tick;
  const label = count > 9 ? '9+' : String(count);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={count > 0 ? `Assistant, ${count} need${count === 1 ? 's' : ''} you` : 'Assistant'} aria-haspopup="dialog" aria-expanded={open}
        style={{ height: 34, width: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: R.pill, background: open ? C.paperDeep : C.card, border: `1px solid ${C.ruleDark}`, color: C.inkSoft, cursor: 'pointer', position: 'relative', padding: 0 }}>
        <Icon name="bell" size={17} color={C.inkSoft} />
        {count > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box', background: C.red, color: '#fff', borderRadius: 9, fontSize: 10.5, fontWeight: 800, lineHeight: '17px', textAlign: 'center', border: `2px solid ${C.paper}` }}>{label}</span>}
      </button>
      <AssistantPanel open={open} onClose={close} signals={signals} profile={profile} onAction={onAction} />
    </>
  );
}
