// pages/landlord/[id].js
// Listing DETAIL — Supabase-backed (RLS), gated. Listing info + landlord
// preferences, edit/delete, the tenant invite link (KV via /api/listings/invite),
// and the listing's APPLICANTS (Supabase: listing_applicants ⨝ applications).
// Decisions (ranked / set_aside + reason / withdrawn) persist to listing_applicants
// under realtor RLS, so they survive sign-out/sign-in.
import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, useReveal } from '../../components/ui';
import { C, R } from '../../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { fetchListingApplicants, attachDocVerifications } from '../../lib/supabaseBridge';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import ListingSetupModal from '../../components/listings/ListingSetupModal';
import ApplicantDocIntel from '../../components/dashboard/ApplicantDocIntel';
import ApplicantDocRequest from '../../components/dashboard/ApplicantDocRequest';
import ChatWidget from '../../components/ChatWidget';
import { formatUnit } from '../../lib/unitType';
import CompareTenants, { toNum, smokerLabel, employmentTypeFromTitle } from '../../components/dashboard/CompareTenants';
import { SET_ASIDE_REASONS, reasonLabel } from '../../lib/setAsideReasons';

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
    // Attach doc_verifications/ai_insight via the shared STRICT two-key helper (same as the
    // applicants-refresh and landlord-report paths), so attribution is identical everywhere.
    await attachDocVerifications(admin, listing.id, initialApplicants, 'dashboard');
  } catch (e) {
    console.error('[listing gSSP] applicants read failed:', e?.message || e);
  }
  return { props: { initialProfile: profile || { id: user.id, email: user.email }, initialListing: listing, initialApplicants } };
}

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 600, minWidth: 0 }}>{label}</span>
    <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
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
  const [editOpen, setEditOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [setAsideFor, setSetAsideFor] = useState(null); // applicant link being set aside
  const [setAsideCode, setSetAsideCode] = useState('');
  const [setAsideNote, setSetAsideNote] = useState('');
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
  // Reveal sections on load + as they scroll into view. Re-run when the applicant set changes
  // so newly-rendered cards get observed.
  useReveal(`${applicants.length}-${compareOpen}-${editOpen}`);

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

  // Always copy the COMPLETE canonical invite URL. The token is the source of truth,
  // so build the URL from it (overrides any partial/stale stored invite_url); fall
  // back to the stored URL only when no token is present.
  const fullInviteUrl = () =>
    (listing.invite_token ? `https://rentletter.ca/apply/${listing.invite_token}` : '') || inviteUrl || '';

  const copy = () => {
    const full = fullInviteUrl();
    if (!full) return;
    navigator.clipboard.writeText(full);
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
      a.href = url; a.download = `ranked-applicants-${new Date().toISOString().slice(0, 10)}.pdf`;
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
      if ('decisionReasonCode' in patch) dbPatch.decision_reason_code = patch.decisionReasonCode;
      if ('decisionNotes' in patch) dbPatch.decision_notes = patch.decisionNotes;
      const { error: upErr } = await supabase.from('listing_applicants').update(dbPatch).eq('id', linkId);
      if (upErr) setError('Could not save your decision: ' + upErr.message);
    } catch (e) {
      setError('Could not save your decision.');
    }
  };

  // Set aside REQUIRES an OHRC-safe screenable reason. Applicant stays in the list,
  // marked + sorted to the bottom — the defensible paper trail.
  const openSetAside = (a) => { setSetAsideFor(a); setSetAsideCode(''); setSetAsideNote(''); };
  const confirmSetAside = () => {
    if (!setAsideFor || !setAsideCode) return;
    setDecision(setAsideFor.linkId, { decisionStatus: 'set_aside', decisionReasonCode: setAsideCode, decisionNotes: setAsideNote.trim() || null });
    setSetAsideFor(null);
  };
  const restoreApplicant = (a) =>
    setDecision(a.linkId, { decisionStatus: 'ranked', decisionReasonCode: null });
  // Remove = genuine tenant WITHDRAWAL only (not a screening decision).
  const withdrawApplicant = (a) => {
    if (!confirm(`Mark ${a.application?.full_name || 'this applicant'} as withdrawn? Use this only if the tenant withdrew — it removes them from your ranked list.`)) return;
    setDecision(a.linkId, { decisionStatus: 'withdrawn', decisionReasonCode: null });
  };

  const l = listing;
  const inviteShareUrl = fullInviteUrl(); // complete URL shown + copied
  const employment = [
    l.pref_employment_full_time && 'Full-time',
    l.pref_employment_contract && 'Contract',
    l.pref_employment_self_employed && 'Self-employed',
    l.pref_employment_part_time && 'Part-time',
  ].filter(Boolean).join(', ') || '—';

  // Pure scorecard-vs-criteria ranking (matches lib/listingReportData). Everyone is
  // in: active best-fit-first, set-aside below, withdrawn excluded.
  const norm = (s) => (s === 'set_aside' ? 'set_aside' : s === 'withdrawn' ? 'withdrawn' : 'ranked');
  const byScore = (x, y) => (y.application?.scorecard?.overall ?? 0) - (x.application?.scorecard?.overall ?? 0);
  const active = applicants.filter((a) => norm(a.decisionStatus) === 'ranked').sort(byScore);
  const setAsideList = applicants.filter((a) => norm(a.decisionStatus) === 'set_aside').sort(byScore);
  const totalApplicants = active.length + setAsideList.length;

  // Normalize the ACTIVE ranked list into the shared Compare shape (screenable facts only;
  // set-aside/withdrawn are excluded by construction — compare is for active ranked tenants).
  const comparePool = active.map((a, idx) => {
    const app = a.application || {};
    const coIncome = app.co_applicant?.annualIncome ?? app.co_applicant?.annual_income;
    return {
      id: a.linkId, rank: idx + 1, name: app.full_name || 'Applicant',
      overall: app.scorecard?.overall ?? null,
      annualIncome: toNum(app.annual_income),
      householdIncome: coIncome != null ? (toNum(app.annual_income) || 0) + (toNum(coIncome) || 0) : null,
      rentToIncome: toNum(app.rent_to_income_ratio),
      jobTenureYears: toNum(app.years_at_job),
      employer: app.employer || null,
      employmentType: employmentTypeFromTitle(app.job_title),
      yearsAtAddress: toNum(app.years_at_previous),
      currentRent: toNum(app.current_rent),
      references: Array.isArray(app.references) ? app.references.length : null,
      moveInDate: app.move_in_date || null,
      occupants: app.number_of_occupants != null ? toNum(app.number_of_occupants) : null,
      smoker: smokerLabel(app.smoker),
      pets: app.pets || null,
    };
  });

  const renderApplicantCard = (a, { rank, top5, isSetAside }) => {
    const app = a.application || {};
    const overall = app.scorecard?.overall;
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
    // Brand red = EMPHASIS on the top picks only; everyone else is neutral. (Previously the
    // non-top applicants got a green left-bar applied purely by rank position, which read as
    // a misleading "good to go" status while the actual best picks looked flagged in red.)
    const borderColor = top5 ? C.red : C.ruleDark;
    return (
      <div key={a.linkId} style={{
        minWidth: 0,
        background: isSetAside ? C.paperDeep : C.card, border: `1px solid ${top5 ? C.red : C.rule}`, borderLeft: `4px solid ${borderColor}`,
        borderRadius: R.card, padding: 'clamp(14px, 3vw, 18px)', opacity: isSetAside ? 0.94 : 1,
        boxShadow: top5 ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {rank != null && (
            <span aria-label={`Rank ${rank}`} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: top5 ? C.red : C.paperDeep, color: top5 ? C.paper : C.inkSoft, border: `1px solid ${top5 ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
              {rank}
            </span>
          )}
          <span aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: isSetAside ? C.inkMute : C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
            {initialsOf(app.full_name)}
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{app.full_name || 'Applicant'}</span>
              {top5 && <span style={{ fontSize: 10, color: C.paper, background: C.red, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>TOP 5</span>}
              {isSetAside && <span style={{ fontSize: 10, color: C.inkSoft, background: C.rule, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>SET ASIDE</span>}
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>
              {[app.job_title, app.employer].filter(Boolean).join(' · ') || 'Role not listed'}
              {app.annual_income ? ` · $${Number(app.annual_income).toLocaleString()}/yr` : ''}
            </div>
            <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3, fontFamily: 'monospace' }}>{app.application_number}</div>
            {isSetAside && (
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6, padding: '6px 10px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
                <strong style={{ color: C.ink }}>Set aside:</strong> {reasonLabel(a.decisionReasonCode)}
                {a.decisionNotes ? ` — ${a.decisionNotes}` : ''}
              </div>
            )}
          </div>
          {overall != null && (
            <div style={{ textAlign: 'right', minWidth: 54 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, lineHeight: 1 }}>
                {Number(overall).toFixed(1)}<span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}> / 5</span>
              </div>
              <div style={{ fontSize: 9, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>Scorecard</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {isSetAside ? (
              <button onClick={() => restoreApplicant(a)}
                style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Restore
              </button>
            ) : (
              <button onClick={() => openSetAside(a)} title="Record a screenable reason to de-prioritize"
                style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Set aside
              </button>
            )}
            <button onClick={() => withdrawApplicant(a)} title="Tenant withdrew"
              style={{ background: 'transparent', color: C.inkMute, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Withdrew
            </button>
          </div>
        </div>
        {details.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 18px' }}>
            {details.map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', marginTop: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        <ApplicantDocIntel
          listingId={listing.id}
          linkId={a.linkId}
          applicationId={app.id}
          applicantName={app.full_name}
          initialVerifications={a.docVerifications}
          initialInsight={a.aiInsight}
          onSaved={(patch) => setApplicants((prev) => prev.map((x) => (x.linkId === a.linkId ? { ...x, ...patch } : x)))}
        />
        {/* ALTERNATIVE to uploading yourself: request the documents from the finalist tenant, who
            uploads via a secure link. Coexists with ApplicantDocIntel above. */}
        <ApplicantDocRequest listingId={listing.id} linkId={a.linkId} applicationId={app.id} />
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>{l.name || 'Listing'} — Rentletter</title>
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 48px' }}>
          <a href="/landlord" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, textDecoration: 'none', marginBottom: 18 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> All listings
          </a>

          {/* Title + actions */}
          <div className="rl-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.1, overflowWrap: 'anywhere' }}>
                {l.name || l.address || 'Untitled listing'}
              </h1>
              <div style={{ fontSize: 14, color: C.inkSoft, marginTop: 6, overflowWrap: 'anywhere' }}>
                {l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}/mo` : 'Rent not set'}{formatUnit(l.bedrooms) ? ` · ${formatUnit(l.bedrooms)}` : ''}
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

          <div className="rl-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16, alignItems: 'start', marginBottom: 16, '--rl-d': '90ms' }}>
            {/* Unit + preferences */}
            <section className="rl-card" style={{ minWidth: 0, padding: 'clamp(18px, 3vw, 26px)' }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Unit & preferences</div>
              <Row label="Address" value={l.address || '—'} />
              <Row label="Monthly rent" value={l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : '—'} />
              <Row label="Unit type" value={formatUnit(l.bedrooms) || '—'} />
              <Row label="Pets allowed" value={l.allows_pets === 'yes' ? 'Yes' : l.allows_pets === 'no' ? 'No' : '—'} />
              <Row label="Smoking" value={l.allows_smoking === 'yes' ? 'Allowed' : l.allows_smoking === 'outdoor' ? 'Outdoor only' : 'Not allowed'} />
              <Row label="Parking" value={l.parking_included === 'yes' ? 'Included' : 'Not included'} />
              <Row label="EV parking" value={l.ev_parking === 'yes' ? 'Yes' : 'No'} />
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
                  {l.landlord_name && <div style={{ fontSize: 13.5, color: C.ink, overflowWrap: 'anywhere' }}>{l.landlord_name}</div>}
                  {l.landlord_email && <div style={{ fontSize: 13, color: C.inkSoft, overflowWrap: 'anywhere' }}>{l.landlord_email}</div>}
                  {l.landlord_phone && <div style={{ fontSize: 13, color: C.inkSoft, overflowWrap: 'anywhere' }}>{l.landlord_phone}</div>}
                </div>
              )}
            </section>

            {/* Invite link */}
            <section className="rl-card" style={{ minWidth: 0, padding: 'clamp(18px, 3vw, 26px)' }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Invite link</div>
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
                Share this link with prospective tenants. They fill the application and it appears below automatically.
              </p>
              {inviteShareUrl ? (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input readOnly value={inviteShareUrl} onFocus={(e) => e.target.select()}
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

          {/* ── APPLICANTS — single ranked list (everyone, best fit first) ── */}
          <section className="rl-card rl-in" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Ranked applicants</h2>
              <span style={{ fontSize: 12.5, color: C.inkMute }}>{totalApplicants} total{setAsideList.length ? ` · ${setAsideList.length} set aside` : ''}</span>
            </div>

            {totalApplicants === 0 ? (
              <div style={{ padding: 'clamp(24px, 5vw, 40px)', textAlign: 'center', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card, marginTop: 12 }}>
                <div style={{ display: 'inline-flex', marginBottom: 12, color: C.inkMute }}><Icon name="users" size={28} /></div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No applicants yet</div>
                <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, maxWidth: 380, margin: '0 auto' }}>
                  Share your invite link above. As tenants apply, they appear here ranked against your stated criteria — best fit first.
                </p>
              </div>
            ) : compareOpen ? (
              <CompareTenants pool={comparePool} onClose={() => setCompareOpen(false)} />
            ) : (
              <>
                <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
                  Everyone who applied, ranked against your stated criteria. Your <strong>top 5</strong> are highlighted. To de-prioritize someone, <strong>Set aside</strong> with a screenable reason — they stay in the list, sorted to the bottom.
                </p>
                {active.length >= 2 && (
                  <button onClick={() => setCompareOpen(true)} className="rl-btn"
                    style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    ⇄ Compare top tenants
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
                  {active.map((a, idx) => (
                    <React.Fragment key={a.linkId}>
                      {idx === 5 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                          <div style={{ flex: 1, height: 1, background: C.rule }} />
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Below your top 5</span>
                          <div style={{ flex: 1, height: 1, background: C.rule }} />
                        </div>
                      )}
                      {renderApplicantCard(a, { rank: idx + 1, top5: idx < 5, isSetAside: false })}
                    </React.Fragment>
                  ))}
                </div>

                {setAsideList.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Set aside ({setAsideList.length})</div>
                    <p style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>
                      De-prioritized for the screenable reasons noted. Still shown to your landlord, at the bottom.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
                      {setAsideList.map((a) => renderApplicantCard(a, { rank: null, top5: false, isSetAside: true }))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── PRESENT TO LANDLORD (appears once anyone has applied) ── */}
          {totalApplicants > 0 && (
            <section className="rl-card rl-in" style={{ padding: 'clamp(18px, 3vw, 28px)', marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Present to landlord</div>
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14, maxWidth: 560 }}>
                Present the full ranked list of {totalApplicants} applicant{totalApplicants === 1 ? '' : 's'} (top 5 highlighted{setAsideList.length ? `, ${setAsideList.length} set aside` : ''}) as a branded PDF report or a paste-ready message.
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

        {editOpen && (
          <ListingSetupModal mode="edit" initial={listing} onCancel={() => setEditOpen(false)} onSave={saveEdit} saving={saving} />
        )}

        {/* Set-aside reason modal — an OHRC-safe, screenable reason is REQUIRED. */}
        {setAsideFor && (
          <div onClick={() => setSetAsideFor(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,32px)', zIndex: 100 }}>
            <div onClick={(e) => e.stopPropagation()} className="rl-modal"
              style={{ background: C.paper, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}`, borderRadius: R.modal, padding: 'clamp(20px,4vw,28px)' }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Set aside</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
                {setAsideFor.application?.full_name || 'Applicant'}
              </h3>
              <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 16 }}>
                Choose a screenable reason. They stay in the list (sorted to the bottom) with this reason recorded — your defensible paper trail. This is not a rejection.
              </p>
              <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Reason (required)</label>
              <select value={setAsideCode} onChange={(e) => setSetAsideCode(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', marginBottom: 14 }}>
                <option value="">Select a reason…</option>
                {SET_ASIDE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
              <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Note {setAsideCode === 'other_screenable' ? '(required)' : '(optional)'}
              </label>
              <textarea value={setAsideNote} onChange={(e) => setSetAsideNote(e.target.value)} rows={3}
                placeholder="e.g. stated income $42k vs $60k minimum"
                style={{ width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }} />
              <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 16 }}>
                Use only screenable facts (income, references, tenure, occupancy). Never protected grounds.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={confirmSetAside}
                  disabled={!setAsideCode || (setAsideCode === 'other_screenable' && !setAsideNote.trim())}
                  style={{ flex: 1, background: (!setAsideCode || (setAsideCode === 'other_screenable' && !setAsideNote.trim())) ? C.ruleDark : C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px', fontSize: 14, fontWeight: 700, cursor: (!setAsideCode || (setAsideCode === 'other_screenable' && !setAsideNote.trim())) ? 'not-allowed' : 'pointer' }}>
                  Set aside
                </button>
                <button onClick={() => setSetAsideFor(null)}
                  style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '13px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* In-app product-help assistant (how-to only; never advises on tenant selection). */}
      <ChatWidget mode="dashboard" />
    </>
  );
}
