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
//   e. At 1440 back and forward move between the views, each at its own address. At 390 the tabs
//      are roots (fix/phone-app-feel): switching tabs adds no history entry.
//   f. At 390 no transition between Listings and Circle; into a listing and back out still pushes
//      and goes back.
// And the glass (components/ui.js .rl-glass), on the floating layer only:
//   2a. The tenant's top bar (components/tenant/TenantBar.js) at the top of the page: solid, 69px;
//       scrolled: glass, still at the top, the phone's strength bar and chips under it and glass
//       too, the desktop's section menu and strength panel below it and never covered.
//   2b. The area behind a sheet, the bulk bar: glass.
//   2c. The homepage's navigation: solid at the top, glass once the page scrolls under it, fully
//       visible.
//   2d. Every piece of text, and every icon of a control, on glass keeps 4.5 to 1 over black and
//       over white.
//   2e. Reduced motion: no fade. Reduced transparency (Chrome) and the fallbacks' rules: solid.
//   2f. The bar at 390 and 320, with a field brought into view, before, during and after a sheet.
//   4b. Where we fit on the homepage, from 1024 to 2560: the black sentence line one and the grey
//       sentence line two, each whole on its line and centred.
//   3.  Your applications, three rows at 390, 320 and 1440: the address and the status pill on one
//       line (on a phone a long status goes right under the address rather than crush it; the
//       product's one pill, its text centred both ways), the date as text, the number in
//       the body face with Copy under it, the whole row opening the application.
//   2g. The frames while a long page scrolls under the glass (the tenant profile at 390 and 1440,
//       the homepage at 390 and 1440), against the same scroll with the glass taken off: at most
//       4ms more a frame at the median, 8ms at the 95th percentile.
//   5.  The canvas: the tenant profile, the dashboard and the homepage at 390 and 1440, and the
//       dashboard at 1920 and 2560, pulled up past their end as the bounce and a phone's bars do:
//       the bottom row of the window is the page's own background, never a band of another tone;
//       and on the dashboard from 1440 the page's own last row meets it with no step.
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
    // The bell, the header's control at the top right (the avatar is in the sidebar since feat/dashboard-2026).
    const av = vis('.rl-hdr-bellwrap');
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
const SHOWS = { '/dashboard': '[data-listing-cards]', '/dashboard?view=pipeline': '#people', '/dashboard?view=shared': '.hv[data-view="shared"] [data-shared-with-me], .hv[data-view="shared"] [data-shared-empty]', '/circle': '[data-circle-list], [data-circle-empty]', '/profile': '[data-invite-realtor]', '/listing/L1': 'section.rl-card h1' };
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
  return { side: b(vis('[data-shell-side]')), head: b(vis('#__next main h1, #__next .ds-main h1, #__next .ds-main h2')), avatar: b(vis('.rl-hdr-bellwrap')), scale: root.scale || 'none', transform: root.transform };
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
    await page.locator('[data-listing-card="L1"] .lc-link').first().click();
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
    await page.locator('[data-listing-card]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__vt = [];
      const real = typeof document.startViewTransition === 'function' ? document.startViewTransition.bind(document) : null;
      if (real) document.startViewTransition = (cb) => { window.__vt.push(document.documentElement.dataset.nav || ''); return real(cb); };
      window.__slides = 0; const root = document.getElementById('__next');
      const f = () => { if (root.getAnimations().length) window.__slides++; requestAnimationFrame(f); }; requestAnimationFrame(f);
    });
    // The history entry on view: how many there are, and its place (the Navigation API).
    const entry = () => page.evaluate(() => ({ length: history.length, index: typeof navigation !== 'undefined' && navigation.currentEntry ? navigation.currentEntry.index : null, url: window.location.pathname + window.location.search }));
    const first = await entry();
    // f, b: Listings and Circle, no transition either way, each tab marked as it is tapped.
    assert.deepEqual(await tab('circle'), ['circle'], `${tag} b: Circle marked the moment it is tapped`);
    await landed(page, '/circle', SHOWS['/circle']);
    // d: Circle again does nothing.
    await nothing(page, `${tag} d: Circle on Circle`, () => page.locator('[data-main-nav] [data-nav="circle"]').click(), '/circle');
    assert.deepEqual(await tab('listings'), ['listings'], `${tag} b: Listings marked the moment it is tapped`);
    await landed(page, '/dashboard', '[data-listing-card]');
    assert.deepEqual(await page.evaluate(() => [window.__vt, window.__slides]), [[], 0], `${tag} f: no transition between Listings and Circle`);
    // e: on a phone the tabs are roots (fix/phone-app-feel, components/nav/routes.js): Circle and
    // Listings took the same history entry, so a back never walks from one tab to the other.
    assert.deepEqual(await entry(), first, `${tag} e: switching tabs adds no history entry`);
    // f: into a listing and back out still pushes and goes back.
    await page.locator('[data-listing-card]').first().click();
    await page.locator('section.rl-card h1').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('a', { hasText: 'All listings' }).first().click();
    await landed(page, '/dashboard', '[data-listing-card]'); await page.waitForTimeout(300);
    const vt = await page.evaluate(() => window.__vt);
    if (await page.evaluate(() => typeof document.startViewTransition === 'function')) assert.deepEqual(vt, ['push', 'back'], `${tag} f: into a listing and back out`);
    else assert.ok(await page.evaluate(() => window.__slides) > 0, `${tag} f: the push without view transitions`);
    // c: New listing rises over the dashboard; the address stays.
    await page.locator('[data-tab-new]').click(); await page.locator('.rl-sh-panel').waitFor({ timeout: 15000 });
    assert.equal(await at(page), '/dashboard', `${tag} c: the address stays`);
    noSupabaseLeft(ctx, `${tag} 390`);
    assert.deepEqual(errors, [], `${tag}: no page error`);
  } finally { await ctx.close(); }
}

// ── The glass (components/ui.js .rl-glass) ─────────────────────────────────────────────────
// Every piece of text on a glass surface, against the glass laid over pure black and over pure
// white (the two ends of anything that can pass underneath; the fill, then any painted box of its
// own between the text and the glass): its contrast at the worse of the two.
const CONTRAST = () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = L(a); const y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const rgba = (str) => { const m = String(str).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const out = [];
  for (const g of document.querySelectorAll('.rl-glass')) {
    if (!g.getClientRects().length) continue;
    const glass = rgba(getComputedStyle(g).backgroundColor);
    for (const el of [g, ...g.querySelectorAll('*')]) {
      // Text, and the icon of a control (its stroke, or its fill); the wordmark is the logo, not a control's icon.
      const icon = el.tagName.toLowerCase() === 'svg' && !el.closest('.rl-mark, .rl-wordmark');
      if (!icon && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      let painted = null;
      for (let a = icon ? el.parentElement : el; a && a !== g; a = a.parentElement) { const b = rgba(getComputedStyle(a).backgroundColor); if (b && b[3] > 0) { painted = b; break; } }
      // An icon's colour is what its shapes draw: the first shape's stroke, else its fill.
      const drawn = icon ? [...el.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')].map((s) => getComputedStyle(s)).map((s) => rgba(s.stroke) || rgba(s.fill)).find(Boolean) : null;
      const fg = icon ? (drawn || rgba(getComputedStyle(el).color)) : rgba(getComputedStyle(el).color);
      const at = (backdrop) => { const base = over(glass, backdrop); return ratio(fg, painted ? over(painted, base) : base); };
      out.push({ text: icon ? `icon in ${(el.closest('a, button, [role]') || el.parentElement).textContent.trim().slice(0, 30) || el.parentElement.className}` : el.textContent.trim().slice(0, 40), ratio: Math.round(Math.min(at([0, 0, 0]), at([255, 255, 255])) * 100) / 100 });
    }
  }
  return out;
};
async function readable(page, tag) {
  const c = await page.evaluate(CONTRAST);
  const low = c.filter((x) => x.ratio < 4.5);
  assert.deepEqual(low, [], `${tag}: text on glass keeps 4.5 to 1 over black and over white (${JSON.stringify(c)})`);
  return c.length;
}
// A glass surface as it stands: its solid layer's opacity, whether it blurs, its box.
const SURFACE = (sel) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); if (!el) return null;
  const cs = getComputedStyle(el); const before = getComputedStyle(el, '::before'); const r = el.getBoundingClientRect();
  const filter = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
  return { solid: el.classList.contains('rl-glass-auto') ? Number(before.opacity) : 0, blur: /blur/.test(filter), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), fade: before.transitionDuration, scrolled: document.documentElement.hasAttribute('data-scrolled') };
};
const scrollTo = async (page, y) => { await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y); await page.waitForTimeout(500); };
// The frames of a long scroll, one step a frame: how long each frame took, in ms.
const FRAMES = () => new Promise((res) => {
  const ts = []; let y = 0; const max = document.documentElement.scrollHeight - window.innerHeight;
  const f = (t) => { ts.push(t); y += 40; window.scrollTo({ top: Math.min(y, max), behavior: 'instant' }); if (y < max && ts.length < 120) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res({ frames: d.length, median: Math.round(d[Math.floor(d.length / 2)] || 0), p95: Math.round(d[Math.floor(d.length * 0.95)] || 0) }); } };
  requestAnimationFrame(f);
});
const smooth = [];
// The same long scroll with the glass and then with it taken off the page: the glass may cost at
// most 4ms a frame at the median and 8ms at the 95th percentile. (Headless Chrome draws at most
// 30 frames a second however light the page, so a fixed bound would only measure that.)
async function frames(page, tag, label) {
  const on = await page.evaluate(FRAMES);
  await page.evaluate(() => { document.querySelectorAll('.rl-glass').forEach((e) => e.classList.remove('rl-glass')); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForTimeout(300);
  const off = await page.evaluate(FRAMES);
  smooth.push({ tag, page: label, on, off });
}
// ── 5. The canvas (components/ui.js, THE CANVAS) ───────────────────────────────────────────────
// The page pulled up past its end, the way the bounce and a phone's bars showing and hiding do:
// what shows under it is the canvas, and every pixel of the window's bottom row must be the page's
// own background. The tenant pages' deep paper used to end there over a paper canvas, a light band.
const BG = { paper: [250, 248, 243], deep: [242, 238, 227] };
// seam: the page's own last row, just above where the window runs past it, is the canvas's tone
// too, across the whole width, so nothing of the page's (a full height sidebar's deep paper) stops
// there as a band.
async function canvasAtEnd(page, tag, label, want, { seam = false } = {}) {
  const vp = page.viewportSize();
  const pull = Math.round(vp.height / 4);
  await page.evaluate((px) => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); document.body.style.transform = `translateY(-${px}px)`; }, pull);
  await page.waitForTimeout(200);
  const shots = [];
  try {
    shots.push(await page.screenshot({ clip: { x: 0, y: vp.height - 1, width: vp.width, height: 1 } }));
    if (seam) shots.push(await page.screenshot({ clip: { x: 0, y: vp.height - pull - 1, width: vp.width, height: 1 } }));
  } finally { await page.evaluate(() => { document.body.style.transform = ''; }); }
  const rowOf = (shot) => page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, 1).data; const px = []; for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]); return px;
  }, shot.toString('base64'));
  const row = await rowOf(shots[0]);
  const off = row.filter((p) => p.some((v, i) => Math.abs(v - want[i]) > 1));
  assert.ok(row.length >= vp.width && off.length === 0, `${tag} 5: ${label} at ${vp.width}, the bottom of the window is the page's background ${JSON.stringify(want)} (${off.length} of ${row.length} pixels differ, the first ${JSON.stringify(off[0])})`);
  if (!seam) return;
  const last = await rowOf(shots[1]);
  const step = last.map((p, x) => [x, p]).filter(([, p]) => p.some((v, i) => Math.abs(v - want[i]) > 2));
  assert.ok(last.length >= vp.width && step.length === 0, `${tag} 5: ${label} at ${vp.width}, the page's own last row meets the canvas with no step (${step.length} of ${last.length} pixels differ, the first at x ${step[0] && step[0][0]}: ${JSON.stringify(step[0] && step[0][1])})`);
}
async function tenantIn(ctx, page, who, query = 'docs=1') {
  const { token } = await fetch(`${BASE}/__fake/tenant?who=${who}&${query}`).then((r) => r.json());
  await page.goto(`${BASE}/my-application`, { waitUntil: 'networkidle' });
  await ctx.addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${BASE}/my-application`, { waitUntil: 'networkidle' });
  await page.locator('[data-tenant-bar]').waitFor({ timeout: 30000 });
  await page.locator('[data-vault-documents]').waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
}

async function glassPhone(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  try {
    await tenantIn(ctx, page, tag === 'wk' ? 31 : 32);
    // At the very top: solid, as it always was, 69px tall, the strength bar right under it.
    let bar = await page.evaluate(SURFACE, '[data-tenant-bar]'); let top = await page.evaluate(SURFACE, '[data-tp-top]');
    assert.deepEqual({ solid: bar.solid, blur: bar.blur, top: bar.top, height: bar.height, scrolled: bar.scrolled }, { solid: 1, blur: false, top: 0, height: 69, scrolled: false }, `${tag} 2a: the bar at the top is solid (${JSON.stringify(bar)})`);
    assert.equal(top.top, 69, `${tag} 2a: the strength bar starts under the top bar (${JSON.stringify(top)})`);
    // Scrolled: glass, still at the top, the strength bar and chips stuck right under it, glass too.
    await scrollTo(page, 700);
    bar = await page.evaluate(SURFACE, '[data-tenant-bar]'); top = await page.evaluate(SURFACE, '[data-tp-top]');
    assert.deepEqual({ solid: bar.solid, blur: bar.blur, top: bar.top, scrolled: bar.scrolled }, { solid: 0, blur: true, top: 0, scrolled: true }, `${tag} 2a: scrolled, the bar is glass at the top (${JSON.stringify(bar)})`);
    assert.deepEqual({ solid: top.solid, blur: top.blur, top: top.top }, { solid: 0, blur: true, top: 69 }, `${tag} 2b: the strength bar and chips stuck under it, glass (${JSON.stringify(top)})`);
    assert.ok(await readable(page, `${tag} 2d phone profile`) >= 3, `${tag}: the bar's text was read`);
    // A field brought into view (as a focus with the keyboard does) stops under both bars.
    const field = await page.evaluate(() => { const el = document.querySelector('[data-sign-in-email] input'); el.scrollIntoView({ block: 'start', behavior: 'instant' }); el.focus({ preventScroll: true }); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2); return { top: Math.round(r.top), clear: hit === el }; });
    const under = (await page.evaluate(SURFACE, '[data-tp-top]')).bottom;
    assert.ok(field.top >= under && field.clear, `${tag} 2f: the field is never under the bars (${JSON.stringify({ field, under })})`);
    // A sheet over the scrolled page: the bar never drops to where it sits in the page, in any
    // frame while the sheet rises, while it is up, or after it closes.
    await scrollTo(page, 900);
    await page.evaluate(() => { window.__bars = []; const f = () => { const b = document.querySelector('[data-tenant-bar]').getBoundingClientRect(); window.__bars.push(Math.round(b.top)); window.__barRaf = requestAnimationFrame(f); }; window.__barRaf = requestAnimationFrame(f); });
    await page.evaluate(() => document.querySelector('[data-strength-bar]').click()); // opens without scrolling the page
    await page.locator('[data-strength-sheet]').waitFor({ timeout: 15000 }); await page.waitForTimeout(600);
    const scrim = await page.evaluate(SURFACE, '.rl-sh-scrim');
    assert.ok(scrim && scrim.blur, `${tag} 2b: the area behind the sheet is the dim glass (${JSON.stringify(scrim)})`);
    await page.keyboard.press('Escape'); await page.locator('[data-strength-sheet]').waitFor({ state: 'detached', timeout: 15000 }); await page.waitForTimeout(500);
    const bars = await page.evaluate(() => { cancelAnimationFrame(window.__barRaf); return window.__bars; });
    assert.ok(bars.length > 10 && bars.every((y) => y >= 0 && y <= 32), `${tag} 2f: with a sheet open the bar stays at the top, only scaled back with the page (${[...new Set(bars)].join(', ')})`);
    assert.deepEqual(await page.evaluate(() => [Math.round(window.scrollY), document.querySelector('[data-tenant-bar]').style.translate || '', Math.round(document.querySelector('[data-tenant-bar]').getBoundingClientRect().top)]), [900, '', 0], `${tag} 2f: after the sheet, where it was`);
    // 320: the same bar, one row.
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(400);
    const narrow = await page.evaluate(() => { const b = document.querySelector('[data-tenant-bar]'); const r = b.getBoundingClientRect(); const out = [...b.children].filter((c) => c.getClientRects().length).map((c) => c.getBoundingClientRect()); return { height: Math.round(r.height), top: Math.round(r.top), inside: out.every((c) => c.left >= 0 && c.right <= 320 && c.top >= r.top && c.bottom <= r.bottom) }; });
    assert.deepEqual(narrow, { height: 69, top: 0, inside: true }, `${tag} 2f: at 320 one row of 69px`);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    await canvasAtEnd(page, tag, 'the tenant profile', BG.deep);
    await frames(page, tag, 'tenant profile 390');
    // The homepage at 390: its navigation's text over anything, the canvas, the frames under it.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await scrollTo(page, 800);
    assert.ok(await readable(page, `${tag} 2d homepage 390`) >= 1, `${tag}: the homepage navigation's text was read`);
    await canvasAtEnd(page, tag, 'the homepage', BG.paper);
    await frames(page, tag, 'homepage 390');
    // The dashboard at 390: the canvas.
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }); await page.locator('[data-listing-card]').first().waitFor({ timeout: 30000 });
    await canvasAtEnd(page, tag, 'the dashboard', BG.paper);
    noSupabaseLeft(ctx, `${tag} glass 390`);
  } finally { await ctx.close(); }
}

async function glassDesk(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  try {
    await tenantIn(ctx, page, tag === 'wk' ? 33 : 34);
    await scrollTo(page, 900);
    const bar = await page.evaluate(SURFACE, '[data-tenant-bar]');
    assert.deepEqual({ solid: bar.solid, blur: bar.blur, top: bar.top }, { solid: 0, blur: true, top: 0 }, `${tag} 2a: 1440 scrolled, glass at the top`);
    // The menu and the strength panel sit below it and are never covered.
    const beside = await page.evaluate(() => ['[data-tp-menu]', '.tp-aside'].map((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const first = el.querySelector('a, button, h2, .pp-percent') || el; const fr = first.getBoundingClientRect(); const hit = document.elementFromPoint(fr.left + 4, fr.top + Math.min(8, fr.height / 2)); return { s, top: Math.round(r.top), clear: !!hit && el.contains(hit) }; }));
    for (const b of beside) assert.ok(b.top >= bar.bottom && b.clear, `${tag} 2a: ${b.s} below the bar and never covered (${JSON.stringify({ b, bar })})`);
    await readable(page, `${tag} 2d desk profile`);
    await canvasAtEnd(page, tag, 'the tenant profile', BG.deep);
    await frames(page, tag, 'tenant profile 1440');
    // The homepage: solid at the very top, glass once it scrolls under, fully visible.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    let nav = await page.evaluate(SURFACE, '.lp-shell .rl-header');
    assert.deepEqual({ solid: nav.solid, blur: nav.blur }, { solid: 1, blur: false }, `${tag} 2c: the homepage navigation at the top is solid`);
    await scrollTo(page, 800);
    nav = await page.evaluate(SURFACE, '.lp-shell .rl-header');
    assert.deepEqual({ solid: nav.solid, blur: nav.blur, top: nav.top }, { solid: 0, blur: true, top: 0 }, `${tag} 2c: scrolled, the homepage navigation is glass`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lp-shell .rl-header')).opacity), '1', `${tag} 2c: and fully visible`);
    await readable(page, `${tag} 2d homepage`);
    // 4b: Where we fit, from 1024: the black sentence line one, the grey sentence line two, each
    // whole on its line and centred (the wrapped text walk holds every width to the rule).
    for (const width of [1024, 1280, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(300);
      const fit = await page.evaluate(() => [...document.querySelectorAll('[data-where-we-fit] .lp-fit-s')].map((s) => {
        const range = document.createRange(); range.selectNodeContents(s); const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        const box = s.parentElement.getBoundingClientRect(); const lines = new Set(rects.map((r) => Math.round(r.top))).size;
        const left = Math.min(...rects.map((r) => r.left)); const right = Math.max(...rects.map((r) => r.right));
        return { text: s.textContent, color: getComputedStyle(s).color, lines, off: Math.round(Math.abs((left - box.left) - (box.right - right))), inside: left >= box.left - 0.5 && right <= box.right + 0.5 };
      }));
      assert.deepEqual(fit.map((x) => x.text.replace(/\s/g, ' ')), ['A full background check on every applicant.', 'Read and organized, so you close sooner with confidence.'], `${tag} 4a at ${width}: the two sentences, in order`);
      assert.ok(fit.length === 2 && fit.every((x) => x.lines === 1 && x.off <= 2 && x.inside), `${tag} 4b at ${width}: each sentence whole on its line, centred (${JSON.stringify(fit)})`);
      assert.notEqual(fit[0].color, fit[1].color, `${tag} 4b at ${width}: black, then grey`);
    }
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(200);
    await canvasAtEnd(page, tag, 'the homepage', BG.paper);
    await frames(page, tag, 'homepage 1440');
    // The bulk bar: glass, stuck over the rows as the page scrolls.
    await fetch(`${BASE}/__fake/state?archive=1`);
    try {
      // Select on the cards (feat/dashboard-2026): the checkboxes, then the bar.
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }); await page.locator('[data-listing-cards]').first().waitFor({ timeout: 30000 });
      await page.locator('[data-select-mode]:visible').click();
      await page.locator('[data-card-check="L1"]').check(); await page.locator('[data-card-check="L2"]').check();
      await page.locator('[data-bulk-bar]').waitFor({ timeout: 15000 });
      const bulk = await page.evaluate(SURFACE, '[data-bulk-bar]');
      assert.ok(bulk.blur, `${tag} 2b: the bulk bar is glass (${JSON.stringify(bulk)})`);
      await readable(page, `${tag} 2d bulk bar`);
      await canvasAtEnd(page, tag, 'the dashboard', BG.paper, { seam: true });
    } finally { await fetch(`${BASE}/__fake/state?archive=0`); }
    // The dashboard in a large window (item 8 of feat/dashboard-2026): where the window runs past the
    // page, the canvas, and the page's own last row meeting it with no step. Before, the sidebar
    // painted deep paper from the window's left edge, full height, and a paper band showed under it.
    for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height }); await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.locator('[data-listing-cards]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
      await canvasAtEnd(page, tag, 'the dashboard', BG.paper, { seam: true });
    }
    noSupabaseLeft(ctx, `${tag} glass 1440`);
  } finally { await ctx.close(); }
}

// e. Reduced motion: the change from solid to glass is instant. Reduced transparency and no
// backdrop-filter: solid. Chrome can be told the reduced transparency preference; WebKit cannot,
// so there the rule itself is read from the page's own style sheets.
async function glassFallbacks(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    assert.equal((await page.evaluate(SURFACE, '.lp-shell .rl-header')).fade, '0s', `${tag} 2e: reduced motion, no fade`);
    const rules = await page.evaluate(() => {
      const found = { transparency: false, supports: false };
      const walk = (list, inMedia, inSupports) => { for (const r of list) {
        // A style rule first: with CSS nesting every style rule has a cssRules list of its own.
        if (r.selectorText !== undefined) {
          if (!/\.rl-glass\b/.test(r.selectorText)) continue;
          const solid = /var\(--glass-solid\)/.test(r.style.backgroundColor) || /var\(--glass-solid\)/.test(r.cssText);
          if (inMedia && solid && /none/.test(r.style.backdropFilter || r.style.webkitBackdropFilter || r.cssText)) found.transparency = true;
          if (inSupports && solid) found.supports = true;
        } else if (r.media && /prefers-reduced-transparency:\s*reduce/.test(r.media.mediaText)) walk(r.cssRules, true, inSupports);
        else if (r.conditionText !== undefined && /not\s*\(\(-webkit-backdrop-filter|not\s*\(\(backdrop-filter/.test(r.conditionText)) walk(r.cssRules, inMedia, true);
        else if (r.cssRules) walk(r.cssRules, inMedia, inSupports);
      } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules, false, false); } catch (e) { /* another origin */ } }
      return found;
    });
    assert.deepEqual(rules, { transparency: true, supports: true }, `${tag} 2e: the solid fallbacks are in the page's style`);
    if (tag === 'cr') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await scrollTo(page, 800);
      const solid = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.lp-shell .rl-header')); return { bg: cs.backgroundColor, filter: cs.backdropFilter || 'none' }; });
      assert.deepEqual(solid, { bg: 'rgb(250, 248, 243)', filter: 'none' }, `${tag} 2e: reduced transparency, solid`);
    }
  } finally { await ctx.close(); }
}

// ── 3. Your applications (pages/my-application.js) ──────────────────────────────────────────
// Each row: the address and the status on one line, the date and the number under it, the whole
// row opening the application. The status is the product's one pill: side padding, one line high,
// its text centred both ways; the date is text, not a pill; the number is in the body face.
const ROWS = () => [...document.querySelectorAll('[data-application-row]')].map((row) => {
  const link = row.querySelector('.tp-app-link'); const lr = link.getBoundingClientRect();
  const pills = [...row.querySelectorAll('.rl-pill')].map((p) => {
    const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); const range = document.createRange(); range.selectNodeContents(p); const t = range.getBoundingClientRect();
    return { text: p.textContent.trim(), height: Math.round(r.height), padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), dx: Math.round(Math.abs((t.left - r.left) - (r.right - t.right))), dy: Math.round(Math.abs((t.top - r.top) - (r.bottom - t.bottom))), top: Math.round(r.top - lr.top), under: Math.round(r.top - lr.bottom) };
  });
  const lines = [...row.querySelectorAll('.tp-app-line')].map((e) => e.textContent.trim());
  const num = row.querySelector('[data-application-number]');
  return { id: row.getAttribute('data-application-row'), pills, lines, numFont: getComputedStyle(num).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily, numLine: Math.round(num.getBoundingClientRect().top - lr.top), copy: !!row.querySelector('[data-copy-number]') };
});
async function applications(browser, tag) {
  for (const width of [390, 320, 1440]) {
    const phone = width < 1024;
    const ctx = await browser.newContext(phone ? { serviceWorkers: 'block', viewport: { width, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { serviceWorkers: 'block', viewport: { width, height: 900 } });
    await blockSupabase(ctx);
    if (tag === 'cr') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const page = await ctx.newPage();
    try {
      await tenantIn(ctx, page, `${tag === 'wk' ? 40 : 50}${width}`, 'docs=1&apps=3');
      await page.evaluate(() => document.getElementById('applications').scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(400);
      const rows = await page.evaluate(ROWS); const at = `${tag} 3 at ${width}`;
      assert.equal(rows.length, 3, `${at}: three rows`);
      for (const r of rows) {
        assert.equal(r.pills.length, 1, `${at}: ${r.id}, the status alone is a pill (${JSON.stringify(r.pills)})`);
        const p = r.pills[0];
        assert.doesNotMatch(p.text, /\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December/, `${at}: ${r.id}, no date in a pill`);
        assert.ok(p.height <= 30 && p.padL >= 8 && p.padL === p.padR && p.dx <= 1 && p.dy <= 2, `${at}: ${r.id}, the pill: side padding, one line high, its text centred (${JSON.stringify(p)})`);
        // On the address's first line; or, where a long status leaves the address too narrow, right under it.
        assert.ok(p.top <= 6 || (p.under >= -1 && p.under <= 8 && phone), `${at}: ${r.id}, the status on the address's line (${JSON.stringify(p)})`);
        assert.match(r.lines[0] || '', /^Sent\s(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2},\s\d{4}\b/, `${at}: ${r.id}, the date as text (${JSON.stringify(r.lines)})`);
        assert.ok(!/mono|menlo|courier/i.test(r.numFont) && r.numFont === r.bodyFont, `${at}: ${r.id}, the number in the body face (${r.numFont})`);
        assert.ok(r.copy && r.numLine > 0, `${at}: ${r.id}, the number under the date with Copy`);
      }
      // Copy copies, and opens nothing; the row opens its application from anywhere on it.
      const first = rows[0].id;
      await page.locator(`[data-application-row="${first}"] [data-copy-number]`).click();
      await page.locator('.mp-toast').waitFor({ timeout: 5000 });
      const toast = (await page.locator('.mp-toast').innerText()).trim();
      if (tag === 'cr') { assert.equal(toast, 'Application number copied'); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), first, `${at}: the number copied`); }
      else assert.match(toast, /^(Application number copied|Could not copy the number)$/, `${at}: Copy says what it did`);
      assert.match(page.url(), /\/my-application$/, `${at}: Copy opens nothing`);
      await page.locator(`[data-application-row="${first}"] .tp-app-line`).first().click();
      await page.waitForURL((u) => u.pathname === `/my-application/${first}`, { timeout: 15000 });
      noSupabaseLeft(ctx, `${at}`);
    } finally { await ctx.close(); }
  }
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    await desk(browser, tag);
    await phone(browser, tag);
    await glassPhone(browser, tag);
    await glassDesk(browser, tag);
    await glassFallbacks(browser, tag);
    await applications(browser, tag);
    // g: how long each frame took while a long page scrolled under the glass.
    console.log(`# ${tag} frames while scrolling, with the glass and without: ${smooth.filter((x) => x.tag === tag).map((x) => `${x.page} median ${x.on.median} and ${x.off.median}ms, p95 ${x.on.p95} and ${x.off.p95}ms (${x.on.frames} frames)`).join('; ')}`);
    for (const x of smooth.filter((v) => v.tag === tag)) assert.ok(x.on.frames > 40 && x.on.median <= x.off.median + 4 && x.on.p95 <= x.off.p95 + 8, `${tag} 2g: ${x.page} scrolls as smoothly with the glass as without it (${JSON.stringify(x)})`);
  } finally { await browser.close(); }
}

test('the dashboard as one place, the glass and Your applications, in WebKit at 1440, 390 and 320', { timeout: 600000 }, async () => { requireWebkit(); await walk(pw.webkit, {}, 'wk'); });
test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
