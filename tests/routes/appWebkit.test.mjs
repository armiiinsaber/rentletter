// The installable realtor app and the one wordmark, in WebKit (Safari's engine) and in Chrome, at
// 390 by 844 with an iPhone user agent, on the sandbox:
//   1. The realtor surfaces carry the app head (manifest, iOS tags, touch icon, launch images); the
//      manifest, the icons, the service worker and the offline page are served; tenant and landlord
//      pages carry none of it.
//   2. In standalone (navigator.standalone, as iOS sets it in the installed app) every realtor screen
//      has its own way back or forward, and the walk takes each one: the header logo, All
//      listings, Dashboard, Back to ranked list, Cancel, Keep it, Close, and the links between the
//      sign in screens. No install hint in standalone.
//   3. The hint: in iOS Safari on the dashboard until dismissed once on this device; never on a
//      tenant or landlord page; never in another browser.
//   4. The logo is the vector Wordmark on every page type, the header one inside a 44px link, and
//      the old wordmark (the word at weight 800) renders nowhere.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked: a production build registers one
// (lib/serviceWorker.js) that the dev server never did.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3180; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
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

const DEMO = '/demo/dashboard';
const LISTING = '/demo/dashboard?listing=demo-carlaw';
const warm = () => Promise.all(['/signin', '/signup', '/forgot-password', DEMO, '/apply/demo0000000000000001', '/r/demo-demo-carlaw', '/'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));

async function context(browser, { standalone = false, ua = UA_PHONE, width = 390 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', baseURL: BASE, viewport: { width, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await blockSupabase(ctx);
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); });
  return ctx;
}
const open = async (page, url) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
const tap = async (page, locator) => { const l = locator.first(); await l.scrollIntoViewIfNeeded(); await l.click(); await page.waitForTimeout(500); };
const path = (page) => { const u = new URL(page.url()); return `${u.pathname}${u.search}`; };

async function headAndAssets(browser, tag) {
  const ctx = await context(browser); const page = await ctx.newPage();
  try {
    for (const url of ['/signin', DEMO]) {
      await open(page, url);
      const head = await page.evaluate(() => ({
        manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
        capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
        status: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.content,
        title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
        touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
        splash: document.querySelectorAll('link[rel=apple-touch-startup-image]').length,
        favicon: [...document.querySelectorAll('link[rel=icon]')].map((l) => l.getAttribute('href')),
      }));
      assert.deepEqual(head, { manifest: '/manifest.webmanifest', capable: 'yes', status: 'default', title: 'Rentletter', touch: '/icons/apple-touch-icon.png', splash: 11, favicon: ['/favicon.ico', '/icons/favicon-32.png', '/icons/favicon-16.png'] }, `${tag}: the app head on ${url}`);
    }
    const man = await (await page.request.get('/manifest.webmanifest')).json();
    assert.equal(man.start_url, '/dashboard'); assert.equal(man.short_name, 'Rentletter');
    for (const u of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/favicon.ico', '/sw.js', '/offline.html', '/splash/splash-1170x2532.png', '/brand/rentletter-logo-email.png']) assert.equal((await page.request.get(u)).status(), 200, `${tag}: ${u}`);
    assert.match(await (await page.request.get('/offline.html')).text(), /You're offline\. Rentletter will reconnect on its&nbsp;own\./);
    // Every page a realtor can add to the Home Screen links the manifest and the 180 touch icon in the
    // server rendered head (what iOS reads when it adds); no tenant or landlord page does.
    const MANIFEST = '<link rel="manifest" href="/manifest.webmanifest"'; const TOUCH = '<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png"';
    for (const url of ['/', '/faq', '/compliance', '/signin', '/signup', '/forgot-password', '/join/not-a-code']) {
      const html = await (await page.request.get(url)).text();
      assert.ok(html.includes(MANIFEST) && html.includes(TOUCH) && html.includes('<meta name="apple-mobile-web-app-title" content="Rentletter"'), `${tag}: ${url} links the manifest, the 180 icon and the app title`);
    }
    for (const url of ['/apply/demo0000000000000001', '/upload/demo0000000000000000000000000000', '/my-application', '/my-application/DEMO', '/keep/demo-token-0001', '/r/demo-demo-carlaw', '/ref/demo-ref-expired']) {
      const html = await (await page.request.get(url)).text();
      assert.ok(!html.includes('rel="manifest"') && !html.includes('rel="apple-touch-icon"'), `${tag}: ${url} carries no manifest and no touch icon`);
    }
    for (const url of ['/apply/demo0000000000000001', '/r/demo-demo-carlaw', '/my-application/DEMO']) {
      const p = await ctx.newPage(); // a fresh page each: the report page settles its own URL after load
      await open(p, url);
      assert.equal(await p.locator('link[rel=manifest]').count(), 0, `${tag}: no app head on ${url}`);
      assert.equal(await p.locator('[data-install-hint]').count(), 0, `${tag}: no hint on ${url}`);
      await p.close();
    }
    noSupabaseLeft(ctx, tag);
  } finally { await ctx.close(); }
}

async function standaloneWays(browser, tag) {
  const ctx = await context(browser, { standalone: true }); const page = await ctx.newPage();
  const took = [];
  const way = async (label, fn) => { await fn(); took.push(label); };
  try {
    await open(page, DEMO);
    assert.equal(await page.evaluate(() => navigator.standalone), true);
    assert.equal(await page.locator('[data-install-hint]').count(), 0, `${tag}: no hint in the installed app`);
    const mark = page.locator('a.rl-mark').first();
    assert.equal(await mark.getAttribute('href'), DEMO, `${tag}: the header logo goes home`);
    assert.ok((await mark.boundingBox()).height >= 44, `${tag}: the header logo is a 44px target`);
    await way('dashboard: a listing card, forward', async () => { await tap(page, page.locator('[data-listing-card] .lc-link', { hasText: 'Carlaw' })); assert.match(path(page), /listing=demo-carlaw/); });
    await way('listing: All listings, back', async () => { await tap(page, page.getByRole('link', { name: /All listings/ })); assert.equal(path(page), DEMO); });
    await open(page, LISTING);
    await way('listing: the header logo, home', async () => { await tap(page, page.locator('a.rl-mark:visible')); assert.equal(path(page), DEMO); });
    await open(page, LISTING);
    await way('compare: Back to ranked list', async () => { await tap(page, page.getByRole('button', { name: /^Compare$/ })); await tap(page, page.getByRole('button', { name: /Back to ranked list/ })); assert.equal(await page.getByRole('button', { name: /Back to ranked list/ }).count(), 0); });
    await way('set aside sheet: Cancel', async () => {
      await tap(page, page.locator('[role=button][aria-controls]').filter({ hasText: 'David Kowalski' }));
      await tap(page, page.getByRole('button', { name: /^Set aside$/ })); await tap(page, page.locator('.rl-modal').getByRole('button', { name: 'Cancel' }));
      assert.equal(await page.locator('.rl-modal').count(), 0);
    });
    await way('document viewer: Close', async () => { await tap(page, page.getByRole('button', { name: /^View / })); await tap(page, page.getByRole('button', { name: /^Close$/ })); assert.equal(await page.getByRole('button', { name: /^Close$/ }).count(), 0); });
    await way('rented sheet: Cancel', async () => {
      if (!(await page.getByRole('button', { name: /Mark as rented/ }).count())) await tap(page, page.getByRole('button', { name: /^Details/ }));
      await tap(page, page.getByRole('button', { name: /Mark as rented/ })); await tap(page, page.locator('[role=alertdialog]').getByRole('button', { name: 'Cancel' }));
      assert.equal(await page.locator('[role=alertdialog]').count(), 0);
    });
    await way('delete sheet: Keep it', async () => { await tap(page, page.getByRole('button', { name: /Delete listing/ })); await tap(page, page.locator('[role=alertdialog]').getByRole('button', { name: /Keep it|Cancel/ })); assert.equal(await page.locator('[role=alertdialog]').count(), 0); });
    await open(page, DEMO);
    await way('new listing: Cancel', async () => { await tap(page, page.getByRole('button', { name: /New listing|Add your first listing/ })); await tap(page, page.getByRole('button', { name: /^Cancel$/ })); assert.equal(await page.getByText('New listing', { exact: true }).filter({ visible: true }).count() <= 1, true); });
    await way('the bell panel: Close', async () => { await tap(page, page.getByRole('button', { name: /^Next,/ })); await tap(page, page.locator('[role=dialog]').getByRole('button', { name: 'Close' })); assert.equal(await page.locator('[role=dialog]').count(), 0); });
    // The phone's way to the profile: the tab bar's Profile (feat/dashboard-2026; the header's avatar is on screens with no tab bar).
    await way('profile: Dashboard, back', async () => { await tap(page, page.locator('[data-main-nav] [data-nav="profile"]')); assert.match(path(page), /profile=1/); await tap(page, page.getByRole('link', { name: /^Dashboard$/ })); assert.equal(path(page), DEMO); });
    await open(page, '/signin');
    await way('sign in: Create an account, forward', async () => { await tap(page, page.getByRole('link', { name: 'Create an account' })); assert.equal(path(page), '/signup'); });
    await way('sign up: Sign in, back', async () => { await tap(page, page.getByRole('link', { name: 'Sign in' })); assert.equal(path(page), '/signin'); });
    await way('forgot password: Back to sign in', async () => { await tap(page, page.getByRole('link', { name: /Forgot your password/ })); assert.equal(path(page), '/forgot-password'); await tap(page, page.getByRole('link', { name: 'Back to sign in' })); assert.equal(path(page), '/signin'); });
    console.log(`${tag}: ways taken in standalone:\n  ${took.join('\n  ')}`);
    assert.equal(took.length, 14);
    noSupabaseLeft(ctx, tag);
  } finally { await ctx.close(); }
}

async function hint(browser, tag) {
  const ctx = await context(browser); const page = await ctx.newPage();
  try {
    await open(page, DEMO);
    const card = page.locator('[data-install-hint]');
    await card.waitFor({ timeout: 10000 });
    assert.equal((await card.innerText()).replace(/\s+/g, ' ').trim(), 'Add Rentletter to your Home Screen. Tap Share, then Add to Home Screen. Dismiss');
    await tap(page, card.getByRole('button', { name: 'Dismiss' }));
    assert.equal(await card.count(), 0, `${tag}: dismissed`);
    await open(page, DEMO);
    assert.equal(await card.count(), 0, `${tag}: remembered on this device`);
    noSupabaseLeft(ctx, tag);
  } finally { await ctx.close(); }
  const desk = await context(browser, { ua: UA_DESK }); const p2 = await desk.newPage();
  try { await open(p2, DEMO); assert.equal(await p2.locator('[data-install-hint]').count(), 0, `${tag}: not in another browser`); noSupabaseLeft(desk, tag); } finally { await desk.close(); }
}

async function wordmark(browser, tag) {
  for (const width of [390, 360]) {
    const ctx = await context(browser, { width });
    try {
      for (const url of ['/signin', DEMO, LISTING, '/', '/r/demo-demo-carlaw', '/apply/demo0000000000000001', '/my-application/DEMO', '/upload/demo0000000000000000000000000000']) {
        const page = await ctx.newPage();
        await open(page, url);
        const r = await page.evaluate(() => {
          const svg = document.querySelector('.rl-wordmark'); const b = svg ? svg.getBoundingClientRect() : null;
          const old = [...document.querySelectorAll('body *')].filter((el) => el.childElementCount === 0 && el.textContent.trim() === 'Rentletter' && Number(getComputedStyle(el).fontWeight) >= 800).length;
          const link = svg && svg.closest('a'); const lb = link ? link.getBoundingClientRect() : null;
          return { has: !!svg, label: svg && svg.getAttribute('aria-label'), w: b && Math.round(b.width * 10) / 10, h: b && Math.round(b.height * 10) / 10, linkH: lb && Math.round(lb.height), inside: b ? b.left >= 0 && b.right <= window.innerWidth : false, old };
        });
        assert.ok(r.has && r.label === 'Rentletter', `${tag} ${width}: the logo on ${url}`);
        assert.ok(r.inside, `${tag} ${width}: the logo inside the screen on ${url}`);
        assert.ok(r.linkH == null || r.linkH >= 44, `${tag} ${width}: a 44px target on ${url} (${r.linkH})`);
        assert.equal(r.old, 0, `${tag} ${width}: no old wordmark on ${url}`);
        if (url === DEMO) console.log(`${tag}: header logo at ${width}: ${r.w} by ${r.h} px`);
        await page.close();
      }
      noSupabaseLeft(ctx, `${tag} ${width}`);
    } finally { await ctx.close(); }
  }
}

async function walk(browserType, launch, tag) {
  await warm();
  const browser = await browserType.launch(launch);
  try { await headAndAssets(browser, tag); await standaloneWays(browser, tag); await hint(browser, tag); await wordmark(browser, tag); }
  finally { await browser.close(); }
}

test('the app and the wordmark in WebKit at 390 with an iPhone user agent', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
