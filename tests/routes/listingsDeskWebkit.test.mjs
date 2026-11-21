// The realtor's Listings on the real pages over the fake stack (tests/helpers/fakeNextServer.mjs on
// 3181), in WebKit and in Chrome:
//   the empty dashboard (no listing yet): one heading, one line, New listing right there and three
//   steps; on a phone at 390 by 844 all of it on one screen with nothing to scroll and the greeting
//   and the button together; at 1440 the start fills the main area beside Needs you's empty line,
//   and its button is the view's one red action;
//   archive and delete (db/025-listing-archive.sql): before the file no archive control and nothing
//   else changes; after it, rows picked with their checkboxes are archived from the bar and leave
//   Active for Archived, the apply link of an archived listing says it takes no applications, and a
//   restore brings it back; a bulk delete asks in the page, deletes the listing with only test
//   applications and says how many it skipped; on a phone the same from each card's menu.
// The fake stack server is this file's own, started in its turn (tests/helpers/devServer.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ROOT = new URL('../..', import.meta.url).pathname;
const S = { port: 3181 };
const BASE = `http://localhost:${S.port}`;
let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const down = () => { if (S.proc) { try { process.kill(-S.proc.pid); } catch (e) { /* gone */ } S.proc = null; } for (const pid of listeners(S.port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } };
const start = () => new Promise((res, rej) => {
  S.proc = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(S.port), 'dev', '3'], { cwd: ROOT, env: { ...process.env }, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(S.proc, 'the fake stack server');
  const t = setTimeout(() => rej(new Error(`the fake stack server on ${S.port} did not start`)), 180000);
  S.proc.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } });
  S.proc.on('exit', (code) => { clearTimeout(t); rej(new Error(`the fake stack server on ${S.port} exited ${code}`)); });
});
export const fake = (path) => fetch(`${BASE}${path}`).then((r) => r.json());
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(down);
  down();
  walkStep('starting the fake stack server');
  await start();
  walkStep('compiling the dashboard and a listing');
  for (const u of ['/dashboard', '/listing/L1']) await fetch(`${BASE}${u}`, { redirect: 'manual' }).catch(() => null);
}, { timeout: START_TIMEOUT });
after(async () => { leaveTurn(); down(); if (turn) giveTurn(); }, { timeout: STOP_TIMEOUT });

const context = (browser, width, height, phone) => browser.newContext({ baseURL: BASE, viewport: { width, height }, serviceWorkers: 'block', ...(phone ? { userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
const shown = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'), sel);
const boxOf = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }, sel);

async function emptyWalk(type, launch) {
  const browser = await type.launch(launch);
  await fake('/__fake/state?listings=0');
  try {
    // The phone: one screen, nothing to scroll; the greeting and the button together.
    const ctx = await context(browser, 390, 844, true); await ctx.route(/supabase\.co\//, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.locator('[data-get-started="phone"]').waitFor({ timeout: 30000 });
    await page.locator('.dash-greet').filter({ hasText: /^Good / }).waitFor({ timeout: 10000 });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
    const fit = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight - window.innerHeight, steps: document.querySelectorAll('[data-get-started-steps] li').length }));
    assert.equal(fit.steps, 3, 'three steps');
    assert.ok(fit.scroll <= 0, `one screen at 390 by 844 with nothing to scroll (${fit.scroll}px over)`);
    const card = await boxOf(page, '.dash-ink'); const btn = await boxOf(page, '.dash-new');
    assert.ok(btn.top - card.bottom <= 16, `the greeting and the button sit together (${btn.top - card.bottom}px)`);
    assert.equal(await page.locator('[data-get-started="phone"] h2').count(), 1, 'one heading');
    assert.equal(await page.locator('[data-get-started="phone"] p').count(), 1, 'one line under it');
    await ctx.close();

    // The desktop: the start fills the main area, Needs you says there is nothing, one red button.
    const dctx = await context(browser, 1440, 900, false); await dctx.route(/supabase\.co\//, (r) => r.abort());
    const desk = await dctx.newPage();
    await desk.goto('/dashboard', { waitUntil: 'load' });
    await desk.locator('[data-get-started="desktop"]').waitFor({ timeout: 30000 });
    await desk.waitForTimeout(500);
    assert.ok(await shown(desk, '[data-needs-you-empty]'), 'Needs you shows its empty line');
    assert.equal(await desk.locator('[data-needs-you-empty]').first().textContent(), 'Nothing needs you right now.');
    const reds = await desk.evaluate(() => [...document.querySelectorAll('button, a')].filter((el) => el.getClientRects().length && getComputedStyle(el).backgroundColor === 'rgb(215, 32, 39)').map((el) => el.textContent.trim()));
    assert.deepEqual(reds, ['New listing'], 'one red action on the view: the start\'s New listing');
    const start = await boxOf(desk, '[data-get-started="desktop"]'); const ny = await boxOf(desk, '[data-needs-you]');
    assert.ok(ny.left > start.right, 'the start beside Needs you');
    // Its button opens the form.
    await desk.locator('[data-get-started-new]').click();
    await desk.locator('[role=dialog]').first().waitFor({ timeout: 15000 });
    await dctx.close();
  } finally { await fake('/__fake/state?listings=1'); await browser.close(); }
}

const rowIds = (page) => page.locator('[data-listings-table] [data-listing-row]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('data-listing-row')));
async function archiveWalk(type, launch) {
  const browser = await type.launch(launch);
  try {
    // Before db/025: no switch, no Archive; the checkboxes and Delete are there.
    await fake('/__fake/state?archive=0');
    const dctx = await context(browser, 1440, 900, false); await dctx.route(/supabase\.co\//, (r) => r.abort());
    const desk = await dctx.newPage();
    await desk.goto('/dashboard', { waitUntil: 'load' }); await desk.locator('[data-listings-table]').first().waitFor({ timeout: 30000 }); await desk.waitForTimeout(400);
    assert.equal(await shown(desk, '[data-shelf]'), false, 'no Active and Archived switch before db/025');
    await desk.locator('[data-row-check="L2"]').check();
    await desk.locator('[data-bulk-bar]').waitFor({ timeout: 5000 });
    assert.equal(await desk.locator('[data-bulk-bar] button', { hasText: 'Archive' }).count(), 0, 'no Archive before db/025');
    assert.equal(await desk.locator('[data-bulk-bar] button', { hasText: 'Delete' }).count(), 1);

    // After it: archive from the bar, the row leaves Active, and shows under Archived.
    await fake('/__fake/state?archive=1&testlisting=1');
    await desk.goto('/dashboard', { waitUntil: 'load' }); await desk.locator('[data-shelf]:visible').first().waitFor({ timeout: 30000 }); await desk.waitForTimeout(400);
    assert.deepEqual((await rowIds(desk)).sort(), ['L1', 'L2', 'L3']);
    await desk.locator('[data-row-check="L1"]').check(); await desk.locator('[data-row-check="L2"]').check();
    assert.match(await desk.locator('[data-bulk-bar]').textContent(), /2 selected/);
    await desk.locator('[data-bulk-bar] button', { hasText: 'Archive' }).click();
    await desk.locator('[data-act-note]').filter({ hasText: 'Archived 2 listings.' }).waitFor({ timeout: 15000 });
    assert.deepEqual(await rowIds(desk), ['L3'], 'the archived rows left Active');
    // The apply link of an archived listing: no form, one short page.
    const tenant = await dctx.newPage();
    await tenant.goto('/apply/a1b2c3d4e5f6a7b8c9d0', { waitUntil: 'load' });
    await tenant.locator('[data-apply-archived]').waitFor({ timeout: 30000 });
    assert.equal(await tenant.locator('#email, input[type=email]').count(), 0, 'no form');
    await desk.locator('[data-shelf-to="archived"]:visible').first().click(); await desk.waitForTimeout(400);
    assert.deepEqual((await rowIds(desk)).sort(), ['L1', 'L2'], 'under Archived');
    await desk.locator('[data-row-check="L1"]').check();
    await desk.locator('[data-bulk-bar] button', { hasText: 'Restore' }).click();
    await desk.locator('[data-act-note]').filter({ hasText: 'Restored 1 listing.' }).waitFor({ timeout: 15000 });
    assert.deepEqual(await rowIds(desk), ['L2']);
    await tenant.goto('/apply/a1b2c3d4e5f6a7b8c9d0', { waitUntil: 'load' });
    await tenant.locator('input').first().waitFor({ timeout: 30000 });
    assert.equal(await tenant.locator('[data-apply-archived]').count(), 0, 'restored, the link takes applications again');
    await tenant.close();

    // A bulk delete: asked in the page, the test listing goes, the real one is skipped and said.
    await desk.locator('[data-shelf-to="active"]:visible').first().click(); await desk.waitForTimeout(400);
    let dialogs = 0; desk.on('dialog', (d) => { dialogs++; d.dismiss(); });
    await desk.locator('[data-row-check="L1"]').check(); await desk.locator('[data-row-check="L3"]').check();
    await desk.locator('[data-bulk-delete]').click();
    const sheet = desk.locator('[role=alertdialog]').filter({ hasText: 'Delete 2 listings?' });
    await sheet.waitFor({ timeout: 10000 });
    assert.match((await sheet.textContent()).replace(/\u00a0/g, ' '), /1 listing has applications and will stay\. Archive it instead\./, 'the question says what will stay (no break spaces read as spaces)');
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
    await desk.locator('[data-act-note]').filter({ hasText: 'Deleted 1 listing. 1 listing has applications, so it was not deleted. Archive it instead.' }).waitFor({ timeout: 15000 });
    assert.deepEqual(await rowIds(desk), ['L1'], 'the test listing is gone, the real one stays');
    assert.equal(dialogs, 0, 'never a browser alert or confirm');
    await dctx.close();

    // A phone: the card's menu archives and restores, and the switch shows Archived.
    const pctx = await context(browser, 390, 844, true); await pctx.route(/supabase\.co\//, (r) => r.abort());
    const phone = await pctx.newPage();
    await phone.goto('/dashboard', { waitUntil: 'load' }); await phone.locator('[data-card-menu="L1"]').waitFor({ timeout: 30000 }); await phone.waitForTimeout(400);
    await phone.locator('[data-card-menu="L1"]').tap();
    assert.equal(new URL(phone.url()).pathname, '/dashboard', 'the menu is the button\'s own tap, never the card\'s');
    await phone.locator('[data-card-menu-sheet]').getByRole('button', { name: 'Archive' }).tap();
    await phone.waitForFunction(() => !document.querySelector('[data-card-menu="L1"]'), null, { timeout: 15000 });
    await phone.locator('.dash-section-head [data-shelf-to="archived"]').tap();
    await phone.locator('[data-archived-cards] [data-card-menu="L1"]').waitFor({ timeout: 10000 });
    await phone.locator('[data-card-menu="L1"]').tap();
    await phone.locator('[data-card-menu-sheet]').getByRole('button', { name: 'Restore' }).tap();
    await phone.waitForFunction(() => !document.querySelector('[data-archived-cards] [data-card-menu="L1"]'), null, { timeout: 15000 });
    await pctx.close();
  } finally { await fake('/__fake/state?archive=0&testlisting=0'); await browser.close(); }
}

test('archive, restore and delete in WebKit at 1440 and 390', async () => { requireWebkit(); await archiveWalk(pw.webkit, {}); });
test('archive, restore and delete in Chrome at 1440 and 390', { skip: haveChrome ? false : 'Chrome binary absent' }, () => archiveWalk(pw.chromium, { executablePath: chromeBin }));

test('the empty dashboard in WebKit at 390 and 1440', async () => { requireWebkit(); await emptyWalk(pw.webkit, {}); });
test('the empty dashboard in Chrome at 390 and 1440', { skip: haveChrome ? false : 'Chrome binary absent' }, () => emptyWalk(pw.chromium, { executablePath: chromeBin }));
