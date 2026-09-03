// components/dashboard/AssistantPanel.js
// The assistant as an action list. Three static tabs: Next (what to do, one line per applicant
// state, lib/actions.js), History (the append only timeline, newest first, by day, paged) and
// Ask (the chat). Closing the panel only hides it; the list, the badge and the dismissals live
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
import ReferralInbox from './ReferralInbox';
import ChatWidget from '../ChatWidget';
import { useAdapter } from '../../lib/dashboardAdapter';
import { eventTitle, eventHref, groupByDay } from '../../lib/eventTypes';
import { useAssistantStore, dismissAction, markOpened } from '../../lib/assistantStore';
import { DURATION, CURVE, prefersReducedMotion } from '../../lib/motion';
import { navigateToAction } from './actionNav';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const TABS = [['next', 'Next'], ['history', 'History'], ['ask', 'Ask']];
const SWIPE = { axisLock: 8, commit: 64 };

// One row. Swipe left to dismiss on touch (native listeners so the horizontal move is cancelled
// before iOS scrolls); the X button serves a pointer.
function ActionRow({ item, phase, onGo, onDismiss }) {
  const ref = useRef(null);
  const drag = useRef({ active: false, lock: null, startX: 0, startY: 0, dx: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const paint = (dx, animate) => { el.style.transition = animate && !prefersReducedMotion() ? `transform ${DURATION.base}ms ${CURVE.settle}` : 'none'; el.style.transform = dx ? `translateX(${dx}px)` : ''; };
    const onStart = (e) => { if (e.touches.length !== 1) return; if (e.target.closest('button')) return; const t = e.touches[0]; drag.current = { active: true, lock: null, startX: t.clientX, startY: t.clientY, dx: 0 }; };
    const onMove = (e) => {
      const d = drag.current; if (!d.active) return;
      const t = e.touches[0]; const dx = t.clientX - d.startX, dy = t.clientY - d.startY;
      if (!d.lock) { if (Math.abs(dx) < SWIPE.axisLock && Math.abs(dy) < SWIPE.axisLock) return; if (Math.abs(dx) > Math.abs(dy) && e.cancelable) d.lock = 'h'; else { d.lock = 'v'; d.active = false; return; } }
      e.preventDefault();
      d.dx = Math.min(0, dx); paint(d.dx, false);
    };
    const onEnd = () => { const d = drag.current; if (!d.active) return; d.active = false; if (d.lock === 'h' && d.dx <= -SWIPE.commit) { paint(-el.offsetWidth, true); onDismiss(); return; } paint(0, true); };
    el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: false }); el.addEventListener('touchend', onEnd, { passive: true }); el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd); };
  }, [onDismiss]);
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(); } };
  return (
    <li ref={ref} className={`al-row ${phase === 'enter' ? 'al-enter' : ''} ${phase === 'leave' ? 'al-leave' : ''}`} data-key={item.key} data-kind={item.kind} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
      <div role="button" tabIndex={0} onClick={onGo} onKeyDown={key} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--s-2) 0', cursor: 'pointer' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{item.title}</span>
        <span style={{ display: 'block', fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 1.4, marginTop: 'var(--s-1)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>{item.detail}</span>
      </div>
      <button type="button" onClick={onGo} style={{ minHeight: 44, padding: '0 var(--s-2)', background: 'transparent', border: 'none', color: C.ink, textDecoration: 'underline', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{item.verb}</button>
      <button type="button" className="al-x" onClick={onDismiss} aria-label={`Dismiss: ${item.title}`} title="Dismiss until something changes" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', flexShrink: 0 }}><Icon name="x" size={14} /></button>
    </li>
  );
}

// The list with enter and leave phases per key.
function ActionList({ items, onGo, onDismiss }) {
  const [rows, setRows] = useState(() => items.map((item) => ({ item, phase: 'in' })));
  const prevKeys = useRef(new Set(items.map((i) => i.key)));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const keys = new Set(items.map((i) => i.key));
    const reduced = prefersReducedMotion();
    setRows((cur) => {
      const fresh = items.map((item) => ({ item, phase: prevKeys.current.has(item.key) ? 'in' : 'enter' }));
      if (reduced) return fresh;
      const out = []; const seen = new Set();
      for (const r of cur) { if (keys.has(r.item.key)) { if (!seen.has(r.item.key)) { out.push(fresh.find((f) => f.item.key === r.item.key)); seen.add(r.item.key); } } else if (r.phase !== 'gone') out.push({ ...r, phase: 'leave' }); }
      for (const f of fresh) if (!seen.has(f.item.key)) out.push(f);
      return out;
    });
    prevKeys.current = keys;
    if (reduced) return undefined;
    const t = setTimeout(() => setRows((cur) => cur.filter((r) => r.phase !== 'leave')), DURATION.base + 40);
    return () => clearTimeout(t);
  }, [items]);
  if (!rows.length) {
    return (
      <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.ink, fontWeight: 700, lineHeight: 1.5, padding: 'var(--s-2) var(--s-1)', margin: 0 }}>
        <Icon name="check" size={16} color={C.red} strokeWidth={2.5} /> Nothing waiting on you.
      </p>
    );
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r) => <ActionRow key={r.item.key} item={r.item} phase={r.phase} onGo={() => onGo(r.item)} onDismiss={() => onDismiss(r.item)} />)}
    </ul>
  );
}

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
    <div role="dialog" aria-modal="true" aria-label="Assistant" className="al-panel" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: C.paper, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', padding: '12px clamp(14px, 4vw, 24px) 0', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--t-body-2)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Assistant</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.pill, color: C.ink, cursor: 'pointer' }}><Icon name="x" size={16} /></button>
      </div>
      <div role="tablist" aria-label="Assistant sections" style={{ display: 'flex', gap: 0, padding: '0 clamp(14px, 4vw, 24px)', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            style={{ minHeight: 44, padding: '0 var(--s-3)', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? C.ink : 'transparent'}`, marginBottom: -1, color: tab === id ? C.ink : C.inkMute, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {label}{id === 'next' && items.length ? <span aria-hidden="true" style={{ marginLeft: 'var(--s-1)', fontSize: 'var(--t-eyebrow)', fontWeight: 800, color: C.paper, background: C.ink, borderRadius: 9, padding: 'var(--s-1) var(--s-1)' }}>{items.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'next' && (
        <section role="tabpanel" aria-label="Next" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px clamp(14px, 4vw, 24px) max(24px, env(safe-area-inset-bottom, 0px))' }}>
          <ActionList items={items} onGo={go} onDismiss={dismiss} />
          {note ? <div role="alert" style={{ fontSize: 'var(--t-body-2)', color: C.danger, marginTop: 'var(--s-2)' }}>{note}</div> : null}
          <div style={{ marginTop: 'var(--s-4)' }}><ReferralInbox listings={listings} initialItems={s.referralsInbox || []} onChanged={refresh} embedded /></div>
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
                        <span style={{ display: 'block', fontSize: 'var(--t-body-2)', color: C.ink, fontWeight: u ? 700 : 500, lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'pretty' }}>{eventTitle(e)}</span>
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
      {tab === 'ask' && (
        <section role="tabpanel" aria-label="Ask" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ChatWidget mode="dashboard" embedded />
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
