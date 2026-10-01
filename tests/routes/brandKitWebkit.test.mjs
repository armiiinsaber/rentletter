// The brand kit on the admin mockups page (components/admin/BrandKit.js), in WebKit (Safari's
// engine) and in Chrome, at 390 by 844 with an iPhone user agent, signed in to an admin dev server
// of its own (tests/helpers/adminServer.mjs: a made up password, an in memory store):
//   1. In a browser tab the main pill downloads the zip and a format pill downloads its PNG, byte for
//      byte the files in public/brand/kit. Every pill links a kit file the server serves at its
//      recorded size, the size beside the main pill is the zip's, every preview loads, and every
//      pill is a 44px target with no motion.
//   2. In the installed app (navigator.standalone) a pill never navigates the app window: the file
//      goes to the share sheet with the same bytes. When the fetch outlasts the tap (share answers
//      NotAllowedError) the pill turns to Share and the next tap shares it. Where the share sheet
//      takes no files, the file opens in a new window.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { adminServer, ADMIN_START_TIMEOUT } from '../helpers/adminServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const KIT = JSON.parse(readFileSync(`${ROOT}public/brand/kit/manifest.json`, 'utf8'));
const kitFile = (p) => readFileSync(`${ROOT}public/brand/kit/${KIT.folder}/${p}`);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sizeLabel = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PNG = 'logo/rentletter-logo-primary-2x.png';

const admin = adminServer(3125);
before(() => ((haveWebkit || haveChrome) ? admin.start() : undefined), { timeout: ADMIN_START_TIMEOUT });
after(() => admin.stop(), { timeout: 60000 });

async function phone(browser, { standalone = false, share = null } = {}) {
  const ctx = await browser.newContext({ baseURL: admin.base, viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'no-preference', acceptDownloads: true });
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); });
  // The share sheet and window.open, recorded: what a pill hands over, by name, type, size and hash.
  await ctx.addInitScript((mode) => {
    window.__shared = []; window.__opened = []; window.__shareCalls = 0;
    window.open = (u, t) => { window.__opened.push([u, t]); return null; };
    if (mode === 'none') { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) { /* not there */ } Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true }); return; }
    if (!mode) return;
    const hex = async (f) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
    Object.defineProperty(window.navigator, 'canShare', { value: (d) => !!(d && d.files && d.files.length), configurable: true });
    Object.defineProperty(window.navigator, 'share', { configurable: true, value: async (d) => {
      window.__shareCalls += 1;
      if (mode === 'slow' && window.__shareCalls === 1) { const e = new Error('The request is not allowed'); e.name = 'NotAllowedError'; throw e; }
      for (const f of d.files) window.__shared.push({ name: f.name, type: f.type, size: f.size, sha: await hex(f) });
    } });
  }, share);
  await admin.signIn(ctx);
  const page = await ctx.newPage();
  await page.goto('/admin/mockups', { waitUntil: 'networkidle', timeout: 240000 });
  const section = page.locator('#brand-kit'); await section.waitFor({ timeout: 60000 });
  return { ctx, page, section };
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    // 1. A browser tab.
    {
      const { ctx, page, section } = await phone(browser);
      assert.match(await section.locator('.bk-size').innerText(), new RegExp(`^${sizeLabel(KIT.zip.size).replace('.', '\\.')} zip, ${KIT.files.length} files$`), `${tag}: the size beside the main pill`);
      const zipPill = section.locator('[data-kit-zip]');
      assert.equal(await zipPill.getAttribute('download'), KIT.zip.path);
      const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), zipPill.click()]);
      assert.equal(zip.suggestedFilename(), KIT.zip.path);
      assert.equal(sha(readFileSync(await zip.path())), KIT.zip.sha256, `${tag}: the zip, byte for byte`);
      const pngPill = section.getByRole('link', { name: 'Primary, PNG 2x', exact: true });
      const [png] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), pngPill.click()]);
      assert.equal(png.suggestedFilename(), 'rentletter-logo-primary-2x.png');
      assert.ok(readFileSync(await png.path()).equals(kitFile(PNG)), `${tag}: the PNG, byte for byte`);
      assert.equal(new URL(page.url()).pathname, '/admin/mockups', `${tag}: the page stays`);
      // Every pill: a kit file, served at its size; a 44px target; no motion. Every preview loads.
      const pills = await section.locator('a.bk-pill').evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { href: a.getAttribute('href'), download: a.getAttribute('download'), h: r.height, motion: `${cs.transitionDuration} ${cs.animationName}` }; }));
      const byPath = new Map(KIT.files.map((f) => [`/brand/kit/${KIT.folder}/${f.path}`, f]));
      assert.equal(new Set(pills.map((p) => p.href)).size, KIT.files.length - 1, `${tag}: a pill for every kit file but the README`);
      for (const p of pills) {
        const f = byPath.get(p.href); assert.ok(f, `${tag}: ${p.href} is a kit file`);
        assert.equal(p.download, f.path.split('/').pop()); assert.ok(p.h >= 44, `${tag}: ${p.href} is ${p.h}px tall`); assert.equal(p.motion, '0s none', `${tag}: ${p.href} has no motion`);
        const r = await ctx.request.get(p.href); assert.equal(r.status(), 200, p.href); assert.equal((await r.body()).length, f.size, `${tag}: ${p.href} served at its size`);
      }
      await section.evaluate(async (s) => { for (const img of s.querySelectorAll('img')) { img.scrollIntoView(); if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; }); } });
      const broken = await section.locator('img').evaluateAll((imgs) => imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')));
      assert.deepEqual(broken, [], `${tag}: every preview loads`);
      await ctx.close();
    }
    // 2. The installed app: the share sheet, the same bytes, the app window never navigates.
    {
      const { ctx, page, section } = await phone(browser, { standalone: true, share: 'ok' });
      let downloads = 0; page.on('download', () => { downloads += 1; });
      await section.getByRole('link', { name: 'Primary, PNG 2x', exact: true }).click();
      await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 30000 });
      const [shared] = await page.evaluate(() => window.__shared);
      assert.deepEqual(shared, { name: 'rentletter-logo-primary-2x.png', type: 'image/png', size: kitFile(PNG).length, sha: sha(kitFile(PNG)) }, `${tag}: the share sheet gets the PNG`);
      await section.locator('[data-kit-zip]').click();
      await page.waitForFunction(() => window.__shared.length === 2, null, { timeout: 60000 });
      assert.equal((await page.evaluate(() => window.__shared[1])).sha, KIT.zip.sha256, `${tag}: and the zip`);
      assert.equal(new URL(page.url()).pathname, '/admin/mockups'); assert.equal(downloads, 0, `${tag}: nothing downloads into the app window`);
      await ctx.close();
    }
    {
      // The fetch outlasted the tap: the pill says Share, and the next tap shares.
      const { ctx, page, section } = await phone(browser, { standalone: true, share: 'slow' });
      const pill = section.getByRole('link', { name: 'Primary, PNG 2x', exact: true });
      await pill.click();
      await page.waitForFunction(() => window.__shareCalls === 1, null, { timeout: 30000 });
      await section.locator('a.bk-pill', { hasText: /^Share$/ }).waitFor({ timeout: 10000 });
      await section.locator('a.bk-pill', { hasText: /^Share$/ }).click();
      await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 30000 });
      assert.equal((await page.evaluate(() => window.__shared[0])).sha, sha(kitFile(PNG)), `${tag}: shared on the second tap`);
      assert.equal(await section.locator('a.bk-pill', { hasText: /^Share$/ }).count(), 0, `${tag}: the pill reads PNG 2x again`);
      assert.equal(new URL(page.url()).pathname, '/admin/mockups');
      await ctx.close();
    }
    {
      // No file sharing: a new window, never the app window.
      const { ctx, page, section } = await phone(browser, { standalone: true, share: 'none' });
      await section.getByRole('link', { name: 'Primary, PNG 2x', exact: true }).click();
      await page.waitForFunction(() => window.__opened.length === 1, null, { timeout: 10000 });
      assert.deepEqual(await page.evaluate(() => window.__opened[0]), [`/brand/kit/${KIT.folder}/${PNG}`, '_blank'], `${tag}: opens in a new window`);
      assert.equal(new URL(page.url()).pathname, '/admin/mockups');
      await ctx.close();
    }
  } finally { await browser.close(); }
}

test('the brand kit downloads in WebKit at 390, and goes to the share sheet in the installed app', { timeout: 900000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
