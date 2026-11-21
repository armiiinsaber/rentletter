// components/dashboard/ListingsTable.js
// The desktop dashboard's Listings view (components/dashboard/HomeView.js, 1024px and wider):
//   DeskStats      three numbers that can be clicked: listings, applicants, reports to send. Each a
//                  large number over a small label; a click shows the matching rows in the table
//                  below, a second click shows them all again. A number that changes ticks once.
//   ListingsTable  one row a listing: address, rent, beds, applicants, verified, report, last
//                  activity. A row opens the listing as a card does on a phone (the address is the
//                  link and covers the row); it has a hover state and the keyboard focus shows on
//                  the whole row. The report is a status pill, the counts plain numbers.
// The rows come from components/dashboard/homeData.js rowOf; nothing is read here.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { StatusPills } from '../ui';
import { linkProps, go, prefetch } from '../nav/routes';
import { relTime } from './homeData';

export const FILTERS = { all: null, applicants: (r) => r.applicants > 0, toSend: (r) => r.report === 'not_sent' };

// A number that ticks (a short fade and lift) when its value changes after the first draw.
function Tick({ value }) {
  const was = useRef(value); const [k, setK] = useState(0);
  useEffect(() => { if (was.current !== value) { was.current = value; setK((n) => n + 1); } }, [value]);
  return <span key={k} className={k ? 'dst-num dst-tick' : 'dst-num'}>{value}</span>;
}

export function DeskStats({ standing, filter, onFilter }) {
  const stats = [
    ['all', standing.listings, standing.listings === 1 ? 'listing' : 'listings'],
    ['applicants', standing.applicants, standing.applicants === 1 ? 'applicant' : 'applicants'],
    ['toSend', standing.toSend, standing.toSend === 1 ? 'report to send' : 'reports to send'],
  ];
  return (
    <div className="dst" role="group" aria-label="Your workspace" data-desk-stats="">
      {stats.map(([key, n, label]) => (
        <button key={key} type="button" className="dst-stat" aria-pressed={filter === key && key !== 'all' ? 'true' : 'false'} data-stat={key}
          onClick={() => onFilter(key === 'all' || filter === key ? 'all' : key)}>
          <Tick value={n} />
          <span className="dst-label">{label}</span>
        </button>
      ))}
      <style jsx>{`
        .dst { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-4); }
        .dst-stat { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-1); min-width: 148px; min-height: 44px; padding: var(--s-3) var(--s-4); border-radius: var(--card-radius); border: 1px solid ${C.rule}; background: ${C.card}; color: ${C.ink}; text-align: left; font-family: inherit; cursor: pointer; }
        .dst-stat[aria-pressed='true'] { border-color: ${C.ink}; box-shadow: inset 0 0 0 1px ${C.ink}; }
        .dst-stat:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) { .dst-stat:hover { border-color: ${C.ruleDark}; } .dst-stat[aria-pressed='true']:hover { border-color: ${C.ink}; } }
        .dst :global(.dst-num) { display: inline-block; font-family: var(--f-display); font-size: 40px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dst-label { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.3; white-space: nowrap; }
        @media (min-width: 1920px) { .dst :global(.dst-num) { font-size: 48px; } .dst-stat { min-width: 180px; } }
        @media (prefers-reduced-motion: no-preference) {
          .dst :global(.dst-tick) { animation: dst-tick 360ms cubic-bezier(0.22, 1, 0.36, 1) both; }
          @keyframes dst-tick { from { opacity: 0.2; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        }
      `}</style>
    </div>
  );
}

// The report as a status word. With no applicants there is nothing sent either: the Applicants
// column says why.
const REPORT = { sent: (r) => `Sent ${new Date(r.sentAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`, not_sent: () => 'Not sent', none: () => 'Not sent', closed: () => 'Closed' };

export function ListingsTable({ rows, now, paths, label = 'Your listings', select = null }) {
  return (
    <div role="table" aria-label={label} className={`lt${select ? ' lt-select' : ''}`} data-listings-table="">
      <div role="rowgroup" className="lt-group">
        <div role="row" className="lt-row lt-head">
          {select ? <span role="columnheader" className="lt-check">{select.header}</span> : null}
          <span role="columnheader">Address</span>
          <span role="columnheader" className="lt-n">Rent</span>
          <span role="columnheader">Beds</span>
          <span role="columnheader" className="lt-n">Applicants</span>
          <span role="columnheader" className="lt-n">Verified</span>
          <span role="columnheader">Report</span>
          <span role="columnheader">Last activity</span>
        </div>
      </div>
      <div role="rowgroup" className="lt-group">
        {rows.map((r) => (
          <div role="row" key={r.id} className={`lt-row lt-body${r.open ? '' : ' lt-closed'}`} data-listing-row={r.id}
            // Anywhere on the row opens the listing, except its own controls; the address link is the
            // same place for the keyboard and for a new tab.
            onClick={(e) => { if (e.defaultPrevented || e.target.closest('a, button, input, label, [data-own-action]')) return; go(paths.listing(r.id)); }}
            onPointerDown={() => prefetch(paths.listing(r.id))}>
            {select ? <span role="cell" className="lt-check">{select.cell(r)}</span> : null}
            <span role="cell" className="lt-addr"><a {...linkProps(paths.listing(r.id))} className="lt-link">{r.label}</a></span>
            <span role="cell" className="lt-n">{r.rent ? `$${r.rent.toLocaleString('en-CA')}` : 'Not set'}</span>
            <span role="cell">{r.beds || 'Not set'}</span>
            <span role="cell" className="lt-n">{r.applicants}</span>
            <span role="cell" className="lt-n">{r.verified}</span>
            <span role="cell"><StatusPills label="Report" items={[REPORT[r.report](r)]} /></span>
            <span role="cell" className="lt-when">{relTime(r.lastAt, now)}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        /* One grid for the table; every row takes its columns (subgrid), so a column is as wide as its
           widest cell in any row and the address takes what is left. Only the address wraps. */
        .lt { display: grid; grid-template-columns: minmax(140px, 1fr) repeat(6, auto); column-gap: var(--s-3); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); overflow: hidden; }
        .lt-select { grid-template-columns: auto minmax(140px, 1fr) repeat(6, auto); }
        .lt-group, .lt-row { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; }
        .lt-row { align-items: center; padding: 0 var(--s-4); }
        .lt-row > span { white-space: nowrap; }
        .lt-row > .lt-addr { white-space: normal; }
        .lt-head { min-height: 44px; border-bottom: 1px solid ${C.rule}; font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${C.inkMute}; }
        .lt-body { position: relative; min-height: 64px; padding-top: var(--s-3); padding-bottom: var(--s-3); border-top: 1px solid ${C.rule}; font-size: var(--t-body-2); color: ${C.ink}; }
        .lt-body:first-child { border-top: none; }
        .lt-closed { color: ${C.inkSoft}; }
        .lt-n { text-align: right; font-variant-numeric: tabular-nums; }
        .lt-addr { min-width: 0; }
        /* The address is the row's link; a click anywhere else on the row opens it too. */
        .lt-body { cursor: pointer; }
        .lt-link { font-size: var(--t-body); font-weight: 700; color: inherit; text-decoration: none; overflow-wrap: anywhere; text-wrap: balance; }
        .lt-link:focus-visible { outline: none; }
        .lt-body:focus-within { box-shadow: inset 0 0 0 2px ${C.ink}; }
        .lt-check { display: flex; align-items: center; }
        .lt-when { color: ${C.inkSoft}; font-variant-numeric: tabular-nums; white-space: nowrap; }
        @media (hover: hover) { .lt-body:hover { background: ${C.paper}; } }
        @media (min-width: 1600px) { .lt { column-gap: var(--s-4); } .lt-row { padding: 0 var(--s-5); } }
        @media (min-width: 1920px) { .lt-body { min-height: 72px; } .lt-link { font-size: 17px; } }
      `}</style>
    </div>
  );
}
