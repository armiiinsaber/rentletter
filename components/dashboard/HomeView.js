// components/dashboard/HomeView.js
// The realtor dashboard HOME — extracted verbatim from pages/landlord.js so the real page
// (Supabase SSR) and /demo/dashboard (in-memory fixture) render the SAME component. All I/O
// goes through useAdapter() (lib/dashboardAdapter). Business-model logic unchanged.
import { useEffect, useState } from 'react';
import { reportEvent } from '../../lib/clientEvents';
import { isWithdrawn } from '../../lib/listingApplicantsVocabulary';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, useReveal } from '../../components/ui';
import { getEntitlement } from '../../lib/entitlements';
import Paywall from './Paywall';
import { C, R, EASE, FONT } from '../../components/theme';
import { formatUnit } from '../../lib/unitType';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import { OPEN_EVENT } from '../../components/dashboard/AssistantBell';
import NoticedCards from '../../components/dashboard/NoticedCards';
import ListingSetupModal from '../../components/listings/ListingSetupModal';
import ChatWidget from '../../components/ChatWidget';
import { useAdapter } from '../../lib/dashboardAdapter';

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
        if (n < 12) return; // logo is effectively white/empty — keep the red fallback
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        if (0.2126 * r + 0.7152 * g + 0.0722 * b > 200) return; // insufficient contrast on the card
        setAccent(`rgb(${r}, ${g}, ${b})`);
      } catch (e) { /* tainted canvas / decode failure — red fallback stands */ }
    };
    img.src = logoUrl;
    return () => { cancelled = true; };
  }, [logoUrl]);
  return accent;
}

export default function HomeView({ userId, userEmail, initialProfile, initialListings, listingsError: initialListingsError = null, entitlement: initialEntitlement = null, initialSignals = null }) {
  const adapter = useAdapter();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  // listings: null = not known yet (the server query failed; the client retries below),
  // [] = known to be empty (the only state that may show the guided empty state).
  const [listings, setListings] = useState(Array.isArray(initialListings) ? initialListings : null);
  const [listingsError, setListingsError] = useState(initialListingsError);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('new') === '1') setModalOpen(true); } catch (e) { /* ignore */ } }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createListing = async (values) => {
    setSaving(true);
    setError('');
    try {
      const supabase = adapter.supabase();
      const { data, error: insErr } = await supabase
        .from('listings')
        .insert({ ...values, profile_id: userId })
        .select()
        .single();
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setSaving(false);
      setModalOpen(false);
      reportEvent(adapter, { type: 'listing_created', listingId: data.id });
      router.push(adapter.paths.listing(data.id));
    } catch (e) {
      setError('Could not create the listing. Please try again.');
      setSaving(false);
    }
  };

  const listingsLoaded = Array.isArray(listings);
  const hasListings = listingsLoaded && listings.length > 0;
  // Client retry when the server-side listings query failed (an expired access token being
  // refreshed under RLS is the usual reason). Until it resolves the page shows a skeleton,
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
  }, [listingsLoaded]);
  // ── Assistant data for "Rentletter noticed": the realtor's own applicants per listing,
  // notifications feed, referrals. Normally these arrive WITH the page (pages/landlord.js loads
  // them server side as initialSignals) so the dashboard commits in one paint. Without them
  // (demo workspace, or a server side failure) they are fetched here and the page holds its
  // skeleton until they land, so nothing ever appears after the rest. No AI involved.
  const [signals, setSignals] = useState(() => (initialSignals && initialSignals.loaded ? initialSignals : { applicantsByListing: {}, notifications: [], referralsInbox: [], referralsSent: [], loaded: false }));
  useEffect(() => {
    if (signals.loaded && initialSignals) return undefined; // came with the page
    let cancelled = false;
    (async () => {
      const get = (u) => adapter.fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ls = (listings || []).slice(0, 12);
      const [notif, inbox, sent, ...apps] = await Promise.all([
        get('/api/notifications'), get('/api/referrals/inbox'), get('/api/referrals/list'),
        ...ls.map((l) => get(`/api/listings/applicants?listingId=${encodeURIComponent(l.id)}`)),
      ]);
      if (cancelled) return;
      const applicantsByListing = {};
      ls.forEach((l, i) => { applicantsByListing[l.id] = apps[i]?.applicants || []; });
      setSignals({ applicantsByListing, notifications: notif?.items || [], referralsInbox: inbox?.referrals || [], referralsSent: Object.values(sent?.byLink || {}), latestEventAt: null, loaded: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);
  // The first screen commits as one piece: listings known AND the assistant inputs in hand.
  const ready = listingsLoaded && signals.loaded;
  // Derived, presentation-only summaries from data that already exists (no fabrication,
  // no new API calls — everything below comes from the listings/profile already loaded).
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || '';
  useEffect(() => {
    window.__rlAssistantContext = {
      page: 'home', currentListingId: null,
      listings: (listings || []).map((l) => ({ id: l.id, name: l.name, address: l.address, landlord_email: l.landlord_email, landlord_name: l.landlord_name })),
      applicants: (listings || []).flatMap((l) => (signals.applicantsByListing[l.id] || []).filter((a) => !isWithdrawn(a)).map((a) => ({ linkId: a.linkId, listingId: l.id, applicationId: a.application?.id, name: a.application?.full_name, email: a.application?.email }))),
    };
    return () => { delete window.__rlAssistantContext; };
  }, [listings, signals]);
  // Event-type Noticed actions on the home page go to the listing page, which owns the applicant
  // cards: #docs=<linkId>[&renew] makes ListingView open that applicant (marking them reviewed),
  // scroll to them and light up the document-request panel.
  const openAssistant = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  const onNoticeAction = (a) => {
    if (a.type === 'panel') { openAssistant(); return; }
    if (a.event === 'request-docs' && a.listingId && a.linkId) window.location.href = `${adapter.paths.listing(a.listingId)}#docs=${encodeURIComponent(a.linkId)}${a.renew ? '&renew' : ''}`;
  };
  // "#referrals" deep link (the Assign action): the inbox mounts only after its own fetch, so a
  // plain hash jump on page load finds nothing — wait for the section, then scroll to it.
  useEffect(() => {
    if (window.location.hash !== '#referrals') return undefined;
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_EVENT)), 300);
    return () => clearTimeout(t);
  }, []);
  const noticeInput = { scope: 'home', listings: listings || [], applicantsByListing: signals.applicantsByListing, notifications: signals.notifications, referralsSent: signals.referralsSent, referralsInbox: signals.referralsInbox, profile };
  // Greeting: time of day plus first name, nothing else. The name is its own flex item so a
  // long one drops to its own line whole (never a stray word).
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // Access verdict (lib/entitlements.js) — from the server load, or derived from the profile
  // (demo workspace). Only READ here; nothing is gated yet (that ships with checkout).
  const entitlement = initialEntitlement || getEntitlement(profile);
  const trialDays = entitlement.status === 'trialing' && entitlement.daysLeft != null && entitlement.daysLeft <= 7 ? entitlement.daysLeft : null;
  // Back from Checkout before the webhook landed → "payment received" instead of the paywall.
  const checkoutFlag = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('checkout') : null;
  const locked = !entitlement.canUseProduct;
  const brokerage = (profile?.brokerage || '').trim();
  // Branding is complete when there is a display name, a brokerage, and a logo (uploaded or
  // generated, both land in logo_url). Complete → the brand card leaves the dashboard; branding
  // is reached from the avatar menu instead.
  const brandComplete = !!((profile?.full_name || '').trim() && brokerage && profile?.logo_url);
  // Logo-derived accent for the brand card only; product red when absent/too light.
  const logoAccent = useLogoAccent(profile?.logo_url || '');
  const brandAccent = logoAccent || C.red;
  // Reveal major sections on load / scroll (subtle, matches the header language).
  useReveal(`${listingsLoaded ? listings.length : 'x'}-${hasListings}-${signals.loaded}`);

  // Header note: the dashboard header is a plain in-flow element (position: static, see .dash-bg
  // override) that scrolls away with the page. Because nothing is fixed/sticky, there is no floating
  // bar for content to bleed under or be cut by — no measured content offset, no ResizeObserver, and
  // no scroll-fade are needed. The whole page (header included) simply scrolls as one.

  return (
    <>
      <Head>
        <title>Realtor Dashboard — Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
        {/* Tint the mobile browser chrome (status bar / toolbar) to the page eggshell so there is no
            white band at the very top or bottom edge. html/body/#__next backgrounds (below) cover the
            content, notch region (viewport-fit=cover), and overscroll canvas; this covers the chrome. */}
        <meta name="theme-color" content={C.paperDeep} />
      </Head>
      <GlobalStyle />
      {/* overflow-x: clip contains any horizontal overflow without creating a scroll container.
          No min-height: html/body/#__next are pinned to the same canvas tone below, so a short
          page needs no stretch — stretching only left a void of empty canvas under the footer. */}
      <div className="dash-bg" style={{ overflowX: 'clip' }}>
        {/* Static, in-flow header (see .dash-bg .rl-header below) — it scrolls away with the page; its
            solid canvas background + safe-area padding cover the notch region at the top. */}
        <DashboardHeader profile={profile} signals={signals.loaded ? { ...signals, listings: listings || [] } : null} onAssistantAction={onNoticeAction} />

        {locked && (
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)' }}>
            <Paywall entitlement={entitlement} profile={profile} pending={checkoutFlag === 'success'} />
          </div>
        )}
        {!locked && <div style={{
          maxWidth: 1100, margin: '0 auto',
          // The header is now in normal flow directly above, so it takes its own space — content just
          // follows below it. No measured offset needed; a small top gap is all that's required.
          paddingTop: 'clamp(8px, 2vw, 16px)',
          paddingRight: 'clamp(16px, 4vw, 32px)',
          paddingLeft: 'clamp(16px, 4vw, 32px)',
          // Ordinary bottom breathing room plus the home indicator inset. The "?" launcher is
          // position: fixed and overlaps the bottom right corner; it never pushes the page taller.
          // The "Signed in as" line keeps a max-width so its text stops short of that corner.
          paddingBottom: 'calc(clamp(16px, 3vw, 24px) + env(safe-area-inset-bottom, 0px))',
        }}>

          {!ready && !listingsError && (
            <div aria-busy="true" aria-label="Loading your workspace">
              <div className="dash-card dash-hero dash-skel" style={{ minHeight: 168 }}><span className="dash-skel-line" style={{ width: '32%', height: 10 }} /><span className="dash-skel-line" style={{ width: '58%', height: 30 }} /><span className="dash-skel-line" style={{ width: 128, height: 44, borderRadius: 12 }} /></div>
              <div className="dash-block dash-section-head"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="dash-dash" style={{ height: 15 }} /><h2 className="dash-h2">Your listings</h2></span></div>
              <div className="dash-grid">{[0, 1].map((i) => <div key={i} className="dash-card dash-skel"><span className="dash-skel-line" style={{ width: '70%', height: 18 }} /><span className="dash-skel-line" style={{ width: '45%' }} /><span className="dash-skel-line" style={{ width: '38%' }} /><span className="dash-skel-line" style={{ width: '30%', marginTop: 'auto' }} /></div>)}</div>
            </div>
          )}
          {ready && <>
          {/* 1. GREETING + PRIMARY ACTION. With no listings yet this is THE card: the greeting, one
              sentence on what adding a listing gets them, one button. Nothing teaches; it starts. */}
          <section className="dash-card dash-hero rl-in">
            <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your workspace</div>
            <h1 className="dash-h1">
              <span className="dash-h1-greet">
                <span>{greetWord}{firstName ? ',\u00A0' : '.'}</span>
                {firstName && <span className="dash-h1-name">{firstName}.</span>}
              </span>
            </h1>
            {listingsLoaded && !hasListings && (
              <p style={{ fontSize: 'clamp(15px, 3.6vw, 17px)', color: C.inkSoft, lineHeight: 1.5, marginTop: 12, maxWidth: 520, textWrap: 'balance' }}>Add a listing and you get a link to send applicants; their applications land&nbsp;here.</p>
            )}
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setModalOpen(true)} className="dash-cta">
                <Icon name="plus" size={17} /> {listingsLoaded && !hasListings ? 'Add your first listing' : 'New listing'}
              </button>
            </div>
          </section>
          {trialDays != null && <p className="dash-note dash-data">{trialDays === 1 ? '1 day' : `${trialDays} days`} left on your trial. <a href="/billing" style={{ color: C.ink, fontWeight: 700 }}>See plans</a></p>}

          {/* 2. THE ASSISTANT, compact: the Needs you zone as it renders here, and a way into the
              full panel (bell, or Open). The timeline lives in the panel only. Referrals to
              assign are part of the panel's Needs you zone, so the page stays three sections. */}
          {hasListings && <div className="dash-block"><NoticedCards input={noticeInput} onAction={onNoticeAction} onOpen={openAssistant} /></div>}

          {/* 3. YOUR LISTINGS */}
          {error && (
            <div className="dash-block" style={{ padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
              {error}
            </div>
          )}
          {listingsError && !listingsLoaded && (
            <section className="dash-card dash-block" style={{ padding: 'clamp(20px, 4vw, 28px)' }} role="alert">
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your listings</div>
              <h2 className="dash-h2" style={{ marginBottom: 6 }}>We couldn’t load your listings.</h2>
              <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14, textWrap: 'balance' }}>They are still there. Give it a moment and try again.</p>
              <button type="button" className="dash-ghost" onClick={() => window.location.reload()}>Try again</button>
            </section>
          )}
          {hasListings && (
            <div className="dash-block">
              <div className="rl-in dash-section-head" style={{ '--rl-d': '60ms' }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                  <span className="dash-dash" style={{ height: 15, alignSelf: 'center' }} />
                  <h2 className="dash-h2">Your listings</h2>
                  <span className="dash-count">{listings.length}</span>
                </span>
              </div>
              <div className="rl-in dash-grid" style={{ '--rl-d': '90ms' }}>
                {listings.map((l) => (
                  <a key={l.id} href={adapter.paths.listing(l.id)} className="dash-card dash-card-int"
                    style={{ textDecoration: 'none', color: C.ink, padding: 'clamp(20px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 17.5, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.25, overflowWrap: 'anywhere', textWrap: 'balance' }}>
                      {l.name || l.address || 'Untitled listing'}
                    </div>
                    <div style={{ fontSize: 13.5, color: C.inkSoft, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}
                      {formatUnit(l.bedrooms) ? ` · ${formatUnit(l.bedrooms)}` : ''}
                    </div>
                    {(l.invite_token || l.invite_url) ? (
                      <span className="dash-lchip dash-lchip-on"><span className="dash-lchip-dot" /> Invite link active</span>
                    ) : (
                      <span className="dash-lchip"><span className="dash-lchip-dot dash-lchip-dot-off" /> No invite link yet</span>
                    )}
                    <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${C.rule}`, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.red, fontWeight: 700 }}>
                      Open listing <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={14} /></span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 4. BRAND CARD, only while branding is incomplete and there is a listing (the zero
              listing state is one card, nothing else). Whole card opens the profile. */}
          {hasListings && !brandComplete && (
            <a href={adapter.paths.profile} className="dash-card dash-card-int dash-brand dash-block rl-in" style={{ borderLeft: `3px solid ${brandAccent}`, '--rl-d': '120ms' }}
              title="You and your brand" aria-label="Set up your profile and branding">
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your brand</div>
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

          {/* Session privacy note (kept reassuring; sessions are real accounts now) */}
          <p className="dash-signed">Signed in as {userEmail}. Your listings are private to your account.</p>
          </>}
        </div>}

        {modalOpen && (
          <ListingSetupModal mode="create" onCancel={() => setModalOpen(false)} onSave={createListing} saving={saving} />
        )}
      </div>
      {/* In-app product-help assistant (how-to only; never advises on tenant selection). */}
      <ChatWidget mode="dashboard" />

      <style jsx>{`
        /* ── Base canvas — ONE flat, uniform tone (C.paperDeep), no glows/gradients. The fixed header
           carries the exact same colour (below), so header + page read as a single monochrome surface
           top to bottom: no distinct header band, nothing to flash on scroll, and the notch region
           matches too. The lighter cream cards (C.card) sit raised on top of this recessed canvas. ── */
        .dash-bg {
          background: ${C.paperDeep};
        }
        /* The dashboard header is a NORMAL, STATIC, in-flow element — it scrolls up and off with the
           page like any other content, NOT fixed/sticky. With no floating bar, there is no fixed layer
           for content to bleed under or be cut by, which eliminates the entire class of iOS fixed-vs-
           scrolling compositing bug (the half-cut title) at the source. It carries the exact page canvas
           tone (C.paperDeep) so it reads as a seamless top strip of the monochrome page. Scoped here; the
           shared ScrollHeader (sticky) is unchanged on every other page. */
        .dash-bg :global(.rl-header) {
          position: static !important;            /* was fixed — now scrolls away with the page */
          background: ${C.paperDeep} !important;  /* solid canvas tone — seamless with the page */
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
        /* Seamless top AND bottom: match the root background to the flat .dash-bg canvas so there is
           no tone step at the very top edge (under the status bar / above the header) or the very
           bottom edge (browser chrome / iOS overscroll). One continuous canvas surface. */
        :global(html),
        :global(body),
        :global(#__next) { background: ${C.paperDeep} !important; }
        /* The overscroll bounce and the region behind the notch (viewport-fit=cover) paint the ROOT
           element's background, so pin html to the canvas tone explicitly (not just via body). */
        :global(html) { background-color: ${C.paperDeep} !important; }
        /* ── One tasteful elevation tier — crafted card, soft rounded corners ── */
        .dash-card {
          background: ${C.card};
          border: 1px solid #ece5d6;
          border-radius: 18px;
          box-shadow: 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05);
        }
        /* Red-dash brand motif for section eyebrows/heads. */
        .dash-dash { display: inline-block; width: 3px; height: 1em; background: ${C.red}; border-radius: 1px; flex-shrink: 0; }

        /* ── Type scale — four tiers, used consistently on this screen ──
           display  (.dash-h1)  Fraunces serif — the hero title, same face as the landing hero
           heading  (.dash-h2)  Inter 800, tight tracking — section titles
           body     (inherited) Inter 400/500 — everything else
           data     (.dash-data) Inter 800 + tabular-nums — every number that must line up */
        .dash-h1 { font-family: ${FONT.serif}; font-size: clamp(28px, 7.2vw, 40px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.08; color: ${C.ink}; }
        /* greeting line: word + name are flex items — one line when they fit, else the name drops
           whole. The nbsp inside the word is the space between them; a name wider than the card
           may break inside itself (last resort — no overflow at 390px). */
        .dash-h1 { min-width: 0; max-width: 100%; }
        .dash-h1-greet { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; max-width: 100%; }
        .dash-h1-greet > span { white-space: nowrap; }
        .dash-h1-greet > .dash-h1-name { white-space: normal; min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
        .dash-h2 { font-size: clamp(18px, 2.6vw, 22px); font-weight: 800; letter-spacing: -0.02em; color: ${C.ink}; }
        .dash-data { font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dash-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: 10px; }

        /* ── Hero overview card — subtle warm gradient + faint brand glow ── */
        .dash-hero { position: relative; overflow: hidden; min-width: 0; display: flex; flex-direction: column; padding: clamp(22px, 3.2vw, 32px);
          background: linear-gradient(152deg, ${C.card} 0%, #fbf6ec 100%); }
        .dash-hero::before { content: ''; position: absolute; top: -45%; right: -14%; width: 62%; height: 130%; pointer-events: none;
          background: radial-gradient(circle at center, rgba(215, 32, 39, 0.07), transparent 62%); }
        .dash-hero > * { position: relative; }
        .dash-cta { background: ${C.red}; color: ${C.paper}; border: none; border-radius: 12px; padding: 13px 20px; font-size: 14.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }

        /* ── Branding tile — identity moment, whole card → /profile. The card's 3px left edge
           (inline style) carries the colour sampled from the uploaded logo, red otherwise. ── */
        .dash-brand { display: flex; flex-direction: column; gap: 14px; padding: clamp(18px, 3vw, 24px); text-decoration: none; color: ${C.ink}; }
        .dash-brand-identity { display: flex; align-items: center; gap: clamp(14px, 4vw, 22px); min-width: 0; }
        /* Transparent logo art sits straight on the card surface — no tile, no frame. */
        .dash-brand-logo { width: clamp(72px, 20vw, 96px); height: clamp(72px, 20vw, 96px); object-fit: contain; flex-shrink: 0; }
        /* Neutral backing exists ONLY as the no-logo fallback (initials as a placeholder mark). */
        .dash-brand-initials { width: clamp(64px, 18vw, 84px); height: clamp(64px, 18vw, 84px); border-radius: 14px; background: ${C.paperDeep}; border: 1px solid ${C.rule}; display: inline-flex; align-items: center; justify-content: center; font-family: ${FONT.serif}; font-weight: 600; font-size: 21px; color: ${C.inkSoft}; flex-shrink: 0; }
        .dash-brand-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        /* Masthead byline: name in the display serif, brokerage muted below. */
        .dash-brand-name { font-family: ${FONT.serif}; font-size: clamp(20px, 5.4vw, 24px); font-weight: 600; color: ${C.ink}; letter-spacing: -0.015em; line-height: 1.15; overflow-wrap: anywhere; text-wrap: balance; }
        .dash-brand-brok { font-size: 13.5px; color: ${C.inkMute}; overflow-wrap: anywhere; }
        .dash-brand-desc { font-size: 13px; color: ${C.inkSoft}; line-height: 1.5; margin-top: 4px; text-wrap: pretty; white-space: normal; }
        .dash-brand-foot { margin-top: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: ${C.red}; }

        /* ── Section rhythm: one gap between blocks, and a short note under the greeting ── */
        .dash-block { margin-top: clamp(14px, 2.6vw, 18px); }
        .dash-note { font-size: 12.5px; color: ${C.inkMute}; font-variant-numeric: tabular-nums; margin: 10px 4px 0; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
        .dash-signed { margin-top: clamp(20px, 3vw, 28px); font-size: 12px; color: ${C.inkMute}; text-align: left; text-wrap: pretty; max-width: calc(100% - 84px); }
        /* Skeleton: the listing card's shape (title, rent line, chip, footer), no spinner. */
        .dash-skel { padding: clamp(20px, 3vw, 24px); display: flex; flex-direction: column; gap: 14px; min-height: 172px; }
        .dash-skel-line { display: block; height: 12px; border-radius: 6px; background: ${C.paperDeep}; }
        @media (prefers-reduced-motion: no-preference) {
          .dash-skel-line { background: linear-gradient(90deg, ${C.paperDeep} 0%, #ebe5d8 50%, ${C.paperDeep} 100%); background-size: 200% 100%; animation: dash-shimmer 1.4s ease-in-out infinite; }
          @keyframes dash-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        }
        /* ── Listing invite-link status chip (real data) ── */
        .dash-lchip { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: ${C.inkMute}; }
        .dash-lchip-on { color: ${C.green}; }
        .dash-lchip-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.green}; flex-shrink: 0; }
        .dash-lchip-dot-off { background: #cabfa8; }

        /* ── Section head + ghost button ── */
        .dash-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: clamp(18px, 2.6vw, 26px) 0 16px; }
        .dash-count { font-size: 12px; font-weight: 700; color: ${C.inkMute}; background: ${C.card}; border: 1px solid #ece5d6; border-radius: 999px; padding: 2px 10px; font-variant-numeric: tabular-nums; }
        .dash-ghost { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: 11px; padding: 9px 15px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }

        /* Instant (motion-independent) hover colour states — safe for reduced-motion */
        .dash-ghost:hover { background: ${C.paperDeep}; border-color: ${C.ink}; }

        @media (prefers-reduced-motion: no-preference) {
          /* Tighten the shared app-reveal on this screen only — same travel, ≤400ms
             (opacity, then transform, matching .rl-in's property order). */
          .dash-bg :global(.rl-in) { transition-duration: 340ms, 380ms; }
          .dash-cta { transition: transform 200ms ${EASE}, box-shadow 220ms ease; }
          .dash-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(215, 32, 39, 0.28); }
          .dash-cta:active { transform: translateY(0); box-shadow: none; transition-duration: 90ms; }
          .dash-ghost { transition: background 160ms ease, border-color 160ms ease, transform 180ms ${EASE}; }
          .dash-ghost:hover { transform: translateY(-1px); }
          .dash-card-int { transition: transform 260ms ${EASE}, box-shadow 260ms ease, border-color 200ms ease; }
          .dash-card-int:hover { transform: translateY(-4px); box-shadow: 0 4px 10px rgba(15, 15, 16, 0.06), 0 22px 48px rgba(15, 15, 16, 0.11); border-color: #e4dcc9; }
          .dash-card-int:active { transform: translateY(-1px); transition-duration: 110ms; }
          .dash-card-int .rl-arrow { transition: transform 220ms ${EASE}; }
          .dash-card-int:hover .rl-arrow { transform: translateX(4px); }
        }
      `}</style>
    </>
  );
}
