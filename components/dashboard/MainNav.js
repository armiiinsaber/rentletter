// components/dashboard/MainNav.js
// The realtor's main navigation: Listings and Circle, side by side under the header, on the two
// screens they open (components/dashboard/HomeView.js, components/dashboard/CircleView.js). The
// Circle item carries a count of the requests waiting for the realtor, read from POST
// /api/circle { action: 'count' } (session, entitlement and the caller's own id on the server).
// The sandbox has no circle, so it draws nothing there. No count, or a failed read: no badge.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { linkProps } from '../nav/routes';

export const CIRCLE_PATH = '/circle';
// The count as last read this session, so the badge does not blink between the two screens.
let held = 0; const listeners = new Set();
export function setCirclePending(n) { held = Math.max(0, Number(n) || 0); for (const l of listeners) l(held); }

export default function MainNav({ current }) {
  const adapter = useAdapter();
  const [pending, setPending] = useState(held);
  useEffect(() => {
    if (adapter.kind !== 'real') return undefined;
    listeners.add(setPending);
    let live = true;
    (async () => {
      try {
        const r = await adapter.fetch('/api/circle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'count' }) });
        const j = await r.json().catch(() => ({}));
        if (live && r.ok && j && j.available) setCirclePending(j.pending);
      } catch (e) { /* no badge */ }
    })();
    return () => { live = false; listeners.delete(setPending); };
  }, [adapter]);
  if (adapter.kind !== 'real') return null;
  const item = (key, href, label, extra = null) => (
    <a {...linkProps(href, { back: key === 'listings' })} aria-current={current === key ? 'page' : undefined} className="mn-item" data-nav={key}>
      {label}{extra}
    </a>
  );
  return (
    <nav aria-label="Main" className="mn" data-main-nav="">
      {item('listings', adapter.paths.home, 'Listings')}
      {item('circle', CIRCLE_PATH, 'Circle', pending > 0 ? <span className="mn-badge" data-circle-badge="" aria-label={`${pending} waiting`}>{pending > 99 ? '99+' : pending}</span> : null)}
      <style jsx>{`
        .mn { display: flex; gap: var(--s-2); max-width: 1100px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 32px) var(--s-2); }
        .mn :global(.mn-item) { display: inline-flex; align-items: center; gap: var(--s-2); min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); border: 1.5px solid ${C.rule}; background: transparent; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 700; text-decoration: none; white-space: nowrap; }
        .mn :global(.mn-item[aria-current='page']) { background: ${C.ink}; border-color: ${C.ink}; color: ${C.paper}; }
        .mn :global(.mn-item:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        .mn :global(.mn-badge) { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: ${C.red}; color: ${C.paper}; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
      `}</style>
    </nav>
  );
}
