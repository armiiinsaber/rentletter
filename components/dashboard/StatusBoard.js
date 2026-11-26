// components/dashboard/StatusBoard.js
// The top of the realtor's Listings view (components/dashboard/HomeView.js): the date, then four
// tiles in one row across the main area's whole width, equal widths (two by two under 1024px).
// Every number is the board's (components/dashboard/board.js boardOf, the one source):
//   Ready to send       the listings with a report ready to send. Black, light text, a red dot and
//                       "Send report" with an arrow while above zero; a press opens the send sheet
//                       for the listing that has waited longest (components/dashboard/
//                       SendReportSheet.js, from the page), its link that listing's report panel.
//   Documents to check  the applicants whose documents wait for the realtor's review. Glass, a red
//                       dot and "Check now" with an arrow while above zero; a link to the applicant
//                       who has waited longest, their documents open.
//   Applicants          the live applicants on the active listings, and how many applied this week.
//                       A button: the listings with applicants.
//   Active listings     the listings taking applications, and how many have no applicant yet. A
//                       button: every listing again.
// A tile with nothing to do loses its dot and its action line and turns quiet; Ready to send and
// Documents to check are then buttons that show the listings they count (none). A number that
// changes while the page is open rolls to its new value (transform and opacity, at once when motion
// is reduced).
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { actionHref } from '../../lib/actions.js';

// A number that rolls to its new value: the old one up and out, the new one up and in.
export function Roll({ value }) {
  const [shown, setShown] = useState({ now: value, was: null, k: 0 });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    let t = 0;
    setShown((s) => {
      if (s.now === value) return s;
      return { now: value, was: s.now, k: s.k + 1 };
    });
    t = setTimeout(() => setShown((s) => ({ ...s, was: null })), 520);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className="sb-roll" data-roll={shown.now}>
      {shown.was != null ? <span key={`was-${shown.k}`} className="sb-roll-was" aria-hidden="true">{shown.was}</span> : null}
      <span key={`now-${shown.k}`} className={shown.k ? 'sb-roll-now sb-roll-in' : 'sb-roll-now'}>{shown.now}</span>
    </span>
  );
}

const dateLine = (now) => (now == null ? '' : new Date(now).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }));

export default function StatusBoard({ tiles, now, filter, onFilter, paths, onJump }) {
  const t = tiles || {};
  const jump = (item) => (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); onJump(item);
  };
  const filterBtn = (key) => ({ type: 'button', 'aria-pressed': filter === key && key !== 'all' ? 'true' : 'false', onClick: () => onFilter(key === 'all' || filter === key ? 'all' : key) });
  const plural = (n, one, many) => (n === 1 ? one : many);
  const tile = (key, n, label, { dark = false, act = null, item = null, line = null }) => {
    const live = !!(act && n > 0 && item);
    const cls = `sb-tile${dark && live ? ' sb-dark' : ' rl-glass'}${act && !live ? ' sb-quiet' : ''}`;
    const body = (
      <>
        <span className="sb-label">{label}</span>
        <span className="sb-num"><Roll value={n} />{live ? <span className="sb-dot" aria-hidden="true" /> : null}</span>
        {live ? <span className="sb-act">{act}<Icon name="arrow" size={16} strokeWidth={2} /></span> : line ? <span className="sb-line">{line}</span> : <span className="sb-line" aria-hidden="true">{' '}</span>}
      </>
    );
    return live
      ? <a key={key} href={actionHref(item, paths)} onClick={jump(item)} className={`${cls} sb-link`} data-tile={key} data-tile-live="" aria-label={`${n} ${label.toLowerCase()}. ${act}`}>{body}</a>
      : <button key={key} {...filterBtn(key)} className={cls} data-tile={key}>{body}</button>;
  };
  return (
    <section className="sb" aria-label="Where your rentals stand" data-status-board="">
      <p className="sb-date" data-board-date="" style={{ visibility: now == null ? 'hidden' : 'visible' }}>{dateLine(now) || ' '}</p>
      <div className="sb-tiles" role="group" aria-label="Your rentals">
        {tile('toSend', t.toSend || 0, 'Ready to send', { dark: true, act: 'Send report', item: t.oldestSend })}
        {tile('toCheck', t.toCheck || 0, 'Documents to check', { act: 'Check now', item: t.oldestCheck })}
        {tile('applicants', t.applicants || 0, 'Applicants', { line: now == null ? null : t.newThisWeek ? `${t.newThisWeek} new this week` : 'None new this week' })}
        {tile('all', t.active || 0, 'Active listings', { line: t.active ? (t.withoutApplicants ? `${t.withoutApplicants} with no ${plural(t.withoutApplicants, 'applicant', 'applicants')}` : 'All have applicants') : 'None taking applications' })}
      </div>
      <style jsx>{`
        .sb { margin: 0 0 var(--gap-section); }
        .sb-date { margin: 0 0 var(--s-3); font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; line-height: 1.3; }
        .sb-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); }
        @media (min-width: 1024px) { .sb-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-4); } }
        .sb :global(.sb-tile) { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2); min-width: 0; min-height: 132px; margin: 0; padding: var(--s-4); border-radius: 24px; border: none; color: ${C.ink}; text-align: left; text-decoration: none; font-family: inherit; cursor: pointer; box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 8px 24px rgba(var(--c-shadow-rgb), 0.05); }
        .sb :global(.sb-dark) { background: ${C.ink}; color: ${C.paper}; box-shadow: 0 12px 32px rgba(var(--c-shadow-rgb), 0.22); }
        .sb :global(.sb-tile[aria-pressed='true']) { box-shadow: inset 0 0 0 2px ${C.ink}, 0 8px 24px rgba(var(--c-shadow-rgb), 0.05); }
        .sb :global(.sb-tile:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        .sb :global(.sb-label) { font-size: var(--t-body-2); font-weight: 700; line-height: 1.25; color: inherit; }
        .sb :global(.sb-quiet .sb-label), .sb :global(.sb-quiet .sb-num) { color: ${C.inkSoft}; }
        .sb :global(.sb-dot) { flex-shrink: 0; width: 10px; height: 10px; margin-top: 4px; border-radius: 50%; background: ${C.red}; }
        .sb :global(.sb-dark .sb-dot) { background: ${C.redOnInk}; box-shadow: 0 0 0 3px rgba(var(--c-red-on-ink-rgb), 0.28); }
        .sb :global(.sb-num) { display: inline-flex; align-items: flex-start; gap: var(--s-2); font-family: var(--f-display); font-size: 40px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .sb :global(.sb-act) { margin-top: auto; display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-body-2); font-weight: 700; line-height: 1.2; }
        .sb :global(.sb-line) { margin-top: auto; font-size: 13px; font-weight: 500; color: ${C.inkSoft}; line-height: 1.3; text-wrap: balance; }
        .sb :global(.sb-label) { text-wrap: balance; }
        .sb :global(.sb-roll) { position: relative; display: inline-block; overflow: hidden; vertical-align: top; }
        .sb :global(.sb-roll-was) { display: none; }
        @media (hover: hover) { .sb :global(.sb-tile:not(.sb-dark):hover) { box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px rgba(var(--c-ink-rgb), 0.16), 0 8px 24px rgba(var(--c-shadow-rgb), 0.07); } }
        @media (min-width: 1024px) { .sb :global(.sb-tile) { min-height: 148px; padding: var(--s-4); } .sb :global(.sb-num) { font-size: 48px; } }
        /* 1024 to 1279: four tiles in the narrowest main area; the longest label (Documents to check) keeps one line. */
        @media (min-width: 1024px) and (max-width: 1279.98px) { .sb-tiles { gap: var(--s-3); } .sb :global(.sb-label) { font-size: 13px; } }
        @media (min-width: 1280px) { .sb :global(.sb-tile) { padding: var(--s-5); } }
        @media (min-width: 1920px) { .sb :global(.sb-tile) { min-height: 164px; } .sb :global(.sb-num) { font-size: 56px; } .sb :global(.sb-label) { font-size: var(--t-body); } .sb-date { font-size: var(--t-body); } }
        @media (max-width: 344.98px) { .sb-tiles { gap: var(--s-2); } .sb :global(.sb-tile) { padding: 10px; min-height: 120px; border-radius: 20px; } .sb :global(.sb-num) { font-size: 34px; } .sb :global(.sb-label) { font-size: 12px; letter-spacing: -0.01em; } .sb :global(.sb-line), .sb :global(.sb-act) { font-size: 12px; } }
        /* The roll: the old number up and out, the new one up and in. Only with motion. */
        @media (prefers-reduced-motion: no-preference) {
          .sb :global(.sb-roll-was) { display: block; position: absolute; left: 0; top: 0; animation: sb-out 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
          .sb :global(.sb-roll-in) { display: inline-block; animation: sb-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
          @keyframes sb-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-60%); } }
          @keyframes sb-in { from { opacity: 0; transform: translateY(60%); } to { opacity: 1; transform: translateY(0); } }
        }
      `}</style>
    </section>
  );
}
