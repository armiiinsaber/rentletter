// public/sw.js  The service worker of the installed realtor app. Minimal on purpose.
// It caches exactly two things:
//   1. static assets, by path: the build's hashed files (/_next/static/), the two self hosted
//      fonts (/fonts/), the icons (/icons/), the logo files (/brand/), the launch images
//      (/splash/) and /favicon.ico. None of these carries anything personal.
//   2. one offline page, /offline.html, shown when a page cannot load.
// Everything else goes straight to the network and is never stored: every API route (/api/),
// every page's data (/_next/data/), every page itself (the dashboard, a listing, an applicant, a
// report, an upload link), every document and every report PDF. A page load is network first;
// only when the network fails does the offline page answer, and the page is never written to the
// cache. tests/serviceWorker.test.mjs holds it to that.
const CACHE = 'rl-static-v1';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/fonts/inter-latin.woff2', '/fonts/fraunces-latin.woff2', '/icons/icon-192.png', '/brand/rentletter-logo.svg'];
const STATIC_PREFIXES = ['/_next/static/', '/fonts/', '/icons/', '/brand/', '/splash/'];

// Is this a static asset the worker may keep? Same origin, a GET, a path on the allow list.
function isStatic(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false; // a query makes it a request for something, not a file
  if (url.pathname === OFFLINE || url.pathname === '/favicon.ico') return true;
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
}
self.isStatic = isStatic;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // a write always goes to the network, untouched
  const url = new URL(req.url);
  // A page: the network, never the cache; the offline page only when the network fails.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (!isStatic(url)) return; // API, page data, documents, reports: the network alone
  // A static asset: the cache first, then the network, kept only when it came back whole.
  event.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  }))));
});
