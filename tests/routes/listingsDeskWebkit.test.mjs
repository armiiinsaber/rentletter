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
//   applications and says how many it skipped; on a phone the same from each card's menu;
//   the new listing form: on a phone at 390 and 320 one step a screen with the progress line, Back
//   that keeps the answers, an error beside a field once it is left, the rent formatted as typed,
//   Continue above the keyboard (WebKit headless has no software keyboard: the visual viewport is
//   shrunk the way iOS shrinks it), then the apply link with Copy, and the draft cleared; at 1440
//   one panel with no steps, what tenants see beside the form and following it, Enter to the next
//   field, Tab kept inside, Escape closing with the draft kept and the focus back on New listing;
//   and a listing's Duplicate opening the form filled from it with the unit empty;
//   the office list at 320 with an email far longer than the screen: one line, cut short, the
//   whole address on hover, nothing sideways.
// The fake stack server is this file's own, started in its turn (tests/helpers/devServer.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ROOT = new URL('../..', import.meta.url).pathname;
const S = { port: 3181 };
// The office walk signs in with a password made up for this run.
const OFFICE = randomBytes(18).toString('hex');
const BASE = `http://localhost:${S.port}`;
let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const down = () => { if (S.proc) { try { process.kill(-S.proc.pid); } catch (e) { /* gone */ } S.proc = null; } for (const pid of listeners(S.port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } };
const start = () => new Promise((res, rej) => {
  S.proc = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(S.port), 'dev', '3'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: OFFICE }, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(S.proc, 'the fake stack server');
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

// The keyboard, as iOS opens it: the visual viewport shrinks and the layout viewport stays.
const KEYBOARD = () => {
  const fake = new EventTarget(); let cover = 0;
  for (const [k, get] of [['height', () => window.innerHeight - cover], ['width', () => window.innerWidth], ['offsetTop', () => 0], ['offsetLeft', () => 0], ['scale', () => 1], ['pageTop', () => window.scrollY], ['pageLeft', () => 0]]) Object.defineProperty(fake, k, { get });
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
  window.__keyboard = (px) => { cover = px; fake.dispatchEvent(new Event('resize')); };
};
const primaryBox = (page) => page.evaluate(() => { const b = document.querySelector('[data-lf-primary]'); const r = b.getBoundingClientRect(); return { bottom: Math.round(r.bottom), top: Math.round(r.top), text: b.textContent.trim(), disabled: b.disabled }; });
async function phoneForm(browser, width) {
  const ctx = await context(browser, width, 844, true); await ctx.route(/supabase\.co\//, (r) => r.abort()); await ctx.addInitScript(KEYBOARD);
  const page = await ctx.newPage();
  try {
    await page.goto('/dashboard', { waitUntil: 'load' }); await page.locator('.dash-new').waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('.dash-new').tap();
    const panel = page.locator('.lf-panel'); await panel.waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
    const now = () => page.locator('[role=progressbar]').getAttribute('aria-valuenow');
    assert.equal(await now(), '1', 'step 1, with the progress line');
    assert.equal((await primaryBox(page)).disabled, true, 'Continue waits for the address');
    // An error beside the field once it is left, in plain words.
    await page.locator('#lf-address').focus(); await page.locator('#lf-unit').focus(); await page.waitForTimeout(150);
    assert.equal(await page.locator('#lf-address-err').textContent(), 'Enter the street address.');
    for (const [id, type, mode, auto] of [['lf-address', 'text', 'text', 'street-address'], ['lf-unit', 'text', 'text', 'address-line2']]) {
      const a = await page.locator(`#${id}`).evaluate((el) => [el.type, el.inputMode, el.autocomplete]); assert.deepEqual(a, [type, mode, auto], id);
    }
    await page.locator('#lf-address').fill('7 Walk Street');
    assert.equal(await page.locator('#lf-address-err').count(), 0, 'the error goes once it is right');
    await page.getByRole('button', { name: 'Continue' }).tap(); await page.waitForTimeout(300);
    assert.equal(await now(), '2');
    await page.getByRole('button', { name: 'Back' }).tap(); await page.waitForTimeout(300);
    assert.equal(await now(), '1'); assert.equal(await page.locator('#lf-address').inputValue(), '7 Walk Street', 'Back keeps the answers');
    await page.getByRole('button', { name: 'Continue' }).tap(); await page.waitForTimeout(300);
    // The rent: one large field, the $ shown, numbers only, formatted as typed.
    await page.locator('#lf-rent').fill('24000');
    assert.equal(await page.locator('#lf-rent').inputValue(), '24,000');
    assert.deepEqual(await page.locator('#lf-rent').evaluate((el) => [el.inputMode, el.autocomplete]), ['numeric', 'off']);
    await page.locator('#lf-rent').fill('2400');
    assert.equal(await page.locator('select').count(), 0, 'no dropdown in the steps');
    await page.locator('[data-chips="lf-beds"] [data-chip="1"]').tap();
    assert.equal(await page.locator('[data-chips="lf-beds"] [data-chip="1"]').getAttribute('aria-checked'), 'true');
    await page.locator('[data-chips="lf-move"] [role=radio]').first().tap();
    await page.getByRole('button', { name: 'Continue' }).tap(); await page.waitForTimeout(300);
    assert.equal(await now(), '3');
    // The keyboard opens: Create listing sits right above it.
    await page.locator('#lf-landlord-name').focus();
    const kb = 336;
    await page.evaluate((px) => window.__keyboard(px), kb); await page.waitForTimeout(250);
    const lifted = await primaryBox(page);
    assert.ok(Math.abs(lifted.bottom - (844 - kb)) <= 24 && lifted.bottom <= 844 - kb, `the button above the keyboard (${lifted.bottom} for ${844 - kb})`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'nothing sideways');
    await page.locator('#lf-landlord-name').fill('Pat Owner');
    await page.locator('#lf-landlord-email').fill('owner@example.com');
    await page.evaluate(() => window.__keyboard(0)); await page.waitForTimeout(200);
    if (width === 320) { await page.locator('.lf-panel').getByRole('button', { name: 'Cancel', exact: true }).count(); await ctx.close(); return; }
    // Saved: the screen is the apply link, one large Copy.
    await page.getByRole('button', { name: 'Create listing' }).tap();
    await page.locator('[data-listing-done] [data-apply-link]').waitFor({ timeout: 30000 });
    assert.match(await page.locator('[data-apply-link]').textContent(), /^https?:\/\/\S+$/, 'the link itself');
    await page.locator('[data-copy-link]').tap();
    await page.locator('[data-copy-link]', { hasText: 'Copied' }).waitFor({ timeout: 5000 });
    await page.locator('[data-listing-done]').getByRole('button', { name: 'Done' }).tap(); await page.waitForTimeout(600);
    // The draft went with the save.
    await page.locator('.dash-new').tap(); await panel.waitFor({ timeout: 15000 }); await page.waitForTimeout(400);
    assert.equal(await page.locator('#lf-address').inputValue(), ''); assert.equal(await page.locator('[data-draft-restored]').count(), 0, 'no draft after a save');
  } finally { await ctx.close().catch(() => {}); }
}
async function deskForm(browser) {
  const ctx = await context(browser, 1440, 900, false); await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  try {
    await page.goto('/dashboard', { waitUntil: 'load' }); await page.locator('[data-shell-new]').waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('[data-shell-new]').click();
    const panel = page.locator('.lf-panel'); await panel.waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
    assert.equal(await page.locator('[role=progressbar]').count(), 0, 'no steps on a desktop');
    const form = await page.locator('.lf-col').boundingBox(); const aside = await page.locator('.lf-aside').boundingBox();
    assert.ok(form.width >= 480 && form.width <= 600, `the form about 520px wide (${form.width})`);
    assert.ok(aside.x >= form.x + form.width - 1, 'what tenants see, on the right');
    await page.locator('#lf-address').fill('19 Preview Lane');
    assert.equal(await page.locator('.lf-aside [data-preview-address]').textContent(), '19 Preview Lane', 'the preview follows the typing');
    // Enter moves to the next field.
    await page.locator('#lf-address').press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lf-unit');
    // Tab stays inside the panel.
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('.lf-panel')), `Tab ${i + 1} stays in the panel`); }
    // Escape closes, the draft is kept, and the focus is back on New listing.
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached', timeout: 10000 }); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-shell-new')), true, 'the focus is back on New listing');
    await page.locator('[data-shell-new]').click(); await panel.waitFor({ timeout: 15000 }); await page.waitForTimeout(400);
    assert.equal(await page.locator('#lf-address').inputValue(), '19 Preview Lane', 'the draft was kept');
    await page.getByRole('button', { name: 'Start over' }).click();
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached', timeout: 10000 });
    // Duplicate: from a listing, the form filled from it, the unit empty.
    await page.goto('/listing/L1', { waitUntil: 'load' }); await page.locator('[data-duplicate-listing]').waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('[data-duplicate-listing]').click();
    await panel.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    assert.equal(new URL(page.url()).searchParams.get('duplicate'), null, 'the address is clean again');
    assert.match(await page.locator('#lf-address').inputValue(), /Carlaw/);
    assert.equal(await page.locator('#lf-unit').inputValue(), '', 'the unit is empty');
    assert.equal(await page.locator('#lf-rent').inputValue(), '2,600');
    assert.equal(await page.locator('[data-chips="lf-beds"] [data-chip="2"]').getAttribute('aria-checked'), 'true');
  } finally { await ctx.close().catch(() => {}); }
}
async function formWalk(type, launch) {
  const browser = await type.launch(launch);
  try { await phoneForm(browser, 390); await phoneForm(browser, 320); await deskForm(browser); } finally { await browser.close(); }
}
test('the new listing form in WebKit at 390, 320 and 1440', async () => { requireWebkit(); await formWalk(pw.webkit, {}); });
test('the new listing form in Chrome at 390, 320 and 1440', { skip: haveChrome ? false : 'Chrome binary absent' }, () => formWalk(pw.chromium, { executablePath: chromeBin }));

async function officeWalk(type, launch) {
  const browser = await type.launch(launch);
  await fake('/__fake/state?longemail=1');
  try {
    const ctx = await context(browser, 320, 800, false);
    const page = await ctx.newPage();
    const r = await page.request.post('/api/admin/login', { data: { password: OFFICE } });
    assert.ok(r.ok(), `office sign in (${r.status()})`);
    const m = /rl_admin=([^;]+)/.exec(r.headers()['set-cookie'] || '');
    await ctx.addCookies([{ name: 'rl_admin', value: decodeURIComponent(m[1]), url: BASE, httpOnly: true, sameSite: 'Strict' }]);
    await page.goto('/admin', { waitUntil: 'load' });
    const email = 'alexandria.konstantinopoulou.residential.leasing@harbourfrontresidentialrealty.ca';
    const cell = page.locator('.ad-list .ad-email', { hasText: 'alexandria.konstantinopoulou' }).first();
    await cell.waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    const got = await cell.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), lh: parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3, title: el.title, cut: el.scrollWidth > el.clientWidth, text: el.textContent }));
    assert.ok(got.h <= got.lh + 2, `one line (${got.h}px for a ${got.lh}px line)`);
    assert.equal(got.title, email, 'the whole address on hover'); assert.equal(got.text, email, 'and in the text, cut by the box alone');
    assert.equal(got.cut, true, 'cut short at 320');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'nothing sideways');
    const short = await page.locator('.ad-list .ad-email', { hasText: 'sarah@example.com' }).first().evaluate((el) => el.scrollWidth > el.clientWidth);
    assert.equal(short, false, 'an email that fits is whole');
    await ctx.close();
  } finally { await fake('/__fake/state?longemail=0'); await browser.close(); }
}
test('the office list with a very long email in WebKit at 320', async () => { requireWebkit(); await officeWalk(pw.webkit, {}); });
test('the office list with a very long email in Chrome at 320', { skip: haveChrome ? false : 'Chrome binary absent' }, () => officeWalk(pw.chromium, { executablePath: chromeBin }));

test('the empty dashboard in WebKit at 390 and 1440', async () => { requireWebkit(); await emptyWalk(pw.webkit, {}); });
test('the empty dashboard in Chrome at 390 and 1440', { skip: haveChrome ? false : 'Chrome binary absent' }, () => emptyWalk(pw.chromium, { executablePath: chromeBin }));
