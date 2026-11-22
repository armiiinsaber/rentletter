// The homepage in WebKit (iOS Safari's engine) and in Chrome, at 390 by 844 with an iPhone user agent
// and at 1280 by 800: everything above the fold laid out and opaque within 200ms of the first painted
// frame with no scroll, the hero's primary control opening the sandbox, and Sign in opening /signin
// (the header nav is hidden under 600px, so at 390 the link is followed by its href). Skipped when
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
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3183; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
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

// The pages the walk opens, each asked for once before the clock starts: the server loads a
// page's code on its first request, which would otherwise land inside the navigation window.
const warm = () => Promise.all(['/', '/signin', '/demo/dashboard'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));

async function landing(browserType, launch, tag, width) {
  await warm();
  const browser = await browserType.launch(launch);
  const phone = width < 900;
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: phone ? 844 : 800 }, userAgent: phone ? UA_PHONE : UA_DESK, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  const out = { tag, width };
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    // The measurement is of the homepage, so wait for the homepage's headline first.
    await page.locator('h1').first().waitFor({ state: 'attached', timeout: 30000 });
    // The clock starts at the first painted frame (Chrome can fire load before it paints).
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(200);
    // 1. Above the fold, laid out and opaque, unscrolled.
    const fold = phone ? 844 : 800;
    const above = await page.evaluate((f) => [...document.querySelectorAll('h1, h2, p, a.rl-btn, section')].map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { tag: el.tagName, top: Math.round(r.top), h: Math.round(r.height), o: cs.opacity, v: cs.visibility, text: (el.textContent || '').trim().slice(0, 30) }; }).filter((x) => x.h > 0 && x.top < f), fold);
    assert.ok(above.length >= 4, `elements above the fold (${above.length})`);
    for (const h of above) assert.ok(h.o === '1' && h.v !== 'hidden', `${tag} ${width}: ${h.tag} "${h.text}" opaque within 200ms (${JSON.stringify(h)})`);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'nothing scrolled');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'no horizontal scroll');
    out.aboveFold = above.length;
    await page.screenshot({ path: `/tmp/home-${tag}-${width}.png`, fullPage: true });
    // 2. The hero opens the sandbox; Sign in opens /signin.
    const follow = async (run, pattern, what) => {
      try { await run(); await page.waitForURL(pattern, { timeout: 45000, waitUntil: 'commit' }); }
      catch (e) { await page.screenshot({ path: `/tmp/home-${tag}-${width}-fail.png` }).catch(() => {}); throw new Error(`${tag} ${width}: ${what} did not open (${e.message.split('\n')[0]}); page is at ${page.url()}`); }
    };
    // The hero's primary control opens the sandbox; the header's one text link opens sign in.
    const primary = page.locator('a.rl-btn[href="/demo/dashboard"]').first();
    assert.ok((await primary.count()) >= 1, 'the hero links to the sandbox');
    await follow(() => (phone ? primary.tap() : primary.click()), /\/demo\/dashboard/, 'the hero button');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const signIn = page.locator('a[href="/signin"]').first();
    assert.ok((await page.locator('a[href="/signin"]').count()) >= 1, 'the Sign in link is on the page');
    const visible = await signIn.isVisible();
    out.signInVisible = visible;
    await follow(() => (visible ? (phone ? signIn.tap() : signIn.click()) : page.evaluate(() => document.querySelector('a[href="/signin"]').click())), /\/signin/, 'Sign in');
    noSupabaseLeft(ctx, `${tag} ${width}`);
    return out;
  } finally { await browser.close(); }
}

test('homepage in WebKit at 390 and 1280', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  const a = await landing(pw.webkit, {}, 'wk', 390);
  const b = await landing(pw.webkit, {}, 'wk', 1280);
  console.log('webkit homepage', JSON.stringify({ a, b }));
});

test('homepage in Chrome at 390 and 1280', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const a = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 390);
  const b = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 1280);
  console.log('chrome homepage', JSON.stringify({ a, b }));
});
