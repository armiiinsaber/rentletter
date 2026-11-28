// components/nav/RouteLoader.js
// What a realtor screen shows between the tap and its page (components/nav/RouteFrame.js), never a
// half drawn screen:
//   a screen seen recently: not here, the frame draws that page itself, at once, from what it
//   showed (components/nav/routes.js seenScreenView), while the server confirms the session and
//   sends the page, which then takes over the same screen and refreshes it in the background;
//   any other: the header and the way back where the screen has them, and below them the door
//   Loader in the middle of the paper (components/brand/Loader.js ScreenLoader), the bottom safe
//   area kept, so nothing moves when the screen appears;
//   after an edge swipe back: the picture of the screen as it was left (components/nav/EdgeBack.js).
// The way back is live while it waits: "All listings" and "Dashboard" work before the page lands.
// Never permanent: useLoadWatch retries a load that has not landed after 4 seconds, once, and then
// LoadFailed takes the Loader's place with a pill that loads it again.
import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { C } from '../theme';
import { GlobalStyle, Icon } from '../ui';
import BoardSkeleton from '../dashboard/BoardSkeleton';
import DashShell from '../dashboard/DashShell';
import { seenListing, seenProfile, linkProps, placeOf } from './routes';
import { Snapshot } from './EdgeBack';
import { ScreenLoader } from '../brand/Loader';
import { displayLabel } from '../../lib/listingAddress';

// ── Never permanent ─────────────────────────────────────────────────────────────────────────
export const LOAD_WAIT = 4000;
// waiting: the screen is waiting on its data. retry(): load it again with a live request. Four
// seconds in, the load runs once more by itself; four seconds after that, failed is true and the
// screen shows LoadFailed in the Loader's place. again() is the pill: load again, watch again.
export function useLoadWatch(waiting, retry) {
  const retryRef = useRef(retry); retryRef.current = retry;
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!waiting) { setFailed(false); return undefined; }
    let second = 0;
    const first = setTimeout(() => { retryRef.current(); second = setTimeout(() => setFailed(true), LOAD_WAIT); }, LOAD_WAIT);
    return () => { clearTimeout(first); clearTimeout(second); };
  }, [waiting, round]);
  const again = useCallback(() => { setFailed(false); retryRef.current(); setRound((n) => n + 1); }, []);
  return { failed: !!waiting && failed, again };
}
// One calm line and a pill, in the Loader's place when a load did not land. The pill loads the data
// again, never the whole app.
export function LoadFailed({ onRetry, style }) {
  return (
    <div data-load-failed="" role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-2) var(--s-3)', padding: 'var(--s-3) 0', ...style }}>
      <p style={{ margin: 0, fontSize: 'var(--t-body)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>Couldn’t load this.</p>
      <button type="button" onClick={onRetry} style={{ minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
    </div>
  );
}

// The frame each screen has: the realtor's shell (components/dashboard/DashShell.js), so under
// 1024px the header and the tabs and from 1024px the sidebar with the place on its way marked and
// the header controls, exactly where the screen draws them; then the page's own width and paddings.
const Page = ({ maxWidth, padding, children, label, waiting = true, nav = null, place = null, fill = false }) => (
  <>
    <GlobalStyle />
    <style>{'@media (min-width: 1024px) { .rl-ld-narrow { display: none !important; } }'}</style>
    <div style={{ minHeight: '100dvh', background: 'var(--paper)', overflowX: 'clip' }} data-route-loading={waiting ? label : undefined}>
      <DashShell profile={seenProfile() || {}} nav={nav} current={place}>
        <div className={fill ? 'ds-fill' : undefined} style={{ maxWidth, margin: '0 auto', padding }}>{children}</div>
      </DashShell>
    </div>
  </>
);
// The way back, where the screen has it, exactly as the screen draws it (components/dashboard/
// ListingView.js, ProfileView.js), so it does not move when the screen appears.
// From 1024px a screen whose way back is the sidebar's (the profile) draws none, so neither does this.
const Back = ({ label, tight = false, wide = true }) => (
  <a {...linkProps('/dashboard', { back: true })} className={wide ? undefined : 'rl-ld-narrow'} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', minHeight: tight ? undefined : 44, fontSize: 'var(--t-body-2)', color: C.inkSoft, textDecoration: 'none', marginBottom: tight ? 'var(--s-4)' : undefined }}>
    <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> {label}
  </a>
);
// The address a tap on a listing carries (components/dashboard/ListingCard.js): drawn as the listing's
// title, where the listing page draws it (components/dashboard/ListingView.js, its header card, with
// room kept for Edit and Duplicate so it wraps the same), from the moment of the tap until the page
// lands and while its applicants load; the page's own title then takes its place.
const ghost = { minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, visibility: 'hidden' };
export function CarriedTitle({ listing }) {
  if (!listing) return null;
  return (
    <div className="rl-card" data-carried-title="" style={{ padding: 'var(--card-pad)', minWidth: 0, marginBottom: 'var(--s-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <h1 className="t-d1" style={{ color: C.ink, overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 220px', textWrap: 'balance', margin: 0 }}>{displayLabel(listing, 'Untitled listing')}</h1>
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 'var(--s-2)', flexShrink: 0, marginTop: -6 }}>
          <span style={{ ...ghost, display: 'inline-flex', alignItems: 'center' }}>Edit</span>
          <span style={{ ...ghost, display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.ruleDark}` }}>Duplicate</span>
        </span>
      </div>
    </div>
  );
}

// Each screen's frame: its width, its paddings, its way back.
const FRAMES = {
  listing: { maxWidth: 760, padding: 'var(--s-4) clamp(16px, 4vw, 32px) 0', back: 'All listings', label: 'Loading the listing' },
  dashboard: { maxWidth: 'none', padding: 'var(--s-2) var(--page-gutter) 0', back: null, label: 'Loading your workspace', fill: true },
  profile: { maxWidth: 720, padding: 'var(--gap-section) var(--s-4) 0', back: null, label: 'Loading your profile' },
  circle: { maxWidth: 720, padding: 'var(--s-2) var(--s-4) 0', back: null, label: 'Loading your circle' },
  page: { maxWidth: 720, padding: 'var(--gap-section) var(--s-4) 0', back: 'Dashboard', label: 'Loading' },
};
const titleOf = (route) => {
  if (route.kind === 'listing') { const l = seenListing(route.listingId); return l ? `${displayLabel(l, 'Listing')} · Rentletter` : 'Listing · Rentletter'; }
  if (route.kind === 'dashboard') return 'Realtor Dashboard · Rentletter';
  if (route.kind === 'profile') return 'Profile · Rentletter';
  if (route.kind === 'circle') return 'Circle · Rentletter';
  return 'Rentletter';
};

export default function RouteLoader({ route, onRetry }) {
  // An edge swipe's picture of the screen, until the screen itself arrives (components/nav/RouteFrame.js).
  if (route.shot && !route.failed) return <Snapshot shot={route.shot} />;
  const f = FRAMES[route.kind] || FRAMES.page;
  return (
    <Page label={route.failed ? 'failed' : route.kind} waiting={!route.failed} maxWidth={f.maxWidth} padding={f.padding} fill={!!f.fill} nav={route.kind === 'dashboard' ? 'listings' : route.kind === 'circle' ? 'circle' : route.kind === 'profile' ? 'profile' : null} place={placeOf(route.url || route.path)}>
      <Head><title>{titleOf(route)}</title></Head>
      {f.back ? <Back label={f.back} tight={route.kind === 'listing'} wide={route.kind === 'listing'} /> : null}
      {route.kind === 'listing' && !route.failed ? <CarriedTitle listing={seenListing(route.listingId)} /> : null}
      {route.failed ? <LoadFailed onRetry={onRetry} /> : route.kind === 'dashboard' ? <BoardSkeleton label={f.label} /> : <ScreenLoader label={f.label} />}
    </Page>
  );
}
