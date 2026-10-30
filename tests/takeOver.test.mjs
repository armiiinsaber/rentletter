// Two promises of the realtor screens' navigation (components/nav/RouteFrame.js), held in the code
// (the walks prove them in WebKit and Chrome: tests/routes/backWebkit.test.mjs parts 3 and 4):
//   A view transition ended before it animates (a tap while a screen is on its way) is never a page
//   error: every view transition in the app goes through `settled`, which handles its ready and
//   finished promises.
//   The page taking over a seen screen keeps it: the seen screen is drawn as the page itself, in
//   the page's place, so React keeps every node when the page lands; each page registers itself,
//   and each view adopts the page's props when it takes over (useTakeOver).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => readFileSync(`${ROOT}${f}`, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const files = [];
const walk = (d) => { for (const n of readdirSync(`${ROOT}${d}`)) { const p = `${d}/${n}`; if (statSync(`${ROOT}${p}`).isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(n)) files.push(p); } };
for (const d of ['pages', 'components', 'lib']) walk(d);

test('every view transition goes through settled, which handles ready and finished', () => {
  const f = src('components/nav/RouteFrame.js');
  assert.match(f, /const settled = \(vt, after\) => \{ vt\.ready\.catch\(\(\) => \{\}\); vt\.finished\.catch\(\(\) => \{\}\)\.finally\(after\); \};/);
  const starts = (stripComments(f).match(/document\.startViewTransition\(/g) || []).length;
  assert.equal(starts, 2, 'the push or back, and the swipe back under reduced motion');
  assert.equal((f.match(/settled\(vt, \(\) => \{ if \(moving === vt\) moving = null; delete html\.dataset\.nav; \}\);/g) || []).length, starts, 'each one, settled');
  assert.doesNotMatch(f, /vt\.finished\.catch\(\(\) => \{\}\)\.finally\(\(\) =>/, 'never finished alone');
  const elsewhere = files.filter((p) => p !== 'components/nav/RouteFrame.js' && /\.startViewTransition\(/.test(stripComments(src(p))));
  assert.deepEqual(elsewhere, [], 'no view transition starts anywhere else');
});

test('a seen screen is its page, drawn in the page\'s place, and adopts the page\'s props', () => {
  const f = src('components/nav/RouteFrame.js');
  assert.match(f, /const seen = pending && pending\.cached && !pending\.shot && !pending\.failed \? pending\.cached : null;/);
  assert.match(f, /const view = seen \? <seen\.View \{\.\.\.seen\.props\} \/> : pending \? <RouteLoader /);
  assert.doesNotMatch(src('components/nav/RouteLoader.js'), /route\.cached/, 'never inside the Loader, where it was a different element from the page');
  for (const [page, kind, Page, view] of [['pages/dashboard.js', 'dashboard', 'LandlordPage', 'components/dashboard/HomeView.js'], ['pages/listing/[id].js', 'listing', 'ListingPage', 'components/dashboard/ListingView.js'], ['pages/profile.js', 'profile', 'ProfilePage', 'components/dashboard/ProfileView.js']]) {
    const p = src(page);
    assert.match(p, new RegExp(`export default function ${Page}\\(props\\)`));
    assert.match(p, new RegExp(`registerScreenView\\('${kind}', ${Page}\\);`), `${page} registers the page itself`);
    assert.match(src(view), /useTakeOver\(\[initialProfile/, `${view} adopts the page's props`);
  }
  const r = src('components/nav/routes.js');
  assert.match(r, /export function useTakeOver\(sent, adopt\)/);
  assert.match(src('components/dashboard/ListingView.js'), /\}, \[applicantsRound, sent\]\);/, 'a listing taken over without applicants reads them again');
});
