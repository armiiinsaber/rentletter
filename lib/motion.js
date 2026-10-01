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
let flash = null; // set by installPress: shows a tap's press on an element (the tap resolver uses it)
export const pressFlash = (el) => { if (flash && el) flash(el); };
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
  flash = (target) => {
    if (off()) return;
    const t = target.hasAttribute('data-press-to-host') ? (target.closest('[data-press-host]') || target) : target;
    if (t.matches(UNPRESSABLE)) return;
    t.classList.remove('rl-released'); t.classList.add('rl-pressing');
    setTimeout(() => letGo(t), PRESS.down);
  };
  const opts = { capture: true, passive: true };
  doc.addEventListener('pointerdown', down, opts);
  doc.addEventListener('pointermove', move, opts);
  doc.addEventListener('pointerup', up, opts);
  doc.addEventListener('pointercancel', cancel, opts);
  window.addEventListener('scroll', cancel, opts);
  return () => {
    doc.removeEventListener('pointerdown', down, opts); doc.removeEventListener('pointermove', move, opts);
    doc.removeEventListener('pointerup', up, opts); doc.removeEventListener('pointercancel', cancel, opts);
    window.removeEventListener('scroll', cancel, opts); pressInstalled = false; flash = null;
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

// ── TARGETS: what a finger can hit ─────────────────────────────────────────────────────────────
// Controls, rows and whole cards (data-tap-card), and anything else made tappable (data-tap: the
// dimmed page behind a sheet, a toast that closes on a tap). Text fields are hit only directly.
// A label is a target only when it has a control (a tap on it focuses or toggles that control).
export const TAP_TARGETS = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"], label, summary, [data-tap], [data-tap-card]';
const isTarget = (el) => el.matches(TAP_TARGETS) && !(el.tagName === 'LABEL' && !el.control);
// The nearest target at or around an element, or null.
export function targetOf(el) {
  for (let a = el; a && a.nodeType === 1; a = a.parentElement) if (isTarget(a)) return a;
  return null;
}
export const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';
// What may only be hit directly: anything marked data-destructive, and any control whose words are
// an irreversible act (or open the confirm sheet for one).
const DESTRUCTIVE = /^(remove|delete|withdraw|mark (as )?(rented|withdrawn)|set aside|revoke|discard|decline)\b/i;
export function isDestructive(el) {
  if (!el || !el.closest) return false;
  if (el.closest('[data-destructive]')) return true;
  const words = String(el.getAttribute('aria-label') || el.textContent || '').trim();
  return DESTRUCTIVE.test(words);
}
const visibleBox = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return null; return r; };
const usable = (el) => !el.matches(':disabled, [aria-disabled="true"]') && !el.closest('fieldset:disabled, [aria-hidden="true"], [inert]');

// A tappable card: a tap anywhere on it acts, except on a control of its own, which keeps its
// action. onClick={cardTap(() => open())} on the card, marked data-tap-card. A click from a sheet
// the card renders (a portal: outside the card on the page, inside it in React) is not the card's.
export const cardTap = (fn) => (e) => {
  if (!e.currentTarget.contains(e.target)) return;
  // Text the realtor just selected on the card (a drag over it ends in a click): not a tap.
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  if (sel && !sel.isCollapsed && e.currentTarget.contains(sel.anchorNode)) return;
  const t = e.target && e.target.closest ? e.target : null;
  const own = t ? (t.closest(FIELDS) || targetOf(t)) : null;
  if (own && own !== e.currentTarget && e.currentTarget.contains(own)) return;
  fn(e);
};

// ── HIT AREAS: every target at least 44 by 44 ───────────────────────────────────────────────────
// A control smaller than HIT px in either direction gets an invisible extension (an ::after,
// components/ui.js HIT_CSS), centred on it, up to HIT. Nothing it shows moves or changes size.
// Where two extensions would meet they split the gap between the two controls at its midpoint, and
// one that needs less than half leaves the rest to the other. A side held back by a neighbour hands
// what it could not take to the opposite side, where that side is free. A form field cannot carry an
// extension but is never covered by one (fixed). A control inside another (a button in a tappable
// card) is not limited by it. planHitAreas is the arithmetic, installHitAreas applies it to the page
// and keeps it current.
export const HIT = 44;
export function planHitAreas(boxes) {
  // boxes: [{ l, t, r, b, inside: [indices of the boxes that contain it], fixed }]
  const ext = boxes.map((b) => { if (b.fixed) return { l: 0, r: 0, t: 0, b: 0 }; const ew = Math.max(0, HIT - (b.r - b.l)) / 2, eh = Math.max(0, HIT - (b.b - b.t)) / 2; return { l: ew, r: ew, t: eh, b: eh }; });
  const nested = (i, j) => (boxes[i].inside || []).includes(j) || (boxes[j].inside || []).includes(i);
  const across = (A, a, B, b) => A.t - a.t < B.b + b.b && B.t - b.t < A.b + a.b;
  const stacked = (A, a, B, b) => A.l - a.l < B.r + b.r && B.l - b.l < A.r + a.r;
  const split = (g, ea, ka, eb, kb) => {
    if (g < 0 || ea[ka] + eb[kb] <= g) return;
    if (ea[ka] <= g / 2) eb[kb] = g - ea[ka];
    else if (eb[kb] <= g / 2) ea[ka] = g - eb[kb];
    else { ea[ka] = g / 2; eb[kb] = g / 2; }
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j], a = ext[i], b = ext[j];
      if (nested(i, j)) continue; // one inside the other
      const side = across(A, a, B, b); // side by side, extensions included
      if (side && B.l >= A.r) split(B.l - A.r, a, 'r', b, 'l');
      else if (side && A.l >= B.r) split(A.l - B.r, b, 'r', a, 'l');
      const over = stacked(A, a, B, b);
      if (over && B.t >= A.b) split(B.t - A.b, a, 'b', b, 't');
      else if (over && A.t >= B.b) split(A.t - B.b, b, 'b', a, 't');
    }
  }
  // The remainder: a side held back hands the rest of the 44 to the opposite side, up to the free
  // space before the next neighbour there (its own extension included).
  const room = (i, dir) => {
    const A = boxes[i], a = ext[i]; let free = Infinity;
    for (let j = 0; j < boxes.length; j++) {
      if (j === i || nested(i, j)) continue;
      const B = boxes[j], b = ext[j];
      if ((dir === 'l' || dir === 'r') && !across(A, a, B, b)) continue;
      if ((dir === 't' || dir === 'b') && !stacked(A, a, B, b)) continue;
      const g = dir === 'r' ? B.l - b.l - A.r : dir === 'l' ? A.l - B.r - b.r : dir === 'b' ? B.t - b.t - A.b : A.t - B.b - b.b;
      const raw = dir === 'r' ? B.l - A.r : dir === 'l' ? A.l - B.r : dir === 'b' ? B.t - A.b : A.t - B.b;
      if (raw >= 0) free = Math.min(free, Math.max(0, g));
    }
    return free;
  };
  boxes.forEach((B, i) => {
    if (B.fixed) return;
    const e = ext[i];
    for (const [lo, hi, size] of [['l', 'r', B.r - B.l], ['t', 'b', B.b - B.t]]) {
      let short = HIT - size - e[lo] - e[hi];
      if (short <= 0.01) continue;
      for (const dir of [lo, hi]) { if (short <= 0.01) break; const add = Math.min(short, Math.max(0, room(i, dir) - e[dir])); if (add > 0) { e[dir] += add; short -= add; } }
    }
  });
  return ext;
}
// Form fields cannot carry an ::after; a field's own label is its larger target. Fields still count
// as neighbours, so no extension covers them.
const EXTENDABLE = (el) => !el.matches('input, select, textarea, img');
// Which scroller an element moves with: pairs in different scrollers do not limit each other.
const scrollerOf = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if (o === 'auto' || o === 'scroll') return a; } return null; };
let hitInstalled = false;
export function applyHitAreas(doc = document) {
  const els = [...doc.querySelectorAll(`${TAP_TARGETS}, ${FIELDS}`)].filter((el) => (el.matches(FIELDS) || isTarget(el)) && visibleBox(el));
  const boxes = els.map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroller: scrollerOf(el), inside: [], fixed: !EXTENDABLE(el) }; });
  els.forEach((el, i) => { els.forEach((o, j) => { if (i !== j && o.contains(el)) boxes[i].inside.push(j); }); });
  // Pairs in different scrollers never meet: give each scroller its own plan.
  const groups = new Map(); boxes.forEach((b, i) => { const k = b.scroller || doc; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const ext = new Array(els.length);
  for (const idx of groups.values()) {
    const local = idx.map((i) => ({ ...boxes[i], inside: boxes[i].inside.filter((j) => idx.includes(j)).map((j) => idx.indexOf(j)) }));
    planHitAreas(local).forEach((e, k) => { ext[idx[k]] = e; });
  }
  els.forEach((el, i) => {
    if (boxes[i].fixed) return;
    const e = ext[i]; const px = (v) => `${Math.max(0, Math.floor(v * 2) / 2)}px`;
    const need = e.l + e.r + e.t + e.b > 0.5;
    if (!need) {
      if (el.classList.contains('rl-hit')) {
        el.classList.remove('rl-hit'); ['--rl-hit-l', '--rl-hit-r', '--rl-hit-t', '--rl-hit-b'].forEach((v) => el.style.removeProperty(v));
        if (el.hasAttribute('data-rl-hit-pos')) { el.style.removeProperty('position'); el.removeAttribute('data-rl-hit-pos'); }
      }
      return;
    }
    // The ::after is placed from the padding box: a border is added back, so the area is measured
    // from the visible edge.
    const cs = getComputedStyle(el); const bw = (k) => parseFloat(cs[k]) || 0;
    const want = { '--rl-hit-l': px(e.l + bw('borderLeftWidth')), '--rl-hit-r': px(e.r + bw('borderRightWidth')), '--rl-hit-t': px(e.t + bw('borderTopWidth')), '--rl-hit-b': px(e.b + bw('borderBottomWidth')) };
    for (const [k, v] of Object.entries(want)) if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
    // The extension needs a positioned box; a static one becomes relative, which moves nothing.
    if (!el.hasAttribute('data-rl-hit-pos') && cs.position === 'static') { el.style.position = 'relative'; el.setAttribute('data-rl-hit-pos', ''); }
    if (!el.classList.contains('rl-hit')) el.classList.add('rl-hit');
  });
}
export function installHitAreas(doc = typeof document === 'undefined' ? null : document) {
  if (!doc || hitInstalled) return () => {};
  hitInstalled = true;
  let timer = 0;
  const schedule = () => { if (!timer) timer = setTimeout(() => { timer = 0; applyHitAreas(doc); }, 120); };
  const mo = new MutationObserver(schedule);
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'open', 'disabled'] });
  window.addEventListener('resize', schedule); window.addEventListener('load', schedule);
  applyHitAreas(doc);
  return () => { mo.disconnect(); clearTimeout(timer); window.removeEventListener('resize', schedule); window.removeEventListener('load', schedule); hitInstalled = false; };
}
// The extension, rendered by GlobalStyle (components/ui.js). It has no paint. Its box is the
// element's own (applyHitAreas makes a static element relative, which moves nothing).
export const HIT_CSS = `
  .rl-hit::after { content: ''; position: absolute; top: calc(-1 * var(--rl-hit-t, 0px)); right: calc(-1 * var(--rl-hit-r, 0px)); bottom: calc(-1 * var(--rl-hit-b, 0px)); left: calc(-1 * var(--rl-hit-l, 0px)); }
`;

// ── THE TAP RESOLVER: a near miss lands ─────────────────────────────────────────────────────────
// A tap that lands on nothing tappable looks for targets within RESOLVE.radius px. One clearly
// nearest (RESOLVE.ratio times closer than the next) is activated exactly as a direct tap would
// be, with the same press. Two close to equally near: nothing. Never a destructive control, never
// a text field (those need a direct hit), and never a tap that was part of a scroll or a drag.
export const RESOLVE = { radius: 16, ratio: 1.5 };
export const distanceToBox = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
// candidates: [{ d, destructive, field }] -> the index to activate, or -1.
export function pickTarget(candidates, { radius = RESOLVE.radius, ratio = RESOLVE.ratio } = {}) {
  const near = candidates.map((c, i) => ({ ...c, i })).filter((c) => c.d <= radius).sort((a, b) => a.d - b.d);
  if (!near.length) return -1;
  const [best, next] = near;
  if (next && next.d < best.d * ratio) return -1;
  if (best.destructive || best.field) return -1;
  return best.i;
}
let resolverInstalled = false;
export function installTapResolver(doc = typeof document === 'undefined' ? null : document) {
  if (!doc || resolverInstalled) return () => {};
  resolverInstalled = true;
  let down = null;
  const onDown = (e) => { if (e.isPrimary === false) return; down = { x: e.clientX, y: e.clientY, moved: false, scrolled: false }; };
  const onMove = (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > PRESS.slop) down.moved = true; };
  const onCancel = () => { if (down) down.moved = true; };
  const onScroll = () => { if (down) down.scrolled = true; };
  const onClick = (e) => {
    const d = down; down = null;
    if (!d || d.moved || d.scrolled || e.detail === 0) return; // a scroll, a drag, or a keyboard
    const t = e.target;
    if (!t || !t.closest || targetOf(t) || t.closest(FIELDS) || t.closest('[data-no-resolve]')) return; // a direct hit
    const x = e.clientX, y = e.clientY;
    const cands = [];
    for (const el of doc.querySelectorAll(`${TAP_TARGETS}, ${FIELDS}`)) {
      if (!el.matches(FIELDS) && !isTarget(el)) continue;
      const r = visibleBox(el); if (!r || !usable(el)) continue;
      const dist = distanceToBox(x, y, r); if (dist > RESOLVE.radius) continue;
      // Only what is on top at its own nearest point (nothing behind a sheet, nothing covered).
      const px = Math.min(Math.max(x, r.left + 1), r.right - 1), py = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
      const top = doc.elementFromPoint(px, py); if (!top || !(top === el || el.contains(top))) continue;
      // A target inside another (a button in a tappable card) counts once, as the outer one: the
      // whole card is the target.
      if (cands.some((c) => c.el.contains(el))) continue;
      for (let k = cands.length - 1; k >= 0; k--) if (el.contains(cands[k].el)) cands.splice(k, 1);
      cands.push({ el, d: dist, destructive: isDestructive(el), field: el.matches(FIELDS) });
    }
    const i = pickTarget(cands);
    if (i < 0) return;
    const el = cands[i].el;
    pressFlash(el);
    el.click();
  };
  const cap = { capture: true, passive: true };
  doc.addEventListener('pointerdown', onDown, cap);
  doc.addEventListener('pointermove', onMove, cap);
  doc.addEventListener('pointercancel', onCancel, cap);
  window.addEventListener('scroll', onScroll, cap);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('pointerdown', onDown, cap); doc.removeEventListener('pointermove', onMove, cap); doc.removeEventListener('pointercancel', onCancel, cap);
    window.removeEventListener('scroll', onScroll, cap); doc.removeEventListener('click', onClick, true); resolverInstalled = false;
  };
}
