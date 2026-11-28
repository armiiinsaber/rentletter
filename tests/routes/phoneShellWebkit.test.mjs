// The realtor's shell on a phone as the installed app shows it (fix/phone-shell), walked for real in
// WebKit (Safari's engine) and in Chrome on the fake stack, at 390 by 844 with an iPhone user agent:
//   1. One page scroll. On every realtor view (Listings, Pipeline, Shared with you, Circle, Profile
//      and a listing) the document itself scrolls: document.scrollingElement is the root, a scroll
//      moves it and the view's content with it, no box between the root and the view's content is a
//      scroll box (body, the Next root and the view's wrapper clip instead), and no element outside
//      a sheet scrolls by itself (a sheet and the command menu keep their own).
//   2. The top bar, the tab bar and its fade, with a phone's safe areas (59px at the top, 34 at the
//      bottom, tests/helpers/typesetStates.mjs SAFE_AREAS), light and dark, on every view at the top,
//      scrolled halfway and scrolled to the end:
//        the top bar (components/dashboard/DashboardHeader.js) fixed at the top of the screen, the
//        same box at each position, drawn in its box at the start of the body, before the Next root,
//        with nothing around it that would carry it (a transform, a filter, will-change and the
//        rest), each such box a scroller of its own with no size that scrolls nothing; as tall as the safe area and its 60px row, so the status bar's area is the bar
//        (what is under each point of it is the bar); solid at the top of the page (its solid layer
//        on, no blur) and glass once the page scrolls under it (the layer off, the blur on); its
//        bottom edge above the first content at the top;
//        the tab bar (components/dashboard/MainNav.js) 16px and the safe area above the screen's
//        bottom, and the fade behind it from 24px above it to the screen's bottom edge, under it,
//        never a target, both in their box at the end of the body; the last content's bottom above the tab bar at the end (on a
//        listing, which has none, above the home indicator); and nothing of the page ever shows in
//        the gap under the tab bar or beside its round ends: those strips are the same picture at
//        the top, halfway and at the end.
//   3. The bounce (fix/phone-polish): at 320 and 390, light and dark, the root keeps the browser's
//      own overscroll, so the page bounces at its ends; in Chrome a touch pull past the top and a
//      push past the end leave the page at that end and each bar where it rests; with the Sort sheet
//      or the command menu up, the root and the sheet hold still and every box that scrolls keeps its
//      own overscroll (none or contain).
//   4. The Landlord card's actions on a listing at 320, 390 and 1440, light and dark: Download PDF
//      and Copy text two quiet buttons under Send, side by side, 44px, 8px apart; Copied in place.
//      At 1440 the root still never drags past its last element.
// Playwright cannot run a page as the installed app (standalone) and no browser under test reports
// a safe area: the insets are stood in for through the two names every surface reads (--safe-top,
// --safe-bottom, pages/_app.js). Tapping the status bar, the bounce as drawn and the real insets are
// not walked (no engine here draws an overscroll from a synthetic gesture); what holds there is that
// the page is the one scroller and nothing floats inside a box that moves
// (tests/floatingSurfaces.test.mjs).
// With PHONE_SHELL_SHOTS set to a folder, the WebKit walk saves Listings, Circle and Profile, light,
// at the top and scrolled halfway, with the safe areas.
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
import { readPng } from '../helpers/png.mjs';
import { PHONE_VIEWS, SAFE_AREAS, SAFE_TOP, SAFE_BOTTOM } from '../helpers/typesetStates.mjs';

const PORT = 3197; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SHOTS = process.env.PHONE_SHELL_SHOTS || '';
// The top bar's row under the safe area (components/dashboard/DashboardHeader.js SHELL_BAR), the tab
// bar's height and inset and the fade above it (components/dashboard/MainNav.js).
const BAR_ROW = 60; const TAB_H = 68; const TAB_INSET = 16; const FADE_ABOVE = 24;

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
  for (const [, u] of PHONE_VIEWS) await fetch(`${BASE}${u}`).catch(() => null);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const phone = async (browser, { scheme = 'light', safe = false } = {}) => {
  const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width: 390, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce', userAgent: UA_PHONE, isMobile: true, hasTouch: true });
  await blockSupabase(ctx);
  if (safe) await ctx.addInitScript(SAFE_AREAS);
  return ctx;
};
const settle = async (page, ms = 400) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
const open = async (page, path, ready) => { await page.goto(path, { waitUntil: 'load', timeout: 120000 }); await page.locator(ready).first().waitFor({ state: 'attached', timeout: 60000 }); await settle(page); };
const instant = (page, y) => page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: 'instant' }), y);
const near = (a, b, d = 0.5) => Math.abs(a - b) <= d;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// ── 1. One page scroll ───────────────────────────────────────────────────────────────────────
// What scrolls: the scrolling element; every box around the view's content that is a scroll box
// (its overflow anything but visible or clip; the root, which is the document's own scroller,
// aside); every element outside a sheet that scrolls up and down by itself.
const SCROLLERS = (ready) => {
  const name = (a) => `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${typeof a.className === 'string' && a.className ? `.${a.className.trim().split(/\s+/).filter((c) => !/^jsx-/.test(c)).join('.')}` : ''}`;
  const content = [...document.querySelectorAll(ready)].find((e) => e.getClientRects().length) || document.querySelector(ready);
  const around = [];
  for (let a = content && content.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (!['visible', 'clip'].includes(cs.overflowX) || !['visible', 'clip'].includes(cs.overflowY)) around.push(`${name(a)} (${cs.overflowX} ${cs.overflowY})`);
  }
  const inner = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-sheet]')) continue;
    const cs = getComputedStyle(el);
    if (!['auto', 'scroll'].includes(cs.overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 1 && el.getClientRects().length) inner.push(`${name(el)} (${el.clientHeight} of ${el.scrollHeight})`);
  }
  return { root: document.scrollingElement === document.documentElement, found: !!content, around, inner, end: document.documentElement.scrollHeight - window.innerHeight };
};

async function scrollWalk(browser, engine) {
  walkStep(`${engine}: one page scroll on every view`);
  const ctx = await phone(browser);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  for (const [view, path, ready] of PHONE_VIEWS) {
    const tag = `${engine} ${view}`;
    await open(page, path, ready);
    const s = await page.evaluate(SCROLLERS, ready);
    assert.ok(s.found, `${tag}: the view's content is on the page`);
    assert.equal(s.root, true, `${tag}: document.scrollingElement is the root`);
    assert.deepEqual(s.around, [], `${tag}: no box around the view's content is a scroll box`);
    assert.deepEqual(s.inner, [], `${tag}: nothing outside a sheet scrolls by itself`);
    // Where the view is taller than the screen: a scroll moves the document, and the view with it.
    if (s.end > 50) {
      const y = Math.min(300, s.end);
      const before = await page.evaluate((sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length).getBoundingClientRect().top, ready);
      await instant(page, y); await page.waitForTimeout(150);
      const moved = await page.evaluate((sel) => ({ y: window.scrollY, top: document.scrollingElement.scrollTop, at: [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length).getBoundingClientRect().top }), ready);
      assert.ok(near(moved.y, y) && near(moved.top, y), `${tag}: the document scrolled (${JSON.stringify(moved)})`);
      assert.ok(near(before - moved.at, y, 1), `${tag}: the view's content moved with it (${before} to ${moved.at})`);
      assert.deepEqual((await page.evaluate(SCROLLERS, ready)).around, [], `${tag}: scrolled, still no scroll box around the content`);
    }
  }
  assert.deepEqual(errors, [], `${engine}: no page error`);
  noSupabaseLeft(ctx, `${engine}: one page scroll`);
  await ctx.close();
}

// ── 2. The top bar, the tab bar and its fade, with the safe areas ──────────────────────────────
// Every box around the top bar that would make it the bar's containing block.
const AROUND = () => {
  const el = document.querySelector('[data-shell-bar]'); if (!el) return ['the top bar is not on the page'];
  const out = [];
  for (let a = el.parentElement; a; a = a.parentElement) {
    const cs = getComputedStyle(a); const name = `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}`;
    const set = (v) => v && !['none', 'normal', 'auto', ''].includes(v);
    for (const p of ['transform', 'translate', 'scale', 'rotate', 'filter', 'backdropFilter', 'webkitBackdropFilter', 'perspective', 'willChange', 'contain', 'containerType']) if (set(cs[p])) out.push(`${name} ${p}: ${cs[p]}`);
    if (set(cs.viewTransitionName) && !(a === document.documentElement && cs.viewTransitionName === 'root')) out.push(`${name} view-transition-name: ${cs.viewTransitionName}`);
  }
  return out;
};
const SHELL = () => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:var(--safe-top);visibility:hidden;pointer-events:none';
  const probe2 = document.createElement('div'); probe2.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:var(--safe-bottom);visibility:hidden;pointer-events:none';
  document.body.append(probe, probe2); const safeTop = probe.getBoundingClientRect().height; const safeBottom = probe2.getBoundingClientRect().height; probe.remove(); probe2.remove();
  const bar = document.querySelector('[data-shell-bar]'); const host = bar && bar.parentElement;
  const cs = bar && getComputedStyle(bar); const before = bar && getComputedStyle(bar, '::before');
  const iw = window.innerWidth; const ih = window.innerHeight;
  // What is under the status bar's area, across its width: the bar, or what is inside it.
  const covered = [8, iw / 4, iw / 2, (3 * iw) / 4, iw - 8].map((x) => { const at = document.elementFromPoint(x, Math.max(1, safeTop / 2)); return !!(at && bar && bar.contains(at)); });
  const nav = document.querySelector('[data-main-nav]'); const fade = document.querySelector('[data-tab-fade]');
  const fcs = fade && getComputedStyle(fade);
  // The page's own boxes in its main area, as far as each shows (a box that clips, a closed fold,
  // cuts what is inside it): where the first begins, where the last ends.
  const main = document.querySelector('[data-shell] .ds-main');
  const shown = (el) => {
    const r = el.getBoundingClientRect(); let top = r.top; let bottom = r.bottom;
    for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== 'visible' || acs.overflowY !== 'visible') { const b = a.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
    }
    return { width: r.width, top, bottom };
  };
  let first = Infinity; let last = 0; let firstWho = ''; let lastWho = '';
  for (const el of main.querySelectorAll('*')) {
    const r = shown(el); if (r.width < 1 || r.bottom - r.top < 1) continue;
    const ecs = getComputedStyle(el); if (ecs.visibility === 'hidden' || ecs.position === 'fixed') continue;
    const who = `${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter((c) => !/^jsx-/.test(c))[0] || ''}`;
    if (r.top < first) { first = r.top; firstWho = who; }
    if (r.bottom > last) { last = r.bottom; lastWho = who; }
  }
  return {
    y: window.scrollY, iw, ih, safeTop, safeBottom, scrolled: document.documentElement.hasAttribute('data-scrolled'),
    overscroll: [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY],
    bar: rect(bar), position: cs && cs.position, float: bar && bar.dataset.float,
    host: host ? { start: host.getAttribute('data-float-host') === 'start', onBody: host.parentElement === document.body, beforeRoot: !!(host.compareDocumentPosition(document.getElementById('__next')) & Node.DOCUMENT_POSITION_FOLLOWING) } : null,
    solid: before && before.opacity, blur: cs && (cs.backdropFilter || cs.webkitBackdropFilter || 'none'), covered,
    nav: rect(nav), fade: rect(fade), fadeZ: fcs && Number(fcs.zIndex), navZ: nav && Number(getComputedStyle(nav).zIndex), fadeHits: fcs && fcs.pointerEvents, fadeVt: fcs && fcs.viewTransitionName,
    // The tab bar and its fade in their box at the end of the body; each box a scroller of its own
    // (overflow-y auto) with no size, which scrolls nothing (components/FloatLayer.js).
    tabBox: nav ? { endBox: nav.parentElement.getAttribute('data-float-host') === 'end' && fade.parentElement === nav.parentElement, onBody: nav.parentElement.parentElement === document.body } : null,
    boxes: [...document.querySelectorAll('[data-float-host]')].map((b) => ({ where: b.getAttribute('data-float-host'), overflowY: getComputedStyle(b).overflowY, height: b.getBoundingClientRect().height, scrolls: b.scrollHeight > b.clientHeight })),
    first, firstWho, last, lastWho,
  };
};
// The strips no page content may reach: under the tab bar to the screen's bottom edge, and beside
// the lower half of the bar, outside its round ends.
const strips = (s) => (s.nav ? [
  { x: 0, y: Math.ceil(s.nav.bottom) + 1, width: s.iw, height: Math.floor(s.ih - s.nav.bottom) - 2 },
  { x: 0, y: Math.ceil(s.nav.top + TAB_H / 2), width: TAB_INSET - 4, height: Math.floor(TAB_H / 2) - 1 },
  { x: s.iw - (TAB_INSET - 4), y: Math.ceil(s.nav.top + TAB_H / 2), width: TAB_INSET - 4, height: Math.floor(TAB_H / 2) - 1 },
] : []);
const samePicture = (a, b) => {
  const x = readPng(a); const y = readPng(b);
  if (x.width !== y.width || x.height !== y.height) return { same: false, off: -1 };
  let off = 0; for (let i = 0; i < x.rgba.length; i += 4) if (Math.abs(x.rgba[i] - y.rgba[i]) + Math.abs(x.rgba[i + 1] - y.rgba[i + 1]) + Math.abs(x.rgba[i + 2] - y.rgba[i + 2]) > 6) off++;
  return { same: off === 0, off };
};

async function shellWalk(browser, engine) {
  for (const scheme of ['light', 'dark']) {
    walkStep(`${engine}: the top bar, the tab bar and its fade, ${scheme}, with the safe areas`);
    const ctx = await phone(browser, { scheme, safe: true });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    for (const [view, path, ready] of PHONE_VIEWS) {
      const tag = `${engine} ${scheme} ${view}`;
      await open(page, path, ready);
      const end = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      let rest = null; const pictures = [];
      for (const [where, y] of [['at the top', 0], ['scrolled halfway', Math.round(end / 2)], ['scrolled to the end', end]]) {
        await instant(page, y); await page.waitForTimeout(350);
        const s = await page.evaluate(SHELL);
        const at = `${tag}, ${where}`;
        assert.equal(s.safeTop, SAFE_TOP, `${at}: the top safe area stood in`); assert.equal(s.safeBottom, SAFE_BOTTOM, `${at}: the bottom safe area stood in`);
        assert.deepEqual(s.overscroll, ['auto', 'auto'], `${at}: the page bounces at its ends (the root and body keep the browser's own overscroll)`);
        // The top bar: fixed, on the body before the page, nothing around it that would carry it.
        assert.equal(s.position, 'fixed', `${at}: the top bar is fixed`);
        assert.equal(s.float, 'body', `${at}: the top bar is drawn on the body`);
        assert.deepEqual(s.host, { start: true, onBody: true, beforeRoot: true }, `${at}: in the box at the start of the body, before the Next root`);
        assert.deepEqual(await page.evaluate(AROUND), [], `${at}: nothing around the top bar`);
        for (const b of s.boxes) assert.deepEqual(b, { where: b.where, overflowY: 'auto', height: 0, scrolls: false }, `${at}: the ${b.where} box a scroller of its own with no size, scrolling nothing`);
        assert.ok(near(s.bar.top, 0) && near(s.bar.left, 0) && near(s.bar.right, s.iw) && near(s.bar.height, SAFE_TOP + BAR_ROW), `${at}: the top bar across the top of the screen, the safe area and its ${BAR_ROW}px row tall (${JSON.stringify(s.bar)})`);
        if (rest) assert.ok(near(s.bar.top, rest.bar.top) && near(s.bar.bottom, rest.bar.bottom), `${at}: the top bar where it was at the top (${JSON.stringify(s.bar)})`);
        // The status bar's area is the bar's: every point of it, across the width.
        assert.ok(s.bar.top <= 0 && s.bar.bottom >= s.safeTop, `${at}: the top bar covers the status bar's area (${s.bar.top} to ${s.bar.bottom}, the area to ${s.safeTop})`);
        assert.deepEqual(s.covered, [true, true, true, true, true], `${at}: what is under the status bar's area is the top bar`);
        // Solid at the very top, glass once the page scrolls under it.
        if (s.y <= 0) {
          assert.equal(s.scrolled, false, `${at}: not marked scrolled`);
          assert.equal(s.solid, '1', `${at}: solid at the top (its solid layer on)`); assert.equal(s.blur, 'none', `${at}: no blur at the top`);
          assert.ok(s.bar.bottom <= s.first + 0.5, `${at}: the top bar's bottom edge (${s.bar.bottom}) above the first content (${s.firstWho} at ${s.first})`);
        } else if (s.y > 8) {
          assert.equal(s.scrolled, true, `${at}: marked scrolled`);
          assert.equal(s.solid, '0', `${at}: glass once the page scrolls under it (its solid layer off)`); assert.match(s.blur, /blur/, `${at}: the glass's blur on`);
        }
        // The tab bar and the fade behind it, where the view has the tabs.
        if (view === 'a listing') {
          assert.equal(s.nav, null, `${at}: a listing has no tab bar`); assert.equal(s.fade, null, `${at}: and no fade`);
          if (where === 'scrolled to the end') assert.ok(s.last <= s.ih - s.safeBottom + 0.5, `${at}: the last content (${s.lastWho}) ends at ${s.last}, above the home indicator (${s.ih - s.safeBottom})`);
        } else {
          assert.ok(near(s.nav.bottom, s.ih - TAB_INSET - s.safeBottom) && near(s.nav.height, TAB_H), `${at}: the tab bar ${TAB_INSET}px and the safe area above the screen's bottom (${JSON.stringify(s.nav)})`);
          assert.ok(near(s.fade.bottom, s.ih) && near(s.fade.top, s.nav.top - FADE_ABOVE) && near(s.fade.left, 0) && near(s.fade.right, s.iw), `${at}: the fade from ${FADE_ABOVE}px above the tab bar to the screen's bottom edge (${JSON.stringify(s.fade)}, the bar from ${s.nav.top})`);
          assert.ok(s.fadeZ < s.navZ, `${at}: the fade under the tab bar (${s.fadeZ} under ${s.navZ})`);
          assert.equal(s.fadeHits, 'none', `${at}: the fade is never a target`);
          assert.deepEqual(s.tabBox, { endBox: true, onBody: true }, `${at}: the tab bar and the fade in their box at the end of the body`);
          assert.equal(s.fadeVt, 'rl-main-fade', `${at}: a picture of its own in a view transition`);
          if (where === 'scrolled to the end') assert.ok(s.last <= s.nav.top + 0.5, `${at}: the last content (${s.lastWho}) ends at ${s.last}, above the tab bar (${s.nav.top})`);
          const shots = []; for (const clip of strips(s)) shots.push(await page.screenshot({ clip }));
          pictures.push({ where, shots });
        }
        if (SHOTS && engine === 'WebKit' && scheme === 'light' && ['Listings', 'Circle', 'Profile'].includes(view) && where !== 'scrolled to the end') {
          await page.screenshot({ path: `${SHOTS}/${slug(view)}-390-light-${where === 'at the top' ? 'top' : 'halfway'}.png` });
        }
        if (!rest) rest = s;
      }
      // Nothing of the page shows under the tab bar or beside its round ends: the same picture at the
      // top, halfway and at the end, while the page passed under it.
      for (const p of pictures.slice(1)) {
        p.shots.forEach((shot, i) => {
          const c = samePicture(pictures[0].shots[i], shot);
          assert.ok(c.same, `${tag}: ${['under the tab bar', 'beside its left end', 'beside its right end'][i]}, ${p.where} the same as at the top (${c.off} pixels differ)`);
        });
      }
    }
    assert.deepEqual(errors, [], `${engine} ${scheme}: no page error`);
    noSupabaseLeft(ctx, `${engine} ${scheme}: the shell`);
    await ctx.close();
  }
}

// ── 3. The bounce ──────────────────────────────────────────────────────────────────────────────
// Under 1024 the root keeps the browser's own overscroll, so the page bounces at its ends and a pull
// at the top refreshes it (components/ui.js); a sheet and the command menu hold the root still while
// they are up, and every box that scrolls by itself carries its own (none or contain), so none of
// them pulls the page. No engine under test draws the bounce from a synthetic gesture (Chrome's touch
// scroll past an end leaves the picture as it was; WebKit takes no wheel on a phone): walked here are
// the rule at 320 and 390 in both themes and, in Chrome, a touch pull past the top and a push past the
// end, after which the page is at that end and the top bar, the tab bar and its fade are where they
// rest. From 1024 nothing changed: the root never drags past its last element.
const OVERSCROLL = () => {
  const name = (a) => `${a.tagName.toLowerCase()}${typeof a.className === 'string' && a.className ? `.${a.className.trim().split(/\s+/).filter((c) => !/^jsx-/.test(c)).join('.')}` : ''}`;
  const own = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (!['auto', 'scroll'].includes(cs.overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 1 && el.getClientRects().length) own.push(`${name(el)} ${cs.overscrollBehaviorY}`);
  }
  const of = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).overscrollBehaviorY : null; };
  return { root: of('html'), body: of('body'), sheet: of('[data-sheet] .rl-sh-scroll'), list: of('.cm-list'), own };
};
const RESTING = () => {
  const r = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return [b.top, b.bottom, b.left, b.right]; };
  return { y: window.scrollY, end: document.documentElement.scrollHeight - window.innerHeight, bar: r('[data-shell-bar]'), nav: r('[data-main-nav]'), fade: r('[data-tab-fade]') };
};
async function bounceWalk(browser, engine) {
  for (const scheme of ['light', 'dark']) {
    for (const width of [320, 390]) {
      const tag = `${engine} ${scheme} ${width}`;
      walkStep(`${tag}: the bounce`);
      const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce', userAgent: UA_PHONE, isMobile: true, hasTouch: true });
      await blockSupabase(ctx); await ctx.addInitScript(SAFE_AREAS);
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await open(page, '/dashboard', '[data-listing-card]');
      const o = await page.evaluate(OVERSCROLL);
      assert.deepEqual([o.root, o.body], ['auto', 'auto'], `${tag}: the page bounces at its ends`);
      assert.deepEqual(o.own, [], `${tag}: nothing else scrolls by itself`);
      if (engine === 'Chrome') {
        // A touch pull past the top, then a push past the end: the page at that end, each bar where it rests.
        const cdp = await ctx.newCDPSession(page);
        const rest = await page.evaluate(RESTING);
        // The control: the same gesture mid page moves the page, so the pulls below are real input.
        const mid = Math.round(rest.end / 2);
        await instant(page, mid); await page.waitForTimeout(150);
        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(width / 2), y: 360, yDistance: -200, speed: 800, gestureSourceType: 'touch', preventFling: true });
        await page.waitForTimeout(400);
        const moved = (await page.evaluate(RESTING)).y - mid;
        assert.ok(moved > 100, `${tag}: a touch push mid page scrolls it (${moved}px)`);
        for (const [where, y, pull] of [['pulled past the top', 0, 400], ['pushed past the end', rest.end, -400]]) {
          await instant(page, y); await page.waitForTimeout(150);
          await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(width / 2), y: 360, yDistance: pull, speed: 800, gestureSourceType: 'touch', preventFling: true });
          await page.waitForTimeout(400);
          const s = await page.evaluate(RESTING);
          assert.ok(near(s.y, y, 1), `${tag}, ${where}: the page at that end (${s.y}, want ${y})`);
          for (const k of ['bar', 'nav', 'fade']) assert.ok(s[k].every((v, i) => near(v, rest[k][i])), `${tag}, ${where}: the ${k === 'bar' ? 'top bar' : k === 'nav' ? 'tab bar' : 'fade'} where it rests (${s[k]} at rest ${rest[k]})`);
        }
        await cdp.detach();
      }
      if (scheme === 'light') {
        // A sheet up: the root and the sheet's scroller hold still; every box that scrolls carries its own.
        await instant(page, 200); await page.waitForTimeout(150);
        await page.locator('[data-sort-open]:visible').first().click(); await page.locator('[data-sort-sheet]').waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
        const sh = await page.evaluate(OVERSCROLL);
        assert.deepEqual([sh.root, sh.sheet], ['none', 'none'], `${tag}: with the Sort sheet up, the page and the sheet hold still at their ends`);
        assert.deepEqual(sh.own.filter((x) => !/ (none|contain)$/.test(x)), [], `${tag}: with the Sort sheet up, each box that scrolls keeps its own overscroll (${sh.own})`);
        await page.keyboard.press('Escape'); await page.locator('[data-sort-sheet]').waitFor({ state: 'detached', timeout: 15000 }); await page.waitForTimeout(400);
        assert.equal((await page.evaluate(OVERSCROLL)).root, 'auto', `${tag}: the sheet gone, the page bounces again`);
        // The command menu: the root still, its list contained.
        await page.locator('[data-command-open="phone"]').click(); await page.locator('.cm-list').waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
        const cm = await page.evaluate(OVERSCROLL);
        assert.deepEqual([cm.root, cm.sheet, cm.list], ['none', 'none', 'contain'], `${tag}: with the command menu up, the page holds still and its list never pulls it`);
        assert.deepEqual(cm.own.filter((x) => !/ (none|contain)$/.test(x)), [], `${tag}: with the command menu up, each box that scrolls keeps its own overscroll (${cm.own})`);
        await page.keyboard.press('Escape'); await page.locator('.cm-list').waitFor({ state: 'detached', timeout: 15000 }); await page.waitForTimeout(400);
        assert.equal((await page.evaluate(OVERSCROLL)).root, 'auto', `${tag}: the menu gone, the page bounces again`);
      }
      assert.deepEqual(errors, [], `${tag}: no page error`);
      noSupabaseLeft(ctx, `${tag}: the bounce`);
      await ctx.close();
    }
  }
}

// ── 4. The Landlord card's actions ─────────────────────────────────────────────────────────────
// On a listing at 320, 390 and 1440, light and dark: Download PDF and Copy text are two quiet buttons
// under Send (components/dashboard/ListingView.js lv-ll-acts), as the Profile's logo actions: side by
// side and as wide as each other, 44px high, 8px apart and 8px under Send, Send's radius, the
// buttons' padding (12px under 345, as the page's gutter), a faint ink tone, no underline, each
// label inside its button's padding. Copy text reads
// Copied in place (nothing moves) and Copy text again after. At 1440 the root still never bounces.
const LANDLORD = () => {
  const card = document.querySelector('#report'); const send = card.querySelector('[data-send-open]'); const acts = card.querySelector('[data-landlord-acts]');
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
  const btns = acts ? [...acts.children] : [];
  return {
    send: r(send), sendRadius: getComputedStyle(send).borderRadius, under: acts && acts.previousElementSibling && acts.previousElementSibling.contains(send),
    root: getComputedStyle(document.documentElement).overscrollBehaviorY, ink: getComputedStyle(document.documentElement).getPropertyValue('--c-ink-rgb').trim(),
    btns: btns.map((b) => {
      const cs = getComputedStyle(b); const box = b.getBoundingClientRect(); const px = (v) => parseFloat(v) || 0;
      // The label inside the button's content box: within its padding, never into it.
      const label = (b.querySelector('[data-pending] > span') || b).getBoundingClientRect();
      const inside = [box.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), box.right - px(cs.borderRightWidth) - px(cs.paddingRight)];
      return { tag: b.tagName.toLowerCase(), text: b.textContent, cls: b.className.split(' ').filter((c) => !/^jsx-/.test(c)).join('.'), ...r(b), radius: cs.borderRadius, pad: [cs.paddingLeft, cs.paddingRight], bg: cs.backgroundColor, deco: [cs.textDecorationLine, ...[...b.querySelectorAll('*')].map((k) => getComputedStyle(k).textDecorationLine)].filter((d) => d !== 'none'), label: [label.left, label.right], inside, fits: label.left >= inside[0] - 0.5 && label.right <= inside[1] + 0.5 };
    }),
  };
};
async function landlordWalk(browser, engine) {
  for (const scheme of ['light', 'dark']) {
    for (const width of [320, 390, 1440]) {
      const tag = `${engine} ${scheme} ${width}`;
      walkStep(`${tag}: the Landlord card's actions`);
      const phoneSized = width < 1024;
      const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width, height: phoneSized ? 844 : 900 }, colorScheme: scheme, reducedMotion: 'reduce', ...(phoneSized ? { userAgent: UA_PHONE, isMobile: true, hasTouch: true } : {}) });
      await blockSupabase(ctx);
      if (engine === 'Chrome') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await open(page, '/listing/L1', '#report [data-landlord-acts]');
      const l = await page.evaluate(LANDLORD);
      assert.equal(l.root, phoneSized ? 'auto' : 'none', `${tag}: ${phoneSized ? 'the page bounces at its ends' : 'the root never drags past its last element'}`);
      assert.equal(l.under, true, `${tag}: the two buttons come straight after Send's row`);
      assert.deepEqual(l.btns.map((b) => [b.tag, b.text, b.cls]), [['button', 'Download PDF', 'ds-btn.ds-btn-quiet'], ['button', 'Copy text', 'ds-btn.ds-btn-quiet']], `${tag}: Download PDF and Copy text, two quiet buttons`);
      const [a, b] = l.btns;
      for (const x of l.btns) {
        assert.ok(near(x.height, 44), `${tag}: ${x.text} 44px high (${x.height})`);
        assert.equal(x.radius, l.sendRadius, `${tag}: ${x.text} has Send's radius`);
        const pad = width < 345 ? '12px' : '16px'; // the page's own step under 345 (components/ui.js)
        assert.deepEqual(x.pad, [pad, pad], `${tag}: ${x.text} the buttons' padding, ${pad}`);
        assert.equal(x.bg, `rgba(${l.ink.split(/\s*,\s*/).join(', ')}, 0.05)`, `${tag}: ${x.text} on a faint ink tone`);
        assert.deepEqual(x.deco, [], `${tag}: ${x.text} never underlined`);
        assert.ok(x.fits, `${tag}: ${x.text}'s label inside its button's padding (${x.label} in ${x.inside})`);
      }
      assert.ok(near(a.top, b.top) && near(a.width, b.width), `${tag}: side by side, as wide as each other (${a.width}, ${b.width})`);
      assert.ok(near(b.left - a.right, 8), `${tag}: 8px apart (${b.left - a.right})`);
      assert.ok(near(a.top - l.send.bottom, 8), `${tag}: 8px under Send (${a.top - l.send.bottom})`);
      assert.ok(near(a.left, l.send.left) && near(b.right, l.send.right), `${tag}: the pair as wide as Send (${a.left} to ${b.right}, Send ${l.send.left} to ${l.send.right})`);
      if (scheme === 'light') {
        const copy = page.locator('#report [data-landlord-acts] > button').nth(1);
        await copy.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(200);
        const before = await page.evaluate(LANDLORD);
        await copy.click();
        await page.waitForFunction(() => document.querySelectorAll('#report [data-landlord-acts] > button')[1].textContent === 'Copied', null, { timeout: 15000 }).catch(() => {});
        const after = await page.evaluate(LANDLORD);
        assert.deepEqual(after.btns.map((x) => x.text), ['Download PDF', 'Copied'], `${tag}: Copy text reads Copied`);
        after.btns.forEach((x, i) => assert.ok(['top', 'left', 'width', 'height'].every((k) => near(x[k], before.btns[i][k])), `${tag}: ${before.btns[i].text} in place while Copied shows (${JSON.stringify(x)})`));
        if (width === 390) {
          await page.waitForFunction(() => document.querySelectorAll('#report [data-landlord-acts] > button')[1].textContent === 'Copy text', null, { timeout: 15000 }).catch(() => {});
          assert.equal(await copy.textContent(), 'Copy text', `${tag}: and Copy text again after`);
        }
      }
      assert.deepEqual(errors, [], `${tag}: no page error`);
      noSupabaseLeft(ctx, `${tag}: the Landlord card`);
      await ctx.close();
    }
  }
}

async function walk(browser, engine) {
  await scrollWalk(browser, engine);
  await shellWalk(browser, engine);
  await bounceWalk(browser, engine);
  await landlordWalk(browser, engine);
}

test('the phone shell: one page scroll, the top bar, the tab bar and its fade, walked in WebKit', { timeout: 600000 }, async () => {
  const webkit = requireWebkit();
  const browser = await webkit.launch();
  try { await walk(browser, 'WebKit'); } finally { await browser.close(); }
});

test('the phone shell: one page scroll, the top bar, the tab bar and its fade, walked in Chrome', { timeout: 600000, skip: !haveChrome && 'Google Chrome is not installed' }, async () => {
  const browser = await pw.chromium.launch({ executablePath: chromeBin });
  try { await walk(browser, 'Chrome'); } finally { await browser.close(); }
});
