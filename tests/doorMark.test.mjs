// The door mark (components/brand/DoorMark.js, components/brand/doorGeometry.js), the arithmetic:
//   1. The motion lives in lib/motion.js DOOR: three named curves and the defaults the brief set.
//   2. The geometry is the official vector source, and the hinge is the bar's edge nearest the R.
//   3. At every open width the controls allow and every angle of the swing, both faces of the 3D
//      door project on the door's side of the hinge, so the door never reaches the R; at the
//      widest, the app icon's panel stays on the icon's ground.
//   4. The timeline: rest, the far end at half a swing, rest again, then the pause.
//   5. The CSS: transform and opacity only, the swing behind prefers-reduced-motion: no-preference,
//      and under reduced motion no turn at all, only the opacity breathing between 0.6 and 1.
//   6. The svg version uses no 3D transform and projects to the same widths.
//   7. Copy settings writes the defaults as JSON. The door shows on the admin mockups page alone,
//      in tokens alone, with no dash used as punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const { DOOR, MOTION_QUERY, REDUCED_QUERY } = await import('../lib/motion.js');
const { LOGO, MARK } = await import('../lib/brand/logoPaths.js');
const G = await import('../components/brand/doorGeometry.js');

const NEW_FILES = ['components/brand/DoorMark.js', 'components/brand/doorGeometry.js', 'components/admin/DoorLab.js'];

test('the motion lives in lib/motion.js DOOR: three named curves and the defaults', () => {
  assert.deepEqual(Object.keys(DOOR.curves), ['soft', 'crisp', 'weighted']);
  for (const c of Object.values(DOOR.curves)) assert.match(c, /^cubic-bezier\((-?\d*\.?\d+, ){3}-?\d*\.?\d+\)$/);
  assert.deepEqual({ ...DOOR.defaults }, { rest: 'bar', open: 0.6, swingMs: 700, pauseMs: 900, easing: 'soft', play: 'loop' });
  assert.equal(DOOR.breath, 0.6);
  // No curve is written anywhere else in the door's files.
  for (const f of NEW_FILES) assert.doesNotMatch(src(f), /cubic-bezier\(/, `${f}: curves come from lib/motion.js`);
});

test('the geometry is the vector source, and the hinge is the bar edge nearest the R', () => {
  assert.equal(G.LOGO_R, LOGO.text.match(/M[^M]*/g).slice(0, 2).join(''), 'the R is the wordmark\'s first two subpaths');
  assert.equal(G.R_BOX.wordmark.x0, 54); assert.equal(G.R_BOX.wordmark.x1, 145);
  assert.equal(G.R_BOX.mark.x0, 214);
  for (const kind of ['wordmark', 'realtor', 'admin', 'paper', 'ink']) {
    const g = G.doorGeometry(kind, 100, DOOR.defaults.open);
    const p = G.doorParts(g, DOOR.defaults.open);
    const rLeft = kind === 'wordmark' ? 56 + G.R_BOX.wordmark.x0 : kind === 'realtor' || kind === 'admin' ? G.R_BOX.mark.x0 : null;
    if (rLeft !== null) assert.ok(p.hx < rLeft, `${kind}: the hinge (${p.hx}) is left of the R (${rLeft})`);
  }
  const icon = G.doorGeometry('realtor', 512, 0.6);
  assert.deepEqual(icon.bar, { ...MARK.any.bar }, 'the icon\'s stripe is the mark\'s own bar');
  const word = G.doorGeometry('wordmark', 100, 0.6);
  assert.deepEqual({ w: word.bar.w, h: word.bar.h, rx: word.bar.rx, y: word.bar.y }, { w: LOGO.bar.w, h: LOGO.bar.h, rx: LOGO.bar.rx, y: LOGO.bar.y });
});

// Both faces of the 3D door as the browser projects them: each turned on the hinge line with the
// vanishing point on it. Returns the leftmost and rightmost projected x, in box units.
function project(parts, deg) {
  const { hx, t, W, P } = parts; const a = (deg * Math.PI) / 180;
  const pts = [];
  // the edge face: x from -t to 0 at rest, z 0; turned by deg
  for (const x of [-t, 0]) pts.push([x * Math.cos(a), -x * Math.sin(a)]);
  // the panel face: from the hinge into the screen at rest (x 0, z from 0 to -W); turned by deg
  for (const z of [0, -W]) pts.push([z * Math.sin(a), z * Math.cos(a)]);
  const xs = pts.map(([x, z]) => hx + (x * P) / (P - z));
  return [Math.min(...xs), Math.max(...xs)];
}

test('at every open width and every angle, the door stays on its side of the hinge, clear of the R', () => {
  let frames = 0;
  for (let open = G.DOOR_OPEN_RANGE.min; open <= G.DOOR_OPEN_RANGE.max + 1e-9; open += G.DOOR_OPEN_RANGE.step) {
    for (const kind of ['wordmark', 'realtor', 'admin', 'paper', 'ink']) {
      const g = G.doorGeometry(kind, 100, open); const parts = G.doorParts(g, open);
      const rLeft = kind === 'wordmark' ? 56 + G.R_BOX.wordmark.x0 : kind === 'realtor' || kind === 'admin' ? G.R_BOX.mark.x0 : null;
      for (let deg = 0; deg <= 90; deg += 0.5) {
        const [left, right] = project(parts, deg); frames++;
        assert.ok(right <= parts.hx + 1e-9, `${kind} ${open.toFixed(2)} ${deg}: the door's right edge ${right} is at or left of the hinge ${parts.hx}`);
        if (rLeft !== null) assert.ok(right < rLeft, `${kind}: clear of the R`);
        if (kind === 'realtor' || kind === 'admin') assert.ok(left >= 0, `${kind} ${open.toFixed(2)} ${deg}: the panel stays on the icon (${left})`);
        // the projected width the svg version copies
        assert.ok(Math.abs((right - left) - G.projectedWidth(deg, parts)) < 1e-6 * parts.W + 1e-6);
      }
      // face on, the panel is exactly the chosen fraction of the R's width
      assert.ok(Math.abs(G.projectedWidth(90, parts) - open * g.rW) < 1e-9);
    }
  }
  assert.ok(frames > 10000, `${frames} frames checked`);
});

test('the timeline: rest, the far end at half a swing, rest again, then the pause', () => {
  const s = { ...DOOR.defaults };
  assert.deepEqual(G.doorTimeline(s), { cycle: 1600, a: 350 / 1600, b: 700 / 1600 });
  assert.equal(G.angleAt(s, 0), 0); assert.equal(G.angleAt(s, 350), 90); assert.equal(G.angleAt(s, 700), 0); assert.equal(G.angleAt(s, 1200), 0);
  const panel = { ...s, rest: 'panel' };
  assert.equal(G.angleAt(panel, 0), 90); assert.equal(G.angleAt(panel, 350), 0); assert.equal(G.angleAt(panel, 700), 90);
  assert.equal(G.doorTimeline({ ...s, play: 'once' }).cycle, 700, 'played once, the cycle is the swing alone');
  // the soft curve eases out of rest: a tenth of the way through the leg, well under a tenth of the turn
  assert.ok(G.angleAt(s, 35) < 9);
  // the bezier matches its end points and is monotonic for the three curves
  for (const c of Object.values(DOOR.curves)) { const f = G.bezier(c); let last = -1; for (let x = 0; x <= 1.0001; x += 0.01) { const y = f(x); assert.ok(y >= last - 1e-9); last = y; } assert.equal(f(0), 0); assert.equal(f(1), 1); }
});

test('the CSS: transform and opacity only, the swing behind no-preference, reduced motion only breathes', () => {
  const s = { ...DOOR.defaults };
  const auto = G.door3dCss({ cls: 'c', name: 'n', s, motion: 'auto' });
  const props = [...auto.matchAll(/\d+(?:\.\d+)?% \{ ([a-z-]+):/g)].map((m) => m[1]);
  assert.ok(props.length > 8 && props.every((p) => p === 'transform' || p === 'opacity'), `animated properties: ${[...new Set(props)]}`);
  assert.ok(auto.includes(`@media ${MOTION_QUERY} {`) && auto.includes(`@media ${REDUCED_QUERY} {`));
  const [, gated] = auto.split(`@media ${MOTION_QUERY} {`);
  assert.match(gated.split(`@media ${REDUCED_QUERY}`)[0], /data-door-face="edge"\] \{ animation: n-edge 1600ms linear infinite both/);
  assert.match(auto, /perspective\(4em\) rotateY\(90deg\)/, 'the turn is perspective and rotateY, the distance four bar heights');
  assert.match(auto, /rotateY\(-90deg\)/, 'the panel is folded back behind the hinge at rest');
  const reduced = G.door3dCss({ cls: 'c', name: 'n', s, motion: 'reduced' });
  assert.doesNotMatch(reduced, /transform|rotateY/, 'reduced: the door does not turn');
  assert.match(reduced, /0% \{ opacity: 1;[^}]*\} 50% \{ opacity: 0\.6;[^}]*\} 100% \{ opacity: 1; \}/);
  assert.match(reduced, /\[data-door-leaf\] \{ animation: n-breath 1600ms linear infinite both; \}/);
  assert.match(G.door3dCss({ cls: 'c', name: 'n', s: { ...s, play: 'once' } }), /n-edge 700ms linear 1 both/);
  // A face turned side on is not drawn: resting as the bar the panel is hidden, as the panel the edge.
  assert.equal(G.faceRestOpacity(s, 'panel'), 0); assert.equal(G.faceRestOpacity(s, 'edge'), 1);
  assert.equal(G.faceRestOpacity({ ...s, rest: 'panel' }, 'edge'), 0); assert.equal(G.faceRestOpacity({ ...s, rest: 'panel' }, 'panel'), 1);
  const shows = G.faceShows(s);
  const marks = (k) => [...k.matchAll(/([\d.]+)% \{ opacity: (\d)/g)].map((m) => [Number(m[1]) / 100, Number(m[2])]);
  const [p0, p1, p2] = marks(shows.panel);
  assert.deepEqual([p0[1], p1[1], p2[1]], [0, 1, 0], 'the panel shows only once the door has turned');
  const ease = G.bezier(DOOR.curves.soft); const a = 350 / 1600;
  assert.ok(Math.abs(90 * ease(p1[0] / a) - G.EDGE_ON) < 0.01, 'from the moment the door passes one degree');
  assert.ok(Math.abs(90 * (1 - ease((p2[0] - a) / a)) - G.EDGE_ON) < 0.01, 'until it is back within one degree');
  assert.match(auto, /n-panel 1600ms linear infinite both, n-panelshow 1600ms linear infinite both/);
});

test('the svg version: no 3D transform, the same projected widths', () => {
  const s = { ...DOOR.defaults }; const g = G.doorGeometry('wordmark', 40, s.open); const parts = G.doorParts(g, s.open);
  const css = G.doorFlatCss({ cls: 'c', name: 'n', parts, s });
  assert.doesNotMatch(css, /perspective|rotateY|rotateX|translateZ|matrix3d/);
  const scales = [...css.matchAll(/scale\(([\d.]+), 1\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(Math.max(...scales) - (s.open * g.rW) / g.bar.w) < 0.01, 'at the far end the bar is scaled to the open panel');
  assert.match(css, /@keyframes n-flat \{ 0% \{ transform: translate\([\d.]+px, 0px\) skewY\(0deg\) scale\(1, 1\)/, 'at rest it is the bar');
  const skews = [...css.matchAll(/skewY\((-?[\d.]+)deg\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...skews) <= G.DOOR_SKEW && Math.max(...skews) > 2, 'a subtle skew at mid swing');
  const props = [...css.matchAll(/\d+(?:\.\d+)?% \{ ([a-z-]+):/g)].map((m) => m[1]);
  assert.ok(props.length > 40 && props.every((p) => p === 'transform' || p === 'opacity'));
  for (const deg of [0, 30, 60, 90]) {
    const sx = Number(/scale\(([\d.]+), 1\)/.exec(G.flatPose(deg, parts).transform)[1]);
    assert.ok(Math.abs(sx * parts.t - G.projectedWidth(deg, parts)) < 0.01);
  }
});

const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); } else if (/\.js$/.test(p)) out.push(p); } return out; };

test('Copy settings writes the values as JSON; the door shows on the admin mockups page alone, in tokens', () => {
  assert.deepEqual(JSON.parse(G.doorSettingsJson(DOOR.defaults)), { rest: 'bar', openWidthOfR: 0.6, swingMs: 700, pauseMs: 900, easing: 'soft', curve: DOOR.curves.soft, play: 'loop' });
  const users = (name) => [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components'))].filter((p) => new RegExp(`import [^;]*from '[./]*[^']*/${name}'`).test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p)).sort();
  assert.deepEqual(users('DoorLab'), ['pages/admin/mockups.js']);
  assert.deepEqual(users('DoorMark'), ['components/admin/DoorLab.js']);
  assert.deepEqual(users('doorGeometry'), ['components/admin/DoorLab.js', 'components/brand/DoorMark.js']);
  for (const f of NEW_FILES) {
    const text = src(f);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${f}: colours from the tokens`);
    assert.doesNotMatch(text, /[–—]/, `${f}: no en or em dash`);
    // Comments and the copy: a hyphen between spaces is punctuation (code subtraction is not).
    const prose = text.split('\n').flatMap((line) => [line.includes('//') ? line.slice(line.indexOf('//')) : '', ...(line.match(/'[^']*'|>[^<>{}]+</g) || [])]);
    assert.deepEqual(prose.filter((p) => /\s-\s/.test(p)), [], `${f}: no hyphen as punctuation`);
  }
});

test('the loading icon: the swing reads from 28px', () => {
  // It reads as a door turning when, at mid swing, the panel leans (its far edge shorter than its
  // near edge) by at least one CSS pixel. Under that the swing reads as the bar thickening.
  const at = (px) => {
    const g = G.doorGeometry('paper', px, DOOR.defaults.open); const p = G.doorParts(g, DOOR.defaults.open, g.k);
    return { bar: p.t, open: p.W, lean: p.h * (1 - p.P / (p.P + p.W * Math.cos(Math.PI / 4))) };
  };
  const [s20, s28, s44] = [20, 28, 44].map(at);
  assert.ok(s20.lean < 1, `20px: the lean is ${s20.lean.toFixed(2)}px, the bar ${s20.bar.toFixed(2)}px opening to ${s20.open.toFixed(2)}px`);
  assert.ok(s28.lean >= 1, `28px: the lean is ${s28.lean.toFixed(2)}px, the bar ${s28.bar.toFixed(2)}px opening to ${s28.open.toFixed(2)}px`);
  assert.ok(s44.lean > s28.lean);
});
