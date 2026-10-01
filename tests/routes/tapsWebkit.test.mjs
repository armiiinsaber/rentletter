// Smart taps, in WebKit (Safari's engine) and in Chrome, with an iPhone user agent.
// On the sandbox (the walks' dev server):
//   1. Every target is at least 44 by 44: every button, link, checkbox, switch and tappable row on
//      the dashboard, a listing, an open applicant, the open Pipeline, the New listing sheet, the
//      profile and the tenant form, at 390 and at 360, its area grown invisibly where needed and
//      split at the midpoint with a neighbour; none is left short.
//   2. The tap resolver: a near miss activates the nearest target, with the press on it; an
//      ambiguous tap activates nothing; a near miss beside Delete listing, or beside Remove in its
//      confirm sheet, activates nothing; a tap that was part of a drag or a scroll activates
//      nothing; a near miss beside a text field on the tenant form leaves the field alone.
// On the real pages over the fake stack (tests/helpers/fakeNextServer.mjs, its own dev server):
//   3. The Pipeline header: with one person, a tap on the header or anywhere on the card opens and
//      closes that person; with two, the header opens and closes the list and each row its person.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { devServer, BASE, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const server = devServer(`${BASE}/signin`);
const FAKE_PORT = 3153; const FAKE = `http://localhost:${FAKE_PORT}`;
let fake = null;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  await server.start();
  for (const pid of listeners(FAKE_PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(FAKE_PORT), 'dev', '3'], { cwd: new URL('../..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
  await fetch(`${FAKE}/dashboard`).catch(() => null);
}, { timeout: START_TIMEOUT });
after(async () => {
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(FAKE_PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await server.stop();
}, { timeout: STOP_TIMEOUT });

async function phone(browser, { base = BASE, width = 390 } = {}) {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width, height: width === 390 ? 844 : 780 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await ctx.route(/fake\.supabase\.co|supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
const open = async (page, url) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };
const LISTING = '/demo/dashboard?listing=demo-carlaw';
const tapRole = async (page, name) => { const b = page.getByRole('button', { name }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(700); };
const openPerson = async (page) => { const row = page.locator('#people li[data-person] [role=button]').first(); await row.scrollIntoViewIfNeeded(); await row.locator('div').first().click(); await page.waitForTimeout(500); };

// ── 1. Every target at least 44 by 44 ────────────────────────────────────────────────────────
// In the page: each target's effective area, probed from its centre to where a tap stops reaching
// it (its own label counts: a tap there acts on it). A side short of 44 must end where a
// neighbouring target or field begins, or at the screen edge.
const HITS = () => {
  const INTERACTIVE = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], input:not([type="hidden"]), select, textarea, label, summary, [data-tap]';
  const sheet = [...document.querySelectorAll('.rl-sh-root')].pop() || null;
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const els = [...document.querySelectorAll(INTERACTIVE)].filter(shown)
    .filter((el) => getComputedStyle(el).pointerEvents !== 'none' && !el.closest('[aria-hidden="true"]'))
    .filter((el) => !(el.tagName === 'LABEL' && !el.control) && !el.matches('.rl-sh-scrim'))
    .filter((el) => !sheet || sheet.contains(el));
  const name = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.type || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
  const owns = (el, x, y) => { const h = document.elementFromPoint(x, y); if (!h) return false; if (h === el || el.contains(h)) return true; return [...(el.labels || [])].some((l) => l === h || l.contains(h)); };
  const offScreen = (x, y) => x < 0 || y < 0 || x >= innerWidth || y >= innerHeight;
  // Beyond the area: another target's or a field's own area, or past the screen edge.
  const neighbour = (el, x, y) => {
    if (offScreen(x, y)) return true;
    const h = document.elementFromPoint(x, y); if (!h) return false;
    const t = h.closest(`${INTERACTIVE}, [data-tap-card]`);
    return !!t && !t.contains(el) && !el.contains(t) && !t.matches('[data-tap-card]');
  };
  const out = { checked: 0, failures: [], bounded: [] };
  for (const el of els) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!owns(el, cx, cy)) continue; // under something else (a sticky bar): checked where it shows
    out.checked++;
    const reach = (dx, dy) => { let k = 0; while (k < 60 && !offScreen(cx + dx * (k + 1), cy + dy * (k + 1)) && owns(el, cx + dx * (k + 1), cy + dy * (k + 1))) k++; let lo = k, hi = k + 1; if (k < 60) for (let i = 0; i < 4; i++) { const m = (lo + hi) / 2; if (owns(el, cx + dx * m, cy + dy * m)) lo = m; else hi = m; } return { d: lo, end: hi }; };
    const L = reach(-1, 0), R = reach(1, 0), T = reach(0, -1), B = reach(0, 1);
    const w = L.d + R.d, h = T.d + B.d;
    const short = [];
    // An area is a rectangle: a neighbour anywhere along a side stops that whole side.
    const along = (from, to) => { const out = []; for (let v = from + 1; v < to; v += 4) out.push(v); out.push(to - 1); return out; };
    if (w < 43.5) for (const [s, dx] of [[L, -1], [R, 1]]) if (!along(r.top, r.bottom).some((y) => neighbour(el, cx + dx * (s.end + 0.5), y))) short.push(dx < 0 ? 'left' : 'right');
    if (h < 43.5) for (const [s, dy] of [[T, -1], [B, 1]]) if (!along(r.left, r.right).some((x) => neighbour(el, x, cy + dy * (s.end + 0.5)))) short.push(dy < 0 ? 'top' : 'bottom');
    const line = `${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} reaches ${w.toFixed(1)}x${h.toFixed(1)}`;
    if (short.length) out.failures.push(`${line}, free space left on the ${short.join(', ')}`);
    else if (w < 43.5 || h < 43.5) out.bounded.push(line);
  }
  return out;
};
const SCREENS = [
  { name: 'dashboard', go: (page) => open(page, '/demo/dashboard') },
  { name: 'listing', go: (page) => open(page, LISTING) },
  { name: 'applicant open', go: async (page) => { await open(page, LISTING); const r = page.locator('[role=button][aria-controls]').filter({ hasText: 'David Kowalski' }).first(); await r.scrollIntoViewIfNeeded(); await r.click(); await page.waitForTimeout(700); assert.equal(await r.getAttribute('aria-expanded'), 'true'); } },
  { name: 'pipeline open', go: async (page) => { await open(page, '/demo/dashboard'); await openPerson(page); } },
  { name: 'new listing sheet', go: async (page) => { await open(page, '/demo/dashboard'); await tapRole(page, /New listing|Add your first listing/); await page.locator('.rl-sh-panel').waitFor(); } },
  { name: 'profile', go: (page) => open(page, '/demo/dashboard?profile=1') },
  { name: 'tenant form', go: (page) => open(page, '/apply/demo0000000000000001') },
];
async function hitAreas(browser, tag) {
  const notes = [];
  for (const width of [390, 360]) {
    for (const s of SCREENS) {
      const { ctx, page } = await phone(browser, { width });
      await s.go(page);
      const r = await page.evaluate(HITS);
      assert.ok(r.checked > 0, `${tag} ${width} ${s.name}: targets checked`);
      assert.deepEqual(r.failures, [], `${tag} ${width} ${s.name}: no target leaves free space unused`);
      assert.deepEqual(r.bounded, [], `${tag} ${width} ${s.name}: every target reaches 44 by 44`);
      notes.push(`${width} ${s.name}: ${r.checked} targets, each at least 44 by 44`);
      await ctx.close();
    }
  }
  return notes;
}

// ── 2. The tap resolver ──────────────────────────────────────────────────────────────────────
// In the page: what the resolver (lib/motion.js installTapResolver) weighs at a point, a search for
// a point of a given kind, and a recorder of every click that reaches a target. While __block is
// set the recorder stops such a click there, so nothing it would do runs.
const ORACLE = () => {
  const TAP = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"], label, summary, [data-tap], [data-tap-card]';
  const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';
  const DESTRUCTIVE = /^(remove|delete|withdraw|mark (as )?(rented|withdrawn)|set aside|revoke|discard|decline)\b/i;
  const isT = (el) => el.matches(TAP) && !(el.tagName === 'LABEL' && !el.control);
  const targetOf = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) if (isT(a)) return a; return null; };
  const destructive = (el) => !!el.closest('[data-destructive]') || DESTRUCTIVE.test(String(el.getAttribute('aria-label') || el.textContent || '').trim());
  const dist = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  const box = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return null; const cs = getComputedStyle(el); return cs.visibility === 'hidden' || cs.display === 'none' ? null : r; };
  const usable = (el) => !el.matches(':disabled, [aria-disabled="true"]') && !el.closest('fieldset:disabled, [aria-hidden="true"], [inert]');
  const name = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
  const weigh = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit || targetOf(hit) || hit.closest(FIELDS) || hit.closest('[data-no-resolve]')) return null;
    const c = [];
    for (const el of document.querySelectorAll(`${TAP}, ${FIELDS}`)) {
      if (!el.matches(FIELDS) && !isT(el)) continue;
      const r = box(el); if (!r || !usable(el)) continue;
      const d = dist(x, y, r); if (d > 16) continue;
      const px = Math.min(Math.max(x, r.left + 1), r.right - 1), py = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
      const top = document.elementFromPoint(px, py); if (!top || !(top === el || el.contains(top))) continue;
      if (c.some((o) => o.el.contains(el))) continue;
      for (let k = c.length - 1; k >= 0; k--) if (el.contains(c[k].el)) c.splice(k, 1);
      c.push({ el, d, destructive: destructive(el), field: el.matches(FIELDS) });
    }
    return c.sort((a, b) => a.d - b.d);
  };
  // kind: 'clear' (one harmless button clearly nearest), 'ambiguous', or 'beside' (the marked
  // element clearly nearest). Margins keep the point away from the thresholds.
  window.__find = (kind, withinSel = null) => {
    const within = withinSel ? [...document.querySelectorAll(withinSel)].pop() : null;
    const want = document.querySelector('[data-test-beside]');
    const R = within ? within.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let y = Math.max(R.top, 0) + 1; y < Math.min(R.bottom, innerHeight) - 1; y += 2) {
      for (let x = Math.max(R.left, 0) + 1; x < Math.min(R.right, innerWidth) - 1; x += 2) {
        const c = weigh(x, y); if (!c || !c.length) continue;
        const [a, b] = c;
        const clear = a.d >= 3 && a.d <= 13 && (!b || b.d >= a.d * 1.5 + 1);
        if (kind === 'clear' && clear && !a.destructive && !a.field && a.el.tagName === 'BUTTON' && !a.el.closest('[data-tap-card]')) return { x, y, name: name(a.el) };
        if (kind === 'ambiguous' && b && a.d >= 3 && b.d <= 13 && b.d < a.d * 1.3) return { x, y, name: `${name(a.el)} / ${name(b.el)}` };
        if (kind === 'beside' && clear && a.el === want) return { x, y, name: name(a.el) };
      }
    }
    return null;
  };
  window.__acts = [];
  window.addEventListener('click', (e) => {
    const t = targetOf(e.target); if (!t) return;
    window.__acts.push({ name: name(t), pressed: !!document.querySelector('.rl-pressing'), trusted: e.isTrusted });
    if (window.__block) { e.preventDefault(); e.stopPropagation(); }
  }, true);
};
const arm = async (page) => { await page.evaluate(ORACLE); };
const acts = (page) => page.evaluate(() => window.__acts.splice(0));
const block = (page, on) => page.evaluate((on) => { window.__block = on; }, on);

async function resolver(browser, tag) {
  const { ctx, page, errors } = await phone(browser);
  // A near miss: the nearest target acts, with its press, exactly as a direct tap would.
  await open(page, '/demo/dashboard'); await arm(page);
  const near = await page.evaluate(() => window.__find('clear'));
  assert.ok(near, `${tag}: a near miss point on the dashboard`);
  await acts(page); await block(page, true);
  await page.mouse.click(near.x, near.y); await page.waitForTimeout(150);
  let a = await acts(page);
  assert.equal(a.length, 1, `${tag}: one activation for a near miss at ${near.x},${near.y}: ${JSON.stringify(a)}`);
  assert.equal(a[0].name, near.name, `${tag}: the nearest target`);
  assert.equal(a[0].pressed, true, `${tag}: with the press on it`);
  if (tag === 'wk') { // a finger, in WebKit (Chrome adjusts a touch to a target by itself)
    await page.touchscreen.tap(near.x, near.y); await page.waitForTimeout(150);
    a = await acts(page);
    assert.deepEqual(a.map((x) => [x.name, x.pressed, x.trusted]), [[near.name, true, false]], `${tag}: a tap resolves the same way`);
  }
  // Ambiguous: two targets near equally near, so nothing.
  const amb = await page.evaluate(() => window.__find('ambiguous'));
  assert.ok(amb, `${tag}: an ambiguous point`);
  await page.mouse.click(amb.x, amb.y); await page.waitForTimeout(150);
  assert.deepEqual(await acts(page), [], `${tag}: an ambiguous tap between ${amb.name} activates nothing`);
  // Part of a drag: down near the target, moved past the slop, up.
  await page.mouse.move(near.x, near.y); await page.mouse.down(); await page.mouse.move(near.x, near.y + 24, { steps: 4 }); await page.mouse.move(near.x, near.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(150);
  assert.deepEqual(await acts(page), [], `${tag}: a drag activates nothing`);
  // Part of a scroll: the page moved between the finger down and the click.
  await page.mouse.move(near.x, near.y); await page.mouse.down();
  await page.evaluate(() => { window.scrollBy({ top: 40, behavior: 'instant' }); });
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.scrollBy({ top: -40, behavior: 'instant' }); });
  await page.waitForTimeout(80);
  await page.mouse.up(); await page.waitForTimeout(150);
  assert.deepEqual(await acts(page), [], `${tag}: a tap during a scroll activates nothing`);
  // A touch that became a scroll: the browser cancels the pointer, and a click that still arrives is ignored.
  await page.evaluate(({ x, y }) => {
    const at = document.elementFromPoint(x, y);
    const p = (type) => at.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, pointerId: 7 }));
    p('pointerdown'); p('pointercancel');
    at.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y, detail: 1 }));
  }, near);
  await page.waitForTimeout(150);
  assert.deepEqual(await acts(page), [], `${tag}: a cancelled touch activates nothing`);
  await block(page, false);

  // A near miss beside Delete listing: nothing, and no confirm sheet.
  await open(page, LISTING); await arm(page);
  if (!(await page.getByRole('button', { name: /Delete listing/ }).count())) await tapRole(page, /^Details/);
  const del = page.getByRole('button', { name: /^Delete listing$/ }).first();
  await del.evaluate((el) => { el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.setAttribute('data-test-beside', ''); });
  const byDelete = await page.evaluate(() => window.__find('beside'));
  assert.ok(byDelete, `${tag}: a point where Delete listing is clearly nearest`);
  await acts(page); await block(page, true); // what came before (opening Details) is not the tap's
  await page.mouse.click(byDelete.x, byDelete.y); await page.waitForTimeout(300);
  assert.deepEqual(await acts(page), [], `${tag}: a near miss beside Delete listing activates nothing`);
  assert.equal(await page.locator('[role=alertdialog]').count(), 0, `${tag}: no confirm sheet`);
  await block(page, false);

  // A near miss beside Remove in its confirm sheet: nothing, and the sheet stays.
  await open(page, '/demo/dashboard'); await arm(page);
  await openPerson(page);
  await page.locator('#people').getByRole('button', { name: 'Remove' }).first().click();
  const dialog = page.locator('[role=alertdialog]'); await dialog.waitFor(); await page.waitForTimeout(500);
  await dialog.getByRole('button', { name: 'Remove' }).evaluate((el) => el.setAttribute('data-test-beside', ''));
  const byRemove = await page.evaluate(() => window.__find('beside', '[role=alertdialog]'));
  assert.ok(byRemove, `${tag}: a point in the sheet where Remove is clearly nearest`);
  const people = await page.locator('#people li[data-person]').count();
  await acts(page); await block(page, true);
  await page.mouse.click(byRemove.x, byRemove.y); await page.waitForTimeout(300);
  assert.deepEqual(await acts(page), [], `${tag}: a near miss beside Remove activates nothing`);
  await block(page, false);
  assert.equal(await dialog.count(), 1, `${tag}: the sheet stays`);
  await dialog.getByRole('button', { name: 'Cancel' }).click(); await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#people li[data-person]').count(), people, `${tag}: nobody removed`);

  // The tenant form: a near miss beside a text field leaves it alone.
  await open(page, '/apply/demo0000000000000001'); await arm(page);
  const field = page.locator('input[type=text], input[type=email], input:not([type]), textarea').first();
  await field.evaluate((el) => { el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.setAttribute('data-test-beside', ''); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  const byField = await page.evaluate(() => window.__find('beside'));
  assert.ok(byField, `${tag}: a point where a text field is clearly nearest`);
  await acts(page);
  await page.mouse.click(byField.x, byField.y); await page.waitForTimeout(200);
  assert.equal(await field.evaluate((el) => document.activeElement === el), false, `${tag}: the field needs a direct hit`);
  assert.deepEqual(await acts(page), [], `${tag}: nothing else acted`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ── 3. The Pipeline header, with one person and with two ────────────────────────────────────
async function pipelineHeader(browser, tag) {
  const { ctx, page, errors } = await phone(browser, { base: FAKE });
  const card = page.locator('#people');
  const head = card.locator('[data-pipeline-head] button');
  const rows = card.locator('li[data-person] [data-person-row]');
  const tapAt = async (loc, fx = 0.5, fy = 0.5) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy); await page.waitForTimeout(350); };

  // One person: the header, the count beside it and the card's padding all open and close them.
  assert.equal(await (await fetch(`${FAKE}/__fake/pipeline?people=1`)).text(), '1');
  await open(page, '/dashboard');
  assert.equal(await rows.count(), 1, `${tag}: one person`);
  const person = rows.first();
  assert.equal(await person.getAttribute('aria-expanded'), 'false');
  await tapAt(head);
  assert.equal(await person.getAttribute('aria-expanded'), 'true', `${tag}: the header opens the one person`);
  assert.equal(await head.getAttribute('aria-expanded'), 'true');
  await tapAt(card.locator('[data-pipeline-head] > span'));
  assert.equal(await person.getAttribute('aria-expanded'), 'false', `${tag}: the count beside it closes them`);
  await tapAt(card, 0.98, 0.98);
  assert.equal(await person.getAttribute('aria-expanded'), 'true', `${tag}: the card's corner opens them`);
  await tapAt(card, 0.02, 0.5);
  assert.equal(await person.getAttribute('aria-expanded'), 'false', `${tag}: its edge closes them`);
  await head.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  assert.equal(await person.getAttribute('aria-expanded'), 'true', `${tag}: Enter on the header`);

  // Two people: the header opens and closes the list; each row and the padding beside it, its person.
  assert.equal(await (await fetch(`${FAKE}/__fake/pipeline?people=2`)).text(), '2');
  await open(page, '/dashboard');
  assert.equal(await rows.count(), 2, `${tag}: two people`);
  assert.equal(await head.getAttribute('aria-expanded'), 'true', `${tag}: the list shows`);
  await tapAt(head);
  assert.equal(await rows.count(), 0, `${tag}: the header closes the list`);
  assert.equal(await head.getAttribute('aria-expanded'), 'false');
  await tapAt(card, 0.98, 0.5);
  assert.equal(await rows.count(), 2, `${tag}: a tap anywhere on the closed card opens it`);
  await tapAt(rows.nth(1), 0.5, 0.3);
  assert.equal(await rows.nth(1).getAttribute('aria-expanded'), 'true', `${tag}: a row opens its person`);
  assert.equal(await rows.nth(0).getAttribute('aria-expanded'), 'false', `${tag}: and only that one`);
  // The card's padding level with the first row belongs to that row.
  const first = await rows.nth(0).boundingBox(); const cb = await card.boundingBox();
  await page.touchscreen.tap(cb.x + 4, first.y + first.height / 2); await page.waitForTimeout(350);
  assert.equal(await rows.nth(0).getAttribute('aria-expanded'), 'true', `${tag}: the padding beside a row is that row`);
  await tapAt(rows.nth(0), 0.5, 0.15);
  assert.equal(await rows.nth(0).getAttribute('aria-expanded'), 'false', `${tag}: and closes it`);
  await tapAt(head);
  assert.equal(await rows.count(), 0, `${tag}: closed again`);
  assert.deepEqual(errors, []);
  await fetch(`${FAKE}/__fake/pipeline?people=1`);
  await ctx.close();
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  try {
    const notes = await hitAreas(browser, tag);
    await resolver(browser, tag);
    await pipelineHeader(browser, tag);
    return notes;
  } finally { await browser.close(); }
}

test('smart taps in WebKit at 390 and 360', { timeout: 900000 }, async (t) => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  for (const n of await walk(pw.webkit, {}, 'wk')) t.diagnostic(n);
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, async (t) => {
  for (const n of await walk(pw.chromium, { executablePath: chromeBin }, 'cr')) t.diagnostic(n);
});
