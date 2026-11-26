// components/dashboard/MainNav.js
// The realtor's main navigation on a phone, under 1024px: a floating glass tab bar at the bottom of
// the window, inset 16px from its edges, 68px tall, fully rounded, above the home indicator:
// Listings, Pipeline, the red New listing in the middle (round and raised, the one main action),
// Circle and Profile. The current tab is ink, the others grey. Between these places nothing slides
// (components/nav/RouteFrame.js, routes.js isMainSection), and Listings and Pipeline are views of the
// dashboard, chosen in place. At 1024 and wider the sidebar (components/dashboard/DashShell.js) takes
// its place and the bar is not drawn. The Circle tab carries a small red dot while a request waits
// for the realtor, read from POST /api/circle { action: 'count' } (session, entitlement and the
// caller's own id on the server) through useCirclePending, which the sidebar reads too: one request
// for both. The sandbox draws it too, over its own sample Circle (lib/demoAdapter.js). No count, or
// a failed read: no dot.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { linkProps, isHere, placeOf, useHeading, goView, routeOf } from '../nav/routes';

export const CIRCLE_PATH = '/circle';
// The count as last read this session, so the number does not blink between the two screens.
let held = 0; const listeners = new Set();
export function setCirclePending(n) { held = Math.max(0, Number(n) || 0); for (const l of listeners) l(held); }
// One read per screen at most: the phone tabs and the sidebar are both on the page at once.
let inflight = null; let inflightAt = 0;

export function useCirclePending() {
  const adapter = useAdapter();
  const [pending, setPending] = useState(held);
  useEffect(() => {
    listeners.add(setPending);
    let live = true;
    (async () => {
      try {
        if (!inflight || Date.now() - inflightAt > 2000) {
          inflightAt = Date.now();
          inflight = adapter.fetch('/api/circle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'count' }) })
            .then(async (r) => ({ r, j: await r.json().catch(() => ({})) }));
        }
        const { r, j } = await inflight;
        if (live && r.ok && j && j.available) setCirclePending(j.pending);
      } catch (e) { inflight = null; /* no number */ }
    })();
    return () => { live = false; listeners.delete(setPending); };
  }, [adapter]);
  return pending;
}

// The tab a place belongs to: Listings for the dashboard's listings, its Shared with you view and a
// listing; Pipeline; Circle; Profile.
const tabOf = (place) => (place === 'listings' || place === 'shared' ? 'listings' : ['pipeline', 'circle', 'profile'].includes(place) ? place : null);
const viewHref = (home, view) => (view === 'listings' ? home : `${home}${home.includes('?') ? '&' : '?'}view=${view}`);
const onDashboard = () => { const r = routeOf(window.location.pathname + window.location.search); return !!r && (r.kind === 'dashboard' || (r.kind === 'demo' && r.demo === 'dashboard')); };
const plain = (e) => !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

export default function MainNav({ current: onView, onNew = null }) {
  const adapter = useAdapter();
  const pending = useCirclePending();
  // The tab tapped is marked at once (components/nav/RouteFrame.js), else the one on view.
  const heading = useHeading();
  const current = (heading && tabOf(placeOf(heading))) || tabOf(onView) || onView;
  const home = adapter.paths.home;
  const tabs = [
    ['listings', home, 'Listings', 'home'],
    ['pipeline', viewHref(home, 'pipeline'), 'Pipeline', 'list'],
    ['new'],
    ['circle', adapter.paths.circle || CIRCLE_PATH, 'Circle', 'users'],
    ['profile', adapter.paths.profile, 'Profile', 'user'],
  ];
  const item = ([key, href, label, icon]) => {
    if (key === 'new') {
      return (
        <span key="new" className="mn-new-slot">
          <button type="button" className="mn-new" aria-label="New listing" data-tab-new="" onClick={(e) => onNew && onNew(e)}>
            <Icon name="plus" size={24} strokeWidth={2} />
          </button>
        </span>
      );
    }
    const link = linkProps(href, { back: key === 'listings' });
    const onClick = (e) => {
      if (!plain(e)) { link.onClick(e); return; }
      // The tab already on view: nothing at all, no route, no reload, no scroll.
      if (isHere(link.href)) { e.preventDefault(); return; }
      // Listings and Pipeline on the dashboard: the view in place, from its top.
      if ((key === 'listings' || key === 'pipeline') && onDashboard()) { e.preventDefault(); goView(href); try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (x) { window.scrollTo(0, 0); } return; }
      link.onClick(e);
    };
    return (
      <a key={key} {...link} onClick={onClick} aria-current={current === key ? 'page' : undefined} className="mn-item" data-nav={key}>
        <span className="mn-icon" aria-hidden="true">
          <Icon name={icon} size={22} strokeWidth={current === key ? 2 : 1.6} />
          {key === 'circle' && pending > 0 ? <span className="mn-dot" data-circle-badge="" /> : null}
        </span>
        <span className="mn-label">{label}</span>
        {key === 'circle' && pending > 0 ? <span className="mn-sr">{`, ${pending} waiting`}</span> : null}
      </a>
    );
  };
  return (
    <nav aria-label="Main" className="mn rl-glass" data-main-nav="" data-stuck="">
      {tabs.map(item)}
      <style jsx>{`
        /* Fixed to the window: inset 16px from its sides and above the home indicator. */
        .mn { position: fixed; z-index: 70; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); height: 68px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; padding: 0 6px; border-radius: 999px; box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 10px 30px rgba(var(--c-shadow-rgb), 0.12); }
        .mn :global(.mn-item) { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-width: 0; height: 56px; border-radius: 999px; color: ${C.inkSoft}; text-decoration: none; -webkit-tap-highlight-color: transparent; }
        .mn :global(.mn-item[aria-current='page']) { color: ${C.ink}; }
        .mn :global(.mn-item:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
        .mn :global(.mn-icon) { position: relative; display: inline-flex; }
        .mn :global(.mn-label) { font-size: 11px; font-weight: 600; line-height: 1; white-space: nowrap; letter-spacing: 0.01em; }
        .mn :global(.mn-item[aria-current='page'] .mn-label) { font-weight: 800; }
        .mn :global(.mn-dot) { position: absolute; top: -2px; right: -4px; width: 9px; height: 9px; border-radius: 50%; background: ${C.red}; box-shadow: 0 0 0 2px ${C.paper}; }
        .mn :global(.mn-sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        /* The one main action: round, red, raised above the bar. */
        .mn :global(.mn-new-slot) { display: flex; justify-content: center; }
        .mn :global(.mn-new) { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; margin-top: -22px; border-radius: 50%; background: ${C.red}; color: ${C.paper}; border: 3px solid ${C.paper}; box-shadow: 0 8px 20px rgba(var(--c-red-rgb), 0.32), 0 2px 4px rgba(var(--c-shadow-rgb), 0.12); cursor: pointer; }
        .mn :global(.mn-new:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (max-width: 344.98px) { .mn { left: 12px; right: 12px; } .mn :global(.mn-label) { font-size: 10px; } }
        @media (min-width: 1024px) { .mn { display: none; } }
      `}</style>
    </nav>
  );
}
