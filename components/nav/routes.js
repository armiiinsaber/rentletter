// components/nav/routes.js  CLIENT.
// Realtor navigation without a freeze. Every realtor link goes through the Next router (go), so
// the app never reloads between the dashboard, a listing and the profile; the destination shows at
// once (components/nav/RouteFrame.js draws it from what is already known, skeletons for the rest),
// and the data starts loading on the touch that begins the tap (prefetch), so it is usually in hand
// by the time the page opens. The session, entitlement and ownership checks stay on the server,
// in getServerSideProps and in each API route; nothing here decides who may see what.
import Router from 'next/router';

// The realtor routes, the live app and the sandbox, with how deep each sits (a push goes deeper,
// a back goes up).
const ROUTES = [
  { kind: 'dashboard', depth: 0, re: /^\/dashboard\/?$/ },
  { kind: 'listing', depth: 1, re: /^\/listing\/([^/]+)\/?$/ },
  { kind: 'profile', depth: 1, re: /^\/profile\/?$/ },
  { kind: 'billing', depth: 1, re: /^\/billing\/?$/ },
  { kind: 'demo', depth: 0, re: /^\/demo\/dashboard\/?$/ },
];
const parse = (href) => { try { return new URL(href, typeof window === 'undefined' ? 'http://x' : window.location.href); } catch (e) { return null; } };
export function routeOf(href) {
  const u = parse(href); if (!u) return null;
  for (const r of ROUTES) {
    const m = u.pathname.match(r.re); if (!m) continue;
    if (r.kind === 'demo') {
      const listing = u.searchParams.get('listing'); const profile = u.searchParams.get('profile') === '1';
      return { kind: 'demo', demo: listing ? 'listing' : profile ? 'profile' : 'dashboard', depth: listing || profile ? 1 : 0, listingId: listing || null, path: u.pathname + u.search };
    }
    return { kind: r.kind, depth: r.depth, listingId: r.kind === 'listing' ? decodeURIComponent(m[1]) : null, path: u.pathname + u.search };
  }
  return null;
}
export const isRealtorHref = (href) => !!routeOf(href);

// ── What the realtor has already seen this session, so the next screen can draw it at once. ────
const seen = { profile: null, listings: new Map(), signals: null, signalsAt: 0, applicants: new Map() };
export const rememberProfile = (p) => { if (p && p.id) seen.profile = p; };
export const rememberListings = (list) => { for (const l of list || []) if (l && l.id) seen.listings.set(String(l.id), l); };
export const rememberSignals = (s) => { if (s && s.loaded) { seen.signals = s; seen.signalsAt = Date.now(); } };
export const rememberApplicants = (listingId, list) => { if (listingId && Array.isArray(list)) seen.applicants.set(String(listingId), list); };
export const seenProfile = () => seen.profile;
export const seenListing = (id) => (id == null ? null : seen.listings.get(String(id)) || null);
// Signals from this session, at most five minutes old: the dashboard shows them and refreshes.
export const seenSignals = () => (seen.signals && Date.now() - seen.signalsAt < 300000 ? seen.signals : null);
export const seenApplicants = (id) => (id == null ? null : seen.applicants.get(String(id)) || null);

// ── Data started on the touch: one request per URL, kept 20 seconds for the page to take. ──────
// A read that failed or was cut off is dropped the moment it settles, so nothing takes it later:
// the page then makes a live request of its own.
const warmCache = new Map();
export function warm(url) {
  const hit = warmCache.get(url);
  if (hit && Date.now() - hit.at < 20000) return hit.promise;
  const promise = fetch(url, { credentials: 'same-origin' }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, status: 0, json: {} }));
  const entry = { at: Date.now(), promise };
  warmCache.set(url, entry);
  promise.then((res) => { if (!res.ok && warmCache.get(url) === entry) warmCache.delete(url); });
  return promise;
}
// A retry wants a live answer, never the one it is retrying.
export const forgetWarm = (url) => { warmCache.delete(url); };
// The page takes what the touch started; the entry stays for its 20 seconds, so a page mounted
// twice (React's development check) still gets the one request.
export function takeWarm(url) {
  const hit = warmCache.get(url);
  return hit && Date.now() - hit.at < 20000 ? hit.promise : null;
}
export const applicantsUrl = (listingId) => `/api/listings/applicants?listingId=${encodeURIComponent(listingId)}`;
// The dashboard's signals in one read (the same load its server props do; session checked there).
export const SIGNALS_URL = '/api/assistant/signals';

// On the touch that starts a tap: the page's code, and for a listing its applicants (the same
// route the page reads, which checks the session and the ownership itself). The sandbox keeps its
// data in memory, so there is nothing to fetch there.
export function prefetch(href) {
  const r = routeOf(href); if (!r || typeof window === 'undefined') return;
  if (r.kind === 'demo') return;
  try { Router.prefetch(r.path); } catch (e) { /* prefetch is a hint */ }
  if (r.kind === 'listing' && r.listingId) warm(applicantsUrl(r.listingId));
  if (r.kind === 'dashboard') warm(SIGNALS_URL);
}

// The direction of the next navigation, set by go() and read by the frame.
let nextDirection = null;
export const takeDirection = () => { const d = nextDirection; nextDirection = null; return d; };

// ── Next's own copy of each page's data ──────────────────────────────────────────────────────
// Next keeps every page data request in router.sdc, keyed by its data URL. In a production build a
// navigation that is cancelled (a back, or another tap, before its data arrives) never removes its
// entry: fetchNextData keeps it (node_modules/next/dist/shared/lib/router/router.js:360) and only a
// route that completes deletes it (router.js:1335), after the cancellation has already thrown
// (router.js:1576). The next visit to that screen then took the old, already settled answer: stale
// data, and a navigation that completed before its own transition had drawn the skeleton, which
// then stayed. The frame (components/nav/RouteFrame.js) forgets a route's entry whenever its
// navigation ends without arriving, so the next one always makes a live request. Every data page
// here is server rendered (no getStaticProps), so no entry is ever meant to outlive its navigation.
export function forgetData(as) {
  if (typeof window === 'undefined') return;
  const r = Router.router; const u = parse(as);
  const build = window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId;
  if (!r || !r.sdc || !u || !build) return;
  const want = `/_next/data/${build}${u.pathname === '/' ? '/index' : u.pathname.replace(/\/$/, '')}.json`;
  for (const key of Object.keys(r.sdc)) {
    try { if (new URL(key, window.location.href).pathname === want) delete r.sdc[key]; } catch (e) { /* not a URL */ }
  }
}

// ── The screens behind this one, in this session ─────────────────────────────────────────────
// The app's own record of its history entries (each keyed by the key Next or writeAhead puts in the
// entry's state), so the edge swipe (components/nav/EdgeBack.js) knows whether there is a screen of
// the app to go back to, and which. An entry from before this session is unknown: no swipe back.
const trail = { list: [], at: -1 };
const stateKey = () => (typeof window !== 'undefined' && window.history.state && window.history.state.key) || null;
// A screen arrived (the first load, then every completed navigation).
export function trailLanded(url) {
  const k = stateKey(); const here = trail.list[trail.at];
  if (here && (here.key === k || here.key == null)) { here.key = k; here.url = url; return; } // the same entry: a replace, or a back already placed
  trail.list.splice(trail.at + 1); trail.list.push({ key: k, url }); trail.at = trail.list.length - 1;
}
// Next writes the first entry's key after the first paint: take it before the next entry is written.
export function trailFix() { const here = trail.list[trail.at]; if (here && here.key == null) here.key = stateKey(); }
// A back or a forward through the browser's history.
export function trailPopped() {
  const k = stateKey(); const i = k == null ? -1 : trail.list.findIndex((e) => e.key === k);
  if (i >= 0) { trail.at = i; return; }
  trail.list = [{ key: k, url: window.location.pathname + window.location.search }]; trail.at = 0;
}
export const trailBack = () => (trail.at > 0 ? trail.list[trail.at - 1] : null);

// ── How each screen last looked: a picture of it, drawn beneath the edge swipe ───────────────
// (components/nav/EdgeBack.js captureScreen). The last four screens, by path.
const screens = new Map();
export function rememberScreen(url, shot) {
  const r = routeOf(url); if (!r || !shot) return;
  screens.delete(r.path); screens.set(r.path, shot);
  while (screens.size > 4) screens.delete(screens.keys().next().value);
}
export const seenScreen = (url) => { const r = routeOf(url); return (r && screens.get(r.path)) || null; };

// ── The history entry, written with the tap ──────────────────────────────────────────────────
// Next writes a new screen's history entry only once its data has arrived, so while its skeleton
// showed, the URL was still the old screen's and a back left that one: on an iPhone, Safari's back
// went to whatever came before the dashboard. A push now writes the entry at once, in Next's own
// form, so the URL and the back gesture always match the screen on view. Next then sees the URL
// already in place and writes nothing more (router.js:1089). Until the screen arrives, a second tap
// replaces the entry instead of stacking a screen that never showed.
let ahead = null; // the URL written ahead of its screen
const entry = (as) => ({ url: as, as, options: { scroll: true }, __N: true, key: Math.random().toString(36).slice(2, 10) });
function writeAhead(as) {
  const here = window.location.pathname + window.location.search;
  const there = parse(as); if (!there) return;
  if (there.pathname + there.search === here) return; // the same screen (a hash at most): Next keeps it
  try {
    trailFix();
    if (ahead) window.history.replaceState(entry(as), '', as); else window.history.pushState(entry(as), '', as);
    ahead = as;
    // From here on Next must answer every back: its shortcut for Safari reopening a page
    // (router.js:1657) ignores the first popstate whose entry matches the screen under the skeleton.
    if (Router.router) Router.router.isFirstPopStateEvent = false;
  } catch (e) { ahead = null; }
}
// The screen arrived, or the realtor went back: the entry is history like any other.
export const settleAhead = () => { ahead = null; };
// A screen that ended somewhere else (the server redirected it): its entry takes that URL, in place.
export function alignAhead(as) {
  if (!ahead || typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search + window.location.hash;
  if (here !== as) { try { window.history.replaceState(entry(as), '', as); } catch (e) { /* Next writes its own */ } }
  ahead = as;
}

// Go to a realtor screen through the router; anything else loads as a page.
export function go(href, { back = null, replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const r = routeOf(href);
  if (!r) { window.location.href = href; return; }
  nextDirection = back == null ? null : back ? 'back' : 'push';
  const u = parse(href);
  const target = u.pathname + u.search + u.hash;
  if (!replace && r.kind !== 'demo') writeAhead(target);
  if (replace) Router.replace(target); else Router.push(target);
}

// Props for anything that takes the realtor to a realtor screen: a real link (it still opens in a
// new tab, and works before the script loads), routed through go() on a plain tap, and prefetched
// on the touch or press that starts the tap.
export function linkProps(href, opts = {}) {
  return {
    href,
    onClick: (e) => {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!isRealtorHref(href)) return;
      e.preventDefault(); go(href, opts);
    },
    onPointerDown: () => prefetch(href),
    onTouchStart: () => prefetch(href),
  };
}
// The same for a card that is not a link element (role="link"): tap, Enter and Space.
export function cardProps(href, opts = {}) {
  return {
    onClick: () => go(href, opts),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(href, opts); } },
    onPointerDown: () => prefetch(href),
    onTouchStart: () => prefetch(href),
  };
}
