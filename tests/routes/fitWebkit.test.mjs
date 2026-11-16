// Fit v2 (docs/fit-v2.md) in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an iPhone
// user agent, on the real pages over the fake stack in a production build
// (tests/helpers/fakeNextServer.mjs on 3165):
//   1. The realtor's card: the number with its coverage ("on 3 of 3"), the label, and the Fit
//      section in the expansion with three pillars, each assessed or not, each fact dated.
//   2. The exclusion: an applicant with a stated income and no rental history reads "on 2 of 3",
//      Truth at its lowest level (stated), Conduct not assessed and named as such.
//   3. The checklist carries the same Fit line and coverage.
//   4. The landlord page carries the coverage line and the basis under the number, the not
//      assessed pillar named.
//   5. The listing page's wrapped text at 390 and at 320 (tests/helpers/textLines.mjs): the set aside
//      note, the post kit texts (the link whole on its own line, the words around it balanced), the
//      Fit pillars and the checklist note; no line of one word, none short beside its block's longest.
//      Every post kit link is measured again with the widest code, WWWWWWW, whole inside its block.
// Screenshots at 390 to /tmp/fitv2/; the wrapped text at 390 and 320 in both engines too
// (typeset-<region>-<width>-<engine>.png), and the post kit with the widest code. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { readLines, assertBalanced } from '../helpers/textLines.mjs';

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
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
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

// The four wrapped texts of /listing/L1 with an applicant card and the post kit open, at 390 and at
// 320: a, the set aside note; b, each block of the post kit texts (the words before the link, the
// link, the words after it); c, every line of the Fit pillars; d, the checklist note under its
// eyebrow. Then every post kit link with the widest code the alphabet allows (lib/applicationIds.js),
// WWWWWWW, set in and measured, and the drawn code put back. Both widths are measured, each region
// saved to /tmp/fitv2/typeset-<a|b|c|d>-<width>-<engine>.png, and each widest link width printed,
// before anything is asserted.
const REGIONS = {
  a: (page) => page.locator('p', { hasText: 'Set aside for the screenable reasons' }),
  b: (page) => page.locator('#listing-post-kit [data-kit-text] > *'),
  c: (page) => page.locator('[id^="applicant-"] [data-fit-pillar] > *'),
  d: (page) => page.locator('[id^="checklist-"] > div:first-child > div:nth-child(2)'),
};
const AROUND = { a: (page) => REGIONS.a(page).locator('..'), b: (page) => page.locator('#listing-post-kit'), c: (page) => page.locator('[id^="applicant-"] [data-fit-section]'), d: (page) => page.locator('[id^="checklist-"] > div:first-child') };
// A region at the width under test, clipped from a viewport made tall enough to hold it (the height
// moves no line break); the viewport goes back to 844 after.
async function regionShot(page, loc, path) {
  const { width } = page.viewportSize(); const TALL = 1600;
  await page.setViewportSize({ width, height: TALL }); await page.waitForTimeout(250);
  await loc.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.evaluate(() => window.scrollBy({ top: -24, behavior: 'instant' })); await page.waitForTimeout(250);
  const box = await loc.boundingBox(); const top = Math.max(0, box.y - 12);
  await page.screenshot({ path, clip: { x: 0, y: top, width, height: Math.min(box.height + 24, TALL - top) } });
  await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(250);
}
const ENGINE = { wk: 'webkit', cr: 'chrome' };
const WIDEST = 'WWWWWWW';
async function typesetAt(page, tag) {
  const seen = [];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(400);
    const blocks = {};
    for (const [k, loc] of Object.entries(REGIONS)) blocks[k] = await readLines(loc(page));
    for (const k of Object.keys(AROUND)) await regionShot(page, AROUND[k](page).first(), `/tmp/fitv2/typeset-${k}-${width}-${ENGINE[tag]}.png`);
    const links = page.locator('#listing-post-kit [data-kit-link]');
    const drawn = await links.evaluateAll((els, code) => els.map((el) => { const t = el.textContent; el.textContent = t.replace(/\/a\/\w+/, `/a/${code}`); return t; }), WIDEST);
    const widest = await readLines(links);
    await regionShot(page, AROUND.b(page).first(), `/tmp/fitv2/typeset-b-${WIDEST}-${width}-${ENGINE[tag]}.png`);
    await links.evaluateAll((els, texts) => els.forEach((el, i) => { el.textContent = texts[i]; }), drawn);
    console.log(`  ${tag} at ${width}: ${WIDEST} links ${widest.map((x) => { const w = x.lines[0] ? x.lines[0].right - x.lines[0].left : 0; return `${w.toFixed(1)}px in ${(x.box.right - x.box.left).toFixed(1)}px, ${(x.box.right - (x.lines[0] ? x.lines[0].right : x.box.left)).toFixed(1)}px to spare`; }).join('; ')}`);
    seen.push({ width, blocks, widest });
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  for (const { width, blocks, widest } of seen) {
    const at = `${tag}: at ${width}`;
    assert.equal(blocks.a.length, 1, `${at}: the set aside note`);
    assert.equal(blocks.b.filter((x) => x.data.kitLink !== undefined).length, 4, `${at}: four post kit texts, each with its link`);
    assert.ok(blocks.c.length >= 6, `${at}: an open card's three pillars`); assert.ok(blocks.d.length >= 1, `${at}: an open card's checklist note`);
    assert.ok(blocks.b.filter((x) => x.data.kitLink !== undefined).every((x) => /^https:\/\/rentletter\.ca\/a\/\w+\.?$/.test(x.text)), `${at}: each link block is the short link alone`);
    for (const [k, list] of Object.entries(blocks)) list.forEach((x, i) => assertBalanced(x, `${at}: ${k}${list.length > 1 ? ` ${i + 1}` : ''}`, { link: x.data.kitLink !== undefined }));
    assert.equal(widest.length, 4, `${at}: four links measured with ${WIDEST}`);
    widest.forEach((x, i) => { assert.match(x.text, new RegExp(`^https://rentletter\\.ca/a/${WIDEST}\\.?$`), `${at}: link ${i + 1} carries ${WIDEST}`); assertBalanced(x, `${at}: link ${i + 1} with ${WIDEST}`, { link: true }); });
  }
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
    assert.match(h1, /4\.6/); assert.match(h1, /on 3 of 3/i); assert.match(h1, /verified/i);
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
    assert.doesNotMatch(sectionText, /Identity matches documents/, 'a document adds nothing to a confirmed Truth');
    const titles = plain(await card1.locator('button[aria-controls$="-fit"]').innerText());
    assert.match(titles, /Fit 4\.6 on 3 of 3/i, 'the section title is the Fit line');
    if (tag === 'wk') { await card1.locator('[data-fit-section]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -140)); await shot(page, 'card-expanded-390'); }
    // 3. The checklist carries the same line.
    walkStep('the checklist');
    const checklistFit = plain(await page.locator('#checklist-J1 [data-checklist-fit]').innerText());
    assert.match(checklistFit, /^Fit 4\.6 on 3 of 3/);
    if (tag === 'wk') { await page.locator('#checklist-J1').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'checklist-390'); }
    // 2. The exclusion: Applicant B2B2, stated income and no history, reads on 2 of 3 with Conduct named.
    walkStep('two of three, Conduct not assessed');
    const header2 = page.locator('#applicant-J2 [role=button][aria-controls$="-body"]').first();
    await header2.waitFor({ timeout: 60000 });
    const h2 = plain(await header2.innerText());
    assert.match(h2, /3\.9/); assert.match(h2, /on 2 of 3/i); assert.match(h2, /stated/i);
    assert.doesNotMatch(h2, /not enough to score yet/i, 'Truth is assessed at stated, so Ability is never alone');
    assert.equal(await page.locator('#applicant-J2 [data-fit-number]').count(), 1);
    assert.equal(await page.locator('#applicant-J2 [data-fit-incomplete]').count(), 0);
    assert.match(plain(await page.locator('#applicant-J2 [data-fit-coverage]').innerText()), /^Conduct not assessed: no reference outcome or tenancy yet\./);
    if (tag === 'wk') { await header2.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(200); await shot(page, 'two-of-three-390'); }
    const card2 = await openCard(page, 'J2');
    const section2 = card2.locator('[data-fit-section]'); await section2.waitFor({ timeout: 30000 });
    assert.deepEqual(await section2.locator('[data-fit-pillar]').evaluateAll((els) => els.map((e) => [e.dataset.fitPillar, e.dataset.fitAssessed])), [['ability', 'yes'], ['truth', 'yes'], ['conduct', 'no']]);
    assert.match(plain(await section2.innerText()), /TRUTH\n2\.0\nIncome stated, \w{3} 2026\nEmployer stated, \w{3} 2026/i);
    assert.match(plain(await page.locator('#checklist-J2 [data-checklist-fit]').innerText()), /^Fit 3\.9 on 2 of 3\. Conduct not assessed: no reference outcome or tenancy yet\./);
    // 5. The wrapped text at 390 and 320, the J2 card open, the post kit open with its link.
    walkStep('wrapped text at 390 and 320');
    await page.getByRole('button', { name: /^Post kit/ }).click();
    await page.locator('#listing-post-kit [data-kit-item="Short link"] [data-kit-text]').filter({ hasText: /rentletter\.ca\/a\// }).waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    await typesetAt(page, tag);
    // 4. The landlord page: two lines under the number; the not assessed pillar named.
    walkStep('the landlord page');
    const sent = await page.evaluate(async () => { const r = await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    await page.goto(`/r/${sent.body.snapshot.token}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-fit-line]').first().waitFor({ timeout: 60000 });
    const first = page.locator('section.rl-card').nth(1);
    const firstText = plain(await first.innerText());
    assert.match(firstText, /Applicant A1A1/); assert.match(firstText, /4\.6\s*verified/i);
    assert.match(firstText, /Fit 4\.6 on 3 of 3\nCurrent income confirmed\. Tenancy of 2 years stated\./);
    const b2 = plain(await page.locator('section.rl-card', { hasText: 'Applicant B2B2' }).first().innerText());
    assert.match(b2, /3\.9\s*stated/i); assert.match(b2, /Fit 3\.9 on 2 of 3, Conduct not assessed\nStated income\./);
    if (tag === 'wk') { await first.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -60)); await shot(page, 'landlord-report-390'); }
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('Fit v2: the card, the pillars, the exclusion, the checklist and the landlord page, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
