// No page wastes the screen, and a sheet on a computer is a pop up, walked for real on the fake stack
// in WebKit (Safari's engine) and in Chrome:
//   1. The width (tests/helpers/fillsWidth.mjs): at 1440, 1920 and 2560 the content of every page a
//      signed in realtor or tenant reaches, and the public pages, either reaches within the page
//      padding of both sides of its area or is centred with its two margins within 5% of each other:
//      the dashboard's Listings, Pipeline and Shared with you (empty, then with a profile shared and
//      that profile open), a listing (L1, and L4 with three applicants), Circle, Profile, the tenant's
//      profile, the tenant's application, the landlord's report, the homepage, the FAQ, the join page
//      (the founding offer and its price), privacy, terms and the apply page. One narrow column with a
//      wide empty band beside it fails both, as the listing page did.
//   2. The listing page with three applicants (components/dashboard/ListingView.js): at 1280, 1440,
//      1920 and 2560 two columns that fill the main area, the left one flexible (the header card and
//      the applicants), the right one 380 to 420px (the landlord card with Send, Download PDF and Copy
//      text, then Post kit, then Details), staying on screen under the shell's header as the page
//      scrolls; from 1440 each applicant card one row across its column (the initials, the name, the
//      Fit at the right). At 1024 and 390 the right column comes under the applicants.
//   3. The sheets (components/Sheet.js): at 1440 the send sheet, the set aside sheet and the delete
//      confirm open as centred dialogs (about 560px wide, the send sheet wider for its list, 24px
//      corners, the solid card surface, nothing behind it moving), the focus kept inside (Tab and
//      Shift Tab go round), Escape and a click on the dimmed page close each, and the focus goes back
//      to what opened it; the command menu opens near the top centre, a search box with its results
//      under it; the new listing form, the edit form and the brokerage form are panels at the
//      window's right edge; the Sort sheet, opened at 390, is a centred dialog once the window is
//      1440 wide; the dialog's motion is opacity and transform only. At 390 the send sheet, the set
//      aside sheet and the command menu still rise from the bottom. The bulk selection bar is never a
//      sheet: a floating bar in the page, at 1440 and at 390.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';
import { FILLS_WIDTH } from '../helpers/fillsWidth.mjs';

const PORT = 3193; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
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
  turn = true; // one walk at a time in its lane (tests/helpers/devServer.mjs)
  onStuck(down);
  walkStep('building the fake stack for production');
  down();
  await fakeBuild(PORT); // one build a run, copied to this walk's own folder (tests/helpers/fakeBuild.mjs)
}, { timeout: START_TIMEOUT + 600000 });
after(async () => { leaveTurn(); down(); if (turn) giveTurn(); }, { timeout: STOP_TIMEOUT });

const json = async (path) => (await fetch(`${BASE}${path}`)).json();
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const go = async (page, path, wait = null) => { await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 }); if (wait) await page.locator(wait).first().waitFor({ timeout: 60000 }); await page.evaluate(() => document.fonts.ready); await settle(page); };
const DESK = [1440, 1920, 2560];
const box = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }, sel);
const near = (a, b, d = 2) => Math.abs(a - b) <= d;

// The sheet on top, as drawn: its place, its corners, its surface, and where the focus is.
const sheetNow = (page) => page.evaluate(() => {
  const root = [...document.querySelectorAll('[data-sheet]')].pop(); if (!root) return null;
  const p = root.querySelector(':scope > .rl-sh-panel'); const r = p.getBoundingClientRect(); const cs = getComputedStyle(p);
  return { at: root.dataset.sheetDesktop, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, vw: document.documentElement.clientWidth, vh: window.innerHeight, tl: parseFloat(cs.borderTopLeftRadius), bl: parseFloat(cs.borderBottomLeftRadius), bg: cs.backgroundColor, transition: cs.transitionProperty, focusIn: p.contains(document.activeElement), label: p.getAttribute('aria-label') };
});
const sheetGone = (page) => page.locator('[data-sheet]').first().waitFor({ state: 'detached', timeout: 15000 });
const focusIs = (page, sel) => page.evaluate((s) => { const a = document.activeElement; return !!a && a.matches(s); }, sel);
// A centred dialog: the window's middle across and down, 24px corners, the white card surface.
function centred(s, tag, minWidth = 560) {
  assert.ok(s, `${tag}: a sheet is open`);
  assert.equal(s.at, 'dialog', `${tag}: a dialog at this width`);
  assert.ok(near(s.left, s.vw - s.right), `${tag}: centred across (${Math.round(s.left)} and ${Math.round(s.vw - s.right)})`);
  assert.ok(near(s.top, s.vh - s.bottom), `${tag}: centred down (${Math.round(s.top)} and ${Math.round(s.vh - s.bottom)})`);
  assert.ok(s.width >= Math.min(minWidth, s.vw - 48) - 1, `${tag}: at least ${minWidth}px wide (${Math.round(s.width)})`);
  assert.equal(s.tl, 24, `${tag}: 24px corners`); assert.equal(s.bl, 24, `${tag}: every corner`);
  assert.equal(s.bg, 'rgb(255, 255, 255)', `${tag}: the solid card surface`);
}
// A sheet that rises from the bottom: its foot on the window's bottom edge, rounded at the top only.
function risen(s, tag) {
  assert.ok(s, `${tag}: a sheet is open`);
  assert.ok(near(s.bottom, s.vh, 1), `${tag}: its foot on the window's bottom edge (${Math.round(s.bottom)} of ${s.vh})`);
  assert.ok(s.tl > 0 && s.bl === 0, `${tag}: rounded at the top, square at the foot (${s.tl}, ${s.bl})`);
}
// A panel at the window's right edge, 16px in, the window's height less the insets.
function side(s, tag) {
  assert.ok(s, `${tag}: a panel is open`);
  assert.equal(s.at, 'side', `${tag}: a side panel`);
  assert.ok(near(s.vw - s.right, 16) && near(s.top, 16) && near(s.vh - s.bottom, 16), `${tag}: at the right edge, 16px in (right ${Math.round(s.vw - s.right)}, top ${Math.round(s.top)}, foot ${Math.round(s.vh - s.bottom)})`);
  assert.ok(s.left > 16, `${tag}: the page beside it`);
}
// Escape, then a click on the dimmed page, each closing the sheet and giving the focus back.
async function closesBoth(page, openIt, opener, tag) {
  await page.keyboard.press('Escape'); await sheetGone(page); await settle(page, 250);
  assert.ok(await focusIs(page, opener), `${tag}: Escape closed it and the focus is back on what opened it`);
  await openIt(); await settle(page, 450);
  const s = await sheetNow(page);
  // The dimmed page beside the sheet: the top left corner of the window.
  await page.mouse.click(Math.max(4, s.left / 2), 8); await sheetGone(page); await settle(page, 250);
  assert.ok(await focusIs(page, opener), `${tag}: a click on the dimmed page closed it and the focus is back`);
}
// Tab and Shift Tab go round the sheet's controls and never leave it.
async function trapped(page, tag) {
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); assert.ok((await sheetNow(page)).focusIn, `${tag}: Tab ${i + 1} stays inside`); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); assert.ok((await sheetNow(page)).focusIn, `${tag}: Shift Tab ${i + 1} stays inside`); }
}

async function context(browser, phone) {
  const ctx = await browser.newContext(phone
    ? { baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' }
    : { baseURL: BASE, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  // The window is resized again and again here; the browser's notice that a resize observer's
  // callback changed the layout within a frame is not an error (as in the door and docs walks).
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks|ResizeObserver loop/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}

async function walk(type, opts, tag) {
  await up();
  await json('/__fake/state?three=1');
  const browser = await type.launch(opts);
  try {
    const { ctx, page, errors } = await context(browser, false);
    // ── 1. No page wastes the screen. ──
    const widths = async (name, path, wait, before = null) => {
      walkStep(`the width of ${name}`);
      await page.setViewportSize({ width: 1440, height: 900 });
      if (before) await before(); else await go(page, path, wait);
      for (const w of DESK) {
        await page.setViewportSize({ width: w, height: 900 }); await settle(page, 350);
        const r = await page.evaluate(FILLS_WIDTH);
        assert.ok(r.ok, `${tag} ${name} at ${w}: ${r.why}`);
      }
    };
    await widths('the dashboard', '/dashboard', '[data-listing-card]:visible');
    await widths('Pipeline', '/dashboard?view=pipeline', '.hv-part-pipeline');
    await widths('Shared with you, empty', '/dashboard?view=shared', '[data-shared-empty]');
    await widths('a listing', '/listing/L1', '.lv-cols');
    await widths('a listing with three applicants', '/listing/L4', '.lv-cols');
    await widths('Circle', '/circle', 'main, [data-shell]');
    await widths('Profile', '/profile', '[data-shell]');
    await json('/__fake/tenant?who=61&docs=1&personal=1&asagent=1');
    await widths('Shared with you, a profile', '/dashboard?view=shared', '[data-shared-with-me]');
    await widths('a shared profile', null, null, async () => { await go(page, '/dashboard?view=shared', '[data-shared-with-me] [data-shared-view]'); await page.locator('[data-shared-with-me] [data-shared-view]').first().click(); await page.locator('[data-shared-facts]').waitFor({ timeout: 30000 }); await settle(page); });
    const { token } = await json('/__fake/tenant?who=62&docs=1&personal=1');
    await widths('the tenant profile', null, null, async () => { await go(page, '/my-application'); await ctx.addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: BASE, httpOnly: true, sameSite: 'Lax' }]); await go(page, '/my-application', '[data-vault-documents]'); });
    await ctx.clearCookies({ name: 'rl_tenant' });
    const { applicationNumber, ownerToken } = await json('/__fake/app?link=J1');
    await widths('an application', `/my-application/${applicationNumber}?token=${ownerToken}`, '.mp-card');
    const sent = await page.evaluate(async () => (await (await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) })).json()));
    assert.ok(sent && sent.snapshot && sent.snapshot.token, `${tag}: the report went`);
    await widths('the landlord report', `/r/${sent.snapshot.token}`, 'h1, h2');
    for (const [name, path] of [['the homepage', '/'], ['the FAQ', '/faq'], ['the join page', '/join'], ['privacy', '/privacy'], ['terms', '/terms'], ['the apply page', '/apply/a1b2c3d4e5f6a7b8c9d0']]) await widths(name, path, 'h1:visible, h2:visible');

    // ── 2. The listing page with three applicants. ──
    walkStep('the listing page with three applicants');
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/listing/L4', '[id^="applicant-"]');
    assert.equal(await page.locator('#applicant-J41, #applicant-J42, #applicant-J43').count(), 3, `${tag}: three applicants`);
    for (const w of [1280, 1440, 1920, 2560]) {
      await page.setViewportSize({ width: w, height: 900 }); await settle(page, 350);
      const g = await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }; };
        const area = r('.ds-main'); const pad = (() => { const p = document.createElement('div'); p.style.cssText = 'position:absolute;width:var(--ds-pad)'; document.querySelector('.ds').appendChild(p); const v = p.getBoundingClientRect().width; p.remove(); return v; })();
        const cards = [...document.querySelectorAll('#applicant-J41 .lv-head, #applicant-J42 .lv-head, #applicant-J43 .lv-head')].map((h) => { const card = h.getBoundingClientRect(); const fit = h.querySelector('.lv-fit-row').getBoundingClientRect(); const av = h.querySelector('.lv-av'); const name = h.querySelector('.lv-name-row').getBoundingClientRect(); return { left: card.left, right: card.right, fitRight: fit.right, fitTop: fit.top, nameTop: name.top, nameLeft: name.left, av: av.getClientRects().length ? av.getBoundingClientRect().right : null }; });
        return { area, pad, main: r('.lv-main'), side: r('.lv-side'), landlord: r('#report'), ref: r('.lv-ref'), sticky: getComputedStyle(document.querySelector('.lv-side')).position, cards };
      });
      // The two columns fill the main area: the left from its padding, the right to its padding.
      assert.ok(near(g.main.left, g.area.left + g.pad, 2) && near(g.side.right, g.area.right - g.pad, 8), `${tag} ${w}: the two columns fill the main area (${Math.round(g.main.left)} to ${Math.round(g.side.right)} in ${Math.round(g.area.left)} to ${Math.round(g.area.right)}, padding ${Math.round(g.pad)})`);
      assert.ok(g.landlord.width >= 380 - 1 && g.landlord.width <= 420 + 1, `${tag} ${w}: the right column 380 to 420px (${Math.round(g.landlord.width)})`);
      assert.ok(g.side.left > g.main.right && near(g.side.top, g.main.top, 6), `${tag} ${w}: the right column beside the left one, at its top`);
      assert.ok(g.landlord.bottom <= g.ref.top, `${tag} ${w}: the landlord card, then Post kit and Details`);
      assert.equal(g.sticky, 'sticky', `${tag} ${w}: the right column stays on screen`);
      for (const c of g.cards) {
        if (w >= 1440) {
          assert.ok(c.av !== null && c.av <= c.nameLeft, `${tag} ${w}: the card's initials, then the name`);
          assert.ok(near(c.fitTop, c.nameTop, 8) && c.fitRight >= c.right - 60, `${tag} ${w}: the Fit at the right of the name's row, across the column`);
        }
      }
    }
    // Staying on screen: an applicant open makes the page long, and the right column holds under the header.
    await page.setViewportSize({ width: 1440, height: 900 }); await settle(page, 300);
    await page.locator('#applicant-J41 [role=button][aria-controls$="-body"]').click(); await settle(page, 500);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' })); await settle(page, 400);
    const held = await box(page, '.lv-side');
    assert.ok(held.top >= 76 && held.top <= 100, `${tag}: scrolled 900, the right column holds under the header (${Math.round(held.top)})`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await settle(page, 300);
    // Under 1280 it comes under the applicants.
    for (const w of [1024]) {
      await page.setViewportSize({ width: w, height: 900 }); await settle(page, 350);
      const apps = await page.evaluate(() => [...document.querySelectorAll('.lv-main > section')].pop().getBoundingClientRect().bottom);
      const s = await box(page, '.lv-side');
      assert.ok(s.top >= apps, `${tag} ${w}: the right column under the applicants`);
    }

    // ── 3. The sheets at 1440. ──
    walkStep('the sheets at 1440');
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/listing/L4', '[data-send-open]');
    const openSend = async () => { await page.locator('[data-send-open]').click(); await page.locator('[data-send-sheet], [data-sheet]').first().waitFor({ timeout: 15000 }); };
    await openSend(); await settle(page, 450);
    const send = await sheetNow(page);
    centred(send, `${tag} the send sheet`, 640);
    assert.ok(send.focusIn, `${tag}: the send sheet takes the focus`);
    await trapped(page, `${tag} the send sheet`);
    await closesBoth(page, openSend, '[data-send-open]', `${tag} the send sheet`);
    // Set aside: from the open card's own button.
    const card = page.locator('#applicant-J42');
    await card.locator('[role=button][aria-controls$="-body"]').click(); await settle(page, 500);
    const aside = card.getByRole('button', { name: 'Set aside', exact: true });
    await aside.evaluate((b) => { b.setAttribute('data-wide-opener', ''); b.scrollIntoView({ block: 'center', behavior: 'instant' }); }); await settle(page, 300);
    const openAside = async () => { await page.locator('[data-wide-opener]').click(); await page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); };
    await openAside(); await settle(page, 450);
    centred(await sheetNow(page), `${tag} the set aside sheet`);
    await trapped(page, `${tag} the set aside sheet`);
    await closesBoth(page, openAside, '[data-wide-opener]', `${tag} the set aside sheet`);
    await page.evaluate(() => document.querySelector('[data-wide-opener]').removeAttribute('data-wide-opener'));
    // The delete confirm, from Details.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('button', { name: /^Details/ }).click(); await settle(page, 500);
    const del = page.getByRole('button', { name: 'Delete listing', exact: true });
    await del.evaluate((b) => { b.setAttribute('data-wide-opener', ''); b.scrollIntoView({ block: 'center', behavior: 'instant' }); }); await settle(page, 300);
    const openDel = async () => { await page.locator('[data-wide-opener]').click(); await page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); };
    await openDel(); await settle(page, 450);
    centred(await sheetNow(page), `${tag} the delete confirm`);
    await closesBoth(page, openDel, '[data-wide-opener]', `${tag} the delete confirm`);
    // Edit listing: a panel at the right edge.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await settle(page, 200);
    const openEdit = async () => { await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); };
    await openEdit(); await settle(page, 600);
    side(await sheetNow(page), `${tag} the edit form`);
    await page.keyboard.press('Escape'); await sheetGone(page); await settle(page, 250);
    // The motion of a dialog, where motion is allowed: opacity and transform, nothing else.
    const moving = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    await blockSupabase(moving);
    const mp = await moving.newPage();
    await go(mp, '/listing/L4', '[data-send-open]'); await mp.locator('[data-send-open]').click(); await mp.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); await settle(mp, 500);
    const motion = await sheetNow(mp);
    assert.deepEqual(motion.transition.split(',').map((x) => x.trim()).sort(), ['opacity', 'transform'], `${tag}: the dialog fades and scales, nothing else moves (${motion.transition})`);
    noSupabaseLeft(moving, `${tag} motion`); await moving.close();
    // The command menu: near the top centre, its results under the field.
    await go(page, '/dashboard', '[data-listing-card]:visible');
    const openMenu = async () => { await page.locator('[data-command-open="desk"]').click(); await page.locator('[data-command-menu]').waitFor({ timeout: 15000 }); };
    await openMenu(); await settle(page, 450);
    const menu = await sheetNow(page);
    assert.equal(menu.at, 'top', `${tag}: the command menu opens at the top`);
    assert.ok(menu.top >= 23 && menu.top <= menu.vh * 0.2, `${tag}: near the top of the window (${Math.round(menu.top)} of ${menu.vh})`);
    assert.ok(near(menu.left, menu.vw - menu.right), `${tag}: centred across`);
    const field = await box(page, '[data-command-input]'); const list = await box(page, '#cm-list');
    assert.ok(list.top >= field.bottom - 1, `${tag}: the results under the search box`);
    assert.ok(await focusIs(page, '[data-command-input]'), `${tag}: the search box has the focus`);
    await closesBoth(page, openMenu, '[data-command-open="desk"]', `${tag} the command menu`);
    // New listing: a panel at the right edge.
    await page.locator('[data-shell-new]').click(); await page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); await settle(page, 600);
    side(await sheetNow(page), `${tag} the new listing form`);
    await page.keyboard.press('Escape'); await sheetGone(page); await settle(page, 250);
    // The bulk selection bar: a floating bar in the page, never a sheet.
    await page.locator('[data-select-mode]:visible').first().click(); await settle(page, 300);
    await page.locator('[data-card-check]:visible').first().check();
    await settle(page, 300);
    const bar = await page.evaluate(() => { const b = document.querySelector('[data-bulk-bar]'); return b ? { sheet: !!b.closest('[data-sheet]'), sheets: document.querySelectorAll('[data-sheet]').length, position: getComputedStyle(b).position } : null; });
    assert.ok(bar, `${tag}: a listing picked shows the bulk bar`);
    assert.equal(bar.sheet, false, `${tag}: the bulk bar is not in a sheet`); assert.equal(bar.sheets, 0, `${tag}: selecting opens no sheet`); assert.notEqual(bar.position, 'static', `${tag}: the bulk bar floats`);
    await page.locator('[data-select-mode]:visible').first().click(); await settle(page, 200);
    // The brokerage form: a panel at the right edge.
    await json('/__fake/circle?seed=5&brokerage=sent');
    await go(page, '/circle', '[data-brokerage-open]');
    await page.locator('[data-brokerage-open]').click(); await page.locator('[data-brokerage-panel]').waitFor({ timeout: 15000 }); await settle(page, 600);
    side(await sheetNow(page), `${tag} the brokerage form`);
    await page.keyboard.press('Escape'); await sheetGone(page);
    await json('/__fake/circle?seed=0');
    noSupabaseLeft(ctx, `${tag} 1440`);
    assert.deepEqual(errors, [], `${tag}: no page error at 1440`);
    await ctx.close();

    // ── At 390 the sheets still rise from the bottom; the Sort sheet becomes a dialog at 1440. ──
    walkStep('the sheets at 390');
    const ph = await context(browser, true);
    await go(ph.page, '/listing/L4', '[data-send-open]');
    await ph.page.locator('[data-send-open]').scrollIntoViewIfNeeded(); await ph.page.locator('[data-send-open]').click(); await ph.page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); await settle(ph.page, 500);
    risen(await sheetNow(ph.page), `${tag} 390 the send sheet`);
    await ph.page.keyboard.press('Escape'); await sheetGone(ph.page);
    const c2 = ph.page.locator('#applicant-J42');
    await c2.locator('[role=button][aria-controls$="-body"]').evaluate((b) => b.scrollIntoView({ block: 'center', behavior: 'instant' })); await settle(ph.page, 300);
    await c2.locator('[role=button][aria-controls$="-body"]').click(); await settle(ph.page, 500);
    const a2 = c2.getByRole('button', { name: 'Set aside', exact: true });
    await a2.evaluate((b) => b.scrollIntoView({ block: 'center', behavior: 'instant' })); await settle(ph.page, 300); await a2.click();
    await ph.page.locator('[data-sheet]').first().waitFor({ timeout: 15000 }); await settle(ph.page, 500);
    risen(await sheetNow(ph.page), `${tag} 390 the set aside sheet`);
    await ph.page.keyboard.press('Escape'); await sheetGone(ph.page);
    await go(ph.page, '/dashboard', '[data-listing-card]:visible');
    await ph.page.locator('[data-command-open="phone"]').click(); await ph.page.locator('[data-command-menu]').waitFor({ timeout: 15000 }); await settle(ph.page, 500);
    risen(await sheetNow(ph.page), `${tag} 390 the command menu`);
    await ph.page.keyboard.press('Escape'); await sheetGone(ph.page);
    await ph.page.locator('[data-sort-open]:visible').first().click(); await ph.page.locator('[data-sort-sheet]').waitFor({ timeout: 15000 }); await settle(ph.page, 500);
    risen(await sheetNow(ph.page), `${tag} 390 the Sort sheet`);
    await ph.page.setViewportSize({ width: 1440, height: 900 }); await settle(ph.page, 500);
    centred(await sheetNow(ph.page), `${tag} the Sort sheet at 1440`);
    await ph.page.keyboard.press('Escape'); await sheetGone(ph.page);
    noSupabaseLeft(ph.ctx, `${tag} 390`);
    assert.deepEqual(ph.errors, [], `${tag}: no page error at 390`);
    await ph.ctx.close();
  } finally { await browser.close(); }
}

test('no page wastes the screen, the listing in two columns, and every sheet a pop up on a computer, in WebKit', { timeout: 600000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
