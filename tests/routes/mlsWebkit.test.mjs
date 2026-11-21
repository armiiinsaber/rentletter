// The board details and the Form data view (docs/form-data.md), in WebKit (Safari's engine) and in
// Chrome, at 390 by 844 with an iPhone user agent, on the real pages over the fake stack in a
// production build (tests/helpers/fakeNextServer.mjs on 3167):
//   1. New listing: Board details is a collapsed section; opened and filled, the listing is created
//      and its Details fold shows the board rows. Heat, Hydro and Water always show, each Included,
//      Not included or Not entered, as entered, edited to three states and untouched, each lined up
//      as label and value on one line at 390 and at 320. Then long values (a long brokerage name and
//      street address, a long listing address, a two word cooperating brokerage): every row of the
//      Details fold at 390 and 320 has its label on one line and no value line left short or alone.
//   2. The profile holds the brokerage address and the board.
//   3. On a listing nobody holds, Form data is absent. The tenant accepted through Mark rented,
//      with a co applicant and a guarantor on the application, Form data is present; Copy all
//      writes the expected text; the guarantor's income appears nowhere; one event is recorded.
//   4. Another realtor's listing answers 403.
// Screenshots at 390 to /tmp/mls/, the utilities and the long valued Details fold at 390 and 320 too. A WebKit walk fails, never skips, when the binary is missing.
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
// The three utility rows of the listing page's Details fold at 390 and at 320: the exact words; each
// label and its value on one line, side by side; the labels on one left edge and the values on one
// right edge inside the screen; no value wrapping, so no word is left alone on a line. WebKit saves
// each width to /tmp/mls/utilities-<state>-<width>.png.
async function utilitiesAt(page, tag, state, want) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(300);
    await page.locator('[data-board-rows]').evaluate((el) => { const heat = [...el.children].find((r) => r.children[0] && r.children[0].textContent === 'Heat'); (heat || el).scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await page.waitForTimeout(200);
    const rows = await page.locator('[data-board-rows]').evaluate((box) => {
      const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter((q) => q.width > 0); };
      return [...box.children].filter((row) => row.children.length === 2 && ['Heat', 'Hydro', 'Water'].includes(row.children[0].textContent)).map((row) => {
        const [k, v] = row.children; const kl = lines(k); const vl = lines(v);
        return { label: k.textContent, value: v.textContent, labelLines: new Set(kl.map((q) => Math.round(q.top))).size, valueLines: new Set(vl.map((q) => Math.round(q.top))).size, labelTop: kl[0] ? kl[0].top : null, valueTop: vl[0] ? vl[0].top : null, labelLeft: k.getBoundingClientRect().left, valueRight: vl.length ? Math.max(...vl.map((q) => q.right)) : null, rowRight: row.getBoundingClientRect().right, screen: window.innerWidth };
      });
    });
    const at = `${tag}: ${state} utilities at ${width}`;
    assert.deepEqual(rows.map((r) => [r.label, r.value]), want, `${at}: the three rows`);
    for (const r of rows) {
      assert.equal(r.labelLines, 1, `${at}: ${r.label} on one line`);
      assert.equal(r.valueLines, 1, `${at}: ${r.label} reads ${r.value} on one line, no word alone`);
      assert.ok(Math.abs(r.labelTop - r.valueTop) <= 1, `${at}: ${r.label} and its value side by side (${r.labelTop}, ${r.valueTop})`);
      assert.ok(Math.abs(r.valueRight - r.rowRight) <= 1 && r.rowRight <= r.screen, `${at}: ${r.label}'s value on the row's right edge, inside the screen (${r.valueRight}, ${r.rowRight}, ${r.screen})`);
    }
    assert.ok(rows.every((r) => Math.abs(r.labelLeft - rows[0].labelLeft) <= 0.5), `${at}: the labels share one left edge`);
    assert.ok(rows.every((r) => Math.abs(r.valueRight - rows[0].valueRight) <= 0.5), `${at}: the values share one right edge`);
    if (tag === 'wk') await shot(page, `utilities-${state}-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
}
// Every row of the listing page's Details fold at 390 and at 320: the exact words of the rows in want;
// each label on one line, all on one left edge; each value on the row's right edge, every line of it,
// beside its label or on its own lines under it; a value over two lines or more holds two words or
// more on every line, none under 60% of its longest line, and no word is split. Both widths are
// measured (WebKit saves the fold to /tmp/mls/details-long-<width>.png) before anything is asserted.
async function detailsAt(page, tag, want, count) {
  const seen = [];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(300);
    const m = await page.locator('#listing-details').evaluate((fold) => {
      const lines = (el) => {
        const ws = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
        while ((n = walker.nextNode())) { const re = /\S+/g; let x; while ((x = re.exec(n.data))) { const r = document.createRange(); r.setStart(n, x.index); r.setEnd(n, x.index + x[0].length); const q = [...r.getClientRects()].filter((c) => c.width > 0); if (q.length) ws.push({ w: x[0], top: Math.min(...q.map((c) => c.top)), bottom: Math.max(...q.map((c) => c.bottom)), left: Math.min(...q.map((c) => c.left)), right: Math.max(...q.map((c) => c.right)), split: new Set(q.map((c) => Math.round(c.top))).size > 1 }); } }
        const by = [];
        for (const w of ws) { const l = by.find((b) => Math.abs(b.top - w.top) < 2); if (l) { l.words.push(w.w); l.left = Math.min(l.left, w.left); l.right = Math.max(l.right, w.right); l.bottom = Math.max(l.bottom, w.bottom); } else by.push({ top: w.top, bottom: w.bottom, left: w.left, right: w.right, words: [w.w] }); }
        return { lines: by.sort((a, b) => a.top - b.top), split: ws.filter((w) => w.split).map((w) => w.w) };
      };
      const rows = [...fold.querySelectorAll('div')].filter((d) => d.children.length === 2 && [...d.children].every((c) => c.tagName === 'SPAN'));
      return { screen: window.innerWidth, scroll: document.documentElement.scrollWidth, rows: rows.map((row) => { const [k, v] = row.children; const r = row.getBoundingClientRect(); return { label: k.textContent, value: v.textContent, rowRight: r.right, k: lines(k), v: lines(v) }; }) };
    });
    seen.push({ width, ...m });
    if (tag === 'wk') await page.locator('#listing-details').screenshot({ path: `/tmp/mls/details-long-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const labels = new Set(want.map(([k]) => k));
  for (const { width, screen, scroll, rows } of seen) {
    const at = `${tag}: the Details fold at ${width}`;
    assert.equal(rows.length, count, `${at}: ${count} rows`);
    assert.deepEqual(rows.filter((r) => labels.has(r.label)).map((r) => [r.label, r.value]), want, `${at}: the rows`);
    assert.ok(scroll <= screen, `${at}: no sideways scroll (${scroll}, ${screen})`);
    const left = rows[0].k.lines[0].left, right = rows[0].rowRight;
    for (const r of rows) {
      const name = `${at}: ${r.label}`; const k = r.k.lines; const v = r.v.lines;
      assert.equal(k.length, 1, `${name}: the label on one line (${k.map((l) => l.words.join(' ')).join(' / ')})`);
      assert.ok(Math.abs(k[0].left - left) <= 0.5, `${name}: the labels share one left edge (${k[0].left}, ${left})`);
      assert.ok(Math.abs(r.rowRight - right) <= 0.5 && right <= screen, `${name}: the rows share one right edge inside the screen (${r.rowRight}, ${right}, ${screen})`);
      assert.deepEqual(r.v.split, [], `${name}: no word split across two lines`);
      for (const l of v) assert.ok(Math.abs(l.right - r.rowRight) <= 1, `${name}: "${l.words.join(' ')}" on the row's right edge (${l.right}, ${r.rowRight})`);
      if (Math.abs(v[0].top - k[0].top) <= 1) assert.ok(v[0].left > k[0].right, `${name}: the value beside its label, clear of it`);
      else assert.ok(v[0].top >= k[0].bottom - 1, `${name}: the value on its own line under its label (${v[0].top}, ${k[0].bottom})`);
      if (v.length > 1) {
        const widest = Math.max(...v.map((l) => l.right - l.left));
        for (const l of v) {
          assert.ok(l.words.length >= 2, `${name}: "${l.words.join(' ')}" alone on a line (${v.map((x) => x.words.join(' ')).join(' / ')})`);
          assert.ok(l.right - l.left >= 0.6 * widest, `${name}: "${l.words.join(' ')}" short beside the value's other lines (${Math.round(l.right - l.left)} of ${Math.round(widest)}: ${v.map((x) => x.words.join(' ')).join(' / ')})`);
        }
      }
    }
  }
}
const api = (page, path, body) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, [path, body]);

// The board details as the walk types them, and the Copy all text they produce with the fixture's
// listing, its accepted applicant and the seeded parties. WebKit walks L1 (210 Carlaw Ave, Unit 4,
// Marco Rossi, applicant A1 through J1); Chrome walks L2 (88 Harbour St, no landlord on file,
// applicant A6 through J6), so one server holds both runs.
// The long values the Details fold is measured with: invented, as long as real ones run.
const LONG = { address: '1288 Lake Shore Boulevard West, Unit 2104, Toronto', brokerage: 'Harbourview Signature Realty Inc., Brokerage', brokerageAddress: '4789 Yonge Street, Suite 1100, North York', coop: 'Lakeshore Realty' };
const LONG_ROWS = [
  ['Address', LONG.address],
  ['MLS number', 'C1234567'], ['Listing brokerage', `${LONG.brokerage}, ${LONG.brokerageAddress}, 416 555 0100`], ['Cooperating brokerage', LONG.coop], ['Commission', 'Half a month’s rent plus HST'],
  ['Possession', 'December 1, 2026'], ['Lease term', '12 months'], ['Heat', 'Included'], ['Hydro', 'Not entered'], ['Water', 'Not included'],
  ['Parking spaces', '1'], ['Locker', 'B12'], ['Furnished', 'No'], ['Last month’s rent deposit', '$2,600'], ['Key deposit', '$50'],
];
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
  // Everything optional sits behind Add details on a new listing.
  const more = sheet.locator('[data-add-details][aria-expanded="false"]');
  if (await more.count()) await more.click();
  await sheet.getByRole('button', { name: 'Board details (optional)' }).click();
  await sheet.locator('[data-board-details]').waitFor({ timeout: 30000 });
  await sheet.getByLabel('MLS number').fill(BOARD.mls);
  assert.equal(await sheet.getByLabel('Listing brokerage', { exact: true }).inputValue(), 'Demo Realty', 'the brokerage is prefilled from the profile');
  await sheet.getByLabel('Brokerage address').fill(BOARD.address);
  await sheet.getByLabel('Brokerage phone').fill(BOARD.phone);
  await sheet.getByLabel('Cooperating brokerage', { exact: true }).fill(BOARD.coop);
  await sheet.getByLabel('Commission to the cooperating brokerage').fill(BOARD.commission);
  // The possession date is asked with the basics now, as the move in date: set here where those
  // chips are on screen (Listing setup), in its own step on a new listing.
  const move = sheet.locator('[data-chips="lf-move"]');
  if (await move.isVisible()) { await move.locator('[data-chip="__other"]').click(); await sheet.getByLabel('Move in date').fill(BOARD.possession); }
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
    // A phone: three steps. The address; the rent, the bedrooms and the move in date; the landlord.
    await sheet.getByPlaceholder('88 Bay Street').fill(`${tag === 'wk' ? '12' : '14'} Board St, Toronto`);
    await sheet.getByRole('button', { name: 'Continue' }).click();
    await sheet.getByPlaceholder('2400').fill('2600');
    await sheet.locator('[data-chips="lf-beds"] [data-chip="2"]').click();
    await sheet.locator('[data-chips="lf-move"] [data-chip="__other"]').click();
    await sheet.getByLabel('Move in date').fill(BOARD.possession);
    await sheet.getByRole('button', { name: 'Continue' }).click();
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
    // After the save the screen is the apply link; the listing opens from it.
    await page.locator('[data-listing-done] [data-apply-link]').waitFor({ timeout: 60000 });
    await page.locator('[data-listing-done]').getByRole('button', { name: 'Open the listing' }).click();
    await page.waitForURL(/\/listing\//, { timeout: 60000 }); await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    const rows = plain(await page.locator('[data-board-rows]').innerText());
    for (const line of ['MLS number', 'C1234567', 'Demo Realty, 8 Sample Ave, Toronto, 416 555 0100', 'Other Realty', 'Half a month’s rent plus HST', 'December 1, 2026', '12 months', 'B12', '$2,600', '$50']) assert.ok(rows.includes(line), `the Details fold shows ${line}: ${rows}`);
    await utilitiesAt(page, tag, 'set', [['Heat', 'Included'], ['Hydro', 'Not included'], ['Water', 'Included']]);
    // Edited to Hydro not entered and Water not included: the three states side by side.
    walkStep('the utilities in three states');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const again = page.locator('.rl-sh-panel').filter({ hasText: 'Listing setup' }).first();
    await again.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    await again.getByRole('button', { name: 'Board details (optional)' }).click();
    await again.locator('[data-board-details]').waitFor({ timeout: 30000 });
    await again.getByLabel('Hydro').selectOption({ label: 'Not entered' }); await again.getByLabel('Water').selectOption({ label: 'Not included' });
    await again.getByRole('button', { name: 'Save changes' }).click();
    const warned = page.locator('[role=alertdialog]').getByRole('button', { name: 'Save changes' });
    if (await warned.count()) await warned.click();
    await again.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600);
    await page.goto(page.url(), { waitUntil: 'load', timeout: 120000 });
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    await utilitiesAt(page, tag, 'mixed', [['Heat', 'Included'], ['Hydro', 'Not entered'], ['Water', 'Not included']]);
    // Long values through Listing setup: every row of the Details fold at 390 and 320.
    walkStep('the details fold with long values');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const long = page.locator('.rl-sh-panel').filter({ hasText: 'Listing setup' }).first();
    await long.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
    await long.getByPlaceholder('88 Bay Street').fill(LONG.address);
    await long.getByRole('button', { name: 'Board details (optional)' }).click();
    await long.locator('[data-board-details]').waitFor({ timeout: 30000 });
    await long.getByLabel('Listing brokerage', { exact: true }).fill(LONG.brokerage);
    await long.getByLabel('Brokerage address').fill(LONG.brokerageAddress);
    await long.getByLabel('Cooperating brokerage', { exact: true }).fill(LONG.coop);
    await long.getByRole('button', { name: 'Save changes' }).click();
    const longWarn = page.locator('[role=alertdialog]').getByRole('button', { name: 'Save changes' });
    if (await longWarn.count()) await longWarn.click();
    await long.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600);
    await page.goto(page.url(), { waitUntil: 'load', timeout: 120000 });
    await page.getByRole('button', { name: /^Details/ }).click(); await page.waitForTimeout(500);
    await detailsAt(page, tag, LONG_ROWS, 25);
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
    // No utility entered yet: all three read Not entered, never Not included.
    await utilitiesAt(page, tag, 'untouched', [['Heat', 'Not entered'], ['Hydro', 'Not entered'], ['Water', 'Not entered']]);
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
