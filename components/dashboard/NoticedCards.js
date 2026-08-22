// components/dashboard/NoticedCards.js
// "Rentletter noticed" — up to three actionable cards (lib/noticed.js rules; no AI). Ink
// instrument surface: this is the product speaking. One line of what, one action, dismissible.
// Renders NOTHING when there's nothing to say. Reveal only via the page's reduced-motion-gated
// .rl-in; no motion of its own.
import { useEffect, useMemo, useState } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { computeNotices, readDismissed, dismissNotice } from '../../lib/noticed';

export default function NoticedCards({ input, onAction, style }) {
  const [dismissed, setDismissed] = useState([]);
  useEffect(() => { setDismissed(readDismissed()); }, []);
  const cards = useMemo(() => computeNotices({ ...input, dismissed }), [input, dismissed]);
  if (!cards.length) return null;

  const act = (card) => {
    const a = card.action; if (!a) return;
    if (a.type === 'navigate') { window.location.href = a.href; return; }
    onAction?.(a, card);
  };
  const dismiss = (card) => { dismissNotice(card.id); setDismissed(readDismissed()); };

  return (
    <section className="rl-in" aria-label="Rentletter noticed" style={{ background: C.ink, color: C.paper, borderRadius: R.card, padding: 'clamp(14px, 3vw, 20px)', position: 'relative', overflow: 'hidden', ...style }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 3, background: C.red }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} />
        <span style={{ fontSize: 11, color: C.redBright || C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Rentletter noticed</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {cards.map((card) => (
          <div key={card.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: '#161618', border: '1px solid #2a2a2e', borderRadius: R.ctrl }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e4d9', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{card.title}</div>
              {card.detail && <div style={{ fontSize: 12.5, color: '#9a958a', lineHeight: 1.5, marginTop: 3 }}>{card.detail}</div>}
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
