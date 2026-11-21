// components/dashboard/HomeView.js
// The realtor dashboard HOME: extracted verbatim from pages/dashboard.js so the real page
// (Supabase SSR) and /demo/dashboard (in-memory fixture) render the SAME component. All I/O
// goes through useAdapter() (lib/dashboardAdapter). Business-model logic unchanged.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, StatusPills } from '../../components/ui';
import { getEntitlement } from '../../lib/entitlements';
import { billingOff } from '../../lib/billingOff';
import Paywall from './Paywall';
import { C, R, FONT } from '../../components/theme';
import { formatUnit } from '../../lib/unitType';
import { listingStatePills } from '../../lib/listingStateLine.js';
import DashShell, { viewOf, viewHref } from './DashShell';
import { DeskStats, ListingsTable, FILTERS } from './ListingsTable';
import NeedsYou from './NeedsYou';
import { standingOf, rowOf, needsYouItems } from './homeData';
import { useCirclePending } from './MainNav';
import { navigateToAction } from './actionNav';
import InstallHint from '../../components/dashboard/InstallHint';
import { OPEN_EVENT } from '../../components/dashboard/AssistantBell';
import { greetingFor } from '../../lib/greeting.js';
import PeopleList from '../../components/dashboard/PeopleList';
import SharedWithMe, { useSharedWithMe } from './SharedWithMe';
import ListingSetupModal from '../../components/listings/ListingSetupModal';
import { go, goView, linkProps, cardProps, rememberListings, rememberProfile, rememberSignals, seenSignals, takeWarm, forgetWarm, SIGNALS_URL, rememberScreenView, prefetchCode, useTakeOver } from '../nav/routes';
import { useLoadWatch, LoadFailed } from '../nav/RouteLoader';
import { Reveal } from '../brand/Loader';
import { useAdapter } from '../../lib/dashboardAdapter';
import { listingOpen } from '../../lib/listingState';
import { referralsEnabled } from '../../lib/features';
import { needsProvince } from '../../lib/justInTime';
import { displayLabel } from '../../lib/listingAddress';

// ── Presentation-only helpers (no data logic) ─────────────────

// Initials for the no-logo brand fallback (same derivation as the header avatar).
function initialsOf(profile) {
  const n = (profile?.full_name || '').trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

// Dominant colour of the uploaded logo, sampled client-side on a downsampled canvas
// (no dependencies). Transparent and near-white/near-paper pixels are ignored; a
// too-light average (washes out on the cream card) or any failure (CORS taint,
// decode error, no logo) yields null → callers fall back to the product red.
function useLogoAccent(logoUrl) {
  const [accent, setAccent] = useState(null);
  useEffect(() => {
    setAccent(null);
    if (!logoUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required for getImageData; logo storage is CORS-open
    img.onload = () => {
      if (cancelled) return;
      try {
        const N = 24;
        const canvas = document.createElement('canvas');
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, N, N);
        const { data } = ctx.getImageData(0, 0, N, N);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const R = data[i], G = data[i + 1], B = data[i + 2];
          if (R > 232 && G > 228 && B > 216) continue;
          r += R; g += G; b += B; n++;
        }
        if (n < 12) return; // logo is effectively white/empty, keep the red fallback
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        if (0.2126 * r + 0.7152 * g + 0.0722 * b > 200) return; // insufficient contrast on the card
        setAccent(`rgb(${r}, ${g}, ${b})`);
      } catch (e) { /* tainted canvas / decode failure, red fallback stands */ }
    };
    img.src = logoUrl;
    return () => { cancelled = true; };
  }, [logoUrl]);
  return accent;
}

// The start, for a realtor with no listing yet: one heading, one line, the button, three steps.
const START = {
  heading: 'Start with one listing.',
  line: 'Each listing gets a link. Tenants apply through it, and you read their applications here.',
  steps: [
    ['Add a listing', 'The address, the rent and your landlord client.'],
    ['Send the link', 'By text, by email or in your listing post.'],
    ['Read the applications', 'They arrive here as tenants apply.'],
  ],
};

export default function HomeView({ userId, userEmail, initialProfile, initialListings, listingsError: initialListingsError = null, entitlement: initialEntitlement = null, initialSignals = null }) {
  const adapter = useAdapter();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  useEffect(() => { rememberProfile(profile); }, [profile]);
  // listings: null = not known yet (the server query failed; the client retries below),
  // [] = known to be empty (the only state that may show the guided empty state).
  const [listings, setListings] = useState(Array.isArray(initialListings) ? initialListings : null);
  useEffect(() => { rememberListings(listings || []); }, [listings]);
  const [listingsError, setListingsError] = useState(initialListingsError);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('new') === '1') setModalOpen(true); } catch (e) { /* ignore */ } }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createListing = async (input) => {
    setSaving(true);
    setError('');
    // The province rides with the first listing (lib/justInTime.js): it goes to the profile
    // first, through its own route, and never into the listing row.
    const { province, ...values } = input || {};
    try {
      if (province) {
        const pr = await adapter.fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ province }) });
        const pj = await pr.json().catch(() => ({}));
        if (!pr.ok || pj?.error) { setError(pj?.error || 'Could not save your province. Please try again.'); setSaving(false); return; }
        setProfile((p) => ({ ...(pj.profile || p), province }));
      }
      // The route inserts with profile_id from the session and records listing_created; the
      // invite is then minted through the existing invite path.
      const r = await adapter.fetch('/api/listings/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error || !j?.listing?.id) { setError(j?.error || 'Could not create the listing. Please try again.'); setSaving(false); return; }
      const data = j.listing;
      try { await adapter.fetch('/api/listings/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: data.id }) }); } catch (e) { /* the listing page offers the link */ }
      setSaving(false);
      setModalOpen(false);
      go(adapter.paths.listing(data.id));
    } catch (e) {
      setError('Could not create the listing. Please try again.');
      setSaving(false);
    }
  };

  // Each retry of the first screen's loads (the load watch below) is a new round: a live request,
  // never the one that did not land.
  const [loadRound, setLoadRound] = useState(0);
  const listingsLoaded = Array.isArray(listings);
  const hasListings = listingsLoaded && listings.length > 0;
  // No listing yet, known (never while the listings could not be read): the start.
  const empty = listingsLoaded && !hasListings;
  const openListings = (listings || []).filter((l) => listingOpen(l));
  const closedListings = (listings || []).filter((l) => !listingOpen(l));
  // Client retry when the server-side listings query failed (an expired access token being
  // refreshed under RLS is the usual reason). Until it resolves the page shows the door Loader,
  // never the empty state.
  useEffect(() => {
    if (listingsLoaded) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const supabase = adapter.supabase();
        const { data, error: qErr } = await supabase.from('listings').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
        if (cancelled) return;
        if (qErr) { setListingsError(qErr.message || 'Could not load your listings.'); return; }
        setListingsError(null); setListings(data || []);
      } catch (e) { if (!cancelled) setListingsError('Could not load your listings.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsLoaded, loadRound]);
  // ── Assistant data for "Rentletter noticed": the realtor's own applicants per listing,
  // notifications feed, referrals. Normally these arrive WITH the page (pages/dashboard.js loads
  // them server side as initialSignals) so the dashboard commits in one paint. Without them
  // (demo workspace, or a server side failure) they are fetched here and the page holds its
  // Loader until they land, so nothing ever appears after the rest. No AI involved.
  // After a tap inside the app the page comes without them (pages/dashboard.js): the signals seen
  // earlier this session show at once and the fetch below refreshes them.
  const [signals, setSignals] = useState(() => (initialSignals && initialSignals.loaded ? initialSignals : (seenSignals() || { applicantsByListing: {}, people: [], notifications: [], referralsInbox: [], referralsSent: [], loaded: false })));
  useEffect(() => { rememberSignals(signals); }, [signals]);
  // The page taking over this screen as it was seen (components/nav/RouteFrame.js keeps the screen):
  // what the server just sent replaces what it showed. New listings also run the signals read below
  // again, which refreshes them when the page came without them (a tap inside the app).
  useTakeOver([initialProfile, initialListings, initialSignals], () => {
    if (initialProfile) setProfile(initialProfile);
    if (Array.isArray(initialListings)) { setListingsError(null); setListings(initialListings); }
    if (initialSignals && initialSignals.loaded) setSignals(initialSignals);
  });
  useEffect(() => {
    if (signals.loaded && initialSignals) return undefined; // came with the page
    let cancelled = false;
    // Leaving the page cancels the reads in flight; that is not a failure to fall back from.
    const leaving = () => { cancelled = true; };
    window.addEventListener('pagehide', leaving);
    (async () => {
      // The app: one read, usually started on the touch that brought the realtor here
      // (components/nav/routes.js). The sandbox, or a failed read, takes the parts one by one.
      if (adapter.kind === 'real') {
        if (loadRound > 0) forgetWarm(SIGNALS_URL);
        const warmed = loadRound > 0 ? null : takeWarm(SIGNALS_URL);
        const got = warmed ? await warmed : await adapter.fetch(SIGNALS_URL).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, json: {} }));
        if (cancelled) return;
        if (got.ok && got.json?.signals) { setSignals({ ...got.json.signals, loaded: true }); return; }
      }
      const get = (u) => adapter.fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ls = (listings || []).slice(0, 12);
      const [notif, inbox, sent, ppl, ...apps] = await Promise.all([
        get('/api/notifications'),
        referralsEnabled() ? get('/api/referrals/inbox') : Promise.resolve(null), // lib/features.js
        referralsEnabled() ? get('/api/referrals/list') : Promise.resolve(null),
        get('/api/pipeline/people'),
        ...ls.map((l) => get(`/api/listings/applicants?listingId=${encodeURIComponent(l.id)}`)),
      ]);
      if (cancelled) return;
      const applicantsByListing = {};
      ls.forEach((l, i) => { applicantsByListing[l.id] = apps[i]?.applicants || []; });
      setSignals({ applicantsByListing, people: ppl?.people || [], notifications: notif?.items || [], referralsInbox: inbox?.referrals || [], referralsSent: Object.values(sent?.byLink || {}), latestEventAt: null, loaded: true });
    })();
    return () => { cancelled = true; window.removeEventListener('pagehide', leaving); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, loadRound]);
  // The first screen commits as one piece: listings known AND the assistant inputs in hand.
  const ready = listingsLoaded && signals.loaded;
  // Never an endless wait: a load that has not landed is retried once after 4 seconds, then the
  // line and the pill take the Loader's place (components/nav/RouteLoader.js). A page back from
  // the browser's cache, its reads cut off when it was hidden, is retried the same way.
  const loadWatch = useLoadWatch(!ready && !listingsError, () => setLoadRound((n) => n + 1));
  // This screen as it stands, so a return to it within the session shows at once
  // (components/nav/routes.js rememberScreenView). The app only: the sandbox draws its own views.
  useEffect(() => {
    if (adapter.kind !== 'real' || !ready) return;
    rememberScreenView('/dashboard', { userId, userEmail, initialProfile: profile, initialListings: listings, listingsError: null, entitlement: initialEntitlement, initialSignals: signals });
  }, [adapter.kind, ready, profile, listings, signals, initialEntitlement, userId, userEmail]);
  // Once on view: the code of the screens one tap away (a listing, the profile), when idle.
  const firstListing = listings && listings[0] ? listings[0].id : null;
  useEffect(() => { if (adapter.kind === 'real' && ready) prefetchCode([...(firstListing ? [`/listing/${encodeURIComponent(firstListing)}`] : []), '/profile']); }, [adapter.kind, ready, firstListing]);
  // The listings could not be read: said in the door's place, with a way to try again.
  const listingsFailed = (
    <section className="dash-card dash-block" style={{ padding: 'var(--s-4)' }} role="alert">
      <div className="dash-eyebrow">Your listings</div>
      <h2 className="dash-h2" style={{ marginBottom: 'var(--s-1)' }}>We couldn’t load your listings.</h2>
      <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-3)', textWrap: 'balance' }}>They are still there. Give it a moment and try again.</p>
      <button type="button" className="dash-ghost" onClick={() => window.location.reload()}>Try again</button>
    </section>
  );
  // Derived, presentation-only summaries from data that already exists (no fabrication,
  // no new API calls — everything below comes from the listings/profile already loaded).
  // Event-type Noticed actions on the home page go to the listing page, which owns the applicant
  // cards: #docs=<linkId>[&renew] makes ListingView open that applicant (marking them reviewed),
  // scroll to them and light up the document-request panel.
  const openAssistant = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  const onNoticeAction = (a) => {
    if (a.type === 'panel') { openAssistant(); return; }
    if (a.event === 'request-docs' && a.listingId && a.linkId) go(`${adapter.paths.listing(a.listingId)}#docs=${encodeURIComponent(a.linkId)}${a.renew ? '&renew' : ''}`);
  };
  // "#referrals" deep link (the Assign action): the inbox mounts only after its own fetch, so a
  // plain hash jump on page load finds nothing — wait for the section, then scroll to it.
  useEffect(() => {
    if (!referralsEnabled() || window.location.hash !== '#referrals') return undefined; // lib/features.js
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_EVENT)), 300);
    return () => clearTimeout(t);
  }, []);
  // The greeting line: the hour comes from the CLIENT after mount (lib/greeting.js), so the server's
  // clock never decides it; until then the line holds its height and is not shown. It carries no
  // name ("Good evening."), so it reads as one line at 320 whatever the realtor's name is.
  const [clientHour, setClientHour] = useState(null);
  useEffect(() => { setClientHour(new Date().getHours()); }, []);
  const greeting = clientHour == null ? '' : greetingFor(clientHour);
  // The bell receives one stable object per signals change: a fresh object every render would make
  // the bell's setSignals effect re render this page forever.
  // The standing: the listings that take applications, the applicants on them, and the listings
  // whose report has not gone yet (components/dashboard/homeData.js standingOf). On a phone the ink
  // card says the non zero ones as plain numbers; all three zero reads as nothing waiting. On a
  // desktop they are the three numbers that filter the table. Counted from the signals already
  // loaded, never a new call.
  const standing = useMemo(() => {
    if (!signals.loaded || !hasListings) return { listings: 0, applicants: 0, toSend: 0, items: [] };
    const n = standingOf(openListings, signals.applicantsByListing || {});
    const items = [
      n.listings ? [n.listings, n.listings === 1 ? 'listing' : 'listings'] : null,
      n.applicants ? [n.applicants, n.applicants === 1 ? 'applicant' : 'applicants'] : null,
      n.toSend ? [n.toSend, n.toSend === 1 ? 'report to send' : 'reports to send'] : null,
    ].filter(Boolean);
    return { ...n, items };
  }, [signals.loaded, signals.applicantsByListing, openListings, hasListings]);
  // The desktop views (components/dashboard/DashShell.js): Listings, Pipeline, Shared with you.
  const view = viewOf(router.query);
  // The stat a desktop realtor clicked: the rows it counts, or all of them.
  const [filter, setFilter] = useState('all');
  // The client's clock for the relative times, after mount (the server's render and the first
  // client render agree), once a minute after that.
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const circlePending = useCirclePending();
  const shared = useSharedWithMe();
  const byListing = signals.applicantsByListing || {};
  const rows = useMemo(() => openListings.map((l) => rowOf(l, byListing[l.id] || [])), [openListings, byListing]);
  const closedRows = useMemo(() => closedListings.map((l) => rowOf(l, byListing[l.id] || [])), [closedListings, byListing]);
  const shownRows = FILTERS[filter] ? rows.filter(FILTERS[filter]) : rows;
  const needs = useMemo(() => (signals.loaded ? needsYouItems({ listings: listings || [], applicantsByListing: byListing, people: signals.people || [], shares: shared || [], circlePending, now: now || Date.now(), paths: adapter.paths }) : []),
    // now is left out on purpose: the items change with the data, the times with the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signals.loaded, listings, byListing, signals.people, shared, circlePending, adapter.paths]);
  const onNeed = (it) => {
    if (it.go.kind === 'action') navigateToAction(it.go.item, adapter.paths);
    else if (it.go.kind === 'view') goView(viewHref(adapter.paths.home, it.go.view));
    else go(it.go.href);
  };
  const headerSignals = useMemo(() => (signals.loaded ? { ...signals, listings: listings || [] } : null), [signals, listings]);
  // Access verdict (lib/entitlements.js) — from the server load, or derived from the profile
  // (demo workspace). Only READ here; nothing is gated yet (that ships with checkout).
  const entitlement = initialEntitlement || getEntitlement(profile);
  // Billing off (lib/billingOff.js): no paywall, and no trial on screen.
  const free = billingOff();
  const trialDays = !free && entitlement.status === 'trialing' && entitlement.daysLeft != null && entitlement.daysLeft <= 7 ? entitlement.daysLeft : null;
  // Back from Checkout before the webhook landed → "payment received" instead of the paywall.
  const checkoutFlag = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('checkout') : null;
  const locked = !free && !entitlement.canUseProduct;
  const brokerage = (profile?.brokerage || '').trim();
  // Branding is complete when there is a display name, a brokerage, and a logo (uploaded or
  // generated, both land in logo_url). Complete → the brand card leaves the dashboard; branding
  // is reached from the avatar menu instead.
  const brandComplete = !!((profile?.full_name || '').trim() && brokerage && profile?.logo_url);
  // Logo-derived accent for the brand card only; the soft ink when absent or too light (red is
  // the one main action on the view).
  const logoAccent = useLogoAccent(profile?.logo_url || '');
  const brandAccent = logoAccent || C.inkSoft;

  // Header note: the dashboard header is a plain in-flow element (position: static, see .dash-bg
  // override) that scrolls away with the page. Because nothing is fixed/sticky, there is no floating
  // bar for content to bleed under or be cut by — no measured content offset, no ResizeObserver, and
  // no scroll-fade are needed. The whole page (header included) simply scrolls as one.

  return (
    <>
      <Head>
        <title>Realtor Dashboard · Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
        {/* Tint the mobile browser chrome (status bar / toolbar) to the page eggshell so there is no
            white band at the very top or bottom edge. html/body/#__next backgrounds (below) cover the
            content, notch region (viewport-fit=cover), and overscroll canvas; this covers the chrome. */}
        <meta name="theme-color" content={C.paper} />
      </Head>
      <GlobalStyle />
      {/* overflow-x: clip contains any horizontal overflow without creating a scroll container.
          The canvas comes from the root (components/ui.js), so this wrapper paints no tone of its
          own; it only stretches to the viewport so a short page still reads as one surface. */}
      <div className="dash-bg" style={{ overflowX: 'clip' }}>
        {/* The shell (components/dashboard/DashShell.js): under 1024px the header as it always was,
            static and in flow (see .dash-bg .rl-header below), with the Listings and Circle tabs; at
            1024 and wider the sidebar and the main area. */}
        <DashShell profile={profile} signals={headerSignals} onAssistantAction={onNoticeAction} nav={locked ? null : 'listings'} current={view} locked={locked} onNewListing={() => setModalOpen(true)} newPrimary={!empty}>

        {locked && (
          <div className="hv-lock" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)' }}>
            <Paywall entitlement={entitlement} profile={profile} pending={checkoutFlag === 'success'} />
          </div>
        )}
        {!locked && <div className="hv" data-view={view} style={{
          // The header is in normal flow directly above, so it takes its own space; a small top gap
          // is all that is needed. Ordinary bottom breathing room plus the home indicator inset.
          paddingTop: 'var(--s-2)',
          paddingBottom: 'max(var(--s-6), env(safe-area-inset-bottom, 0px))',
        }}>

          {/* One screen, shown in one step (components/brand/Loader.js Reveal): the door until the
              listings and the signals are both in hand, then everything at once. */}
          <Reveal ready={ready} label="Loading your workspace" failed={listingsError && !listingsLoaded ? listingsFailed : loadWatch.failed ? <LoadFailed onRetry={loadWatch.again} /> : null}>
          <div className="hv-cols">
          <div className="hv-primary">
          {/* PHONE. 1. THE INK CARD: the greeting (the hour from the client, lib/greeting.js) over the
              standing as plain numbers, counted from the loaded signals. No rows, no verbs, no links:
              what is next lives in the bell. Then the one red action on the page: New listing.
              With no listing yet it is the start: the heading and its line on the card, the button
              right under it, and the three steps; all of it on one screen at 390. */}
          <div className="hv-phone">
          <section className="dash-ink" aria-label="Welcome" style={{ background: C.inst, color: C.instText, borderRadius: R.card, padding: 'var(--card-pad)' }}>
            <h1 className="dash-greet" aria-live="polite" style={{ color: C.paper, margin: 0, minHeight: 'calc(var(--t-d1) * var(--lh-display))', visibility: greeting ? 'visible' : 'hidden', overflowWrap: 'anywhere' }}>{greeting || '\u00A0'}</h1>
            {empty ? (
              <div data-get-started="phone">
                <h2 className="dash-start-h">{START.heading}</h2>
                <p className="dash-start-line">{START.line}</p>
              </div>
            ) : standing.items.length ? (
              <ul className="dash-standing" aria-label="Your workspace">
                {standing.items.map(([n, label]) => <li key={label}><span className="dash-standing-n">{n}</span> {label}</li>)}
              </ul>
            ) : (
              <div style={{ marginTop: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.instText, lineHeight: 'var(--lh-body)' }}>
                <Icon name="check" size={15} color={C.instText} strokeWidth={2.5} /> Nothing waiting on you.
              </div>
            )}
          </section>
          <button type="button" onClick={() => setModalOpen(true)} className="dash-new" style={{ marginTop: 'var(--s-3)' }}>
            <Icon name="plus" size={17} /> New listing
          </button>
          {/* The three steps, under the button, while there is no listing. */}
          {empty ? <ol className="dash-steps" data-get-started-steps="">{START.steps.map(([title, line], i) => <li key={title}><span className="dash-step-n" aria-hidden="true">{i + 1}</span><span><span className="dash-step-t">{title}</span><span className="dash-step-l">{line}</span></span></li>)}</ol> : null}
          {/* iOS Safari only, until dismissed once on this device (components/dashboard/InstallHint.js).
              Held back while there is no listing, so the start fits one screen. */}
          {!empty && <InstallHint />}
          </div>

          {/* DESKTOP. The greeting, quiet, on the page; under it the three numbers that filter the
              table, or with no listing yet the start, filling the main area. */}
          <div className="hv-desk hv-part-listings">
            <h1 className="hv-greet" style={{ visibility: greeting ? 'visible' : 'hidden' }}>{greeting || '\u00A0'}</h1>
            {hasListings ? <DeskStats standing={standing} filter={filter} onFilter={setFilter} /> : null}
            {empty ? (
              <div className="hv-start" data-get-started="desktop">
                <h2 className="hv-start-h">{START.heading}</h2>
                <p className="hv-start-line">{START.line}</p>
                <button type="button" onClick={() => setModalOpen(true)} className="ds-btn ds-btn-primary hv-start-new" data-get-started-new="">
                  <Icon name="plus" size={16} /> New listing
                </button>
                <ol className="hv-steps">{START.steps.map(([title, line], i) => <li key={title}><span className="hv-step-n" aria-hidden="true">{i + 1}</span><span className="hv-step-t">{title}</span><span className="hv-step-l">{line}</span></li>)}</ol>
              </div>
            ) : null}
          </div>
          {trialDays != null && <p className="dash-note dash-data">{trialDays === 1 ? '1 day' : `${trialDays} days`} left on your trial. <a href="/billing" style={{ color: C.ink, fontWeight: 700 }}>See plans</a></p>}

          {/* 2. YOUR LISTINGS. On a phone each card is its address, rent, beds and its state; on a
              desktop, one row a listing in the table. */}
          {error && (
            <div className="dash-block" role="alert" style={{ padding: 'var(--s-3) var(--s-4)', background: C.dangerTint, borderRadius: R.ctrl, borderLeft: `3px solid ${C.danger}`, fontSize: 'var(--t-body-2)', color: C.ink }}>
              {error}
            </div>
          )}
          {hasListings && (
            <div className="dash-block hv-part-listings hv-phone">
              <div className="dash-section-head">
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--s-2)', minWidth: 0 }}>
                  <h2 className="dash-h2">Your listings</h2>
                  <span className="dash-count">{openListings.length}</span>
                </span>
              </div>
              <div className="dash-grid">
                {openListings.map((l) => (
                  <div key={l.id} role="link" tabIndex={0} aria-label={displayLabel(l, 'Untitled listing')} className="dash-card dash-card-int" data-press="card"
                    {...cardProps(adapter.paths.listing(l.id))}
                    style={{ cursor: 'pointer', color: C.ink, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-line)' }}>
                    {/* Name left, the rent right in tabular numerals, so the rents line up down the column. */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)', minWidth: 0 }}>
                      <div className="t-d3" style={{ color: C.ink, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{displayLabel(l, 'Untitled listing')}</div>
                      <div className="num" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : 'No rent'}</div>
                    </div>
                    <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>
                      {l.monthly_rent ? 'per month' : 'Rent not set'}{formatUnit(l.bedrooms) ? `, ${formatUnit(l.bedrooms)}` : ''}
                    </div>
                    {/* The state as pills, all in the one status style: the applicants by what they
                        need, then the report (lib/listingStateLine.js). */}
                    <StatusPills label="Listing status" items={listingStatePills(l, signals.applicantsByListing[l.id] || []).map((x) => x.text)} />
                  </div>
                ))}
                {/* Rented and closed listings, below the active ones under one muted word. */}
                {closedListings.length > 0 && (
                  <div className="dash-eyebrow" role="separator" aria-label="Rented listings" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', color: C.inkMute, gridColumn: '1 / -1' }}>
                    <span>Rented</span><span aria-hidden="true" style={{ flex: 1, height: 1, background: C.rule }} />
                  </div>
                )}
                {closedListings.map((l) => (
                  <a key={l.id} {...linkProps(adapter.paths.listing(l.id))} data-press="card" className="dash-card dash-card-int"
                    style={{ textDecoration: 'none', color: C.ink, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)', minWidth: 0 }}>
                      <div className="t-d3" style={{ color: C.inkSoft, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{displayLabel(l, 'Untitled listing')}</div>
                      <div className="num" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.inkSoft, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : 'No rent'}</div>
                    </div>
                    <StatusPills label="Listing status" items={listingStatePills(l, signals.applicantsByListing[l.id] || []).map((x) => x.text)} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {hasListings && (
            <div className="hv-desk hv-part-listings hv-section" data-listings-view="">
              <div className="hv-head">
                <h2 className="dash-h2">Your listings</h2>
                <span className="hv-count" aria-label={`${shownRows.length} shown`}>{shownRows.length}</span>
                {filter !== 'all' ? (
                  <span className="hv-filter">
                    {filter === 'applicants' ? 'With applicants' : 'With a report to send'}
                    <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')}>Show all</button>
                  </span>
                ) : null}
              </div>
              {shownRows.length ? <ListingsTable rows={shownRows} now={now} paths={adapter.paths} /> : <p className="hv-quiet">No listing matches. <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')}>Show all</button></p>}
              {filter === 'all' && closedRows.length > 0 && (
                <div className="hv-rented">
                  <div className="hv-head"><h3 className="hv-h3">Rented</h3><span className="hv-count">{closedRows.length}</span></div>
                  <ListingsTable rows={closedRows} now={now} paths={adapter.paths} label="Rented listings" />
                </div>
              )}
            </div>
          )}

          {/* 3. PIPELINE (components/dashboard/PeopleList.js): under the listings on a phone; on a
              desktop its own view, and its soonest items feed Needs you. */}
          {(hasListings || view === 'pipeline') && <div className="hv-part-pipeline hv-section-phone"><PeopleList people={signals.people || []} /></div>}

          {/* Profiles tenants shared with this realtor as listing agent (components/dashboard/SharedWithMe.js): nothing when there are none. */}
          <div className="hv-part-shared">
            <SharedWithMe />
            {Array.isArray(shared) && shared.length === 0 ? (
              <div className="hv-desk" data-shared-empty="">
                <h2 className="dash-h2">Shared with you</h2>
                <p className="hv-quiet">No tenant has shared a profile with you yet.</p>
              </div>
            ) : null}
          </div>

          {/* 4. BRAND CARD, only while branding is incomplete and there is a listing (the zero
              listing state is one card, nothing else). Whole card opens the profile. */}
          {hasListings && !brandComplete && (
            <a {...linkProps(adapter.paths.profile)} data-press="card" className="dash-card dash-card-int dash-brand dash-block hv-part-listings" style={{ borderLeft: `3px solid ${brandAccent}` }}
              title="You and your brand" aria-label="Set up your profile and branding">
              <div className="dash-eyebrow">Your brand</div>
              <div className="dash-brand-identity">
                {profile?.logo_url
                  ? <img src={profile.logo_url} alt="" className="dash-brand-logo" />
                  : <span className="dash-brand-initials" aria-hidden="true">{initialsOf(profile)}</span>}
                <span className="dash-brand-id">
                  <span className="dash-brand-name">{profile?.full_name || 'Your name'}</span>
                  <span className="dash-brand-brok">{brokerage || 'Add your brokerage'}</span>
                  <span className="dash-brand-desc">Your logo, name, and brokerage appear on every report you send.</span>
                </span>
              </div>
              <span className="dash-brand-foot">
                {profile?.full_name && brokerage ? 'Add your logo' : 'Set up branding'} <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
              </span>
            </a>
          )}
          </div>

          {/* DESKTOP. NEEDS YOU: the next things to do, newest first (components/dashboard/NeedsYou.js). */}
          <div className="hv-aside hv-desk">
            <NeedsYou items={needs} now={now} onGo={onNeed} />
          </div>
          </div>
          </Reveal>
        </div>}

        </DashShell>
        <ListingSetupModal open={modalOpen} mode="create" askProvince={needsProvince(profile)} realtorProvince={profile?.province || null} prefill={{ listing_brokerage_name: profile?.brokerage || null, listing_brokerage_address: profile?.brokerage_address || null, listing_brokerage_phone: profile?.phone || null }} onCancel={() => setModalOpen(false)} onSave={createListing} saving={saving} />
      </div>

      <style jsx>{`
        /* ── Base canvas: ONE flat, uniform tone, painted at the root as var(--paper)
           (components/ui.js), no glows and no gradients. The header carries the same token (below),
           so header and page read as a single surface top to bottom: no distinct header band,
           nothing to flash on scroll, and the notch region matches too. The white cards (C.card)
           sit raised on that canvas. ── */
        .dash-bg {
          /* No background here: the canvas is painted at the root (components/ui.js var(--paper)),
             so there is nothing to stop at the last card. Short pages still fill the viewport. */
          min-height: 100vh;
          min-height: 100dvh;
        }
        /* The dashboard header is a NORMAL, STATIC, in-flow element — it scrolls up and off with the
           page like any other content, NOT fixed/sticky. With no floating bar, there is no fixed layer
           for content to bleed under or be cut by, which eliminates the entire class of iOS fixed-vs-
           scrolling compositing bug (the half-cut title) at the source. It carries the exact page canvas
           tone (var(--paper)) so it reads as a seamless top strip of the page. Scoped here; the
           shared ScrollHeader (sticky) is unchanged on every other page. */
        .dash-bg :global(.rl-header) {
          position: static !important;            /* was fixed, now scrolls away with the page */
          background: var(--paper) !important;  /* the one canvas tone, seamless with the page */
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          border-bottom-color: transparent !important;
          box-shadow: none !important;
          /* As the topmost in-flow element, pad by the safe-area inset so the wordmark/controls clear
             the iPhone notch/status bar at the top of the page; the solid bg fills that region too.
             0 on non-notch browsers. */
          padding-top: env(safe-area-inset-top, 0px);
        }
        /* Keep the header height constant when the shared scroll-shrink class toggles at ~8px scroll
           (it tightens the inner padding) so the in-flow content below doesn't jump as you start
           scrolling. */
        .dash-bg :global(.rl-header.rl-shrink) .rl-header-inner {
          padding-top: 18px;
          padding-bottom: 18px;
        }
        /* ── One tasteful elevation tier — crafted card, soft rounded corners ── */
        .dash-card {
          background: ${C.card};
          border: 1px solid var(--rule);
          border-radius: var(--card-radius);
          box-shadow: 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05);
        }

        /* ── Type scale: three tiers on this screen ──
           display  (.dash-greet at --t-d1, .dash-h2 at --t-d3)  Fraunces serif
           body     (inherited) Inter 400/500 · everything else
           data     (.dash-data) Inter 800 + tabular-nums, every number that must line up */
        .dash-greet { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; letter-spacing: -0.02em; line-height: var(--lh-display); }
        .dash-h2 { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; }
        .dash-data { font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dash-eyebrow { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; line-height: var(--lh-eyebrow); text-transform: uppercase; color: ${C.inkMute}; margin-bottom: var(--s-2); }

        /* ── The one red action on the page: New listing, a full width 44px row, the radius and
           padding every dashboard button has (components/dashboard/DashShell.js .ds-btn) ── */
        .dash-new { width: 100%; min-height: 44px; background: ${C.red}; color: ${C.paper}; border: none; border-radius: var(--btn-radius); padding: 0 var(--gap-card); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); font-family: inherit; }
        /* The standing on the ink card: plain numbers with their words, no pills. */
        .dash-standing { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); font-size: var(--t-body-2); color: ${C.instText}; line-height: var(--lh-body); }
        .dash-standing li { white-space: nowrap; }
        .dash-standing-n { font-weight: 800; color: ${C.paper}; font-variant-numeric: tabular-nums; }

        /* ── Branding tile — identity moment, whole card → /profile. The card's 3px left edge
           (inline style) carries the colour sampled from the uploaded logo, red otherwise. ── */
        .dash-brand { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); text-decoration: none; color: ${C.ink}; }
        /* The name and brokerage beside the logo while they keep 280px; on a phone, under it, the card's width. */
        .dash-brand-identity { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); min-width: 0; }
        /* Transparent logo art sits straight on the card surface — no tile, no frame. */
        .dash-brand-logo { width: clamp(72px, 20vw, 96px); height: clamp(72px, 20vw, 96px); object-fit: contain; flex-shrink: 0; }
        /* Neutral backing exists ONLY as the no-logo fallback (initials as a placeholder mark). */
        .dash-brand-initials { width: clamp(64px, 18vw, 84px); height: clamp(64px, 18vw, 84px); border-radius: 14px; background: ${C.paperDeep}; border: 1px solid ${C.rule}; display: inline-flex; align-items: center; justify-content: center; font-family: ${FONT.serif}; font-weight: 600; font-size: var(--t-d3); color: ${C.inkSoft}; flex-shrink: 0; }
        .dash-brand-id { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; flex: 1 1 280px; }
        /* Masthead byline: name in the display serif, brokerage muted below. */
        .dash-brand-name { font-family: ${FONT.serif}; font-size: var(--t-d3); font-weight: 600; color: ${C.ink}; letter-spacing: -0.015em; line-height: 1.15; overflow-wrap: anywhere; text-wrap: balance; }
        .dash-brand-brok { font-size: var(--t-body-2); color: ${C.inkMute}; overflow-wrap: anywhere; }
        /* Below 345px a long name takes the body size (16px), so it holds two words a line at 320. */
        @media (max-width: 344.98px) { .dash-brand-name { font-size: var(--t-body); } }
        .dash-brand-desc { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.5; margin-top: var(--s-1); text-wrap: balance; white-space: normal; }
        .dash-brand-foot { margin-top: auto; display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; }

        /* ── Section rhythm: one gap between blocks, and a short note under the greeting ── */
        .dash-block { margin-top: var(--gap-card); }
        .dash-note { font-size: var(--t-body-2); color: ${C.inkMute}; font-variant-numeric: tabular-nums; margin: var(--s-2) var(--s-1) 0; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s-4); }
        /* ── Listing invite-link status chip (real data) ── */
        .dash-lchip { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-eyebrow); font-weight: 600; color: ${C.inkMute}; }
        .dash-lchip-on { color: ${C.ink}; }
        .dash-lchip-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.ink}; flex-shrink: 0; }
        .dash-lchip-dot-off { background: ${C.ruleDark}; }

        /* ── Section head + ghost button ── */
        .dash-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; margin: var(--gap-section) 0 var(--s-4); }
        .dash-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
        .dash-ghost { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: var(--btn-radius); min-height: 44px; padding: 0 var(--gap-card); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: var(--s-1); }

        /* Instant (motion-independent) hover colour states — safe for reduced-motion */
        .dash-ghost:hover { background: ${C.paperDeep}; border-color: ${C.ink}; }
        /* The listing cards never move: a pointer that hovers darkens the border, at once. */
        @media (hover: hover) { .dash-card-int:hover { border-color: ${C.ruleDark}; } }

        /* The press is the shared one (lib/motion.js installPress); a pointer that hovers gets a shadow, at once. */
        @media (hover: hover) { .dash-new:hover { box-shadow: 0 8px 22px rgba(215, 32, 39, 0.28); } }

        /* ── The start (no listing yet): on the ink card the heading and its line; the steps under
           the button, numbered, each a title and a short line. ── */
        .dash-start-h { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.paper}; margin: var(--s-3) 0 0; text-wrap: balance; }
        .dash-start-line { font-size: var(--t-body-2); color: ${C.instText}; line-height: var(--lh-body); margin: var(--s-2) 0 0; text-wrap: balance; }
        .dash-steps { list-style: none; margin: var(--s-4) 0 0; padding: 0; display: grid; gap: var(--s-3); }
        .dash-steps li { display: flex; align-items: flex-start; gap: var(--s-3); }
        .dash-step-n, .hv-step-n { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${C.ruleDark}; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; font-variant-numeric: tabular-nums; }
        .dash-step-t { display: block; font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; padding-top: 3px; }
        .dash-step-l { display: block; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.4; margin-top: 2px; text-wrap: balance; }
        .hv-start { margin-top: var(--s-2); }
        .hv-start-h { font-family: var(--f-display); font-size: 40px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; color: ${C.ink}; margin: 0; text-wrap: balance; }
        .hv-start-line { font-size: var(--t-body); color: ${C.inkSoft}; line-height: var(--lh-body); margin: var(--s-3) 0 0; max-width: 34em; text-wrap: balance; }
        .hv-start-new { margin-top: var(--s-5); }
        .hv-steps { list-style: none; margin: var(--gap-section) 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
        .hv-steps li { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-5); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); }
        .hv-step-t { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; margin-top: var(--s-2); }
        .hv-step-l { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); text-wrap: balance; }
        @media (min-width: 1920px) { .hv-start-h { font-size: 48px; } .hv-start-line { font-size: 18px; } }

        /* ── Phone and desktop: both are in the markup, the width picks one ── */
        .hv { max-width: 1100px; margin: 0 auto; padding-left: clamp(16px, 4vw, 32px); padding-right: clamp(16px, 4vw, 32px); }
        .hv-desk { display: none; }
        .hv-section-phone { margin-top: var(--gap-section); }
        @media (min-width: 1024px) {
          .hv { max-width: none; padding-left: var(--s-5); padding-right: var(--s-5); }
          .hv-phone { display: none; }
          .hv-desk { display: block; }
          .hv-cols { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: var(--gap-section); }
          .hv-primary { min-width: 0; }
          .hv-section-phone { margin-top: 0; }
          /* The views: Listings, Pipeline, Shared with you (components/dashboard/DashShell.js). */
          .hv:not([data-view='listings']) .hv-part-listings { display: none; }
          .hv:not([data-view='pipeline']) .hv-part-pipeline { display: none; }
          .hv:not([data-view='shared']) .hv-part-shared { display: none; }
          .hv-greet { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.inkSoft}; margin: 0; }
          .hv-section { margin-top: var(--gap-section); }
          .hv-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s-2) var(--s-3); margin-bottom: var(--s-3); }
          .hv-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
          .hv-filter { display: inline-flex; align-items: center; gap: var(--s-2); margin-left: auto; font-size: var(--t-body-2); color: ${C.inkSoft}; }
          .hv-quiet { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; }
          .hv-rented { margin-top: var(--gap-section); }
          .hv-h3 { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin: 0; }
          .hv-part-shared :global([data-shared-with-me]) { margin-top: 0; }
          .dash-brand { margin-top: var(--gap-section); max-width: 720px; }
        }
        @media (min-width: 1280px) {
          .hv { padding-left: var(--s-6); padding-right: var(--s-6); }
          .hv-cols { grid-template-columns: minmax(0, 1fr) 320px; column-gap: var(--s-5); align-items: start; }
          .hv-aside { position: sticky; top: var(--s-4); }
        }
        @media (min-width: 1600px) { .hv-cols { grid-template-columns: minmax(0, 1fr) 360px; column-gap: var(--s-6); } }
      `}</style>
    </>
  );
}
