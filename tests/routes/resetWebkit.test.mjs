// The password reset page in WebKit at 390 by 844 with an iPhone user agent, over a stubbed
// Supabase: the form renders from a recovery link in the query form (token_hash) and in the
// fragment form (access_token and refresh_token), an expired link shows its one line with a way to
// ask for another, and a saved password lands on /dashboard. Every Supabase auth call is answered
// by the harness, so nothing leaves the machine and no account is touched. Skipped when
// playwright-core or the browser binary is absent. The page is served from the run's one
// production build (tests/helpers/fakeBuild.mjs), in this walk's own copy, on its own port, with
// service workers blocked: a production build registers one (lib/serviceWorker.js) that the dev
// server never did.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { takeTurn, giveTurn, leaveTurn, onStuck, walkStep, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { fakeBuild } from '../helpers/fakeBuild.mjs';
import { requireWebkit } from '../helpers/browsers.mjs';
import { reap } from '../helpers/reap.mjs';
import { blockSupabase, noSupabaseLeft } from '../helpers/noSupabase.mjs';

const PORT = 3187; const BASE = `http://localhost:${PORT}`;
const ROOT = new URL('../..', import.meta.url).pathname;

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
const webkitBin = pw ? pw.webkit.executablePath() : '';
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
const haveChrome = !!pw && existsSync(chromeBin);

let fake = null; let turn = false;
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
before(async () => {
  if (!(haveWebkit || haveChrome)) return;
  if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
  turn = true; // one walk at a time (tests/helpers/devServer.mjs)
  // Stuck past the walk limit (devServer.mjs): the fake stack server goes with the file.
  onStuck(() => { if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } } for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } });
  walkStep('building the fake stack for production');
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  await fakeBuild(PORT); // one build a run, copied to this walk's own folder (tests/helpers/fakeBuild.mjs)
  fake = spawn(process.execPath, ['tests/helpers/fakeNextServer.mjs', String(PORT), 'prod', '3'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], detached: true }); reap(fake, 'the fake stack server');
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the fake stack server did not start')), 180000); fake.stdout.on('data', (d) => { if (/ready/.test(String(d))) { clearTimeout(t); res(); } }); });
}, { timeout: START_TIMEOUT + 600000 });
after(async () => {
  leaveTurn();
  if (fake) { try { process.kill(-fake.pid); } catch (e) { /* gone */ } }
  for (const pid of listeners(PORT)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
  if (turn) giveTurn();
}, { timeout: STOP_TIMEOUT });

// A token shaped like the JWT supabase-js reads the expiry from, valid for an hour.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.stub`;
const USER = { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'realtor@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = () => ({ access_token: jwt(), refresh_token: 'refresh-stub', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER });

// Every Supabase auth call answered locally, plus the dashboard the save lands on.
async function stub(page, calls) {
  await page.route('**/auth/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/auth/v1/', '');
    calls.push(`${req.method()} ${path}`);
    if (page.context().__noSupabase) page.context().__noSupabase.answered(req); // answered here, in the browser
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'user' && req.method() === 'GET') return json(USER);
    if (path === 'user' && req.method() === 'PUT') return json(USER);
    if (path === 'verify' || path === 'token') return json(session());
    return json({});
  });
  await page.route('**/dashboard', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>dashboard</body></html>' }));
}

// A link is always opened as a fresh document: changing only the fragment would never reload the
// page, and the walk would be reading the last step's render.
async function open(page, suffix) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/reset-password${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
}

async function walk(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await blockSupabase(ctx);
  const page = await ctx.newPage();
  const calls = [];
  const shots = [];
  const shot = async (name) => { const p = `/tmp/reset-${tag}-${name}.png`; await page.screenshot({ path: p }); shots.push(p); };
  try {
    await stub(page, calls);
    const form = page.locator('#password');

    // 1. The query form: a hashed recovery token.
    await open(page, '?token_hash=stub-token-hash&type=recovery');
    await form.waitFor({ timeout: 8000 });
    assert.ok(await page.locator('#confirm').isVisible(), 'the confirm field is there');
    assert.ok(calls.some((c) => c.startsWith('POST verify')), `the token was verified (${calls.join(', ')})`);
    assert.doesNotMatch(page.url(), /token_hash/, 'the token leaves the address bar');
    await shot('1-query-form');

    // 2. The fragment form: the pair that never reaches the server.
    await page.evaluate(() => Object.keys(localStorage).forEach((k) => localStorage.removeItem(k)));
    await ctx.clearCookies();
    await open(page, `#access_token=${jwt()}&refresh_token=refresh-stub&type=recovery&expires_in=3600&token_type=bearer`);
    await form.waitFor({ timeout: 8000 });
    assert.equal(await page.locator('#password').count(), 1, 'one password field');
    assert.doesNotMatch(page.url(), /access_token/, 'the token leaves the address bar');
    await shot('2-fragment-form');

    // 3. An expired link: one line, and a way to ask for another.
    await open(page, '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await page.getByText('That link has expired.').waitFor({ timeout: 8000 });
    assert.equal(await page.locator('#password').count(), 0, 'no form on a dead link');
    assert.equal(await page.locator('a[href="/forgot-password"]').count(), 1, 'a link to request another');
    await shot('3-expired');

    // 4. A saved password lands on the dashboard.
    await open(page, `#access_token=${jwt()}&refresh_token=refresh-stub&type=recovery`);
    await form.waitFor({ timeout: 8000 });
    await page.locator('#password').fill('a-strong-password');
    await page.locator('#confirm').fill('a-strong-password');
    await page.getByRole('button', { name: /Save new password/ }).tap();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    assert.ok(calls.some((c) => c.startsWith('PUT user')), `the password was set (${calls.join(', ')})`);
    await shot('4-saved');
    noSupabaseLeft(ctx, tag);
    return shots;
  } finally { await browser.close(); }
}

test('password reset in WebKit at 390 with a stubbed Supabase', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  const shots = await walk(pw.webkit, {}, 'wk');
  assert.equal(shots.length, 4);
});

test('the same reset walk in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, async () => {
  const shots = await walk(pw.chromium, { executablePath: chromeBin }, 'cr');
  assert.equal(shots.length, 4);
});
