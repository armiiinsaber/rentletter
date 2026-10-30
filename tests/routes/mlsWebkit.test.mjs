// The board details and the Form data view (docs/form-data.md), in WebKit (Safari's engine) and in
// Chrome, at 390 by 844 with an iPhone user agent, on the real pages over the fake stack in a
// production build (tests/helpers/fakeNextServer.mjs on 3167):
//   1. New listing: Board details is a collapsed section; opened and filled, the listing is created
//      and its Details fold shows the board rows.
//   2. The profile holds the brokerage address and the board.
//   3. On a listing nobody holds, Form data is absent. The tenant accepted through Mark rented,
//      with a co applicant and a guarantor on the application, Form data is present; Copy all
//      writes the expected text; the guarantor's income appears nowhere; one event is recorded.
//   4. Another realtor's listing answers 403.
// Screenshots at 390 to /tmp/mls/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORT = 3167; const BASE = process.env.MLS_BASE || `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome) || process.env.MLS_BASE) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  mkdirSync('/tmp/mls', { recursive: true });
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
  // The clipboard, read back: what a copy button wrote lands in window.__copied, in both engines.
  await ctx.addInitScript(() => { window.__copied = null; const w = { writeText: async (t) => { window.__copied = t; } }; try { Object.defineProperty(navigator, 'clipboard', { value: w, configurable: true }); } catch (e) { /* the sheet's fallback then runs */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `/tmp/mls/${name}.png` });
const api = (page, path, body) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, [path, body]);

// The board details as the walk types them, and the Copy all text they produce with the fixture's
// listing, its accepted applicant and the seeded parties. WebKit walks L1 (210 Carlaw Ave, Unit 4,
// Marco Rossi, applicant A1 through J1); Chrome walks L2 (88 Harbour St, no landlord on file,
// applicant A6 through J6), so one server holds both runs.
const BOARD = { mls: 'C1234567', address: '8 Sample Ave, Toronto', phone: '416 555 0100', coop: 'Other Realty', commission: 'Half a month’s rent plus HST', possession: '2026-12-01', term: '12', parking: '1', locker: 'B12', lastMonth: '2600', key: '50' };
const RUNS = {
  wk: { listing: 'L1', link: 'J1', landlord: ['Landlord', 'Name: Marco Rossi', 'Email: marco@example.com', ''], tenant: ['Tenant 1 name: Applicant A1A1', 'Tenant 1 email: aA1A1@example.com', 'Tenant 1 phone: 416 555 0111'], address: '210 Carlaw Ave, Unit 4, Toronto', rent: '$2,600', tenantName: 'Applicant A1A1' },
  cr: { listing: 'L2', link: 'J6', landlord: ['Landlord', 'Name: Dana Owner', 'Email: dana@example.com', ''], tenant: ['Tenant 1 name: Applicant F6F6', 'Tenant 1 email: aF6F6@example.com', 'Tenant 1 phone: 416 555 0404'], address: '88 Harbour St, Unit 2104, Toronto', rent: '$3,100', tenantName: 'Applicant F6F6' },
};
const expected = (r) => [
  ...r.landlord,
  'Tenants', ...r.tenant, 'Tenant 1 current address: 1 Old St', 'Tenant 2 name: Jordan Lee', 'Tenant 2 email: jordan@example.com', 'Tenant 2 phone: 416 555 0142', '',
  'Guarantor', 'Name: Pat Guarantor', 'Address: 14 Sample Cres, Toronto', 'Phone: 416 555 0199', '',
  'Premises', 'MLS number: C1234567', `Address: ${r.address}`, 'Parking: 1 space', 'Locker: B12', '',
  'Term', 'Start: December 1, 2026', 'Length: 12 months', '',
  'Rent and deposits', `Monthly rent: ${r.rent}`, 'Last month’s rent deposit: $2,600', 'Key deposit: $50', '',
  'Utilities and inclusions', 'Heat: Included', 'Hydro: Not included', 'Water: Included', 'Furnished: No', '',
  'Brokerages and commission', 'Listing brokerage: Demo Realty', 'Listing brokerage address: 8 Sample Ave, Toronto', 'Listing brokerage phone: 416 555 0100', 'Listing salesperson: Sarah Chen', 'Cooperating brokerage: Other Realty', 'Commission to the cooperating brokerage: Half a month’s rent plus HST',
].join('\n');

// Fill the Board details section of an open setup sheet (New listing or Listing setup).
async function fillBoard(sheet, page) {
  await sheet.getByRole('button', { name: 'Board details (optional)' }).click();
  await sheet.locator('[data-board-details]').waitFor({ timeout: 30000 });
  await sheet.getByLabel('MLS number').fill(BOARD.mls);
  assert.equal(await sheet.getByLabel('Listing brokerage', { exact: true }).inputValue(), 'Demo Realty', 'the brokerage is prefilled from the profile');
  await sheet.getByLabel('Brokerage address').fill(BOARD.address);
  await sheet.getByLabel('Brokerage phone').fill(BOARD.phone);
  await sheet.getByLabel('Cooperating brokerage', { exact: true }).fill(BOARD.coop);
  await sheet.getByLabel('Commission to the cooperating brokerage').fill(BOARD.commission);
  await sheet.getByLabel('Possession date').fill(BOARD.possession);
  await sheet.getByLabel('Lease term (months)').fill(BOARD.term);
  await sheet.getByLabel('Parking spaces').fill(BOARD.parking);
  await sheet.getByLabel('Locker').fill(BOARD.locker);
  await sheet.getByLabel('Furnished').selectOption('no');
  // Three states each: Heat and Water included, Hydro not included, through the selects.
  await sheet.getByLabel('Heat').selectOption('yes'); await sheet.getByLabel('Hydro').selectOption('no'); await sheet.getByLabel('Water').selectOption('yes');
  await sheet.getByLabel('Last month’s rent deposit (CAD)').fill(BOARD.lastMonth);
  await sheet.getByLabel('Key deposit (CAD)').fill(BOARD.key);
  const text = plain(await sheet.locator('[data-board-details]').innerText());
  assert.match(text, /In Ontario only a rent deposit of at most one month/);
  assert.equal(await sheet.getByLabel(/Security deposit/).count(), 0, 'Ontario: no security deposit');
  await page.waitForTimeout(200);
}

async function walk(type, opts, tag) {
  const browser = await type.launch(opts);
  try {
    const { ctx, page, errors } = await phone(browser);
    // 1. New listing with Board details.
    walkStep('a new listing with board details');
    await page.goto('/dashboard', { waitUntil: 'load', timeout: 120000 });
    await page.getByRole('button', { name: /New listing|Add your first listing/ }).first().click();
    const sheet = page.locator('.rl-sh-panel').filter({ hasText: 'New listing' }).first();
    await sheet.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    assert.equal(await sheet.locator('[data-board-details]').count(), 0, 'Board details starts collapsed');
    await sheet.getByPlaceholder('88 Bay Street').fill(`${tag === 'wk' ? '12' : '14'} Board St, Toronto`);
    await sheet.getByPlaceholder('2400').fill('2600');
    await sheet.locator('select').first().selectOption('2');
    await sheet.getByPlaceholder('Pat Owner').fill('Pat Owner');
    await sheet.getByPlaceholder('owner@email.com').fill('owner@example.com');
    await fillBoard(sheet, page);
    if (tag === 'wk') { await sheet.locator('[data-board-details]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(400); await shot(page, 'board-details-390'); }
    // A deposit above the cap blocks the save with the sentence; back within it, the listing is created.
    await sheet.getByLabel('Last month’s rent deposit (CAD)').fill('2601');
    assert.ok(await sheet.getByRole('button', { name: 'Create listing' }).isDisabled(), 'above the cap: no save');
    assert.match(plain(await sheet.innerText()), /At most \$2,600 on this rent\./);
    await sheet.getByLabel('Last month’s rent deposit (CAD)').fill('2600');
    await sheet.getByRole('button', { name: 'Create listing' }).click();
    await page.locator('[role=alertdialog]').getByRole('button', { name: /Confirm & create/ }).click();
    await page.waitForURL(/\/listing\//, { timeout: 60000 }); await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    const rows = plain(await page.locator('[data-board-rows]').innerText());
    for (const line of ['MLS number', 'C1234567', 'Demo Realty, 8 Sample Ave, Toronto, 416 555 0100', 'Other Realty', 'Half a month’s rent plus HST', 'December 1, 2026', '12 months', 'Heat included, Hydro not included, Water included', 'B12', '$2,600', '$50']) assert.ok(rows.includes(line), `the Details fold shows ${line}: ${rows}`);
    // 2. The profile: the brokerage address and the board.
    walkStep('the profile fields');
    await page.goto('/profile', { waitUntil: 'load', timeout: 120000 });
    await page.locator('#profile-field-brokerage_address').waitFor({ timeout: 60000 });
    await page.locator('#profile-field-brokerage_address').fill('8 Sample Ave, Toronto'); await page.locator('#profile-field-brokerage_address').blur();
    await page.locator('#profile-field-board').selectOption('trreb');
    await page.waitForTimeout(900);
    if (tag === 'wk') { await page.locator('#profile-field-board').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(300); await shot(page, 'profile-fields-390'); }
    await page.goto('/profile', { waitUntil: 'load', timeout: 120000 });
    await page.locator('#profile-field-brokerage_address').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#profile-field-brokerage_address').inputValue(), '8 Sample Ave, Toronto', 'saved');
    assert.equal(await page.locator('#profile-field-board').inputValue(), 'trreb');
    // 3. Form data: absent before acceptance.
    walkStep('form data is absent before acceptance');
    const run = RUNS[tag];
    await page.goto(`/listing/${run.listing}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator(`#applicant-${run.link}`).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-form-data-row]').count(), 0, 'no Form data before an applicant is accepted');
    // The board details on L1 through Listing setup, the parties on A1, the tenant accepted.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.locator('.rl-sh-panel').filter({ hasText: 'Listing setup' }).first();
    await edit.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    await fillBoard(edit, page);
    // L2 has no landlord on file; the existing required fields still gate the save.
    if (!(await edit.getByPlaceholder('Pat Owner').inputValue())) { await edit.getByPlaceholder('Pat Owner').fill('Dana Owner'); await edit.getByPlaceholder('owner@email.com').fill('dana@example.com'); }
    await edit.getByRole('button', { name: 'Save changes' }).click();
    const warn = page.locator('[role=alertdialog]').getByRole('button', { name: 'Save changes' });
    if (await warn.count()) await warn.click();
    await edit.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600);
    await json(`/__fake/seed-parties?link=${run.link}`);
    const rented = await api(page, '/api/listings/status', { listingId: run.listing, status: 'rented', rentedLinkId: run.link, notify: false });
    assert.equal(rented.status, 200, JSON.stringify(rented.body));
    walkStep('form data after acceptance');
    await page.goto(`/listing/${run.listing}`, { waitUntil: 'load', timeout: 120000 });
    await page.locator(`#applicant-${run.link}`).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    await page.locator('[data-form-data-row]').waitFor({ timeout: 30000 });
    const opensBefore = (await json('/__fake/events?type=form_data_opened')).length;
    await page.locator('[data-form-data-row]').getByRole('button', { name: 'Form data' }).click();
    const view = page.locator('[data-form-data]');
    await view.locator('[data-form-group="brokerages"]').waitFor({ timeout: 30000 }); await page.waitForTimeout(400);
    const text = plain(await view.innerText());
    for (const group of ['Landlord', 'Tenants', 'Guarantor', 'Premises', 'Term', 'Rent and deposits', 'Utilities and inclusions', 'Brokerages and commission']) assert.ok(text.includes(group), group);
    assert.match(text, /Pat Guarantor/); assert.match(text, /14 Sample Cres, Toronto/); assert.match(text, /Not entered/);
    for (const never of ['85,000', '85000', '64,000', '92,000', 'Northwind', 'Clinic Coordinator', 'Fit', 'credit']) assert.equal(text.includes(never), false, `${never} never appears`);
    const sizes = await view.locator('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    assert.ok(sizes.every((h) => h >= 44), `44px targets: ${sizes.join(', ')}`);
    if (tag === 'wk') await shot(page, 'form-data-390');
    // Copy all: the expected text; a copy on an empty value is disabled; a group copies alone.
    await view.getByRole('button', { name: 'Copy all' }).click();
    const copied = await page.evaluate(() => window.__copied);
    assert.equal(copied, expected(run));
    assert.ok(await view.locator('[data-form-item="landlord_phone"] button').isDisabled(), 'Not entered is skipped');
    await view.getByRole('button', { name: 'Copy group Guarantor' }).click();
    assert.equal(await page.evaluate(() => window.__copied), 'Guarantor\nName: Pat Guarantor\nAddress: 14 Sample Cres, Toronto\nPhone: 416 555 0199');
    await view.locator('[data-form-item="locker"] button').click();
    assert.equal(await page.evaluate(() => window.__copied), 'B12');
    const events = await json('/__fake/events?type=form_data_opened');
    assert.equal(events.length, opensBefore + 1, 'one event per open');
    assert.equal(events.at(-1).payload.tenantName, run.tenantName);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    // 4. Another realtor's listing: 403.
    walkStep('another realtor gets 403');
    const theirs = await api(page, '/api/listings/form-data', { listingId: 'L9' });
    assert.equal(theirs.status, 403, JSON.stringify(theirs.body));
    const body = plain(await page.locator('body').innerText());
    assert.doesNotMatch(body, /owner_token|85,000/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
}

test('board details and form data: the sheet, the profile, absent then present, Copy all, 403, no guarantor income, in WebKit at 390', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'wk');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'cr'));
