// scripts/film/capture.mjs
// Drives the real sandbox in WebKit and writes the film's picture frames to out/film.
//
// The cut follows the voice: whatever the narration names is the only thing in frame while it is
// named. The narration's own pauses (ffmpeg silencedetect on public/film/narration.mp3) give the
// blocks; each block gets its own shot or run of shots.
//
// The product is shown at 390, which is where it was designed, and the frame is a 16 by 9 window on
// that page: a row, a number or a label fills the picture edge to edge, with no canvas around it.
// The pixel ratio is set from the window's width, so a number blown up to fill the frame is
// rasterised at that size and never upscaled. The whole device appears only where the device is the
// point: the tenant's form, and the one flip from the realtor's page to the landlord's.
//
// Motion is push, pull and cut. A move runs 400 to 600ms on a cubic ease. The only flip is the
// surface change in beat 8. Nothing wipes, spins or drifts.
//
//   node scripts/film/capture.mjs [baseUrl]
import { webkit } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://localhost:3190';
const OUT = path.join(ROOT, 'out/film');
const IMG = path.join(OUT, 'img');
const FPS = 30;
const OUT_W = 1920, OUT_H = 1080;
const R169 = 9 / 16;
const PHONE_W = 390;

const BEATS = [
  [1, 0.00, 12.96], [2, 12.96, 24.54], [3, 24.54, 32.35], [4, 32.35, 50.02], [5, 50.02, 60.89],
  [6, 60.89, 76.47], [7, 76.47, 86.35], [8, 86.35, 97.41], [9, 97.41, 103.40], [10, 103.40, 117.09],
  [11, 117.09, 131.87],
];
const LINES_OPEN = [
  'Here is how a rental gets screened today.',
  'Applications arrive as PDFs in your inbox.',
  'You text each applicant twice for the documents they forgot.',
  'Your landlord asks who is good, and you are still reading.',
];
const LINES_CLOSE = [
  'We do not run credit checks, and we do not decide for you.',
  'We organize what came in, and we keep the record of what you did.',
  'On our call, tell me how your last rental went.',
];
const HIDE = `
  .rl-sandbox-bar { display: none !important; }
  nextjs-portal, #__next-build-watcher { display: none !important; }
  html { scroll-behavior: auto !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const frames = [];
const notes = [];
const shots = [];          // the cut, for the report
let shotCount = 0;

const shoot = async (target, tag, clip) => {
  const file = path.join(IMG, `${String(++shotCount).padStart(4, '0')}-${tag}.jpg`);
  let box = clip;
  if (clip && typeof target.evaluate === 'function') {
    const scrollY = await target.evaluate((y) => { window.scrollTo({ top: Math.max(0, y), behavior: 'instant' }); return window.scrollY; }, clip.y - 30);
    box = { x: clip.x, y: Math.max(0, clip.y - scrollY), width: clip.width, height: clip.height };
    const vh = await target.evaluate(() => window.innerHeight);
    if (box.y + box.height > vh) box.y = Math.max(0, vh - box.height);
  }
  await target.screenshot({ path: file, type: 'jpeg', quality: 92, ...(box ? { clip: box } : {}) });
  return file;
};
const put = (file, n) => frames.push({ file, frames: Math.max(1, n) });
const note = (beat, sentence, element, device, kind, seconds) => shots.push({ beat, sentence, element, device, kind, seconds: Number(seconds.toFixed(2)) });

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(IMG, { recursive: true });
  const browser = await webkit.launch();

  // One context per pixel ratio: the ratio is 1920 over the window's width, so every window is
  // rasterised at output size. A narrow window is a big subject, still sharp.
  const ctxCache = new Map();
  const ctxFor = async (width) => {
    const key = Math.round(width);
    if (!ctxCache.has(key)) ctxCache.set(key, await browser.newContext({ viewport: { width: PHONE_W, height: 900 }, deviceScaleFactor: Math.min(12, OUT_W / width), reducedMotion: 'no-preference' }));
    return ctxCache.get(key);
  };
  const pageCache = new Map();
  const open = async (route, width) => {
    const key = `${route}|${Math.round(width)}`;
    if (pageCache.has(key)) return pageCache.get(key);
    const page = await (await ctxFor(width)).newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(300);
    pageCache.set(key, page);
    return page;
  };
  // The box of a thing on the page, in page coordinates.
  const box = async (page, sel, text) => page.evaluate(({ sel, text }) => {
    const all = [...document.querySelectorAll(sel)];
    const el = text ? all.find((n) => new RegExp(text).test((n.textContent || '').trim())) : all[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height, cx: r.x + window.scrollX + r.width / 2, cy: r.y + window.scrollY + r.height / 2 };
  }, { sel, text: text || null });
  // A 16 by 9 window of the given width, centred on a box.
  const windowOn = (b, width, dy = 0) => {
    const w = Math.min(width, PHONE_W);
    const h = w * R169;
    const cx = b ? b.cx : PHONE_W / 2;
    const cy = (b ? b.cy : 400) + dy;
    return { x: Math.max(0, Math.min(PHONE_W - w, cx - w / 2)), y: Math.max(0, cy - h / 2), width: w, height: h };
  };
  const hold = async (page, tag, seconds, clip) => put(await shoot(page, tag, clip), Math.round(seconds * FPS));
  // A push or a pull: 400 to 600ms, eased.
  const movePlan = async (page, tag, seconds, from, to) => {
    const n = Math.max(2, Math.round(seconds * FPS));
    for (let i = 0; i < n; i++) {
      const t = ease(i / (n - 1));
      put(await shoot(page, `${tag}-${i}`, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, width: from.width + (to.width - from.width) * t, height: from.height + (to.height - from.height) * t }), 1);
    }
  };
  // The product's own motion, caught while it runs with its CSS slowed.
  const motion = async (page, tag, seconds, action, clip, { slowMs = 1500, count = 12 } = {}) => {
    const handle = await page.addStyleTag({ content: `*, *::before, *::after { transition-duration: ${slowMs}ms !important; animation-duration: ${slowMs}ms !important; }` });
    const files = [];
    const runner = (async () => { try { await action(); } catch (e) { notes.push(`${tag}: ${e.message.split('\n')[0]}`); } })();
    const t0 = Date.now();
    while (files.length < count && Date.now() - t0 < slowMs + 500) files.push(await shoot(page, `${tag}-${files.length}`, clip));
    await runner;
    await handle.evaluate((el) => el.remove()).catch(() => {});
    const total = Math.max(1, Math.round(seconds * FPS));
    const per = Math.max(1, Math.floor(total / files.length));
    files.forEach((file, i) => put(file, i === files.length - 1 ? total - per * (files.length - 1) : per));
  };

  const fontCss = () => `@font-face { font-family: 'Fraunces'; src: url(data:font/woff2;base64,${readFileSync(path.join(ROOT, 'public/fonts/fraunces-latin.woff2')).toString('base64')}) format('woff2'); font-weight: 100 900; font-display: block; }`;
  const dataUrl = (file) => `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
  const wordsPage = (bgFile, lines) => `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontCss()}
    html, body { margin: 0; height: 100%; background: #faf8f3; overflow: hidden; }
    #bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(10px) saturate(0.95); transform: scale(1.06); }
    #veil { position: fixed; inset: 0; background: rgba(250,248,243,0.42); }
    .wrap { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 12%; }
    p { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 54px; line-height: 1.24; letter-spacing: -0.02em; color: #0f0f10; margin: 0 0 26px; text-align: center; opacity: 0; transform: translateY(12px); text-shadow: 0 0 24px rgba(250,248,243,0.96), 0 0 52px rgba(250,248,243,0.9); }
    p.on { opacity: 1; transform: none; }
  </style></head><body><img id="bg" src="${dataUrl(bgFile)}" /><div id="veil"></div><div class="wrap">${lines.map((l) => `<p>${l}</p>`).join('')}</div></body></html>`;
  // The whole device, where the device is the point. The page fills the screen exactly.
  const devicePage = (src, bgFile) => `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; background: #faf8f3; overflow: hidden; }
    #bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(22px) saturate(0.95); transform: scale(1.1); }
    #veil { position: fixed; inset: 0; background: rgba(250,248,243,0.28); }
    .stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    .shell { padding: 14px; background: #101012; border-radius: 58px; box-shadow: 0 0 0 1px #2a2a2e, 0 40px 90px -30px rgba(15,15,16,0.55); line-height: 0; }
    iframe { display: block; width: 390px; height: 844px; border: 0; border-radius: 44px; background: #faf8f3; }
  </style></head><body><img id="bg" src="${dataUrl(bgFile)}" /><div id="veil"></div>
    <div class="stage"><div class="shell"><iframe id="stage" src="${src}"></iframe></div></div></body></html>`;
  // The one flip: the realtor's screen turning into the landlord's, both the product's own pixels.
  const flipPage = (frontFile, backFile) => `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; background: #faf8f3; overflow: hidden; }
    .stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; perspective: 2600px; }
    .card { position: relative; width: 1920px; height: 1080px; transform-style: preserve-3d; }
    .face { position: absolute; inset: 0; backface-visibility: hidden; }
    .face img { width: 100%; height: 100%; object-fit: cover; }
    .back { transform: rotateY(180deg); }
  </style></head><body>
    <div class="stage"><div class="card" id="card">
      <div class="face"><img src="${dataUrl(frontFile)}" /></div>
      <div class="face back"><img src="${dataUrl(backFile)}" /></div>
    </div></div></body></html>`;

  const runBeat = async (beat, fn) => {
    const budget = Math.round(beat[2] * FPS) - Math.round(beat[1] * FPS);
    const before = frames.reduce((n, f) => n + f.frames, 0);
    try { await fn(); } catch (e) { notes.push(`beat ${beat[0]}: ${e.message.split('\n')[0]}`); }
    const spent = frames.reduce((n, f) => n + f.frames, 0) - before;
    if (spent < budget && frames.length) frames.push({ file: frames[frames.length - 1].file, frames: budget - spent });
    else if (spent > budget) { let over = spent - budget; for (let i = frames.length - 1; i >= 0 && over > 0; i--) { const take = Math.min(over, frames[i].frames - 1); frames[i].frames -= take; over -= take; } }
    console.log(`beat ${beat[0]}: ${budget} frames`);
  };

  const LIST = '/demo/dashboard?listing=demo-carlaw';
  const CARD1 = '/demo/dashboard?listing=demo-carlaw&applicant=demo-link-1&panel=checklist';
  const DOCS1 = '/demo/dashboard?listing=demo-carlaw&applicant=demo-link-1&panel=documents';
  const CHECK10 = '/demo/dashboard?listing=demo-carlaw&applicant=demo-link-10&panel=checklist';

  const listWide = await open(LIST, PHONE_W);
  const cards = await box(listWide, '[aria-controls="applicant-demo-link-1-body"]');
  const openBg = await shoot(listWide, 'bg-open', windowOn(cards, PHONE_W, 60));

  // ── 1. the open: the listing page behind the words ──
  await runBeat(BEATS[0], async () => {
    const ctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(wordsPage(openBg, LINES_OPEN), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const holds = [2.5, 2.4, 2.4, 2.2];
    for (let i = 0; i < LINES_OPEN.length; i++) {
      await motion(page, `b1-line${i + 1}`, 0.4, async () => { await page.evaluate((n) => document.querySelectorAll('p')[n].classList.add('on'), i); await sleep(120); }, null, { slowMs: 700, count: 8 });
      await hold(page, `b1-hold${i + 1}`, holds[i]);
      note(1, LINES_OPEN[i], 'the listing page behind the words', 'full frame', i ? 'cut' : 'open', holds[i] + 0.4);
    }
    const lift = 15;   // 0.5s: the blur lifts and the scale settles into the cut
    for (let i = 0; i < lift; i++) {
      const t = ease(i / (lift - 1));
      await page.evaluate(({ t }) => {
        document.getElementById('bg').style.filter = `blur(${(10 * (1 - t)).toFixed(2)}px) saturate(${(0.95 + 0.05 * t).toFixed(3)})`;
        document.getElementById('bg').style.transform = `scale(${(1.06 - 0.06 * t).toFixed(4)})`;
        document.getElementById('veil').style.opacity = String(1 - t);
        document.querySelectorAll('p').forEach((p) => { p.style.opacity = String(1 - t); });
      }, { t });
      put(await shoot(page, `b1-lift-${i}`), 1);
    }
    note(1, 'into the cut', 'the blur lifting off the page', 'full frame', 'pull', 0.5);
    await ctx.close();
  });

  // ── 2. the link, and the tenant's form ──
  await runBeat(BEATS[1], async () => {
    const p = await open(LIST, PHONE_W);
    const invite = await box(p, 'input[aria-label="Invite link"]');
    const inviteRow = windowOn(invite, PHONE_W);
    await hold(p, 'b2-invite', 1.9, inviteRow);
    note(2, 'Rentletter gives each listing one link.', 'the invite link row', 'phone', 'hold', 1.9);
    await motion(p, 'b2-copy', 0.6, async () => { await p.getByRole('button', { name: 'Copy', exact: true }).first().click({ timeout: 4000 }); }, inviteRow, { slowMs: 800, count: 9 });
    note(2, 'Post it anywhere you already post.', 'Copy on the link', 'phone', 'motion', 0.6);
    await motion(p, 'b2-kit', 0.6, async () => { await p.getByRole('button', { name: /Post kit/ }).first().click({ timeout: 4000 }); }, inviteRow, { slowMs: 900, count: 9 });
    await p.waitForTimeout(300);
    const kit = await box(p, '#listing-post-kit');
    await hold(p, 'b2-kitrows', 1.7, windowOn(kit, PHONE_W, 40));
    note(2, 'Post it anywhere you already post.', 'the post kit, the short link and the QR', 'phone', 'cut', 1.7);
    const dctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1 });
    const dpage = await dctx.newPage();
    await dpage.setContent(devicePage(`${BASE}/apply/demo0000000000000001`, openBg), { waitUntil: 'domcontentloaded' });
    await dpage.waitForTimeout(2400);
    const f = dpage.frameLocator('#stage');
    for (const fr of dpage.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await f.getByLabel('Email').first().fill('priya.sharma@email.com').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await dpage.waitForTimeout(500);
    await f.getByLabel('Full name').first().fill('Priya Sharma').catch(() => {});
    await f.getByLabel('Date of birth').first().fill('1994-03-02').catch(() => {});
    await f.getByLabel('Phone').first().fill('4165550142').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await dpage.waitForTimeout(500);
    await f.getByLabel('Employment type').first().selectOption('full-time').catch(() => {});
    await f.getByLabel('Job title').first().fill('Registered Nurse').catch(() => {});
    await f.getByLabel('Employer').first().fill('Sunnybrook Health Sciences Centre').catch(() => {});
    await f.getByLabel('Annual income before tax', { exact: false }).first().fill('92000').catch(() => {});
    for (const fr of dpage.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await hold(dpage, 'b2-device', 2.6);
    note(2, 'The tenant fills the same application on their phone.', 'the apply form, the whole device', 'device', 'cut', 2.6);
    await dctx.close();
    const donePage = await open('/apply/demo0000000000000001?preview=done', PHONE_W);
    const docCard = await box(donePage, 'h2, h3', 'Add your documents');
    await hold(donePage, 'b2-docs', 2.4, windowOn(docCard, PHONE_W, 90));
    note(2, 'and adds their documents at the end.', 'the document card', 'phone', 'cut', 2.4);
  });

  // ── 3. what lands ──
  await runBeat(BEATS[2], async () => {
    const p = await open(LIST, PHONE_W);
    const card = await box(p, '[aria-controls="applicant-demo-link-1-body"]');
    await hold(p, 'b3-card', 2.0, windowOn(card, PHONE_W, 30));
    note(3, 'Every application lands on the listing page as a card.', "one applicant's card", 'phone', 'hold', 2.0);
    const p2 = await open(LIST, 240);
    const name = await box(p2, '[aria-controls="applicant-demo-link-1-body"] span[title]');
    const tight = windowOn(name, 240, 26);
    await movePlan(p2, 'b3-in', 0.5, windowOn(name, PHONE_W, 26), tight);
    await hold(p2, 'b3-name', 1.7, tight);
    note(3, 'The name, a number,', 'the name, the meter and the number', 'phone', 'push', 2.2);
    const line = await box(p, 'div', '^Verified income at');
    await hold(p, 'b3-line', 1.9, windowOn(line, PHONE_W));
    note(3, 'and one line saying where that person stands.', 'the state line under the name', 'phone', 'cut', 1.9);
  });

  // ── 4. the number, and what moved it ──
  await runBeat(BEATS[3], async () => {
    const p10 = await open(LIST, 190);
    const num = await box(p10, '[aria-controls="applicant-demo-link-1-body"] .t-d3');
    await hold(p10, 'b4-number', 2.3, windowOn(num, 190, 4));
    note(4, "The number is how this applicant's income and record fit this unit's rent", 'the Fit number and its label', 'phone', 'hold', 2.3);
    const p = await open(LIST, PHONE_W);
    const card = await box(p, '[aria-controls="applicant-demo-link-1-body"]');
    await movePlan(p, 'b4-out', 0.5, windowOn(num, 260, 4), windowOn(card, PHONE_W, 30));
    note(4, 'and the criteria you set.', 'out to the whole card', 'phone', 'pull', 0.5);
    const chips = await box(p, 'span', '^max 40% rent share$');
    await hold(p, 'b4-chips', 2.4, windowOn(chips, PHONE_W));
    note(4, 'and the criteria you set.', "the listing's own criteria chips", 'phone', 'cut', 2.4);
    const pc = await open(CARD1, PHONE_W);
    const rent = await box(pc, 'div', '^Rent to income$');
    await hold(pc, 'b4-rent', 2.2, windowOn(rent, PHONE_W, 20));
    note(4, 'It is not a credit score,', 'the rent to income row', 'phone', 'cut', 2.2);
    const income = await box(pc, 'div', '^Income \\(before tax\\)$');
    await hold(pc, 'b4-income', 2.0, windowOn(income, PHONE_W, 20));
    note(4, 'It is not a credit score,', 'the income row', 'phone', 'cut', 2.0);
    const after = await box(pc, 'div', '^After tax$');
    await hold(pc, 'b4-after', 1.8, windowOn(after, PHONE_W, 20));
    note(4, 'and it is not an opinion about the person.', 'the after tax row', 'phone', 'cut', 1.8);
    const emp = await box(pc, 'div', '^Employer$');
    await hold(pc, 'b4-emp', 2.2, windowOn(emp, PHONE_W, 20));
    note(4, 'and it is not an opinion about the person.', 'the employer row', 'phone', 'cut', 2.2);
  });

  // ── 5. the documents ──
  await runBeat(BEATS[4], async () => {
    const p = await open(DOCS1, PHONE_W);
    const line = await box(p, 'span', '^Documents ·');
    const onLine = windowOn(line, PHONE_W, 20);
    await hold(p, 'b5-line', 2.0, onLine);
    note(5, 'When documents arrive they are read and matched to what the applicant typed.', 'the documents line', 'phone', 'hold', 2.0);
    const fold = p.getByRole('button', { name: /What the documents say/ }).first();
    if ((await fold.getAttribute('aria-expanded')) === 'true') { await fold.click().catch(() => {}); await p.waitForTimeout(400); }
    await motion(p, 'b5-fold', 0.6, async () => { await fold.click({ timeout: 4000 }); }, onLine, { slowMs: 900, count: 9 });
    await p.waitForTimeout(300);
    note(5, 'read and matched to what the applicant typed', 'the fold opening', 'phone', 'motion', 0.6);
    const rows = ['^Employer$', '^Job title$', '^Income$'];
    const secs = [1.9, 1.5, 1.9];
    for (let i = 0; i < rows.length; i++) {
      const r = await box(p, '#applicant-demo-link-1-body div', rows[i]);
      if (!r) { notes.push(`beat 5: no row for ${rows[i]}`); continue; }
      await hold(p, `b5-row${i}`, secs[i], windowOn(r, PHONE_W, 22));
      note(5, 'Income on the pay stubs, the employer on the letter, the name on every document.', `the ${rows[i].replace(/[\^$]/g, '')} comparison row`, 'phone', 'cut', secs[i]);
    }
    const held = await box(p, 'div', 'Deleted in');
    await hold(p, 'b5-held', 2.2, windowOn(held, PHONE_W, 10));
    note(5, 'The files are held for you for fourteen days, then they are deleted.', 'the held list with its countdown', 'phone', 'cut', 2.2);
  });

  // ── 6. the checklist, and the tick ──
  await runBeat(BEATS[5], async () => {
    const p = await open(CHECK10, PHONE_W);
    const head = await box(p, 'div', '^You verify. Documents only match.$') || await box(p, 'div', 'Screening checklist');
    await hold(p, 'b6-head', 2.2, windowOn(head, PHONE_W, 40));
    note(6, 'Then you do the part that counts.', 'the checklist and its one line', 'phone', 'hold', 2.2);
    const emp = await box(p, '#applicant-demo-link-10-body div', '^Employer$');
    await hold(p, 'b6-emp', 2.2, windowOn(emp, PHONE_W, 26));
    note(6, 'You call the employer.', 'the employer row', 'phone', 'cut', 2.2);
    const land = await box(p, '#applicant-demo-link-10-body div', '^Previous landlord$');
    await hold(p, 'b6-land', 2.2, windowOn(land, PHONE_W, 26));
    note(6, 'You call the last landlord.', 'the previous landlord row, and Ask by email', 'phone', 'cut', 2.2);
    const pillBox = await p.evaluate(() => { const b = [...document.querySelectorAll('#applicant-demo-link-10-body button[aria-pressed="false"]')].find((x) => /Called employer/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + window.scrollX + r.width / 2, cy: r.y + window.scrollY + r.height / 2 }; });
    const p8 = await open(CHECK10, 260);
    const onPill = windowOn(pillBox, 260);
    await movePlan(p8, 'b6-topill', 0.5, windowOn(pillBox, PHONE_W), onPill);
    await hold(p8, 'b6-before', 1.4, onPill);
    note(6, 'You tick what you confirmed.', 'in on the employer pill', 'phone', 'push', 1.9);
    const pill = p8.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called employer' }).first();
    await motion(p8, 'b6-tick', 0.6, async () => { await pill.click({ timeout: 4000 }); }, onPill, { slowMs: 900, count: 9 });
    await p8.waitForTimeout(300);
    await hold(p8, 'b6-after', 2.0, onPill);
    note(6, 'You tick what you confirmed.', 'the pill turning to Confirmed, with its date', 'phone', 'motion', 2.6);
    const said = await box(p8, '#applicant-demo-link-10-body div', '^Said: ');
    await hold(p8, 'b6-said', 2.4, windowOn(said, PHONE_W, 10));
    note(6, 'The checklist keeps the two apart: what they said, and what the documents say.', 'the Said and Docs line', 'phone', 'cut', 2.4);
  });

  // ── 7. verified ──
  await runBeat(BEATS[6], async () => {
    const p8 = await open(CHECK10, 260);
    const confirmed = await p8.evaluate(() => { const b = [...document.querySelectorAll('#applicant-demo-link-10-body button[aria-pressed="true"]')].find((x) => /Confirmed/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + window.scrollX + r.width / 2, cy: r.y + window.scrollY + r.height / 2 }; });
    await hold(p8, 'b7-pill', 2.6, windowOn(confirmed, 260));
    note(7, 'Rentletter does not verify anyone. You do.', 'the tick, and the date it carries', 'phone', 'hold', 2.6);
    const p = await open(CHECK10, PHONE_W);
    const label = await box(p, '[aria-controls="applicant-demo-link-10-body"] span', 'verified|VERIFIED');
    const head = await box(p, '[aria-controls="applicant-demo-link-10-body"]');
    await hold(p, 'b7-label', 2.4, windowOn(label || head, PHONE_W, 8));
    note(7, 'The word verified appears after your call,', 'the label on the card header', 'phone', 'cut', 2.4);
    const landBox = await p.evaluate(() => { const b = [...document.querySelectorAll('#applicant-demo-link-10-body button[aria-pressed="false"]')].find((x) => /Called landlord/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + window.scrollX + r.width / 2, cy: r.y + window.scrollY + r.height / 2 }; });
    const land = p.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called landlord' }).first();
    await motion(p, 'b7-landlord', 0.6, async () => { await land.click({ timeout: 4000 }); }, windowOn(landBox, 300), { slowMs: 900, count: 9 });
    await p.waitForTimeout(400);
    note(7, 'and every tick carries your name and the date.', 'the landlord tick', 'phone', 'motion', 0.6);
    const p10 = await open(CHECK10, 190);
    const num = await box(p10, '[aria-controls="applicant-demo-link-10-body"] .t-d3');
    await hold(p10, 'b7-number', 2.6, windowOn(num, 190, 4));
    note(7, 'and every tick carries your name and the date.', 'the number the tick moved', 'phone', 'cut', 2.6);
  });

  // ── 8. the send, the one flip, and the landlord's page ──
  await runBeat(BEATS[7], async () => {
    const p = await open(LIST, PHONE_W);
    const report = await box(p, '#report');
    await hold(p, 'b8-send', 2.2, windowOn(report, PHONE_W, 60));
    note(8, 'When you are ready, send your landlord a private page.', 'the Landlord section and its red button', 'phone', 'hold', 2.2);
    const bctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1 });
    const front = await bctx.newPage();
    await front.setContent(devicePage(`${BASE}${LIST}`, openBg), { waitUntil: 'domcontentloaded' });
    await front.waitForTimeout(2200);
    for (const fr of front.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await front.frameLocator('#stage').locator('#report').scrollIntoViewIfNeeded().catch(() => {});
    await front.waitForTimeout(400);
    const frontFile = await shoot(front, 'b8-face-front');
    const backPage = await bctx.newPage();
    await backPage.setContent(devicePage(`${BASE}/r/DEMO-demo-carlaw`, openBg), { waitUntil: 'domcontentloaded' });
    await backPage.waitForTimeout(2400);
    for (const fr of backPage.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    const backFile = await shoot(backPage, 'b8-face-back');
    const flip = await bctx.newPage();
    await flip.setContent(flipPage(frontFile, backFile), { waitUntil: 'domcontentloaded' });
    await flip.waitForTimeout(600);
    const steps = 15;   // 0.5s, the one flip in the film
    for (let i = 0; i < steps; i++) {
      const t = ease(i / (steps - 1));
      await flip.evaluate((deg) => { document.getElementById('card').style.transform = `rotateY(${deg}deg)`; }, t * 180);
      put(await shoot(flip, `b8-flip-${i}`), 1);
    }
    note(8, 'send your landlord a private page', "the realtor's screen turning into the landlord's", 'device', 'flip', 0.5);
    await bctx.close();
    const lp = await open('/r/DEMO-demo-carlaw', PHONE_W);
    const brand = await box(lp, 'div', 'Sarah Chen');
    await hold(lp, 'b8-brand', 2.2, windowOn(brand, PHONE_W, 20));
    note(8, 'in your words, with your logo and your colours,', "the realtor's name and mark on the landlord's page", 'phone', 'cut', 2.2);
    const para = await box(lp, 'p', 'income|rent');
    await hold(lp, 'b8-para', 2.4, windowOn(para, PHONE_W, 20));
    note(8, 'One paragraph for each applicant,', 'the paragraph the landlord reads', 'phone', 'cut', 2.4);
    const crit = await box(lp, 'div', 'rent share|Rent share|Income');
    await hold(lp, 'b8-criteria', 2.2, windowOn(crit, PHONE_W, 40));
    note(8, 'with the criteria rows underneath.', 'the criteria rows', 'phone', 'cut', 2.2);
  });

  // ── 9. the two buttons ──
  await runBeat(BEATS[8], async () => {
    const lp = await open('/r/DEMO-demo-carlaw', PHONE_W);
    const meet = await box(lp, 'button', "I'd like to meet them");
    const onButtons = windowOn(meet, PHONE_W, 14);
    await hold(lp, 'b9-buttons', 1.8, onButtons);
    note(9, 'Two buttons sit under each one. Wants to meet, or not for me.', 'the two buttons', 'phone', 'hold', 1.8);
    await motion(lp, 'b9-tap', 0.6, async () => { await lp.getByRole('button', { name: /I'd like to meet them/ }).first().click({ timeout: 4000 }); }, onButtons, { slowMs: 900, count: 9 });
    await lp.waitForTimeout(400);
    note(9, 'When your landlord taps one,', 'the tap', 'phone', 'motion', 0.6);
    const p = await open(LIST, PHONE_W);
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1400);
    await p.addStyleTag({ content: HIDE }).catch(() => {});
    const answer = await box(p, 'div', '^Landlord: ') || await box(p, '[aria-controls="applicant-demo-link-1-body"]');
    await hold(p, 'b9-answer', 2.4, windowOn(answer, PHONE_W, 10));
    note(9, "it shows up on that applicant's card.", "the landlord's answer on the card", 'phone', 'cut', 2.4);
  });

  // ── 10. rented, and the pipeline ──
  await runBeat(BEATS[9], async () => {
    const p = await open(LIST, PHONE_W);
    const details = p.getByRole('button', { name: 'Details', exact: true }).first();
    if (await details.count() && (await details.getAttribute('aria-expanded')) !== 'true') { await details.click().catch(() => {}); await p.waitForTimeout(600); }
    const rBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Mark as rented/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + window.scrollX + r.width / 2, cy: r.y + window.scrollY + r.height / 2 }; });
    const onRented = windowOn(rBox, PHONE_W);
    await hold(p, 'b10-rented', 1.8, onRented);
    note(10, 'Mark the unit rented,', 'the rented control', 'phone', 'hold', 1.8);
    await motion(p, 'b10-sheet', 0.6, async () => { await p.getByRole('button', { name: 'Mark as rented' }).first().click({ timeout: 4000 }); }, onRented, { slowMs: 900, count: 9 });
    await p.waitForTimeout(400);
    const sheetY = await p.evaluate(() => window.scrollY + window.innerHeight / 2);
    await hold(p, 'b10-who', 2.4, { x: 0, y: Math.max(0, sheetY - PHONE_W * R169 / 2), width: PHONE_W, height: PHONE_W * R169 });
    note(10, 'and everyone who did not get it hears back.', 'who got it, and who did not', 'phone', 'motion and hold', 3.0);
    await p.keyboard.press('Escape').catch(() => {});
    const dash = await open('/demo/dashboard', PHONE_W);
    const pipe = await box(dash, '#people');
    await hold(dash, 'b10-pipeline', 2.6, windowOn(pipe, PHONE_W, 30));
    note(10, 'The ones who ask to be kept in mind stay in your pipeline,', 'the pipeline card', 'phone', 'cut', 2.6);
    const pending = await box(dash, '#people div', 'no answer yet');
    await hold(dash, 'b10-pending', 2.0, windowOn(pending, PHONE_W, 6));
    note(10, 'stay in your pipeline,', 'the row that was asked and has not answered', 'phone', 'cut', 2.0);
    const row = await box(dash, '#people li', 'Nadia');
    await hold(dash, 'b10-invite', 1.8, windowOn(row, PHONE_W, 10));
    note(10, 'ready for the next unit you list.', 'a person waiting for the next unit', 'phone', 'cut', 1.8);
  });

  // ── 11. the close ──
  await runBeat(BEATS[10], async () => {
    const dash = await open('/demo/dashboard', PHONE_W);
    const greet = await box(dash, '.dash-ink');
    const closeBg = await shoot(dash, 'bg-close', windowOn(greet, PHONE_W, 120));
    const ctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(wordsPage(closeBg, LINES_CLOSE), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { document.getElementById('bg').style.filter = 'none'; document.getElementById('bg').style.transform = 'scale(1)'; document.getElementById('veil').style.opacity = '0'; });
    await page.waitForTimeout(700);
    await hold(page, 'b11-dash', 2.0);
    note(11, 'into the close', 'the dashboard at rest', 'full frame', 'hold', 2.0);
    const settle = 15;
    for (let i = 0; i < settle; i++) {
      const t = ease(i / (settle - 1));
      await page.evaluate(({ t }) => {
        document.getElementById('bg').style.filter = `blur(${(10 * t).toFixed(2)}px) saturate(${(1 - 0.05 * t).toFixed(3)})`;
        document.getElementById('bg').style.transform = `scale(${(1 + 0.06 * t).toFixed(4)})`;
        document.getElementById('veil').style.opacity = String(t);
      }, { t });
      put(await shoot(page, `b11-soften-${i}`), 1);
    }
    note(11, 'into the close', 'the dashboard softening back', 'full frame', 'push', 0.5);
    const holds = [2.6, 2.6, 3.6];
    for (let i = 0; i < LINES_CLOSE.length; i++) {
      await motion(page, `b11-line${i + 1}`, 0.4, async () => { await page.evaluate((n) => document.querySelectorAll('p')[n].classList.add('on'), i); await sleep(120); }, null, { slowMs: 700, count: 8 });
      await hold(page, `b11-hold${i + 1}`, holds[i]);
      note(11, LINES_CLOSE[i], 'the words over the dashboard', 'full frame', 'cut', holds[i] + 0.4);
    }
    await ctx.close();
  });

  await browser.close();
  const total = frames.reduce((n, f) => n + f.frames, 0);
  const cuts = shots.filter((s) => /cut|flip|open/.test(s.kind)).length;
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ fps: FPS, width: OUT_W, height: OUT_H, totalFrames: total, seconds: total / FPS, beats: BEATS, shots, cuts, notes, frames }, null, 1));
  console.log(`frames ${total}, ${(total / FPS).toFixed(2)}s, images ${shotCount}, shots ${shots.length}, cuts ${cuts}, average shot ${(total / FPS / shots.length).toFixed(2)}s`);
  if (notes.length) console.log('NOTES\n' + notes.map((n) => '  ' + n).join('\n'));
}

await main();
