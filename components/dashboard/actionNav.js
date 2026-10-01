// components/dashboard/actionNav.js
// Where an action item goes. Every item deep links to its listing page
// (?applicant={linkId}&panel=checklist|documents|report, lib/actions.js actionHref). When that
// listing page is the one already open, the page handles it in place through the go event
// (components/dashboard/ListingView.js listens); otherwise the router takes the realtor there with
// no reload (components/nav/routes.js go).
import { actionHref } from '../../lib/actions.js';
import { go } from '../nav/routes';

export const GO_EVENT = 'rl:assistant-go';

export function navigateToAction(item, paths) {
  if (typeof window === 'undefined' || !item) return;
  if (item.panel === 'people') { go(actionHref(item, paths)); return; } // lib/actions.js: the Pipeline card on the dashboard
  if (item.listingId && window.__rlListingId === item.listingId) {
    window.dispatchEvent(new CustomEvent(GO_EVENT, { detail: { linkId: item.linkId || null, panel: item.panel } }));
    return;
  }
  go(actionHref(item, paths));
}
