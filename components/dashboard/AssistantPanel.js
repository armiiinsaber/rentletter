// components/dashboard/AssistantPanel.js
// The bell's panel, an action list. Two static tabs: Next (what to do, one line per applicant
// state, lib/actions.js) and History (the append only timeline, newest first, by day, paged).
// Closing the panel only hides it; the list, the badge and the dismissals live
// in the shared store and in KV, so reopening shows the same list.
//
// Next: tapping a row lands on that applicant with the right panel open (deep link, or in place
// on the same listing page). A row can be dismissed: a swipe left on touch, an X otherwise. The
// dismissal is stored against the item's state signature, so it returns the moment the state
// changes. A row whose item goes between loads slides out, a new one slides in (lib/motion.js
// durations, none under reduced motion).
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { ActionRows } from './ActionRow';
import ReferralInbox from './ReferralInbox';
import { useAdapter } from '../../lib/dashboardAdapter';
import { eventTitle, eventHref, groupByDay } from '../../lib/eventTypes';
import { useAssistantStore, dismissAction, markOpened } from '../../lib/assistantStore';
import { DURATION, CURVE } from '../../lib/motion';
import { navigateToAction } from './actionNav';
import { referralsEnabled } from '../../lib/features';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const TABS = [['next', 'Next'], ['history', 'History']];

// The rows are components/dashboard/ActionRow.js (ActionRows), shared with any surface that lists items.

export default function AssistantPanel({ open, onClose, signals, items = [], profile }) {
  const adapter = useAdapter();
  const store = useAssistantStore();
  const [tab, setTab] = useState('next');
  const [events, setEvents] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState({});
  const [note, setNote] = useState('');
  const known = useRef(new Set());

  const fetchPage = useCallback(async (before) => {
    const r = await adapter.fetch(`/api/events${before ? `?before=${encodeURIComponent(before)}` : ''}`);
    return r.ok ? r.json() : { events: [], lastReadAt: null, nextBefore: null };
  }, [adapter]);

  // Open: the timeline's first page (watermark as it stood), then mark read, and the keys on the
  // list now become the bell's baseline. Once per open. Body scroll locked, Escape closes.
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setTab('next'); setNote('');
    markOpened(adapter, itemsRef.current.map((i) => i.key));
    (async () => {
      setLoading(true);
      try {
        const j = await fetchPage(null);
        if (cancelled) return;
        known.current = new Set((j.events || []).map((e) => e.id));
        setEvents(j.events || []); setLastReadAt(j.lastReadAt || null); setNextBefore(j.nextBefore || null);
        adapter.fetch('/api/events/read', { method: 'POST' }).catch(() => {});
      } catch (e) { /* the timeline just stays empty */ }
      if (!cancelled) setLoading(false);
    })();
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', key);
    return () => { cancelled = true; document.body.style.overflow = prev; document.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const refresh = useCallback(async () => {
    try {
      const j = await fetchPage(null);
      const fresh = (j.events || []).filter((e) => !known.current.has(e.id));
      if (!fresh.length) return;
      fresh.forEach((e) => known.current.add(e.id));
      setEntering(Object.fromEntries(fresh.map((e) => [e.id, true])));
      setEvents((cur) => { const ids = new Set(cur.map((e) => e.id)); return [...fresh.filter((e) => !ids.has(e.id)), ...cur]; });
    } catch (e) { /* ignore */ }
  }, [fetchPage]);
  const more = async () => {
    if (!nextBefore || loading) return;
    setLoading(true);
    try { const j = await fetchPage(nextBefore); (j.events || []).forEach((e) => known.current.add(e.id)); setEvents((cur) => [...cur, ...(j.events || [])]); setNextBefore(j.nextBefore || null); } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const go = (item) => { onClose?.(); navigateToAction(item, adapter.paths); };
  const dismiss = async (item) => { const err = await dismissAction(adapter, item); setNote(err || ''); };
  const goEvent = (e) => { const href = eventHref(e, adapter.paths); onClose?.(); if (href) window.location.href = href; };

  const unread = (e) => !lastReadAt || new Date(e.created_at) > new Date(lastReadAt);
  const groups = useMemo(() => groupByDay(events), [events]);
  if (!open || typeof document === 'undefined') return null;
  const s = signals || {};
  const listings = s.listings || [];
  void store;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Next" className="al-panel" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: C.paper, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', padding: '12px clamp(14px, 4vw, 24px) 0', flexShrink: 0 }}>
        <span className="t-d3" style={{ color: C.ink }}>Next{items.length ? <span className="num" style={{ color: C.inkMute, fontWeight: 500, marginLeft: 'var(--s-2)' }}>{items.length}</span> : null}</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.pill, color: C.ink, cursor: 'pointer' }}><Icon name="x" size={16} /></button>
      </div>
      <div role="tablist" aria-label="Next and History" style={{ display: 'flex', gap: 0, padding: '0 clamp(14px, 4vw, 24px)', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            style={{ minHeight: 44, padding: '0 var(--s-3)', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? C.ink : 'transparent'}`, marginBottom: -1, color: tab === id ? C.ink : C.inkMute, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {label}{id === 'next' && items.length ? <span aria-hidden="true" style={{ marginLeft: 'var(--s-1)', fontSize: 'var(--t-eyebrow)', fontWeight: 800, color: C.paper, background: C.ink, borderRadius: 9, padding: 'var(--s-1) var(--s-1)' }}>{items.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'next' && (
        <section role="tabpanel" aria-label="Next" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px clamp(14px, 4vw, 24px) max(24px, env(safe-area-inset-bottom, 0px))' }}>
          <ActionRows items={items} onGo={go} onDismiss={dismiss} />
          {note ? <div role="alert" style={{ fontSize: 'var(--t-body-2)', color: C.danger, marginTop: 'var(--s-2)' }}>{note}</div> : null}
          {referralsEnabled() && ( // lib/features.js: no inbox block while referrals are paused
            <div style={{ marginTop: 'var(--s-4)' }}><ReferralInbox listings={listings} initialItems={s.referralsInbox || []} onChanged={refresh} embedded /></div>
          )}
        </section>
      )}
      {tab === 'history' && (
        <section role="tabpanel" aria-label="History" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px clamp(14px, 4vw, 24px) max(24px, env(safe-area-inset-bottom, 0px))' }}>
          {!events.length && !loading && <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.5 }}>Nothing yet. From here on, what happens on your listings is recorded here.</p>}
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 'var(--s-3)' }}>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, fontWeight: 700, padding: 'var(--s-1) 0' }}>{g.label}</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.items.map((e) => { const u = unread(e); return (
                  <li key={e.id} className={entering[e.id] ? 'm-tl-enter' : ''}>
                    <button type="button" onClick={() => goEvent(e)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-start', padding: 'var(--s-2) var(--s-1)', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.rule}`, cursor: 'pointer', minHeight: 44 }}>
                      <span aria-hidden="true" style={{ marginTop: 'var(--s-2)', width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: u ? C.red : C.rule }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 'var(--t-body)', color: C.ink, fontWeight: u ? 700 : 500, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>{eventTitle(e)}</span>
                        <span style={{ display: 'block', fontSize: 'var(--t-body-2)', color: C.inkMute, marginTop: 'var(--s-1)' }}>{timeOf(e.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ); })}
              </ul>
            </div>
          ))}
          {nextBefore && <button type="button" onClick={more} disabled={loading} style={{ width: '100%', minHeight: 44, background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Loading' : 'Show earlier'}</button>}
        </section>
      )}
      <style jsx global>{`
        .al-leave { opacity: 0; transform: translateX(-24px); pointer-events: none; }
        @media (prefers-reduced-motion: no-preference) {
          .al-row { transition: opacity ${DURATION.base}ms ${CURVE.settle}, transform ${DURATION.base}ms ${CURVE.settle}; }
          .al-enter { animation: al-in ${DURATION.base}ms ${CURVE.enter} both; }
        }
        @keyframes al-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        @media (pointer: coarse) { .al-x { display: none !important; } }
      `}</style>
    </div>,
    document.body,
  );
}
