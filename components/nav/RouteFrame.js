// components/nav/RouteFrame.js
// Wraps every page (pages/_app.js). On a realtor screen, a tap on a link to another realtor screen
// (components/nav/routes.js go) never shows a half drawn screen (components/nav/RouteLoader.js):
//   a screen seen recently (routes.js seenScreenView) shows at once as it was, while the server
//   confirms the session and the ownership and sends the page, which then takes over;
//   any other shows when its page lands if that is within DOOR.loaderDelayMs (lib/motion.js) of
//   the tap, and otherwise the door Loader holds its place, with the header and the way back
//   live, until the page lands. The page then shows itself in one step once its own data is in
//   (components/brand/Loader.js Reveal).
// The sandbox has its data in memory, so its next view is simply drawn. Either way the screen
// pushes in from the right, or back from the left (lib/motion.js NAV_CSS, slideIn). It also
// installs the one press mechanism (lib/motion.js installPress, switched off on the tenant and
// landlord pages, where nothing animates), the 44 by 44 hit areas (installHitAreas) and the tap
// resolver (installTapResolver), which work on every page, and hosts the opening screen
// (components/brand/AppStart.js), which outlives a navigation, so sign in hands its door to the
// dashboard with no gap.
// Every navigation ends with the real screen:
//   The Loader (or a seen screen) is drawn only while its navigation is still the current one. It
//   goes up in the view transition's update callback; a navigation that completed or was cancelled
//   before then (Next answering from its own copy of the data) used to have it drawn after the
//   fact, and nothing ever took it down.
//   A navigation that ends without arriving forgets Next's copy of its data (routes.js forgetData),
//   so the next visit makes a live request instead of taking a cancelled, stale one.
//   Going back to the screen still underneath (the navigation in flight was cancelled) shows that
//   screen at once, never a Loader.
//   A Loader that has not given way after 4 seconds loads once more by itself, then shows the line
//   and the pill (RouteLoader.js LoadFailed); the pill loads the screen again in place.
//   A tap while a screen pushes in or goes back works: during a view transition both engines hit
//   test only the root (the moving picture), so the tap ends the transition at once and a click
//   that landed on the root goes to the control under the finger.
// In the installed app a swipe from the left edge goes back (components/nav/EdgeBack.js): only on a
// realtor screen below the dashboard with a screen of the app behind it in history, never with a
// sheet open or while a screen is still on its way. The screen beneath is the picture of how it was
// left (routes.js rememberScreen), else its Loader. A completed swipe hands that picture to the
// frame in the Loader's place, under the same watch, until the screen itself arrives, scrolled
// where it was left.
import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Router, { useRouter } from 'next/router';
import { routeOf, takeDirection, forgetData, settleAhead, alignAhead, trailLanded, trailFix, trailPopped, trailBack, rememberScreen, seenScreen, seenScreenView } from './routes';
import RouteLoader, { LOAD_WAIT } from './RouteLoader';
import { installEdgeBack, captureScreen, Snapshot, PARALLAX, DIM } from './EdgeBack';
import AppStart from '../brand/AppStart';
import { markNavStart } from '../brand/Loader';
import { C } from '../theme';
import { DOOR, installPress, installHitAreas, installTapResolver, prefersReducedMotion, slideIn, TAP_TARGETS } from '../../lib/motion';
import { isStandalone } from '../../lib/standalone';

// Tenant and landlord pages: no press feedback, no motion.
export const QUIET = /^\/(apply|upload|my-application|keep|ref|refer|a|r)(\/|$)/;
const samePath = (a, b) => { const x = routeOf(a); const y = routeOf(b); return !!x && !!y && x.path === y.path; };

export default function RouteFrame({ children }) {
  const { pathname } = useRouter();
  const [pending, setPending] = useState(null);
  const [beneath, setBeneath] = useState(null); // the screen drawn beneath an edge swipe
  const beneathEls = useRef({ shift: null, dim: null });
  const at = useRef('');
  const retryRoute = useRef(() => {});
  // The press, the 44 by 44 hit areas and the tap resolver: once, for every page (lib/motion.js).
  useEffect(() => { const a = installPress(); const b = installHitAreas(); const c = installTapResolver(); return () => { a(); b(); c(); }; }, []);
  useEffect(() => {
    const html = document.documentElement;
    const scope = (path) => { if (QUIET.test(path)) html.setAttribute('data-no-press', ''); else html.removeAttribute('data-no-press'); };
    at.current = window.location.pathname + window.location.search; scope(window.location.pathname);
    trailLanded(at.current);
    let landed = null; let later = null;
    let seq = 0; let active = null; // the navigation in flight: { id, url }, or null
    let shown = null; // the URL whose Loader (or seen screen, or failure line) is on screen
    let retrying = null; // { url, round } for the next start of that URL: a retry, not a new visit
    let watch = 0; let clearing = 0;
    let moving = null; // the view transition on screen
    let restore = null; // { url, y }: where a screen gone back to by a swipe was scrolled
    let aimed = null; // { x, y, at }: a tap that came during it
    // The watch on a Loader: round 1 retries once by itself, round 2 shows the line and the pill.
    const arm = (id, url, round) => {
      clearTimeout(watch);
      watch = setTimeout(() => {
        if (!active || active.id !== id) return;
        if (round === 1) { retrying = { url, round: 2 }; Router.replace(url, undefined, { scroll: false }); return; }
        setPending((p) => (p ? { ...p, failed: true } : p));
      }, LOAD_WAIT);
    };
    // The pill: the same screen again, in place, with the watch from the start.
    retryRoute.current = (url) => { retrying = { url, round: 1 }; Router.replace(url, undefined, { scroll: false }); };
    const start = (url, opts = {}) => {
      markNavStart();
      const from = routeOf(at.current); const to = routeOf(url);
      if (!from || !to || QUIET.test(window.location.pathname)) return;
      trailFix();
      // Leaving a real screen: keep a picture of it for the swipe back to draw beneath.
      if (!shown && !moving) rememberScreen(at.current, captureScreen());
      if (restore && !samePath(restore.url, url)) restore = null;
      clearTimeout(clearing); clearTimeout(watch);
      const id = ++seq; active = { id, url };
      const again = retrying && samePath(retrying.url, url) ? retrying : null; retrying = null;
      const dir = takeDirection() || (to.depth < from.depth ? 'back' : 'push');
      // Back to the screen still underneath: that screen, at once.
      const underneath = samePath(url, at.current);
      const holds = to.kind !== 'demo' && !opts.shallow && !underneath; // the frame holds this screen's place until its page lands
      // A screen seen recently: itself, at once (never on a retry, which wants a live answer).
      const cached = holds && !again ? seenScreenView(url) : null;
      const show = () => {
        if (!active || active.id !== id) return; // this navigation already ended: never draw it afterwards
        if (!holds) { shown = null; if (underneath) flushSync(() => setPending(null)); return; }
        const fresh = !shown || !samePath(shown, url);
        shown = url;
        // A swipe's picture of this screen stays in the Loader's place until the screen arrives.
        flushSync(() => setPending((p) => (p && p.shot && samePath(p.url, url) ? { ...p, ...to, url, failed: false } : cached ? { ...to, url, cached } : { ...to, url })));
        if (fresh) window.scrollTo(0, 0);
        // A seen screen is on view: its history entry is history, so a tap from it stacks the next
        // screen above it (a back returns to it) instead of taking its entry.
        if (cached) settleAhead(); else arm(id, url, again ? again.round : 1);
      };
      // The Loader or its line is already up (a retry, the pill): no transition, the watch again.
      if (holds && shown && samePath(shown, url)) { show(); return; }
      // Not seen recently: the page itself if it lands within DOOR.loaderDelayMs, else the Loader.
      const brief = holds && !cached ? new Promise((res) => { landed = res; setTimeout(res, DOOR.loaderDelayMs); }) : null;
      if (typeof document.startViewTransition === 'function') {
        html.dataset.nav = prefersReducedMotion() ? 'fade' : dir;
        // The sandbox's next view lands in a frame or two; the transition waits for it (at most 600ms).
        const ready = holds || underneath ? null : new Promise((res) => { landed = res; setTimeout(res, 600); });
        const vt = document.startViewTransition(async () => { if (brief) await brief; show(); if (ready) await ready; });
        moving = vt;
        vt.finished.catch(() => {}).finally(() => { if (moving === vt) moving = null; delete html.dataset.nav; });
      } else if (brief) {
        later = dir;
        brief.then(() => { if (!active || active.id !== id) return; later = null; show(); slideIn(document.getElementById('__next'), dir); });
      } else {
        show();
        if (holds || underneath) slideIn(document.getElementById('__next'), dir); else later = dir;
      }
    };
    const done = (url) => {
      active = null; shown = null; retrying = null; clearTimeout(watch); clearTimeout(clearing);
      settleAhead(); trailLanded(url);
      at.current = url; scope(new URL(url, window.location.href).pathname);
      const back = restore && samePath(restore.url, url) ? restore : null; restore = null;
      // Gone back by a swipe: the screen itself, where it was left (as its picture showed it).
      if (back) { flushSync(() => setPending(null)); window.scrollTo({ top: back.y, left: 0, behavior: 'instant' }); }
      else setPending(null);
      // Not requestAnimationFrame: rendering is paused while a view transition waits on its update.
      if (landed) { const f = landed; landed = null; setTimeout(f, 0); }
      if (later) { const d = later; later = null; requestAnimationFrame(() => slideIn(document.getElementById('__next'), d)); }
    };
    // Ended without arriving: cancelled by the next navigation, or failed (Next then loads the page
    // in full). Its copy of the data is forgotten either way.
    const failed = (err, url) => {
      clearTimeout(watch); active = null;
      if (url) forgetData(url);
      if (landed) { landed(); landed = null; } later = null;
      if (err && err.cancelled) {
        if (retrying && samePath(retrying.url, url)) return; // a retry of this screen takes over the Loader
        // The next navigation usually starts in the same moment and decides what shows; if none
        // does, the screen underneath shows.
        clearing = setTimeout(() => { if (!active) { shown = null; setPending(null); } }, 0);
        return;
      }
      shown = null; retrying = null; setPending(null);
    };
    // A back while a screen was on its way: its entry is forward history now.
    const popped = () => { settleAhead(); trailPopped(); };

    // ── The swipe from the left edge (components/nav/EdgeBack.js) ──
    const page = () => document.getElementById('__next');
    const edgeAllowed = () => {
      if (!isStandalone() || QUIET.test(window.location.pathname)) return false;
      const here = routeOf(at.current); if (!here || here.kind === 'demo' || here.depth === 0) return false; // never on the dashboard
      if (active || shown || moving || html.dataset.nav || html.classList.contains('rl-sheet-open') || html.classList.contains('rl-sheet-closing')) return false;
      const prev = trailBack(); const back = prev && routeOf(prev.url);
      return !!back && back.kind !== 'demo';
    };
    // The page lifts above the screen beneath, with the edge shadow, until the swipe ends.
    const drop = () => {
      const el = page(); if (!el) return;
      el.getAnimations().forEach((a) => a.cancel());
      for (const k of ['transform', 'position', 'zIndex', 'boxShadow', 'willChange']) el.style[k] = '';
      flushSync(() => setBeneath(null));
    };
    const edgeOpen = () => {
      const prev = trailBack(); const route = prev && routeOf(prev.url); const el = page();
      if (!route || !el) return null;
      flushSync(() => setBeneath({ route: { ...route, url: prev.url }, shot: seenScreen(prev.url) }));
      const { shift, dim } = beneathEls.current; if (!shift || !dim) { drop(); return null; }
      shift.style.transform = `translate3d(${-PARALLAX * window.innerWidth}px, 0, 0)`; dim.style.opacity = String(DIM);
      Object.assign(el.style, { position: 'relative', zIndex: '1', boxShadow: '-12px 0 24px rgba(15, 15, 16, 0.12)', willChange: 'transform' });
      return { page: el, shift, dim };
    };
    const edgeCommit = (reduced) => {
      const prev = trailBack(); const route = prev && routeOf(prev.url);
      if (!route) { drop(); return; }
      const shot = seenScreen(prev.url);
      const swap = () => {
        shown = prev.url;
        flushSync(() => setPending({ ...route, url: prev.url, shot }));
        window.scrollTo({ top: shot ? shot.y : 0, left: 0, behavior: 'instant' });
        drop();
      };
      restore = shot ? { url: prev.url, y: shot.y } : null;
      if (reduced && typeof document.startViewTransition === 'function') {
        html.dataset.nav = 'fade';
        const vt = document.startViewTransition(swap); moving = vt;
        vt.finished.catch(() => {}).finally(() => { if (moving === vt) moving = null; delete html.dataset.nav; });
      } else {
        swap();
        if (reduced) slideIn(page(), 'back');
      }
      // The same watch as any Loader, from now: never permanent, even if the back never began.
      const id = ++seq; active = { id, url: prev.url }; arm(id, prev.url, 1);
      window.history.back();
    };
    const uninstallEdge = installEdgeBack({ allowed: edgeAllowed, open: edgeOpen, commit: edgeCommit, close: drop });
    // A tap during a transition: the transition ends, and the tap goes where it was aimed. On the
    // window, in the capture phase, so it comes before the press and the tap resolver.
    const touched = (e) => {
      if (!moving || e.isPrimary === false) return;
      aimed = { x: e.clientX, y: e.clientY, at: Date.now() };
      try { moving.skipTransition(); } catch (err) { /* already over */ }
    };
    const clicked = (e) => {
      const a = aimed; aimed = null;
      if (!a || Date.now() - a.at > 1500 || e.target !== html) return;
      const under = document.elementFromPoint(a.x, a.y);
      const target = under && under !== html ? under.closest(TAP_TARGETS) : null;
      if (!target) return;
      e.preventDefault(); e.stopPropagation();
      target.click();
    };
    Router.events.on('routeChangeStart', start);
    Router.events.on('routeChangeComplete', done);
    Router.events.on('routeChangeError', failed);
    Router.events.on('beforeHistoryChange', alignAhead);
    window.addEventListener('popstate', popped);
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('click', clicked, true);
    return () => {
      window.removeEventListener('pointerdown', touched, true); window.removeEventListener('click', clicked, true);
      Router.events.off('routeChangeStart', start); Router.events.off('routeChangeComplete', done); Router.events.off('routeChangeError', failed);
      Router.events.off('beforeHistoryChange', alignAhead); window.removeEventListener('popstate', popped);
      clearTimeout(watch); clearTimeout(clearing); uninstallEdge();
    };
  }, []);
  const view = pending ? <RouteLoader route={pending} onRetry={() => retryRoute.current(pending.url)} /> : children;
  // The opening screen, on every page but the tenant and landlord ones: ink in the admin app.
  // The screen beneath an edge swipe: fixed under the page, never interactive. Its slide and dim are
  // set by the gesture as the finger moves (EdgeBack.js), never here. The tree keeps one shape, so
  // the page is never mounted again when the swipe begins or ends.
  return (
    <>
      {view}
      {QUIET.test(pathname || '') ? null : <AppStart tone={/^\/admin(\/|$)/.test(pathname || '') ? 'ink' : 'paper'} />}
      {beneath && createPortal(
        <div data-edge-beneath="" aria-hidden="true" inert style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: 'var(--paper)', pointerEvents: 'none' }}>
          <div ref={(el) => { beneathEls.current.shift = el; }} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {beneath.shot ? <Snapshot shot={beneath.shot} fixed /> : <RouteLoader route={beneath.route} />}
          </div>
          <div ref={(el) => { beneathEls.current.dim = el; }} style={{ position: 'absolute', inset: 0, background: C.ink }} />
        </div>,
        document.body,
      )}
    </>
  );
}
