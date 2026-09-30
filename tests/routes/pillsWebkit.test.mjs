// Status pills and the portrait app, in WebKit (Safari's engine) and in Chrome, on the sandbox:
//   1. Every realtor, tenant and landlord screen (tests/helpers/screens.mjs) at 390 and 360, with
//      motion allowed: no visible text carries a middle dot; every pill is 28px tall, 14px tabular Inter, never cut or off screen, with no
//      dot in it; its text reads at 4.5 or better on the colour actually behind it; it has no
//      transition, no animation and full opacity. Every pill row keeps one 8px gap both ways, starts
//      at its left edge, and the pills on one line share their top and height. At most one filled
//      pill per card. Nothing animates a pill or anything that holds a pill row, from the first
//      paint on; the one exception is the first run swipe hint, which slides the first applicant
//      card (components/motion/swipe.js) and never fades it.
//   2. The screens the task names carry their pill rows: the dashboard listing cards, the Pipeline
//      card, the listing header card, the applicant cards, the landlord report, the tenant's
//      application page and the applying banner.
//   3. Installed (navigator.standalone, as iOS sets it), a realtor page turned landscape is covered
//      by the paper overlay, the mark and one line, no buttons; turned upright the overlay is gone
//      and the page is as it was: same document, same URL, the open sheet and the typed text kept.
//      In Safari (not installed) no page shows it, and tenant and landlord pages never carry it.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { devServer, BASE, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { SCREENS, APPLY } from '../helpers/screens.mjs';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const server = devServer(`${BASE}/signin`);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: START_TIMEOUT });
after(() => server.stop(), { timeout: STOP_TIMEOUT });

const DEMO = '/demo/dashboard';
const REPORT = '/r/demo-demo-carlaw';
const warm = () => Promise.all([DEMO, APPLY, REPORT, '/my-application/DEMO', '/'].map((u) => fetch(`${BASE}${u}`).catch(() => null)));
const open = async (page, url) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };

// Before any script: record every animation and transition that starts, with its target.
const RECORD = () => {
  window.__rlMoves = [];
  const rec = (e) => window.__rlMoves.push({ t: e.target, name: e.animationName || e.propertyName, kind: e.type });
  document.addEventListener('animationstart', rec, true);
  document.addEventListener('transitionrun', rec, true);
};

// Run in the page.
const AUDIT = () => {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // The colour behind an element: every background from the root down, laid over white.
  const behind = (el) => { const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n); let bg = [255, 255, 255]; for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3])); } return bg; };
  const problems = []; const ratios = {};
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const pills = [...document.querySelectorAll('.rl-pill')].filter(shown);
  for (const el of pills) {
    const cs = getComputedStyle(el); const txt = el.textContent.trim(); const r = el.getBoundingClientRect();
    const bg = behind(el); const fg = parse(cs.color);
    const fc = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const cr = ratio(fc, bg);
    const kind = el.classList.contains('rl-pill-action') ? 'filled' : el.closest('.rl-pills-ink') ? 'on ink' : 'paper';
    const key = `${kind}: rgb(${fc.map(Math.round).join(', ')}) on rgb(${bg.map(Math.round).join(', ')})`;
    ratios[key] = Math.min(ratios[key] ?? 99, Math.round(cr * 100) / 100);
    if (cr < 4.5) problems.push(`contrast ${cr.toFixed(2)}: ${txt}`);
    if (cs.animationName !== 'none') problems.push(`animation ${cs.animationName}: ${txt}`);
    if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) problems.push(`transition ${cs.transitionProperty}: ${txt}`);
    if (cs.opacity !== '1') problems.push(`opacity ${cs.opacity}: ${txt}`);
    for (let a = el.parentElement; a; a = a.parentElement) if (parseFloat(getComputedStyle(a).opacity) < 1) { problems.push(`faded by ${a.tagName.toLowerCase()}.${a.className}: ${txt}`); break; }
    if (Math.abs(r.height - 28) > 0.5) problems.push(`height ${r.height}: ${txt}`);
    if (cs.fontSize !== '14px' || !/tabular-nums/.test(cs.fontVariantNumeric) || !/Inter/.test(cs.fontFamily)) problems.push(`type ${cs.fontSize} ${cs.fontVariantNumeric}: ${txt}`);
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`cut: ${txt}`);
    if (r.right > window.innerWidth + 0.5 || r.left < -0.5) problems.push(`off screen: ${txt}`);
    if (/·/.test(txt)) problems.push(`dot: ${txt}`);
    if (el.querySelector('button, a') || el.closest('button, a')) { if (Math.min(r.height, r.width) < 44 && !el.closest('button, a')) problems.push(`small target: ${txt}`); }
  }
  for (const row of [...document.querySelectorAll('.rl-pills')].filter(shown)) {
    const cs = getComputedStyle(row); const rr = row.getBoundingClientRect(); const edge = rr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    if (cs.columnGap !== '8px' || cs.rowGap !== '8px') problems.push(`gap ${cs.columnGap} ${cs.rowGap}: ${row.textContent}`);
    if (/·/.test(row.textContent)) problems.push(`dot in row: ${row.textContent}`);
    const boxes = [...row.children].map((li) => li.getBoundingClientRect());
    const lines = []; for (const b of boxes) { const line = lines.find((l) => Math.abs(l[0].top - b.top) < 1); if (line) line.push(b); else lines.push([b]); }
    lines.forEach((line, i) => {
      if (Math.abs(line[0].left - edge) > 0.5) problems.push(`not left aligned: ${row.textContent}`);
      for (let k = 1; k < line.length; k++) {
        if (Math.abs(line[k].left - line[k - 1].right - 8) > 0.6) problems.push(`gap ${Math.round(line[k].left - line[k - 1].right)}: ${row.textContent}`);
        if (Math.abs(line[k].height - line[0].height) > 0.5 || Math.abs(line[k].top - line[0].top) > 0.5) problems.push(`uneven line: ${row.textContent}`);
      }
      if (i > 0 && Math.abs(line[0].top - lines[i - 1][0].bottom - 8) > 0.6) problems.push(`line gap ${Math.round(line[0].top - lines[i - 1][0].bottom)}: ${row.textContent}`);
    });
  }
  // No dot line is left anywhere on the screen: no visible text carries a middle dot.
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let tn;
  while ((tn = tw.nextNode())) {
    const el = tn.parentElement; if (!/·/.test(tn.nodeValue) || !el || el.closest('script, style, noscript, next-route-announcer') || !el.getClientRects().length) continue;
    problems.push(`a middle dot on screen: ${el.textContent.trim().slice(0, 80)}`);
  }
  const perCard = new Map();
  for (const a of document.querySelectorAll('.rl-pill-action')) { const card = a.closest('[id^="applicant-"], .rl-card, section, li, main'); perCard.set(card, (perCard.get(card) || 0) + 1); }
  for (const [card, n] of perCard) if (n > 1) problems.push(`${n} filled pills on one card: ${card.textContent.slice(0, 60)}`);
  const rows = [...document.querySelectorAll('.rl-pills')];
  // Nothing that holds a pill row is set to move or fade on hover or press either.
  const holders = new Set(); for (const r of rows) for (let a = r; a && a !== document.body; a = a.parentElement) holders.add(a);
  for (const a of holders) {
    const cs = getComputedStyle(a); const props = cs.transitionProperty.split(',').map((x) => x.trim()); const durs = cs.transitionDuration.split(',').map(parseFloat);
    if (props.some((pr, i) => /^(all|transform|opacity|translate|scale)$/.test(pr) && (durs[i] ?? durs[durs.length - 1]) > 0)) problems.push(`set to move: ${a.tagName.toLowerCase()}.${a.className} ${cs.transitionProperty}`);
    if (cs.animationName !== 'none') problems.push(`animated: ${a.tagName.toLowerCase()}.${a.className} ${cs.animationName}`);
  }
  for (const m of window.__rlMoves || []) {
    if (!m.t || m.t.nodeType !== 1 || !rows.some((r) => r.contains(m.t) || m.t.contains(r))) continue;
    if (m.t.classList.contains('m-swipe-card') && m.name === 'transform') continue; // the first run swipe hint
    problems.push(`moves: ${m.kind} ${m.name} on ${m.t.tagName.toLowerCase()}.${m.t.className}`);
  }
  return { pills: pills.length, problems, ratios };
};

// Where the task names a pill row, it is there.
const NAMED = [
  { screen: 'dashboard', rows: [['.dash-grid .rl-pills', 'the dashboard listing cards'], ['#people .rl-pills.rl-pills-ink', 'the Pipeline card']] },
  { screen: 'listing', rows: [['section:has(h1) .rl-pills', 'the listing header card'], ['[id^="applicant-"] .rl-pills', 'the applicant cards']] },
  { screen: 'landlord report', rows: [['main .rl-pills', 'the landlord report']] },
  { screen: 'my application', rows: [['.mp-wrap .rl-pills', 'the tenant application page']] },
  { screen: 'apply landing', rows: [['.mp-ink .rl-pills.rl-pills-ink', 'the applying banner']] },
];

async function pillsWalk(browserType, launch, tag) {
  await warm();
  const browser = await browserType.launch(launch);
  const ratios = {};
  try {
    for (const width of [390, 360]) {
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height: width === 390 ? 844 : 780 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
      await ctx.addInitScript(RECORD);
      for (const s of SCREENS.filter((x) => x.kind !== 'public')) {
        const page = await ctx.newPage();
        try {
          await s.go(page); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500);
          const r = await page.evaluate(AUDIT);
          assert.deepEqual(r.problems, [], `${tag} ${width} ${s.name}`);
          Object.assign(ratios, r.ratios);
          for (const n of NAMED.filter((x) => x.screen === s.name)) {
            for (const [sel, what] of n.rows) assert.ok(await page.locator(sel).count() > 0, `${tag} ${width}: ${what} carry a pill row (${sel})`);
          }
        } finally { await page.close(); }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  for (const [k, v] of Object.entries(ratios)) assert.ok(v >= 4.5, `${tag} ${k}: ${v}`);
  return ratios;
}

async function uprightWalk(browserType, launch, tag) {
  await warm();
  const browser = await browserType.launch(launch);
  const make = async (standalone) => {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    if (standalone) await ctx.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); });
    return ctx;
  };
  const upright = (page) => page.setViewportSize({ width: 390, height: 844 });
  const landscape = (page) => page.setViewportSize({ width: 844, height: 390 });
  try {
    // Installed: the dashboard with the new listing sheet open and an address typed.
    const ctx = await make(true); const page = await ctx.newPage();
    await open(page, DEMO);
    const add = page.getByRole('button', { name: /New listing|Add your first listing/ }).first(); await add.scrollIntoViewIfNeeded(); await add.click();
    const modal = page.locator('.rl-modal').last(); await modal.waitFor({ timeout: 10000 });
    const field = modal.locator('input:not([type=checkbox]):not([type=radio])').first();
    await field.fill('88 Harbour St');
    await page.evaluate(() => { window.__rlSameDocument = 'kept'; });
    const url = page.url();
    const overlay = page.locator('[data-upright]');
    assert.equal(await overlay.count(), 1, `${tag}: the overlay is on the realtor page`);
    assert.equal(await overlay.isVisible(), false, `${tag}: hidden while upright`);
    await landscape(page); await page.waitForTimeout(200);
    assert.equal(await overlay.isVisible(), true, `${tag}: shown in landscape`);
    const cover = await page.evaluate(() => {
      const o = document.querySelector('[data-upright]'); const r = o.getBoundingClientRect(); const cs = getComputedStyle(o);
      const pts = [[1, 1], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2], [2, innerHeight - 2], [innerWidth - 2, 2]];
      const img = o.querySelector('img');
      return {
        box: [r.left, r.top, r.width, r.height].map(Math.round), vw: [innerWidth, innerHeight],
        hits: pts.every(([x, y]) => o.contains(document.elementFromPoint(x, y))),
        text: o.innerText.trim(), controls: o.querySelectorAll('button, a, input, [role=button], [tabindex]').length,
        bg: cs.backgroundColor, still: cs.transitionDuration.split(',').every((d) => parseFloat(d) === 0) && cs.animationName === 'none' && document.getAnimations().every((a) => !o.contains(a.effect?.target)),
        mark: !!img && img.complete && img.naturalWidth > 0, centred: (() => { const t = o.querySelector('p').getBoundingClientRect(); return Math.abs(t.left + t.width / 2 - innerWidth / 2) < 2; })(),
      };
    });
    assert.deepEqual(cover.box, [0, 0, cover.vw[0], cover.vw[1]], `${tag}: covers the screen`);
    assert.equal(cover.hits, true, `${tag}: nothing underneath takes a tap`);
    assert.equal(cover.text, 'Turn your phone upright.');
    assert.equal(cover.controls, 0, `${tag}: no buttons`);
    assert.equal(cover.bg, 'rgb(250, 248, 243)', `${tag}: paper`);
    assert.equal(cover.still, true, `${tag}: no motion`);
    assert.equal(cover.mark, true, `${tag}: the small mark`);
    assert.equal(cover.centred, true, `${tag}: centred`);
    await upright(page); await page.waitForTimeout(200);
    assert.equal(await overlay.isVisible(), false, `${tag}: gone the moment it is upright`);
    assert.equal(await page.evaluate(() => window.__rlSameDocument), 'kept', `${tag}: not reloaded`);
    assert.equal(page.url(), url, `${tag}: same page`);
    assert.equal(await modal.isVisible(), true, `${tag}: the sheet is still open`);
    assert.equal(await field.inputValue(), '88 Harbour St', `${tag}: the typed address is kept`);
    // Installed, the listing page too; tenant and landlord pages never carry the overlay.
    await open(page, '/demo/dashboard?listing=demo-carlaw'); await landscape(page); await page.waitForTimeout(200);
    assert.equal(await overlay.isVisible(), true, `${tag}: the listing page, installed, landscape`);
    await upright(page);
    for (const u of [APPLY, REPORT, '/my-application/DEMO']) {
      await open(page, u); await landscape(page); await page.waitForTimeout(200);
      assert.equal(await page.locator('[data-upright]').count(), 0, `${tag}: ${u} carries no overlay`);
      await upright(page);
    }
    await ctx.close();
    // In Safari (not installed): landscape shows nothing, on a realtor or a marketing page.
    // A fresh tab for each page: the home page can replace its own URL after load, which would
    // interrupt the next navigation in a shared tab.
    const safari = await make(false);
    for (const u of [DEMO, '/', '/faq']) {
      const sp = await safari.newPage();
      await open(sp, u); await landscape(sp); await sp.waitForTimeout(200);
      assert.equal(await sp.locator('[data-upright]').isVisible(), false, `${tag}: ${u} in Safari, landscape`);
      await sp.close();
    }
    await safari.close();
  } finally { await browser.close(); }
}

test('status pills on every realtor, tenant and landlord screen in WebKit at 390 and 360', { timeout: 900000 }, async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  const ratios = await pillsWalk(pw.webkit, {}, 'wk');
  console.log(`# contrast ${JSON.stringify(ratios)}`);
});
test('the installed app turned landscape in WebKit: covered, then unchanged', { timeout: 300000 }, async () => {
  requireWebkit();
  await uprightWalk(pw.webkit, {}, 'wk');
});
test('status pills in Chrome at 390 and 360', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => pillsWalk(pw.chromium, { executablePath: chromeBin }, 'cr'));
test('the installed app turned landscape in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 300000 }, () => uprightWalk(pw.chromium, { executablePath: chromeBin }, 'cr'));
