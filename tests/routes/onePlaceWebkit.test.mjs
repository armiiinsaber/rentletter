// The dashboard as one place, walked for real in WebKit (Safari's engine) and in Chrome on the fake
// stack (tests/helpers/fakeNextServer.mjs), at 1440 and at 390:
//   a. At 1440, across Circle, Profile, Pipeline, Shared with you, Listings, a listing, the logo and
//      the browser's back and forward: the sidebar and the bell and avatar at the top right hold the
//      same box in every frame, the sidebar never leaves the screen (not even behind a Loader), no
//      view transition starts, the frame never marks a direction, and the page never animates.
//   b. The place tapped is marked in the same moment as the tap, before its screen arrives.
//   c. New listing opens its panel over the view it was tapped on (Circle, Profile, a listing, the
//      dashboard): the address stays, and at 1440 the sidebar and the view behind keep their boxes,
//      scrolled or not, and the page never scales back; Escape closes it where it was.
//   d. The place already on view does nothing: no route, no data request, no scroll, the same nodes.
//   e. Back and forward move between the views, each at its own address.
//   f. At 390 no transition between Listings and Circle; into a listing and back out still pushes
//      and goes back.
// Each database call waits 60ms on the fake stack, so a screen not seen recently shows its Loader
// first (DOOR.loaderDelayMs, lib/motion.js), which is drawn inside the shell
// (components/nav/RouteLoader.js). The pages are served from the run's one production build
// (tests/helpers/fakeBuild.mjs), in this walk's own copy, on its own port, with service workers
// blocked, and no request leaves the browser for a supabase.co host (tests/helpers/noSupabase.mjs).
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3192; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await fakeBuild(PORT); // one build a run, copied to this walk's own folder (tests/helpers/fakeBuild.mjs)
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '60'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/circle', '/profile', '/listing/L1']) await fetch(`${BASE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

// Everything that would show the frame moving something, watched from inside the page in every
// frame: the sidebar's box (and any frame without it), the avatar's box at the top right, view
// transitions, the frame's direction mark, the page's own animations and transform, route changes.
const WATCH = () => {
  const w = { frames: 0, side: new Set(), avatar: new Set(), noSide: 0, vt: 0, nav: 0, moved: 0, routes: 0, loaders: 0 };
  const r = window.next && window.next.router;
  if (r && r.events) r.events.on('routeChangeStart', () => { w.routes++; });
  if (typeof document.startViewTransition === 'function') { const real = document.startViewTransition.bind(document); document.startViewTransition = (cb) => { w.vt++; return real(cb); }; }
  new MutationObserver(() => { if (document.documentElement.dataset.nav) w.nav++; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] });
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
  const root = document.getElementById('__next');
  const tick = () => {
    w.frames++;
    const side = vis('[data-shell-side]');
    if (!side) w.noSide++; else { const b = side.getBoundingClientRect(); w.side.add([b.left, b.top, b.width, b.height].map(Math.round).join(',')); }
    const av = vis('.rl-hdr-avatar');
    if (av) { const b = av.getBoundingClientRect(); w.avatar.add([b.right, b.top + window.scrollY].map(Math.round).join(',')); }
    const cs = getComputedStyle(root);
    if (root.getAnimations().length || cs.transform !== 'none' || (cs.scale && cs.scale !== 'none' && cs.scale !== '1')) w.moved++;
    if (document.querySelector('[data-route-loading]')) w.loaders++;
    w.raf = requestAnimationFrame(tick);
  };
  w.raf = requestAnimationFrame(tick);
  window.__onePlace = w;
};
const READ = () => { const w = window.__onePlace; return { frames: w.frames, side: [...w.side], avatar: [...w.avatar], noSide: w.noSide, vt: w.vt, nav: w.nav, moved: w.moved, routes: w.routes, loaders: w.loaders }; };
const marked = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length && e.getAttribute('aria-current') === 'page').map((e) => e.getAttribute('data-shell-place') || e.getAttribute('data-nav')), sel);
const at = (page) => page.evaluate(() => window.location.pathname + window.location.search);
const landed = async (page, url, sel) => { await page.waitForFunction((u) => window.location.pathname + window.location.search === u, url, { timeout: 15000 }); await page.locator(sel).first().waitFor({ timeout: 30000 }); await page.waitForFunction(() => !document.querySelector('[data-route-loading]'), null, { timeout: 30000 }); await page.waitForTimeout(250); };
// Each screen's own content, so a screen is known to be on view.
const SHOWS = { '/dashboard': '[data-listings-table]', '/dashboard?view=pipeline': '#people', '/dashboard?view=shared': '.hv[data-view="shared"] [data-shared-with-me], .hv[data-view="shared"] [data-shared-empty]', '/circle': '[data-circle-list], [data-circle-empty]', '/profile': '[data-invite-realtor]', '/listing/L1': 'section.rl-card h1' };
// Clicks a place in the sidebar and reads which place is marked in the first frame drawn after the
// click (an animation frame callback runs before that frame is painted).
const clickPlace = (page, key) => page.evaluate(async (k) => {
  const el = [...document.querySelectorAll(`[data-shell-place="${k}"]`)].find((e) => e.getClientRects().length);
  el.click();
  await new Promise((r) => requestAnimationFrame(r));
  return [...document.querySelectorAll('[data-shell-place]')].filter((e) => e.getClientRects().length && e.getAttribute('aria-current') === 'page').map((e) => e.getAttribute('data-shell-place'));
}, key);
// Nothing at all: no route, no data request, no scroll, the same nodes, the same place marked.
const NOTHING_START = () => {
  const n = { routes: 0, y: window.scrollY, ys: new Set(), node: document.querySelector('#__next [data-shell]'), data: performance.getEntriesByType('resource').filter((e) => /\/_next\/data\//.test(e.name)).length };
  const r = window.next && window.next.router; if (r && r.events) r.events.on('routeChangeStart', () => { n.routes++; });
  const f = () => { n.ys.add(Math.round(window.scrollY)); n.raf = requestAnimationFrame(f); }; n.raf = requestAnimationFrame(f);
  window.__nothing = n;
};
const NOTHING_READ = () => { const n = window.__nothing; cancelAnimationFrame(n.raf); return { routes: n.routes, ys: [...n.ys], same: n.node === document.querySelector('#__next [data-shell]'), data: performance.getEntriesByType('resource').filter((e) => /\/_next\/data\//.test(e.name)).length - n.data, url: window.location.pathname + window.location.search }; };
async function nothing(page, tag, act, url) {
  await page.evaluate(NOTHING_START);
  await act();
  await page.waitForTimeout(700);
  const n = await page.evaluate(NOTHING_READ);
  assert.deepEqual({ routes: n.routes, data: n.data, same: n.same, url: n.url }, { routes: 0, data: 0, same: true, url }, `${tag}: nothing happens (${JSON.stringify(n)})`);
  assert.equal(n.ys.length, 1, `${tag}: no scroll (${n.ys.join(', ')})`);
}
// The boxes behind a panel: the sidebar and the view's heading, in the window.
const behind = (page) => page.evaluate(() => {
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
  const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width].map(Math.round).join(','); };
  const root = getComputedStyle(document.getElementById('__next'));
  return { side: b(vis('[data-shell-side]')), head: b(vis('#__next main h1, #__next .ds-main h1, #__next .ds-main h2')), avatar: b(vis('.rl-hdr-avatar')), scale: root.scale || 'none', transform: root.transform };
});

async function desk(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await landed(page, '/dashboard', SHOWS['/dashboard']);
    await page.evaluate(WATCH);
    // a, b, e: every main section, each tap marked at once, each at its own address.
    const route = [['circle', '/circle'], ['profile', '/profile'], ['pipeline', '/dashboard?view=pipeline'], ['shared', '/dashboard?view=shared'], ['circle', '/circle'], ['listings', '/dashboard']];
    for (const [key, url] of route) {
      const now = await clickPlace(page, key);
      assert.deepEqual(now, [key], `${tag} b: ${key} is marked the moment it is clicked (${JSON.stringify(now)})`);
      await landed(page, url, SHOWS[url]);
      assert.equal(await at(page), url, `${tag} e: ${key} at its own address`);
      assert.deepEqual(await marked(page, '[data-shell-place]'), [key], `${tag}: ${key} marked once it is on view`);
    }
    // Into a listing and back out with the sidebar's Listings, and the logo from the listing.
    await page.locator('[data-listings-table] [data-listing-row="L1"] .lt-link').first().click();
    await landed(page, '/listing/L1', SHOWS['/listing/L1']);
    assert.deepEqual(await marked(page, '[data-shell-place]'), ['listings'], `${tag}: a listing marks Listings`);
    await page.locator('[data-shell-side] a.rl-mark').click();
    await landed(page, '/dashboard', SHOWS['/dashboard']);
    // e: the browser's back and forward through the views.
    for (const [dir, url] of [['back', '/listing/L1'], ['back', '/dashboard'], ['back', '/circle'], ['back', '/dashboard?view=shared'], ['forward', '/circle'], ['forward', '/dashboard']]) {
      if (dir === 'back') await page.goBack(); else await page.goForward();
      await landed(page, url, SHOWS[url]);
      assert.equal(await at(page), url, `${tag} e: ${dir} to ${url}`);
    }
    const w = await page.evaluate(READ);
    assert.ok(w.frames > 30 && w.routes >= 12, `${tag}: watched every navigation (${JSON.stringify(w)})`);
    assert.ok(w.loaders > 0, `${tag}: a Loader showed at least once, so its frame was walked too (${w.loaders})`);
    assert.equal(w.noSide, 0, `${tag} a: the sidebar was on screen in every frame (${w.noSide} without it)`);
    assert.equal(w.side.length, 1, `${tag} a: the sidebar never moved (${w.side.join(' | ')})`);
    assert.equal(w.avatar.length, 1, `${tag} a: the avatar at the top right never moved (${w.avatar.join(' | ')})`);
    assert.deepEqual({ vt: w.vt, nav: w.nav, moved: w.moved }, { vt: 0, nav: 0, moved: 0 }, `${tag} a: no transition, no direction, nothing animated`);

    // c: New listing over the view, at the top and scrolled.
    for (const url of ['/circle', '/profile', '/listing/L1', '/dashboard']) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' }); await landed(page, url, SHOWS[url]);
      for (const y of [0, 600]) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y); await page.waitForTimeout(300);
        const before = await behind(page); const sy = await page.evaluate(() => window.scrollY);
        await page.locator('[data-shell-new]').click();
        await page.locator('.lf-panel').waitFor({ timeout: 15000 }); await page.waitForTimeout(600);
        const open = await behind(page);
        assert.equal(await at(page), url, `${tag} c: ${url}, the address stays`);
        assert.deepEqual(open, before, `${tag} c: ${url} scrolled ${sy}, nothing behind the panel moved`);
        await page.keyboard.press('Escape');
        await page.locator('.lf-panel').waitFor({ state: 'detached', timeout: 15000 }); await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.scrollY), sy, `${tag} c: ${url}, where it was`);
        assert.deepEqual(await behind(page), before, `${tag} c: ${url}, the view as it was`);
      }
    }

    // d: the place already on view, and the logo on Listings at the top.
    for (const [url, key] of [['/circle', 'circle'], ['/profile', 'profile'], ['/dashboard?view=pipeline', 'pipeline'], ['/dashboard?view=shared', 'shared'], ['/dashboard', 'listings']]) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' }); await landed(page, url, SHOWS[url]);
      await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' })); await page.waitForTimeout(200);
      await nothing(page, `${tag} d: ${key} on ${url}`, () => page.locator(`[data-shell-place="${key}"]`).click(), url);
      assert.deepEqual(await marked(page, '[data-shell-place]'), [key], `${tag} d: ${key} still marked`);
    }
    noSupabaseLeft(ctx, `${tag} 1440`);
    assert.deepEqual(errors, [], `${tag}: no page error`);
  } finally { await ctx.close(); }
}

async function phone(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  const tab = (key) => page.evaluate(async (k) => {
    const el = [...document.querySelectorAll(`[data-main-nav] [data-nav="${k}"]`)].find((e) => e.getClientRects().length);
    el.click();
    await new Promise((r) => requestAnimationFrame(r));
    return [...document.querySelectorAll('[data-main-nav] [data-nav]')].filter((e) => e.getClientRects().length && e.getAttribute('aria-current') === 'page').map((e) => e.getAttribute('data-nav'));
  }, key);
  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('.dash-card[role=link]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__vt = [];
      const real = typeof document.startViewTransition === 'function' ? document.startViewTransition.bind(document) : null;
      if (real) document.startViewTransition = (cb) => { window.__vt.push(document.documentElement.dataset.nav || ''); return real(cb); };
      window.__slides = 0; const root = document.getElementById('__next');
      const f = () => { if (root.getAnimations().length) window.__slides++; requestAnimationFrame(f); }; requestAnimationFrame(f);
    });
    // f, b: Listings and Circle, no transition either way, each tab marked as it is tapped.
    assert.deepEqual(await tab('circle'), ['circle'], `${tag} b: Circle marked the moment it is tapped`);
    await landed(page, '/circle', SHOWS['/circle']);
    // d: Circle again does nothing.
    await nothing(page, `${tag} d: Circle on Circle`, () => page.locator('[data-main-nav] [data-nav="circle"]').click(), '/circle');
    assert.deepEqual(await tab('listings'), ['listings'], `${tag} b: Listings marked the moment it is tapped`);
    await landed(page, '/dashboard', '.dash-card[role=link]');
    assert.deepEqual(await page.evaluate(() => [window.__vt, window.__slides]), [[], 0], `${tag} f: no transition between Listings and Circle`);
    // e: back and forward between them.
    await page.goBack(); await landed(page, '/circle', SHOWS['/circle']);
    await page.goForward(); await landed(page, '/dashboard', '.dash-card[role=link]');
    assert.deepEqual(await page.evaluate(() => [window.__vt, window.__slides]), [[], 0], `${tag} f: none on back and forward either`);
    // f: into a listing and back out still pushes and goes back.
    await page.locator('.dash-card[role=link]').first().click();
    await page.locator('section.rl-card h1').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('a', { hasText: 'All listings' }).first().click();
    await landed(page, '/dashboard', '.dash-card[role=link]'); await page.waitForTimeout(300);
    const vt = await page.evaluate(() => window.__vt);
    if (await page.evaluate(() => typeof document.startViewTransition === 'function')) assert.deepEqual(vt, ['push', 'back'], `${tag} f: into a listing and back out`);
    else assert.ok(await page.evaluate(() => window.__slides) > 0, `${tag} f: the push without view transitions`);
    // c: New listing rises over the dashboard; the address stays.
    await page.locator('.dash-new').click(); await page.locator('.rl-sh-panel').waitFor({ timeout: 15000 });
    assert.equal(await at(page), '/dashboard', `${tag} c: the address stays`);
    noSupabaseLeft(ctx, `${tag} 390`);
    assert.deepEqual(errors, [], `${tag}: no page error`);
  } finally { await ctx.close(); }
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    await desk(browser, tag);
    await phone(browser, tag);
  } finally { await browser.close(); }
}

test('the dashboard as one place in WebKit at 1440 and 390', { timeout: 600000 }, async () => { requireWebkit(); await walk(pw.webkit, {}, 'wk'); });
test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
