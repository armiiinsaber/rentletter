// The realtor shell and the Listings view (components/dashboard/DashShell.js, HomeView.js,
// StatusBoard.js, ListingCard.js, NeedsYou.js, CommandMenu.js, MainNav.js) walked for real on the
// fake stack (the route fixture: 210 Carlaw has a report ready to send, 88 Harbour an applicant to
// ask for documents), in WebKit and in Chrome:
//   1440: the floating glass sidebar (16px in from the window's edges, 232px wide, 28px corners) with
//     its five places, Listings marked and counted as the Active listings tile counts; no tab bar;
//     the status board's four tiles one row across the main area's whole width, equal widths; the
//     cards with their strips, Needs you beside them; a tile that filters the cards; Pipeline and
//     Shared with you in place (no reload, no transition); a card that opens
//     its listing from anywhere on it, its address the link for the keyboard; the copy button's
//     Copied for a second; Select and the bar; the Compact table kept on the device; the command
//     menu: open from the search bar and from Command K or Control K, find a listing and jump, find
//     an applicant, run an action, the arrows, Tab kept inside, Escape closing with the focus back;
//     and Send report asking first (components/dashboard/SendReportSheet.js): the card, the Ready to
//     send tile and Needs you open the send sheet, with nothing sent while it is open, nor on Cancel,
//     Escape, a tap outside or Preview (the report's PDF in a new tab); the missing email added
//     through the listing's setup form and the signing name in the sheet; then Send to the landlord:
//     the sheet closes, Sent in place, the card, the tile and Needs you follow, and the landlord's
//     page lists the applicants the sheet listed, in its order, with the same Fit words.
//   1440, 1920 and 2560: the shell fills the window (the sidebar floats 16px in, the board spans the
//     main area, Needs you 360 to 420px, nothing sideways, no card wider than its column).
//   1024: Needs you under the cards; the sidebar stays on screen, full height less its insets.
//   390: the phone: no sidebar, the round search and bell, the tiles two by two, the cards compact
//     (no names under the strip), the floating tab bar (16px in, 68px, the red New listing raised,
//     Listings marked) with the last card scrolling clear above it; the search opens the menu.
//   The placeholders while the dashboard loads, at 320, 390, 1024, 1280, 1440, 1920 and 2560.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked.
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

const HOME = `${BASE}/dashboard`;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const down = () => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } fake = null; } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } };
// Each engine starts from the fixture: a fresh server.
async function up() {
  down();
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
}
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  onStuck(down);
  walkStep('building the fake stack for production');
  down();
  await fakeBuild(PORT); // one build a run, copied to this walk's own folder (tests/helpers/fakeBuild.mjs)
}, { timeout: START_TIMEOUT + 600000 });
after(async () => { leaveTurn(); down(); if (turn) giveTurn(); }, { timeout: STOP_TIMEOUT });

const box = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; }, sel);
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'), sel);
const open = async (page, path = '') => { await page.goto(`${HOME}${path}`, { waitUntil: 'networkidle' }); await page.locator('[data-listing-card]:visible, [data-listings-table]:visible').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(500); };
const cardIds = (page) => page.locator('[data-listing-card]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('data-listing-card')));
const tileNum = (page, key) => page.locator(`[data-tile="${key}"] [data-roll]`).getAttribute('data-roll').then(Number);
// The shell against the window: the sidebar, the board, the cards, Needs you, measured in the page.
const shellFit = (page) => page.evaluate(() => {
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
  const b = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; };
  const W = window.innerWidth;
  const side = vis('[data-shell-side]');
  return {
    W,
    side: side ? { ...b(side), radius: getComputedStyle(side).borderTopLeftRadius, blur: /blur/.test(getComputedStyle(side).backdropFilter || getComputedStyle(side).webkitBackdropFilter || '') } : null,
    tiles: [...document.querySelectorAll('[data-status-board] [data-tile]')].map((e) => b(e)),
    cards: [...document.querySelectorAll('[data-listing-card]')].filter((e) => e.getClientRects().length).map((e) => b(e)),
    column: b(vis('.hv-primary')),
    ny: vis('[data-needs-you]') ? b(vis('[data-needs-you]')) : null,
    pad: parseFloat(getComputedStyle(vis('.hv')).paddingRight),
    sideways: document.documentElement.scrollWidth - W,
  };
});

async function deskWalk(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await blockSupabase(ctx);
  // The clipboard, read back in both engines: what the copy button wrote lands in window.__copied.
  await ctx.addInitScript(() => { window.__copied = null; const w = { writeText: async (t) => { window.__copied = t; } }; try { Object.defineProperty(navigator, 'clipboard', { value: w, configurable: true }); } catch (e) { /* the fallback then runs */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  try {
    await open(page);
    // The sidebar: floating glass, five places, Listings marked and counted as the tile counts.
    assert.equal(await visible(page, '[data-main-nav]'), false, `${tag}: no tab bar at 1440`);
    assert.deepEqual(await page.locator('[data-shell-place]').evaluateAll((els) => els.map((e) => e.querySelector('.ds-place-label').textContent.trim())), ['Listings', 'Pipeline', 'Circle', 'Shared with you', 'Profile']);
    assert.equal(await page.locator('[data-shell-place="listings"]').getAttribute('aria-current'), 'page');
    assert.equal(Number(await page.locator('[data-shell-count]').textContent()), await tileNum(page, 'all'), `${tag}: the sidebar's count is the Active listings tile's`);
    assert.equal(await tileNum(page, 'all'), 2);
    assert.ok(await visible(page, '[data-shell-me]'), `${tag}: the realtor at the bottom of the sidebar`);
    assert.equal(await visible(page, '.rl-hdr-avatar'), false, `${tag}: no avatar in the header`);
    // The board: Ready to send is live (210 Carlaw), its tile a link; the others say their counts.
    assert.equal(await tileNum(page, 'toSend'), 1);
    assert.equal(await page.locator('[data-tile="toSend"]').evaluate((e) => [e.tagName, e.classList.contains('sb-dark'), !!e.querySelector('.sb-dot')].join()), 'A,true,true', `${tag}: black, with the red dot, a link`);
    assert.equal(await page.locator('[data-tile="toCheck"]').evaluate((e) => [e.tagName, !!e.querySelector('.sb-dot'), e.classList.contains('sb-quiet')].join()), 'BUTTON,false,true', `${tag}: nothing to check: quiet`);
    // The cards: the next step as the one main action, the strip, the status line.
    assert.deepEqual(await page.locator('[data-listing-card="L1"] [data-card-action]').evaluate((e) => [e.getAttribute('data-card-action'), e.textContent.trim()]), ['send', 'Send report']);
    assert.deepEqual(await page.locator('[data-listing-card="L2"] [data-card-action]').evaluate((e) => [e.getAttribute('data-card-action'), e.textContent.trim()]), ['ask', 'Ask for documents']);
    assert.deepEqual(await page.locator('[data-listing-card="L1"] [data-seg]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seg'))), ['done', 'done', 'done', 'done', 'current', 'todo']);
    assert.deepEqual(await page.locator('[data-listing-card="L1"] .lc-seg-t').evaluateAll((els) => els.map((e) => e.firstChild.textContent)), ['Invited', 'Applied', 'Documents', 'Employer called', 'Report', 'Rented'], `${tag}: the names under the strip`);
    assert.match(await page.locator('[data-listing-card="L1"] [data-card-status]').innerText(), /^Ready to send,\s+waiting \d+ days?$/);
    // Needs you beside the cards, and the same Ready to send.
    const ny = await box(page, '[data-needs-you]'); const col = await box(page, '.hv-primary');
    assert.ok(ny.left > col.right, `${tag}: Needs you beside the cards`);
    assert.equal(await page.locator('[data-needs-you-item="ready:L1"]').count(), 1);
    // A tile filters: Applicants shows the listings with applicants, again shows them all.
    await page.locator('[data-tile="applicants"]').click(); await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-tile="applicants"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual((await cardIds(page)).sort(), ['L1', 'L2']);
    await page.locator('[data-tile="applicants"]').click(); await page.waitForTimeout(250);
    // Ready to send opens the send sheet (below, with Send report from the card and Needs you).
    // Pipeline and Shared with you in place: the address changes, nothing slides, nothing reloads.
    await page.evaluate(() => { window.__shellMark = 1; window.__navMarks = 0; new MutationObserver(() => { if (document.documentElement.dataset.nav) window.__navMarks++; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] }); });
    await page.locator('[data-shell-place="pipeline"]').click();
    await page.waitForURL((u) => u.searchParams.get('view') === 'pipeline', { timeout: 10000 }); await page.waitForTimeout(300);
    assert.ok(await visible(page, '#people'), `${tag}: the Pipeline view`);
    assert.equal(await visible(page, '[data-listing-card]'), false, `${tag}: not the cards`);
    await page.locator('[data-shell-place="shared"]').click();
    await page.waitForURL((u) => u.searchParams.get('view') === 'shared', { timeout: 10000 }); await page.waitForTimeout(300);
    await page.locator('[data-shell-place="listings"]').click();
    await page.waitForURL((u) => !u.search, { timeout: 10000 }); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [window.__shellMark, window.__navMarks]), [1, 0], `${tag}: no reload and no transition between the views`);
    // A card opens its listing from anywhere on it; its address is the link for the keyboard.
    await page.locator('[data-listing-card="L2"] .lc-stripc').click();
    await page.waitForURL((u) => u.pathname === '/listing/L2', { timeout: 15000 });
    await page.goBack(); await page.locator('[data-listing-card]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await page.locator('[data-listing-card="L2"] .lc-link').focus();
    assert.match(await page.evaluate(() => getComputedStyle(document.activeElement.closest('[data-listing-card]')).boxShadow), /rgb\(15, 15, 16\) 0px 0px 0px 2px/, `${tag}: the card shows the focus`);
    // The copy button: the apply link copied, Copied for a second, the card not opened.
    await page.locator('[data-listing-card="L1"] [data-copy-apply]').click();
    assert.equal(await page.locator('[data-listing-card="L1"] [data-copy-apply]').getAttribute('data-copied'), 'true');
    assert.equal((await page.locator('[data-listing-card="L1"] .lc-copied').textContent()).trim(), 'Copied');
    assert.match(await page.evaluate(() => window.__copied), /\/apply\/a1b2c3d4e5f6a7b8c9d0$/, `${tag}: the apply link`);
    assert.equal(new URL(page.url()).pathname, '/dashboard', `${tag}: the button's own tap`);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-listing-card="L1"] [data-copy-apply]').getAttribute('data-copied'), 'false', `${tag}: Copied for a second`);
    // Select: a checkbox on every card, the bar for the ones picked.
    await page.locator('[data-select-mode]:visible').click();
    assert.equal(await page.locator('[data-card-check]:visible').count(), 2, `${tag}: a checkbox on every card`);
    await page.locator('[data-card-check="L2"]').check();
    assert.match(await page.locator('[data-bulk-bar]').textContent(), /1 selected/);
    await page.locator('[data-select-mode]:visible').click();
    assert.equal(await page.locator('[data-bulk-bar]').count(), 0, `${tag}: Done clears the selection`);
    // The Compact table, kept on the device across a reload, and back to the cards.
    await page.locator('[data-view-mode-to="compact"]').click(); await page.waitForTimeout(250);
    assert.ok(await visible(page, '[data-listings-table]'), `${tag}: the Compact table`);
    await open(page);
    assert.ok(await visible(page, '[data-listings-table]'), `${tag}: still Compact after a reload`);
    assert.equal(await page.locator('[data-view-mode-to="compact"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-view-mode-to="cards"]').click(); await page.waitForTimeout(250);
    assert.equal(await visible(page, '[data-listings-table]'), false);
    // The command menu from the search bar: a listing found and jumped to.
    await page.locator('[data-command-open="desk"]').click();
    const menu = page.locator('[data-command-menu]'); await menu.waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-command-input')), true, `${tag}: the field has the focus`);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-command-input')), true, `${tag}: Tab stays in the menu`); }
    await page.keyboard.type('harbour');
    assert.deepEqual(await menu.locator('[data-command-result]').evaluateAll((els) => els.map((e) => e.getAttribute('data-command-result'))), ['listing:L2']);
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === '/listing/L2', { timeout: 15000 });
    await page.goBack(); await page.locator('[data-listing-card]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    // Command K (Control K off a Mac): an applicant by name, the arrows, then Escape: closed, the
    // focus back where it was.
    const mod = (await page.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta' : 'Control';
    await page.locator('[data-command-open="desk"]').focus();
    await page.keyboard.press(`${mod}+k`); await menu.waitFor({ timeout: 10000 }); await page.waitForTimeout(300);
    await page.keyboard.type('applicant');
    const found = await menu.locator('[data-command-result]').evaluateAll((els) => els.map((e) => e.getAttribute('data-command-result')));
    assert.ok(found.length >= 2 && found.every((r) => r.startsWith('applicant:')), `${tag}: applicants by name (${found.join(', ')})`);
    await page.keyboard.press('ArrowDown');
    assert.equal(await menu.locator('[aria-selected="true"]').getAttribute('id'), 'cm-opt-1', `${tag}: the arrow moves the mark`);
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached', timeout: 10000 }); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-command-open')), 'desk', `${tag}: the focus back on the search bar`);
    // An action: Pipeline, in place.
    await page.keyboard.press(`${mod}+k`); await menu.waitFor({ timeout: 10000 }); await page.waitForTimeout(300);
    await page.keyboard.type('pipeline'); await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.searchParams.get('view') === 'pipeline', { timeout: 10000 });
    await page.locator('[data-shell-place="listings"]').click(); await page.waitForURL((u) => !u.search, { timeout: 10000 }); await page.waitForTimeout(300);
    // 1440, 1920 and 2560: the shell fills the window.
    for (const width of [1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(400);
      const f = await shellFit(page); const at = JSON.stringify(f);
      assert.equal(f.W, width);
      assert.ok(f.side && f.side.left === 16 && f.side.top === 16 && f.side.width === 232 && f.side.radius === '28px' && f.side.blur, `${width}: the sidebar floats, 16px in, 232px wide, 28px corners, glass (${JSON.stringify(f.side)})`);
      assert.equal(f.tiles.length, 4);
      const left = f.column.left; const right = width - f.pad;
      assert.ok(Math.abs(f.tiles[0].left - left) <= 1 && Math.abs(f.tiles[3].right - right) <= 1, `${width}: the board spans the main area (${at})`);
      assert.ok(f.tiles.every((t) => Math.abs(t.width - f.tiles[0].width) <= 1 && t.top === f.tiles[0].top), `${width}: four equal tiles in one row (${at})`);
      assert.ok(f.ny && Math.abs(f.ny.right - right) <= 1 && f.ny.width >= 359 && f.ny.width <= 421, `${width}: Needs you at the right, 360 to 420px (${at})`);
      assert.ok(f.cards.every((c) => c.left >= f.column.left - 1 && c.right <= f.column.right + 1), `${width}: every card inside its column (${at})`);
      assert.ok(f.sideways <= 0, `${width}: no sideways scroll`);
    }
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
    // Send report asks first (components/dashboard/SendReportSheet.js): the card, the Ready to send
    // tile and Needs you open the send sheet, and nothing goes to the landlord until Send to the
    // landlord is pressed. Cancel, Escape and a tap outside send nothing; Preview sends nothing.
    const posts = []; page.on('request', (q) => { if (q.method() === 'POST' && new URL(q.url()).pathname === '/api/listings/send-report') posts.push(q.url()); });
    const mailed = () => fetch(`${BASE}/__fake/mail?to=marco@example.com`).then((x) => x.json());
    const nothingSent = async (when) => { assert.deepEqual(posts, [], `${tag}: ${when}: no send`); assert.equal((await mailed()).length, 0, `${tag}: ${when}: no email to the landlord`); };
    const sheet = page.locator('[data-send-sheet="L1"]');
    const sheetUp = async () => { await sheet.waitFor({ timeout: 10000 }); await page.waitForTimeout(450); };
    const sheetGone = () => page.locator('[data-send-sheet]').waitFor({ state: 'detached', timeout: 10000 });
    const read = () => sheet.evaluate((s) => {
      const t = (sel) => { const e = s.querySelector(sel); return e ? e.textContent.replace(/\u00a0/g, ' ').trim() : null; };
      return { address: t('[data-send-address]'), landlord: t('[data-send-landlord-name]'), email: t('[data-send-landlord-email]'), signature: t('[data-send-signature]'), missing: [...s.querySelectorAll('[data-send-missing]')].map((e) => e.getAttribute('data-send-missing')),
        rows: [...s.querySelectorAll('[data-send-applicant]')].map((e) => `${e.getAttribute('data-send-rank')}. ${e.querySelector('[data-send-name]').textContent.replace(/\u00a0/g, ' ').trim()}`), fits: [...s.querySelectorAll('[data-send-fit]')].map((e) => e.textContent.trim()),
        preview: !!s.querySelector('a[data-send-preview][target="_blank"]'), buttons: [...s.querySelectorAll('.srs-actions button')].map((b) => [b.textContent.trim(), b.disabled]) };
    });
    await open(page);
    // From the card: the address, the landlord, the signing name (none yet: it says so), the
    // applicants in the report's order with their Fit words, Preview, and the two buttons.
    await page.locator('[data-listing-card="L1"] [data-card-action="send"]').click(); await sheetUp();
    let s1 = await read();
    assert.deepEqual([s1.address, s1.landlord, s1.email, s1.signature, s1.missing], ['210 Carlaw Ave, Unit 4', 'Marco Rossi', 'marco@example.com', null, ['signature']], `${tag}: the sheet (${JSON.stringify(s1)})`);
    assert.ok(s1.rows.length >= 2 && s1.rows.every((r, i) => r.startsWith(`${i + 1}. `)) && s1.fits.length === s1.rows.length && s1.preview, `${tag}: the applicants in order with their Fit words, and Preview (${JSON.stringify(s1)})`);
    assert.deepEqual(s1.buttons, [['Send to the landlord', true], ['Cancel', false]], `${tag}: the two buttons, Send waiting for the signing name`);
    assert.equal(new URL(page.url()).pathname, '/dashboard', `${tag}: the card did not open`);
    await nothingSent('the sheet open');
    await sheet.locator('[data-send-cancel]').click(); await sheetGone();
    await nothingSent('Cancel');
    // The Ready to send tile: the sheet for the listing that has waited longest, in place; Escape.
    await page.locator('[data-tile="toSend"]').click(); await sheetUp();
    assert.equal(new URL(page.url()).pathname, '/dashboard', `${tag}: the tile opens the sheet, not the listing`);
    await page.keyboard.press('Escape'); await sheetGone();
    await nothingSent('Escape');
    // Needs you's Send: the same sheet; a tap on the dimmed page outside it.
    await page.locator('[data-needs-you-item="ready:L1"] .ny-go').click(); await sheetUp();
    await page.locator('.rl-sh-scrim').click({ position: { x: 12, y: 12 } }); await sheetGone();
    await nothingSent('a tap outside');
    // The missing email: taken off the listing, the sheet says so and Add the email opens the
    // listing's setup form; the email saved there, the sheet is back with it.
    const off = await page.request.post(`${BASE}/api/listings/update`, { data: { listingId: 'L1', landlord_email: null } });
    assert.ok(off.ok(), `${tag}: the email taken off (${off.status()})`);
    await open(page);
    await page.locator('[data-listing-card="L1"] [data-card-action="send"]').click(); await sheetUp();
    s1 = await read();
    assert.deepEqual([s1.landlord, s1.email, s1.missing], ['Marco Rossi', null, ['email', 'signature']], `${tag}: the email and the signing name missing (${JSON.stringify(s1)})`);
    assert.equal(await sheet.locator('[data-send-confirm]').isDisabled(), true);
    await sheet.locator('[data-send-add-email]').click(); await sheetGone();
    const form = page.locator('[data-listing-form]'); await form.waitFor({ timeout: 10000 }); await page.waitForTimeout(450);
    await form.locator('#lf-landlord-email').fill('marco@example.com');
    await form.locator('[data-lf-primary]').click();
    await form.waitFor({ state: 'detached', timeout: 15000 }); await sheetUp();
    s1 = await read();
    assert.deepEqual([s1.email, s1.missing], ['marco@example.com', ['signature']], `${tag}: back in the sheet with the email (${JSON.stringify(s1)})`);
    await nothingSent('the email added');
    // The signing name, asked in the sheet: prefilled with the name and the brokerage, saved.
    await sheet.locator('[data-send-add-signature]').click();
    const field = sheet.locator('[data-send-signature-field] input'); await field.waitFor({ timeout: 5000 });
    assert.equal(await field.inputValue(), 'Sarah Chen, Demo Realty', `${tag}: the field prefilled`);
    await sheet.locator('[data-send-signature-save]').click();
    await sheet.locator('[data-send-signature]').waitFor({ timeout: 10000 });
    s1 = await read();
    assert.deepEqual([s1.signature, s1.missing, s1.buttons], ['Sarah Chen, Demo Realty', [], [['Send to the landlord', false], ['Cancel', false]]], `${tag}: nothing missing, Send ready`);
    // Preview: the report the landlord gets, in a new tab; the sheet stays, nothing is sent.
    const pdf = page.waitForResponse((x) => new URL(x.url()).pathname === '/api/listings/report-pdf' && new URL(x.url()).searchParams.get('listingId') === 'L1', { timeout: 15000 });
    const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), sheet.locator('[data-send-preview]').click()]);
    const got = await pdf;
    assert.deepEqual([got.status(), got.headers()['content-type']], [200, 'application/pdf'], `${tag}: the report's PDF`);
    await tab.waitForURL(/^blob:/, { timeout: 10000 });
    await tab.close();
    assert.equal(await sheet.count(), 1, `${tag}: the sheet stays after Preview`);
    await nothingSent('Preview');
    const listed = await read();
    // Send to the landlord: the sheet closes, and the card shows Sent in place, then its status follows.
    await sheet.locator('[data-send-confirm]').click();
    await sheetGone();
    assert.equal(posts.length, 1, `${tag}: one send, from the sheet`);
    await page.locator('[data-listing-card="L1"] .lc-act-done').waitFor({ timeout: 15000 });
    assert.equal((await page.locator('[data-listing-card="L1"] .lc-act-done').textContent()).trim(), 'Sent', `${tag}: a tick and Sent, in place`);
    assert.equal(new URL(page.url()).pathname, '/dashboard', `${tag}: the card did not open`);
    await page.waitForFunction(() => /^Report sent [A-Z][a-z]{2} \d{1,2}$/.test(document.querySelector('[data-listing-card="L1"] [data-card-status]')?.innerText.trim() || ''), null, { timeout: 10000 });
    assert.deepEqual(await page.locator('[data-listing-card="L1"] [data-seg]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seg'))), ['done', 'done', 'done', 'done', 'done', 'current'], `${tag}: Report done, Rented the step`);
    await page.waitForFunction(() => document.querySelector('[data-tile="toSend"] [data-roll]')?.getAttribute('data-roll') === '0', null, { timeout: 5000 });
    assert.equal(await page.locator('[data-tile="toSend"]').evaluate((e) => [e.tagName, e.classList.contains('sb-quiet')].join()), 'BUTTON,true', `${tag}: the tile quiet`);
    assert.equal(await page.locator('[data-needs-you-item="ready:L1"]').count(), 0, `${tag}: and gone from Needs you`);
    const mail = await fetch(`${BASE}/__fake/mail?to=marco@example.com`).then((x) => x.json());
    assert.ok(mail.length >= 1, `${tag}: the landlord's email went`);
    // The sheet listed the applicants the landlord's page shows, in its order, each with its Fit word.
    const token = (String(mail[mail.length - 1].text).match(/\/r\/([A-Za-z0-9_-]+)/) || [])[1];
    assert.ok(token, `${tag}: the report's page in the email`);
    const landlord = await ctx.newPage();
    await landlord.goto(`${BASE}/r/${token}`, { waitUntil: 'networkidle' });
    const onPage = await landlord.locator('section[aria-label]').evaluateAll((els) => els.filter((e) => /^\d+\. /.test(e.getAttribute('aria-label'))).map((e) => [e.getAttribute('aria-label').replace(/\u00a0/g, ' '), e.textContent.replace(/\u00a0/g, ' ')]));
    await landlord.close();
    assert.deepEqual(onPage.map((p) => p[0]), listed.rows, `${tag}: the same applicants in the same order`);
    assert.ok(onPage.every((p, i) => p[1].includes(listed.fits[i])), `${tag}: each with the Fit word the sheet showed (${JSON.stringify(listed.fits)})`);
    assert.deepEqual(errors, [], `${tag}: no page error`);
    noSupabaseLeft(ctx, '1440');
  } finally { await ctx.close(); }

  // 1024: Needs you under the cards; the sidebar stays, full height less its insets.
  const mid = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1024, height: 800 } })).newPage();
  try {
    await blockSupabase(mid.context());
    await open(mid);
    const c2 = await box(mid, '.hv-primary'); const n2 = await box(mid, '[data-needs-you]');
    assert.ok(n2.top > c2.bottom - 1, `${tag}: under the cards at 1024 (${JSON.stringify({ c2, n2 })})`);
    assert.equal(await mid.evaluate(() => document.documentElement.scrollWidth), 1024, `${tag}: no sideways scroll`);
    await mid.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' })); await mid.waitForTimeout(300);
    const stuck = await mid.evaluate(() => { const r = document.querySelector('[data-shell-side]').getBoundingClientRect(); return { y: window.scrollY, top: Math.round(r.top), height: Math.round(r.height), vh: window.innerHeight }; });
    assert.ok(stuck.y > 0 && stuck.top === 16 && stuck.height === stuck.vh - 32, `${tag}: the sidebar stays, the window's height less 16px each end (${JSON.stringify(stuck)})`);
    noSupabaseLeft(mid.context(), '1024');
  } finally { await mid.context().close(); }

  // 390: the phone.
  const phone = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true })).newPage();
  try {
    await blockSupabase(phone.context());
    await open(phone);
    assert.equal(await visible(phone, '[data-shell-side]'), false, `${tag}: no sidebar`);
    assert.equal(await visible(phone, '[data-needs-you]'), false, `${tag}: Needs you is the bell's on a phone`);
    const tabs = await phone.locator('[data-main-nav]').evaluate((n) => { const r = n.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom), height: Math.round(r.height), items: [...n.querySelectorAll('[data-nav], [data-tab-new]')].map((e) => e.getAttribute('data-nav') || 'new'), current: [...n.querySelectorAll('[aria-current="page"]')].map((e) => e.getAttribute('data-nav')), red: getComputedStyle(n.querySelector('[data-tab-new]')).backgroundColor }; });
    assert.deepEqual(tabs, { left: 16, right: 16, bottom: 16, height: 68, items: ['listings', 'pipeline', 'new', 'circle', 'profile'], current: ['listings'], red: 'rgb(215, 32, 39)' }, `${tag}: the tab bar`);
    const t = await phone.evaluate(() => [...document.querySelectorAll('[data-status-board] [data-tile]')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    assert.ok(t[0][1] === t[1][1] && t[2][1] === t[3][1] && t[2][1] > t[0][1] && t[0][0] === t[2][0], `${tag}: two by two (${JSON.stringify(t)})`);
    // The names stay for a screen reader, drawn as nothing (a 1px clipped box).
    assert.ok(await phone.locator('[data-listing-card="L1"] .lc-seg-t').evaluateAll((els) => els.length === 6 && els.every((e) => e.getBoundingClientRect().width <= 1)), `${tag}: no names under the strip on a phone`);
    assert.match(await phone.locator('[data-listing-card="L1"] .lc-narrow').innerText(), /^\$2,600 · 2 bed · \d+ applicants$/);
    // The last card scrolls clear above the bar.
    await phone.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await phone.waitForTimeout(300);
    const last = await phone.evaluate(() => { const cards = [...document.querySelectorAll('[data-listing-card]')]; const bar = document.querySelector('[data-main-nav]').getBoundingClientRect(); const lastEl = [...document.querySelectorAll('.hv-part-listings > .hv-cols > .hv-primary > *')].filter((e) => e.getClientRects().length).pop(); return { card: Math.round(cards[cards.length - 1].getBoundingClientRect().bottom), end: Math.round(lastEl.getBoundingClientRect().bottom), bar: Math.round(bar.top) }; });
    assert.ok(last.end <= last.bar && last.card <= last.bar, `${tag}: the page ends above the bar (${JSON.stringify(last)})`);
    // The round search opens the menu.
    await phone.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await phone.locator('[data-command-open="phone"]').tap();
    await phone.locator('[data-command-menu]').waitFor({ timeout: 10000 });
    noSupabaseLeft(phone.context(), '390');
  } finally { await phone.context().close(); }
}

// The placeholders: a tap to the dashboard whose page data is held back shows the Listings view's
// shape (components/dashboard/BoardSkeleton.js) in the frame, at every width: the four tiles in a
// row from 1024 and two by two under it, three cards, Needs you's column beside them from 1280,
// nothing sideways, no word on view but the hidden status line.
async function placeholders(browser, tag) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/circle`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await page.route(/\/_next\/data\/[^/]+\/dashboard\.json/, () => { /* held: never answered */ });
    await page.locator('[data-shell-place="listings"]').click();
    await page.locator('[data-board-skeleton]').first().waitFor({ timeout: 10000 });
    for (const width of [1440, 1920, 2560, 1280, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(120);
      const s = await page.evaluate(() => {
        const sk = [...document.querySelectorAll('[data-board-skeleton]')].find((e) => e.getClientRects().length);
        const tiles = [...sk.querySelectorAll('.bs-tile')].map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
        const side = sk.querySelector('.bs-side');
        return { tiles, cards: sk.querySelectorAll('.bs-card').length, side: !!side && side.getClientRects().length > 0, words: sk.innerText.trim(), sideways: document.documentElement.scrollWidth - innerWidth };
      });
      const rows = new Set(s.tiles.map((t) => t[1])).size;
      assert.ok(s.tiles.length === 4 && rows === (width >= 1024 ? 1 : 2) && s.cards === 3 && s.side === width >= 1280 && s.sideways <= 0, `${tag} ${width}: the placeholders (${JSON.stringify(s)})`);
      assert.equal(s.words, 'Loading your workspace', `${tag} ${width}: one status line, hidden`);
    }
  } finally { await ctx.close(); }
}

async function walk(browserType, launch, tag) {
  await up();
  await fetch(HOME).catch(() => null);
  const browser = await browserType.launch(launch);
  try { await deskWalk(browser, tag); await placeholders(browser, tag); } finally { await browser.close(); }
}

test('the shell and the Listings view in WebKit at 1440, 1920, 2560, 1024 and 390', async () => { requireWebkit(); await walk(pw.webkit, {}, 'wk'); });
test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
