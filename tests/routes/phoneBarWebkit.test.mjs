// What floats over the realtor's dashboard on a phone holds its place on the screen, walked for real
// in WebKit (Safari's engine) and in Chrome on the fake stack (fix/phone-standalone):
//   1. The tab bar (components/dashboard/MainNav.js), at 390 by 844 with motion on, in dark: drawn on
//      the body (components/FloatLayer.js); its bottom edge the window's bottom less 16px and the
//      safe area, at rest and at every step of a scroll to the end of the page, where the page's
//      last box ends above the bar's top; while the Sort sheet is up over the page scrolled to 400
//      (the page behind scaled back, the bar not), as it closes, and after; as a listing pushes in
//      and as it goes back (in a view transition the bar is a picture of its own that never moves);
//      between Listings, Circle and Profile; and after the theme is switched on Profile. At each of
//      those moments no box around it carries a transform, translate, scale, rotate, filter,
//      backdrop filter, perspective, will-change, contain, container type or view transition name
//      (the root's own view transition name, root, aside).
//   2. The first screen at 390, 320 and 430 by 844, light and dark: with work waiting the four
//      tiles, with nothing waiting the compact row (on one line at 345, 360 and 375 too); either way the first listing card's title is
//      above the tab bar. The controls (Active and Archived, Sort, Select) on one row, each 44px
//      high, inside the page's width; Sort says Sort and names the order.
//   3. The strip, both themes: a stage not reached yet at 3 to 1 or more against the card, done
//      ink, current red; a skipped stage (/__fake/state?skip=1) outlined and read as skipped.
//   4. The sticky surfaces: the bar for the cards picked stays at the top as the page scrolls and
//      while the Delete sheet is up (the page behind not scaled); the tenant's top bar on the apply
//      form, an application and the profile, and the strength bar and chips under it on the
//      profile, stay in place as the page scrolls and while the strength sheet is up; no box above
//      any of them carries those properties or is a scroll box. The listing page's toast is on the
//      body.
// Playwright cannot run a page as the installed app (standalone): what holds there is that the bar
// is never inside a box that moves (tests/floatingSurfaces.test.mjs).
// With PHONE_SHOTS set to a folder, the WebKit walk saves the dashboard at 390, dark and light, at
// the top and scrolled to the end.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked, and no request leaves the browser
// for a supabase.co host (tests/helpers/noSupabase.mjs). A WebKit walk fails, never skips, when the
// binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3196; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SHOTS = process.env.PHONE_SHOTS || '';

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
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/listing/L1', '/profile', '/circle', '/my-application', '/my-application/DEMO', '/apply/demo0000000000000001']) await fetch(`${BASE}${u}`).catch(() => null);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const f = (path) => fetch(`${BASE}${path}`).then((r) => r.json());
const phone = async (browser, { width = 390, height = 844, scheme = 'light', motion = 'no-preference' } = {}) => {
  const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width, height }, colorScheme: scheme, reducedMotion: motion, userAgent: UA_PHONE, isMobile: true, hasTouch: true });
  await blockSupabase(ctx);
  return ctx;
};
const settle = async (page, ms = 400) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
const vis = (page, sel) => page.locator(sel).filter({ visible: true }).first();
const dashboard = async (page) => { await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-listing-card]').first().waitFor({ timeout: 60000 }); await settle(page); };
const instant = (page, y) => page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: 'instant' }), y);

// Every box around an element (html's own view transition name, root, aside) that carries a
// property making it the element's containing block; with scroll, each that is a scroll box too.
const BOXES = ({ sel, scroll }) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length) || document.querySelector(sel);
  if (!el) return [`${sel}: not on the page`];
  const out = [];
  for (let a = el.parentElement; a; a = a.parentElement) {
    const cs = getComputedStyle(a); const name = `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${typeof a.className === 'string' && a.className ? `.${a.className.trim().split(/\s+/).join('.')}` : ''}`;
    const set = (v) => v && !['none', 'normal', 'auto', ''].includes(v);
    for (const p of ['transform', 'translate', 'scale', 'rotate', 'filter', 'backdropFilter', 'webkitBackdropFilter', 'perspective', 'willChange', 'contain', 'containerType']) if (set(cs[p])) out.push(`${name} ${p}: ${cs[p]}`);
    if (set(cs.viewTransitionName) && !(a === document.documentElement && cs.viewTransitionName === 'root')) out.push(`${name} view-transition-name: ${cs.viewTransitionName}`);
    if (scroll && a !== document.documentElement && (!['visible', 'clip'].includes(cs.overflowX) || !['visible', 'clip'].includes(cs.overflowY))) out.push(`${name} a scroll box (${cs.overflowX} ${cs.overflowY})`);
  }
  return out;
};
const boxes = (page, sel, scroll = false) => page.evaluate(BOXES, { sel, scroll });
const BAR = () => {
  const el = document.querySelector('[data-main-nav]'); if (!el) return null;
  const r = el.getBoundingClientRect(); const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe); const safe = probe.getBoundingClientRect().height; probe.remove();
  const box = el.parentElement;
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, float: el.dataset.float, parent: box === document.body ? 'body' : box.getAttribute('data-float-host') === 'end' && box.parentElement === document.body ? 'its box on the body' : box.tagName.toLowerCase(), want: window.innerHeight - 16 - safe, vt: getComputedStyle(el).viewTransitionName, y: window.scrollY, iw: window.innerWidth };
};
const bar = (page) => page.evaluate(BAR);
const near = (a, b, d = 0.5) => Math.abs(a - b) <= d;
const sameRect = (a, b) => a && b && near(a.top, b.top) && near(a.bottom, b.bottom) && near(a.left, b.left) && near(a.right, b.right);
// Every frame while an action runs: the bar's box (or null where no bar is), and the view
// transition's picture of it where one is running.
const startFrames = (page) => page.evaluate(() => {
  window.__frames = []; window.__framing = true;
  const tick = () => {
    if (!window.__framing) return;
    const el = document.querySelector('[data-main-nav]'); const r = el && el.getBoundingClientRect();
    let vt = null; try { const g = getComputedStyle(document.documentElement, '::view-transition-group(rl-main-nav)'); if (document.documentElement.dataset.nav && g && g.transform && g.transform !== 'none') vt = g.transform; } catch (e) { /* no transition */ }
    window.__frames.push({ r: r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null, vt, nav: document.documentElement.dataset.nav || '', next: getComputedStyle(document.getElementById('__next')).scale });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const stopFrames = (page) => page.evaluate(() => { window.__framing = false; return window.__frames; });
const allAt = (frames, rest, what) => {
  const moved = frames.filter((x) => x.r && !sameRect(x.r, rest));
  assert.equal(moved.length, 0, `${what}: the bar moved in ${moved.length} of ${frames.length} frames (${JSON.stringify(moved.slice(0, 3))}, at rest ${JSON.stringify(rest)})`);
  assert.ok(frames.length >= 3, `${what}: frames seen (${frames.length})`);
};

// ── 1. The tab bar holds its place ───────────────────────────────────────────────────────────
async function barWalk(browser, engine) {
  walkStep(`${engine}: the tab bar`);
  const ctx = await phone(browser, { scheme: 'dark' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await dashboard(page);
  const rest = await bar(page);
  // In its box at the end of the body (components/FloatLayer.js, fix/phone-shell), whose one style
  // is overflow-y auto: no box around the bar carries a containing block property (boxes, below).
  assert.equal(rest.float, 'body', `${engine}: the bar is drawn on the body`); assert.equal(rest.parent, 'its box on the body');
  assert.ok(near(rest.bottom, rest.want), `${engine}: its bottom edge is the window's bottom less 16px and the safe area (${rest.bottom} against ${rest.want})`);
  assert.ok(near(rest.left, 16) && near(rest.right, rest.iw - 16) && near(rest.height, 68), `${engine}: 16px in, 68px tall (${JSON.stringify(rest)})`);
  assert.equal(rest.vt, 'rl-main-nav', `${engine}: a picture of its own in a view transition`);
  assert.deepEqual(await boxes(page, '[data-main-nav]'), [], `${engine}: at rest`);
  // A scroll to the end, step by step: the bar never moves, and the page's last box ends above it.
  const end = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  assert.ok(end > 300, `${engine}: the dashboard scrolls (${end})`);
  for (let y = 0; y <= end + 250; y += 250) {
    await instant(page, Math.min(y, end)); await page.waitForTimeout(60);
    const b = await bar(page); assert.ok(sameRect(b, rest), `${engine}: scrolled to ${b.y}, the bar where it was (${JSON.stringify(b)})`);
  }
  await instant(page, end); await page.waitForTimeout(200);
  const atEnd = await page.evaluate(() => {
    const main = document.querySelector('[data-shell] .ds-main'); let last = 0; let who = '';
    for (const el of main.querySelectorAll('*')) { if (el.closest('header')) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') continue; if (r.bottom > last) { last = r.bottom; who = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`; } }
    const cards = [...document.querySelectorAll('[data-listing-card]')].filter((c) => c.getClientRects().length);
    const pipe = document.querySelector('[data-pipeline-soon]');
    return { y: window.scrollY, last, who, lastCard: cards.length ? cards[cards.length - 1].getBoundingClientRect().bottom : null, pipeline: pipe ? pipe.getBoundingClientRect().bottom : null };
  });
  const b = await bar(page);
  assert.ok(near(b.bottom, b.want) && sameRect(b, rest), `${engine}: at the end the bar's bottom is the window's bottom less the safe area (${JSON.stringify(b)})`);
  assert.ok(atEnd.last <= b.top, `${engine}: the page's last box (${atEnd.who}) ends at ${atEnd.last}, above the bar's top ${b.top}`);
  assert.ok(atEnd.lastCard <= b.top && atEnd.pipeline <= b.top, `${engine}: the last card and the Pipeline line clear the bar (${JSON.stringify(atEnd)})`);
  if (SHOTS && engine === 'WebKit') await page.screenshot({ path: `${SHOTS}/dashboard-390-dark-end.png` });
  // The Sort sheet over the page scrolled to 400: the page behind scales back, the bar does not move.
  await instant(page, 400); await page.waitForTimeout(150);
  await startFrames(page);
  await vis(page, '[data-sort-open]').click(); await page.locator('[data-sort-sheet]').waitFor({ timeout: 15000 }); await page.waitForTimeout(700);
  assert.deepEqual(await boxes(page, '[data-main-nav]'), [], `${engine}: with the Sort sheet up`);
  const up = await stopFrames(page);
  assert.ok(up.some((x) => x.next === '0.97'), `${engine}: the page behind the sheet scaled back (${[...new Set(up.map((x) => x.next))]})`);
  allAt(up, rest, `${engine}: the Sort sheet coming up`);
  await startFrames(page);
  await page.keyboard.press('Escape'); await page.locator('[data-sort-sheet]').waitFor({ state: 'detached', timeout: 15000 }); await page.waitForTimeout(600);
  allAt(await stopFrames(page), rest, `${engine}: the Sort sheet going`);
  assert.equal(Math.round(await page.evaluate(() => window.scrollY)), 400, `${engine}: the page where it was`);
  assert.ok(sameRect(await bar(page), rest), `${engine}: after the sheet`);
  // Into a listing and back: the bar is a picture of its own that never moves, then gone; back, there.
  await instant(page, 0); await page.waitForTimeout(150);
  await startFrames(page);
  await vis(page, '[data-listing-card="L1"] .lc-link').click();
  await page.waitForURL(/\/listing\/L1/, { timeout: 30000 }); await page.locator('#report').waitFor({ timeout: 60000 }); await page.waitForTimeout(700);
  const into = await stopFrames(page);
  allAt(into, rest, `${engine}: pushing into a listing`);
  const pictures = into.map((x) => x.vt).filter(Boolean);
  assert.ok(new Set(pictures).size <= 1, `${engine}: the bar's picture never moved in the push (${[...new Set(pictures)]})`);
  assert.equal(await bar(page), null, `${engine}: a listing has no tab bar`);
  assert.equal(await page.evaluate(() => document.querySelector('.lv-toast')?.parentElement === document.body), true, `${engine}: the listing's toast is on the body`);
  await startFrames(page);
  await page.goBack(); await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 }); await page.locator('[data-listing-card]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(700);
  const back = await stopFrames(page);
  allAt(back.filter((x) => x.r), rest, `${engine}: going back`);
  assert.ok(new Set(back.map((x) => x.vt).filter(Boolean)).size <= 1, `${engine}: the bar's picture never moved going back`);
  assert.ok(sameRect(await bar(page), rest), `${engine}: back on the dashboard`);
  assert.deepEqual(await boxes(page, '[data-main-nav]'), [], `${engine}: back on the dashboard`);
  // Circle and Profile, from the tabs: nothing slides, the bar stays.
  for (const [tab, path, ready] of [['circle', '/circle', '[data-circle-list], [data-circle-empty]'], ['profile', '/profile', '[data-theme-choice="realtor"]']]) {
    await startFrames(page);
    await page.locator(`[data-main-nav] [data-nav="${tab}"]`).click(); await page.waitForURL((u) => u.pathname === path, { timeout: 30000 }); await page.locator(ready).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(500);
    allAt((await stopFrames(page)).filter((x) => x.r), rest, `${engine}: to ${tab}`);
    assert.ok(sameRect(await bar(page), rest), `${engine}: on ${tab}`); assert.deepEqual(await boxes(page, '[data-main-nav]'), [], `${engine}: on ${tab}`);
  }
  // The theme switched on Profile: the bar where it was, nothing around it.
  for (const pick of ['light', 'dark', 'auto']) {
    await page.locator(`[data-theme-pick="${pick}"]`).scrollIntoViewIfNeeded(); await page.locator(`[data-theme-pick="${pick}"]`).click(); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), pick === 'auto' ? null : pick, `${engine}: ${pick} chosen`);
    const b2 = await bar(page); assert.ok(sameRect(b2, rest), `${engine}: after ${pick}, the bar where it was (${JSON.stringify(b2)})`);
    assert.deepEqual(await boxes(page, '[data-main-nav]'), [], `${engine}: after ${pick}`);
  }
  await page.locator('[data-main-nav] [data-nav="listings"]').click(); await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 }); await page.locator('[data-listing-card]').first().waitFor({ timeout: 60000 });
  assert.ok(sameRect(await bar(page), rest), `${engine}: Listings again`);
  assert.deepEqual(errors, [], `${engine}: no page error`);
  noSupabaseLeft(ctx, `${engine}: the tab bar`);
  await ctx.close();
}

// ── 2 and 3. The first screen, the controls and the strip ──────────────────────────────────────
const FIRST = () => {
  const tiles = [...document.querySelectorAll('[data-status-board] [data-tile]')].filter((e) => e.getClientRects().length).length;
  const calm = document.querySelector('[data-board-calm]'); const cr = calm && calm.getClientRects().length ? calm.getBoundingClientRect() : null;
  const title = [...document.querySelectorAll('[data-listing-card] .lc-addr')].find((e) => e.getClientRects().length).getBoundingClientRect();
  const nav = document.querySelector('[data-main-nav]').getBoundingClientRect();
  const row = document.querySelector('[data-listing-tools]'); const rr = row.getBoundingClientRect();
  const tools = [...row.children].filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { cls: String(e.className).split(' ').filter((c) => /^hv-|ds-btn$/.test(c)).join('.'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, name: e.getAttribute('aria-label') || e.textContent.trim(), text: e.textContent.trim() }; });
  const figs = calm ? [...calm.querySelectorAll('[data-fig]')].map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, top: r.top, bottom: r.bottom, right: r.right }; }) : [];
  const line = calm ? calm.querySelector('.sb-calm-line').getBoundingClientRect() : null;
  return { tiles, calm: cr && { top: cr.top, bottom: cr.bottom, h: cr.height, left: cr.left, right: cr.right }, figs, line: line && { top: line.top, bottom: line.bottom, right: line.right, h: line.height }, title: { top: title.top, bottom: title.bottom }, navTop: nav.top, row: { left: rr.left, right: rr.right }, tools, iw: window.innerWidth, sideways: document.documentElement.scrollWidth - window.innerWidth };
};
const archiveL1 = (page, archived) => page.evaluate(async (a) => (await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L1'], archived: a }) })).status, archived);
const ratio = (a, b) => { const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const lum = ([r, g, bl]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl); const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function firstScreenWalk(browser, engine) {
  walkStep(`${engine}: the first screen, the controls and the strip`);
  await f('/__fake/state?archive=1');
  try {
    for (const scheme of ['light', 'dark']) for (const width of [390, 320, 430]) {
      const tag = `${engine} ${scheme} ${width}`;
      const ctx = await phone(browser, { width, scheme, motion: 'reduce' });
      const page = await ctx.newPage();
      // Work waiting: the four tiles.
      await dashboard(page);
      if (SHOTS && engine === 'WebKit' && width === 390) {
        await page.screenshot({ path: `${SHOTS}/dashboard-390-${scheme}-top.png` });
        if (scheme === 'light') { await instant(page, 100000); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/dashboard-390-light-end.png` }); await instant(page, 0); await page.waitForTimeout(200); }
      }
      const busy = await page.evaluate(FIRST);
      assert.equal(busy.tiles, 4, `${tag}: work waiting, the four tiles`); assert.equal(busy.calm, null, `${tag}: no compact row`);
      assert.ok(busy.title.bottom <= busy.navTop, `${tag}: work waiting, the first card's title (${Math.round(busy.title.top)} to ${Math.round(busy.title.bottom)}) above the tab bar (${busy.navTop})`);
      // The controls: one row, 44px each, inside the page.
      assert.deepEqual(busy.tools.map((t) => t.cls), ['hv-seg', 'ds-btn.hv-sort-btn.hv-only-phone', 'ds-btn.hv-select'], `${tag}: the switch, Sort and Select`);
      for (const t of busy.tools) {
        assert.ok(near(t.top, busy.tools[0].top, 1) && near(t.h, 44, 0.5), `${tag}: ${t.cls} on the row, 44px high (${JSON.stringify(t)})`);
        assert.ok(t.left >= busy.row.left - 0.5 && t.right <= busy.row.right + 0.5 && t.right <= busy.iw, `${tag}: ${t.cls} inside the row (${JSON.stringify({ t, row: busy.row })})`);
      }
      assert.equal(busy.tools[1].text, 'Sort'); assert.equal(busy.tools[1].name, 'Sort, Latest activity', `${tag}: Sort names the order`);
      assert.equal(busy.tools[2].text, 'Select', `${tag}: Select's name`);
      assert.equal(busy.sideways, 0, `${tag}: nothing sideways`);
      // The strip: not reached yet at 3 to 1 against the card; done ink; current red.
      const strip = await page.evaluate(() => {
        const card = document.querySelector('[data-listing-card="L1"]'); const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const seg = (k) => { const b = card.querySelector(`[data-seg="${k}"] .lc-bar`); return b ? rgb(getComputedStyle(b).backgroundColor) : null; };
        return { card: rgb(getComputedStyle(card).backgroundColor), todo: seg('todo'), done: seg('done'), current: seg('current'), ink: getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim(), red: getComputedStyle(document.documentElement).getPropertyValue('--c-red').trim() };
      });
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      assert.ok(ratio(strip.todo, strip.card) >= 3, `${tag}: a stage not reached yet holds 3 to 1 against the card (${ratio(strip.todo, strip.card).toFixed(2)}, ${strip.todo} on ${strip.card})`);
      assert.deepEqual(strip.done, hex(strip.ink), `${tag}: done in ink`); assert.deepEqual(strip.current, hex(strip.red), `${tag}: the current stage red`);
      // A skipped stage: outlined, read as skipped.
      await f('/__fake/state?skip=1');
      await dashboard(page);
      const skipped = await page.evaluate(() => { const li = document.querySelector('[data-listing-card="L2"] [data-seg="skipped"]'); if (!li) return null; const cs = getComputedStyle(li.querySelector('.lc-bar')); return { text: li.textContent, bg: cs.backgroundColor, shadow: cs.boxShadow, w: li.querySelector('.lc-bar').getBoundingClientRect().width }; });
      await f('/__fake/state?skip=0');
      assert.ok(skipped, `${tag}: L2 shows a skipped stage`);
      assert.equal(skipped.text, 'Documents, skipped');
      assert.match(skipped.bg, /rgba\(0, 0, 0, 0\)|transparent/, `${tag}: its fill the card`); assert.match(skipped.shadow, /inset/, `${tag}: outlined (${skipped.shadow})`); assert.ok(skipped.w > 20, `${tag}: a segment, never a gap`);
      // Nothing waiting: the compact row.
      assert.equal(await archiveL1(page, true), 200);
      try {
        await dashboard(page);
        const calm = await page.evaluate(FIRST);
        assert.equal(calm.tiles, 0, `${tag}: nothing waiting, no tile`); assert.ok(calm.calm, `${tag}: the compact row`);
        assert.ok(calm.calm.h <= 80 && calm.calm.left >= 0 && calm.calm.right <= calm.iw, `${tag}: one compact row (${JSON.stringify(calm.calm)})`);
        assert.ok(calm.line.h < 24, `${tag}: Nothing waiting on one line (${calm.line.h})`);
        assert.equal(calm.figs.length, 2);
        for (const g of calm.figs) assert.ok(g.h >= 44 && g.top >= calm.calm.top && g.bottom <= calm.calm.bottom + 0.5 && g.right <= calm.calm.right, `${tag}: each figure a 44px button inside the row (${JSON.stringify(g)})`);
        assert.ok(calm.line.right <= calm.figs[0].right, `${tag}: the line beside the figures`);
        assert.ok(calm.title.bottom <= calm.navTop, `${tag}: nothing waiting, the first card's title (${Math.round(calm.title.top)} to ${Math.round(calm.title.bottom)}) above the tab bar (${calm.navTop})`);
        assert.equal(calm.sideways, 0, `${tag}: nothing sideways`);
        if (SHOTS && engine === 'WebKit' && width === 390) await page.screenshot({ path: `${SHOTS}/dashboard-390-${scheme}-nothing-waiting.png` });
        // Every phone width between: the line and the two figures on one row inside it.
        if (width === 390) {
          for (const w of [345, 360, 375]) {
            await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(200);
            const row = await page.evaluate(() => { const c = document.querySelector('[data-board-calm]'); const r = c.getBoundingClientRect(); const line = c.querySelector('.sb-calm-line'); const l = line.getBoundingClientRect(); const figs = [...c.querySelectorAll('[data-fig]')].map((e) => e.getBoundingClientRect()); return { row: [r.left, r.right, r.height], line: [l.left, l.right, l.height, line.scrollWidth, l.width], figs: figs.map((g) => [g.left, g.right, g.top]) }; });
            assert.ok(row.line[1] <= row.figs[0][0] && row.figs[1][1] <= row.row[1] && row.line[3] <= Math.ceil(row.line[4]) && row.line[2] < 24 && row.row[2] <= 80 && near(row.figs[0][2], row.figs[1][2], 1), `${tag} at ${w}: the compact row on one line inside its box (${JSON.stringify(row)})`);
          }
          await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(200);
        }
      } finally { await archiveL1(page, false); }
      noSupabaseLeft(ctx, tag);
      await ctx.close();
    }
  } finally { await f('/__fake/state?archive=0&skip=0'); }
}

// ── 4. The sticky surfaces and the toasts ─────────────────────────────────────────────────────
async function stickyWalk(browser, engine) {
  walkStep(`${engine}: the sticky surfaces`);
  const ctx = await phone(browser, { scheme: 'light' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  // The bar for the cards picked.
  await f('/__fake/state?many=4');
  try {
    await dashboard(page);
    await vis(page, '[data-select-mode]').click(); await page.locator('[data-card-check]').first().check(); await page.locator('[data-bulk-bar]').waitFor({ timeout: 15000 });
    await instant(page, 900); await page.waitForTimeout(300);
    const top = async () => page.evaluate(() => document.querySelector('[data-bulk-bar]').getBoundingClientRect().top);
    const t0 = await top();
    // 8px under the phone's top bar, which stays fixed over it (fix/phone-shell).
    const under = await page.evaluate(() => document.querySelector('[data-shell-bar]').getBoundingClientRect().bottom);
    assert.ok(near(t0, under + 8, 1), `${engine}: the bar for the picked stays 8px under the top bar as the page scrolls (${t0} under ${under} at ${await page.evaluate(() => window.scrollY)})`);
    assert.deepEqual(await boxes(page, '[data-bulk-bar]', true), [], `${engine}: the bar for the picked, scrolled`);
    await vis(page, '[data-bulk-delete]').click(); await page.locator('[role="dialog"], [role="alertdialog"]').last().waitFor({ timeout: 15000 }); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('__next')).scale), 'none', `${engine}: with the Delete sheet up the page behind is not scaled`);
    assert.ok(near(await top(), t0, 1), `${engine}: the bar for the picked holds its place with the sheet up`);
    assert.deepEqual(await boxes(page, '[data-bulk-bar]'), [], `${engine}: the bar for the picked, with the sheet up`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    assert.ok(near(await top(), t0, 1), `${engine}: and after it`);
  } finally { await f('/__fake/state?many=0'); }
  // The tenant's top bar on the apply form and on an application, in a short window so they scroll.
  await page.setViewportSize({ width: 390, height: 480 });
  for (const url of ['/apply/demo0000000000000001', '/my-application/DEMO']) {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-tenant-bar]').waitFor({ timeout: 60000 }); await settle(page);
    const end = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    assert.ok(end > 100, `${engine}: ${url} scrolls (${end})`);
    await instant(page, Math.min(end, 400)); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ top: document.querySelector('[data-tenant-bar]').getBoundingClientRect().top, y: window.scrollY }));
    assert.ok(near(r.top, 0, 0.5) && r.y > 50, `${engine}: ${url}, the tenant's bar at the top, scrolled to ${r.y} (${r.top})`);
    assert.deepEqual(await boxes(page, '[data-tenant-bar]', true), [], `${engine}: ${url}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // The tenant's profile: the top bar, and the strength bar and chips under it, scrolled and with
  // the strength sheet up.
  const { token } = await f('/__fake/tenant?who=1&docs=1');
  await ctx.addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/my-application', { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-vault-documents]').waitFor({ timeout: 60000 }); await settle(page);
  await instant(page, 900); await page.waitForTimeout(400);
  const tops = () => page.evaluate(() => ({ bar: document.querySelector('[data-tenant-bar]').getBoundingClientRect().top, under: document.querySelector('[data-tp-top]').getBoundingClientRect().top, h: document.querySelector('[data-tenant-bar]').getBoundingClientRect().height }));
  const s0 = await tops();
  assert.ok(near(s0.bar, 0, 0.5) && near(s0.under, s0.h, 1), `${engine}: the profile's bars at the top, scrolled (${JSON.stringify(s0)})`);
  for (const sel of ['[data-tenant-bar]', '[data-tp-top]']) assert.deepEqual(await boxes(page, sel, true), [], `${engine}: the profile, ${sel}`);
  await page.locator('[data-tp-top] [data-strength-bar]').click(); await page.locator('[role="dialog"]').last().waitFor({ timeout: 15000 }); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('__next')).scale), 'none', `${engine}: with the strength sheet up the page behind is not scaled`);
  const s1 = await tops();
  assert.ok(near(s1.bar, s0.bar, 1) && near(s1.under, s0.under, 1), `${engine}: the profile's bars hold their place with the sheet up (${JSON.stringify(s1)})`);
  for (const sel of ['[data-tenant-bar]', '[data-tp-top]']) assert.deepEqual(await boxes(page, sel), [], `${engine}: the profile with the sheet up, ${sel}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  const s2 = await tops();
  assert.ok(near(s2.bar, s0.bar, 1) && near(s2.under, s0.under, 1), `${engine}: and after it (${JSON.stringify(s2)})`);
  assert.deepEqual(errors, [], `${engine}: no page error`);
  noSupabaseLeft(ctx, `${engine}: the sticky surfaces`);
  await ctx.close();
}

async function walk(browser, engine) {
  await barWalk(browser, engine);
  await firstScreenWalk(browser, engine);
  await stickyWalk(browser, engine);
}

test('the tab bar, the first screen and what floats on a phone, walked in WebKit', { timeout: 600000 }, async () => {
  const webkit = requireWebkit();
  const browser = await webkit.launch();
  try { await walk(browser, 'WebKit'); } finally { await browser.close(); }
});

test('the tab bar, the first screen and what floats on a phone, walked in Chrome', { timeout: 600000, skip: !haveChrome && 'Google Chrome is not installed' }, async () => {
  const browser = await pw.chromium.launch({ executablePath: chromeBin });
  try { await walk(browser, 'Chrome'); } finally { await browser.close(); }
});
