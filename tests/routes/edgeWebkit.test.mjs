// The swipe from the left edge back, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an
// iPhone user agent, on the real pages over the fake stack in a production build
// (tests/helpers/fakeNextServer.mjs). Standalone is emulated as iOS sets it (navigator.standalone).
//   1. From a listing, a drag from the edge past a third goes back: the page follows the finger 1:1
//      and the dashboard as it was left is drawn beneath (its picture, not a skeleton); then the
//      dashboard's real content shows, in the same document.
//   2. A short slow drag settles back: same screen, nothing moved, nothing beneath.
//   3. A vertical drag from the edge is left to the page: no swipe (and in Chrome, with real touches,
//      the page scrolls).
//   4. With a sheet open, on the dashboard, and outside the installed app (Safari): nothing happens.
//   5. Under reduced motion nothing follows the finger, and a flick goes back.
//   6. Fifty random edge drags, from any screen, some during a transition: every one leaves the app
//      on a real screen.
// The touch is a run of pointer events of the touch kind (what the gesture reads); the data requests
// wait 300ms each, as on a phone. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3159; const BASE = process.env.EDGE_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const FUZZ = Number(process.env.EDGE_FUZZ || 50);
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const run = (cmd, args, env) => new Promise((res, rej) => { const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)))); });
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.EDGE_BASE) return; // EDGE_BASE: a server already running
  await takeTurn(); turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await run(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' });
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/listing/L1', '/profile']) await fetch(`${BASE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

async function phone(browser, { standalone = true, reduced = false } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  await ctx.route(/\/_next\/data\/|\/api\/assistant\/signals|\/api\/listings\/applicants/, async (r) => { await new Promise((res) => setTimeout(res, 300)); await r.continue().catch(() => {}); });
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const STATE = () => {
  const el = document.getElementById('__next'); const m = el ? getComputedStyle(el).transform : 'none';
  return {
    path: location.pathname,
    routeSkeleton: !!document.querySelector('[data-skeleton-route]'),
    failed: !!document.querySelector('[data-load-failed]'),
    beneath: !!document.querySelector('[data-edge-beneath]'),
    snapshot: !!document.querySelector('#__next [data-snapshot]'),
    busy: !!document.querySelector('[aria-busy="true"]'),
    moved: m !== 'none' && m !== 'matrix(1, 0, 0, 1, 0, 0)',
    cards: document.querySelectorAll('#__next .dash-card-int').length,
    applicants: document.querySelectorAll('#__next [id^="applicant-"]').length,
    fields: document.querySelectorAll('#__next input').length,
    nav: document.documentElement.dataset.nav || '',
    sheet: document.documentElement.classList.contains('rl-sheet-open'),
    same: window.__sameDocument === 'yes',
  };
};
// A real screen: no skeleton, no picture, no transition, nothing moved, and the screen's own content
// for its URL (the URL changes with the tap, before the screen arrives).
const content = (s) => (s.path === '/dashboard' ? s.cards > 0 : /^\/listing\//.test(s.path) ? s.applicants > 0 && s.cards === 0 : s.path === '/profile' ? s.fields > 0 && s.cards === 0 && s.applicants === 0 : false);
const realScreen = (s) => !!s && /^\/(dashboard|listing\/[^/]+|profile)$/.test(s.path) && !s.routeSkeleton && !s.failed && !s.beneath && !s.snapshot && !s.busy && !s.moved && !s.nav && content(s);
const onDashboard = (s) => realScreen(s) && s.path === '/dashboard' && s.cards > 0;
async function waitFor(page, ok, ms) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await page.evaluate(STATE).catch(() => null); if (ok(s)) return { ok: true, s }; await page.waitForTimeout(40); }
  return { ok: false, s };
}
// A touch drag, as the gesture reads it: pointer events of the touch kind, paced in real time. The
// state halfway through (before the finger lifts) comes back with it.
const drag = (page, { x0 = 6, y0 = 420, dx, dy = 0, ms = 400, steps = 12 }) => page.evaluate(async ({ x0, y0, dx, dy, ms, steps }) => {
  const at = document.elementFromPoint(x0, y0) || document.body;
  const fire = (type, x, y) => at.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  fire('pointerdown', x0, y0);
  for (let i = 1; i <= steps; i++) { await new Promise((r) => setTimeout(r, ms / steps)); fire('pointermove', x0 + (dx * i) / steps, y0 + (dy * i) / steps); }
  const el = document.getElementById('__next'); const beneath = document.querySelector('[data-edge-beneath]');
  const mid = { tx: new DOMMatrix(getComputedStyle(el).transform).m41, beneath: !!beneath, picture: !!beneath && !!beneath.querySelector('[data-snapshot]'), pictureCards: beneath ? beneath.querySelectorAll('.dash-card-int').length : 0, skeleton: !!beneath && !!beneath.querySelector('[data-skeleton-route]') };
  fire('pointerup', x0 + dx, y0 + dy);
  return mid;
}, { x0, y0, dx, dy, ms, steps });
const tapAt = async (page, loc) => { const b = await loc.boundingBox({ timeout: 5000 }); await page.touchscreen.tap(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20)); };
// 210 Carlaw (five applicants): a page taller than the screen.
async function toListing(page, tag) {
  await waitFor(page, onDashboard, 8000);
  await tapAt(page, page.locator('#__next .dash-card-int').filter({ hasText: '210 Carlaw' }).first());
  const r = await waitFor(page, (s) => realScreen(s) && /^\/listing\//.test(s.path), 8000);
  assert.ok(r.ok, `${tag}: a listing opened: ${JSON.stringify(r.s)}`);
}
async function start(page, tag) {
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__sameDocument = 'yes'; });
  await toListing(page, tag);
}

async function gestures(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  await start(page, tag);
  // 1. Past a third: the page follows the finger, the dashboard as it was left lies beneath.
  const mid = await drag(page, { dx: 200, ms: 600 });
  assert.equal(Math.round(mid.tx), 200, `${tag}: the page follows the finger 1:1`);
  assert.ok(mid.beneath && mid.picture && mid.pictureCards > 0 && !mid.skeleton, `${tag}: the real dashboard lies beneath: ${JSON.stringify(mid)}`);
  let r = await waitFor(page, onDashboard, 3000);
  assert.ok(r.ok, `${tag}: back on the dashboard with its real content: ${JSON.stringify(r.s)}`);
  assert.equal(r.s.same, true, `${tag}: the same document, never a reload`);
  // 2. A short slow drag settles back.
  await toListing(page, tag);
  const listing = (await page.evaluate(STATE)).path;
  const short = await drag(page, { dx: 60, ms: 700 });
  assert.equal(Math.round(short.tx), 60);
  await page.waitForTimeout(500);
  r = await waitFor(page, (s) => realScreen(s) && s.path === listing, 1500);
  assert.ok(r.ok, `${tag}: a short drag settles back: ${JSON.stringify(r.s)}`);
  // 3. Vertical: left to the page.
  const vertical = await drag(page, { dx: 6, dy: -220, ms: 300 });
  assert.ok(!vertical.beneath && Math.round(vertical.tx) === 0, `${tag}: a vertical drag is no swipe: ${JSON.stringify(vertical)}`);
  r = await waitFor(page, (s) => realScreen(s) && s.path === listing, 1000);
  assert.ok(r.ok, `${tag}: still on the listing`);
  if (tag === 'cr') {
    // Real touches: the page scrolls under a vertical drag from the edge.
    await page.evaluate(() => window.scrollTo(0, 0));
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 8, 700);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', 8 + i * 0.4, 700 - i * 40); await page.waitForTimeout(16); }
    await touch('touchEnd');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ y: window.scrollY, path: location.pathname, beneath: !!document.querySelector('[data-edge-beneath]') }));
    assert.ok(after.y > 100 && after.path === listing && !after.beneath, `${tag}: a real vertical drag from the edge scrolls the page: ${JSON.stringify(after)}`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  // 4a. A sheet open: nothing.
  await tapAt(page, page.getByRole('button', { name: /^Next,/ }).first());
  await page.waitForFunction(() => document.documentElement.classList.contains('rl-sheet-open'), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  const sheet = await drag(page, { dx: 220, ms: 500 });
  assert.ok(!sheet.beneath, `${tag}: with a sheet open, no swipe`);
  await page.waitForTimeout(600);
  r = await page.evaluate(STATE);
  assert.ok(r.sheet && r.path === listing, `${tag}: the sheet stays, the screen too: ${JSON.stringify(r)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.classList.contains('rl-sheet-open') && !document.documentElement.classList.contains('rl-sheet-closing'), null, { timeout: 5000 });
  await page.waitForTimeout(200);
  // 4b. The dashboard: nothing, even with screens behind it in history.
  await tapAt(page, page.getByText('All listings', { exact: true }).first());
  r = await waitFor(page, onDashboard, 3000);
  assert.ok(r.ok, `${tag}: back on the dashboard: ${JSON.stringify(r.s)}`);
  const root = await drag(page, { dx: 220, ms: 500 });
  assert.ok(!root.beneath && Math.round(root.tx) === 0, `${tag}: no swipe on the dashboard`);
  await page.waitForTimeout(600);
  r = await waitFor(page, onDashboard, 1000);
  assert.ok(r.ok, `${tag}: still the dashboard: ${JSON.stringify(r.s)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

async function outsideTheApp(browser, tag) {
  const { ctx, page } = await phone(browser, { standalone: false });
  await start(page, tag);
  const listing = (await page.evaluate(STATE)).path;
  const mid = await drag(page, { dx: 220, ms: 500 });
  assert.ok(!mid.beneath && Math.round(mid.tx) === 0, `${tag}: in Safari, no swipe of ours`);
  await page.waitForTimeout(600);
  const r = await waitFor(page, (s) => realScreen(s) && s.path === listing, 1000);
  assert.ok(r.ok, `${tag}: still on the listing`);
  await ctx.close();
}

async function reducedMotion(browser, tag) {
  const { ctx, page } = await phone(browser, { reduced: true });
  await start(page, tag);
  const listing = (await page.evaluate(STATE)).path;
  const slow = await drag(page, { dx: 220, ms: 900 });
  assert.ok(!slow.beneath && Math.round(slow.tx) === 0, `${tag}: under reduced motion nothing follows the finger`);
  await page.waitForTimeout(500);
  let r = await waitFor(page, (s) => realScreen(s) && s.path === listing, 1000);
  assert.ok(r.ok, `${tag}: a slow drag does not go back under reduced motion`);
  await drag(page, { dx: 90, ms: 60, steps: 4 });
  r = await waitFor(page, onDashboard, 3000);
  assert.ok(r.ok, `${tag}: a flick goes back: ${JSON.stringify(r.s)}`);
  await ctx.close();
}

// Fifty random edge drags from any screen, some during a transition.
async function fuzz(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  let seed = tag === 'wk' ? 11 : 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const misses = [];
  for (let i = 0; i < FUZZ; i++) {
    const s = await page.evaluate(STATE);
    // Somewhere to swipe from: a listing or the profile, sometimes the dashboard itself.
    const where = rnd();
    let during = false;
    if (s.path === '/dashboard' && where < 0.85) {
      const target = where < 0.55 ? page.locator('#__next .dash-card-int').nth(Math.floor(rnd() * 2)) : page.locator('#__next a.rl-hdr-avatar').first();
      await tapAt(page, target).catch(() => {});
      during = rnd() < 0.3;
      if (during) await page.waitForTimeout(Math.floor(rnd() * 300)); // the drag lands while the screen is on its way
      else await waitFor(page, realScreen, 6000);
    }
    const plan = { x0: Math.floor(rnd() * 26), y0: 150 + Math.floor(rnd() * 600), dx: Math.floor(rnd() * 400) - 40, dy: Math.floor(rnd() * 400) - 200, ms: 30 + Math.floor(rnd() * 870) };
    await drag(page, plan).catch(() => {});
    const end = await waitFor(page, realScreen, 5000);
    if (!end.ok) {
      misses.push(`${i} ${JSON.stringify(plan)}${during ? ' during a transition' : ''}: ${JSON.stringify(end.s)}`);
      await page.goto('/dashboard', { waitUntil: 'networkidle' }).catch(() => {});
    }
  }
  assert.deepEqual(misses, [], `${tag}: ${misses.length} of ${FUZZ} random edge drags did not end on a real screen`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    await gestures(browser, tag);
    await outsideTheApp(browser, tag);
    await reducedMotion(browser, tag);
    await fuzz(browser, tag);
  } finally { await browser.close(); }
}

test('the edge swipe back in the installed app, in WebKit at 390', { timeout: 1800000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 1800000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
