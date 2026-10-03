// Back at any speed, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone user
// agent, on the real pages over the fake stack in a PRODUCTION build (tests/helpers/fakeNextServer.mjs):
// Next keeps a page's data differently in production, and that is where the bug lived.
//   1. From the dashboard, tap a listing, then go back after 50, 200, 500 and 1000ms, by the in app
//      back control ("All listings") and by browser history back. The dashboard's real content is
//      on screen within 3 seconds every time, BACK_REPS times each (20 by default), all in one page
//      without a reload, so what one round leaves behind meets the next.
//   2. A skeleton is never permanent: the dashboard's page data request, the dashboard's own data
//      and a listing's applicants each fail twice (the request never answers). The load is retried
//      once by itself after 4 seconds, then the skeleton gives way to "Couldn’t load this." and a
//      Try again pill, which loads the data again (the same page, no reload) and the content shows.
// The data requests wait 600ms each, as on a phone. A WebKit walk fails, never skips, when the
// binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3157; const BASE = process.env.BACK_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const REPS = Number(process.env.BACK_REPS || 20);
const SPEEDS = [50, 200, 500, 1000];
const NETWORK_MS = 600;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const run = (cmd, args, env) => new Promise((res, rej) => { const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`)))); });
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.BACK_BASE) return; // BACK_BASE: a server already running
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  // Stuck past the walk limit (devServer.mjs): the fake stack server goes with the file.
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  // Its own production build, in its own folder (next.config.js distDir): never the walks' .next.
  await run(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' });
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/listing/L1', '/profile']) await fetch(`${BASE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  // WebKit reports a request cancelled by a navigation as an error; that is the browser leaving a page.
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
// The network a phone sees: every page data request and the reads behind the screens take 600ms.
const slowNetwork = (ctx, stall = () => false) => ctx.route(/\/_next\/data\/|\/api\/assistant\/signals|\/api\/listings\/applicants/, async (r) => {
  if (stall(r.request().url())) return; // never answers
  await new Promise((res) => setTimeout(res, NETWORK_MS));
  await r.continue().catch(() => {});
});
const STATE = () => ({
  path: location.pathname,
  routeSkeleton: document.querySelector('[data-skeleton-route]')?.getAttribute('data-skeleton-route') || null,
  homeSkeleton: !!document.querySelector('[aria-label="Loading your workspace"]'),
  cards: document.querySelectorAll('.dash-card-int').length,
  failed: !!document.querySelector('[data-load-failed]'),
  applicantSkeleton: !!document.querySelector('[data-skeleton="applicants"]'),
  applicants: document.querySelectorAll('[id^="applicant-"]').length,
});
const dashboardReal = (s) => !!s && s.path === '/dashboard' && !s.routeSkeleton && !s.homeSkeleton && !s.failed && s.cards > 0;
async function waitFor(page, ok, ms) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await page.evaluate(STATE).catch(() => null); if (ok(s)) return { ok: true, ms: Date.now() - t0, s }; await page.waitForTimeout(40); }
  return { ok: false, ms, s };
}
const tapBox = async (page, box) => page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));

// ── 1. Back at any speed ─────────────────────────────────────────────────────────────────────
async function backAtAnySpeed(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  await slowNetwork(ctx);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  const failures = []; let rounds = 0;
  for (let rep = 0; rep < REPS; rep++) {
    for (const how of ['app', 'history']) {
      for (const ms of SPEEDS) {
        rounds++;
        // A round that failed may have left another screen, or another document: start from the dashboard.
        let start = await waitFor(page, dashboardReal, 4000);
        if (!start.ok) { await page.goto('/dashboard', { waitUntil: 'networkidle' }).catch(() => {}); start = await waitFor(page, dashboardReal, 8000); }
        if (!start.ok) { failures.push(`no dashboard to start round ${rounds} from: ${JSON.stringify(start.s)}`); continue; }
        const card = await page.locator('.dash-card-int').first().boundingBox({ timeout: 5000 }).catch(() => null);
        if (!card) { failures.push(`no listing card in round ${rounds}`); continue; }
        await tapBox(page, card);
        await page.waitForTimeout(ms);
        if (how === 'app') {
          // Whatever shows "All listings" now: the skeleton's or the page's.
          const box = await page.getByText('All listings', { exact: true }).first().boundingBox({ timeout: 2000 }).catch(() => null);
          if (box) await tapBox(page, box);
        } else {
          await page.evaluate(() => history.back()).catch(() => {});
        }
        const end = await waitFor(page, dashboardReal, 3000);
        if (!end.ok) failures.push(`${how} after ${ms}ms (round ${rep + 1}): ${JSON.stringify(end.s)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `${tag}: ${failures.length} of ${rounds} backs never showed the dashboard within 3 seconds`);
  assert.deepEqual(errors, []);
  await ctx.close();
  return rounds;
}

// ── 2. A skeleton is never permanent ─────────────────────────────────────────────────────────
// From the moment the starting page has loaded, the first two requests matching `re` never answer;
// the third goes through. (The starting page's own reads, the header's included, are left alone.)
async function failTwice(browser, tag, { name, re, from, go, real }) {
  const { ctx, page, errors } = await phone(browser);
  let seen = 0; let armed = false;
  await slowNetwork(ctx, (url) => armed && re.test(url) && ++seen <= 2);
  await page.goto(from, { waitUntil: 'networkidle' });
  armed = true;
  const before = seen;
  const t0 = Date.now();
  await go(page);
  // The failure line appears by itself once the automatic retry has also failed, and not before.
  await page.locator('[data-load-failed]').waitFor({ timeout: 15000 });
  const shownAt = Date.now() - t0;
  assert.ok(shownAt >= 7500, `${tag} ${name}: the line waited for the retry (${shownAt}ms)`);
  assert.equal(seen - before, 2, `${tag} ${name}: the load ran twice, the retry by itself`);
  const failed = page.locator('[data-load-failed]');
  assert.match(await failed.innerText(), /Couldn’t load this\.\s*Try again/);
  assert.equal(await page.locator('[data-skeleton-route], [aria-busy="true"]').count(), 0, `${tag} ${name}: the line replaces the skeleton`);
  const same = await page.evaluate(() => { window.__sameDocument = 'yes'; return true; });
  assert.ok(same);
  await tapBox(page, await failed.getByRole('button', { name: 'Try again' }).boundingBox());
  const end = await waitFor(page, real, 5000);
  assert.ok(end.ok, `${tag} ${name}: the pill loads it: ${JSON.stringify(end.s)}`);
  assert.equal(await page.evaluate(() => window.__sameDocument), 'yes', `${tag} ${name}: the data, not the whole app`);
  assert.equal(seen - before, 3, `${tag} ${name}: one more request`);
  assert.deepEqual(errors, []);
  await ctx.close();
}
const toDashboard = async (page) => tapBox(page, await page.getByText('All listings', { exact: true }).first().boundingBox());
const applicantsReal = (s) => !!s && s.path === '/listing/L2' && !s.routeSkeleton && !s.applicantSkeleton && !s.failed && s.applicants > 0;
async function neverPermanent(browser, tag) {
  // The dashboard's page data request (the route).
  await failTwice(browser, tag, { name: 'dashboard page data', re: /\/_next\/data\/[^/]+\/dashboard\.json/, from: '/listing/L1', go: toDashboard, real: dashboardReal });
  // The dashboard's own data after an in app return, with nothing seen yet this session.
  await failTwice(browser, tag, { name: 'dashboard data', re: /\/api\/assistant\/signals/, from: '/listing/L1', go: toDashboard, real: dashboardReal });
  // A listing's applicants after a tap inside the app.
  await failTwice(browser, tag, {
    name: 'applicants', re: /\/api\/listings\/applicants\?listingId=L2/, from: '/dashboard',
    go: async (page) => tapBox(page, await page.locator('.dash-card-int').filter({ hasText: '88 Harbour' }).first().boundingBox()),
    real: applicantsReal,
  });
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const rounds = await backAtAnySpeed(browser, tag);
    await neverPermanent(browser, tag);
    return rounds;
  } finally { await browser.close(); }
}

test('back at any speed, and no permanent skeleton, in WebKit at 390', { timeout: 3600000 }, async (t) => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  t.diagnostic(`${await walk(pw.webkit, {}, 'wk')} backs`);
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 3600000 }, async (t) => {
  t.diagnostic(`${await walk(pw.chromium, { executablePath: chromeBin }, 'cr')} backs`);
});
