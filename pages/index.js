import { useState, useEffect } from 'react';
import Head from 'next/head';

// Stripe payment links — both must redirect to:
// https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}
const STRIPE_SINGLE = 'https://buy.stripe.com/REPLACE_WITH_SINGLE_LINK';
const STRIPE_UNLIMITED = 'https://buy.stripe.com/REPLACE_WITH_UNLIMITED_LINK';

// ─── DESIGN TOKENS ────────────────────────────────────────────
const C = {
  paper: '#faf8f3',       // eggshell
  paperDeep: '#f2eee3',
  ink: '#0f0f10',         // near-black
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',         // Time magazine red — used sparingly
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
  const [error, setError] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPaid = params.get('paid') === 'true';
    const sessionId = params.get('session_id');

    if (isPaid && sessionId) {
      const savedForm = localStorage.getItem('rentletter_form');
      if (savedForm) {
        const data = JSON.parse(savedForm);
        setForm(data);
        setStep('generating');
        generateLetter(data, sessionId);
      }
      return;
    }

    const savedLetter = localStorage.getItem('rentletter_letter');
    const savedResume = localStorage.getItem('rentletter_resume');
    const savedForm = localStorage.getItem('rentletter_form');
    if (savedLetter && savedForm) {
      setLetter(savedLetter);
      setResume(savedResume || '');
      setForm(JSON.parse(savedForm));
      setStep('result');
    }
  }, []);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const isFormValid = () => {
    return form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      && form.fullName && form.jobTitle && form.employer
      && form.annualIncome && form.moveInDate && form.reasonForMoving;
  };

  const handlePay = () => {
    localStorage.setItem('rentletter_form', JSON.stringify(form));
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    window.location.href = tier === 'single' ? STRIPE_SINGLE : STRIPE_UNLIMITED;
  };

  const generateLetter = async (data, sessionId) => {
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, stripeSessionId: sessionId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLetter(json.letter);
      setResume(json.resume);
      localStorage.setItem('rentletter_letter', json.letter);
      localStorage.setItem('rentletter_resume', json.resume);
      window.history.replaceState({}, '', window.location.pathname);
      setStep('result');
      if (data.email) sendEmail(data.email, data.fullName, json.letter, json.resume);
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  };

  const sendEmail = async (email, fullName, letterText, resumeText) => {
    setEmailSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, letter: letterText, resume: resumeText }),
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
    setLetter(''); setResume('');
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

          {/* ── HERO — short, confident ─────────────────────── */}
          <section style={{ padding: '120px 32px 100px', maxWidth: 1100, margin: '0 auto' }}>
            <h1 style={{
              fontSize: 'clamp(40px, 8vw, 132px)',
              lineHeight: 0.95,
              letterSpacing: '-0.035em',
              color: C.ink,
              fontWeight: 800,
              marginBottom: 40,
              maxWidth: 1000,
            }}>
              A letter<br />
              that gets you the<br />
              <span style={{ color: C.red }}>apartment.</span>
            </h1>

            <p style={{ fontSize: 19, lineHeight: 1.55, color: C.inkSoft, maxWidth: 520, marginBottom: 48 }}>
              Personalized cover letter and tenant resume. Two minutes. Built for Toronto's market.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
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
                From $9.99
              </span>
            </div>
          </section>

          {/* ── NUMBERS STRIP — quiet, no big colors ────────── */}
          <section style={{ borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 }}>
              {[
                { n: '50+', l: 'applications per unit' },
                { n: '25%', l: 'of renters get rejected' },
                { n: '10s', l: 'to make an impression' },
                { n: '2 min', l: 'to write yours' },
              ].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>{s.n}</div>
                  <div style={{ fontSize: 13, color: C.inkMute }}>{s.l}</div>
                </div>
              ))}
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

              {/* Unlimited — red bar only */}
              <div style={{ background: C.paper, border: `1px solid ${C.ink}`, padding: '32px 28px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: C.inkSoft, marginBottom: 14 }}>30-day pass</div>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: C.ink, letterSpacing: '-0.03em' }}>$19.99</span>
                  <span style={{ fontSize: 14, color: C.inkMute, marginLeft: 6 }}>CAD</span>
                </div>
                <div style={{ height: 1, background: C.rule, marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 24 }}>
                  {['Unlimited letters', 'Unlimited resumes', 'Apply to every apartment', '30 days of access'].map(f => (
                    <li key={f} style={{ padding: '10px 0', fontSize: 14, color: C.inkSoft, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ color: C.ink, fontSize: 11 }}>—</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('unlimited'); setStep('form'); }}
                  style={{ background: C.ink, color: C.paper, border: 'none', padding: '14px', fontSize: 14, fontWeight: 500, transition: 'opacity 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseOut={e => e.currentTarget.style.opacity = '1'}>
                  Choose pass
                </button>
              </div>
            </div>
          </section>

          {/* ── FOOTER ──────────────────────────────────────── */}
          <footer style={{ borderTop: `1px solid ${C.rule}`, padding: '32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <Wordmark />
              <div style={{ fontSize: 13, color: C.inkMute }}>
                Toronto · Not legal advice
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
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <button onClick={() => setStep('landing')} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
              ← Back
            </button>
          </header>

          <div style={{ maxWidth: 680, margin: '0 auto', padding: '64px 32px 80px' }}>
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

            {/* Pricing summary */}
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
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <button onClick={startOver} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 14, fontWeight: 500 }}>
              Start fresh
            </button>
          </header>

          <div style={{ maxWidth: 820, margin: '0 auto', padding: '64px 32px 80px' }}>
            <h1 style={{ fontSize: 48, fontWeight: 800, color: C.ink, marginBottom: 12, letterSpacing: '-0.03em', lineHeight: 1 }}>
              Your letter is <span style={{ color: C.red }}>ready.</span>
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 40, lineHeight: 1.55 }}>
              Read it over. Edit anything — changes save automatically.
            </p>

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
                <button onClick={() => sendEmail(form.email, form.fullName, letter, resume)} disabled={emailSending}
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
