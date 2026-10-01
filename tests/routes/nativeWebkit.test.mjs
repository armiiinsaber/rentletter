// The native feel, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone user agent.
// On the sandbox (the walks' dev server):
//   1. Realtor navigation never reloads: the dashboard to a listing and back stays one document, the
//      push and the back run as view transitions with their direction (a crossfade under reduced
//      motion), and nothing is left transformed afterwards.
//   2. The press: a held finger scales a control to 0.98 after the rest time, a tap shows it too, a
//      move of more than a few pixels or a scroll drops it, a disabled control never reacts, reduced
//      motion dips the opacity instead, and the tenant pages have none.
//   3. Pipeline: the whole card opens and closes, the controls inside keep their own action, Enter
//      and Space work, and each fact shows once: no pill repeats another or a control.
//   4. Sheets: New listing rises as a bottom sheet with a grab handle; the page behind is pinned and
//      comes back to exactly where it was; swipes inside the sheet never move the page; a short drag
//      snaps back and a long one dismisses; a tap on the dimmed page closes a clean sheet and asks
//      first when something was typed. The confirm sheet, the set aside sheet and the Next panel
//      are the same sheet.
// On the real pages over the fake stack (tests/helpers/fakeNextServer.mjs, its own dev server):
//   5. A tap on a listing shows its skeleton at once, the applicants start loading on the touch,
//      the page's own data comes without them, and the ownership check still redirects.
//   6. A quick action that fails on the server goes back and says so.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { devServer, BASE, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const server = devServer(`${BASE}/signin`);
const FAKE_PORT = 3152; const FAKE = `http://localhost:${FAKE_PORT}`;
let fake = null;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  await server.start();
  for (const pid of listeners(FAKE_PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(FAKE_PORT), 'dev', '30'], { cwd: new URL('../..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  for (const u of ['/dashboard', '/listing/L1', '/profile']) await fetch(`${FAKE}${u}`).catch(() => null);
}, { timeout: START_TIMEOUT });
after(async () => {
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(FAKE_PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await server.stop();
}, { timeout: STOP_TIMEOUT });

async function phone(browser, { base = BASE, reduced = false } = {}) {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route(/fake\.supabase\.co|supabase\.co\//, (r) => r.abort());
  await ctx.addInitScript(() => {
    window.__vt = [];
    const orig = document.startViewTransition ? document.startViewTransition.bind(document) : null;
    if (orig) document.startViewTransition = (cb) => { window.__vt.push(document.documentElement.dataset.nav || ''); return orig(cb); };
  });
  const page = await ctx.newPage();
  // WebKit reports a request cancelled by a navigation as an error ("due to access control
  // checks"); that is the browser leaving a page, not the page failing.
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const open = async (page, url) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(600); };

// ── 1. Navigation ────────────────────────────────────────────────────────────────────────────
async function navigation(browser, tag) {
  for (const reduced of [false, true]) {
    const { ctx, page, errors } = await phone(browser, { reduced });
    await open(page, '/demo/dashboard');
    await page.evaluate(() => { window.__same = 'yes'; });
    await page.locator('.dash-card[role=link]').first().click();
    await page.locator('section.rl-card h1').first().waitFor({ timeout: 10000 });
    assert.match(page.url(), /\?listing=/, `${tag}: on the listing`);
    await page.locator('a', { hasText: 'All listings' }).click();
    await page.locator('.dash-card[role=link]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__same), 'yes', `${tag}: one document, no reload`);
    const vt = await page.evaluate(() => window.__vt);
    if (await page.evaluate(() => typeof document.startViewTransition === 'function')) {
      assert.deepEqual(vt, reduced ? ['fade', 'fade'] : ['push', 'back'], `${tag}: the push, then the back`);
    }
    assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.getElementById('__next')).transform, document.documentElement.dataset.nav || '']), ['none', ''], `${tag}: nothing left moved`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
}

// ── 2. The press ─────────────────────────────────────────────────────────────────────────────
// Synthetic pointer events, so the timings are exact: the mechanism listens on the document.
const PROBE = async (page, selector, steps) => page.evaluate(async ({ selector, steps }) => {
  const el = document.querySelector(selector); if (!el) return 'missing';
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const fire = (type, dx = 0) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x + dx, clientY: y, pointerType: 'touch', isPrimary: true, pointerId: 7 }));
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const read = () => { const cs = getComputedStyle(el); return { pressing: el.classList.contains('rl-pressing'), scale: cs.scale, opacity: cs.opacity }; };
  const out = [];
  for (const s of steps) {
    if (s[0] === 'down') fire('pointerdown'); else if (s[0] === 'move') fire('pointermove', s[1]); else if (s[0] === 'up') fire('pointerup');
    else if (s[0] === 'scroll') window.dispatchEvent(new Event('scroll'));
    else if (s[0] === 'wait') await wait(s[1]); else if (s[0] === 'read') out.push(read());
  }
  return out;
}, { selector, steps });

async function press(browser, tag) {
  const { ctx, page } = await phone(browser);
  await open(page, '/demo/dashboard');
  const btn = '.dash-new';
  // Held: nothing before the rest time, the press after it, gone after the let go.
  let r = await PROBE(page, btn, [['down'], ['wait', 30], ['read'], ['wait', 250], ['read'], ['up'], ['wait', 300], ['read']]);
  assert.deepEqual(r.map((x) => x.pressing), [false, true, false], `${tag}: held, after the rest time`);
  assert.ok(Math.abs(parseFloat(r[1].scale) - 0.98) < 0.002, `${tag}: 0.98, read ${r[1].scale}`);
  // A quick tap still shows it.
  r = await PROBE(page, btn, [['down'], ['wait', 20], ['up'], ['wait', 30], ['read'], ['wait', 300], ['read']]);
  assert.deepEqual(r.map((x) => x.pressing), [true, false], `${tag}: a tap shows it`);
  // A move or a scroll drops it.
  r = await PROBE(page, btn, [['down'], ['wait', 20], ['move', 10], ['wait', 120], ['read'], ['up']]);
  assert.equal(r[0].pressing, false, `${tag}: a move drops it`);
  r = await PROBE(page, btn, [['down'], ['wait', 20], ['scroll'], ['wait', 120], ['read'], ['up']]);
  assert.equal(r[0].pressing, false, `${tag}: a scroll drops it`);
  r = await PROBE(page, btn, [['down'], ['wait', 120], ['read'], ['move', 10], ['wait', 20], ['read'], ['up']]);
  assert.deepEqual(r.map((x) => x.pressing), [true, false], `${tag}: a move after the press lets go`);
  // The card: the whole listing card answers.
  r = await PROBE(page, '.dash-card[role=link]', [['down'], ['wait', 120], ['read'], ['up'], ['wait', 260]]);
  assert.equal(r[0].pressing, true, `${tag}: a card`);
  // Disabled: Create listing while the form is empty.
  await page.locator('.dash-new').click(); await page.locator('.rl-sh-panel').waitFor();
  await page.waitForTimeout(400);
  r = await PROBE(page, '.rl-sh-panel button[disabled]', [['down'], ['wait', 150], ['read'], ['up']]);
  assert.equal(r[0].pressing, false, `${tag}: a disabled control never reacts`);
  await ctx.close();
  // Reduced motion: an opacity dip, no scale.
  const rm = await phone(browser, { reduced: true });
  await open(rm.page, '/demo/dashboard');
  r = await PROBE(rm.page, btn, [['down'], ['wait', 200], ['read'], ['up']]);
  assert.deepEqual([r[0].pressing, r[0].scale, r[0].opacity], [true, 'none', '0.9'], `${tag}: reduced motion dips the opacity`);
  // The tenant pages have none (a fresh tab: the sandbox replaces its own URL as it unloads).
  const tenant = await rm.ctx.newPage();
  await open(tenant, '/apply/demo0000000000000001');
  assert.equal(await tenant.evaluate(() => document.documentElement.hasAttribute('data-no-press')), true);
  r = await PROBE(tenant, 'button', [['down'], ['wait', 150], ['read'], ['up']]);
  assert.equal(r[0].pressing, false, `${tag}: no press on the tenant pages`);
  await rm.ctx.close();
}

// ── 3. Pipeline ──────────────────────────────────────────────────────────────────────────────
async function pipeline(browser, tag) {
  const { ctx, page } = await phone(browser);
  await open(page, '/demo/dashboard');
  const card = page.locator('#people li[data-person]').first().locator('[role=button][aria-expanded]').first();
  await card.scrollIntoViewIfNeeded();
  const expanded = () => card.getAttribute('aria-expanded');
  const pills = () => card.locator('.rl-pill').allInnerTexts();
  const closedPills = await pills();
  assert.ok(!closedPills.some((t) => / for /.test(t)), `${tag}: the score and the address are two pills, not one sentence`);
  await card.locator('div').first().click();
  assert.equal(await expanded(), 'true', `${tag}: a tap on the name opens it`);
  // Each fact once, and no pill repeats a control.
  const texts = (await pills()).map((t) => t.trim().toLowerCase());
  assert.equal(new Set(texts).size, texts.length, `${tag}: no fact twice: ${texts.join(' | ')}`);
  const controls = (await card.locator('button, [data-own-action]').allInnerTexts()).map((t) => t.trim().toLowerCase());
  assert.ok(!texts.some((t) => controls.includes(t)), `${tag}: no pill repeats a control: ${texts.join(' | ')} / ${controls.join(' | ')}`);
  // A control keeps its own action: Remove asks, and the card stays open.
  await card.getByRole('button', { name: 'Remove' }).click();
  await page.locator('[role=alertdialog]').waitFor();
  assert.equal(await expanded(), 'true', `${tag}: Remove did not close the card`);
  await page.locator('[role=alertdialog]').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('[role=alertdialog]').waitFor({ state: 'detached' });
  // A tap anywhere else on it closes it: the pills of a listing row.
  await card.locator('.rl-pills').last().click();
  assert.equal(await expanded(), 'false', `${tag}: a tap anywhere closes it`);
  // Enter and Space.
  await card.focus(); await page.keyboard.press('Enter'); assert.equal(await expanded(), 'true');
  await page.keyboard.press(' '); assert.equal(await expanded(), 'false', `${tag}: Enter and Space`);
  await ctx.close();
}

// ── 4. Sheets ────────────────────────────────────────────────────────────────────────────────
const DRAG = async (page, dy) => page.evaluate(async (dy) => {
  const grab = document.querySelector('.rl-sh-panel .rl-sh-grab'); const panel = grab.closest('.rl-sh-panel');
  const r = grab.getBoundingClientRect(); const x = r.left + r.width / 2; let y = r.top + r.height / 2;
  const fire = (target, type) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, pointerId: 9, button: 0 }));
  fire(grab, 'pointerdown');
  const steps = 8;
  for (let i = 0; i < steps; i++) { y += dy / steps; await new Promise((res) => setTimeout(res, 16)); fire(panel, 'pointermove'); }
  await new Promise((res) => setTimeout(res, 120)); // slow at the end: no flick
  fire(panel, 'pointerup');
}, dy);

async function sheets(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  await open(page, '/demo/dashboard');
  await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('.dash-new').click()); // opens without scrolling the page
  const panel = page.locator('.rl-sh-panel.rl-modal'); await panel.waitFor(); await page.waitForTimeout(500);
  const shape = await page.evaluate(() => { const p = document.querySelector('.rl-sh-panel'); const r = p.getBoundingClientRect(); const sc = p.querySelector('.rl-sh-scroll'); return { bottom: Math.round(r.bottom), handle: !!p.querySelector('.rl-sh-handle'), overscroll: getComputedStyle(sc).overscrollBehaviorY, body: document.body.style.position, top: document.body.style.top, locked: document.documentElement.classList.contains('rl-sheet-open') }; });
  assert.deepEqual(shape, { bottom: 844, handle: true, overscroll: 'none', body: 'fixed', top: `-${y0}px`, locked: true }, `${tag}: a bottom sheet over a pinned page`);
  // Scroll the sheet to its end again and again: the page behind never moves.
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { const sc = document.querySelector('.rl-sh-scroll'); sc.scrollTop = sc.scrollHeight; });
    await page.mouse.move(195, 600); await page.mouse.wheel(0, 600).catch(() => {}); await page.waitForTimeout(120);
  }
  assert.deepEqual(await page.evaluate(() => [window.scrollY, document.body.style.top]), [0, `-${y0}px`], `${tag}: nothing behind the sheet moved`);
  // A short drag snaps back; a clean sheet closes on a tap on the dimmed page, back where it was.
  await DRAG(page, 40); await page.waitForTimeout(450);
  assert.equal(await panel.count(), 1, `${tag}: a short drag snaps back`);
  await page.mouse.click(195, 10); await page.waitForTimeout(450);
  assert.equal(await panel.count(), 0, `${tag}: a tap on the dimmed page closes a clean sheet`);
  assert.deepEqual(await page.evaluate(() => [window.scrollY, document.body.getAttribute('style') || '', document.documentElement.classList.contains('rl-sheet-open')]), [y0, '', false], `${tag}: the page is exactly where it was`);
  // Typed input: the dimmed page asks first; Keep editing keeps it, Discard drops it.
  await page.evaluate(() => document.querySelector('.dash-new').click()); await panel.waitFor(); await page.waitForTimeout(450);
  await panel.locator('input').first().fill('88 Harbour St');
  await page.mouse.click(195, 10); await page.waitForTimeout(450);
  const ask = page.locator('[role=alertdialog][aria-label="Discard this listing?"]');
  assert.equal(await ask.count(), 1, `${tag}: it asks before dropping typed input`);
  await ask.getByRole('button', { name: 'Keep editing' }).click(); await page.waitForTimeout(450);
  assert.equal(await panel.locator('input').first().inputValue(), '88 Harbour St', `${tag}: Keep editing keeps it`);
  await DRAG(page, 420); await page.waitForTimeout(450);
  assert.equal(await ask.count(), 1, `${tag}: a long drag asks too`);
  await ask.getByRole('button', { name: 'Discard' }).click(); await page.waitForTimeout(500);
  assert.equal(await panel.count(), 0, `${tag}: Discard closes it`);
  // A long drag dismisses a clean sheet.
  await page.evaluate(() => document.querySelector('.dash-new').click()); await panel.waitFor(); await page.waitForTimeout(450);
  await DRAG(page, 420); await page.waitForTimeout(600);
  assert.equal(await panel.count(), 0, `${tag}: a long drag dismisses it`);
  // The Next panel is the same sheet.
  await page.getByRole('button', { name: /^Next,/ }).click();
  const nextPanel = page.locator('.rl-sh-panel[role=dialog][aria-label="Next"]'); await nextPanel.waitFor(); await page.waitForTimeout(450);
  assert.equal(await nextPanel.locator('.rl-sh-handle').count(), 1);
  await nextPanel.getByRole('button', { name: 'Close' }).click(); await nextPanel.waitFor({ state: 'detached' });
  // The listing page: the confirm sheet and the set aside sheet.
  await open(page, '/demo/dashboard?listing=demo-carlaw');
  await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Delete listing/ }).click();
  const confirm = page.locator('.rl-sh-panel[role=alertdialog]'); await confirm.waitFor(); await page.waitForTimeout(450);
  assert.equal(Math.round((await confirm.boundingBox()).y + (await confirm.boundingBox()).height), 844, `${tag}: the confirm sheet sits on the bottom edge`);
  await confirm.getByRole('button', { name: 'Keep it' }).click(); await confirm.waitFor({ state: 'detached' });
  await page.locator('[role=button][aria-controls]').filter({ hasText: 'David Kowalski' }).first().click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Set aside$/ }).first().click();
  const aside = page.locator('.rl-sh-panel.rl-modal[aria-label="Set aside"]'); await aside.waitFor(); await page.waitForTimeout(450);
  await aside.locator('select').selectOption({ index: 1 });
  await page.mouse.click(195, 10); await page.waitForTimeout(450);
  assert.equal(await page.locator('[role=alertdialog][aria-label="Discard this reason?"]').count(), 1, `${tag}: a chosen reason is asked about`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ── 5 and 6. The real pages, over the fake stack ──────────────────────────────────────────────
async function realPages(browser, tag) {
  const { ctx, page, errors } = await phone(browser, { base: FAKE });
  const seen = []; page.on('request', (r) => { const u = r.url(); if (/_next\/data|\/api\/listings\/applicants/.test(u)) seen.push(u.replace(FAKE, '')); });
  let dataProps = null; page.on('response', async (r) => { if (/_next\/data\/.*\/listing\/L1\.json/.test(r.url())) { try { dataProps = (await r.json()).pageProps; } catch (e) { /* not json */ } } });
  await open(page, '/dashboard');
  await page.evaluate(() => { window.__same = 'yes'; });
  const card = page.locator('.dash-card[role=link]', { hasText: '210 Carlaw' }).first();
  const box = await card.boundingBox();
  const t0 = Date.now();
  await page.touchscreen.tap(box.x + 30, box.y + 20);
  await page.locator('[data-skeleton-route="listing"]').waitFor({ timeout: 3000 });
  const skeletonAt = Date.now() - t0;
  await page.locator('[id^="applicant-"]').first().waitFor({ timeout: 20000 });
  assert.ok(skeletonAt < 1000, `${tag}: the skeleton at ${skeletonAt}ms`);
  assert.equal(await page.evaluate(() => window.__same), 'yes', `${tag}: no reload`);
  const firstApplicants = seen.findIndex((u) => /api\/listings\/applicants\?listingId=L1/.test(u)); const firstData = seen.findIndex((u) => /_next\/data/.test(u));
  assert.ok(firstApplicants > -1 && firstApplicants < firstData, `${tag}: the applicants started on the touch: ${seen.join(' , ')}`);
  assert.equal(seen.filter((u) => /api\/listings\/applicants\?listingId=L1/.test(u)).length, 1, `${tag}: one request for them`);
  assert.equal(dataProps && dataProps.initialApplicants, null, `${tag}: the page data came without them`);
  // The ownership check still holds for a tap inside the app.
  await page.evaluate(() => window.next.router.push('/listing/L9'));
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__same), 'yes', `${tag}: redirected in the app`);
  // A restore that fails on the server goes back and says so.
  await page.route('**/api/applicants/decision', async (r) => { await new Promise((res) => setTimeout(res, 400)); await r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test failure' }) }); });
  await open(page, '/listing/L1');
  const restores = page.locator('button', { hasText: /^Restore$/ }); // the control, not the set aside row named after it
  const before = await restores.count();
  assert.ok(before > 0, `${tag}: a set aside applicant to restore`);
  await restores.first().scrollIntoViewIfNeeded(); await restores.first().click();
  await page.waitForTimeout(150);
  assert.equal(await restores.count(), before - 1, `${tag}: restored at once`);
  await page.locator('.lv-toast[data-toast]').waitFor({ timeout: 5000 });
  assert.match(await page.locator('.lv-toast').innerText(), /It is back as it was\./);
  assert.equal(await restores.count(), before, `${tag}: and back when the server said no`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    await navigation(browser, tag);
    await press(browser, tag);
    await pipeline(browser, tag);
    await sheets(browser, tag);
    await realPages(browser, tag);
  } finally { await browser.close(); }
}

test('the native feel in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
