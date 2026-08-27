// components/dashboard/AssistantPanel.js
// ONE surface, two questions kept apart: "Needs you" (the deterministic Noticed cards, pinned
// at the top, with the referral inbox to act on) and "What happened" (the append only timeline,
// newest first, grouped by day, paged). Nothing appears in both: the top zone is computed from
// present state (lib/noticed.js), the bottom zone is the record of the past (events).
//
// Opening the panel sets the read watermark once (POST /api/events/read); unread is anything
// newer than the watermark as it stood when the panel opened. Acting on a card lets it leave
// the top zone, then the timeline refreshes and the event it became enters at the top. Nothing
// else in here animates.
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { C, R } from '../theme';
import { Icon } from '../ui';
import NoticedCards from './NoticedCards';
import ReferralInbox from './ReferralInbox';
import { useAdapter } from '../../lib/dashboardAdapter';
import { eventTitle, eventHref, groupByDay } from '../../lib/eventTypes';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

export default function AssistantPanel({ open, onClose, signals, profile, onAction }) {
  const adapter = useAdapter();
  const [events, setEvents] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState({}); // event ids that just arrived
  const known = useRef(new Set());
  const inboxRef = useRef(null);

  const fetchPage = useCallback(async (before) => {
    const r = await adapter.fetch(`/api/events${before ? `?before=${encodeURIComponent(before)}` : ''}`);
    return r.ok ? r.json() : { events: [], lastReadAt: null, nextBefore: null };
  }, [adapter]);

  // Open: load the first page (watermark as it stood), then mark read. Once per open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
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

  // Something in the top zone completed: refresh the first page; new events enter at the top.
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

  const go = (e) => { const href = eventHref(e, adapter.paths); onClose?.(); if (href) window.location.href = href; };
  const act = (a, card) => {
    if (a.type === 'panel' && a.target === 'referrals') { inboxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); return; }
    onAction?.(a, card);
  };

  if (!open || typeof document === 'undefined') return null;
  const s = signals || {};
  const listings = s.listings || [];
  const noticeInput = { scope: 'home', listings, applicantsByListing: s.applicantsByListing || {}, notifications: s.notifications || [], referralsSent: s.referralsSent || [], referralsInbox: s.referralsInbox || [], profile };
  const unread = (e) => !lastReadAt || new Date(e.created_at) > new Date(lastReadAt);
  const groups = groupByDay(events);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Assistant" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: C.paper, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px clamp(14px, 4vw, 24px) 10px', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Assistant</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.pill, color: C.ink, cursor: 'pointer' }}><Icon name="x" size={16} /></button>
      </div>

      {/* NEEDS YOU: pinned. Its own scroll only if it overflows, so the timeline is always reachable. */}
      <section aria-label="Needs you" style={{ flexShrink: 0, maxHeight: '48vh', overflowY: 'auto', padding: '14px clamp(14px, 4vw, 24px) 12px', borderBottom: `1px solid ${C.rule}`, background: C.paperDeep }}>
        <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Needs you</div>
        <NoticedCards input={noticeInput} onAction={act} animateOut onChanged={refresh} emptyLine="Everything is handled. Nothing needs you right now." />
        <div ref={inboxRef}><ReferralInbox listings={listings} initialItems={s.referralsInbox || []} onChanged={refresh} embedded /></div>
      </section>

      {/* WHAT HAPPENED: the record, newest first, by day. */}
      <section aria-label="What happened" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px clamp(14px, 4vw, 24px) max(24px, env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>What happened</div>
        {!events.length && !loading && <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5 }}>Nothing yet. From here on, what happens on your listings is recorded here.</p>}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.inkMute, fontWeight: 700, padding: '6px 0' }}>{g.label}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.items.map((e) => { const u = unread(e); return (
                <li key={e.id} className={entering[e.id] ? 'm-tl-enter' : ''}>
                  <button type="button" onClick={() => go(e)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.rule}`, cursor: 'pointer', minHeight: 44 }}>
                    <span aria-hidden="true" style={{ marginTop: 7, width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: u ? C.red : C.rule }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14, color: C.ink, fontWeight: u ? 700 : 500, lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'pretty' }}>{eventTitle(e)}</span>
                      <span style={{ display: 'block', fontSize: 12, color: C.inkMute, marginTop: 2 }}>{timeOf(e.created_at)}</span>
                    </span>
                  </button>
                </li>
              ); })}
            </ul>
          </div>
        ))}
        {nextBefore && <button type="button" onClick={more} disabled={loading} style={{ width: '100%', minHeight: 44, background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Loading' : 'Show earlier'}</button>}
      </section>
    </div>,
    document.body,
  );
}
