// The Commitment section of the founder office and the commitment poster, in WebKit (Safari's
// engine) and in Chrome, on the real pages over the fake stack in a production build
// (tests/helpers/fakeNextServer.mjs on 3179), behind the office's one gate (a password made up for
// this run, the real login route).
//   1. The gate: with no session the poster sends the visitor to the office's sign in and back, and
//      the numbers answer 401.
//   2. The section is the first thing in the office, above everything that was there. The trigger
//      sentence, word for word. Six tiles. Before db/013 has run the numbers are counted live and
//      the section says the history starts once the table exists.
//   3. With something to count (GET /__fake/kpi?seed=1): each tile's value, target, this month to
//      date and last complete month; days left a plain number; the chart drawn from kpi_daily; the
//      poster preview opens the poster.
//   4. At 1280, 390 and 320 every block of text in the section holds one line or wraps balanced,
//      with no lone word (tests/helpers/textLines.mjs), and the page is no wider than the screen.
//   5. The poster: the drawn wordmark first in the top row, 13px tall, its letters on the date's
//      baseline, in its 44px link home; every word exactly; the sheet 816 by 1056 with 72px of padding; the two fonts
//      loaded and set as specified; every gap as specified; every block balanced; at 390 and 320
//      the sheet is smaller and the same lines hold the same words (nothing reflows); the two
//      buttons, and Save as PDF calls window.print.
//   6. Chrome only: page.pdf at Letter size is exactly one page, 612 by 792 points, with every word
//      on it, the wordmark drawn (its red bar, its link) and not set as text, and nothing outside
//      the sheet in print. Saved to /tmp/office/commitment-poster.pdf,
//      with a PNG of the printed sheet beside it.
// Screenshots to /tmp/office/<engine>/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { readLines, assertBalanced, MARK_BLOCKS, pageProblems } from '../helpers/textLines.mjs';
import { WIDER_THAN_VIEWPORT } from '../helpers/screens.mjs';
import { TRIGGER_SENTENCE, monthName, monthOf, addMonths, daysLeft } from '../../lib/kpis.js';
import { LOGO } from '../../lib/brand/logoPaths.js';

const PORT = 3179; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = '/tmp/office';
const PASSWORD = randomBytes(18).toString('hex'); // made up for this run, known only to this process
let fake = null; let turn = false; let session = null;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: `.next-fake-${PORT}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build exited ${code}`)))); });
  walkStep('starting the fake stack server');
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: PASSWORD }, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

const json = async (path) => (await fetch(`${BASE}${path}`)).json();
const plain = (s) => String(s).replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
// The office's own sign in, once a run (the route allows five in fifteen minutes): the session
// cookie it sets, handed to each browser context for this origin.
async function signIn(ctx) {
  if (!session) {
    const r = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
    assert.equal(r.status, 200, 'the office sign in accepts this run\'s password');
    const m = /rl_admin=([^;]+)/.exec(r.headers.get('set-cookie') || '');
    assert.ok(m, 'the sign in sets the session cookie');
    assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
    session = decodeURIComponent(m[1]);
  }
  await ctx.addCookies([{ name: 'rl_admin', value: session, url: BASE, httpOnly: true, sameSite: 'Strict' }]);
}
const settle = async (page) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(450); };
// Every block of text under root, measured word by word; the rule asserted on each.
async function balancedUnder(page, root, where) {
  await page.evaluate(MARK_BLOCKS);
  const blocks = await readLines(page.locator(`${root} [data-tl-block], ${root}[data-tl-block]`), { own: true });
  assert.ok(blocks.length >= 6, `${where}: the blocks of text are found (${blocks.length})`);
  const problems = pageProblems({ blocks, wide: await page.evaluate(WIDER_THAN_VIEWPORT) });
  assert.deepEqual(problems, [], `${where}: every block holds one line or wraps balanced, and the page is no wider than the screen`);
  return blocks;
}
const tile = (page, key) => page.locator(`[data-tile="${key}"]`).evaluate((el) => ({
  label: el.querySelector('.cm-tile-l').textContent, value: el.querySelector('.cm-tile-v').textContent, target: (el.querySelector('.cm-tile-t') || {}).textContent || null, note: (el.querySelector('.cm-tile-n') || {}).textContent || null,
  pairs: [...el.querySelectorAll('.cm-pair')].map((p) => [p.querySelector('.cm-pair-l').textContent, p.querySelector('.cm-pair-v').textContent]),
}));

const POSTER_WORDS = [
  ['.po-top .po-caps:nth-child(2)', 'Toronto, November 17, 2026'],
  ['.po-when', 'When for three months in a row'],
  ['.po-cell:nth-child(1) .po-n', '30'], ['.po-cell:nth-child(1) .po-label', 'realtors use it every month'],
  ['.po-cell:nth-child(2) .po-n', '50'], ['.po-cell:nth-child(2) .po-label', 'rentals close through it every month'],
  ['.po-cell:nth-child(3) .po-n', '100'], ['.po-cell:nth-child(3) .po-label', 'tenants have reused their profile'],
  ['.po-cell:nth-child(4) .po-n', '1/3'], ['.po-cell:nth-child(4) .po-label', 'of new realtors arrive by referral'],
  ['.po-then', 'I go full time and raise.'],
  ['.po-with', 'With 12 months of runway saved or a pre-seed round committed.'],
  ['.po-ifnot', 'If not by November 17, 2027, I decide again on purpose.'],
  ['.po-name', 'Armin Saber'],
];
// The sheet as laid out at full size (the walk measures it at 1280, where nothing is scaled).
const POSTER_GEOMETRY = () => {
  const sheet = document.querySelector('[data-poster]');
  const cs = (sel) => { const el = sheet.querySelector(sel); const s = getComputedStyle(el); return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, stretch: s.fontStretch, lineHeight: s.lineHeight, color: s.color, spacing: s.letterSpacing, transform: s.textTransform, maxWidth: s.maxWidth, wrap: s.textWrap || s.getPropertyValue('text-wrap') || s.getPropertyValue('text-wrap-style') }; };
  const origin = sheet.getBoundingClientRect(); const r2 = (n) => Math.round(n * 100) / 100;
  const box = (sel) => { const q = sheet.querySelector(sel).getBoundingClientRect(); return { top: r2(q.top - origin.top), left: r2(q.left - origin.left), width: r2(q.width), height: r2(q.height), bottom: r2(q.bottom - origin.top) }; };
  const s = getComputedStyle(sheet); const grid = getComputedStyle(sheet.querySelector('.po-grid'));
  return {
    sheet: { width: sheet.offsetWidth, height: sheet.offsetHeight, padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], background: s.backgroundColor, color: s.color, scrollHeight: sheet.scrollHeight, scrollWidth: sheet.scrollWidth },
    grid: { columnGap: grid.columnGap, rowGap: grid.rowGap, columns: grid.gridTemplateColumns.split(' ').length },
    top: box('.po-top'), rule2: box('.po-rule-2'), rule2Style: getComputedStyle(sheet.querySelector('.po-rule-2')).borderTop, when: box('.po-when'), gridBox: box('.po-grid'), then: box('.po-then'), withBox: box('.po-with'),
    footRule: box('footer > .po-rule-1'), footRuleStyle: getComputedStyle(sheet.querySelector('footer > .po-rule-1')).borderTop, foot: box('.po-foot'), ifnot: box('.po-ifnot'), sign: box('.po-sign'), signRule: box('.po-sign .po-rule-1'), name: box('.po-name'),
    n: box('.po-cell:nth-child(1) .po-n'), label: box('.po-cell:nth-child(1) .po-label'), footer: box('footer'),
    fonts: { capsQuiet: cs('.po-top .po-caps:nth-child(2)'), when: cs('.po-when'), n: cs('.po-n'), label: cs('.po-label'), then: cs('.po-then'), with: cs('.po-with'), ifnot: cs('.po-ifnot'), name: cs('.po-name') },
    loaded: { archivo: document.fonts.check('800 132px Archivo') && [...document.fonts].some((f) => /Archivo/.test(f.family) && f.status === 'loaded'), newsreader: [...document.fonts].some((f) => /Newsreader/.test(f.family) && f.status === 'loaded') },
    blocksWithBalance: [...sheet.querySelectorAll('.po-caps, .po-when, .po-n, .po-label, .po-then, .po-with, .po-ifnot')].every((el) => { const st = getComputedStyle(el); return /balance/.test(st.textWrap || st.getPropertyValue('text-wrap') || st.getPropertyValue('text-wrap-style') || ''); }),
  };
};
// The top row's first item: the drawn wordmark (components/ui.js Wordmark) in its link home. Where
// its letters' baseline falls (LOGO.baseline of LOGO.h down the mark) against the date's own
// baseline (a zero size inline block at the end of the date's text sits on it), and its 44px target.
const POSTER_MARK = ({ baseline, h }) => {
  const sheet = document.querySelector('[data-poster]'); const origin = sheet.getBoundingClientRect(); const r2 = (n) => Math.round(n * 1000) / 1000;
  const row = sheet.querySelector('.po-top'); const a = row.firstElementChild; const svg = a && a.querySelector('svg.rl-wordmark');
  if (!svg) return { tag: a && a.tagName, svg: false };
  const q = svg.getBoundingClientRect(); const l = a.getBoundingClientRect(); const date = row.querySelector('.po-caps:nth-child(2)');
  const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; date.appendChild(probe);
  const dateBaseline = probe.getBoundingClientRect().bottom - origin.top; probe.remove();
  const cx = l.left + l.width / 2; const cy = l.top + l.height / 2; const inLink = (dy) => { const el = document.elementFromPoint(cx, cy + dy); return !!el && a.contains(el); };
  return {
    tag: a.tagName, svg: true, className: ['rl-mark', 'po-mark'].filter((c) => a.classList.contains(c)).join(' '), href: a.getAttribute('href'), label: a.getAttribute('aria-label'), role: svg.getAttribute('role'), name: svg.getAttribute('aria-label'), text: a.textContent,
    height: r2(q.height), left: r2(q.left - origin.left), top: r2(q.top - origin.top), lettersBaseline: r2(q.top - origin.top + (baseline / h) * q.height), dateBaseline: r2(dateBaseline),
    rowHeight: r2(row.getBoundingClientRect().height), dateHeight: r2(date.getBoundingClientRect().height),
    letters: getComputedStyle(svg.querySelector('path')).fill, bar: getComputedStyle(svg.querySelector('rect')).fill, target: [inLink(-21.5), inLink(0), inLink(21.5)],
  };
};
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const px = (v) => Math.round(parseFloat(v) * 100) / 100;

async function walk(type, opts, engine) {
  walkStep(`the office and the poster in ${engine}`);
  mkdirSync(`${OUT}/${engine}`, { recursive: true });
  const browser = await type.launch(opts);
  try {
    // 1. The gate.
    const out = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const stranger = await out.newPage();
    await stranger.goto('/admin/commitment', { waitUntil: 'load' });
    assert.equal(new URL(stranger.url()).pathname + new URL(stranger.url()).search, '/admin?next=/admin/commitment', 'with no session the poster goes to the office sign in');
    assert.equal(await stranger.locator('[data-poster]').count(), 0); assert.equal(await stranger.locator('[data-commitment]').count(), 0, 'and the section is not sent to a stranger');
    await stranger.getByLabel('Password').waitFor({ timeout: 15000 });
    assert.equal((await fetch(`${BASE}/api/admin/commitment`)).status, 401, 'the numbers answer 401 without the session');
    await out.close();

    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route(/supabase\.co\//, (r) => r.abort());
    await ctx.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await signIn(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));

    // 2. Before db/013: first in the office, the sentence, six tiles, counted live.
    await json('/__fake/kpi?history=0');
    await page.goto('/admin', { waitUntil: 'load' }); await page.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await settle(page);
    const first = await page.evaluate(() => { const wrap = document.querySelector('.ad-wrap'); const kids = [...wrap.children].filter((e) => e.tagName !== 'STYLE'); return { first: kids[0].getAttribute('aria-label'), next: kids[1].classList.contains('ad-head') ? 'ad-head' : kids[1].className, realtorsBelow: !!wrap.querySelector('[data-commitment] ~ .ad-head'), table: !!wrap.querySelector('.ad-table-card, .ad-list') }; });
    assert.deepEqual(first, { first: 'Commitment', next: 'ad-head', realtorsBelow: true, table: true }, 'the section is first; the realtors heading and list sit below it, as before');
    assert.equal(await page.locator('.cm-trigger').textContent(), TRIGGER_SENTENCE, 'the trigger sentence, exactly');
    assert.equal(await page.locator('[data-tile]').count(), 6, 'six tiles');
    assert.deepEqual(await page.locator('[data-tile]').evaluateAll((els) => els.map((e) => e.dataset.tile)), ['realtors', 'rentals', 'streak', 'reuse', 'referral', 'days']);
    assert.equal(plain(await page.locator('.cm-note').textContent()), 'The numbers above are counted live. The history starts once the kpi_daily table exists (db/013).');
    assert.equal(await page.locator('.cm-svg').count(), 0, 'no chart is drawn without the table');
    const now = Date.now(); const month = monthName(monthOf(now)); const last = monthName(addMonths(monthOf(now), -1));
    assert.equal(plain((await tile(page, 'realtors')).value), '0', 'the fixture\'s realtors are test accounts: counted out');
    assert.equal(plain((await tile(page, 'days')).value), String(daysLeft(now)));
    await balancedUnder(page, '[data-commitment]', `${engine}, before db/013, 1280`);

    // 3. Something to count, and the table.
    assert.deepEqual(await json('/__fake/kpi?seed=1'), { seeded: true, history: 13 });
    await page.reload({ waitUntil: 'load' }); await page.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await page.locator('.cm-svg').waitFor({ timeout: 15000 }); await settle(page);
    const t = Object.fromEntries(await Promise.all(['realtors', 'rentals', 'streak', 'reuse', 'referral', 'days'].map(async (k) => { const v = await tile(page, k); return [k, { ...v, label: plain(v.label), value: plain(v.value), target: v.target && plain(v.target), note: v.note && plain(v.note), pairs: v.pairs.map((p) => p.map(plain)) }]; })));
    assert.deepEqual(t.realtors, { label: 'Active realtors', value: '12', target: 'Target 30', note: null, pairs: [[`${month} to date`, '12'], [last, '34']] });
    assert.deepEqual(t.rentals, { label: 'Rentals closed', value: '9', target: 'Target 50', note: null, pairs: [[`${month} to date`, '9'], [last, '52']] }, 'ten confirmed this month, one fell through');
    assert.deepEqual(t.streak, { label: 'Streak', value: '1 month', target: 'Target 3 months', note: null, pairs: [[month, 'in progress'], [last, 'met']] }, 'last month met both targets; this month is in progress and not counted');
    assert.deepEqual(t.reuse, { label: 'Profile reuse', value: '34', target: 'Target 100', note: 'applied twice (reuse not yet tracked)', pairs: [] });
    assert.deepEqual(t.referral, { label: 'Referral share', value: '50%', target: 'Target one third', note: null, pairs: [[`${month} to date`, '3 of 6'], [last, '—']] });
    assert.deepEqual(t.days, { label: 'Days left', value: String(daysLeft(now)), target: null, note: null, pairs: [] }, 'days left is a plain number');
    assert.equal(await page.locator('.cm-note').count(), 0, 'with the table the note is gone');
    const chart = await page.locator('.cm-chart').evaluate((el) => ({ lines: el.querySelectorAll('polyline').length, targets: el.querySelectorAll('line[stroke-dasharray]').length, months: el.querySelectorAll('.cm-month').length, legend: [...el.querySelectorAll('.cm-key')].map((k) => k.textContent.replace(/\xa0/g, ' ')), label: el.querySelector('svg').getAttribute('aria-label'), ticks: [...el.querySelectorAll('.cm-tick')].map((k) => k.textContent) }));
    assert.deepEqual({ lines: chart.lines, targets: chart.targets, months: chart.months, legend: chart.legend, ticks: chart.ticks }, { lines: 2, targets: 2, months: 12, legend: ['Active realtors, target 30', 'Rentals closed, target 50'], ticks: ['30', '50', '0'] }, 'one chart: two lines over twelve months, each against its target line');
    assert.match(chart.label, new RegExp(`${last}: 34 active realtors, 53 rentals closed`), 'the last complete month reads the snapshot written after it ended');
    assert.match(chart.label, new RegExp(`${month}: 12 active realtors, 9 rentals closed`));
    assert.equal(await page.locator('.cm-poster').getAttribute('href'), '/admin/commitment');

    // 4. The section at 1280, 390 and 320.
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 }); await settle(page);
      await balancedUnder(page, '[data-commitment]', `${engine}, the section at ${width}`);
      const fit = await page.locator('[data-commitment]').evaluate((el) => { const r = el.getBoundingClientRect(); const inside = [...el.querySelectorAll('.cm-tile, .cm-card, .cm-trigger, .cm-svg, .cm-month, .cm-key, .cm-pair')].every((c) => { const q = c.getBoundingClientRect(); return q.left >= r.left - 0.5 && q.right <= r.right + 0.5; }); return { left: r.left, right: r.right, iw: window.innerWidth, inside, columns: getComputedStyle(el.querySelector('.cm-tiles')).gridTemplateColumns.split(' ').length }; });
      assert.ok(fit.left >= 0 && fit.right <= fit.iw && fit.inside, `${engine}, ${width}: the section and everything in it sits inside the screen (${JSON.stringify(fit)})`);
      assert.equal(fit.columns, width === 1280 ? 3 : 1, `${engine}, ${width}: the tiles in ${width === 1280 ? 'three columns' : 'one column'}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('[data-commitment]').screenshot({ path: `${OUT}/${engine}/commitment-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // 5. The poster.
    await page.locator('.cm-poster').click(); await page.waitForURL(/\/admin\/commitment$/, { timeout: 20000 }); await page.locator('[data-poster]').waitFor({ timeout: 20000 }); await settle(page);
    for (const [sel, words] of POSTER_WORDS) assert.equal(await page.locator(`[data-poster] ${sel}`).textContent(), words, `the poster: ${sel}`);
    assert.equal(plain(await page.locator('[data-poster]').evaluate((el) => [...el.querySelectorAll('.po-caps, .po-when, .po-n, .po-label, .po-then, .po-with, .po-ifnot')].map((e) => e.textContent).join(' | '))), POSTER_WORDS.map(([, w]) => w).join(' | '), 'those words, in that order, and no others');
    const g = await page.evaluate(POSTER_GEOMETRY);
    assert.deepEqual(g.loaded, { archivo: true, newsreader: true }, 'Archivo and Newsreader are loaded');
    assert.deepEqual(g.sheet, { width: 816, height: 1056, padding: ['72px', '72px', '72px', '72px'], background: rgb('#ffffff'), color: rgb('#111111'), scrollHeight: 1056, scrollWidth: 816 }, 'US Letter at 96 per inch, 72px of padding, nothing past the sheet');
    const f = g.fonts;
    for (const k of ['capsQuiet', 'name']) assert.deepEqual([px(f[k].size), f[k].weight, f[k].transform, f[k].stretch, Math.round(px(f[k].spacing) * 100) / 100], [13, '600', 'uppercase', '110%', 1.82], `${k}: Archivo 13px, 600, 0.14em, uppercase, width 110%`);
    for (const k of ['capsQuiet', 'name', 'n', 'label', 'then', 'with']) assert.match(f[k].family, /^"?Archivo/, `${k} is set in Archivo`);
    for (const k of ['when', 'ifnot']) assert.match(f[k].family, /^"?Newsreader/, `${k} is set in Newsreader`);
    assert.equal(f.capsQuiet.color, rgb('#555555'));
    // The top row's name is the drawn wordmark in its link home, never the word as type: 13px tall,
    // its letters on the date's baseline, in the poster's ink with the red bar, a 44px target, and
    // the row exactly as tall as the date's one line, so nothing under it moves.
    const mk = await page.evaluate(POSTER_MARK, { baseline: LOGO.baseline, h: LOGO.h });
    assert.deepEqual({ tag: mk.tag, svg: mk.svg, className: mk.className, href: mk.href, label: mk.label, role: mk.role, name: mk.name, text: mk.text }, { tag: 'A', svg: true, className: 'rl-mark po-mark', href: '/', label: 'Rentletter home', role: 'img', name: 'Rentletter', text: '' }, `${engine}: the wordmark, in its link home, with no word typed beside it`);
    assert.ok(Math.abs(mk.height - 13) <= 0.05, `${engine}: the wordmark is 13px tall, the row's type size (${mk.height})`); assert.ok(Math.abs(mk.left - 72) <= 0.05, `${engine}: and starts at the left padding (${mk.left})`);
    assert.ok(Math.abs(mk.lettersBaseline - mk.dateBaseline) <= 0.1, `${engine}: the wordmark's letters sit on the date's baseline (${mk.lettersBaseline} and ${mk.dateBaseline})`);
    assert.deepEqual([mk.letters, mk.bar], [rgb('#111111'), rgb('#d72027')], `${engine}: the letters in ink #111111, the bar in the brand red`);
    assert.deepEqual(mk.target, [true, true, true], `${engine}: the link answers 22px above and below its middle (a 44px target)`);
    assert.ok(Math.abs(mk.rowHeight - mk.dateHeight) <= 0.05, `${engine}: the top row is as tall as the date's one line (${mk.rowHeight} and ${mk.dateHeight})`);
    assert.ok(mk.top >= 0 && mk.top + mk.height <= 1056, `${engine}: the wordmark sits inside the sheet`);
    assert.deepEqual([px(f.when.size), px(f.when.lineHeight), f.when.color], [30, 37.5, rgb('#333333')], 'Newsreader 30px, line height 1.25, #333333');
    assert.deepEqual([px(f.n.size), f.n.weight, f.n.stretch, px(f.n.lineHeight), f.n.color], [132, '800', '75%', 118.8, rgb('#c8321e')], 'the numbers: 132px, 800, width 75%, line height 0.9, #C8321E');
    assert.deepEqual([px(f.label.size), f.label.weight], [20, '500']);
    assert.deepEqual([px(f.then.size), f.then.weight, f.then.stretch, px(f.then.lineHeight)], [54, '800', '85%', 56.7]);
    assert.deepEqual([px(f.with.size), px(f.with.lineHeight), f.with.color, f.with.maxWidth], [18, 27, rgb('#333333'), '560px']);
    assert.deepEqual([px(f.ifnot.size), px(f.ifnot.lineHeight), f.ifnot.maxWidth], [22, 29.7, '380px']);
    assert.equal(g.blocksWithBalance, true, 'text-wrap: balance on every text block');
    const gap = (a, b, what) => assert.ok(Math.abs(a - b) <= 0.05, `${what}: ${a}, expected ${b}`);
    gap(g.top.top, 72, 'the top row starts at the top padding'); gap(g.top.left, 72, 'and at the left padding'); gap(g.top.width, 672, 'and runs the full width');
    gap(g.rule2.top - g.top.bottom, 20, 'the 2px rule sits 20px under the top row'); assert.match(g.rule2Style, /^2px solid/); gap(g.rule2.width, 672, 'the rule runs the full width');
    gap(g.when.top - g.rule2.bottom, 56, 'the sentence sits 56px under the rule'); gap(g.gridBox.top - g.when.bottom, 36, 'the grid sits 36px under the sentence');
    assert.deepEqual(g.grid, { columnGap: '48px', rowGap: '44px', columns: 2 });
    gap(g.label.top - g.n.bottom, 6, 'the label sits 6px under its number');
    gap(g.then.top - g.gridBox.bottom, 64, 'the pledge sits 64px under the grid'); gap(g.withBox.top - g.then.bottom, 20, 'the runway line sits 20px under the pledge');
    assert.match(g.footRuleStyle, /^1px solid/); gap(g.footRule.width, 672, 'the footer rule runs the full width'); gap(g.foot.top - g.footRule.bottom, 24, 'the footer row sits 24px under its rule');
    gap(g.footer.bottom, 1056 - 72, 'the footer ends at the bottom padding'); assert.ok(g.footRule.top - g.withBox.bottom > 60, 'empty space between the body and the footer');
    gap(g.sign.width, 220, 'the signature block is 220px wide'); gap(g.sign.left + g.sign.width, 72 + 672, 'and sits on the right'); gap(g.name.top - g.signRule.bottom, 10, 'the name sits 10px under its line');
    const lines1280 = (await balancedUnder(page, '[data-poster]', `${engine}, the poster at 1280`)).map((b) => b.lines.map((l) => l.words.join(' ')));
    for (const b of await readLines(page.locator('[data-poster] [data-tl-block]'), { own: true })) for (const l of b.lines) assert.ok(b.lines.length === 1 || l.words.length >= 2, `the poster: no line of one word ("${l.words.join(' ')}")`);
    const bar = await page.locator('.po-bar').evaluate((el) => [...el.children].map((c) => ({ tag: c.tagName, text: c.textContent, href: c.getAttribute('href'), height: c.getBoundingClientRect().height })));
    assert.deepEqual(bar.map(({ tag, text, href }) => ({ tag, text, href })), [{ tag: 'BUTTON', text: 'Save as PDF', href: null }, { tag: 'A', text: 'Back to office', href: '/admin' }]);
    assert.ok(bar.every((b) => b.height >= 44), 'both buttons are 44px tall or more');
    await page.getByRole('button', { name: 'Save as PDF' }).click();
    assert.equal(await page.evaluate(() => window.__printed), 1, 'Save as PDF calls window.print');
    const centred = await page.locator('[data-poster]').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right), ground: getComputedStyle(document.body).backgroundColor }; });
    assert.ok(Math.abs(centred.left - centred.right) <= 1 && centred.ground === rgb('#e6e6e4'), `the sheet is centred on a light grey ground (${JSON.stringify(centred)})`);
    await page.screenshot({ path: `${OUT}/${engine}/poster-1280.png`, fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await settle(page);
      const lines = (await balancedUnder(page, '[data-poster]', `${engine}, the poster at ${width}`)).map((b) => b.lines.map((l) => l.words.join(' ')));
      assert.deepEqual(lines, lines1280, `${engine}, ${width}: the same words on the same lines as at full size (nothing reflows)`);
      const r = await page.locator('[data-poster]').evaluate((el) => { const q = el.getBoundingClientRect(); return { width: Math.round(q.width * 100) / 100, ratio: Math.round((q.height / q.width) * 1000) / 1000, left: Math.round(q.left), inner: el.offsetWidth, doc: document.documentElement.scrollWidth, iw: window.innerWidth }; });
      assert.deepEqual(r, { width: width - 32, ratio: Math.round((1056 / 816) * 1000) / 1000, left: 16, inner: 816, doc: width, iw: width }, `${engine}, ${width}: the whole sheet, smaller, inside the screen`);
      await page.screenshot({ path: `${OUT}/${engine}/poster-${width}.png`, fullPage: true });
    }
    await page.getByRole('link', { name: 'Back to office' }).click(); await page.waitForURL(/\/admin$/, { timeout: 20000 });
    await page.locator('[data-commitment]').waitFor({ timeout: 20000 });

    // 6. The PDF (Chrome prints to PDF; WebKit has no page.pdf).
    if (engine === 'chrome') {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/admin/commitment', { waitUntil: 'load' }); await page.locator('[data-poster]').waitFor({ timeout: 20000 }); await settle(page);
      const bytes = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
      writeFileSync(`${OUT}/commitment-poster.pdf`, bytes);
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${OUT}/commitment-poster.pdf`)), verbosity: 0 }).promise;
      assert.equal(doc.numPages, 1, 'the PDF is exactly one page');
      const pdfPage = await doc.getPage(1); const view = pdfPage.getViewport({ scale: 1 });
      assert.deepEqual([Math.round(view.width), Math.round(view.height)], [612, 792], 'US Letter: 612 by 792 points');
      const items = (await pdfPage.getTextContent()).items.filter((i) => i.str.trim());
      // Letter spaced capitals come out of a PDF a glyph at a time: the words are compared without their spaces.
      const squash = (v) => String(v).replace(/\s+/g, '').toLowerCase();
      const text = squash(items.map((i) => i.str).join(''));
      for (const [, words] of POSTER_WORDS) assert.ok(text.includes(squash(words)), `the PDF holds "${words}"`);
      assert.doesNotMatch(text, /saveaspdf|backtooffice|localhost|http/, 'no button and no browser header or footer on the page');
      // The name is drawn, not set: no line of text says it; the wordmark's red bar is the one fill in
      // the brand red; its link home is the one link, at the top left, from the left padding.
      assert.doesNotMatch(text, /rentletter/, 'the name on the page is the drawn wordmark, not a line of text');
      const ops = await pdfPage.getOperatorList();
      const reds = ops.fnArray.filter((fn, i) => fn === pdfjs.OPS.setFillRGBColor && [215, 32, 39].every((v, j) => ops.argsArray[i][j] === v)).length;
      assert.equal(reds, 1, 'the wordmark\'s red bar is drawn once');
      const links = (await pdfPage.getAnnotations()).filter((a) => a.subtype === 'Link');
      assert.deepEqual(links.map((a) => new URL(a.url).pathname), ['/'], 'one link on the page: the wordmark, home');
      const [lx1, ly1, lx2, ly2] = links[0].rect;
      assert.ok(Math.abs(lx1 - 54) <= 0.5 && lx2 <= 612 / 2 && ly1 >= 792 - 54 - 36 && ly2 <= 792, `the wordmark sits at the top left, from the left padding, inside the page (${links[0].rect.map(Math.round)})`);
      // Nothing clipped: every run of text sits inside the sheet's padding (72px is 54 points). y is the
      // run's baseline and height its font size: the capitals stand about three quarters of that above it.
      for (const i of items) { const x = i.transform[4]; const y = i.transform[5]; assert.ok(x >= 54 - 1 && x + i.width <= 612 - 54 + 1 && y >= 54 - 1 && y + 0.75 * i.height <= 792 - 54 + 1, `"${i.str}" sits inside the page's padding (${Math.round(x)}, ${Math.round(y)}, ${Math.round(i.width)} wide)`); }
      // The printed sheet, as the PDF lays it out: one sheet at the page's corner, nothing past it.
      await page.emulateMedia({ media: 'print' }); await page.setViewportSize({ width: 816, height: 1056 }); await page.waitForTimeout(300);
      const printed = await page.evaluate(() => { const s = document.querySelector('[data-poster]'); const r = s.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, bar: getComputedStyle(document.querySelector('.po-bar')).display, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, shadow: getComputedStyle(s).boxShadow, ground: getComputedStyle(document.body).backgroundColor }; });
      assert.deepEqual(printed, { left: 0, top: 0, width: 816, height: 1056, bar: 'none', docH: 1056, docW: 816, shadow: 'none', ground: rgb('#ffffff') }, 'in print: the sheet alone, at the corner of the page, one page tall');
      await page.screenshot({ path: `${OUT}/commitment-poster.png` });
      await page.emulateMedia({ media: null });
      console.log(`the poster: ${OUT}/commitment-poster.pdf (${bytes.length} bytes, 1 page, 612 by 792 points) and ${OUT}/commitment-poster.png`);
    }
    assert.deepEqual(errors, [], `${engine}: no page error`);
    await ctx.close();
  } finally { await browser.close(); }
}

test('the Commitment section and the poster, behind the office gate, in WebKit', { timeout: 600000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test('the same in Chrome, and the poster PDF is one Letter page', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
