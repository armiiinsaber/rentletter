// The realtor's Profile and Circle laid out for the desktop, and the tenant's name and phone edited
// in place, walked for real in WebKit (Safari's engine) and in Chrome on the fake stack:
//   1. Profile (components/dashboard/ProfileView.js): at 1440, 1920 and 2560 the content's right
//      edge within the page padding of the window's (the form at the left, the preview filling the
//      rest), nothing sideways; the form and the preview side by side, the preview on screen as the
//      page scrolls and showing what is typed before it saves, through the report's own brand block
//      and the Circle card; one sentence on saving, the one ProfileView.js names; no back row at
//      any width (the sidebar's place, and on a phone the tab bar's tab); the logo row one style,
//      and Remove asking in the page, never in a browser dialog.
//   2. Circle (components/dashboard/CircleView.js) with five realtors and a request: the right edge
//      the same at 1440, 1920 and 2560; the work at the left (Find a realtor, then Your circle with
//      the request first), two cards across at 1280 and three or more from 1920, the column beside
//      it on screen as the page scrolls; every row of buttons one style; the brokerage form a panel
//      over the view from its card's one button (Tab held inside, Escape closes, the focus back on
//      the button), saving through the same route with the same fields; on a phone the form in the
//      page. Empty, the circle invites with one line and the two ways to start.
//   3. The tenant's profile (pages/my-application.js): the full name and the phone edited in place
//      in Contact with their input types and autocomplete, through POST /api/tenant/profile; a
//      profile with no name says so at the top, cannot save until it has one, and saves once fixed.
// The pages are served from the run's one production build (tests/helpers/fakeBuild.mjs), in this
// walk's own copy, on its own port, with service workers blocked, and no request leaves the browser
// for a supabase.co host (tests/helpers/noSupabase.mjs). A WebKit walk fails, never skips, when the
// binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3191; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// The one sentence on saving (components/dashboard/ProfileView.js SAVE_LINE; tests/profileCircle.test.mjs
// holds the constant to the code that makes it true).
const SAVE_LINE = 'Changes save on their own when you leave a field or make a choice.';

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
  for (const u of ['/profile', '/circle', '/my-application']) await fetch(`${BASE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const f = (path) => fetch(`${BASE}${path}`).then((r) => r.json());
const pad = (w) => Math.min(56, Math.max(24, 8 + 0.01875 * w));
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'), sel);
const box = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) }; }, sel);
// The view's content against the window: the right edge of everything the view draws in the main
// area (cards, the preview, fields, headings), and how far the page scrolls sideways.
const fit = (page) => page.evaluate(() => {
  const W = window.innerWidth;
  const shown = [...document.querySelectorAll('.ds-fill .rl-card, .ds-fill .pv-stage, .ds-fill .cv-person, .ds-fill .cv-empty, .ds-fill input, .ds-fill h1, .ds-fill h2')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  return { W, right: Math.round(Math.max(...shown.map((e) => e.getBoundingClientRect().right))), sideways: document.documentElement.scrollWidth - W };
});
const rightEdge = async (page, label) => {
  for (const width of [1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(400);
    const r = await fit(page); const p = pad(width);
    assert.equal(r.W, width);
    assert.ok(r.right <= width && width - r.right <= p + 1, `${label} at ${width}: the content's right edge within the page padding (${Math.round(p)}px) of the window's (${JSON.stringify(r)})`);
    assert.ok(r.sideways <= 0, `${label} at ${width}: no sideways scroll (${r.sideways})`);
  }
};
// Every row of buttons in the selector: one height, one radius, one side padding.
const rowsOneStyle = (page, rowSel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((row) => {
  const bs = [...row.querySelectorAll(':scope > button, :scope > a')].filter((b) => b.getClientRects().length).map((b) => { const cs = getComputedStyle(b); return `${Math.round(b.getBoundingClientRect().height)}/${cs.borderTopLeftRadius}/${cs.paddingLeft}`; });
  return [...new Set(bs)];
}), rowSel);
const scrollTo = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
const desk = async (browser, width = 1440) => { const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width, height: 1000 }, reducedMotion: 'reduce' }); await blockSupabase(ctx); return ctx; };
const phone = async (browser) => { const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }); await blockSupabase(ctx); return ctx; };

async function profileWalk(browser) {
  walkStep('the realtor Profile');
  const ctx = await desk(browser); const page = await ctx.newPage();
  const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await page.goto('/profile', { waitUntil: 'load', timeout: 120000 });
  await page.locator('#profile-field-full_name').waitFor({ timeout: 60000 });
  await page.locator('[data-profile-preview] [data-report-brand]').waitFor({ timeout: 30000 });
  // Two columns: the form at the left, the preview beside it.
  const form = await box(page, '#branding'); const preview = await box(page, '[data-profile-preview]');
  assert.ok(preview && form && preview.left > form.right, `the preview beside the form (${JSON.stringify({ form, preview })})`);
  assert.equal(await visible(page, '.pv-back'), false, 'no back row where the sidebar is');
  // One sentence on saving, the one the code makes true.
  assert.equal((await page.locator('[data-profile-saving]').textContent()).trim(), SAVE_LINE);
  const text = await page.evaluate(() => document.body.innerText);
  assert.equal(/save as you type|saved automatically when you leave a field/i.test(text), false, 'no second sentence on saving');
  // The three groups under their headings.
  assert.deepEqual(await page.locator('[data-profile-group] > h2').allTextContents(), ['You', 'Brokerage', 'Brand']);
  // What is typed shows in the preview before it saves: the report's brand and the Circle card.
  const name = await page.locator('#profile-field-full_name').inputValue();
  await page.locator('#profile-field-full_name').fill('Priya Ramanathan');
  await page.waitForTimeout(200);
  assert.match(await page.locator('[data-preview="report"] [data-report-brand]').textContent(), /Priya Ramanathan/);
  assert.equal((await page.locator('[data-preview="circle"] .cv-name').textContent()).trim(), 'Priya Ramanathan');
  assert.equal((await page.locator('[data-preview="circle"] .cv-avatar').textContent()).trim(), 'PR');
  await page.locator('#profile-field-full_name').fill(name);
  await page.locator('#profile-field-phone').focus(); await page.waitForTimeout(400); // the name as it was: nothing to save
  // The preview stays on screen as the page scrolls, under the header row.
  await scrollTo(page, 1400); await page.waitForTimeout(300);
  const stuck = await box(page, '[data-profile-preview]');
  assert.ok(stuck.top >= 76 && stuck.top <= 110, `the preview held under the header (${JSON.stringify(stuck)})`);
  await scrollTo(page, 0); await page.waitForTimeout(200);
  await rightEdge(page, 'Profile');
  // The logo row: one style, the upload its one filled button.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const row of await rowsOneStyle(page, '[data-logo-row]')) assert.equal(row.length, 1, `the logo buttons one style (${row})`);
  // Remove asks in the page. A logo first, through the branding route the page uses.
  const set = await page.evaluate(async () => (await fetch('/api/profile/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo_url: '/icons/favicon-32.png' }) })).status);
  assert.equal(set, 200);
  await page.goto('/profile', { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-logo-remove]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-logo-row] .ds-btn-ink').count(), 1, 'one main button in the logo row');
  assert.deepEqual(await page.locator('[data-logo-row] button').allTextContents(), ['Replace with upload', 'Regenerate with AI', 'Remove']);
  await page.locator('[data-logo-remove]').click();
  await page.locator('[data-logo-remove-ask]').waitFor({ timeout: 10000 });
  assert.equal(await visible(page, '[data-logo-row]'), false, 'the question stands where the row was');
  await page.locator('[data-logo-remove-ask]').getByRole('button', { name: 'Keep it' }).click();
  await page.locator('[data-logo-row]').waitFor({ timeout: 10000 });
  assert.ok(await visible(page, '[data-logo-remove]'), 'Keep it leaves the logo');
  await page.locator('[data-logo-remove]').click();
  await page.locator('[data-logo-remove-ask]').getByRole('button', { name: 'Remove logo' }).click();
  await page.locator('[data-logo-row]').waitFor({ timeout: 15000 });
  assert.deepEqual(dialogs, [], 'never a browser dialog');
  await page.evaluate(() => fetch('/api/profile/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo_url: null }) }));
  noSupabaseLeft(ctx, 'Profile');
  await ctx.close();

  // A phone: one column, no back row (Profile is a tab), no preview beside it.
  const pctx = await phone(browser); const pp = await pctx.newPage();
  await pp.goto('/profile', { waitUntil: 'load', timeout: 120000 });
  await pp.locator('#profile-field-full_name').waitFor({ timeout: 60000 });
  assert.equal(await pp.getByRole('link', { name: /^Dashboard$/ }).count(), 0, 'no back row on a phone: Profile is a tab');
  assert.ok(await visible(pp, '[data-main-nav] [data-nav="listings"]'), 'the Listings tab is the way back');
  assert.equal(await visible(pp, '[data-profile-preview]'), false, 'no preview column on a phone');
  assert.equal(await pp.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll');
  noSupabaseLeft(pctx, 'Profile 390');
  await pctx.close();
}

async function circleWalk(browser) {
  walkStep('Circle with five realtors and a request');
  await f('/__fake/circle?seed=5&brokerage=sent');
  try {
    const ctx = await desk(browser, 1280); const page = await ctx.newPage();
    await page.goto('/circle', { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-circle-connection]').first().waitFor({ timeout: 60000 });
    assert.equal(await page.locator('[data-circle-connection]').count(), 5);
    assert.equal(await page.locator('[data-circle-request]').count(), 1);
    // The work at the left: Find a realtor, then Your circle with the request first.
    const order = await page.evaluate(() => {
      const find = document.querySelector('[data-circle-find]'); const list = document.querySelector('[data-circle-list]');
      const req = list.querySelector('[data-circle-request]'); const con = list.querySelector('[data-circle-connection]');
      return { findFirst: !!(find.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING), requestFirst: !!(req.compareDocumentPosition(con) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    assert.deepEqual(order, { findFirst: true, requestFirst: true });
    const columns = () => page.evaluate(() => new Set([...document.querySelectorAll('[data-circle-connection]')].map((e) => Math.round(e.getBoundingClientRect().left))).size);
    assert.equal(await columns(), 2, 'two cards across at 1280');
    const main = await box(page, '.cv-main'); const aside = await box(page, '.cv-aside');
    assert.ok(aside.left > main.right, `the column beside the work (${JSON.stringify({ main, aside })})`);
    for (const width of [1920, 2560]) { await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(300); assert.ok(await columns() >= 3, `three or more across at ${width} (${await columns()})`); }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(300);
    // Every row of buttons is one style.
    for (const row of await rowsOneStyle(page, '.cv-actions')) assert.equal(row.length, 1, `a row of buttons in one style (${row})`);
    // The column beside it stays on screen as the page scrolls.
    await scrollTo(page, 900); await page.waitForTimeout(300);
    const held = await box(page, '.cv-aside');
    assert.ok(held.top >= 76 && held.top <= 110, `the column held under the header (${JSON.stringify(held)})`);
    await scrollTo(page, 0); await page.waitForTimeout(200);
    await rightEdge(page, 'Circle');

    walkStep('the brokerage panel');
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(300);
    assert.ok(await visible(page, '[data-circle-brokerage-card]'), 'the short brokerage card');
    assert.equal(await page.locator('[data-circle-brokerage-card] button').count(), 1, 'with one button');
    assert.equal(await visible(page, '[data-circle-brokerage]'), false, 'the form is not in the page');
    const open = page.locator('[data-brokerage-open]');
    await open.click();
    const panel = page.getByRole('dialog', { name: 'Your brokerage' });
    await panel.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cv-b-name', null, { timeout: 5000 });
    assert.deepEqual(await panel.locator('input').evaluateAll((els) => els.map((e) => e.id)), ['cv-b-name', 'cv-b-address', 'cv-b-phone', 'cv-b-broker', 'cv-b-email', 'cv-b-hst'], 'the same fields');
    assert.match(await panel.locator('#cv-b-name-hint').textContent(), /The legal entity your broker of record confirms\./);
    assert.equal(await page.locator('[data-circle-brokerage]').count(), 0, 'one form at a time');
    // Tab and Shift Tab stay inside the panel.
    const inside = () => page.evaluate(() => !!document.activeElement.closest('.rl-sh-panel'));
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.ok(await inside(), `Tab ${i + 1} stays in the panel`); }
    await page.locator('#cv-b-name').focus();
    await page.keyboard.press('Shift+Tab'); assert.ok(await inside(), 'Shift Tab from the first field stays in the panel');
    // Escape closes it and the focus is back on the button.
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction(() => document.activeElement && document.activeElement.hasAttribute('data-brokerage-open'), null, { timeout: 5000 });
    // Saving from the panel: the same route, the same fields, the same confirmation.
    await open.click(); await panel.waitFor({ timeout: 10000 });
    // The panel puts the focus on its first field as it opens: typing starts once it has.
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cv-b-name', null, { timeout: 5000 });
    await panel.locator('#cv-b-hst').fill('123456789RT0001');
    const sent = page.waitForRequest((r) => r.url().endsWith('/api/circle/brokerage') && r.method() === 'POST');
    await panel.getByRole('button', { name: 'Save and email them' }).click();
    const body = JSON.parse((await sent).postData());
    assert.deepEqual(Object.keys(body).sort(), ['action', 'address', 'brokerEmail', 'brokerName', 'hstNumber', 'legalName', 'phone']);
    assert.equal(body.action, 'save'); assert.equal(body.hstNumber, '123456789RT0001', `what was typed is what is sent (${JSON.stringify(body)})`);
    await panel.locator('[data-brokerage-note]').waitFor({ timeout: 15000 });
    assert.match(await panel.locator('[data-brokerage-note]').textContent(), /^Saved\./);
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached', timeout: 10000 });
    noSupabaseLeft(ctx, 'Circle');
    await ctx.close();

    // A phone: one column, the brokerage form in the page.
    const pctx = await phone(browser); const pp = await pctx.newPage();
    await pp.goto('/circle', { waitUntil: 'load', timeout: 120000 });
    await pp.locator('[data-circle-connection]').first().waitFor({ timeout: 60000 });
    assert.ok(await visible(pp, '[data-circle-brokerage] #cv-b-name'), 'the form in the page');
    assert.equal(await visible(pp, '[data-circle-brokerage-card]'), false);
    assert.equal(await pp.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll');
    noSupabaseLeft(pctx, 'Circle 390');
    await pctx.close();
  } finally { await f('/__fake/circle?seed=0'); }

  walkStep('Circle empty');
  const ctx = await desk(browser); const page = await ctx.newPage();
  await page.goto('/circle', { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-circle-empty]').waitFor({ timeout: 60000 });
  assert.match(await page.locator('[data-circle-empty] p').first().textContent(), /\S/);
  assert.deepEqual(await page.locator('[data-circle-empty] [data-circle-start]').evaluateAll((els) => els.map((e) => e.dataset.circleStart)), ['search', 'link'], 'the two ways to start');
  await page.locator('[data-circle-start="search"]').click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cv-search', null, { timeout: 5000 });
  await rightEdge(page, 'Circle, empty');
  noSupabaseLeft(ctx, 'Circle empty');
  await ctx.close();
}

async function tenantWalk(browser) {
  walkStep('the tenant\'s name and phone');
  const signIn = async (ctx, query) => {
    const { token } = await f(`/__fake/tenant?${query}`);
    await ctx.addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    await page.goto('/my-application', { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-section="contact"]').waitFor({ timeout: 60000 });
    // The vault, the strength and the shares load after the facts and move the sections down:
    // the page is read once they are in (as tests/helpers/typesetStates.mjs tenantProfile does).
    await page.locator('[data-vault-documents]').waitFor({ timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    return page;
  };
  const read = (page) => page.evaluate(async () => (await (await fetch('/api/tenant/profile')).json()).facts);
  const ctx = await phone(browser);
  // The name, edited in place.
  const page = await signIn(ctx, 'who=61');
  await page.locator('[data-section-edit="contact"]').click();
  const nameField = page.locator('[data-section-form="contact"] [data-field="fullName"]');
  await nameField.waitFor({ timeout: 10000 });
  assert.deepEqual(await nameField.evaluate((e) => [e.type, e.autocomplete]), ['text', 'name']);
  const phoneField = page.locator('[data-section-form="contact"] [data-field="phone"]');
  assert.deepEqual(await phoneField.evaluate((e) => [e.type, e.autocomplete, e.inputMode]), ['tel', 'tel', 'tel']);
  await nameField.fill('Maximiliano Castellanos');
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/tenant/profile') && r.request().method() === 'POST');
  await page.locator('[data-section-save="contact"]').click();
  assert.equal((await saved).status(), 200);
  await page.locator('[data-section-edit="contact"]').waitFor({ timeout: 10000 });
  assert.equal((await read(page)).fullName, 'Maximiliano Castellanos');
  assert.equal((await page.locator('[data-profile-name]').textContent()).trim(), 'Maximiliano Castellanos');
  // The phone, opened from its own row.
  await page.locator('[data-field-row="phone"]').click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.field === 'phone', null, { timeout: 10000 });
  await phoneField.fill('4165550177');
  assert.equal(await phoneField.inputValue(), '(416) 555-0177');
  await page.locator('[data-section-save="contact"]').click();
  await page.locator('[data-section-edit="contact"]').waitFor({ timeout: 10000 });
  assert.equal((await read(page)).phone, '(416) 555-0177');
  await page.reload({ waitUntil: 'load' }); await page.locator('[data-vault-documents]').waitFor({ timeout: 60000 });
  assert.match((await page.locator('[data-section="contact"]').textContent()).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2011/g, '-'), /\(416\) 555-0177/, 'the phone as saved, after a reload');
  assert.equal(await page.locator('[data-name-missing]').count(), 0);
  await page.close();

  // A profile with no name: said at the top; a save elsewhere is refused; fixed, then it saves.
  const nameless = await signIn(ctx, 'who=62&facts=noname');
  await nameless.locator('[data-name-missing]').waitFor({ timeout: 10000 });
  assert.equal(await nameless.locator('[data-name-missing] button').count(), 1, 'one button');
  await nameless.locator('[data-section-edit="employment"]').click();
  const job = nameless.locator('[data-section-form="employment"] [data-field="jobTitle"]');
  await job.fill('Clinical Operations Lead');
  await nameless.locator('[data-section-save="employment"]').click();
  await nameless.locator('[data-section-error="employment"]').waitFor({ timeout: 10000 });
  assert.match((await nameless.locator('[data-section-error="employment"]').textContent()).replace(/[\u00a0\u202f]/g, ' '), /name is required/i, 'no save without a name');
  await nameless.locator('[data-name-missing] button').click();
  await nameless.waitForFunction(() => document.activeElement && document.activeElement.dataset.field === 'fullName', null, { timeout: 10000 });
  await nameless.locator('[data-section-form="contact"] [data-field="fullName"]').fill('Valentina Castellanos');
  const fixed = nameless.waitForResponse((r) => r.url().endsWith('/api/tenant/profile') && r.request().method() === 'POST');
  await nameless.locator('[data-section-save="contact"]').click();
  assert.equal((await fixed).status(), 200, 'it saves once it has a name');
  await nameless.locator('[data-section-edit="contact"]').waitFor({ timeout: 10000 });
  const facts = await read(nameless);
  assert.equal(facts.fullName, 'Valentina Castellanos');
  assert.equal(facts.jobTitle, 'Clinical Operations Lead', 'what was typed before is saved with it');
  assert.equal(await nameless.locator('[data-name-missing]').count(), 0, 'the line at the top is gone');
  noSupabaseLeft(ctx, 'tenant');
  await ctx.close();
}

async function walk(browserType, launch) {
  const browser = await browserType.launch(launch);
  try {
    await profileWalk(browser);
    await circleWalk(browser);
    await tenantWalk(browser);
  } finally { await browser.close(); }
}

test('Profile and Circle fill the desktop, and the tenant edits a name and a phone, in WebKit', { timeout: 600000 }, async () => { requireWebkit(); await walk(pw.webkit, {}); });
test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }));
