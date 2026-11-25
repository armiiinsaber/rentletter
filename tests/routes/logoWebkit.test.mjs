// The Rentletter logo in the realtor dashboard, tapped for real in WebKit and in Chrome, each at 390
// by 844 with an iPhone user agent and at 1440 by 620 with a mouse (short enough that Listings scrolls), on the sandbox:
//   a. from a listing, the profile and the Circle it lands on the Listings view;
//   b. on Listings, scrolled down, it scrolls smoothly to the top with no route change and no reload;
//   c. on Listings at the top it does nothing: no route change, no reload, no transition, no
//      movement of the page and no request.
// Skipped when playwright-core or the browser binary is absent; the WebKit walk fails instead.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked: a production build registers one
// (lib/serviceWorker.js) that the dev server never did.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3184; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);

const HOME = `${BASE}/demo/dashboard`;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  // Stuck past the walk limit (devServer.mjs): the fake stack server goes with the file.
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await fakeBuild(PORT); // one build a run, copied to this walk's own folder (tests/helpers/fakeBuild.mjs)
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });
const warm = () => Promise.all(['/demo/dashboard', '/demo/dashboard?profile=1', '/demo/dashboard?circle=1', '/demo/dashboard?listing=demo-carlaw'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));

// The logo on screen: the header's on a phone, the sidebar's on a desktop.
const LOGO = 'a.rl-mark:visible';
const listingsShown = (page) => page.locator('[data-listings-view]:visible, [data-status-board]:visible').first().waitFor({ timeout: 30000 });

// Everything that would show the logo doing something, watched from inside the page: a route
// change, a view transition, the page leaving (a reload), the frame's direction mark, the page's
// box moving, every scroll position, and every request made after the watch starts.
const WATCH = () => {
  const w = { routes: 0, transitions: 0, nav: 0, moved: 0, ys: [], left: null, marker: Math.random() };
  window.__logoWatch = w;
  const r = window.next && window.next.router;
  if (r && r.events) { r.events.on('routeChangeStart', () => { w.routes++; }); r.events.on('hashChangeStart', () => { w.routes++; }); }
  if (typeof document.startViewTransition === 'function') { const real = document.startViewTransition.bind(document); document.startViewTransition = (cb) => { w.transitions++; return real(cb); }; }
  new MutationObserver(() => { if (document.documentElement.dataset.nav) w.nav++; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] });
  const root = document.getElementById('__next');
  w.left = root.getBoundingClientRect().left;
  const frame = () => { const b = root.getBoundingClientRect(); if (Math.abs(b.left - w.left) > 0.5 || root.getAnimations().length) w.moved++; w.ys.push(Math.round(window.scrollY)); w.raf = requestAnimationFrame(frame); };
  w.raf = requestAnimationFrame(frame);
  w.requests = performance.getEntriesByType('resource').length;
  return w.marker;
};
const READ = () => { const w = window.__logoWatch; return w ? { routes: w.routes, transitions: w.transitions, nav: w.nav, moved: w.moved, ys: w.ys, marker: w.marker, requests: performance.getEntriesByType('resource').length - w.requests, url: window.location.pathname + window.location.search } : null; };

async function walk(browserType, launch, viewport, phone) {
  await warm();
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext(phone ? { serviceWorkers: 'block', viewport, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { serviceWorkers: 'block', viewport, deviceScaleFactor: 1 });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  const press = (l) => (phone ? l.tap() : l.click());
  // A press where the logo is on screen now, with nothing scrolled first: Playwright's own tap and
  // click scroll their target into view, which on Listings would be the very scroll under test.
  const pressInPlace = async () => {
    const r = await page.evaluate((sel) => { const el = [...document.querySelectorAll(sel.replace(/:visible/g, ''))].find((e) => e.getClientRects().length); const b = el.getBoundingClientRect(); const top = Math.max(b.top, 0); return { x: b.left + b.width / 2, y: top + (Math.min(b.bottom, window.innerHeight) - top) / 2, shown: b.bottom - top }; }, LOGO);
    assert.ok(r.shown >= 4, `the logo is on screen where it is pressed (${JSON.stringify(r)})`);
    if (phone) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y);
  };
  try {
    // c. Listings at the top: the logo does nothing at all.
    await page.goto(HOME, { waitUntil: 'networkidle' });
    await listingsShown(page);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'the walk starts at the top');
    const marker = await page.evaluate(WATCH);
    await pressInPlace();
    await page.waitForTimeout(1200);
    const c = await page.evaluate(READ);
    assert.ok(c, 'c: the page is the same page (no reload)');
    assert.equal(c.marker, marker, 'c: no reload');
    assert.equal(c.routes, 0, 'c: no route change');
    assert.equal(c.transitions, 0, 'c: no view transition');
    assert.equal(c.nav, 0, 'c: the frame never marked a navigation');
    assert.equal(c.moved, 0, 'c: the page never moved');
    assert.ok(c.ys.every((y) => y === 0), `c: no scroll at all (${[...new Set(c.ys)].join(', ')})`);
    assert.equal(c.requests, 0, 'c: no request');
    assert.equal(c.url, '/demo/dashboard', 'c: the address is unchanged');

    // b. Listings scrolled down: a smooth scroll to the top, nothing else. On a desktop the sidebar's
    // logo stays on screen however far down the page is; on a phone the header scrolls away with
    // the page, so the logo can be pressed only while some of it still shows.
    const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    assert.ok(height > 200, `b: the page is tall enough to scroll (${height})`);
    const from = phone ? 40 : Math.min(height, 900);
    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), from);
    await page.waitForTimeout(400);
    const marker2 = await page.evaluate(WATCH);
    await pressInPlace();
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const b = await page.evaluate(READ);
    assert.equal(b.marker, marker2, 'b: no reload');
    assert.equal(b.routes, 0, 'b: no route change');
    assert.equal(b.transitions, 0, 'b: no view transition');
    assert.equal(b.nav, 0, 'b: the frame never marked a navigation');
    assert.equal(b.url, '/demo/dashboard', 'b: the address is unchanged');
    const between = b.ys.filter((y) => y > 0 && y < from - 1);
    assert.ok(between.length >= (phone ? 1 : 2), `b: the scroll passed through the positions between, smoothly (${[...new Set(b.ys)].slice(0, 12).join(', ')})`);
    assert.equal(b.ys[b.ys.length - 1], 0, 'b: it ends at the top');

    // a. Any other view: the logo lands on Listings.
    for (const view of ['?listing=demo-carlaw', '?profile=1', '?circle=1']) {
      await page.goto(`${HOME}${view}`, { waitUntil: 'networkidle' });
      const logo = page.locator(LOGO).first();
      await logo.waitFor({ timeout: 30000 });
      await page.waitForTimeout(300);
      const onHome = (u) => u.pathname === '/demo/dashboard' && !u.search;
      await press(logo);
      try { await page.waitForURL(onHome, { timeout: 10000 }); }
      catch (e) { await page.locator(LOGO).first().waitFor({ timeout: 30000 }); await press(page.locator(LOGO).first()); await page.waitForURL(onHome, { timeout: 30000 }); }
      await listingsShown(page);
    }
    noSupabaseLeft(ctx, phone ? 'phone' : 'desk');
  } finally { await browser.close(); }
}

test('the logo in WebKit at 390 by 844 with an iPhone user agent, and at 1440 by 620: a, b and c', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, { width: 390, height: 844 }, true);
  await walk(pw.webkit, {}, { width: 1440, height: 620 }, false);
});

test('the same logo walk in Chrome at 390 and at 1440', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  await walk(pw.chromium, { executablePath: chromeBin }, { width: 390, height: 844 }, true);
  await walk(pw.chromium, { executablePath: chromeBin }, { width: 1440, height: 620 }, false);
});
