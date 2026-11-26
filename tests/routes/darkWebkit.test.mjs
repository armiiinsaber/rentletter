// The dark theme (components/themeMode.js), walked for real in WebKit (Safari's engine) and in
// Chrome on the fake stack, with the device set to dark and nothing chosen:
//   1. Eight screens at 390 and 1440: the dashboard, a listing, the send sheet, the command menu,
//      the tenant's profile, the homepage, Circle and Profile. Each in the dark tokens (the root's
//      --c-paper and color-scheme, the canvas the dark ground, the browser's theme-color the dark
//      ground), nothing sideways, and the page read in place (tests/helpers/darkAudit.mjs): no
//      text under 4.5 to 1 against what is under it, no icon, tick or dot under 3 to 1, and no
//      surface left light but the theme's own ink fill and a logo's plate. The text wraps with no
//      layout break, measured as the wrapped text walk measures it (tests/helpers/textLines.mjs).
//   2. What stays light whatever the device or the choice: the landlord's report, from its first
//      frame, its theme-color too; the page printed; a subtree held light (the report's preview
//      on Profile).
//   3. The choice, on a light device: Dark on Profile applies at once in the same document (no
//      reload), stays on reload from the first frame (no flash), holds on the next screen, and
//      Automatic gives the device back; the tenant's choice the same; with storage that throws the
//      pages open in the device's theme and the choice still applies to the page.
//   4. A realtor's logo sits on a white plate in dark, as it is in light.
// With DARK_SHOTS set to a folder, the Chrome walk saves the dark dashboard (1440 and 390), the
// listing (1440), the tenant profile (1440 and 390) and the homepage (1440) there.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked, and no request leaves the browser
// for a supabase.co host (tests/helpers/noSupabase.mjs). A WebKit walk fails, never skips, when the
// binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';
import { THEME_AUDIT } from '../helpers/darkAudit.mjs';
import { readPage, pageProblems } from '../helpers/textLines.mjs';
import { LIGHT, DARK } from '../../components/theme.js';

const PORT = 3195; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SHOTS = process.env.DARK_SHOTS || '';
const rgbOf = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;

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
  for (const u of ['/dashboard', '/listing/L1', '/profile', '/circle', '/my-application', '/']) await fetch(`${BASE}${u}`).catch(() => null);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const f = (path) => fetch(`${BASE}${path}`).then((r) => r.json());
// What the first animation frame of a document saw, before its first paint: the theme then.
const FIRST_FRAME = () => { requestAnimationFrame(() => { const r = document.documentElement; window.__firstFrame = { theme: r.getAttribute('data-theme'), paper: getComputedStyle(r).getPropertyValue('--c-paper').trim(), canvas: getComputedStyle(r).backgroundColor }; }); };
const context = async (browser, width, scheme, extra = {}) => {
  const phone = width < 600;
  const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width, height: phone ? 844 : 1000 }, colorScheme: scheme, reducedMotion: 'reduce', ...(phone ? { userAgent: UA_PHONE, isMobile: true, hasTouch: true } : {}), ...extra });
  await blockSupabase(ctx); await ctx.addInitScript(FIRST_FRAME);
  return ctx;
};
const settle = async (page, ms = 400) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
const visible = (page, sel) => page.locator(sel).filter({ visible: true }).first();
const read = (page) => page.evaluate(() => {
  const r = document.documentElement; const cs = getComputedStyle(r);
  return { attr: r.getAttribute('data-theme'), lock: r.hasAttribute('data-theme-lock'), paper: cs.getPropertyValue('--c-paper').trim(), scheme: cs.colorScheme, canvas: cs.backgroundColor, sideways: r.scrollWidth - window.innerWidth,
    metas: Object.fromEntries([...document.querySelectorAll('meta[name=theme-color]')].map((m) => [m.media || 'all', m.content])), stored: (() => { try { return window.localStorage.getItem('rl-theme'); } catch (e) { return 'blocked'; } })() };
});
const tenantIn = async (ctx, page, query) => {
  const { token } = await f(`/__fake/tenant?${query}`);
  await ctx.addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/my-application', { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-vault-documents]').waitFor({ timeout: 60000 });
};
// The eight screens: how to reach each, its ground, and its screenshot name.
const SCREENS = [
  { name: 'the dashboard', shot: 'dashboard', go: async (page) => { await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-listing-card="L1"]').first().waitFor({ timeout: 60000 }); } },
  { name: 'a listing', shot: 'listing', go: async (page) => { await page.goto('/listing/L1', { waitUntil: 'load', timeout: 120000 }); await page.locator('#report').waitFor({ timeout: 60000 }); } },
  { name: 'the send sheet', go: async (page) => { await f('/__fake/state?unsent=L1'); await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await visible(page, '[data-listing-card="L1"] [data-card-action="send"]').click(); await page.locator('[data-send-sheet="L1"]').waitFor({ timeout: 30000 }); }, after: () => f('/__fake/state?unsent=0') },
  { name: 'the command menu', go: async (page) => { await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await visible(page, '[data-command-open]').click(); await page.locator('[data-command-menu]').waitFor({ timeout: 15000 }); await page.locator('[data-command-input]').fill('a'); } },
  { name: 'the tenant profile', shot: 'tenant-profile', ground: 'paperDeep', go: (page, ctx) => tenantIn(ctx, page, 'who=7&docs=1&personal=1') },
  { name: 'the homepage', shot: 'home', go: async (page) => { await page.goto('/', { waitUntil: 'load', timeout: 120000 }); } },
  { name: 'Circle', go: async (page) => { await page.goto('/circle', { waitUntil: 'load', timeout: 120000 }); await page.locator('.cv').first().waitFor({ timeout: 60000 }); } },
  { name: 'Profile', go: async (page) => { await page.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await page.locator('#profile-field-full_name').waitFor({ timeout: 60000 }); } },
];
const SHOT_AT = { dashboard: [1440, 390], listing: [1440], 'tenant-profile': [1440, 390], home: [1440] };

async function screensWalk(browser, engine) {
  for (const width of [390, 1440]) {
    const ctx = await context(browser, width, 'dark');
    for (const s of SCREENS) {
      walkStep(`${s.name} at ${width}, dark`);
      const tag = `${engine}, ${s.name} at ${width}`;
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await s.go(page, ctx); await settle(page, 500);
      const r = await read(page); const ground = DARK[s.ground || 'paper'];
      assert.equal(r.attr, null, `${tag}: nothing chosen, the device decides`);
      assert.equal(r.paper, DARK.paper, `${tag}: the dark tokens`);
      assert.equal(r.scheme, 'dark', `${tag}: color-scheme dark, so the form controls match`);
      assert.equal(r.canvas, rgbOf(ground), `${tag}: the canvas is the dark ground`);
      assert.equal(r.metas['(prefers-color-scheme: dark)'], ground, `${tag}: the phone's bars in the dark ground`);
      assert.ok(r.sideways <= 0, `${tag}: nothing sideways (${r.sideways})`);
      const a = await page.evaluate(THEME_AUDIT, { minText: 4.5, minMark: 3 });
      assert.deepEqual(a.text, [], `${tag}: every text 4.5 to 1 or better`);
      assert.deepEqual(a.marks, [], `${tag}: every icon, tick and dot 3 to 1 or better`);
      assert.deepEqual(a.light, [], `${tag}: nothing left light`);
      // The text wraps as it does in light: no layout break (tests/helpers/textLines.mjs, the wrapped
      // text walk's own measure).
      assert.deepEqual(pageProblems(await readPage(page)), [], `${tag}: no line break left a word alone, nothing outside its block`);
      assert.deepEqual(errors, [], `${tag}: no page error`);
      if (SHOTS && engine === 'Chrome' && s.shot && SHOT_AT[s.shot].includes(width)) await page.screenshot({ path: join(SHOTS, `dark-${s.shot}-${width}.png`), fullPage: true });
      if (s.after) await s.after();
      await page.close();
    }
    noSupabaseLeft(ctx, `${engine} at ${width}`);
    await ctx.close();
  }
}

async function lightHeldWalk(browser, engine) {
  walkStep('what stays light');
  const ctx = await context(browser, 1440, 'dark');
  await ctx.addInitScript(() => { try { window.localStorage.setItem('rl-theme', 'dark'); } catch (e) { /* none */ } });
  const page = await ctx.newPage();
  // The landlord's report: light from its first frame, whatever the device and the choice.
  await page.goto('/r/demo-demo-carlaw', { waitUntil: 'load', timeout: 120000 }); await settle(page);
  const first = await page.evaluate(() => window.__firstFrame);
  assert.deepEqual(first, { theme: 'light', paper: LIGHT.paper, canvas: rgbOf(LIGHT.paper) }, `${engine}: the report's first frame is light`);
  const r = await read(page);
  assert.equal(r.stored, 'dark', 'the choice is dark');
  assert.deepEqual({ attr: r.attr, lock: r.lock, paper: r.paper, scheme: r.scheme }, { attr: 'light', lock: true, paper: LIGHT.paper, scheme: 'light' }, `${engine}: the report stays light`);
  assert.deepEqual(r.metas, { '(prefers-color-scheme: light)': LIGHT.paper, '(prefers-color-scheme: dark)': LIGHT.paper }, `${engine}: the report's bars light`);
  // Printed, a screen in the dark theme is light.
  await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await settle(page);
  assert.equal((await read(page)).paper, DARK.paper, `${engine}: the dashboard in dark on screen`);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-paper').trim()), LIGHT.paper, `${engine}: printed, light`);
  await page.emulateMedia({ media: 'screen' });
  // The report's preview on Profile is held light, as the landlord sees it.
  await page.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await settle(page);
  const preview = await page.evaluate(() => { const el = document.querySelector('[data-preview="report"] .pv-report'); return el ? getComputedStyle(el).backgroundColor : null; });
  if (preview !== null) assert.equal(preview, rgbOf(LIGHT.card), `${engine}: the report's preview is light`);
  // A realtor's logo on a white plate in dark, as it is in light.
  const plate = (pg) => pg.evaluate(() => { const i = document.createElement('img'); i.className = 'rl-logo-plate'; i.style.height = '40px'; document.querySelector('main, #__next').appendChild(i); const cs = getComputedStyle(i); const out = { bg: cs.backgroundColor, pad: cs.paddingTop }; i.remove(); return out; });
  assert.deepEqual(await plate(page), { bg: rgbOf(DARK.plate), pad: '4px' }, `${engine}: the logo's plate in dark`);
  await ctx.close();
  const day = await context(browser, 1440, 'light'); const p2 = await day.newPage();
  await p2.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await settle(p2);
  assert.deepEqual(await plate(p2), { bg: 'rgba(0, 0, 0, 0)', pad: '0px' }, `${engine}: no plate in light`);
  await day.close();
}

async function choiceWalk(browser, engine) {
  walkStep('the choice');
  const ctx = await context(browser, 1440, 'light');
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-theme-choice="realtor"]').waitFor({ timeout: 60000 }); await settle(page);
  assert.equal((await read(page)).paper, LIGHT.paper, `${engine}: a light device, nothing chosen: light`);
  const pressed = () => page.locator('[data-theme-choice] [data-theme-pick]').evaluateAll((els) => els.map((e) => `${e.dataset.themePick}:${e.getAttribute('aria-pressed')}`));
  assert.deepEqual(await pressed(), ['auto:true', 'light:false', 'dark:false']);
  await page.evaluate(() => { window.__sameDocument = true; });
  await page.locator('[data-theme-pick="dark"]').click(); await page.waitForTimeout(100);
  let r = await read(page);
  assert.equal(await page.evaluate(() => window.__sameDocument), true, `${engine}: no reload`);
  assert.deepEqual({ attr: r.attr, paper: r.paper, scheme: r.scheme, stored: r.stored }, { attr: 'dark', paper: DARK.paper, scheme: 'dark', stored: 'dark' }, `${engine}: Dark at once`);
  assert.deepEqual(r.metas, { '(prefers-color-scheme: light)': DARK.paper, '(prefers-color-scheme: dark)': DARK.paper }, `${engine}: the bars follow the choice`);
  assert.deepEqual(await pressed(), ['auto:false', 'light:false', 'dark:true']);
  await page.reload({ waitUntil: 'load' }); await settle(page);
  assert.deepEqual(await page.evaluate(() => window.__firstFrame), { theme: 'dark', paper: DARK.paper, canvas: rgbOf(DARK.paper) }, `${engine}: dark from the first frame on reload, no flash`);
  await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 }); await settle(page);
  assert.equal(await page.evaluate(() => window.__firstFrame.theme), 'dark', `${engine}: the next screen too`);
  await page.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await settle(page);
  await page.locator('[data-theme-pick="auto"]').click(); await page.waitForTimeout(100);
  r = await read(page);
  assert.deepEqual({ attr: r.attr, paper: r.paper, stored: r.stored }, { attr: null, paper: LIGHT.paper, stored: null }, `${engine}: Automatic gives the device back`);
  // The tenant's profile: the same choice, in Contact. A request the Profile page still had open when
  // it was left is not this screen's.
  await tenantIn(ctx, page, 'who=7&docs=1'); await settle(page); errors.length = 0;
  await page.locator('[data-theme-choice="tenant"] [data-theme-pick="dark"]').click(); await page.waitForTimeout(100);
  r = await read(page);
  assert.deepEqual({ attr: r.attr, paper: r.paper, canvas: r.canvas }, { attr: 'dark', paper: DARK.paper, canvas: rgbOf(DARK.paperDeep) }, `${engine}: the tenant's Dark at once`);
  await page.locator('[data-theme-choice="tenant"] [data-theme-pick="light"]').click(); await page.waitForTimeout(100);
  assert.equal((await read(page)).paper, LIGHT.paper, `${engine}: the tenant's Light`);
  await page.locator('[data-theme-choice="tenant"] [data-theme-pick="auto"]').click();
  assert.deepEqual(errors, [], `${engine}: no page error`);
  await ctx.close();
  // Storage that throws: the device's theme, and a choice still applies to the page.
  const dark = await context(browser, 390, 'dark');
  await dark.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage is blocked'); } }); });
  const p3 = await dark.newPage(); const errs3 = []; p3.on('pageerror', (e) => errs3.push(String(e)));
  await p3.goto('/profile', { waitUntil: 'load', timeout: 120000 }); await p3.locator('[data-theme-choice="realtor"]').waitFor({ timeout: 60000 }); await settle(p3);
  assert.equal((await read(p3)).paper, DARK.paper, `${engine}: storage blocked, the device's dark`);
  await p3.locator('[data-theme-pick="light"]').scrollIntoViewIfNeeded(); await p3.locator('[data-theme-pick="light"]').click(); await p3.waitForTimeout(100);
  assert.equal((await read(p3)).paper, LIGHT.paper, `${engine}: storage blocked, Light still applies to the page`);
  assert.deepEqual(errs3, [], `${engine}: storage blocked, no page error`);
  await dark.close();
}

async function walk(browser, engine) {
  await screensWalk(browser, engine);
  await lightHeldWalk(browser, engine);
  await choiceWalk(browser, engine);
}

test('the dark theme, the light pages and the choice, walked in WebKit', { timeout: 600000 }, async () => {
  const webkit = requireWebkit();
  const browser = await webkit.launch();
  try { await walk(browser, 'WebKit'); } finally { await browser.close(); }
});

test('the dark theme, the light pages and the choice, walked in Chrome', { timeout: 600000, skip: !haveChrome && 'Google Chrome is not installed' }, async () => {
  const browser = await pw.chromium.launch({ executablePath: chromeBin });
  try { await walk(browser, 'Chrome'); } finally { await browser.close(); }
});
