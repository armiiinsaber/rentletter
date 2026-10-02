// components/nav/EdgeBack.js  CLIENT.
// The swipe from the left edge back to the previous screen, as every iPhone app has it, in the
// installed app only: Safari has its own. components/nav/RouteFrame.js decides when it may start
// and owns what shows; this file is the gesture, its motion, and the picture of a screen that is
// drawn beneath the page while the finger drags.
//   A touch that starts within EDGE px of the left edge. After SLOP px it is decided: mostly
//   vertical lets the page scroll, to the right takes the gesture (the page never scrolls under it).
//   The page follows the finger 1:1; the screen beneath slides in from 24% to the left, as the push
//   in reverse (lib/motion.js NAV_CSS), and its dim lifts. Released past a third of the width, or
//   flicked, it completes over 280ms on the iOS curve; otherwise it settles back the same way.
//   Under reduced motion nothing follows the finger: a flick goes back with the 120ms crossfade.
import { useLayoutEffect, useRef } from 'react';
import { NATIVE, CURVE, prefersReducedMotion } from '../../lib/motion';

export const EDGE = 20; // px from the left edge
export const SLOP = 10; // px before the direction is decided
export const COMMIT = 1 / 3; // of the width
export const FLICK = 0.5; // px per ms, over the last 100ms
export const PARALLAX = 0.24; // where the screen beneath starts, as the push leaves it (NAV_CSS)
export const DIM = 0.12; // the dim over the screen beneath at the start

// allowed(): may a swipe start now. open(): draw the screen beneath, return { page, shift, dim }
// (the page that moves, the screen beneath, its dim) or null. commit(reduced): the swipe went
// through: show the previous screen and go back. close(): it settled back: take the beneath away.
export function installEdgeBack({ allowed, open, commit, close }) {
  let g = null; // the touch in progress
  let settling = false; // a completion or a settle back is running
  const place = (s) => {
    const p = Math.min(Math.max(s.dx / s.w, 0), 1);
    s.els.page.style.transform = `translate3d(${Math.max(s.dx, 0)}px, 0, 0)`;
    s.els.shift.style.transform = `translate3d(${-PARALLAX * s.w * (1 - p)}px, 0, 0)`;
    s.els.dim.style.opacity = String(DIM * (1 - p));
  };
  const speed = (s) => {
    const last = s.samples[s.samples.length - 1];
    const first = s.samples.find((p) => last.t - p.t <= 100) || last;
    return last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
  };
  const settle = (s, through) => {
    settling = true;
    const { page, shift, dim } = s.els;
    const timing = { duration: NATIVE.push, easing: CURVE.ios, fill: 'forwards' };
    const a = page.animate([{ transform: page.style.transform || 'none' }, { transform: `translate3d(${through ? s.w : 0}px, 0, 0)` }], timing);
    shift.animate([{ transform: shift.style.transform }, { transform: `translate3d(${through ? 0 : -PARALLAX * s.w}px, 0, 0)` }], timing);
    dim.animate([{ opacity: dim.style.opacity }, { opacity: through ? 0 : DIM }], timing);
    const finish = () => { settling = false; if (through) commit(false); else close(); };
    a.finished.then(finish, finish);
  };
  const down = (e) => {
    if (g || settling || e.pointerType !== 'touch' || e.isPrimary === false || e.clientX > EDGE) return;
    if (!allowed()) return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, engaged: false, reduced: prefersReducedMotion(), w: window.innerWidth || 390, samples: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const move = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
    g.samples.push({ x: e.clientX, t: e.timeStamp }); if (g.samples.length > 12) g.samples.shift();
    if (!g.engaged) {
      if (Math.hypot(dx, dy) < SLOP) return;
      if (Math.abs(dy) >= Math.abs(dx) || dx <= 0 || !allowed()) { g = null; return; } // a scroll, or not a back
      if (!g.reduced) { const els = open(); if (!els) { g = null; return; } g.els = els; }
      g.engaged = true;
    }
    g.dx = dx;
    if (!g.reduced) place(g);
  };
  const up = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const s = g; g = null;
    if (!s.engaged) return;
    const flick = speed(s) > FLICK && s.dx > SLOP * 2;
    const through = e.type === 'pointerup' && (flick || (!s.reduced && s.dx > s.w * COMMIT));
    if (s.reduced) { if (through) commit(true); return; }
    settle(s, through);
  };
  // Once the swipe has the finger, the browser must not turn it into a scroll.
  const hold = (e) => { if (g && g.engaged && e.cancelable) e.preventDefault(); };
  const capture = { capture: true };
  window.addEventListener('pointerdown', down, capture);
  window.addEventListener('pointermove', move, capture);
  window.addEventListener('pointerup', up, capture);
  window.addEventListener('pointercancel', up, capture);
  window.addEventListener('touchmove', hold, { capture: true, passive: false });
  return () => {
    window.removeEventListener('pointerdown', down, capture); window.removeEventListener('pointermove', move, capture);
    window.removeEventListener('pointerup', up, capture); window.removeEventListener('pointercancel', up, capture);
    window.removeEventListener('touchmove', hold, { capture: true });
  };
}

// ── A picture of a screen as it was left ─────────────────────────────────────────────────────
// Taken the moment a navigation leaves a real screen (never a skeleton): a copy of the page's
// elements, the styles in force then (a page's own styles leave with it), and where it was scrolled.
export function captureScreen() {
  const root = typeof document === 'undefined' ? null : document.getElementById('__next');
  if (!root || root.querySelector('[data-skeleton-route], [data-load-failed], [aria-busy="true"], [data-snapshot]')) return null;
  const holder = document.createElement('div');
  for (const n of root.childNodes) holder.appendChild(n.cloneNode(true));
  for (const el of holder.querySelectorAll('[id]')) el.removeAttribute('id'); // the live page keeps its ids
  const css = [];
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) css.push(r.cssText); } catch (e) { /* a sheet from another origin (the fonts) stays on the page */ }
  }
  return { holder, css: css.join('\n'), y: window.scrollY };
}
// The picture, never interactive. fixed: drawn in the layer beneath the page, at its scroll; otherwise
// in the page's place (the window is then scrolled to it).
export function Snapshot({ shot, fixed = false }) {
  const host = useRef(null);
  useLayoutEffect(() => { if (host.current) host.current.replaceChildren(shot.holder.cloneNode(true)); }, [shot]);
  return (
    <div data-snapshot="" aria-hidden="true" inert style={fixed ? { position: 'absolute', inset: 0, overflow: 'hidden' } : undefined}>
      <style>{shot.css}</style>
      {/* overflow-x as on #__next (components/ui.js), so the sticky header scrolls as it did on the page. */}
      <div ref={host} style={fixed ? { transform: `translateY(${-shot.y}px)`, overflowX: 'hidden' } : { overflowX: 'hidden' }} />
    </div>
  );
}
