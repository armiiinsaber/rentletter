// components/nav/RouteFrame.js
// Wraps every page (pages/_app.js). On a realtor screen, a tap on a link to another realtor screen
// (components/nav/routes.js go) shows the destination at once: its skeleton in the real layout
// (components/nav/RouteSkeleton.js) while the server confirms the session and the ownership and
// sends the page, then the page itself. The sandbox has its data in memory, so its next view is
// simply drawn. Either way the screen pushes in from the right, or back from the left (lib/motion.js
// NAV_CSS, slideIn). It also installs the one press mechanism (lib/motion.js installPress, switched
// off on the tenant and landlord pages, where nothing animates), the 44 by 44 hit areas
// (installHitAreas) and the tap resolver (installTapResolver), which work on every page.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Router from 'next/router';
import { routeOf, takeDirection } from './routes';
import RouteSkeleton from './RouteSkeleton';
import { installPress, installHitAreas, installTapResolver, prefersReducedMotion, slideIn } from '../../lib/motion';

// Tenant and landlord pages: no press feedback, no motion.
export const QUIET = /^\/(apply|upload|my-application|keep|ref|refer|a|r)(\/|$)/;

export default function RouteFrame({ children }) {
  const [pending, setPending] = useState(null);
  const at = useRef('');
  // The press, the 44 by 44 hit areas and the tap resolver: once, for every page (lib/motion.js).
  useEffect(() => { const a = installPress(); const b = installHitAreas(); const c = installTapResolver(); return () => { a(); b(); c(); }; }, []);
  useEffect(() => {
    const html = document.documentElement;
    const scope = (path) => { if (QUIET.test(path)) html.setAttribute('data-no-press', ''); else html.removeAttribute('data-no-press'); };
    at.current = window.location.pathname + window.location.search; scope(window.location.pathname);
    let landed = null; let later = null;
    const start = (url, opts = {}) => {
      const from = routeOf(at.current); const to = routeOf(url);
      if (!from || !to || QUIET.test(window.location.pathname)) return;
      const dir = takeDirection() || (to.depth < from.depth ? 'back' : 'push');
      const skeleton = to.kind !== 'demo' && !opts.shallow;
      const show = () => { if (skeleton) { flushSync(() => setPending({ ...to, url })); window.scrollTo(0, 0); } };
      if (typeof document.startViewTransition === 'function') {
        html.dataset.nav = prefersReducedMotion() ? 'fade' : dir;
        // The sandbox's next view lands in a frame or two; the transition waits for it (at most 600ms).
        const ready = skeleton ? null : new Promise((res) => { landed = res; setTimeout(res, 600); });
        const vt = document.startViewTransition(() => { show(); return ready || undefined; });
        vt.finished.catch(() => {}).finally(() => { delete html.dataset.nav; });
      } else {
        show();
        if (skeleton) slideIn(document.getElementById('__next'), dir); else later = dir;
      }
    };
    const done = (url) => {
      at.current = url; scope(new URL(url, window.location.href).pathname);
      setPending(null);
      // Not requestAnimationFrame: rendering is paused while a view transition waits on its update.
      if (landed) { const f = landed; landed = null; setTimeout(f, 0); }
      if (later) { const d = later; later = null; requestAnimationFrame(() => slideIn(document.getElementById('__next'), d)); }
    };
    const failed = () => { setPending(null); if (landed) { landed(); landed = null; } later = null; };
    Router.events.on('routeChangeStart', start);
    Router.events.on('routeChangeComplete', done);
    Router.events.on('routeChangeError', failed);
    return () => { Router.events.off('routeChangeStart', start); Router.events.off('routeChangeComplete', done); Router.events.off('routeChangeError', failed); };
  }, []);
  return pending ? <RouteSkeleton route={pending} /> : children;
}
