// The iPhone zoom, in WebKit (Safari's engine) and in Chrome. On an iPhone, signing in with Face ID
// landed on a dashboard zoomed in and wider than the screen: the sign in fields were 15px, iOS
// Safari zooms on focus of any field under 16px, and the zoom carried into the dashboard.
//   1. Sign in at 390 with an iPhone user agent: focus the email field, then the password field
//      (each 16px or more, each with the ink focus ring), submit, land on the dashboard; the visual
//      viewport scale is 1, the page is exactly the viewport wide, and the avatar and every card
//      sit inside it. Supabase auth is answered by the harness and the dashboard's data request is
//      answered with the sandbox dashboard, so nothing leaves the machine.
//   2. Every screen (tests/helpers/screens.mjs) at 390 and 360: one viewport tag, allowing pinch
//      zoom; no field under 16px; the page never wider than the viewport, measured with the
//      overflow masks lifted so a hidden cause still counts, and no element cut off at the edge.
// Playwright's WebKit does not run iOS's focus zoom itself (the scale stays 1 even on a 15px
// field), so the walk asserts its cause, the computed size of the focused field, beside the scale.
// A WebKit walk fails, never skips, when the binary is missing (tests/helpers/browsers.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { devServer, BASE, START_TIMEOUT, STOP_TIMEOUT } from '../helpers/devServer.mjs';
import { requireWebkit, playwright as pw, haveWebkit, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { SCREENS, SMALL_FIELDS, WIDER_THAN_VIEWPORT, VIEWPORT_META } from '../helpers/screens.mjs';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const server = devServer(`${BASE}/signin`);
before(() => ((haveWebkit || haveChrome) ? server.start() : undefined), { timeout: START_TIMEOUT });
after(() => server.stop(), { timeout: STOP_TIMEOUT });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.stub`;
const USER = { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'realtor@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = () => ({ access_token: jwt(), refresh_token: 'refresh-stub', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER });
const context = (browser, width, height) => browser.newContext({ baseURL: BASE, viewport: { width, height }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

// What a focused field looks like: its size, its ring, the page scale.
const focusState = (page) => page.evaluate(() => {
  const el = document.activeElement; const cs = getComputedStyle(el);
  return { id: el.id, size: parseFloat(cs.fontSize), ring: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, scale: window.visualViewport ? window.visualViewport.scale : 1, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
});

async function signIn(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const ctx = await context(browser, 390, 844);
  const page = await ctx.newPage();
  const calls = [];
  await page.route('**/auth/v1/**', (route) => { const path = new URL(route.request().url()).pathname.replace('/auth/v1/', ''); calls.push(`${route.request().method()} ${path}`); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path === 'token' ? session() : USER) }); });
  // The dashboard's server side read needs a real session; the sandbox dashboard renders the same components.
  await page.route('**/_next/data/**/dashboard.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pageProps: { __N_REDIRECT: '/demo/dashboard', __N_REDIRECT_STATUS: 307 }, __N_SSP: true }) }));
  try {
    await page.goto('/signin', { waitUntil: 'networkidle' });
    for (const [id, value] of [['email', 'realtor@example.com'], ['password', 'a-long-password']]) {
      await page.locator(`#${id}`).tap(); await page.waitForTimeout(300);
      const f = await focusState(page);
      assert.equal(f.id, id, `${tag}: the ${id} field has focus`);
      assert.ok(f.size >= 16, `${tag}: the focused ${id} field is ${f.size}px, 16px or more`);
      assert.equal(f.ring, 'solid 2px rgb(15, 15, 16)', `${tag}: the focused ${id} field shows the ink ring`);
      assert.equal(f.scale, 1, `${tag}: no zoom with the ${id} field focused`); assert.equal(f.sw, f.iw, `${tag}: the page is the viewport wide with the ${id} field focused`);
      if (id === 'email') await page.screenshot({ path: `/tmp/zoom-${tag}-signin-focused.png` });
      await page.locator(`#${id}`).fill(value);
    }
    await page.getByRole('button', { name: /Sign in/ }).tap();
    await page.waitForURL('**/demo/dashboard**', { timeout: 30000 });
    await page.locator('.dash-grid').first().waitFor({ timeout: 20000 }); await page.waitForTimeout(600);
    assert.ok(calls.some((c) => /^POST token/.test(c)), `${tag}: the password was sent to the auth stub (${calls.join(', ')})`);
    const landed = await page.evaluate(() => {
      const iw = window.innerWidth; const right = (el) => (el ? Math.round(el.getBoundingClientRect().right) : null);
      return { scale: window.visualViewport ? window.visualViewport.scale : 1, vw: window.visualViewport ? Math.round(window.visualViewport.width) : iw, sw: document.documentElement.scrollWidth, iw, avatar: right(document.querySelector('.rl-hdr-avatar')), cards: [...document.querySelectorAll('.dash-card')].map(right) };
    });
    assert.equal(landed.scale, 1, `${tag}: the dashboard lands at scale 1`);
    assert.equal(landed.vw, landed.iw, `${tag}: the visual viewport is the layout viewport`);
    assert.equal(landed.sw, landed.iw, `${tag}: the dashboard is exactly the viewport wide (${landed.sw} of ${landed.iw})`);
    assert.ok(landed.avatar != null && landed.avatar <= landed.iw, `${tag}: the avatar sits inside the screen (right edge ${landed.avatar})`);
    assert.ok(landed.cards.length > 0 && landed.cards.every((r) => r <= landed.iw), `${tag}: every card sits inside the screen (${landed.cards.join(', ')})`);
    const wide = await page.evaluate(WIDER_THAN_VIEWPORT);
    assert.deepEqual(wide.out, [], `${tag}: nothing on the dashboard sticks out of the viewport`); assert.ok(wide.lifted <= wide.iw, `${tag}: not wider with the masks lifted`);
    await page.screenshot({ path: `/tmp/zoom-${tag}-dashboard.png` });
  } finally { await browser.close(); }
}

async function sweep(browserType, launch, tag) {
  const browser = await browserType.launch(launch);
  const problems = []; let visited = 0;
  try {
    for (const width of [390, 360]) {
      const ctx = await context(browser, width, width === 390 ? 844 : 780);
      for (const s of SCREENS) {
        const page = await ctx.newPage();
        try {
          await s.go(page); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(700);
          const small = await page.evaluate(SMALL_FIELDS);
          const w = await page.evaluate(WIDER_THAN_VIEWPORT);
          visited++;
          for (const f of small) problems.push(`${s.name} at ${width}: ${f.el} is ${f.size}px`);
          if (w.asIs > w.iw || w.lifted > w.iw) problems.push(`${s.name} at ${width}: scrollWidth ${w.asIs} (${w.lifted} with the masks lifted) of ${w.iw}`);
          for (const o of w.out) problems.push(`${s.name} at ${width}: ${o.el} runs from ${o.left} to ${o.right}`);
          if (w.metas.length !== 1 || w.metas[0] !== VIEWPORT_META) problems.push(`${s.name} at ${width}: viewport tags ${JSON.stringify(w.metas)}`);
          if (w.scale !== 1) problems.push(`${s.name} at ${width}: scale ${w.scale}`);
        } catch (e) { problems.push(`${s.name} at ${width}: did not open (${String(e.message).split('\n')[0]})`); }
        await page.close();
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(`${tag}: ${visited} screen states checked, ${problems.length} problems`);
  assert.equal(visited, SCREENS.length * 2, `${tag}: every screen opened at both widths\n${problems.join('\n')}`);
  assert.deepEqual(problems, []);
}

test('sign in with the fields focused, land on the dashboard at scale 1 and the viewport wide, in WebKit', async () => {
  requireWebkit(); // fails with the install line when the binary is missing, never skips
  await signIn(pw.webkit, {}, 'wk');
});
test('every screen in WebKit at 390 and 360: fields 16px or more, never wider than the viewport', { timeout: 900000 }, async () => {
  requireWebkit();
  await sweep(pw.webkit, {}, 'wk');
});
test('the same sign in in Chrome', { skip: haveChrome ? false : 'Chrome binary absent' }, () => signIn(pw.chromium, { executablePath: chromeBin }, 'cr'));
test('every screen in Chrome at 390 and 360', { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => sweep(pw.chromium, { executablePath: chromeBin }, 'cr'));
