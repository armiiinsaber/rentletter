// components/motion/index.js
// The five moments, built on lib/motion.js. Each is presentational only: the state it reflects
// is already committed by the time it renders, and under reduced motion each resolves to its
// end state instantly (the tween short circuits, the CSS lives inside the motion media query).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TickMeter } from '../ui';
import { C } from '../theme';
import { CURVE, DURATION, MOTION_VARS, MOTION_QUERY, prefersReducedMotion, tween } from '../../lib/motion';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// a. SCORE REVEAL: the number counts up and the meter fills to position. Stagger by index,
// capped, so ten scores settle together inside about three quarters of a second. `refill` is
// a key: when it changes after mount (the meter's variant flips from muted to full because
// documents landed or the realtor confirmed the employer) the fill restarts from empty, the
// same tween as the mount fill. A changed value alone continues from the last shown number.
export function AnimatedScore({ value, index = 0, max = 5, size = 14, showValue = true, onDark = false, renderValue, refill }) {
  const target = Math.max(0, Math.min(Number(value) || 0, max));
  const [shown, setShown] = useState(target); // SSR and reduced motion read the real value
  const lastShown = useRef(null); // null until the first frame: the first reveal counts from 0
  const lastRefill = useRef(refill);
  useEffect(() => {
    const restart = lastShown.current == null || lastRefill.current !== refill;
    lastRefill.current = refill;
    const from = restart ? 0 : lastShown.current;
    const delay = Math.min(index, 6) * 50;
    const cancel = tween({ from, to: target, ms: DURATION.long, delay, onFrame: (v) => { lastShown.current = v; setShown(v); } });
    return () => cancel(false); // stop only: the next run (or unmount) owns the final value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, refill]);
  return renderValue ? renderValue(shown, target) : <TickMeter value={Math.round(shown * 10) / 10} max={max} size={size} showValue={showValue} onDark={onDark} />;
}

// b. APPLICANT REORDERING: FLIP over the children of a container. Children carry
// data-flip-key. Measured with transforms cleared, so an interrupted move restarts from the
// true layout and always animates to transform: none (the correct final position).
export function useFlip(ref, dep) {
  const last = useRef(new Map());
  useIsoLayoutEffect(() => {
    const root = ref.current; if (!root) return;
    const items = [...root.querySelectorAll('[data-flip-key]')];
    for (const el of items) { el.style.transition = 'none'; el.style.transform = ''; }
    const origin = root.getBoundingClientRect();
    const now = new Map(items.map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.flipKey, { left: r.left - origin.left, top: r.top - origin.top }]; }));
    if (!prefersReducedMotion()) {
      for (const el of items) {
        const key = el.dataset.flipKey; const prev = last.current.get(key); const next = now.get(key);
        if (!prev || !next) continue;
        const dx = prev.left - next.left, dy = prev.top - next.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.willChange = 'transform';
        requestAnimationFrame(() => { el.style.transition = `transform ${DURATION.base}ms ${CURVE.settle}`; el.style.transform = ''; });
        el.addEventListener('transitionend', () => { el.style.transition = ''; el.style.willChange = ''; }, { once: true });
      }
    }
    last.current = now;
  }, [ref, dep]);
}

// c. VERIFICATION LANDING: the Verified pill. When an applicant flips to verified during this
// session the pill lands (a small overshoot on the emphasis curve). Already verified on load →
// no animation. Reduced motion → the pill is simply there.
export function VerifiedMark({ verified, id }) {
  const seen = useRef(new Map());
  const wasVerified = seen.current.get(id);
  const landed = verified && wasVerified === false;
  useEffect(() => { seen.current.set(id, !!verified); }, [id, verified]);
  if (!verified) return null;
  return <span className={`m-verified ${landed ? 'm-verified-land' : ''}`} title="Documents verified: the name on the documents matches and the details check out"><span className="m-verified-tick" aria-hidden="true" /> Verified</span>;
}

// d. REPORT SENT: the report leaves the screen. Rendered for one beat after a successful send;
// the sent message underneath is already in state. Reduced motion → nothing to see, the
// message is simply there.
export function ReportDeparture({ token, onDone }) {
  useEffect(() => { if (!token) return undefined; const t = setTimeout(() => onDone?.(), prefersReducedMotion() ? 0 : DURATION.long + 40); return () => clearTimeout(t); }, [token, onDone]);
  if (!token || prefersReducedMotion()) return null;
  return (
    <span className="m-depart" aria-hidden="true" key={token}>
      <span className="m-depart-card"><span className="m-depart-line" /><span className="m-depart-line short" /><span className="m-depart-line" /></span>
    </span>
  );
}

// e. BRAND PREVIEW: wrap a preview element; when `watch` changes the child re-enters with a
// crossfade (opacity plus a small scale on the enter curve). Only transform and opacity move.
export function Crossfade({ watch, children, className = '' }) {
  return <span key={String(watch)} className={`m-xfade ${className}`}>{children}</span>;
}

export function MotionStyles() {
  return (
    <style jsx global>{`
      :root { ${MOTION_VARS} }
      .m-verified { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.green}; background: ${C.greenTint}; border: 1px solid ${C.green}; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
      .m-verified-tick { width: 6px; height: 6px; border-radius: 50%; background: ${C.green}; display: inline-block; }
      .m-depart { position: relative; display: inline-block; width: 0; height: 0; overflow: visible; }
      .m-depart-card { position: absolute; left: 0; bottom: 0; width: 44px; height: 56px; border-radius: 6px; background: ${C.card}; border: 1px solid ${C.ruleDark}; box-shadow: 0 8px 20px rgba(15,15,16,0.14); display: flex; flex-direction: column; gap: 5px; padding: 10px 8px; pointer-events: none; opacity: 0; }
      .m-depart-line { display: block; height: 3px; border-radius: 2px; background: ${C.rule}; }
      .m-depart-line.short { width: 60%; }
      .m-xfade { display: contents; }
      /* f. the swipe card (components/motion/swipe.js): the action sits behind the card and is
         revealed as the card moves; only the card's transform and the underlay's opacity change. */
      .m-swipe { position: relative; min-width: 0; }
      .m-swipe-card { position: relative; touch-action: pan-y; will-change: transform; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
      .m-swipe-under { position: absolute; inset: 0; display: flex; align-items: center; padding: 0 16px; border-radius: 16px; opacity: 0; pointer-events: none; background: ${C.paperDeep}; color: ${C.ink}; }
      .m-swipe-under.left { justify-content: flex-start; }
      .m-swipe-under.right { justify-content: flex-end; }
      .m-swipe-under.good { background: ${C.greenTint}; color: ${C.green}; }
      .m-swipe-label { font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 12px; border: 1px solid currentColor; border-radius: 999px; transform: scale(0.92); }
      .m-swipe-under.armed .m-swipe-label { transform: scale(1.06); }
      /* g. the open applicant card: the body enters on the enter curve; section chevrons turn. */
      .m-chev { display: inline-flex; color: ${C.inkMute}; }
      .m-chev.open { transform: rotate(180deg); }
      /* h. the assistant panel: a Needs you card leaves the zone (transform and opacity only) and
         the event it became enters the timeline with the same enter animation as everything else. */
      .m-card-leave { opacity: 0; transform: translateY(-8px) scale(0.98); pointer-events: none; }
      @media ${MOTION_QUERY} {
        .m-verified-land { animation: m-land var(--m-base) var(--m-emphasis) both; transform-origin: left center; }
        @keyframes m-land { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
        .m-depart-card { animation: m-depart var(--m-long) var(--m-settle) both; }
        @keyframes m-depart { 0% { opacity: 1; transform: translate(0, 0) scale(1); } 100% { opacity: 0; transform: translate(40px, -72px) scale(0.7); } }
        .m-xfade > * { animation: m-in var(--m-base) var(--m-enter) both; }
        .m-swipe-label { transition: transform var(--m-short) var(--m-emphasis); }
        .m-chev { transition: transform var(--m-short) var(--m-settle); }
        .m-expand { animation: m-in var(--m-base) var(--m-enter) both; transform-origin: top center; }
        .m-card-leave { transition: opacity var(--m-base) var(--m-settle), transform var(--m-base) var(--m-settle); }
        .m-tl-enter { animation: m-in var(--m-base) var(--m-enter) both; }
        @keyframes m-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
      }
    `}</style>
  );
}
