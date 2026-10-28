// The door in the product (components/brand/Loader.js, AppStart.js, HomeDoor.js), in WebKit
// (Safari's engine) and in Chrome, at 390 by 844, on an admin dev server (tests/helpers/
// adminServer.mjs: a made up password, an in memory store) that also serves the sandbox pages:
//   1. A pending button keeps exactly its resting size: its label stays in place unseen and the
//      door turns in the middle of the pill, at 28px or more, role status, named for what is
//      loading. Checked on a tenant outline pill (my application, Email me a link) and the auth
//      pill (forgot password), with the request held open by the test (nothing leaves the machine).
//   2. App start never delays a ready screen: in the installed app (navigator.standalone), sign in
//      is ready the moment it hydrates, and the opening screen is gone by then, with no fade. It
//      shows once a session. Slow first screen (the admin CRM with its request held 2.5s): the door
//      turns from first paint, before and after React takes over, and the screen lifts the moment
//      the CRM's own loader goes, within DOOR.appStart.fadeMs and a frame.
//   3. The homepage header's door swings once, about DOOR.homeDelayMs after the page loads: one
//      swing, open and shut, then rest. Scrolling never starts it; a reload in the same visit
//      keeps it still.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { adminServer, ADMIN_START_TIMEOUT } from '../helpers/adminServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { STOP_TIMEOUT } from '../helpers/devServer.mjs';
register('../helpers/loader.mjs', import.meta.url);
const { DOOR } = await import('../../lib/motion.js');

// Next's test mode on this walk's own server: the client then records when it has hydrated
// (window.__NEXT_HYDRATED_AT, after every component's effects), the moment a screen is ready.
process.env.__NEXT_TEST_MODE = '1';
const server = adminServer(3169);
before(async () => { if (haveWebkit || haveChrome) await server.start(); }, { timeout: ADMIN_START_TIMEOUT });
after(async () => { await server.stop(); }, { timeout: STOP_TIMEOUT });

const VIEW = { width: 390, height: 844 };
const warm = () => Promise.all(['/', '/signin', '/forgot-password', '/my-application', '/admin/crm'].map((u) => fetch(`${server.base}${u}`).catch(() => null)));
// Times kept in the page, from the first script on: when the opening screen leaves, when it
// starts to fade, when the page's own loaders go, and the header door's travel every frame.
const WATCH = () => {
  const w = { lifted: null, faded: null, busyGone: null, hadBusy: false, travel: [], shown: false };
  window.__rlWatch = w;
  const busy = () => [...document.querySelectorAll('[aria-busy="true"], [data-skeleton-route], [data-skeleton], [data-loader]')].filter((el) => !el.closest('[data-app-start]')).length;
  const tick = () => {
    const now = performance.now();
    const ov = document.querySelector('[data-app-start]');
    const on = document.documentElement.classList.contains('rl-appstart-on') && ov;
    if (on && getComputedStyle(ov).display !== 'none') w.shown = true;
    if (ov && ov.getAttribute('data-phase') === 'out' && w.faded === null) w.faded = now;
    if (w.shown && !on && w.lifted === null) w.lifted = now;
    if (document.body) { const b = busy(); if (b) w.hadBusy = true; else if (w.hadBusy && w.busyGone === null) w.busyGone = now; }
    const logo = document.querySelector('[data-door="logo"]');
    if (logo) w.travel.push([now, Number(logo.getAttribute('data-door-travel') || 0)]);
    const s = document.querySelector('[data-app-start] svg');
    if (s && on) (w.start || (w.start = [])).push([now, s.getAttribute('data-door-travel'), s.getAttribute('data-door-live') ? 'react' : 'player']);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('load', () => { w.loadAt = performance.now(); });
};
const standalone = () => { Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true }); };

async function context(browser, { app = false, admin = false } = {}) {
  const ctx = await browser.newContext({ baseURL: server.base, viewport: VIEW, deviceScaleFactor: 2 });
  if (admin) await server.signIn(ctx);
  if (app) await ctx.addInitScript(standalone);
  await ctx.addInitScript(WATCH);
  // Nothing reaches a real auth service: every Supabase auth call is answered here.
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const box = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, opacity: getComputedStyle(el).opacity }; });

// 1. A pending button keeps its size.
async function pending(browser, tag) {
  const { ctx, page, errors } = await context(browser);
  const cases = [
    { url: '/my-application', route: '**/api/tenant/request-link', fill: async () => { await page.locator('#tp-email').fill('priya@example.com'); }, button: 'form button[type=submit]', label: 'Sending your link' },
    { url: '/forgot-password', route: '**/auth/v1/recover**', fill: async () => { await page.locator('input[type=email]').fill('priya@example.com'); }, button: 'form button[type=submit]', label: 'Sending your reset link' },
  ];
  const out = [];
  for (const c of cases) {
    let release = null; const held = new Promise((r) => { release = r; });
    await ctx.route(c.route, async (r) => { await held; await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto(c.url, { waitUntil: 'networkidle' }); await c.fill();
    const rest = await box(page, c.button);
    await page.locator(c.button).click();
    await page.locator(`${c.button} [data-pending="busy"]`).waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const busy = await box(page, c.button);
    const loader = await page.locator(`${c.button} [data-loader]`).evaluate((el) => {
      const r = el.getBoundingClientRect(); const b = el.closest('button').getBoundingClientRect();
      const label = el.parentElement.firstElementChild;
      return { role: el.getAttribute('role'), name: el.getAttribute('aria-label'), w: r.width, h: r.height, inside: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom, labelOpacity: getComputedStyle(label).opacity, labelText: label.textContent.trim(), turning: !!el.querySelector('svg[data-door-live]') };
    });
    release(); await page.waitForTimeout(400); await ctx.unroute(c.route);
    const where = `${tag} ${c.url}`;
    assert.deepEqual([busy.x, busy.y, busy.w, busy.h], [rest.x, rest.y, rest.w, rest.h], `${where}: the pending button keeps exactly its resting size and place`);
    assert.equal(busy.opacity, '1', `${where}: pending, the pill keeps its full colour`);
    assert.equal(loader.role, 'status'); assert.equal(loader.name, c.label, `${where}: the loader is named for what is loading`);
    assert.ok(loader.w >= 28 && loader.h >= 28, `${where}: the door at 28px or more (${loader.w} by ${loader.h})`);
    assert.ok(loader.inside, `${where}: the door inside the pill`);
    assert.equal(loader.labelOpacity, '0', `${where}: the label hidden from sight`); assert.ok(loader.labelText.length > 0, `${where}: the label kept for screen readers`);
    assert.ok(loader.turning, `${where}: the door is turning`);
    out.push(`${c.url} ${Math.round(rest.w)} by ${Math.round(rest.h)}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`  ${tag} pending buttons keep their size: ${out.join(', ')}`);
}

// 2. App start.
async function appStart(browser, tag) {
  // Ready at once: sign in.
  {
    const { ctx, page, errors } = await context(browser, { app: true });
    await page.goto('/signin', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__NEXT_HYDRATED === true && window.__rlWatch.lifted !== null, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ ...window.__rlWatch, hydratedAt: window.__NEXT_HYDRATED_AT, travel: undefined }));
    assert.equal(w.shown, true, `${tag} sign in: the opening screen shows from first paint in the installed app`);
    assert.equal(w.faded, null, `${tag} sign in: ready before the first swing completes, so no fade`);
    assert.ok(w.lifted - w.hydratedAt <= 34, `${tag} sign in: gone within two frames of the page being ready (${(w.lifted - w.hydratedAt).toFixed(1)}ms)`);
    // Once a session: the next load in the same app session never shows it.
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__rlWatch.shown), false, `${tag} sign in: once a session`);
    assert.deepEqual(errors, []);
    await ctx.close();
    // Not installed: never shown.
    const web = await context(browser);
    await web.page.goto('/signin', { waitUntil: 'load' }); await web.page.waitForTimeout(500);
    assert.equal(await web.page.evaluate(() => window.__rlWatch.shown), false, `${tag} sign in in a browser tab: no opening screen`);
    await web.ctx.close();
    console.log(`  ${tag} app start, ready screen: gone ${(w.lifted - w.hydratedAt).toFixed(1)}ms after hydration, no fade`);
  }
  // Slow: the admin CRM, its request held 2.5s.
  {
    const { ctx, page, errors } = await context(browser, { app: true, admin: true });
    await ctx.route('**/api/admin/crm', async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue(); });
    await page.goto('/admin/crm', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__rlWatch && window.__rlWatch.lifted !== null, null, { timeout: 60000 });
    const w = await page.evaluate(() => window.__rlWatch);
    const moves = (who) => new Set((w.start || []).filter((s) => s[2] === who).map((s) => s[1])).size;
    assert.equal(w.shown, true, `${tag} CRM: the opening screen shows`);
    assert.ok(w.hadBusy && w.busyGone !== null, `${tag} CRM: the CRM loaded behind it`);
    assert.ok(moves('react') > 1, `${tag} CRM: the door turns once React runs`);
    assert.ok(w.faded !== null && w.faded - w.busyGone <= 34, `${tag} CRM: the fade starts the moment the screen is ready (${(w.faded - w.busyGone).toFixed(1)}ms)`);
    assert.ok(w.lifted - w.busyGone <= DOOR.appStart.fadeMs + 50, `${tag} CRM: gone within the fade (${(w.lifted - w.busyGone).toFixed(1)}ms, fade ${DOOR.appStart.fadeMs}ms)`);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(`  ${tag} app start, slow screen: fade began ${(w.faded - w.busyGone).toFixed(1)}ms and ended ${(w.lifted - w.busyGone).toFixed(1)}ms after the CRM was ready; door frames before React ${moves('player')}, after ${moves('react')}`);
  }
}

// 3. The homepage header swings once.
async function home(browser, tag) {
  const { ctx, page, errors } = await context(browser);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(DOOR.homeDelayMs + DOOR.defaults.swingMs + 1200);
  // Scroll down and back, and wait: nothing starts.
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 1600); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  const w = await page.evaluate(() => ({ travel: window.__rlWatch.travel, loadAt: window.__rlWatch.loadAt }));
  const runs = []; let cur = null;
  for (const [t, v] of w.travel) { if (v > 0 && !cur) { cur = { from: t, to: t, max: v }; runs.push(cur); } else if (v > 0) { cur.to = t; cur.max = Math.max(cur.max, v); } else cur = null; }
  assert.equal(runs.length, 1, `${tag} home: exactly one swing (${runs.length})`);
  const delay = runs[0].from - w.loadAt;
  assert.ok(delay >= DOOR.homeDelayMs - 50 && delay <= DOOR.homeDelayMs + 250, `${tag} home: it starts about ${DOOR.homeDelayMs}ms after the page loads (${delay.toFixed(0)}ms)`);
  assert.ok(runs[0].max > 0.98, `${tag} home: open and shut (${runs[0].max})`);
  assert.ok(runs[0].to - runs[0].from <= DOOR.defaults.swingMs + 50, `${tag} home: one swing long`);
  assert.equal(w.travel[w.travel.length - 1][1], 0, `${tag} home: at rest after the swing and the scrolls`);
  // The same visit: a reload keeps it still.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(DOOR.homeDelayMs + DOOR.defaults.swingMs + 800);
  const again = await page.evaluate(() => window.__rlWatch.travel.filter(([, v]) => v > 0).length);
  assert.equal(again, 0, `${tag} home: never again on that visit`);
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`  ${tag} home: one swing, ${delay.toFixed(0)}ms after load, ${(runs[0].to - runs[0].from).toFixed(0)}ms long; none on scroll; none after a reload`);
}

async function walk(browserType, launch, tag) {
  await warm();
  const browser = await browserType.launch(launch);
  try {
    await pending(browser, tag);
    await appStart(browser, tag);
    await home(browser, tag);
  } finally { await browser.close(); }
}

test('the door in the product in WebKit', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
