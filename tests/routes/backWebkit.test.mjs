// Back at any speed, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone user
// agent, on the real pages over the fake stack in a PRODUCTION build (tests/helpers/fakeNextServer.mjs):
// Next keeps a page's data differently in production, and that is where the bug lived.
//   1. From the dashboard, tap a listing, then go back after 50, 200, 500 and 1000ms, by the in app
//      back control ("All listings") and by browser history back. The dashboard's real content is
//      on screen within 3 seconds every time, BACK_REPS times each (20 by default), all in one page
//      without a reload, so what one round leaves behind meets the next.
//   2. A Loader is never permanent: the dashboard's page data request, the dashboard's own data
//      and a listing's applicants each fail twice (the request never answers). The load is retried
//      once by itself after 4 seconds, then the Loader gives way to "Couldn’t load this." and a
//      Try again pill, which loads the data again (the same page, no reload) and the content shows.
//   3. The page taking over a seen screen keeps it: the walk's own call never finds the first card
//      missing while the dashboard's page lands, no card is drawn again, and the dashboard and a
//      listing then show what the server sent.
//   4. A view transition ended before it animates (a tap while a screen is on its way) is never a
//      page error.
// The data requests wait 600ms each, as on a phone. A WebKit walk fails, never skips, when the
// binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

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
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
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
  routeLoading: document.querySelector('[data-route-loading]')?.getAttribute('data-route-loading') || null,
  homeLoading: !!document.querySelector('[data-screen-loading="Loading your workspace"]'),
  cards: document.querySelectorAll('.dash-card-int').length,
  failed: !!document.querySelector('[data-load-failed]'),
  listingLoading: !!document.querySelector('[data-screen-loading="Loading the listing"]'),
  applicants: document.querySelectorAll('[id^="applicant-"]').length,
});
const dashboardReal = (s) => !!s && s.path === '/dashboard' && !s.routeLoading && !s.homeLoading && !s.failed && s.cards > 0;
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
          // Whatever shows "All listings" now: the Loader's or the page's.
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

// ── 2. A Loader is never permanent ───────────────────────────────────────────────────────────
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
  assert.equal(await page.locator('[data-route-loading], [data-screen-loading], [aria-busy="true"]').count(), 0, `${tag} ${name}: the line replaces the Loader`);
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
const applicantsReal = (s) => !!s && s.path === '/listing/L2' && !s.routeLoading && !s.listingLoading && !s.failed && s.applicants > 0;
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

// ── 3. The page taking over a seen screen keeps it ───────────────────────────────────────────
// A return to a screen seen recently draws it at once from what it showed, and when its page lands
// the page takes over that same screen (components/nav/RouteFrame.js): nothing on it is drawn
// again, so a card found or touched in that moment is still there, and what the server sent
// replaces what the screen showed. Part 1's rounds 48 to 50 once found no card: the history back
// after 1000ms leaves a seen dashboard, the in app back after 50ms returns to it, and its page lands
// about 600ms later. Here the walk's own call looks for the first card throughout that landing.
const listingReal = (s) => !!s && s.path.startsWith('/listing/') && !s.routeLoading && !s.listingLoading && !s.failed && s.applicants > 0;
async function takeOver(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  // The phone's network (600ms), and from `change` on the reads behind the screens answer with no
  // applicants, so a screen that takes the server's answers shows it.
  let change = false;
  await ctx.route(/\/_next\/data\/|\/api\/assistant\/signals|\/api\/listings\/applicants/, async (r) => {
    let resp = null; try { resp = await r.fetch(); } catch (e) { return r.abort().catch(() => {}); }
    let body = await resp.body().catch(() => Buffer.alloc(0));
    if (change && /\/api\//.test(r.request().url())) {
      const j = JSON.parse(body.toString() || '{}');
      if (j.signals && j.signals.applicantsByListing) for (const k of Object.keys(j.signals.applicantsByListing)) j.signals.applicantsByListing[k] = [];
      if (Array.isArray(j.applicants)) j.applicants = [];
      body = Buffer.from(JSON.stringify(j));
    }
    await new Promise((res) => setTimeout(res, NETWORK_MS));
    await r.fulfill({ response: resp, body }).catch(() => {});
  });
  // Every card taken off the page, counted.
  await ctx.addInitScript(() => { window.__gone = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches?.('.dash-card-int') || n.querySelector?.('.dash-card-int'))) window.__gone++; }).observe(document, { childList: true, subtree: true }); });
  const landed = []; page.on('response', (r) => { if (/\/_next\/data\/[^/]+\/dashboard\.json/.test(r.url())) landed.push(Date.now()); });
  const card = () => page.locator('.dash-card-int').first();
  const tapOn = async (loc) => tapBox(page, await loc.boundingBox({ timeout: 5000 }));
  const gone = () => page.evaluate(() => window.__gone);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await tapOn(card()); assert.ok((await waitFor(page, listingReal, 5000)).ok, `${tag}: the listing`);
  await tapOn(page.getByText('All listings', { exact: true }).first()); assert.ok((await waitFor(page, dashboardReal, 5000)).ok, `${tag}: the dashboard`);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await tapOn(card()); await page.waitForTimeout(1000); await page.evaluate(() => history.back());
    await page.waitForTimeout(60);
    await tapOn(card()); await page.waitForTimeout(50); await tapOn(page.getByText('All listings', { exact: true }).first());
    const from = Date.now(); const was = await gone(); let none = 0; let calls = 0;
    while (Date.now() - from < 1500) { calls++; if (!(await card().boundingBox({ timeout: 5000 }).catch(() => null))) none++; }
    assert.ok(landed.some((t) => t > from && t < Date.now()), `${tag}: the dashboard's page landed while the card was looked for (try ${i + 1})`);
    assert.equal(none, 0, `${tag}: ${none} of ${calls} looks found no card while the page took over (try ${i + 1})`);
    assert.equal(await gone() - was, 0, `${tag}: no card was drawn again when the page took over (try ${i + 1})`);
    assert.ok((await waitFor(page, dashboardReal, 3000)).ok);
    await page.waitForTimeout(1500);
  }
  // The dashboard takes the server's signals: its first card's status says what the read said. From
  // a full load, so the read on the return is a new one (a touch's read serves 20 seconds).
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  assert.ok((await waitFor(page, dashboardReal, 5000)).ok);
  const status = () => card().locator('[aria-label="Listing status"]').innerText().catch(() => '');
  const before = await status();
  const listingData = page.waitForResponse(/\/_next\/data\/[^/]+\/listing\//);
  await tapOn(card()); await listingData; assert.ok((await waitFor(page, listingReal, 5000)).ok);
  change = true;
  await tapOn(page.getByText('All listings', { exact: true }).first());
  await page.waitForTimeout(150);
  assert.equal(await status(), before, `${tag}: the seen dashboard at once, as it was`);
  const was = await gone();
  await page.waitForFunction(() => /no applicants/.test(document.querySelector('#__next .dash-card-int [aria-label="Listing status"]')?.innerText || ''), null, { timeout: 5000 });
  assert.equal(await gone() - was, 0, `${tag}: the dashboard took the server's answers without drawing a card again`);
  // A listing takes the server's applicants: seen from a full load (no read started yet), then a tap.
  change = false;
  await page.goto('/listing/L2', { waitUntil: 'networkidle' });
  assert.ok((await waitFor(page, listingReal, 5000)).ok);
  await tapOn(page.getByText('All listings', { exact: true }).first()); assert.ok((await waitFor(page, dashboardReal, 8000)).ok);
  change = true;
  await tapOn(page.locator('.dash-card-int').filter({ hasText: '88 Harbour' }).first());
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#__next [id^="applicant-"]').count() > 0, `${tag}: the seen listing at once, with its applicants`);
  await page.evaluate(() => { document.querySelector('#__next h1').__seen = true; });
  await page.waitForFunction(() => document.querySelectorAll('#__next [id^="applicant-"]').length === 0, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.querySelector('#__next h1')?.__seen === true), true, `${tag}: the listing took the server's applicants on the same screen`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ── 4. A view transition skipped before it animates is no page error ─────────────────────────
// A tap while a screen is on its way ends the transition (components/nav/RouteFrame.js). Before it
// animates, ending it rejects the transition's ready promise, which the frame handles, every time:
// here each transition is ended the moment it starts, and then, as a finger does, by a second tap
// 20ms after the tap on a card, while the push still waits for its page.
async function skippedTransitions(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  await slowNetwork(ctx);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => typeof document.startViewTransition === 'function'))) { await ctx.close(); return; }
  await page.evaluate(() => { window.__ended = 0; const start = document.startViewTransition.bind(document); document.startViewTransition = (cb) => { const vt = start(cb); vt.skipTransition(); window.__ended++; return vt; }; });
  for (let i = 0; i < 3; i++) {
    await tapBox(page, await page.locator('.dash-card-int').first().boundingBox({ timeout: 5000 }));
    assert.ok((await waitFor(page, listingReal, 5000)).ok, `${tag}: the listing, its transition ended at once`);
    await tapBox(page, await page.getByText('All listings', { exact: true }).first().boundingBox({ timeout: 5000 }));
    assert.ok((await waitFor(page, dashboardReal, 5000)).ok, `${tag}: the dashboard, its transition ended at once`);
  }
  assert.ok(await page.evaluate(() => window.__ended) >= 6, `${tag}: every transition was ended as it started`);
  // The seen dashboard counts as real before its page lands: let that land before leaving the page.
  await page.waitForTimeout(1500);
  for (let i = 0; i < 5; i++) {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await tapBox(page, await page.locator('.dash-card-int').first().boundingBox({ timeout: 5000 }));
    await page.waitForTimeout(20);
    await page.touchscreen.tap(195, 800);
    await page.waitForTimeout(1500);
  }
  assert.deepEqual(errors, [], `${tag}: a view transition ended before it animated is no page error`);
  await ctx.close();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const rounds = await backAtAnySpeed(browser, tag);
    await neverPermanent(browser, tag);
    await takeOver(browser, tag);
    await skippedTransitions(browser, tag);
    return rounds;
  } finally { await browser.close(); }
}

test('back at any speed, and no permanent Loader, in WebKit at 390', { timeout: 3600000 }, async (t) => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  t.diagnostic(`${await walk(pw.webkit, {}, 'wk')} backs`);
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 3600000 }, async (t) => {
  t.diagnostic(`${await walk(pw.chromium, { executablePath: chromeBin }, 'cr')} backs`);
});
