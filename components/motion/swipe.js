// components/motion/swipe.js
// f. THE APPLICANT CARD AS AN OBJECT. A card the realtor can push sideways with a finger. It
// follows the finger one to one, with rising resistance the further it travels, and reveals the
// action behind it: push LEFT to set aside (away, down the list), push RIGHT to restore (back).
// Release past a distance or above a velocity commits; anything less springs back on the settle
// curve. Vertical gestures belong to the scroller: the card carries touch-action: pan-y, and the
// first movement decides the axis, so a scroll is never taken over.
//
// The state change is the parent's (onCommit fires the moment the finger lifts); the motion
// here is presentational and follows. Reduced motion: the drag still tracks the finger (it is
// direct manipulation, not decoration); the spring back and the departure resolve instantly.
//
// Interruptible: pointerdown reads the card's CURRENT transform (mid spring, mid hint, mid
// anything), cancels the transition, and continues from there. No animation is ever awaited.
import { useEffect, useRef } from 'react';
import { CURVE, DURATION, prefersReducedMotion } from '../../lib/motion';

export const SWIPE = {
  commitFraction: 0.4,   // of the card width: a slow, deliberate drag commits here
  minTravel: 32,         // px: below this nothing commits, however fast (a tap is not a flick)
  flickVelocity: 0.55,   // px per ms (about 550 px/s): a short fast flick commits
  freeTravel: 0.28,      // of the width: follows the finger exactly this far, then resists
  deadTravel: 36,        // px: the most the card moves in a direction that has no action
  axisLock: 8,           // px: movement before the gesture picks an axis
};

const readTranslateX = (el) => {
  try { const m = new window.DOMMatrixReadOnly(getComputedStyle(el).transform); return Number.isFinite(m.m41) ? m.m41 : 0; } catch (e) { return 0; }
};

export default function SwipeCard({ flipKey, id, leftAction, rightAction, onCommit, departing, hint, onHintDone, className = '', style, children }) {
  const cardRef = useRef(null);
  const leftRef = useRef(null);   // underlay revealed when the card moves RIGHT
  const rightRef = useRef(null);  // underlay revealed when the card moves LEFT
  const g = useRef({ active: false, lock: null, id: null, startX: 0, startY: 0, base: 0, x: 0, samples: [], dragged: false });
  const actions = useRef({ leftAction, rightAction, onCommit, departing });
  actions.current = { leftAction, rightAction, onCommit, departing };

  // Paint the card position and the revealed action. Direct DOM: nothing re-renders per frame.
  const paint = (x, armed) => {
    const card = cardRef.current; if (!card) return;
    card.style.transform = x ? `translateX(${x}px)` : '';
    const w = card.offsetWidth || 1;
    const show = (el, on, p) => { if (!el) return; el.style.opacity = on ? String(Math.min(1, p)) : '0'; el.classList.toggle('armed', on && armed); };
    show(rightRef.current, x < 0 && !!actions.current.leftAction, Math.abs(x) / (w * 0.18));
    show(leftRef.current, x > 0 && !!actions.current.rightAction, Math.abs(x) / (w * 0.18));
  };
  const setTransition = (on) => { const card = cardRef.current; if (!card) return; card.style.transition = on && !prefersReducedMotion() ? `transform ${DURATION.base}ms ${CURVE.settle}, opacity ${DURATION.base}ms ${CURVE.settle}` : 'none'; };

  // Resistance: one to one for the first stretch, then each further pixel counts for less. A
  // direction with no action is a short rubber band so the card still feels held, not stuck.
  const resist = (raw) => {
    const card = cardRef.current; const w = card?.offsetWidth || 320;
    const dirAction = raw < 0 ? actions.current.leftAction : actions.current.rightAction;
    const a = Math.abs(raw);
    if (!dirAction) return Math.sign(raw) * SWIPE.deadTravel * (1 - Math.exp(-a / SWIPE.deadTravel));
    const free = w * SWIPE.freeTravel;
    if (a <= free) return raw;
    const extra = a - free;
    return Math.sign(raw) * (free + extra / (1 + extra / (w * 0.6)));
  };
  const armedAt = (x) => { const w = cardRef.current?.offsetWidth || 320; return Math.abs(x) >= w * SWIPE.commitFraction; };

  const onPointerDown = (e) => {
    const s = g.current;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (actions.current.departing) return; // already committed and leaving: the landing state is set
    if (e.target.closest('button, a, input, select, textarea, label, [data-no-swipe]')) return;
    const card = cardRef.current; if (!card) return;
    // Take over from wherever the card is right now (mid spring back, mid hint).
    const current = readTranslateX(card);
    setTransition(false);
    s.active = true; s.lock = null; s.id = e.pointerId; s.startX = e.clientX; s.startY = e.clientY; s.base = current; s.x = current; s.samples = [{ t: e.timeStamp, x: current }]; s.dragged = false;
    paint(current, armedAt(current));
  };
  const onPointerMove = (e) => {
    const s = g.current; if (!s.active || e.pointerId !== s.id) return;
    const dx = e.clientX - s.startX, dy = e.clientY - s.startY;
    if (!s.lock) {
      if (Math.abs(dy) >= SWIPE.axisLock && Math.abs(dy) > Math.abs(dx)) { s.lock = 'v'; s.active = false; if (s.base) settle(s.base); return; } // the scroller's gesture
      if (Math.abs(dx) >= SWIPE.axisLock && Math.abs(dx) > Math.abs(dy)) { s.lock = 'h'; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture is best effort */ } }
      else return;
    }
    if (s.lock !== 'h') return;
    s.dragged = true;
    e.preventDefault();
    const x = resist(s.base + dx);
    s.x = x;
    s.samples.push({ t: e.timeStamp, x }); if (s.samples.length > 8) s.samples.shift();
    paint(x, armedAt(x));
  };
  // Spring back to rest (settle curve; instant under reduced motion).
  const settle = (from) => {
    setTransition(true);
    paint(from, false);
    requestAnimationFrame(() => { paint(0, false); });
  };
  const onPointerUp = (e) => {
    const s = g.current; if (!s.active || e.pointerId !== s.id) return;
    s.active = false;
    if (s.lock !== 'h') { if (s.x) settle(s.x); return; }
    const x = s.x; const w = cardRef.current?.offsetWidth || 320;
    const oldest = s.samples.find((p) => e.timeStamp - p.t <= 100) || s.samples[0];
    const latest = s.samples[s.samples.length - 1];
    const v = oldest && latest && latest.t > oldest.t ? (latest.x - oldest.x) / (latest.t - oldest.t) : 0;
    const dirAction = x < 0 ? actions.current.leftAction : actions.current.rightAction;
    const far = Math.abs(x) >= w * SWIPE.commitFraction;
    const flick = Math.abs(v) >= SWIPE.flickVelocity && Math.abs(x) >= SWIPE.minTravel && Math.sign(v) === Math.sign(x);
    if (dirAction && (far || flick)) {
      const committed = actions.current.onCommit?.(x < 0 ? 'left' : 'right');
      if (committed) return; // the parent now renders `departing`; the effect below moves the card out
    }
    settle(x);
  };
  // A drag that ends over a button must not click it.
  const onClickCapture = (e) => { if (g.current.dragged) { g.current.dragged = false; e.stopPropagation(); e.preventDefault(); } };

  // Departure: the state is already committed; the card slides out the way it was pushed. The
  // parent keeps it in place for one beat (DURATION.base), then re-renders it in its new list.
  useEffect(() => {
    if (!departing) return;
    const card = cardRef.current; if (!card) return;
    const w = card.offsetWidth || 320;
    if (prefersReducedMotion()) { paint(0, false); return; }
    setTransition(true);
    requestAnimationFrame(() => { card.style.transform = `translateX(${departing === 'left' ? -(w + 24) : w + 24}px)`; card.style.opacity = '0'; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departing]);

  // First run hint: the card nudges left a little, shows the action behind it, and comes back.
  useEffect(() => {
    if (!hint) return undefined;
    if (prefersReducedMotion()) { onHintDone?.(); return undefined; }
    const card = cardRef.current; if (!card) return undefined;
    const t1 = setTimeout(() => { if (g.current.active) return; card.style.transition = `transform ${DURATION.long}ms ${CURVE.settle}`; paint(-44, false); }, 700);
    const t2 = setTimeout(() => { if (g.current.active) return; paint(0, false); }, 700 + DURATION.long + 260);
    const t3 = setTimeout(() => { if (!g.current.active) card.style.transition = ''; onHintDone?.(); }, 700 + DURATION.long * 2 + 300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint]);

  return (
    <div data-flip-key={flipKey} className={`m-swipe ${className}`} style={style}>
      {rightAction && <div ref={leftRef} className={`m-swipe-under left ${rightAction.tone || ''}`} aria-hidden="true"><span className="m-swipe-label">{rightAction.label}</span></div>}
      {leftAction && <div ref={rightRef} className={`m-swipe-under right ${leftAction.tone || ''}`} aria-hidden="true"><span className="m-swipe-label">{leftAction.label}</span></div>}
      <div ref={cardRef} id={id} className="m-swipe-card"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}
        onClickCapture={onClickCapture}>
        {children}
      </div>
    </div>
  );
}
