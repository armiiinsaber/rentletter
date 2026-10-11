// The document checks (lib/documentIntegrity.js) in WebKit (Safari's engine) and in Chrome, at 390
// by 844 with an iPhone user agent, on the real listing page over the fake stack in a production
// build (tests/helpers/fakeNextServer.mjs on 3166):
//   1. The applicant's card carries the check docs pill and the one sentence; Fit reads the same
//      number before and after the finding lands.
//   2. The checklist's Document checks row holds the sentence, View document opens the held page,
//      and Request a new copy asks the tenant through the existing route, in one tap, by email.
//   3. A guarantor: the primary invites them, they send their form and a pay stub whose net is not
//      gross less deductions; the flag shows under the guarantor in People on this application and
//      in the guarantor's checklist row, and Request a new copy emails the guarantor, never the
//      primary. WebKit walks J4, Chrome walks J5, so one server can hold both.
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
const PDF = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 synthetic walk file ${name} `.repeat(8)) });
const NETOFF = /The net pay on the \w+ \d+ stub does not equal gross less deductions \(\$312 apart\)\./;
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

// The guarantor walk: the primary's own page, the guarantor's own page, then the realtor's card.
async function invite(page, link, name, email) {
  const { applicationNumber, ownerToken, email: primaryEmail } = await json(`/__fake/app?link=${link}`);
  await page.goto(`/my-application/${applicationNumber}?token=${ownerToken}`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-parties-card]').waitFor({ timeout: 60000 }); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Add a guarantor' }).click();
  await page.getByLabel('Their full name').fill(name);
  await page.getByLabel('Their email').fill(email);
  await page.getByRole('button', { name: 'Send the invite' }).click();
  await page.locator(`[data-parties-card] li:has-text("${name}")`).waitFor({ timeout: 30000 });
  const mails = await json(`/__fake/mail?to=${encodeURIComponent(email)}`);
  const m = mails.map((x) => String(x.text).match(/\/party\/([A-Z2-9]{32})/)).find(Boolean);
  assert.ok(m, 'the guarantor has their own link');
  return { token: m[1], primaryEmail: String(primaryEmail).toLowerCase() };
}
async function guarantorForm(page, token, name) {
  await page.goto(`/party/${token}`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('#party-step-1').waitFor({ timeout: 60000 });
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Phone').fill('416 555 0199');
  await page.getByLabel('Address').fill('14 Sample Cres, Toronto'); // a guarantor's address, for the lease
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#party-step-2').waitFor({ timeout: 30000 });
  await page.getByLabel('Job title').fill('Clinic Coordinator');
  await page.getByLabel('Employer').fill('Northwind Sample Clinic Inc.');
  await page.getByLabel('Years at job').fill('3');
  await page.getByLabel('Annual income before tax (CAD)').fill('85000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#party-step-3').waitFor({ timeout: 30000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send my form' }).click();
  await page.getByText('Your form is in.').waitFor({ timeout: 60000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(400);
}
// Their own document request, on their own page once the form is in: the stub, then submit.
async function guarantorUploads(page, token, file) {
  await page.goto(`/party/${token}`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type=file][multiple]').waitFor({ state: 'attached', timeout: 60000 });
  await page.locator('input[type=file][multiple]').setInputFiles(PDF(file));
  await page.waitForFunction(() => !/Reading…|Waiting|Analyzing/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Review .*& submit/ }).click();
  await page.getByRole('button', { name: /^Submit \d document/ }).click();
  await page.getByText(/Done\. 1 document\s+added\./).first().waitFor({ timeout: 60000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(500);
}
// The card's Fit as the realtor reads it: the Fit row (the number, the incomplete line or rent share
// unknown), the number's label, and the coverage line.
const fitFace = (page, link) => page.locator(`#applicant-${link}`).evaluate((card) => [card.querySelector('.m-chev')?.parentElement?.textContent, card.querySelector('[data-fit-number]')?.getAttribute('aria-label'), card.querySelector('[data-fit-coverage]')?.textContent].map((x) => String(x || '').replace(/\xa0/g, ' ')).join(' | '));
async function openCard(page, link) {
  await page.goto('/listing/L1', { waitUntil: 'load', timeout: 120000 });
  await header(page, link).waitFor({ timeout: 60000 }); await page.waitForTimeout(400);
  await header(page, link).click();
  await page.locator(`#checklist-${link}`).waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
}

async function guarantorWalk(type, opts, tag) {
  const link = tag === 'wk' ? 'J4' : 'J5';
  const NAME = 'Pat Guarantor'; const EMAIL = tag === 'wk' ? 'pat@example.com' : 'pat.chrome@example.com';
  const browser = await type.launch(opts);
  try {
    const { ctx, page, errors } = await phone(browser);
    // The primary invites the guarantor; the guarantor sends their form; the card's Fit is read.
    walkStep('the primary invites a guarantor');
    const { token, primaryEmail } = await invite(page, link, NAME, EMAIL);
    walkStep('the guarantor sends their form');
    await guarantorForm(page, token, NAME);
    await openCard(page, link);
    const fitBefore = await fitFace(page, link);
    assert.ok(fitBefore.replace(/[ |]/g, ''), 'the card shows its Fit');
    walkStep('the guarantor sends a pay stub');
    await guarantorUploads(page, token, `pay stub netoff (${NAME}).pdf`);
    // 3. The flag under the guarantor, in People on this application, without opening their section.
    walkStep('the flag under the guarantor');
    await openCard(page, link);
    const party = page.locator(`#applicant-${link} [data-parties] [data-party-row="submitted"]`).filter({ hasText: new RegExp(`${NAME}, guarantor, submitted`.replace(/ /g, '\\s+'), 'i') }); // noWidow's no break space is whitespace
    await party.waitFor({ timeout: 30000 });
    assert.equal(await party.locator('button[aria-expanded]').first().getAttribute('aria-expanded'), 'false', 'the guarantor\'s section is closed');
    const under = party.locator('[data-integrity-line]');
    await under.waitFor({ timeout: 30000 });
    const underText = plain(await under.innerText());
    assert.match(underText, /check docs/i); assert.match(underText, NETOFF);
    assert.equal(await page.locator(`#applicant-${link} [data-integrity-line]`).count(), 1, 'the primary carries no line: the flag is the guarantor\'s');
    assert.equal(await fitFace(page, link), fitBefore, 'Fit reads the same with the guarantor\'s finding');
    if (tag === 'wk') { await party.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'guarantor-card-390'); }
    // The guarantor's checklist row: Document checks, View document, Request a new copy.
    walkStep('the guarantor\'s checklist row');
    assert.equal(await page.locator(`#checklist-${link} [data-integrity]`).count(), 0, 'no primary Document checks row');
    const row = page.locator(`#checklist-${link} [data-party-checks]`);
    await row.waitFor({ timeout: 30000 });
    const rowText = plain(await row.innerText());
    assert.match(rowText, /^Document checks/); assert.match(rowText, NETOFF); assert.match(rowText, /View document/); assert.match(rowText, /Request a new copy/);
    const rowOf = plain(await row.evaluate((el) => el.parentElement.innerText));
    assert.match(rowOf, new RegExp(`^Guarantor: ${NAME}`), 'inside the guarantor\'s own row');
    assert.equal(await row.locator('[data-integrity-flag="pay_arithmetic"]').count(), 1);
    const sizes = await row.locator('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    assert.ok(sizes.every((h) => h >= 44), `44px targets: ${sizes.join(', ')}`);
    if (tag === 'wk') { await row.evaluate((el) => el.parentElement.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'guarantor-checklist-390'); }
    await row.getByRole('button', { name: /View the pay stub this came from/ }).click();
    await page.locator('[aria-label$="held document"]').waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    // Request a new copy: to the guarantor's email, once, and never to the primary.
    walkStep('the request goes to the guarantor');
    const toPat = (await json(`/__fake/mail?to=${encodeURIComponent(EMAIL)}`)).length;
    const toPrimary = (await json(`/__fake/mail?to=${encodeURIComponent(primaryEmail)}`)).length;
    await row.getByRole('button', { name: 'Request a new copy' }).click();
    const done = row.locator('[data-integrity-requested]');
    await done.waitFor({ timeout: 30000 });
    const doneText = plain(await done.innerText());
    assert.match(doneText, /New copy requested/); assert.match(doneText, new RegExp(`Emailed to ${NAME}`));
    const patMails = await json(`/__fake/mail?to=${encodeURIComponent(EMAIL)}`);
    assert.equal(patMails.length, toPat + 1, 'the guarantor is emailed once');
    assert.match(patMails.at(-1).subject, /upload your documents/);
    assert.equal((await json(`/__fake/mail?to=${encodeURIComponent(primaryEmail)}`)).length, toPrimary, 'nothing to the primary');
    if (tag === 'wk') { await done.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'guarantor-request-390'); }
    const body = plain(await page.locator('body').innerText());
    assert.ok(!body.includes(EMAIL), 'the guarantor\'s email never reaches the realtor\'s page');
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
test('a guarantor\'s document checks: under the guarantor, in their checklist row, and the request to the guarantor alone, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await guarantorWalk(pw.webkit, {}, 'wk');
});
test('the guarantor walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => guarantorWalk(pw.chromium, { executablePath: chromeBin }, 'cr'));
