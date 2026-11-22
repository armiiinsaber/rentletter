// components/tenant/ProfileLayout.js
// The frame of the tenant's own profile page (pages/my-application.js): the sections in one order,
// whether each is done, started or empty, the section menu, the chips that stand in for it on a
// phone, and the one colour each state carries everywhere on the page.
//   SECTIONS                 the nine sections, in page order: { key, label }
//   factState(key, facts)    'done' | 'started' | 'empty' for a section of typed facts
//   sectionStates(input)     { [key]: state } for all nine, from what the page already loaded
//   StateMark, StateTag      the state as a mark, and as a mark with its word
//   SectionMenu, SectionChips   the menu at 1024 and wider, the chips under the header below it
//   useCurrentSection(keys)  the section at the top of the window as the page scrolls
//   goToSection(key)         scrolls a section to the top (instantly under reduced motion)
//   ProfileLayoutStyles      the page's three columns, rendered once
// The colours: done is C.done, the one calm positive colour, used for a done state and nothing
// else; started is ink; empty is the mute ink on a dashed ring. Red is the page's one main action.
// Layout only: nothing here reads or writes anything a route answers.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { noWidow } from '../../lib/typeset';
import { MOTION_QUERY, DURATION, CURVE } from '../../lib/motion';

export const SECTIONS = Object.freeze([
  { key: 'details', label: 'Details' },
  { key: 'employment', label: 'Employment and income' },
  { key: 'contact', label: 'Contact' },
  { key: 'rental', label: 'Rental history' },
  { key: 'references', label: 'References' },
  { key: 'documents', label: 'Documents' },
  { key: 'about', label: 'About you' },
  { key: 'shares', label: 'Who can see your profile' },
  { key: 'applications', label: 'Your applications' },
]);
export const STATE_WORD = Object.freeze({ done: 'Done', started: 'Started', empty: 'Empty' });

const has = (v) => v != null && String(v).trim() !== '';
const of = (n, total) => (n === 0 ? 'empty' : n >= total ? 'done' : 'started');
// A section of typed facts: done when every fact it asks for holds a value, started when some do.
export function factState(key, facts) {
  const f = facts || {};
  switch (key) {
    case 'details': return of([f.fullName, f.moveInDate, f.numberOfOccupants].filter(has).length, 3);
    case 'move': return has(f.moveInDate) ? 'done' : 'empty';
    case 'household': return has(f.numberOfOccupants) ? 'done' : 'started';
    case 'employment': return of([f.jobTitle, f.employer, f.annualIncome].filter(has).length, 3);
    case 'contact': return of([f.email, f.phone].filter(has).length, 2);
    case 'rental': {
      if (f.rentalStatus === 'none') return 'done';
      return of([f.previousAddress, f.previousLandlordName, f.previousLandlordContact].filter(has).length, 3);
    }
    case 'references': {
      if ([1, 2].some((n) => has(f[`reference${n}Name`]) && has(f[`reference${n}Contact`]))) return 'done';
      return [1, 2].some((n) => has(f[`reference${n}Name`]) || has(f[`reference${n}Contact`])) ? 'started' : 'empty';
    }
    default: return 'empty';
  }
}

// All nine, from what the page holds: the profile, the vault (documents), the personal answer
// (photo, words, offer) and the shares. A part not loaded yet reads empty.
export function sectionStates({ profile, vault, personal, shares }) {
  const f = { ...((profile && profile.facts) || {}), email: (profile && profile.facts && profile.facts.email) || (profile && profile.email) || '' };
  const kinds = new Set([...((vault && vault.documents) || []).map((d) => d.kind)]);
  const docKinds = ['id', 'income', 'employment'].filter((k) => kinds.has(k)).length;
  const live = (shares || []).filter((s) => s.live).length;
  const p = personal || {};
  const about = [!!p.photo, has(p.about), p.prepayMonths != null].filter(Boolean).length;
  return {
    details: factState('details', f),
    employment: factState('employment', f),
    contact: factState('contact', f),
    rental: factState('rental', f),
    references: factState('references', f),
    documents: docKinds >= 3 ? 'done' : (vault && (vault.documents || []).length) ? 'started' : 'empty',
    about: !!p.photo && has(p.about) ? 'done' : about ? 'started' : 'empty',
    shares: live ? 'done' : (shares || []).length ? 'started' : 'empty',
    applications: ((profile && profile.applications) || []).length ? 'done' : 'empty',
  };
}

export const StateMark = ({ state, size = 16 }) => (
  <span className="tp-mark" data-state={state} aria-hidden="true" style={{ width: size, height: size }}>
    {state === 'done' && <svg width={size} height={size} viewBox="0 0 16 16"><path d="M4.5 8.4l2.3 2.3 4.7-5" fill="none" stroke={C.card} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </span>
);
export const StateTag = ({ state }) => (
  <span className="tp-tag" data-state={state} data-section-state={state}><StateMark state={state} size={14} />{STATE_WORD[state]}</span>
);

// The section at the top of the window: the last one whose top has passed a line a little below
// the top (under the phone's sticky bar). Read on scroll, once a frame at most.
export function useCurrentSection(keys) {
  const [current, setCurrent] = useState(keys[0]);
  const list = keys.join('|');
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      // A quarter of the way down the window; on a phone a little lower, under its sticky bar and chips.
      const line = window.innerWidth >= 1024 ? Math.min(220, window.innerHeight * 0.25) : Math.max(180, window.innerHeight * 0.3);
      let at = keys[0];
      for (const k of keys) { const el = document.querySelector(`[data-tp-anchor="${k}"]`); if (el && el.getBoundingClientRect().top - line <= 0) at = k; }
      // At the foot of the page the last section is the current one, however short it is.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) at = keys[keys.length - 1];
      setCurrent(at);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  return current;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function goToSection(key, { instant = false } = {}) {
  const el = typeof document !== 'undefined' && document.querySelector(`[data-tp-anchor="${key}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: 'start', behavior: instant || reduced() ? 'instant' : 'smooth' });
  return el;
}

export function SectionMenu({ states, current, onGo }) {
  return (
    <nav className="tp-menu" aria-label="Profile sections" data-tp-menu="">
      <ul className="tp-menu-list">
        {SECTIONS.map((s) => (
          <li key={s.key}>
            <a href={`#${s.key}`} className="tp-menu-item" data-menu-item={s.key} data-state={states[s.key]} aria-current={current === s.key ? 'location' : undefined}
              onClick={(e) => { e.preventDefault(); onGo(s.key); }}>
              <StateMark state={states[s.key]} />
              <span className="tp-menu-label">{noWidow(s.label)}</span>
              <span className="tp-sr">{`, ${STATE_WORD[states[s.key]]}`}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SectionChips({ states, current, onGo }) {
  const row = useRef(null);
  // The current chip is kept in view in the row, sideways only: the page never moves for it.
  useEffect(() => {
    const r = row.current; const chip = r && r.querySelector(`[data-chip="${current}"]`);
    if (!r || !chip) return;
    const left = chip.offsetLeft - 16; const right = chip.offsetLeft + chip.offsetWidth + 16 - r.clientWidth;
    if (r.scrollLeft > left) r.scrollTo({ left, behavior: reduced() ? 'instant' : 'smooth' });
    else if (r.scrollLeft < right) r.scrollTo({ left: right, behavior: reduced() ? 'instant' : 'smooth' });
  }, [current]);
  return (
    <nav className="tp-chips" aria-label="Profile sections" data-tp-chips="">
      <ul className="tp-chips-row" ref={row}>
        {SECTIONS.map((s) => (
          <li key={s.key}>
            <a href={`#${s.key}`} className="tp-chip" data-chip={s.key} data-state={states[s.key]} aria-current={current === s.key ? 'location' : undefined}
              onClick={(e) => { e.preventDefault(); onGo(s.key); }}>
              <StateMark state={states[s.key]} size={14} />
              <span>{s.label}</span>
              <span className="tp-sr">{`, ${STATE_WORD[states[s.key]]}`}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// The page's frame. Under 1024px: one column, the phone's sticky bar and chips under the header.
// From 1024px the page fills the window the way the realtor's dashboard does (components/
// dashboard/DashShell.js): the menu against the window's left edge, side padding that grows a
// little with the width (--tp-pad, 32px at 1280 to 56px at 2560), the header's logo and Sign out
// on the same edges. From 1280px three columns: the menu (240px at 1280 to 400px at 2560), the
// sections (a reading column of about 500px at 1280, 570 at 1440, 780 at 1920 and 1060 at 2560,
// its field grids two columns wide) and the strength panel with the apply box, which takes the rest
// (about 410px at 1280 to 860px at 2560); between 1024 and 1279 that panel heads the middle column.
export const ProfileLayoutStyles = () => (
  <style jsx global>{`
    /* A sticky box never sticks inside a box that is overflow-x hidden (components/ui.js sets it on
       the page's own boxes); clip holds the same sideways edge without making a scroll box. */
    :root:has([data-tp-shell]) body, #__next:has([data-tp-shell]), :has(> [data-tp-shell]) { overflow-x: clip !important; }
    .tp { --tp-pad: var(--s-4); }
    .tp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .tp-header { padding-left: var(--tp-pad); padding-right: var(--tp-pad); }
    .tp-grid { padding: var(--gap-card) var(--s-4) var(--s-7); max-width: 760px; margin: 0 auto; }
    .tp-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-section); min-width: 0; }
    .tp-group { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); min-width: 0; }
    .tp-menu, .tp-aside { display: none; }
    .tp-phone-only { display: block; }
    /* Prose keeps a reading measure however wide its card grows. */
    .tp .mp-p, .tp .mp-note { max-width: 68ch; }

    /* The state of a section: one colour each, the same on the menu, the chips and the headings. */
    .tp-mark { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; box-sizing: border-box; }
    .tp-mark[data-state='done'] { background: ${C.done}; }
    .tp-mark[data-state='started'] { border: 1.5px solid ${C.ink}; background: linear-gradient(90deg, ${C.ink} 50%, transparent 50%); }
    .tp-mark[data-state='empty'] { border: 1.5px dashed ${C.inkMute}; }
    .tp-tag { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 10px 0 6px; border-radius: 999px; font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; flex-shrink: 0; }
    .tp-tag[data-state='done'] { color: ${C.done}; background: ${C.doneTint}; }
    .tp-tag[data-state='started'] { color: ${C.ink}; background: ${C.paperDeep}; }
    .tp-tag[data-state='empty'] { color: ${C.inkMute}; background: transparent; box-shadow: inset 0 0 0 1px ${C.rule}; }

    /* The phone's top: the strength bar and the section chips, stuck under the window's top. */
    .tp-top { position: sticky; top: 0; z-index: 30; background: ${C.paper}; border-bottom: 1px solid var(--rule); }
    /* Anything scrolled to (a section from the menu, a focused field) stops under the phone's bar and
       chips: one scroll padding on the page, no margin of the sections' own on top of it. */
    :root:has([data-tp-shell]) { scroll-padding-top: var(--tp-top-pad, 112px); }
    .tp-chips-row { list-style: none; margin: 0; padding: 0 var(--s-4) var(--s-2); display: flex; gap: var(--s-2); overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
    .tp-chips-row::-webkit-scrollbar { display: none; }
    .tp-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px 0 10px; border-radius: 999px; border: 1px solid var(--rule); background: ${C.card}; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 600; white-space: nowrap; text-decoration: none; }
    .tp-chip[aria-current] { border-color: ${C.ink}; color: ${C.ink}; font-weight: 700; }
    .tp-chip:focus-visible, .tp-menu-item:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }

    @media (min-width: 1024px) {
      .tp { --tp-pad: clamp(24px, calc(8px + 1.875vw), 56px); --tp-gap: clamp(24px, 2.5vw, 64px); --tp-menu: clamp(240px, calc(14vw + 40px), 400px); }
      :root:has([data-tp-shell]) { --tp-top-pad: var(--s-4); }
      .tp-top, .tp-phone-only { display: none !important; }
      .tp-grid { max-width: none; margin: 0; padding: var(--s-5) var(--tp-pad) var(--s-7); display: grid; column-gap: var(--tp-gap); row-gap: var(--gap-section);
        grid-template-columns: var(--tp-menu) minmax(0, 1fr); grid-template-areas: 'menu aside' 'menu main'; align-items: start; }
      .tp-menu { display: block; grid-area: menu; position: sticky; top: var(--s-4); max-height: calc(100vh - 2 * var(--s-4)); max-height: calc(100dvh - 2 * var(--s-4)); overflow-y: auto; }
      .tp-aside { display: grid; grid-area: aside; gap: var(--s-3); min-width: 0; container-type: inline-size; }
      .tp-main { grid-area: main; }
      .tp-menu-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-1); }
      .tp-menu-item { display: flex; align-items: center; gap: var(--s-3); min-height: 44px; padding: 0 var(--s-3); border-radius: var(--btn-radius); border: 1px solid transparent; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 600; line-height: 1.3; text-decoration: none; }
      .tp-menu-label { min-width: 0; white-space: nowrap; }
      .tp-menu-item[aria-current] { background: ${C.card}; border-color: ${C.rule}; color: ${C.ink}; font-weight: 700; }
      /* The reading column's cards grow with the window; their buttons and fields do not: a button
         is as wide as its words, a field stops at 720px. */
      .tp-main .mp-btn { width: auto; justify-self: start; padding: 0 var(--s-5); }
      .tp-main .mp-actions .mp-btn { flex: 0 0 auto; }
      .tp-main .mp-input { max-width: 720px; }
    }
    @media (min-width: 1024px) and (hover: hover) { .tp-menu-item:hover { background: rgba(15, 15, 16, 0.045); color: ${C.ink}; } .tp-menu-item[aria-current]:hover { background: ${C.card}; } }
    @media (min-width: 1280px) {
      .tp { --tp-main: clamp(500px, calc(44vw - 63px), 1120px); }
      .tp-grid { grid-template-columns: var(--tp-menu) minmax(0, var(--tp-main)) minmax(300px, 1fr); grid-template-areas: 'menu main aside'; }
      .tp-aside { position: sticky; top: var(--s-4); max-height: calc(100vh - 2 * var(--s-4)); max-height: calc(100dvh - 2 * var(--s-4)); overflow-y: auto; overscroll-behavior: contain; }
    }
    @media ${MOTION_QUERY} {
      .tp-bump { animation: tp-bump ${DURATION.base}ms ${CURVE.enter} both; }
      @keyframes tp-bump { from { transform: translateY(6px); opacity: 0.35; } to { transform: none; opacity: 1; } }
    }
  `}</style>
);
