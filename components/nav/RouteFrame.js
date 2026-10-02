// components/nav/RouteFrame.js
// Wraps every page (pages/_app.js). On a realtor screen, a tap on a link to another realtor screen
// (components/nav/routes.js go) shows the destination at once: its skeleton in the real layout
// (components/nav/RouteSkeleton.js) while the server confirms the session and the ownership and
// sends the page, then the page itself. The sandbox has its data in memory, so its next view is
// simply drawn. Either way the screen pushes in from the right, or back from the left (lib/motion.js
// NAV_CSS, slideIn). It also installs the one press mechanism (lib/motion.js installPress, switched
// off on the tenant and landlord pages, where nothing animates), the 44 by 44 hit areas
// (installHitAreas) and the tap resolver (installTapResolver), which work on every page.
// Every navigation ends with the real screen:
//   A skeleton is drawn only while its navigation is still the current one. The skeleton goes up
//   in the view transition's update callback, a frame after the tap; a navigation that completed
//   or was cancelled before that frame (Next answering from its own copy of the data) used to have
//   its skeleton drawn after the fact, and nothing ever took it down.
//   A navigation that ends without arriving forgets Next's copy of its data (routes.js forgetData),
//   so the next visit makes a live request instead of taking a cancelled, stale one.
//   Going back to the screen still underneath (the navigation in flight was cancelled) shows that
//   screen at once, never a skeleton of it.
//   A skeleton that has not given way after 4 seconds loads once more by itself, then shows the
//   line and the pill (RouteSkeleton.js LoadFailed); the pill loads the screen again in place.
//   A tap while a screen pushes in or goes back works: during a view transition both engines hit
//   test only the root (the moving picture), so the tap ends the transition at once and a click
//   that landed on the root goes to the control under the finger.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Router from 'next/router';
import { routeOf, takeDirection, forgetData, settleAhead, alignAhead } from './routes';
import RouteSkeleton, { SKELETON_WAIT } from './RouteSkeleton';
import { installPress, installHitAreas, installTapResolver, prefersReducedMotion, slideIn, TAP_TARGETS } from '../../lib/motion';

// Tenant and landlord pages: no press feedback, no motion.
export const QUIET = /^\/(apply|upload|my-application|keep|ref|refer|a|r)(\/|$)/;
const samePath = (a, b) => { const x = routeOf(a); const y = routeOf(b); return !!x && !!y && x.path === y.path; };

export default function RouteFrame({ children }) {
  const [pending, setPending] = useState(null);
  const at = useRef('');
  const retryRoute = useRef(() => {});
  // The press, the 44 by 44 hit areas and the tap resolver: once, for every page (lib/motion.js).
  useEffect(() => { const a = installPress(); const b = installHitAreas(); const c = installTapResolver(); return () => { a(); b(); c(); }; }, []);
  useEffect(() => {
    const html = document.documentElement;
    const scope = (path) => { if (QUIET.test(path)) html.setAttribute('data-no-press', ''); else html.removeAttribute('data-no-press'); };
    at.current = window.location.pathname + window.location.search; scope(window.location.pathname);
    let landed = null; let later = null;
    let seq = 0; let active = null; // the navigation in flight: { id, url }, or null
    let shown = null; // the URL whose skeleton (or failure line) is on screen
    let retrying = null; // { url, round } for the next start of that URL: a retry, not a new visit
    let watch = 0; let clearing = 0;
    let moving = null; // the view transition on screen
    let aimed = null; // { x, y, at }: a tap that came during it
    // The watch on a skeleton: round 1 retries once by itself, round 2 shows the line and the pill.
    const arm = (id, url, round) => {
      clearTimeout(watch);
      watch = setTimeout(() => {
        if (!active || active.id !== id) return;
        if (round === 1) { retrying = { url, round: 2 }; Router.replace(url, undefined, { scroll: false }); return; }
        setPending((p) => (p ? { ...p, failed: true } : p));
      }, SKELETON_WAIT);
    };
    // The pill: the same screen again, in place, with the watch from the start.
    retryRoute.current = (url) => { retrying = { url, round: 1 }; Router.replace(url, undefined, { scroll: false }); };
    const start = (url, opts = {}) => {
      const from = routeOf(at.current); const to = routeOf(url);
      if (!from || !to || QUIET.test(window.location.pathname)) return;
      clearTimeout(clearing); clearTimeout(watch);
      const id = ++seq; active = { id, url };
      const again = retrying && samePath(retrying.url, url) ? retrying : null; retrying = null;
      const dir = takeDirection() || (to.depth < from.depth ? 'back' : 'push');
      // Back to the screen still underneath: that screen, at once.
      const underneath = samePath(url, at.current);
      const skeleton = to.kind !== 'demo' && !opts.shallow && !underneath;
      const show = () => {
        if (!active || active.id !== id) return; // this navigation already ended: never draw it afterwards
        if (!skeleton) { shown = null; if (underneath) flushSync(() => setPending(null)); return; }
        const fresh = !shown || !samePath(shown, url);
        shown = url;
        flushSync(() => setPending({ ...to, url }));
        if (fresh) window.scrollTo(0, 0);
        arm(id, url, again ? again.round : 1);
      };
      // The skeleton or its line is already up (a retry, the pill): no transition, the watch again.
      if (skeleton && shown && samePath(shown, url)) { show(); return; }
      if (typeof document.startViewTransition === 'function') {
        html.dataset.nav = prefersReducedMotion() ? 'fade' : dir;
        // The sandbox's next view lands in a frame or two; the transition waits for it (at most 600ms).
        const ready = skeleton || underneath ? null : new Promise((res) => { landed = res; setTimeout(res, 600); });
        const vt = document.startViewTransition(() => { show(); return ready || undefined; });
        moving = vt;
        vt.finished.catch(() => {}).finally(() => { if (moving === vt) moving = null; delete html.dataset.nav; });
      } else {
        show();
        if (skeleton || underneath) slideIn(document.getElementById('__next'), dir); else later = dir;
      }
    };
    const done = (url) => {
      active = null; shown = null; retrying = null; clearTimeout(watch); clearTimeout(clearing);
      settleAhead();
      at.current = url; scope(new URL(url, window.location.href).pathname);
      setPending(null);
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
        if (retrying && samePath(retrying.url, url)) return; // a retry of this screen takes over the skeleton
        // The next navigation usually starts in the same moment and decides what shows; if none
        // does, the screen underneath shows.
        clearing = setTimeout(() => { if (!active) { shown = null; setPending(null); } }, 0);
        return;
      }
      shown = null; retrying = null; setPending(null);
    };
    // A back while a screen was on its way: its entry is forward history now.
    const popped = () => settleAhead();
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
      clearTimeout(watch); clearTimeout(clearing);
    };
  }, []);
  return pending ? <RouteSkeleton route={pending} onRetry={() => retryRoute.current(pending.url)} /> : children;
}
