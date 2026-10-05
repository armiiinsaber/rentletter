// BILLING_OFF (lib/billingOff.js), in WebKit (Safari's engine) and in Chrome, at 390 by 844 with an
// iPhone user agent, on the real pages over the fake stack (tests/helpers/fakeNextServer.mjs),
// signed in as a realtor whose trial ended two days ago (FAKE_PROFILE=lapsed). One dev server for
// each value of the flag, since Next builds the value into the page (next.config.js):
//   1. Flag on (BILLING_OFF=true): the dashboard and the listing show their content, with no
//      paywall, no trial, no plan and no link to /billing; /billing goes to the dashboard; a gated
//      write (POST /api/notifications, through lib/requireEntitlement.js) answers 200.
//   2. Flag off (BILLING_OFF=false): the dashboard and the listing show the paywall ("Your trial has
//      ended."), the header badge says the trial ended, and the same write answers 402, as before.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ROOT = new URL('../..', import.meta.url).pathname;
const FLAG_ON = { port: 3161, value: 'true' }; const FLAG_OFF = { port: 3162, value: 'false' };
const SERVERS = [FLAG_ON, FLAG_OFF];
let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const down = () => {
  for (const s of SERVERS) {
    if (s.proc) { try { process.kill(-s.proc.pid); } catch (e) { /* gone */ } }
    for (const pid of listeners(s.port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  }
};
const start = (s) => new Promise((res, rej) => {
  s.proc = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(s.port), 'dev', '3'], { cwd: ROOT, env: { ...process.env, BILLING_OFF: s.value, FAKE_PROFILE: 'lapsed' }, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  const t = setTimeout(() => rej(new Error(`the fake stack server on ${s.port} did not start`)), 180000);
  s.proc.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } });
  s.proc.on('exit', (code) => { clearTimeout(t); rej(new Error(`the fake stack server on ${s.port} exited ${code}`)); });
});
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  onStuck(down); // stuck past the walk limit: both servers go with the file
  down();
  walkStep('starting the two fake stack servers');
  await Promise.all(SERVERS.map(start));
  walkStep('compiling the dashboard, the listing and /billing on both');
  await Promise.all(SERVERS.map(async (s) => { for (const u of ['/dashboard', '/listing/L1', '/billing']) await fetch(`http://localhost:${s.port}${u}`, { redirect: 'manual' }).catch(() => null); }));
}, { timeout: START_TIMEOUT });
after(async () => {
  leaveTurn();
  down();
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

async function phone(browser, s) {
  const ctx = await browser.newContext({ baseURL: `http://localhost:${s.port}`, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route(/supabase\.co\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(e.message); });
  return { ctx, page, errors };
}
// Loaded when the screen shows the paywall or the realtor's own content. Not network idle: Chrome
// never reports a 402 whose body the page leaves unread as finished, so the paywall never idles.
const open = async (page, url) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!document.querySelector('section[aria-label="Plans"]') || /210 Carlaw Ave|Applicant (A1A1|B2B2)/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(700);
};
// What the screen shows: the paywall, the realtor's own content, and any word of a trial or a plan.
const STATE = () => {
  const text = document.body.innerText.replace(/ /g, ' ');
  return {
    path: location.pathname,
    paywall: !!document.querySelector('section[aria-label="Plans"]'),
    ended: /Your trial has ended\./.test(text),
    badge: (document.querySelector('.rl-hdr-status')?.textContent || '').trim(), // hidden below 560px by design
    listings: /210 Carlaw Ave/.test(text),
    applicants: /Applicant (A1A1|B2B2)/.test(text),
    billingWords: text.match(/\b(trials?|plans?|subscri\w*|billing|choose a plan)\b/gi) || [],
    billingLinks: document.querySelectorAll('a[href^="/billing"]').length,
  };
};
const gatedWrite = (page) => page.evaluate(async () => { const r = await fetch('/api/notifications', { method: 'POST' }); return { status: r.status, body: await r.json().catch(() => null) }; });

async function walk(type, opts) {
  const browser = await type.launch(opts);
  try {
    // 1. Flag on
    {
      const { ctx, page, errors } = await phone(browser, FLAG_ON);
      walkStep('flag on: the dashboard');
      await open(page, '/dashboard');
      let s = await page.evaluate(STATE);
      assert.equal(s.path, '/dashboard', 'a realtor past their trial reaches the dashboard');
      assert.equal(s.paywall, false, 'no paywall'); assert.equal(s.ended, false); assert.equal(s.badge, '', 'no trial badge');
      assert.ok(s.listings, 'the dashboard shows the listings');
      assert.deepEqual(s.billingWords, [], 'no trial or plan copy'); assert.equal(s.billingLinks, 0, 'no link to /billing');
      walkStep('flag on: the listing');
      await open(page, '/listing/L1');
      s = await page.evaluate(STATE);
      assert.equal(s.path, '/listing/L1'); assert.equal(s.paywall, false, 'no paywall on the listing'); assert.ok(s.applicants, 'the listing shows its applicants');
      assert.deepEqual(s.billingWords, [], 'no trial or plan copy on the listing');
      walkStep('flag on: /billing');
      await open(page, '/billing');
      assert.equal(new URL(page.url()).pathname, '/dashboard', '/billing goes to the dashboard');
      walkStep('flag on: a gated write');
      const w = await gatedWrite(page);
      assert.equal(w.status, 200, `the gate lets the write through: ${JSON.stringify(w.body)}`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 2. Flag off
    {
      const { ctx, page, errors } = await phone(browser, FLAG_OFF);
      walkStep('flag off: the dashboard');
      await open(page, '/dashboard');
      let s = await page.evaluate(STATE);
      assert.equal(s.path, '/dashboard');
      assert.equal(s.paywall, true, 'the paywall'); assert.equal(s.ended, true, '"Your trial has ended."'); assert.equal(s.badge, 'Trial ended', 'the trial ended badge');
      assert.equal(s.listings, false, 'the paywall hides the dashboard content');
      walkStep('flag off: the listing');
      await open(page, '/listing/L1');
      s = await page.evaluate(STATE);
      assert.equal(s.paywall, true, 'the paywall on the listing'); assert.equal(s.applicants, false, 'the paywall hides the applicants');
      walkStep('flag off: a gated write');
      const w = await gatedWrite(page);
      assert.equal(w.status, 402, 'the gate answers 402'); assert.equal(w.body?.code, 'payment_required'); assert.equal(w.body?.status, 'trial_expired');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
}

test('billing off: past the trial and still on the dashboard; on: the paywall, in WebKit at 390', { timeout: 600000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {});
});
test('the same in Chrome', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 600000 }, () => walk(pw.chromium, { executablePath: chromeBin }));
