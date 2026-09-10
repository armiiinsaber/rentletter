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
// On the realtor tokens (components/tenant/ProfileFacts.js ProfileStyles): the card, the eyebrow,
// the text button, the line and card gaps. Nothing here has a style of its own.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C } from '../components/theme';
import { GlobalStyle, Wordmark, useReveal } from '../components/ui';
import { ProfileStyles, FactSections, Eyebrow, Dots, Chevron, noWidow, dateLong } from '../components/tenant/ProfileFacts';
import { isApplicationNumber, isOwnerToken } from '../lib/applicationIds';

const LS_APP = 'rentletter_app_number';
const LS_TOKEN = 'rentletter_owner_token';
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
      link: { expired: ['warn', 'That link has expired or was already used. Request a fresh one below.'], error: ['warn', 'We couldn’t open that link. Request a fresh one below.'], unavailable: ['warn', 'Sign in is temporarily unavailable. Please try again shortly.'] },
      email: { changed: ['ok', 'Your email is updated, that address is now how you sign in.'], expired: ['warn', 'That confirmation link expired. Request the email change again.'], taken: ['warn', 'That email already has its own profile. Sign in with it instead, merging profiles isn’t available yet.'], error: ['warn', 'We couldn’t complete the email change. Try again.'] },
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
    if (!isApplicationNumber(rl) || !isOwnerToken(legacyKey)) { setEntryErr('Check the application number (RL-YYYY-XXXX-XXXX) and the 32 character key.'); return; }
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
      setToast('Saved to your profile, applies to your next applications');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (err) { setSaveError(err.message); }
    setSaving(false);
  };

  const goApplyWithProfile = (e) => {
    e.preventDefault();
    const m = String(inviteLink).match(/apply\/([a-f0-9]{20})/i);
    if (!m) { setInviteErr('That doesn’t look like a Rentletter invite link, it looks like rentletter.ca/apply/… Paste the whole link.'); return; }
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
  const noticeEl = notice && <p role="status" className={notice.tone === 'ok' ? 'mp-note' : 'mp-alert'}>{noWidow(notice.text)}</p>;
  const shell = (title, right, body) => (
    <>
      <Head><title>{title}</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">{header(right)}<div className="mp-wrap mp-sections">{body}</div></div>
    </>
  );

  if (phase === 'boot') return shell('My profile · Rentletter', null, <div className="rl-card mp-card"><p className="mp-p">Opening your profile</p></div>);

  // ── the entry page: one card, the email, the link; the legacy pair on a second card ──
  if (phase === 'entry' || phase === 'sent') {
    return shell('Tenant profile · Rentletter', <a href="/" className="mp-link">Home</a>, (
      <div className="mp-stack">
        <div className="rl-card rl-in mp-card">
          <Eyebrow>Tenant profile</Eyebrow>
          {phase === 'sent' ? (
            <>
              <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>Check your inbox.</h1>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>If <strong style={{ color: C.ink, overflowWrap: 'anywhere' }}>{email}</strong> {noWidow('has an application with us, we sent a link. It works once and expires in 15 minutes. Open it on whichever device you like.')}</p>
              <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Nothing arrived? Check spam for Rentletter and make sure it is the email you applied with.')}</p>
              <button type="button" onClick={() => setPhase('entry')} className="mp-link">Try another email</button>
            </>
          ) : (
            <>
              <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Your rental profile, in one place.')}</h1>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Every application you sent, your details ready to reuse, and control over who sees what. Enter the email you applied with and we send you a link. No password.')}</p>
              {noticeEl && <div style={{ marginTop: 'var(--gap-card)' }}>{noticeEl}</div>}
              <form className="mp-form" onSubmit={requestLink}>
                <div>
                  <label htmlFor="tp-email" className="mp-label" style={{ display: 'block' }}>Email</label>
                  <input id="tp-email" className="mp-input" style={{ marginTop: 'var(--gap-line)' }} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                {entryErr && <p role="alert" className="mp-alert">{noWidow(entryErr)}</p>}
                <button type="submit" className="mp-btn" disabled={sending || !EMAIL_RE.test(email)}>{sending ? 'Sending' : 'Email me a link'}</button>
              </form>
            </>
          )}
        </div>
        {phase === 'entry' && (
          <div className="rl-card rl-in mp-card">
            <button type="button" onClick={() => setLegacyOpen((v) => !v)} aria-expanded={legacyOpen} className="mp-link" style={{ width: '100%', justifyContent: 'space-between', textDecoration: 'none', gap: 'var(--s-2)' }}>
              <span>{noWidow('Have an application number and owner key instead?')}</span><Chevron open={legacyOpen} />
            </button>
            {legacyOpen && (
              <form onSubmit={openLegacy} className="mp-form">
                <input className="mp-input mp-mono" value={legacyApp} onChange={(e) => setLegacyApp(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" spellCheck={false} aria-label="Application number" />
                <input className="mp-input mp-mono" type="password" value={legacyKey} onChange={(e) => setLegacyKey(e.target.value)} placeholder="32 character owner key" spellCheck={false} aria-label="Owner key" />
                <button type="submit" className="mp-btn">Open that application</button>
              </form>
            )}
            <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Not applied anywhere yet? Your profile is created the first time you apply through a realtor’s invite link.')}</p>
          </div>
        )}
      </div>
    ));
  }

  // ── the profile: who you are, apply in seconds, your details, your applications, your email ──
  const f = profile.facts || null;
  const apps = profile.applications || [];
  const inkMute = '#8f8b81', inkText = '#c8c2b3';
  return shell(f?.fullName ? `${f.fullName}, Profile · Rentletter` : 'My profile · Rentletter', <button type="button" onClick={signOut} className="mp-link">Sign out</button>, (
    <>
      <div className="mp-stack">
        <div className="rl-card rl-in mp-card">
          <Eyebrow>My profile</Eyebrow>
          <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{f?.fullName || 'Your profile'}</h1>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}><Dots items={[profile.email, f && (f.jobTitle || f.employer) ? [f.jobTitle, f.employer].filter(Boolean).join(' at ') : null, profile.factsUpdatedAt ? `Details updated ${dateLong(profile.factsUpdatedAt)}` : null]} /></p>
          {noticeEl && <div style={{ marginTop: 'var(--gap-card)' }}>{noticeEl}</div>}
        </div>
        {/* Reuse: the one ink surface on the page. */}
        <div className="mp-ink rl-in">
          <Eyebrow style={{ color: inkMute }}>Apply in seconds</Eyebrow>
          <h2 className="mp-h2" style={{ color: C.paper, marginTop: 'var(--gap-line)' }}>{noWidow(f ? 'Your next listing, without the retyping' : 'Your first application builds your profile')}</h2>
          <p className="mp-p" style={{ color: inkText, marginTop: 'var(--gap-line)' }}>{noWidow(f ? 'Paste the invite link a realtor sent you. Their application opens with your profile filled in; you check it and confirm before anything is sent.' : 'Apply through any realtor’s invite link and what you enter becomes your profile.')}</p>
          {f && (
            <form onSubmit={goApplyWithProfile} className="mp-form">
              <div>
                <label htmlFor="tp-invite" className="mp-label" style={{ display: 'block', color: inkMute }}>Invite link</label>
                <input id="tp-invite" className="mp-input" style={{ marginTop: 'var(--gap-line)' }} value={inviteLink} onChange={(e) => { setInviteLink(e.target.value); setInviteErr(''); }} placeholder="rentletter.ca/apply/" inputMode="url" autoComplete="off" spellCheck={false} />
              </div>
              {inviteErr && <p role="alert" className="mp-alert" style={{ color: '#f0b9bb' }}>{noWidow(inviteErr)}</p>}
              <button type="submit" className="mp-btn" style={{ color: C.paper, borderColor: C.paper }}>Open it with my profile</button>
            </form>
          )}
        </div>
      </div>

      <div className="mp-stack">
        <div className="rl-card rl-in mp-card">
          <h2 className="mp-h2">Your details</h2>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Edits here reach the applications you send from now on. Anything you already sent keeps what you sent; open it below to change that one.')}</p>
          {saveError && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(saveError)}</p>}
        </div>
        {f ? (
          <FactSections facts={f} draft={draft} editing={editing} setDraft={setDraft} canEdit={!editing} saving={saving} justSaved={justSaved} onEdit={startEdit} onCancel={cancelEdit} onSave={saveEdit} contactEditable={false} saveLabel="Save to my profile" />
        ) : (
          <div className="rl-card rl-in mp-card"><p className="mp-p">{noWidow('No details saved yet. They appear here after your first application, or add an application you already sent, below.')}</p></div>
        )}
      </div>

      <div className="rl-card rl-in mp-card">
        <h2 className="mp-h2">Your applications</h2>
        {apps.length === 0 ? <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('No applications yet. When you apply through a realtor’s invite link, it shows up here.')}</p> : (
          <ul className="mp-list" style={{ marginTop: 'var(--gap-card)' }}>
            {apps.map((a) => (
              <li key={a.applicationNumber}>
                <a href={`/my-application/${a.applicationNumber}`} style={{ textDecoration: 'none', color: C.ink, minWidth: 0, flex: 1 }}>
                  <span className="mp-value" style={{ marginTop: 0, display: 'block' }}>{noWidow(a.listingName || 'Rental unit')}</span>
                  <span className="mp-note" style={{ display: 'block' }}><Dots items={[a.realtorName, a.realtorBrokerage, a.submittedAt ? dateLong(a.submittedAt) : null, a.updatedAt ? `edited ${dateLong(a.updatedAt)}` : null, a.revoked ? 'Revoked' : (a.status?.label || null)]} /></span>
                  {a.referral && <span className="mp-note" style={{ display: 'block' }}>{noWidow(`Shared with ${a.referral.toName || 'another realtor'} by ${a.referral.fromName || 'your realtor'} with your approval.`)}</span>}
                  <span className="mp-note mp-mono" style={{ display: 'block' }}>{a.applicationNumber}</span>
                </a>
                <Chevron />
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen} className="mp-fold">
          <span>{noWidow('Add an application you sent before')}</span><Chevron open={linkOpen} />
        </button>
        {linkOpen && (
          <form onSubmit={linkApplication} className="mp-form" style={{ marginTop: 0 }}>
            <input className="mp-input mp-mono" value={linkApp} onChange={(e) => setLinkApp(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" spellCheck={false} aria-label="Application number" />
            <input className="mp-input mp-mono" type="password" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder="Owner key from its confirmation email" spellCheck={false} aria-label="Owner key" />
            {linkMsg && <p role="alert" className="mp-alert">{noWidow(linkMsg)}</p>}
            <button type="submit" className="mp-btn">Add to my profile</button>
          </form>
        )}
      </div>

      <div className="rl-card rl-in mp-card">
        <h2 className="mp-h2">Sign in email</h2>
        <p className="mp-value" style={{ marginTop: 'var(--gap-line)' }}>{profile.email}</p>
        <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Changing it sends a confirmation to the new address first. This one keeps working until you confirm there.')}</p>
        {profile.pendingEmail ? (
          <>
            <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>Waiting for you to confirm at <strong style={{ color: C.ink, overflowWrap: 'anywhere' }}>{profile.pendingEmail}</strong>.</p>
            <button type="button" onClick={cancelEmailChange} className="mp-link">Cancel the change</button>
          </>
        ) : (
          <form onSubmit={requestEmailChange} className="mp-form">
            <input className="mp-input" type="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" aria-label="New email" />
            <button type="submit" disabled={emailBusy || !EMAIL_RE.test(newEmail)} className="mp-btn">{emailBusy ? 'Sending' : 'Change email'}</button>
          </form>
        )}
        {emailMsg && <p role="status" className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(emailMsg)}</p>}
        <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Your profile holds the facts you typed, never documents. Anything you upload for a realtor is held for that realtor only for 14 days, then deleted.')}</p>
      </div>
      {toast && <div role="status" onClick={() => setToast('')} className="mp-toast">{toast}</div>}
    </>
  ));
}
