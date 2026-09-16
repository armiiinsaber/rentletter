// scripts/film/capture.mjs
// Drives the real sandbox in WebKit at 1920 by 1080 and writes the film's picture frames to
// out/film. Every frame is a screenshot of the running product at its own route; the only frames
// that are not the product are beats 1 and 11, the paper canvas with the script's own words set in
// the product's own faces. Phone moments render the 390 wide page inside a phone frame drawn on the
// same 1920 canvas, so every frame is 1920 by 1080.
//
// Capture method: stepping and screenshotting, not Playwright's video recorder, which does not hold
// an exact 30fps. A still is written once and held for its frames; a motion is captured as a burst
// of screenshots while the product animates, with CSS durations slowed during the burst so the
// capture rate covers the movement, then played back over the beat's own time.
//
//   node scripts/film/capture.mjs [baseUrl]
//
// Writes out/film/img/*.jpg and out/film/manifest.json (one entry per still or burst frame, with
// the number of 30fps frames it holds), which scripts/film/build.mjs encodes.
import { webkit } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://localhost:3190';
const OUT = path.join(ROOT, 'out/film');
const IMG = path.join(OUT, 'img');
const FPS = 30;
const W = 1920, H = 1080;

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

// The dev server's own badge and the sandbox's banner are not the product: hidden for the film.
const HIDE = `
  .rl-sandbox-bar { display: none !important; }
  nextjs-portal, #__next-build-watcher { display: none !important; }
  html { scroll-behavior: auto !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = [];           // { file, frames }
const notes = [];            // anything a beat could not reach
let shotCount = 0;

const shoot = async (target, tag) => {
  const file = path.join(IMG, `${String(++shotCount).padStart(4, '0')}-${tag}.jpg`);
  await target.screenshot({ path: file, type: 'jpeg', quality: 92 });
  return file;
};
const hold = async (target, tag, seconds) => {
  const file = await shoot(target, tag);
  frames.push({ file, frames: Math.max(1, Math.round(seconds * FPS)) });
};
// A burst: the product's own motion, captured while it runs with its CSS slowed so the capture
// rate covers it, then laid back over `seconds` of film time.
const motion = async (page, target, tag, seconds, action, { slowMs = 2400, shots = 16 } = {}) => {
  const handle = await page.addStyleTag({ content: `*, *::before, *::after { transition-duration: ${slowMs}ms !important; animation-duration: ${slowMs}ms !important; }` });
  const files = [];
  const runner = (async () => { try { await action(); } catch (e) { notes.push(`${tag}: ${e.message.split('\n')[0]}`); } })();
  const t0 = Date.now();
  while (files.length < shots && Date.now() - t0 < slowMs + 600) files.push(await shoot(target, `${tag}-${files.length}`));
  await runner;
  await handle.evaluate((el) => el.remove()).catch(() => {});
  const total = Math.max(1, Math.round(seconds * FPS));
  const per = Math.max(1, Math.floor(total / files.length));
  files.forEach((file, i) => frames.push({ file, frames: i === files.length - 1 ? total - per * (files.length - 1) : per }));
};
// The frames a beat owns, and the padding that keeps every cut on its boundary.
const beatFrames = ([, s, e]) => Math.round(e * FPS) - Math.round(s * FPS);
const fill = (budget, spent, lastFile) => { if (budget > spent) frames.push({ file: lastFile, frames: budget - spent }); };

// The paper canvas with the script's words in the product's own faces, as a data URL page.
const fontCss = () => {
  const b64 = (f) => readFileSync(path.join(ROOT, 'public/fonts', f)).toString('base64');
  return `
    @font-face { font-family: 'Fraunces'; src: url(data:font/woff2;base64,${b64('fraunces-latin.woff2')}) format('woff2'); font-weight: 100 900; font-display: block; }
    @font-face { font-family: 'Inter'; src: url(data:font/woff2;base64,${b64('inter-latin.woff2')}) format('woff2'); font-weight: 100 900; font-display: block; }
  `;
};
const typePage = (lines, shown) => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontCss()}
  html, body { margin: 0; height: 100%; background: #faf8f3; }
  body { display: flex; align-items: center; justify-content: center; }
  .wrap { width: 1280px; text-align: center; }
  p { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 52px; line-height: 1.22; letter-spacing: -0.02em; color: #0f0f10; margin: 0 0 26px; opacity: 0; transform: translateY(10px); }
  p.on { opacity: 1; transform: none; }
  p.red { color: #d72027; }
</style></head><body><div class="wrap">
  ${lines.map((l, i) => `<p class="${i < shown ? 'on' : ''}">${l}</p>`).join('')}
</div></body></html>`;

// A 390 wide page inside a phone frame, centred on the paper canvas at 1920 by 1080.
const phonePage = (src) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: #faf8f3; }
  body { display: flex; align-items: center; justify-content: center; }
  .shell { width: 414px; padding: 12px; background: #101012; border-radius: 54px; box-shadow: 0 0 0 1px #2a2a2e, 0 30px 70px -30px rgba(15,15,16,0.55); }
  iframe { display: block; width: 390px; height: 844px; border: 0; border-radius: 44px; background: #faf8f3; }
</style></head><body><div class="shell"><iframe id="stage" src="${src}"></iframe></div></body></html>`;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(IMG, { recursive: true });
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const desk = async (route, { top = 0 } = {}) => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    if (top) await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
    await page.waitForTimeout(400);
  };
  const phone = async (route) => {
    await page.setContent(phonePage(`${BASE}${route}`), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const f = page.frameLocator('#stage');
    await f.locator('body').waitFor({ timeout: 20000 }).catch(() => {});
    await hideEverywhere();
    await page.waitForTimeout(600);
    return f;
  };
  // Every document in the shot, the page and any frame inside it.
  const hideEverywhere = async () => { for (const fr of page.frames()) await fr.addStyleTag({ content: HIDE }).catch(() => {}); };
  const type = async (lines, shown) => { await page.setContent(typePage(lines, shown), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500); };
  const reset = async () => { await page.goto(`${BASE}/demo/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* first load */ } }); };

  const run = async (beat, fn) => {
    const budget = beatFrames(beat);
    const before = frames.reduce((n, f) => n + f.frames, 0);
    try { await fn(); } catch (e) { notes.push(`beat ${beat[0]}: ${e.message.split('\n')[0]}`); }
    const spent = frames.reduce((n, f) => n + f.frames, 0) - before;
    const last = frames.length ? frames[frames.length - 1].file : null;
    if (spent < budget && last) fill(budget, spent, last);
    else if (spent > budget) {                     // trim the tail so the cut lands on the beat
      let over = spent - budget;
      for (let i = frames.length - 1; i >= 0 && over > 0; i--) {
        const take = Math.min(over, frames[i].frames - 1);
        frames[i].frames -= take; over -= take;
      }
    }
    console.log(`beat ${beat[0]}: ${beatFrames(beat)} frames`);
  };

  // ── 1. the paper canvas, the words entering line by line ──
  await run(BEATS[0], async () => {
    for (let i = 1; i <= LINES_OPEN.length; i++) {
      await type(LINES_OPEN, i - 1);
      await motion(page, page, `b1-line${i}`, 0.5, async () => {
        await page.evaluate((n) => { document.querySelectorAll('p')[n].classList.add('on'); }, i - 1);
        await sleep(200);
      }, { slowMs: 1200, shots: 10 });
      await hold(page, `b1-hold${i}`, i === LINES_OPEN.length ? 3.4 : 2.2);
    }
  });

  // ── 2. the link, then the form on a phone ──
  await run(BEATS[1], async () => {
    await reset();
    await desk('/demo/dashboard?listing=demo-carlaw');
    await hold(page, 'b2-listing', 2.4);
    await motion(page, page, 'b2-copy', 1.2, async () => { await page.getByRole('button', { name: 'Copy', exact: true }).first().click({ timeout: 5000 }); }, { slowMs: 1500, shots: 12 });
    await motion(page, page, 'b2-kit', 1.6, async () => { await page.getByRole('button', { name: /Post kit/ }).first().click({ timeout: 5000 }); }, { slowMs: 2200, shots: 14 });
    await hold(page, 'b2-kitopen', 1.4);
    const f = await phone('/apply/demo0000000000000001');
    await f.getByLabel('Email').first().fill('priya.sharma@email.com').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    await f.getByLabel('Full name').first().fill('Priya Sharma').catch(() => {});
    await f.getByLabel('Date of birth').first().fill('1994-03-02').catch(() => {});
    await f.getByLabel('Phone').first().fill('4165550142').catch(() => {});
    await f.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    await hold(page, 'b2-step3', 1.6);
    await f.getByLabel('Employment type').first().selectOption('full-time').catch(() => {});
    await f.getByLabel('Job title').first().fill('Registered Nurse').catch(() => {});
    await f.getByLabel('Employer').first().fill('Sunnybrook Health Sciences Centre').catch(() => {});
    await f.getByLabel('Annual income before tax', { exact: false }).first().fill('92000').catch(() => {});
    await hideEverywhere();
    await hold(page, 'b2-step3-filled', 1.6);
    await motion(page, page, 'b2-continue', 1.0, async () => { await f.getByRole('button', { name: 'Continue' }).first().click({ timeout: 5000 }); }, { slowMs: 1200, shots: 10 });
  });

  // ── 3. the documents, then the cards ──
  await run(BEATS[2], async () => {
    const f = await phone('/apply/demo0000000000000001?preview=done');
    await f.getByText('Add your documents').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await hideEverywhere();
    await hold(page, 'b3-docs', 2.6);
    notes.push('beat 3: the upload itself cannot be driven in the sandbox, which mints no upload token, so the beat holds on the document card the tenant sees');
    await reset();
    await desk('/demo/dashboard?listing=demo-carlaw');
    await page.evaluate(() => { const el = document.querySelector('#applicants, [aria-label="Applicants"], .rl-card'); if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' }); });
    await page.waitForTimeout(300);
    await motion(page, page, 'b3-cards', 2.4, async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.addStyleTag({ content: HIDE }); }, { slowMs: 2400, shots: 18 });
    await hold(page, 'b3-cards-rest', 2.0);
  });

  // ── 4. one card, then the criteria ──
  await run(BEATS[3], async () => {
    await desk('/demo/dashboard?listing=demo-carlaw');
    const card = page.locator('[aria-controls="applicant-demo-link-1-body"]').first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await hold(page, 'b4-card', 6.0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(200);
    await motion(page, page, 'b4-details', 2.2, async () => { await page.getByRole('button', { name: 'Details', exact: true }).first().click({ timeout: 5000 }); }, { slowMs: 2400, shots: 16 });
    await hold(page, 'b4-criteria', 6.0);
  });

  // ── 5. the documents panel ──
  await run(BEATS[4], async () => {
    await desk('/demo/dashboard?listing=demo-carlaw&applicant=demo-link-1&panel=documents');
    const line = page.getByText(/^Documents ·/).first();
    await line.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b5-docline', 2.6);
    const fold = page.getByRole('button', { name: /What the documents say/ }).first();
    if ((await fold.getAttribute('aria-expanded')) === 'true') { await fold.click().catch(() => {}); await page.waitForTimeout(500); }
    await motion(page, page, 'b5-fold', 2.2, async () => { await fold.click({ timeout: 5000 }); }, { slowMs: 2200, shots: 16 });
    await page.waitForTimeout(300);
    await hold(page, 'b5-rows', 3.0);
    await page.getByText('Documents held').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await hold(page, 'b5-held', 2.4);
  });

  // ── 6. the checklist, and the tick ──
  await run(BEATS[5], async () => {
    await desk('/demo/dashboard?listing=demo-carlaw&applicant=demo-link-10&panel=checklist');
    const checklist = page.locator('#checklist-demo-link-10, [id^="checklist-"]').first();
    await checklist.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b6-checklist', 3.6);
    const ask = page.getByRole('button', { name: 'Ask by email' }).first();
    if (await ask.count()) { await ask.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(200); await hold(page, 'b6-ask', 2.6); }
    else notes.push('beat 6: Ask by email was not on this row');
    const pill = page.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called employer' }).first();
    const label = await pill.innerText().catch(() => '');
    await pill.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await hold(page, 'b6-before', 2.4);
    await motion(page, page, 'b6-tick', 2.0, async () => { await pill.click({ timeout: 5000 }); }, { slowMs: 1800, shots: 14 });
    notes.push(`beat 6: the pill tapped reads "${label.trim()}"`);
    await page.waitForTimeout(400);
    await hold(page, 'b6-after', 3.0);
  });

  // ── 7. the label, before and after ──
  await run(BEATS[6], async () => {
    const header = page.locator('[aria-controls="applicant-demo-link-10-body"]').first();
    await header.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    notes.push(`beat 7: after the employer tick the header reads "${(await header.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 52)}"`);
    await hold(page, 'b7-mid', 3.4);
    const landlord = page.locator('#applicant-demo-link-10-body button[aria-pressed="false"]', { hasText: 'Called landlord' }).first();
    await motion(page, page, 'b7-landlord', 2.0, async () => { await landlord.click({ timeout: 5000 }); }, { slowMs: 1800, shots: 14 });
    await page.waitForTimeout(500);
    await header.scrollIntoViewIfNeeded().catch(() => {});
    notes.push(`beat 7: after the landlord tick the header reads "${(await header.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 52)}"`);
    await hold(page, 'b7-after', 4.4);
  });

  // ── 8. the landlord's page ──
  await run(BEATS[7], async () => {
    await desk('/demo/dashboard?listing=demo-carlaw');
    const report = page.locator('#report');
    await report.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b8-landlord', 4.0);
    await phone('/r/DEMO-demo-carlaw');
    await hold(page, 'b8-report', 3.6);
    const f = page.frameLocator('#stage');
    await f.locator('body').evaluate((el) => el.ownerDocument.defaultView.scrollTo({ top: 520, behavior: 'instant' })).catch(() => {});
    await page.waitForTimeout(400);
    await hold(page, 'b8-report-rows', 3.4);
  });

  // ── 9. the two buttons, and the answer ──
  await run(BEATS[8], async () => {
    const f = page.frameLocator('#stage');
    const meet = f.getByRole('button', { name: /I'd like to meet them/ }).first();
    await hold(page, 'b9-buttons', 2.0);
    await motion(page, page, 'b9-tap', 1.6, async () => { await meet.click({ timeout: 5000 }); }, { slowMs: 1600, shots: 12 });
    await page.waitForTimeout(600);
    await desk('/demo/dashboard?listing=demo-carlaw');
    await page.locator('[aria-controls="applicant-demo-link-1-body"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await hold(page, 'b9-answer', 2.4);
  });

  // ── 10. rented, and the pipeline ──
  await run(BEATS[9], async () => {
    await desk('/demo/dashboard?listing=demo-carlaw');
    const details = page.getByRole('button', { name: 'Details', exact: true }).first();
    if (await details.count() && (await details.getAttribute('aria-expanded')) !== 'true') { await details.click().catch(() => {}); await page.waitForTimeout(700); }
    const rented = page.getByRole('button', { name: 'Mark as rented' }).first();
    if (await rented.count()) {
      await rented.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(200);
      await hold(page, 'b10-mark', 2.2);
      await motion(page, page, 'b10-sheet', 2.0, async () => { await rented.click({ timeout: 5000 }); }, { slowMs: 1800, shots: 14 });
      await page.waitForTimeout(400);
      await hold(page, 'b10-who', 3.0);
      await page.keyboard.press('Escape').catch(() => {});
    } else notes.push('beat 10: the rented control was not on the page');
    await phone('/demo/dashboard');
    const f = page.frameLocator('#stage');
    await f.locator('#people').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await hold(page, 'b10-pipeline', 4.0);
  });

  // ── 11. the dashboard, then the close ──
  await run(BEATS[10], async () => {
    await phone('/demo/dashboard');
    await hold(page, 'b11-dash', 3.2);
    for (let i = 1; i <= LINES_CLOSE.length; i++) {
      await type(LINES_CLOSE, i - 1);
      await motion(page, page, `b11-line${i}`, 0.5, async () => {
        await page.evaluate((n) => { document.querySelectorAll('p')[n].classList.add('on'); }, i - 1);
        await sleep(200);
      }, { slowMs: 1200, shots: 10 });
      await hold(page, `b11-hold${i}`, i === LINES_CLOSE.length ? 4.0 : 2.0);
    }
  });

  await browser.close();
  const total = frames.reduce((n, f) => n + f.frames, 0);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ fps: FPS, width: W, height: H, totalFrames: total, seconds: total / FPS, beats: BEATS, notes, frames }, null, 1));
  console.log(`frames ${total}, ${(total / FPS).toFixed(2)}s, images ${shotCount}`);
  if (notes.length) console.log('NOTES\n' + notes.map((n) => '  ' + n).join('\n'));
}

if (!existsSync(path.join(ROOT, 'public/fonts/fraunces-latin.woff2'))) { console.error('the product fonts are missing from public/fonts'); process.exit(1); }
await main();
