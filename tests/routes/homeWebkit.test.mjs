// The homepage in WebKit (iOS Safari's engine) and in Chrome, at 390 by 844 with an iPhone user agent
// and at 1280 by 800: everything above the fold laid out and opaque within 200ms of the first painted
// frame with no scroll, the sample dashboard link opening the sandbox, and Sign in opening /signin
// (the header nav is hidden under 600px, so at 390 the link is followed by its href). Skipped when
// playwright-core or the browser binary is absent. The dev server (tests/helpers/devServer.mjs) is
// shared with the other browser walk files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { devServer, BASE } from '../helpers/devServer.mjs';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);

const server = devServer(`${BASE}/`);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: 180000 });
after(() => server.stop(), { timeout: 300000 });

// The pages the walk opens, compiled by the dev server before the clock starts: a first compile
// under three parallel walks otherwise lands inside the navigation window.
const warm = () => Promise.all(['/', '/signin', '/demo/dashboard'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));

async function landing(browserType, launch, tag, width) {
  await warm();
  const browser = await browserType.launch(launch);
  const phone = width < 900;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 800 }, userAgent: phone ? UA_PHONE : UA_DESK, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await ctx.newPage();
  const out = { tag, width };
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
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
    // 2. The sample dashboard link opens the sandbox; Sign in opens /signin.
    const follow = async (run, pattern, what) => {
      try { await run(); await page.waitForURL(pattern, { timeout: 45000, waitUntil: 'commit' }); }
      catch (e) { await page.screenshot({ path: `/tmp/home-${tag}-${width}-fail.png` }).catch(() => {}); throw new Error(`${tag} ${width}: ${what} did not open (${e.message.split('\n')[0]}); page is at ${page.url()}`); }
    };
    const sample = page.locator('a[href="/demo/dashboard"]').first();
    assert.ok((await page.locator('a[href="/demo/dashboard"]').count()) >= 1, 'a link to the sandbox is on the page');
    await follow(() => (phone ? sample.tap() : sample.click()), /\/demo\/dashboard/, 'the sample dashboard link');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const signIn = page.locator('a[href="/signin"]').first();
    assert.ok((await page.locator('a[href="/signin"]').count()) >= 1, 'the Sign in link is on the page');
    const visible = await signIn.isVisible();
    out.signInVisible = visible;
    await follow(() => (visible ? (phone ? signIn.tap() : signIn.click()) : page.evaluate(() => document.querySelector('a[href="/signin"]').click())), /\/signin/, 'Sign in');
    return out;
  } finally { await browser.close(); }
}

test('homepage in WebKit at 390 and 1280', { skip: haveWebkit ? false : 'WebKit binary absent (npx playwright install webkit)' }, async () => {
  const a = await landing(pw.webkit, {}, 'wk', 390);
  const b = await landing(pw.webkit, {}, 'wk', 1280);
  console.log('webkit homepage', JSON.stringify({ a, b }));
});

test('homepage in Chrome at 390 and 1280', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const a = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 390);
  const b = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 1280);
  console.log('chrome homepage', JSON.stringify({ a, b }));
});
