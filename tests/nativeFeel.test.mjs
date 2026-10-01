// The native feel, below the browser:
//   A tap inside the app (Next's data request, x-nextjs-data) sends the listing page and the
//   dashboard from their checks alone: the session, the ownership and the entitlement are checked
//   exactly as on a full load, and only the heavy reads move to the page (the applicants through
//   /api/listings/applicants, which checks the session and the ownership itself; the dashboard's
//   signals through their own routes).
//   Every realtor link goes through the router (components/nav/routes.js), never a page reload.
//   Every sheet and modal on the realtor side is the one sheet (components/Sheet.js).
//   The one press mechanism and the native timings live in lib/motion.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeCtx } = await import('./helpers/fakeStack.mjs');
const { tables, USER } = await import('./routes/fixture.mjs');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const listingPage = await import('../pages/listing/[id].js');
const dashboardPage = await import('../pages/dashboard.js');
// Next's own data request: the URL is the data route (and, on a dynamic route, the header is kept).
const inApp = (ctx, page = 'dashboard') => { ctx.req.url = `/_next/data/build/${page}.json`; return ctx; };

test('a tap into a listing: the checks run, the applicants come later', async () => {
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    const r = await listingPage.getServerSideProps(inApp(fakeCtx({ params: { id: 'L1' } }), 'listing/L1'));
    assert.equal(r.props.initialListing.id, 'L1');
    assert.equal(r.props.initialApplicants, null, 'the page loads them, started on the touch');
    assert.equal(r.props.initialProfile.id, USER.id);
    const full = await listingPage.getServerSideProps(fakeCtx({ params: { id: 'L1' } }));
    assert.ok(Array.isArray(full.props.initialApplicants) && full.props.initialApplicants.length > 0, 'a full load still brings them');
    // Ownership: another realtor's listing redirects, in the app as on a full load.
    assert.deepEqual(await listingPage.getServerSideProps(inApp(fakeCtx({ params: { id: 'L9' } }), 'listing/L9')), { redirect: { destination: '/dashboard', permanent: false } });
    // The header alone, as Next keeps it on a dynamic route, counts too.
    const byHeader = fakeCtx({ params: { id: 'L1' } }); byHeader.req.headers['x-nextjs-data'] = '1';
    assert.equal((await listingPage.getServerSideProps(byHeader)).props.initialApplicants, null);
  } finally { s.restore(); }
  // The session: no user, no page.
  const anon = installFakeStack({ tables: tables(), user: null });
  try {
    assert.deepEqual(await listingPage.getServerSideProps(inApp(fakeCtx({ params: { id: 'L1' } }))), { redirect: { destination: '/signin?next=/dashboard', permanent: false } });
    assert.deepEqual(await dashboardPage.getServerSideProps(inApp(fakeCtx({}))), { redirect: { destination: '/signin?next=/dashboard', permanent: false } });
  } finally { anon.restore(); }
});

test('a tap back to the dashboard: the checks and the entitlement, the signals later', async () => {
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    const r = await dashboardPage.getServerSideProps(inApp(fakeCtx({})));
    assert.equal(r.props.initialSignals, null, 'the page shows the signals it has and refreshes them');
    assert.ok(r.props.entitlement && typeof r.props.entitlement === 'object', 'the entitlement is computed on the server, as before');
    assert.equal(r.props.initialListings.length, 2);
    const full = await dashboardPage.getServerSideProps(fakeCtx({}));
    assert.ok(full.props.initialSignals && full.props.initialSignals.loaded, 'a full load still brings them');
  } finally { s.restore(); }
});

test('the applicants route the page reads checks the session and the ownership itself', () => {
  const route = src('pages/api/listings/applicants.js');
  assert.match(route, /auth\.getUser\(\)/); assert.match(route, /status\(401\)/);
  assert.match(route, /from\('listings'\)[\s\S]{0,80}\.eq\('id', listingId\)/); assert.match(route, /status\(404\)/);
  assert.match(src('components/nav/routes.js'), /export const applicantsUrl = \(listingId\) => `\/api\/listings\/applicants\?listingId=/);
});

const walk = (dir, out = []) => { for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) { const p = join(dir, f.name); if (f.isDirectory()) walk(p, out); else if (/\.js$/.test(f.name)) out.push(p); } return out; };
const REALTOR = [...walk('components/dashboard'), ...walk('components/listings'), 'components/ui.js'];

test('every realtor link goes through the router, never a page reload', () => {
  const offenders = [];
  for (const p of REALTOR) {
    const s = src(p);
    // A reload to a realtor screen: window.location to a path from adapter.paths or a listing.
    if (/window\.location\.href\s*=\s*(adapter\.paths|`\$\{adapter\.paths|actionHref|href\b)/.test(s)) offenders.push(`${p}: window.location`);
    if (/<a\s+href=\{adapter\.paths/.test(s)) offenders.push(`${p}: a plain link to a realtor screen`);
  }
  assert.deepEqual(offenders, []);
  const h = src('components/dashboard/HomeView.js');
  assert.match(h, /data-press="card"\s*\n\s*\{\.\.\.cardProps\(adapter\.paths\.listing\(l\.id\)\)\}/, 'the listing card taps through the router and prefetches on the touch');
  const r = src('components/nav/routes.js');
  assert.match(r, /onPointerDown: \(\) => prefetch\(href\)/); assert.match(r, /onTouchStart: \(\) => prefetch\(href\)/);
  assert.match(src('pages/_app.js'), /<RouteFrame><Component \{\.\.\.pageProps\} \/><\/RouteFrame>/);
});

test('every sheet and modal on the realtor side is the one sheet', () => {
  const scrims = [];
  for (const p of REALTOR) {
    const s = src(p);
    if (/position:\s*'fixed',\s*inset:\s*0/.test(s) || /position: fixed; inset: 0/.test(s)) scrims.push(p);
  }
  assert.deepEqual(scrims, [], 'no hand made scrim is left');
  for (const p of ['components/ui.js', 'components/listings/ListingSetupModal.js', 'components/dashboard/ListingView.js', 'components/dashboard/ReferModal.js', 'components/dashboard/AssistantPanel.js', 'components/dashboard/DocumentViewer.js']) {
    assert.match(src(p), /<Sheet\b/, `${p} uses components/Sheet.js`);
  }
  const sheet = src('components/Sheet.js');
  assert.match(sheet, /\.rl-sh-scroll \{[^}]*overflow-y: auto; overscroll-behavior: none;/, 'the sheet scroller never hands a swipe to the page and never drags past its end');
  assert.match(sheet, /body\.style\.position = 'fixed'; body\.style\.top = `-\$\{y\}px`;/, 'the page behind is pinned where it was');
  assert.match(sheet, /window\.scrollTo\(\{ top: y, left: 0, behavior: 'instant' \}\)/, 'and put back exactly on close, never smoothly');
  assert.match(sheet, /<span className="rl-sh-handle" \/>/, 'a grab handle');
  assert.match(sheet, /transform: translateY\(100%\); transition: transform \$\{NATIVE\.sheet\}ms \$\{CURVE\.ios\}/, 'it rises over 320ms on the iOS curve');
  assert.match(src('components/ui.js'), /overscroll-behavior-y: none;\s*\n\s*\}\s*\n\s*body \{ overscroll-behavior-y: none; \}/, 'the page root never drags past its last element');
});

test('one press mechanism and the native timings, in lib/motion.js', async () => {
  const m = await import('../lib/motion.js');
  assert.deepEqual(m.PRESS, { rest: 60, slop: 6, down: 90, up: 160 });
  assert.deepEqual(m.NATIVE, { push: 280, sheet: 320, fade: 120 });
  assert.equal(m.CURVE.ios, 'cubic-bezier(0.32, 0.72, 0, 1)');
  assert.match(m.PRESS_CSS, /\.rl-pressing \{ scale: 0\.98; transition: scale 90ms/);
  assert.match(m.PRESS_CSS, /\.rl-released \{ transition: scale 160ms/);
  assert.match(m.PRESS_CSS, /prefers-reduced-motion: reduce\) \{\s*\.rl-pressing \{ scale: none; opacity: 0\.9;/);
  assert.match(m.NAV_CSS, /@keyframes rl-nav-in \{ from \{ transform: translateX\(100%\); \} \}/);
  assert.match(m.NAV_CSS, /html\[data-nav="fade"\][^{]*\{ animation-duration: 120ms; \}/);
  // Disabled controls never react; tenant and landlord pages switch it off.
  assert.match(src('lib/motion.js'), /UNPRESSABLE = ':disabled, \[aria-disabled="true"\], \[data-press="off"\]'/);
  assert.match(src('components/nav/RouteFrame.js'), /QUIET = \/\^\\\/\(apply\|upload\|my-application\|keep\|ref\|refer\|a\|r\)\(\\\/\|\$\)\//);
  // No component keeps a press of its own.
  for (const p of REALTOR) assert.doesNotMatch(src(p), /:active \{ transform|:active\s*\{\s*transform/, `${p}: no press of its own`);
});
