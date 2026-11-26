// components/dashboard/ListingCard.js
// One listing on the realtor's Listings view (components/dashboard/HomeView.js), as a card: white,
// 24px corners, a soft shadow, lifting 2px under a pointer that hovers. Everything on it comes from
// the board (components/dashboard/board.js cardOf, the one source):
//   the top row: the address in the display face with the rent and the unit type under it; the
//     applicants as overlapping initials (up to four, then +N); a round button that copies the apply
//     link ("Copied" for a second); and the card's one main action as a dark pill with an arrow:
//     Send report, Check documents, Ask for documents, Call the employer, or Open.
//   the progress strip: six equal segments, Invited, Applied, Documents, Employer called, Report,
//     Rented, with their names under them; done in ink, the current one red, the rest pale.
//   the status line: a red dot when the listing has something in Needs you, the next step in words,
//     and how long it has waited (more weight past three days); quiet when nothing waits.
// Under 1024px the same card is compact: the address, "rent · beds · N applicants", the copy
// button, the strip without its names, then the status line with the main action at its right.
// The whole card opens the listing (lib/motion.js cardTap, the address the link for the keyboard
// and a new tab); its buttons do their own action. Send report opens the send sheet first
// (components/dashboard/SendReportSheet.js, from the page); once the realtor confirms it sends in
// place: "Sending", then a tick, and the card's status follows. In Select mode a checkbox shows at
// its top left.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { cardTap } from '../../lib/motion';
import { linkProps, go, prefetch } from '../nav/routes';
import { actionHref } from '../../lib/actions.js';
import { STAGES } from './board';
import { Pending } from '../brand/Loader';

const money = (n) => (n ? `$${Number(n).toLocaleString('en-CA')}` : 'No rent set');

// The six stages as a strip: names under the segments where there is room for them.
export function Strip({ stage, labels = true }) {
  const at = stage && stage.current != null ? STAGES[stage.current] : null;
  const said = stage && stage.rented ? 'Rented' : at ? `At ${at}` : 'Closed';
  return (
    <ol className={`lc-strip${labels ? '' : ' lc-strip-bare'}`} aria-label={`Progress. ${said}`} data-strip={stage && stage.current != null ? stage.current : stage && stage.rented ? 'rented' : 'closed'}>
      {STAGES.map((name, i) => {
        const cur = stage && stage.current === i; const done = stage && stage.done[i];
        return (
          <li key={name} className={`lc-seg${cur ? ' lc-cur' : done ? ' lc-done' : ''}`} aria-current={cur ? 'step' : undefined} data-seg={cur ? 'current' : done ? 'done' : 'todo'}>
            <span className="lc-bar" aria-hidden="true" />
            <span className="lc-seg-t">{name}<span className="lc-sr">{cur ? ', current' : done ? ', done' : ', not yet'}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

function Faces({ people }) {
  if (!people || !people.length) return null;
  const shown = people.slice(0, 4); const more = people.length - shown.length;
  return (
    <span className="lc-faces" aria-label={`${people.length} applicant${people.length === 1 ? '' : 's'}`} data-faces={people.length}>
      {shown.map((p) => <span key={p.id} className="lc-face" title={p.name} aria-hidden="true">{p.initials}</span>)}
      {more > 0 ? <span className="lc-face lc-more" aria-hidden="true">+{more}</span> : null}
    </span>
  );
}

// The apply link, copied: "Copied" over the button for a second.
function CopyLink({ link, label }) {
  const [done, setDone] = useState(false);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  if (!link) return <span className="lc-copy-slot" />;
  const url = /^https?:/.test(link) ? link : (typeof window !== 'undefined' ? `${window.location.origin}${link}` : link);
  const copy = async (e) => {
    e.preventDefault(); e.stopPropagation();
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (err) {
      try { const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (x) { ok = false; }
    }
    if (!ok) return;
    setDone(true); clearTimeout(t.current); t.current = setTimeout(() => setDone(false), 1000);
  };
  return (
    <span className="lc-copy-slot">
      <button type="button" className="lc-copy" onClick={copy} aria-label={`Copy the apply link for ${label}`} data-copy-apply="" data-copied={done ? 'true' : 'false'}>
        <Icon name={done ? 'check' : 'link'} size={18} strokeWidth={done ? 2.2 : 1.7} />
      </button>
      <span className={`lc-copied${done ? ' lc-copied-on' : ''}`} role="status" aria-live="polite">{done ? 'Copied' : ''}</span>
    </span>
  );
}

// send: { state: 'sending' | 'sent' | 'failed', note } for this listing's report, from the page.
export default function ListingCard({ listing, row, card, paths, selecting = false, picked = false, onPick = null, onSend = null, send = null }) {
  const href = paths.listing(listing.id);
  const open = () => go(href);
  const next = card.next;
  const label = row.label;
  // Each fact whole on its line, its separator after it, so a line never starts with a dot.
  const factsOf = (list) => list.filter(Boolean).map((f, i, all) => <span key={f} className="lc-fact">{f}{i < all.length - 1 ? ' ·' : ''}</span>).reduce((out, x, i) => (i ? [...out, ' ', x] : [x]), []);
  const facts = factsOf([money(row.rent), row.beds || null]);
  const phoneFacts = factsOf([money(row.rent), row.beds || null, `${card.applicants} applicant${card.applicants === 1 ? '' : 's'}`]);
  // The main action: Send report asks the page for its sheet; every other step opens the listing where it is done.
  const stepHref = next.item ? actionHref(next.item, paths) : href;
  const sending = send && send.state === 'sending'; const sent = send && send.state === 'sent';
  const act = next.kind === 'send' && onSend ? (
    <button type="button" className={`lc-act${sent ? ' lc-act-done' : ''}`} onClick={(e) => { e.stopPropagation(); if (!sending && !sent) onSend(listing, card); }} disabled={sending} aria-live="polite" data-card-action="send">
      {sent ? <><Icon name="check" size={16} strokeWidth={2.4} /><span>Sent</span></> : <Pending busy={sending} label="Sending the report" tone="ink"><span>{next.label}</span><Icon name="arrow" size={16} strokeWidth={2} /></Pending>}
    </button>
  ) : (
    <a href={stepHref} {...linkProps(stepHref)} className={`lc-act${next.kind === 'quiet' ? ' lc-act-quiet' : ''}`} data-card-action={next.kind} aria-label={next.kind === 'quiet' || next.kind === 'open' ? `Open ${label}` : `${next.label}, ${label}`}>
      <span>{next.label}</span><Icon name="arrow" size={16} strokeWidth={2} />
    </a>
  );
  return (
    <article className={`lc${row.open ? '' : ' lc-closed'}${selecting ? ' lc-selecting' : ''}${picked ? ' lc-picked' : ''}`} data-listing-card={listing.id} data-tap-card="" data-press="card"
      onClick={cardTap(open)} onPointerDown={() => prefetch(href)}>
      {selecting ? (
        <label className="lc-pick" data-own-action="">
          <input type="checkbox" className="hv-check" checked={picked} onChange={() => onPick && onPick(listing.id)} aria-label={`Select ${label}`} data-card-check={listing.id} />
        </label>
      ) : null}
      <div className="lc-id">
        <h3 className="lc-addr"><a {...linkProps(href)} className="lc-link">{label}</a></h3>
        <p className="lc-facts lc-wide">{facts}</p>
        <p className="lc-facts lc-narrow">{phoneFacts}</p>
      </div>
      <div className="lc-people lc-wide"><Faces people={card.people} /></div>
      <div className="lc-copyc"><CopyLink link={card.link} label={label} /></div>
      <div className="lc-stripc"><Strip stage={card.stage} /></div>
      {/* The status and the main action: the action in the top row at 1024 and wider (this box is
          then no box at all), beside the status under it. */}
      <div className="lc-foot">
        <p className={`lc-status${card.dot ? ' lc-status-on' : ''}`} data-card-status="">
          {card.dot ? <span className="lc-dot" aria-hidden="true" /> : null}
          <span className="lc-words">{sent ? 'Report sent' : next.words}{next.wait && !sent ? ',' : ''}</span>
          {next.wait && !sent ? <>{' '}<span className={`lc-wait${next.long ? ' lc-long' : ''}`}>{next.wait}</span></> : null}
          {send && send.state === 'failed' ? <span className="lc-fail" role="alert">{send.note}</span> : null}
        </p>
        <div className="lc-actc">{act}</div>
      </div>
    </article>
  );
}

// The cards' styles, once for the page (HomeView renders it beside the grid).
export function ListingCardStyles() {
  return (
    <style jsx global>{`
      .lc { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; grid-template-areas: 'id people copy act' 'strip strip strip strip' 'status status status status'; align-items: center; column-gap: var(--s-3); row-gap: var(--s-4); min-width: 0; padding: var(--s-5); background: ${C.card}; border-radius: 24px; color: ${C.ink}; cursor: pointer; box-shadow: 0 1px 2px rgba(var(--c-shadow-rgb), 0.05), 0 10px 30px rgba(var(--c-shadow-rgb), 0.06); }
      .lc::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 2px 4px rgba(var(--c-shadow-rgb), 0.06), 0 18px 40px rgba(var(--c-shadow-rgb), 0.1); opacity: 0; pointer-events: none; }
      .lc:focus-within { box-shadow: 0 0 0 2px ${C.ink}, 0 10px 30px rgba(var(--c-shadow-rgb), 0.06); }
      .lc-selecting { padding-left: calc(var(--s-5) + 36px); }
      /* 44 by 44 of its own: no hit area drawn over the checkbox (lib/motion.js installHitAreas). */
      .lc-picked { box-shadow: 0 0 0 2px ${C.ink}, 0 10px 30px rgba(var(--c-shadow-rgb), 0.06); }
      .lc-pick { position: absolute; left: 10px; top: 14px; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; cursor: pointer; }
      .lc-id { grid-area: id; min-width: 0; align-self: start; }
      .lc-addr { margin: 0; font-family: var(--f-display); font-size: 22px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; overflow-wrap: anywhere; text-wrap: balance; }
      .lc-link { color: inherit; text-decoration: none; }
      .lc-link:focus-visible { outline: none; }
      .lc-facts { margin: var(--s-1) 0 0; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.35; font-variant-numeric: tabular-nums; }
      .lc-narrow { display: none; }
      .lc-people { grid-area: people; }
      .lc-copyc { grid-area: copy; justify-self: end; }
      .lc-foot { display: contents; }
      .lc-actc { grid-area: act; justify-self: end; }
      .lc-fact { white-space: nowrap; }
      .lc-stripc { grid-area: strip; min-width: 0; }
      .lc-status { grid-area: status; margin: 0; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.35; min-width: 0; }
      .lc-status-on { color: ${C.ink}; }
      .lc-status-on .lc-words { font-weight: 700; }
      .lc-dot { display: inline-block; width: 8px; height: 8px; margin-right: var(--s-2); border-radius: 50%; background: ${C.red}; vertical-align: 1px; }
            .lc-wait { color: ${C.inkSoft}; font-variant-numeric: tabular-nums; }
      .lc-long { color: ${C.ink}; font-weight: 700; }
      .lc-fail { display: block; margin-top: var(--s-1); color: ${C.danger}; font-weight: 600; }
      /* The applicants: overlapping initials, up to four, then +N. */
      .lc-faces { display: inline-flex; align-items: center; padding-left: 6px; }
      .lc-face { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin-left: -6px; border-radius: 50%; background: ${C.paperDeep}; color: ${C.ink}; font-size: 10px; font-weight: 800; letter-spacing: 0.02em; box-shadow: 0 0 0 2px ${C.card}; }
      .lc-more { background: ${C.ink}; color: ${C.paper}; }
      /* The copy button: round, outlined, the "Copied" bubble over it. */
      .lc-copy-slot { position: relative; display: inline-flex; min-width: 44px; }
      .lc-copy { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border-radius: 50%; background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; cursor: pointer; }
      .lc-copy[data-copied='true'] { border-color: ${C.ink}; }
      .lc-copy:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
      .lc-copied { position: absolute; left: 50%; bottom: calc(100% + 6px); translate: -50% 0; padding: 4px 10px; border-radius: 999px; background: ${C.ink}; color: ${C.paper}; font-size: 12px; font-weight: 700; white-space: nowrap; pointer-events: none; opacity: 0; }
      .lc-copied:empty { padding: 0; }
      .lc-copied-on { opacity: 1; }
      /* The main action: a dark pill with an arrow. */
      .lc-act { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: 44px; padding: 0 var(--s-4) 0 var(--s-5); border-radius: 999px; background: ${C.ink}; color: ${C.paper}; border: 1px solid ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 700; line-height: 1.2; text-decoration: none; white-space: nowrap; cursor: pointer; }
      .lc-act-quiet { background: ${C.card}; color: ${C.ink}; border-color: ${C.ruleDark}; }
      .lc-act-done { background: ${C.card}; color: ${C.ink}; border-color: ${C.ink}; }
      .lc-act:disabled { cursor: default; }
      .lc-act:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
      .lc-act-done svg { color: ${C.red}; }
      /* The strip: six equal segments and their names. */
      .lc-strip { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: 6px; }
      /* Each name centred under its segment at its own width, on one line: in a narrow card the
         longest (Employer called) runs a little past its segment into the room its neighbours'
         shorter names leave, and never wraps. */
      .lc-seg { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
      .lc-bar { display: block; align-self: stretch; height: 6px; border-radius: 999px; background: ${C.paperDeep}; }
      .lc-done .lc-bar { background: ${C.ink}; }
      .lc-cur .lc-bar { background: ${C.red}; }
      .lc-seg-t { width: max-content; font-size: 12px; font-weight: 600; color: ${C.inkSoft}; line-height: 1.25; white-space: nowrap; text-align: center; }
      .lc-done .lc-seg-t { color: ${C.ink}; }
      .lc-cur .lc-seg-t { color: ${C.ink}; font-weight: 800; }
      .lc-strip-bare .lc-seg-t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .lc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .lc-closed .lc-addr { color: ${C.inkSoft}; }
      @media (hover: hover) and (min-width: 1024px) { .lc-copy:hover { border-color: ${C.ink}; } .lc-act-quiet:hover { border-color: ${C.ink}; } }
      /* 1280 to 1439: Needs you beside the cards, the cards at their narrowest. The address takes the
         top row's whole width, so a long one keeps two words or more a line; the faces, the copy
         button and the main action go on the row under it. */
      @media (min-width: 1280px) and (max-width: 1439.98px) {
        .lc { grid-template-columns: auto minmax(0, 1fr) auto auto; grid-template-areas: 'id id id id' 'people . copy act' 'strip strip strip strip' 'status status status status'; row-gap: var(--s-3); }
        .lc-stripc { margin-top: var(--s-1); }
      }
      @media (prefers-reduced-motion: no-preference) {
        .lc { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        .lc::after { transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1); }
        .lc-copied { transition: opacity 160ms linear; }
      }
      @media (hover: hover) { .lc:hover { transform: translateY(-2px); } .lc:hover::after { opacity: 1; } }
      /* Under 1024px: compact. The names of the stages go; the main action moves beside the status. */
      @media (max-width: 1023.98px) {
        .lc { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'id copy' 'strip strip' 'foot foot'; column-gap: var(--s-3); row-gap: var(--s-3); padding: var(--s-4); border-radius: 22px; }
        /* The status and the main action share a row while the status keeps 150px; narrower, the
           action goes under it, at the right. */
        .lc-foot { grid-area: foot; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-2) var(--s-3); min-width: 0; }
        .lc-status { flex: 1 1 150px; }
        .lc-actc { margin-left: auto; }
        .lc-selecting { padding-left: calc(var(--s-4) + 36px); }
        .lc-pick { left: 4px; top: 8px; }
        .lc-addr { font-size: 19px; }
        .lc-wide { display: none; }
        .lc-narrow { display: block; }
        .lc-copyc { align-self: start; }
        .lc-strip { column-gap: 4px; }
        .lc-seg-t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        .lc-bar { height: 5px; }
        .lc-act { padding: 0 var(--s-3) 0 var(--s-4); }
      }
      @media (max-width: 344.98px) { .lc { padding: var(--s-3); } .lc-act { padding: 0 var(--s-3); } }
      @media (min-width: 1920px) { .lc-addr { font-size: 24px; } .lc-facts, .lc-status { font-size: 15px; } .lc-seg-t { font-size: 13px; } }
    `}</style>
  );
}
