// The door mark on /admin/mockups (components/admin/DoorLab.js, components/brand/DoorMark.js), in
// WebKit (Safari's engine) and in Chrome, on the walks' admin dev server (tests/helpers/
// adminServer.mjs: a made up password, an in memory store):
//   1. The defaults: rest as the thin bar, open to 0.6 of the R, 700ms a swing, 900ms pause, soft,
//      loop; Copy settings writes them as JSON; every control is at least 44px, at 1280 and at 390.
//   2. The door never overlaps the R: at the widest setting, 60 frames of one swing sampled from
//      the running animations, the door's box against the R's, on the wordmark, both app icons and
//      the six loading icons, resting as the bar and as the panel, in the 3D and the SVG versions.
//   3. Once plays one swing and Replay starts it over.
//   4. Reduced motion, previewed and from the system setting: the door does not turn, its opacity
//      breathes between 0.6 and 1.
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

const FRAMES = 60;
const KINDS = ['wordmark', 'realtor', 'admin', 'paper', 'ink'];

async function open(browser, { width = 1280, reduced = false } = {}) {
  const ctx = await browser.newContext({ baseURL: admin.base, viewport: { width, height: 1000 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await admin.signIn(ctx);
  // The clipboard, read back: what Copy settings wrote lands in window.__copied, in both engines.
  await ctx.addInitScript(() => { window.__copied = null; const w = { writeText: async (t) => { window.__copied = t; } }; try { Object.defineProperty(navigator, 'clipboard', { value: w, configurable: true }); } catch (e) { /* the page's fallback then runs */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/ResizeObserver loop/.test(e.message)) errors.push(e.message); });
  await page.goto('/admin/mockups', { waitUntil: 'networkidle', timeout: 240000 });
  await page.locator('[data-door-section] [data-door="wordmark"]').waitFor({ timeout: 60000 });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('[data-door-section]').scrollIntoView({ behavior: 'instant' }); });
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
  assert.ok(r.count >= 16, `${tag}: the controls are there (${r.count})`);
  assert.deepEqual(r.small, [], `${tag}: every control at least 44px tall`);
  assert.equal(r.scroll, r.vw, `${tag}: no sideways scroll`);
}

// One swing of every mark, FRAMES frames from 0 to the swing's end, set on its own running
// animations; the door's box (its faces, as the browser projects them) against the R's box.
const sample = (page, swingMs) => page.evaluate(({ FRAMES, swingMs }) => {
  const out = [];
  for (const root of document.querySelectorAll('[data-door-section] [data-door]')) {
    const anims = root.getAnimations({ subtree: true });
    anims.forEach((a) => a.pause());
    const R = root.querySelector('[data-door-r]').getBoundingClientRect();
    const res = { kind: root.dataset.door, version: root.dataset.doorVersion, anims: anims.length, overlaps: 0, minGap: Infinity, minW: Infinity, maxW: 0, rW: R.width };
    for (let i = 0; i < FRAMES; i++) {
      const t = (i * swingMs) / (FRAMES - 1);
      anims.forEach((a) => { a.currentTime = t; });
      const faces = [...root.querySelectorAll('[data-door-face]')].map((f) => f.getBoundingClientRect()).filter((r) => r.width > 0.01 && r.height > 0);
      const box = { left: Math.min(...faces.map((r) => r.left)), right: Math.max(...faces.map((r) => r.right)), top: Math.min(...faces.map((r) => r.top)), bottom: Math.max(...faces.map((r) => r.bottom)) };
      if (box.left < R.right && box.right > R.left && box.top < R.bottom && box.bottom > R.top) res.overlaps++;
      res.minGap = Math.min(res.minGap, R.left - box.right);
      res.minW = Math.min(res.minW, box.right - box.left); res.maxW = Math.max(res.maxW, box.right - box.left);
    }
    anims.forEach((a) => a.play());
    out.push(res);
  }
  return out;
}, { FRAMES, swingMs });

async function defaults(page, tag) {
  assert.deepEqual(await settings(page), { ...DOOR.defaults }, `${tag}: the defaults`);
  assert.equal((await page.locator('[data-door-value="open"]').innerText()).trim(), '0.60 of the R');
  assert.equal((await page.locator('[data-door-value="swing"]').innerText()).trim(), '700 ms');
  assert.equal((await page.locator('[data-door-value="pause"]').innerText()).trim(), '900 ms');
  for (const k of ['rest-bar', 'easing-soft', 'play-loop', 'version-3d', 'reduced-off']) assert.equal(await control(page, k).getAttribute('aria-pressed'), 'true', `${tag}: ${k} chosen`);
  const kinds = await page.locator('[data-door-section] [data-door]').evaluateAll((els) => els.map((el) => el.dataset.door));
  assert.deepEqual(kinds, ['wordmark', 'realtor', 'admin', 'paper', 'paper', 'paper', 'ink', 'ink', 'ink'], `${tag}: three grounds and six loading icons`);
  const looping = await page.locator('[data-door-section] [data-door]').evaluateAll((els) => els.map((el) => el.getAnimations({ subtree: true }).filter((a) => a.effect.getTiming().iterations === Infinity).length));
  assert.ok(looping.every((n) => n === 6), `${tag}: every mark loops its swing, its faces and their shades (${looping})`);
  // Every mark swings in step, the wordmark included after it settles its size to its tile.
  await page.waitForTimeout(400);
  const times = await page.locator('[data-door-section] [data-door]').evaluateAll((els) => els.map((el) => el.getAnimations({ subtree: true })[0].currentTime % 1600));
  assert.ok(Math.max(...times) - Math.min(...times) < 50, `${tag}: every mark in step (${times.map((t) => Math.round(t)).join(', ')})`);
  // The loading icon at the default settings, as drawn: the bar at rest and the panel open.
  const loading = (await sample(page, DOOR.defaults.swingMs)).filter((r) => r.kind === 'paper');
  console.log(`  ${tag} loading at the defaults: ${loading.map((r, i) => `${[20, 28, 44][i]}px bar ${r.minW.toFixed(2)}px open ${r.maxW.toFixed(2)}px`).join(', ')}`);
  await control(page, 'copy').click();
  await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__copied), doorSettingsJson(DOOR.defaults), `${tag}: Copy settings writes the values as JSON`);
  assert.equal((await control(page, 'copy').innerText()).trim(), 'Copied');
}

async function neverOverlaps(page, tag) {
  await control(page, 'open').focus(); await page.keyboard.press('End');
  assert.equal((await settings(page)).open, DOOR_OPEN_RANGE.max, `${tag}: the open width at its widest`);
  assert.equal((await page.locator('[data-door-value="open"]').innerText()).trim(), `${DOOR_OPEN_RANGE.max.toFixed(2)} of the R`);
  for (const version of ['3d', 'svg']) {
    await control(page, `version-${version}`).click();
    for (const rest of ['bar', 'panel']) {
      await control(page, `rest-${rest}`).click(); await settle(page);
      const rows = await sample(page, DOOR.defaults.swingMs);
      assert.equal(rows.length, 9);
      for (const r of rows) {
        const where = `${tag} ${version} rest ${rest} ${r.kind}`;
        assert.equal(r.version, version);
        assert.ok(r.anims >= 2, `${where}: its animations ran (${r.anims})`);
        assert.equal(r.overlaps, 0, `${where}: the door never overlaps the R in ${FRAMES} frames`);
        assert.ok(r.minGap > 0, `${where}: the nearest the door came to the R, ${r.minGap.toFixed(2)}px, is a gap`);
        // The frames span the whole swing: the bar and the panel at the widest setting both appear.
        const want = DOOR_OPEN_RANGE.max * r.rW;
        assert.ok(Math.abs(r.maxW - want) < want * 0.03, `${where}: at its widest the door is ${r.maxW.toFixed(1)}px, ${DOOR_OPEN_RANGE.max} of the R's ${r.rW.toFixed(1)}px`);
        assert.ok(r.minW < r.maxW / 2.5, `${where}: and it narrows to the bar (${r.minW.toFixed(1)}px)`);
      }
      console.log(`  ${tag} ${version} rest ${rest}: ${rows.length} marks, ${FRAMES} frames each, 0 overlaps, nearest gap ${Math.min(...rows.map((r) => r.minGap)).toFixed(2)}px`);
    }
  }
  await control(page, 'rest-bar').click(); await control(page, 'version-3d').click();
}

async function once(page, tag) {
  await control(page, 'play-once').click(); await settle(page);
  const it = await page.locator('[data-door-section] [data-door="wordmark"]').evaluate((el) => el.getAnimations({ subtree: true }).map((a) => a.effect.getTiming().iterations));
  assert.ok(it.length === 6 && it.every((n) => n === 1), `${tag}: once plays one swing (${it})`);
  await page.waitForTimeout(DOOR.defaults.swingMs + 200);
  assert.ok(await page.locator('[data-door-section] [data-door="wordmark"]').evaluate((el) => el.getAnimations({ subtree: true }).every((a) => a.playState === 'finished')), `${tag}: and stops`);
  await control(page, 'replay').click(); await settle(page);
  assert.ok(await page.locator('[data-door-section] [data-door="wordmark"]').evaluate((el) => el.getAnimations({ subtree: true }).every((a) => a.playState === 'running' && a.currentTime < 400)), `${tag}: Replay starts it over`);
  await control(page, 'play-loop').click();
}

// Reduced: no transform animates, the faces hold still, the door's opacity breathes 0.6 to 1.
async function breathes(page, tag) {
  for (const version of ['3d', 'svg']) {
    await control(page, `version-${version}`).click(); await settle(page);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-door-section] [data-door]')].map((root) => {
      const anims = root.getAnimations({ subtree: true });
      const leaf = root.querySelector('[data-door-leaf]');
      const face = root.querySelector('[data-door-face]');
      const cycle = anims.length ? anims[0].effect.getTiming().duration : 0;
      anims.forEach((a) => a.pause());
      const ops = []; const boxes = new Set();
      for (let i = 0; i <= 40; i++) { anims.forEach((a) => { a.currentTime = (i * cycle) / 40; }); ops.push(Number(getComputedStyle(leaf).opacity)); const b = face.getBoundingClientRect(); boxes.add(`${b.left.toFixed(2)},${b.width.toFixed(2)}`); }
      anims.forEach((a) => a.play());
      return { kind: root.dataset.door, anims: anims.map((a) => a.animationName.replace(/^.*-/, '')), targets: anims.map((a) => a.effect.target === leaf), min: Math.min(...ops), max: Math.max(...ops), still: boxes.size === 1 };
    }));
    for (const r of rows) {
      const where = `${tag} ${version} ${r.kind}`;
      assert.deepEqual(r.anims, ['breath'], `${where}: only the breath runs, nothing turns`);
      assert.deepEqual(r.targets, [true], `${where}: on the door itself`);
      assert.ok(Math.abs(r.min - DOOR.breath) < 0.02 && r.max === 1, `${where}: opacity between ${r.min.toFixed(2)} and ${r.max}`);
      assert.ok(r.still, `${where}: the door holds still`);
    }
  }
  await control(page, 'version-3d').click();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const { ctx, page, errors } = await open(browser);
    await defaults(page, tag);
    await targets(page, `${tag} 1280`);
    await neverOverlaps(page, tag);
    await once(page, tag);
    await control(page, 'reduced-on').click();
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
