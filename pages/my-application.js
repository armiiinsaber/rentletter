// pages/my-application.js
// The UNIFIED tenant profile — one portable rental identity, keyed by email.
//
//   SIGN-IN   email → magic link (no password, no account step). Enumeration-safe copy.
//   PROFILE   the durable facts (editable — edits apply to FUTURE applications only) +
//             every application they've sent (each a frozen snapshot with its own page,
//             privacy console and per-application edit path) + email settings + sign out.
//   REUSE     paste a new invite link → /apply/{token}#profile prefilled from the profile.
//
// Legacy entry (application number + owner key, and the ?app=&token= email deep link) still
// works: it opens that application's own page at /my-application/[rl].
// Static header, reveal gated by reduced-motion (useReveal), 390px-safe.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, Icon, useReveal } from '../components/ui';
import { ProfileStyles, FactSections, Eyebrow, Empty } from '../components/tenant/ProfileFacts';

const LS_APP = 'rentletter_app_number';
const LS_TOKEN = 'rentletter_owner_token';
const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return '—'; } };
function timeAgo(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now'; if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60); if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24); return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : dateLong(iso);
}
const STATUS_COLOR = { submitted: C.inkSoft, review: C.green, not_selected: C.inkMute, withdrawn: C.inkMute };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MyProfile() {
  const router = useRouter();
  const [phase, setPhase] = useState('boot');   // boot | entry | sent | profile
  const [profile, setProfile] = useState(null);
  const [notice, setNotice] = useState(null);   // { tone: 'ok'|'warn', text }
  // entry
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [entryErr, setEntryErr] = useState('');
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyApp, setLegacyApp] = useState('');
  const [legacyKey, setLegacyKey] = useState('');
  // profile editing
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  // reuse + email + link
  const [inviteLink, setInviteLink] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkApp, setLinkApp] = useState('');
  const [linkKey, setLinkKey] = useState('');
  const [linkMsg, setLinkMsg] = useState('');
  useReveal(phase + (profile?.profileRevision || '') + (profile?.applications?.length || ''));

  const loadProfile = async () => {
    const r = await fetch('/api/tenant/profile');
    if (r.ok) { setProfile(await r.json()); setPhase('profile'); return true; }
    return false;
  };

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    // Legacy email deep link → that application's page (the token leaves the URL there).
    if (q.app && q.token) { router.replace(`/my-application/${String(q.app).toUpperCase()}?token=${encodeURIComponent(String(q.token))}`); return; }
    const flags = {
      link: { expired: ['warn', 'That link has expired or was already used. Request a fresh one below.'], error: ['warn', 'We couldn’t open that link. Request a fresh one below.'], unavailable: ['warn', 'Sign-in is temporarily unavailable. Please try again shortly.'] },
      email: { changed: ['ok', 'Your email is updated — that address is now how you sign in.'], expired: ['warn', 'That confirmation link expired. Request the email change again.'], taken: ['warn', 'That email already has its own profile. Sign in with it instead — merging profiles isn’t available yet.'], error: ['warn', 'We couldn’t complete the email change. Try again.'] },
    };
    for (const k of ['link', 'email']) if (q[k] && flags[k][q[k]]) { const [tone, text] = flags[k][q[k]]; setNotice({ tone, text }); }
    if (q.link || q.email) router.replace('/my-application', undefined, { shallow: true });
    (async () => { if (!(await loadProfile())) setPhase('entry'); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const post = async (body) => {
    const r = await fetch('/api/tenant/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || 'Something went wrong.');
    return j;
  };

  // ── entry ──
  const requestLink = async (e) => {
    e.preventDefault(); if (sending) return;
    setSending(true); setEntryErr('');
    try {
      const r = await fetch('/api/tenant/request-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Something went wrong. Please try again.');
      setPhase('sent');
    } catch (err) { setEntryErr(err.message); }
    setSending(false);
  };
  const openLegacy = (e) => {
    e.preventDefault();
    const rl = legacyApp.trim().toUpperCase();
    if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(rl) || !legacyKey.trim()) { setEntryErr('Check the application number (RL-YYYY-XXXX-XXXX) and the 32-character key.'); return; }
    try { localStorage.setItem(LS_APP, rl); localStorage.setItem(LS_TOKEN, legacyKey.trim().toUpperCase()); } catch (err) { /* ignore */ }
    router.push(`/my-application/${rl}`);
  };

  // ── profile facts ──
  const startEdit = (id) => {
    setDraft({ ...(profile.facts || {}), email: profile.email }); setSaveError(''); setEditing(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 20);
  };
  const cancelEdit = () => { setEditing(null); setDraft(null); setSaveError(''); };
  const saveEdit = async () => {
    if (!draft || saving) return;
    setSaving(true); setSaveError('');
    try {
      const j = await post({ action: 'update-facts', form: draft });
      setProfile((p) => ({ ...p, facts: j.facts, factsUpdatedAt: j.factsUpdatedAt, profileRevision: j.profileRevision }));
      const id = editing; setEditing(null); setDraft(null); setJustSaved(id);
      setToast('Saved to your profile — applies to your next applications');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (err) { setSaveError(err.message); }
    setSaving(false);
  };

  const goApplyWithProfile = (e) => {
    e.preventDefault();
    const m = String(inviteLink).match(/apply\/([a-f0-9]{20})/i);
    if (!m) { setInviteErr('That doesn’t look like a Rentletter invite link — it looks like rentletter.ca/apply/… Paste the whole link.'); return; }
    setInviteErr(''); router.push(`/apply/${m[1].toLowerCase()}#profile`);
  };
  const requestEmailChange = async (e) => {
    e.preventDefault(); if (emailBusy) return;
    setEmailBusy(true); setEmailMsg('');
    try { const j = await post({ action: 'request-email-change', newEmail }); setProfile((p) => ({ ...p, pendingEmail: j.pendingEmail })); setNewEmail(''); setEmailMsg('Check the new address for a confirmation link. Until you confirm, this email keeps working.'); }
    catch (err) { setEmailMsg(err.message); }
    setEmailBusy(false);
  };
  const cancelEmailChange = async () => { try { await post({ action: 'cancel-email-change' }); setProfile((p) => ({ ...p, pendingEmail: null })); setEmailMsg(''); } catch (err) { setEmailMsg(err.message); } };
  const linkApplication = async (e) => {
    e.preventDefault(); setLinkMsg('');
    try { await post({ action: 'link-application', applicationNumber: linkApp, ownerToken: linkKey }); setLinkApp(''); setLinkKey(''); setLinkOpen(false); await loadProfile(); setToast('Application added to your profile'); setTimeout(() => setToast(''), 4000); }
    catch (err) { setLinkMsg(err.message); }
  };
  const signOut = async () => { try { await post({ action: 'sign-out' }); } catch (e) { /* ignore */ } setProfile(null); setPhase('entry'); };

  const header = (right) => (
    <header className="mp-header">
      <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
      {right}
    </header>
  );
  const noticeEl = notice && (
    <div role="status" className={notice.tone === 'ok' ? 'mp-note' : 'mp-alert'} style={{ marginBottom: 18, ...(notice.tone === 'ok' ? { background: C.greenTint, color: C.ink, borderLeft: `3px solid ${C.green}` } : {}) }}>{notice.text}</div>
  );

  // ════════════════════════════════════════════════════════════════════════════════════════
  if (phase === 'boot') {
    return (<><Head><title>My profile — Rentletter</title></Head><GlobalStyle /><ProfileStyles /><div style={{ minHeight: '100vh', background: C.paper }}>{header(null)}<div className="mp-wrap"><p style={{ color: C.inkSoft }}>Opening your profile…</p></div></div></>);
  }

  if (phase === 'entry' || phase === 'sent') {
    return (
      <>
        <Head><title>Tenant profile — Rentletter</title><meta name="robots" content="noindex" /></Head>
        <GlobalStyle /><ProfileStyles />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', flexDirection: 'column' }}>
          {header(<a href="/" className="mp-ghost"><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={13} /></span> Home</a>)}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(28px, 5vw, 56px) clamp(16px, 4vw, 32px)' }}>
            <div style={{ maxWidth: 520, width: '100%' }}>
              <div className="rl-in"><Eyebrow>Tenant profile</Eyebrow></div>
              {phase === 'sent' ? (
                <div className="rl-in">
                  <h1 className="rl-serif" style={{ fontSize: 'clamp(32px, 6vw, 48px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 16, textWrap: 'balance' }}>Check your inbox.</h1>
                  <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 22 }}>If <strong style={{ color: C.ink, overflowWrap: 'anywhere' }}>{email}</strong> has an application with us, we’ve sent a link. It works once and expires in 15 minutes — open it on whichever device you’re on.</p>
                  <div className="mp-note" style={{ marginBottom: 18 }}>Nothing arrived? Check spam for “Rentletter”, make sure it’s the email you applied with, then <button type="button" onClick={() => setPhase('entry')} style={{ background: 'transparent', border: 'none', padding: 0, color: C.red, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>try again</button>.</div>
                </div>
              ) : (
                <>
                  <h1 className="rl-serif rl-in" style={{ fontSize: 'clamp(32px, 6vw, 48px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 16, textWrap: 'balance', '--rl-d': '60ms' }}>Your rental profile, in one place.</h1>
                  <p className="rl-in" style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 26, '--rl-d': '110ms' }}>Every application you’ve sent, your details ready to reuse, and control over who sees what. Enter the email you applied with and we’ll send you a link — no password.</p>
                  {noticeEl}
                  <form className="rl-in" style={{ '--rl-d': '160ms' }} onSubmit={requestLink}>
                    <label htmlFor="tp-email" style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Email</label>
                    <input id="tp-email" className="mp-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ marginBottom: 14 }} />
                    {entryErr && <div role="alert" className="mp-alert" style={{ marginBottom: 14 }}>{entryErr}</div>}
                    <button type="submit" className="mp-btn rl-btn" disabled={sending || !EMAIL_RE.test(email)}>{sending ? 'Sending…' : 'Email me a link →'}</button>
                  </form>
                  <div className="rl-in" style={{ marginTop: 26, '--rl-d': '210ms' }}>
                    <button type="button" onClick={() => setLegacyOpen((v) => !v)} aria-expanded={legacyOpen} style={{ background: 'transparent', border: 'none', padding: 0, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                      Have an application number and owner key instead? <span style={{ display: 'inline-flex', transform: legacyOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevronD" size={14} /></span>
                    </button>
                    {legacyOpen && (
                      <form onSubmit={openLegacy} style={{ marginTop: 12, padding: 16, background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card }}>
                        <input className="mp-input" value={legacyApp} onChange={(e) => setLegacyApp(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" spellCheck={false} style={{ fontFamily: 'monospace', marginBottom: 10 }} aria-label="Application number" />
                        <input className="mp-input" type="password" value={legacyKey} onChange={(e) => setLegacyKey(e.target.value)} placeholder="32-character owner key" spellCheck={false} style={{ fontFamily: 'monospace', marginBottom: 12 }} aria-label="Owner key" />
                        <button type="submit" className="mp-btn" style={{ minHeight: 46, padding: 12, fontSize: 14 }}>Open that application →</button>
                      </form>
                    )}
                    <div className="mp-note" style={{ marginTop: 14 }}><strong style={{ color: C.ink }}>Haven’t applied anywhere yet?</strong> There’s nothing here until you do. Your profile is created the first time you apply through a realtor’s invite link.</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  const f = profile.facts || null;
  const apps = profile.applications || [];

  return (
    <>
      <Head><title>{f?.fullName ? `${f.fullName} — Profile — Rentletter` : 'My profile — Rentletter'}</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        {header(<button onClick={signOut} className="mp-ghost">Sign out</button>)}
        <div className="mp-wrap">
          <div className="rl-in" style={{ marginBottom: 24 }}>
            <Eyebrow>My profile</Eyebrow>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(34px, 7vw, 54px)', color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.02, marginBottom: 10, textWrap: 'balance', overflowWrap: 'anywhere' }}>{f?.fullName || 'Your profile'}</h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, maxWidth: 560 }}>
              <span style={{ overflowWrap: 'anywhere' }}>{profile.email}</span>
              {f && (f.jobTitle || f.employer) ? <> · {[f.jobTitle, f.employer].filter(Boolean).join(' at ')}</> : null}
              {profile.factsUpdatedAt && <> · <span style={{ color: C.green, fontWeight: 600 }}>Details updated {timeAgo(profile.factsUpdatedAt)}</span></>}
            </p>
          </div>
          {noticeEl}

          {/* Reuse */}
          <div className="rl-in mp-ink" style={{ marginBottom: 26, '--rl-d': '80ms' }}>
            <span className="mp-ink-tick" aria-hidden="true" />
            <Eyebrow>Apply in seconds</Eyebrow>
            <h2 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 8, textWrap: 'balance' }}>{f ? 'Your next listing, without the retyping' : 'Your first application builds your profile'}</h2>
            <p style={{ fontSize: 14, color: '#c8c2b3', lineHeight: 1.6, marginBottom: f ? 16 : 0, maxWidth: 520 }}>
              {f ? 'Paste the invite link a realtor sent you. Their application opens with your profile already filled in — you check it and confirm before anything is sent. Each listing gets its own application; your profile stays the source.' : 'Apply through any realtor’s invite link and what you submit becomes your saved profile — ready to reuse for the next one.'}
            </p>
            {f && (
              <form onSubmit={goApplyWithProfile} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label htmlFor="tp-invite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Invite link</label>
                <input id="tp-invite" value={inviteLink} onChange={(e) => { setInviteLink(e.target.value); setInviteErr(''); }} placeholder="rentletter.ca/apply/…" inputMode="url" autoComplete="off" spellCheck={false} style={{ flex: '1 1 220px', minWidth: 0, padding: '13px 14px', fontSize: 16, border: `1px solid ${C.instRule}`, borderRadius: R.ctrl, background: '#1a1a1d', color: C.paper, outline: 'none' }} />
                <button type="submit" className="rl-btn" style={{ flex: '0 0 auto', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Apply with my profile <Icon name="arrow" size={14} /></button>
              </form>
            )}
            {inviteErr && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: '#f0b9bb', lineHeight: 1.5 }}>{inviteErr}</div>}
            {f && <p style={{ fontSize: 12, color: '#9a958a', lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}>Signed in on this device? Any invite link will offer <strong style={{ color: '#c8c2b3' }}>Use my saved profile</strong> automatically. On a new device, sign in here first.</p>}
          </div>

          {/* Durable facts */}
          <div className="rl-in" style={{ marginBottom: 14 }}>
            <Eyebrow>Your details</Eyebrow>
            <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 28px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance', marginBottom: 6 }}>What your next application starts from</h2>
            <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, maxWidth: 560 }}>Edits here apply to applications you send from now on. Anything you’ve already sent keeps exactly what you sent — open it below to change that one.</p>
          </div>
          {saveError && <div role="alert" className="mp-alert" style={{ marginBottom: 14 }}>{saveError}</div>}
          {f ? (
            <FactSections facts={f} draft={draft} editing={editing} setDraft={setDraft} canEdit={!editing} saving={saving} justSaved={justSaved} onEdit={startEdit} onCancel={cancelEdit} onSave={saveEdit} contactEditable={false} saveLabel="Save to my profile" />
          ) : (
            <div className="rl-card rl-in mp-section"><Empty>No details saved yet. They’ll appear here after your first application — or add an application you’ve already sent, below.</Empty></div>
          )}

          {/* Applications */}
          <div className="rl-in" style={{ marginTop: 30, marginBottom: 14 }}>
            <Eyebrow>Your applications</Eyebrow>
            <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 28px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance', marginBottom: 6 }}>What you’ve sent, listing by listing</h2>
            <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, maxWidth: 560 }}>Each one is the exact record that realtor received, with its own lookup history and off switch.</p>
          </div>
          {apps.length === 0 ? (
            <div className="rl-card rl-in mp-section"><Empty>No applications yet. When you apply through a realtor’s invite link, it shows up here.</Empty></div>
          ) : (
            <div className="rl-in rl-card" style={{ overflow: 'hidden', marginBottom: 14 }}>
              {apps.map((a, i) => (
                <a key={a.applicationNumber} href={`/my-application/${a.applicationNumber}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px clamp(14px, 3vw, 18px)', borderTop: i ? `1px solid ${C.rule}` : 'none', textDecoration: 'none', color: C.ink, minHeight: 64 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{a.listingName || 'Rental unit'}</div>
                    <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2, overflowWrap: 'anywhere' }}>
                      {a.realtorName ? `${a.realtorName}${a.realtorBrokerage ? ` · ${a.realtorBrokerage}` : ''} · ` : ''}{a.submittedAt ? dateLong(a.submittedAt) : ''}{a.updatedAt ? ` · edited ${timeAgo(a.updatedAt)}` : ''}
                    </div>
                    {a.referral && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 3 }}>Shared with {a.referral.toName || 'another realtor'} by {a.referral.fromName || 'your realtor'} with your approval{a.referral.assignedListing ? ` · now on ${a.referral.assignedListing}` : ''}. Revoke it from its page to withdraw access.</div>}
                    <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3, fontFamily: 'monospace' }}>{a.applicationNumber}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: a.revoked ? C.paper : (STATUS_COLOR[a.status?.key] || C.inkSoft), background: a.revoked ? C.danger : C.paperDeep, padding: '3px 8px', borderRadius: R.pill, whiteSpace: 'nowrap' }}>{a.revoked ? 'Revoked' : (a.status?.label || 'Submitted')}</span>
                    <Icon name="chevron" size={16} color={C.inkMute} />
                  </div>
                </a>
              ))}
            </div>
          )}
          <div className="rl-in" style={{ marginBottom: 30 }}>
            <button type="button" onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen} style={{ background: 'transparent', border: 'none', padding: 0, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>Missing an application you sent with this email? <span style={{ display: 'inline-flex', transform: linkOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevronD" size={14} /></span></button>
            {linkOpen && (
              <form onSubmit={linkApplication} style={{ marginTop: 12, padding: 16, background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card, display: 'grid', gap: 10 }}>
                <input className="mp-input" value={linkApp} onChange={(e) => setLinkApp(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" spellCheck={false} style={{ fontFamily: 'monospace' }} aria-label="Application number" />
                <input className="mp-input" type="password" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder="Owner key from its confirmation email" spellCheck={false} style={{ fontFamily: 'monospace' }} aria-label="Owner key" />
                {linkMsg && <div role="alert" className="mp-alert">{linkMsg}</div>}
                <button type="submit" className="mp-btn" style={{ minHeight: 46, padding: 12, fontSize: 14 }}>Add to my profile</button>
              </form>
            )}
          </div>

          {/* Email */}
          <div className="rl-in" style={{ marginBottom: 14 }}>
            <Eyebrow>Sign-in email</Eyebrow>
            <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 28px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance' }}>Where your links go</h2>
          </div>
          <div className="rl-in rl-card mp-section">
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, overflowWrap: 'anywhere', marginBottom: 4 }}>{profile.email}</div>
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>Changing it sends a confirmation to the new address first. This one keeps working until you confirm there.</p>
            {profile.pendingEmail ? (
              <div className="mp-note" style={{ borderLeft: `3px solid ${C.gold}`, background: C.amberTint, color: C.ink, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>Waiting for you to confirm at <strong style={{ overflowWrap: 'anywhere' }}>{profile.pendingEmail}</strong>.</span>
                <button type="button" onClick={cancelEmailChange} style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.pill, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: C.ink }}>Cancel</button>
              </div>
            ) : (
              <form onSubmit={requestEmailChange} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input className="mp-input" type="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" style={{ flex: '1 1 220px', minWidth: 0, padding: '13px 14px' }} aria-label="New email" />
                <button type="submit" disabled={emailBusy || !EMAIL_RE.test(newEmail)} className="mp-btn" style={{ width: 'auto', flex: '0 0 auto', minHeight: 48, padding: '13px 18px', fontSize: 14 }}>{emailBusy ? 'Sending…' : 'Change email'}</button>
              </form>
            )}
            {emailMsg && <div role="status" className="mp-note" style={{ marginTop: 12 }}>{emailMsg}</div>}
          </div>

          <p style={{ marginTop: 26, fontSize: 12.5, color: C.inkMute, lineHeight: 1.6, maxWidth: 600 }}>Your profile holds the facts you typed — never documents. Anything you upload for a realtor is analysed and discarded, not stored here.</p>
        </div>
        {toast && <div role="status" onClick={() => setToast('')} style={{ position: 'fixed', left: '50%', bottom: 'max(20px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 300, background: C.green, color: C.paper, padding: '12px 20px', borderRadius: R.pill, boxShadow: '0 8px 24px rgba(15,15,16,0.22)', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 9, maxWidth: '92vw', cursor: 'pointer' }}><Icon name="check" size={15} strokeWidth={2.5} /> {toast}</div>}
      </div>
    </>
  );
}
