// tests/helpers/atRest.mjs  A wait on a page at rest, in place of a fixed wait or a networkidle wait,
// for the walks whose checks read a settled screen (tests/routes/pillsWebkit.test.mjs,
// tests/routes/zoomWebkit.test.mjs and the screens they open in tests/helpers/screens.mjs, and
// tests/routes/backWebkit.test.mjs). A page is at rest when, on three animation frames in a row:
// the document has loaded, its fonts have loaded, no request it made is still open, React has
// hydrated the page and has no update left to render (read from its root on #__next: a page whose
// root cannot be read is never at rest), no finite animation or transition is running, no timeout
// of up to SHORT_TIMER ms that the page set is still to fire, and nothing in its DOM changed. The
// first run hint on a listing nudges the first card after 700ms and puts it back by about 1.9
// seconds (components/motion/swipe.js): those are timeouts the page set, so a wait on a page with
// the hint lasts until the hint has ended.
//
// Each wait names the wait it stands in for, and ends when the page is at rest or when that wait
// would have ended, whichever comes first: never later than before, and earlier only when the page
// is at rest. A page that never rests (the door mark on the finished application moves for as long
// as it shows, the homepage turns its examples every few seconds) is read when the old wait read it.
//   atRest(page, { afterIdle: 1500 })   for networkidle (500ms with no request open, the document
//                                       loaded) and then a 1500ms wait; afterIdle: 0 for networkidle alone
//   atRest(page, { within: 500 })       for a 500ms wait
// Install the watch first: await context.addInitScript(WATCH, SHORT_TIMER) before the first page
// of the context opens, and const page = watchRequests(await context.newPage()).
export const SHORT_TIMER = 4000;
// networkidle: no request open for this long (Playwright's own rule).
const IDLE = 500;
// A networkidle wait gave up after Playwright's 30 seconds; a page that is not idle by then is read
// at the same point, and the walk says so.
const IDLE_TIMEOUT = 30000;

// Init script: the page's own short timeouts, and a count of every change to its DOM.
export const WATCH = (limit) => {
  const rest = { timers: new Set(), changes: 0, seen: 0 };
  window.__rlRest = rest;
  const set = window.setTimeout; const clear = window.clearTimeout;
  window.setTimeout = function (fn, ms, ...args) {
    if (typeof fn !== 'function' || !((Number(ms) || 0) <= limit)) return set.call(window, fn, ms, ...args);
    const id = set.call(window, function (...a) { rest.timers.delete(id); return fn.apply(this, a); }, ms, ...args);
    rest.timers.add(id);
    return id;
  };
  window.clearTimeout = function (id) { rest.timers.delete(id); return clear.call(window, id); };
  new MutationObserver((list) => { rest.changes += list.length; }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
};

// Every request the page makes, open until it finishes or fails (a request a navigation cuts off
// fails), and when the last one started or ended.
const watched = new WeakMap();
export function watchRequests(page) {
  const net = { live: new Set(), last: Date.now() };
  watched.set(page, net);
  page.on('request', (r) => { net.live.add(r); net.last = Date.now(); });
  const done = (r) => { net.live.delete(r); net.last = Date.now(); };
  page.on('requestfinished', done); page.on('requestfailed', done);
  return page;
}

// Run in the page on the next animation frame: what is still moving ('' at rest), and whether the
// document has loaded.
const BUSY = () => new Promise((resolve) => requestAnimationFrame(() => {
  const loaded = document.readyState === 'complete';
  const say = (why) => resolve({ why, loaded });
  const r = window.__rlRest;
  if (!r) return say('no watch on this page (WATCH, tests/helpers/atRest.mjs)');
  if (!loaded) return say('the document is loading');
  if (document.fonts && document.fonts.status !== 'loaded') return say('fonts are loading');
  const host = document.getElementById('__next');
  if (host) {
    const key = Object.keys(host).find((k) => k.startsWith('__reactContainer$'));
    const root = key && host[key] && host[key].stateNode;
    if (!root || !root.current) return say('no React root on #__next');
    if (root.current.memoizedState && root.current.memoizedState.isDehydrated) return say('React is hydrating');
    if (root.pendingLanes) return say('React has an update to render');
  }
  if (r.timers.size) return say(`${r.timers.size} timeouts to fire`);
  if (document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect && a.effect.getComputedTiming().endTime))) return say('an animation is running');
  if (r.changes !== r.seen) { r.seen = r.changes; return say('the DOM changed'); }
  return say('');
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Answers how the wait ended: 'at rest', or 'as before' (the wait it stands in for was over first).
// AT_REST_LOG=1 prints each wait: how it ended, how long it took, and what was still moving.
export async function atRest(page, opts = {}) {
  const t0 = Date.now(); const r = await settle(page, opts);
  if (process.env.AT_REST_LOG) console.log(`# atRest ${r.how} in ${Date.now() - t0}ms (${JSON.stringify(opts)}) ${r.why} ${page.url()}`);
  return r.how;
}
async function settle(page, { afterIdle, within, frames = 3 } = {}) {
  const net = watched.get(page);
  if (!net) throw new Error('atRest needs watchRequests(page) before the page opens anything (tests/helpers/atRest.mjs)');
  if ((afterIdle == null) === (within == null)) throw new Error('atRest needs the wait it stands in for: { afterIdle } or { within }');
  const t0 = Date.now(); let calm = 0; let why = '';
  for (;;) {
    const s = await Promise.race([
      page.evaluate(BUSY).catch((e) => ({ why: `the page is navigating (${String(e.message).split('\n')[0].slice(0, 80)})`, loaded: false })),
      sleep(1000).then(() => ({ why: 'no animation frame in a second', loaded: false })),
    ]);
    why = s.why || (net.live.size ? `${net.live.size} requests open` : '');
    calm = why ? 0 : calm + 1;
    if (calm >= frames) return { how: 'at rest', why: '' };
    const now = Date.now();
    if (within != null && now - t0 >= within) return { how: 'as before', why };
    if (afterIdle != null) {
      const idleSince = s.loaded && !net.live.size ? Math.max(t0, net.last + IDLE) : null;
      if (idleSince != null && now >= idleSince + afterIdle) return { how: 'as before', why };
      if (now - t0 >= IDLE_TIMEOUT + afterIdle) { console.log(`# never idle in ${IDLE_TIMEOUT}ms on ${page.url()}: ${why}`); return { how: 'as before', why }; }
    }
  }
}
