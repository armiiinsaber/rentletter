// components/dashboard/NeedsYou.js
// The Listings view's right column from 1280px (components/dashboard/HomeView.js), under the cards
// between 1024 and 1279: the next things this realtor should do, newest first, on glass, staying in
// view as the page scrolls. Each item: a round icon, a bold line (what to do) with its one button
// beside it, the person it is about on a line of their own, and a quiet line (the place and how long
// ago); the person and the place take the column's whole width, so a long name keeps its line. The items are built in components/dashboard/
// homeData.js needsYouItems from the board's action items (components/dashboard/board.js), the same
// the tiles and the cards count; nothing is read here. An item that arrives while the page is open
// fades in (opacity and a small lift, never when motion is reduced). With nothing to do it says so
// in one line.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { relTime } from './homeData';

const LIMIT = 6;

export default function NeedsYou({ items = [], now = null, onGo }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIMIT);
  // Keys seen on an earlier draw: a key that was not there is new and fades in.
  const seen = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  useEffect(() => {
    const keys = items.map((i) => i.key);
    if (seen.current) {
      const added = keys.filter((k) => !seen.current.has(k));
      if (added.length) { setFresh(new Set(added)); const t = setTimeout(() => setFresh(new Set()), 700); seen.current = new Set(keys); return () => clearTimeout(t); }
    }
    seen.current = new Set(keys);
    return undefined;
  }, [items]);
  return (
    <section className="ny rl-glass" aria-labelledby="ny-title" data-needs-you="">
      <div className="ny-head">
        <h2 id="ny-title" className="ny-title">Needs you</h2>
        {items.length ? <span className="ny-count" data-needs-you-count="">{items.length}</span> : null}
      </div>
      {items.length === 0 ? (
        <p className="ny-empty" data-needs-you-empty="">Nothing needs you right now.</p>
      ) : (
        <ul className="ny-list" aria-live="polite">
          {shown.map((it) => {
            const age = it.at ? relTime(it.at, now) : '';
            return (
              <li key={it.key} className={`ny-item${fresh.has(it.key) ? ' ny-in' : ''}`} data-needs-you-item={it.key}>
                <span className="ny-icon" aria-hidden="true"><Icon name={it.icon || 'doc'} size={18} strokeWidth={1.8} /></span>
                <div className="ny-what">{it.what || it.title}</div>
                <button type="button" className="ds-btn ds-btn-line ny-go" onClick={() => onGo && onGo(it)} aria-label={`${it.verb}: ${it.what || it.title}${it.who ? `, ${it.who}` : ''}${it.place ? `, ${it.place}` : ''}`}>{it.verb}</button>
                {it.who ? <div className="ny-who">{it.who}</div> : null}
                {it.place || age ? <div className="ny-line">{it.place ? <span className="ny-place">{it.place}{age ? ', ' : ''}</span> : null}{age ? <span className="ny-time">{age}</span> : null}</div> : null}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > LIMIT ? (
        <button type="button" className="ds-btn ds-btn-quiet ny-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? 'Show fewer' : `Show ${items.length - LIMIT} more`}</button>
      ) : null}
      <style jsx>{`
        .ny { border-radius: 28px; padding: var(--s-5) var(--s-4) var(--s-3); box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 12px 40px rgba(var(--c-shadow-rgb), 0.07); }
        .ny-head { display: flex; align-items: baseline; gap: var(--s-2); margin: 0 var(--s-1) var(--s-3); }
        .ny-title { font-family: var(--f-display); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; }
        .ny-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkSoft}; font-variant-numeric: tabular-nums; }
        .ny-empty { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); margin: 0 var(--s-1) var(--s-2); }
        .ny-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
        .ny-item { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; grid-template-areas: 'icon what go' '. who who' '. line line'; align-items: center; column-gap: var(--s-3); row-gap: 2px; padding: var(--s-3) var(--s-1); border-top: 1px solid rgba(var(--c-ink-rgb), 0.07); }
        .ny-item:first-child { border-top: none; }
        .ny-icon { grid-area: icon; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: ${C.card}; color: ${C.ink}; box-shadow: 0 0 0 1px ${C.rule}; }
        .ny-what { grid-area: what; min-width: 0; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: 1.3; text-wrap: balance; }
        .ny-who { grid-area: who; min-width: 0; font-size: var(--t-body-2); color: ${C.ink}; line-height: 1.3; text-wrap: balance; }
        .ny-line { grid-area: line; min-width: 0; font-size: 13px; color: ${C.inkSoft}; line-height: 1.3; text-wrap: balance; }
        .ny-time { white-space: nowrap; font-variant-numeric: tabular-nums; }
        .ny-go { grid-area: go; flex-shrink: 0; min-height: 40px; padding: 0 var(--s-3); }
        .ny-more { margin: var(--s-1) 0 0; }
        @media (min-width: 1920px) {
          .ny { padding: var(--s-6) var(--s-5) var(--s-4); }
          .ny-title { font-size: 22px; }
          .ny-what, .ny-who { font-size: 15px; }
          .ny-line, .ny-empty { font-size: 14px; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .ny-in { animation: ny-arrive 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
          @keyframes ny-arrive { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        }
      `}</style>
    </section>
  );
}
