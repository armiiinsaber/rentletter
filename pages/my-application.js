// pages/my-application.js
// The tenant's profile — their own record of what they submitted, kept worth having.
//
//   VIEW    everything they wrote (employment, income, rental history, household, their intro)
//           laid out as a profile, plus the privacy console that was already here.
//   EDIT    per-section inline editing via the owner token → /api/application/manage `update`
//           (same RL, same record; the realtor's view updates; no resubmission).
//   REUSE   "apply to your next listing in seconds" — paste the new invite link and arrive on
//           /apply/{token} with the form filled from this profile (the token never leaves this
//           device in a URL: the apply page reads it from localStorage).
//
// Auth model unchanged: application number + owner token (from the confirmation email),
// remembered in localStorage on this device. Static header (no sticky/fixed — iOS rule).
// Animation: reveal-on-scroll only, gated by prefers-reduced-motion inside useReveal.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, Icon, useReveal } from '../components/ui';
import { Field, Textarea, SelectField, ToggleField } from '../components/apply/fields';
import { formFromApplication, serializePets } from '../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../lib/taxEstimate';

const EMP_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' };
// The application doesn't store the tenant's province; infer BC from the addresses we have,
// default Ontario. Only used to label/compute the after-tax ESTIMATE (which stays editable).
const guessProvince = (p) => (/\b(BC|B\.C\.|British Columbia|Vancouver|Victoria|Burnaby|Surrey|Richmond|Kelowna)\b/i.test(`${p?.apartment?.address || ''} ${p?.rental?.previousAddress || ''}`) ? 'BC' : 'ON');
const PROV_NAME = { ON: 'Ontario', BC: 'British Columbia' };

const LS_APP = 'rentletter_app_number';
const LS_TOKEN = 'rentletter_owner_token';

// ── small formatting helpers ─────────────────────────────────────────────────────────────
const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return n ? `$${n.toLocaleString('en-CA')}` : null; };
const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return '—'; } };
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return dateLong(iso);
}
const phoneDigits = (v) => String(v || '').replace(/\D/g, '');
function formatPhone(v) {
  const d = phoneDigits(v).slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
const tenureLabel = (yrs) => {
  const n = parseFloat(yrs); if (!Number.isFinite(n) || n <= 0) return null;
  const y = Math.floor(n), m = Math.round((n - y) * 12);
  return [y ? `${y} yr${y === 1 ? '' : 's'}` : null, m ? `${m} mo` : null].filter(Boolean).join(' ');
};

// ── presentational atoms ─────────────────────────────────────────────────────────────────
const Eyebrow = ({ children, color = C.red }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
    <span aria-hidden="true" style={{ width: 22, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
    <span style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span>
  </div>
);

function Row({ label, value, multiline }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="mp-row">
      <div className="mp-row-label">{label}</div>
      <div className="mp-row-value" style={{ color: empty ? C.inkMute : C.ink, fontWeight: empty ? 500 : 600, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>
        {empty ? 'Not provided' : value}
      </div>
    </div>
  );
}

// A profile section card. `editing` swaps the read rows for the section's fields.
function Section({ id, title, blurb, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved }) {
  return (
    <section id={id} className="rl-card rl-in mp-section" aria-labelledby={`${id}-h`}>
      <div className="mp-section-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`${id}-h`} style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</h2>
          {blurb && !editing && <p style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, marginTop: 3 }}>{blurb}</p>}
        </div>
        {!editing && canEdit && (
          <button type="button" onClick={onEdit} className="mp-editbtn" aria-label={`Edit ${title}`}>
            <Icon name="edit" size={14} /> Edit
          </button>
        )}
        {!editing && justSaved && <span style={{ fontSize: 12, color: C.green, fontWeight: 700, flexShrink: 0 }}>✓ Saved</span>}
      </div>
      {editing ? (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
          <div className="mp-actions">
            <button type="button" onClick={onSave} disabled={saving} className="rl-btn"
              style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', minHeight: 44, opacity: saving ? 0.75 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={onCancel} disabled={saving}
              style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mp-rows">{rows}</div>
      )}
    </section>
  );
}

export default function MyApplication() {
  const router = useRouter();
  const [step, setStep] = useState('input'); // 'input' | 'loaded'
  const [appNumber, setAppNumber] = useState('');
  const [ownerToken, setOwnerToken] = useState('');
  const [data, setData] = useState(null);       // view payload
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Editing: one section at a time; the draft is the full flat form (the update endpoint
  // takes the whole form, so untouched sections ride along unchanged).
  const [editing, setEditing] = useState(null);  // section id | null
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(null); // section id
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  // Reuse: paste an invite link
  const [inviteLink, setInviteLink] = useState('');
  const [inviteErr, setInviteErr] = useState('');

  useReveal(step + (data ? data.profileRevision : ''));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlApp = params.get('app');
    const urlToken = params.get('token');
    const app = urlApp || localStorage.getItem(LS_APP);
    const tok = urlToken || localStorage.getItem(LS_TOKEN);
    if (app && tok) { setAppNumber(app); setOwnerToken(tok); load(app, tok); }
    else if (app) setAppNumber(app);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Never leave the owner token sitting in the address bar / browser history once it's been
  // read (the email deep-link carries it). Goes through the router so Next doesn't re-sync it.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.token) router.replace('/my-application', undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const call = async (body) => {
    const res = await fetch('/api/application/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) { const err = new Error(json?.error || 'Something went wrong.'); err.code = json?.code; throw err; }
    return json;
  };

  const load = async (app, tok) => {
    setLoading(true); setError('');
    try {
      const json = await call({ applicationNumber: app, ownerToken: tok, action: 'view' });
      setData(json); setStep('loaded');
      localStorage.setItem(LS_APP, app); localStorage.setItem(LS_TOKEN, tok);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const performAction = async (action) => {
    if (action === 'revoke' && !confirm('Revoke this application? Realtors with your application number will no longer be able to view it, and you can’t use the profile to apply elsewhere until you reactivate it.')) return;
    setActionLoading(true); setError('');
    try { await call({ applicationNumber: appNumber, ownerToken, action }); await load(appNumber, ownerToken); }
    catch (e) { setError(e.message); }
    setActionLoading(false);
  };

  const startEdit = (id) => {
    setDraft(formFromApplication(data?.profile));
    setSaveError(''); setEditing(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 20);
  };
  const cancelEdit = () => { setEditing(null); setDraft(null); setSaveError(''); };
  const saveEdit = async () => {
    if (!draft || saving) return;
    setSaving(true); setSaveError('');
    try {
      const json = await call({ applicationNumber: appNumber, ownerToken, action: 'update', form: draft });
      setData((d) => ({ ...d, profile: json.profile, updatedAt: json.updatedAt, profileRevision: json.profileRevision }));
      const id = editing;
      setEditing(null); setDraft(null); setJustSaved(id);
      setToast(`Saved · ${new Date(json.updatedAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (e) { setSaveError(e.message); }
    setSaving(false);
  };

  // draft updaters (same derived-write rules as the apply form)
  const set = (k, v) => setDraft((f) => ({ ...f, [k]: v }));
  const updateReference = (patch) => setDraft((f) => { const n = { ...f, ...patch }; n.previousLandlordContact = [String(n.prevLandlordEmail).trim(), String(n.prevLandlordPhone).trim()].filter(Boolean).join(' · '); return n; });
  const updateTenure = (patch) => setDraft((f) => { const n = { ...f, ...patch }; const y = parseInt(n.tenureYears, 10), m = parseInt(n.tenureMonths, 10); const t = (Number.isFinite(y) ? y : 0) + (Number.isFinite(m) ? m / 12 : 0); n.yearsAtPrevious = t > 0 ? String(Math.round(t * 10) / 10) : ''; return n; });
  const updatePets = (patch) => setDraft((f) => { const n = { ...f, ...patch }; n.pets = serializePets(n); return n; });
  const province = guessProvince(data?.profile);
  const updateEmployment = (patch) => setDraft((f) => { const n = { ...f, ...patch }; n.businessName = n.employmentType === 'self-employed' ? n.employer : ''; return n; });
  const updateGross = (v) => setDraft((f) => { const n = { ...f, annualIncome: v }; if (n.netIncomeSource !== 'stated') n.netIncome = v ? String(estimateNetIncome(v, province).net || '') : ''; return n; });
  const updateNet = (v) => setDraft((f) => ({ ...f, netIncome: v, netIncomeSource: 'stated' }));
  const resetNet = () => setDraft((f) => ({ ...f, netIncomeSource: 'estimated', netIncome: f.annualIncome ? String(estimateNetIncome(f.annualIncome, province).net || '') : '' }));
  const updateRentalStatus = (v) => setDraft((f) => { const n = { ...f, rentalStatus: v }; if (v === 'none') Object.assign(n, { previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '', prevLandlordEmail: '', prevLandlordPhone: '', tenureYears: '', tenureMonths: '', currentRent: '' }); return n; });

  const goApplyWithProfile = (e) => {
    e.preventDefault();
    const m = String(inviteLink).match(/apply\/([a-f0-9]{20})/i);
    if (!m) { setInviteErr('That doesn’t look like a Rentletter invite link. It looks like rentletter.ca/apply/… — paste the whole link.'); return; }
    setInviteErr('');
    router.push(`/apply/${m[1].toLowerCase()}#profile`);
  };

  const signOut = () => { setStep('input'); setData(null); setOwnerToken(''); setEditing(null); localStorage.removeItem(LS_TOKEN); };

  const styles = (
    <style jsx global>{`
      .mp-wrap { max-width: 760px; margin: 0 auto; padding: clamp(28px, 5vw, 48px) clamp(16px, 4vw, 32px) 72px; }
      .mp-section { padding: clamp(18px, 4vw, 26px); margin-bottom: 14px; }
      .mp-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .mp-editbtn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; background: transparent; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: ${R.pill}px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; min-height: 34px; }
      .mp-rows { display: flex; flex-direction: column; }
      .mp-row { display: grid; grid-template-columns: 150px 1fr; gap: 4px 18px; padding: 10px 0; border-top: 1px solid ${C.rule}; }
      .mp-row:first-child { border-top: none; padding-top: 0; }
      .mp-row-label { font-size: 11.5px; color: ${C.inkMute}; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.5; padding-top: 2px; }
      .mp-row-value { font-size: 15px; line-height: 1.5; min-width: 0; overflow-wrap: anywhere; }
      .mp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; padding-top: 16px; border-top: 1px solid ${C.rule}; }
      .mp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 18px; }
      .mp-stat { background: ${C.paper}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 14px 12px; min-width: 0; }
      .mp-stat-v { font-size: 15px; color: ${C.ink}; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
      .mp-quote { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(17px, 2.6vw, 20px); line-height: 1.45; color: ${C.ink}; letter-spacing: -0.01em; }
      @media (max-width: 480px) {
        .mp-row { grid-template-columns: 1fr; gap: 2px; }
        .mp-actions button { flex: 1 1 100%; }
      }
    `}</style>
  );

  // ════════════════════════════════════════════════════════════════════════════════════════
  // ENTRY — application number + owner token
  // ════════════════════════════════════════════════════════════════════════════════════════
  if (step === 'input') {
    const disabled = loading || !appNumber || !ownerToken;
    return (
      <>
        <Head><title>My profile — Rentletter</title><meta name="robots" content="noindex" /></Head>
        <GlobalStyle />
        {styles}
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', flexDirection: 'column' }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
            <a href="/" style={{ color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Home
            </a>
          </header>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(28px, 5vw, 56px) clamp(16px, 4vw, 32px)' }}>
            <div style={{ maxWidth: 520, width: '100%' }}>
              <div className="rl-in"><Eyebrow>My profile</Eyebrow></div>
              <h1 className="rl-serif rl-in" style={{ fontSize: 'clamp(32px, 6vw, 48px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 16, textWrap: 'balance', '--rl-d': '60ms' }}>
                Your application, kept in one place.
              </h1>
              <p className="rl-in" style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 30, '--rl-d': '110ms' }}>
                See who’s viewed it, update your details, and apply to your next listing in seconds — without retyping a thing. Your number and owner key are in the confirmation email from your first application.
              </p>

              <form className="rl-in" style={{ '--rl-d': '160ms' }} onSubmit={(e) => { e.preventDefault(); if (!disabled) load(appNumber.trim(), ownerToken.trim()); }}>
                <label htmlFor="mp-app" style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Application number</label>
                <input id="mp-app" value={appNumber} onChange={(e) => setAppNumber(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" autoComplete="off" spellCheck={false}
                  style={{ width: '100%', padding: '15px 16px', fontSize: 16, fontFamily: 'monospace', letterSpacing: '0.04em', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, outline: 'none', marginBottom: 18 }} />
                <label htmlFor="mp-key" style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Owner key</label>
                <input id="mp-key" type="password" value={ownerToken} onChange={(e) => setOwnerToken(e.target.value.toUpperCase())} placeholder="32-character key" autoComplete="off" spellCheck={false}
                  style={{ width: '100%', padding: '15px 16px', fontSize: 16, fontFamily: 'monospace', letterSpacing: '0.02em', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, outline: 'none', marginBottom: 16 }} />
                {error && (
                  <div role="alert" style={{ marginBottom: 14, padding: '11px 14px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{error}</div>
                )}
                <button type="submit" disabled={disabled} className="rl-btn"
                  style={{ width: '100%', background: disabled ? C.ruleDark : C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 16, fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 52 }}>
                  {loading ? 'Opening your profile…' : 'Open my profile →'}
                </button>
              </form>

              <div className="rl-in" style={{ marginTop: 28, display: 'grid', gap: 10, '--rl-d': '210ms' }}>
                <div style={{ padding: '14px 16px', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                  <strong style={{ color: C.ink }}>Can’t find your owner key?</strong> Search your inbox for “Rentletter” — the confirmation email has both the number and the key. We can’t recover it for you; it’s the only thing that unlocks your profile.
                </div>
                <div style={{ padding: '14px 16px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                  <strong style={{ color: C.ink }}>Haven’t applied anywhere yet?</strong> There’s nothing here until you do. Your profile is created the first time you apply through a realtor’s invite link — after that, every listing takes seconds.
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // PROFILE
  // ════════════════════════════════════════════════════════════════════════════════════════
  const p = data?.profile || {};
  const t = p.tenant || {}, emp = p.employment || {}, rent = p.rental || {}, mv = p.move || {}, hh = p.household || {}, life = p.lifestyle || {};
  const co = p.coApplicant, veh = p.vehicle, refs = p.references || [];
  const revoked = !!data?.revoked;
  const firstName = String(t.fullName || '').trim().split(' ')[0] || '';
  const canEdit = !revoked && !editing;
  const hasRental = !!(rent.previousAddress || rent.previousLandlordName || rent.yearsAtPrevious);
  const contactParts = String(rent.previousLandlordContact || '').split(' · ').filter(Boolean);

  const sec = (id) => ({
    id, editing: editing === id, canEdit, saving, justSaved: justSaved === id,
    onEdit: () => startEdit(id), onCancel: cancelEdit, onSave: saveEdit,
  });

  return (
    <>
      <Head><title>{t.fullName ? `${t.fullName} — My profile — Rentletter` : 'My profile — Rentletter'}</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      {styles}
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <button onClick={signOut} style={{ background: 'transparent', color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${C.rule}`, borderRadius: R.pill, padding: '8px 14px', minHeight: 36 }}>
            Sign out
          </button>
        </header>

        <div className="mp-wrap">
          {/* ── Identity ─────────────────────────────────────────────────────────── */}
          <div className="rl-in" style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Eyebrow>My profile</Eyebrow>
              <span style={{ fontSize: 11.5, color: C.inkMute, fontFamily: 'monospace', letterSpacing: '0.04em', marginBottom: 12 }}>{data.applicationNumber}</span>
              <span style={{ marginBottom: 12, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: revoked ? C.paper : C.green, background: revoked ? C.danger : C.greenTint, border: `1px solid ${revoked ? C.danger : C.green}`, padding: '3px 9px', borderRadius: R.pill }}>
                {revoked ? 'Revoked' : 'Active'}
              </span>
            </div>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(34px, 7vw, 54px)', color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.02, marginBottom: 10, textWrap: 'balance', overflowWrap: 'anywhere' }}>
              {t.fullName || 'Your profile'}
            </h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, maxWidth: 560 }}>
              {[emp.jobTitle, emp.employer].filter(Boolean).join(' at ')}
              {(emp.jobTitle || emp.employer) ? ' · ' : ''}
              Applied {data.createdAt ? dateLong(data.createdAt) : '—'}
              {data.updatedAt && <> · <span style={{ color: C.green, fontWeight: 600 }}>Updated {timeAgo(data.updatedAt)}</span></>}
            </p>
          </div>

          {error && <div role="alert" style={{ marginBottom: 18, padding: '12px 16px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink }}>{error}</div>}

          {/* ── Reuse — the benefit ───────────────────────────────────────────────── */}
          <div className="rl-in" style={{ position: 'relative', overflow: 'hidden', background: C.ink, color: C.paper, borderRadius: R.card, padding: 'clamp(20px, 4vw, 28px)', marginBottom: 26, '--rl-d': '80ms' }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 3, background: C.red }} />
            <Eyebrow>Apply in seconds</Eyebrow>
            <h2 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 8, textWrap: 'balance' }}>
              {revoked ? 'Reactivate to use this profile for your next listing' : 'Your next listing, without the retyping'}
            </h2>
            <p style={{ fontSize: 14, color: '#c8c2b3', lineHeight: 1.6, marginBottom: 16, maxWidth: 520 }}>
              {revoked
                ? 'While your application is revoked, it can’t be used to apply elsewhere. Reactivate it below and this comes back.'
                : 'Paste the invite link a realtor sent you. We’ll open their application with everything here already filled in — you check it and confirm before anything is sent. Each listing gets its own application; this profile stays the source.'}
            </p>
            {!revoked && (
              <form onSubmit={goApplyWithProfile} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label htmlFor="mp-invite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Invite link</label>
                <input id="mp-invite" value={inviteLink} onChange={(e) => { setInviteLink(e.target.value); setInviteErr(''); }} placeholder="rentletter.ca/apply/…" inputMode="url" autoComplete="off" spellCheck={false}
                  style={{ flex: '1 1 220px', minWidth: 0, padding: '13px 14px', fontSize: 16, border: `1px solid ${C.instRule || '#2a2a2e'}`, borderRadius: R.ctrl, background: '#1a1a1d', color: C.paper, outline: 'none' }} />
                <button type="submit" className="rl-btn" style={{ flex: '0 0 auto', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Apply with my profile <Icon name="arrow" size={14} />
                </button>
              </form>
            )}
            {inviteErr && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: '#f0b9bb', lineHeight: 1.5 }}>{inviteErr}</div>}
            {!revoked && (
              <p style={{ fontSize: 12, color: '#9a958a', lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}>
                Or open any Rentletter invite link on this device and tap <strong style={{ color: '#c8c2b3' }}>Use my saved profile</strong>. Your owner key never leaves this device in a link.
              </p>
            )}
          </div>

          {revoked && (
            <div role="status" className="rl-in" style={{ marginBottom: 18, padding: '14px 18px', background: C.paperDeep, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
              <strong>This application is revoked</strong>{data.revokedAt ? ` (since ${dateLong(data.revokedAt)})` : ''}. Realtors see a “revoked” notice instead of your details, and editing is paused. Everything below is still yours — reactivate any time.
            </div>
          )}
          {saveError && <div role="alert" style={{ marginBottom: 14, padding: '12px 16px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{saveError}</div>}

          {/* ── Employment ─────────────────────────────────────────────────────────── */}
          <Section {...sec('employment')} title="Employment & income" blurb="What realtors screen on first."
            rows={<>
              <Row label="Job title" value={emp.jobTitle} />
              <Row label={emp.employmentType === 'self-employed' ? 'Business' : 'Employer'} value={emp.employer ? `${emp.employer}${EMP_LABEL[emp.employmentType] ? ` · ${EMP_LABEL[emp.employmentType]}` : ''}` : null} />
              <Row label={emp.employmentType === 'self-employed' ? 'Years in business' : 'Time in role'} value={emp.yearsAtJob ? `${emp.yearsAtJob} yr${String(emp.yearsAtJob) === '1' ? '' : 's'}` : null} />
              <Row label="Income before tax" value={money(emp.annualIncome) ? `${money(emp.annualIncome)} CAD/yr${emp.monthlyIncome ? ` · ${money(emp.monthlyIncome)}/mo` : ''}` : null} />
              <Row label="After tax" value={money(emp.netIncome) ? `${money(emp.netIncome)} CAD/yr ${emp.netIncomeSource === 'stated' ? '(you entered)' : '(estimate)'}` : null} />
            </>}>
            {draft && <>
              <SelectField label="Employment type" value={draft.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[
                { value: '', label: 'Select…' }, { value: 'full-time', label: 'Full-time' }, { value: 'part-time', label: 'Part-time' }, { value: 'contract', label: 'Contract' }, { value: 'self-employed', label: 'Self-employed (own or family business)' },
              ]} />
              <Field label="Job title" required value={draft.jobTitle} onChange={(v) => set('jobTitle', v)} />
              <Field label={draft.employmentType === 'self-employed' ? 'Registered business name' : 'Employer'} required value={draft.employer} onChange={(v) => updateEmployment({ employer: v })}
                hint={draft.employmentType === 'self-employed' ? 'The business as it’s registered — your own, or a family business you work for.' : undefined} />
              <div className="mp-grid2">
                <Field label={draft.employmentType === 'self-employed' ? 'Years in business' : 'Years at this job'} value={draft.yearsAtJob} onChange={(v) => set('yearsAtJob', v)} placeholder="3" />
                <Field label="Annual income before tax (CAD)" required value={draft.annualIncome} onChange={updateGross} placeholder="85,000" type="number" inputMode="numeric" hint="Gross — before deductions." />
              </div>
              <div>
                <Field label="Estimated after-tax income (CAD/yr)" value={draft.netIncome} onChange={updateNet} type="number" inputMode="numeric"
                  hint={draft.netIncomeSource === 'stated' ? 'You entered this yourself.' : `Estimate for ${PROV_NAME[province]} at ${TAX_YEAR} rates — please correct if yours is different.`} />
                {draft.netIncomeSource === 'stated' && (
                  <button type="button" onClick={resetNet} style={{ marginTop: 6, background: 'transparent', border: 'none', padding: 0, color: C.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Use the {PROV_NAME[province]} estimate instead</button>
                )}
              </div>
            </>}
          </Section>

          {/* ── Contact ─────────────────────────────────────────────────────────────── */}
          <Section {...sec('contact')} title="Contact"
            rows={<>
              <Row label="Email" value={p.email} />
              <Row label="Phone" value={t.phone} />
            </>}>
            {draft && <>
              <Field label="Email" required value={draft.email} onChange={(v) => set('email', v)} type="email" inputMode="email" />
              <Field label="Phone" required value={draft.phone} onChange={(v) => set('phone', formatPhone(v))} type="tel" inputMode="tel" />
            </>}
          </Section>

          {/* ── Rental history ─────────────────────────────────────────────────────── */}
          <Section {...sec('rental')} title="Rental history" blurb="A landlord who can vouch for your tenancy carries more weight than anything else here."
            rows={hasRental ? <>
              <Row label="Address" value={rent.previousAddress} />
              <Row label="Time there" value={tenureLabel(rent.yearsAtPrevious)} />
              <Row label="Rent" value={money(rent.currentRent) ? `${money(rent.currentRent)}/mo` : null} />
              <Row label="Landlord reference" value={rent.previousLandlordName ? `${rent.previousLandlordName}${contactParts.length ? ` · ${contactParts.join(' · ')}` : ''}` : null} />
            </> : (
              <div style={{ padding: '16px 18px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                No previous rental listed. Plenty of strong applications start here — if you’ve rented before, adding a landlord reference is the single biggest upgrade you can make.
              </div>
            )}>
            {draft && <>
              <SelectField label="Your rental situation" value={draft.rentalStatus} onChange={updateRentalStatus} options={[
                { value: 'current', label: 'I’m renting now' }, { value: 'previous', label: 'I’ve rented before, but not right now' }, { value: 'none', label: 'No previous rental to list' },
              ]} />
              {draft.rentalStatus !== 'none' && <>
                <Field label="Rental address" value={draft.previousAddress} onChange={(v) => set('previousAddress', v)} />
                <div className="mp-grid2">
                  <SelectField label="Time there — years" value={draft.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[{ value: '', label: 'Select…' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })), { value: '10', label: '10+' }]} />
                  <SelectField label="… plus months" value={draft.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[{ value: '', label: '0' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
                  <Field label="Rent (CAD/mo)" value={draft.currentRent} onChange={(v) => set('currentRent', v)} type="number" inputMode="numeric" />
                </div>
                <Field label="Landlord’s name" value={draft.previousLandlordName} onChange={(v) => set('previousLandlordName', v)} />
                <div className="mp-grid2">
                  <Field label="Their email" value={draft.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} type="email" inputMode="email" />
                  <Field label="Their phone" value={draft.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} type="tel" inputMode="tel" />
                </div>
              </>}
            </>}
          </Section>

          {/* ── Move ──────────────────────────────────────────────────────────────── */}
          <Section {...sec('move')} title="Your move" blurb="Update this before you apply somewhere new if your timing has changed."
            rows={<>
              <Row label="Move-in date" value={mv.moveInDate} />
              <Row label="Reason" value={mv.reasonForMoving} multiline />
            </>}>
            {draft && <>
              <Field label="Desired move-in date" value={draft.moveInDate} onChange={(v) => set('moveInDate', v)} type="date" />
              <Textarea label="Why are you moving?" value={draft.reasonForMoving} onChange={(v) => set('reasonForMoving', v)} />
            </>}
          </Section>

          {/* ── Household ──────────────────────────────────────────────────────────── */}
          <Section {...sec('household')} title="Household, pets & parking"
            rows={<>
              <Row label="Occupants" value={hh.numberOfOccupants ? `${hh.numberOfOccupants}${hh.occupantsDetails ? ` — ${hh.occupantsDetails}` : ''}` : null} />
              <Row label="Smoking / vaping" value={{ no: 'No', yes: 'Yes', outdoor: 'Outdoor only' }[hh.smoker] || 'No'} />
              <Row label="Pets" value={life.pets || 'None'} />
              <Row label="Co-tenant" value={co ? [co.name, [co.jobTitle, co.employer].filter(Boolean).join(' at '), money(co.annualIncome) ? `${money(co.annualIncome)}/yr` : null].filter(Boolean).join(' · ') : 'Applying on my own'} />
              <Row label="Vehicle" value={veh ? [veh.makeModel, veh.year].filter(Boolean).join(' · ') || 'Yes' : 'None'} />
              <Row label="EV parking" value={hh.evParkingNeeded === 'yes' ? 'Needed' : 'Not needed'} />
            </>}>
            {draft && <>
              <div className="mp-grid2">
                <Field label="Total occupants" value={draft.numberOfOccupants} onChange={(v) => set('numberOfOccupants', v)} type="number" inputMode="numeric" />
                <SelectField label="Smoking or vaping?" value={draft.smoker} onChange={(v) => set('smoker', v)} options={[{ value: 'no', label: 'No' }, { value: 'outdoor', label: 'Outdoor only' }, { value: 'yes', label: 'Yes' }]} />
              </div>
              <Textarea label="Other occupants (optional)" value={draft.occupantsDetails} onChange={(v) => set('occupantsDetails', v)} />
              <ToggleField label="Do you have pets?" value={draft.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
              {draft.hasPets && (
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div className="mp-grid2">
                    <SelectField label="Type" value={draft.petType} onChange={(v) => updatePets({ petType: v })} options={[{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }, { value: 'catdog', label: 'Cats & dogs' }, { value: 'other', label: 'Other' }]} />
                    <SelectField label="How many" value={draft.petCount} onChange={(v) => updatePets({ petCount: v })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3+', label: '3 or more' }]} />
                    <SelectField label="Size of largest (optional)" value={draft.petSize} onChange={(v) => updatePets({ petSize: v })} options={[{ value: '', label: 'Select…' }, { value: 'small', label: 'Small (under 25 lb)' }, { value: 'medium', label: 'Medium (25–60 lb)' }, { value: 'large', label: 'Large (60+ lb)' }]} />
                  </div>
                  <ToggleField label="Spayed / neutered" value={draft.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
                  <ToggleField label="House-trained" value={draft.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
                  <Field label="Anything else about your pet(s) (optional)" value={draft.petNotes} onChange={(v) => updatePets({ petNotes: v })} />
                </div>
              )}
              <ToggleField label="Applying with a co-tenant? (another adult who’ll be on the lease)" value={draft.hasCoApplicant} onChange={(v) => set('hasCoApplicant', v)} />
              {draft.hasCoApplicant && (
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <Field label="Full name" value={draft.coApplicantName} onChange={(v) => set('coApplicantName', v)} />
                  <Field label="Job title" value={draft.coApplicantJobTitle} onChange={(v) => set('coApplicantJobTitle', v)} />
                  <Field label="Employer" value={draft.coApplicantEmployer} onChange={(v) => set('coApplicantEmployer', v)} />
                  <Field label="Annual income (CAD)" value={draft.coApplicantIncome} onChange={(v) => set('coApplicantIncome', v)} type="number" inputMode="numeric" />
                </div>
              )}
              <ToggleField label="Do you have a vehicle?" value={draft.hasVehicle} onChange={(v) => set('hasVehicle', v)} />
              {draft.hasVehicle && (
                <div className="mp-grid2">
                  <Field label="Make and model" value={draft.vehicleMakeModel} onChange={(v) => set('vehicleMakeModel', v)} />
                  <Field label="Year" value={draft.vehicleYear} onChange={(v) => set('vehicleYear', v)} type="number" inputMode="numeric" />
                </div>
              )}
              <SelectField label="Do you need EV parking?" value={draft.evParkingNeeded} onChange={(v) => set('evParkingNeeded', v)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
            </>}
          </Section>

          {/* ── In your own words ─────────────────────────────────────────────────── */}
          <Section {...sec('words')} title="In your own words" blurb="Goes to the landlord exactly as you write it."
            rows={<>
              {life.personality
                ? <blockquote className="mp-quote" style={{ margin: '2px 0 14px', paddingLeft: 16, borderLeft: `3px solid ${C.red}` }}>“{life.personality}”</blockquote>
                : <div style={{ padding: '16px 18px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>You haven’t added an intro yet. A few lines about how you live — work-from-home, quiet evenings, long-term plans — is what makes an application feel like a person.</div>}
              <Row label="Anything addressed" value={p.disclosures} multiline />
            </>}>
            {draft && <>
              <div>
                <Textarea label="Tell the landlord a bit about yourself and how you live" value={draft.personality} onChange={(v) => set('personality', v.slice(0, 500))} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: C.inkMute, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{draft.personality.length}/500</div>
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, margin: 0, padding: '10px 14px', background: C.paperDeep, borderRadius: R.ctrl }}>
                One thing you can skip: your background, beliefs, or family. Landlords aren’t allowed to consider those, so leaving them out will never affect your application.
              </p>
              <Textarea label="Anything to address? (gaps in history, credit, etc.)" value={draft.redFlags} onChange={(v) => set('redFlags', v)} />
            </>}
          </Section>

          {/* ── References ──────────────────────────────────────────────────────────── */}
          <Section {...sec('references')} title="References"
            rows={refs.length ? refs.map((r, i) => (
              <Row key={i} label={`Reference ${i + 1}`} value={[r.name, r.relationship, r.contact].filter(Boolean).join(' · ')} />
            )) : (
              <div style={{ padding: '16px 18px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                No references yet. Two people who can vouch for you — named, with a way to reach them — are more persuasive than “references available.”
              </div>
            )}>
            {draft && [1, 2].map((n) => (
              <div key={n} style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Reference {n}</div>
                <Field label="Full name" value={draft[`reference${n}Name`]} onChange={(v) => set(`reference${n}Name`, v)} />
                <div className="mp-grid2">
                  <Field label="Relationship" value={draft[`reference${n}Relationship`]} onChange={(v) => set(`reference${n}Relationship`, v)} />
                  <Field label="Phone or email" value={draft[`reference${n}Contact`]} onChange={(v) => set(`reference${n}Contact`, v)} />
                </div>
              </div>
            ))}
          </Section>

          {/* ── Privacy ─────────────────────────────────────────────────────────────── */}
          <div className="rl-in" style={{ marginTop: 30, marginBottom: 14 }}>
            <Eyebrow>Privacy</Eyebrow>
            <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 28px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance' }}>Who’s seen it, and the off switch</h2>
          </div>
          <div className="rl-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <div className="mp-stat">
              <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Lookups</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{data.lookupCount || 0}</div>
            </div>
            <div className="mp-stat">
              <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Last viewed</div>
              <div className="mp-stat-v">{data.lookups?.length ? timeAgo(data.lookups[data.lookups.length - 1].at) : 'Not yet'}</div>
            </div>
            <div className="mp-stat">
              <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Last updated</div>
              <div className="mp-stat-v">{data.updatedAt ? timeAgo(data.updatedAt) : 'Never edited'}</div>
            </div>
          </div>

          <div className="rl-in" style={{ position: 'relative', overflow: 'hidden', background: C.ink, color: C.paper, padding: 'clamp(18px, 4vw, 26px)', borderRadius: R.card, marginBottom: 14 }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: revoked ? C.green : C.red }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{revoked ? 'Application is revoked' : 'Application is active'}</div>
                <div style={{ fontSize: 13, color: '#c8c2b3', lineHeight: 1.55 }}>
                  {revoked ? 'Realtors with your number see a “revoked” notice instead of your details. Reactivate to restore access — and editing, and reuse.' : 'Anyone with your application number can view it. If that changes, revoke it here — you can reactivate later.'}
                </div>
              </div>
              <button onClick={() => performAction(revoked ? 'unrevoke' : 'revoke')} disabled={actionLoading || !!editing}
                style={{ background: revoked ? C.green : C.danger, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading || editing ? 0.5 : 1, minHeight: 46, flex: '0 0 auto' }}>
                {actionLoading ? 'Working…' : (revoked ? 'Reactivate application' : 'Revoke application')}
              </button>
            </div>
          </div>

          <div className="rl-in rl-card" style={{ padding: 'clamp(16px, 4vw, 22px)' }}>
            <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', color: C.ink, minHeight: 36 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Lookup history <span style={{ color: C.inkMute, fontWeight: 600 }}>· {data.lookupCount || 0}</span></span>
              <span style={{ display: 'inline-flex', transform: showLog ? 'rotate(180deg)' : 'none', color: C.inkSoft }}><Icon name="chevronD" size={16} /></span>
            </button>
            {showLog && (
              <div style={{ marginTop: 14 }}>
                {(data.lookups || []).length === 0 ? (
                  <div style={{ padding: '20px 18px', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.ctrl, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                    No one has looked up your application yet. When a realtor pulls it up, it shows here.
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.ctrl, overflow: 'hidden' }}>
                    {[...data.lookups].reverse().map((entry, idx) => (
                      <div key={idx} style={{ padding: '12px 14px', borderTop: idx ? `1px solid ${C.rule}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: idx === 0 ? C.paperDeep : C.paper }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Viewer {entry.ipHash || 'unknown'}</div>
                          <div style={{ fontSize: 12, color: C.inkMute }}>{entry.uaShort ? entry.uaShort.split(' ').slice(0, 4).join(' ') : 'Unknown device'}</div>
                        </div>
                        <div style={{ fontSize: 12, color: C.inkSoft, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: C.ink }}>{timeAgo(entry.at)}</div>
                          <div style={{ color: C.inkMute, fontSize: 11 }}>{new Date(entry.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ marginTop: 12, fontSize: 12, color: C.inkMute, lineHeight: 1.55 }}>Viewer identifiers are hashed — we don’t store IP addresses. A repeating identifier is the same person looking again.</p>
              </div>
            )}
          </div>

          <p style={{ marginTop: 26, fontSize: 12.5, color: C.inkMute, lineHeight: 1.6, maxWidth: 600 }}>
            Your profile holds the facts you typed — never documents. Anything you upload for a realtor is analysed and discarded, not stored here. Edits update this application everywhere it’s been shared; they never create a new one.
          </p>
        </div>

        {toast && (
          <div role="status" onClick={() => setToast('')}
            style={{ position: 'fixed', left: '50%', bottom: 'max(20px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 300, background: C.green, color: C.paper, padding: '12px 20px', borderRadius: R.pill, boxShadow: '0 8px 24px rgba(15,15,16,0.22)', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 9, maxWidth: '92vw', cursor: 'pointer' }}>
            <Icon name="check" size={15} strokeWidth={2.5} /> {toast}
          </div>
        )}
      </div>
    </>
  );
}
