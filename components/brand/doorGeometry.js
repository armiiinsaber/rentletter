// components/brand/doorGeometry.js
// The door mark's geometry, timing and CSS (components/brand/DoorMark.js draws it). Plain
// JavaScript with no JSX, so the unit tests read the same numbers the page draws with. Everything
// comes from the official vector source (lib/brand/logoPaths.js), the tokens (components/theme.js)
// and the motion vocabulary (lib/motion.js DOOR).
import { LOGO, MARK } from '../../lib/brand/logoPaths';
import { DOOR, MOTION_QUERY, REDUCED_QUERY } from '../../lib/motion';
import { C } from '../theme';

// The widest the controls go, as a fraction of the R's width: at this setting the open panel of
// the app icons reaches the edge of the icon's ground, and no further.
export const DOOR_OPEN_RANGE = Object.freeze({ min: 0.2, max: 0.75, step: 0.05 });
export const DOOR_SHADE = 0.18;    // the most ink laid over a face turned away from the viewer
export const DOOR_SKEW = 3;        // the svg version's skew at mid swing, in degrees
const IOS_RADIUS = 0.2237;         // the home screen corner, as scripts/brand/draw.mjs IOS_RADIUS
const PERSPECTIVE = 4;             // the viewing distance, in bar heights
const SAMPLES = 24;                // svg version: samples per leg of the swing

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
// PALETTES draws them, and the loading icon on paper and on ink.
export const DOOR_GROUNDS = Object.freeze({
  wordmark: { ground: C.paper, bar: C.red, letter: C.ink },
  realtor: { ground: C.red, bar: C.inst, letter: C.card },
  admin: { ground: C.inst, bar: C.red, letter: C.instText },
  paper: { ground: C.paper, bar: C.red, letter: C.ink },
  ink: { ground: C.ink, bar: C.red, letter: C.paper },
});

// Everything in box units (a viewBox from 0 0), and k, the pixels per unit at this size.
//   wordmark  size is the cap height in px; room is left of the bar for the widest open panel.
//   realtor, admin  size is the icon's side in px, the mark as the home screen icon draws it.
//   paper, ink  the loading icon: the stripe and the R with the door at its widest for this
//               setting, centred in the square inside a margin of one eighth, so nothing leaves it.
export function doorGeometry(kind, size, open) {
  if (kind === 'wordmark') {
    const R = R_BOX.wordmark; const b = LOGO.bar;
    const ox = Math.ceil(DOOR_OPEN_RANGE.max * R.w - b.w) + 4;
    const k = size / 100;
    return { k, w: ox + LOGO.w, h: LOGO.h, letters: `translate(${ox} 0)`, rPath: LOGO_R, restPath: LOGO_REST,
      bar: { x: ox + b.x, y: b.y, w: b.w, h: b.h, rx: b.rx }, rW: R.w, radius: null };
  }
  const m = MARK.any; const R = R_BOX.mark; const b = m.bar; const k = size / MARK.size;
  if (kind === 'realtor' || kind === 'admin') {
    return { k, w: MARK.size, h: MARK.size, letters: null, rPath: m.r, restPath: null, bar: { ...b }, rW: R.w, radius: MARK.size * IOS_RADIUS };
  }
  const x0 = b.x + b.w - open * R.w; const x1 = R.x1; const y0 = Math.min(b.y, R.y0); const y1 = Math.max(b.y + b.h, R.y1);
  const inner = MARK.size * 0.75; const s = Math.min(inner / (x1 - x0), inner / (y1 - y0));
  const tx = (MARK.size - (x1 - x0) * s) / 2 - x0 * s; const ty = (MARK.size - (y1 - y0) * s) / 2 - y0 * s;
  return { k, w: MARK.size, h: MARK.size, letters: `translate(${r3(tx)} ${r3(ty)}) scale(${r3(s)})`, rPath: m.r, restPath: null,
    bar: { x: tx + b.x * s, y: ty + b.y * s, w: b.w * s, h: b.h * s, rx: b.rx * s }, rW: R.w * s, radius: 0 };
}
// The door in the units given: the hinge line, the bar's thickness, the panel's width, the corner,
// and the viewing distance.
export const doorParts = (g, open, unit = 1) => ({
  hx: (g.bar.x + g.bar.w) * unit, hy: g.bar.y * unit, h: g.bar.h * unit, t: g.bar.w * unit,
  W: open * g.rW * unit, rx: g.bar.rx * unit, P: PERSPECTIVE * g.bar.h * unit,
});

// What Copy settings writes (components/admin/DoorLab.js): the values, and the easing's curve
// beside its name, to be fixed in lib/motion.js DOOR.
export const doorSettingsJson = (s) => JSON.stringify({ rest: s.rest, openWidthOfR: s.open, swingMs: s.swingMs, pauseMs: s.pauseMs, easing: s.easing, curve: DOOR.curves[s.easing], play: s.play }, null, 2);

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
  const cycle = s.play === 'once' ? s.swingMs : s.swingMs + s.pauseMs;
  return { cycle, a: s.swingMs / 2 / cycle, b: s.swingMs / cycle };
}
const curveOf = (s) => DOOR.curves[s.easing] || DOOR.curves[DOOR.defaults.easing];
export const restAngle = (s) => (s.rest === 'panel' ? 90 : 0);
// The door's angle in degrees at ms into a cycle: 0 is the bar seen edge on, 90 the panel face on.
export function angleAt(s, ms) {
  const ease = bezier(curveOf(s)); const half = s.swingMs / 2;
  const t = Math.max(0, Math.min(ms, doorTimeline(s).cycle));
  const p = t < half ? ease(t / half) : t < s.swingMs ? 1 - ease((t - half) / half) : 0;
  return s.rest === 'panel' ? 90 * (1 - p) : 90 * p;
}
// How wide the turning door projects, left of the hinge: the edge face narrowing, the panel face
// widening as its far edge comes forward from behind the hinge.
export function projectedWidth(deg, { t, W, P }) {
  const a = (deg * Math.PI) / 180;
  const edge = (t * Math.cos(a) * P) / (P - t * Math.sin(a));
  const panel = (W * Math.sin(a) * P) / (P + W * Math.cos(a));
  return Math.max(edge, panel);
}
export const shadeEdge = (deg) => r3((DOOR_SHADE * deg) / 90);
export const shadePanel = (deg) => r3(DOOR_SHADE * (1 - deg / 90));

export const r3 = (n) => Math.round(n * 1000) / 1000;

// ── css ─────────────────────────────────────────────────────────────────────────────────────────
const pct = (f) => `${r3(f * 100)}%`;
export const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
// Keyframes for a property that follows the angle: rest, the far end, rest, then the pause.
function swingFrames(s, prop) {
  const { a, b } = doorTimeline(s); const E = curveOf(s); const A0 = restAngle(s); const A1 = 90 - A0;
  return `0% { ${prop(A0)}; animation-timing-function: ${E}; } ${pct(a)} { ${prop(A1)}; animation-timing-function: ${E}; } ${pct(b)} { ${prop(A0)}; }${b < 1 ? ` 100% { ${prop(A0)}; }` : ''}`;
}
function breathCss(cls, name, s) {
  const { cycle } = doorTimeline(s); const E = curveOf(s); const count = s.play === 'once' ? 1 : 'infinite';
  return `@keyframes ${name}-breath { 0% { opacity: 1; animation-timing-function: ${E}; } 50% { opacity: ${DOOR.breath}; animation-timing-function: ${E}; } 100% { opacity: 1; } }
.${cls} [data-door-leaf] { animation: ${name}-breath ${cycle}ms linear ${count} both; }`;
}
// motion: 'auto' follows the system setting; 'reduced' previews the reduced state.
const withMotion = (motion, swing, run, breath) => (motion === 'reduced' ? breath : `${swing}\n@media ${MOTION_QUERY} { ${run} }\n@media ${REDUCED_QUERY} { ${breath} }`);

// The viewing distance in em, on faces whose font size is the bar's height: the keyframes are the
// same at every size, so a mark that settles its size after mounting stays in step with the rest.
export const turn3d = (deg) => `perspective(${PERSPECTIVE}em) rotateY(${r3(deg)}deg)`;
// The 3d version: the edge face turns by the door's angle, the panel face by the angle less 90
// degrees (folded back behind the hinge at rest), both on the hinge line; each carries a shade.
// A face within EDGE_ON degrees of edge on is not drawn: WebKit paints a face turned exactly side
// on as a sliver beside the bar, and the true width there is under half a pixel at every size.
export const EDGE_ON = 1;
const inverse = (f, y) => { let lo = 0; let hi = 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (f(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; };
// When each face shows, as stepped opacity keyframes. The face that is edge on at rest (the panel
// resting as the bar, the edge resting as the panel) shows once the door has turned past EDGE_ON;
// the other is hidden while the door is within EDGE_ON of the far end.
export function faceShows(s) {
  const { a, b } = doorTimeline(s); const ease = bezier(curveOf(s)); const e = EDGE_ON / 90;
  const step = 'animation-timing-function: steps(1, end)';
  const end = (v) => (b < 1 ? ` 100% { opacity: ${v}; }` : '');
  const out = a * inverse(ease, 1 - e); const back = a + (b - a) * inverse(ease, e);
  const leave = a * inverse(ease, e); const home = a + (b - a) * inverse(ease, 1 - e);
  const atRest = `0% { opacity: 0; ${step}; } ${pct(leave)} { opacity: 1; ${step}; } ${pct(home)} { opacity: 0; }${end(0)}`;
  const atFar = `0% { opacity: 1; ${step}; } ${pct(out)} { opacity: 0; ${step}; } ${pct(back)} { opacity: 1; }${end(1)}`;
  return s.rest === 'panel' ? { edge: atRest, panel: atFar } : { edge: atFar, panel: atRest };
}
// Resting, the face turned side on is not drawn.
export const faceRestOpacity = (s, face) => ((s.rest === 'panel') === (face === 'edge') ? 0 : 1);
export function door3dCss({ cls, name, s, motion = 'auto' }) {
  const { cycle } = doorTimeline(s); const count = s.play === 'once' ? 1 : 'infinite';
  const shows = faceShows(s); const t = `${cycle}ms linear ${count} both`;
  const swing = `@keyframes ${name}-edge { ${swingFrames(s, (d) => `transform: ${turn3d(d)}`)} }
@keyframes ${name}-panel { ${swingFrames(s, (d) => `transform: ${turn3d(d - 90)}`)} }
@keyframes ${name}-edgeshow { ${shows.edge} }
@keyframes ${name}-panelshow { ${shows.panel} }
@keyframes ${name}-edgeshade { ${swingFrames(s, (d) => `opacity: ${shadeEdge(d)}`)} }
@keyframes ${name}-panelshade { ${swingFrames(s, (d) => `opacity: ${shadePanel(d)}`)} }`;
  const run = `.${cls} [data-door-face="edge"] { animation: ${name}-edge ${t}, ${name}-edgeshow ${t}; }
.${cls} [data-door-face="panel"] { animation: ${name}-panel ${t}, ${name}-panelshow ${t}; }
.${cls} [data-door-shade="edge"] { animation: ${name}-edgeshade ${t}; }
.${cls} [data-door-shade="panel"] { animation: ${name}-panelshade ${t}; }`;
  return withMotion(motion, swing, run, breathCss(cls, name, s));
}

// The svg version's pose at an angle: scaled from the hinge to the projected width, skewed a
// little at mid swing (the far edge lifts), shaded as the face that shows.
export function flatPose(deg, parts) {
  const { hx, t, W, P } = parts; const a = (deg * Math.PI) / 180;
  const sx = projectedWidth(deg, parts) / t; const skew = DOOR_SKEW * Math.sin(2 * a);
  const panelShows = W * Math.sin(a) * P / (P + W * Math.cos(a)) >= t * Math.cos(a) * P / (P - t * Math.sin(a));
  return { transform: `translate(${r3(hx)}px, 0px) skewY(${r3(skew)}deg) scale(${r3(sx)}, 1) translate(${r3(-hx)}px, 0px)`, shade: panelShows ? shadePanel(deg) : shadeEdge(deg) };
}
export function doorFlatCss({ cls, name, parts, s, motion = 'auto' }) {
  const { cycle, a, b } = doorTimeline(s); const count = s.play === 'once' ? 1 : 'infinite'; const ease = bezier(curveOf(s));
  const marks = [];
  for (let i = 0; i <= SAMPLES; i++) marks.push([a * (i / SAMPLES), ease(i / SAMPLES)]);
  for (let i = 1; i <= SAMPLES; i++) marks.push([a + (b - a) * (i / SAMPLES), 1 - ease(i / SAMPLES)]);
  if (b < 1) marks.push([1, 0]);
  const at = (p) => flatPose(s.rest === 'panel' ? 90 * (1 - p) : 90 * p, parts);
  const swing = `@keyframes ${name}-flat { ${marks.map(([f, p]) => `${pct(f)} { transform: ${at(p).transform}; }`).join(' ')} }
@keyframes ${name}-shade { ${marks.map(([f, p]) => `${pct(f)} { opacity: ${at(p).shade}; }`).join(' ')} }`;
  const run = `.${cls} [data-door-flat] { animation: ${name}-flat ${cycle}ms linear ${count} both; }
.${cls} [data-door-shade="flat"] { animation: ${name}-shade ${cycle}ms linear ${count} both; }`;
  return withMotion(motion, swing, run, breathCss(cls, name, s));
}
