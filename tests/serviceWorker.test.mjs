// The service worker (public/sw.js) caches static assets and one offline page, and nothing else:
// no API route, no page, no page data, no document, no report. Run in a sandbox with a fake
// cache and a fake network, then every kind of request the app makes goes through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://rentletter.ca';

function sandbox() {
  const handlers = {}; const store = new Map(); const puts = []; const network = [];
  const cache = {
    addAll: async (list) => { for (const u of list) { store.set(new URL(u, ORIGIN).href, { ok: true, url: u }); puts.push(new URL(u, ORIGIN).pathname); } },
    match: async (req) => store.get(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url) || undefined,
    put: async (req, res) => { store.set(req.url, res); puts.push(new URL(req.url).pathname); },
  };
  const self = { location: { origin: ORIGIN }, addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const ctx = {
    self, URL, Promise, console,
    caches: { open: async () => cache, keys: async () => ['rl-static-v1', 'old'], delete: async () => true, match: (req) => cache.match(req) },
    fetch: async (req) => { network.push(req.url || req); return { ok: true, type: 'basic', status: 200, clone() { return this; }, url: req.url || req }; },
  };
  vm.createContext(ctx); vm.runInContext(SW, ctx);
  // One fetch event: did the worker answer it, and with what.
  const fire = async (url, { mode = 'no-cors', method = 'GET' } = {}) => {
    let responded = null;
    await handlers.fetch({ request: { url: new URL(url, ORIGIN).href, mode, method }, respondWith: (p) => { responded = p; } });
    return responded ? await responded : null;
  };
  return { handlers, store, puts, network, fire, self, ctx };
}

// Everything the realtor side, the tenant side and the landlord side can fetch that is personal.
const NEVER = [
  ['/api/listings/applicants?listingId=L1', 'GET'], ['/api/notifications', 'GET'], ['/api/assistant/signals', 'GET'],
  ['/api/documents/open?id=d1', 'GET'], ['/api/report/pdf?token=abc', 'GET'], ['/api/listings/report-pdf?listingId=L1', 'GET'],
  ['/api/application/manage', 'POST'], ['/api/tenant/profile', 'GET'], ['/api/upload/resolve?token=x', 'GET'],
  ['/_next/data/build-id/dashboard.json', 'GET'], ['/_next/data/build-id/listing/L1.json', 'GET'],
  ['/_next/image?url=%2Fx.png&w=64&q=75', 'GET'], ['/_next/static/chunks/main.js?ts=1', 'GET'],
];
const PAGES = ['/dashboard', '/listing/L1', '/profile', '/billing', '/r/abc123', '/upload/tok', '/apply/tok', '/my-application/RL-2026-AAAA-BBBB', '/keep/tok'];
const STATIC = ['/_next/static/chunks/pages/dashboard-abc.js', '/_next/static/css/app.css', '/fonts/inter-latin.woff2', '/icons/icon-192.png', '/brand/rentletter-logo.svg', '/splash/splash-1170x2532.png', '/favicon.ico', '/offline.html'];

test('install caches the offline page and four static files, nothing else', async () => {
  const s = sandbox();
  let wait = null; s.handlers.install({ waitUntil: (p) => { wait = p; } }); await wait;
  assert.deepEqual(s.puts.sort(), ['/brand/rentletter-logo.svg', '/fonts/fraunces-latin.woff2', '/fonts/inter-latin.woff2', '/icons/icon-192.png', '/offline.html']);
});

test('no API route, page data or personal file is ever answered from or written to the cache', async () => {
  const s = sandbox();
  for (const [url, method] of NEVER) {
    const answered = await s.fire(url, { method });
    assert.equal(answered, null, `${method} ${url}: left to the network, untouched`);
  }
  assert.deepEqual(s.puts, [], 'nothing written');
  for (const [url] of NEVER) assert.equal(s.self.isStatic(new URL(url, ORIGIN)), false, url);
});

test('a page is network first and never cached; the offline page answers only when the network fails', async () => {
  const s = sandbox();
  for (const p of PAGES) { const r = await s.fire(p, { mode: 'navigate' }); assert.equal(r.url, `${ORIGIN}${p}`, `${p}: from the network`); }
  assert.deepEqual(s.puts, [], 'no page written to the cache');
  let wait = null; s.handlers.install({ waitUntil: (x) => { wait = x; } }); await wait;
  s.ctx.fetch = async () => { throw new TypeError('offline'); };
  const r = await s.fire('/dashboard', { mode: 'navigate' });
  assert.equal(r.url, '/offline.html', 'offline: the one offline page');
});

test('static assets are cached: the build files, fonts, icons, logo, launch images, favicon', async () => {
  const s = sandbox();
  for (const u of STATIC) { assert.equal(s.self.isStatic(new URL(u, ORIGIN)), true, u); await s.fire(u); }
  assert.deepEqual(s.puts.sort(), [...STATIC].sort());
  assert.equal(s.self.isStatic(new URL('https://other.example/fonts/x.woff2')), false, 'another origin');
});

test('the worker has no other cache rule: its allow list is the static prefixes only', () => {
  assert.match(SW, /const STATIC_PREFIXES = \['\/_next\/static\/', '\/fonts\/', '\/icons\/', '\/brand\/', '\/splash\/'\];/);
  assert.doesNotMatch(SW, /['"]\/api/, 'no API path is named for caching');
  assert.equal((SW.match(/\.put\(/g) || []).length, 1, 'one write, inside the static branch');
});
