// The homepage in WebKit (iOS Safari's engine) and in Chrome, at 390 by 844 with an iPhone user agent
// and at 1280 by 800: everything above the fold opaque within 200ms of load with no scroll; no line
// ending on a single word, no separator at a line edge (tests/helpers/measureLines.mjs); the two
// buttons on one baseline, 44px tall, one card gap apart, on the sentence's left edge; the frame's
// screen on the paper canvas edge to edge against the ink bezel with no band between; the hero
// motion running once on load and never again on scroll; the red button opening the sandbox and
// Sign in opening /signin. Skipped when playwright-core or the browser binary is absent. The dev
// server (tests/helpers/devServer.mjs) is shared with the other browser walk files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { devServer, BASE } from '../helpers/devServer.mjs';
import { MEASURE_SOURCE } from '../helpers/measureLines.mjs';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);
const PAPER_DEEP = 'rgb(242, 238, 227)';

const server = devServer(`${BASE}/`);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: 180000 });
after(() => server.stop(), { timeout: 300000 });

const rect = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), opacity: cs.opacity, bg: cs.backgroundColor }; }, sel);

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
    const started = await page.evaluate(() => document.getAnimations().length);
    await page.waitForTimeout(200);
    // 1. Above the fold, laid out and opaque, unscrolled. Everything that does not rise is opaque at
    // 200ms; the four rising hero elements (60ms stagger, the short duration) finish by 400ms.
    const fold = phone ? 844 : 800;
    const boxes = (sel) => page.evaluate(([q, f]) => [...document.querySelectorAll(q)].map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { cls: el.getAttribute('class').split(' ').find((c) => c.startsWith('lp-')) || el.tagName, top: Math.round(r.top), h: Math.round(r.height), o: cs.opacity, v: cs.visibility }; }).filter((x) => x.top < f), [sel, fold]);
    const still = await boxes('.lp-steps, .lp-frame, .lp-screen, .lp-card, .lp-muted, .lp-header');
    assert.ok(still.length >= 3, `elements above the fold (${still.length})`);
    for (const h of still) assert.ok(h.h > 0 && h.o === '1' && h.v !== 'hidden', `${tag} ${width}: ${h.cls} opaque within 200ms (${JSON.stringify(h)})`);
    const rising = await boxes('.lp-rise');
    for (const h of rising) assert.ok(h.h > 0 && h.v !== 'hidden', `${tag} ${width}: ${h.cls} laid out within 200ms (${JSON.stringify(h)})`);
    await page.waitForTimeout(200);
    for (const h of await boxes('.lp-rise')) assert.equal(h.o, '1', `${tag} ${width}: ${h.cls} opaque within 400ms (${JSON.stringify(h)})`);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'nothing scrolled');
    // 2. The text rules.
    const m = await page.evaluate(MEASURE_SOURCE);
    assert.deepEqual(m.orphans, [], `${tag} ${width}: no line ends on a single word`);
    assert.deepEqual(m.seps, [], `${tag} ${width}: no separator at a line edge`);
    assert.equal(m.scrollWidth, width, 'no horizontal scroll');
    out.gapsOut = m.gapsOut; out.gapsIn = m.gapsIn; out.height = m.height;
    // 3. The two buttons: one height, one gap, one left edge with the sentence.
    const red = await rect(page, '.lp-btn-red'); const ink = await rect(page, '.lp-actions .lp-btn:not(.lp-btn-red)'); const p = await rect(page, '.lp-p');
    assert.equal(red.height, 44); assert.equal(ink.height, 44);
    assert.equal(red.left, p.left, 'the red button sits on the sentence\'s left edge');
    if (phone) { assert.equal(ink.left, red.left); assert.equal(ink.width, red.width, 'same width at 390'); assert.equal(ink.top - red.bottom, 16, 'one card gap between them'); }
    else { assert.equal(ink.top, red.top, 'one baseline at 1280'); assert.equal(ink.left - red.right, 16, 'one card gap between them'); }
    out.buttons = { red, ink, sentenceLeft: p.left };
    // 4. The frame: the screen on paperDeep, edge to edge against the bezel, nothing between.
    const frame = await rect(page, '.lp-frame'); const screen = await rect(page, '.lp-screen');
    const bezel = phone ? 12 : 10;
    assert.equal(screen.bg, PAPER_DEEP, 'the screen is the paper canvas');
    assert.equal(screen.left - frame.left, bezel); assert.equal(frame.right - screen.right, bezel); assert.equal(screen.top - frame.top, bezel);
    const band = await page.evaluate(() => {
      const s = document.querySelector('.lp-screen'); const r = s.getBoundingClientRect();
      const probe = (y) => { const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(y)); let e = el; while (e && getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement; return { inside: !!el && s.contains(el), bg: e ? getComputedStyle(e).backgroundColor : null }; };
      return [probe(r.top + 2), probe(r.top + 8)];
    });
    for (const b of band) assert.ok(b.inside && b.bg === PAPER_DEEP, `no band above the screen's content (${JSON.stringify(b)})`);
    out.frame = { frame, screen, bezel };
    // 5. Motion once on load, never on scroll.
    await page.waitForTimeout(600);
    const runningAfterLoad = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    assert.equal(runningAfterLoad, 0, 'the load motion has finished');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    const afterScroll = await page.evaluate(() => ({ running: document.getAnimations().filter((a) => a.playState === 'running').length, faded: [...document.querySelectorAll('.lp-rise')].filter((el) => getComputedStyle(el).opacity !== '1').length }));
    assert.deepEqual(afterScroll, { running: 0, faded: 0 }, 'nothing moves on scroll');
    out.animationsOnLoad = started;
    await page.screenshot({ path: `/tmp/home-${tag}-${width}.png`, fullPage: true });
    // 6. The red button opens the sandbox; Sign in opens /signin.
    assert.equal(await page.locator('.lp-btn-red').getAttribute('href'), '/demo/dashboard');
    assert.equal(await page.getByRole('link', { name: 'Sign in' }).getAttribute('href'), '/signin');
    // The link opens its page: the URL commits after the tap. On a failure the message carries where
    // the page ended up and a screenshot lands in /tmp.
    const follow = async (locator, pattern, what) => {
      try {
        if (phone) await locator.tap(); else await locator.click();
        await page.waitForURL(pattern, { timeout: 45000, waitUntil: 'commit' });
      } catch (e) {
        await page.screenshot({ path: `/tmp/home-${tag}-${width}-fail.png` }).catch(() => {});
        throw new Error(`${tag} ${width}: ${what} did not open (${e.message.split('\n')[0]}); page is at ${page.url()}`);
      }
    };
    await follow(page.locator('.lp-btn-red'), /\/demo\/dashboard/, 'the red button');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await follow(page.getByRole('link', { name: 'Sign in' }), /\/signin/, 'Sign in');
    return out;
  } finally { await browser.close(); }
}

test('homepage in WebKit at 390 and 1280', { skip: haveWebkit ? false : 'WebKit binary absent (npx playwright install webkit)' }, async () => {
  const a = await landing(pw.webkit, {}, 'wk', 390);
  const b = await landing(pw.webkit, {}, 'wk', 1280);
  console.log('webkit measurements', JSON.stringify({ a, b }));
});

test('homepage in Chrome at 390 and 1280', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const a = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 390);
  const b = await landing(pw.chromium, { executablePath: chromeBin }, 'cr', 1280);
  console.log('chrome measurements', JSON.stringify({ a, b }));
});
