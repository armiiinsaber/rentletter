// components/dashboard/NoticedCards.js
// "Rentletter noticed" — up to three actionable cards (lib/noticed.js rules; no AI). Ink
// instrument surface: this is the product speaking. One line of what, one action, dismissible.
// Renders NOTHING when there's nothing to say (unless `emptyLine` is given: the panel's calm
// line). No reveal class: it simply appears.
//
// In the assistant panel (`animateOut`) a card that is acted on or dismissed leaves the zone on
// the settle curve before it goes, and `onChanged` fires so the timeline can pick up the event
// it became. Reduced motion: it simply goes. `onOpen` renders a quiet "Open" affordance (the
// dashboard's compact block, which opens the full panel).
import { useEffect, useMemo, useState, useRef } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { computeNotices, readDismissed, dismissNotice } from '../../lib/noticed';
import { useAdapter } from '../../lib/dashboardAdapter';
import { DURATION, prefersReducedMotion } from '../../lib/motion';

export default function NoticedCards({ input, onAction, style, className = '', animateOut = false, onChanged, onOpen, emptyLine = null }) {
  const adapter = useAdapter();
  const [dismissed, setDismissed] = useState([]);
  const [leaving, setLeaving] = useState({}); // id -> true while a card animates out
  const timers = useRef([]);
  useEffect(() => { setDismissed(readDismissed()); return () => timers.current.forEach(clearTimeout); }, []);
  const cards = useMemo(() => computeNotices({ ...input, dismissed }), [input, dismissed]);
  // Leave first, then do. Navigation actions go at once (the page is leaving anyway).
  const leaveThen = (card, fn) => {
    if (!animateOut || prefersReducedMotion()) { fn(); onChanged?.(); return; }
    setLeaving((m) => ({ ...m, [card.id]: true }));
    timers.current.push(setTimeout(() => { fn(); setLeaving((m) => { const n = { ...m }; delete n[card.id]; return n; }); onChanged?.(); }, DURATION.base));
  };
  if (!cards.length) {
    if (!emptyLine) return null;
    return <p className={className} style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5, padding: '4px 2px', ...style }}>{emptyLine}</p>;
  }

  const act = (card) => {
    const a = card.action; if (!a) return;
    if (a.type === 'panel') { onAction?.(a, card); return; }
    if (a.type === 'navigate') {
      // lib/noticed emits product paths; translate through the adapter so a demo stays in-route.
      const m = String(a.href).match(/^\/landlord\/([^#?]+)(.*)$/);
      const href = m ? adapter.paths.listing(m[1]) + (m[2] || '') : a.href === '/profile' ? adapter.paths.profile : a.href.startsWith('/landlord') ? adapter.paths.home + a.href.slice('/landlord'.length) : a.href;
      // Same page + an anchor: scroll there ourselves (assigning an identical hash does nothing).
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.hash) {
        const el = document.getElementById(url.hash.slice(1));
        if (el) { window.history.replaceState(null, '', url.hash); el.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      }
      window.location.href = href; return;
    }
    leaveThen(card, () => onAction?.(a, card));
  };
  const dismiss = (card) => leaveThen(card, () => { dismissNotice(card.id); setDismissed(readDismissed()); });

  return (
    <section className={className} aria-label="Rentletter noticed" style={{ background: C.ink, color: C.paper, borderRadius: R.card, padding: 'clamp(14px, 3vw, 20px)', position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} />
        <span style={{ fontSize: 11, color: C.redBright || C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Rentletter noticed</span>
        {onOpen && <button type="button" onClick={onOpen} style={{ marginLeft: 'auto', background: 'transparent', color: '#9a958a', border: '1px solid #2a2a2e', borderRadius: R.pill, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>Open</button>}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {cards.map((card) => (
          <div key={card.id} className={leaving[card.id] ? 'm-card-leave' : ''} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: '#161618', border: '1px solid #2a2a2e', borderRadius: R.ctrl }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e4d9', lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'balance' }}>{card.title}</div>
              {card.detail && <div style={{ fontSize: 12.5, color: '#9a958a', lineHeight: 1.5, marginTop: 3, textWrap: 'pretty' }}>{card.detail}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {card.action && (
                <button type="button" onClick={() => act(card)} style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap' }}>
                  {card.action.label}
                </button>
              )}
              <button type="button" onClick={() => dismiss(card)} aria-label="Dismiss" title="Dismiss for a few days" style={{ background: 'transparent', color: '#9a958a', border: '1px solid #2a2a2e', borderRadius: R.ctrl, width: 36, height: 36, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
