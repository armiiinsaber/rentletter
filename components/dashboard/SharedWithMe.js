// components/dashboard/SharedWithMe.js
// On the realtor's dashboard (components/dashboard/HomeView.js): the profiles tenants shared with
// this realtor as listing agent (db/024-share-roles.sql). One request for the list, POST
// /api/profile-shares/shared-with-me { action: 'list' }: which unit and since when, and nothing
// of the tenant until the realtor opens the view, which the tenant sees in their log. Each row
// opens the same shared view a tenant's own realtor has (components/dashboard/SharedProfile.js).
// With nothing shared, before db/024 has run, or in the sandbox, nothing is drawn.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { dateLong, noWidow } from '../../lib/typeset';
import { useAdapter } from '../../lib/dashboardAdapter';
import SharedProfile from './SharedProfile';

// What the list last read, for the dashboard's Needs you column and its Shared with you view
// (components/dashboard/HomeView.js): null until read, then the shares. One read, here.
let held = null; const listeners = new Set();
const publish = (list) => { held = list; for (const l of listeners) l(held); };
export function useSharedWithMe() {
  const [shares, setShares] = useState(held);
  useEffect(() => { listeners.add(setShares); setShares(held); return () => { listeners.delete(setShares); }; }, []);
  return shares;
}

export default function SharedWithMe() {
  const adapter = useAdapter();
  const [shares, setShares] = useState(null);
  useEffect(() => {
    if (adapter.kind !== 'real') { publish([]); return undefined; }
    let live = true;
    (async () => {
      try {
        const r = await adapter.fetch('/api/profile-shares/shared-with-me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) });
        const j = await r.json().catch(() => ({}));
        if (live && r.ok && j && j.available && Array.isArray(j.shares)) { setShares(j.shares); publish(j.shares); }
        else if (live) publish([]);
      } catch (e) { if (live) publish([]); /* the section stays out of the page */ }
    })();
    return () => { live = false; };
  }, [adapter]);
  if (!shares || !shares.length) return null;
  return (
    <section data-shared-with-me="" aria-labelledby="shared-with-me-h" style={{ marginTop: 'var(--gap-section)' }}>
      <h2 id="shared-with-me-h" className="t-d3" style={{ color: C.ink, margin: '0 0 var(--s-3)' }}>Shared with you</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
        {shares.map((sh) => (
          <li key={sh.id} data-shared-with-me-row={sh.ended || 'live'} className="rl-card" style={{ padding: 'var(--card-pad)' }}>
            <div style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkMute, lineHeight: 1.2 }}>Listing agent</div>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, lineHeight: 1.3, marginTop: 'var(--gap-line)', overflowWrap: 'anywhere', textWrap: 'balance' }}>{noWidow(sh.listingName || 'A unit')}</div>
            {dateLong(sh.sharedAt) ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', marginTop: 2, textWrap: 'balance' }}>{noWidow(`A tenant shared their profile with you on ${dateLong(sh.sharedAt)}`)}</div> : null}
            <SharedProfile shareId={sh.id} initial={{ shared: true, ended: sh.ended, message: sh.ended === 'stopped' ? 'The tenant stopped sharing their profile.' : sh.ended ? 'This share has ended.' : undefined }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
