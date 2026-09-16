// scripts/film/capture.mjs
// Drives the real sandbox in WebKit and writes the film's picture frames to out/film. Every frame
// is the running product at its own route; the only frames that are not the product are the words
// in beats 1 and 11, which sit over the product, blurred, never over a bare canvas.
//
// Framing: a desktop moment is captured at a viewport whose own content column fills the width,
// with a 16 by 9 clip around the subject and a device pixel ratio set from the tightest clip, so
// the picture is sampled above 1920 and never upscaled. A phone moment renders the 390 page inside
// a phone frame whose screen area is exactly the page's box, on a backdrop of the same page,
// blurred, so no frame is a small thing in an empty field.
//
// Motion: inside a beat the camera moves, a push in or a pull out eased in and out over about
// 800ms, captured frame by frame by stepping the clip rectangle. Across a beat boundary the cut is
// hard, so the picture lands on the voice. A tap or a fold still happens about a third of the way
// into its beat, captured while the product animates with its CSS slowed so the capture rate covers
// the movement.
//
//   node scripts/film/capture.mjs [baseUrl]
//
// Writes out/film/img/*.jpg and out/film/manifest.json, which scripts/film/build.mjs encodes.
import { webkit } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://localhost:3190';
const OUT = path.join(ROOT, 'out/film');
const IMG = path.join(OUT, 'img');
const FPS = 30;
const OUT_W = 1920, OUT_H = 1080;
const R169 = 9 / 16;

// The narration's own pauses, from ffmpeg silencedetect on public/film/narration.mp3.
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

// The dev server's own badge and the sandbox's banner are not the product.
const HIDE = `
  .rl-sandbox-bar { display: none !important; }
  nextjs-portal, #__next-build-watcher { display: none !important; }
  html { scroll-behavior: auto !important; }
`;
// The phone frame: the bezel's inner box IS the screen, and the page fills it. The inner radius is
// the outer radius less the bezel, so the page's corners follow the bezel's curve exactly.
const PHONE = { w: 390, h: 844, bezel: 14, radius: 58 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // in and out, never linear
const frames = [];        // { file, frames }
const notes = [];
const plan = [];          // what each beat framed, for the report
let shotCount = 0;

const shoot = async (target, tag, clip) => {
  const file = path.join(IMG, `${String(++shotCount).padStart(4, '0')}-${tag}.jpg`);
  let box = clip;
  if (clip && typeof target.evaluate === 'function') {
    // The clip is in page coordinates; a screenshot clips inside the viewport, so scroll to it first.
    const scrollY = await target.evaluate((y) => { window.scrollTo({ top: Math.max(0, y), behavior: 'instant' }); return window.scrollY; }, clip.y - 40);
    box = { x: clip.x, y: Math.max(0, clip.y - scrollY), width: clip.width, height: clip.height };
    const vh = await target.evaluate(() => window.innerHeight);
    if (box.y + box.height > vh) box.y = Math.max(0, vh - box.height);
  }
  await target.screenshot({ path: file, type: 'jpeg', quality: 92, ...(box ? { clip: box } : {}) });
  return file;
};
const push = (file, n) => frames.push({ file, frames: Math.max(1, n) });
const hold = async (target, tag, seconds, clip) => push(await shoot(target, tag, clip), Math.round(seconds * FPS));
// A camera move: the same page, the clip rectangle walked from one box to the other.
const move = async (target, tag, seconds, from, to) => {
  const n = Math.max(2, Math.round(seconds * FPS));
  for (let i = 0; i < n; i++) {
    const t = ease(i / (n - 1));
    const clip = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      width: from.width + (to.width - from.width) * t,
      height: from.height + (to.height - from.height) * t,
    };
    push(await shoot(target, `${tag}-${i}`, clip), 1);
  }
};
// The product's own motion, caught while it runs with its CSS slowed, then laid over the beat's time.
const motion = async (page, target, tag, seconds, action, clip, { slowMs = 2000, shots = 14 } = {}) => {
  const handle = await page.addStyleTag({ content: `*, *::before, *::after { transition-duration: ${slowMs}ms !important; animation-duration: ${slowMs}ms !important; }` });
  const files = [];
  const runner = (async () => { try { await action(); } catch (e) { notes.push(`${tag}: ${e.message.split('\n')[0]}`); } })();
  const t0 = Date.now();
  while (files.length < shots && Date.now() - t0 < slowMs + 600) files.push(await shoot(target, `${tag}-${files.length}`, clip));
  await runner;
  await handle.evaluate((el) => el.remove()).catch(() => {});
  const total = Math.max(1, Math.round(seconds * FPS));
  const per = Math.max(1, Math.floor(total / files.length));
  files.forEach((file, i) => push(file, i === files.length - 1 ? total - per * (files.length - 1) : per));
};
const beatFrames = ([, s, e]) => Math.round(e * FPS) - Math.round(s * FPS);

// A 16 by 9 clip of the given width, centred on a box where it can be.
const clipOn = (vw, pageH, width, centreY) => {
  const w = Math.min(width, vw);
  const h = w * R169;
  return { x: Math.max(0, Math.min(vw - w, (vw - w) / 2)), y: Math.max(0, Math.min(Math.max(0, pageH - h), centreY - h / 2)), width: w, height: h };
};

const dataUrl = (file) => `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
const fontCss = () => {
  const b64 = (f) => readFileSync(path.join(ROOT, 'public/fonts', f)).toString('base64');
  return `@font-face { font-family: 'Fraunces'; src: url(data:font/woff2;base64,${b64('fraunces-latin.woff2')}) format('woff2'); font-weight: 100 900; font-display: block; }`;
};
// The words over the product: the page sits behind, blurred and a touch larger, and lifts at the cut.
const wordsPage = (bgFile, lines) => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontCss()}
  html, body { margin: 0; height: 100%; background: #faf8f3; overflow: hidden; }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(10px) saturate(0.95) brightness(1.0); transform: scale(1.06); transform-origin: center; }
  #veil { position: fixed; inset: 0; background: rgba(250,248,243,0.42); }
  .wrap { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 12%; }
  p { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 54px; line-height: 1.24; letter-spacing: -0.02em; color: #0f0f10; margin: 0 0 26px; text-align: center; opacity: 0; transform: translateY(12px); text-shadow: 0 0 24px rgba(250,248,243,0.96), 0 0 52px rgba(250,248,243,0.9); }
  p.on { opacity: 1; transform: none; }
</style></head><body>
  <img id="bg" src="${dataUrl(bgFile)}" />
  <div id="veil"></div>
  <div class="wrap">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
</body></html>`;
// The 390 page inside a phone whose screen is exactly its box, on a backdrop of the same page.
const phonePage = (src, bgFile) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: #faf8f3; overflow: hidden; }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(22px) saturate(0.95) brightness(0.99); transform: scale(1.1); }
  #veil { position: fixed; inset: 0; background: rgba(250,248,243,0.28); }
  .stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
  .shell { padding: ${PHONE.bezel}px; background: #101012; border-radius: ${PHONE.radius}px; box-shadow: 0 0 0 1px #2a2a2e, 0 40px 90px -30px rgba(15,15,16,0.55); line-height: 0; }
  iframe { display: block; width: ${PHONE.w}px; height: ${PHONE.h}px; border: 0; border-radius: ${PHONE.radius - PHONE.bezel}px; background: #faf8f3; }
</style></head><body>
  ${bgFile ? `<img id="bg" src="${dataUrl(bgFile)}" /><div id="veil"></div>` : ''}
  <div class="stage"><div class="shell"><iframe id="stage" src="${src}"></iframe></div></div>
</body></html>`;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(IMG, { recursive: true });
  const browser = await webkit.launch();

  // A desktop page: the viewport is the framing width, so the product's own column fills it, and the
  // pixel ratio is set from the tightest clip so nothing is ever upscaled.
  const deskCtx = async (vw, vh, tightest) => browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: Math.min(3, OUT_W / tightest), reducedMotion: 'no-preference' });
  const openDesk = async (ctx, route, { scrollTo = null } = {}) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1400);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    if (scrollTo) await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollTo);
    await page.waitForTimeout(400);
    return page;
  };
  // Where a thing sits on the page, in CSS pixels, for the clip.
  const boxOf = async (page, selector) => page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height, cy: r.y + window.scrollY + r.height / 2 };
  }, selector);
  const pageH = async (page) => page.evaluate(() => document.documentElement.scrollHeight);

  // The phone stage, at 1600 by 900 with a pixel ratio of 1.2, so the phone stands 868 of 900 tall.
  const PH_VW = 1600, PH_VH = 900;
  const phoneCtx = await browser.newContext({ viewport: { width: PH_VW, height: PH_VH }, deviceScaleFactor: OUT_W / PH_VW, reducedMotion: 'no-preference' });
  const phonePages = [];
  const openPhone = async (route, bgFile) => {
    const page = await phoneCtx.newPage();
    phonePages.push(page);
    await page.setContent(phonePage(`${BASE}${route}`, bgFile), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const f = page.frameLocator('#stage');
    await f.locator('body').waitFor({ timeout: 20000 }).catch(() => {});
    for (const fr of page.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(500);
    return { page, f };
  };
  // A still of a route at 390 wide, used as the blurred backdrop behind the phone.
  const phoneShot = async (route, tag) => {
    const ctx = await browser.newContext({ viewport: { width: PHONE.w, height: PHONE.h }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1600);
    await p.addStyleTag({ content: HIDE }).catch(() => {});
    const file = await shoot(p, `bg-${tag}`);
    await ctx.close();
    return file;
  };

  const runBeat = async (beat, fn) => {
    const budget = beatFrames(beat);
    const before = frames.reduce((n, f) => n + f.frames, 0);
    try { await fn(); } catch (e) { notes.push(`beat ${beat[0]}: ${e.message.split('\n')[0]}`); }
    let spent = frames.reduce((n, f) => n + f.frames, 0) - before;
    if (spent < budget && frames.length) frames.push({ file: frames[frames.length - 1].file, frames: budget - spent });
    else if (spent > budget) { let over = spent - budget; for (let i = frames.length - 1; i >= 0 && over > 0; i--) { const take = Math.min(over, frames[i].frames - 1); frames[i].frames -= take; over -= take; } }
    console.log(`beat ${beat[0]}: ${budget} frames`);
  };

  // ── the backdrop the open and the close sit on, and the phone backdrops ──
  const listCtx = await deskCtx(820, 1100, 780);
  const listPage = await openDesk(listCtx, '/demo/dashboard?listing=demo-carlaw');
  const applicants = await boxOf(listPage, '#applicants, .rl-card:nth-of-type(2)') || { cy: 900 };
  const openBg = await shoot(listPage, 'bg-open', clipOn(820, await pageH(listPage), 820, applicants.cy));
  const phoneBg = openBg;   // the phone stands on the realtor's page, blurred
  plan.push({ beat: 1, subject: 'the listing page behind the words', viewport: 820, clip: '820 by 461 at the applicants', scale: (OUT_W / 820).toFixed(2) });

  // ── 1. the words over the product ──
  await runBeat(BEATS[0], async () => {
    const ctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.setContent(wordsPage(openBg, LINES_OPEN), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    for (let i = 0; i < LINES_OPEN.length; i++) {
      await motion(page, page, `b1-line${i + 1}`, 0.5, async () => { await page.evaluate((n) => document.querySelectorAll('p')[n].classList.add('on'), i); await sleep(150); }, null, { slowMs: 900, shots: 9 });
      await hold(page, `b1-hold${i + 1}`, i === LINES_OPEN.length - 1 ? 1.9 : 2.0);
    }
    // the blur lifts and the scale settles into the cut
    const lift = 24;
    for (let i = 0; i < lift; i++) {
      const t = ease(i / (lift - 1));
      await page.evaluate(({ t }) => {
        document.getElementById('bg').style.filter = `blur(${(10 * (1 - t)).toFixed(2)}px) saturate(${(0.95 + 0.05 * t).toFixed(3)})`;
        document.getElementById('bg').style.transform = `scale(${(1.06 - 0.06 * t).toFixed(4)})`;
        document.getElementById('veil').style.opacity = String(1 - t);
        document.querySelectorAll('p').forEach((p) => { p.style.opacity = String(1 - t); });
      }, { t });
      push(await shoot(page, `b1-lift-${i}`), 1);
    }
    await ctx.close();
  });

  // ── 2. the link, then the form ──
  await runBeat(BEATS[1], async () => {
    const H = await pageH(listPage);
    const card = await boxOf(listPage, '.rl-card');
    const invite = await boxOf(listPage, 'input[aria-label="Invite link"]');
    const wide = clipOn(820, H, 820, (card?.cy ?? 300));
    const tight = clipOn(820, H, 780, (invite?.cy ?? 400));
    plan.push({ beat: 2, subject: 'the header card, then the invite row', viewport: 820, clip: `${Math.round(wide.width)} by ${Math.round(wide.height)} to ${Math.round(tight.width)} by ${Math.round(tight.height)}`, scale: `${(OUT_W / wide.width).toFixed(2)} to ${(OUT_W / tight.width).toFixed(2)}` });
    await hold(listPage, 'b2-card', 1.6, wide);
    await move(listPage, 'b2-in', 0.8, wide, tight);
    await motion(listPage, listPage, 'b2-copy', 1.1, async () => { await listPage.getByRole('button', { name: 'Copy', exact: true }).first().click({ timeout: 5000 }); }, tight, { slowMs: 1200, shots: 10 });
    await motion(listPage, listPage, 'b2-kit', 1.5, async () => { await listPage.getByRole('button', { name: /Post kit/ }).first().click({ timeout: 5000 }); }, tight, { slowMs: 1800, shots: 12 });
    await hold(listPage, 'b2-kitopen', 0.8, tight);
    const { page, f } = await openPhone('/apply/demo0000000000000001', phoneBg);
    await f.getByLabel('Email').first().fill('priya.sharma@email.com').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    await f.getByLabel('Full name').first().fill('Priya Sharma').catch(() => {});
    await f.getByLabel('Date of birth').first().fill('1994-03-02').catch(() => {});
    await f.getByLabel('Phone').first().fill('4165550142').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    await hold(page, 'b2-step3', 1.4);
    await f.getByLabel('Employment type').first().selectOption('full-time').catch(() => {});
    await f.getByLabel('Job title').first().fill('Registered Nurse').catch(() => {});
    await f.getByLabel('Employer').first().fill('Sunnybrook Health Sciences Centre').catch(() => {});
    await f.getByLabel('Annual income before tax', { exact: false }).first().fill('92000').catch(() => {});
    for (const fr of page.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await hold(page, 'b2-step3-filled', 1.6);
    await motion(page, page, 'b2-continue', 1.0, async () => { await f.getByRole('button', { name: 'Continue' }).first().click({ timeout: 5000 }); }, null, { slowMs: 1100, shots: 9 });
    plan.push({ beat: 2, subject: 'the apply form on the phone', viewport: `${PH_VW} by ${PH_VH}`, clip: 'the whole stage', scale: (OUT_W / PH_VW).toFixed(2) });
  });

  // ── 3. the documents, then the cards ──
  await runBeat(BEATS[2], async () => {
    const { page, f } = await openPhone('/apply/demo0000000000000001?preview=done', phoneBg);
    await f.getByText('Add your documents').first().scrollIntoViewIfNeeded().catch(() => {});
    for (const fr of page.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b3-docs', 2.4);
    notes.push('beat 3: the sandbox mints no upload token, so the beat holds on the document card the tenant sees instead of files landing');
    const ctx = await deskCtx(820, 1100, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw');
    const H = await pageH(p);
    const list = await boxOf(p, '#applicants, .rl-card:nth-of-type(2)');
    const wide = clipOn(820, H, 820, (list?.cy ?? 900));
    const tight = clipOn(820, H, 790, (list?.y ?? 700) + 260);
    plan.push({ beat: 3, subject: 'the applicants section', viewport: 820, clip: `${Math.round(wide.width)} by ${Math.round(wide.height)} to ${Math.round(tight.width)} by ${Math.round(tight.height)}`, scale: `${(OUT_W / wide.width).toFixed(2)} to ${(OUT_W / tight.width).toFixed(2)}` });
    await motion(p, p, 'b3-cards', 2.2, async () => { await p.reload({ waitUntil: 'domcontentloaded' }); await p.addStyleTag({ content: HIDE }); await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, (list?.y ?? 700) - 120)); }, wide, { slowMs: 2200, shots: 16 });
    await move(p, 'b3-in', 0.8, wide, tight);
    await ctx.close();
  });

  // ── 4. one card, then the criteria ──
  await runBeat(BEATS[3], async () => {
    const ctx = await deskCtx(820, 1200, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw');
    const H = await pageH(p);
    const card = await boxOf(p, '[aria-controls="applicant-demo-link-1-body"]');
    const wide = clipOn(820, H, 820, (card?.cy ?? 800));
    const tight = clipOn(820, H, 780, (card?.cy ?? 800));
    plan.push({ beat: 4, subject: "the first applicant's card, then the criteria rows", viewport: 820, clip: `${Math.round(wide.width)} by ${Math.round(wide.height)} to ${Math.round(tight.width)} by ${Math.round(tight.height)}`, scale: `${(OUT_W / wide.width).toFixed(2)} to ${(OUT_W / tight.width).toFixed(2)}` });
    await hold(p, 'b4-card-wide', 1.6, wide);
    await move(p, 'b4-in', 0.9, wide, tight);
    await hold(p, 'b4-card', 3.4, tight);
    await move(p, 'b4-out', 0.9, tight, wide);
    const details = p.getByRole('button', { name: 'Details', exact: true }).first();
    const dBox = await boxOf(p, '#listing-details');
    const dWide = clipOn(820, H, 820, (dBox?.y ?? 400) + 60);
    await motion(p, p, 'b4-details', 2.0, async () => { await details.click({ timeout: 5000 }); }, dWide, { slowMs: 2200, shots: 14 });
    await p.waitForTimeout(400);
    const after = await boxOf(p, '#listing-details');
    const rows = clipOn(820, await pageH(p), 790, (after?.y ?? 400) + 180);
    await move(p, 'b4-rows', 0.8, dWide, rows);
    await hold(p, 'b4-criteria', 4.0, rows);
    await ctx.close();
  });

  // ── 5. the documents panel ──
  await runBeat(BEATS[4], async () => {
    const ctx = await deskCtx(820, 1200, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw&applicant=demo-link-1&panel=documents');
    const H = await pageH(p);
    const line = await boxOf(p, '#applicant-demo-link-1-body');
    const docLine = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find((s) => /^Documents ·/.test(s.textContent || '')); if (!el) return null; const r = el.getBoundingClientRect(); return { cy: r.y + window.scrollY + r.height / 2 }; });
    const at = clipOn(820, H, 820, (docLine?.cy ?? line?.cy ?? 800));
    plan.push({ beat: 5, subject: 'the documents line and the fold', viewport: 820, clip: `${Math.round(at.width)} by ${Math.round(at.height)}`, scale: (OUT_W / at.width).toFixed(2) });
    await hold(p, 'b5-line', 2.2, at);
    const fold = p.getByRole('button', { name: /What the documents say/ }).first();
    if ((await fold.getAttribute('aria-expanded')) === 'true') { await fold.click().catch(() => {}); await p.waitForTimeout(500); }
    await motion(p, p, 'b5-fold', 2.0, async () => { await fold.click({ timeout: 5000 }); }, at, { slowMs: 2000, shots: 14 });
    await p.waitForTimeout(400);
    const said = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].find((d) => /^Said:/.test((d.textContent || '').trim())); if (!el) return null; const r = el.getBoundingClientRect(); return { cy: r.y + window.scrollY + r.height / 2 }; });
    const rows = clipOn(820, await pageH(p), 790, (said?.cy ?? at.y + 200));
    await move(p, 'b5-rows', 0.8, at, rows);
    await hold(p, 'b5-said', 2.4, rows);
    const held = await boxOf(p, '#applicant-demo-link-1-body');
    const heldClip = clipOn(820, await pageH(p), 800, (held?.cy ?? rows.y) + 120);
    await move(p, 'b5-held', 0.8, rows, heldClip);
    await hold(p, 'b5-heldrest', 1.2, heldClip);
    await ctx.close();
  });

  // ── 6 and 7 share a page: the tick in one, the label in the other ──
  const checkCtx = await deskCtx(820, 1200, 780);
  const checkPage = await openDesk(checkCtx, '/demo/dashboard?listing=demo-carlaw&applicant=demo-link-10&panel=checklist');
  await runBeat(BEATS[5], async () => {
    const p = checkPage;
    const H = await pageH(p);
    const body = await boxOf(p, '#applicant-demo-link-10-body');
    const wide = clipOn(820, H, 820, (body?.y ?? 600) + 220);
    const rowsClip = clipOn(820, H, 800, (body?.y ?? 600) + 260);
    plan.push({ beat: 6, subject: 'the screening checklist and the employer pill', viewport: 820, clip: `${Math.round(wide.width)} by ${Math.round(wide.height)} to ${Math.round(rowsClip.width)} by ${Math.round(rowsClip.height)}`, scale: `${(OUT_W / wide.width).toFixed(2)} to ${(OUT_W / rowsClip.width).toFixed(2)}` });
    await hold(p, 'b6-checklist', 2.2, wide);
    await move(p, 'b6-in', 0.8, wide, rowsClip);
    await hold(p, 'b6-rows', 2.0, rowsClip);
    const pill = p.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called employer' }).first();
    const pillBox = await p.evaluate(() => { const b = [...document.querySelectorAll('#applicant-demo-link-10-body button[aria-pressed="false"]')].find((x) => /Called employer/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cy: r.y + window.scrollY + r.height / 2 }; });
    const tight = clipOn(820, H, 780, (pillBox?.cy ?? rowsClip.y + 100));
    await move(p, 'b6-topill', 0.8, rowsClip, tight);
    await hold(p, 'b6-before', 1.6, tight);
    await motion(p, p, 'b6-tick', 1.8, async () => { await pill.click({ timeout: 5000 }); }, tight, { slowMs: 1600, shots: 12 });
    await p.waitForTimeout(400);
    await hold(p, 'b6-after', 2.2, tight);
    await move(p, 'b6-out', 0.8, tight, wide);
  });

  // ── 7. the label ──
  await runBeat(BEATS[6], async () => {
    const p = checkPage;
    const H = await pageH(p);
    const header = await boxOf(p, '[aria-controls="applicant-demo-link-10-body"]');
    const headClip = clipOn(820, H, 790, (header?.cy ?? 500));
    plan.push({ beat: 7, subject: "the card's header and its label", viewport: 820, clip: `${Math.round(headClip.width)} by ${Math.round(headClip.height)}`, scale: (OUT_W / headClip.width).toFixed(2) });
    notes.push(`beat 7: after the employer tick the header reads "${(await p.locator('[aria-controls="applicant-demo-link-10-body"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 52)}"`);
    await hold(p, 'b7-head', 3.0, headClip);
    const landlord = p.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called landlord' }).first();
    const lBox = await p.evaluate(() => { const b = [...document.querySelectorAll('#applicant-demo-link-10-body button[aria-pressed="false"]')].find((x) => /Called landlord/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cy: r.y + window.scrollY + r.height / 2 }; });
    const lClip = clipOn(820, H, 780, (lBox?.cy ?? headClip.y + 300));
    await move(p, 'b7-down', 0.8, headClip, lClip);
    await motion(p, p, 'b7-landlord', 1.6, async () => { await landlord.click({ timeout: 5000 }); }, lClip, { slowMs: 1500, shots: 12 });
    await move(p, 'b7-up', 0.8, lClip, headClip);
    notes.push(`beat 7: after the landlord tick the header reads "${(await p.locator('[aria-controls="applicant-demo-link-10-body"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 52)}"`);
    await hold(p, 'b7-after', 2.6, headClip);
  });
  await checkCtx.close();

  // ── 8. the landlord's page ──
  await runBeat(BEATS[7], async () => {
    const ctx = await deskCtx(820, 1200, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw');
    const H = await pageH(p);
    const report = await boxOf(p, '#report');
    const wide = clipOn(820, H, 820, (report?.cy ?? 1400));
    const tight = clipOn(820, H, 780, (report?.y ?? 1300) + 120);
    plan.push({ beat: 8, subject: 'the Landlord section, then the landlord page on the phone', viewport: 820, clip: `${Math.round(wide.width)} by ${Math.round(wide.height)} to ${Math.round(tight.width)} by ${Math.round(tight.height)}`, scale: `${(OUT_W / wide.width).toFixed(2)} to ${(OUT_W / tight.width).toFixed(2)}` });
    await hold(p, 'b8-report-wide', 1.6, wide);
    await move(p, 'b8-in', 0.8, wide, tight);
    await hold(p, 'b8-send', 1.6, tight);
    await ctx.close();
    const { page, f } = await openPhone('/r/DEMO-demo-carlaw', phoneBg);
    await hold(page, 'b8-landlordpage', 2.6);
    await f.locator('body').evaluate((el) => el.ownerDocument.defaultView.scrollTo({ top: 520, behavior: 'instant' })).catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b8-rows', 2.4);
  });

  // ── 9. the two buttons, and the answer ──
  await runBeat(BEATS[8], async () => {
    const last = phonePages[phonePages.length - 1];
    const f = last.frameLocator('#stage');
    await hold(last, 'b9-buttons', 1.6);
    await f.getByRole('button', { name: /I'd like to meet them/ }).first().scrollIntoViewIfNeeded().catch(() => {});
    await last.waitForTimeout(400);
    await motion(last, last, 'b9-tap', 1.4, async () => { await f.getByRole('button', { name: /I'd like to meet them/ }).first().click({ timeout: 8000, force: true }); }, null, { slowMs: 1400, shots: 11 });
    await last.waitForTimeout(500);
    const ctx = await deskCtx(820, 1200, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw');
    const card = await boxOf(p, '[aria-controls="applicant-demo-link-1-body"]');
    const clip = clipOn(820, await pageH(p), 780, (card?.cy ?? 800));
    plan.push({ beat: 9, subject: "the landlord's answer on the card", viewport: 820, clip: `${Math.round(clip.width)} by ${Math.round(clip.height)}`, scale: (OUT_W / clip.width).toFixed(2) });
    await hold(p, 'b9-answer', 2.4, clip);
    await ctx.close();
  });

  // ── 10. rented, and the pipeline ──
  await runBeat(BEATS[9], async () => {
    const ctx = await deskCtx(820, 1200, 780);
    const p = await openDesk(ctx, '/demo/dashboard?listing=demo-carlaw');
    const H = await pageH(p);
    const details = p.getByRole('button', { name: 'Details', exact: true }).first();
    if (await details.count() && (await details.getAttribute('aria-expanded')) !== 'true') { await details.click().catch(() => {}); await p.waitForTimeout(700); }
    const rented = p.getByRole('button', { name: 'Mark as rented' }).first();
    const rBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Mark as rented/.test(x.textContent || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { cy: r.y + window.scrollY + r.height / 2 }; });
    const clip = clipOn(820, H, 800, (rBox?.cy ?? 900));
    plan.push({ beat: 10, subject: 'the rented control and the sheet, then the pipeline on the phone', viewport: 820, clip: `${Math.round(clip.width)} by ${Math.round(clip.height)}`, scale: (OUT_W / clip.width).toFixed(2) });
    await hold(p, 'b10-mark', 1.8, clip);
    await motion(p, p, 'b10-sheet', 1.8, async () => { await rented.click({ timeout: 5000 }); }, clip, { slowMs: 1700, shots: 13 });
    await p.waitForTimeout(400);
    const sheet = clipOn(820, await pageH(p), 820, (await p.evaluate(() => window.innerHeight / 2 + window.scrollY)));
    await hold(p, 'b10-who', 2.6, sheet);
    await p.keyboard.press('Escape').catch(() => {});
    await ctx.close();
    const { page, f } = await openPhone('/demo/dashboard', phoneBg);
    await f.locator('#people').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await hold(page, 'b10-pipeline', 3.4);
  });

  // ── 11. the dashboard, then the words over it ──
  await runBeat(BEATS[10], async () => {
    const ctx = await deskCtx(820, 1100, 800);
    const p = await openDesk(ctx, '/demo/dashboard');
    const clip = clipOn(820, await pageH(p), 820, 380);
    const closeBg = await shoot(p, 'bg-close', clip);
    plan.push({ beat: 11, subject: 'the dashboard, then the words over it', viewport: 820, clip: `${Math.round(clip.width)} by ${Math.round(clip.height)}`, scale: (OUT_W / clip.width).toFixed(2) });
    await ctx.close();
    const wctx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await wctx.newPage();
    await page.setContent(wordsPage(closeBg, LINES_CLOSE), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { document.getElementById('bg').style.filter = 'none'; document.getElementById('bg').style.transform = 'scale(1)'; document.getElementById('veil').style.opacity = '0'; });
    await page.waitForTimeout(800);
    await hold(page, 'b11-dash', 2.2);
    // the dashboard softens back as the words arrive
    const settle = 24;
    for (let i = 0; i < settle; i++) {
      const t = ease(i / (settle - 1));
      await page.evaluate(({ t }) => {
        document.getElementById('bg').style.filter = `blur(${(10 * t).toFixed(2)}px) saturate(${(1 - 0.05 * t).toFixed(3)})`;
        document.getElementById('bg').style.transform = `scale(${(1 + 0.06 * t).toFixed(4)})`;
        document.getElementById('veil').style.opacity = String(t);
      }, { t });
      push(await shoot(page, `b11-soften-${i}`), 1);
    }
    for (let i = 0; i < LINES_CLOSE.length; i++) {
      await motion(page, page, `b11-line${i + 1}`, 0.5, async () => { await page.evaluate((n) => document.querySelectorAll('p')[n].classList.add('on'), i); await sleep(150); }, null, { slowMs: 900, shots: 9 });
      await hold(page, `b11-hold${i + 1}`, i === LINES_CLOSE.length - 1 ? 3.4 : 2.0);
    }
    await wctx.close();
  });

  // the phone frame, measured against the page it holds
  const phoneCheck = phonePages.length ? await phonePages[phonePages.length - 1].evaluate(() => {
    const frame = document.querySelector('iframe'); const shell = document.querySelector('.shell');
    const fr = frame.getBoundingClientRect(); const sr = shell.getBoundingClientRect(); const cs = getComputedStyle(shell); const cf = getComputedStyle(frame);
    return { screen: { w: Math.round(fr.width), h: Math.round(fr.height), radius: cf.borderRadius }, shell: { w: Math.round(sr.width), h: Math.round(sr.height), pad: cs.padding, radius: cs.borderRadius }, gap: { left: Math.round(fr.left - sr.left), right: Math.round(sr.right - fr.right), top: Math.round(fr.top - sr.top), bottom: Math.round(sr.bottom - fr.bottom) } };
  }) : null;
  if (phoneCheck && phonePages.length) phoneCheck.pageWidth = await phonePages[phonePages.length - 1].frameLocator('#stage').locator('html').evaluate((el) => el.scrollWidth).catch(() => null);

  await browser.close();
  const total = frames.reduce((n, f) => n + f.frames, 0);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ fps: FPS, width: OUT_W, height: OUT_H, totalFrames: total, seconds: total / FPS, beats: BEATS, plan, phone: phoneCheck, notes, frames }, null, 1));
  console.log(`frames ${total}, ${(total / FPS).toFixed(2)}s, images ${shotCount}`);
  console.log('PHONE ' + JSON.stringify(phoneCheck));
  if (notes.length) console.log('NOTES\n' + notes.map((n) => '  ' + n).join('\n'));
}

if (!existsSync(path.join(ROOT, 'public/fonts/fraunces-latin.woff2'))) { console.error('the product fonts are missing from public/fonts'); process.exit(1); }
await main();
