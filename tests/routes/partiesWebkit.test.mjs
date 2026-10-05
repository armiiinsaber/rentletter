// Parties on one application, in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an
// iPhone user agent, on the real pages over the fake stack in a production build
// (tests/helpers/fakeNextServer.mjs on 3164):
//   1. The primary, on their own application page, adds a co applicant; the co applicant opens the
//      link from their email, fills their three steps and sends the form; the realtor's card lists
//      them with their role, their standing and their facts, and the checklist gains their row.
//   2. On a listing that accepts a guarantor the primary adds one; on a listing that does not, the
//      guarantor action is absent.
//   3. A party declines from the email; the primary's list says so and offers to invite someone else.
//   4. A party's token opens neither the primary's page nor any document.
//   5. The realtor sees every party; the landlord page lists them.
//   6. Mark rented emails every party once.
// Screenshots at 390 to /tmp/parties/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3164; const BASE = process.env.PARTIES_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.PARTIES_BASE) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  mkdirSync('/tmp/parties', { recursive: true });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const json = async (path, init) => (await fetch(`${BASE}${path}`, init)).json();
const plain = (s) => String(s).replace(/ /g, ' ');
const linkIn = async (to) => { const mails = await json(`/__fake/mail?to=${encodeURIComponent(to)}`); const m = mails.map((x) => String(x.text).match(/\/party\/([A-Z2-9]{32})/)).find(Boolean); return m ? m[1] : null; };
async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `/tmp/parties/${name}.png` });
// The primary's own application page, with a fresh owner token from the fake server.
async function primaryPage(page, link) {
  const { applicationNumber, ownerToken, email } = await json(`/__fake/app?link=${link}`);
  await page.goto(`/my-application/${applicationNumber}?token=${ownerToken}`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-parties-card]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(300);
  return { applicationNumber, ownerToken, email: String(email).toLowerCase() };
}
async function invite(page, button, name, email) {
  await page.getByRole('button', { name: button }).click();
  await page.getByLabel('Their full name').fill(name);
  await page.getByLabel('Their email').fill(email);
  await page.getByRole('button', { name: 'Send the invite' }).click();
  await page.locator(`[data-parties-card] li:has-text("${name}")`).waitFor({ timeout: 30000 });
}
// The party's own page: three steps, then the form is in.
async function partyFills(page, token, { name, address = null }) {
  await page.goto(`/party/${token}`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('#party-step-1').waitFor({ timeout: 60000 });
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Phone').fill('416 555 0199');
  if (address) await page.getByLabel('Address').fill(address);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#party-step-2').waitFor({ timeout: 30000 });
  await page.getByLabel('Job title').fill('Analyst');
  await page.getByLabel('Employer').fill('Northwind Sample Clinic Inc.');
  await page.getByLabel('Years at job').fill('2');
  await page.getByLabel('Annual income before tax (CAD)').fill('64000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#party-step-3').waitFor({ timeout: 30000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send my form' }).click();
  await page.getByText('Your form is in.').waitFor({ timeout: 60000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(400);
}
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
    // 1. The primary (Applicant D4D4 on L1) invites a co applicant and a guarantor.
    walkStep('the primary invites');
    const { applicationNumber, ownerToken, email: primaryEmail } = await primaryPage(page, 'J4');
    assert.equal(await page.getByRole('button', { name: 'Add a guarantor' }).count(), 1, 'L1 accepts a guarantor');
    if (tag === 'wk') await shot(page, 'invite-card-390');
    await invite(page, 'Add a co applicant', 'Jordan Lee', 'jordan@example.com');
    await invite(page, 'Add a guarantor', 'Pat Guarantor', 'pat@example.com');
    const list = plain(await page.locator('[data-parties-card] ul[aria-label="People on this application"]').innerText());
    assert.match(list, /Jordan Lee[\s\S]*Co applicant[\s\S]*Invited/); assert.match(list, /Pat Guarantor[\s\S]*Guarantor[\s\S]*Invited/);
    assert.equal(await page.getByRole('button', { name: 'Add a guarantor' }).count(), 0, 'one guarantor');
    // 2. The co applicant completes their own form.
    walkStep('the co applicant fills their form');
    const jordan = await linkIn('jordan@example.com'); const pat = await linkIn('pat@example.com');
    assert.ok(jordan && pat, 'each party has their own link');
    await page.goto(`/party/${jordan}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('#party-step-1').waitFor({ timeout: 60000 });
    if (tag === 'wk') await shot(page, 'party-form-step-1-390');
    const partyText = plain(await page.locator('body').innerText());
    assert.doesNotMatch(partyText, /64000|\$|RL-2026|owner/i, 'nothing of the primary\'s on the party\'s page');
    await partyFills(page, jordan, { name: 'Jordan Lee' });
    // The guarantor's page says what a guarantor is, then they decline from the email link.
    walkStep('the guarantor declines');
    await page.goto(`/party/${pat}?decline=1`, { waitUntil: 'load', timeout: 120000 });
    await page.getByText('A guarantor agrees to pay the rent if the tenants do not.').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await page.getByText('You declined.').waitFor({ timeout: 30000 });
    const notices = await json(`/__fake/mail?to=${encodeURIComponent(primaryEmail)}`);
    assert.ok(notices.some((m) => /Pat Guarantor declined/.test(m.subject)), 'the primary is told');
    // 4. The party's token opens nothing of the primary's.
    walkStep('a party cannot open the primary');
    const foreign = await page.evaluate(async ([rl, tok]) => { const r = await fetch('/api/application/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationNumber: rl, ownerToken: tok, action: 'view' }) }); return r.status; }, [applicationNumber, jordan]);
    assert.equal(foreign, 401);
    const selfView = await json(`/api/party/self?token=${jordan}`);
    assert.equal(JSON.stringify(selfView).includes(ownerToken), false); assert.equal('docVerifications' in selfView, false);
    // The primary's list after the decline: invite someone else.
    await primaryPage(page, 'J4');
    const after = plain(await page.locator('[data-parties-card]').innerText());
    assert.match(after, /Jordan Lee[\s\S]*Submitted/); assert.match(after, /Pat Guarantor[\s\S]*Declined/);
    assert.equal(await page.getByRole('button', { name: 'Add a guarantor' }).count(), 1, 'the seat is free again');
    // 2b. A listing that does not accept a guarantor (L2, Applicant F6F6): the action is absent.
    walkStep('no guarantor on L2');
    await primaryPage(page, 'J6');
    assert.equal(await page.getByRole('button', { name: 'Add a guarantor' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Add a co applicant' }).count(), 1);
    // 5. The realtor sees every party: the card, the checklist rows.
    walkStep('the realtor sees every party');
    const card = await openCard(page, 'L1', 'J4');
    const cardText = plain(await card.innerText());
    // The section titles are set in capitals by the stylesheet: matched without case.
    assert.match(cardText, /People on this application/i); assert.match(cardText, /Jordan Lee, co applicant, submitted/i); assert.match(cardText, /Pat Guarantor, guarantor, declined/i); assert.match(cardText, /Household income is shown, not scored\./);
    await card.locator('button[aria-controls$="-party-"], button[aria-controls*="party-"]').first().click();
    await page.waitForTimeout(300);
    const opened = plain(await card.locator('[data-party-id]').first().innerText());
    assert.match(opened, /Northwind Sample Clinic Inc\./); assert.match(opened, /\$64,000\/yr\nstated/);
    if (tag === 'wk') { await card.locator('[data-parties]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -100)); await shot(page, 'realtor-card-two-parties-390'); }
    const checklist = plain(await page.locator('#checklist-J4').innerText());
    assert.match(checklist, /Co applicant: Jordan Lee[\s\S]*Said: Northwind Sample Clinic Inc\., Analyst, 2 yrs at job[\s\S]*Called employer/); assert.match(checklist, /Guarantor: Pat Guarantor[\s\S]*Said: declined/);
    if (tag === 'wk') { await page.locator('#checklist-J4').scrollIntoViewIfNeeded(); await page.evaluate(() => { const rows = document.querySelectorAll('#checklist-J4 > div > div'); rows[rows.length - 2].scrollIntoView({ block: 'center' }); }); await shot(page, 'checklist-rows-390'); }
    // The landlord page lists them.
    walkStep('the landlord page');
    const sent = await page.evaluate(async () => { const r = await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    await page.goto(`/r/${sent.body.snapshot.token}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('[data-parties-row]').first().waitFor({ timeout: 60000 });
    const landlord = plain(await page.locator('[data-parties-row]').first().innerText());
    assert.match(landlord, /Jordan Lee, co applicant, submitted/); assert.match(landlord, /Income \$64,000 a year \(Employment\)/); assert.match(landlord, /Household income is shown, not scored\./);
    assert.doesNotMatch(landlord, /jordan@|verified/);
    if (tag === 'wk') { await page.locator('[data-parties-row]').first().scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -100)); await shot(page, 'landlord-report-390'); }
    // 6. Mark rented emails every party once.
    walkStep('mark rented emails every party once');
    const before = (await json('/__fake/mail')).length;
    const rented = await page.evaluate(async () => { const r = await fetch('/api/listings/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1', status: 'rented', rentedLinkId: 'J1' }) }); return { status: r.status, body: await r.json().catch(() => null) }; });
    assert.equal(rented.status, 200, JSON.stringify(rented.body));
    const mails = (await json('/__fake/mail')).slice(before);
    const count = (to) => mails.filter((m) => String(m.to).toLowerCase() === to).length;
    assert.equal(count('jordan@example.com'), 1, 'the co applicant once'); assert.equal(count(primaryEmail), 1, 'the primary once'); assert.equal(count('pat@example.com'), 0, 'a declined guarantor is not written to');
    assert.equal(mails.find((m) => m.to === 'jordan@example.com').subject, mails.find((m) => String(m.to).toLowerCase() === primaryEmail).subject, 'the same email');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('parties: invited, filled, declined, kept apart, seen by the realtor and the landlord, mailed once, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
