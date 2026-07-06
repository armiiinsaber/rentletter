// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, useReveal } from '../components/ui';
import { C, R, SH, EASE } from '../components/theme';
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
  // Derived, presentation-only summaries from data that already exists (no fabrication).
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const activeLinks = listings.filter((l) => l.invite_token || l.invite_url).length;
  const provinceCode = normalizeProvince(profile?.province);
  const provinceLabel = provinceName(profile?.province);
  const brokerage = (profile?.brokerage || '').trim();
  // Reveal major sections on load / scroll (subtle, matches the header language).
  useReveal(`${listings.length}-${hasListings}`);

  return (
    <>
      <Head>
        <title>Realtor Dashboard — Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
      </Head>
      <GlobalStyle />
      <div className="dash-bg" style={{ minHeight: '100vh', overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 48px' }}>

          {/* ── OVERVIEW BENTO — hero + quick actions ── */}
          <div className="rl-in dash-bento">
            <section className="dash-card dash-hero span-4">
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Your workspace</div>
              <h1 className="dash-h1" style={{ marginBottom: 4 }}>
                {hasListings ? `Welcome back${firstName ? `, ${firstName}` : ''}.` : 'Welcome to Rentletter.'}
              </h1>
              <p className="dash-hero-sub">
                Every applicant to your listings, standardized and ranked against your landlord’s criteria — ready to review and present.
              </p>
              <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 14 }}>
                <button onClick={() => setModalOpen(true)} className="dash-cta">
                  <Icon name="plus" size={17} /> New listing
                </button>
                <span className="dash-hero-meta">
                  Set up for {provinceLabel}{brokerage ? ` · ${brokerage}` : ''}
                </span>
              </div>
            </section>

            <section className="dash-card dash-actions span-2">
              <div className="dash-eyebrow"><span className="dash-dash" style={{ height: 11 }} /> Quick actions</div>
              <a href="/profile" className="dash-qa">
                <span className="dash-qa-ic"><Icon name="user" size={15} /></span>
                <span style={{ minWidth: 0 }}>Profile &amp; brand</span>
                <span className="dash-qa-chev"><Icon name="chevron" size={15} /></span>
              </a>
              <a href="/faq" className="dash-qa">
                <span className="dash-qa-ic"><Icon name="question" size={15} /></span>
                <span style={{ minWidth: 0 }}>Help &amp; FAQ</span>
                <span className="dash-qa-chev"><Icon name="chevron" size={15} /></span>
              </a>
            </section>
          </div>

          {/* ── AT-A-GLANCE STATS (real, derived) ── */}
          {hasListings && (
            <div className="rl-in dash-stats" style={{ '--rl-d': '70ms' }}>
              <StatTile icon="home" value={listings.length} label="Listings" hint="in your workspace" />
              <StatTile icon="link" value={activeLinks} label="Active invite links" hint={activeLinks === 1 ? 'collecting applicants' : 'collecting applicants'} />
              <StatTile icon="shield" value={provinceCode} label="Market" hint={provinceLabel} />
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
                <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10 }}>
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
              <button onClick={() => setModalOpen(true)} className="dash-ghost">
                <Icon name="plus" size={15} /> New listing
              </button>
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
                  <div style={{ fontSize: 13.5, color: C.inkSoft, fontWeight: 500 }}>
                    {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}
                    {formatUnit(l.bedrooms) ? ` · ${formatUnit(l.bedrooms)}` : ''}
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.red, fontWeight: 700 }}>
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
        /* ── Layered base surface: soft warm gradient + faint brand/ink glows, quiet not noisy ── */
        .dash-bg {
          background:
            radial-gradient(130% 92% at 88% -14%, rgba(215, 32, 39, 0.05), transparent 56%),
            radial-gradient(120% 82% at 4% 2%, rgba(15, 15, 16, 0.022), transparent 52%),
            linear-gradient(180deg, #faf8f3 0%, #f4efe6 100%);
        }
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
        .dash-stats { display: grid; gap: 14px; grid-template-columns: 1fr; margin-bottom: 4px; }
        @media (min-width: 560px) { .dash-stats { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 840px) {
          .dash-bento { grid-template-columns: repeat(6, 1fr); gap: 18px; margin-bottom: 18px; }
          .dash-bento .span-4 { grid-column: span 4; }
          .dash-bento .span-2 { grid-column: span 2; }
        }

        /* ── Type scale — confident, Apple-like ── */
        .dash-h1 { font-size: clamp(28px, 4.6vw, 40px); font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; color: ${C.ink}; }
        .dash-h2 { font-size: clamp(18px, 2.6vw, 22px); font-weight: 800; letter-spacing: -0.02em; color: ${C.ink}; }
        .dash-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: 10px; }
        .dash-hero-sub { font-size: clamp(14px, 1.9vw, 15.5px); color: ${C.inkSoft}; line-height: 1.6; max-width: 460px; }
        .dash-hero-meta { font-size: 12px; color: ${C.inkMute}; font-weight: 500; }

        /* ── Hero overview card — subtle warm gradient + faint brand glow ── */
        .dash-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; padding: clamp(22px, 3.2vw, 34px); min-height: 208px;
          background: linear-gradient(152deg, ${C.card} 0%, #fbf6ec 100%); }
        .dash-hero::before { content: ''; position: absolute; top: -45%; right: -14%; width: 62%; height: 130%; pointer-events: none;
          background: radial-gradient(circle at center, rgba(215, 32, 39, 0.07), transparent 62%); }
        .dash-hero > * { position: relative; }
        .dash-cta { background: ${C.red}; color: ${C.paper}; border: none; border-radius: 12px; padding: 13px 20px; font-size: 14.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }

        /* ── Quick actions card ── */
        .dash-actions { display: flex; flex-direction: column; padding: clamp(18px, 2.6vw, 22px); }
        .dash-qa { display: flex; align-items: center; gap: 11px; padding: 11px 12px; border-radius: 12px; text-decoration: none; color: ${C.ink}; font-size: 13.5px; font-weight: 600; }
        .dash-qa-ic { width: 30px; height: 30px; flex-shrink: 0; border-radius: 9px; background: ${C.paperDeep}; color: ${C.inkSoft}; display: inline-flex; align-items: center; justify-content: center; }
        .dash-qa-chev { margin-left: auto; color: ${C.inkMute}; display: inline-flex; }

        /* ── Stat tiles ── */
        .dash-stat { padding: clamp(18px, 2.4vw, 22px); display: flex; flex-direction: column; gap: 10px; }
        .dash-stat-top { display: flex; align-items: center; justify-content: space-between; }
        .dash-stat-ic { width: 34px; height: 34px; border-radius: 10px; background: ${C.paperDeep}; color: ${C.inkSoft}; display: inline-flex; align-items: center; justify-content: center; }
        .dash-stat-val { font-size: clamp(30px, 5vw, 40px); font-weight: 800; letter-spacing: -0.035em; line-height: 1; color: ${C.ink}; font-variant-numeric: tabular-nums; }
        .dash-stat-label { font-size: 12.5px; font-weight: 700; color: ${C.ink}; }
        .dash-stat-hint { font-size: 11.5px; color: ${C.inkMute}; margin-top: 1px; }

        /* ── Section head + ghost button ── */
        .dash-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: clamp(26px, 3.4vw, 38px) 0 16px; }
        .dash-count { font-size: 12px; font-weight: 700; color: ${C.inkMute}; background: ${C.paperDeep}; border-radius: 999px; padding: 2px 10px; }
        .dash-ghost { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: 11px; padding: 9px 15px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }

        /* Instant (motion-independent) hover colour states — safe for reduced-motion */
        .dash-qa:hover { background: ${C.paperDeep}; }
        .dash-qa:hover .dash-qa-ic { background: #ece5d6; }
        .dash-qa:hover .dash-qa-chev { color: ${C.inkSoft}; }
        .dash-ghost:hover { background: ${C.paperDeep}; border-color: ${C.ink}; }

        @media (prefers-reduced-motion: no-preference) {
          .dash-qa { transition: background 160ms ease; }
          .dash-qa-ic, .dash-qa-chev { transition: background 160ms ease, color 160ms ease, transform 220ms ${EASE}; }
          .dash-qa:hover .dash-qa-chev { transform: translateX(2px); }
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

// At-a-glance metric tile — presentation only, values passed from existing data.
function StatTile({ icon, value, label, hint }) {
  return (
    <div className="dash-card dash-stat">
      <div className="dash-stat-top">
        <span className="dash-stat-val">{value}</span>
        <span className="dash-stat-ic"><Icon name={icon} size={17} /></span>
      </div>
      <div>
        <div className="dash-stat-label">{label}</div>
        {hint && <div className="dash-stat-hint">{hint}</div>}
      </div>
    </div>
  );
}
