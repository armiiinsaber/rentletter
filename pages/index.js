import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import ChatWidget from '../components/ChatWidget';
import { C, R, SH, EASE, FONT } from '../components/theme';
import { GlobalStyle, Wordmark, Icon, ScrollHeader } from '../components/ui';

// Stripe payment links — both must redirect to:
// https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}
// SINGLE is on LAUNCH PROMO at $0.99 until July 1, 2026 (regular price $9.99)
const STRIPE_SINGLE = 'https://buy.stripe.com/bJe28k9mr6Jtbh10Gm6Ri03';
const STRIPE_UNLIMITED = 'https://buy.stripe.com/bJedR256b5Fpcl5cp46Ri02';

// ── PROMO CONFIG ──
const PROMO_END_DATE = new Date('2026-07-01T05:00:00Z'); // July 1, 2026 00:00 ET
const PROMO_PRICE = '0.99';
const REGULAR_PRICE = '9.99';
const isPromoActive = () => new Date() < PROMO_END_DATE;

// ─── COUNT-UP STAT — DOM-mutated to avoid hydration mismatch ───────────────
const StatCounter = ({ numStr, label }) => {
  const match = numStr.match(/^(\d+)\s+(.+)$/);
  const target = match ? parseInt(match[1], 10) : 0;
  const suffix = match ? ' ' + match[2] : numStr;
  const wrapRef = useRef(null);
  const numRef  = useRef(null);
  useEffect(() => {
    const el = wrapRef.current;
    const numEl = numRef.current;
    if (!el || !numEl) return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.unobserve(el);
      const dur = 800, t0 = performance.now();
      numEl.textContent = '0' + suffix;
      const tick = (now) => {
        const t = Math.min((now - t0) / dur, 1);
        numEl.textContent = Math.ceil((1 - Math.pow(1 - t, 3)) * target) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, suffix]);
  return (
    <div ref={wrapRef}>
      <div ref={numRef} className="rl-serif" style={{ fontSize: 'clamp(34px, 5vw, 44px)', color: C.ink, letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1 }}>
        {target}{suffix}
      </div>
      <div style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
};

// ─── HERO DEMO — looping, auto-advancing animated product demo ──────────────
// Built entirely in code (no screenshot). Two crossfading scenes:
//   1. REVIEW   — applicant cards arrive; one auto-highlights at a time,
//                 revealing income / employment / fit-against-preferences.
//   2. SHORTLIST — the same applicants re-sorted by score, a "Top pick" rises,
//                 and a "Send to landlord" bar appears.
// transform/opacity only; respects prefers-reduced-motion (static shortlist).
const HERO_APPLICANTS = [
  { id: 'sarah', initials: 'SC', color: '#b07818', name: 'Sarah Chen',  role: 'Marketing Mgr · Loblaw',  income: '$87,000/yr', score: 3.9, fit: [['Income 30% of rent', true], ['Non-smoker', true]] },
  { id: 'james', initials: 'JO', color: '#3a6ea5', name: 'James Okafor', role: 'Software Eng · Shopify',    income: '$95,000/yr', score: 4.2, fit: [['Income comfortably clears', true], ['Tenure under 2 yrs', false]] },
  { id: 'priya', initials: 'PN', color: '#2d7d4a', name: 'Priya Nair',  role: 'Senior UX · CIBC',         income: '$115,000/yr', score: 4.6, fit: [['Income comfortably clears', true], ['5 yrs at employer', true]] },
];
const HERO_ARRIVAL = ['sarah', 'james', 'priya'];                 // as they applied
const HERO_RANKED  = ['priya', 'james', 'sarah'];                 // by score, desc
const HERO_BY_ID = Object.fromEntries(HERO_APPLICANTS.map(a => [a.id, a]));

function HeroAvatar({ a, size = 30 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: '50%',
      background: a.color, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, letterSpacing: '0.01em',
    }}>{a.initials}</span>
  );
}

function HeroDemo() {
  const [step, setStep] = useState(0); // 0,1,2 = review highlight; 3 = shortlist
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      setStill(true);
      return;
    }
    const durations = [1700, 1700, 1900, 3800];
    let t;
    const tick = (s) => { t = setTimeout(() => { const n = (s + 1) % 4; setStep(n); tick(n); }, durations[s]); };
    tick(0);
    return () => clearTimeout(t);
  }, []);

  const reviewVisible = !still && step < 3;
  const shortlistVisible = still || step === 3;

  const sceneBase = {
    position: 'absolute', inset: 0, padding: 'clamp(14px, 4.5%, 22px)',
    display: 'flex', flexDirection: 'column', gap: 'clamp(7px, 1.6%, 10px)',
    transition: 'opacity 600ms ease, transform 600ms cubic-bezier(0.22,1,0.36,1)',
  };
  const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
  const eyebrow = { fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' };
  const cardBase = {
    background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl,
    padding: 'clamp(7px, 2%, 11px) clamp(9px, 2.4%, 13px)', boxShadow: SH.rest,
    transition: 'transform 480ms cubic-bezier(0.22,1,0.36,1), box-shadow 480ms ease, border-color 480ms ease, opacity 480ms ease',
  };
  const nameStyle = { fontSize: 'clamp(11px, 3vw, 13px)', fontWeight: 700, color: C.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const roleStyle = { fontSize: 'clamp(9px, 2.4vw, 11px)', color: C.inkMute, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const scorePill = (active) => ({ fontSize: 'clamp(10px, 2.6vw, 12px)', fontWeight: 700, color: active ? C.paper : C.ink, background: active ? C.red : C.paperDeep, borderRadius: R.pill, padding: '2px 9px', flexShrink: 0 });

  return (
    <>
      {/* ── REVIEW SCENE ── */}
      <div style={{
        ...sceneBase,
        opacity: reviewVisible ? 1 : 0,
        transform: reviewVisible ? 'none' : 'translateY(-6px)',
        pointerEvents: 'none',
      }} aria-hidden={!reviewVisible}>
        <div style={head}>
          <span style={eyebrow}>Maple &amp; Birch · 2BR</span>
          <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.inkMute, fontWeight: 600 }}>8 applicants</span>
        </div>
        <div style={{ height: 1, background: C.rule }} />
        {HERO_ARRIVAL.map((id, i) => {
          const a = HERO_BY_ID[id];
          const active = !still && step === i;
          return (
            <div key={id} style={{
              ...cardBase,
              borderLeft: active ? `3px solid ${C.red}` : `1px solid ${C.rule}`,
              transform: active ? 'translateY(-1px) scale(1.015)' : 'none',
              boxShadow: active ? SH.raised : SH.rest,
              opacity: (!still && step > i && step < 3) ? 0.55 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <HeroAvatar a={a} size={28} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={nameStyle}>{a.name}</div>
                  <div style={roleStyle}>{a.role}</div>
                </div>
                <span style={scorePill(active)}>{a.score.toFixed(1)}</span>
              </div>
              {/* Reveal: income + fit, only on the active card (opacity/height) */}
              <div style={{
                overflow: 'hidden',
                maxHeight: active ? 60 : 0,
                opacity: active ? 1 : 0,
                transition: 'max-height 480ms cubic-bezier(0.22,1,0.36,1), opacity 360ms ease',
                marginTop: active ? 8 : 0,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', fontWeight: 600, color: C.ink, background: C.paperDeep, borderRadius: R.pill, padding: '2px 8px' }}>{a.income}</span>
                  {a.fit.map(([label, ok], k) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'clamp(9px, 2.4vw, 11px)', color: ok ? C.green : C.inkMute }}>
                      <Icon name={ok ? 'check' : 'question'} size={12} color={ok ? C.green : C.inkMute} strokeWidth={2} />{label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SHORTLIST SCENE ── */}
      <div style={{
        ...sceneBase,
        opacity: shortlistVisible ? 1 : 0,
        transform: shortlistVisible ? 'none' : 'translateY(6px)',
        pointerEvents: 'none',
      }} aria-hidden={!shortlistVisible}>
        <div style={head}>
          <span style={eyebrow}>Your shortlist · top 3</span>
          <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.green, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: `1px solid ${C.green}`, borderRadius: R.pill, padding: '1px 7px' }}>Ranked</span>
        </div>
        <div style={{ height: 1, background: C.rule }} />
        {HERO_RANKED.map((id, i) => {
          const a = HERO_BY_ID[id];
          const top = i === 0;
          return (
            <div key={id} style={{
              ...cardBase,
              borderLeft: top ? `3px solid ${C.red}` : `1px solid ${C.rule}`,
              display: 'flex', alignItems: 'center', gap: 9,
              // staggered rise as the shortlist scene appears
              transform: shortlistVisible ? 'none' : 'translateY(8px)',
              opacity: shortlistVisible ? 1 : 0,
              transitionDelay: shortlistVisible ? `${i * 90}ms` : '0ms',
            }}>
              <span className="rl-serif" style={{ fontSize: 'clamp(11px, 3vw, 14px)', color: C.inkMute, width: 14, flexShrink: 0 }}>{i + 1}</span>
              <HeroAvatar a={a} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={nameStyle}>
                  {a.name}
                  {top && <span style={{ color: C.red, fontWeight: 600 }}> · Top pick</span>}
                </div>
                <div style={roleStyle}>{a.role} · {a.income}</div>
              </div>
              <span style={scorePill(top)}>{a.score.toFixed(1)}</span>
            </div>
          );
        })}
        {/* Send-to-landlord bar */}
        <div style={{
          marginTop: 'auto', background: C.ink, color: C.paper, borderRadius: R.ctrl,
          padding: 'clamp(7px, 2%, 10px) clamp(10px, 2.6%, 14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: C.inkInverse, fontWeight: 500 }}>Co-branded report</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'clamp(10px, 2.6vw, 12px)', fontWeight: 700, color: C.paper }}>
            Send to landlord <Icon name="arrow" size={14} color={C.paper} />
          </span>
        </div>
      </div>
    </>
  );
}

export default function Home() {
  const [step, setStep] = useState('landing');
  const [tier, setTier] = useState('single');
  const [form, setForm] = useState({
    email: '',
    apartmentAddress: '', apartmentDescription: '',
    // Tier 1 — required (basic identity + landlord-needed)
    fullName: '', age: '', dateOfBirth: '', phone: '',
    // Tier 1 — employment (existing)
    jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
    // Tier 1 — current rental (expanded)
    previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
    currentRent: '',
    moveInDate: '', reasonForMoving: '',
    // Tier 1 — household details
    numberOfOccupants: '1', occupantsDetails: '',
    smoker: 'no',
    // Tier 1 — co-applicant (progressive disclosure)
    hasCoApplicant: false,
    coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
    coApplicantIncome: '', coApplicantRelationship: '',
    // Tier 1 — existing lifestyle/disclosures
    personality: '', pets: '', redFlags: '',
    // Tier 2 — optional but landlord-helpful
    hasVehicle: false,
    vehicleMakeModel: '', vehicleYear: '',
    reference1Name: '', reference1Relationship: '', reference1Contact: '',
    reference2Name: '', reference2Relationship: '', reference2Contact: '',
  });
  const [letter, setLetter] = useState('');
  const [resume, setResume] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [error, setError] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const [copiedAppNum, setCopiedAppNum] = useState(false);

  // ── Invite state — tenant arrived via a realtor's listing-scoped link ──
  const [inviteToken, setInviteToken] = useState('');
  const [inviteContext, setInviteContext] = useState(null); // { realtorName, realtorBrokerage, listingName, unit }

  // ── Pass state (30-day unlimited access) ──
  const [passToken, setPassToken] = useState('');
  const [passInfo, setPassInfo] = useState(null); // { email, daysRemaining, lettersGenerated, expiresAt }
  const [passVerifying, setPassVerifying] = useState(false);
  const [passActivating, setPassActivating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPaid = params.get('paid') === 'true';
    const sessionId = params.get('session_id');
    const urlPass = params.get('pass');
    const paidTier = params.get('tier'); // 'unlimited' set by us before Stripe redirect
    const inviteParam = params.get('invite');

    // ─── ENTRY 0: Tenant arrived via realtor's invite link ───
    if (inviteParam && /^[a-f0-9]{20}$/.test(inviteParam)) {
      setInviteToken(inviteParam);
      // Fetch the invite context to display "applying for X" banner
      fetch(`/api/landlord/resolve-invite?token=${encodeURIComponent(inviteParam)}`)
        .then(r => r.json())
        .then(json => {
          if (json && !json.error) {
            setInviteContext(json);
            setStep('form'); // jump straight to form, no landing page
          }
        })
        .catch(() => { /* swallow — tenant can still apply normally */ });
      // Don't return — let the rest of the logic also run in case of other params
    }

    // ─── ENTRY 1: User has a pass token in the URL ───
    if (urlPass) {
      verifyAndLoadPass(urlPass);
      return;
    }

    // ─── ENTRY 2: User just paid for the 30-day pass — activate it ───
    if (isPaid && sessionId && (paidTier === 'unlimited' || localStorage.getItem('rentletter_pending_tier') === 'unlimited')) {
      activatePass(sessionId);
      return;
    }

    // ─── ENTRY 2.5: User just paid for the $4.99 cover letter upsell ───
    const isLetterPurchase = params.get('product') === 'letter';
    if (isPaid && sessionId && isLetterPurchase) {
      const savedForm = localStorage.getItem('rentletter_form');
      const savedAppNumber = localStorage.getItem('rentletter_app_number');
      if (savedForm && savedAppNumber) {
        const data = JSON.parse(savedForm);
        setForm(data);
        setApplicationNumber(savedAppNumber);
        setStep('generating');
        // Generate the letter for the existing application
        generateLetter(data, {
          mode: 'letter',
          stripeSessionId: sessionId,
          applicationNumber: savedAppNumber,
        });
      }
      return;
    }

    // ─── ENTRY 3: Legacy single-letter Stripe flow (rare now) ───
    if (isPaid && sessionId) {
      const savedForm = localStorage.getItem('rentletter_form');
      if (savedForm) {
        const data = JSON.parse(savedForm);
        setForm(data);
        setStep('generating');
        generateLetter(data, { mode: 'letter', stripeSessionId: sessionId });
      }
      return;
    }

    // ─── ENTRY 4: Returning user — restore previous state ───
    // First, check if they have a pass stored locally
    const savedPass = localStorage.getItem('rentletter_pass');
    if (savedPass) {
      // Verify it's still valid
      verifyAndLoadPass(savedPass, /* silent */ true);
    }

    const savedLetter = localStorage.getItem('rentletter_letter');
    const savedResume = localStorage.getItem('rentletter_resume');
    const savedForm = localStorage.getItem('rentletter_form');
    const savedAppNum = localStorage.getItem('rentletter_app_number');
    if (savedLetter && savedForm) {
      setLetter(savedLetter);
      setResume(savedResume || '');
      setForm(JSON.parse(savedForm));
      if (savedAppNum) setApplicationNumber(savedAppNum);
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

  // ─── SCROLL REVEAL — .rl-reveal sections + .rl-steps parent ───
  useEffect(() => {
    if (step !== 'landing') return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const els = document.querySelectorAll('.rl-reveal, .rl-steps');
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rl-vis'); obs.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [step]);

  // ─── PASS VERIFICATION ───
  const verifyAndLoadPass = async (token, silent = false) => {
    if (!silent) setPassVerifying(true);
    try {
      const res = await fetch('/api/pass/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passToken: token }),
      });
      const json = await res.json();
      if (json.valid) {
        setPassToken(token);
        setPassInfo({
          email: json.email,
          daysRemaining: json.daysRemaining,
          lettersGenerated: json.lettersGenerated,
          expiresAt: json.expiresAt,
        });
        localStorage.setItem('rentletter_pass', token);
        // If we came from URL, clean the URL and go to form
        if (!silent) {
          window.history.replaceState({}, '', window.location.pathname);
          setStep('form');
        }
      } else {
        if (!silent) {
          setError(json.error || 'Pass is invalid or expired.');
          setStep('landing');
        }
        // Clear bad saved pass
        if (silent) localStorage.removeItem('rentletter_pass');
      }
    } catch (e) {
      if (!silent) {
        setError('Could not verify pass. Please try again.');
        setStep('landing');
      }
    }
    setPassVerifying(false);
  };

  // ─── PASS ACTIVATION (after successful Stripe pass payment) ───
  const activatePass = async (sessionId) => {
    setPassActivating(true);
    setStep('activating');
    try {
      const res = await fetch('/api/pass/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSessionId: sessionId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Pass created — save and load it
      setPassToken(json.passToken);
      localStorage.setItem('rentletter_pass', json.passToken);
      localStorage.removeItem('rentletter_pending_tier');

      // Load pass info for the success screen
      await verifyAndLoadPass(json.passToken, true);
      window.history.replaceState({}, '', window.location.pathname);
      setStep('passSuccess');
    } catch (e) {
      setError(`Pass activation failed: ${e.message}. Please contact us at info@rentletter.ca with your payment confirmation.`);
      setStep('landing');
    }
    setPassActivating(false);
  };

  const clearPass = () => {
    if (!confirm('Sign out of your 30-day pass on this device? You can re-open the access link from your email any time.')) return;
    localStorage.removeItem('rentletter_pass');
    setPassToken('');
    setPassInfo(null);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const isFormValid = () => {
    return form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      && form.fullName && form.jobTitle && form.employer
      && form.annualIncome && form.moveInDate && form.reasonForMoving;
  };

  const handlePay = () => {
    // Application mode: free, no AI used. Letter is offered as upsell after.
    localStorage.setItem('rentletter_form', JSON.stringify(form));
    generateLetter(form, { mode: 'application' });
  };

  // ─── DEV: Autofill test data + skip Stripe ─────────────────
  const fillTestData = () => {
    const sampleProfiles = [
      {
        email: 'sarah.chen.test@example.com',
        apartmentAddress: '144 Roxborough Drive, Toronto',
        apartmentDescription: '1BR, Rosedale, $2,200/mo',
        fullName: 'Sarah Chen', age: '29',
        jobTitle: 'Marketing Manager', employer: 'Loblaw Companies',
        yearsAtJob: '4', annualIncome: '87000',
        previousAddress: '245 Sherbourne Street, Toronto', yearsAtPrevious: '2.5',
        previousLandlordName: 'Michael Park', previousLandlordContact: '416-555-0142',
        moveInDate: '2026-06-15',
        reasonForMoving: 'Moving closer to my office on Bloor Street to cut my commute from 45 minutes to under 15. My current lease at 245 Sherbourne ends June 30.',
        personality: 'Quiet, work from home 3 days a week, non-smoker. I keep a clean, minimal space.',
        pets: 'None',
        redFlags: '',
      },
      {
        email: 'james.okafor.test@example.com',
        apartmentAddress: '88 Yonge Street, Toronto',
        apartmentDescription: 'Studio, downtown, $1,850/mo',
        fullName: 'James Okafor', age: '26',
        jobTitle: 'Software Engineer', employer: 'Shopify',
        yearsAtJob: '1.5', annualIncome: '95000',
        previousAddress: '', yearsAtPrevious: '',
        previousLandlordName: '', previousLandlordContact: '',
        moveInDate: '2026-07-01',
        reasonForMoving: 'First-time renter — moving out of a family home to start independent life closer to work.',
        personality: 'Quiet, mostly home in evenings, occasional weekend hosting (small groups).',
        pets: 'None',
        redFlags: 'Limited rental history as a first-time renter. Can provide guarantor and employer reference.',
      },
      {
        email: 'priya.nair.test@example.com',
        apartmentAddress: '550 Queen Street West, Toronto',
        apartmentDescription: '2BR, Queen West, $3,100/mo',
        fullName: 'Priya Nair', age: '34',
        jobTitle: 'Senior UX Designer', employer: 'CIBC',
        yearsAtJob: '5', annualIncome: '115000',
        previousAddress: '300 Bloor Street West, Toronto', yearsAtPrevious: '3',
        previousLandlordName: 'David Wong', previousLandlordContact: '647-555-0199',
        moveInDate: '2026-08-01',
        reasonForMoving: 'Partner and I are moving in together — we both want a 2BR closer to the West End where we both work.',
        personality: 'Stable, professional household. Both work hybrid, mostly weekday daytime presence.',
        pets: 'One indoor cat, 6 years old, vet records available',
        redFlags: '',
      },
    ];
    const random = sampleProfiles[Math.floor(Math.random() * sampleProfiles.length)];
    setForm(random);
  };

  const generateDemoLetter = async () => {
    // Auto-fill, then generate WITHOUT Stripe (uses demo bypass)
    const demo = {
      email: 'demo@rentletter.ca',
      apartmentAddress: '144 Roxborough Drive, Toronto',
      apartmentDescription: '1BR, Rosedale, $2,200/mo',
      fullName: 'Sarah Chen', age: '29',
      jobTitle: 'Marketing Manager', employer: 'Loblaw Companies',
      yearsAtJob: '4', annualIncome: '87000',
      previousAddress: '245 Sherbourne Street, Toronto', yearsAtPrevious: '2.5',
      previousLandlordName: 'Michael Park', previousLandlordContact: '416-555-0142',
      moveInDate: '2026-06-15',
      reasonForMoving: 'Moving closer to my office on Bloor Street to cut my commute. Current lease at 245 Sherbourne ends June 30.',
      personality: 'Quiet, work from home 3 days a week, non-smoker.',
      pets: 'None',
      redFlags: '',
    };
    setForm(demo);
    setStep('generating');
    await generateLetter(demo, { mode: 'letter', stripeSessionId: 'DEMO_MODE_BYPASS' });
  };

  const generateLetter = async (data, auth = {}) => {
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...auth }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLetter(json.letter);
      setResume(json.resume);
      if (json.applicationNumber) {
        setApplicationNumber(json.applicationNumber);
        localStorage.setItem('rentletter_app_number', json.applicationNumber);
        // If this submission came from a realtor's invite link, tag it
        if (inviteToken && /^[a-f0-9]{20}$/.test(inviteToken)) {
          fetch('/api/landlord/tag-invite-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inviteToken, applicationNumber: json.applicationNumber }),
          }).catch(e => console.error('[tag-invite] fire-and-forget failed', e));
        }
      }
      if (json.ownerToken) {
        localStorage.setItem('rentletter_owner_token', json.ownerToken);
      }
      localStorage.setItem('rentletter_letter', json.letter);
      localStorage.setItem('rentletter_resume', json.resume);
      window.history.replaceState({}, '', window.location.pathname);
      setStep('result');
      // Only send the email when we actually have a letter (after purchase).
      // For free application mode, the email is delayed until they buy the letter.
      // Email always goes if they have at least the resume.
      if (data.email && json.resume) {
        sendEmail(data.email, data.fullName, json.letter || '', json.resume, json.applicationNumber, json.ownerToken);
      }
      // Refresh pass info if generated via pass
      if (auth.passToken) {
        verifyAndLoadPass(auth.passToken, true);
      }
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  };

  const sendEmail = async (email, fullName, letterText, resumeText, appNum, ownerTok) => {
    setEmailSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fullName,
          letter: letterText,
          resume: resumeText,
          applicationNumber: appNum || applicationNumber,
          ownerToken: ownerTok || (typeof window !== 'undefined' ? localStorage.getItem('rentletter_owner_token') : null),
        }),
      });
      const json = await res.json();
      if (json.success) setEmailSent(true);
    } catch (e) {
      console.error('Email send failed:', e);
    }
    setEmailSending(false);
  };

  const downloadFile = async (format) => {
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, letter, resume, fullName: form.fullName }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(form.fullName || 'rental').replace(/[^a-zA-Z0-9]/g, '_')}_rental_letter.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed. Try again.');
    }
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
    fullName: '', age: '', dateOfBirth: '', phone: '',
    jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
    previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
    currentRent: '',
    moveInDate: '', reasonForMoving: '',
    numberOfOccupants: '1', occupantsDetails: '',
    smoker: 'no',
    hasCoApplicant: false,
    coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
    coApplicantIncome: '', coApplicantRelationship: '',
    personality: '', pets: '', redFlags: '',
    hasVehicle: false,
    vehicleMakeModel: '', vehicleYear: '',
    reference1Name: '', reference1Relationship: '', reference1Contact: '',
    reference2Name: '', reference2Relationship: '', reference2Contact: '',
  };

  const startOver = () => {
    if (!confirm('Clear this letter and start fresh?')) return;
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    localStorage.removeItem('rentletter_form');
    localStorage.removeItem('rentletter_app_number');
    setLetter(''); setResume(''); setApplicationNumber('');
    setForm(EMPTY_FORM);
    setStep('landing');
  };

  const updateLetter = (text) => { setLetter(text); localStorage.setItem('rentletter_letter', text); };
  const updateResume = (text) => { setResume(text); localStorage.setItem('rentletter_resume', text); };

  // ════════════════════════════════════════════════════════════
  // LANDING — minimal, confident, sparingly red
  // ════════════════════════════════════════════════════════════
  if (step === 'landing') {
    return (
      <>
        <Head>
          <title>Rentletter — Rental screening for Canadian realtors.</title>
          <meta name="description" content="A dashboard for Canadian rental realtors to receive standardized tenant applications, shortlist candidates, and send polished reports to landlord clients." />
        </Head>
        <GlobalStyle />

        <div style={{ minHeight: '100vh', background: C.paper }}>

          {/* ── LAUNCH BANNER ── */}
          <div style={{
            background: C.ink, color: C.paper,
            padding: '11px 24px',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span className="rl-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.red }}>
                Launch
              </span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.inkInverse }}>
              Free for Toronto realtors during launch · No credit card
            </span>
          </div>

          {/* ── HEADER ──────────────────────────────────────── */}
          <ScrollHeader>
            <Wordmark />
            <div style={{ display: 'flex', gap: 'clamp(14px, 2vw, 26px)', alignItems: 'center', flexWrap: 'wrap' }}>
              <a href="/faq" style={{ color: C.inkSoft, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>FAQ</a>
              <a href="/landlord" style={{ color: C.inkSoft, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Sign in</a>
              <a href="/landlord" className="rl-btn" style={{
                background: C.ink, color: C.paper, textDecoration: 'none',
                padding: '11px 18px', fontSize: 13, fontWeight: 600, borderRadius: R.ctrl,
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
                Try the dashboard <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
              </a>
            </div>
          </ScrollHeader>

          {/* ── HERO ──────────────────────────────────────── */}
          <section style={{ padding: 'clamp(44px, 7vw, 96px) clamp(20px, 4vw, 32px) clamp(48px, 7vw, 80px)', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
              gap: 'clamp(28px, 4vw, 64px)',
              alignItems: 'center',
            }}>

              {/* LEFT — text */}
              <div>
                <div className="rl-hero-seq" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                  <span className="rl-rule-draw" style={{ height: 2, background: C.red, borderRadius: 1, display: 'block' }} />
                  <span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    For Toronto Realtors · 2026
                  </span>
                </div>

                <h1 className="rl-serif" style={{
                  fontSize: 'clamp(42px, 6vw, 72px)',
                  lineHeight: 1.02,
                  letterSpacing: '-0.025em',
                  color: C.ink,
                  marginBottom: 26,
                }}>
                  <span className="rl-line-wrap"><span className="rl-line" style={{ animationDelay: '180ms' }}>A simpler way to</span></span>
                  <span className="rl-line-wrap"><span className="rl-line" style={{ animationDelay: '270ms' }}>handle <span style={{ color: C.red }}>rental</span></span></span>
                  <span className="rl-line-wrap"><span className="rl-line" style={{ animationDelay: '360ms', color: C.red }}>applications.</span></span>
                </h1>

                <p className="rl-hero-seq" style={{
                  animationDelay: '540ms',
                  fontSize: 'clamp(16px, 1.7vw, 19px)',
                  lineHeight: 1.6,
                  color: C.inkSoft,
                  marginBottom: 34,
                  maxWidth: 540,
                }}>
                  Send applicants one link. Standardized applications land in your dashboard automatically. Shortlist, document your decisions, and send a polished report to your landlord client.
                </p>

                <div className="rl-hero-seq" style={{ animationDelay: '660ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                    <a href="/landlord" className="rl-btn" style={{
                      background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl,
                      padding: '16px 28px', fontSize: 15, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 9,
                    }}>
                      Try the dashboard <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                    </a>
                    <a href="mailto:info@rentletter.ca?subject=Demo%20request%20-%20Rentletter&body=Hi%20Rentletter%20team%2C%0A%0AI%27d%20like%20to%20book%20a%2015-minute%20demo%20of%20Rentletter.%0A%0AMy%20brokerage%3A%20%0AMy%20preferred%20time%3A%20%0A%0AThanks!"
                      className="rl-btn" style={{
                        background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, textDecoration: 'none',
                        borderRadius: R.ctrl, padding: '16px 28px', fontSize: 15, fontWeight: 500,
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}>
                      Book a 15-min demo
                    </a>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {['Free during launch', 'No credit card', 'No setup'].map(t => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkMute }}>
                        <span style={{ color: C.green, display: 'inline-flex' }}><Icon name="check" size={15} color={C.green} strokeWidth={2} /></span>{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT — dashboard screenshot in browser-chrome frame */}
              <div className="rl-hero-seq" style={{ animationDelay: '300ms', position: 'relative' }}>
                <div ref={tiltRef}
                  onMouseMove={skipTilt ? undefined : handleTiltMove}
                  onMouseLeave={skipTilt ? undefined : handleTiltLeave}>
                  <div style={{
                    transform: skipTilt ? undefined : `perspective(1100px) rotateX(${heroTilt.x}deg) rotateY(${heroTilt.y}deg)`,
                    transition: skipTilt ? undefined : ((heroTilt.x === 0 && heroTilt.y === 0) ? `transform 600ms ${EASE}` : 'transform 80ms ease'),
                    willChange: skipTilt ? undefined : 'transform',
                    borderRadius: R.card, overflow: 'hidden', background: '#1c1c1e',
                    boxShadow: SH.modal,
                  }}>
                    {/* Chrome bar */}
                    <div style={{ background: '#2c2c2e', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
                      </div>
                      <div style={{ flex: 1, background: '#3c3c3e', borderRadius: 6, padding: '5px 12px', fontSize: 11, color: '#9a9a9f', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="shield" size={12} color="#9a9a9f" /> rentletter.ca/landlord
                      </div>
                    </div>
                    {/* Animated, looping product demo — built in code (no screenshot) */}
                    <div style={{ aspectRatio: '4 / 3', position: 'relative', overflow: 'hidden', background: `linear-gradient(160deg, ${C.card}, ${C.paperDeep})` }}>
                      <HeroDemo />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 14, fontSize: 12, color: C.inkMute, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span>The Rentletter dashboard — one workspace per listing.</span>
                  <a href="/demo" className="rl-btn" style={{
                    color: C.red, fontWeight: 700, textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    Explore the live demo <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={14} /></span>
                  </a>
                </div>
              </div>
            </div>

            {/* Stats row — count-up animation when scrolled into view */}
            <div className="rl-reveal" style={{
              marginTop: 'clamp(52px, 8vw, 88px)',
              borderTop: `1px solid ${C.rule}`,
              paddingTop: 36,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'clamp(20px, 3vw, 32px)',
            }}>
              <StatCounter numStr="3 days"  label="Typical screening time today" />
              <StatCounter numStr="30 min"  label="The same job, on Rentletter" />
              <StatCounter numStr="1 link"  label="Shared per listing" />
              <StatCounter numStr="0 fees"  label="Charged to your applicants" />
            </div>
          </section>

          {/* ── DIFFERENTIATOR — its own quiet statement ── */}
          <section className="rl-reveal" style={{ borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`, background: C.card }}>
            <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
                Where we fit
              </div>
              <p className="rl-serif" style={{ fontSize: 'clamp(21px, 3vw, 30px)', lineHeight: 1.32, letterSpacing: '-0.015em', color: C.ink, margin: 0 }}>
                Rentletter organizes your applicants —{' '}
                <span style={{ color: C.inkMute }}>from the first inquiry to the shortlist you hand your landlord.</span>
              </p>
            </div>
          </section>

          {/* ── PULL-QUOTE ── */}
          <section className="rl-reveal" style={{ background: C.ink, color: C.paper }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(52px, 8vw, 88px) clamp(20px, 4vw, 32px)' }}>
              <blockquote className="rl-serif" style={{
                fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 1.18, letterSpacing: '-0.02em',
                color: C.paper, borderLeft: `3px solid ${C.red}`, paddingLeft: 'clamp(20px, 3vw, 32px)', margin: 0, maxWidth: 900,
              }}>
                Standardized applications. Documented decisions.<br /><span style={{ color: C.inkInverse }}>One dashboard.</span>
              </blockquote>
            </div>
          </section>

          {/* ── HOW IT WORKS ── */}
          <section style={{ padding: 'clamp(64px, 10vw, 112px) clamp(20px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
            <div className="rl-reveal" style={{ marginBottom: 'clamp(40px, 6vw, 64px)', maxWidth: 640 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 18px' }}>
                How it works
              </h2>
              <p className="rl-serif" style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', lineHeight: 1.12, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>
                From listing to landlord in four steps.
              </p>
            </div>
            <div className="rl-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'clamp(20px, 3vw, 36px)' }}>
              {[
                { n: '01', icon: 'home', t: 'Create your listing', d: 'Add the unit and your screening preferences. We generate a secure link tied to that listing.' },
                { n: '02', icon: 'link', t: 'Share with applicants', d: 'Text or email the link. Standardized applications route into your dashboard automatically.' },
                { n: '03', icon: 'list', t: 'Review and shortlist', d: 'Compare candidates side by side. Score, shortlist, and document every decision.' },
                { n: '04', icon: 'send', t: 'Send to your landlord', d: 'One click sends a co-branded report with your name on it — free for you.' },
              ].map(s => (
                <div key={s.n} className="rl-step" style={{ paddingTop: 22, position: 'relative' }}>
                  <span className="rl-step-bar" style={{ background: C.red, position: 'absolute', top: 0, left: 0, right: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <span style={{ width: 40, height: 40, borderRadius: R.ctrl, background: C.red, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: SH.rest }}>
                      <Icon name={s.icon} size={20} color={C.paper} />
                    </span>
                    <span className="rl-serif" style={{ fontSize: 22, color: C.rule }}>{s.n}</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{s.t}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.inkSoft }}>{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── OTHER AUDIENCES — self-serve landlords + property managers + tenants ── */}
          <section className="rl-reveal" style={{ padding: 'clamp(20px, 4vw, 40px) clamp(20px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(14px, 2vw, 20px)' }}>
              {/* Self-serve landlord / PM */}
              <div className="rl-card rl-card-lift" style={{ padding: 'clamp(22px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ width: 40, height: 40, borderRadius: R.ctrl, background: C.paperDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="home" size={20} color={C.ink} />
                </span>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 6 }}>
                    Renting your own units?
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: C.inkSoft, margin: 0 }}>
                    Landlords and property managers handling it themselves — without a realtor — get the same dashboard. Keep the commission, run a clean process.
                  </p>
                </div>
                <a href="/landlord" className="rl-btn" style={{
                  alignSelf: 'flex-start', marginTop: 2,
                  background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl,
                  padding: '11px 18px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  Open the dashboard <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
                </a>
              </div>
              {/* Tenant */}
              <div className="rl-card rl-card-lift" style={{ padding: 'clamp(22px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ width: 40, height: 40, borderRadius: R.ctrl, background: C.paperDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user" size={20} color={C.ink} />
                </span>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 6 }}>
                    Applying for a unit?
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: C.inkSoft, margin: 0 }}>
                    Tenants submit a standardized application and get a shareable number — free. Usually you'll arrive through a link from your realtor or landlord.
                  </p>
                </div>
                <button onClick={() => setStep('form')} className="rl-btn" style={{
                  alignSelf: 'flex-start', marginTop: 2,
                  background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl,
                  padding: '11px 18px', fontSize: 14, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  Submit your application <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
                </button>
              </div>
            </div>
          </section>

          {/* ── BOTTOM CTA ── */}
          <section className="rl-reveal" style={{ padding: 'clamp(20px, 4vw, 40px) clamp(20px, 4vw, 32px) clamp(72px, 10vw, 112px)' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', background: C.ink, borderRadius: R.modal, padding: 'clamp(40px, 7vw, 72px) clamp(24px, 5vw, 64px)', position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', top: 0, left: 0, width: 6, height: '100%', background: C.red }} />
              <div style={{ maxWidth: 620 }}>
                <h2 className="rl-serif" style={{ fontSize: 'clamp(32px, 5vw, 52px)', letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 18, color: C.paper }}>
                  Set up your first listing.
                </h2>
                <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', lineHeight: 1.6, color: C.inkInverse, marginBottom: 32 }}>
                  Free for Toronto realtors during launch. No credit card, no setup — your first applicant link is ready in minutes.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a href="/landlord" className="rl-btn" style={{
                    background: C.red, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl,
                    padding: '16px 32px', fontSize: 15, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 9,
                  }}>
                    Try the dashboard <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                  </a>
                  <a href="mailto:info@rentletter.ca?subject=Demo%20request%20-%20Rentletter" className="rl-btn" style={{
                    background: 'transparent', color: C.paper, border: `1px solid rgba(250,248,243,0.3)`, textDecoration: 'none',
                    borderRadius: R.ctrl, padding: '16px 32px', fontSize: 15, fontWeight: 500,
                  }}>
                    Book a 15-min demo
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer style={{ padding: 'clamp(48px, 7vw, 72px) clamp(20px, 4vw, 32px) 48px', borderTop: `1px solid ${C.rule}`, background: C.card }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'clamp(28px, 4vw, 48px)', alignItems: 'start' }}>
                <div style={{ minWidth: 180 }}>
                  <Wordmark size="sm" />
                  <p style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.6, marginTop: 14, maxWidth: 260 }}>
                    Rental application screening for Canadian realtors. Built in Toronto.
                  </p>
                </div>
                <FooterCol title="Product" links={[['Dashboard', '/landlord'], ['Book a demo', 'mailto:info@rentletter.ca?subject=Demo%20request%20-%20Rentletter'], ['FAQ', '/faq']]} />
                <FooterCol title="Company" links={[['Compliance', '/compliance'], ['Privacy', '/privacy'], ['Terms', '/terms']]} />
                <FooterCol title="Contact" links={[['info@rentletter.ca', 'mailto:info@rentletter.ca']]} />
              </div>
              <div style={{ marginTop: 'clamp(36px, 5vw, 52px)', paddingTop: 24, borderTop: `1px solid ${C.rule}`, fontSize: 12.5, color: C.inkMute }}>
                © {new Date().getFullYear()} Rentletter · Toronto, Canada · Not legal advice
              </div>
            </div>
          </footer>
        </div>
      <ChatWidget />
      </>
    );
  }



  // ════════════════════════════════════════════════════════════
  // FORM
  // ════════════════════════════════════════════════════════════
  if (step === 'form') {
    return (
      <>
        <Head><title>Your details — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Wordmark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {passInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.inkSoft }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.red }} />
                  <span style={{ fontWeight: 600, color: C.ink }}>Pass active</span>
                  <span style={{ color: C.inkMute }}>· {passInfo.daysRemaining}d left</span>
                </div>
              )}
              <button onClick={() => setStep('landing')} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
                ← Back
              </button>
            </div>
          </header>

          <div style={{ maxWidth: 680, margin: '0 auto', padding: '64px 32px 80px' }}>

            {/* INVITE BANNER — tenant arrived via a realtor's listing-scoped link */}
            {inviteContext && (
              <div style={{
                background: C.ink, color: C.paper,
                padding: '20px 24px',
                marginBottom: 28, borderRadius: R.card,
                borderLeft: `4px solid ${C.red}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8c2b3', marginBottom: 6 }}>
                  Applying for
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 4 }}>
                  {inviteContext.listingName || (inviteContext.unit?.address) || 'Rental unit'}
                </div>
                {inviteContext.unit && (
                  <div style={{ fontSize: 13, color: '#c8c2b3', marginBottom: 8 }}>
                    {inviteContext.unit.monthlyRent && `$${inviteContext.unit.monthlyRent}/mo`}
                    {inviteContext.unit.bedrooms && ` · ${inviteContext.unit.bedrooms} bed`}
                  </div>
                )}
                {(inviteContext.realtorName || inviteContext.realtorBrokerage) && (
                  <div style={{ fontSize: 13, color: '#c8c2b3' }}>
                    Submitted to: <strong style={{ color: C.paper }}>{inviteContext.realtorName}</strong>
                    {inviteContext.realtorBrokerage && ` · ${inviteContext.realtorBrokerage}`}
                  </div>
                )}
              </div>
            )}

            {/* ── DEV TEST BAR (will be removed before public launch) ── */}
            <div style={{
              marginBottom: 32, padding: '14px 18px',
              background: '#fff8e1', border: `1px solid #f5d77a`, borderRadius: R.ctrl,
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              fontSize: 12,
            }}>
              <span style={{ color: '#7a5d12', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 }}>
                Dev mode
              </span>
              <button onClick={fillTestData} className="rl-btn"
                style={{ background: '#7a5d12', color: '#fff8e1', border: 'none', borderRadius: R.ctrl, padding: '6px 12px', fontSize: 11, fontWeight: 600 }}>
                Fill random sample
              </button>
              <button onClick={generateDemoLetter} className="rl-btn"
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '6px 12px', fontSize: 11, fontWeight: 600 }}>
                Generate Sarah Chen (skip Stripe)
              </button>
              <span style={{ fontSize: 11, color: '#7a5d12', opacity: 0.75 }}>
                Use these to test without paying. Remove this block before launch.
              </span>
            </div>

            <h1 className="rl-serif" style={{ fontSize: 'clamp(32px, 5.5vw, 48px)', color: C.ink, marginBottom: 12, letterSpacing: '-0.025em', lineHeight: 1.04 }}>
              Tell us about you
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 56, lineHeight: 1.55 }}>
              The more specific, the better. Skip anything that doesn't apply.
            </p>

            {error && (
              <div style={{ background: C.redTint, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, padding: '14px 18px', marginBottom: 32, color: C.ink, fontSize: 14 }}>
                {error}
              </div>
            )}

            {/* Privacy-first positioning note */}
            <div style={{
              marginBottom: 40, padding: '18px 22px',
              background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl,
              fontSize: 13, color: C.inkSoft, lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                Designed to be privacy-first
              </div>
              We collect what landlords need to make a good decision — not your SIN, bank info, or driver's license. Those come after an offer, not before. Aligned with Ontario Human Rights Code best practices.
            </div>

            <FormSection num="01" title="Where to send it" required>
              <Field label="Email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" type="email" />
            </FormSection>

            <FormSection num="02" title="The apartment">
              <Field label="Address" value={form.apartmentAddress} onChange={v => update('apartmentAddress', v)} placeholder="123 King St W, Toronto" />
              <Field label="Brief description" value={form.apartmentDescription} onChange={v => update('apartmentDescription', v)} placeholder="2BR, downtown, $2,400/mo" />
            </FormSection>

            <FormSection num="03" title="About you" required>
              <Field label="Full name" value={form.fullName} onChange={v => update('fullName', v)} placeholder="Jane Doe" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                <Field label="Age" value={form.age} onChange={v => update('age', v)} placeholder="28" type="number" />
                <Field label="Date of birth" value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} type="date" />
              </div>
              <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="(416) 555-0142" type="tel" />
            </FormSection>

            <FormSection num="04" title="Employment" required>
              <Field label="Job title" value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Software engineer" />
              <Field label="Employer" value={form.employer} onChange={v => update('employer', v)} placeholder="Shopify" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                <Field label="Years at this job" value={form.yearsAtJob} onChange={v => update('yearsAtJob', v)} placeholder="3" />
                <Field label="Annual income (CAD)" value={form.annualIncome} onChange={v => update('annualIncome', v)} placeholder="85,000" type="number" />
              </div>
            </FormSection>

            <FormSection num="05" title="Current rental">
              <Field label="Current address" value={form.previousAddress} onChange={v => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                <Field label="Years there" value={form.yearsAtPrevious} onChange={v => update('yearsAtPrevious', v)} placeholder="2" />
                <Field label="Current rent (CAD/mo)" value={form.currentRent} onChange={v => update('currentRent', v)} placeholder="2,200" type="number" />
              </div>
              <Field label="Current landlord name" value={form.previousLandlordName} onChange={v => update('previousLandlordName', v)} placeholder="John Smith" />
              <Field label="Landlord contact" value={form.previousLandlordContact} onChange={v => update('previousLandlordContact', v)} placeholder="phone or email" />
            </FormSection>

            <FormSection num="06" title="Your move" required>
              <Field label="Desired move-in date" value={form.moveInDate} onChange={v => update('moveInDate', v)} type="date" />
              <Textarea label="Why are you moving?" value={form.reasonForMoving} onChange={v => update('reasonForMoving', v)} placeholder="New job, shorter commute, lease ending..." />
            </FormSection>

            <FormSection num="07" title="Household">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                <Field label="Total occupants" value={form.numberOfOccupants} onChange={v => update('numberOfOccupants', v)} placeholder="2" type="number" />
                <SelectField
                  label="Smoker?"
                  value={form.smoker}
                  onChange={v => update('smoker', v)}
                  options={[
                    { value: 'no', label: 'Non-smoker' },
                    { value: 'outdoor', label: 'Outdoor only' },
                    { value: 'yes', label: 'Yes' },
                  ]}
                />
              </div>
              <Textarea label="Other occupants (optional)" value={form.occupantsDetails} onChange={v => update('occupantsDetails', v)} placeholder="One roommate (also on this application), no children." />

              {/* Co-applicant toggle */}
              <ToggleField
                label="Applying with a partner or roommate?"
                value={form.hasCoApplicant}
                onChange={v => update('hasCoApplicant', v)}
              />
              {form.hasCoApplicant && (
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                    Co-applicant
                  </div>
                  <Field label="Full name" value={form.coApplicantName} onChange={v => update('coApplicantName', v)} placeholder="Alex Smith" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                    <Field label="Age" value={form.coApplicantAge} onChange={v => update('coApplicantAge', v)} placeholder="30" type="number" />
                    <Field label="Relationship" value={form.coApplicantRelationship} onChange={v => update('coApplicantRelationship', v)} placeholder="Partner / Roommate" />
                  </div>
                  <Field label="Job title" value={form.coApplicantJobTitle} onChange={v => update('coApplicantJobTitle', v)} placeholder="Designer" />
                  <Field label="Employer" value={form.coApplicantEmployer} onChange={v => update('coApplicantEmployer', v)} placeholder="Figma" />
                  <Field label="Annual income (CAD)" value={form.coApplicantIncome} onChange={v => update('coApplicantIncome', v)} placeholder="75,000" type="number" />
                </div>
              )}
            </FormSection>

            <FormSection num="08" title="Lifestyle">
              <Textarea label="Lifestyle and habits" value={form.personality} onChange={v => update('personality', v)} placeholder="Quiet, work from home most days, like to cook and read." />
              <Field label="Pets" value={form.pets} onChange={v => update('pets', v)} placeholder="One small cat, indoor only, vet records available" />
              <Textarea label="Anything to address? (gaps in history, credit, etc.)" value={form.redFlags} onChange={v => update('redFlags', v)} placeholder="Limited Canadian credit history due to recent move..." />
            </FormSection>

            <FormSection num="09" title="References (optional but recommended)">
              <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 18, lineHeight: 1.55 }}>
                Two people who can vouch for you. Mentioning these by name on your application is more persuasive than saying "references available."
              </p>
              <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Reference 1
                </div>
                <Field label="Full name" value={form.reference1Name} onChange={v => update('reference1Name', v)} placeholder="Sarah Johnson" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Relationship" value={form.reference1Relationship} onChange={v => update('reference1Relationship', v)} placeholder="Current manager" />
                  <Field label="Phone or email" value={form.reference1Contact} onChange={v => update('reference1Contact', v)} placeholder="416-555-0142" />
                </div>
              </div>
              <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}` }}>
                <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Reference 2
                </div>
                <Field label="Full name" value={form.reference2Name} onChange={v => update('reference2Name', v)} placeholder="David Chen" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Relationship" value={form.reference2Relationship} onChange={v => update('reference2Relationship', v)} placeholder="Friend of 5 years" />
                  <Field label="Phone or email" value={form.reference2Contact} onChange={v => update('reference2Contact', v)} placeholder="dchen@email.com" />
                </div>
              </div>
            </FormSection>

            <FormSection num="10" title="Vehicle (if parking matters)">
              <ToggleField
                label="Do you have a vehicle?"
                value={form.hasVehicle}
                onChange={v => update('hasVehicle', v)}
              />
              {form.hasVehicle && (
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4 }}>
                  <Field label="Make and model" value={form.vehicleMakeModel} onChange={v => update('vehicleMakeModel', v)} placeholder="Honda Civic" />
                  <Field label="Year" value={form.vehicleYear} onChange={v => update('vehicleYear', v)} placeholder="2020" type="number" />
                </div>
              )}
            </FormSection>

            {/* Pass status banner (only when active pass) */}
            {passInfo && (
              <div style={{ marginTop: 48, background: C.ink, color: C.paper, borderRadius: R.card, padding: '24px 28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                      ◯ 30-day search pass active
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.01em' }}>
                      Generate a tailored application
                    </div>
                    <div style={{ fontSize: 13, color: '#a4adbb', lineHeight: 1.55 }}>
                      {passInfo.daysRemaining} day{passInfo.daysRemaining === 1 ? '' : 's'} remaining · {passInfo.lettersGenerated} application{passInfo.lettersGenerated === 1 ? '' : 's'} generated · {passInfo.email}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!isFormValid()) {
                        setError('Please complete required fields first.');
                        return;
                      }
                      localStorage.setItem('rentletter_form', JSON.stringify(form));
                      setStep('generating');
                      generateLetter(form, { passToken });
                    }}
                    disabled={!isFormValid()}
                    className="rl-btn"
                    style={{
                      background: isFormValid() ? C.red : '#5a3a3c',
                      color: C.paper, border: 'none', borderRadius: R.ctrl,
                      padding: '16px 28px', fontSize: 15, fontWeight: 700,
                      cursor: isFormValid() ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isFormValid() ? 'Generate letter →' : 'Fill required fields'}
                  </button>
                </div>
              </div>
            )}

            {/* Generate button — free for all tenants */}
            {!passInfo && (
              <div className="rl-card" style={{ marginTop: 48, padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 16, borderBottom: `1px solid ${C.rule}` }}>
                  <span style={{ fontSize: 15, color: C.inkSoft }}>Your professional rental application</span>
                  <span style={{ fontSize: 13, color: C.green, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Free</span>
                </div>
                <div style={{ marginTop: 16, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
                  Submit your application and get a unique Rentletter number to share with realtors and landlords. No payment required.
                </div>
                <button
                  onClick={handlePay}
                  disabled={!isFormValid()}
                  className="rl-btn"
                  style={{
                    width: '100%', marginTop: 24,
                    background: isFormValid() ? C.ink : '#c8c2b3',
                    color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '18px',
                    fontSize: 15, fontWeight: 600,
                    cursor: isFormValid() ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isFormValid()
                    ? 'Generate my application →'
                    : 'Complete required fields'}
                </button>
                <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, textAlign: 'center' }}>
                  Not legal advice
                </p>
              </div>
            )}
          </div>
        </div>
      <ChatWidget />
      </>
    );
  }


  // ════════════════════════════════════════════════════════════
  // PASS ACTIVATING — after Stripe redirect for 30-day pass
  // ════════════════════════════════════════════════════════════
  if (step === 'activating') {
    return (
      <>
        <Head><title>Activating your pass — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div style={{ display: 'inline-flex', gap: 6, marginBottom: 36 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.red, animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.red, animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.red, animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </div>
            <h2 className="rl-serif" style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.05, color: C.ink, letterSpacing: '-0.025em', marginBottom: 16 }}>
              Activating your pass
            </h2>
            <p style={{ color: C.inkSoft, fontSize: 15, lineHeight: 1.55 }}>
              Payment confirmed. Setting up your 30-day search pass. Don't close this tab.
            </p>
          </div>
          <style jsx>{`
            @keyframes pulse {
              0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      <ChatWidget />
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  // PASS SUCCESS — confirmation after pass activated
  // ════════════════════════════════════════════════════════════
  if (step === 'passSuccess') {
    return (
      <>
        <Head><title>Your pass is ready — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <Wordmark />
            </div>
          </header>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 32px 80px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 24, height: 1, background: C.red }} />
              <span style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Payment confirmed · 30-day search pass active
              </span>
            </div>

            <h1 style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 800, color: C.ink, marginBottom: 24, letterSpacing: '-0.03em', lineHeight: 1.0 }}>
              Your search pass<br />
              <span style={{ color: C.red }}>is ready.</span>
            </h1>

            <p style={{ fontSize: 17, color: C.inkSoft, marginBottom: 40, lineHeight: 1.55, maxWidth: 540 }}>
              Tailor a new application for every apartment you're considering. Update your profile any time your situation changes — new job, new income, found a co-applicant. Your access link has been emailed to you so you can use it from any device.
            </p>

            {/* Pass detail card */}
            <div style={{ background: C.ink, color: C.paper, borderRadius: R.card, padding: '28px 32px', marginBottom: 32, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
              <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                Your pass details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#a4adbb', marginBottom: 4 }}>Token</div>
                  <div style={{ fontSize: 16, fontFamily: 'monospace', letterSpacing: '0.04em', fontWeight: 700 }}>{passToken}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#a4adbb', marginBottom: 4 }}>Days remaining</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{passInfo?.daysRemaining || 30}</div>
                </div>
                {passInfo?.email && (
                  <div>
                    <div style={{ fontSize: 11, color: '#a4adbb', marginBottom: 4 }}>Emailed to</div>
                    <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{passInfo.email}</div>
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: '#3a3a3c', marginBottom: 20 }} />
              <div style={{ fontSize: 11, color: '#a4adbb', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                Your access link
              </div>
              <div style={{
                fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all',
                background: '#0a0a0b', borderRadius: R.ctrl, padding: '12px 14px',
                color: '#a4adbb', marginBottom: 16,
              }}>
                https://rentletter.ca/?pass={passToken}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://rentletter.ca/?pass=${passToken}`);
                  alert('Access link copied');
                }}
                className="rl-btn"
                style={{
                  background: C.paper, color: C.ink, border: 'none', borderRadius: R.ctrl,
                  padding: '11px 18px', fontSize: 13, fontWeight: 600,
                }}>
                Copy access link
              </button>
            </div>

            {/* CTA to start first letter */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setStep('form')}
                style={{
                  background: C.red, color: C.paper, border: 'none',
                  padding: '18px 32px', fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
                onMouseOver={e => e.currentTarget.style.background = C.redDark}
                onMouseOut={e => e.currentTarget.style.background = C.red}>
                Write your first letter <span style={{ fontSize: 18 }}>→</span>
              </button>
              <span style={{ fontSize: 12, color: C.inkMute }}>
                Or save this page and come back later
              </span>
            </div>

            <div style={{ marginTop: 56, padding: '20px 22px', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                A few things to know
              </div>
              <ul style={{ listStyle: 'none', fontSize: 13, color: C.inkSoft, lineHeight: 1.7 }}>
                <li>— The access link works from any device. Bookmark it or save the email.</li>
                <li>— Each application gets a fresh number — landlords can verify the latest version.</li>
                <li>— Update your profile anytime: new job, raise, found a roommate. The Scorecard recalculates.</li>
                <li>— Pass expires automatically in 30 days. No auto-renewal, no surprise charges.</li>
                <li>— Need help? Reply to the activation email or write to info@rentletter.ca</li>
              </ul>
            </div>
          </div>
        </div>
      <ChatWidget />
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  // GENERATING
  // ════════════════════════════════════════════════════════════
  if (step === 'generating') {
    return (
      <>
        <Head><title>Writing — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{ display: 'inline-flex', gap: 6, marginBottom: 36 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.ink, animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.ink, animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.red, animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </div>
            <h2 className="rl-serif" style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.05, color: C.ink, letterSpacing: '-0.025em', marginBottom: 16 }}>
              Writing your letter
            </h2>
            <p style={{ color: C.inkSoft, fontSize: 15, lineHeight: 1.55 }}>
              About 20 seconds. Don't refresh.
            </p>
          </div>
          <style jsx>{`
            @keyframes pulse {
              0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      <ChatWidget />
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RESULT
  // ════════════════════════════════════════════════════════════
  if (step === 'result') {
    return (
      <>
        <Head><title>Your letter — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Wordmark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {passInfo && (
                <button
                  onClick={() => {
                    // Keep pass, but clear the current letter and go to a fresh form
                    localStorage.removeItem('rentletter_letter');
                    localStorage.removeItem('rentletter_resume');
                    localStorage.removeItem('rentletter_form');
                    localStorage.removeItem('rentletter_app_number');
                    setLetter(''); setResume(''); setApplicationNumber('');
                    setForm(EMPTY_FORM);
                    setStep('form');
                  }}
                  className="rl-btn"
                  style={{
                    background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl,
                    padding: '9px 16px', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <Icon name="plus" size={14} /> New letter
                </button>
              )}
              <button onClick={startOver} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
                {passInfo ? 'Clear this letter' : 'Start fresh'}
              </button>
            </div>
          </header>

          <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px) 64px' }}>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(32px, 5.5vw, 48px)', color: C.ink, marginBottom: 12, letterSpacing: '-0.025em', lineHeight: 1.04, textWrap: 'balance' }}>
              {letter
                ? <>Your letter is <span style={{ color: C.red }}>ready.</span></>
                : <>Your application is <span style={{ color: C.red, whiteSpace: 'nowrap' }}>submitted.</span></>}
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 32, lineHeight: 1.55 }}>
              {letter
                ? 'Read it over. Edit anything — changes save automatically.'
                : 'Below is your application number and tenant resume. Share these with your realtor or landlord.'}
            </p>

            {/* Application Number Card — the trust signal for landlords */}
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
                      Share this number with your landlord or realtor. They can verify your application and compare you against other tenants — for free — at <span style={{ color: C.paper, fontWeight: 600 }}>rentletter.ca/landlord</span>
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
                      background: C.paper, color: C.ink, border: 'none', borderRadius: R.ctrl,
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
                background: emailSent ? C.greenTint : C.amberTint,
                border: `1px solid ${emailSent ? '#c8d8cc' : '#e0d5a8'}`,
                borderRadius: R.ctrl,
                padding: '14px 18px', marginBottom: 24, fontSize: 14,
                color: emailSent ? '#2d5a3f' : '#665a1f',
              }}>
                {emailSending ? `Delivering to ${form.email}...` : emailSent ? `Sent to ${form.email}` : `Will email to ${form.email}`}
              </div>
            )}

            {/* Download bar */}
            <div style={{ background: C.ink, color: C.paper, borderRadius: R.card, padding: '18px 24px', marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: C.inkInverse, flex: 1, minWidth: 140 }}>
                Download
              </span>
              <button onClick={() => downloadFile('pdf')} className="rl-btn"
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '11px 22px', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="doc" size={15} /> PDF
              </button>
              <button onClick={() => downloadFile('docx')} className="rl-btn"
                style={{ background: C.paper, color: C.ink, border: 'none', borderRadius: R.ctrl, padding: '11px 22px', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="doc" size={15} /> Word
              </button>
              {form.email && !emailSent && (
                <button onClick={() => sendEmail(form.email, form.fullName, letter, resume, applicationNumber)} disabled={emailSending} className="rl-btn"
                  style={{ background: 'transparent', color: C.paper, border: `1px solid #3a3a3c`, borderRadius: R.ctrl, padding: '11px 22px', fontSize: 14, fontWeight: 500 }}>
                  {emailSending ? 'Sending...' : 'Resend email'}
                </button>
              )}
            </div>

            {/* Cover Letter — only render if we have one (user paid or used demo) */}
            {letter && (
              <div className="rl-card" style={{ marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.rule}` }}>
                  <h2 className="rl-serif" style={{ fontSize: 22, color: C.ink, letterSpacing: '-0.01em' }}>Cover letter</h2>
                  <button onClick={() => copyText(letter, setCopiedLetter)} className="rl-btn"
                    style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 16px', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={copiedLetter ? 'check' : 'copy'} size={14} strokeWidth={copiedLetter ? 2.5 : 1.5} /> {copiedLetter ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea value={letter} onChange={e => updateLetter(e.target.value)}
                  style={{
                    width: '100%', minHeight: 460, padding: 24,
                    fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.7,
                    color: C.ink, background: C.card,
                    border: 'none', outline: 'none', resize: 'vertical',
                  }} />
              </div>
            )}

            {/* Resume */}
            <div className="rl-card" style={{ marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.rule}` }}>
                <h2 className="rl-serif" style={{ fontSize: 22, color: C.ink, letterSpacing: '-0.01em' }}>Tenant resume</h2>
                <button onClick={() => copyText(resume, setCopiedResume)} className="rl-btn"
                  style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 16px', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={copiedResume ? 'check' : 'copy'} size={14} strokeWidth={copiedResume ? 2.5 : 1.5} /> {copiedResume ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea value={resume} onChange={e => updateResume(e.target.value)}
                style={{
                  width: '100%', minHeight: 320, padding: 24,
                  fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.7,
                  color: C.ink, background: C.card,
                  border: 'none', outline: 'none', resize: 'vertical',
                }} />
            </div>

            <button onClick={startOver} className="rl-btn"
              style={{ marginTop: 8, background: 'transparent', border: `1px solid ${C.ink}`, color: C.ink, borderRadius: R.ctrl, padding: '14px 28px', fontSize: 14, fontWeight: 500 }}>
              Start a new letter
            </button>
          </div>
        </div>
      <ChatWidget />
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

// ─── FORM COMPONENTS ──────────────────────────────────────────
function FormSection({ num, title, required, children }) {
  return (
    <div style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>{num}</span>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h3>
        {required && <span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}>Required</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', padding: '14px 0', fontSize: 16,
          border: 'none', borderBottom: `1px solid ${C.rule}`,
          background: 'transparent', color: C.ink,
          outline: 'none', transition: 'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderBottomColor = C.ink}
        onBlur={e => e.target.style.borderBottomColor = C.rule} />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{
          width: '100%', padding: '14px 0', fontSize: 16,
          border: 'none', borderBottom: `1px solid ${C.rule}`,
          background: 'transparent', color: C.ink,
          outline: 'none', resize: 'vertical', fontFamily: "'Inter', sans-serif",
          lineHeight: 1.5, transition: 'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderBottomColor = C.ink}
        onBlur={e => e.target.style.borderBottomColor = C.rule} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '14px 0', fontSize: 16,
          border: 'none', borderBottom: `1px solid ${C.rule}`,
          background: 'transparent', color: C.ink,
          outline: 'none', appearance: 'none',
          fontFamily: "'Inter', sans-serif",
          cursor: 'pointer',
        }}
        onFocus={e => e.target.style.borderBottomColor = C.ink}
        onBlur={e => e.target.style.borderBottomColor = C.rule}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24,
          background: value ? C.red : C.rule,
          border: 'none',
          borderRadius: 12,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.2s',
          padding: 0,
        }}>
        <span style={{
          position: 'absolute',
          top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: C.paper,
          transition: 'left 0.2s',
        }} />
      </button>
      <span style={{ fontSize: 14, color: C.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => onChange(!value)}>
        {label}
      </span>
    </div>
  );
}
