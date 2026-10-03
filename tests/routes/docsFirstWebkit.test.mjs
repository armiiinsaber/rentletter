// The documents first prototype on /admin/mockups (components/mockups/DocsFirst.js), in WebKit
// (Safari's engine) and in Chrome, on the walks' admin dev server (tests/helpers/adminServer.mjs: a
// made up password, an in memory store):
//   1. The comparison strip: today's eight steps and about five minutes, against three steps and
//      about two minutes.
//   2. The toggle: the frame shows the current form, then documents first.
//   3. All six screens, tapped through in the device frame: the invite, the documents (a photo
//      arrives, Reading with its rule, then Read), the facts with their sources and "needs you", a
//      fact edited in a 16px field, the review with docs match and stated, done with the tenant's
//      standing line, and the realtor's card with docs match and its line from the real function.
//   4. The skip path and the type instead path: nothing read, every fact typed, the realtor sees
//      "No documents yet".
//   5. Reset returns to the invite. Every target in the prototype is at least 44px tall; "verified"
//      never appears; nothing moves under reduced motion.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminServer, ADMIN_START_TIMEOUT } from '../helpers/adminServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { TENANT_LINES } from '../../lib/applicantState.js';
import { APPLICATION_STATE } from '../../lib/application-state.js';

const admin = adminServer(3125);
before(async () => { if (haveWebkit || haveChrome) await admin.start(); }, { timeout: ADMIN_START_TIMEOUT });
after(async () => { await admin.stop(); }, { timeout: STOP_TIMEOUT });

async function open(browser, { reduced = false } = {}) {
  const ctx = await browser.newContext({ baseURL: admin.base, viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await admin.signIn(ctx);
  const page = await ctx.newPage();
  // WebKit reports a ResizeObserver that delivered in the next frame as an error; the page's scaled
  // scenes measure their stage that way (pages/admin/mockups.js useSize). Anything else counts.
  const errors = []; page.on('pageerror', (e) => { if (!/ResizeObserver loop/.test(e.message)) errors.push(e.message); });
  await page.goto('/admin/mockups', { waitUntil: 'networkidle', timeout: 240000 });
  await page.locator('[data-proto-bar="docs"]').waitFor({ timeout: 60000 });
  return { ctx, page, errors };
}
const frame = (page) => page.locator('section.mk-item', { has: page.locator('[data-proto-bar]') }).locator('.mk-stage, [data-proto-flat]').first();
const screenIs = (page) => frame(page).locator('[data-docs-first]').getAttribute('data-docs-first');
const tap = (page, key) => frame(page).locator(`[data-proto="${key}"]`).first().click();
const bar = (page, key) => page.locator(`[data-proto-bar="${key}"]`).first().click();
const texts = (page, sel) => frame(page).locator(sel).allInnerTexts();
// The copy keeps each last pair of words together with a no break space (lib/typeset.js noWidow).
const text = async (page) => (await frame(page).innerText()).replace(/\u00a0/g, ' ');

async function strip(page, tag) {
  const pills = (await page.locator('.mk-compare .rl-pill').allInnerTexts()).map((t) => t.trim());
  assert.deepEqual(pills, ['8 steps', 'About 5 minutes', '3 steps', 'About 2 minutes'], `${tag}: the comparison strip`);
  assert.deepEqual((await page.locator('.mk-compare .mk-label').allInnerTexts()).map((t) => t.trim().toLowerCase()), ['today', 'documents first']);
}

async function toggle(page, tag) {
  await bar(page, 'today');
  await frame(page).getByText('Step 3 of 8').waitFor({ timeout: 5000 });
  assert.equal(await frame(page).locator('[data-docs-first]').count(), 0, `${tag}: the current form shows`);
  await bar(page, 'docs');
  assert.equal(await screenIs(page), 'landing', `${tag}: documents first shows, from the start`);
}

async function sixScreens(page, tag) {
  // 1. The invite.
  const invite = await text(page);
  assert.match(invite, /88 Harbour St, Unit 2104/); assert.match(invite, /\$2,600 per month/); assert.match(invite, /Goes to Sarah Chen, Royal LePage/);
  assert.match(invite, /Apply in about two minutes\. Start with your documents\./);
  assert.match(invite, /No documents handy\? Type instead\./);
  await tap(page, 'start');
  // 2. The documents.
  assert.equal(await screenIs(page), 'capture');
  assert.equal(await frame(page).locator('[data-proto="continue"]').count(), 0, `${tag}: no Continue before a document is read`);
  assert.equal(await frame(page).locator('[data-proto="bank"]').getAttribute('aria-disabled'), 'true', `${tag}: the bank connection is not available`);
  await tap(page, 'doc-pay');
  await frame(page).locator('[data-proto="doc-pay"][data-state="reading"]').waitFor({ timeout: 2000 });
  assert.match(await frame(page).locator('[data-proto="doc-pay"]').innerText(), /Reading/, `${tag}: Reading, with its rule`);
  assert.equal(await frame(page).locator('[data-proto="doc-pay"] .dfp-rule').count(), 1);
  await frame(page).locator('[data-proto="doc-pay"][data-state="read"]').waitFor({ timeout: 3000 });
  assert.match(await frame(page).locator('[data-proto="doc-pay"]').innerText(), /Read/);
  await frame(page).locator('[data-proto="continue"]').waitFor({ timeout: 1000 });
  await tap(page, 'doc-id'); await tap(page, 'doc-letter');
  await page.waitForFunction(() => document.querySelectorAll('[data-state="read"]').length === 3, null, { timeout: 4000 });
  assert.match(await text(page), /Held 14\sdays\. Seen only by this realtor\. Every open is logged\./);
  await tap(page, 'continue');
  // 3. The facts, filled from the documents.
  assert.equal(await screenIs(page), 'confirm');
  const sources = (await texts(page, '[data-proto^="field-"] .rl-pill')).map((t) => t.trim());
  for (const s of ['from ID', 'from pay stub', 'from letter', 'needs you']) assert.ok(sources.includes(s), `${tag}: ${s} on a fact`);
  assert.equal(sources.filter((s) => s === 'needs you').length, 5, `${tag}: five facts the documents cannot give`);
  assert.match(await text(page), /We read your documents\. You confirm the facts\./);
  for (const [k, v] of [['email', 'priya.nair@fastmail.ca'], ['phone', '416 555 0199'], ['rent', '$2,150 a month'], ['landlord', 'Morgan Lee'], ['ref2', 'Sam Okoro, friend']]) {
    await tap(page, `field-${k}`);
    const input = frame(page).locator(`[data-proto-edit="${k}"] input`);
    await input.waitFor({ timeout: 2000 });
    assert.equal(await input.evaluate((el) => getComputedStyle(el).fontSize), '16px', `${tag}: a 16px field`);
    await input.fill(v);
    await tap(page, 'save');
  }
  assert.ok((await texts(page, '[data-proto="field-landlord"] .rl-pill')).includes('from you'), `${tag}: a typed fact says so`);
  await tap(page, 'looks-right');
  // 4. The review.
  assert.equal(await screenIs(page), 'review');
  const review = (await texts(page, '[data-proto-row] .rl-pill')).map((t) => t.trim());
  assert.equal(review.filter((t) => t === 'docs match').length, 7, `${tag}: docs match on every fact read`);
  assert.equal(review.filter((t) => t === 'stated').length, 5, `${tag}: stated on every fact typed`);
  assert.match(await text(page), /This creates one application for this unit\. Later changes go through your profile page\./);
  await tap(page, 'submit');
  // 5. Done.
  assert.equal(await screenIs(page), 'done');
  assert.match(await text(page), /You’re all set\./);
  assert.equal((await frame(page).locator('[data-proto="standing"]').innerText()).replace(/\s+/g, ' ').trim(), TENANT_LINES[APPLICATION_STATE.SUBMITTED], `${tag}: the tenant's standing line, submitted`);
  assert.equal(await frame(page).locator('[data-docs-first] button').count(), 0, `${tag}: no next action`);
  // 6. The realtor's card, the moment it lands.
  await bar(page, 'realtor');
  assert.equal(await screenIs(page), 'realtor');
  assert.equal((await frame(page).locator('[data-proto="fit-label"]').innerText()).trim().toLowerCase(), 'docs match', `${tag}: docs match from the first second`);
  assert.equal((await frame(page).locator('[data-proto="fit-line"]').innerText()).replace(/\s+/g, ' ').trim(), 'Documented income at 3.7x rent, landlord reference on file', `${tag}: the line, from lib/applicantSynthesis.js`);
  assert.equal(await frame(page).locator('[data-proto="verify"]').count(), 1);
}

async function otherPaths(page, tag) {
  // Skip for now: nothing read, everything typed or not given.
  await bar(page, 'reset');
  assert.equal(await screenIs(page), 'landing', `${tag}: reset returns to the invite`);
  await tap(page, 'start'); await tap(page, 'skip');
  assert.equal(await screenIs(page), 'confirm');
  const pills = (await texts(page, '[data-proto^="field-"] .rl-pill')).map((t) => t.trim());
  assert.ok(pills.length > 0 && pills.every((t) => t === 'needs you'), `${tag}: skipped, every fact needs you`);
  assert.match(await text(page), /Nothing read yet\. Type the facts below\./);
  await tap(page, 'looks-right');
  assert.equal(await frame(page).locator('[data-proto-row] .rl-pill').count(), 0, `${tag}: nothing to call docs match`);
  await tap(page, 'submit');
  assert.match(await text(page), /Add documents any time from your email\./);
  await bar(page, 'realtor');
  assert.equal((await frame(page).locator('[data-proto="fit-label"]').innerText()).trim().toLowerCase(), 'stated');
  assert.match(await text(page), /No documents yet/);
  assert.equal(await frame(page).locator('[data-proto="request-documents"]').count(), 1);
  // Type instead, from the invite.
  await bar(page, 'reset');
  await tap(page, 'type-instead');
  assert.equal(await screenIs(page), 'confirm', `${tag}: type instead goes straight to the facts`);
  await bar(page, 'reset');
  assert.equal(await screenIs(page), 'landing');
}

// At actual size: every target at least 44px tall, "verified" nowhere, on every screen.
async function actualSize(page, tag) {
  await bar(page, 'actual');
  await page.locator('[data-proto-flat]').waitFor();
  const check = async (name) => {
    const r = await page.locator('[data-proto-flat]').evaluate((root) => ({
      small: [...root.querySelectorAll('button, input, [role="button"]')].filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent.trim().slice(0, 30)),
      verified: /\bverified\b/i.test(root.innerText),
    }));
    assert.deepEqual(r.small, [], `${tag} ${name}: every target at least 44px`);
    assert.equal(r.verified, false, `${tag} ${name}: verified never appears`);
  };
  await check('invite'); await tap(page, 'start'); await tap(page, 'doc-id');
  await page.waitForFunction(() => document.querySelectorAll('[data-proto-flat] [data-state="read"]').length === 1, null, { timeout: 4000 });
  await check('documents'); await tap(page, 'continue'); await check('confirm');
  await tap(page, 'field-email'); await check('editing'); await tap(page, 'cancel');
  await tap(page, 'looks-right'); await check('review'); await tap(page, 'submit'); await check('done');
  await bar(page, 'realtor'); await check('realtor');
  await bar(page, 'reset'); await bar(page, 'actual');
}

async function reducedMotion(browser, tag) {
  const { ctx, page } = await open(browser, { reduced: true });
  await tap(page, 'start'); await tap(page, 'doc-pay');
  await frame(page).locator('[data-proto="doc-pay"][data-state="reading"]').waitFor({ timeout: 2000 });
  const moving = await frame(page).locator('[data-proto="doc-pay"]').evaluate((el) => el.getAnimations({ subtree: true }).length);
  assert.equal(moving, 0, `${tag}: nothing moves under reduced motion`);
  await frame(page).locator('[data-proto="doc-pay"][data-state="read"]').waitFor({ timeout: 3000 });
  await ctx.close();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const { ctx, page, errors } = await open(browser);
    await strip(page, tag);
    await toggle(page, tag);
    await sixScreens(page, tag);
    await otherPaths(page, tag);
    await actualSize(page, tag);
    assert.deepEqual(errors, []);
    await ctx.close();
    await reducedMotion(browser, tag);
  } finally { await browser.close(); }
}

test('the documents first prototype in WebKit', { timeout: 900000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
