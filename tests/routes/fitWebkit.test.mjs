// Fit v2 (docs/fit-v2.md) in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone
// user agent, on the real pages over the fake stack in a production build
// (tests/helpers/fakeNextServer.mjs on 3165):
//   1. The realtor's card: the number with its coverage ("on 3 of 3"), the label, and the Fit
//      section in the expansion with three pillars, each assessed or not, each fact dated.
//   2. The guardrail: an applicant with a stated income and nothing else shows "Not enough to score
//      yet" and the one thing that would complete it; no number renders anywhere on that card.
//   3. The checklist carries the same Fit line and coverage.
//   4. The landlord page carries the coverage line and the basis under the number, and the
//      incomplete applicant's state in words.
// Screenshots at 390 to /tmp/fitv2/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3165; const BASE = process.env.FIT_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.FIT_BASE) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  mkdirSync('/tmp/fitv2', { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const plain = (s) => String(s).replace(/\xa0/g, ' ');
async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `/tmp/fitv2/${name}.png` });
async function openCard(page, link) {
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
    // Before any page loads: Applicant B2B2 (J2) keeps a stated income and loses the rental history,
    // so Ability is the only pillar with data (the fake server's /__fake/history).
    const stripped = await fetch(`${BASE}/__fake/history?link=J2&clear=1`).then((r) => r.json());
    assert.equal(stripped.prev_landlord_name, null);
    // 1. The card: the number with its coverage, the Fit section in the expansion.
    walkStep('the card with the number and the pillars');
    await page.goto('/listing/L1', { waitUntil: 'load', timeout: 120000 });
    const header1 = page.locator('#applicant-J1 [role=button][aria-controls$="-body"]').first();
    await header1.waitFor({ timeout: 60000 }); await page.waitForTimeout(600);
    const h1 = plain(await header1.innerText());
    assert.match(h1, /4\.5/); assert.match(h1, /on 3 of 3/i); assert.match(h1, /verified/i);
    assert.equal(await page.locator('#applicant-J1 [data-fit-number]').count(), 1);
    const card1 = await openCard(page, 'J1');
    const section = card1.locator('[data-fit-section]');
    await section.waitFor({ timeout: 30000 });
    assert.equal(await section.locator('[data-fit-pillar]').count(), 3, 'three pillars');
    assert.deepEqual(await section.locator('[data-fit-pillar]').evaluateAll((els) => els.map((e) => [e.dataset.fitPillar, e.dataset.fitAssessed])), [['ability', 'yes'], ['truth', 'yes'], ['conduct', 'yes']]);
    const sectionText = plain(await section.innerText());
    assert.match(sectionText, /Current income confirmed\. Tenancy of 2 years stated\./, 'the basis line from named facts');
    assert.match(sectionText, /Income confirmed by you, \w{3} 2026/, 'a dated fact');
    assert.match(sectionText, /Tenancy of 2 years stated, \w{3} 2026/);
    const titles = plain(await card1.locator('button[aria-controls$="-fit"]').innerText());
    assert.match(titles, /Fit 4\.5 on 3 of 3/i, 'the section title is the Fit line');
    if (tag === 'wk') { await card1.locator('[data-fit-section]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -140)); await shot(page, 'card-expanded-390'); }
    // 3. The checklist carries the same line.
    walkStep('the checklist');
    const checklistFit = plain(await page.locator('#checklist-J1 [data-checklist-fit]').innerText());
    assert.match(checklistFit, /^Fit 4\.5 on 3 of 3/);
    if (tag === 'wk') { await page.locator('#checklist-J1').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'checklist-390'); }
    // 2. The guardrail: Applicant B2B2 shows no number at all.
    walkStep('not enough to score yet');
    const header2 = page.locator('#applicant-J2 [role=button][aria-controls$="-body"]').first();
    await header2.waitFor({ timeout: 60000 });
    const h2 = plain(await header2.innerText());
    assert.match(h2, /not enough to score yet/i);
    assert.doesNotMatch(h2, /\d\.\d/, 'no number in the header');
    assert.equal(await page.locator('#applicant-J2 [data-fit-number]').count(), 0, 'the number never renders');
    assert.equal(await page.locator('#applicant-J2 [data-fit-incomplete]').count(), 1);
    assert.match(plain(await page.locator('#applicant-J2 [data-fit-coverage]').innerText()), /^Documents or a confirmation would complete it, or a landlord reference\./);
    if (tag === 'wk') { await header2.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(200); await shot(page, 'not-enough-to-score-390'); }
    const card2 = await openCard(page, 'J2');
    const section2 = card2.locator('[data-fit-section]'); await section2.waitFor({ timeout: 30000 });
    assert.deepEqual(await section2.locator('[data-fit-pillar]').evaluateAll((els) => els.map((e) => [e.dataset.fitPillar, e.dataset.fitAssessed])), [['ability', 'yes'], ['truth', 'no'], ['conduct', 'no']]);
    assert.equal(await card2.locator('[data-fit-number]').count(), 0);
    assert.match(plain(await page.locator('#checklist-J2 [data-checklist-fit]').innerText()), /^Not enough to score yet\. Documents or a confirmation/);
    // 4. The landlord page: two lines under the number; the incomplete one in words.
    walkStep('the landlord page');
    const sent = await page.evaluate(async () => { const r = await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    await page.goto(`/r/${sent.body.snapshot.token}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-fit-line]').first().waitFor({ timeout: 60000 });
    const first = page.locator('section.rl-card').nth(1);
    const firstText = plain(await first.innerText());
    assert.match(firstText, /Applicant A1A1/); assert.match(firstText, /4\.5\s*verified/i);
    assert.match(firstText, /Fit 4\.5 on 3 of 3\nCurrent income confirmed\. Tenancy of 2 years stated\./);
    const bodyText = plain(await page.locator('body').innerText());
    assert.match(bodyText, /Applicant B2B2[\s\S]*Not enough to score yet/i);
    const b2 = page.locator('section.rl-card', { hasText: 'Applicant B2B2' }).first();
    assert.doesNotMatch(plain(await b2.locator('div').first().innerText()), /\d\.\d/, 'no number for the incomplete applicant');
    if (tag === 'wk') { await first.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -60)); await shot(page, 'landlord-report-390'); }
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('Fit v2: the card, the pillars, the guardrail, the checklist and the landlord page, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
