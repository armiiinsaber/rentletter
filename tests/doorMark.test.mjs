// The door mark (components/brand/DoorMark.js, components/brand/doorGeometry.js), the arithmetic:
//   1. The motion lives in lib/motion.js DOOR: three named curves and the defaults, the knob included.
//   2. The geometry is the official vector source, and the hinge is the bar's edge nearest the R.
//   3. One shape: at every open width, knob size and resting state, every frame of the swing is one
//      convex quadrilateral, its hinge edge on the hinge line, its far edge shorter by perspective
//      once it has eased out of rest, left of the hinge and clear of the R; the knob stays inside it
//      and is gone at the thin bar.
//   4a. Straight at rest: resting as the bar, the door is the static logo's bar from the vector
//      source exactly (the same box, the same rounded corners, the same outline); resting as the
//      panel, the same straight rectangle at the open width. It eases into the perspective panel
//      over DOOR.straighten of the travel and back.
//   4. One curve: frame to frame no corner jumps; the timeline rests, swings out, back, then pauses.
//   5. One fill: the bar's own token, with ink mixed in only while it turns. No CSS 3D anywhere.
//   6. Reduced motion only breathes. Copy settings writes the values as JSON. The door shows on the
//      admin mockups page alone, in tokens alone, with no dash used as punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const { DOOR, REDUCED_QUERY } = await import('../lib/motion.js');
const { LOGO, MARK } = await import('../lib/brand/logoPaths.js');
const { C } = await import('../components/theme.js');
const G = await import('../components/brand/doorGeometry.js');

const FILES = ['components/brand/DoorMark.js', 'components/brand/doorGeometry.js', 'components/admin/DoorLab.js'];
const KINDS = ['wordmark', 'realtor', 'admin', 'paper', 'ink'];
const range = ({ min, max, step }) => { const out = []; for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100); return out; };
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const convex = (q) => { const c = q.map((p, i) => cross(p, q[(i + 1) % 4], q[(i + 2) % 4])); return c.every((v) => v > 1e-9) || c.every((v) => v < -1e-9); };
const inside = (q, pt) => { const c = q.map((p, i) => cross(p, q[(i + 1) % 4], pt)); return c.every((v) => v >= -1e-9) || c.every((v) => v <= 1e-9); };

test('the motion lives in lib/motion.js DOOR: three named curves and the defaults, the knob included', () => {
  assert.deepEqual(Object.keys(DOOR.curves), ['soft', 'crisp', 'weighted']);
  for (const c of Object.values(DOOR.curves)) assert.match(c, /^cubic-bezier\((-?\d*\.?\d+, ){3}-?\d*\.?\d+\)$/);
  assert.deepEqual({ ...DOOR.defaults }, { rest: 'bar', open: 0.6, knob: 0.18, swingMs: 700, pauseMs: 900, easing: 'soft', play: 'loop' });
  assert.equal(DOOR.breath, 0.6);
  assert.equal(DOOR.straighten, 0.3);
  for (const f of FILES) assert.doesNotMatch(src(f), /cubic-bezier\(/, `${f}: curves come from lib/motion.js`);
});

test('the geometry is the vector source, and the hinge is the bar edge nearest the R', () => {
  assert.equal(G.LOGO_R, LOGO.text.match(/M[^M]*/g).slice(0, 2).join(''), 'the R is the wordmark\'s first two subpaths');
  assert.equal(G.R_BOX.wordmark.x0, 54); assert.equal(G.R_BOX.mark.x0, 214);
  for (const kind of KINDS) {
    const g = G.doorGeometry(kind, 100, DOOR.defaults.open); const p = G.doorParts(g, DOOR.defaults.open);
    assert.ok(p.hx < g.rLeft, `${kind}: the hinge (${p.hx}) is left of the R (${g.rLeft})`);
  }
  assert.deepEqual(G.doorGeometry('realtor', 512, 0.6).bar, { ...MARK.any.bar }, 'the icon\'s door is the mark\'s own bar');
  const word = G.doorGeometry('wordmark', 100, 0.6);
  assert.deepEqual({ w: word.bar.w, h: word.bar.h, y: word.bar.y }, { w: LOGO.bar.w, h: LOGO.bar.h, y: LOGO.bar.y });
  assert.equal(word.cam.x, word.bar.x - LOGO.bar.x + LOGO.w / 2, 'the camera is centred on the mark');
});

test('one shape: every frame one convex quadrilateral, hinged on the hinge line, clear of the R, the knob inside', () => {
  let frames = 0;
  for (const kind of KINDS) for (const open of range(G.DOOR_OPEN_RANGE)) for (const knob of [G.DOOR_KNOB_RANGE.min, 0.18, G.DOOR_KNOB_RANGE.max]) for (const rest of ['bar', 'panel']) {
    const s = { ...DOOR.defaults, open, knob, rest }; const g = G.doorGeometry(kind, 100, open); const p = G.doorParts(g, open);
    for (let i = 0; i <= 50; i++) {
      const travel = i / 50; const f = G.doorFrame(g, s, travel); const q = f.quad; frames++;
      const where = `${kind} open ${open} knob ${knob} rest ${rest} travel ${travel}`;
      assert.equal(q.length, 4, where);
      assert.ok(convex(q), `${where}: convex`);
      assert.ok(Math.abs(q[0][0] - p.hx) < 1e-9 && Math.abs(q[1][0] - p.hx) < 1e-9, `${where}: the hinge edge is the hinge line`);
      assert.ok(q.every(([x]) => x <= p.hx + 1e-9), `${where}: left of the hinge`);
      assert.ok(q.every(([x]) => x < g.rLeft), `${where}: clear of the R`);
      if (g.radius !== null) assert.ok(q.every(([x]) => x >= 0), `${where}: on the icon's ground`);
      const near = q[1][1] - q[0][1]; const far = q[2][1] - q[3][1];
      assert.ok(far <= near + 1e-9, `${where}: the far edge is never longer than the near edge`);
      if (f.deg < 89.9 && travel >= DOOR.straighten) assert.ok(far < near, `${where}: turned, the far edge is shorter by perspective`);
      assert.ok(f.round >= 0 && f.round <= g.bar.rx + 1e-9, `${where}: the corners no rounder than the bar's`);
      if (travel >= DOOR.straighten) assert.equal(f.d, `M${q.map(([x, y]) => `${G.r3(x)} ${G.r3(y)}`).join('L')}Z`, `${where}: eased in, the projected panel with square corners`);
      if (f.knob) for (let k = 0; k < 36; k++) { const a = (k / 36) * 2 * Math.PI; assert.ok(inside(q, [f.knob.cx + f.knob.rx * Math.cos(a), f.knob.cy + f.knob.ry * Math.sin(a)]), `${where}: the knob inside the panel`); }
    }
    // The ends: the thin bar projects exactly the bar's width, with no knob; face on, the panel is
    // the open width exactly, its knob at full size.
    const bar = G.doorFrame(g, { ...s, rest: 'bar' }, 0); const full = G.doorFrame(g, { ...s, rest: 'bar' }, 1);
    assert.ok(Math.abs(p.hx - bar.quad[3][0] - p.t) < 1e-6 && bar.knob === null, `${kind} ${open}: the thin bar, no knob`);
    assert.ok(Math.abs(p.hx - full.quad[3][0] - p.W) < 1e-6 && full.knob && Math.abs(full.knob.rx * 2 - knob * p.W) < 1e-6, `${kind} ${open}: the open panel and its knob at full size`);
  }
  assert.ok(frames >= 18000, `${frames} frames checked`);
});

// The static bar, as the vector source draws it everywhere else (scripts/brand/draw.mjs, the
// brand kit, components/ui.js): a rect with rx, its outline written out corner by corner.
const rectOutline = ({ x, y, w, h, rx }) => {
  const n = (a, b) => `${G.r3(a)} ${G.r3(b)}`; const arc = `A${G.r3(rx)} ${G.r3(rx)} 0 0 1 `;
  return `M${n(x + w, y + rx)}L${n(x + w, y + h - rx)}${arc}${n(x + w - rx, y + h)}L${n(x + rx, y + h)}${arc}${n(x, y + h - rx)}L${n(x, y + rx)}${arc}${n(x + rx, y)}L${n(x + w - rx, y)}${arc}${n(x + w, y + rx)}Z`;
};
test('straight at rest: the static bar from the vector source exactly; the panel at rest straight too', () => {
  for (const kind of KINDS) for (const open of range(G.DOOR_OPEN_RANGE)) {
    const s = { ...DOOR.defaults, open }; const g = G.doorGeometry(kind, 100, open); const p = G.doorParts(g, open);
    // The static bar in this mark's frame: the logo's bar beside the letters (moved with them on the
    // wordmark), the mark's own bar on the app icons, the bar as the letters' frame scales it on the
    // loading icons.
    const [tx, ty, sc] = g.letters ? [...g.letters.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0])).concat([1]) : [0, 0, 1];
    const src0 = kind === 'wordmark' ? LOGO.bar : MARK.any.bar;
    const want = kind === 'paper' || kind === 'ink' ? g.bar : { x: tx + src0.x * sc, y: ty + src0.y * sc, w: src0.w * sc, h: src0.h * sc, rx: src0.rx * sc };
    const at = (rest) => G.doorFrame(g, { ...s, rest }, 0);
    const bar = at('bar'); const panel = at('panel');
    const box = (b) => [[b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
    const near = (a, b) => a.every((pt, i) => Math.abs(pt[0] - b[i][0]) < 1e-9 && Math.abs(pt[1] - b[i][1]) < 1e-9);
    assert.ok(near(bar.quad, box(want)), `${kind} ${open}: resting as the bar, the static bar's box`);
    assert.ok(Math.abs(bar.round - want.rx) < 1e-9, `${kind} ${open}: the static bar's corners`);
    assert.equal(bar.d, rectOutline(want), `${kind} ${open}: the static bar's outline`);
    assert.equal(bar.knob, null, `${kind} ${open}: no knob at rest`);
    assert.equal(bar.shade, 0, `${kind} ${open}: the bar's own colour`);
    const wide = { x: p.hx - p.W, y: p.top, w: p.W, h: p.bottom - p.top, rx: g.bar.rx };
    assert.ok(near(panel.quad, box(wide)), `${kind} ${open}: resting as the panel, straight at the open width`);
    assert.equal(panel.d, rectOutline(wide), `${kind} ${open}: the panel's outline, straight, the bar's corners`);
    // Out of rest and back: the blend is smooth (no step at either end) and done by DOOR.straighten.
    assert.equal(G.straightenAt(0), 0); assert.equal(G.straightenAt(DOOR.straighten), 1); assert.equal(G.straightenAt(1), 1);
    assert.ok(G.straightenAt(0.001) < 1e-4 && 1 - G.straightenAt(DOOR.straighten - 0.001) < 1e-4, 'it eases in and out of the blend');
    const tiny = G.doorFrame(g, s, 1e-6);
    assert.ok(tiny.quad.every((pt, i) => Math.hypot(pt[0] - bar.quad[i][0], pt[1] - bar.quad[i][1]) < 1e-3) && Math.abs(tiny.round - bar.round) < 1e-3, `${kind} ${open}: no jump leaving rest`);
  }
  const icon = G.doorGeometry('realtor', 512, 0.6);
  assert.deepEqual(G.doorFrame(icon, DOOR.defaults, 0).quad.map((pt) => pt.map(G.r3)), [[144, 132], [144, 380], [118, 380], [118, 132]], 'the app icon\'s bar, 118 to 144 by 132 to 380');
});

test('one curve: the timeline, and no corner jumps from one frame to the next', () => {
  const s = { ...DOOR.defaults };
  assert.deepEqual(G.doorTimeline(s), { cycle: 1600, half: 350 });
  assert.equal(G.travelAt(s, 0), 0); assert.equal(G.travelAt(s, 350), 1); assert.equal(G.travelAt(s, 700), 0); assert.equal(G.travelAt(s, 1200), 0);
  assert.equal(G.cycleTime(s, 1700), 100); assert.equal(G.cycleTime({ ...s, play: 'once' }, 1700), 700);
  for (const c of Object.values(DOOR.curves)) { const f = G.bezier(c); let last = -1; for (let x = 0; x <= 1.0001; x += 0.01) { const y = f(x); assert.ok(y >= last - 1e-9); last = y; } }
  // 1000 frames of one swing at the widest setting: the largest step any corner takes stays under a
  // hundredth of the door's travel.
  for (const kind of ['wordmark', 'realtor', 'admin']) {
    const w = { ...s, open: G.DOOR_OPEN_RANGE.max }; const g = G.doorGeometry(kind, 100, w.open); const p = G.doorParts(g, w.open);
    let prev = null; let step = 0;
    for (let i = 0; i <= 1000; i++) { const q = G.doorFrame(g, w, G.travelAt(w, (i / 1000) * w.swingMs)).quad; if (prev) step = Math.max(step, ...q.map(([x, y], k) => Math.hypot(x - prev[k][0], y - prev[k][1]))); prev = q; }
    assert.ok(step < (p.W - p.t) * 0.01, `${kind}: the largest corner step, ${step.toFixed(3)} units, is under a hundredth of the swing`);
  }
});

test('one fill: the bar token, with ink mixed in only while it turns; no CSS 3D anywhere', () => {
  const s = { ...DOOR.defaults }; const g = G.doorGeometry('admin', 100, s.open);
  assert.equal(G.doorFrame(g, s, 0).shade, 0); assert.equal(G.doorFrame(g, s, 1).shade, 0);
  assert.equal(G.doorFrame(g, s, 0.5).shade, G.DOOR_SHADE);
  assert.equal(G.doorFill(C.red, 0), C.red, 'at rest the fill is the token itself');
  assert.equal(G.doorFill(C.red, 0.12), `color-mix(in srgb, ${C.red} 88%, ${C.ink})`, 'turning, the same token with a little ink');
  for (const f of FILES) assert.doesNotMatch(src(f), /perspective\(|rotateY|rotateX|preserve-3d|matrix3d|translateZ|backface/i, `${f}: no CSS 3D`);
  assert.match(src('components/brand/DoorMark.js'), /requestAnimationFrame\(tick\)/, 'one requestAnimationFrame loop');
  const mark = src('components/brand/DoorMark.js');
  assert.equal((mark.match(/data-door-panel=/g) || []).length, 1, 'one shape for the door');
  assert.match(mark, /<path ref=\{panel\} data-door-panel="" d=\{rest\.d\}/, 'drawn as one path');
  assert.doesNotMatch(mark, /<polygon|<rect[^>]*data-door-panel/, 'no second shape type for the door');
});

test('reduced motion: the door holds still with no knob, and only its opacity breathes', () => {
  const s = { ...DOOR.defaults, rest: 'panel' }; const g = G.doorGeometry('wordmark', 40, s.open);
  assert.equal(G.doorFrame(g, s, 0, { reduced: true }).knob, null, 'the knob is hidden');
  const bar = G.doorFrame(g, { ...s, rest: 'bar' }, 0, { reduced: true });
  assert.equal(bar.round, LOGO.bar.rx, 'reduced, resting as the bar, it is the straight bar');
  const auto = G.breathCss('c', 'n', s); const reduced = G.breathCss('c', 'n', s, 'reduced');
  assert.ok(auto.includes(`@media ${REDUCED_QUERY} {`) && !reduced.includes('@media'));
  for (const css of [auto, reduced]) {
    assert.match(css, /0% \{ opacity: 1;[^}]*\} 50% \{ opacity: 0\.6;[^}]*\} 100% \{ opacity: 1; \}/);
    assert.deepEqual([...new Set([...css.matchAll(/\d+% \{ ([a-z-]+):/g)].map((m) => m[1]))], ['opacity']);
  }
});

const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); } else if (/\.js$/.test(p)) out.push(p); } return out; };

test('Copy settings writes the values as JSON; the door shows on the admin mockups page alone, in tokens', () => {
  assert.deepEqual(JSON.parse(G.doorSettingsJson(DOOR.defaults)), { rest: 'bar', openWidthOfR: 0.6, knobOfOpen: 0.18, swingMs: 700, pauseMs: 900, easing: 'soft', curve: DOOR.curves.soft, play: 'loop' });
  const users = (name) => [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components'))].filter((p) => new RegExp(`import [^;]*from '[./]*[^']*/${name}'`).test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p)).sort();
  assert.deepEqual(users('DoorLab'), ['pages/admin/mockups.js']);
  assert.deepEqual(users('DoorMark'), ['components/admin/DoorLab.js']);
  assert.deepEqual(users('doorGeometry'), ['components/admin/DoorLab.js', 'components/brand/DoorMark.js']);
  for (const [kind, c] of Object.entries(G.DOOR_GROUNDS)) assert.equal(c.knob, c.bar === C.red ? C.ink : C.red, `${kind}: an ink knob on a red door, a red knob on an ink door`);
  for (const f of FILES) {
    const text = src(f);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${f}: colours from the tokens`);
    assert.doesNotMatch(text, /[–—]/, `${f}: no en or em dash`);
    // Comments and the copy: a hyphen between spaces is punctuation (code subtraction is not).
    const prose = text.split('\n').flatMap((line) => [line.includes('//') ? line.slice(line.indexOf('//')) : '', ...(line.match(/'[^']*'|>[^<>{}]+</g) || [])]);
    assert.deepEqual(prose.filter((p) => /\s-\s/.test(p)), [], `${f}: no hyphen as punctuation`);
  }
});
