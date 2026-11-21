// components/dashboard/ListingsTable.js
// The desktop dashboard's Listings view (components/dashboard/HomeView.js, 1024px and wider):
//   DeskStats      three numbers that can be clicked: listings, applicants, reports to send. Each a
//                  large number over a small label, the three one row as wide as the table, equal
//                  widths; a click shows the matching rows in the table below, a second click shows
//                  them all again. A number that changes ticks once.
//   ListingsTable  one row a listing: address, rent, beds, applicants, verified, report, last
//                  activity, and at 1920 and wider the move in date and the newest applicant too. A
//                  row opens the listing as a card does on a phone (the address is the link and
//                  covers the row); it has a hover state and the keyboard focus shows on the whole
//                  row. The report is a status pill, the counts plain numbers, right aligned under
//                  their headers.
// The rows come from components/dashboard/homeData.js rowOf; nothing is read here.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { StatusPills } from '../ui';
import { linkProps, go, prefetch } from '../nav/routes';
import { relTime, shortDay } from './homeData';

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
        /* One row as wide as the listings column: three equal cells, one height. */
        .dst { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); }
        .dst-stat { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-1); min-width: 0; min-height: 44px; padding: var(--s-3) var(--s-4); border-radius: var(--card-radius); border: 1px solid ${C.rule}; background: ${C.card}; color: ${C.ink}; text-align: left; font-family: inherit; cursor: pointer; }
        .dst-stat[aria-pressed='true'] { border-color: ${C.ink}; box-shadow: inset 0 0 0 1px ${C.ink}; }
        .dst-stat:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) { .dst-stat:hover { border-color: ${C.ruleDark}; } .dst-stat[aria-pressed='true']:hover { border-color: ${C.ink}; } }
        .dst :global(.dst-num) { display: inline-block; font-family: var(--f-display); font-size: 40px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dst-label { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.3; white-space: nowrap; }
        @media (min-width: 1600px) { .dst { gap: var(--s-4); } }
        @media (min-width: 1920px) { .dst :global(.dst-num) { font-size: 48px; } .dst-stat { padding: var(--s-4) var(--s-5); } .dst-label { font-size: var(--t-body); } }
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

// The columns, in order. n: a number, right aligned under its header. wide: shown at 1920 and wider.
const COLUMNS = [
  { key: 'address', head: 'Address', cls: 'lt-addr', cell: (r, x) => <a {...linkProps(x.paths.listing(r.id))} className="lt-link">{r.label}</a> },
  { key: 'rent', head: 'Rent', n: true, cell: (r) => (r.rent ? `$${r.rent.toLocaleString('en-CA')}` : 'Not set') },
  { key: 'beds', head: 'Beds', cell: (r) => r.beds || 'Not set' },
  { key: 'move', head: 'Move in', wide: true, cell: (r) => shortDay(r.moveIn) || 'Not set' },
  { key: 'applicants', head: 'Applicants', n: true, cell: (r) => r.applicants },
  { key: 'newest', head: 'Newest applicant', wide: true, cell: (r) => (r.newest ? r.newest.name : 'None yet') },
  { key: 'verified', head: 'Verified', n: true, cell: (r) => r.verified },
  { key: 'report', head: 'Report', cell: (r) => <StatusPills label="Report" items={[REPORT[r.report](r)]} /> },
  { key: 'when', head: 'Last activity', cls: 'lt-when', cell: (r, x) => relTime(r.lastAt, x.now) },
];
const classOf = (c) => [c.cls, c.n ? 'lt-n' : '', c.wide ? 'lt-wide' : ''].filter(Boolean).join(' ') || undefined;

export function ListingsTable({ rows, now, paths, label = 'Your listings', select = null }) {
  // Each column has a grid track of its own with a spacer track before it (the styles below); a
  // cell names its track, so the spacers stay empty in every row.
  const at = (i) => ({ gridColumn: (select ? 2 : 1) + 2 * i });
  const x = { now, paths };
  return (
    <div role="table" aria-label={label} className={`lt${select ? ' lt-select' : ''}`} data-listings-table="">
      <div role="rowgroup" className="lt-group">
        <div role="row" className="lt-row lt-head">
          {select ? <span role="columnheader" className="lt-check" style={{ gridColumn: 1 }}>{select.header}</span> : null}
          {COLUMNS.map((c, i) => <span key={c.key} role="columnheader" className={classOf(c)} style={at(i)} data-col={c.key}>{c.head}</span>)}
        </div>
      </div>
      <div role="rowgroup" className="lt-group">
        {rows.map((r) => (
          <div role="row" key={r.id} className={`lt-row lt-body${r.open ? '' : ' lt-closed'}`} data-listing-row={r.id}
            // Anywhere on the row opens the listing, except its own controls; the address link is the
            // same place for the keyboard and for a new tab.
            onClick={(e) => { if (e.defaultPrevented || e.target.closest('a, button, input, label, [data-own-action]')) return; go(paths.listing(r.id)); }}
            onPointerDown={() => prefetch(paths.listing(r.id))}>
            {select ? <span role="cell" className="lt-check" style={{ gridColumn: 1 }}>{select.cell(r)}</span> : null}
            {COLUMNS.map((c, i) => <span key={c.key} role="cell" className={classOf(c)} style={at(i)} data-col={c.key}>{c.cell(r, x)}</span>)}
          </div>
        ))}
      </div>
      <style jsx>{`
        /* One grid for the table; every row takes its columns (subgrid). The address is as wide as
           its longest address, at least 160px and at most 380px (440px from 1920), and wraps; every
           other column is as wide as its widest cell, on one line. Before each column after the
           address is a spacer track: the spacers share what width is left equally, so the columns
           are evenly spaced across the whole table and none has a hole beside it. The two wide
           columns (Move in, Newest applicant) and their spacers are 0 wide under 1920; Last
           activity is 0 wide from 1280 to 1399, where Needs you stands beside the table and the
           listings column is at its narrowest. Should a row still not fit, the table scrolls
           sideways inside its card: nothing is ever cut off. */
        .lt {
          --lt-addr: 380px; --sp: minmax(var(--s-2), 1fr); --w: 0px; --wsp: 0px; --wh: max-content; --whs: var(--sp);
          --lt-cols: fit-content(var(--lt-addr)) var(--sp) max-content var(--sp) max-content var(--wsp) var(--w) var(--sp) max-content var(--wsp) var(--w) var(--sp) max-content var(--sp) max-content var(--whs) var(--wh);
          display: grid; grid-template-columns: var(--lt-cols); column-gap: 0; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); overflow-x: auto; overflow-y: hidden;
        }
        .lt-select { grid-template-columns: auto var(--lt-cols); }
        .lt-group, .lt-row { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; }
        .lt-row { align-items: center; padding: 0 var(--s-3); }
        .lt-row > span { white-space: nowrap; grid-row: 1; }
        .lt-row > .lt-addr { white-space: normal; min-width: 160px; }
        .lt-row > .lt-wide { display: none; }
        .lt-head { min-height: 44px; border-bottom: 1px solid ${C.rule}; font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${C.inkMute}; }
        .lt-body { position: relative; min-height: 64px; padding-top: var(--s-3); padding-bottom: var(--s-3); border-top: 1px solid ${C.rule}; font-size: var(--t-body-2); color: ${C.ink}; }
        .lt-body:first-child { border-top: none; }
        .lt-closed { color: ${C.inkSoft}; }
        .lt-n { text-align: right; font-variant-numeric: tabular-nums; }
        /* The address is the row's link; a click anywhere else on the row opens it too. */
        .lt-body { cursor: pointer; }
        /* The link is built with the columns, outside this tree, so its class is global (and unique
           to the table). */
        .lt :global(.lt-link) { font-size: var(--t-body); font-weight: 700; color: inherit; text-decoration: none; overflow-wrap: anywhere; text-wrap: balance; }
        .lt :global(.lt-link:focus-visible) { outline: none; }
        .lt-body:focus-within { box-shadow: inset 0 0 0 2px ${C.ink}; }
        .lt-check { display: flex; align-items: center; padding-right: var(--s-3); }
        .lt-when { color: ${C.inkSoft}; font-variant-numeric: tabular-nums; white-space: nowrap; }
        @media (hover: hover) { .lt-body:hover { background: ${C.paper}; } }
        /* The row's right padding then belongs to Report, the last column on screen. */
        @media (min-width: 1280px) and (max-width: 1399.98px) { .lt { --wh: 0px; --whs: 0px; } .lt-row > [data-col='when'] { display: none; } .lt-row { padding-right: 0; } .lt-row > [data-col='report'] { padding-right: var(--s-3); } }
        @media (min-width: 1600px) { .lt { --sp: minmax(var(--s-4), 1fr); } .lt-row { padding: 0 var(--s-5); } .lt-check { padding-right: var(--s-4); } }
        /* 1920 and wider: the move in date and the newest applicant, taller rows and a size up. */
        @media (min-width: 1920px) {
          .lt { --lt-addr: 440px; --w: max-content; --wsp: var(--sp); }
          .lt-row > .lt-wide { display: block; }
          .lt-head { font-size: 12px; }
          .lt-body { min-height: 72px; font-size: 15px; }
          .lt :global(.lt-link) { font-size: 17px; }
        }
      `}</style>
    </div>
  );
}
