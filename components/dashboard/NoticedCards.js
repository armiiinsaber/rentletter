// components/dashboard/NoticedCards.js
// "Rentletter noticed" — up to three actionable cards (lib/noticed.js rules; no AI). Ink
// instrument surface: this is the product speaking. One line of what, one action, dismissible.
// Renders NOTHING when there's nothing to say (unless `emptyLine` is given: the panel's calm
// line). No reveal class: it simply appears.
//
// ONE CARD AT A TIME. The cards sit side by side on a track inside a fixed height viewport; the
// viewport is as tall as the TALLEST card in the set (measured once per set), so the block never
// grows with the count and never jumps between cards. The user moves between them with the dots
// or a horizontal swipe. NOTHING advances on its own: these cards carry live actions.
//
// In the assistant panel (`animateOut`) a card that is acted on or dismissed leaves the zone on
// the settle curve before it goes, and `onChanged` fires so the timeline can pick up the event
// it became. Reduced motion: it simply goes, and the track swaps with no movement. `onOpen`
// renders a quiet "Open" affordance (the dashboard's compact block, which opens the full panel).
import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { computeNotices, readDismissed, dismissNotice, latestSignalAt, relativeTime } from '../../lib/noticed';
import { useAdapter } from '../../lib/dashboardAdapter';
import { CURVE, DURATION, prefersReducedMotion } from '../../lib/motion';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// The catch up line: what is waiting, grouped by what it is, counted, comma separated. Built
// only from the cards computeNotices returned. Sentence case; singular and plural handled.
const GROUPS = [
  ['docs', (c) => c.kind === 'verify' || c.kind === 'reverify', (n) => `${n} need${n === 1 ? 's' : ''} documents`],
  ['new', (c) => c.kind === 'new', (n) => `${n} new application${n === 1 ? '' : 's'}`],
  ['stalled', (c) => c.kind === 'stalled', (n) => `${n} waiting on a decision`],
  ['present', (c) => c.kind === 'present', (n) => `${n} report${n === 1 ? '' : 's'} ready to send`],
  ['referral', (c) => c.kind === 'referral', (n) => `${n} referral${n === 1 ? '' : 's'}`],
  ['brand', (c) => c.kind === 'brand', () => 'branding incomplete'],
];
export function catchUpLine(cards) {
  if (!cards || cards.length < 2) return null;
  const parts = [];
  for (const [, match, phrase] of GROUPS) { const n = cards.filter(match).length; if (n) parts.push(phrase(n)); }
  const rest = cards.filter((c) => !GROUPS.some(([, match]) => match(c))).length;
  if (rest) parts.push(`${rest} other${rest === 1 ? '' : 's'}`);
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SWIPE = { axisLock: 8, commit: 40 };

export default function NoticedCards({ input, onAction, style, className = '', animateOut = false, onChanged, onOpen, emptyLine = null }) {
  const adapter = useAdapter();
  const [dismissed, setDismissed] = useState([]);
  const [leaving, setLeaving] = useState({}); // id -> true while a card animates out
  const timers = useRef([]);
  useEffect(() => { setDismissed(readDismissed()); return () => timers.current.forEach(clearTimeout); }, []);
  const cards = useMemo(() => computeNotices({ ...input, dismissed }), [input, dismissed]);
  const ids = cards.map((c) => c.id).join('|');
  // When the observation was made: the newest event on the timeline when the server had one,
  // else the newest fact the rules read. Shown only while it is fresh (48 hours).
  const noticedAt = useMemo(() => input?.latestEventAt || latestSignalAt(input), [input]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [noticedAt]);
  const whenLine = noticedAt && now - new Date(noticedAt).getTime() <= 48 * 3600000 ? `noticed ${relativeTime(noticedAt, now)}` : null;
  const summary = catchUpLine(cards);

  // Which card is showing. Clamped when the set shrinks: dismissing the last one shows the
  // previous one, never an empty viewport.
  const [index, setIndex] = useState(0);
  useEffect(() => { if (index > cards.length - 1) setIndex(Math.max(0, cards.length - 1)); }, [cards.length, index]);
  const current = Math.min(index, Math.max(0, cards.length - 1));

  // The viewport height: the tallest card in the current set, measured once per set (and again
  // on resize). Every card is in the DOM on the track, so each can be measured directly.
  const cardRefs = useRef({});
  const [height, setHeight] = useState(null);
  const measure = useCallback(() => {
    let h = 0;
    for (const id of ids.split('|')) { const el = cardRefs.current[id]; if (el) h = Math.max(h, el.offsetHeight); }
    setHeight(h || null);
  }, [ids]);
  useIsoLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [measure]);

  // Horizontal swipe on the viewport: native touch listeners (passive false on touchmove) so a
  // horizontal move can be cancelled before iOS starts a scroll; a vertical move is never touched
  // and the page scrolls as normal. Follows the finger, then commits or snaps back. No wrap.
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const drag = useRef({ active: false, lock: null, startX: 0, startY: 0, dx: 0 });
  const stateRef = useRef({ current, count: cards.length });
  stateRef.current = { current, count: cards.length };
  const paintTrack = useCallback((dx, animate) => {
    const track = trackRef.current; if (!track) return;
    const { current: i } = stateRef.current;
    track.style.transition = animate && !prefersReducedMotion() ? `transform ${DURATION.base}ms ${CURVE.settle}` : 'none';
    track.style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`;
  }, []);
  useEffect(() => { paintTrack(0, true); }, [current, paintTrack]);
  useEffect(() => {
    const el = viewportRef.current; if (!el) return undefined;
    const onStart = (e) => {
      if (e.touches.length !== 1 || stateRef.current.count < 2) return;
      if (e.target.closest('button, a, input, select, textarea')) return;
      const t = e.touches[0]; drag.current = { active: true, lock: null, startX: t.clientX, startY: t.clientY, dx: 0 };
    };
    const onMove = (e) => {
      const d = drag.current; if (!d.active) return;
      const t = e.touches[0]; const dx = t.clientX - d.startX, dy = t.clientY - d.startY;
      if (!d.lock) {
        if (Math.abs(dx) < SWIPE.axisLock && Math.abs(dy) < SWIPE.axisLock) return;
        if (Math.abs(dx) > Math.abs(dy) && e.cancelable) d.lock = 'h'; else { d.lock = 'v'; d.active = false; return; } // the scroller's gesture
      }
      e.preventDefault();
      const { current: i, count } = stateRef.current;
      const atEdge = (dx > 0 && i === 0) || (dx < 0 && i === count - 1);
      d.dx = atEdge ? dx / 3 : dx; // a short rubber band past either end
      paintTrack(d.dx, false);
    };
    const onEnd = () => {
      const d = drag.current; if (!d.active) return;
      d.active = false;
      const { current: i, count } = stateRef.current;
      if (d.lock === 'h' && Math.abs(d.dx) >= SWIPE.commit) {
        const next = d.dx < 0 ? Math.min(count - 1, i + 1) : Math.max(0, i - 1);
        if (next !== i) { setIndex(next); return; }
      }
      paintTrack(0, true);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd); };
  }, [paintTrack, cards.length > 1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave first, then do. Navigation actions go at once (the page is leaving anyway).
  const leaveThen = (card, fn) => {
    if (!animateOut || prefersReducedMotion()) { fn(); onChanged?.(); return; }
    setLeaving((m) => ({ ...m, [card.id]: true }));
    timers.current.push(setTimeout(() => { fn(); setLeaving((m) => { const n = { ...m }; delete n[card.id]; return n; }); onChanged?.(); }, DURATION.base));
  };
  if (!cards.length) {
    if (!emptyLine) return null;
    return <p className={className} style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5, padding: '4px 2px', ...style }}>{emptyLine}</p>;
  }

  const act = (card) => {
    const a = card.action; if (!a) return;
    if (a.type === 'panel') { onAction?.(a, card); return; }
    if (a.type === 'navigate') {
      // lib/noticed emits product paths; translate through the adapter so a demo stays in-route.
      const m = String(a.href).match(/^\/landlord\/([^#?]+)(.*)$/);
      const href = m ? adapter.paths.listing(m[1]) + (m[2] || '') : a.href === '/profile' ? adapter.paths.profile : a.href.startsWith('/landlord') ? adapter.paths.home + a.href.slice('/landlord'.length) : a.href;
      // Same page + an anchor: scroll there ourselves (assigning an identical hash does nothing).
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.hash) {
        const el = document.getElementById(url.hash.slice(1));
        if (el) { window.history.replaceState(null, '', url.hash); el.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      }
      window.location.href = href; return;
    }
    leaveThen(card, () => onAction?.(a, card));
  };
  const dismiss = (card) => leaveThen(card, () => { dismissNotice(card.id); setDismissed(readDismissed()); });

  const many = cards.length > 1;
  return (
    <section className={className} aria-label="Rentletter noticed" style={{ background: C.ink, color: C.paper, borderRadius: R.card, padding: 'clamp(14px, 3vw, 20px)', position: 'relative', overflow: 'hidden', ...style }}>
      <div className="nc-head" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', marginBottom: summary ? 6 : 10 }}>
        <span className="rl-dot" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: C.redBright, flexShrink: 0, marginRight: -4 }} />
        <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.redBright || C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Rentletter noticed</span>
        {whenLine && <span className="nc-when" style={{ fontSize: 11, color: '#6f6b63', whiteSpace: 'nowrap' }} title={new Date(noticedAt).toLocaleString('en-CA')}>{whenLine}</span>}
        {onOpen && <button type="button" onClick={onOpen} style={{ marginLeft: 'auto', background: 'transparent', color: '#9a958a', border: '1px solid #2a2a2e', borderRadius: R.pill, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>Open</button>}
      </div>
      {summary && <p style={{ fontSize: 12.5, color: '#9a958a', lineHeight: 1.45, margin: '0 0 10px', textWrap: 'pretty' }}>{summary}</p>}

      {/* THE VIEWPORT: one card tall (the tallest in the set), one card wide. The track holds
          every card side by side and moves only when the user moves it. */}
      <div ref={viewportRef} className="nc-viewport" style={{ position: 'relative', overflow: 'hidden', height: height || 'auto', touchAction: 'pan-y' }}>
        <div ref={trackRef} className="nc-track" style={{ position: height ? 'absolute' : 'relative', inset: 0, willChange: 'transform' }}>
          {cards.map((card, i) => (
            <div key={card.id} ref={(el) => { if (el) cardRefs.current[card.id] = el; else delete cardRefs.current[card.id]; }}
              className={leaving[card.id] ? 'm-card-leave' : ''} inert={i !== current} aria-hidden={i !== current}
              style={{ position: height ? 'absolute' : 'relative', top: 0, left: `${i * 100}%`, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: '#161618', border: '1px solid #2a2a2e', borderRadius: R.ctrl }}>
              <div style={{ flex: '1 1 100%', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e4d9', lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'pretty' }}>{card.title}</div>
                {card.detail && <div style={{ fontSize: 12.5, color: '#9a958a', lineHeight: 1.5, marginTop: 3, textWrap: 'pretty' }}>{card.detail}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%', flexShrink: 0 }}>
                {card.action && (
                  <button type="button" onClick={() => act(card)} style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap' }}>
                    {card.action.label}
                  </button>
                )}
                <button type="button" onClick={() => dismiss(card)} aria-label="Dismiss" title="Dismiss for a few days" style={{ background: 'transparent', color: '#9a958a', border: '1px solid #2a2a2e', borderRadius: R.ctrl, width: 36, height: 36, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* THE DOTS: one per notice, each a 44px target around a 6px dot. Only when there is more than one. */}
      {many && (
        <div role="group" aria-label="Notices" style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 4 }}>
          {cards.map((card, i) => (
            <button key={card.id} type="button" onClick={() => setIndex(i)} aria-label={`Show notice ${i + 1} of ${cards.length}`} aria-current={i === current ? 'true' : undefined}
              style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: i === current ? C.redBright : '#2a2a2e', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
      <style jsx>{`
        @media (max-width: 480px) { .nc-head :global(.nc-when) { flex-basis: 100%; order: 3; padding-left: 32px; margin-top: -2px; } }
      `}</style>
    </section>
  );
}
