// components/dashboard/DashShell.js
// The realtor app's frame. Under 1024px it is the header as it always was (components/dashboard/
// DashboardHeader.js) with the Listings and Circle tabs, and the screen below it. At 1024 and wider
// it is a desktop app that fills the window at every width: a full height sidebar of 240px against
// the window's left edge with the logo, the New listing button and the five places (Listings,
// Pipeline, Circle, Shared with you, Profile, the current one marked), and the main area filling
// everything to its right, with even side padding that grows a little with the width (--ds-pad:
// about 32px at 1280, 56px at 2560) and the bell and the avatar at the window's top right. A view
// may hand the header row a lead (the dashboard's greeting), set at its left, in line with them.
// A reading column or a form (className ds-col: a listing, Circle, Profile) keeps its own width,
// set against the main area's left padding rather than in the middle of the window.
// Listings, Pipeline and Shared with you are views of the dashboard (?view=pipeline, ?view=shared):
// between them the address changes in place (components/nav/routes.js goView) with no data request
// and no transition. Circle and Profile are their own screens. Both layouts are in the markup and
// the width picks one in CSS, so the server's HTML is the first paint at any width. The main column
// comes first in the page and the grid sets the sidebar to its left: on a phone the header's
// wordmark is the first in the page, as it always was.
// locked (the soft paywall): the sidebar keeps only the logo, as the header does today.
// newPrimary: whether New listing is the one red action of this view. A view with a red action of
// its own (a listing) passes false and the button is outlined.
import { C } from '../theme';
import { Wordmark, Icon } from '../ui';
import DashboardHeader from './DashboardHeader';
import { useCirclePending, CIRCLE_PATH } from './MainNav';
import { logoProps } from './logoNav';
import { useAdapter } from '../../lib/dashboardAdapter';
import { go, goView, linkProps, routeOf } from '../nav/routes';

export const HOME_VIEWS = ['listings', 'pipeline', 'shared'];
export const viewHref = (home, view) => (view === 'listings' ? home : `${home}${home.includes('?') ? '&' : '?'}view=${view}`);
export const viewOf = (query) => { const v = query && typeof query.view === 'string' ? query.view : ''; return HOME_VIEWS.includes(v) ? v : 'listings'; };
const onDashboard = () => { const r = routeOf(window.location.pathname + window.location.search); return !!r && (r.kind === 'dashboard' || (r.kind === 'demo' && r.demo === 'dashboard')); };
const plainClick = (e) => !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

export default function DashShell({ profile, signals = null, onAssistantAction, nav = null, current = null, locked = false, onNewListing = null, newPrimary = true, newRef = null, lead = null, children }) {
  const adapter = useAdapter();
  const home = adapter.paths.home;
  const pending = useCirclePending();
  const places = [
    ['listings', home, 'Listings'],
    ['pipeline', viewHref(home, 'pipeline'), 'Pipeline'],
    ['circle', adapter.paths.circle || CIRCLE_PATH, 'Circle'],
    ['shared', viewHref(home, 'shared'), 'Shared with you'],
    ['profile', adapter.paths.profile, 'Profile'],
  ];
  const placeProps = (key, href) => ({
    ...linkProps(href, { back: key === 'listings' }),
    onClick: (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      // A view of the dashboard while on the dashboard: in place.
      if (HOME_VIEWS.includes(key) && onDashboard()) { if (current !== key) goView(href); return; }
      go(href, { back: key === 'listings' });
    },
  });
  const newListing = (e) => { if (onNewListing) onNewListing(e); else go(`${home}${home.includes('?') ? '&' : '?'}new=1`); };
  return (
    <div className="ds" data-shell="">
      <div className="ds-main">
        <DashboardHeader profile={profile} signals={signals} onAssistantAction={onAssistantAction} nav={nav} lead={lead} />
        {children}
      </div>
      <aside className="ds-side" data-shell-side="">
        {/* The same 44px wordmark link as the header's (.rl-mark); on a phone it is hidden with the
            sidebar and the header's is the one on screen. */}
        <a {...logoProps(home)} aria-label="Rentletter dashboard" className="rl-mark ds-logo"><Wordmark /></a>
        {!locked && (
          <button ref={newRef} type="button" onClick={newListing} className={`ds-btn ${newPrimary ? 'ds-btn-primary' : 'ds-btn-line'}`} data-shell-new="">
            <Icon name="plus" size={16} /> New listing
          </button>
        )}
        {!locked && (
          <nav aria-label="Main" className="ds-nav" data-shell-nav="">
            {places.map(([key, href, label]) => (
              <a key={key} {...placeProps(key, href)} className="ds-place" aria-current={current === key ? 'page' : undefined} data-shell-place={key}>
                <span>{label}</span>
                {key === 'circle' && pending > 0 ? <span className="ds-num" aria-label={`${pending} waiting`}>{pending > 99 ? '99+' : pending}</span> : null}
              </a>
            ))}
          </nav>
        )}
      </aside>
      <style jsx>{`
        .ds-side { display: none; }
        .ds-main { min-width: 0; }
        @media (min-width: 1024px) {
          /* The whole window: the sidebar from its left edge, the main area to its right edge. */
          .ds { --ds-pad: clamp(24px, calc(8px + 1.875vw), 56px); display: grid; grid-template-columns: 240px minmax(0, 1fr); grid-template-areas: 'side main'; align-items: start; width: 100%; min-height: 100vh; min-height: 100dvh; }
          .ds-main { grid-area: main; }
          .ds-side { grid-area: side; display: flex; flex-direction: column; gap: var(--s-5); position: sticky; top: 0; height: 100vh; height: 100dvh; overflow-y: auto; padding: var(--s-5) var(--s-4); background: ${C.paperDeep}; border-right: 1px solid ${C.rule}; }
          .ds-logo { align-self: flex-start; display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--s-2); text-decoration: none; color: inherit; }
          .ds-nav { display: flex; flex-direction: column; gap: var(--s-1); }
          .ds-place { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); min-height: 44px; padding: 0 var(--s-3); border-radius: var(--btn-radius); border: 1px solid transparent; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 600; text-decoration: none; white-space: nowrap; }
          .ds-place[aria-current='page'] { background: ${C.card}; border-color: ${C.rule}; color: ${C.ink}; font-weight: 700; }
          .ds-place:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paperDeep}, 0 0 0 4px ${C.ink}; }
          .ds-num { font-variant-numeric: tabular-nums; font-weight: 700; color: ${C.ink}; }
          /* The header in the main area: no wordmark (the sidebar has it), the bell and the avatar at
             the window's top right, across the main area's whole width, its sides the main area's
             padding. A lead sits at its left, in line with them. */
          .ds-main :global(.rl-hdr-mark) { display: none; }
          .ds-main :global(.rl-header-inner) { max-width: none !important; justify-content: flex-end; padding: var(--s-4) var(--ds-pad); }
          .ds-main :global(.rl-header.rl-shrink .rl-header-inner) { padding: var(--s-4) var(--ds-pad); }
          .ds-main :global(.rl-hdr-lead) { display: flex; align-items: center; min-width: 0; min-height: 44px; margin-right: auto; }
          /* A reading column or a form: its own width, against the main area's left padding. */
          .ds-main :global(.ds-col) { box-sizing: content-box !important; max-width: var(--ds-col, 688px) !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: var(--ds-pad) !important; padding-right: var(--ds-pad) !important; }
        }
        /* The sidebar stays on screen as the page scrolls. The page's own boxes (body, the Next root,
           the view's wrapper) are overflow-x hidden, which makes each a scroll box of its own that
           never scrolls, and a sticky box inside one never sticks; clip holds the same sideways
           edge without making a scroll box. Only where the shell is, and only at this width. */
        @media (min-width: 1024px) {
          :global(body:has([data-shell])), :global(#__next:has([data-shell])), :global(:has(> [data-shell])) { overflow-x: clip !important; }
        }
        @media (min-width: 1024px) and (hover: hover) { .ds-place:hover { background: rgba(15, 15, 16, 0.045); color: ${C.ink}; } .ds-place[aria-current='page']:hover { background: ${C.card}; } }
        /* The buttons of the dashboard: one height, one radius, one padding. Global, so a sheet the
           dashboard opens (components/Sheet.js renders on the body) carries the same buttons. */
        :global(.ds-btn) { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body-2); font-weight: 700; line-height: 1.2; text-decoration: none; cursor: pointer; white-space: nowrap; }
        :global(.ds-btn-primary) { background: ${C.red}; color: ${C.paper}; border: 1px solid ${C.red}; }
        :global(.ds-btn-line) { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; }
        :global(.ds-btn-quiet) { background: transparent; color: ${C.ink}; border: 1px solid transparent; }
        :global(.ds-btn:disabled) { opacity: 0.55; cursor: default; }
        :global(.ds-btn:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) {
          :global(.ds-btn-line:hover) { border-color: ${C.ink}; }
          :global(.ds-btn-quiet:hover) { background: rgba(15, 15, 16, 0.045); }
        }
      `}</style>
    </div>
  );
}
