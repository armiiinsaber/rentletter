// pages/my-application.js
// The UNIFIED tenant profile — one portable rental identity, keyed by email.
//
//   SIGN-IN   email → magic link (no password, no account step). Enumeration-safe copy.
//   PROFILE   the tenant's home, laid out to be filled in (components/tenant/ProfileLayout.js):
//             at 1024px and wider three columns, a section menu at the window's left edge (each
//             section marked done, started or empty, the current one marked as the page scrolls),
//             the sections in the menu's order, and Your progress with Apply with a link on the
//             right (at the head of the middle column from 1024 to 1279); on a phone one column, a
//             slim bar with the count and the next step that opens the checklist as a sheet, and
//             the menu as chips under the header. At the top of the middle column, Edit and
//             Preview: Preview shows the profile as a realtor reads it once it is shared
//             (components/dashboard/SharedProfileView.js, the realtor's own view, from the facts
//             "What a realtor would see" lists and the tenant's photo, words and offer), with no
//             progress and no ID. The page opens on the tenant's own card
//             (components/tenant/ProfileCard.js: the photo, the name, the job, four key facts, a
//             mark for each step); then the sections: the move and the household, Employment and
//             income, Contact (the full name and the phone, edited in place, and the sign in
//             email; a profile with no name says so on the card, with the button that opens the
//             field, since no save goes through without one), Rental history, References
//             (editable in place; edits apply to FUTURE applications only, where they came from and
//             when behind Details on each card, "Typed by you on DATE"), Documents and the facts
//             read from them, About you with the writing helper, Who can see your profile
//             (components/tenant/ProfileVault.js, components/tenant/ProfilePersonal.js), and every
//             application they've sent (each a frozen snapshot with its own page, privacy console
//             and per-application edit path) + sign out. A profile with no facts opens on the
//             guided first run (components/tenant/FirstRun.js), one question a screen, saved as
//             the tenant goes.
//   REUSE     paste a new invite link → /apply/{token}#profile prefilled from the profile.
//
// Legacy entry (application number + owner key, and the ?app=&token= email deep link) still
// works: it opens that application's own page at /my-application/[rl].
// On the realtor tokens (components/tenant/ProfileFacts.js ProfileStyles): the card, the eyebrow,
// the text button, the line and card gaps. The layout's own rules are in ProfileLayoutStyles.
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C } from '../components/theme';
import { GlobalStyle, StatusPills } from '../components/ui';
import TenantBar from '../components/tenant/TenantBar';
import { ProfileStyles, FactSections, FactSourceContext, FieldStatusContext, Eyebrow, Chevron, noWidow, dateLong } from '../components/tenant/ProfileFacts';
import ProfileVault, { youLine, useVault, realtorSees } from '../components/tenant/ProfileVault';
import ProfilePersonal, { usePersonal } from '../components/tenant/ProfilePersonal';
import { ProfileLayoutStyles, SECTIONS, sectionStates, SectionMenu, SectionChips, useCurrentSection, goToSection } from '../components/tenant/ProfileLayout';
import { StrengthPanel, StrengthBar, StrengthSheet, nextStep } from '../components/tenant/ProfileStrength';
import ProfileCard from '../components/tenant/ProfileCard';
import FirstRun from '../components/tenant/FirstRun';
import SharedProfileView from '../components/dashboard/SharedProfileView';
import { BENEFIT } from '../components/tenant/profileSteps';
import { RETENTION_DAYS } from '../lib/documentRetention';
import { pageLocked } from '../components/Sheet';
import { cardTap } from '../lib/motion';
import { SOURCE } from '../lib/profileFacts';
import { isApplicationNumber, isOwnerToken } from '../lib/applicationIds';
import { Pending, ScreenLoader } from '../components/brand/Loader';

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

  const signOut = async () => { try { await post({ action: 'sign-out' }); } catch (e) { /* ignore */ } setProfile(null); setPhase('entry'); };

  const header = (right) => <TenantBar>{right}</TenantBar>;
  const noticeEl = notice && <p role="status" className={notice.tone === 'ok' ? 'mp-note' : 'mp-alert'}>{noWidow(notice.text)}</p>;
  const shell = (title, right, body) => (
    <>
      <Head><title>{title}</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">{header(right)}<div className="mp-wrap mp-sections">{body}</div></div>
    </>
  );

  if (phase === 'boot') return shell('My profile · Rentletter', null, <ScreenLoader label="Opening your profile" />);

  // ── the entry page: one card, the email, the link; the legacy pair on a second card ──
  if (phase === 'entry' || phase === 'sent') {
    return shell('Tenant profile · Rentletter', <a href="/" className="mp-link">Home</a>, (
      <div className="mp-stack">
        <div className="rl-card mp-card">
          <Eyebrow>Tenant profile</Eyebrow>
          {phase === 'sent' ? (
            <>
              <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>Check your inbox.</h1>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>If <strong className="mp-addr" style={{ color: C.ink, overflowWrap: 'anywhere' }}>{email}</strong> {noWidow('has an application with us, we sent a link. It works once and expires in 15 minutes. Open it on whichever device you like.')}</p>
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
                <button type="submit" className="mp-btn" disabled={sending || !EMAIL_RE.test(email)}><Pending busy={sending} label="Sending your link">Email me a link</Pending></button>
              </form>
            </>
          )}
        </div>
        {phase === 'entry' && (
          <div className="rl-card mp-card">
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

  // ── the profile (ProfileHome below) ──
  return <ProfileHome profile={profile} setProfile={setProfile} loadProfile={loadProfile} post={post} noticeEl={noticeEl} signOut={signOut} />;
}

const has = (v) => v != null && String(v).trim() !== '';
// A profile with no facts: none of the facts the page asks for holds a value (a stored profile with
// none reads back as its email alone). It opens on the guided first run.
const ASKED = ['fullName', 'phone', 'jobTitle', 'employer', 'yearsAtJob', 'annualIncome', 'moveInDate', 'previousAddress', 'previousLandlordName', 'previousLandlordContact', 'reference1Name', 'reference2Name'];
const noFacts = (facts) => !facts || !ASKED.some((k) => has(facts[k]));
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── the profile: the switch, the card, the menu, the sections, the progress and the apply box ──
// Every save goes through the routes the page always used: /api/tenant/profile (the facts, the
// email change, adding an application, sign out), /api/tenant/personal and /api/tenant/vault
// (through the components that own them). A save updates the section, the menu and the progress
// in place, with no reload. The first run saves through the same update-facts, the whole draft.
function ProfileHome({ profile, setProfile, loadProfile, post, noticeEl, signOut }) {
  const router = useRouter();
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
  // the strength (read again after any change to the vault), the vault and the shares, the sheet
  const [again, setAgain] = useState(0);
  const personal = usePersonal(profile, again);
  const store = useVault(() => setAgain((n) => n + 1));
  const [sheet, setSheet] = useState(false);
  const focusNext = useRef(null);   // { id, field }: the field an opened section focuses
  const returnTo = useRef(null);    // the section whose Edit takes the focus back on close
  // Edit or Preview; the guided first run (open on its own for a profile with no facts); the
  // writing helper, opened from a step (a number raised each time).
  const [mode, setMode] = useState('edit');
  const [setup, setSetup] = useState(() => noFacts(profile.facts));
  const [helperAsk, setHelperAsk] = useState(0);
  const later = useRef(null);       // what runs once the page is back in Edit, or out of the first run

  const f = profile.facts || null;
  const empty = noFacts(f);
  const apps = profile.applications || [];
  const p = personal.data && !personal.data.failed ? personal.data : null;
  const vault = store.vault && !store.vault.failed ? store.vault : null;
  const strength = p ? p.strength : null;
  const states = sectionStates({ profile, vault, personal: p, shares: store.shares });
  const current = useCurrentSection(SECTIONS.map((s) => s.key));
  // A typed field whose value a document agrees with says so on the field, once.
  const fieldStatus = {};
  for (const c of (vault && vault.checks) || []) {
    const field = { income_annual_gross: 'annualIncome', employer_name: 'employer' }[c.kind];
    if (field && c.agreesWithTyped === true) fieldStatus[field] = youLine(SOURCE.DOCUMENT, c.readAt);
  }

  // ── profile facts ──
  const startEdit = (id, field) => {
    if (!f) return;
    setDraft({ ...(profile.facts || {}), email: profile.email }); setSaveError(''); setEditing(id);
    focusNext.current = { id, field };
  };
  const cancelEdit = () => { returnTo.current = editing; setEditing(null); setDraft(null); setSaveError(''); };
  // The name, asked for at the top when the profile has none. Mid edit of another section, the
  // edit moves to Contact with what was typed kept in the draft, so one save keeps both.
  const askName = () => {
    if (!editing) { startEdit('contact', 'fullName'); return; }
    setSaveError(''); focusNext.current = { id: 'contact', field: 'fullName' }; setEditing('contact');
  };
  const saveEdit = async () => {
    if (!draft || saving) return;
    setSaving(true); setSaveError('');
    try {
      const j = await post({ action: 'update-facts', form: draft });
      setProfile((x) => ({ ...x, facts: j.facts, factsUpdatedAt: j.factsUpdatedAt, profileRevision: j.profileRevision }));
      const id = editing; returnTo.current = id; setEditing(null); setDraft(null); setJustSaved(id);
      setToast('Saved to your profile, applies to your next applications');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (err) { setSaveError(err.message); }
    setSaving(false);
  };
  // The first run's save: the same action and payload as an edit, the whole draft.
  const saveRun = async (form) => {
    const j = await post({ action: 'update-facts', form });
    setProfile((x) => ({ ...x, facts: j.facts, factsUpdatedAt: j.factsUpdatedAt, profileRevision: j.profileRevision }));
    return j;
  };
  // An opened section comes to the top of the window with the field asked for (or its first)
  // focused; a closed one hands the focus back to its Edit. In the same turn as the tap, so a
  // phone raises its keyboard.
  useLayoutEffect(() => {
    const t = focusNext.current;
    if (t && editing === t.id) {
      focusNext.current = null;
      const sec = document.getElementById(t.id); if (!sec) return;
      sec.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' });
      const el = (t.field && sec.querySelector(`[data-section-form] [data-field="${t.field}"]`)) || sec.querySelector('[data-section-form] input, [data-section-form] select, [data-section-form] textarea');
      if (el) el.focus({ preventScroll: true });
    }
    if (!editing && returnTo.current) {
      const back = document.querySelector(`[data-section-edit="${returnTo.current}"]`); returnTo.current = null;
      if (back) back.focus({ preventScroll: true });
    }
  }, [editing]);
  // Back in Edit, or out of the first run: what was asked for runs once the sections are drawn;
  // out of the first run with nothing asked for, the page opens at its top, its menu read again.
  const wasSetup = useRef(setup);
  useEffect(() => {
    const left = wasSetup.current && !setup; wasSetup.current = setup;
    if (mode !== 'edit' || setup) return;
    if (later.current) { const run = later.current; later.current = null; requestAnimationFrame(() => run()); return; }
    if (left) { window.scrollTo({ top: 0, behavior: 'instant' }); window.dispatchEvent(new Event('scroll')); }
  }, [mode, setup]);
  const inEdit = (fn) => { if (mode === 'edit' && !setup) { fn(); return; } later.current = fn; setSetup(false); setMode('edit'); };

  // A step of the checklist, a mark on the card: its section, opened for editing or with its
  // upload or field focused. Write about me opens the writing helper itself.
  const focusIn = (section, ...targets) => { goToSection(section); for (const t of targets) { const el = document.querySelector(`[data-focus="${t}"]`); if (el) { el.focus({ preventScroll: true }); return; } } };
  const runStep = (key) => {
    const ff = profile.facts || {};
    if (key === 'details') {
      const miss = ['jobTitle', 'employer', 'annualIncome'].find((k) => !has(ff[k]));
      if (miss && f) return startEdit('employment', miss);
      if (!has(ff.phone) && f) return startEdit('contact', 'phone');
      return goToSection(!has(ff.phone) ? 'contact' : f ? 'employment' : 'details');
    }
    if (key === 'reference') return f ? startEdit('rental', has(ff.previousLandlordName) ? 'prevLandlordEmail' : 'previousLandlordName') : goToSection('rental');
    if (key === 'about') { goToSection('about'); setHelperAsk((n) => n + 1); return null; }
    if (key === 'photo' || key === 'prepay') return focusIn('about', key);
    if (key === 'id' || key === 'income' || key === 'employment') return focusIn('documents', `doc-${key}`, 'documents');
    return null;
  };
  const step = (key) => inEdit(() => runStep(key));
  // From the sheet: the sheet goes down and gives the page back where it was (components/Sheet.js
  // restores the scroll as it lets go), then the step.
  const goStep = (key) => {
    if (!sheet) { step(key); return; }
    setSheet(false);
    const t0 = Date.now();
    const when = () => { if (pageLocked() && Date.now() - t0 < 1500) { setTimeout(when, 50); return; } requestAnimationFrame(() => step(key)); };
    setTimeout(when, 50);
  };
  const openLink = () => { setLinkOpen(true); goToSection('applications'); };
  const openSetup = () => { setEditing(null); setDraft(null); setSetup(true); };
  // The sheet is the phone's: a window widened past 1024 has the panel in its own column instead.
  useEffect(() => {
    if (!sheet || !window.matchMedia) return undefined;
    const wide = window.matchMedia('(min-width: 1024px)');
    const close = () => { if (wide.matches) setSheet(false); };
    close(); wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, [sheet]);
  const showMode = (m) => { if (m === mode) return; setMode(m); window.scrollTo({ top: 0, behavior: 'instant' }); };

  const goApplyWithProfile = (e) => {
    e.preventDefault();
    const m = String(inviteLink).match(/apply\/([a-f0-9]{20})/i);
    if (!m) { setInviteErr('That doesn’t look like a Rentletter invite link, it looks like rentletter.ca/apply/… Paste the whole link.'); return; }
    setInviteErr(''); router.push(`/apply/${m[1].toLowerCase()}#profile`);
  };
  const requestEmailChange = async (e) => {
    e.preventDefault(); if (emailBusy) return;
    setEmailBusy(true); setEmailMsg('');
    try { const j = await post({ action: 'request-email-change', newEmail }); setProfile((x) => ({ ...x, pendingEmail: j.pendingEmail })); setNewEmail(''); setEmailMsg('Check the new address for a confirmation link. Until you confirm, this email keeps working.'); }
    catch (err) { setEmailMsg(err.message); }
    setEmailBusy(false);
  };
  const cancelEmailChange = async () => { try { await post({ action: 'cancel-email-change' }); setProfile((x) => ({ ...x, pendingEmail: null })); setEmailMsg(''); } catch (err) { setEmailMsg(err.message); } };
  const linkApplication = async (e) => {
    e.preventDefault(); setLinkMsg('');
    try { await post({ action: 'link-application', applicationNumber: linkApp, ownerToken: linkKey }); setLinkApp(''); setLinkKey(''); setLinkOpen(false); await loadProfile(); setToast('Application added to your profile'); setTimeout(() => setToast(''), 4000); }
    catch (err) { setLinkMsg(err.message); }
  };

  // Apply with a link: one line, the invite link and the button, the page's one red action. In the
  // right column on a desktop, under the card on a phone; one state, two places.
  const applyBox = (where) => (
    <div className={`rl-card mp-card tp-apply${where === 'phone' ? ' tp-phone-only tp-edit-only' : ''}`} data-apply-box={where}>
      <Eyebrow>Apply in seconds</Eyebrow>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(f ? 'Paste the invite link a realtor sent you. Their application opens with your profile filled in; you check it and confirm before anything is sent.' : 'Your first application builds your profile. Apply through any realtor’s invite link and what you enter becomes your profile.')}</p>
      {f && (
        <form onSubmit={goApplyWithProfile} className="tp-apply-form">
          <div className="tp-apply-field">
            <label htmlFor={where === 'phone' ? 'tp-invite-m' : 'tp-invite'} className="mp-label" style={{ display: 'block' }}>Invite link</label>
            <input id={where === 'phone' ? 'tp-invite-m' : 'tp-invite'} className="mp-input" style={{ marginTop: 'var(--gap-line)' }} value={inviteLink} onChange={(e) => { setInviteLink(e.target.value); setInviteErr(''); }} placeholder="rentletter.ca/apply/" inputMode="url" autoComplete="off" spellCheck={false} enterKeyHint="go" />
          </div>
          <button type="submit" className="mp-btn mp-btn-red tp-apply-go">Open it with my profile</button>
          {inviteErr && <p role="alert" className="mp-alert tp-apply-err">{noWidow(inviteErr)}</p>}
        </form>
      )}
    </div>
  );
  const facts = (only) => (
    <FactSections facts={f || { email: profile.email }} draft={draft} editing={editing} setDraft={setDraft} canEdit={!!f && !editing} saving={saving} justSaved={justSaved} onEdit={startEdit} onCancel={cancelEdit} onSave={saveEdit}
      contactName saveLabel="Save to my profile" only={only} saveError={saveError}
      onInvite={f ? null : openLink} invite={f ? null : { line: 'This fills in from your first application, or from one you already sent.', button: 'Add an application you sent before' }} />
  );
  const toSection = (key) => inEdit(() => goToSection(key));
  // Copy an application number, said in the toast.
  const copyNumber = async (n) => {
    let ok = false;
    try { await navigator.clipboard.writeText(n); ok = true; } catch (e) { ok = false; }
    setToast(ok ? 'Application number copied' : 'Could not copy the number');
    clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3000);
  };
  // No name yet: every save asks for one (pages/api/tenant/profile.js), so the card says so, with
  // the one button that opens the field.
  const nameMissing = (
    <>
      {f && !has(f.fullName) && (
        <div className="tp-invite" data-name-missing="">
          <p className="mp-p">{noWidow('Your profile has no name yet. Add it, and your changes can save.')}</p>
          <button type="button" className="mp-btn mp-btn-auto" data-name-add="" onClick={askName}>Add your name</button>
        </div>
      )}
    </>
  );
  const card = (where) => (
    <ProfileCard profile={profile} facts={f} strength={strength} vault={vault} photo={p ? p.photo : null} canEdit={where === 'page' && !!f && !editing}
      onEdit={startEdit} onStep={where === 'page' ? step : (k) => inEdit(() => runStep(k))} onSetup={where === 'page' ? openSetup : null} empty={empty} need={where === 'page' && !empty ? nameMissing : null} noticeEl={where === 'page' ? noticeEl : null} />
  );
  // Preview: the realtor's own view of a shared profile, drawn from the facts "What a realtor
  // would see" lists (components/tenant/ProfileVault.js realtorSees) and the photo, the words, the
  // English version once approved and the offer, as a share reads them. No progress, no ID, no
  // document, and no link to a realtor's route.
  const seen = realtorSees(profile, vault);
  const english = p && p.available && p.english ? p.english : null;
  const shown = english && ((english.approvedAt && english.text) || english.language) ? { text: english.approvedAt && english.text ? english.text : null, language: english.language || null } : null;
  const preview = { facts: seen.facts, checks: seen.checks, documents: [], photo: p && p.available ? p.photo : null, about: p && p.available ? p.about : null, aboutEnglish: p && p.about ? shown : null, prepayMonths: p && p.available ? p.prepayMonths : null };
  const next = nextStep(strength);

  return (
    <>
      <Head><title>{f?.fullName ? `${f.fullName}, Profile · Rentletter` : 'My profile · Rentletter'}</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles /><ProfileLayoutStyles />
      <div className="mp-page tp" data-tp-shell="" data-mode={mode} data-setup={setup ? 'on' : 'off'}>
        <TenantBar><button type="button" onClick={signOut} className="mp-link">Sign out</button></TenantBar>
        {setup ? (
          <FirstRun profile={profile} save={saveRun} onLeave={() => setSetup(false)} card={card('run')}
            next={next ? { key: next.key, title: next.title, benefit: BENEFIT[next.key] || next.adds } : null} onNext={(k) => inEdit(() => runStep(k))} />
        ) : (
          <>
            {/* The phone: the progress bar and the section chips, under the header and stuck there. */}
            <div className="tp-top rl-glass rl-glass-auto" data-tp-top="" data-stuck="">
              <div className="tp-edit-only"><StrengthBar strength={strength} onOpen={() => setSheet(true)} /></div>
              <SectionChips states={states} current={mode === 'edit' ? current : null} onGo={toSection} />
            </div>
            <div className="tp-grid">
              <SectionMenu states={states} current={mode === 'edit' ? current : null} onGo={toSection} />
              <div className="tp-switch-row" data-mode-switch="">
                <div className="tp-switch" role="group" aria-label="Edit your profile, or preview it as a realtor reads it">
                  <button type="button" aria-pressed={mode === 'edit'} data-mode-edit="" onClick={() => showMode('edit')}>Edit</button>
                  <button type="button" aria-pressed={mode === 'preview'} data-mode-preview="" onClick={() => showMode('preview')}>Preview</button>
                </div>
                {mode === 'preview' && <p className="tp-switch-line" data-preview-line="">{noWidow('This is the realtor’s view: your profile as they read it once you share it.')}</p>}
              </div>
              <aside className="tp-aside" aria-label="Your progress and applying" data-stuck="">
                <div className="tp-edit-only"><StrengthPanel strength={strength} onStep={goStep} vault={vault} /></div>
                {applyBox('side')}
              </aside>
              <main className="tp-main">
                {mode === 'preview' && (
                  <section className="rl-card mp-card tp-preview" data-preview="" aria-label="Your profile as a realtor reads it">
                    <SharedProfileView state={preview} />
                  </section>
                )}
                <FactSourceContext.Provider value={youLine(SOURCE.TYPED, profile.factsUpdatedAt)}>
                  <FieldStatusContext.Provider value={fieldStatus}>
                    <div className="tp-group tp-edit-only" data-tp-anchor="details">
                      {card('page')}
                      {applyBox('phone')}
                      {facts(['household'])}
                    </div>
                    <div className="tp-group tp-edit-only" data-tp-anchor="employment">{facts(['employment'])}</div>
                    <div className="tp-group tp-edit-only" data-tp-anchor="contact">
                      {facts(['contact'])}
                      <div className="rl-card mp-card" data-sign-in-email="">
                        <h2 className="mp-h2">Sign in email</h2>
                        <p className="mp-value mp-addr" style={{ marginTop: 'var(--gap-line)' }}>{profile.email}</p>
                        <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Changing it sends a confirmation to the new address first. This one keeps working until you confirm there.')}</p>
                        {profile.pendingEmail ? (
                          <>
                            <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>Waiting for you to confirm at <strong style={{ color: C.ink, overflowWrap: 'anywhere' }}>{profile.pendingEmail}</strong>.</p>
                            <button type="button" onClick={cancelEmailChange} className="mp-link">Cancel the change</button>
                          </>
                        ) : (
                          <form onSubmit={requestEmailChange} className="mp-form tp-row-form">
                            <input className="mp-input" type="email" inputMode="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" aria-label="New email" />
                            <button type="submit" disabled={emailBusy || !EMAIL_RE.test(newEmail)} className="mp-btn"><Pending busy={emailBusy} label="Changing your email">Change email</Pending></button>
                          </form>
                        )}
                        {emailMsg && <p role="status" className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(emailMsg)}</p>}
                        <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(`Documents you add to your profile are kept until the date beside each one. Anything you upload for one realtor’s request is held for that realtor only for ${RETENTION_DAYS} days, then deleted.`)}</p>
                      </div>
                    </div>
                    <div className="tp-group tp-edit-only" data-tp-anchor="rental">{facts(['rental'])}</div>
                    <div className="tp-group tp-edit-only" data-tp-anchor="references">{facts(['references'])}</div>
                  </FieldStatusContext.Provider>
                </FactSourceContext.Provider>

                <div className="tp-group tp-edit-only" data-tp-anchor="documents"><ProfileVault profile={profile} store={store} show="documents" /></div>
                <div className="tp-group tp-edit-only" data-tp-anchor="about"><ProfilePersonal data={personal.data} load={personal.load} openHelper={helperAsk} /></div>
                <div className="tp-group tp-edit-only" data-tp-anchor="shares"><ProfileVault profile={profile} store={store} show="shares" /></div>

                <div className="tp-group tp-edit-only" data-tp-anchor="applications">
                  <div id="applications" className="rl-card mp-card">
                    <div className="mp-head tp-head">
                      <h2 className="mp-h2">Your applications</h2>
                    </div>
                    {apps.length === 0 ? <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('No applications yet. When you apply through a realtor’s invite link, it shows up here.')}</p> : (
                      <ul className="mp-list tp-apps" data-applications="" style={{ marginTop: 'var(--gap-card)' }}>
                        {apps.map((a) => {
                          // One row an application: the address and its status, then when it was sent
                          // and to whom, then its number with Copy. The whole row opens it (lib/motion.js
                          // cardTap: anywhere on it but Copy); the address is its link for the keyboard.
                          const status = a.revoked ? 'Revoked' : (a.status?.label || null);
                          const to = [a.realtorName, a.realtorBrokerage].filter(Boolean).join(', ');
                          const sent = a.submittedAt ? `Sent ${dateLong(a.submittedAt)}${to ? ` to ${to}` : ''}` : to ? `Sent to ${to}` : null;
                          return (
                            <li key={a.applicationNumber} className="tp-app" data-application-row={a.applicationNumber} data-tap-card="" onClick={cardTap(() => { window.location.href = `/my-application/${a.applicationNumber}`; })}>
                              <div className="tp-app-top">
                                <a href={`/my-application/${a.applicationNumber}`} className="mp-value tp-app-link">{noWidow(a.listingName || 'Rental unit')}</a>
                                <span className="tp-app-side">
                                  {status ? <StatusPills label="This application" items={[status]} className="tp-app-status" /> : null}
                                  <span className="tp-app-go" aria-hidden="true"><Chevron /></span>
                                </span>
                              </div>
                              {sent ? <span className="tp-app-line">{noWidow(sent)}</span> : null}
                              {a.updatedAt ? <span className="tp-app-line">{`Edited ${dateLong(a.updatedAt)}`}</span> : null}
                              {a.referral && <span className="tp-app-line">{noWidow(`Shared with ${a.referral.toName || 'another realtor'} by ${a.referral.fromName || 'your realtor'} with your approval.`)}</span>}
                              <span className="tp-app-num">
                                <span data-application-number="">{a.applicationNumber}</span>
                                <button type="button" className="tp-app-copy" onClick={() => copyNumber(a.applicationNumber)} aria-label={`Copy application number ${a.applicationNumber}`} data-copy-number="">Copy</button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button type="button" onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen} className="mp-fold" data-link-fold="">
                      <span>{noWidow('Add an application you sent before')}</span><Chevron open={linkOpen} />
                    </button>
                    {linkOpen && (
                      <form onSubmit={linkApplication} className="mp-form" style={{ marginTop: 0 }}>
                        <input className="mp-input mp-mono" value={linkApp} onChange={(e) => setLinkApp(e.target.value.toUpperCase())} placeholder="RL-2026-XXXX-XXXX" spellCheck={false} autoComplete="off" aria-label="Application number" />
                        <input className="mp-input mp-mono" type="password" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder="Owner key from its confirmation email" spellCheck={false} autoComplete="off" aria-label="Owner key" />
                        {linkMsg && <p role="alert" className="mp-alert">{noWidow(linkMsg)}</p>}
                        <button type="submit" className="mp-btn">Add to my profile</button>
                      </form>
                    )}
                  </div>
                </div>
              </main>
            </div>
          </>
        )}
      </div>
      <StrengthSheet open={sheet} onClose={() => setSheet(false)} strength={strength} onStep={goStep} vault={vault} />
      {toast && <div role="status" data-tap="" onClick={() => setToast('')} className="mp-toast rl-glass rl-glass-ink">{toast}</div>}
      <style jsx global>{`
        .tp-apply-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-3); margin-top: 10px; }
        .tp-apply .mp-p { font-size: 13px; line-height: 1.4; margin-top: 6px !important; }
        @container (min-width: 360px) {
          .tp-apply-form { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
          .tp-apply-go { width: auto; }
          .tp-apply-err { grid-column: 1 / -1; }
        }
        .tp-apply { container-type: inline-size; padding-top: 14px; padding-bottom: 14px; }
        .tp-row-form { container-type: inline-size; }
        .tp-card .tp-invite { margin-top: 0; padding: var(--s-3) var(--s-4); border-radius: var(--card-radius); background: ${C.paperDeep}; gap: var(--s-3); }
        .tp-card .tp-invite .mp-p { color: ${C.ink}; }
        .tp-card .tp-invite .mp-btn { background: ${C.card}; }
        /* Your applications: one tidy row each, the whole row opening its application. */
        .mp-list > li.tp-app { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: var(--s-3) 0; cursor: pointer; }
        /* The address and the status on one line; where a long status would leave the address too
           narrow to read, the status goes under it, at the right. */
        .tp-app-top { display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: var(--s-3); row-gap: var(--s-1); }
        .tp-app-link { flex: 1 1 10em; margin: 0 !important; color: ${C.ink}; text-decoration: none; min-width: 0; padding-top: 2px; }
        .tp-app-side { flex: none; display: inline-flex; align-items: center; gap: var(--s-2); margin-left: auto; }
        .tp-app-link:focus-visible { outline: none; border-radius: 4px; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        .tp-app-status { flex-wrap: nowrap; }
        .tp-app-go { display: inline-flex; align-items: center; height: 28px; color: ${C.inkSoft}; }
        .tp-app-line { display: block; font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; }
        .tp-app-num { display: flex; align-items: center; gap: var(--s-2); font-size: 13px; line-height: 1.4; color: ${C.inkSoft}; }
        .tp-app-copy { min-height: 28px; padding: 0; background: transparent; border: none; font: inherit; font-weight: 700; color: ${C.ink}; text-decoration: underline; cursor: pointer; }
        .tp-app-copy:focus-visible { outline: none; border-radius: 4px; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) { .tp-app:hover .tp-app-link { text-decoration: underline; } }
      `}</style>
    </>
  );
}
