// components/brand/doorGeometry.js
// The door mark's geometry, timing and projection (components/brand/DoorMark.js draws it). Plain
// JavaScript with no JSX, so the unit tests read the same numbers the page draws with. Everything
// comes from the official vector source (lib/brand/logoPaths.js), the tokens (components/theme.js)
// and the motion vocabulary (lib/motion.js DOOR).
//
// The door is one flat rectangle, the bar's height tall and the open width wide, hinged on its
// edge nearest the R and turning about that vertical edge. Every frame its four corners are placed
// in 3D and projected through one camera centred on the mark, and the quadrilateral they make is
// drawn as one polygon with one fill. Angle 0 points the door straight into the screen, 90 lays it
// face on, left of the hinge. It rests as the thin bar at the angle where it projects exactly the
// bar's width, or as the panel, face on.
import { LOGO, MARK } from '../../lib/brand/logoPaths';
import { DOOR, REDUCED_QUERY } from '../../lib/motion';
import { C } from '../theme';

// The widest the controls go, as a fraction of the R's width: at this setting the open panel of
// the app icons reaches the edge of the icon's ground, and no further.
export const DOOR_OPEN_RANGE = Object.freeze({ min: 0.2, max: 0.75, step: 0.05 });
// The knob's diameter on the open panel, as a fraction of the panel's width.
export const DOOR_KNOB_RANGE = Object.freeze({ min: 0.05, max: 0.35, step: 0.01 });
export const DOOR_SHADE = 0.12;    // the most ink mixed into the fill, at mid swing
export const PERSPECTIVE = 6;      // the camera's distance from the screen, in bar heights
const IOS_RADIUS = 0.2237;         // the home screen corner, as scripts/brand/draw.mjs IOS_RADIUS

// ── geometry ────────────────────────────────────────────────────────────────────────────────────
// The box of a path made of absolute M, L, Q and Z commands (the generated paths use nothing else).
export function pathBox(d) {
  const n = (String(d).match(/-?\d*\.?\d+/g) || []).map(Number);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const subpaths = (d) => String(d).match(/M[^M]*/g) || [];
// The wordmark's R is its first two subpaths (the bowl and stem, then the leg); the rest is "entletter".
export const LOGO_R = subpaths(LOGO.text).slice(0, 2).join('');
const LOGO_REST = subpaths(LOGO.text).slice(2).join('');
export const R_BOX = Object.freeze({ wordmark: pathBox(LOGO_R), mark: pathBox(MARK.any.r) });

// The grounds, from the tokens: the wordmark on paper, the two app icons as scripts/brand/draw.mjs
// PALETTES draws them, and the loading icon on paper and on ink. knob: ink on a red door, the brand
// red on an ink door.
export const DOOR_GROUNDS = Object.freeze({
  wordmark: { ground: C.paper, bar: C.red, letter: C.ink, knob: C.ink },
  realtor: { ground: C.red, bar: C.inst, letter: C.card, knob: C.red },
  admin: { ground: C.inst, bar: C.red, letter: C.instText, knob: C.ink },
  paper: { ground: C.paper, bar: C.red, letter: C.ink, knob: C.ink },
  ink: { ground: C.ink, bar: C.red, letter: C.paper, knob: C.ink },
});

// Everything in box units (a viewBox from 0 0), k the pixels per unit at this size, and cam the
// point the camera is centred on: the middle of the mark.
//   wordmark  size is the cap height in px; room is left of the bar for the widest open panel.
//   realtor, admin  size is the icon's side in px, the mark as the home screen icon draws it.
//   paper, ink  the loading icon: the stripe and the R with the door at its widest for this
//               setting, centred in the square inside a margin of one eighth, so nothing leaves it.
export function doorGeometry(kind, size, open) {
  if (kind === 'wordmark') {
    const R = R_BOX.wordmark; const b = LOGO.bar;
    const ox = Math.ceil(DOOR_OPEN_RANGE.max * R.w - b.w) + 4;
    return { k: size / 100, w: ox + LOGO.w, h: LOGO.h, letters: `translate(${ox} 0)`, rPath: LOGO_R, restPath: LOGO_REST,
      bar: { x: ox + b.x, y: b.y, w: b.w, h: b.h, rx: b.rx }, rW: R.w, rLeft: ox + R.x0, radius: null, cam: { x: ox + LOGO.w / 2, y: LOGO.h / 2 } };
  }
  const m = MARK.any; const R = R_BOX.mark; const b = m.bar; const k = size / MARK.size; const cam = { x: MARK.size / 2, y: MARK.size / 2 };
  if (kind === 'realtor' || kind === 'admin') {
    return { k, w: MARK.size, h: MARK.size, letters: null, rPath: m.r, restPath: null, bar: { ...b }, rW: R.w, rLeft: R.x0, radius: MARK.size * IOS_RADIUS, cam };
  }
  const x0 = b.x + b.w - open * R.w; const x1 = R.x1; const y0 = Math.min(b.y, R.y0); const y1 = Math.max(b.y + b.h, R.y1);
  const inner = MARK.size * 0.75; const s = Math.min(inner / (x1 - x0), inner / (y1 - y0));
  const tx = (MARK.size - (x1 - x0) * s) / 2 - x0 * s; const ty = (MARK.size - (y1 - y0) * s) / 2 - y0 * s;
  return { k, w: MARK.size, h: MARK.size, letters: `translate(${r3(tx)} ${r3(ty)}) scale(${r3(s)})`, rPath: m.r, restPath: null,
    bar: { x: tx + b.x * s, y: ty + b.y * s, w: b.w * s, h: b.h * s, rx: b.rx * s }, rW: R.w * s, rLeft: tx + R.x0 * s, radius: 0, cam };
}

// The door: the hinge line, the top and bottom, the bar's width, the open width, the camera.
export function doorParts(g, open) {
  return { hx: g.bar.x + g.bar.w, top: g.bar.y, bottom: g.bar.y + g.bar.h, t: g.bar.w, W: open * g.rW, cx: g.cam.x, cy: g.cam.y, P: PERSPECTIVE * g.bar.h };
}
// One point of the door plane, u along the door from the hinge (0) to the free edge (W), at height y,
// with the door at deg, projected through the camera.
export function projectPoint(p, deg, u, y) {
  const a = (deg * Math.PI) / 180;
  const x = p.hx - u * Math.sin(a); const z = -u * Math.cos(a);
  const s = p.P / (p.P - z);
  return [p.cx + (x - p.cx) * s, p.cy + (y - p.cy) * s, s];
}
// The four corners, in order: hinge top, hinge bottom, free bottom, free top.
export function doorQuad(p, deg) {
  return [projectPoint(p, deg, 0, p.top), projectPoint(p, deg, 0, p.bottom), projectPoint(p, deg, p.W, p.bottom), projectPoint(p, deg, p.W, p.top)].map(([x, y]) => [x, y]);
}
// How wide the door projects left of the hinge at deg (negative when it shows to the right).
export const projectedWidth = (p, deg) => p.hx - projectPoint(p, deg, p.W, p.top)[0];
const solve = (f, target, lo, hi) => { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
// Edge on to the camera: the angle at which the door projects to a line on the hinge. The camera is
// off to the side of the bar, so this is a few degrees past 0.
export const edgeOnAngle = (p) => solve((d) => projectedWidth(p, d), 0, 0, 90);
// Resting as the thin bar: the angle at which the door projects exactly the bar's width.
export const restBarAngle = (p) => solve((d) => projectedWidth(p, d), p.t, edgeOnAngle(p), 90);

// ── timing ──────────────────────────────────────────────────────────────────────────────────────
// A cubic bezier as CSS evaluates it: progress in time to progress in value.
export function bezier(curve) {
  const [x1, y1, x2, y2] = String(curve).match(/-?\d*\.?\d+/g).map(Number);
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t; const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-7) return Y(t); const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0; let hi = 1; t = x;
    for (let i = 0; i < 50; i++) { const v = X(t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
// One cycle: the swing (out, then back, each leg half the swing), then the pause at rest. Played
// once, the cycle is the swing alone.
export function doorTimeline(s) {
  return { cycle: s.play === 'once' ? s.swingMs : s.swingMs + s.pauseMs, half: s.swingMs / 2 };
}
const curveOf = (s) => DOOR.curves[s.easing] || DOOR.curves[DOOR.defaults.easing];
// How far the door is from rest at ms into the cycle: 0 at rest, 1 at the far end of the swing.
// One eased value on one curve, out then back.
export function travelAt(s, ms, ease = bezier(curveOf(s))) {
  const t = Math.max(0, Math.min(ms, doorTimeline(s).cycle)); const half = s.swingMs / 2;
  return t < half ? ease(t / half) : t < s.swingMs ? 1 - ease((t - half) / half) : 0;
}
// The door's angle for a travel: from its resting angle to the other end of the swing.
export function angleFor(s, p, travel) {
  const bar = restBarAngle(p);
  return s.rest === 'panel' ? 90 - (90 - bar) * travel : bar + (90 - bar) * travel;
}
// Elapsed time into the cycle, looping or played once.
export const cycleTime = (s, elapsed) => { const { cycle } = doorTimeline(s); return s.play === 'once' ? Math.min(elapsed, cycle) : ((elapsed % cycle) + cycle) % cycle; };

// ── one frame ───────────────────────────────────────────────────────────────────────────────────
// Everything one frame draws: the quadrilateral, its fill (the bar's colour with a little ink at
// mid swing), and the knob. The knob sits on the panel near its free edge, vertically centred; its
// diameter is knob times the open width, scaled by how far the panel shows past the bar, so it
// grows in as the door opens and is gone at the thin bar. It is projected with the panel: an ellipse
// spanning the projected chord, as tall as the circle at the knob's depth.
export function doorFrame(g, s, travel, { reduced = false } = {}) {
  const p = doorParts(g, s.open); const deg = angleFor(s, p, travel);
  const quad = doorQuad(p, deg);
  const shade = r3(DOOR_SHADE * 4 * travel * (1 - travel));
  const shown = Math.max(0, Math.min(1, (projectedWidth(p, deg) - p.t) / (p.W - p.t)));
  const rMax = (s.knob * p.W) / 2; const r = reduced ? 0 : rMax * shown;
  let knob = null;
  if (r > 1e-6) {
    const uc = p.W - 1.5 * rMax; const yc = (p.top + p.bottom) / 2;
    const [xa] = projectPoint(p, deg, uc - r, yc); const [xb] = projectPoint(p, deg, uc + r, yc); const [, yk, sk] = projectPoint(p, deg, uc, yc);
    knob = { cx: (xa + xb) / 2, cy: yk, rx: Math.abs(xa - xb) / 2, ry: r * sk };
  }
  return { travel, deg, quad, shade, knob };
}
export const quadPoints = (quad) => quad.map(([x, y]) => `${r3(x)},${r3(y)}`).join(' ');
// The fill: the bar's own token, with ink mixed in while it turns. One colour, one fill.
export const doorFill = (bar, shade) => (shade > 0 ? `color-mix(in srgb, ${bar} ${r3(100 - shade * 100)}%, ${C.ink})` : bar);

// Under reduced motion the door does not turn: it holds still and its opacity breathes between
// DOOR.breath and 1, over one swing and its pause. motion: 'auto' follows the system setting,
// 'reduced' previews the reduced state.
export function breathCss(cls, name, s, motion = 'auto') {
  const { cycle } = doorTimeline(s); const E = curveOf(s); const count = s.play === 'once' ? 1 : 'infinite';
  const rule = `.${cls} [data-door-leaf] { animation: ${name}-breath ${cycle}ms linear ${count} both; }`;
  return `@keyframes ${name}-breath { 0% { opacity: 1; animation-timing-function: ${E}; } 50% { opacity: ${DOOR.breath}; animation-timing-function: ${E}; } 100% { opacity: 1; } }
${motion === 'reduced' ? rule : `@media ${REDUCED_QUERY} { ${rule} }`}`;
}

// What Copy settings writes (components/admin/DoorLab.js): the values, and the easing's curve
// beside its name, to be fixed in lib/motion.js DOOR.
export const doorSettingsJson = (s) => JSON.stringify({ rest: s.rest, openWidthOfR: s.open, knobOfOpen: s.knob, swingMs: s.swingMs, pauseMs: s.pauseMs, easing: s.easing, curve: DOOR.curves[s.easing], play: s.play }, null, 2);

export const r3 = (n) => Math.round(n * 1000) / 1000;
export const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
