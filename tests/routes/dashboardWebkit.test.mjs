// The realtor walk in WebKit (iOS Safari's engine) and in Chrome, at 390 by 844 with an iPhone user
// agent, on the sandbox: the dashboard renders every card opaque without scrolling; a listing
// opens; a card expands; a checklist confirmation flips its pill; the bell opens and a row navigates;
// the Landlord section and the Details fold are there. Every asserted element is visible within
// 200ms of its trigger, with nothing waiting on a scroll. Skipped when playwright-core or the
// browser binary is absent (npx playwright install webkit). The sandbox is served from the run's
// one production build (tests/helpers/fakeBuild.mjs), in this walk's own copy, on its own port,
// with service workers blocked: a production build registers one (lib/serviceWorker.js) that the
// dev server never did, so the walk meets the pages as it did there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

const PORT = 3182; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const URL_HOME = `${BASE}/demo/dashboard`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);

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

// Laid out and not hidden: a box with height, display and visibility on, opacity 1.
const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { height: Math.round(r.height), top: Math.round(r.top), opacity: cs.opacity, display: cs.display, visibility: cs.visibility, text: (el.textContent || '').trim().slice(0, 60) };
}, selector);
const shown = (box, what) => {
  assert.ok(box, `${what}: in the DOM`);
  assert.ok(box.height > 0 && box.display !== 'none' && box.visibility !== 'hidden', `${what}: laid out (${JSON.stringify(box)})`);
  assert.equal(box.opacity, '1', `${what}: opaque`);
};

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const shots = [];
  const shot = async (name) => { const p = `/tmp/${tag}-${name}.png`; await page.screenshot({ path: p }); shots.push(p); };
  try {
    // 1. The dashboard: every card opaque, the page not scrolled.
    await page.goto(URL_HOME, { waitUntil: 'networkidle' });
    await page.locator('.dash-ink').waitFor({ timeout: 15000 });
    await page.waitForTimeout(200);
    const cards = await page.evaluate(() => [...document.querySelectorAll('.dash-ink, .dash-card, .rl-card, .dash-new')].map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { h: Math.round(r.height), o: cs.opacity, v: cs.visibility, cls: el.className.toString().slice(0, 24) }; }));
    assert.ok(cards.length >= 4, `the dashboard has its cards (${cards.length})`);
    for (const c of cards) assert.ok(c.h > 0 && c.o === '1' && c.v !== 'hidden', `a dashboard card is opaque and laid out (${JSON.stringify(c)})`);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'nothing scrolled');
    await shot('1-dashboard');

    // 2. Open a listing.
    await page.getByRole('link', { name: '210 Carlaw Ave, Unit 4' }).tap();
    await page.waitForURL(/listing=demo-carlaw/, { timeout: 15000 });
    await page.locator('[aria-controls="applicant-demo-link-1-body"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(200);
    shown(await boxOf(page, '[aria-controls="applicant-demo-link-1-body"]'), 'the first applicant card header');
    await shot('2-listing');

    // 3. Expand a card.
    await page.locator('[aria-controls="applicant-demo-link-1-body"]').tap();
    await page.waitForTimeout(200);
    const body = await boxOf(page, '#applicant-demo-link-1-body');
    assert.ok(body && body.height > 200 && body.display !== 'none', `the expanded body is laid out within 200ms (${JSON.stringify(body)})`);
    assert.equal(await page.locator('[aria-controls="applicant-demo-link-1-body"]').getAttribute('aria-expanded'), 'true');
    await shot('3-expanded');

    // 4. A checklist confirmation flips its pill.
    const pill = page.locator('#applicant-demo-link-1-body button[aria-pressed="false"]', { hasText: 'Saw ID' }).first();
    await pill.waitFor({ timeout: 5000 });
    await pill.tap();
    await page.waitForTimeout(200);
    const flipped = page.locator('#applicant-demo-link-1-body button[aria-pressed="true"]', { hasText: /Confirmed/ });
    assert.ok((await flipped.count()) >= 1, 'the pill reads Confirmed within 200ms');
    assert.equal(await page.locator('#applicant-demo-link-1-body button', { hasText: 'Saw ID' }).count(), 0, 'Saw ID is gone');
    await shot('4-checklist');

    // 5. The bell opens; a row navigates.
    await page.locator('button[aria-haspopup="dialog"]').tap();
    await page.waitForTimeout(200);
    shown(await boxOf(page, '[role="dialog"][aria-label="Next"]'), 'the bell panel');
    await shot('5-bell');
    const row = page.locator('[role="dialog"][aria-label="Next"] button', { hasText: /^(Review|Verify|Request|Open|Send|Check)/ }).first();
    await row.waitFor({ timeout: 5000 });
    await row.tap();
    await page.waitForURL(/panel=/, { timeout: 15000 });
    await page.locator('[role="button"][aria-expanded="true"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(200);
    shown(await boxOf(page, '[role="button"][aria-expanded="true"]'), 'the card the row pointed at, expanded');
    await shot('6-after-row');

    // 6. The Landlord section and the Details fold.
    shown(await boxOf(page, '#report'), 'the Landlord section');
    assert.match((await boxOf(page, '#report')).text, /^Landlord/);
    await page.getByRole('button', { name: 'Details', exact: true }).tap();
    await page.waitForTimeout(200);
    const fold = await page.evaluate(() => { const el = document.getElementById('listing-details'); const inner = el && el.firstElementChild; return el && inner ? { hidden: el.getAttribute('aria-hidden'), height: Math.round(inner.getBoundingClientRect().height), signed: /Signed by/.test(el.textContent) } : null; });
    assert.ok(fold && fold.hidden === 'false' && fold.height > 100 && fold.signed, `the Details fold is open within 200ms (${JSON.stringify(fold)})`);
    await page.locator('#listing-details').scrollIntoViewIfNeeded();
    await shot('7-details');
    return shots;
  } finally { await browser.close(); }
}

test('realtor walk in WebKit at 390 by 844 with an iPhone user agent', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  const shots = await walk(pw.webkit, {}, 'wk2');
  assert.equal(shots.length, 7);
});

test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const shots = await walk(pw.chromium, { executablePath: chromeBin }, 'cr2');
  assert.equal(shots.length, 7);
});
