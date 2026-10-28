// The door mark on /admin/mockups (components/admin/DoorLab.js, components/brand/DoorMark.js), in
// WebKit (Safari's engine) and in Chrome, on the walks' admin dev server (tests/helpers/
// adminServer.mjs: a made up password, an in memory store):
//   1. The defaults: rest as the thin bar, open to 0.6 of the R, knob 0.18 of the panel, 700ms a
//      swing, 900ms pause, soft, loop; Copy settings writes them as JSON; every control is at least
//      44px, at 1280 and at 390; one clock drives every mark in step.
//   2. One shape: 120 frames of one swing at the widest setting, resting as the bar and as the
//      panel, on the wordmark, both app icons and the loading icons. In every frame exactly one
//      panel is drawn; its outline is one convex quadrilateral; the knob stays inside it; the door
//      never overlaps the R; and from one frame to the next no corner moves more than STEP px.
//   3. Once plays one swing and Replay starts it over.
//   4. Reduced motion, previewed and from the system setting: the door holds still with no knob,
//      and its opacity breathes between 0.6 and 1.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { adminServer, ADMIN_START_TIMEOUT } from '../helpers/adminServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { STOP_TIMEOUT } from '../helpers/devServer.mjs';
register('../helpers/loader.mjs', import.meta.url);
const { DOOR } = await import('../../lib/motion.js');
const { DOOR_OPEN_RANGE, doorSettingsJson } = await import('../../components/brand/doorGeometry.js');

const admin = adminServer(3168);
before(async () => { if (haveWebkit || haveChrome) await admin.start(); }, { timeout: ADMIN_START_TIMEOUT });
after(async () => { await admin.stop(); }, { timeout: STOP_TIMEOUT });

const FRAMES = 120;
const STEP = 2; // px: the most any corner of the panel may move from one frame to the next

async function open(browser, { width = 1280, reduced = false } = {}) {
  const ctx = await browser.newContext({ baseURL: admin.base, viewport: { width, height: 1000 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await admin.signIn(ctx);
  // The clipboard, read back: what Copy settings wrote lands in window.__copied, in both engines.
  await ctx.addInitScript(() => { window.__copied = null; const w = { writeText: async (t) => { window.__copied = t; } }; try { Object.defineProperty(navigator, 'clipboard', { value: w, configurable: true }); } catch (e) { /* the page's fallback then runs */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/ResizeObserver loop/.test(e.message)) errors.push(e.message); });
  await page.goto('/admin/mockups', { waitUntil: 'networkidle', timeout: 240000 });
  await page.locator('[data-door-section] [data-door="wordmark"]').waitFor({ timeout: 60000 });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('door-grounds').scrollIntoView({ behavior: 'instant' }); });
  return { ctx, page, errors };
}
const settings = async (page) => JSON.parse(await page.locator('[data-door-section]').getAttribute('data-door-settings'));
const control = (page, key) => page.locator(`[data-door-control="${key}"]`);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function targets(page, tag) {
  const r = await page.evaluate(() => ({
    // The laid out height: a press scales a control to 0.98 for a moment (lib/motion.js PRESS).
    small: [...document.querySelectorAll('[data-door-section] button, [data-door-section] input')].map((el) => [el.getAttribute('data-door-control'), el.offsetHeight]).filter(([, h]) => h < 44),
    count: document.querySelectorAll('[data-door-section] button, [data-door-section] input').length,
    scroll: document.documentElement.scrollWidth, vw: innerWidth,
  }));
  assert.ok(r.count >= 15, `${tag}: the controls are there (${r.count})`);
  assert.deepEqual(r.small, [], `${tag}: every control at least 44px tall`);
  assert.equal(r.scroll, r.vw, `${tag}: no sideways scroll`);
}

// One swing of every mark, FRAMES frames from 0 to the swing's end, drawn at each moment through the
// page's own clock (window.__rlDoor.at); the panel read back from the page.
const sample = (page, swingMs) => page.evaluate(({ FRAMES, swingMs }) => {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inside = (q, pt) => { const c = q.map((p, i) => cross(p, q[(i + 1) % 4], pt)); return c.every((v) => v >= -1e-6) || c.every((v) => v <= 1e-6); };
  const roots = [...document.querySelectorAll('[data-door-section] [data-door]')];
  const res = roots.map((root) => ({ kind: root.dataset.door, frames: 0, panels: [], others: 0, notFour: 0, notConvex: 0, knobShown: 0, knobOut: 0, overlaps: 0, minGap: Infinity, maxStep: 0, minW: Infinity, maxW: 0, rW: root.querySelector('[data-door-r]').getBoundingClientRect().width, css3d: 0 }));
  const prev = roots.map(() => null);
  for (let i = 0; i < FRAMES; i++) {
    window.__rlDoor.at((i * swingMs) / (FRAMES - 1));
    roots.forEach((root, j) => {
      const r = res[j]; r.frames++;
      const panels = root.querySelectorAll('[data-door-panel]');
      if (!r.panels.includes(panels.length)) r.panels.push(panels.length);
      r.others = Math.max(r.others, root.querySelector('[data-door-leaf]').querySelectorAll(':not([data-door-panel]):not([data-door-knob])').length);
      const poly = panels[0];
      if (getComputedStyle(poly).transform !== 'none' || getComputedStyle(root).transform !== 'none') r.css3d++;
      const pts = [...poly.points].map((p) => [p.x, p.y]);
      if (pts.length !== 4) { r.notFour++; return; }
      const c = pts.map((p, k) => cross(p, pts[(k + 1) % 4], pts[(k + 2) % 4]));
      if (!(c.every((v) => v > 1e-9) || c.every((v) => v < -1e-9))) r.notConvex++;
      const knob = root.querySelector('[data-door-knob]');
      if (getComputedStyle(knob).display !== 'none') {
        r.knobShown++;
        const kx = knob.cx.baseVal.value; const ky = knob.cy.baseVal.value; const rx = knob.rx.baseVal.value; const ry = knob.ry.baseVal.value;
        for (let k = 0; k < 36; k++) { const a = (k / 36) * 2 * Math.PI; if (!inside(pts, [kx + rx * Math.cos(a), ky + ry * Math.sin(a)])) { r.knobOut++; break; } }
      }
      const ctm = poly.getScreenCTM();
      const scr = pts.map(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(ctm); return [q.x, q.y]; });
      const R = root.querySelector('[data-door-r]').getBoundingClientRect();
      const right = Math.max(...scr.map((p) => p[0])); const left = Math.min(...scr.map((p) => p[0]));
      if (right > R.left) r.overlaps++;
      r.minGap = Math.min(r.minGap, R.left - right); r.minW = Math.min(r.minW, right - left); r.maxW = Math.max(r.maxW, right - left);
      if (prev[j]) r.maxStep = Math.max(r.maxStep, ...scr.map((p, k) => Math.hypot(p[0] - prev[j][k][0], p[1] - prev[j][k][1])));
      prev[j] = scr;
    });
  }
  window.__rlDoor.release();
  return res;
}, { FRAMES, swingMs });

async function defaults(page, tag) {
  assert.deepEqual(await settings(page), { ...DOOR.defaults }, `${tag}: the defaults`);
  assert.equal((await page.locator('[data-door-value="open"]').innerText()).trim(), '0.60 of the R');
  assert.equal((await page.locator('[data-door-value="knob"]').innerText()).trim(), '0.18 of the panel');
  assert.equal((await page.locator('[data-door-value="swing"]').innerText()).trim(), '700 ms');
  assert.equal((await page.locator('[data-door-value="pause"]').innerText()).trim(), '900 ms');
  for (const k of ['rest-bar', 'easing-soft', 'play-loop', 'reduced-off']) assert.equal(await control(page, k).getAttribute('aria-pressed'), 'true', `${tag}: ${k} chosen`);
  const kinds = await page.locator('[data-door-section] [data-door]').evaluateAll((els) => els.map((el) => el.dataset.door));
  assert.deepEqual(kinds, ['wordmark', 'realtor', 'admin', 'paper', 'paper', 'paper', 'ink', 'ink', 'ink'], `${tag}: three grounds and six loading icons`);
  // One clock: the marks move, and every mark is at the same point of its swing.
  const travels = async () => page.locator('[data-door-section] [data-door]').evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-door-travel'))));
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) { await page.waitForTimeout(50); const t = await travels(); moved = t[0] > 0.05; if (moved) assert.ok(Math.max(...t) - Math.min(...t) < 0.02, `${tag}: every mark in step (${t})`); }
  assert.ok(moved, `${tag}: the door swings`);
  await control(page, 'copy').click();
  await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__copied), doorSettingsJson(DOOR.defaults), `${tag}: Copy settings writes the values as JSON`);
  assert.equal((await control(page, 'copy').innerText()).trim(), 'Copied');
}

async function oneShape(page, tag) {
  await control(page, 'open').focus(); await page.keyboard.press('End');
  assert.equal((await settings(page)).open, DOOR_OPEN_RANGE.max, `${tag}: the open width at its widest`);
  for (const rest of ['bar', 'panel']) {
    await control(page, `rest-${rest}`).click(); await settle(page);
    const rows = await sample(page, DOOR.defaults.swingMs);
    assert.equal(rows.length, 9);
    for (const r of rows) {
      const where = `${tag} rest ${rest} ${r.kind}`;
      assert.equal(r.frames, FRAMES);
      assert.deepEqual(r.panels, [1], `${where}: exactly one panel drawn in every frame`);
      assert.equal(r.others, 0, `${where}: nothing else drawn for the door but its knob`);
      assert.equal(r.css3d, 0, `${where}: no CSS transform on the door`);
      assert.equal(r.notFour + r.notConvex, 0, `${where}: one convex quadrilateral every frame (${r.notFour} not four sided, ${r.notConvex} not convex)`);
      assert.ok(r.knobShown > FRAMES / 4, `${where}: the knob shows on the open panel (${r.knobShown} frames)`);
      assert.equal(r.knobOut, 0, `${where}: the knob inside the panel every frame`);
      assert.equal(r.overlaps, 0, `${where}: the door never overlaps the R`);
      assert.ok(r.minGap > 0, `${where}: nearest gap to the R ${r.minGap.toFixed(2)}px`);
      assert.ok(r.maxStep <= STEP, `${where}: no corner moves more than ${STEP}px between frames (${r.maxStep.toFixed(2)}px)`);
      const want = DOOR_OPEN_RANGE.max * r.rW;
      assert.ok(Math.abs(r.maxW - want) < want * 0.03 && r.minW < r.maxW / 2.5, `${where}: the frames span the swing, ${r.minW.toFixed(1)}px to ${r.maxW.toFixed(1)}px`);
    }
    const named = rows.filter((r) => ['wordmark', 'realtor', 'admin'].includes(r.kind));
    console.log(`  ${tag} rest ${rest}: ${FRAMES} frames on ${rows.length} marks; one panel in every frame; 0 not convex; knob inside in all ${named.reduce((n, r) => n + r.knobShown, 0)} knob frames on the wordmark and icons; 0 overlaps, nearest gap ${Math.min(...rows.map((r) => r.minGap)).toFixed(2)}px; largest corner step ${Math.max(...rows.map((r) => r.maxStep)).toFixed(2)}px (limit ${STEP}px)`);
  }
  await control(page, 'rest-bar').click();
}

async function once(page, tag) {
  const angle = () => page.locator('[data-door-section] [data-door="wordmark"]').getAttribute('data-door-angle');
  await control(page, 'play-once').click(); await settle(page);
  const rest = await page.evaluate(() => document.querySelector('[data-door-section] [data-door="wordmark"]').getAttribute('data-door-angle'));
  await page.waitForTimeout(DOOR.defaults.swingMs + 300);
  const after1 = await angle(); await page.waitForTimeout(300);
  assert.equal(await angle(), after1, `${tag}: once plays one swing and stops`);
  assert.equal(Number(await page.locator('[data-door-section] [data-door="wordmark"]').getAttribute('data-door-travel')), 0, `${tag}: at rest`);
  await control(page, 'replay').click();
  let moved = false;
  for (let i = 0; i < 20 && !moved; i++) { await page.waitForTimeout(25); moved = Number(await page.locator('[data-door-section] [data-door="wordmark"]').getAttribute('data-door-travel')) > 0.05; }
  assert.ok(moved, `${tag}: Replay starts it over (from ${rest})`);
  await control(page, 'play-loop').click();
}

// Reduced: the door holds still with no knob; only the opacity of the door breathes, 0.6 to 1.
async function breathes(page, tag) {
  const still = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('[data-door-section] [data-door]')];
    const seen = roots.map(() => new Set()); const knobs = roots.map(() => 0);
    for (const ms of [0, 175, 350, 525, 700]) { window.__rlDoor.at(ms); roots.forEach((r, j) => { seen[j].add(r.querySelector('[data-door-panel]').getAttribute('points')); if (getComputedStyle(r.querySelector('[data-door-knob]')).display !== 'none') knobs[j]++; }); }
    window.__rlDoor.release();
    return roots.map((r, j) => ({ kind: r.dataset.door, poses: seen[j].size, knobs: knobs[j] }));
  });
  for (const r of still) { assert.equal(r.poses, 1, `${tag} ${r.kind}: the door holds still`); assert.equal(r.knobs, 0, `${tag} ${r.kind}: no knob`); }
  for (const rest of ['bar', 'panel']) {
    await control(page, `rest-${rest}`).click(); await settle(page);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-door-section] [data-door]')].map((root) => {
      const leaf = root.querySelector('[data-door-leaf]'); const anims = root.getAnimations({ subtree: true });
      const cycle = anims.length ? anims[0].effect.getTiming().duration : 0; anims.forEach((a) => a.pause());
      const ops = []; for (let i = 0; i <= 40; i++) { anims.forEach((a) => { a.currentTime = (i * cycle) / 40; }); ops.push(Number(getComputedStyle(leaf).opacity)); }
      anims.forEach((a) => a.play());
      return { kind: root.dataset.door, anims: anims.map((a) => a.animationName.replace(/^.*-/, '')), onLeaf: anims.every((a) => a.effect.target === leaf), min: Math.min(...ops), max: Math.max(...ops), knob: getComputedStyle(root.querySelector('[data-door-knob]')).display };
    }));
    for (const r of rows) {
      const where = `${tag} rest ${rest} ${r.kind}`;
      assert.deepEqual(r.anims, ['breath'], `${where}: only the breath runs`);
      assert.ok(r.onLeaf, `${where}: on the door itself`);
      assert.ok(Math.abs(r.min - DOOR.breath) < 0.02 && r.max === 1, `${where}: opacity between ${r.min.toFixed(2)} and ${r.max}`);
      assert.equal(r.knob, 'none', `${where}: the knob hidden`);
    }
  }
  await control(page, 'rest-bar').click();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const { ctx, page, errors } = await open(browser);
    await defaults(page, tag);
    await targets(page, `${tag} 1280`);
    await oneShape(page, tag);
    await once(page, tag);
    await control(page, 'reduced-on').click(); await settle(page);
    assert.equal(await page.locator('[data-door-section]').getAttribute('data-door-motion'), 'reduced');
    await breathes(page, `${tag} previewed`);
    assert.deepEqual(errors, []);
    await ctx.close();
    // The system setting: the toggle off, reduced motion from the operating system.
    const sys = await open(browser, { reduced: true });
    assert.equal(await sys.page.locator('[data-door-section]').getAttribute('data-door-motion'), 'auto');
    await breathes(sys.page, `${tag} system`);
    await sys.ctx.close();
    const phone = await open(browser, { width: 390 });
    await targets(phone.page, `${tag} 390`);
    assert.deepEqual(phone.errors, []);
    await phone.ctx.close();
  } finally { await browser.close(); }
}

test('the door mark in WebKit', { timeout: 900000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
