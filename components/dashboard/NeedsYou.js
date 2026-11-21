// components/dashboard/NeedsYou.js
// The desktop dashboard's right column (components/dashboard/HomeView.js): the next things this
// realtor should do, newest first, each with a relative time and one action. The items are built
// in components/dashboard/homeData.js from what the dashboard already loads; nothing is read here.
// An item that arrives while the page is open fades in (opacity and a small lift, never when
// motion is reduced). With nothing to do it says so in one line.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
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
    <section className="ny" aria-labelledby="ny-title" data-needs-you="">
      <h2 id="ny-title" className="ny-title">Needs you</h2>
      {items.length === 0 ? (
        <p className="ny-empty" data-needs-you-empty="">Nothing needs you right now.</p>
      ) : (
        <ul className="ny-list" aria-live="polite">
          {shown.map((it) => (
            <li key={it.key} className={`ny-item${fresh.has(it.key) ? ' ny-in' : ''}`} data-needs-you-item={it.key}>
              {/* The words take the column's whole width, so a long name or address wraps evenly;
                  the time and the one action share the row under them. */}
              <div className="ny-what">{it.title}</div>
              {(it.lines || (it.detail ? [it.detail] : [])).map((line, i) => <div key={i} className="ny-line">{line}</div>)}
              <div className="ny-foot">
                <span className="ny-time">{it.at ? relTime(it.at, now) : ''}</span>
                <button type="button" className="ds-btn ds-btn-line ny-go" onClick={() => onGo && onGo(it)} aria-label={`${it.verb}: ${it.title}${it.detail ? `, ${it.detail}` : ''}`}>{it.verb}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > LIMIT ? (
        <button type="button" className="ds-btn ds-btn-quiet ny-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? 'Show fewer' : `Show ${items.length - LIMIT} more`}</button>
      ) : null}
      <style jsx>{`
        .ny { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); padding: var(--s-5); }
        .ny-title { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0 0 var(--s-3); }
        .ny-empty { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; }
        .ny-list { list-style: none; margin: 0; padding: 0; }
        .ny-item { padding: var(--s-3) 0; border-top: 1px solid ${C.rule}; }
        .ny-item:first-child { border-top: none; padding-top: 0; }
        .ny-what { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: 1.35; text-wrap: balance; }
        .ny-line { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; text-wrap: balance; }
        .ny-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin-top: var(--s-2); }
        .ny-time { font-size: 13px; color: ${C.inkMute}; line-height: 1.35; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ny-go { flex-shrink: 0; }
        .ny-more { margin-top: var(--s-2); padding-left: 0; }
        /* A large screen: a size up, with the listings beside it. */
        @media (min-width: 1920px) {
          .ny { padding: var(--s-6); }
          .ny-title { font-size: 20px; }
          .ny-what, .ny-line, .ny-empty { font-size: 15px; }
          .ny-item { padding: var(--s-4) 0; }
          .ny-item:first-child { padding-top: 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .ny-in { animation: ny-arrive 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
          @keyframes ny-arrive { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        }
      `}</style>
    </section>
  );
}
