import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { C, R, SH, EASE } from '../components/theme';
import { GlobalStyle, Wordmark, Icon, ScrollHeader, usePageScrolled } from '../components/ui';
import AppHead from '../components/AppHead';
import DeviceFrame, { DEVICE_BREAKPOINT } from '../components/DeviceFrame';
import { noWidow } from '../lib/typeset';
import HeroDemo from '../components/mockups/HeroDemo';
import HomeDoor from '../components/brand/HomeDoor';


// ─── THE PAGE ──────────────────────────────────────────────────────────────────────────────
// Short declarative lines about what the product does. Nothing here says who the reader is. Every
// sentence below is one the product backs today; the claims list, with the file that makes each
// one true, is in the commit.
const HERO_HEADLINE = ['The rental application,', 'rebuilt for realtors.'];
const META_TITLE = 'Rentletter: the rental application, rebuilt for realtors';
const META_DESCRIPTION = 'Tenants apply from one link and Rentletter reads every document before you open it, ranked against your listing. For realtors in Ontario and BC.';
const OG_IMAGE = 'https://rentletter.ca/brand/kit/Rentletter-Brand-Kit/social/rentletter-og-1200x630.png'; // the brand kit's (scripts/brand/kit.mjs)
const DEMO_MAIL = `mailto:info@rentletter.ca?subject=${encodeURIComponent('Rentletter demo request')}&body=${encodeURIComponent('Hi Rentletter team,\n\nI would like to book a 15 minute demo of Rentletter.\n\nMy brokerage: \nMy preferred time: \n\nThanks!')}`;
const BLOCKS = [
  { title: 'Read.', body: 'Every document is read and matched to what the applicant stated.' },
  { title: 'Ranked.', body: 'Applicants appear in order against your listing’s criteria.' },
  { title: 'Sure.', body: 'Each fact shows where it came from, and verified appears only when you confirmed it yourself.' },
  { title: 'Done.', body: 'The landlord report carries your name and is ready to send.' },
];
const FEW_RENTALS = { q: 'I don’t do many rentals.', a: 'Then you pay nothing until a rental lands. When one does, it takes minutes instead of days.' };
const STEPS = [
  { n: '01', icon: 'home', t: 'Create a listing', d: 'Add the unit and the landlord’s preferences. The applicant link is ready at once.' },
  { n: '02', icon: 'link', t: 'Share one link', d: 'Text it, email it or post it. Every applicant fills the same form.' },
  { n: '03', icon: 'list', t: 'Review the ranking', d: 'Applicants arrive in order against the landlord’s criteria. Set one aside with a reason, and the decision is recorded.' },
  { n: '04', icon: 'send', t: 'Send the report', d: 'Your name and logo on top. Every applicant ranked, with one fact sentence each.' },
];

// Extract the invite token from whatever a tenant pastes: a full apply URL
// (https://…/apply/{token}, with/without trailing slash or query/hash), or a bare
// token/code. Tolerant — the /apply page validates + handles invalid/expired tokens.
function parseApplyInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false };
  const m = s.match(/\/apply\/([^/?#\s]+)/i); // token from a pasted apply link
  const fromUrl = !!m;
  const token = (m ? m[1] : s).replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '').trim();
  if (!token) return { ok: false };
  // Accept anything that came from an /apply/ link; for a bare paste, require a plausible
  // token (no spaces/slashes, reasonable length) so obvious garbage gets a friendly error.
  const plausible = /^[A-Za-z0-9_-]{6,}$/.test(token);
  if (!fromUrl && !plausible) return { ok: false };
  return { ok: true, token };
}

export default function Home() {
  const [step, setStep] = useState('landing');
  const [applyLink, setApplyLink] = useState('');
  const [applyError, setApplyError] = useState('');
  const goToApply = () => {
    const parsed = parseApplyInput(applyLink);
    if (!parsed.ok) {
      setApplyError("That doesn't look like a valid application link, paste the full link the listing realtor sent you.");
      return;
    }
    setApplyError('');
    window.location.assign(`/apply/${encodeURIComponent(parsed.token)}`);
  };
  const [form, setForm] = useState({
    email: '',
    apartmentAddress: '', apartmentDescription: '',
    // Tier 1 — required (basic identity + landlord-needed)
    fullName: '', phone: '',
    // Tier 1 — employment (existing)
    jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
    // Tier 1 — current rental (expanded)
    previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
    currentRent: '',
    moveInDate: '',
    // Tier 1 — household details
    numberOfOccupants: '1',
    smoker: 'no',
    // Tier 1 — co-applicant (progressive disclosure)
    hasCoApplicant: false,
    coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
    coApplicantIncome: '', coApplicantRelationship: '',
    // Tier 1 — existing lifestyle/disclosures
    pets: '',
    // Tier 2 — optional but landlord-helpful

    reference1Name: '', reference1Relationship: '', reference1Contact: '',
    reference2Name: '', reference2Relationship: '', reference2Contact: '',
  });
  const [resume, setResume] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const [copiedAppNum, setCopiedAppNum] = useState(false);



  // The "See a sample dashboard" demo entry is ALWAYS available on the landing page —
  // it must never depend on session/seen-demo state. (Previously it was gated to
  // logged-out visitors via supabase.auth.getSession(), which hid it for signed-in
  // realtors and flashed hidden on first paint. The sample dashboard is harmless to
  // everyone, so any visitor — returning or not — can always launch it.)

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite');

    // ─── ENTRY 0: Tenant arrived via realtor's invite link ───
    // Sandbox tokens (demo…) are answered by the resolver without an invite record.
    // An old link (/?invite={token}, before invites moved to /apply/{token}) opens the apply page,
    // which asks the age rule (lib/applyAge.js). This page no longer shows its own form.
    if (inviteParam && (/^[a-f0-9]{20}$/.test(inviteParam) || /^demo\d{16}$/.test(inviteParam))) {
      window.location.replace(`/apply/${encodeURIComponent(inviteParam)}`);
      return;
    }

    // ─── ENTRY 4: Returning user, restore the submitted application ───
    const savedResume = localStorage.getItem('rentletter_resume');
    const savedForm = localStorage.getItem('rentletter_form');
    const savedAppNum = localStorage.getItem('rentletter_app_number');
    if (savedAppNum && savedForm) {
      setResume(savedResume || '');
      setForm(JSON.parse(savedForm));
      setApplicationNumber(savedAppNum);
      setStep('result');
    }
  }, []);

  // ─── HERO TILT — mouse-tracked 3-D tilt, skipped on touch + reduced-motion ───
  const tiltRef = useRef(null);
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });
  const [skipTilt, setSkipTilt] = useState(true);
  useEffect(() => {
    setSkipTilt(
      window.matchMedia('(pointer: coarse)').matches ||
      !window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    );
  }, []);
  const handleTiltMove = (e) => {
    if (!tiltRef.current) return;
    const r = tiltRef.current.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    setHeroTilt({ x: dy * -2.5, y: dx * 2.5 });
  };
  const handleTiltLeave = () => setHeroTilt({ x: 0, y: 0 });

  const sendEmail = async (email, fullName, appNum, ownerTok, signature = null) => {
    setEmailSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fullName,
          applicationNumber: appNum || applicationNumber,
          ownerToken: ownerTok || (typeof window !== 'undefined' ? localStorage.getItem('rentletter_owner_token') : null),
          signature, // lib/sendSignature.js
        }),
      });
      const json = await res.json();
      if (json.success) setEmailSent(true);
    } catch (e) {
      console.error('Email send failed:', e);
    }
    setEmailSending(false);
  };

  const copyText = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // Default empty form — used for initial state + resets
  const EMPTY_FORM = {
    email: '',
    apartmentAddress: '', apartmentDescription: '',
    fullName: '', phone: '',
    jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
    previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
    currentRent: '',
    moveInDate: '',
    numberOfOccupants: '1',
    smoker: 'no',
    hasCoApplicant: false,
    coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
    coApplicantIncome: '', coApplicantRelationship: '',
    pets: '',

    reference1Name: '', reference1Relationship: '', reference1Contact: '',
    reference2Name: '', reference2Relationship: '', reference2Contact: '',
  };

  const startOver = () => {
    if (!confirm('Clear this application and start fresh?')) return;
    localStorage.removeItem('rentletter_resume');
    localStorage.removeItem('rentletter_form');
    localStorage.removeItem('rentletter_app_number');
    setResume(''); setApplicationNumber('');
    setForm(EMPTY_FORM);
    setStep('landing');
  };

  const updateResume = (text) => { setResume(text); localStorage.setItem('rentletter_resume', text); };

  // ── Landing header: solid at the very top, glass once the page scrolls under it ──────────
  // (components/ui.js .rl-glass-auto, usePageScrolled). It stays fully visible and in place: the
  // drift and the fade it once had would leave nothing of the glass to read.
  usePageScrolled();

  // ════════════════════════════════════════════════════════════
  // LANDING — minimal, confident, sparingly red
  // ════════════════════════════════════════════════════════════
  if (step === 'landing') {
    return (
      <>
        <Head>
          <title>{META_TITLE}</title>
          <meta name="description" content={META_DESCRIPTION} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Rentletter" />
          <meta property="og:title" content={META_TITLE} />
          <meta property="og:description" content={META_DESCRIPTION} />
          <meta property="og:image" content={OG_IMAGE} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content="Rentletter" />
        </Head>
        <AppHead />
        <GlobalStyle />

        <div className="lp-shell" style={{ minHeight: '100vh', background: C.paper }}>

          {/* ── HEADER, balanced 3-zone: wordmark left · nav center · CTA right ── */}
          <ScrollHeader glass="auto">
            {/* LEFT, wordmark (drifts left + fades on scroll). Its door swings once after the page
                loads (components/brand/HomeDoor.js), never on scroll. */}
            <div className="lh-left">
              <a href="/" className="rl-mark" aria-label="Rentletter home"><HomeDoor /></a>
            </div>
            {/* CENTER, secondary nav; collapses to the footer on small screens so the bar stays a
                single tidy row (wordmark + CTA) with no wrap/overflow at 360/390 */}
            <nav className="lh-nav" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(18px, 2.4vw, 30px)' }}>
              <a href="/faq" style={{ color: C.inkSoft, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>FAQ</a>
            </nav>
            {/* RIGHT, the account link. The hero carries the page's one button pair. */}
            <div className="lh-right">
              <a href="/signin" style={{ color: C.ink, textDecoration: 'underline', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Sign in</a>
            </div>
          </ScrollHeader>

          {/* ── HERO: the rental application, rebuilt for realtors. ──────────────── */}
          <section className="lp-w-wide" style={{ padding: 'clamp(44px, 7vw, 96px) clamp(20px, 4vw, 32px) clamp(48px, 7vw, 80px)' }}>
            <div className="lp-hero-grid">

              {/* LEFT · text */}
              <div className="lp-hero-text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                  <span className="rl-rule-draw" style={{ height: 2, background: C.red, borderRadius: 1, display: 'block' }} />
                  <span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    Ontario and BC
                  </span>
                </div>

                <h1 className="rl-serif lp-h1" style={{
                  lineHeight: 1.02,
                  letterSpacing: '-0.025em',
                  color: C.ink,
                  marginBottom: 20,
                }}>
                  {HERO_HEADLINE.map((line, i) => <span key={line} style={{ display: 'block', whiteSpace: 'nowrap', color: i === HERO_HEADLINE.length - 1 ? C.red : C.ink }}>{line}</span>)}
                </h1>
                <p className="lp-sub" style={{ lineHeight: 1.45, color: C.inkSoft, margin: '0 0 var(--gap-line)', textWrap: 'balance' }}>
                  <span className="lp-sentence">{noWidow('Tenants apply from one link and every document is read before you open it.')}</span>
                </p>
                <p className="lp-small" style={{ lineHeight: 'var(--lh-body)', color: C.inkMute, margin: '0 0 30px' }}>
                  {noWidow('Free to join. Pay only when a rental lands.')}
                </p>

                <div>
                  {/* Two controls on one grid (components/ui.js rl-ctrl-row): one height, the card
                      gap between them, the headline's left edge, side by side at 1280 and stacked
                      at 390. The sign up is the page's one red action. */}
                  <div className="rl-ctrl-row" style={{ marginBottom: 18 }}>
                    <a href="/signup" className="rl-btn" style={{
                      background: 'var(--action)', color: C.paper, textDecoration: 'none', borderRadius: 'var(--btn-radius)',
                      padding: '0 28px', fontSize: 15, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                    }}>
                      Create account <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                    </a>
                    <a href={DEMO_MAIL} className="rl-btn" style={{
                      background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, textDecoration: 'none',
                      borderRadius: 'var(--btn-radius)', padding: '0 var(--gap-card)', fontSize: 15, fontWeight: 500,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      Book a 15 min demo
                    </a>
                  </div>
                  {/* Three facts, each with the red tick on ink text, as everywhere in the product. */}
                  <div className="lp-facts" style={{ display: 'flex', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap' }}>
                    {['No credit card', 'Free for applicants', 'Your name on every report'].map((t) => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.ink, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex' }}><Icon name="check" size={15} color={C.red} strokeWidth={2} /></span>{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT, dashboard screenshot in browser-chrome frame */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div ref={tiltRef}
                  onMouseMove={skipTilt ? undefined : handleTiltMove}
                  onMouseLeave={skipTilt ? undefined : handleTiltLeave}>
                  <div style={{
                    transform: skipTilt ? undefined : `perspective(1100px) rotateX(${heroTilt.x}deg) rotateY(${heroTilt.y}deg)`,
                    transition: skipTilt ? undefined : ((heroTilt.x === 0 && heroTilt.y === 0) ? `transform 600ms ${EASE}` : 'transform 80ms ease'),
                    willChange: skipTilt ? undefined : 'transform',
                  }}>
                    {/* Device frame: laptop with browser chrome ≥720px, phone below, the SAME live
                        HeroDemo node either way (decorations swap via CSS; nothing re-mounts). */}
                    <DeviceFrame className="lp-laptop" fit variant="responsive" url="rentletter.ca/dashboard" aspect="4 / 3" phoneAspect="9 / 10.5" bg={`linear-gradient(160deg, ${C.card}, ${C.paperDeep})`}>
                      <HeroDemo />
                    </DeviceFrame>
                  </div>
                </div>
                <div className="lp-caption" style={{ margin: 'auto 0', padding: 'var(--gap-card) 0', fontSize: 12, color: C.inkMute, textWrap: 'balance' }}>
                  The Rentletter dashboard, one workspace per listing.
                </div>
              </div>
            </div>
          </section>

          {/* ── FOUR BLOCKS: read, ranked, sure, done. Every sentence is one the product backs today
              (the claims list in the commit names the file for each). ── */}
          <section style={{ borderTop: `1px solid ${C.rule}`, background: C.card }}>
            <div className="lp-blocks lp-w" style={{ padding: 'clamp(48px, 7vw, 88px) clamp(20px, 4vw, 32px)' }}>
              {BLOCKS.map((b) => (
                <div key={b.title} className="lp-block">
                  <h2 className="t-d3 lp-block-t" style={{ margin: '0 0 var(--gap-line)', color: C.ink }}>{noWidow(b.title)}</h2>
                  <p className="lp-body" style={{ margin: 0, lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'balance' }}>{noWidow(b.body)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── PRICING, and beside it from 1100px THE OBJECTION, the first question in the FAQ too
              (pages/faq.js). Stacked below 1100px as they always were. ── */}
          <section style={{ borderTop: `1px solid ${C.rule}` }}>
            <div className="lp-w lp-pricing" style={{ padding: 'clamp(48px, 7vw, 88px) clamp(20px, 4vw, 32px)' }}>
              <div>
                <div className="lp-eyebrow" style={{ color: C.red }}>Pricing</div>
                {/* Two sentences, each on lines of its own, so the second never begins at the end of the first's line. */}
                <h2 className="rl-serif lp-h2-a" style={{ lineHeight: 1.08, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 var(--gap-line)', maxWidth: 760 }}>
                  <span className="lp-fit-s">{noWidow('Free to join.')}</span>{' '}
                  <span className="lp-fit-s">{noWidow('Pay only when a rental lands.')}</span>
                </h2>
                {/* The price line goes here, under the headline and above this line, once per rental
                    billing ships. Until then nobody pays (lib/billingOff.js). */}
                <p className="lp-body" style={{ margin: 0, lineHeight: 'var(--lh-body)', color: C.inkSoft }}>No credit card to start.</p>
              </div>
              <div className="rl-card lp-objection" style={{ padding: 'var(--card-pad)' }}>
                <h2 className="lp-q" style={{ fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em', color: C.ink, margin: '0 0 var(--gap-line)' }}>{noWidow(FEW_RENTALS.q)}</h2>
                <p className="lp-body lp-read" style={{ margin: 0, lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'balance' }}>{noWidow(FEW_RENTALS.a)}</p>
                <a href="/faq" className="lp-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 'var(--s-1)', fontWeight: 700, color: C.ink }}>
                  More questions <Icon name="arrow" size={14} />
                </a>
              </div>
            </div>
          </section>

          {/* ── WHERE WE FIT, its own quiet statement ── */}
          <section style={{ borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`, background: C.card }}>
            <div className="lp-w-fit" style={{ padding: 'clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px)', textAlign: 'center' }}>
              <div className="lp-eyebrow">Where we fit</div>
              {/* Two sentences, two colours, each its own line: from 1024px the black one is line
                  one and the grey one line two, each whole; under it each wraps balanced on its
                  own lines, so a colour never changes in the middle of a line. */}
              <p className="rl-serif lp-fit" style={{ lineHeight: 1.32, letterSpacing: '-0.015em', color: C.ink, margin: 0 }} data-where-we-fit="">
                <span className="lp-fit-s">{noWidow('A full background check on every applicant.')}</span>{' '}
                <span className="lp-fit-s" style={{ color: C.inkMute }}>{noWidow('Read and organized, so you close sooner with confidence.')}</span>
              </p>
            </div>
          </section>

          {/* ── HOW IT WORKS ── */}
          <section className="lp-w" style={{ padding: 'clamp(64px, 10vw, 112px) clamp(20px, 4vw, 32px)' }}>
            <div className="lp-how-head" style={{ marginBottom: 'var(--s-5)' }}>
              <div className="lp-eyebrow" style={{ color: C.red }}>How it works</div>
              <h2 className="rl-serif lp-h2-b" style={{ lineHeight: 1.12, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>
                {noWidow('From listing to landlord in four steps.')}
              </h2>
            </div>
            <div className="lp-steps">
              {STEPS.map((st) => (
                <div key={st.n} style={{ paddingTop: 22, position: 'relative' }}>
                  <span className="rl-step-bar" style={{ background: C.red, position: 'absolute', top: 0, left: 0, right: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <span style={{ width: 40, height: 40, borderRadius: R.ctrl, background: C.red, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: SH.rest }}>
                      <Icon name={st.icon} size={20} color={C.paper} />
                    </span>
                    <span className="rl-serif" style={{ fontSize: 22, color: C.rule }}>{st.n}</span>
                  </div>
                  <h3 className="lp-q" style={{ fontWeight: 700, color: C.ink, margin: '0 0 var(--gap-line)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{noWidow(st.t)}</h3>
                  <p className="lp-body" style={{ margin: 0, lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'balance' }}>{noWidow(st.d)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── TENANT ENTRY, paste the realtor's invite link → /apply/{token} ── */}
          <section className="lp-w" style={{ padding: 'clamp(20px, 4vw, 40px) clamp(20px, 4vw, 32px)' }}>
            <div className="rl-card lp-tenant" style={{ padding: 'clamp(22px, 3vw, 32px)' }}>
              <div className="lp-tenant-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: R.ctrl, background: C.paperDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user" size={20} color={C.ink} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3 className="lp-q" style={{ fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', margin: '0 0 var(--gap-line)' }}>
                    Have an application link?
                  </h3>
                  <p className="lp-body" style={{ lineHeight: 'var(--lh-body)', color: C.inkSoft, margin: 0, textWrap: 'balance' }}>
                    {noWidow('Paste it to go straight to the form. Applying is free.')}
                  </p>
                </div>
              </div>
              <div className="rl-ctrl-row lp-tenant-ctrl">
                <input
                  type="text" inputMode="url" value={applyLink}
                  onChange={(e) => { setApplyLink(e.target.value); if (applyError) setApplyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') goToApply(); }}
                  placeholder="rentletter.ca/apply/…"
                  aria-label="Paste the application link"
                  aria-invalid={applyError ? true : undefined}
                  style={{
                    minWidth: 0, boxSizing: 'border-box', minHeight: 44,
                    padding: '0 var(--gap-card)', fontSize: 'var(--t-body)', borderRadius: 'var(--card-radius)',
                    border: `1px solid ${applyError ? C.red : C.ruleDark}`, background: C.paper, color: C.ink,
                  }} />
                <button onClick={goToApply} className="rl-btn" style={{
                  flexShrink: 0, background: C.ink, color: C.paper, border: 'none', borderRadius: 'var(--btn-radius)',
                  minHeight: 44, padding: '0 var(--gap-card)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  Go to my application <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={16} /></span>
                </button>
              </div>
              {applyError
                ? <div className="lp-tenant-note" style={{ fontSize: 13, color: C.red, lineHeight: 1.5 }}>{applyError}</div>
                : <div className="lp-tenant-note" style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5 }}>{noWidow('The full link or just the code at the end. No account needed.')}</div>}
            </div>
          </section>

          {/* ── CLOSING BAND, ink, edge to edge ── */}
          <section style={{ background: C.ink, color: C.paper, marginTop: 'clamp(20px, 4vw, 40px)' }}>
            <div className="lp-w" style={{ padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 32px)', borderLeft: `6px solid ${C.red}` }}>
              <div className="lp-close">
                <h2 className="rl-serif lp-h2-c" style={{ letterSpacing: '-0.025em', lineHeight: 1.04, margin: '0 0 18px', color: C.paper }}>
                  {noWidow('Ready when your next listing is.')}
                </h2>
                <p className="lp-close-sub" style={{ lineHeight: 1.6, color: C.inkInverse, margin: '0 0 32px', textWrap: 'balance' }}>
                  {noWidow('Create a listing and its applicant link is ready at once.')}
                </p>
                <div className="rl-ctrl-row">
                  <a href="/signup" className="rl-btn" style={{
                    background: 'var(--action)', color: C.paper, textDecoration: 'none', borderRadius: 'var(--btn-radius)',
                    padding: '0 28px', fontSize: 15, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  }}>
                    Create account <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                  </a>
                  <a href="/demo/dashboard" className="rl-btn" style={{
                    background: 'transparent', color: C.paper, border: '1px solid rgba(250,248,243,0.3)', textDecoration: 'none',
                    borderRadius: 'var(--btn-radius)', padding: '0 var(--gap-card)', fontSize: 15, fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    Try it with sample data
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer className="lp-foot" style={{ padding: 'clamp(48px, 7vw, 72px) clamp(20px, 4vw, 32px) 48px', borderTop: `1px solid ${C.rule}`, background: C.card }}>
            <div className="lp-w-wide">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'clamp(28px, 4vw, 48px)', alignItems: 'start' }}>
                <div style={{ minWidth: 180 }}>
                  <a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark size="footer" /></a>
                  <p style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.6, marginTop: 14, maxWidth: 260 }}>
                    Rental applications, read and ranked. Built in{'\u00a0'}Toronto.
                  </p>
                </div>
                <FooterCol title="Product" links={[['Dashboard', '/dashboard'], ['Book a demo', DEMO_MAIL], ['FAQ', '/faq']]} />
                <FooterCol title="Company" links={[['Compliance', '/compliance'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Tenant profile', '/my-application']]} />
                <FooterCol title="Contact" links={[['info@rentletter.ca', 'mailto:info@rentletter.ca']]} />
              </div>
              {/* Three facts, a dot between them drawn in the gap and clipped where a line wraps: no line
                  starts or ends with a dot, and no fact breaks across lines. */}
              <div className="lp-legal" style={{ marginTop: 'clamp(32px, 4vw, 48px)', paddingTop: 24, borderTop: `1px solid ${C.rule}`, fontSize: 12.5, color: C.inkMute }}>
                <span>© {new Date().getFullYear()} Rentletter</span><span>Ontario &amp; BC, Canada</span><span>Not legal advice</span>
              </div>
            </div>
          </footer>
        </div>
      <style jsx global>{`
        /* The laptop screen carries the content's own canvas, edge to edge inside the bezel. The
           gradient it used to carry started on the card colour, which turned pure white in the
           canvas pass and read as a strip between the bezel and the mockup's gutter. The phone
           keeps the screen it has. */
        @media (min-width: ${DEVICE_BREAKPOINT}px) { .lp-laptop .df-screen, .lp-laptop .df-content { background: ${C.paperDeep}; } }
        /* Each headline line holds on one line. Fraunces sets wider at small sizes: the longer line
           ("The rental application,") runs 10.3 times the type size at 26px and 10 times at 50px, so
           at 9.2% of the text column it fills at most 95% of it at every width (the hero switches to
           two columns by width, not at a breakpoint). Without container units the size is 8% of the
           viewport, at most 40px, which still fits a 420px column. */
        .lp-hero-text { container-type: inline-size; }
        /* From 700px each sentence of the subline keeps to its own line when both do not fit on one. */
        @media (min-width: 700px) { .lp-sentence { display: inline-block; } }
        .lp-h1 { font-size: clamp(24px, 8vw, 40px); }
        @supports (font-size: 1cqi) { .lp-h1 { font-size: clamp(24px, 9.2cqi, 64px); } }
        /* The four blocks: one column at 390, two from 700px, four from 1100px; one gap. */
        .lp-blocks { display: grid; grid-template-columns: minmax(0, 1fr); gap: clamp(28px, 4vw, 40px); }
        @media (min-width: 700px) { .lp-blocks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1100px) { .lp-blocks { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .lp-block { border-top: 2px solid ${C.red}; padding-top: var(--s-4); }
        .lp-eyebrow { font-size: 11px; color: ${C.inkMute}; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: var(--s-3); }
        /* ── Large screens. Below 1440 every section keeps the width and the type it had; from 1440
           the grid widens, and from 1920 and 2560 it widens again with the type a step larger, so a
           large monitor reads as a page built for it, not a strip down the middle. Reading text
           stays near 70 characters a line at every size. ── */
        .lp-w { max-width: 1100px; margin-left: auto; margin-right: auto; }
        .lp-w-wide { max-width: 1200px; margin-left: auto; margin-right: auto; }
        .lp-w-fit { max-width: 880px; margin-left: auto; margin-right: auto; }
        .lp-hero-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: clamp(28px, 4vw, 64px); align-items: center; }
        .lp-sub { font-size: clamp(17px, 1.8vw, 20px); max-width: 520px; }
        .lp-small { font-size: var(--t-body-2); }
        .lp-body { font-size: var(--t-body); max-width: 70ch; }
        .lp-q { font-size: var(--t-d3); }
        .lp-h2-a { font-size: clamp(28px, 4vw, 44px); }
        .lp-h2-b { font-size: clamp(26px, 3.6vw, 38px); }
        .lp-h2-c { font-size: clamp(32px, 5vw, 52px); }
        .lp-fit { font-size: clamp(21px, 3vw, 30px); }
        .lp-fit-s { display: block; text-wrap: balance; }
        @media (min-width: 1024px) {
          /* Each sentence whole on its line: the column a little wider than the longer one. */
          .lp-w-fit { max-width: 1040px; }
          .lp-fit .lp-fit-s { white-space: nowrap; }
        }
        .lp-close { max-width: 620px; }
        .lp-close-sub { font-size: clamp(16px, 2vw, 18px); }
        .lp-how-head { max-width: 640px; }
        .lp-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: clamp(20px, 3vw, 36px); }
        /* Pricing and the question under it: stacked, as always, below 1100px; side by side above. */
        .lp-pricing { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: clamp(48px, 7vw, 88px); }
        .lp-tenant { display: flex; flex-direction: column; gap: 16px; }
        @media (min-width: 1100px) {
          .lp-pricing { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: clamp(48px, 5vw, 112px); align-items: center; }
          /* The tenant's card: what it is beside where to paste the link. */
          .lp-tenant { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); grid-template-areas: 'head ctrl' 'head note'; column-gap: clamp(32px, 4vw, 72px); row-gap: var(--s-2); align-items: center; }
          .lp-tenant-head { grid-area: head; }
          .lp-tenant-ctrl { grid-area: ctrl; flex-wrap: nowrap; }
          .lp-tenant-ctrl input { flex: 1 1 auto; }
          .lp-tenant-note { grid-area: note; }
        }
        @media (min-width: 1440px) {
          .lp-w { max-width: 1240px; } .lp-w-wide { max-width: 1320px; } .lp-w-fit { max-width: 1100px; }
          .lp-hero-grid { grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: clamp(48px, 5vw, 96px); }
          .lp-shell .rl-header-inner { max-width: 1320px !important; }
        }
        @media (min-width: 1920px) {
          .lp-w { max-width: 1560px; } .lp-w-wide { max-width: 1680px; } .lp-w-fit { max-width: 1320px; }
          .lp-shell .rl-header-inner { max-width: 1680px !important; }
          .lp-sub { font-size: 24px; max-width: 30em; }
          .lp-small { font-size: 16px; }
          .lp-body { font-size: 18px; }
          .lp-q { font-size: 22px; }
          .lp-block-t { font-size: 24px; }
          .lp-h2-a { font-size: 56px; } .lp-h2-b { font-size: 48px; } .lp-h2-c { font-size: 64px; } .lp-fit { font-size: 38px; }
          .lp-close { max-width: 820px; } .lp-close-sub { font-size: 21px; } .lp-how-head { max-width: 860px; }
          .lp-hero-text .rl-btn, .lp-close .rl-btn { min-height: 52px; font-size: 17px !important; }
          .lp-shell .lh-nav a, .lp-shell .lh-right a { font-size: 16px !important; }
          .lp-blocks, .lp-steps { gap: 48px; }
          .lp-shell .lp-eyebrow { font-size: 13px; }
          .lp-facts > span { font-size: 15px !important; }
          .lp-caption { font-size: 14px !important; }
          .lp-tenant-note { font-size: 15px !important; }
          .lp-tenant input { font-size: 18px !important; min-height: 52px !important; }
          .lp-tenant .rl-btn { min-height: 52px !important; font-size: 17px !important; }
          .lp-foot a, .lp-foot p, .lp-foot .lp-legal { font-size: 15px !important; }
          .lp-foot div[style*="uppercase"] { font-size: 13px !important; }
        }
        @supports (font-size: 1cqi) { @media (min-width: 1920px) { .lp-h1 { font-size: clamp(24px, 9.2cqi, 96px); } } }
        /* The product shot scales as one picture. Its browser bar is a drawing that grows with the
           frame (about 600px wide at 1440, 776 from 1920, 980 from 2560); the dashboard inside it
           grows by the same ratio, so the two keep the proportion they have at 1440. */
        @media (min-width: 1920px) { .lp-laptop .df-content > * { zoom: 1.28; } }
        @media (min-width: 2560px) { .lp-laptop .df-content > * { zoom: 1.62; } }
        @media (min-width: 2560px) {
          .lp-w { max-width: 1960px; } .lp-w-wide { max-width: 2080px; } .lp-w-fit { max-width: 1600px; }
          .lp-shell .rl-header-inner { max-width: 2080px !important; }
          .lp-sub { font-size: 28px; }
          .lp-small { font-size: 18px; }
          .lp-body { font-size: 20px; }
          .lp-q { font-size: 26px; }
          .lp-block-t { font-size: 28px; }
          .lp-h2-a { font-size: 68px; } .lp-h2-b { font-size: 58px; } .lp-h2-c { font-size: 76px; } .lp-fit { font-size: 46px; }
          .lp-close { max-width: 980px; } .lp-close-sub { font-size: 24px; } .lp-how-head { max-width: 1040px; }
          .lp-hero-text .rl-btn, .lp-close .rl-btn { min-height: 60px; font-size: 19px !important; padding-left: 32px !important; padding-right: 32px !important; }
          .lp-shell .lh-nav a, .lp-shell .lh-right a { font-size: 18px !important; }
          .lp-blocks, .lp-steps { gap: 64px; }
          .lp-shell .lp-eyebrow { font-size: 15px; }
          .lp-facts > span { font-size: 17px !important; }
          .lp-caption { font-size: 16px !important; }
          .lp-tenant-note { font-size: 17px !important; }
          .lp-tenant input { font-size: 20px !important; min-height: 60px !important; }
          .lp-tenant .rl-btn { min-height: 60px !important; font-size: 19px !important; }
          .lp-foot a, .lp-foot p, .lp-foot .lp-legal { font-size: 17px !important; }
          .lp-foot div[style*="uppercase"] { font-size: 14px !important; }
        }
        .lp-legal { display: flex; flex-wrap: wrap; column-gap: 0.9em; overflow: hidden; }
        .lp-legal > span { position: relative; white-space: nowrap; }
        .lp-legal > span + span::before { content: '·'; position: absolute; left: -0.9em; width: 0.9em; text-align: center; }
      `}</style>
      <style jsx>{`
        /* Landing header: the shared glass (components/ui.js), solid at the very top so it reads
           as the flat paper page, glass once the page scrolls under it. It stays at the top: the
           page's own boxes are overflow-x hidden (components/ui.js), which makes each a scroll box
           that never scrolls, so a sticky header inside never stuck; clip holds the same sideways
           edge without making one (as components/dashboard/DashShell.js does). */
        :global(body:has(.lp-shell)), :global(#__next:has(.lp-shell)) { overflow-x: clip !important; }
        /* Small screens: collapse the secondary nav (still in the footer) so the top bar is a single
           tidy row, wordmark + primary CTA, with no wrap or overflow at 360/390. */
        @media (max-width: 599px) {
          .lp-shell :global(.lh-nav) { display: none !important; }
        }
      `}</style>
      </>
    );
  }



  // ════════════════════════════════════════════════════════════
  // RESULT
  // ════════════════════════════════════════════════════════════
  if (step === 'result') {
    return (
      <>
        <Head><title>Your application · Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', paddingTop: 'calc(22px + env(safe-area-inset-top, 0px))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark /></a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={startOver} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
                Start fresh
              </button>
            </div>
          </header>

          <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px) 64px' }}>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(32px, 5.5vw, 48px)', color: C.ink, marginBottom: 12, letterSpacing: '-0.025em', lineHeight: 1.04, textWrap: 'balance' }}>
              Your application is <span style={{ color: C.red, whiteSpace: 'nowrap' }}>submitted.</span>
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 32, lineHeight: 1.55 }}>
              Below is your application number and tenant resume. Share these with the listing realtor or landlord.
            </p>

            {/* Application Number Card, the trust signal for landlords */}
            {applicationNumber && (
              <div style={{
                background: C.ink, color: C.paper, borderRadius: R.card,
                padding: '24px 28px', marginBottom: 24,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Your Application Number
                    </div>
                    <div className="rl-serif" style={{ fontSize: 26, letterSpacing: '0.02em', marginBottom: 10, fontFamily: 'monospace' }}>
                      {applicationNumber}
                    </div>
                    <p style={{ fontSize: 13, color: C.inkInverse, lineHeight: 1.55, maxWidth: 480 }}>
                      Share this number with your landlord or realtor. They can verify your application and compare you against other tenants, for free, at <span style={{ color: C.paper, fontWeight: 600 }}>rentletter.ca/dashboard</span>
                    </p>
                    <a href="/my-application"
                      style={{
                        display: 'inline-block', marginTop: 14,
                        fontSize: 12, fontWeight: 600,
                        color: C.paper, textDecoration: 'underline',
                      }}>
                      → See who viewed your application or revoke it
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(applicationNumber);
                      setCopiedAppNum(true);
                      setTimeout(() => setCopiedAppNum(false), 2000);
                    }}
                    className="rl-btn"
                    style={{
                      background: C.paper, color: C.ink, border: 'none', borderRadius: 'var(--btn-radius)',
                      padding: '11px 20px', fontSize: 13, fontWeight: 600,
                      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <Icon name={copiedAppNum ? 'check' : 'copy'} size={15} strokeWidth={copiedAppNum ? 2.5 : 1.5} /> {copiedAppNum ? 'Copied' : 'Copy number'}
                  </button>
                </div>
              </div>
            )}

            {/* Email status */}
            {form.email && (
              <div style={{
                background: C.info,
                border: `1px solid ${C.infoBorder}`,
                borderRadius: R.ctrl,
                padding: '14px 18px', marginBottom: 24, fontSize: 14,
                color: C.ink,
              }}>
                {emailSending ? `Delivering to ${form.email}...` : emailSent ? `Sent to ${form.email}` : `Will email to ${form.email}`}
                {!emailSent && !emailSending && (
                  <button onClick={() => sendEmail(form.email, form.fullName, applicationNumber)} className="rl-btn"
                    style={{ marginLeft: 12, background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 'var(--btn-radius)', padding: '6px var(--gap-card)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Resend email
                  </button>
                )}
              </div>
            )}

            {/* Resume */}
            <div className="rl-card" style={{ marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.rule}` }}>
                <h2 className="rl-serif" style={{ fontSize: 22, color: C.ink, letterSpacing: '-0.01em' }}>Tenant resume</h2>
                <button onClick={() => copyText(resume, setCopiedResume)} className="rl-btn"
                  style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: 'var(--btn-radius)', padding: '8px var(--gap-card)', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={copiedResume ? 'check' : 'copy'} size={14} strokeWidth={copiedResume ? 2.5 : 1.5} /> {copiedResume ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea value={resume} onChange={e => updateResume(e.target.value)}
                style={{
                  width: '100%', minHeight: 320, padding: 24,
                  fontFamily: "'Inter', sans-serif", fontSize: 'var(--t-body)', lineHeight: 1.7,
                  color: C.ink, background: C.card,
                  border: 'none', resize: 'vertical',
                }} />
            </div>

            <button onClick={startOver} className="rl-btn"
              style={{ marginTop: 8, background: 'transparent', border: `1px solid ${C.ink}`, color: C.ink, borderRadius: 'var(--btn-radius)', padding: '14px var(--gap-card)', fontSize: 14, fontWeight: 500 }}>
              Start a new application
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}

// ─── FOOTER COLUMN ────────────────────────────────────────────
function FooterCol({ title, links }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {links.map(([label, href]) => (
          <a key={label} href={href} style={{ color: C.inkSoft, textDecoration: 'none', fontSize: 13.5, lineHeight: 1.3 }}>{label}</a>
        ))}
      </div>
    </div>
  );
}
