// lib/motion.js
// The motion vocabulary. Three curves named by intent, three durations, one reduced motion
// check. Every animation in the product uses these and nothing else: no inline durations, no
// one off beziers. Motion carries meaning (a value that changes visibly changes, a thing that
// moves travels there, a state that flips is marked); anything else stays still.
//
// Reduced motion is absolute: prefersReducedMotion() true means every animation resolves
// instantly to its end state, not a shorter or faded version. Nothing blocks on animation:
// state commits first, the animation follows and is purely presentational.
export const CURVE = {
  enter: 'cubic-bezier(0.22, 1, 0.36, 1)',     // something arrives or grows into place: quick start, soft landing
  settle: 'cubic-bezier(0.4, 0, 0.2, 1)',      // something travels to a new position: even, no bounce
  emphasis: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // a state flips and should be noticed: a small overshoot, then rest
};
export const DURATION = { short: 160, base: 280, long: 460 }; // ms; nothing over 500
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
