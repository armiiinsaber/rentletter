// Back at any speed, and no permanent skeleton: the parts below the browser walk
// (tests/routes/backWebkit.test.mjs).
//   forgetData: a navigation that ends without arriving takes Next's copy of its data with it, and
//   only that route's copy, so the next visit makes a live request.
//   warm: a read started on the touch that failed or was cut off is never handed to a page.
//   The frame draws a skeleton only for the navigation still in flight, writes the history entry
//   with the tap, and watches every skeleton; the skeletons' way back is live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
globalThis.window = { location: { href: 'http://localhost/dashboard', pathname: '/dashboard', search: '', hash: '' }, __NEXT_DATA__: { buildId: 'b1' } };
const routes = await import('../components/nav/routes.js');
const Router = (await import('next/router')).default;

test('a navigation that ended without arriving forgets its data, and only its own', () => {
  const settled = Promise.resolve({ stale: true });
  Router.router = { sdc: {
    'http://localhost/_next/data/b1/dashboard.json': settled,
    'http://localhost/_next/data/b1/listing/L2.json?id=L2': settled,
    'http://localhost/_next/data/b1/profile.json': settled,
  } };
  routes.forgetData('/dashboard');
  assert.deepEqual(Object.keys(Router.router.sdc), ['http://localhost/_next/data/b1/listing/L2.json?id=L2', 'http://localhost/_next/data/b1/profile.json']);
  routes.forgetData('/listing/L2#docs=x');
  assert.deepEqual(Object.keys(Router.router.sdc), ['http://localhost/_next/data/b1/profile.json'], 'the query and the hash do not matter');
  routes.forgetData('/listing/L9');
  assert.equal(Object.keys(Router.router.sdc).length, 1, 'another route is left alone');
  Router.router = null;
  routes.forgetData('/dashboard'); // no router yet: nothing to do, never a throw
});

test('a read started on the touch that failed is never handed to a page', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.reject(new Error('Load failed'));
    const first = await routes.warm('/api/assistant/signals');
    assert.equal(first.ok, false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(routes.takeWarm('/api/assistant/signals'), null, 'dropped as soon as it settled');
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ signals: { a: 1 } }) });
    const second = await routes.warm('/api/assistant/signals');
    assert.equal(second.ok, true, 'the next read is live');
    assert.ok(routes.takeWarm('/api/assistant/signals'), 'a good read stays for the page to take');
    routes.forgetWarm('/api/assistant/signals');
    assert.equal(routes.takeWarm('/api/assistant/signals'), null, 'a retry forgets it');
  } finally { globalThis.fetch = realFetch; }
});

test('the frame: a skeleton only for the navigation in flight, its data forgotten when it ends', () => {
  const f = src('components/nav/RouteFrame.js');
  assert.match(f, /const show = \(\) => \{\s*\n\s*if \(!active \|\| active\.id !== id\) return;/, 'a navigation that already ended never draws its skeleton afterwards');
  assert.match(f, /const failed = \(err, url\) => \{\s*\n\s*clearTimeout\(watch\); active = null;\s*\n\s*if \(url\) forgetData\(url\);/, 'a cancelled or failed navigation forgets its data');
  assert.match(f, /const underneath = samePath\(url, at\.current\);/, 'back to the screen underneath: that screen, never its skeleton');
  assert.match(f, /if \(round === 1\) \{ retrying = \{ url, round: 2 \}; Router\.replace\(url, undefined, \{ scroll: false \}\); return; \}/, 'retried once by itself');
  assert.match(f, /setPending\(\(p\) => \(p \? \{ \.\.\.p, failed: true \} : p\)\);/, 'then the line and the pill');
  assert.match(f, /Router\.events\.on\('beforeHistoryChange', alignAhead\);/);
  const r = src('components/nav/routes.js');
  assert.match(r, /if \(!replace && r\.kind !== 'demo'\) writeAhead\(target\);/, 'the history entry is written with the tap');
  assert.match(r, /if \(ahead\) window\.history\.replaceState\(entry\(as\), '', as\); else window\.history\.pushState\(entry\(as\), '', as\);/);
  assert.match(r, /Router\.router\.isFirstPopStateEvent = false;/, 'Next answers every back from then on');
});

test('every skeleton is watched, and its way back is live', () => {
  const k = src('components/nav/RouteSkeleton.js');
  assert.match(k, /export const SKELETON_WAIT = 4000;/);
  assert.match(k, /<a \{\.\.\.linkProps\('\/dashboard', \{ back: true \}\)\}/, 'All listings and Dashboard work in a skeleton');
  assert.match(k, /<p [^>]*>Couldn’t load this\.<\/p>/); assert.match(k, />Try again<\/button>/);
  assert.match(src('components/dashboard/HomeView.js'), /useSkeletonWatch\(!ready && !listingsError, \(\) => setLoadRound\(\(n\) => n \+ 1\)\)/);
  assert.match(src('components/dashboard/ListingView.js'), /useSkeletonWatch\(!applicantsLoaded, \(\) => setApplicantsRound\(\(n\) => n \+ 1\)\)/);
  const f = src('components/nav/RouteFrame.js');
  assert.match(f, /try \{ moving\.skipTransition\(\); \}/, 'a tap during a push or a back ends the transition');
  assert.match(f, /window\.addEventListener\('click', clicked, true\);/, 'and goes where it was aimed');
  // The checks stay on the server: the dashboard still sends its page from them.
  assert.match(src('pages/dashboard.js'), /const inApp = String\(ctx\.req\?\.url \|\| ''\)\.startsWith\('\/_next\/data\/'\)/);
});
