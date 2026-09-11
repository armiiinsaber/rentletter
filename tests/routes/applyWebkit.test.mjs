// The apply flow in WebKit (iOS Safari's engine) and in Chrome, at 390 by 844 with a mobile user
// agent: the saved profile choice unmounts its card and the step card is visible at once with no
// gap above it beyond the section gap; Continue advances synchronously and the previous step
// leaves the DOM; all eight steps reach the review card. Skipped when playwright-core or the
// browser binary is absent (npx playwright install webkit). The dev server (tests/helpers/devServer.mjs) is
// shared with the other browser walk file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { devServer, BASE } from '../helpers/devServer.mjs';

const URL_APPLY = `${BASE}/apply/demo0000000000000001`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);

const server = devServer(URL_APPLY);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: 180000 });
after(() => server.stop(), { timeout: 300000 });

const id = (n) => `step-${String(n).padStart(2, '0')}`;
// The step card's box: rendered, opaque, and the space above it (to the element before it in
// the flow) no wider than the section gap.
const cardBox = (page, n) => page.evaluate((elId) => {
  const el = document.getElementById(elId); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  let prev = el.previousElementSibling; let host = el.parentElement;
  while (!prev && host && host !== document.body) { prev = host.previousElementSibling; host = host.parentElement; }
  const gap = prev ? Math.round(r.top - prev.getBoundingClientRect().bottom) : null;
  return { height: Math.round(r.height), opacity: cs.opacity, display: cs.display, visibility: cs.visibility, gap, stepsInDom: document.querySelectorAll('[id^="step-"]').length };
}, id(n));

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // A saved profile on this device: the offer card shows on landing.
  await ctx.addInitScript(() => { try { localStorage.setItem('rentletter_app_number', 'RL-2026-1A2B-3C4D'); localStorage.setItem('rentletter_owner_token', 'A'.repeat(32)); } catch (e) { /* private mode */ } });
  const page = await ctx.newPage();
  // The prefill read answers late and empty: with a device token the sandbox has no application to
  // load, and a fast error would bring the choice card back inside the 200ms window under test.
  await page.route('**/api/application/manage', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found.' }) }); });
  const shots = [];
  const shot = async (name) => { const p = `/tmp/${tag}-${name}.png`; await page.screenshot({ path: p }); shots.push(p); };
  const expectCard = async (n, when) => {
    const box = await cardBox(page, n);
    assert.ok(box, `${when}: step ${n} card is in the DOM`);
    assert.ok(box.height > 100 && box.display !== 'none' && box.visibility !== 'hidden', `${when}: step ${n} card is laid out (${JSON.stringify(box)})`);
    assert.equal(box.opacity, '1', `${when}: step ${n} card is opaque`);
    assert.ok(box.gap !== null && box.gap <= 32, `${when}: no gap above step ${n} beyond the section gap (gap ${box.gap})`);
    assert.equal(box.stepsInDom, 1, `${when}: only one step card is in the DOM`);
    return box;
  };
  try {
    await page.goto(URL_APPLY, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Use my saved profile' }).waitFor({ timeout: 15000 });
    await shot('1-landing');
    await page.getByRole('button', { name: 'Use my saved profile' }).tap();
    await page.waitForTimeout(200);
    await expectCard(1, 'after Use my saved profile');
    assert.equal(await page.getByRole('button', { name: 'Use my saved profile' }).count(), 0, 'the choice card unmounted at once');
    await shot('2-after-use-profile');

    await page.goto(URL_APPLY, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Start fresh' }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start fresh' }).tap();
    await page.waitForTimeout(200);
    await expectCard(1, 'after Start fresh');
    assert.equal(await page.getByRole('button', { name: 'Start fresh' }).count(), 0, 'the choice card unmounted at once');
    await shot('3-after-start-fresh');

    await page.getByLabel('Email').fill('priya@example.com');
    await page.getByRole('button', { name: 'Continue' }).tap();
    await page.waitForTimeout(200);
    await expectCard(2, 'after Continue');
    assert.equal(await page.locator(`#${id(1)}`).count(), 0, 'step 1 left the DOM');
    await shot('4-step2');

    const next = async () => { await page.getByRole('button', { name: 'Continue' }).tap(); await page.waitForTimeout(200); };
    await page.getByLabel('Full name').fill('Priya Sharma'); await page.getByLabel('Date of birth').fill('1994-03-02'); await page.getByLabel('Phone').fill('4165550142');
    await next(); await expectCard(3, 'step 3');
    await page.getByLabel('Employment type').selectOption('full-time'); await page.getByLabel('Job title').fill('Registered Nurse'); await page.getByLabel('Employer').fill('Sunnybrook Health Sciences Centre'); await page.getByLabel('Annual income before tax').fill('92000');
    await next(); await expectCard(4, 'step 4');
    await next(); await expectCard(5, 'step 5');
    await page.getByLabel('Desired move in date').fill('2026-11-01');
    await next(); await expectCard(6, 'step 6');
    await next(); await expectCard(7, 'step 7');
    await next(); await expectCard(8, 'review');
    assert.equal(await page.getByRole('button', { name: 'Submit' }).count(), 1, 'the review card carries the one Submit');
    await shot('5-review');
    return shots;
  } finally { await browser.close(); }
}

test('apply flow in WebKit at 390 by 844 with an iPhone user agent', { skip: haveWebkit ? false : 'WebKit binary absent (npx playwright install webkit)' }, async () => {
  const shots = await walk(pw.webkit, {}, 'wk');
  assert.equal(shots.length, 5);
});

test('the same walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const shots = await walk(pw.chromium, { executablePath: chromeBin }, 'cr');
  assert.equal(shots.length, 5);
});
