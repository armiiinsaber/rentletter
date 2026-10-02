// components/nav/RouteSkeleton.js
// The destination, drawn the moment a realtor taps, while its page loads (components/nav/RouteFrame.js).
// Each skeleton is the real layout: the same header, the same widths and paddings, the same cards,
// with what is already known filled in (the listing's address and rent from the dashboard, the
// realtor's own header) and quiet blocks where the rest will land. Nothing moves: no shimmer.
// The way back is live in a skeleton too: "All listings" and "Dashboard" work before the page lands.
// A skeleton is never permanent: useSkeletonWatch retries a load that has not landed after 4
// seconds, once, and then LoadFailed takes the skeleton's place with a pill that loads it again.
import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { C, R } from '../theme';
import { GlobalStyle, Icon } from '../ui';
import DashboardHeader from '../dashboard/DashboardHeader';
import { seenListing, seenProfile, linkProps } from './routes';
import { Snapshot } from './EdgeBack';
import { formatUnit } from '../../lib/unitType';
import { displayLabel } from '../../lib/listingAddress';

export const Bar = ({ w = '100%', h = 14, style }) => <span aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: 6, background: C.paperDeep, ...style }} />;

// One applicant card at rest, as a skeleton: the name line, the score line, one line of synthesis.
// ListingView shows these too while its applicants load, so the swap is seamless.
export function ApplicantSkeletons({ count = 3 }) {
  return (
    <div aria-busy="true" aria-label="Loading applicants" data-skeleton="applicants" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s-2)' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${C.rule}`, borderRadius: R.card, padding: 'var(--card-pad)', display: 'grid', gap: 'var(--s-2)' }}>
          <Bar w="46%" h={18} /><Bar w="30%" h={14} /><Bar w="82%" h={14} />
        </div>
      ))}
    </div>
  );
}

const Page = ({ maxWidth, padding, children, label, busy = true }) => (
  <>
    <GlobalStyle />
    <div style={{ minHeight: '100dvh', background: 'var(--paper)', overflowX: 'hidden' }} data-skeleton-route={busy ? label : undefined} aria-busy={busy ? 'true' : undefined}>
      <DashboardHeader profile={seenProfile() || {}} />
      <div style={{ maxWidth, margin: '0 auto', padding }}>{children}</div>
    </div>
  </>
);
// The same look as before, now a link (components/nav/routes.js go, a back to the dashboard).
const Back = ({ label }) => (
  <a {...linkProps('/dashboard', { back: true })} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', minHeight: 44, fontSize: 'var(--t-body-2)', color: C.inkSoft, textDecoration: 'none' }}>
    <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> {label}
  </a>
);

// ── A skeleton is never permanent ────────────────────────────────────────────────────────────
export const SKELETON_WAIT = 4000;
// waiting: the skeleton is up. retry(): load it again with a live request. Four seconds after the
// skeleton appears the load runs once more by itself; four seconds after that, failed is true and
// the screen shows LoadFailed instead. again() is the pill: load again and start the watch over.
export function useSkeletonWatch(waiting, retry) {
  const retryRef = useRef(retry); retryRef.current = retry;
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!waiting) { setFailed(false); return undefined; }
    let second = 0;
    const first = setTimeout(() => { retryRef.current(); second = setTimeout(() => setFailed(true), SKELETON_WAIT); }, SKELETON_WAIT);
    return () => { clearTimeout(first); clearTimeout(second); };
  }, [waiting, round]);
  const again = useCallback(() => { setFailed(false); retryRef.current(); setRound((n) => n + 1); }, []);
  return { failed: !!waiting && failed, again };
}
// One calm line and a pill, in place of a skeleton whose load did not land. The pill loads the data
// again, never the whole app.
export function LoadFailed({ onRetry, style }) {
  return (
    <div data-load-failed="" role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-2) var(--s-3)', padding: 'var(--s-3) 0', ...style }}>
      <p style={{ margin: 0, fontSize: 'var(--t-body)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>Couldn’t load this.</p>
      <button type="button" onClick={onRetry} style={{ minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
    </div>
  );
}

function ListingSkeleton({ listingId }) {
  const l = seenListing(listingId);
  return (
    <Page label="listing" maxWidth={760} padding="var(--s-4) clamp(16px, 4vw, 32px) var(--s-7)">
      <Head><title>{l ? `${displayLabel(l, 'Listing')} · Rentletter` : 'Listing · Rentletter'}</title></Head>
      <div style={{ marginBottom: 'var(--s-4)' }}><Back label="All listings" /></div>
      <section className="rl-card" style={{ padding: 'var(--card-pad)', minWidth: 0 }}>
        {l ? <h1 className="t-d1" style={{ color: C.ink, overflowWrap: 'anywhere', textWrap: 'balance', marginRight: 88 }}>{displayLabel(l, 'Untitled listing')}</h1> : <Bar w="70%" h={32} />}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'var(--s-3)' }}>
          {l && l.monthly_rent ? <span className="num" style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.rule}`, background: C.paper, fontSize: 14, fontWeight: 500, color: C.ink }}>{`$${Number(l.monthly_rent).toLocaleString('en-CA')} per month`}</span> : <Bar w={140} h={28} style={{ borderRadius: 999 }} />}
          {l && formatUnit(l.bedrooms) ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.rule}`, background: C.paper, fontSize: 14, fontWeight: 500, color: C.ink }}>{formatUnit(l.bedrooms)}</span> : <Bar w={70} h={28} style={{ borderRadius: 999 }} />}
        </div>
        <Bar h={44} style={{ marginTop: 'var(--gap-card)', borderRadius: 'var(--card-radius)' }} />
      </section>
      <div style={{ height: 'var(--gap-section)' }} aria-hidden="true" />
      <section className="rl-card" style={{ padding: 'var(--s-4)' }}>
        <h2 className="t-d2" style={{ color: C.ink, marginBottom: 'var(--s-3)' }}>Applicants</h2>
        <ApplicantSkeletons />
      </section>
    </Page>
  );
}

function DashboardSkeleton() {
  return (
    <Page label="dashboard" maxWidth={1100} padding="var(--s-2) clamp(16px, 4vw, 32px) max(var(--s-6), env(safe-area-inset-bottom, 0px))">
      <Head><title>Realtor Dashboard · Rentletter</title></Head>
      <section style={{ background: C.inst, borderRadius: R.card, padding: 'var(--card-pad)', display: 'grid', gap: 'var(--s-3)' }}>
        <span style={{ display: 'block', width: '58%', height: 28, borderRadius: 6, background: C.instRaise }} />
        <span style={{ display: 'block', width: '80%', height: 28, borderRadius: 999, background: C.instRaise }} />
      </section>
      <Bar w={160} h={44} style={{ marginTop: 'var(--s-3)', borderRadius: 999 }} />
      <h2 className="t-d3" style={{ color: C.ink, margin: 'var(--gap-section) 0 var(--s-3)' }}>Your listings</h2>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        {[0, 1].map((i) => <div key={i} className="rl-card" style={{ padding: 'var(--card-pad)', display: 'grid', gap: 'var(--gap-line)' }}><Bar w="70%" h={18} /><Bar w="40%" h={14} /><Bar w="60%" h={28} style={{ borderRadius: 999 }} /></div>)}
      </div>
    </Page>
  );
}

function ProfileSkeleton() {
  return (
    <Page label="profile" maxWidth={720} padding="var(--gap-section) var(--s-4) 64px">
      <Head><title>Profile · Rentletter</title></Head>
      <Back label="Dashboard" />
      <h1 className="t-d1" style={{ color: C.ink, margin: 'var(--s-4) 0 var(--gap-line)' }}>Profile</h1>
      <p style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: '0 0 var(--gap-section)' }}>Changes save as you type.</p>
      <section className="rl-card" style={{ padding: 'var(--card-pad)', display: 'grid', gap: 'var(--s-4)' }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ display: 'grid', gap: 'var(--s-2)' }}><Bar w="30%" h={12} /><Bar h={44} style={{ borderRadius: 'var(--card-radius)' }} /></div>)}
      </section>
    </Page>
  );
}

function PlainSkeleton() {
  return (
    <Page label="page" maxWidth={720} padding="var(--gap-section) var(--s-4) 64px">
      <Bar w="50%" h={32} /><Bar w="80%" h={14} style={{ marginTop: 'var(--s-3)' }} />
      <section className="rl-card" style={{ padding: 'var(--card-pad)', marginTop: 'var(--gap-section)', display: 'grid', gap: 'var(--s-3)' }}><Bar w="60%" h={18} /><Bar h={14} /><Bar w="70%" h={14} /></section>
    </Page>
  );
}

// The route's load did not land (components/nav/RouteFrame.js): the same frame, the line and the pill.
function RouteFailed({ route, onRetry }) {
  const back = route.kind === 'listing' ? 'All listings' : route.kind === 'dashboard' ? null : 'Dashboard';
  return (
    <Page label="failed" busy={false} maxWidth={route.kind === 'dashboard' ? 1100 : 760} padding="var(--s-4) clamp(16px, 4vw, 32px) var(--s-7)">
      {back && <Back label={back} />}
      <LoadFailed onRetry={onRetry} />
    </Page>
  );
}

export default function RouteSkeleton({ route, onRetry }) {
  if (route.failed) return <RouteFailed route={route} onRetry={onRetry} />;
  // An edge swipe's picture of the screen, until the screen itself arrives (components/nav/RouteFrame.js).
  if (route.shot) return <Snapshot shot={route.shot} />;
  if (route.kind === 'listing') return <ListingSkeleton listingId={route.listingId} />;
  if (route.kind === 'dashboard') return <DashboardSkeleton />;
  if (route.kind === 'profile') return <ProfileSkeleton />;
  return <PlainSkeleton />;
}
