// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, useReveal } from '../components/ui';
import { C, R, SH, EASE, FONT } from '../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { normalizeProvince, provinceName } from '../lib/provinces';
import { formatUnit } from '../lib/unitType';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import ListingSetupModal from '../components/listings/ListingSetupModal';
import ChatWidget from '../components/ChatWidget';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { redirect: { destination: '/signin?next=/landlord', permanent: false } };
  }
  let [{ data: profile }, { data: listings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }),
  ]);
  // Backfill province once: new signups carry it in user metadata; existing accounts with no
  // province default to Ontario. Only writes when profiles.province is unset, so a realtor's
  // later manual change in settings is never overwritten. Gracefully no-ops if the column
  // isn't migrated yet.
  if (profile && (profile.province === null || profile.province === undefined)) {
    const chosen = normalizeProvince(user.user_metadata?.province);
    const { data: updated } = await supabase
      .from('profiles').update({ province: chosen }).eq('id', user.id).select().single();
    if (updated) profile = updated;
    else profile = { ...profile, province: chosen };
  }
  return {
    props: {
      userId: user.id,
      userEmail: user.email || '',
      initialProfile: profile || { id: user.id, email: user.email },
      initialListings: listings || [],
    },
  };
}

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

// Count-up for pulse-strip numbers. Initial state is the FINAL value so SSR, no-JS,
// and reduced-motion all read the real number; motion-welcome browsers animate
// 0 → value once on first load (rAF, ease-out, 400ms — inside the motion budget).
function CountUp({ value }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    if (target <= 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / 400, 1);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Runs once on mount by design — the strip counts up on first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{shown}</>;
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

export default function LandlordDashboard({ userId, userEmail, initialProfile, initialListings }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [listings, setListings] = useState(initialListings);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createListing = async (values) => {
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: insErr } = await supabase
        .from('listings')
        .insert({ ...values, profile_id: userId })
        .select()
        .single();
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setSaving(false);
      setModalOpen(false);
      router.push(`/landlord/${data.id}`);
    } catch (e) {
      setError('Could not create the listing. Please try again.');
      setSaving(false);
    }
  };

  const hasListings = listings.length > 0;
  // Derived, presentation-only summaries from data that already exists (no fabrication,
  // no new API calls — everything below comes from the listings/profile already loaded).
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const activeLinks = listings.filter((l) => l.invite_token || l.invite_url).length;
  const provinceCode = normalizeProvince(profile?.province);
  const provinceLabel = provinceName(profile?.province);
  const brokerage = (profile?.brokerage || '').trim();
  const newThisWeek = listings.filter((l) => {
    const t = l.created_at ? new Date(l.created_at).getTime() : NaN;
    return Number.isFinite(t) && Date.now() - t < 7 * 24 * 60 * 60 * 1000;
  }).length;
  // Live activity line under the hero title — only real, currently-loaded numbers.
  // Zero-value segments are omitted rather than faked.
  const activity = [];
  if (hasListings) {
    activity.push({ n: listings.length, t: listings.length === 1 ? 'listing on market' : 'listings on market' });
    if (activeLinks > 0) activity.push({ n: activeLinks, t: activeLinks === 1 ? 'invite link live' : 'invite links live' });
    if (newThisWeek > 0) activity.push({ n: newThisWeek, t: 'added this week' });
  }
  // Logo-derived accent for the brand card only; product red when absent/too light.
  const logoAccent = useLogoAccent(profile?.logo_url || '');
  const brandAccent = logoAccent || C.red;
  // Reveal major sections on load / scroll (subtle, matches the header language).
  useReveal(`${listings.length}-${hasListings}`);

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
        <DashboardHeader profile={profile} />

        <div style={{
          maxWidth: 1100, margin: '0 auto',
          // The header is now in normal flow directly above, so it takes its own space — content just
          // follows below it. No measured offset needed; a small top gap is all that's required.
          paddingTop: 'clamp(8px, 2vw, 16px)',
          paddingRight: 'clamp(16px, 4vw, 32px)',
          paddingLeft: 'clamp(16px, 4vw, 32px)',
          // Reserved clearance for the fixed "?" assistant launcher: 56px FAB + up to 24px of
          // its bottom offset + 16px breathing room, plus the home-indicator inset. Nothing in
          // flow (the "Signed in as" footer line included) can ever sit under the FAB, and the
          // page ends right after this zone — no extra void below.
          paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        }}>

          {/* ── OVERVIEW BENTO — hero + branding ── */}
          <div className="rl-in dash-bento">
            {/* Hero card — NO scroll transform (see note above): a transformed hero paints above the
                fixed header on iOS, causing a half-cut title. Plain, so the header cleanly covers it. */}
            <section className="dash-card dash-hero span-4">
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your workspace</div>
              <h1 className="dash-h1" style={{ marginBottom: 10 }}>
                {hasListings ? `Welcome back${firstName ? `, ${firstName}` : ''}` : 'Welcome to Rentletter'}
              </h1>
              {activity.length > 0 ? (
                <p className="dash-activity">
                  {activity.map((a, i) => (
                    <span key={a.t} className="dash-act-seg">
                      {i > 0 && <span className="dash-tick" aria-hidden="true" />}
                      <span className="dash-act-num">{a.n}</span> {a.t}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="dash-hero-sub">Your next applicant will show up here.</p>
              )}
              <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setModalOpen(true)} className="dash-cta">
                  <Icon name="plus" size={17} /> New listing
                </button>
                <span className="dash-hero-meta">
                  Set up for {provinceLabel}{brokerage ? ` · ${brokerage}` : ''}
                </span>
              </div>
            </section>

            {/* Branding — the one action worth featuring here. A crafted, on-brand tile that
                previews the realtor's identity (as it appears on their reports) and invites
                setup. Whole card → /profile. Help/FAQ live in the ? assistant; compliance in
                the footer + its page — not featured here. */}
            <a href="/profile" className="dash-card dash-card-int dash-brand span-2"
              title="You & your brand" aria-label="Set up your profile and branding"
              style={{ borderLeft: `3px solid ${brandAccent}` }}>
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your brand</div>
              {/* Identity sits directly on the card surface — masthead byline, not an input
                  field. Transparent logos render with no white tile; the neutral backing only
                  appears as the no-logo fallback (initials). */}
              <div className="dash-brand-identity">
                {profile?.logo_url
                  ? <img src={profile.logo_url} alt="" className="dash-brand-logo" />
                  : <span className="dash-brand-initials" aria-hidden="true">{initialsOf(profile)}</span>}
                <span className="dash-brand-id">
                  <span className="dash-brand-name">{profile?.full_name || 'Your name'}</span>
                  <span className="dash-brand-brok">{brokerage || 'Add your brokerage'}</span>
                </span>
              </div>
              <p className="dash-brand-desc">
                Your logo, colours, and details — they appear on every report you send to landlords.
              </p>
              <span className="dash-brand-foot">
                Set up branding <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
              </span>
            </a>
          </div>

          {/* ── PULSE STRIP — one horizontal instrument (real, derived numbers). Red tick-marks
              divide the stats (signature motif); numbers count up once on load (final values
              render instantly under reduced-motion / no-JS). The empty delta slots keep the
              three number baselines level when a real delta is shown. ── */}
          {hasListings && (
            <div className="rl-in dash-pulse" style={{ '--rl-d': '70ms' }}>
              <div className="dash-pulse-cell">
                <span className="dash-data dash-pulse-val"><CountUp value={listings.length} /></span>
                <span className="dash-pulse-label">{listings.length === 1 ? 'Listing' : 'Listings'}</span>
                {newThisWeek > 0 && <span className="dash-pulse-delta">+{newThisWeek} this week</span>}
              </div>
              <span className="dash-pulse-tick" aria-hidden="true" />
              <div className="dash-pulse-cell">
                <span className="dash-data dash-pulse-val"><CountUp value={activeLinks} /></span>
                <span className="dash-pulse-label">{activeLinks === 1 ? 'Link' : 'Links'}</span>
                {newThisWeek > 0 && <span className="dash-pulse-delta" aria-hidden="true">&nbsp;</span>}
              </div>
              <span className="dash-pulse-tick" aria-hidden="true" />
              <div className="dash-pulse-cell">
                <span className="dash-data dash-pulse-val">{provinceCode}</span>
                <span className="dash-pulse-label">Market</span>
                {newThisWeek > 0 && <span className="dash-pulse-delta" aria-hidden="true">&nbsp;</span>}
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
              {error}
            </div>
          )}

          {/* Guided empty state */}
          {!hasListings && (
            <section className="dash-card rl-in" style={{ overflow: 'hidden', '--rl-d': '90ms' }}>
              <div style={{ padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 36px)', borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Getting started</div>
                <h2 style={{ fontFamily: FONT.serif, fontSize: 'clamp(24px, 4.5vw, 32px)', fontWeight: 600, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 10 }}>
                  Add your first listing.
                </h2>
                <p style={{ fontSize: 'clamp(14px, 3vw, 16px)', color: C.inkSoft, lineHeight: 1.55, maxWidth: 560, marginBottom: 22 }}>
                  A listing holds one unit, its invite link, and every application that comes in. Create one to get your shareable link.
                </p>
                <button onClick={() => setModalOpen(true)} className="rl-btn"
                  style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 52 }}>
                  <Icon name="plus" size={17} /> Add your first listing
                </button>
              </div>
              <ol style={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, margin: 0 }}>
                {[
                  { n: '1', t: 'Add a listing', d: "Enter the unit address, rent, and your landlord client's preferences." },
                  { n: '2', t: 'Share the invite link', d: 'Send one link to prospective tenants. No accounts needed.' },
                  { n: '3', t: 'Applicants appear here', d: 'Standardized applications land on the listing automatically.' },
                  { n: '4', t: 'Review & rank', d: 'Everyone is ranked against your criteria, best fit first. Set aside with a reason, then present the full ranked list to your landlord.' },
                ].map((s, i) => (
                  <li key={s.n} style={{ padding: 'clamp(18px, 4vw, 24px) clamp(20px, 4vw, 28px)', borderTop: `1px solid ${C.rule}`, borderLeft: i % 2 === 1 ? `1px solid ${C.rule}` : 'none' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.08em', marginBottom: 8 }}>STEP {s.n}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{s.t}</div>
                    <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>{s.d}</div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Listings list */}
          {hasListings && (
            <div className="rl-in dash-section-head" style={{ '--rl-d': '90ms' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                <span className="dash-dash" style={{ height: 15, alignSelf: 'center' }} />
                <h2 className="dash-h2">Your listings</h2>
                <span className="dash-count">{listings.length}</span>
              </span>
              {/* "New listing" lives once, on the hero card above — no duplicate here. */}
            </div>
          )}
          {hasListings && (
            <div className="rl-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, '--rl-d': '120ms' }}>
              {listings.map((l) => (
                <a key={l.id} href={`/landlord/${l.id}`} className="dash-card dash-card-int"
                  style={{ textDecoration: 'none', color: C.ink, padding: 'clamp(20px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 17.5, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
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
          )}

          {/* Session privacy note (kept reassuring; sessions are real accounts now) */}
          <p style={{ marginTop: 28, fontSize: 12, color: C.inkMute, textAlign: 'center' }}>
            Signed in as {userEmail}. Your listings are private to your account.
          </p>
        </div>

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

        /* ── Bento grid: single column on mobile → asymmetric 6-col on wide screens ── */
        .dash-bento { display: grid; gap: 14px; grid-template-columns: 1fr; margin-bottom: 14px; }
        @media (min-width: 840px) {
          .dash-bento { grid-template-columns: repeat(6, 1fr); gap: 18px; margin-bottom: 18px; }
          .dash-bento .span-4 { grid-column: span 4; }
          .dash-bento .span-2 { grid-column: span 2; }
        }

        /* ── Type scale — four tiers, used consistently on this screen ──
           display  (.dash-h1)  Fraunces serif — the hero title, same face as the landing hero
           heading  (.dash-h2)  Inter 800, tight tracking — section titles
           body     (inherited) Inter 400/500 — everything else
           data     (.dash-data) Inter 800 + tabular-nums — every number that must line up */
        .dash-h1 { font-family: ${FONT.serif}; font-size: clamp(30px, 4.8vw, 44px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.05; color: ${C.ink}; }
        .dash-h2 { font-size: clamp(18px, 2.6vw, 22px); font-weight: 800; letter-spacing: -0.02em; color: ${C.ink}; }
        .dash-data { font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dash-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: 10px; }
        .dash-hero-sub { font-size: clamp(14px, 1.9vw, 15.5px); color: ${C.inkSoft}; line-height: 1.6; max-width: 460px; }
        .dash-hero-meta { font-size: 12px; color: ${C.inkMute}; font-weight: 500; }

        /* ── Live activity line — real numbers separated by the red tick motif. Wraps cleanly
           at 390px (flex-wrap; each segment is an unbreakable unit). ── */
        .dash-activity { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: clamp(13.5px, 1.9vw, 15px); color: ${C.inkSoft}; line-height: 1.5; max-width: 520px; }
        .dash-act-seg { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
        .dash-act-num { font-weight: 800; color: ${C.ink}; font-variant-numeric: tabular-nums; }
        .dash-tick { width: 2.5px; height: 12px; background: ${C.red}; border-radius: 1px; margin-right: 7px; flex-shrink: 0; }

        /* ── Hero overview card — subtle warm gradient + faint brand glow ── */
        .dash-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; padding: clamp(22px, 3.2vw, 32px);
          background: linear-gradient(152deg, ${C.card} 0%, #fbf6ec 100%); }
        .dash-hero::before { content: ''; position: absolute; top: -45%; right: -14%; width: 62%; height: 130%; pointer-events: none;
          background: radial-gradient(circle at center, rgba(215, 32, 39, 0.07), transparent 62%); }
        .dash-hero > * { position: relative; }
        .dash-cta { background: ${C.red}; color: ${C.paper}; border: none; border-radius: 12px; padding: 13px 20px; font-size: 14.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }

        /* ── Branding tile — identity moment, whole card → /profile. The card's 3px left edge
           (inline style) carries the colour sampled from the uploaded logo, red otherwise. ── */
        .dash-brand { display: flex; flex-direction: column; gap: 14px; padding: clamp(18px, 2.6vw, 24px); text-decoration: none; color: ${C.ink}; }
        .dash-brand-identity { display: flex; align-items: center; gap: 14px; min-width: 0; }
        /* Transparent logo art sits straight on the card surface — no tile, no frame. */
        .dash-brand-logo { width: 60px; height: 60px; object-fit: contain; flex-shrink: 0; }
        /* Neutral backing exists ONLY as the no-logo fallback (initials as a placeholder mark). */
        .dash-brand-initials { width: 56px; height: 56px; border-radius: 14px; background: ${C.paperDeep}; border: 1px solid ${C.rule}; display: inline-flex; align-items: center; justify-content: center; font-family: ${FONT.serif}; font-weight: 600; font-size: 21px; color: ${C.inkSoft}; flex-shrink: 0; }
        .dash-brand-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        /* Masthead byline: name in the display serif, brokerage muted below. */
        .dash-brand-name { font-family: ${FONT.serif}; font-size: clamp(17px, 2.2vw, 20px); font-weight: 600; color: ${C.ink}; letter-spacing: -0.01em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-brand-brok { font-size: 12.5px; color: ${C.inkMute}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-brand-desc { font-size: 12.5px; color: ${C.inkSoft}; line-height: 1.55; margin: 0; }
        .dash-brand-foot { margin-top: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: ${C.red}; }

        /* ── Pulse strip — ONE instrument: shared card surface, no internal cell borders; the
           stats are divided by red tick-marks (signature motif). Values share one size so the
           numbers and the province code sit on the same line; labels are one word in small caps. ── */
        .dash-pulse { display: flex; align-items: center; background: ${C.card}; border: 1px solid #ece5d6; border-radius: 16px; margin-bottom: 4px;
          padding: clamp(18px, 3vw, 24px) clamp(8px, 2.5vw, 24px);
          box-shadow: 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05); }
        .dash-pulse-cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 7px; }
        .dash-pulse-val { font-size: clamp(26px, 5.6vw, 34px); line-height: 1; color: ${C.ink}; }
        .dash-pulse-label { font-size: 10.5px; font-weight: 700; color: ${C.inkMute}; line-height: 1.25; letter-spacing: 0.08em; text-transform: uppercase; }
        .dash-pulse-delta { font-size: 10.5px; font-weight: 700; color: ${C.green}; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .dash-pulse-tick { width: 3px; height: clamp(24px, 4vw, 30px); background: ${C.red}; border-radius: 1px; flex-shrink: 0; }

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
