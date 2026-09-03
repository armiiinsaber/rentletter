// components/dashboard/NextList.js
// "Next" on the dashboard: the assistant's action list (lib/actions.js buildActions, the same
// items the bell shows, minus the realtor's dismissals from the shared store), three rows at
// most, on the ink surface. Each row is the item's title and detail with the verb on the right;
// the whole row is the deep link. More than three: one "{n} more" line that opens the bell
// panel on Next. None: one row, the red tick, "Nothing waiting on you." Nothing else.
//
// Motion: rows fade in with the page (opacity only, DURATION.short); a row whose item goes after
// an action on this page collapses on the settle curve. Nothing loops. Under reduced motion the
// rows simply appear and go (lib/motion.js query).
import { useEffect, useMemo, useRef, useState } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { buildActions, visibleActions } from '../../lib/actions.js';
import { useAssistantStore } from '../../lib/assistantStore';
import { navigateToAction } from './actionNav';
import { CURVE, DURATION, prefersReducedMotion } from '../../lib/motion';

const SHOW = 3;

export default function NextList({ listings, applicantsByListing, onMore, style, className = '' }) {
  const adapter = useAdapter();
  const store = useAssistantStore();
  const items = useMemo(() => visibleActions(buildActions({ listings: listings || [], applicantsByListing: applicantsByListing || {} }), store.dismissed), [listings, applicantsByListing, store.dismissed]);
  const shown = items.slice(0, SHOW);
  const more = items.length - shown.length;

  // Rows keep a leave phase so an item that goes after an action on this page collapses in place.
  const [rows, setRows] = useState(() => shown.map((item) => ({ item, phase: 'in' })));
  const known = useRef(new Set(shown.map((i) => i.key)));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const keys = new Set(shown.map((i) => i.key));
    const reduced = prefersReducedMotion();
    setRows((cur) => {
      const fresh = shown.map((item) => ({ item, phase: 'in' }));
      if (reduced) return fresh;
      const out = []; const seen = new Set();
      for (const r of cur) { if (keys.has(r.item.key)) { if (!seen.has(r.item.key)) { out.push(fresh.find((f) => f.item.key === r.item.key)); seen.add(r.item.key); } } else out.push({ ...r, phase: 'leave' }); }
      for (const f of fresh) if (!seen.has(f.item.key)) out.push(f);
      return out;
    });
    known.current = keys;
    if (reduced) return undefined;
    const t = setTimeout(() => setRows((cur) => cur.filter((r) => r.phase !== 'leave')), DURATION.base + 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((i) => i.key).join('|')]);

  const go = (item) => navigateToAction(item, adapter.paths);
  const key = (item) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(item); } };

  return (
    <section className={`nl ${className}`} aria-label="Next" style={{ background: C.inst, color: C.instText, borderRadius: R.card, padding: 'var(--card-pad)', ...style }}>
      <h2 className="t-d3" style={{ color: C.paper, marginBottom: 'var(--s-2)' }}>Next</h2>
      {rows.length === 0 ? (
        <div className="nl-row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44 }}>
          <Icon name="check" size={16} color={C.red} strokeWidth={2.5} />
          <span style={{ fontSize: 'var(--t-body)', color: C.paper }}>Nothing waiting on you.</span>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r, i) => (
            <li key={r.item.key} className={`nl-row ${r.phase === 'leave' ? 'nl-leave' : ''}`} data-key={r.item.key}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minHeight: 44, borderTop: i ? `1px solid ${C.instRule}` : 'none' }}>
              <div role="button" tabIndex={0} onClick={() => go(r.item)} onKeyDown={key(r.item)} style={{ flex: 1, minWidth: 0, padding: 'var(--s-2) 0', cursor: 'pointer' }}>
                <div style={{ fontSize: 'var(--t-body)', color: C.paper, fontWeight: 700, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere' }}>{r.item.title}</div>
                <div style={{ fontSize: 'var(--t-body-2)', color: C.instMute, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>{r.item.detail}</div>
              </div>
              <button type="button" onClick={() => go(r.item)} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.paper, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{r.item.verb}</button>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && (
        <button type="button" onClick={onMore} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.paper, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>{more} more</button>
      )}
      <style jsx>{`
        .nl-leave { opacity: 0; transform: translateX(-16px); pointer-events: none; }
        @media (prefers-reduced-motion: no-preference) {
          .nl :global(.nl-row) { animation: nl-in ${DURATION.short}ms ease-out both; transition: opacity ${DURATION.base}ms ${CURVE.settle}, transform ${DURATION.base}ms ${CURVE.settle}; }
        }
        @keyframes nl-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </section>
  );
}
