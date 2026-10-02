// The edge swipe back, below the browser walk (tests/routes/edgeWebkit.test.mjs).
//   The trail: the app's record of its own history entries decides whether there is a screen of
//   the app to go back to, and which; an entry from before this session is never one.
//   The pictures: the last four screens, by path.
//   The rules: only in the installed app, only from the left 20px, never on the dashboard, never with
//   a sheet open or a screen on its way; 1:1 tracking, a third or a flick, 280ms on the iOS curve,
//   the 120ms crossfade under reduced motion, nothing on scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const loc = { href: 'http://localhost/dashboard', pathname: '/dashboard', search: '', hash: '' };
const hist = { state: null };
globalThis.window = { location: loc, history: hist, __NEXT_DATA__: { buildId: 'b1' } };
const routes = await import('../components/nav/routes.js');
const at = (path, key) => { loc.pathname = path; loc.href = `http://localhost${path}`; hist.state = key ? { key } : null; };

test('the trail knows the screen of the app behind this one, and nothing before the session', () => {
  at('/dashboard', null);
  routes.trailLanded('/dashboard'); // the first load: Next has not written its key yet
  assert.equal(routes.trailBack(), null, 'nothing behind the first screen');
  at('/dashboard', 'k0'); routes.trailFix(); // the key arrives before the next entry is written
  at('/listing/L1', 'k1'); routes.trailLanded('/listing/L1');
  assert.deepEqual(routes.trailBack(), { key: 'k0', url: '/dashboard' }, 'a push: the dashboard is behind');
  at('/listing/L1', 'k1'); routes.trailLanded('/listing/L1?x=1');
  assert.equal(routes.trailBack().url, '/dashboard', 'a replace keeps the same entry');
  at('/dashboard', 'k0'); routes.trailPopped();
  assert.equal(routes.trailBack(), null, 'a back: on the first entry again');
  at('/profile', 'k2'); routes.trailLanded('/profile');
  assert.deepEqual(routes.trailBack(), { key: 'k0', url: '/dashboard' }, 'a push from there drops the forward entry');
  at('/listing/L1', 'k1'); routes.trailPopped();
  assert.equal(routes.trailBack(), null, 'an entry it no longer holds (or from before the session) starts over: no swipe back');
});

test('a picture of each of the last four screens, by path', () => {
  const shot = (n) => ({ holder: null, css: '', y: n });
  for (const [i, p] of ['/dashboard', '/listing/L1', '/listing/L2', '/profile', '/billing'].entries()) routes.rememberScreen(p, shot(i));
  assert.equal(routes.seenScreen('/dashboard'), null, 'the oldest left');
  assert.equal(routes.seenScreen('/billing').y, 4);
  routes.rememberScreen('/listing/L1', shot(9));
  assert.equal(routes.seenScreen('/listing/L1').y, 9, 'a new picture replaces the old one');
  routes.rememberScreen('/apply/x', shot(1));
  assert.equal(routes.seenScreen('/apply/x'), null, 'only realtor screens');
  routes.rememberScreen('/profile', null);
  assert.equal(routes.seenScreen('/profile').y, 3, 'no picture (the screen was not real yet): the last one stays');
});

test('the gesture: where it starts, how it follows, how it ends', async () => {
  const e = src('components/nav/EdgeBack.js');
  assert.match(e, /export const EDGE = 20;/); assert.match(e, /export const COMMIT = 1 \/ 3;/); assert.match(e, /export const PARALLAX = 0\.24;/);
  assert.match(e, /e\.pointerType !== 'touch' \|\| e\.isPrimary === false \|\| e\.clientX > EDGE/, 'a touch within 20px of the left edge');
  assert.match(e, /if \(Math\.abs\(dy\) >= Math\.abs\(dx\) \|\| dx <= 0 \|\| !allowed\(\)\) \{ g = null; return; \}/, 'mostly vertical: left to the page');
  assert.match(e, /s\.els\.page\.style\.transform = `translate3d\(\$\{Math\.max\(s\.dx, 0\)\}px, 0, 0\)`;/, '1:1 with the finger');
  assert.match(e, /const through = e\.type === 'pointerup' && \(flick \|\| \(!s\.reduced && s\.dx > s\.w \* COMMIT\)\);/, 'past a third, or a flick');
  assert.match(e, /\{ duration: NATIVE\.push, easing: CURVE\.ios, fill: 'forwards' \}/, '280ms on the iOS curve');
  assert.match(e, /if \(s\.reduced\) \{ if \(through\) commit\(true\); return; \}/, 'reduced motion: no tracking, a flick goes back');
  assert.doesNotMatch(e, /addEventListener\('scroll'/, 'nothing on scroll');
  const f = src('components/nav/RouteFrame.js');
  assert.match(f, /if \(!isStandalone\(\) \|\| QUIET\.test\(window\.location\.pathname\)\) return false;/, 'the installed app only, never a tenant or landlord page');
  assert.match(f, /here\.depth === 0\) return false; \/\/ never on the dashboard/);
  assert.match(f, /if \(active \|\| shown \|\| moving \|\| html\.dataset\.nav \|\| html\.classList\.contains\('rl-sheet-open'\)/, 'never with a sheet open or a screen on its way');
  assert.match(f, /html\.dataset\.nav = 'fade';/, 'the 120ms crossfade under reduced motion');
  assert.match(f, /const id = \+\+seq; active = \{ id, url: prev\.url \}; arm\(id, prev\.url, 1\);/, 'a completed swipe is under the skeleton watch');
  const m = await import('../lib/motion.js');
  assert.equal(m.NATIVE.push, 280); assert.equal(m.NATIVE.fade, 120);
});
