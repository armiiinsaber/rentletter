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
const warmCache = new Map();
export function warm(url) {
  const hit = warmCache.get(url);
  if (hit && Date.now() - hit.at < 20000) return hit.promise;
  const promise = fetch(url, { credentials: 'same-origin' }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, status: 0, json: {} }));
  warmCache.set(url, { at: Date.now(), promise });
  return promise;
}
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

// Go to a realtor screen through the router; anything else loads as a page.
export function go(href, { back = null, replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const r = routeOf(href);
  if (!r) { window.location.href = href; return; }
  nextDirection = back == null ? null : back ? 'back' : 'push';
  const u = parse(href);
  const target = u.pathname + u.search + u.hash;
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
