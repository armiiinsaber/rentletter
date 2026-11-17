// The wrapped text on every page and state a person can reach (tests/helpers/typesetStates.mjs:
// public, realtor, billing, tenant, landlord), in WebKit (Safari's engine) and in Chrome, at 390
// and at 320, with the long values (tests/helpers/fakeNextServer.mjs, FAKE_LONG=1), on the real
// pages over the fake stack in two production builds: billing off on 3177, as production runs
// today, and billing on (BILLING_OFF=false) on 3178 for the trial, paywall and billing screens.
// Every block of text is measured word by word (tests/helpers/textLines.mjs): no line of one word
// beside a longer one, no line under 60% of its block's longest, no word or link split, nothing
// outside its block and nothing cut short with an ellipsis; a link may stand alone on its line,
// whole. And the page never scrolls sideways. Each state is measured at 390, then the same page at
// 320. Every break is named (state, width, block) before the test fails; a page measured with a
// break is saved to /tmp/typeset/<engine>/. A WebKit walk fails, never skips, when the binary is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { readPage, pageProblems } from '../helpers/textLines.mjs';
import { sweep, STATES } from '../helpers/typesetStates.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ROOT = new URL('../..', import.meta.url).pathname;
const SERVERS = { off: { port: 3177, env: {} }, on: { port: 3178, env: { BILLING_OFF: 'false' } } };
const bases = Object.fromEntries(Object.entries(SERVERS).map(([k, s]) => [k, `http://localhost:${s.port}`]));
let turn = false; let swept = 0;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const down = () => { for (const s of Object.values(SERVERS)) { if (s.proc) { try { process.kill(-s.proc.pid); } catch (e) { /* gone */ } s.proc = null; } for (const pid of listeners(s.port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } } };
const build = (s) => new Promise((res, rej) => { const p = spawn(process.execPath, [`${ROOT}node_modules/next/dist/bin/next`, 'build'], { cwd: ROOT, env: { ...process.env, ...s.env, NEXT_DIST_DIR: `.next-fake-${s.port}`, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' }); p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build for ${s.port} exited ${code}`)))); });
const start = (s) => new Promise((res, rej) => {
  s.proc = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(s.port), 'prod', '3'], { cwd: ROOT, env: { ...process.env, ...s.env, FAKE_LONG: '1' }, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(s.proc, 'the fake stack server');
  const t = setTimeout(() => rej(new Error(`the fake stack server on ${s.port} did not start`)), 120000);
  s.proc.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } });
});
// Both servers fresh: the states change what the fake stack holds (an application sent, a listing
// rented), so a second engine in the same run starts from the fixture again.
const fresh = async () => { down(); await Promise.all(Object.values(SERVERS).map(start)); };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true;
  onStuck(down);
  down();
  walkStep('building the two fake stacks for production');
  await Promise.all(Object.values(SERVERS).map(build));
  walkStep('starting the fake stack servers');
  await fresh();
}, { timeout: START_TIMEOUT + 600000 });
after(async () => { leaveTurn(); down(); if (turn) giveTurn(); }, { timeout: STOP_TIMEOUT });

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
async function walk(type, opts, engine) {
  if (swept++) { walkStep('restarting the fake stack servers'); await fresh(); }
  walkStep(`every state in ${engine}`);
  mkdirSync(`/tmp/typeset/${engine}`, { recursive: true });
  const browser = await type.launch(opts);
  const breaks = []; let measured = 0; const t0 = Date.now();
  try {
    const measure = async (page, state) => {
      for (const width of [390, 320]) {
        if (width !== 390) await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(350);
        const problems = pageProblems(await readPage(page));
        measured++;
        for (const p of problems) breaks.push(`${state} at ${width}: ${p}`);
        if (problems.length) await page.screenshot({ path: `/tmp/typeset/${engine}/${slug(state)}-${width}.png`, fullPage: true }).catch(() => {});
      }
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
    };
    const failed = await sweep({ browser, bases, concurrency: 4, measure, contextOptions: { viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' } });
    console.log(`${engine}: ${STATES.length} pages, ${measured} measurements at 390 and 320, ${breaks.length} breaks, ${Math.round((Date.now() - t0) / 1000)}s`);
    assert.deepEqual(failed, [], `${engine}: every state opens`);
    assert.deepEqual(breaks, [], `${engine}: no wrapped text breaks the rule`);
    assert.ok(measured >= STATES.length * 2, `${engine}: every state measured at both widths (${measured})`);
  } finally { await browser.close(); }
}

test('every page and state at 390 and 320, the wrapped text even and whole, in WebKit', { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
