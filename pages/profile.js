// pages/profile.js
// Realtor profile HUB — the signed-in "home base". One clean surface with four
// sections: Identity + Branding (shared ProfileEditorBody), Listings (same Supabase
// listings + ListingSetupModal — no second data path), and Account status (display
// only). Reachable from the top-bar avatar. Gated behind a Supabase session (RLS).
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon } from '../components/ui';
import { C, R } from '../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { evaluateProfile } from '../lib/accountStatus';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import ProfileEditorBody from '../components/dashboard/ProfileEditorBody';
import StatusBadge from '../components/dashboard/StatusBadge';
import ListingSetupModal from '../components/listings/ListingSetupModal';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/profile', permanent: false } };
  const [{ data: profile }, { data: listings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }),
  ]);
  return {
    props: {
      userId: user.id,
      userEmail: user.email || '',
      initialProfile: profile || { id: user.id, email: user.email },
      initialListings: listings || [],
    },
  };
}

const ACCOUNT_COPY = {
  founder: 'Founder account — free forever. Thank you for being one of the first 50.',
  active: 'Your subscription is active.',
  trial: 'You’re on a free trial. Subscribe before it ends to keep sending reports.',
  lapsed: 'Your trial has ended. Subscribe to resume sending landlord reports.',
  pending: 'Confirm your email to finish setting up your account.',
  unknown: 'Account status will appear here.',
};

const cardStyle = { padding: 'clamp(18px, 4vw, 28px)' };
const cardTitle = { fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 };

export default function ProfileHub({ userId, userEmail, initialProfile, initialListings }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [listings, setListings] = useState(initialListings);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const acct = evaluateProfile(profile);

  const createListing = async (values) => {
    setSaving(true); setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: insErr } = await supabase
        .from('listings').insert({ ...values, profile_id: userId }).select().single();
      if (insErr) { setError(insErr.message); setSaving(false); return; }
      setSaving(false); setModalOpen(false);
      router.push(`/landlord/${data.id}`);
    } catch (e) { setError('Could not create the listing. Please try again.'); setSaving(false); }
  };

  const removeListing = async (l) => {
    if (!window.confirm(`Remove "${l.name || l.address || 'this listing'}"? This can't be undone.`)) return;
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: delErr } = await supabase.from('listings').delete().eq('id', l.id);
      if (delErr) { setError(delErr.message); return; }
      setListings((prev) => prev.filter((x) => x.id !== l.id));
    } catch (e) { setError('Could not remove the listing.'); }
  };

  return (
    <>
      <Head>
        <title>Your profile — Rentletter</title>
        <meta name="description" content="Your realtor profile, branding, listings, and account." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 56px' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Home base</div>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Your profile</h1>
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>
          )}

          <div style={{ display: 'grid', gap: 16 }}>
            {/* IDENTITY + BRANDING */}
            <section className="rl-card" style={cardStyle}>
              <div style={cardTitle}>Profile &amp; branding</div>
              <ProfileEditorBody profile={profile} onSaved={setProfile} />
            </section>

            {/* LISTINGS */}
            <section className="rl-card" style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ ...cardTitle, marginBottom: 0 }}>Your listings ({listings.length})</div>
                <button onClick={() => setModalOpen(true)} className="rl-btn"
                  style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="plus" size={15} /> New listing
                </button>
              </div>
              {listings.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card, fontSize: 13.5, color: C.inkSoft }}>
                  No listings yet. Add one to get a shareable invite link.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {listings.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(12px, 3vw, 16px)' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{l.name || l.address || 'Untitled listing'}</div>
                        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                          {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}{l.bedrooms ? ` · ${l.bedrooms} bed` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <a href={`/landlord/${l.id}`} className="rl-btn"
                          style={{ background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          Open / edit <Icon name="arrow" size={13} color={C.paper} />
                        </a>
                        <button onClick={() => removeListing(l)} title="Remove listing"
                          style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ACCOUNT */}
            <section className="rl-card" style={cardStyle}>
              <div style={cardTitle}>Account</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <StatusBadge profile={profile} />
                <span style={{ fontSize: 13, color: C.inkSoft }}>{userEmail}</span>
              </div>
              <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>{ACCOUNT_COPY[acct.status] || ACCOUNT_COPY.unknown}</p>
            </section>
          </div>
        </div>

        {modalOpen && (
          <ListingSetupModal mode="create" onCancel={() => setModalOpen(false)} onSave={createListing} saving={saving} />
        )}
      </div>
    </>
  );
}
