// components/dashboard/CommandMenu.js
// The command menu of the realtor's shell (components/dashboard/DashShell.js): opened from the search
// bar at 1024 and wider, the round search button under it, and Command K (Control K off a Mac),
// the one global key the shell binds. Type to find a listing by its address or unit, or an
// applicant by name, and jump to it; or run an action: New listing, Pipeline, Circle, Shared with
// you, Profile, Archived listings. The arrow keys move through the results, Enter runs the one
// marked, Escape closes; the focus stays in the menu while it is open (its field is its one stop)
// and goes back to what opened it. In the browser alone, on what is already loaded
// (components/dashboard/commandSearch.js). It is the one sheet (components/Sheet.js), as every
// modal on the realtor side is: the page dims behind it, Escape and a tap outside close it, and the
// focus goes back to what opened it. At 1024 and wider it opens near the top centre of the window,
// a search box with its results under it (desktop="top"); under 1024 it rises from the bottom.
import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import Sheet from '../Sheet';
import { Icon } from '../ui';
import { commandResults } from './commandSearch';

const GROUPS = [['listing', 'Listings'], ['applicant', 'Applicants'], ['action', 'Actions']];
const ICON = { listing: 'home', applicant: 'user', action: 'arrow' };
const ACTION_ICON = { new: 'plus', pipeline: 'list', circle: 'users', shared: 'user', profile: 'user', archived: 'grid' };

export default function CommandMenu({ open, onClose, onRun, listings = [], applicantsByListing = {}, canArchive = false }) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const results = useMemo(() => (open ? commandResults({ query, listings, applicantsByListing, canArchive }) : []), [open, query, listings, applicantsByListing, canArchive]);
  // Each opening starts empty, on the first result, and the field takes the focus a frame after the
  // sheet has noted what had it, so Escape gives the focus back to what opened the menu.
  useEffect(() => {
    if (!open) return undefined;
    setQuery(''); setAt(0);
    let n = 0; let raf = 0;
    const tick = () => { const el = document.querySelector('[data-command-input]'); if (el) el.focus({ preventScroll: true }); else if (n++ < 20) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => { setAt(0); }, [query]);
  // The marked result stays in view as the arrows move through a long list.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`cm-opt-${at}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [at, open]);
  const run = (r) => { if (!r) return; onClose(); onRun(r); };
  const keys = (e) => {
    // The focus stays in the menu: the field is its one stop. Escape is the sheet's.
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => (results.length ? (n + 1) % results.length : 0)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => (results.length ? (n - 1 + results.length) % results.length : 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); run(results[at]); }
  };
  return (
    <Sheet open={open} onClose={onClose} label="Search listings, tenants or actions" maxWidth={640} desktop="top">
      <div className="cm" data-command-menu="" onKeyDown={keys}>
        <div className="cm-field" data-sheet-drag="">
          <span className="cm-field-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
          <input type="text" className="cm-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listings, tenants or actions"
            role="combobox" aria-expanded="true" aria-controls="cm-list" aria-autocomplete="list" aria-label="Search listings, tenants or actions" aria-activedescendant={results.length ? `cm-opt-${at}` : undefined}
            autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" data-command-input="" />
          <kbd className="cm-esc" aria-hidden="true">esc</kbd>
        </div>
        <div className="cm-list" id="cm-list" role="listbox" aria-label="Results">
          {results.length === 0 ? <p className="cm-none" role="status" data-command-none="">Nothing found.</p> : null}
          {GROUPS.map(([kind, title]) => {
            const mine = results.filter((r) => r.kind === kind);
            if (!mine.length) return null;
            return (
              <div key={kind} role="group" aria-label={title} className="cm-group">
                <div className="cm-group-t" aria-hidden="true">{title}</div>
                {mine.map((r) => {
                  const idx = results.indexOf(r); const on = idx === at;
                  return (
                    <div key={r.id} id={`cm-opt-${idx}`} role="option" aria-selected={on ? 'true' : 'false'} className={`cm-opt${on ? ' cm-on' : ''}`} data-command-result={r.id}
                      onMouseMove={() => { if (at !== idx) setAt(idx); }} onMouseDown={(e) => e.preventDefault()} onClick={() => run(r)}>
                      <span className="cm-opt-icon" aria-hidden="true"><Icon name={r.kind === 'action' ? (ACTION_ICON[r.action] || 'arrow') : ICON[r.kind]} size={16} /></span>
                      <span className="cm-opt-text"><span className="cm-opt-label">{r.label}</span>{r.detail ? <span className="cm-opt-detail">{r.detail}</span> : null}</span>
                      {on ? <span className="cm-enter" aria-hidden="true">↵</span> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        /* One height whatever is found, so the sheet does not jump as the realtor types. */
        .cm { display: flex; flex-direction: column; height: min(520px, calc(100dvh - 120px)); }
        .cm-field { flex: none; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-1) var(--s-4) 0 var(--s-5); min-height: 60px; border-bottom: 1px solid ${C.rule}; color: ${C.inkSoft}; }
        .cm-field-icon { display: inline-flex; }
        .cm-input { flex: 1 1 auto; min-width: 0; min-height: 52px; border: none; background: transparent; color: ${C.ink}; font-family: inherit; font-size: 17px; outline: none; border-radius: 0; padding: 0; }
        .cm-input::placeholder { color: ${C.inkSoft}; }
        /* The field is the menu's: its caret and the sheet show the focus, not the fields' ring. */
        .cm-input:focus, .cm-input:focus-visible { outline: none !important; box-shadow: none !important; border: none !important; }
        .cm-esc { flex-shrink: 0; font-family: inherit; font-size: 12px; font-weight: 600; color: ${C.inkSoft}; border: 1px solid ${C.ruleDark}; border-radius: 6px; padding: 2px 6px; }
        .cm-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--s-2) var(--s-2) var(--s-4); }
        .cm-none { margin: 0; padding: var(--s-4); font-size: var(--t-body-2); color: ${C.inkSoft}; }
        .cm-group + .cm-group { margin-top: var(--s-2); }
        .cm-group-t { padding: var(--s-2) var(--s-3) var(--s-1); font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkSoft}; }
        .cm-opt { display: flex; align-items: center; gap: var(--s-3); min-height: 48px; padding: var(--s-2) var(--s-3); border-radius: 14px; cursor: pointer; color: ${C.ink}; }
        .cm-on { background: ${C.ink}; color: ${C.paper}; }
        .cm-opt-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: ${C.paperDeep}; color: ${C.ink}; }
        .cm-on .cm-opt-icon { background: rgba(250, 248, 243, 0.14); color: ${C.paper}; }
        .cm-opt-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
        .cm-opt-label { font-size: var(--t-body-2); font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
        .cm-opt-detail { font-size: 13px; color: ${C.inkSoft}; line-height: 1.3; overflow-wrap: anywhere; }
        .cm-on .cm-opt-detail { color: ${C.inkInverse}; }
        .cm-enter { flex-shrink: 0; font-size: 14px; color: ${C.inkInverse}; }
        @media (max-width: 1023.98px) { .cm-esc { display: none; } }
      `}</style>
    </Sheet>
  );
}
