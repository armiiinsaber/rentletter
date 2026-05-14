import { useState, useEffect } from 'react';
import Head from 'next/head';

// Stripe payment links — both must redirect to:
// https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}
const STRIPE_SINGLE = 'https://buy.stripe.com/aFa8wIeGLebVdp9gFk6Ri01';
const STRIPE_UNLIMITED = 'https://buy.stripe.com/bJedR256b5Fpcl5cp46Ri02';

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
    fullName: '', age: '',
    jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
    previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
    moveInDate: '', reasonForMoving: '',
    personality: '', pets: '', redFlags: '',
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
      if (savedForm) {
        const data = JSON.parse(savedForm);
        setForm(data);
        setStep('generating');
        generateLetter(data, { stripeSessionId: sessionId });
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

  const handlePay = () => {
    localStorage.setItem('rentletter_form', JSON.stringify(form));
    localStorage.setItem('rentletter_pending_tier', tier);
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    window.location.href = tier === 'single' ? STRIPE_SINGLE : STRIPE_UNLIMITED;
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
      localStorage.setItem('rentletter_letter', json.letter);
      localStorage.setItem('rentletter_resume', json.resume);
      window.history.replaceState({}, '', window.location.pathname);
      setStep('result');
      if (data.email) sendEmail(data.email, data.fullName, json.letter, json.resume, json.applicationNumber);
      // Refresh pass info if generated via pass
      if (auth.passToken) {
        verifyAndLoadPass(auth.passToken, true);
      }
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  };

  const sendEmail = async (email, fullName, letterText, resumeText, appNum) => {
    setEmailSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, letter: letterText, resume: resumeText, applicationNumber: appNum || applicationNumber }),
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

  const startOver = () => {
    if (!confirm('Clear this letter and start fresh?')) return;
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    localStorage.removeItem('rentletter_form');
    localStorage.removeItem('rentletter_app_number');
    setLetter(''); setResume(''); setApplicationNumber('');
    setForm({
      email: '', apartmentAddress: '', apartmentDescription: '',
      fullName: '', age: '', jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
      previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
      moveInDate: '', reasonForMoving: '', personality: '', pets: '', redFlags: '',
    });
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
                  From <span style={{ color: C.ink, fontWeight: 600 }}>$9.99</span> · One-time
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
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 48 }}>
              Pricing
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              {/* Single */}
              <div style={{ background: C.paper, border: `1px solid ${C.rule}`, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.inkSoft, marginBottom: 14 }}>Single letter</div>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.ink, letterSpacing: '-0.03em' }}>$9.99</span>
                  <span style={{ fontSize: 14, color: C.inkMute, marginLeft: 6 }}>CAD</span>
                </div>
                <div style={{ height: 1, background: C.rule, marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 24 }}>
                  {['One cover letter', 'One tenant resume', 'PDF and Word formats', 'Sent to your email'].map(f => (
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

              {/* Unlimited — FULL RED for editorial pop, like a magazine featured card */}
              <div style={{ background: C.red, color: C.paper, padding: '32px 28px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                {/* Tiny "RECOMMENDED" tag in corner */}
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: C.paper,
                  border: `1px solid ${C.paper}`, padding: '4px 10px',
                  opacity: 0.95,
                }}>
                  Recommended
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.paper, marginBottom: 14, opacity: 0.85 }}>30-day pass</div>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.paper, letterSpacing: '-0.03em' }}>$19.99</span>
                  <span style={{ fontSize: 14, color: C.paper, opacity: 0.7, marginLeft: 6 }}>CAD</span>
                </div>
                <div style={{ height: 1, background: C.paper, opacity: 0.3, marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 24 }}>
                  {['Unlimited letters', 'Unlimited resumes', 'Apply to every apartment', '30 days of access'].map(f => (
                    <li key={f} style={{ padding: '10px 0', fontSize: 14, color: C.paper, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ color: C.paper, fontSize: 11, opacity: 0.6 }}>—</span> {f}
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
          </section>

          {/* ── FINAL CTA BANNER — red full-bleed last-chance ── */}
          <section style={{ background: C.ink, color: C.paper, position: 'relative', overflow: 'hidden' }}>
            {/* Diagonal red slash accent */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 240, height: '100%',
              background: `linear-gradient(105deg, transparent 0%, transparent 50%, ${C.red} 50%, ${C.red} 100%)`,
              pointerEvents: 'none',
            }} />
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 32px', position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 24, height: 1, background: C.red }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.red }}>
                    Two minutes from now
                  </span>
                </div>
                <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: C.paper, marginBottom: 16 }}>
                  Your application could be<br />
                  the one they <span style={{ color: C.red }}>remember.</span>
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

            <FormSection num="01" title="Where to send it" required>
              <Field label="Email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" type="email" />
            </FormSection>

            <FormSection num="02" title="The apartment">
              <Field label="Address" value={form.apartmentAddress} onChange={v => update('apartmentAddress', v)} placeholder="123 King St W, Toronto" />
              <Field label="Brief description" value={form.apartmentDescription} onChange={v => update('apartmentDescription', v)} placeholder="2BR, downtown, $2,400/mo" />
            </FormSection>

            <FormSection num="03" title="About you" required>
              <Field label="Full name" value={form.fullName} onChange={v => update('fullName', v)} placeholder="Jane Doe" />
              <Field label="Age" value={form.age} onChange={v => update('age', v)} placeholder="28" type="number" />
            </FormSection>

            <FormSection num="04" title="Employment" required>
              <Field label="Job title" value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Software engineer" />
              <Field label="Employer" value={form.employer} onChange={v => update('employer', v)} placeholder="Shopify" />
              <Field label="Years at this job" value={form.yearsAtJob} onChange={v => update('yearsAtJob', v)} placeholder="3" />
              <Field label="Annual income (CAD)" value={form.annualIncome} onChange={v => update('annualIncome', v)} placeholder="85,000" type="number" />
            </FormSection>

            <FormSection num="05" title="Rental history">
              <Field label="Previous address" value={form.previousAddress} onChange={v => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
              <Field label="Years there" value={form.yearsAtPrevious} onChange={v => update('yearsAtPrevious', v)} placeholder="2" />
              <Field label="Previous landlord name" value={form.previousLandlordName} onChange={v => update('previousLandlordName', v)} placeholder="John Smith" />
              <Field label="Landlord contact" value={form.previousLandlordContact} onChange={v => update('previousLandlordContact', v)} placeholder="phone or email" />
            </FormSection>

            <FormSection num="06" title="Your move" required>
              <Field label="Desired move-in date" value={form.moveInDate} onChange={v => update('moveInDate', v)} type="date" />
              <Textarea label="Why are you moving?" value={form.reasonForMoving} onChange={v => update('reasonForMoving', v)} placeholder="New job, shorter commute, lease ending..." />
            </FormSection>

            <FormSection num="07" title="Personal">
              <Textarea label="Lifestyle and habits" value={form.personality} onChange={v => update('personality', v)} placeholder="Quiet, work from home most days, non-smoker." />
              <Field label="Pets" value={form.pets} onChange={v => update('pets', v)} placeholder="One small cat, indoor only" />
              <Textarea label="Anything to address?" value={form.redFlags} onChange={v => update('redFlags', v)} placeholder="Bad credit, gap in history, etc." />
            </FormSection>

            {/* Pass status banner (only when active pass) */}
            {passInfo && (
              <div style={{ marginTop: 48, background: C.ink, color: C.paper, padding: '24px 28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                      ◯ 30-day pass active
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.01em' }}>
                      Unlimited letters
                    </div>
                    <div style={{ fontSize: 13, color: '#a4adbb', lineHeight: 1.55 }}>
                      {passInfo.daysRemaining} day{passInfo.daysRemaining === 1 ? '' : 's'} remaining · {passInfo.lettersGenerated} letter{passInfo.lettersGenerated === 1 ? '' : 's'} generated · {passInfo.email}
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
                  <span style={{ fontSize: 15, color: C.inkSoft }}>{tier === 'single' ? 'Single letter' : '30-day pass'}</span>
                  <span style={{ fontSize: 13, color: C.inkMute }}>1 ×</span>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total</span>
                  <span style={{ fontSize: 36, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>${tier === 'single' ? '9.99' : '19.99'}</span>
                </div>
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
                  {isFormValid() ? `Pay $${tier === 'single' ? '9.99' : '19.99'} and continue` : 'Complete required fields'}
                </button>
                <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, textAlign: 'center' }}>
                  Secure payment via Stripe · Not legal advice
                </p>
                {tier === 'unlimited' && (
                  <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, textAlign: 'center', lineHeight: 1.55 }}>
                    After payment, you'll receive an email with your unlimited access link.<br/>Use it from any device for 30 days.
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
              Payment confirmed. Setting up 30 days of unlimited access. Don't close this tab.
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
                Payment confirmed · 30-day pass active
              </span>
            </div>

            <h1 style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 800, color: C.ink, marginBottom: 24, letterSpacing: '-0.03em', lineHeight: 1.0 }}>
              Your unlimited access<br />
              <span style={{ color: C.red }}>is ready.</span>
            </h1>

            <p style={{ fontSize: 17, color: C.inkSoft, marginBottom: 40, lineHeight: 1.55, maxWidth: 540 }}>
              Generate as many cover letters and tenant resumes as you need for the next 30 days. Your access link has been emailed to you so you can use it from any device.
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
                <li>— Each letter generated gets its own unique application number you can share with landlords.</li>
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
                    setForm({
                      email: '', apartmentAddress: '', apartmentDescription: '',
                      fullName: '', age: '', jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
                      previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
                      moveInDate: '', reasonForMoving: '', personality: '', pets: '', redFlags: '',
                    });
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
