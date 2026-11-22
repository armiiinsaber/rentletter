// The desktop shell (components/dashboard/DashShell.js) walked for real on the sandbox, in WebKit and
// in Chrome: at 1440 the sidebar with its five places, the tabs gone, Pipeline and Shared with you
// chosen in place (the address changes, no transition, no reload), a number that filters the table,
// a row that opens its listing anywhere it is clicked, and Needs you beside the table; at 1440, 1920
// and 2560 the shell filling the window (the sidebar from its left edge, the main content to within
// the page padding of its right edge, the numbers one row as wide as the table, the table never
// wider than its card, the Pipeline under it); at 1024 Needs you under the table; at 390 the phone
// as it was.
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

const PORT = 3188; const BASE = `http://localhost:${PORT}`;
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

const box = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), width: Math.round(r.width) }; }, sel);
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'), sel);
const open = async (page, path = '') => { await page.goto(`${HOME}${path}`, { waitUntil: 'networkidle' }); await page.locator('[data-shell]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(700); };
// The shell against the window: the sidebar, the main content's right edge, Needs you, the
// numbers, the table and the Pipeline section, measured in the page.
const shellFit = (page) => page.evaluate(() => {
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
  const box = (el) => el.getBoundingClientRect();
  const W = window.innerWidth;
  const edge = document.elementFromPoint(0, Math.round(window.innerHeight / 2));
  const table = vis('[data-listings-table]');
  return {
    W,
    side: Math.round(box(vis('[data-shell-side]')).left),
    edgeIsSide: !!(edge && edge.closest('[data-shell-side]')),
    right: Math.round(Math.max(...['.hv-primary', '.hv-aside', '.rl-hdr-avatar'].map((s) => vis(s)).filter(Boolean).map((e) => box(e).right))),
    avatar: Math.round(box(vis('.rl-hdr-avatar')).right),
    ny: Math.round(box(vis('[data-needs-you]')).width),
    table: { left: Math.round(box(table).left), right: Math.round(box(table).right), over: table.scrollWidth - table.clientWidth },
    stats: [...document.querySelectorAll('[data-desk-stats] [data-stat]')].map((e) => { const r = box(e); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) }; }),
    wide: !!vis('[data-listings-table] [data-col="newest"]'),
    pipeline: !!vis('[data-pipeline-soon]'),
    sideways: document.documentElement.scrollWidth - W,
  };
});

async function walk(browserType, launch) {
  await fetch(HOME).catch(() => null);
  const browser = await browserType.launch(launch);
  try {
    // 1440: the desktop app.
    const desk = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })).newPage();
    await blockSupabase(desk.context());
    await open(desk);
    await desk.locator('[data-listings-table]').first().waitFor({ timeout: 30000 });
    assert.ok(await visible(desk, '[data-shell-side]'), 'the sidebar');
    assert.equal(await visible(desk, '[data-main-nav]'), false, 'no pill tabs');
    assert.deepEqual(await desk.locator('[data-shell-place]').evaluateAll((els) => els.map((e) => e.firstElementChild.textContent.trim())), ['Listings', 'Pipeline', 'Circle', 'Shared with you', 'Profile']);
    assert.equal(await desk.locator('[data-shell-place="listings"]').getAttribute('aria-current'), 'page');
    const side = await box(desk, '[data-shell-side]');
    assert.ok(side.width >= 220 && side.width <= 260, `about 240px (${side.width})`);
    assert.equal(await visible(desk, '.dash-ink'), false, 'no black greeting box');
    assert.ok(await visible(desk, '.hv-greet'), 'the quiet greeting line');
    // Needs you beside the table.
    const table = await box(desk, '[data-listings-table]'); const ny = await box(desk, '[data-needs-you]');
    assert.ok(ny.left > table.right, `Needs you to the right of the table (${JSON.stringify({ table, ny })})`);
    assert.ok(ny.width >= 300 && ny.width <= 380, `about 340px (${ny.width})`);
    // A number filters the table, a second click shows all again.
    const all = await desk.locator('[data-listings-table] [data-listing-row]').count();
    await desk.locator('[data-stat="toSend"]').click(); await desk.waitForTimeout(300);
    assert.equal(await desk.locator('[data-stat="toSend"]').getAttribute('aria-pressed'), 'true');
    const toSend = Number((await desk.locator('[data-stat="toSend"] .dst-num').textContent()).trim());
    assert.equal(await desk.locator('[data-listings-table] [data-listing-row]').count(), toSend, 'the rows the number counts');
    await desk.locator('[data-stat="toSend"]').click(); await desk.waitForTimeout(300);
    assert.equal(await desk.locator('[data-listings-table] [data-listing-row]').count(), all, 'all again');
    // Pipeline and Shared with you in place: the address changes, nothing slides, nothing reloads.
    await desk.evaluate(() => { window.__shellMark = 1; window.__navMarks = 0; new MutationObserver(() => { if (document.documentElement.dataset.nav) window.__navMarks++; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] }); });
    await desk.locator('[data-shell-place="pipeline"]').click();
    await desk.waitForURL((u) => u.searchParams.get('view') === 'pipeline', { timeout: 10000 }); await desk.waitForTimeout(400);
    assert.ok(await visible(desk, '#people'), 'the Pipeline view');
    assert.equal(await visible(desk, '[data-listings-table]'), false, 'not the table');
    assert.equal(await desk.locator('[data-shell-place="pipeline"]').getAttribute('aria-current'), 'page');
    await desk.locator('[data-shell-place="shared"]').click();
    await desk.waitForURL((u) => u.searchParams.get('view') === 'shared', { timeout: 10000 }); await desk.waitForTimeout(400);
    // The sandbox's one sample share: the listing agent's view opens on a tap.
    await desk.locator('[data-shared-with-me-row] [data-shared-view]').first().click();
    await desk.locator('[data-shared-with-me] [data-shared-screening]').first().waitFor({ timeout: 15000 });
    assert.ok(await visible(desk, '[data-shared-with-me] [data-shared-facts]'), 'the shared facts');
    await desk.locator('[data-shell-place="listings"]').click();
    await desk.waitForURL((u) => !u.search, { timeout: 10000 }); await desk.waitForTimeout(400);
    assert.deepEqual(await desk.evaluate(() => [window.__shellMark, window.__navMarks]), [1, 0], 'no reload and no transition between the views');
    // The browser's back returns to the view before.
    await desk.goBack(); await desk.waitForURL((u) => u.searchParams.get('view') === 'shared', { timeout: 10000 });
    await desk.goForward(); await desk.waitForURL((u) => !u.search, { timeout: 10000 }); await desk.waitForTimeout(400);
    // A row opens its listing from anywhere on it, and its link takes the keyboard.
    const row = desk.locator('[data-listings-table] [data-listing-row]').first();
    const rowId = await row.getAttribute('data-listing-row');
    await row.locator('.lt-n').first().click();
    await desk.waitForURL((u) => u.searchParams.get('listing') === rowId, { timeout: 15000 });
    await desk.goBack(); await desk.locator('[data-listings-table]').first().waitFor({ timeout: 30000 });
    await desk.waitForTimeout(500);
    await desk.locator('[data-listings-table] .lt-link').first().focus();
    assert.equal(await desk.evaluate(() => document.activeElement.classList.contains('lt-link')), true);
    assert.match(await desk.evaluate(() => getComputedStyle(document.activeElement.closest('[data-listing-row]')).boxShadow), /inset/, 'the row shows the focus');
    // 1440, 1920 and 2560: the shell fills the window.
    for (const width of [1440, 1920, 2560]) {
      await desk.setViewportSize({ width, height: 1000 }); await desk.waitForTimeout(400);
      const f = await shellFit(desk); const at = JSON.stringify(f);
      const pad = Math.min(56, Math.max(24, 8 + 0.01875 * width));
      assert.equal(f.W, width);
      assert.equal(f.side, 0, `${width}: the sidebar's left edge at x = 0 (${at})`);
      assert.ok(f.edgeIsSide, `${width}: the sidebar's paper from the window's left edge (${at})`);
      assert.ok(f.right <= width && width - f.right <= pad + 1, `${width}: the main content's right edge within the page padding (${Math.round(pad)}px) of the window's (${at})`);
      assert.ok(Math.abs(width - f.avatar - pad) <= 1, `${width}: the avatar at the top right, one page padding in (${at})`);
      assert.ok(Math.abs(f.ny - Math.min(440, Math.max(340, 240 + 0.078125 * width))) <= 2, `${width}: Needs you about 340px at 1280 to 440px at 2560 (${f.ny})`);
      assert.equal(f.stats.length, 3);
      assert.ok(Math.abs(f.stats[0].left - f.table.left) <= 1 && Math.abs(f.stats[2].right - f.table.right) <= 1, `${width}: the numbers one row as wide as the table (${at})`);
      assert.ok(f.stats.every((s) => Math.abs(s.width - f.stats[0].width) <= 1 && s.height === f.stats[0].height), `${width}: equal widths, one height (${at})`);
      assert.ok(f.table.over <= 0, `${width}: no row wider than the table (${at})`);
      assert.equal(f.wide, width >= 1920, `${width}: the newest applicant column from 1920`);
      assert.ok(f.pipeline, `${width}: the Pipeline under the listings`);
      assert.ok(f.sideways <= 0, `${width}: no sideways scroll`);
    }
    // Open Pipeline goes to the full view, in place.
    await desk.locator('[data-pipeline-open]').click();
    await desk.waitForURL((u) => u.searchParams.get('view') === 'pipeline', { timeout: 10000 }); await desk.waitForTimeout(300);
    assert.ok(await visible(desk, '#people'), 'the Pipeline view from its section');
    noSupabaseLeft(desk.context(), '1440');
    await desk.context().close();

    // 1024: Needs you drops under the table.
    const mid = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1024, height: 800 } })).newPage();
    await blockSupabase(mid.context());
    await open(mid);
    const t2 = await box(mid, '[data-listings-table]'); const n2 = await box(mid, '[data-needs-you]');
    assert.ok(n2.top > t2.bottom, `under the table at 1024 (${JSON.stringify({ t2, n2 })})`);
    assert.equal(await mid.evaluate(() => document.documentElement.scrollWidth), 1024, 'no sideways scroll');
    // The sidebar is full height and stays on screen however far the page is scrolled.
    await mid.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' })); await mid.waitForTimeout(300);
    const stuck = await mid.evaluate(() => { const r = document.querySelector('[data-shell-side]').getBoundingClientRect(); return { y: window.scrollY, top: Math.round(r.top), height: Math.round(r.height), vh: window.innerHeight }; });
    assert.ok(stuck.y > 0 && stuck.top === 0 && stuck.height === stuck.vh, `the sidebar stays, full height (${JSON.stringify(stuck)})`);
    noSupabaseLeft(mid.context(), '1024');
    await mid.context().close();

    // 390: the phone as it was, no sidebar.
    const phone = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true })).newPage();
    await blockSupabase(phone.context());
    await open(phone);
    assert.equal(await visible(phone, '[data-shell-side]'), false);
    assert.ok(await visible(phone, '[data-main-nav]'), 'the tabs');
    assert.ok(await visible(phone, '.dash-ink'), 'the greeting card');
    assert.equal(await visible(phone, '[data-needs-you]'), false);
    noSupabaseLeft(phone.context(), '390');
    await phone.context().close();
  } finally { await browser.close(); }
}

test('the desktop shell in WebKit at 1440, 1920, 2560, 1024 and 390', async () => { requireWebkit(); await walk(pw.webkit, {}); });
test('the same shell walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, () => walk(pw.chromium, { executablePath: chromeBin }));
