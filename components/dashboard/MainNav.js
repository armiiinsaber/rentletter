// components/dashboard/MainNav.js
// The realtor's main navigation on a phone: Listings and Circle, side by side under the header, on
// the two screens they open (components/dashboard/HomeView.js, components/dashboard/CircleView.js).
// At 1024 and wider the sidebar (components/dashboard/DashShell.js) takes its place and these tabs
// are not drawn. The Circle item carries a count of the requests waiting for the realtor, read from
// POST /api/circle { action: 'count' } (session, entitlement and the caller's own id on the server)
// through useCirclePending, which the sidebar reads too: one request for both. The sandbox draws it
// too, over its own sample Circle (lib/demoAdapter.js). No count, or a failed read: no number. The
// count is a plain number in ink beside the word: red is the one main action on a view.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { linkProps, isHere, placeOf, useHeading } from '../nav/routes';

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

// The tab a place belongs to: Circle, or Listings for the dashboard's views and a listing.
const tabOf = (place) => (place === 'circle' ? 'circle' : place === 'listings' || place === 'pipeline' || place === 'shared' ? 'listings' : null);

export default function MainNav({ current: onView }) {
  const adapter = useAdapter();
  const pending = useCirclePending();
  // The tab tapped is marked at once (components/nav/RouteFrame.js), else the one on view.
  const heading = useHeading();
  const current = (heading && tabOf(placeOf(heading))) || onView;
  // In the sandbox the Circle is the sandbox's own screen (lib/demoAdapter.js DEMO_PATHS.circle).
  const to = (key, href) => (key === 'circle' && adapter.paths.circle ? adapter.paths.circle : href);
  const item = (key, href, label, extra = null) => {
    const link = linkProps(to(key, href), { back: key === 'listings' });
    // The tab already on view: nothing at all, no route, no reload, no scroll.
    const onClick = (e) => { if (!e.defaultPrevented && e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) && isHere(link.href)) { e.preventDefault(); return; } link.onClick(e); };
    return (
      <a {...link} onClick={onClick} aria-current={current === key ? 'page' : undefined} className="mn-item" data-nav={key}>
        {label}{extra}
      </a>
    );
  };
  return (
    <nav aria-label="Main" className="mn" data-main-nav="">
      {item('listings', adapter.paths.home, 'Listings')}
      {item('circle', CIRCLE_PATH, 'Circle', pending > 0 ? <span className="mn-badge" data-circle-badge="" aria-label={`${pending} waiting`}>{pending > 99 ? '99+' : pending}</span> : null)}
      <style jsx>{`
        .mn { display: flex; gap: var(--s-2); max-width: 1100px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 32px) var(--s-2); }
        .mn :global(.mn-item) { display: inline-flex; align-items: center; gap: var(--s-2); min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); border: 1.5px solid ${C.rule}; background: transparent; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 700; text-decoration: none; white-space: nowrap; }
        .mn :global(.mn-item[aria-current='page']) { background: ${C.ink}; border-color: ${C.ink}; color: ${C.paper}; }
        .mn :global(.mn-item:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        .mn :global(.mn-badge) { font-variant-numeric: tabular-nums; font-weight: 700; color: inherit; }
        @media (min-width: 1024px) { .mn { display: none; } }
      `}</style>
    </nav>
  );
}
