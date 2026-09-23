// Reconsider on screen, in WebKit at 390 by 844 with an iPhone user agent and in Chrome, on the
// sandbox (the same components as the product). The listing is rented to Priya Sharma and
// reopened, so her deal fell through and everyone else was told no. Then:
//   the full path: no Reconsider while rented; Reconsider with a reason, the state line, Shortlist,
//     then Mark rented to them succeeds;
//   Undo: the line goes back to Not selected and the Undo goes;
//   the dead end: Mark rented to someone told no says "Reconsider them first." beside the pill,
//     which opens the reason sheet.
// Screenshots go to /tmp/reconsider-{wk|cr}-*.png, and the rendered email to /tmp/reconsider-email.png.
// Skipped when playwright-core or the browser binary is absent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { devServer, BASE } from '../helpers/devServer.mjs';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);
const { reconsiderEmail } = await import('../../lib/reconsiderInvite.js');

const server = devServer(`${BASE}/demo/dashboard`);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: 420000 });
after(() => server.stop(), { timeout: 300000 });
const LISTING = `${BASE}/demo/dashboard?listing=demo-carlaw`;
const warm = () => Promise.all([`${BASE}/demo/dashboard`, LISTING].map((u) => fetch(u).catch(() => null)));

async function session(browserType, launch) {
  await warm();
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(LISTING, { waitUntil: 'networkidle' });
  await p.locator('[role=button][aria-controls]').first().waitFor({ timeout: 30000 });
  return { browser, p };
}
const sheet = (p) => p.locator('[role=alertdialog]');
const header = (p, name) => p.locator('[role=button][aria-controls]').filter({ hasText: name }).first();
const cardOf = (p, name) => p.locator('[id^="applicant-"]').filter({ has: p.locator('[role=button][aria-controls]').filter({ hasText: name }) }).first();
async function details(p) { if (!(await p.getByRole('button', { name: /Mark as rented|Reopen/ }).count())) { await p.getByRole('button', { name: /^Details/ }).first().click(); await p.waitForTimeout(300); } }
async function rentTo(p, name) {
  await details(p);
  await p.getByRole('button', { name: /Mark as rented/ }).first().click();
  await sheet(p).waitFor({ timeout: 10000 });
  await sheet(p).getByText(name, { exact: true }).click();
  await sheet(p).getByRole('button', { name: 'Confirm', exact: true }).click();
  await p.waitForTimeout(1200);
}
// Rented to Priya, then reopened: her deal fell through and everyone else is not selected.
async function rentedThenReopened(p, { whileRented } = {}) {
  await rentTo(p, 'Priya Sharma');
  await p.getByRole('button', { name: /Reopen/ }).first().waitFor({ timeout: 10000 });
  if (whileRented) await whileRented();
  await p.getByRole('button', { name: /Reopen/ }).first().click();
  await p.getByRole('button', { name: /Mark as rented/ }).first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(800);
}
const shot = async (p, tag, name, loc) => { const path = `/tmp/reconsider-${tag}-${name}.png`; if (loc) { await loc.scrollIntoViewIfNeeded(); await loc.screenshot({ path }); } else await p.screenshot({ path }); return path; };

async function fullPath(browserType, launch, tag) {
  const { browser, p } = await session(browserType, launch);
  try {
    await rentedThenReopened(p, { whileRented: async () => {
      await header(p, 'David Kowalski').click(); await p.waitForTimeout(500);
      assert.equal(await cardOf(p, 'David Kowalski').getByRole('button', { name: 'Reconsider', exact: true }).count(), 0, 'no Reconsider while the listing is rented');
      await header(p, 'David Kowalski').click(); await p.waitForTimeout(300);
    } });
    const card = cardOf(p, 'David Kowalski');
    assert.equal(await card.getByText('Not selected', { exact: true }).count(), 1, 'the not selected line');
    await header(p, 'David Kowalski').click(); await p.waitForTimeout(500);
    const pill = card.getByRole('button', { name: 'Reconsider', exact: true });
    await pill.waitFor({ timeout: 10000 });
    const box = await pill.boundingBox(); assert.ok(box.height >= 44, `a 44px target (${box.height})`);
    const bg = await pill.evaluate((b) => getComputedStyle(b).backgroundColor); assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(bg), `a secondary pill, not the red action (${bg})`);
    await shot(p, tag, 'card-before', card);
    await pill.click();
    await sheet(p).waitFor({ timeout: 10000 });
    assert.equal(await sheet(p).getAttribute('aria-label'), 'Why look again?');
    for (const r of ['The first choice fell through', 'The first choice withdrew', 'The listing reopened']) assert.equal(await sheet(p).getByText(r, { exact: true }).count(), 1, r);
    await sheet(p).getByText('The first choice withdrew', { exact: true }).click();
    await shot(p, tag, 'sheet');
    await sheet(p).getByRole('button', { name: 'Reconsider', exact: true }).click();
    await sheet(p).waitFor({ state: 'detached', timeout: 10000 });
    await card.getByText('Reconsidered · the first choice withdrew').waitFor({ timeout: 10000 });
    assert.equal(await card.getByRole('button', { name: 'Undo', exact: true }).count(), 1, 'Undo is offered');
    await shot(p, tag, 'card-after-undo', card);
    assert.equal(await card.getByRole('button', { name: 'Reconsider', exact: true }).count(), 0, 'no Reconsider once reconsidered');
    const shortlist = card.getByRole('button', { name: 'Shortlist', exact: true });
    await shortlist.click(); await p.waitForTimeout(800);
    assert.equal(await card.getByText(/^Reconsidered/).count(), 0, 'shortlisted: the reconsidered line is gone');
    await rentTo(p, 'David Kowalski');
    await p.getByRole('button', { name: /Reopen/ }).first().waitFor({ timeout: 10000 });
    assert.equal(await p.getByText('Reconsider them first.').count(), 0, 'no dead end');
    assert.equal(await p.getByText(/Could not/).count(), 0, 'no error');
  } finally { await browser.close(); }
}

async function undoPath(browserType, launch, tag) {
  const { browser, p } = await session(browserType, launch);
  try {
    await rentedThenReopened(p);
    const card = cardOf(p, 'Wei Chen');
    await header(p, 'Wei Chen').click(); await p.waitForTimeout(500);
    await card.getByRole('button', { name: 'Reconsider', exact: true }).click();
    await sheet(p).getByRole('button', { name: 'Reconsider', exact: true }).click();
    await card.getByText('Reconsidered · the first choice fell through').waitFor({ timeout: 10000 });
    await card.getByRole('button', { name: 'Undo', exact: true }).click();
    await card.getByText('Not selected', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await card.getByRole('button', { name: 'Undo', exact: true }).count(), 0, 'the Undo goes');
    assert.equal(await card.getByRole('button', { name: 'Reconsider', exact: true }).count(), 1, 'Reconsider is back');
    await shot(p, tag, 'card-undone', card);
  } finally { await browser.close(); }
}

async function deadEnd(browserType, launch, tag) {
  const { browser, p } = await session(browserType, launch);
  try {
    await rentedThenReopened(p);
    await rentTo(p, 'Marc Tremblay');
    const line = sheet(p).locator('[role=status]');
    await line.getByText('Reconsider them first.', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await p.getByText(/Could not update the listing|cannot move there/).count(), 0, 'no generic error');
    const lb = await line.getByText('Reconsider them first.').boundingBox(); const pb = await line.getByRole('button', { name: 'Reconsider' }).boundingBox();
    assert.ok(Math.abs((lb.y + lb.height / 2) - (pb.y + pb.height / 2)) <= 4, 'the line and the pill on one row');
    const confirm = await sheet(p).getByRole('button', { name: 'Confirm', exact: true }).boundingBox(); assert.ok(lb.y > confirm.y, 'under the action');
    await shot(p, tag, 'dead-end');
    await line.getByRole('button', { name: 'Reconsider' }).click();
    await p.waitForTimeout(400);
    assert.equal(await sheet(p).getAttribute('aria-label'), 'Why look again?', 'the pill opens the reason sheet');
  } finally { await browser.close(); }
}

const W = { skip: haveWebkit ? false : 'WebKit binary absent (npx playwright install webkit)' };
const C = { skip: haveChrome ? false : 'Chrome binary absent' };
test('reconsider, the full path to accepted, in WebKit at 390 by 844 with an iPhone user agent', W, async () => {
  await fullPath(pw.webkit, {}, 'wk');
  // The email as the applicant sees it.
  const browser = await pw.webkit.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
  const m = reconsiderEmail({ address: '210 Carlaw Ave, Unit 4', realtorName: 'Sarah Chen', applicantName: 'David Kowalski', url: 'https://rentletter.ca/my-application?app=RL-2026-DEMO-0003&token=sample', documentsExpired: true });
  await page.setContent(m.html); await page.screenshot({ path: '/tmp/reconsider-email.png', fullPage: true }); await browser.close();
});
test('the same full path in Chrome', C, () => fullPath(pw.chromium, { executablePath: chromeBin }, 'cr'));
test('reconsider, then Undo, in WebKit', W, () => undoPath(pw.webkit, {}, 'wk'));
test('the same Undo in Chrome', C, () => undoPath(pw.chromium, { executablePath: chromeBin }, 'cr'));
test('the dead end line under Mark rented, in WebKit', W, () => deadEnd(pw.webkit, {}, 'wk'));
test('the same dead end in Chrome', C, () => deadEnd(pw.chromium, { executablePath: chromeBin }, 'cr'));
