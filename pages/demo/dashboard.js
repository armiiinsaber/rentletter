// pages/demo/dashboard.js — the public product demo.
// Renders the REAL realtor dashboard (components/dashboard/HomeView + ListingView — the exact
// components /landlord uses) through lib/demoAdapter.js: an in-memory fixture of FAKE people
// (lib/demoFixture.js). No auth, no database, no email, no KV. Every write the dashboard makes
// lands in sessionStorage and nowhere else; "Reset" wipes it. The assistant is live (real
// /api/chat, rate-limited there) — its actions execute into this sandbox, never against real routes.
// ?listing=<fixture id> opens a listing exactly like /landlord/<id> does.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import HomeView from '../../components/dashboard/HomeView';
import ListingView from '../../components/dashboard/ListingView';
import { DashboardAdapterContext } from '../../lib/dashboardAdapter';
import { createDemoAdapter } from '../../lib/demoAdapter';
import { C } from '../../components/theme';

export default function DemoSandbox() {
  const router = useRouter();
  const [adapter, setAdapter] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const a = createDemoAdapter(); setAdapter(a); return a.subscribe(() => setTick((t) => t + 1)); }, []);

  const listingId = router.isReady ? (typeof router.query.listing === 'string' ? router.query.listing : null) : undefined;
  // Props are snapshotted per navigation (like getServerSideProps); views own state after mount.
  const view = useMemo(() => {
    if (!adapter || listingId === undefined) return null;
    const s = adapter.getState();
    if (listingId) {
      const listing = s.listings.find((l) => l.id === listingId);
      if (!listing) return { missing: true };
      return { key: `listing:${listingId}`, el: <ListingView initialProfile={s.profile} initialListing={{ ...listing }} initialApplicants={(s.applicantsByListing[listingId] || []).map((a) => ({ ...a }))} /> };
    }
    return { key: 'home', el: <HomeView userId={s.profile.id} userEmail={s.profile.email} initialProfile={s.profile} initialListings={s.listings.map((l) => ({ ...l }))} /> };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, listingId]);

  useEffect(() => { if (view?.missing) router.replace('/demo/dashboard'); }, [view, router]);

  const reset = () => { adapter.reset(); window.location.href = '/demo/dashboard'; };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="rl-sandbox-bar" role="note">
        <span className="rl-sandbox-dot" aria-hidden="true" />
        <span style={{ textWrap: 'pretty' }}><strong>Sample workspace.</strong> Everything here is fake data for {adapter?.getState().profile.full_name || 'a sample realtor'}, click anything; nothing is saved or sent.</span>
        <span className="rl-sandbox-actions">
          {adapter && <button type="button" onClick={reset}>Reset sample</button>}
          <a href="/signin">Use it for real →</a>
        </span>
      </div>
      {view && !view.missing && (
        <DashboardAdapterContext.Provider value={adapter}>
          <div key={view.key} data-demo-tick={tick}>{view.el}</div>
        </DashboardAdapterContext.Provider>
      )}
      <style jsx global>{`
        .rl-sandbox-bar { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; padding: var(--s-2) var(--s-4); background: ${C.ink}; color: #e8e4d9; font-size: var(--t-body-2); line-height: 1.4; border-bottom: 3px solid ${C.red}; }
        .rl-sandbox-bar strong { color: #fff; }
        .rl-sandbox-dot { width: 8px; height: 8px; border-radius: 50%; background: ${C.red}; flex-shrink: 0; }
        .rl-sandbox-actions { margin-left: auto; display: flex; gap: var(--s-2); align-items: center; }
        .rl-sandbox-actions button, .rl-sandbox-actions a { font: inherit; font-weight: 600; color: #e8e4d9; background: transparent; border: 1px solid #3a3a3e; border-radius: 8px; padding: var(--s-1) var(--s-2); min-height: 34px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
        .rl-sandbox-actions a { background: transparent; border-color: #e8e4d9; color: #e8e4d9; }
        @media (max-width: 480px) { .rl-sandbox-actions { margin-left: 0; } }
      `}</style>
    </>
  );
}
