// lib/motion.js
// The motion vocabulary. Three curves named by intent, three durations, one reduced motion
// check. Every animation in the product uses these and nothing else: no inline durations, no
// one off beziers. Motion carries meaning (a value that changes visibly changes, a thing that
// moves travels there, a state that flips is marked); anything else stays still.
//
// Reduced motion is absolute: prefersReducedMotion() true means every animation resolves
// instantly to its end state, not a shorter or faded version. Three exceptions, each a short
// fade with no movement: a press (an opacity dip), a page push and a sheet (a 120ms crossfade). Nothing blocks on animation:
// state commits first, the animation follows and is purely presentational.
export const CURVE = {
  enter: 'cubic-bezier(0.22, 1, 0.36, 1)',     // something arrives or grows into place: quick start, soft landing
  settle: 'cubic-bezier(0.4, 0, 0.2, 1)',      // something travels to a new position: even, no bounce
  emphasis: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // a state flips and should be noticed: a small overshoot, then rest
  ios: 'cubic-bezier(0.32, 0.72, 0, 1)',        // pushes and sheets: a fast start, a long soft settle
  soft: 'cubic-bezier(0.25, 0.1, 0.25, 1)',      // a press letting go
};
export const DURATION = { short: 160, base: 280, long: 460 }; // ms; nothing over 500
// The native feel (iOS): a page pushes in from the right over 280ms and a sheet rises over 320ms
// on the iOS curve; under reduced motion both are a 120ms crossfade and nothing moves.
export const NATIVE = { push: 280, sheet: 320, fade: 120 };
// CSS custom properties for stylesheets: var(--m-enter), var(--m-base) and so on.
export const MOTION_VARS = `--m-enter: ${CURVE.enter}; --m-settle: ${CURVE.settle}; --m-emphasis: ${CURVE.emphasis}; --m-short: ${DURATION.short}ms; --m-base: ${DURATION.base}ms; --m-long: ${DURATION.long}ms;`;
export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true; // server and unknown: end state
  return !window.matchMedia(MOTION_QUERY).matches;
}

// Counted value for a number that should visibly change: calls onFrame(value) from `from` to
// `to` over `ms`, then onFrame(to) exactly. Reduced motion → onFrame(to) once, synchronously.
// Returns cancel(landOnEnd = true): by default cancelling lands on `to`; cancel(false) only stops,
// for callers that will start again from the last shown value.
export function tween({ from, to, ms = DURATION.long, delay = 0, onFrame }) {
  if (prefersReducedMotion() || ms <= 0 || from === to) { onFrame(to); return () => {}; }
  let raf = 0; let done = false;
  const start = performance.now() + delay;
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const step = (now) => {
    if (done) return;
    const k = Math.min(1, Math.max(0, (now - start) / ms));
    onFrame(k >= 1 ? to : from + (to - from) * ease(k));
    if (k < 1) raf = requestAnimationFrame(step); else done = true;
  };
  raf = requestAnimationFrame(step);
  return (landOnEnd = true) => { if (!done) { done = true; cancelAnimationFrame(raf); if (landOnEnd) onFrame(to); } };
}

// ── PRESS: every tappable thing answers the finger ─────────────────────────────────────────────
// One mechanism for the whole app, installed once (pages/_app.js): a card, a row, a pill button or
// a button scales to 0.98 over 90ms when pressed and back over 160ms when let go, a card's shadow
// tightening a little. It never fires on a scroll: the press shows only after the finger has
// rested PRESS.rest ms, or on a real tap (down and up without moving), and it is dropped the moment
// the finger moves more than PRESS.slop px or the page scrolls. Disabled controls never react.
// Under reduced motion the scale becomes a brief opacity dip to 0.9. The page can switch it off
// with data-no-press on <html> (the tenant and landlord pages: nothing there animates).
// A row that stands for its whole card (data-press-to-host) presses the card around it
// (data-press-host), so the card answers, not a strip of it.
export const PRESS = { rest: 60, slop: 6, down: 90, up: 160 };
export const PRESSABLE = 'button, [role="button"], [role="link"], a[data-press], [data-press]';
const UNPRESSABLE = ':disabled, [aria-disabled="true"], [data-press="off"]';
// The styles, rendered by GlobalStyle (components/ui.js). The classes exist only during a press,
// so nothing carries a transition at rest. scale composes with any transform the element has.
export const PRESS_CSS = `
  .rl-pressing { scale: 0.98; transition: scale ${PRESS.down}ms ${CURVE.soft}, box-shadow ${PRESS.down}ms ${CURVE.soft}; }
  .rl-released { transition: scale ${PRESS.up}ms ${CURVE.soft}, box-shadow ${PRESS.up}ms ${CURVE.soft}; }
  [data-press="card"].rl-pressing, [data-press-host].rl-pressing { box-shadow: 0 1px 2px rgba(15, 15, 16, 0.06), 0 4px 12px rgba(15, 15, 16, 0.05) !important; }
  @media (prefers-reduced-motion: reduce) {
    .rl-pressing { scale: none; opacity: 0.9; transition: opacity ${PRESS.down}ms linear; }
    .rl-released { transition: opacity ${PRESS.up}ms linear; }
  }
`;
let pressInstalled = false;
export function installPress(doc = typeof document === 'undefined' ? null : document) {
  if (!doc || pressInstalled) return () => {};
  pressInstalled = true;
  let el = null; let shown = false; let timer = 0; let x0 = 0; let y0 = 0;
  const off = () => doc.documentElement.hasAttribute('data-no-press');
  const letGo = (t) => { t.classList.remove('rl-pressing'); t.classList.add('rl-released'); setTimeout(() => t.classList.remove('rl-released'), PRESS.up + 40); };
  const drop = (animate) => { clearTimeout(timer); if (el && shown) { if (animate) letGo(el); else el.classList.remove('rl-pressing'); } el = null; shown = false; };
  const down = (e) => {
    if (off() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    let t = e.target && e.target.closest ? e.target.closest(PRESSABLE) : null;
    if (!t || t.matches(UNPRESSABLE) || t.closest('fieldset:disabled')) return;
    if (t.hasAttribute('data-press-to-host')) t = t.closest('[data-press-host]') || t;
    drop(false); el = t; x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(() => { if (el === t) { shown = true; t.classList.remove('rl-released'); t.classList.add('rl-pressing'); } }, PRESS.rest);
  };
  const move = (e) => { if (el && Math.hypot(e.clientX - x0, e.clientY - y0) > PRESS.slop) drop(true); };
  const up = () => {
    if (!el) return;
    if (shown) { drop(true); return; }
    // A real tap, quicker than the rest time: the press still shows, down then up.
    const t = el; clearTimeout(timer); el = null;
    t.classList.remove('rl-released'); t.classList.add('rl-pressing');
    setTimeout(() => letGo(t), PRESS.down);
  };
  const cancel = () => drop(true);
  const opts = { capture: true, passive: true };
  doc.addEventListener('pointerdown', down, opts);
  doc.addEventListener('pointermove', move, opts);
  doc.addEventListener('pointerup', up, opts);
  doc.addEventListener('pointercancel', cancel, opts);
  window.addEventListener('scroll', cancel, opts);
  return () => {
    doc.removeEventListener('pointerdown', down, opts); doc.removeEventListener('pointermove', move, opts);
    doc.removeEventListener('pointerup', up, opts); doc.removeEventListener('pointercancel', cancel, opts);
    window.removeEventListener('scroll', cancel, opts); pressInstalled = false;
  };
}

// ── PAGE PUSH: realtor screens only (components/nav/RouteFrame.js sets data-nav on <html>) ─────
// Going deeper (the dashboard to a listing) the new page slides in from the right over 280ms on
// the iOS curve while the old one shifts left a little; going back reverses it. Under reduced
// motion (data-nav="fade") it is a 120ms crossfade. Rendered by GlobalStyle (components/ui.js).
export const NAV_CSS = `
  html[data-nav="push"]::view-transition-old(root), html[data-nav="push"]::view-transition-new(root),
  html[data-nav="back"]::view-transition-old(root), html[data-nav="back"]::view-transition-new(root) { mix-blend-mode: normal; animation-duration: ${NATIVE.push}ms; animation-timing-function: ${CURVE.ios}; animation-fill-mode: both; }
  html[data-nav="push"]::view-transition-new(root) { animation-name: rl-nav-in; }
  html[data-nav="push"]::view-transition-old(root) { animation-name: rl-nav-out; }
  html[data-nav="back"]::view-transition-old(root) { animation-name: rl-nav-back-out; z-index: 1; }
  html[data-nav="back"]::view-transition-new(root) { animation-name: rl-nav-back-in; }
  html[data-nav="fade"]::view-transition-old(root), html[data-nav="fade"]::view-transition-new(root) { animation-duration: ${NATIVE.fade}ms; }
  @keyframes rl-nav-in { from { transform: translateX(100%); } }
  @keyframes rl-nav-out { to { transform: translateX(-24%); } }
  @keyframes rl-nav-back-in { from { transform: translateX(-24%); } }
  @keyframes rl-nav-back-out { to { transform: translateX(100%); } }
`;
// The same push where the View Transitions API is missing: the incoming page alone slides (or
// fades, under reduced motion); the animation leaves nothing behind when it ends.
export function slideIn(el, direction) {
  if (!el || typeof el.animate !== 'function') return null;
  const reduced = prefersReducedMotion();
  const frames = reduced ? [{ opacity: 0 }, { opacity: 1 }]
    : direction === 'back' ? [{ transform: 'translateX(-24%)' }, { transform: 'none' }] : [{ transform: 'translateX(100%)' }, { transform: 'none' }];
  return el.animate(frames, { duration: reduced ? NATIVE.fade : NATIVE.push, easing: reduced ? 'linear' : CURVE.ios });
}
