// components/nav/RouteSkeleton.js
// The destination, drawn the moment a realtor taps, while its page loads (components/nav/RouteFrame.js).
// Each skeleton is the real layout: the same header, the same widths and paddings, the same cards,
// with what is already known filled in (the listing's address and rent from the dashboard, the
// realtor's own header) and quiet blocks where the rest will land. Nothing moves: no shimmer.
import Head from 'next/head';
import { C, R } from '../theme';
import { GlobalStyle, Icon } from '../ui';
import DashboardHeader from '../dashboard/DashboardHeader';
import { seenListing, seenProfile } from './routes';
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

const Page = ({ maxWidth, padding, children, label }) => (
  <>
    <GlobalStyle />
    <div style={{ minHeight: '100dvh', background: 'var(--paper)', overflowX: 'hidden' }} data-skeleton-route={label} aria-busy="true">
      <DashboardHeader profile={seenProfile() || {}} />
      <div style={{ maxWidth, margin: '0 auto', padding }}>{children}</div>
    </div>
  </>
);
const Back = ({ label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', minHeight: 44, fontSize: 'var(--t-body-2)', color: C.inkSoft }}>
    <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> {label}
  </span>
);

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

export default function RouteSkeleton({ route }) {
  if (route.kind === 'listing') return <ListingSkeleton listingId={route.listingId} />;
  if (route.kind === 'dashboard') return <DashboardSkeleton />;
  if (route.kind === 'profile') return <ProfileSkeleton />;
  return <PlainSkeleton />;
}
