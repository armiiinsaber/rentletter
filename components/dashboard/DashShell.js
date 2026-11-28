// components/dashboard/DashShell.js
// The realtor app's frame, on every realtor screen (the dashboard, a listing, Circle, Profile).
// Behind everything: the paper, with two very soft, large colour fields (a faint red glow near the
// top centre, a faint warm sand glow at the bottom left), so the glass has something to blur.
// Decorative, aria-hidden, fixed to the window.
// AT 1024 AND WIDER: a floating glass sidebar, inset 16px from the window's edges, 232px wide, 28px
// corners, the window's full height less the insets, staying on screen as the page scrolls. Inside,
// top to bottom: the wordmark, the red New listing button, the places (Listings with its count,
// Pipeline, Circle with a small red dot while a request waits, Shared with you, Profile; the one on
// view a dark filled pill), and at the bottom the realtor's avatar, name and brokerage. The main
// area fills everything to its right, with even side padding that grows a little with the width
// (--ds-pad). At its top, floating as the page scrolls under them, the search bar (a glass pill
// about 520px wide that opens the command menu, components/dashboard/CommandMenu.js, with its
// Command K hint) and the bell, a round glass button at the right (components/dashboard/
// DashboardHeader.js). A reading column (className ds-col: a listing under 1280) keeps its own width
// against the main area's left padding; a column centred in the main area (ds-mid: the paywall)
// keeps its own width with even margins; a view laid out in columns of its own (ds-fill: Circle,
// Profile) takes the main area's whole width inside the same padding.
// UNDER 1024: the header (the wordmark, and round glass search and bell buttons) and the screen
// under it, and on the main places a floating glass tab bar at the bottom (components/dashboard/
// MainNav.js): Listings, Pipeline, the red New listing, Circle, Profile.
// Listings, Pipeline and Shared with you are views of the dashboard (?view=pipeline, ?view=shared):
// between them the address changes in place (components/nav/routes.js goView) with no data request
// and no transition. Circle and Profile are their own screens. Both layouts are in the markup and
// the width picks one in CSS, so the server's HTML is the first paint at any width. The main column
// comes first in the page and the grid sets the sidebar to its left: on a phone the header's
// wordmark is the first in the page, as it always was.
// Command K (Control K off a Mac) opens the command menu on every realtor screen: the one global key
// the shell binds.
// locked (the soft paywall): the sidebar keeps only the logo, as the header does today.
// newPrimary: whether New listing is the one red action of this view. A view with a red action of
// its own (a listing) passes false and the button is outlined.
// listingsCount: the sidebar's Listings count, from the dashboard's board (components/dashboard/
// board.js, the one source of every count); kept for the other screens as last counted.
import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import { Wordmark, Icon } from '../ui';
import DashboardHeader, { initialsOf } from './DashboardHeader';
import MainNav, { useCirclePending, CIRCLE_PATH, TAB_ROOM, TAB_H, TAB_INSET } from './MainNav';
import CommandMenu from './CommandMenu';
import { logoProps } from './logoNav';
import { actionHref } from '../../lib/actions.js';
import { useAdapter } from '../../lib/dashboardAdapter';
import { go, goView, linkProps, routeOf, isHere, placeOf, useHeading, seenSignals, seenListings } from '../nav/routes';
import NewListingPanel from '../listings/NewListingPanel';

export const HOME_VIEWS = ['listings', 'pipeline', 'shared'];
export const viewHref = (home, view) => (view === 'listings' ? home : `${home}${home.includes('?') ? '&' : '?'}view=${view}`);
export const viewOf = (query) => { const v = query && typeof query.view === 'string' ? query.view : ''; return HOME_VIEWS.includes(v) ? v : 'listings'; };
const onDashboard = () => { const r = routeOf(window.location.pathname + window.location.search); return !!r && (r.kind === 'dashboard' || (r.kind === 'demo' && r.demo === 'dashboard')); };
const plainClick = (e) => !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
// The Archived shelf, asked for from the command menu: the dashboard listens while it is open, and
// reads ?shelf=archived when it opens (components/dashboard/HomeView.js).
export const SHELF_EVENT = 'rl:shelf';
// The sidebar's Listings count as last counted on the dashboard, for the other screens.
let countHeld = null;

export default function DashShell({ profile, signals = null, onAssistantAction, nav = null, current: onView = null, locked = false, onNewListing = null, newPrimary = true, newRef = null, listingsCount = null, lead = null, children }) {
  const adapter = useAdapter();
  const home = adapter.paths.home;
  const pending = useCirclePending();
  // The place marked: the one tapped, from the moment it is tapped (components/nav/RouteFrame.js
  // marks it while the screen before is still on view), else the one on view.
  const heading = useHeading();
  const current = (heading && placeOf(heading)) || onView;
  // Held in this browser only: a server never keeps one realtor's count for the next page it draws.
  // A screen without its own shows the held one once mounted, so the server's HTML and the first
  // render agree.
  if (listingsCount != null && typeof window !== 'undefined') countHeld = listingsCount;
  const [held, setHeld] = useState(null);
  useEffect(() => { if (listingsCount == null) setHeld(countHeld); }, [listingsCount]);
  const count = listingsCount != null ? listingsCount : held;
  // New listing over this view, where the view has no form of its own (Circle, Profile, a listing):
  // the panel opens here and nothing behind it moves (components/listings/NewListingPanel.js).
  const [newOpen, setNewOpen] = useState(false);
  const [newError, setNewError] = useState('');
  const places = [
    ['listings', home, 'Listings', 'home'],
    ['pipeline', viewHref(home, 'pipeline'), 'Pipeline', 'list'],
    ['circle', adapter.paths.circle || CIRCLE_PATH, 'Circle', 'users'],
    ['shared', viewHref(home, 'shared'), 'Shared with you', 'user'],
    ['profile', adapter.paths.profile, 'Profile', 'user'],
  ];
  const placeProps = (key, href) => ({
    ...linkProps(href, { back: key === 'listings' }),
    onClick: (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      // The place already on view: nothing at all, no route, no reload, no scroll.
      if (isHere(href)) return;
      // A view of the dashboard while on the dashboard: in place.
      if (HOME_VIEWS.includes(key) && onDashboard()) { if (current !== key) goView(href); return; }
      go(href, { back: key === 'listings' });
    },
  });
  const newListing = (e) => { if (onNewListing) onNewListing(e); else { setNewError(''); setNewOpen(true); } };

  // ── The command menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (locked) return undefined;
    const key = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) { e.preventDefault(); setMenuOpen((v) => !v); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [locked]);
  // What the menu finds: the signals and listings the screen has, else those seen this session.
  const found = useMemo(() => {
    if (!menuOpen) return { listings: [], applicantsByListing: {} };
    const s = (signals && signals.loaded ? signals : null) || seenSignals() || {};
    const listings = (signals && Array.isArray(signals.allListings) ? signals.allListings : null) || seenListings();
    return { listings, applicantsByListing: s.applicantsByListing || {} };
  }, [menuOpen, signals]);
  const canArchive = found.listings.some((l) => l && 'archived_at' in l);
  const runCommand = (r) => {
    if (r.kind === 'listing') { go(adapter.paths.listing(r.listingId)); return; }
    if (r.kind === 'applicant') { go(actionHref({ listingId: r.listingId, linkId: r.linkId, panel: 'checklist' }, adapter.paths)); return; }
    const a = r.action;
    if (a === 'new') { newListing(null); return; }
    if (a === 'archived') {
      if (onDashboard()) { if (!isHere(home)) goView(home); window.dispatchEvent(new CustomEvent(SHELF_EVENT, { detail: { to: 'archived' } })); return; }
      go(`${home}${home.includes('?') ? '&' : '?'}shelf=archived`, { back: true }); return;
    }
    const place = places.find(([k]) => k === a);
    if (!place) return;
    const href = place[1];
    if (isHere(href)) return;
    if (HOME_VIEWS.includes(a) && onDashboard()) { goView(href); return; }
    go(href, { back: a === 'listings' });
  };
  const openMenu = () => setMenuOpen(true);
  const name = String((profile && profile.full_name) || '').trim();
  const brokerage = String((profile && profile.brokerage) || '').trim();

  return (
    <div className={`ds${nav && !locked ? ' ds-tabbed' : ''}`} data-shell="">
      <div className="ds-main">
        <DashboardHeader profile={profile} signals={signals} onAssistantAction={onAssistantAction} lead={lead} onSearch={locked ? null : openMenu} avatar={!nav} />
        {newError ? <div role="alert" className="ds-alert">{newError}</div> : null}
        {children}
      </div>
      <aside className="ds-side rl-glass" data-shell-side="" data-stuck="">
        {/* The same 44px wordmark link as the header's (.rl-mark); on a phone it is hidden with the
            sidebar and the header's is the one on screen. */}
        <a {...logoProps(home)} aria-label="Rentletter dashboard" className="rl-mark ds-logo"><Wordmark /></a>
        {!locked && (
          <button ref={newRef} type="button" onClick={newListing} className={`ds-btn ${newPrimary ? 'ds-btn-primary' : 'ds-btn-line'} ds-new`} data-shell-new="">
            <Icon name="plus" size={16} strokeWidth={2} /> New listing
          </button>
        )}
        {!locked && (
          <nav aria-label="Main" className="ds-nav" data-shell-nav="">
            {places.map(([key, href, label, icon]) => (
              <a key={key} {...placeProps(key, href)} className="ds-place" aria-current={current === key ? 'page' : undefined} data-shell-place={key}>
                <span className="ds-place-icon" aria-hidden="true"><Icon name={icon} size={18} strokeWidth={current === key ? 2 : 1.6} /></span>
                <span className="ds-place-label">{label}</span>
                {key === 'listings' && count != null ? <span className="ds-num" data-shell-count="">{count}</span> : null}
                {key === 'circle' && pending > 0 ? <span className="ds-dot" data-shell-dot=""><span className="ds-sr">{`${pending} waiting`}</span></span> : null}
              </a>
            ))}
          </nav>
        )}
        {!locked && (
          /* The first name beside the avatar, one word on one line whatever the name's length (the
             whole name in the label and on hover), and the brokerage under them, the block's width. */
          <a {...linkProps(adapter.paths.profile)} className="ds-me" data-shell-me="" aria-label={`Your profile${name ? `, ${name}` : ''}`} title={name || undefined}>
            <span className="ds-me-avatar" aria-hidden="true">{initialsOf(profile)}</span>
            <span className="ds-me-name">{(name.split(/\s+/)[0]) || 'Your profile'}</span>
            {brokerage ? <span className="ds-me-brok">{brokerage}</span> : null}
          </a>
        )}
      </aside>
      {nav && !locked ? <MainNav current={current} onNew={newListing} /> : null}
      {!locked ? <CommandMenu open={menuOpen} onClose={() => setMenuOpen(false)} onRun={runCommand} listings={found.listings} applicantsByListing={found.applicantsByListing} canArchive={canArchive} /> : null}
      {!onNewListing && !locked ? (
        <NewListingPanel open={newOpen} profile={profile} userId={profile && profile.id} onError={setNewError}
          onClose={() => { setNewOpen(false); const b = [...document.querySelectorAll('[data-shell-new], [data-tab-new]')].find((x) => x.getClientRects().length); if (b) setTimeout(() => b.focus({ preventScroll: true }), 0); }} />
      ) : null}
      <style jsx>{`
        .ds-alert { margin: 0 var(--ds-pad, clamp(16px, 4vw, 32px)) var(--s-3); padding: var(--s-3) var(--s-4); background: ${C.dangerTint}; border-left: 3px solid ${C.danger}; border-radius: var(--btn-radius); font-size: var(--t-body-2); color: ${C.ink}; }
        /* The page's own background at 1024 and wider: the paper (the canvas, components/ui.js) with
           two radial colour fields painted on the shell itself, decorative, behind everything: a
           faint red glow above the top centre, a faint warm sand glow low on the left (the sand
           token), each at the theme's own level (--glow-*, components/ui.js: in dark barely there).
           They scroll with the page, under the glass that floats over it. Neither reaches the page's
           bottom edge, and nothing of the page's own tone does (the sidebar floats 16px clear of
           it), so the page's last row is the plain paper of the canvas and no band shows where the
           window runs past the page.
           Under 1024px there are none: the plain paper. A field that scrolls with the page ends in a
           hard edge wherever the screen runs past the page, and one fixed to the screen cannot be
           seamless in the installed app: the solid top bar cuts the red field with a step at its
           bottom edge, and the page's own boxes would have to be clear to show a field behind them,
           which shows the screen beneath through the page while an edge swipe drags it. */
        .ds { position: relative; }
        @media (min-width: 1024px) {
          .ds {
            background:
              radial-gradient(ellipse 560px 400px at 58% -40px, var(--glow-red), var(--glow-red-soft) 55%, rgba(var(--c-red-rgb), 0) 100%),
              radial-gradient(ellipse 640px 380px at -40px calc(100% - 420px), var(--glow-sand), var(--glow-sand-soft) 55%, rgba(var(--c-sand-rgb), 0) 100%);
            background-repeat: no-repeat; }
        }
        .ds-main { min-width: 0; }
        .ds-side { display: none; }
        /* Under 1024px the page starts under the fixed top bar (components/dashboard/DashboardHeader.js
           --ds-bar-h), and on the main places ends with room for the floating tab bar, its two 16px
           insets, the fade above it and the home indicator (components/dashboard/MainNav.js
           TAB_ROOM): at the end of the page the last card ends where the fade begins. A section
           jumped to clears the top bar by its own scroll margin (calc(var(--ds-bar-h) + 16px)); no
           scroll padding on the root, which would move the page when a closing sheet gives the focus
           back to a control under the bar. */
        @media (max-width: 1023.98px) {
          .ds-main { padding-top: var(--ds-bar-h); padding-bottom: var(--safe-bottom); }
          .ds-tabbed .ds-main { padding-bottom: ${TAB_ROOM}; }
          :global(:root:has(.ds-tabbed)) { --toast-bottom: calc(${TAB_INSET + TAB_H + 12}px + var(--safe-bottom)); }
        }
        .ds-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        @media (min-width: 1024px) {
          /* The whole window: the floating sidebar's column from its left edge, the main area to its right edge. */
          .ds { --ds-pad: clamp(24px, calc(8px + 1.875vw), 56px); --ds-side: 232px; --ds-inset: 16px; display: grid; grid-template-columns: calc(var(--ds-side) + var(--ds-inset)) minmax(0, 1fr); grid-template-areas: 'side main'; align-items: start; width: 100%; min-height: 100vh; min-height: 100dvh; }
          .ds-main { grid-area: main; }
          .ds-side { grid-area: side; position: sticky; z-index: 2; top: var(--ds-inset); margin: var(--ds-inset) 0 var(--ds-inset) var(--ds-inset); width: var(--ds-side); height: calc(100vh - 2 * var(--ds-inset)); height: calc(100dvh - 2 * var(--ds-inset)); display: flex; flex-direction: column; gap: var(--s-4); overflow-y: auto; padding: var(--s-5) var(--s-3) var(--s-3); border-radius: 28px; box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 2px 12px rgba(var(--c-shadow-rgb), 0.07); }
          /* Its shadow fades within the 16px under it, so the page's last row is plain paper. */
          .ds-logo { align-self: flex-start; display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--s-2); text-decoration: none; color: inherit; }
          .ds-side :global(.ds-new) { width: 100%; }
          .ds-nav { display: flex; flex-direction: column; gap: 2px; }
          .ds-place { display: flex; align-items: center; gap: var(--s-3); min-height: 44px; padding: 0 var(--s-3); border-radius: 999px; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 600; text-decoration: none; white-space: nowrap; }
          .ds-place-icon { display: inline-flex; flex-shrink: 0; }
          .ds-place-label { flex: 1 1 auto; min-width: 0; }
          .ds-place[aria-current='page'] { background: ${C.inkFill}; color: ${C.onInk}; font-weight: 700; }
          .ds-place:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
          .ds-num { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; color: inherit; }
          .ds-dot { position: relative; width: 8px; height: 8px; border-radius: 50%; background: ${C.red}; flex-shrink: 0; }
          .ds-place[aria-current='page'] .ds-dot { background: ${C.redOnInk}; }
          .ds-me { margin-top: auto; display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; column-gap: var(--s-3); row-gap: var(--s-1); min-height: 56px; padding: var(--s-2); border-radius: 20px; text-decoration: none; color: ${C.ink}; }
          .ds-me:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
          .ds-me-avatar { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${C.inkFill}; color: ${C.onInk}; font-size: 13px; font-weight: 800; letter-spacing: 0.02em; }
          .ds-me-name { min-width: 0; font-size: var(--t-body-2); font-weight: 700; line-height: 1.3; white-space: nowrap; }
          .ds-me-brok { grid-column: 1 / -1; font-size: 12px; color: ${C.inkSoft}; line-height: 1.35; text-wrap: balance; }
          /* The header in the main area: no wordmark (the sidebar has it); the search bar at its left
             and the bell at the window's top right, floating over the page as it scrolls under them:
             the row itself is clear, only the two controls are glass. */
          .ds-main :global(.rl-hdr-mark) { display: none; }
          .ds-main :global(.rl-header), .ds-main :global(.rl-header.rl-shrink) { position: sticky !important; top: 0; background: transparent !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; box-shadow: none !important; border-bottom-color: transparent !important; pointer-events: none; }
          .ds-main :global(.rl-header-inner), .ds-main :global(.rl-header.rl-shrink .rl-header-inner) { max-width: none !important; justify-content: flex-end; padding: var(--s-4) var(--ds-pad) !important; pointer-events: none; }
          .ds-main :global(.rl-header-inner > *) { pointer-events: auto; }
          .ds-main :global(.rl-hdr-lead) { display: flex; align-items: center; min-width: 0; min-height: 44px; margin-right: auto; }
          /* A reading column or a form: its own width, against the main area's left padding. */
          .ds-main :global(.ds-col) { box-sizing: content-box !important; max-width: var(--ds-col, 688px) !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: var(--ds-pad) !important; padding-right: var(--ds-pad) !important; }
          /* A column of its own width centred in the main area, its margins balanced (the paywall). */
          .ds-main :global(.ds-mid) { box-sizing: content-box !important; max-width: var(--ds-col, 688px) !important; margin-left: auto !important; margin-right: auto !important; padding-left: var(--ds-pad) !important; padding-right: var(--ds-pad) !important; }
          /* A view in columns of its own: the main area's whole width, inside the same padding. */
          .ds-main :global(.ds-fill) { box-sizing: border-box !important; max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: var(--ds-pad) !important; padding-right: var(--ds-pad) !important; }
        }
        /* One page scroll. The page's own boxes (body, the Next root, the view's wrapper) are
           overflow-x hidden (components/ui.js), which makes each a scroll box of its own: a sticky
           box inside one never sticks (the sidebar), and in the installed app on a phone Circle and
           Profile scrolled a box of their own, its scroll indicator in the middle of the screen, so a
           tap on the status bar did not go to the top. Clip holds the same sideways edge without
           making a scroll box, so the page scrolls as the document itself. Where the shell is, at
           every width. */
        :global(body:has([data-shell])), :global(#__next:has([data-shell])), :global(:has(> [data-shell])) { overflow-x: clip !important; }
        @media (min-width: 1024px) and (hover: hover) {
          .ds-place:hover { background: rgba(var(--c-ink-rgb), 0.06); color: ${C.ink}; }
          .ds-place[aria-current='page']:hover { background: ${C.inkFill}; color: ${C.onInk}; }
          .ds-me:hover { background: rgba(var(--c-ink-rgb), 0.05); }
        }
        /* The buttons of the dashboard: one height, one radius, one padding. Global, so a sheet the
           dashboard opens (components/Sheet.js renders on the body) carries the same buttons. */
        :global(.ds-btn) { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body-2); font-weight: 700; line-height: 1.2; text-decoration: none; cursor: pointer; white-space: nowrap; }
        :global(.ds-btn-primary) { background: ${C.redFill}; color: ${C.onRed}; border: 1px solid ${C.redFill}; }
        :global(.ds-btn-line) { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; }
        /* The main button of a group that is not the view's one main action: ink, never red. */
        :global(.ds-btn-ink) { background: ${C.inkFill}; color: ${C.onInk}; border: 1px solid ${C.inkFill}; }
        :global(.ds-btn-quiet) { background: transparent; color: ${C.ink}; border: 1px solid transparent; }
        :global(.ds-btn:disabled) { opacity: 0.55; cursor: default; }
        :global(.ds-btn:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) {
          :global(.ds-btn-line:hover) { border-color: ${C.ink}; }
          :global(.ds-btn-quiet:hover) { background: rgba(var(--c-ink-rgb), 0.045); }
        }
      `}</style>
    </div>
  );
}
