// One reveal per screen, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone user
// agent, on the real pages over the fake stack in a PRODUCTION build (tests/helpers/fakeNextServer.mjs).
// Every frame of each load is sampled in the page (requestAnimationFrame, about every 16ms):
//   1. No part of a realtor screen shows before the rest: from a tap, a listing seen for the first
//      time and the dashboard each go from the screen before, through the door Loader, straight to
//      the complete screen; no frame holds some of its sections without the others, or a section
//      beside the Loader. Data requests wait 600ms each, so the Loader has to show.
//   2. A screen ready within DOOR.loaderDelayMs never shows the Loader (the profile, its code
//      fetched while the dashboard was idle, on a quick network).
//   3. A screen seen recently shows at once with no Loader (back to the dashboard from a listing),
//      and refreshes in the background (its page data is still asked for).
//   4. A failed load shows the line and the pill in the Loader's place, the header and the way
//      back still there.
//   5. From sign in to the dashboard one door: the opening screen comes up with the tap and stays,
//      every frame, until the dashboard is complete; the dashboard's own Loader never shows.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { register } from 'node:module';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
register('../helpers/loader.mjs', import.meta.url);
const { DOOR } = await import('../../lib/motion.js');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3174; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const NETWORK_MS = 600;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const run = (cmd, args, env) => new Promise((res, rej) => { const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)))); });
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return;
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await run(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' });
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/listing/L1', '/listing/L2', '/profile', '/signin']) await fetch(`${BASE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

// The sampler, from the first script on: every frame, which of the screen's sections are on view,
// whether a door (a Loader, or the opening screen) is on view, and where.
const SAMPLER = () => {
  const SECTIONS = {
    '/dashboard': ['section.dash-ink', '.dash-card-int', '#people'],
    // Each screen's own: the address changes with the tap, while the screen before is still on view.
    listing: ['section.rl-card h1.t-d1', 'section.rl-card h2.t-d2', '[id^="applicant-"]'],
    '/profile': ['h1.t-d1', '#branding input'],
  };
  const hidden = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return true; } return false; };
  const onView = (el) => el.getClientRects().length > 0 && !hidden(el) && !el.closest('[data-edge-beneath]');
  const visible = (sel) => [...document.querySelectorAll(sel)].some(onView);
  const s = { frames: [], on: false };
  window.__reveal = s;
  const tick = () => {
    if (s.on) {
      const path = location.pathname; const key = /^\/listing\//.test(path) ? 'listing' : path;
      const want = SECTIONS[key] || [];
      const shown = want.filter((sel) => visible(sel)).length;
      const door = [...document.querySelectorAll('[data-loader]:not([data-leaving])')].some(onView);
      const opening = document.documentElement.classList.contains('rl-appstart-on') && !!document.querySelector('[data-app-start]:not([data-phase="out"])');
      const covering = document.documentElement.classList.contains('rl-appstart-on') && !!document.querySelector('[data-app-start]'); // fading out included
      const failed = [...document.querySelectorAll('[data-load-failed]')].some(onView);
      s.frames.push({ t: Math.round(performance.now()), path, shown, of: want.length, door, opening, covering, failed });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const startSampling = (page) => page.evaluate(() => { window.__reveal.frames = []; window.__reveal.on = true; });
const frames = (page) => page.evaluate(() => { window.__reveal.on = false; return window.__reveal.frames; });

async function phone(browser, { slow = false } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(SAMPLER);
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  if (slow) await ctx.route(/\/_next\/data\/|\/api\/assistant\/signals|\/api\/listings\/applicants/, async (r) => { await new Promise((res) => setTimeout(res, NETWORK_MS)); await r.continue().catch(() => {}); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const tapOn = async (page, locator) => { const b = await locator.boundingBox({ timeout: 20000 }); await page.touchscreen.tap(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20)); };
const complete = (f, path) => f.path.startsWith(path) && f.shown === f.of && !f.door && !f.opening && !f.failed;
async function until(page, path, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const fr = await page.evaluate(() => window.__reveal.frames.slice(-1)[0] || null); if (fr && complete(fr, path)) { await page.waitForTimeout(250); return true; } await page.waitForTimeout(50); }
  return false;
}
// The frames of one load, from the tap: only the screen before, the door, and the complete screen.
function oneReveal(fr, path, tag) {
  const there = fr.filter((f) => f.path.startsWith(path));
  const partial = there.filter((f) => f.shown > 0 && (f.shown < f.of || f.door));
  assert.deepEqual(partial.slice(0, 3), [], `${tag}: no part of ${path} on view before the rest (${partial.length} frames)`);
  const first = there.findIndex((f) => complete(f, path));
  assert.ok(first >= 0, `${tag}: ${path} completes`);
  assert.ok(there.slice(first).every((f) => complete(f, path)), `${tag}: once complete, nothing goes back to waiting`);
  return { frames: fr.length, doorFrames: fr.filter((f) => f.door).length, completeAt: there[first].t - fr[0].t };
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const out = [];
  try {
    // 1 and 3. A listing seen for the first time, then back to the dashboard seen moments ago.
    {
      const { ctx, page, errors } = await phone(browser, { slow: true });
      await page.goto('/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
      await startSampling(page);
      await tapOn(page, page.locator('.dash-card-int').filter({ hasText: '210 Carlaw' }).first());
      assert.ok(await until(page, '/listing/'), `${tag}: the listing arrives`);
      const r1 = oneReveal(await frames(page), '/listing/', `${tag} dashboard to listing`);
      assert.ok(r1.doorFrames > 0, `${tag}: on a slow network the door holds the listing's place`);
      out.push(`listing, first visit: door ${r1.doorFrames} frames, complete at ${r1.completeAt}ms, ${r1.frames} frames sampled, 0 partial`);
      let refreshed = false; page.on('request', (r) => { if (/_next\/data\/.*\/dashboard\.json/.test(r.url())) refreshed = true; });
      await startSampling(page);
      await tapOn(page, page.getByText('All listings', { exact: true }).first());
      assert.ok(await until(page, '/dashboard'), `${tag}: the dashboard arrives`);
      const fr = await frames(page);
      const r3 = oneReveal(fr, '/dashboard', `${tag} back to the dashboard`);
      assert.equal(r3.doorFrames, 0, `${tag}: a screen seen recently shows with no Loader`);
      assert.ok(r3.completeAt < 200, `${tag}: at once (${r3.completeAt}ms)`);
      await page.waitForTimeout(NETWORK_MS + 400);
      assert.ok(refreshed, `${tag}: and refreshes in the background`);
      out.push(`dashboard, seen: no door, complete at ${r3.completeAt}ms, refreshed behind`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 1. The dashboard, not seen yet: from a listing loaded in full.
    {
      const { ctx, page, errors } = await phone(browser, { slow: true });
      await page.goto('/listing/L1', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
      await startSampling(page);
      await tapOn(page, page.getByText('All listings', { exact: true }).first());
      assert.ok(await until(page, '/dashboard'), `${tag}: the dashboard arrives`);
      const r = oneReveal(await frames(page), '/dashboard', `${tag} listing to dashboard`);
      assert.ok(r.doorFrames > 0, `${tag}: the door holds the dashboard's place`);
      out.push(`dashboard, first visit: door ${r.doorFrames} frames, complete at ${r.completeAt}ms, 0 partial`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 2. Ready within DOOR.loaderDelayMs: the profile on a quick network, its code fetched while idle.
    {
      const { ctx, page, errors } = await phone(browser);
      await page.goto('/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
      await startSampling(page);
      await tapOn(page, page.locator('a[aria-label="Your profile"]').first());
      assert.ok(await until(page, '/profile'), `${tag}: the profile arrives`);
      const fr = await frames(page);
      const r = oneReveal(fr, '/profile', `${tag} dashboard to profile`);
      assert.ok(r.completeAt < DOOR.loaderDelayMs, `${tag}: ready within ${DOOR.loaderDelayMs}ms (${r.completeAt}ms)`);
      assert.equal(r.doorFrames, 0, `${tag}: so the Loader never shows`);
      out.push(`profile, quick: no door, complete at ${r.completeAt}ms`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 4. A failed load: the applicants never answer, twice.
    {
      const { ctx, page, errors } = await phone(browser);
      let n = 0; await ctx.route(/\/api\/listings\/applicants\?listingId=L2/, async (r) => { if (++n <= 2) return; await r.continue(); });
      await page.goto('/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
      await tapOn(page, page.locator('.dash-card-int').filter({ hasText: '88 Harbour' }).first());
      await page.locator('[data-load-failed]').waitFor({ timeout: 15000 });
      assert.match(await page.locator('[data-load-failed]').innerText(), /Couldn’t load this\.\s*Try again/);
      assert.equal(await page.locator('[data-screen-loading], [data-route-loading]').count(), 0, `${tag}: the line in the Loader's place`);
      assert.equal(await page.getByText('All listings', { exact: true }).count(), 1, `${tag}: the way back still there`);
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.locator('[id^="applicant-"]').first().waitFor({ timeout: 10000 });
      out.push('failed applicants: the line and the pill, then the listing');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 5. Sign in to the dashboard: one door, the opening screen's, until the dashboard is complete.
    {
      const { ctx, page, errors } = await phone(browser, { slow: true });
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
      const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: now + 3600 })}.c2ln`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user: { id: 'u1', aud: 'authenticated', email: 'sarah@example.com', app_metadata: {}, user_metadata: {} } };
      await ctx.unroute(/supabase\.co\//);
      await ctx.route(/supabase\.co\//, (r) => (/auth\/v1\/token/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }) : r.abort()));
      await page.goto('/signin', { waitUntil: 'networkidle' });
      await page.locator('#email').fill('sarah@example.com'); await page.locator('#password').fill('password1');
      await startSampling(page);
      await tapOn(page, page.locator('form button[type=submit]'));
      assert.ok(await until(page, '/dashboard'), `${tag}: the dashboard arrives`);
      const fr = await frames(page);
      const firstOpening = fr.findIndex((f) => f.opening);
      const done = fr.findIndex((f) => complete(f, '/dashboard'));
      assert.ok(firstOpening >= 0 && done > firstOpening, `${tag}: the opening screen comes up after the tap`);
      // The opening screen covers every frame (while it fades out over the finished dashboard too).
      const gap = fr.slice(firstOpening, done).filter((f) => !f.covering);
      assert.deepEqual(gap.slice(0, 3), [], `${tag}: one door, every frame, until the dashboard is complete (${gap.length} frames without it)`);
      assert.ok(fr.slice(0, done).every((f) => !f.path.startsWith('/dashboard') || f.shown === 0 || f.opening), `${tag}: nothing of the dashboard before it is complete`);
      out.push(`sign in to dashboard: one door for ${fr[done].t - fr[firstOpening].t}ms, then the complete dashboard`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
  for (const line of out) console.log(`  ${tag} ${line}`);
}

test('one reveal per screen, in WebKit at 390', { timeout: 1800000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 1800000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
