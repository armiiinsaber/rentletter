// pages/landlord/[id].js
// Listing DETAIL — Supabase-backed (RLS), gated. Listing info + landlord
// preferences, edit/delete, the tenant invite link (KV via /api/listings/invite),
// and the listing's APPLICANTS (Supabase: listing_applicants ⨝ applications).
// Decisions (favourite/reject/priority/notes) persist to listing_applicants under
// realtor RLS, so they survive sign-out/sign-in.
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { fetchListingApplicants } from '../../lib/supabaseBridge';
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
  // Ownership confirmed by RLS above → read applicant bodies with the service-role
  // client (applications has no realtor RLS). owner_token is stripped in the helper.
  let initialApplicants = [];
  try {
    const admin = getSupabaseAdminClient();
    initialApplicants = await fetchListingApplicants(admin, listing.id);
  } catch (e) {
    console.error('[listing gSSP] applicants read failed:', e?.message || e);
  }
  return { props: { initialProfile: profile || { id: user.id, email: user.email }, initialListing: listing, initialApplicants } };
}

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, textAlign: 'right' }}>{value}</span>
  </div>
);

const yn = (b) => (b ? 'Yes' : 'No');

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export default function ListingDetail({ initialProfile, initialListing, initialApplicants }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [listing, setListing] = useState(initialListing);
  const [applicants, setApplicants] = useState(initialApplicants || []);
  const [tab, setTab] = useState('all'); // 'all' | 'shortlist'
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState(initialListing.invite_url || '');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addRL, setAddRL] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [textBusy, setTextBusy] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  // Refresh applicants from Supabase (after adding by RL).
  const refreshApplicants = async () => {
    try {
      const r = await fetch(`/api/listings/applicants?listingId=${encodeURIComponent(listing.id)}`);
      const j = await r.json();
      if (r.ok && Array.isArray(j.applicants)) setApplicants(j.applicants);
    } catch (e) { /* keep current */ }
  };

  const addApplicant = async () => {
    const num = addRL.trim().toUpperCase();
    if (!num) return;
    setAddLoading(true);
    setError('');
    try {
      const r = await fetch('/api/listings/add-applicant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, applicationNumber: num }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not add that application number.'); setAddLoading(false); return; }
      setAddRL('');
      await refreshApplicants();
    } catch (e) {
      setError('Could not add that application number.');
    }
    setAddLoading(false);
  };

  // ── Landlord comms (Group 2-4) ──
  const downloadPdf = async () => {
    setPdfBusy(true); setSendMsg('');
    try {
      const r = await fetch(`/api/listings/report-pdf?listingId=${encodeURIComponent(listing.id)}`);
      if (!r.ok) { const j = await r.json().catch(() => ({})); setSendMsg(j?.error || 'Could not generate the PDF.'); setPdfBusy(false); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `shortlist-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setSendMsg('Could not generate the PDF.'); }
    setPdfBusy(false);
  };

  const copyText = async () => {
    setTextBusy(true); setSendMsg('');
    try {
      const r = await fetch('/api/listings/report-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const j = await r.json();
      if (!r.ok || !j.text) { setSendMsg(j?.error || 'Could not compose the message.'); setTextBusy(false); return; }
      await navigator.clipboard.writeText(j.text);
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 2200);
    } catch (e) { setSendMsg('Could not compose the message.'); }
    setTextBusy(false);
  };

  const sendEmail = async () => {
    setSending(true); setSendMsg('');
    try {
      const r = await fetch('/api/listings/send-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const j = await r.json();
      setSendMsg(r.ok ? `Sent to ${j.sentTo || listing.landlord_email}.` : (j?.error || 'Email send failed.'));
    } catch (e) { setSendMsg('Email send failed.'); }
    setSending(false);
  };

  // Persist a decision to listing_applicants (realtor RLS). Optimistic local update.
  const setDecision = async (linkId, patch) => {
    const changedAt = new Date().toISOString();
    setApplicants((prev) => prev.map((a) => (a.linkId === linkId ? { ...a, ...patch, decisionChangedAt: changedAt } : a)));
    try {
      const supabase = getSupabaseBrowserClient();
      const dbPatch = { decision_changed_at: changedAt };
      if ('decisionStatus' in patch) dbPatch.decision_status = patch.decisionStatus;
      if ('decisionPriority' in patch) dbPatch.decision_priority = patch.decisionPriority;
      if ('decisionNotes' in patch) dbPatch.decision_notes = patch.decisionNotes;
      const { error: upErr } = await supabase.from('listing_applicants').update(dbPatch).eq('id', linkId);
      if (upErr) setError('Could not save your decision: ' + upErr.message);
    } catch (e) {
      setError('Could not save your decision.');
    }
  };

  const toggleShortlist = (a) =>
    setDecision(a.linkId, { decisionStatus: a.decisionStatus === 'shortlist' ? 'none' : 'shortlist', decisionPriority: a.decisionStatus === 'shortlist' ? null : a.decisionPriority });
  const toggleReject = (a) =>
    setDecision(a.linkId, { decisionStatus: a.decisionStatus === 'reject' ? 'none' : 'reject', decisionPriority: null });

  const l = listing;
  const employment = [
    l.pref_employment_full_time && 'Full-time',
    l.pref_employment_contract && 'Contract',
    l.pref_employment_self_employed && 'Self-employed',
    l.pref_employment_part_time && 'Part-time',
  ].filter(Boolean).join(', ') || '—';

  // Rank the shortlist exactly like the PDF/text report (lib/listingReportData
  // rankShortlist): top-priority first, then scorecard overall desc.
  const rankShortlist = (list) => [...list].sort((a, b) => {
    const pa = a.decisionPriority === 'top' ? 0 : 1;
    const pb = b.decisionPriority === 'top' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (b.application?.scorecard?.overall ?? 0) - (a.application?.scorecard?.overall ?? 0);
  });
  const shortlist = rankShortlist(applicants.filter((a) => a.decisionStatus === 'shortlist'));
  const visible = tab === 'shortlist' ? shortlist : applicants;

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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start', marginBottom: 16 }}>
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

            {/* Invite link */}
            <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 26px)' }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Invite link</div>
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
                Share this link with prospective tenants. They fill the application and it appears below automatically.
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

              {/* Add an existing applicant by RL number */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>Already have an application number?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={addRL} onChange={(e) => setAddRL(e.target.value)} placeholder="RL-2026-XXXX-XXXX"
                    onKeyDown={(e) => e.key === 'Enter' && addApplicant()}
                    style={{ flex: 1, minWidth: 180, padding: '11px 13px', fontSize: 13, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }} />
                  <button onClick={addApplicant} disabled={addLoading || !addRL.trim()} className="rl-btn"
                    style={{ background: (addLoading || !addRL.trim()) ? C.ruleDark : C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: (addLoading || !addRL.trim()) ? 'not-allowed' : 'pointer' }}>
                    {addLoading ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ── APPLICANTS ─────────────────────────────────────── */}
          <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Applicants</h2>
              <span style={{ fontSize: 12.5, color: C.inkMute }}>{applicants.length} total · {shortlist.length} shortlisted</span>
            </div>

            {applicants.length === 0 ? (
              <div style={{ padding: 'clamp(24px, 5vw, 40px)', textAlign: 'center', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card }}>
                <div style={{ display: 'inline-flex', marginBottom: 12, color: C.inkMute }}><Icon name="users" size={28} /></div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No applicants yet</div>
                <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, maxWidth: 380, margin: '0 auto' }}>
                  Share your invite link above. As tenants apply, their applications appear here for you to review and shortlist.
                </p>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 18, overflowX: 'auto' }}>
                  {[
                    { id: 'all', label: `All applicants (${applicants.length})` },
                    { id: 'shortlist', label: `My shortlist (${shortlist.length})` },
                  ].map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      style={{
                        background: 'transparent', border: 'none', padding: '12px 18px', fontSize: 14.5,
                        fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? C.ink : C.inkSoft,
                        borderBottom: tab === t.id ? `3px solid ${C.red}` : '3px solid transparent',
                        marginBottom: -1, whiteSpace: 'nowrap', cursor: 'pointer', minHeight: 44,
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Next-step CTA: guide from the All-applicants pass into the ranked shortlist + send. */}
                {tab === 'all' && shortlist.length > 0 && (
                  <button onClick={() => setTab('shortlist')}
                    style={{
                      width: '100%', marginBottom: 16, textAlign: 'left',
                      background: '#f0f7f3', border: `1px solid ${C.green}`, borderRadius: R.card,
                      padding: 'clamp(13px, 3vw, 16px) 18px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: C.ink }}>Review your shortlist ({shortlist.length}) →</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>Compare your picks ranked best-fit-first, then send a PDF or text to your landlord.</span>
                    </span>
                    <Icon name="arrow" size={18} color={C.green} />
                  </button>
                )}

                {visible.length === 0 ? (
                  <div style={{ padding: 'clamp(20px, 4vw, 32px)', textAlign: 'center', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Your shortlist is empty.</div>
                    <div style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5 }}>Favourite applicants under “All applicants” and they’ll appear here.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {visible.map((a, idx) => {
                      const app = a.application || {};
                      const overall = app.scorecard?.overall;
                      const shortlisted = a.decisionStatus === 'shortlist';
                      const rejected = a.decisionStatus === 'reject';
                      const rankView = tab === 'shortlist'; // ranked 1→N high to low
                      const rank = idx + 1;
                      const topPick = rankView && idx === 0;
                      const borderColor = topPick ? C.red : shortlisted ? C.green : rejected ? C.red : C.rule;
                      const bg = shortlisted ? '#f0f7f3' : rejected ? '#fef2f0' : C.card;
                      // Labelled comparison facts (shortlist tab) — every value keeps its label.
                      const money = (n) => (n != null && n !== '' ? `$${Number(n).toLocaleString()}` : null);
                      const coIncome = app.co_applicant?.annualIncome ?? app.co_applicant?.annual_income;
                      const smokerLabel = app.smoker ? ({ no: 'Non-smoker', outdoor: 'Outdoor only', yes: 'Yes' }[app.smoker] || String(app.smoker)) : null;
                      const details = [
                        ['Income', app.annual_income ? `${money(app.annual_income)}/yr` : null],
                        ['Household income', coIncome ? `${money((Number(app.annual_income) || 0) + Number(coIncome))}/yr (joint)` : null],
                        ['Employer', app.employer || null],
                        ['Tenure', app.years_at_job ? `${app.years_at_job} yrs` : null],
                        ['Rent-to-income', app.rent_to_income_ratio != null ? `${app.rent_to_income_ratio}%` : null],
                        ['Current rent', app.current_rent ? `${money(app.current_rent)}/mo` : null],
                        ['Years at address', app.years_at_previous ? `${app.years_at_previous} yrs` : null],
                        ['Move-in', app.move_in_date || null],
                        ['Occupants', app.number_of_occupants != null ? String(app.number_of_occupants) : null],
                        ['Smoker', smokerLabel],
                        ['Pets', app.pets || 'None'],
                        ['References', Array.isArray(app.references) ? `${app.references.length} provided` : null],
                      ].filter(([, v]) => v != null && v !== '');
                      return (
                        <div key={a.linkId} style={{
                          background: bg, border: `1px solid ${topPick ? C.red : C.rule}`, borderLeft: `4px solid ${borderColor}`,
                          borderRadius: R.card, padding: 'clamp(14px, 3vw, 18px)',
                          boxShadow: topPick ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                          {rankView && (
                            <span aria-label={`Rank ${rank}`} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: topPick ? C.red : C.paperDeep, color: topPick ? C.paper : C.inkSoft, border: `1px solid ${topPick ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
                              {rank}
                            </span>
                          )}
                          <span aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                            {initialsOf(app.full_name)}
                          </span>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{app.full_name || 'Applicant'}</span>
                              {topPick && <span style={{ fontSize: 10, color: C.paper, background: C.red, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>TOP PICK</span>}
                              {shortlisted && !topPick && <span style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: '0.08em' }}>★ FAVOURITE</span>}
                              {rejected && <span style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: '0.08em' }}>✕ REJECTED</span>}
                              {app.revoked && <span style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.08em' }}>REVOKED</span>}
                            </div>
                            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>
                              {[app.job_title, app.employer].filter(Boolean).join(' · ') || 'Role not listed'}
                              {app.annual_income ? ` · $${Number(app.annual_income).toLocaleString()}/yr` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3, fontFamily: 'monospace' }}>{app.application_number}</div>
                          </div>
                          {overall != null && (
                            <div style={{ textAlign: 'right', minWidth: 54 }}>
                              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, lineHeight: 1 }}>
                                {Number(overall).toFixed(1)}<span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}> / 5</span>
                              </div>
                              <div style={{ fontSize: 9, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>Scorecard</div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={() => toggleReject(a)} title="Reject"
                              style={{ background: rejected ? C.red : 'transparent', color: rejected ? C.paper : C.red, border: `1px solid ${C.red}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="x" size={15} color={rejected ? C.paper : C.red} strokeWidth={2.5} />
                            </button>
                            <button onClick={() => toggleShortlist(a)} title="Favourite"
                              style={{ background: shortlisted ? C.green : 'transparent', color: shortlisted ? C.paper : C.green, border: `1px solid ${C.green}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Icon name="check" size={15} color={shortlisted ? C.paper : C.green} strokeWidth={2.5} /> {shortlisted ? 'Favourited' : 'Favourite'}
                            </button>
                          </div>
                          </div>
                          {rankView && details.length > 0 && (
                            <div style={{
                              marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}`,
                              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 18px',
                            }}>
                              {details.map(([label, value]) => (
                                <div key={label} style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                                  <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', marginTop: 1 }}>{value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── SEND TO LANDLORD (appears once there's a shortlist) ── */}
          {shortlist.length > 0 && (
            <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 28px)', marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Send to landlord</div>
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14, maxWidth: 560 }}>
                Share your {shortlist.length} shortlisted candidate{shortlist.length === 1 ? '' : 's'} as a branded PDF report or a paste-ready message.
              </p>

              {/* Landlord contact captured on the listing */}
              <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
                <span style={{ color: C.inkMute, fontWeight: 600 }}>Landlord client: </span>
                {(l.landlord_name || l.landlord_email || l.landlord_phone) ? (
                  <span style={{ color: C.ink }}>
                    {[l.landlord_name, l.landlord_email, l.landlord_phone].filter(Boolean).join(' · ')}
                  </span>
                ) : (
                  <span style={{ color: C.inkMute }}>Not set — add it via <button onClick={() => setEditOpen(true)} style={{ background: 'transparent', border: 'none', color: C.red, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}>Edit listing</button> to email them.</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={downloadPdf} disabled={pdfBusy} className="rl-btn"
                  style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: pdfBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="doc" size={16} color={C.paper} /> {pdfBusy ? 'Generating…' : 'Generate PDF'}
                </button>
                <button onClick={copyText} disabled={textBusy} className="rl-btn"
                  style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: textBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="copy" size={16} /> {textBusy ? 'Composing…' : textCopied ? 'Copied!' : 'Copy text for landlord'}
                </button>
                <button onClick={sendEmail} disabled={sending || !l.landlord_email} title={l.landlord_email ? '' : "Add the landlord's email first"} className="rl-btn"
                  style={{ background: (sending || !l.landlord_email) ? C.ruleDark : C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: (sending || !l.landlord_email) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="mail" size={16} color={C.paper} /> {sending ? 'Sending…' : 'Email report'}
                </button>
              </div>
              {sendMsg && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.inkSoft }}>{sendMsg}</div>
              )}
            </section>
          )}
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
