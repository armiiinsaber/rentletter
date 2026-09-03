// components/dashboard/ListingView.js
// ONE listing — extracted verbatim from pages/landlord/[id].js so the real page (Supabase SSR)
// and /demo/dashboard (in-memory fixture) render the SAME component. All I/O goes through
// useAdapter() (lib/dashboardAdapter).
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, TickMeter, useReveal } from '../../components/ui';
import { C, R } from '../../components/theme';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import ListingSetupModal from '../../components/listings/ListingSetupModal';
import ApplicantDocIntel from '../../components/dashboard/ApplicantDocIntel';
import ApplicantDocRequest from '../../components/dashboard/ApplicantDocRequest';
import ScreeningChecklist from '../../components/dashboard/ScreeningChecklist';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import { computeFit, compareFit } from '../../lib/fitScore';
import Paywall from './Paywall';
import { getEntitlement } from '../../lib/entitlements';
import { signingName, cleanSignature, SIGNATURE_MAX } from '../../lib/reportSignature';
import { AnimatedScore, useFlip, VerifiedMark, ReportDeparture, MotionStyles } from '../motion';
import SwipeCard from '../motion/swipe';
import { DURATION, prefersReducedMotion } from '../../lib/motion';
import ChatWidget from '../../components/ChatWidget';
import { formatUnit } from '../../lib/unitType';
import { editedAfterVerification } from '../../lib/profileEdits';
import CompareTenants, { toNum, smokerLabel, employmentTypeFromTitle } from '../../components/dashboard/CompareTenants';
import { SET_ASIDE_REASONS, reasonLabel } from '../../lib/setAsideReasons';
import { synthesisLine } from '../../lib/applicantSynthesis';
import { applicantState } from '../../lib/applicantState';
import { reportEvent } from '../../lib/clientEvents';
import { DECISION_STATUS, isWithdrawn, isActive, isSetAside as isSetAsideApplicant, isFinalist } from '../../lib/listingApplicantsVocabulary';
import ReferModal from '../../components/dashboard/ReferModal';
import ReferralCaution from '../../components/dashboard/ReferralCaution';
import NoticedCards from '../../components/dashboard/NoticedCards';
import { OPEN_EVENT } from '../../components/dashboard/AssistantBell';
import { GO_EVENT } from '../../components/dashboard/actionNav';
import { patchSignalsListing } from '../../lib/assistantStore';
import { narrateApplicants } from '../../lib/noticed';
import { useAdapter } from '../../lib/dashboardAdapter';

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

export default function ListingView({ initialProfile, initialListing, initialApplicants }) {
  const adapter = useAdapter();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  // Access verdict (lib/entitlements.js) — read only; the paywall replaces the page when false.
  const entitlement = getEntitlement(profile); const locked = !entitlement.canUseProduct;
  const [listing, setListing] = useState(initialListing);
  const [applicants, setApplicants] = useState(initialApplicants || []);
  // Realtor→realtor handoff: referrals this realtor has sent for applicants on this listing
  // (keyed by linkId) + the applicant being referred right now.
  const [referrals, setReferrals] = useState({});
  const [referFor, setReferFor] = useState(null);
  // "Rentletter noticed" card actions: focus an applicant's document request (optionally as a
  // renewal) or email the report — the same things the buttons below do.
  const [focusDocFor, setFocusDocFor] = useState(null); // { linkId, renew }
  // ── Per-applicant reviewed state (db/reviewed-at.sql). An applicant is "reviewed" the first
  // time the realtor OPENS their card here — never on page load, never by scrolling past.
  // Every card rests collapsed (name, score, verified state, one line of synthesis). ONE card is
  // open at a time: opening another closes the first. Opening records the review.
  const [openId, setOpenId] = useState(null);
  // Sections inside the open card, keyed `${linkId}:${section}`; unset means the section default.
  const [sectionState, setSectionState] = useState({});
  const sectionOpen = (linkId, key, def) => { const v = sectionState[`${linkId}:${key}`]; return v == null ? def : v; };
  const toggleSection = (linkId, key, def) => setSectionState((m) => ({ ...m, [`${linkId}:${key}`]: !sectionOpen(linkId, key, def) }));
  const tracking = applicants.some((a) => a.reviewTracking);
  const isUnreviewed = (a) => a.reviewTracking && !a.reviewedAt && !isWithdrawn(a);
  const unreviewed = applicants.filter(isUnreviewed);
  const openApplicant = async (a) => {
    setOpenId(a.linkId);
    if (!isUnreviewed(a)) return;
    const at = new Date().toISOString();
    setApplicants((prev) => prev.map((x) => (x.linkId === a.linkId ? { ...x, reviewedAt: at } : x)));
    try { const supabase = adapter.supabase(); await supabase.from('listing_applicants').update({ reviewed_at: at }).eq('id', a.linkId); }
    catch (e) { /* optimistic; the column is RLS-scoped to this realtor's own rows */ }
  };
  const toggleApplicant = (a) => { if (openId === a.linkId) setOpenId(null); else openApplicant(a); };
  const jumpToFirstUnreviewed = () => {
    const first = [...active, ...setAsideList].find(isUnreviewed); if (!first) return;
    document.getElementById(`applicant-${first.linkId}`)?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // ── Assistant (Layer 2): publish THIS realtor's own listing/applicants as the chat context
  // (ids + names + emails already in the page), and apply results the assistant executed. ──
  useEffect(() => {
    window.__rlAssistantContext = {
      page: 'listing', currentListingId: listing?.id,
      listings: [{ id: listing.id, name: listing.name, address: listing.address, landlord_email: listing.landlord_email, landlord_name: listing.landlord_name }],
      applicants: applicants.filter((a) => !isWithdrawn(a)).map((a) => ({ linkId: a.linkId, listingId: listing.id, applicationId: a.application?.id, name: a.application?.full_name, email: a.application?.email })),
    };
    const onApplied = (e) => {
      const d = e.detail || {};
      if (d.action === 'mark_finalist' && d.linkId) setApplicants((prev) => prev.map((x) => (x.linkId === d.linkId ? { ...x, decisionPriority: d.decisionPriority } : x)));
      if (d.action === 'update_preferences' && d.listingId === listing.id) { const { action, listingId, ...patch } = d; setListing((l) => ({ ...l, ...patch })); }
    };
    window.addEventListener('rl:assistant-applied', onApplied);
    return () => { window.removeEventListener('rl:assistant-applied', onApplied); delete window.__rlAssistantContext; };
  }, [listing, applicants]);
  // "Request documents" — from a Noticed card here or from the home page (deep link
  // #docs=<linkId>[&renew]). Unreviewed cards render COLLAPSED, and the document-request panel
  // only exists inside an expanded card, so this must open the card first (which also marks it
  // reviewed — exactly what clicking Open does), then scroll to it and light up the panel.
  const focusApplicantDocs = (linkId, renew = false) => {
    const a = applicants.find((x) => x.linkId === linkId); if (!a) return;
    openApplicant(a);
    setFocusDocFor({ linkId, renew: !!renew, at: Date.now() });
    setTimeout(() => document.getElementById(`applicant-${linkId}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 30);
  };
  // Held documents (db/documents.sql): View fetches a 60 second signed URL through the route and
  // opens the in app viewer; Delete all removes every held file for the applicant. Both return an
  // error string for the caller to show, or null.
  const [viewer, setViewer] = useState(null);
  const viewDocument = async (doc) => {
    try {
      const r = await adapter.fetch('/api/documents/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: doc.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return j.error || 'Could not open that document.';
      const at = new Date().toISOString();
      setApplicants((prev) => prev.map((x) => (Array.isArray(x.storedDocuments) && x.storedDocuments.some((d) => d.id === doc.id) ? { ...x, storedDocuments: x.storedDocuments.map((d) => (d.id === doc.id ? { ...d, openedCount: (d.openedCount || 0) + 1, lastOpenedAt: at } : d)) } : x)));
      setViewer({ url: j.url, mime: j.mime, kind: j.kind || doc.kind });
      return null;
    } catch (e) { return 'Could not open that document.'; }
  };
  const deleteDocuments = async (linkId) => {
    try {
      const r = await adapter.fetch('/api/documents/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingApplicantId: linkId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return j.error || 'Could not delete those documents.';
      setApplicants((prev) => prev.map((x) => (x.linkId === linkId && Array.isArray(x.storedDocuments) ? { ...x, storedDocuments: x.storedDocuments.map((d) => (d.deletedAt ? d : { ...d, deletedAt: j.deletedAt, deletedBy: j.deletedBy })) } : x)));
      return null;
    } catch (e) { return 'Could not delete those documents.'; }
  };
  // "Verify" on a matched card: open it and land on the screening checklist.
  const focusChecklist = (linkId) => {
    const a = applicants.find((x) => x.linkId === linkId); if (!a) return;
    openApplicant(a);
    setTimeout(() => document.getElementById(`checklist-${linkId}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 30);
  };
  // A confirmation changed: keep the row and recompute Fit here so the header label and number
  // move at once (same computeFit the server runs, lib/fitScore.js; listing is the current row).
  const patchConfirmations = (linkId, confirmations) => setApplicants((prev) => prev.map((x) => (x.linkId === linkId
    ? { ...x, confirmations, application: { ...x.application, fit: computeFit({ application: x.application, listing, verification: x.docVerifications?.[0] || null, confirmations }) } }
    : x)));
  const onNoticeAction = (a) => {
    if (a.type === 'panel') { window.dispatchEvent(new CustomEvent(OPEN_EVENT)); return; }
    if (a.event === 'request-docs') focusApplicantDocs(a.linkId, a.renew);
    else if (a.event === 'send-report') {
      document.getElementById('report')?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      sendEmail();
    }
  };
  // Where an action item lands: ?applicant={linkId}&panel=checklist|documents|report (lib/actions.js),
  // or the same through the go event when this listing page is already open. Expands the applicant,
  // scrolls the card (or the named section) under the static header, opens the named panel. The
  // page settles asynchronously, so the aim is repeated once.
  const [focusDocIntel, setFocusDocIntel] = useState(null);
  const goTo = (linkId, panel) => {
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (panel === 'report' || !linkId) { const aim = () => document.getElementById('report')?.scrollIntoView({ block: 'start', behavior }); [0, 700].forEach((ms) => setTimeout(aim, ms)); return; }
    const a = applicants.find((x) => x.linkId === linkId); if (!a) return;
    if (panel === 'documents') { focusApplicantDocs(linkId); setFocusDocIntel({ linkId, at: Date.now() }); return; }
    openApplicant(a);
    const id = panel === 'checklist' ? `checklist-${linkId}` : `applicant-${linkId}`;
    const aim = () => (document.getElementById(id) || document.getElementById(`applicant-${linkId}`))?.scrollIntoView({ block: 'start', behavior });
    [60, 700].forEach((ms) => setTimeout(aim, ms));
  };
  useEffect(() => {
    window.__rlListingId = listing?.id || null;
    const onGo = (e) => { const d = e.detail || {}; goTo(d.linkId || null, d.panel || 'documents'); };
    window.addEventListener(GO_EVENT, onGo);
    return () => { window.removeEventListener(GO_EVENT, onGo); if (window.__rlListingId === listing?.id) window.__rlListingId = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id, applicants]);
  // Deep links: ?applicant=&panel= (above), then the older #docs=<linkId>[&renew] and #report. The
  // query params are removed once handled so a reload does not re expand.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get('panel');
    if (panel === 'checklist' || panel === 'documents' || panel === 'report') {
      const linkId = params.get('applicant');
      params.delete('applicant'); params.delete('panel');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash || ''}`);
      goTo(linkId, panel);
      return undefined;
    }
    const hash = String(window.location.hash || '');
    const m = hash.match(/^#docs=([^&]+)(&renew)?$/);
    if (m) { focusApplicantDocs(decodeURIComponent(m[1]), !!m[2]); return undefined; }
    if (hash !== '#report') return undefined;
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const aim = () => document.getElementById('report')?.scrollIntoView({ block: 'start', behavior });
    const timers = [0, 700, 1600].map((ms) => setTimeout(aim, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!listing?.id) return;
    adapter.fetch(`/api/referrals/list?listingId=${encodeURIComponent(listing.id)}`).then((r) => (r.ok ? r.json() : { byLink: {} })).then((j) => setReferrals(j.byLink || {})).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id]);
  const [editOpen, setEditOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [setAsideFor, setSetAsideFor] = useState(null); // applicant link being set aside
  const [setAsideCode, setSetAsideCode] = useState('');
  const [setAsideNote, setSetAsideNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState(initialListing.invite_url || '');
  // Signing name on reports (lib/reportSignature): profiles.report_signature wins, else the display
  // name. Editable here because the person signing a report is not always the account holder.
  const [sigEditing, setSigEditing] = useState(false);
  const [sigDraft, setSigDraft] = useState('');
  const [sigBusy, setSigBusy] = useState(false);
  const saveSignature = async () => {
    const v = cleanSignature(sigDraft); setSigBusy(true);
    try {
      const supabase = adapter.supabase();
      const { data, error: sErr } = await supabase.from('profiles').update({ report_signature: v || null }).eq('id', profile.id).select().single();
      if (sErr) setError(sErr.message); else { setProfile((p) => ({ ...(data || p), report_signature: v || null })); setSigEditing(false); }
    } catch (e) { setError('Could not save the signing name.'); }
    setSigBusy(false);
  };
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addRL, setAddRL] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [textBusy, setTextBusy] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [departToken, setDepartToken] = useState(0); // the report leaving the screen after a successful send
  const rankedRef = useRef(null); const asideRef = useRef(null);
  // ── Direct manipulation (components/motion/swipe.js). A card pushed past the threshold commits
  // its decision at once; it then stays in place for one beat while it slides out (departing),
  // after which it re-renders in its new list and FLIP closes the gap. `recent` is the inline
  // undo for a drag commit; the buttons keep their own paths untouched.
  const [departing, setDeparting] = useState({}); // linkId -> { side, wasSetAside }
  const [recent, setRecent] = useState(null); // { linkId, kind, prev } for the inline Undo
  const recentTimer = useRef(null);
  const dragSetAsideRef = useRef(null); // linkId whose set aside sheet was opened by a drag
  const [hintFor, setHintFor] = useState(null); // the card that nudges once, on the first visit
  const [hintText, setHintText] = useState(false);
  const depart = (linkId, side, wasSetAside) => {
    setDeparting((d) => ({ ...d, [linkId]: { side, wasSetAside } }));
    setTimeout(() => setDeparting((d) => { const n = { ...d }; delete n[linkId]; return n; }), prefersReducedMotion() ? 0 : DURATION.base + 40);
  };
  const noteRecent = (linkId, kind, prev) => { setRecent({ linkId, kind, prev }); clearTimeout(recentTimer.current); recentTimer.current = setTimeout(() => setRecent(null), 7000); };
  useEffect(() => () => clearTimeout(recentTimer.current), []);
  // Reveal sections on load + as they scroll into view. Re-run when the applicant set changes
  // so newly-rendered cards get observed.
  useReveal(`${applicants.length}-${compareOpen}-${editOpen}`);

  const saveEdit = async (values) => {
    setSaving(true);
    setError('');
    try {
      const supabase = adapter.supabase();
      const { data, error: upErr } = await supabase
        .from('listings').update(values).eq('id', listing.id).select().single();
      if (upErr) { setError(upErr.message); setSaving(false); return; }
      setListing(data);
      reportEvent(adapter, { type: 'listing_updated', listingId: listing.id });
      setSaving(false);
      setEditOpen(false);
      refreshApplicants(); // scores and rent shares are derived from the listing's current rent at read time
    } catch (e) {
      setError('Could not save changes.'); setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    try {
      const supabase = adapter.supabase();
      const { error: delErr } = await supabase.from('listings').delete().eq('id', listing.id);
      if (delErr) { setError(delErr.message); return; }
      router.push(adapter.paths.home);
    } catch (e) {
      setError('Could not delete the listing.');
    }
  };

  const getInvite = async (regenerate = false) => {
    setInviteLoading(true);
    setError('');
    try {
      const r = await adapter.fetch('/api/listings/invite', {
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

  // One applicant changed on the server (a document analysis landed): refetch the listing's
  // applicants through the adapter (production: /api/listings/applicants, the same read the page
  // loaded with; sandbox: the demo adapter's live derivation) and replace that one row, so fit,
  // state, label, meter colour and the synthesis line follow. The assistant's signals for this
  // listing are patched too, so the badge moves without a reload.
  const refreshApplicant = async (linkId) => {
    try {
      const r = await adapter.fetch(`/api/listings/applicants?listingId=${encodeURIComponent(listing.id)}`);
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.applicants)) return;
      const fresh = j.applicants.find((x) => x.linkId === linkId);
      if (fresh) setApplicants((prev) => prev.map((x) => (x.linkId === linkId ? fresh : x)));
      patchSignalsListing(listing.id, j.applicants);
    } catch (e) { /* the row keeps what it has until the next load */ }
  };
  // Refresh applicants from Supabase (after adding by RL).
  const refreshApplicants = async () => {
    try {
      const r = await adapter.fetch(`/api/listings/applicants?listingId=${encodeURIComponent(listing.id)}`);
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
      const r = await adapter.fetch('/api/listings/add-applicant', {
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
      const r = await adapter.fetch(`/api/listings/report-pdf?listingId=${encodeURIComponent(listing.id)}`);
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
      const r = await adapter.fetch('/api/listings/report-text', {
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
      const r = await adapter.fetch('/api/listings/send-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const j = await r.json();
      if (r.ok) setDepartToken((n) => n + 1);
      setSendMsg(r.ok ? (j.preview ? `Demo: nothing sent. In the product this goes to ${j.sentTo || listing.landlord_email}.` : `Sent to ${j.sentTo || listing.landlord_email}.`) : (j?.error || 'Email send failed.'));
    } catch (e) { setSendMsg('Email send failed.'); }
    setSending(false);
  };

  // Persist a decision to listing_applicants (realtor RLS). Optimistic local update. Values come
  // from lib/listingApplicantsVocabulary.js; a withdrawal is its own column (withdrawn_at).
  const setDecision = async (linkId, patch) => {
    const changedAt = new Date().toISOString();
    setApplicants((prev) => prev.map((a) => (a.linkId === linkId ? { ...a, ...patch, decisionChangedAt: changedAt } : a)));
    try {
      const supabase = adapter.supabase();
      const dbPatch = { decision_changed_at: changedAt };
      if ('decisionStatus' in patch) dbPatch.decision_status = patch.decisionStatus;
      if ('withdrawnAt' in patch) dbPatch.withdrawn_at = patch.withdrawnAt;
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
  const openSetAside = (a) => { dragSetAsideRef.current = null; setSetAsideFor(a); setSetAsideCode(''); setSetAsideNote(''); };
  const confirmSetAside = () => {
    if (!setAsideFor || !setAsideCode) return;
    const linkId = setAsideFor.linkId;
    setDecision(linkId, { decisionStatus: DECISION_STATUS.REJECT, decisionReasonCode: setAsideCode, decisionNotes: setAsideNote.trim() || null });
    reportEvent(adapter, { type: 'applicant_set_aside', linkId, payload: { reason: reasonLabel(setAsideCode) } });
    if (dragSetAsideRef.current === linkId) { // reached by a drag: the card leaves, and Undo is offered
      dragSetAsideRef.current = null;
      depart(linkId, 'left', false);
      noteRecent(linkId, 'Set aside', { decisionStatus: DECISION_STATUS.NONE, decisionReasonCode: null, decisionNotes: null });
    }
    setSetAsideFor(null);
  };
  const restoreApplicant = (a) => {
    setDecision(a.linkId, { decisionStatus: DECISION_STATUS.NONE, decisionReasonCode: null });
    reportEvent(adapter, { type: 'applicant_restored', linkId: a.linkId });
  };
  // The two drag commits. Set aside still REQUIRES a screenable reason, so pushing a card left
  // opens the same reason sheet the button opens (the card springs back under it); confirming
  // there is the commit. Pushing a set aside card right restores it at once.
  const onSwipeCommit = (a, side) => {
    if (side === 'left' && isActive(a)) { openSetAside(a); dragSetAsideRef.current = a.linkId; return false; }
    if (side === 'right' && isSetAsideApplicant(a)) {
      restoreApplicant(a);
      depart(a.linkId, 'right', true);
      noteRecent(a.linkId, 'Restored', { decisionStatus: DECISION_STATUS.REJECT, decisionReasonCode: a.decisionReasonCode || null, decisionNotes: a.decisionNotes || null });
      return true;
    }
    return false;
  };
  const undoRecent = () => { if (!recent) return; setDecision(recent.linkId, recent.prev); setRecent(null); clearTimeout(recentTimer.current); };
  // Remove = genuine tenant WITHDRAWAL only (not a screening decision).
  const withdrawApplicant = (a) => {
    if (!confirm(`Mark ${a.application?.full_name || 'this applicant'} as withdrawn? Use this only if the tenant withdrew. It removes them from your ranked list.`)) return;
    setDecision(a.linkId, { withdrawnAt: new Date().toISOString(), decisionReasonCode: null });
    reportEvent(adapter, { type: 'applicant_withdrew', linkId: a.linkId });
  };

  const l = listing;
  const inviteShareUrl = fullInviteUrl(); // complete URL shown + copied
  const employment = [
    l.pref_employment_full_time && 'Full-time',
    l.pref_employment_contract && 'Contract',
    l.pref_employment_self_employed && 'Self-employed',
    l.pref_employment_part_time && 'Part-time',
  ].filter(Boolean).join(', ') || '—';

  // Pure scorecard vs criteria ranking (matches lib/listingReportData). Everyone is
  // in: active best fit first, set aside below, withdrawn excluded (withdrawn_at rule).
  // One sort order everywhere (lib/fitScore.js compareFit): scoreExact descending, no Fit last,
  // the earlier applicant first on a tie.
  const byScore = compareFit;
  // A departing card is shown where it WAS for one beat (its state has already changed).
  const shownActive = (a) => (departing[a.linkId] ? !departing[a.linkId].wasSetAside : isActive(a));
  const shownAside = (a) => (departing[a.linkId] ? departing[a.linkId].wasSetAside : isSetAsideApplicant(a));
  const active = applicants.filter((a) => !isWithdrawn(a) && shownActive(a)).sort(byScore);
  const setAsideList = applicants.filter((a) => !isWithdrawn(a) && shownAside(a)).sort(byScore);
  // First visit to a listing with applicants: the top card nudges once to show the gesture, and a
  // one line caption stays for this visit. Persisted in localStorage; never shown again.
  useEffect(() => {
    if (locked || !active.length) return;
    try { if (localStorage.getItem('rl_swipe_hint')) return; localStorage.setItem('rl_swipe_hint', new Date().toISOString()); } catch (e) { return; }
    setHintFor(active[0].linkId); setHintText(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length, locked]);
  // Reordering: cards travel to their new rank (FLIP, transforms only) instead of the list redrawing.
  useFlip(rankedRef, active.map((a) => a.linkId).join('|'));
  useFlip(asideRef, setAsideList.map((a) => a.linkId).join('|'));
  const totalApplicants = active.length + setAsideList.length;

  // Normalize the ACTIVE ranked list into the shared Compare shape (screenable facts only;
  // set-aside/withdrawn are excluded by construction — compare is for active ranked tenants).
  const comparePool = active.map((a, idx) => {
    const app = a.application || {};
    const coIncome = app.co_applicant?.annualIncome ?? app.co_applicant?.annual_income;
    return {
      id: a.linkId, rank: idx + 1, name: app.full_name || 'Applicant',
      overall: app.fit?.score ?? null,
      annualIncome: toNum(app.annual_income),
      householdIncome: coIncome != null ? (toNum(app.annual_income) || 0) + (toNum(coIncome) || 0) : null,
      rentToIncome: toNum(app.rent_to_income_ratio),
      jobTenureYears: toNum(app.years_at_job),
      employer: app.employer || null,
      employmentType: ({ 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' })[app.employment_type] || employmentTypeFromTitle(app.job_title),
      yearsAtAddress: toNum(app.years_at_previous),
      currentRent: toNum(app.current_rent),
      references: Array.isArray(app.references) ? app.references.length : null,
      moveInDate: app.move_in_date || null,
      occupants: app.number_of_occupants != null ? toNum(app.number_of_occupants) : null,
      smoker: smokerLabel(app.smoker),
      pets: app.pets || null,
    };
  });

  const EMP_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' };
  const pill = (text, fg, bg, extra = {}) => <span style={{ fontSize: 10, color: fg, background: bg, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill, whiteSpace: 'nowrap', ...extra }}>{text}</span>;
  // A labelled, collapsible section inside the open card. Only the chevron moves (transform).
  const renderSection = (a, key, title, defOpen, body) => {
    const on = sectionOpen(a.linkId, key, defOpen);
    return (
      <div key={key} style={{ borderTop: `1px solid ${C.rule}`, marginTop: 10 }}>
        <button type="button" aria-expanded={on} aria-controls={`applicant-${a.linkId}-${key}`} onClick={() => toggleSection(a.linkId, key, defOpen)}
          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'inherit', color: C.inkMute, textAlign: 'left' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
          <span className={`m-chev ${on ? 'open' : ''}`} aria-hidden="true"><Icon name="chevronD" size={16} /></span>
        </button>
        {on && <div id={`applicant-${a.linkId}-${key}`} style={{ paddingBottom: 12 }}>{body}</div>}
      </div>
    );
  };
  const renderRows = (rows) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 18px' }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', marginTop: 1 }}>{value}</div>
        </div>
      ))}
    </div>
  );

  const renderApplicantCard = (a, { rank, top5, isSetAside }) => {
    const fresh = isUnreviewed(a);
    const open = openId === a.linkId;
    const app = a.application || {};
    const fit = app.fit || null;
    const overall = fit ? fit.score : null;
    const missed = (fit?.criteria || []).filter((c) => c.status === 'missed').map((c) => c.detail);
    // Where this applicant is in the process (lib/applicantState.js). The collapsed card's body is
    // that state's next action and nothing else; the expanded card is unchanged.
    const st = applicantState({ application: app, junction: a, verification: a.docVerifications?.[0] || null, listing });
    // The meter renders on every active card. Its colour carries the confidence: muted grey while
    // the Fit rests on stated facts, the editorial red once documents match or the realtor verified.
    const meterMuted = !!fit && (fit.label === 'stated' || fit.label === 'check docs');
    const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const primaryBtn = { display: 'block', width: '100%', minHeight: 44, marginTop: 10, background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
    const textBtn = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, marginTop: 2, background: 'transparent', color: C.ink, border: 'none', fontSize: 13, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' };
    const stateLine = { fontSize: 12.5, color: C.inkSoft, marginTop: 3, lineHeight: 1.35, paddingLeft: tracking ? 18 : 0 };
    const confirmedBy = (by) => (!by || by === 'You' || by === String(profile?.full_name || '').trim() ? 'you' : by);
    const money = (n) => (n != null && n !== '' ? `$${Number(n).toLocaleString()}` : null);
    const coIncome = app.co_applicant?.annualIncome ?? app.co_applicant?.annual_income;
    const smokerLabel = app.smoker ? ({ no: 'Non-smoker', outdoor: 'Outdoor only', yes: 'Yes' }[app.smoker] || String(app.smoker)) : null;
    const present = (rows) => rows.filter(([, v]) => v != null && v !== '');
    // The facts, grouped. A group with nothing in it does not render.
    const incomeRows = present([
      ['Income (before tax)', app.annual_income ? `${money(app.annual_income)}/yr` : null],
      ['After tax', app.net_income ? `${money(app.net_income)}/yr${app.net_income_source === 'stated' ? ' (stated)' : ' (estimate)'}` : null],
      ['Household income', coIncome ? `${money((Number(app.annual_income) || 0) + Number(coIncome))}/yr (joint, before tax)` : null],
      [app.employment_type === 'self-employed' ? 'Business' : 'Employer', app.employer ? `${app.employer}${app.employment_type ? ` · ${EMP_LABEL[app.employment_type] || app.employment_type}` : ''}` : null],
      ['Role', app.job_title || null],
      ['Tenure', app.years_at_job ? `${app.years_at_job} yrs` : null],
      ['Rent to income', app.rent_to_income_ratio != null ? `${app.rent_to_income_ratio}%` : null],
    ]);
    const tenancyRows = present([
      ['Current rent', app.current_rent ? `${money(app.current_rent)}/mo` : null],
      ['Years at address', app.years_at_previous ? `${app.years_at_previous} yrs` : null],
      // Landlord reference capture from the apply form (existing columns prev_landlord_name / prev_landlord_contact).
      ['Landlord reference', app.prev_landlord_name ? [app.prev_landlord_name, app.prev_landlord_contact].filter(Boolean).join(' · ') : 'None on file'],
      ['References', Array.isArray(app.references) ? `${app.references.length} provided` : null],
    ]);
    const livingRows = present([
      ['Move in', app.move_in_date || null],
      ['Occupants', app.number_of_occupants != null ? String(app.number_of_occupants) : null],
      ['Smoker', smokerLabel],
      ['Pets', app.pets || 'None'],
    ]);
    // Brand red = EMPHASIS on the top picks only; everyone else is neutral.
    const borderColor = top5 ? C.red : C.ruleDark;
    const leftAction = !isSetAside ? { label: 'Set aside' } : null;
    const rightAction = isSetAside ? { label: 'Restore', tone: 'good' } : null;
    const ref = referrals[a.linkId];
    const refMap = { pending: ['Pending applicant approval', C.inkSoft, C.paperDeep], declined: ['Referral declined', C.inkMute, C.paperDeep], approved: [`Sent to ${ref?.to?.name || ref?.to?.email}`, C.green, C.greenTint], expired: ['Referral expired', C.inkMute, C.paperDeep], revoked: ['Referral revoked', C.inkMute, C.paperDeep] };
    return (
      <SwipeCard key={a.linkId} flipKey={a.linkId} id={`applicant-${a.linkId}`} leftAction={leftAction} rightAction={rightAction}
        onCommit={(side) => onSwipeCommit(a, side)} departing={departing[a.linkId]?.side || null}
        hint={hintFor === a.linkId} onHintDone={() => setHintFor(null)}>
      <div style={{
        minWidth: 0,
        background: isSetAside ? C.paperDeep : C.card, border: `1px solid ${top5 ? C.red : C.rule}`, borderLeft: `4px solid ${borderColor}`,
        borderRadius: R.card, padding: open ? 'clamp(14px, 3vw, 18px)' : '12px clamp(14px, 3vw, 18px)', opacity: isSetAside ? 0.94 : 1,
        boxShadow: top5 ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
      }}>
        {recent?.linkId === a.linkId && (
          <div data-no-swipe role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, padding: '6px 6px 6px 12px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft }}>
            <span><strong style={{ color: C.ink }}>{recent.kind}.</strong> Not what you meant?</span>
            <button type="button" onClick={undoRecent} style={{ minHeight: 40, padding: '0 14px', background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Undo</button>
          </div>
        )}
        {/* THE CARD AT REST. A div with a button role (a real button would be excluded from the drag
            gesture). Set aside: one muted line. Otherwise the header row, then the body for the
            applicant's state: their next action, nothing that does not apply. */}
        {st.state === 'set_aside' ? (
          <div role="button" tabIndex={0} aria-expanded={open} aria-controls={`applicant-${a.linkId}-body`}
            onClick={() => toggleApplicant(a)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleApplicant(a); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.inkMute, lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'pretty' }}>
              <span style={{ fontWeight: 700, color: C.inkSoft }}>{app.full_name || 'Applicant'}</span>
              {a.decisionReasonCode ? ` · ${reasonLabel(a.decisionReasonCode)}` : ''}
            </div>
            <button type="button" onClick={stop(() => restoreApplicant(a))} style={{ ...textBtn, marginTop: 0, color: C.green, flexShrink: 0 }}>Restore</button>
            <span className={`m-chev ${open ? 'open' : ''}`} aria-hidden="true" style={{ flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>
          </div>
        ) : (
        <div role="button" tabIndex={0} aria-expanded={open} aria-controls={`applicant-${a.linkId}-body`}
          onClick={() => toggleApplicant(a)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleApplicant(a); } }}
          style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 26 }}>
            {tracking && <span aria-label={fresh ? 'Not yet reviewed' : undefined} title={fresh ? 'Not yet reviewed' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: fresh ? C.red : 'transparent', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{app.full_name || 'Applicant'}</span>
              <VerifiedMark verified={st.state === 'verified'} id={a.linkId} />
            </div>
            {overall != null ? (
              <AnimatedScore value={overall} index={rank ? rank - 1 : 0} refill={meterMuted ? 'muted' : 'full'} renderValue={(shown, target) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }} aria-label={`${Number(target).toFixed(1)} out of 5, ${fit.label}`}>
                  <TickMeter value={Math.round(shown * 10) / 10} size={11} showValue={false} muted={meterMuted} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{Number(shown).toFixed(1)}</span>
                  <span style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{fit.label}</span>
                </span>
              )} />
            ) : (
              <span style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Rent share unknown</span>
            )}
            <span className={`m-chev ${open ? 'open' : ''}`} aria-hidden="true" style={{ flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>
          </div>
          {st.state === 'matched' && (<>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 3, lineHeight: 1.35, textWrap: 'balance', paddingLeft: tracking ? 18 : 0 }}>{synthesisLine(a)}</div>
            {missed.length > 0 && <div style={{ fontSize: 12, color: C.inkMute, marginTop: 3, lineHeight: 1.35, textWrap: 'pretty', paddingLeft: tracking ? 18 : 0 }}>{missed.join(' · ')}</div>}
            {!open && <button type="button" onClick={stop(() => focusChecklist(a.linkId))} style={primaryBtn}>Verify</button>}
          </>)}
          {st.state === 'verified' && (<>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 3, lineHeight: 1.35, textWrap: 'balance', paddingLeft: tracking ? 18 : 0 }}>{synthesisLine(a)}</div>
            <div style={stateLine}>Verified by {confirmedBy(a.confirmations?.employer?.by)}{st.since ? ` · ${shortDate(st.since)}` : ''}</div>
          </>)}
          {st.state === 'sent' && (
            <div style={stateLine}>Sent to landlord{st.since ? ` · ${shortDate(st.since)}` : ''}</div>
          )}
          {st.state === 'new' && (<>
            <div style={stateLine}>No documents yet</div>
            {!open && <button type="button" onClick={stop(() => focusApplicantDocs(a.linkId))} style={primaryBtn}>Request documents</button>}
          </>)}
          {st.state === 'requested' && (<>
            <div style={stateLine}>Documents requested{st.since ? ` · ${shortDate(st.since)}` : ''}</div>
            {!open && <div style={{ paddingLeft: tracking ? 18 : 0 }}><button type="button" onClick={stop(() => focusApplicantDocs(a.linkId))} style={textBtn}>Send again</button></div>}
          </>)}
          {st.state === 'checked' && (<>
            <div style={stateLine}>Documents on file · nothing matched</div>
            {!open && <button type="button" onClick={stop(() => openApplicant(a))} style={primaryBtn}>Review documents</button>}
          </>)}
          {st.state === 'mismatch' && (<>
            <div style={stateLine}>Name on documents did not match</div>
            {!open && <button type="button" onClick={stop(() => openApplicant(a))} style={primaryBtn}>Review documents</button>}
          </>)}
        </div>
        )}

        {open && (<div id={`applicant-${a.linkId}-body`} className="m-expand">
          {/* Status line: rank and marks that only matter once you are looking at this person. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {rank != null && pill(`Rank ${rank}`, top5 ? C.paper : C.inkSoft, top5 ? C.red : C.paperDeep)}
            {top5 && pill('Top 5', C.red, C.card, { border: `1px solid ${C.red}` })}
            {isSetAside && pill('Set aside', C.inkSoft, C.rule)}
            {isFinalist(a) && !isSetAside && pill('Finalist', C.paper, C.ink)}
            {ref && (() => { const [label, fg, bg] = refMap[ref.status] || [ref.status, C.inkMute, C.paperDeep]; return pill(label, fg, bg); })()}
            {editedAfterVerification(app, a.docVerifications).edited && pill('Edited after verification', C.amber, C.amberTint, { border: `1px solid ${C.amber}` })}
            <span style={{ fontSize: 11, color: C.inkMute, fontFamily: 'monospace', marginLeft: 'auto' }}>{app.application_number}</span>
          </div>
          {app.referral_meta && <ReferralCaution meta={app.referral_meta} compact />}
          {isSetAside && (
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10, padding: '6px 10px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
              <strong style={{ color: C.ink }}>Set aside:</strong> {reasonLabel(a.decisionReasonCode)}
              {a.decisionNotes ? `. ${a.decisionNotes}` : ''}
            </div>
          )}

          {/* THE FACTS, grouped. Money and tenancy open by default; the rest on request. */}
          <div style={{ marginTop: 12 }}>
            {incomeRows.length > 0 && renderSection(a, 'income', 'Income and employment', true, renderRows(incomeRows))}
            {tenancyRows.length > 0 && renderSection(a, 'tenancy', 'Tenancy and landlord reference', true, renderRows(tenancyRows))}
            {livingRows.length > 0 && renderSection(a, 'living', 'Living situation', false, renderRows(livingRows))}
            {app.personality && renderSection(a, 'words', 'In their own words', false, (
              <div style={{ padding: '10px 14px', background: C.paperDeep, borderRadius: R.ctrl, borderLeft: `3px solid ${C.ruleDark}` }}>
                <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, fontStyle: 'italic', overflowWrap: 'anywhere' }}>“{app.personality}”</div>
              </div>
            ))}
          </div>

          <ScreeningChecklist applicant={a} listing={listing} profile={profile} onChange={(conf) => patchConfirmations(a.linkId, conf)} heldDocuments={a.storedDocuments} onViewDocument={viewDocument} />

          <ApplicantDocIntel
            listingId={listing.id}
            linkId={a.linkId}
            applicationId={app.id}
            applicantName={app.full_name}
            initialVerifications={a.docVerifications}
            initialArchived={a.docArchived}
            initialInsight={a.aiInsight}
            profileUpdatedAt={app.profile_updated_at}
            onSaved={(patch) => setApplicants((prev) => prev.map((x) => (x.linkId === a.linkId ? { ...x, ...patch } : x)))}
            onAnalyzed={() => refreshApplicant(a.linkId)}
            heldDocuments={a.storedDocuments}
            realtorName={profile?.full_name}
            onViewDocument={viewDocument}
            onDeleteDocuments={() => deleteDocuments(a.linkId)}
            focus={focusDocIntel?.linkId === a.linkId ? focusDocIntel : null}
          />
          {/* ALTERNATIVE to uploading yourself: request the documents from the finalist tenant, who
              uploads via a secure link. Coexists with ApplicantDocIntel above. */}
          <ApplicantDocRequest listingId={listing.id} linkId={a.linkId} applicationId={app.id} hasActiveAnalysis={(a.docVerifications || []).length > 0} focus={focusDocFor?.linkId === a.linkId ? focusDocFor : null} />

          {/* ACTIONS, after the facts. The drag is the fast path; these are the deliberate one. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
            {isSetAside ? (
              <button onClick={() => restoreApplicant(a)}
                style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                Restore
              </button>
            ) : (
              <button onClick={() => openSetAside(a)} title="Record a screenable reason to de-prioritize"
                style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                Set aside
              </button>
            )}
            {!app.referral_meta && !['pending', 'approved'].includes(ref?.status) && (
              <button onClick={() => setReferFor(a)} title="Refer this applicant to another realtor. They must approve first"
                style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                Refer
              </button>
            )}
            <button onClick={() => withdrawApplicant(a)} title="Tenant withdrew"
              style={{ background: 'transparent', color: C.inkMute, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40, marginLeft: 'auto' }}>
              Withdrew
            </button>
          </div>
        </div>)}
      </div>
      </SwipeCard>
    );
  };

  return (
    <>
      <Head>
        <title>{l.name || 'Listing'} — Rentletter</title>
      </Head>
      <GlobalStyle />
      <MotionStyles />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} onAssistantAction={onNoticeAction} />

        {locked && <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)' }}><Paywall entitlement={entitlement} profile={profile} /></div>}
        {!locked && <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 48px' }}>
          <a href={adapter.paths.home} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, textDecoration: 'none', marginBottom: 18 }}>
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

          {/* ── RENTLETTER NOTICED — deterministic process nudges (lib/noticed.js), max 3 ── */}
          <NoticedCards style={{ marginBottom: 16 }} onAction={onNoticeAction}
            input={{ scope: 'listing', listings: [listing], applicantsByListing: { [listing.id]: applicants }, profile,
              referralsSent: Object.values(referrals).map((r) => ({ ...r, from: { listingId: listing.id }, applicantName: applicants.find((x) => referrals[x.linkId] === r)?.application?.full_name })) }} />

          {/* ── APPLICANTS — single ranked list (everyone, best fit first) ── */}
          <section className="rl-card rl-in" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Ranked applicants</h2>
              <span style={{ fontSize: 12.5, color: C.inkMute }}>{totalApplicants} total{setAsideList.length ? ` · ${setAsideList.length} set aside` : ''}</span>
            </div>
            {/* Plain-language line (deterministic — lib/noticed.narrateApplicants) */}
            {narrateApplicants(listing, applicants) && (
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: unreviewed.length ? 6 : 12, maxWidth: 620 }}>{narrateApplicants(listing, applicants)}</p>
            )}
            {/* WHICH applicants are new to you — a line, not a banner; gone when there are none. */}
            {unreviewed.length > 0 && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: C.ink, marginBottom: 12 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                <span><strong>{unreviewed.length} not yet reviewed</strong> — marked with a dot; open a card to review it.</span>
                <button type="button" onClick={jumpToFirstUnreviewed} style={{ background: 'transparent', border: 'none', padding: 0, color: C.red, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', minHeight: 24 }}>Jump to first ↓</button>
              </p>
            )}

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
                {hintText && (
                  <p style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>Tip: push a card left to set it aside. Push a set aside card right to restore it.</p>
                )}
                {active.length >= 2 && (
                  <button onClick={() => setCompareOpen(true)} className="rl-btn"
                    style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    ⇄ Compare top tenants
                  </button>
                )}
                <div ref={rankedRef} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
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
                    <div ref={asideRef} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
                      {setAsideList.map((a) => renderApplicantCard(a, { rank: null, top5: false, isSetAside: true }))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── PRESENT TO LANDLORD (appears once anyone has applied) ── */}
          {totalApplicants > 0 && (
            <section id="report" className="rl-card rl-in" style={{ padding: 'clamp(18px, 3vw, 28px)', marginTop: 16, scrollMarginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Present to landlord</div>
              <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14, maxWidth: 560 }}>
                Present the full ranked list of {totalApplicants} applicant{totalApplicants === 1 ? '' : 's'} (top 5 highlighted{setAsideList.length ? `, ${setAsideList.length} set aside` : ''}) as a branded PDF report or a paste-ready message.
              </p>

              {/* Who signs this report */}
              <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '12px 14px', marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: C.inkMute, fontWeight: 600 }}>Signed by: </span>
                {sigEditing ? (
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <input value={sigDraft} onChange={(e) => setSigDraft(e.target.value)} maxLength={SIGNATURE_MAX} autoCapitalize="words" autoComplete="off" aria-label="Signing name on reports" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSignature(); } if (e.key === 'Escape') setSigEditing(false); }}
                      style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', fontSize: 16, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 44 }} />
                    <button type="button" onClick={saveSignature} disabled={sigBusy} className="rl-btn" style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>{sigBusy ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setSigEditing(false)} disabled={sigBusy} style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '0 12px', fontSize: 13, fontWeight: 600, color: C.inkSoft, cursor: 'pointer', minHeight: 44 }}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <span style={{ color: C.ink, fontWeight: 600 }}>{signingName(profile)}</span>
                    <button type="button" onClick={() => { setSigDraft(signingName(profile, '')); setSigEditing(true); }} style={{ marginLeft: 10, background: 'transparent', border: 'none', color: C.red, fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, minHeight: 28 }}>Change</button>
                    <span style={{ display: 'block', fontSize: 12, color: C.inkMute, marginTop: 4, textWrap: 'pretty' }}>The name that signs this report and every report after it.</span>
                  </>
                )}
              </div>
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
                <ReportDeparture token={departToken} onDone={() => setDepartToken(0)} />
              </div>
              {sendMsg && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.inkSoft }}>{sendMsg}</div>
              )}
            </section>
          )}
        </div>}

        {editOpen && (
          <ListingSetupModal mode="edit" initial={listing} onCancel={() => setEditOpen(false)} onSave={saveEdit} saving={saving} />
        )}

        {/* Set-aside reason modal — an OHRC-safe, screenable reason is REQUIRED. */}
        {referFor && (
        <ReferModal listingId={listing.id} applicant={referFor} onClose={() => setReferFor(null)}
          onCreated={(ref) => { setReferrals((m) => ({ ...m, [referFor.linkId]: ref })); setReferFor(null); }} />
      )}
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
      <DocumentViewer doc={viewer} onClose={() => setViewer(null)} />
    </>
  );
}
