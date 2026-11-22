// Where the wordmark goes, in WebKit at 390 by 844 with an iPhone user agent and in Chrome, on the
// sandbox: from the profile page the back row lands on the dashboard with what was typed still
// there, the wordmark on a listing page lands on the dashboard, and the wordmark on the apply form
// lands on the homepage. Every wordmark is a link with a 44px tap target. Skipped when
// playwright-core or the browser binary is absent. The pages are served from the run's one
// production build (tests/helpers/fakeBuild.mjs), in this walk's own copy, on its own port, with
// service workers blocked: a production build registers one (lib/serviceWorker.js) that the dev
// server never did.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

const PORT = 3189; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
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

// The routes the walk opens, each asked for once before any tap: the server loads a page's code
// on its first request, which would otherwise land inside the navigation the walk is waiting for.
const warm = () => Promise.all(['/', '/demo/dashboard', '/demo/dashboard?profile=1', '/demo/dashboard?listing=demo-carlaw', '/apply/demo0000000000000001'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));

const markBox = (page) => page.evaluate(() => {
  const a = document.querySelector('a.rl-mark');
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { href: a.getAttribute('href'), height: Math.round(r.height), width: Math.round(r.width) };
});

async function walk(browserType, launch, tag) {
  await warm();
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shots = [];
  const shot = async (name) => { const p = `/tmp/wordmark-${tag}-${name}.png`; await page.screenshot({ path: p }); shots.push(p); };
  try {
    // 1. The profile page: the back row lands on the dashboard, and what was typed is still there.
    await page.goto(`${BASE}/demo/dashboard?profile=1`, { waitUntil: 'networkidle' });
    await page.locator('#profile-field-full_name').waitFor({ timeout: 30000 });
    const typed = 'Sarah Chen Jr';
    await page.locator('#profile-field-full_name').fill(typed);
    await page.locator('#profile-field-brokerage').tap();   // the blur that saves
    await page.waitForTimeout(600);
    const back = page.getByRole('link', { name: 'Dashboard' }).first();
    const backBox = await back.boundingBox();
    assert.ok(backBox && Math.round(backBox.height) >= 44, `the back row is a 44px target (${JSON.stringify(backBox)})`);
    await shot('1-profile');
    await back.tap();
    await page.waitForURL((u) => u.pathname === '/demo/dashboard' && !u.searchParams.has('profile'), { timeout: 30000 });
    await page.locator('.dash-ink').waitFor({ timeout: 30000 });   // the dashboard itself, not just the URL
    await page.goto(`${BASE}/demo/dashboard?profile=1`, { waitUntil: 'networkidle' });
    await page.locator('#profile-field-full_name').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#profile-field-full_name').inputValue(), typed, 'the edit was kept');

    // 2. A listing page: the wordmark is the way back to the dashboard.
    await page.goto(`${BASE}/demo/dashboard?listing=demo-carlaw`, { waitUntil: 'networkidle' });
    await page.locator('a.rl-mark').first().waitFor({ timeout: 30000 });
    const listingMark = await markBox(page);
    assert.equal(listingMark.href, '/demo/dashboard', 'the realtor wordmark points at the dashboard');
    assert.ok(listingMark.height >= 44, `a 44px tap target (${JSON.stringify(listingMark)})`);
    await shot('2-listing');
    // A tap that lands inside a reload is lost (the dev server this walk used to run on reloaded a
    // page as it dropped an idle route): the tap is made once more before the walk gives up.
    const onDashboard = (u) => u.pathname === '/demo/dashboard' && !u.searchParams.has('listing');
    await page.locator('a.rl-mark').first().tap();
    try { await page.waitForURL(onDashboard, { timeout: 10000 }); }
    catch (e) {
      await page.locator('a.rl-mark').first().waitFor({ timeout: 30000 });
      await page.locator('a.rl-mark').first().tap();
      await page.waitForURL(onDashboard, { timeout: 30000 });
    }
    await page.locator('.dash-ink').waitFor({ timeout: 30000 });

    // 3. The apply form: the wordmark is the way to the homepage. A tab of its own, so the
    // dashboard's own routing cannot interrupt the walk mid navigation.
    const tenant = await ctx.newPage();
    await tenant.goto(`${BASE}/apply/demo0000000000000001`, { waitUntil: 'networkidle' });
    await tenant.locator('a.rl-mark').first().waitFor({ timeout: 30000 });
    const applyMark = await markBox(tenant);
    assert.equal(applyMark.href, '/', 'the tenant wordmark points at the homepage');
    assert.ok(applyMark.height >= 44, `a 44px tap target (${JSON.stringify(applyMark)})`);
    const applyShot = `/tmp/wordmark-${tag}-3-apply.png`; await tenant.screenshot({ path: applyShot }); shots.push(applyShot);
    await tenant.locator('a.rl-mark').first().tap();
    await tenant.waitForURL((u) => u.pathname === '/', { timeout: 30000 });
    await tenant.locator('h1').first().waitFor({ timeout: 30000 });
    return shots;
  } finally { await browser.close(); }
}

test('the wordmark in WebKit at 390 by 844 with an iPhone user agent', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  const shots = await walk(pw.webkit, {}, 'wk');
  assert.equal(shots.length, 3);
});

test('the same wordmark walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const shots = await walk(pw.chromium, { executablePath: chromeBin }, 'cr');
  assert.equal(shots.length, 3);
});
