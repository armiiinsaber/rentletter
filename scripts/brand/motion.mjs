// scripts/brand/motion.mjs
// The brand kit's motion folder (scripts/brand/kit.mjs calls motionFiles). Every frame is recorded
// from the product's own door, components/brand/DoorMark.js, rendered on the server at a moment of
// its cycle (its still prop) with the production values (lib/motion.js DOOR), then drawn to pixels
// by resvg, the same renderer as the kit's PNGs. Nothing is drawn by hand or captured from a screen.
// Encoding (scripts/brand/motionEncode.mjs): GIF in plain JavaScript; MP4 (H.264) and the
// transparent WebM (VP9 with an alpha stream) through WebCodecs in headless Chrome.
//   mark loop    the mark (the bar and the R), one swing and its pause, looping: MP4 and GIF at 1024
//                and 512 on paper (red door, ink R), red (the realtor icon's colours) and ink (the
//                admin icon's colours), full bleed; and a transparent WebM at 1024 (paper colours).
//                The MP4 holds four cycles, so it reads as a loop even where a player does not loop.
//   wordmark     the logo on paper at 1200 wide, its door swinging once (the homepage header's
//                swing: a beat of rest, the swing, then rest), MP4 and a GIF that plays once.
import { register } from 'node:module';
import { createRequire } from 'node:module';

register('./jsxLoader.mjs', import.meta.url);
const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

export const MOTION_FPS = 60;      // the videos
export const GIF_STEP_MS = 20;     // the GIFs: 50 frames a second, the finest GIF timing browsers keep
export const MARK_SIZES = [1024, 512];
export const WEBM_SIZE = 1024;
export const WORDMARK_W = 1200; export const WORDMARK_H = 400; export const WORDMARK_LOGO_W = 800;
export const MP4_CYCLES = 4;
export const GROUNDS = Object.freeze([
  { key: 'paper', title: 'On paper', kind: 'mark', note: 'Red door, ink R.' },
  { key: 'red', title: 'On red', kind: 'realtor', note: 'The realtor icon: ink door, white R.' },
  { key: 'ink', title: 'On ink', kind: 'admin', note: 'The admin icon: red door, paper R.' },
]);

let React = null; let renderToStaticMarkup = null; let DoorMark = null; let DOOR = null; let geo = null; let LOGO = null;
async function load() {
  if (DoorMark) return;
  React = await import('react');
  ({ renderToStaticMarkup } = await import('react-dom/server'));
  ({ default: DoorMark } = await import('../../components/brand/DoorMark.js'));
  ({ DOOR } = await import('../../lib/motion.js'));
  ({ LOGO } = await import('../../lib/brand/logoPaths.js'));
  geo = await import('../../components/brand/doorGeometry.js');
}

// DoorMark's own markup, nested in an outer svg of w by h px at x, y with the given size.
const mark = (props) => renderToStaticMarkup(React.createElement(DoorMark, { label: null, ...props }));
const frameSvg = (w, h, inner, ground) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${ground ? `<rect width="${w}" height="${h}" fill="${ground}"/>` : ''}${inner}</svg>`;
const place = (svg, x, y, width, height) => svg.replace(/^<svg /, `<svg x="${x}" y="${y}" `).replace(/ width="[^"]*" height="[^"]*"/, ` width="${width}" height="${height}"`);
const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: false } }).render();

// The mark at ms into its cycle: full bleed square, on its door's ground or on none.
function markSvg(kind, px, ms, ground) {
  return frameSvg(px, px, place(mark({ kind, size: px, square: true, ground, still: ms, settings: DOOR.defaults }), 0, 0, px, px), null);
}
// The wordmark at ms into its timeline (rest for DOOR.homeDelayMs, then one swing): the logo
// centred and WORDMARK_LOGO_W wide on paper, the room left of its bar for the open door.
function wordmarkSvg(ms) {
  const g = geo.doorGeometry('wordmark', 100, DOOR.defaults.open);
  const s = WORDMARK_LOGO_W / LOGO.w; const room = g.bar.x - LOGO.bar.x;
  const x = (WORDMARK_W - WORDMARK_LOGO_W) / 2 - room * s; const h = g.h * s; const y = (WORDMARK_H - h) / 2;
  const still = Math.max(0, ms - DOOR.homeDelayMs);
  const inner = mark({ kind: 'wordmark', size: 100, still, settings: { ...DOOR.defaults, play: 'once' } });
  return frameSvg(WORDMARK_W, WORDMARK_H, place(inner, x, y, g.w * s, h), geo.DOOR_GROUNDS.wordmark.ground);
}
// resvg's pixels are premultiplied; a transparent frame is turned back to straight alpha, which the
// WebM's colour stream needs at the antialiased edges. An opaque frame is the same either way.
const straight = (px) => { for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (a && a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.round((px[i + c] * 255) / a)); } return px; };
const markFrame = (kind, px, ms, ground) => { const b = Buffer.from(render(markSvg(kind, px, ms, ground), px).pixels); return ground ? b : straight(b); };
const wordmarkFrame = (ms) => Buffer.from(render(wordmarkSvg(ms), WORDMARK_W).pixels);

// The timelines, in ms: a mark cycle is the swing then the pause; the wordmark a beat of rest, the
// swing and a rest after it.
export const markCycleMs = () => DOOR.defaults.swingMs + DOOR.defaults.pauseMs;
export const wordmarkMs = () => DOOR.homeDelayMs + DOOR.defaults.swingMs + 900;

// Frames for a video: every 1000 / fps ms over duration; frames at the same pose are drawn once.
function videoFrames(duration, at, draw) {
  const n = Math.round((duration * MOTION_FPS) / 1000); const out = []; const cache = new Map();
  for (let i = 0; i < n; i++) { const key = at((i * 1000) / MOTION_FPS); if (!cache.has(key)) cache.set(key, draw(key)); out.push(cache.get(key)); }
  return out;
}
// Frames for a GIF: the swing every GIF_STEP_MS, the rests as one long frame each.
function gifFrames(segments, draw) {
  const out = [];
  for (const sg of segments) {
    if (sg.hold) { out.push({ rgba: draw(sg.at), ms: sg.hold }); continue; }
    for (let t = 0; t < sg.ms; t += GIF_STEP_MS) out.push({ rgba: draw(sg.at + t), ms: Math.min(GIF_STEP_MS, sg.ms - t) });
  }
  return out;
}

// Every motion file: [path inside the kit, bytes], and the manifest group for the admin page.
export async function motionFiles({ encode }) {
  await load();
  const files = []; const swing = DOOR.defaults.swingMs; const cycle = markCycleMs();
  // Within a cycle every moment of the pause is the rest pose: key the frames by the pose's time.
  const cyc = (t) => { const c = t % cycle; return c < swing ? Math.round(c * 100) / 100 : swing; };
  const items = [];
  for (const G of GROUNDS) {
    const rows = [];
    for (const px of MARK_SIZES) {
      const draw = (ms) => markFrame(G.kind, px, ms, true);
      const base = `motion/rentletter-mark-loop-${G.key}-${px}`;
      files.push([`${base}.mp4`, await encode.mp4({ width: px, height: px, fps: MOTION_FPS, frames: videoFrames(cycle * MP4_CYCLES, cyc, draw) })]);
      files.push([`${base}.gif`, encode.gif({ width: px, height: px, loop: true, frames: gifFrames([{ at: 0, ms: swing }, { at: swing, hold: DOOR.defaults.pauseMs }], draw) })]);
      rows.push({ label: `${px} px`, formats: [['MP4', `${base}.mp4`], ['GIF', `${base}.gif`]] });
    }
    items.push({ key: `mark-${G.key}`, title: `Mark, ${G.title.toLowerCase()}`, note: `${G.note} One swing and its pause, looping.`, ground: G.key === 'ink' ? 'ink' : 'paper', preview: `../previews/motion-mark-${G.key}.png`, poster: { kind: G.key, at: Math.round(swing / 2) }, rows });
  }
  {
    const draw = (ms) => markFrame('mark', WEBM_SIZE, ms, false);
    const p = `motion/rentletter-mark-loop-transparent-${WEBM_SIZE}.webm`;
    files.push([p, await encode.webm({ width: WEBM_SIZE, height: WEBM_SIZE, fps: MOTION_FPS, frames: videoFrames(cycle * MP4_CYCLES, cyc, draw) })]);
    items.push({ key: 'mark-transparent', title: 'Mark, transparent', note: 'Red door, ink R, no ground: for video editors and the web. One swing and its pause, looping.', ground: 'white', preview: '../previews/motion-mark-transparent.png', poster: { kind: 'transparent', at: Math.round(swing / 2) }, rows: [{ formats: [['WebM', p]] }] });
  }
  {
    const total = wordmarkMs(); const start = DOOR.homeDelayMs;
    const at = (t) => (t < start ? 0 : t < start + swing ? Math.round(t * 100) / 100 : start + swing);
    const base = `motion/rentletter-wordmark-swing-${WORDMARK_W}`;
    files.push([`${base}.mp4`, await encode.mp4({ width: WORDMARK_W, height: WORDMARK_H, fps: MOTION_FPS, frames: videoFrames(total, at, wordmarkFrame) })]);
    files.push([`${base}.gif`, encode.gif({ width: WORDMARK_W, height: WORDMARK_H, loop: false, frames: gifFrames([{ at: 0, hold: start }, { at: start, ms: swing }, { at: start + swing, hold: total - start - swing }], wordmarkFrame) })]);
    items.push({ key: 'wordmark-swing', title: 'Wordmark, one swing', note: `On paper, ${WORDMARK_W} wide: the door swings once, open and shut, then rests.`, ground: 'paper', preview: '../previews/motion-wordmark.png', poster: { kind: 'wordmark', at: start + Math.round(swing / 2) }, rows: [{ formats: [['MP4', `${base}.mp4`], ['GIF', `${base}.gif`]] }] });
  }
  return { files, group: { key: 'motion', title: 'Motion', items } };
}

// A still for the admin page's preview card, as PNG: the pose at mid swing.
export async function motionPoster(poster) {
  await load();
  if (poster.kind === 'wordmark') return render(wordmarkSvg(poster.at), WORDMARK_W).asPng();
  const G = GROUNDS.find((x) => x.key === poster.kind);
  return render(markSvg(G ? G.kind : 'mark', 512, poster.at, !!G), 512).asPng();
}
