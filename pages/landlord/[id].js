// pages/landlord/[id].js
// Listing DETAIL — Supabase-backed (RLS), gated. Shows listing info + landlord
// preferences, edit/delete, the tenant invite link (KV via /api/listings/invite),
// and an empty applicants state (tenant→listing flow arrives in Stage 2).
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import ProfileEditorModal from '../../components/dashboard/ProfileEditorModal';
import ListingSetupModal from '../../components/listings/ListingSetupModal';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { redirect: { destination: '/signin?next=/landlord', permanent: false } };
  }
  const id = ctx.params.id;
  const [{ data: profile }, { data: listing }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('listings').select('*').eq('id', id).single(), // RLS: only owner sees it
  ]);
  if (!listing) {
    return { redirect: { destination: '/landlord', permanent: false } };
  }
  return { props: { initialProfile: profile || { id: user.id, email: user.email }, initialListing: listing } };
}

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, textAlign: 'right' }}>{value}</span>
  </div>
);

const yn = (b) => (b ? 'Yes' : 'No');

export default function ListingDetail({ initialProfile, initialListing }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [listing, setListing] = useState(initialListing);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState(initialListing.invite_url || '');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const saveEdit = async (values) => {
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: upErr } = await supabase
        .from('listings').update(values).eq('id', listing.id).select().single();
      if (upErr) { setError(upErr.message); setSaving(false); return; }
      setListing(data);
      setSaving(false);
      setEditOpen(false);
    } catch (e) {
      setError('Could not save changes.'); setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: delErr } = await supabase.from('listings').delete().eq('id', listing.id);
      if (delErr) { setError(delErr.message); return; }
      router.push('/landlord');
    } catch (e) {
      setError('Could not delete the listing.');
    }
  };

  const getInvite = async (regenerate = false) => {
    setInviteLoading(true);
    setError('');
    try {
      const r = await fetch('/api/listings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, regenerate }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not create invite link.'); setInviteLoading(false); return; }
      setInviteUrl(j.url);
      setListing((l) => ({ ...l, invite_token: j.token, invite_url: j.url }));
      setInviteLoading(false);
    } catch (e) {
      setError('Could not create invite link.'); setInviteLoading(false);
    }
  };

  const copy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const l = listing;
  const employment = [
    l.pref_employment_full_time && 'Full-time',
    l.pref_employment_contract && 'Contract',
    l.pref_employment_self_employed && 'Self-employed',
    l.pref_employment_part_time && 'Part-time',
  ].filter(Boolean).join(', ') || '—';

  return (
    <>
      <Head>
        <title>{l.name || 'Listing'} — Rentletter</title>
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} onEditProfile={() => setProfileOpen(true)} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 48px' }}>
          <a href="/landlord" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, textDecoration: 'none', marginBottom: 18 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> All listings
          </a>

          {/* Title + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                {l.name || l.address || 'Untitled listing'}
              </h1>
              <div style={{ fontSize: 14, color: C.inkSoft, marginTop: 6 }}>
                {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}{l.bedrooms ? ` · ${l.bedrooms} bed` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setEditOpen(true)} className="rl-btn"
                style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Edit
              </button>
              <button onClick={remove}
                style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: R.ctrl, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
            {/* Unit + preferences */}
            <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 26px)' }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Unit & preferences</div>
              <Row label="Address" value={l.address || '—'} />
              <Row label="Monthly rent" value={l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : '—'} />
              <Row label="Bedrooms" value={l.bedrooms || '—'} />
              <Row label="Pets" value={l.allows_pets === 'yes' ? 'Allowed' : l.allows_pets === 'no' ? 'Not allowed' : 'No preference'} />
              <Row label="Smoking" value={l.allows_smoking === 'yes' ? 'Allowed' : l.allows_smoking === 'outdoor' ? 'Outdoor only' : 'Not allowed'} />
              <Row label="Parking" value={l.parking_included === 'yes' ? 'Included' : 'Not included'} />
              <Row label="Min annual income" value={l.pref_min_annual_income ? `$${Number(l.pref_min_annual_income).toLocaleString()}` : '—'} />
              <Row label="Max rent-to-income" value={l.pref_rent_to_income_max_pct != null ? `${l.pref_rent_to_income_max_pct}%` : '—'} />
              <Row label="Min years at job" value={l.pref_min_years_at_job != null ? l.pref_min_years_at_job : '—'} />
              <Row label="Employment" value={employment} />
              <Row label="Min lease term" value={l.pref_min_lease_term_months != null ? `${l.pref_min_lease_term_months} mo` : '—'} />
              <Row label="Max occupants" value={l.pref_max_occupants != null ? l.pref_max_occupants : '—'} />
              <Row label="Landlord reference req." value={yn(l.pref_requires_landlord_reference)} />
              <Row label="Employer verification req." value={yn(l.pref_requires_employer_verification)} />
              <Row label="Guarantor accepted" value={yn(l.pref_guarantor_accepted)} />
              {l.pref_notes && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                  <strong style={{ color: C.ink }}>Notes:</strong> {l.pref_notes}
                </div>
              )}
              {(l.landlord_name || l.landlord_email || l.landlord_phone) && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Landlord client</div>
                  {l.landlord_name && <div style={{ fontSize: 13.5, color: C.ink }}>{l.landlord_name}</div>}
                  {l.landlord_email && <div style={{ fontSize: 13, color: C.inkSoft }}>{l.landlord_email}</div>}
                  {l.landlord_phone && <div style={{ fontSize: 13, color: C.inkSoft }}>{l.landlord_phone}</div>}
                </div>
              )}
            </section>

            {/* Applicants area (empty in Stage 1) + invite link */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Invite link */}
              <div className="rl-card" style={{ padding: 'clamp(18px, 3vw, 26px)' }}>
                <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Invite link</div>
                <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
                  Share this link with prospective tenants. They fill the application and it appears here automatically.
                </p>
                {inviteUrl ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input readOnly value={inviteUrl}
                        style={{ flex: 1, minWidth: 200, padding: '11px 13px', fontSize: 13, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paperDeep, color: C.ink, outline: 'none' }} />
                      <button onClick={copy} className="rl-btn"
                        style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <button onClick={() => getInvite(true)} disabled={inviteLoading}
                      style={{ marginTop: 10, background: 'transparent', border: 'none', color: C.inkMute, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                      {inviteLoading ? 'Working…' : 'Regenerate link'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => getInvite(false)} disabled={inviteLoading} className="rl-btn"
                    style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {inviteLoading ? 'Creating…' : <><Icon name="link" size={16} /> Get invite link</>}
                  </button>
                )}
              </div>

              {/* Applicants empty state */}
              <div className="rl-card" style={{ padding: 'clamp(24px, 5vw, 40px)', textAlign: 'center', background: C.paperDeep, border: `1px dashed ${C.ruleDark}` }}>
                <div style={{ display: 'inline-flex', marginBottom: 12, color: C.inkMute }}><Icon name="users" size={28} /></div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No applicants yet</div>
                <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, maxWidth: 360, margin: '0 auto' }}>
                  Share your invite link above. As tenants apply, their applications will appear here for you to review and shortlist.
                </p>
              </div>
            </section>
          </div>
        </div>

        {profileOpen && (
          <ProfileEditorModal profile={profile} onClose={() => setProfileOpen(false)} onSaved={(p) => setProfile(p)} />
        )}
        {editOpen && (
          <ListingSetupModal mode="edit" initial={listing} onCancel={() => setEditOpen(false)} onSave={saveEdit} saving={saving} />
        )}
      </div>
    </>
  );
}
