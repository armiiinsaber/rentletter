// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, useReveal } from '../components/ui';
import { C, R, SH } from '../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { normalizeProvince } from '../lib/provinces';
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
  // Reveal major sections on load / scroll (subtle, matches the header language).
  useReveal(`${listings.length}-${hasListings}`);

  return (
    <>
      <Head>
        <title>Realtor Dashboard — Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 48px' }}>

          {/* Title row */}
          <div className="rl-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                Your listings
              </div>
              <h1 style={{ fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                {hasListings ? `${listings.length} listing${listings.length === 1 ? '' : 's'}` : 'Welcome to Rentletter'}
              </h1>
            </div>
            {hasListings && (
              <button onClick={() => setModalOpen(true)} className="rl-btn"
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '14px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 50 }}>
                <Icon name="plus" size={17} /> New listing
              </button>
            )}
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
              {error}
            </div>
          )}

          {/* Guided empty state */}
          {!hasListings && (
            <section className="rl-card rl-in" style={{ overflow: 'hidden', '--rl-d': '90ms' }}>
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
            <div className="rl-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, '--rl-d': '90ms' }}>
              {listings.map((l) => (
                <a key={l.id} href={`/landlord/${l.id}`} className="rl-card rl-card-lift"
                  style={{ textDecoration: 'none', color: C.ink, padding: 'clamp(18px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                    {l.name || l.address || 'Untitled listing'}
                  </div>
                  <div style={{ fontSize: 13, color: C.inkSoft }}>
                    {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}
                    {formatUnit(l.bedrooms) ? ` · ${formatUnit(l.bedrooms)}` : ''}
                  </div>
                  <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.red, fontWeight: 700 }}>
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
    </>
  );
}
