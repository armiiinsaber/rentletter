// components/dashboard/logoNav.js  CLIENT.
// What the Rentletter logo does in the realtor dashboard:
//   on any other view (a listing, the profile, the Circle, Pipeline, Shared with you) it goes to
//   the Listings view;
//   on the Listings view, scrolled down, it scrolls to the top, smoothly, with no route change;
//   on the Listings view at the top it does nothing at all: no route change, no reload, no
//   movement, and no prefetch.
// It used to be a plain link to the dashboard, so on the dashboard a tap pushed the same route:
// the router ran, the frame (components/nav/RouteFrame.js) started a push transition, and the
// screen slid in and came back to the same page.
import { routeOf, go, goView, prefetch } from '../nav/routes';
import { prefersReducedMotion } from '../../lib/motion';

// The Listings view: the dashboard (or the sandbox's) with no other view chosen.
export function onListingsView(href) {
  const r = routeOf(href);
  if (!r) return false;
  if (r.kind === 'demo' && r.demo !== 'dashboard') return false;
  if (r.kind !== 'demo' && r.kind !== 'dashboard') return false;
  let view = null;
  try { view = new URL(href, 'http://x').searchParams.get('view'); } catch (e) { view = null; }
  return !view || view === 'listings';
}

// 'go' to the Listings view, 'top' to scroll up, or 'none'.
export function logoAction({ onListings, scrollY }) {
  if (!onListings) return 'go';
  return Number(scrollY) > 0 ? 'top' : 'none';
}

const here = () => (typeof window === 'undefined' ? '' : window.location.pathname + window.location.search);
// The dashboard itself, on any of its views (components/dashboard/DashShell.js): Listings is then
// another view of the same screen, chosen in place.
const onDashboard = (href) => { const r = routeOf(href); return !!r && (r.kind === 'dashboard' || (r.kind === 'demo' && r.demo === 'dashboard')); };

// Props for the logo link. It stays a real link to the dashboard, so it works before the script
// loads and opens in a new tab with a modifier key.
export function logoProps(home) {
  return {
    href: home,
    onClick: (e) => {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const act = logoAction({ onListings: onListingsView(here()), scrollY: window.scrollY });
      if (act === 'go') { if (onDashboard(here())) goView(home); else go(home); return; }
      if (act === 'top') window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    onPointerDown: () => { if (!onListingsView(here())) prefetch(home); },
    onTouchStart: () => { if (!onListingsView(here())) prefetch(home); },
  };
}
