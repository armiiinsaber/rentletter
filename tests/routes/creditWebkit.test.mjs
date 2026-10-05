// Credit shared by applicant, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an
// iPhone user agent, on the real pages over the fake stack (tests/helpers/fakeNextServer.mjs,
// its own production build on 3163, as the back and edge walks run, so no dev reload ever
// interrupts a step):
//   1. A tenant adds a credit report on their upload step (the credit row's own Add, the file named
//      for the applicant so the fake model reads their name) and submits; the realtor opens the
//      card and sees the Credit row: "credit shared by applicant", the provider and the date on the
//      card, every fact on the checklist, and the held file listed.
//   2. A tenant skips it (an employment letter alone); the realtor's row reads "No credit report
//      shared", in the same tone as any other optional item.
//   3. A report in someone else's name is refused on the step with the plain message, no file is
//      held, nothing is staged, and document_rejected is recorded.
//   4. The realtor of a different listing cannot open a held credit report: 403, no URL.
// Screenshots at 390 to /tmp/credit/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3163; const BASE = process.env.CREDIT_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.CREDIT_BASE) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  walkStep('compiling the pages');
  for (const u of ['/listing/L1', '/listing/L2']) await fetch(`${BASE}${u}`).catch(() => null);
  mkdirSync('/tmp/credit', { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const PDF = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 synthetic walk file ${name} `.repeat(8)) });
async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const json = async (path) => (await fetch(`${BASE}${path}`)).json();
const text = (page, sel) => page.locator(sel).first().evaluate((el) => el.innerText.replace(/\u00a0/g, ' '));
const plain = (s) => String(s).replace(/\u00a0/g, ' '); // noWidow joins the last two words with a no break space
const shot = (page, name) => page.screenshot({ path: `/tmp/credit/${name}.png` });

// The tenant's upload step for one applicant: open it, add the file from the credit row (or the drop
// zone), wait for the row to settle, and submit when asked.
async function uploadStep(page, link, { credit = true, file, viaCreditRow = true, submit = true }) {
  const { token } = await json(`/__fake/docreq?link=${link}&credit=${credit ? 1 : 0}&renew=1`);
  await page.goto(`/upload/${token}`, { waitUntil: 'load', timeout: 120000 });
  await page.getByRole('list', { name: 'Your document set' }).waitFor({ timeout: 60000 });
  if (viaCreditRow) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add your credit report' }).click()]);
    await chooser.setFiles(PDF(file));
  } else {
    await page.locator('input[type=file][multiple]').setInputFiles(PDF(file));
  }
  await page.waitForFunction(() => !/Reading…|Waiting|Analyzing/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  if (!submit) return token;
  await page.getByRole('button', { name: /Review .*& submit/ }).click();
  await page.getByRole('button', { name: /^Submit \d document/ }).click();
  await page.getByText(/Documents received|all set/).first().waitFor({ timeout: 60000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(500); // a dev server reload after an edit never races the next goto
  return token;
}
// The realtor's listing page with one applicant open: the Credit fact on the card and the checklist row.
async function openCard(page, listing, link) {
  await page.goto(`/listing/${listing}`, { waitUntil: 'load', timeout: 120000 });
  const card = page.locator(`#applicant-${link}`);
  await card.waitFor({ timeout: 60000 });
  await card.locator('[role=button][aria-controls$="-body"]').first().click();
  await page.locator(`#checklist-${link}`).waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
  return card;
}

async function walk(type, opts, tag) {
  const browser = await type.launch(opts);
  try {
    const { ctx, page, errors } = await phone(browser);
    // 1. A credit report shared, then seen.
    walkStep('the tenant adds a credit report');
    await uploadStep(page, 'J4', { credit: true, file: 'credit (Applicant D4D4).pdf', submit: false });
    const rows = plain(await page.getByRole('list', { name: 'Your document set' }).innerText());
    assert.match(rows.split('\n')[0], /A credit report/, 'the listing asked: the credit row leads');
    assert.match(rows, /Optional\. Your own report from Equifax, TransUnion, Borrowell or your bank\./);
    assert.match(await text(page, '[data-credit-consent]'), /held for 14 days/, 'the consent sentence');
    assert.match(plain(await page.getByRole('listitem', { name: /A credit report, added/ }).innerText()), /A credit report/, 'the row ticked');
    if (tag === 'wk') await shot(page, 'apply-document-step-390');
    await page.getByRole('button', { name: /Review .*& submit/ }).click();
    await page.getByRole('button', { name: /^Submit \d document/ }).click();
    await page.getByText(/Documents received|all set/).first().waitFor({ timeout: 60000 });
    walkStep('the realtor sees the row');
    const card = await openCard(page, 'L1', 'J4');
    const cardText = plain(await card.innerText());
    assert.match(cardText, /credit shared by applicant/); assert.match(cardText, /Equifax/);
    assert.match(plain(await card.locator('[data-fact="Credit"]').innerText()), /^CREDIT\ncredit shared by applicant\nEquifax, /, 'the card fact: the label, the provider and the date');
    const row = await text(page, '#checklist-J4 [data-credit-row="shared"]');
    assert.match(row, /^credit shared by applicant\n/); assert.match(row, /Score 712 on a 300 to 900 scale/); assert.match(row, /Late payments in the last 24 months: Mar 2025/);
    assert.doesNotMatch(row, /verified|good|poor/i);
    assert.match(cardText, /Credit report/, 'the held file is listed');
    if (tag === 'wk') { await page.locator('#checklist-J4').scrollIntoViewIfNeeded(); await shot(page, 'checklist-row-390'); await card.locator('[data-fact="Credit"]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await shot(page, 'card-row-with-report-390'); }
    const held = await json('/__fake/documents?link=J4');
    assert.deepEqual(held.map((d) => d.kind), ['credit report']);
    // 2. Skipped: an employment letter alone.
    walkStep('the tenant skips it');
    await uploadStep(page, 'J2', { credit: false, file: 'letter (Applicant B2B2).pdf', viaCreditRow: false, submit: true });
    const card2 = await openCard(page, 'L1', 'J2');
    assert.match(plain(await card2.innerText()), /No credit report shared/);
    const none = await text(page, '#checklist-J2 [data-credit-row="none"]');
    assert.equal(none.trim(), 'No credit report shared');
    const tone = await page.locator('#checklist-J2 [data-credit-row="none"]').evaluate((el) => getComputedStyle(el).color);
    const other = await page.locator('#checklist-J2 [data-credit-row]').evaluate((el) => getComputedStyle(el.parentElement.parentElement.previousElementSibling.querySelector('div + div')).color);
    assert.equal(tone, other, 'the same tone as the row above it, never a warning');
    if (tag === 'wk') { await card2.locator('[data-fact="Credit"]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await shot(page, 'card-row-without-report-390'); }
    // 3. Someone else's report is refused.
    walkStep('a mismatched name is refused');
    const before = (await json('/__fake/events?type=document_rejected')).length;
    await uploadStep(page, 'J6', { credit: true, file: 'credit (Someone Else).pdf', submit: false });
    await page.getByText('The name on that credit report does not match your application, so it was not kept.').waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: /Review .*& submit/ }).isDisabled(), true, 'nothing to submit');
    assert.deepEqual(await json('/__fake/documents?link=J6'), [], 'no file held');
    const events = await json('/__fake/events?type=document_rejected');
    assert.equal(events.length, before + 1); assert.equal(events[events.length - 1].payload.reason, 'name');
    // 4. The realtor of a different listing cannot open a held report.
    walkStep('another realtor cannot open it');
    const open = await page.evaluate(async () => { const r = await fetch('/api/documents/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: 'D9' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(open.status, 403); assert.equal(open.body && open.body.url, undefined);
    // The landlord page: send the report for L1, open it, the Credit row for both applicants.
    walkStep('the landlord page');
    const sent = await page.evaluate(async () => { const r = await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const token = sent.body.snapshot && sent.body.snapshot.token;
    assert.ok(token, 'a snapshot token');
    await page.goto(`/r/${token}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-credit-row="shared"]').first().waitFor({ timeout: 60000 });
    const shared = await text(page, '[data-credit-row="shared"]');
    assert.match(shared, /credit shared by applicant/); assert.match(shared, /Score 712 on a 300 to 900 scale/);
    assert.match(await text(page, '[data-credit-row="none"]'), /No credit report shared/);
    if (tag === 'wk') { await page.locator('[data-credit-row="shared"]').first().scrollIntoViewIfNeeded(); await shot(page, 'landlord-report-row-390'); }
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('credit shared by applicant: added and seen, skipped, refused, and not another realtor\'s to open, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
