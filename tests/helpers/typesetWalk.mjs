// tests/helpers/typesetWalk.mjs  The wrapped text walk, in parts. The wrapped text on every page and
// state a person can reach (tests/helpers/typesetStates.mjs: public, realtor, billing, tenant,
// landlord, the founder office), in WebKit (Safari's engine) and in Chrome, at 390 and at 320 (the
// desktop shell, the listing form and the homepage at 1024, 1280, 1440, 1920 and 2560 too), with
// the long values (tests/helpers/fakeNextServer.mjs, FAKE_LONG=1), on the real pages over the fake
// stack in two production builds: billing off, as production runs today, and billing on
// (BILLING_OFF=false) for the trial, paywall and billing screens. Every block of text is measured
// word by word (tests/helpers/textLines.mjs): no line of one word beside a longer one, no line under
// 60% of its block's longest, no word or link split, nothing outside its block and nothing cut short
// with an ellipsis; a link may stand alone on its line, whole. The page never scrolls sideways, and
// no pill runs past its row or the screen edge. Each state is measured at 390, then the same page at
// 320. Every break is named (state, width, block) before the test fails; a page measured with a
// break is saved to /tmp/typeset/<engine>/. And no page logs a hydration warning or error (the
// server's HTML and the first render the same, with components/EvenLines.js narrowing blocks after it).
//
// The states are walked in PARTS parts, one walk file each (tests/typeset/typeset<n>Webkit.test.mjs,
// each naming its part as `const PART = n;`), so no file holds the walk turn near its limit
// (tests/helpers/devServer.mjs WALK_LIMIT). A state shows what the states before it left on the fake
// stack (an application sent, a listing rented, the office's numbers, a tenant's shares), so the
// parts keep the order of the whole walk and run one after another on the same two servers: part 1
// the reads and the billing states, part 2 the writes and then the alone states up to PART3_FROM,
// part 3 the alone states from there up to PART4_FROM, part 4 those up to PART5_FROM (the tenant's
// card, Preview and the sheet), part 5 those up to PART6_FROM (the first run, the writing helper,
// an upload and the office's alone states), part 6 the rest (the realtor's send sheet). Part 1 builds (once a run, tests/helpers/fakeBuild.mjs) and
// starts the servers; each later part waits, without the turn, for the part before it to finish,
// and starts where that part left the fake stack; the last part takes the servers down (and the
// run takes them down too, however it ends, tests/helpers/reap.mjs reapWithRun). Each engine has
// servers of its own, so the second engine in a run starts from the fixture again. Every part
// checks that the parts together hold every state exactly once and that every part has its walk
// file, so no state can fall between them; and that each of its own states was measured at each of
// its widths. The parts run together, one engine a run: npm run test:typeset:webkit and npm run
// test:typeset:chrome, each under the run ceiling (scripts/test-run.mjs). TYPESET_LOG=1 prints
// each state's start and end and each measurement's block count.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { haveWebkit, haveChrome } from './browsers.mjs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from './devServer.mjs';
import { fakeBuild } from './fakeBuild.mjs';
import { reapWithRun } from './reap.mjs';
import { readPage, pageProblems } from './textLines.mjs';
import { sweep, STATES, NARROW } from './typesetStates.mjs';

export const PARTS = 6;
// The first alone state of part 3: the tenant's own profile and what follows it. Of part 4: the
// tenant's card, empty, half filled and complete. Of part 5: the guided first run. Of part 6: the
// realtor's send sheet.
export const PART3_FROM = 'tenant profile, documents stored';
export const PART4_FROM = 'tenant profile, empty';
export const PART5_FROM = 'tenant profile, the first run, the name';
export const PART6_FROM = 'dashboard, the send sheet';
const kindOf = (s) => (s.server === 'on' ? 'billing' : (s.phase || 'read'));
export function partOf(s) {
  const k = kindOf(s);
  if (k === 'read' || k === 'billing') return 1;
  if (k === 'write') return 2;
  const alone = STATES.filter((x) => kindOf(x) === 'alone');
  const cuts = [PART3_FROM, PART4_FROM, PART5_FROM, PART6_FROM].map((name) => { const i = alone.findIndex((x) => x.name === name); if (i < 0) throw new Error(`a part names no alone state: ${name}`); return i; });
  if (!(cuts[0] < cuts[1] && cuts[1] < cuts[2] && cuts[2] < cuts[3])) throw new Error(`the parts are out of order: ${cuts}`);
  const at = alone.indexOf(s);
  return at < cuts[0] ? 2 : at < cuts[1] ? 3 : at < cuts[2] ? 4 : at < cuts[3] ? 5 : 6;
}
export const statesOf = (part) => STATES.filter((s) => partOf(s) === part);

const ROOT = new URL('../..', import.meta.url).pathname;
// The part each wrapped text walk file names.
export const partFiles = () => readdirSync(`${ROOT}tests/typeset`).filter((f) => /Webkit\.test\.mjs$/.test(f))
  .map((f) => ({ file: f, part: Number((readFileSync(`${ROOT}tests/typeset/${f}`, 'utf8').match(/^const PART = (\d+);$/m) || [])[1]) }));

// Each engine's two servers: billing off, and billing on.
const PORTS = { webkit: { off: 3177, on: 3178 }, chrome: { off: 3175, on: 3176 } };
const ENV = { off: {}, on: { BILLING_OFF: 'false' } };
// What the parts of one run pass along: which part has finished in which engine, and the office
// password the servers were started with. A run of scripts/test-run.mjs names itself; node --test
// alone is named for its runner.
const RUN = process.env.RENTLETTER_RUN || `ppid-${process.ppid}`;
const CHAIN = `/tmp/rentletter-typeset-${RUN}`;
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const kill = (ports) => { for (const port of ports) for (const pid of listeners(port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } };
const ALL_PORTS = Object.values(PORTS).flatMap((p) => Object.values(p));
// The walk file of another part, still running beside this one under the same runner.
const sibling = (file) => execSync('ps -Ao ppid=,command=', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')
  .some((l) => { const m = l.trim().match(/^(\d+)\s+(.*)$/); return m && Number(m[1]) === process.ppid && m[2].includes(`tests/typeset/${file}`); });

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// React's hydration messages: the development wording, and the production errors for a mismatch
// (418 text or markup, 423 recovered by rendering on the client, 425 text content).
const HYDRATION = /hydrat|did not match|didn't match|server rendered|Minified React error #(418|423|425)\b/i;
// Run in the page after readPage: every pill a person can see (marked data-tl-block) inside its
// row, its row inside the box that holds it, and both on the screen; and each the one pill.
const PILLS_INSIDE = () => {
  const iw = window.innerWidth; const out = []; const px = (n) => Math.round(n);
  for (const p of document.querySelectorAll('.rl-pill[data-tl-block]')) {
    const r = p.getBoundingClientRect(); const t = p.textContent.replace(/\s+/g, ' ').trim();
    const row = p.closest('.rl-pills'); const rr = row && row.getBoundingClientRect(); const hr = row && row.parentElement && row.parentElement.getBoundingClientRect();
    if (r.left < -0.5 || r.right > iw + 0.5) out.push(`the pill "${t}" past the screen edge (${px(r.left)} to ${px(r.right)} on a ${iw}px screen)`);
    else if (rr && (r.left < rr.left - 0.5 || r.right > rr.right + 0.5)) out.push(`the pill "${t}" past its row (${px(r.left)} to ${px(r.right)}, row ${px(rr.left)} to ${px(rr.right)})`);
    else if (rr && hr && (rr.left < hr.left - 0.5 || rr.right > hr.right + 0.5)) out.push(`the row of the pill "${t}" past its box (${px(rr.left)} to ${px(rr.right)}, box ${px(hr.left)} to ${px(hr.right)})`);
    // The one pill (components/ui.js .rl-pill): the same padding on both sides, one line high,
    // its text centred both ways. A pill that wraps its text (.rl-pills-wrap) grows with its
    // lines, a mockup's is scaled down, and a pill whose text runs past it is named above.
    if (p.closest('.rl-pills-wrap, .rl-pills-mock')) continue;
    const cs = getComputedStyle(p); const pl = parseFloat(cs.paddingLeft); const pr = parseFloat(cs.paddingRight);
    const range = document.createRange(); range.selectNodeContents(p); const tr = range.getBoundingClientRect();
    if (tr.width > r.width - pl - pr + 1) continue;
    const dx = Math.abs((tr.left - r.left) - (r.right - tr.right)); const dy = Math.abs((tr.top - r.top) - (r.bottom - tr.bottom));
    if (pl < 8 || Math.abs(pl - pr) > 0.5 || r.height > 30.5 || dx > 1.5 || dy > 2.5) out.push(`the pill "${t}" is not the one pill (padding ${pl} and ${pr}, ${px(r.height)}px high, its text ${px(dx)}px off centre across and ${px(dy)}px down)`);
  }
  return out;
};
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// The hooks and the walk for one part: call once, at the top of its walk file.
export function typesetPart(part) {
  const states = statesOf(part);
  const last = part === PARTS;
  const swept = [];
  let turn = false; let prior = null;
  // A server outlives this file, for the part after it: no pipe to this process, so it is ready
  // once it answers.
  const start = async (port, key, password) => {
    kill([port]);
    const proc = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(port), 'prod', '3'], { cwd: ROOT, env: { ...process.env, ...ENV[key], FAKE_LONG: '1', ADMIN_PASSWORD: password }, stdio: 'ignore', detached: true }); reapWithRun(proc, 'a wrapped text walk server');
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { if (await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false)) return; await sleep(300); }
    throw new Error(`the fake stack server on ${port} did not start`);
  };
  const up = (port) => fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false);

  before(async () => {
    if (!(haveWebkit || haveChrome)) return;
    if (part === 1) {
      // The run's first part: what an earlier run of the same name left is gone.
      rmSync(CHAIN, { recursive: true, force: true }); mkdirSync(CHAIN, { recursive: true });
      for (const d of readdirSync('/tmp')) { const m = d.match(/^rentletter-typeset-(?:run|ppid)-(\d+)$/); if (m && !running(Number(m[1]))) rmSync(`/tmp/${d}`, { recursive: true, force: true }); }
      writeFileSync(`${CHAIN}/admin`, process.env.TYPESET_ADMIN_PASSWORD || randomBytes(18).toString('hex'), { mode: 0o600 });
    } else {
      // The part before this one first, waited for without the turn; a part that is not running
      // and has not finished is not in this run.
      const prev = partFiles().find((f) => f.part === part - 1);
      walkStep(`waiting for part ${part - 1} of the wrapped text walk`);
      for (;;) {
        if (existsSync(`${CHAIN}/part${part - 1}.done`)) break;
        if (!prev || !sibling(prev.file)) { await sleep(1000); if (existsSync(`${CHAIN}/part${part - 1}.done`)) break; throw new Error(`part ${part} of the wrapped text walk starts where part ${part - 1} leaves the fake stack, and part ${part - 1} is not running in this run: run the parts together (npm run test:typeset:webkit or npm run test:typeset:chrome)`); }
        await sleep(500);
      }
      prior = JSON.parse(readFileSync(`${CHAIN}/part${part - 1}.done`, 'utf8'));
    }
    // The office states sign in with the password the servers were started with (typesetStates.mjs office).
    process.env.TYPESET_ADMIN_PASSWORD = readFileSync(`${CHAIN}/admin`, 'utf8');
    if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
    turn = true;
    onStuck(() => kill(ALL_PORTS));
  }, { timeout: START_TIMEOUT + 600000 });
  after(async () => {
    leaveTurn();
    if (turn) writeFileSync(`${CHAIN}/part${part}.done`, JSON.stringify({ swept }));
    if (last) { kill(ALL_PORTS); rmSync(CHAIN, { recursive: true, force: true }); }
    if (turn) giveTurn();
  }, { timeout: STOP_TIMEOUT });

  async function walk(type, opts, engine) {
    // No state falls between the parts: together they hold every state once, and every part has its file.
    const names = (list) => list.map((s) => s.name);
    const held = Array.from({ length: PARTS }, (_, i) => names(statesOf(i + 1))).flat();
    assert.deepEqual([...held].sort(), names(STATES).sort(), `${engine}: the ${PARTS} parts hold every state exactly once`);
    assert.deepEqual(partFiles().map((f) => f.part).sort((a, b) => a - b), Array.from({ length: PARTS }, (_, i) => i + 1), `${engine}: every part has one walk file (${JSON.stringify(partFiles())})`);
    const ports = PORTS[engine];
    const bases = { off: `http://localhost:${ports.off}`, on: `http://localhost:${ports.on}` };
    if (part === 1) {
      walkStep(`building the two fake stacks for production, for ${engine}`);
      // One build of each a run, copied to this engine's server folders (tests/helpers/fakeBuild.mjs).
      await Promise.all(['off', 'on'].map((k) => fakeBuild(ports[k], ENV[k])));
      walkStep(`starting the fake stack servers for ${engine}`);
      const password = readFileSync(`${CHAIN}/admin`, 'utf8');
      await Promise.all(['off', 'on'].map((k) => start(ports[k], k, password)));
    } else {
      assert.ok(prior && prior.swept.includes(engine), `${engine}: part ${part - 1} walked its states, so part ${part} starts where it left the fake stack (${JSON.stringify(prior)})`);
      for (const k of ['off', 'on']) assert.ok(await up(ports[k]), `${engine}: the fake stack server part ${part - 1} started on ${ports[k]} is answering`);
    }
    walkStep(`part ${part} of the states in ${engine}`);
    mkdirSync(`/tmp/typeset/${engine}`, { recursive: true });
    const browser = await type.launch(opts);
    const breaks = []; const hydration = []; let measured = 0; const t0 = Date.now();
    const heard = (where, text) => { if (HYDRATION.test(text)) hydration.push(`${where}: ${String(text).split('\n')[0].slice(0, 200)}`); };
    const onContext = (ctx) => {
      ctx.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') heard(m.page() ? m.page().url() : 'a page', m.text()); });
      ctx.on('weberror', (e) => heard(e.page() ? e.page().url() : 'a page', String((e.error() && e.error().message) || e.error())));
    };
    const log = !!process.env.TYPESET_LOG;
    try {
      const measure = async (page, state, kind, widths = [390, 320]) => {
        for (const width of widths) {
          // Every width set, 390 too: a state may have been set up at a desktop width.
          await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
          await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(350);
          const iw = await page.evaluate(() => window.innerWidth);
          if (iw !== width) breaks.push(`${state} at ${width}: the page laid out at ${iw}`);
          const read = await readPage(page);
          if (log) console.log(`# m\t${state}\t${width}\t${read.blocks.length}\t${Date.now()}`);
          const problems = [...pageProblems(read), ...(await page.evaluate(PILLS_INSIDE))];
          measured++;
          for (const p of problems) breaks.push(`${state} at ${width}: ${p}`);
          if (problems.length) await page.screenshot({ path: `/tmp/typeset/${engine}/${slug(state)}-${width}.png`, fullPage: true }).catch(() => {});
        }
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
      };
      const walked = !log ? states : states.map((st) => ({ ...st, go: async (p, f) => { console.log(`# go\t${st.name}\t${Date.now()}`); return st.go(p, f); }, after: async (f, p) => { console.log(`# end\t${st.name}\t${Date.now()}`); if (st.after) await st.after(f, p); } }));
      const failed = await sweep({ browser, bases, states: walked, concurrency: 4, measure, onContext, contextOptions: { viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' } });
      swept.push(engine);
      console.log(`${engine}: part ${part} of ${PARTS}, ${states.length} of ${STATES.length} pages, ${measured} measurements (390 and 320; the desktop shell, the listing form and the homepage at 1024, 1280, 1440, 1920 and 2560 too), ${breaks.length} breaks, ${hydration.length} hydration messages, ${Math.round((Date.now() - t0) / 1000)}s`);
      // The breaks named before any assertion, so a state that did not open hides none of them.
      if (breaks.length) console.log(`${engine} breaks:\n  ${breaks.join('\n  ')}`);
      assert.deepEqual(failed, [], `${engine}: every state opens`);
      assert.deepEqual(breaks, [], `${engine}: no wrapped text breaks the rule`);
      assert.deepEqual(hydration, [], `${engine}: no page logs a hydration warning or error`);
      assert.ok(measured >= states.reduce((n, st) => n + (st.widths || NARROW).length, 0), `${engine}: every state of part ${part} measured at each of its widths (${measured})`);
    } finally { await browser.close(); }
  }
  return { walk, states };
}
