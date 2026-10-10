// The document checks (lib/documentIntegrity.js) in WebKit (Safari's engine) and in Chrome, at 390
// by 844 with an iPhone user agent, on the real listing page over the fake stack in a production
// build (tests/helpers/fakeNextServer.mjs on 3166):
//   1. The applicant's card carries the check docs pill and the one sentence; Fit reads the same
//      number before and after the finding lands.
//   2. The checklist's Document checks row holds the sentence, View document opens the held page,
//      and Request a new copy asks the tenant through the existing route, in one tap, by email.
// Screenshots at 390 to /tmp/integrity/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3166; const BASE = process.env.INTEGRITY_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const SENTENCE = 'The net pay on the September 18 stub does not equal gross less deductions ($312 apart).';
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.INTEGRITY_BASE) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  mkdirSync('/tmp/integrity', { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const plain = (s) => String(s).replace(/\xa0/g, ' ');
const json = async (path) => (await fetch(`${BASE}${path}`)).json();
async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `/tmp/integrity/${name}.png` });
const header = (page, link) => page.locator(`#applicant-${link} [role=button][aria-controls$="-body"]`).first();

async function walk(type, opts, tag) {
  const browser = await type.launch(opts);
  try {
    const { ctx, page, errors } = await phone(browser);
    // The card before the finding: its Fit line, to compare after.
    walkStep('the card before the finding');
    await page.goto('/listing/L1', { waitUntil: 'load', timeout: 120000 });
    await header(page, 'J1').waitFor({ timeout: 60000 }); await page.waitForTimeout(500);
    const fitBefore = plain(await page.locator('#applicant-J1 [data-fit-number]').first().getAttribute('aria-label'));
    assert.equal(await page.locator('#applicant-J1 [data-integrity-line]').count(), 0);
    // 1. The finding lands; the card shows the pill and the sentence, and the same Fit.
    walkStep('the card with one finding');
    const { documentId } = await json('/__fake/integrity?link=J1');
    assert.ok(documentId);
    await page.goto('/listing/L1', { waitUntil: 'load', timeout: 120000 });
    await header(page, 'J1').waitFor({ timeout: 60000 }); await page.waitForTimeout(500);
    const line = page.locator('#applicant-J1 [data-integrity-line]');
    await line.waitFor({ timeout: 30000 });
    const lineText = plain(await line.innerText());
    assert.match(lineText, /check docs/i); assert.ok(lineText.includes(SENTENCE), lineText);
    assert.equal(plain(await page.locator('#applicant-J1 [data-fit-number]').first().getAttribute('aria-label')), fitBefore, 'Fit reads the same number with the finding');
    if (tag === 'wk') { await header(page, 'J1').evaluate((el) => el.closest('[id^="applicant-"]').scrollIntoView({ block: 'start', behavior: 'instant' })); await page.evaluate(() => window.scrollBy({ top: -70, behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'card-with-flag-390'); }
    // 2. The checklist row: the sentence, View document, Request a new copy.
    walkStep('the checklist row');
    await header(page, 'J1').click();
    await page.locator('#checklist-J1').waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    const row = page.locator('#checklist-J1 [data-integrity]');
    await row.waitFor({ timeout: 30000 });
    const rowText = plain(await row.innerText());
    assert.ok(rowText.includes(SENTENCE)); assert.match(rowText, /View document/); assert.match(rowText, /Request a new copy/);
    assert.equal(await row.locator('[data-integrity-flag="pay_arithmetic"]').count(), 1);
    const sizes = await row.locator('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    assert.ok(sizes.every((h) => h >= 44), `44px targets: ${sizes.join(', ')}`);
    if (tag === 'wk') { await row.evaluate((el) => el.closest('#checklist-J1 > div > div').scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'checklist-row-390'); }
    // View document opens the page the finding came from.
    await row.getByRole('button', { name: /View the pay stub this came from/ }).click();
    await page.locator('[aria-label$="held document"]').waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    // Request a new copy: the existing route, renewed and emailed, in one tap.
    walkStep('the replacement request');
    const before = (await json('/__fake/mail?to=aA1A1@example.com')).length;
    await row.getByRole('button', { name: 'Request a new copy' }).click();
    const done = page.locator('#checklist-J1 [data-integrity-requested]');
    await done.waitFor({ timeout: 30000 });
    assert.match(plain(await done.innerText()), /New copy requested/);
    const mails = await json('/__fake/mail?to=aA1A1@example.com');
    assert.equal(mails.length, before + 1, 'the tenant is emailed once');
    assert.match(mails.at(-1).subject, /upload your documents/);
    if (tag === 'wk') { await done.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'replacement-request-390'); }
    const body = plain(await page.locator('body').innerText());
    assert.doesNotMatch(body, /\b(fraud|fake|forged|tampered|suspicious)\b/i);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('document checks: the card, the checklist row, View document and Request a new copy, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
