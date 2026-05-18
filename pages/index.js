import { useState, useEffect } from 'react';
import Head from 'next/head';

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

// ─── DESIGN TOKENS ────────────────────────────────────────────
const C = {
  paper: '#faf8f3',       // eggshell
  paperDeep: '#f2eee3',
  ink: '#0f0f10',         // near-black
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',         // Time magazine red — used sparingly
  redDark: '#a8161c',     // Hover / depth variant of red
};

const GlobalStyle = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${C.paper}; color: ${C.ink};
      font-family: 'Inter', -apple-system, sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    button, input, textarea, select { font-family: 'Inter', sans-serif; }
    button { cursor: pointer; }
    input:focus, textarea:focus { outline: none; }
    ::selection { background: ${C.red}; color: ${C.paper}; }
  `}</style>
);

// ─── BRAND WORDMARK — Time-magazine red bar + bold sans ──────
const Wordmark = ({ size = 'sm' }) => {
  const isLg = size === 'lg';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: isLg ? 10 : 7 }}>
      <div style={{ width: isLg ? 5 : 3, height: isLg ? 30 : 20, background: C.red }} />
      <span style={{ fontSize: isLg ? 24 : 17, color: C.ink, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
        Rentletter
      </span>
    </div>
  );
};

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

  // ── Pass state (30-day unlimited access) ──
  const [passToken, setPassToken] = useState('');
  const [passInfo, setPassInfo] = useState(null); // { email, daysRemaining, lettersGenerated, expiresAt }
  const [passVerifying, setPassVerifying] = useState(false);
  const [passActivating, setPassActivating] = useState(false);

  // ── Email verification state ──
  const [verifyCodeSent, setVerifyCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPaid = params.get('paid') === 'true';
    const sessionId = params.get('session_id');
    const urlPass = params.get('pass');
    const paidTier = params.get('tier'); // 'unlimited' set by us before Stripe redirect

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

    // ─── ENTRY 3: User just paid for a single letter — generate it ───
    if (isPaid && sessionId) {
      const savedForm = localStorage.getItem('rentletter_form');
      const vToken = localStorage.getItem('rentletter_verification_token');
      if (savedForm) {
        const data = JSON.parse(savedForm);
        setForm(data);
        setStep('generating');
        generateLetter(data, { stripeSessionId: sessionId, verificationToken: vToken });
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
      setError(`Pass activation failed: ${e.message}. Please contact us at hello@rentletter.ca with your payment confirmation.`);
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

  const handlePay = async () => {
    // First: require email verification (skip if we already have a fresh token from this session)
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('rentletter_verification_token') : null;
    const storedEmail = typeof window !== 'undefined' ? localStorage.getItem('rentletter_verified_email') : null;

    if (!storedToken || storedEmail !== form.email.trim().toLowerCase()) {
      // Need to verify email first
      if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        setError('Please enter a valid email at the top of the form.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // Send code and move to verify step
      setStep('verifyEmail');
      setVerifyError('');
      setVerifyCode('');
      setVerifyLoading(true);
      try {
        const res = await fetch('/api/verify/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim() }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setVerifyCodeSent(true);
      } catch (e) {
        setVerifyError(e.message);
        setVerifyCodeSent(false);
      }
      setVerifyLoading(false);
      return;
    }

    // Email already verified — go to Stripe
    setVerificationToken(storedToken);
    localStorage.setItem('rentletter_form', JSON.stringify(form));
    localStorage.setItem('rentletter_pending_tier', tier);
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    window.location.href = tier === 'single' ? STRIPE_SINGLE : STRIPE_UNLIMITED;
  };

  // Verify the 6-digit code the tenant entered
  const submitVerificationCode = async () => {
    setVerifyError('');
    if (!/^\d{6}$/.test(verifyCode.trim())) {
      setVerifyError('Code must be 6 digits.');
      return;
    }
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/verify/check-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), code: verifyCode.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // Store the verified email + token
      setVerificationToken(json.verificationToken);
      localStorage.setItem('rentletter_verification_token', json.verificationToken);
      localStorage.setItem('rentletter_verified_email', json.verifiedEmail);
      // Continue to Stripe
      localStorage.setItem('rentletter_form', JSON.stringify(form));
      localStorage.setItem('rentletter_pending_tier', tier);
      localStorage.removeItem('rentletter_letter');
      localStorage.removeItem('rentletter_resume');
      window.location.href = tier === 'single' ? STRIPE_SINGLE : STRIPE_UNLIMITED;
    } catch (e) {
      setVerifyError(e.message);
    }
    setVerifyLoading(false);
  };

  // Resend the verification code
  const resendVerificationCode = async () => {
    setVerifyError('');
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/verify/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setVerifyCodeSent(true);
      setVerifyCode('');
    } catch (e) {
      setVerifyError(e.message);
    }
    setVerifyLoading(false);
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
    await generateLetter(demo, { stripeSessionId: 'DEMO_MODE_BYPASS' });
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
      }
      if (json.ownerToken) {
        localStorage.setItem('rentletter_owner_token', json.ownerToken);
      }
      localStorage.setItem('rentletter_letter', json.letter);
      localStorage.setItem('rentletter_resume', json.resume);
      window.history.replaceState({}, '', window.location.pathname);
      setStep('result');
      if (data.email) sendEmail(data.email, data.fullName, json.letter, json.resume, json.applicationNumber, json.ownerToken);
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
          <title>Rentletter — A better rental application.</title>
          <meta name="description" content="Personalized cover letter and tenant resume for renters. Drafted in two minutes." />
        </Head>
        <GlobalStyle />

        <div style={{ minHeight: '100vh', background: C.paper }}>

          {/* ── RED TICKER BAR — editorial market-ticker style ── */}
          <div style={{
            background: C.red, color: C.paper,
            overflow: 'hidden', whiteSpace: 'nowrap',
            borderBottom: `1px solid ${C.redDark || '#a8161c'}`,
            position: 'relative',
          }}>
            <div style={{
              display: 'inline-block',
              padding: '10px 0',
              animation: 'ticker 50s linear infinite',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              fontFamily: 'monospace',
            }}>
              {Array(4).fill(null).map((_, i) => (
                <span key={i}>
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;LIVE · TORONTO RENTAL MARKET
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;AVG 2BR&nbsp;&nbsp;<strong>$2,720</strong>
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;VACANCY RATE&nbsp;&nbsp;<strong>3.7%</strong>
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;APPLICATIONS PER UNIT&nbsp;&nbsp;<strong>50+</strong>
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;JULY 1 LEASE TURNOVER APPROACHING
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;1 IN 4 RENTERS REJECTED FIRST APPLICATION
                  &nbsp;&nbsp;&nbsp;◆&nbsp;&nbsp;&nbsp;
                </span>
              ))}
            </div>
            <style jsx>{`
              @keyframes ticker {
                0% { transform: translateX(0); }
                100% { transform: translateX(-25%); }
              }
            `}</style>
          </div>

          {/* ── LAUNCH PROMO BANNER (auto-disappears July 1) ── */}
          {isPromoActive() && (
            <div style={{
              background: C.ink, color: C.paper,
              padding: '14px 32px',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: 16, flexWrap: 'wrap',
              borderBottom: `1px solid #1a1a1c`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: C.red, color: C.paper,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', padding: '4px 10px',
                }}>
                  Launch week
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  <span style={{ textDecoration: 'line-through', color: C.inkMute, marginRight: 6 }}>${REGULAR_PRICE}</span>
                  <span style={{ fontWeight: 800 }}>${PROMO_PRICE}</span> single applications until <span style={{ fontWeight: 700, color: C.red }}>June 30</span>
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#a4adbb' }}>
                No promo code · Returns to ${REGULAR_PRICE} July 1
              </span>
            </div>
          )}

          {/* ── HEADER ──────────────────────────────────────── */}
          <header style={{ borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Wordmark />
              <button
                onClick={() => setStep('form')}
                style={{
                  background: 'transparent', color: C.ink, border: 'none',
                  fontSize: 14, fontWeight: 500,
                }}
              >
                Start →
              </button>
            </div>
          </header>

          {/* ── HERO — tight, magazine-cover composition ─────── */}
          <section style={{ padding: '60px 32px 80px', maxWidth: 1100, margin: '0 auto' }}>

            {/* Tiny eyebrow tag — adds context + signals seriousness */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <div style={{ width: 24, height: 1, background: C.ink }} />
              <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                For Toronto renters · 2026
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(48px, 9vw, 132px)',
              lineHeight: 0.95,
              letterSpacing: '-0.035em',
              color: C.ink,
              fontWeight: 800,
              marginBottom: 28,
              maxWidth: 1000,
            }}>
              A letter that<br />
              gets you the<br />
              <span style={{ color: C.red }}>apartment.</span>
            </h1>

            {/* Subhead — tight to headline, indented to feel intentional */}
            <p style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: C.inkSoft,
              maxWidth: 460,
              marginBottom: 32,
              fontWeight: 400,
            }}>
              A personalized cover letter and tenant resume in two minutes — built for the apartments worth fighting for.
            </p>

            {/* CTA group — buttons + price + trust micro-copy as one unit */}
            <div style={{ marginBottom: 56 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                <button
                  onClick={() => setStep('form')}
                  style={{
                    background: C.ink, color: C.paper, border: 'none',
                    padding: '18px 32px', fontSize: 15, fontWeight: 600,
                    transition: 'opacity 0.2s',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseOut={e => e.currentTarget.style.opacity = '1'}
                >
                  Start your letter
                  <span>→</span>
                </button>
                <span style={{ fontSize: 14, color: C.inkMute }}>
                  {isPromoActive() ? (
                    <>
                      <span style={{ textDecoration: 'line-through', color: C.inkMute, marginRight: 6 }}>${REGULAR_PRICE}</span>
                      <span style={{ color: C.red, fontWeight: 700 }}>${PROMO_PRICE}</span> · Launch promo
                    </>
                  ) : (
                    <>From <span style={{ color: C.ink, fontWeight: 600 }}>${REGULAR_PRICE}</span> · One-time</>
                  )}
                </span>
              </div>
              <p style={{ fontSize: 12, color: C.inkMute, letterSpacing: '0.02em' }}>
                ✓ Sent to your email · ✓ PDF and Word formats · ✓ Edit before downloading
              </p>
            </div>

            {/* Inline stats — feels like a magazine pull-quote, not a separate section */}
            <div style={{
              borderTop: `1px solid ${C.rule}`,
              paddingTop: 32,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 28,
            }}>
              {[
                { n: '50+', l: 'applications per unit' },
                { n: '1 in 4', l: 'renters get rejected' },
                { n: '10s', l: 'to make an impression' },
                { n: '2 min', l: 'to write yours' },
              ].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1 }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: C.inkMute, letterSpacing: '0.02em' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── RED PULL-QUOTE INTERRUPTION — magazine spread style ── */}
          <section style={{ background: C.red, color: C.paper, position: 'relative', overflow: 'hidden' }}>
            {/* Decorative oversized quote mark in corner */}
            <div style={{
              position: 'absolute',
              top: -40, right: 32,
              fontSize: 320, lineHeight: 1, fontWeight: 900,
              color: C.redDark, opacity: 0.4,
              fontFamily: 'Georgia, serif',
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              "
            </div>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 24, height: 1, background: C.paper }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
                  Why it works
                </span>
              </div>
              <blockquote style={{
                fontSize: 'clamp(28px, 4.5vw, 56px)',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                fontWeight: 700,
                color: C.paper,
                maxWidth: 920,
                margin: 0,
              }}>
                Landlords don't read 50 applications.<br />
                They <em style={{ fontStyle: 'italic' }}>skim</em> them — and pick the one that made the decision easiest.
              </blockquote>
              <div style={{ marginTop: 32, fontSize: 13, color: C.paper, opacity: 0.7, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>
                — The Rentletter principle
              </div>
            </div>
          </section>

          {/* ── HOW IT WORKS — three short steps ────────────── */}
          <section style={{ padding: '100px 32px', maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 48 }}>
              How it works
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 60 }}>
              {[
                { n: '01', t: 'Tell us about you', d: 'A few questions about your job, income, and rental history.' },
                { n: '02', t: 'We draft the letter', d: 'A cover letter and tenant resume tailored to what landlords look for.' },
                { n: '03', t: 'Send and win', d: 'Edit if you want. Download as PDF or Word. We also email it.' },
              ].map(s => (
                <div key={s.n}>
                  <div style={{ fontSize: 13, color: C.inkMute, marginBottom: 16, fontWeight: 500 }}>{s.n}</div>
                  <h3 style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 10, letterSpacing: '-0.01em' }}>{s.t}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.55, color: C.inkSoft }}>{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── PRICING ─────────────────────────────────────── */}
          <section style={{ padding: '20px 32px 100px', maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 16 }}>
              Pricing
            </h2>
            <p style={{ fontSize: 15, color: C.inkSoft, marginBottom: 40, maxWidth: 560, lineHeight: 1.55 }}>
              Pick what fits your search. Both come with the full Rentletter application — Scorecard, Tiebreakers, landlord dashboard access, the works.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              {/* Single — for tenants who've already found their apartment */}
              <div style={{ background: C.paper, border: `1px solid ${C.rule}`, padding: '32px 28px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {isPromoActive() && (
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: C.paper,
                    background: C.red, padding: '4px 10px',
                  }}>
                    Launch promo
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 600, color: C.inkSoft, marginBottom: 6 }}>Single application</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 18 }}>
                  Best if you've found your apartment
                </div>
                <div style={{ marginBottom: isPromoActive() ? 8 : 24, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  {isPromoActive() ? (
                    <>
                      <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.red, letterSpacing: '-0.03em' }}>${PROMO_PRICE}</span>
                      <span style={{ fontSize: 22, fontWeight: 600, color: C.inkMute, textDecoration: 'line-through', letterSpacing: '-0.02em' }}>${REGULAR_PRICE}</span>
                      <span style={{ fontSize: 13, color: C.inkMute, marginLeft: 2 }}>CAD</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.ink, letterSpacing: '-0.03em' }}>${REGULAR_PRICE}</span>
                      <span style={{ fontSize: 14, color: C.inkMute, marginLeft: 6 }}>CAD · one-time</span>
                    </>
                  )}
                </div>
                {isPromoActive() && (
                  <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 20, letterSpacing: '0.02em' }}>
                    Until June 30 · Returns to ${REGULAR_PRICE} July 1
                  </div>
                )}
                <div style={{ height: 1, background: C.rule, marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 24 }}>
                  {[
                    'One full Rentletter application',
                    'Cover letter tailored to one apartment',
                    'Tenant resume with Scorecard',
                    'Landlord dashboard access via app number',
                    'PDF and Word, emailed to you',
                  ].map(f => (
                    <li key={f} style={{ padding: '10px 0', fontSize: 14, color: C.inkSoft, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ color: C.ink, fontSize: 11 }}>—</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('single'); setStep('form'); }}
                  style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '14px', fontSize: 14, fontWeight: 500, transition: 'all 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.paper; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink; }}>
                  Choose single
                </button>
              </div>

              {/* 30-day Search Pass — for active hunters */}
              <div style={{ background: C.red, color: C.paper, padding: '32px 28px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: C.paper,
                  border: `1px solid ${C.paper}`, padding: '4px 10px',
                  opacity: 0.95,
                }}>
                  Recommended
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.paper, marginBottom: 6, opacity: 0.95 }}>30-day search pass</div>
                <div style={{ fontSize: 12, color: C.paper, marginBottom: 18, opacity: 0.8 }}>
                  Best for active apartment hunters
                </div>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.paper, letterSpacing: '-0.03em' }}>$19.99</span>
                  <span style={{ fontSize: 14, color: C.paper, opacity: 0.7, marginLeft: 6 }}>CAD · no auto-renewal</span>
                </div>
                <div style={{ height: 1, background: C.paper, opacity: 0.3, marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 24 }}>
                  {[
                    'Everything in Single, plus:',
                    'Re-tailor cover letter for every apartment',
                    'Update your profile anytime (new job, raise, co-applicant)',
                    'Fresh application number each update',
                    'Apply to as many places as you want',
                    'Use from any device for 30 days',
                  ].map((f, idx) => (
                    <li key={f} style={{
                      padding: '10px 0', fontSize: 14, color: C.paper,
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      fontWeight: idx === 0 ? 700 : 400,
                      borderBottom: idx === 0 ? `1px solid rgba(255,255,255,0.2)` : 'none',
                      marginBottom: idx === 0 ? 4 : 0,
                      paddingBottom: idx === 0 ? 14 : 10,
                    }}>
                      {idx > 0 && <span style={{ color: C.paper, fontSize: 11, opacity: 0.7 }}>+</span>} {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('unlimited'); setStep('form'); }}
                  style={{ background: C.paper, color: C.red, border: 'none', padding: '14px', fontSize: 14, fontWeight: 700, transition: 'all 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.paper; }}
                  onMouseOut={e => { e.currentTarget.style.background = C.paper; e.currentTarget.style.color = C.red; }}>
                  Choose pass →
                </button>
              </div>
            </div>

            {/* Honest framing footnote */}
            <p style={{ marginTop: 24, fontSize: 12, color: C.inkMute, maxWidth: 560, lineHeight: 1.55 }}>
              Most renters apply to 5–15 apartments over a 2–4 week search. If that's you, the pass pays for itself by the third application.
            </p>
          </section>

          {/* ── FINAL CTA BANNER — red full-bleed last-chance ── */}
          <section style={{ background: C.ink, color: C.paper, position: 'relative', overflow: 'hidden' }} className="final-cta">
            {/* Diagonal red slash accent — shrinks on mobile so it doesn't crash headline */}
            <div className="cta-slash" style={{
              position: 'absolute', top: 0, right: 0,
              width: 240, height: '100%',
              background: `linear-gradient(105deg, transparent 0%, transparent 50%, ${C.red} 50%, ${C.red} 100%)`,
              pointerEvents: 'none',
            }} />
            <div className="cta-inner" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 32px', position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 24, height: 1, background: C.red }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.red }}>
                    Two minutes from now
                  </span>
                </div>
                <h2 className="cta-headline" style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', color: C.paper, marginBottom: 16 }}>
                  Your application<br />
                  could be the one<br />
                  they <span style={{ color: C.red }}>remember.</span>
                </h2>
                <p style={{ fontSize: 16, color: '#a4adbb', lineHeight: 1.55, maxWidth: 480 }}>
                  Stop waiting for the "we went with someone else" email. Build the application landlords actually want to read.
                </p>
              </div>
              <button onClick={() => setStep('form')}
                style={{
                  background: C.red, color: C.paper, border: 'none',
                  padding: '22px 40px', fontSize: 16, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 12,
                  position: 'relative', zIndex: 2,
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.background = C.redDark}
                onMouseOut={e => e.currentTarget.style.background = C.red}>
                Start your letter <span style={{ fontSize: 20 }}>→</span>
              </button>
            </div>
            <style jsx>{`
              @media (max-width: 720px) {
                :global(.cta-slash) {
                  width: 80px !important;
                }
                :global(.cta-headline) {
                  font-size: 32px !important;
                  line-height: 1.1 !important;
                }
              }
              @media (max-width: 480px) {
                :global(.cta-slash) {
                  width: 56px !important;
                }
                :global(.cta-headline) {
                  font-size: 28px !important;
                }
              }
            `}</style>
          </section>

          {/* ── FOOTER ──────────────────────────────────────── */}
          <footer style={{ borderTop: `1px solid ${C.rule}`, padding: '32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <Wordmark />
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontSize: 13, color: C.inkMute, flexWrap: 'wrap' }}>
                <a href="/landlord" style={{ color: C.inkSoft, textDecoration: 'none', fontWeight: 500 }}>
                  For landlords →
                </a>
                <span>Toronto · Not legal advice</span>
              </div>
            </div>
          </footer>
        </div>
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

            {/* ── DEV TEST BAR (will be removed before public launch) ── */}
            <div style={{
              marginBottom: 32, padding: '14px 18px',
              background: '#fff8e1', border: `1px solid #f5d77a`,
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              fontSize: 12,
            }}>
              <span style={{ color: '#7a5d12', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 }}>
                Dev mode
              </span>
              <button onClick={fillTestData}
                style={{ background: '#7a5d12', color: '#fff8e1', border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 600 }}>
                Fill random sample
              </button>
              <button onClick={generateDemoLetter}
                style={{ background: C.red, color: C.paper, border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 600 }}>
                Generate Sarah Chen (skip Stripe)
              </button>
              <span style={{ fontSize: 11, color: '#7a5d12', opacity: 0.75 }}>
                Use these to test without paying. Remove this block before launch.
              </span>
            </div>

            <h1 style={{ fontSize: 48, fontWeight: 800, color: C.ink, marginBottom: 12, letterSpacing: '-0.03em', lineHeight: 1 }}>
              Tell us about you
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 56, lineHeight: 1.55 }}>
              The more specific, the better. Skip anything that doesn't apply.
            </p>

            {error && (
              <div style={{ background: '#fef2f0', borderLeft: `3px solid ${C.red}`, padding: '14px 18px', marginBottom: 32, color: C.ink, fontSize: 14 }}>
                {error}
              </div>
            )}

            {/* Privacy-first positioning note */}
            <div style={{
              marginBottom: 40, padding: '18px 22px',
              background: '#fafaf5', borderLeft: `3px solid ${C.red}`,
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
              <div style={{ marginTop: 48, background: C.ink, color: C.paper, padding: '24px 28px', position: 'relative', overflow: 'hidden' }}>
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
                      generateLetter(form, { passToken, verificationToken: localStorage.getItem('rentletter_verification_token') });
                    }}
                    disabled={!isFormValid()}
                    style={{
                      background: isFormValid() ? C.red : '#5a3a3c',
                      color: C.paper, border: 'none',
                      padding: '16px 28px', fontSize: 15, fontWeight: 700,
                      cursor: isFormValid() ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.2s',
                    }}
                    onMouseOver={e => { if (isFormValid()) e.currentTarget.style.background = C.redDark; }}
                    onMouseOut={e => { if (isFormValid()) e.currentTarget.style.background = C.red; }}
                  >
                    {isFormValid() ? 'Generate letter →' : 'Fill required fields'}
                  </button>
                </div>
              </div>
            )}

            {/* Pricing summary (only when no pass) */}
            {!passInfo && (
              <div style={{ marginTop: 48, background: C.paper, border: `1px solid ${C.ink}`, padding: '28px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 16, borderBottom: `1px solid ${C.rule}` }}>
                  <span style={{ fontSize: 15, color: C.inkSoft }}>{tier === 'single' ? 'Single application' : '30-day search pass'}</span>
                  <span style={{ fontSize: 13, color: C.inkMute }}>1 ×</span>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total</span>
                  {tier === 'single' && isPromoActive() ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: C.inkMute, textDecoration: 'line-through' }}>${REGULAR_PRICE}</span>
                      <span style={{ fontSize: 36, fontWeight: 800, color: C.red, letterSpacing: '-0.02em' }}>${PROMO_PRICE}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 36, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>${tier === 'single' ? REGULAR_PRICE : '19.99'}</span>
                  )}
                </div>
                {tier === 'single' && isPromoActive() && (
                  <div style={{ marginTop: 8, fontSize: 12, color: C.red, fontWeight: 600, textAlign: 'right' }}>
                    Launch promo — saves ${(parseFloat(REGULAR_PRICE) - parseFloat(PROMO_PRICE)).toFixed(2)}
                  </div>
                )}
                <button
                  onClick={handlePay}
                  disabled={!isFormValid()}
                  style={{
                    width: '100%', marginTop: 24,
                    background: isFormValid() ? C.ink : '#c8c2b3',
                    color: C.paper, border: 'none', padding: '18px',
                    fontSize: 15, fontWeight: 600,
                    cursor: isFormValid() ? 'pointer' : 'not-allowed',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseOver={e => { if (isFormValid()) e.currentTarget.style.opacity = '0.85'; }}
                  onMouseOut={e => { if (isFormValid()) e.currentTarget.style.opacity = '1'; }}
                >
                  {isFormValid()
                    ? `Pay $${tier === 'single' ? (isPromoActive() ? PROMO_PRICE : REGULAR_PRICE) : '19.99'} and continue`
                    : 'Complete required fields'}
                </button>
                <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, textAlign: 'center' }}>
                  Secure payment via Stripe · Not legal advice
                </p>
                {tier === 'unlimited' && (
                  <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, textAlign: 'center', lineHeight: 1.55 }}>
                    After payment, you'll receive an email with your search pass link.<br/>Use it from any device for 30 days — re-tailor your application for every apartment.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  // VERIFY EMAIL — 6-digit code entry before Stripe
  // ════════════════════════════════════════════════════════════
  if (step === 'verifyEmail') {
    return (
      <>
        <Head><title>Verify your email — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', flexDirection: 'column' }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <button onClick={() => setStep('form')} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
              ← Back to form
            </button>
          </header>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{ maxWidth: 460, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 24, height: 1, background: C.red }} />
                <span style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Step 1 of 2 · Verify your email
                </span>
              </div>
              <h2 style={{ fontSize: 36, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 16 }}>
                Check your email<br />for a 6-digit code.
              </h2>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, marginBottom: 28 }}>
                We sent a verification code to <strong style={{ color: C.ink }}>{form.email}</strong>. Enter it below to continue to payment. This is how we keep applications real for landlords.
              </p>

              <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && submitVerificationCode()}
                placeholder="123456"
                autoFocus
                style={{
                  width: '100%', padding: '18px 20px',
                  fontSize: 24, fontWeight: 700,
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: '0.4em', textAlign: 'center',
                  border: `1px solid ${C.ink}`, background: C.paper, color: C.ink,
                  outline: 'none',
                }}
              />

              {verifyError && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
                  {verifyError}
                </div>
              )}

              <button
                onClick={submitVerificationCode}
                disabled={verifyLoading || verifyCode.length !== 6}
                style={{
                  width: '100%', marginTop: 16,
                  background: (verifyLoading || verifyCode.length !== 6) ? '#c8c2b3' : C.ink,
                  color: C.paper, border: 'none', padding: '18px',
                  fontSize: 15, fontWeight: 600,
                  cursor: (verifyLoading || verifyCode.length !== 6) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}>
                {verifyLoading ? 'Checking...' : 'Verify and continue to payment →'}
              </button>

              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.inkMute }}>
                <button onClick={() => setStep('form')}
                  style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  Wrong email? Edit form
                </button>
                <button
                  onClick={resendVerificationCode}
                  disabled={verifyLoading}
                  style={{ background: 'transparent', border: 'none', color: C.red, fontSize: 12, fontWeight: 600, cursor: verifyLoading ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
                  Resend code
                </button>
              </div>

              <div style={{ marginTop: 36, padding: '14px 16px', background: '#fafaf5', borderLeft: `3px solid ${C.red}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
                <strong style={{ color: C.ink }}>Why?</strong> Landlords need to trust that Rentletter applications are real. A verified email makes every application more credible — and protects you from anyone impersonating you.
              </div>
            </div>
          </div>
        </div>
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
            <h2 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.0, color: C.ink, letterSpacing: '-0.03em', marginBottom: 16 }}>
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
            <div style={{ background: C.ink, color: C.paper, padding: '28px 32px', marginBottom: 32, position: 'relative', overflow: 'hidden' }}>
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
                background: '#0a0a0b', padding: '12px 14px',
                color: '#a4adbb', marginBottom: 16,
              }}>
                https://rentletter.ca/?pass={passToken}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://rentletter.ca/?pass=${passToken}`);
                  alert('Access link copied');
                }}
                style={{
                  background: C.paper, color: C.ink, border: 'none',
                  padding: '10px 18px', fontSize: 13, fontWeight: 600,
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

            <div style={{ marginTop: 56, padding: '20px 22px', background: '#fafaf5', borderLeft: `3px solid ${C.red}` }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                A few things to know
              </div>
              <ul style={{ listStyle: 'none', fontSize: 13, color: C.inkSoft, lineHeight: 1.7 }}>
                <li>— The access link works from any device. Bookmark it or save the email.</li>
                <li>— Each application gets a fresh number — landlords can verify the latest version.</li>
                <li>— Update your profile anytime: new job, raise, found a roommate. The Scorecard recalculates.</li>
                <li>— Pass expires automatically in 30 days. No auto-renewal, no surprise charges.</li>
                <li>— Need help? Reply to the activation email or write to hello@rentletter.ca</li>
              </ul>
            </div>
          </div>
        </div>
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
            <h2 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.0, color: C.ink, letterSpacing: '-0.03em', marginBottom: 16 }}>
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
                  style={{
                    background: C.red, color: C.paper, border: 'none',
                    padding: '8px 16px', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  + New letter
                </button>
              )}
              <button onClick={startOver} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
                {passInfo ? 'Clear this letter' : 'Start fresh'}
              </button>
            </div>
          </header>

          <div style={{ maxWidth: 820, margin: '0 auto', padding: '64px 32px 80px' }}>
            <h1 style={{ fontSize: 48, fontWeight: 800, color: C.ink, marginBottom: 12, letterSpacing: '-0.03em', lineHeight: 1 }}>
              Your letter is <span style={{ color: C.red }}>ready.</span>
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 32, lineHeight: 1.55 }}>
              Read it over. Edit anything — changes save automatically.
            </p>

            {/* Application Number Card — the trust signal for landlords */}
            {applicationNumber && (
              <div style={{
                background: C.ink, color: C.paper,
                padding: '24px 28px', marginBottom: 32,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Your Application Number
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 10, fontFamily: 'monospace' }}>
                      {applicationNumber}
                    </div>
                    <p style={{ fontSize: 13, color: '#a4adbb', lineHeight: 1.55, maxWidth: 480 }}>
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
                    style={{
                      background: C.paper, color: C.ink, border: 'none',
                      padding: '10px 20px', fontSize: 13, fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copiedAppNum ? '✓ Copied' : 'Copy number'}
                  </button>
                </div>
              </div>
            )}

            {/* Email status */}
            {form.email && (
              <div style={{
                background: emailSent ? '#f0f5f1' : '#faf6e8',
                border: `1px solid ${emailSent ? '#c8d8cc' : '#e0d5a8'}`,
                padding: '14px 18px', marginBottom: 28, fontSize: 14,
                color: emailSent ? '#2d5a3f' : '#665a1f',
              }}>
                {emailSending ? `Delivering to ${form.email}...` : emailSent ? `Sent to ${form.email}` : `Will email to ${form.email}`}
              </div>
            )}

            {/* Download bar */}
            <div style={{ background: C.ink, color: C.paper, padding: '20px 24px', marginBottom: 32, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#a4adbb', flex: 1, minWidth: 180 }}>
                Download
              </span>
              <button onClick={() => downloadFile('pdf')}
                style={{ background: C.red, color: C.paper, border: 'none', padding: '12px 22px', fontSize: 14, fontWeight: 600 }}>
                PDF
              </button>
              <button onClick={() => downloadFile('docx')}
                style={{ background: C.paper, color: C.ink, border: 'none', padding: '12px 22px', fontSize: 14, fontWeight: 600 }}>
                Word
              </button>
              {form.email && !emailSent && (
                <button onClick={() => sendEmail(form.email, form.fullName, letter, resume, applicationNumber)} disabled={emailSending}
                  style={{ background: 'transparent', color: C.paper, border: `1px solid #3a3a3c`, padding: '12px 22px', fontSize: 14, fontWeight: 500 }}>
                  {emailSending ? 'Sending...' : 'Resend email'}
                </button>
              )}
            </div>

            {/* Cover Letter */}
            <div style={{ background: '#fafaf5', border: `1px solid ${C.rule}`, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.rule}` }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Cover letter</h2>
                <button onClick={() => copyText(letter, setCopiedLetter)}
                  style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '8px 16px', fontSize: 13, fontWeight: 500 }}>
                  {copiedLetter ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea value={letter} onChange={e => updateLetter(e.target.value)}
                style={{
                  width: '100%', minHeight: 460, padding: 24,
                  fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.7,
                  color: C.ink, background: '#fafaf5',
                  border: 'none', outline: 'none', resize: 'vertical',
                }} />
            </div>

            {/* Resume */}
            <div style={{ background: '#fafaf5', border: `1px solid ${C.rule}`, marginBottom: 24 }}>
              <div style={{ padding: '20px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.rule}` }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Tenant resume</h2>
                <button onClick={() => copyText(resume, setCopiedResume)}
                  style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '8px 16px', fontSize: 13, fontWeight: 500 }}>
                  {copiedResume ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea value={resume} onChange={e => updateResume(e.target.value)}
                style={{
                  width: '100%', minHeight: 320, padding: 24,
                  fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.7,
                  color: C.ink, background: '#fafaf5',
                  border: 'none', outline: 'none', resize: 'vertical',
                }} />
            </div>

            <button onClick={startOver}
              style={{ marginTop: 24, background: 'transparent', border: `1px solid ${C.ink}`, color: C.ink, padding: '14px 28px', fontSize: 14, fontWeight: 500 }}>
              Start a new letter
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
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
