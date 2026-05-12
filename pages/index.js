import { useState, useEffect } from 'react';
import Head from 'next/head';

// Stripe payment links — replace with real links after creating products
// Both should be configured to redirect to: https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}
const STRIPE_SINGLE = 'https://buy.stripe.com/aFa8wIeGLebVdp9gFk6Ri01';
const STRIPE_UNLIMITED = 'https://buy.stripe.com/bJedR256b5Fpcl5cp46Ri02';

const GlobalStyle = () => (
  <>
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700;900&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        background: #f5efe4; color: #1a1612;
        font-family: 'Inter', -apple-system, sans-serif;
        overflow-x: hidden;
      }
      h1, h2, h3 { font-family: 'Fraunces', serif; letter-spacing: -0.02em; }
      button { font-family: 'Inter', sans-serif; cursor: pointer; }
      input, textarea, select { font-family: 'Inter', sans-serif; }
    `}</style>
  </>
);

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);

  // ── On mount: check Stripe callback OR restore previous letter ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPaid = params.get('paid') === 'true';
    const sessionId = params.get('session_id');

    // CASE 1: returning from Stripe with payment → generate the letter
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

    // CASE 2: page reload with previously-generated letter → restore result
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
    // Clear any old letter so we don't show stale data
    localStorage.removeItem('rentletter_letter');
    localStorage.removeItem('rentletter_resume');
    window.location.href = tier === 'single' ? STRIPE_SINGLE : STRIPE_UNLIMITED;
  };

  const generateLetter = async (data, sessionId) => {
    setLoading(true);
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
      // Clean URL — remove paid/session_id params so refresh doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
      setStep('result');

      // Auto-send the email
      if (data.email) {
        sendEmail(data.email, data.fullName, json.letter, json.resume);
      }
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
    setLoading(false);
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
    if (!confirm('Clear your letter and start a new one? This cannot be undone.')) return;
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

  // Save edits to localStorage as user types
  const updateLetter = (text) => {
    setLetter(text);
    localStorage.setItem('rentletter_letter', text);
  };
  const updateResume = (text) => {
    setResume(text);
    localStorage.setItem('rentletter_resume', text);
  };

  // ─────────────────────── LANDING ───────────────────────
  if (step === 'landing') {
    return (
      <>
        <Head>
          <title>RentLetter — Win Your Apartment in Toronto</title>
          <meta name="description" content="AI-generated rental cover letter that helps Toronto renters stand out from 50+ applicants. Personalized in 2 minutes." />
        </Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: '#f5efe4' }}>
          <div style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.08\'/%3E%3C/svg%3E")',
          }} />

          <nav style={{ position: 'relative', zIndex: 2, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, background: '#1a1612', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6a1a', fontFamily: 'Fraunces', fontWeight: 900, fontSize: 20 }}>R</div>
              <span style={{ fontFamily: 'Fraunces', fontWeight: 700, fontSize: 22 }}>RentLetter</span>
            </div>
            <span style={{ fontSize: 13, color: '#5a4f43', fontWeight: 500 }}>Toronto · Made for renters</span>
          </nav>

          <section style={{ position: 'relative', zIndex: 1, padding: '60px 24px 80px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '6px 14px', background: '#1a1612', color: '#ff6a1a', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 28 }}>
              ● Made for July 1 movers
            </div>
            <h1 style={{ fontSize: 'clamp(42px, 7vw, 84px)', fontWeight: 700, lineHeight: 0.98, marginBottom: 24, letterSpacing: '-0.03em' }}>
              Win the apartment.<br />
              <span style={{ fontStyle: 'italic', color: '#ff6a1a' }}>Not the rejection email.</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 1.6vw, 19px)', color: '#5a4f43', maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.5 }}>
              Landlords get 50 applications. Yours has 10 seconds to stand out.
              A personalized cover letter that signals stability — not desperation.
            </p>
            <button
              onClick={() => setStep('form')}
              style={{
                background: '#ff6a1a', color: '#fff', border: 'none',
                padding: '18px 36px', borderRadius: 999, fontSize: 16, fontWeight: 600,
                boxShadow: '0 8px 24px rgba(255,106,26,0.3)', transition: 'transform 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Generate my cover letter →
            </button>
            <p style={{ marginTop: 16, fontSize: 13, color: '#7a6e60' }}>2 minutes · From $9.99</p>
          </section>

          <section style={{ position: 'relative', zIndex: 1, background: '#1a1612', color: '#f5efe4', padding: '50px 24px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 40, textAlign: 'left' }}>
              {[
                { n: '50+', l: 'Applications per unit in Toronto' },
                { n: '25%', l: 'Of renters get rejected' },
                { n: '10s', l: 'To make a first impression' },
                { n: '$2,720', l: 'Avg 2BR rent you\'re competing for' },
              ].map(s => (
                <div key={s.n}>
                  <div style={{ fontSize: 36, fontFamily: 'Fraunces', fontWeight: 700, color: '#ff6a1a' }}>{s.n}</div>
                  <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, marginBottom: 50, textAlign: 'center' }}>How it works</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
              {[
                { n: '01', t: 'Tell us about you', d: 'Job, income, rental history, why you\'re moving. 2 minutes.' },
                { n: '02', t: 'AI writes your letter', d: 'Personalized cover letter + tenant resume. Tailored to what landlords actually look for.' },
                { n: '03', t: 'Edit, download, win', d: 'Tweak before sending. Download as PDF or Word. We also email it to you.' },
              ].map(s => (
                <div key={s.n} style={{ background: '#fff', padding: 32, borderRadius: 16, border: '1px solid #e5dccc' }}>
                  <div style={{ fontFamily: 'Fraunces', fontSize: 14, color: '#ff6a1a', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 16 }}>{s.n}</div>
                  <h3 style={{ fontSize: 22, marginBottom: 10, fontWeight: 600 }}>{s.t}</h3>
                  <p style={{ color: '#5a4f43', lineHeight: 1.6, fontSize: 15 }}>{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ position: 'relative', zIndex: 1, padding: '40px 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>Pick your plan</h2>
            <p style={{ textAlign: 'center', color: '#5a4f43', marginBottom: 50, fontSize: 16 }}>
              Most renters apply to 10+ apartments before getting accepted.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 760, margin: '0 auto' }}>
              <div style={{ background: '#fff', padding: 36, borderRadius: 16, border: '1px solid #e5dccc' }}>
                <div style={{ fontSize: 14, color: '#5a4f43', fontWeight: 600, marginBottom: 8 }}>Single Letter</div>
                <div style={{ fontFamily: 'Fraunces', fontSize: 48, fontWeight: 700, marginBottom: 4 }}>$9.99</div>
                <div style={{ fontSize: 13, color: '#7a6e60', marginBottom: 24 }}>CAD · one-time</div>
                <ul style={{ listStyle: 'none', marginBottom: 28 }}>
                  {['One cover letter', 'Tenant resume included', 'PDF + Word download', 'Email delivery'].map(f => (
                    <li key={f} style={{ padding: '8px 0', color: '#1a1612', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#ff6a1a' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('single'); setStep('form'); }} style={{ width: '100%', background: '#1a1612', color: '#fff', border: 'none', padding: '14px', borderRadius: 999, fontSize: 15, fontWeight: 600 }}>Choose Single</button>
              </div>

              <div style={{ background: '#1a1612', padding: 36, borderRadius: 16, position: 'relative', color: '#f5efe4' }}>
                <div style={{ position: 'absolute', top: -12, right: 24, background: '#ff6a1a', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Best Value</div>
                <div style={{ fontSize: 14, color: '#ff6a1a', fontWeight: 600, marginBottom: 8 }}>Unlimited (30 days)</div>
                <div style={{ fontFamily: 'Fraunces', fontSize: 48, fontWeight: 700, marginBottom: 4 }}>$19.99</div>
                <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 24 }}>CAD · 30 days unlimited</div>
                <ul style={{ listStyle: 'none', marginBottom: 28 }}>
                  {['Unlimited cover letters', 'Unlimited resumes', 'Apply to every apartment', 'Reuse for 30 days'].map(f => (
                    <li key={f} style={{ padding: '8px 0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#ff6a1a' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('unlimited'); setStep('form'); }} style={{ width: '100%', background: '#ff6a1a', color: '#fff', border: 'none', padding: '14px', borderRadius: 999, fontSize: 15, fontWeight: 600 }}>Choose Unlimited</button>
              </div>
            </div>
          </section>

          <footer style={{ position: 'relative', zIndex: 1, padding: '40px 24px', borderTop: '1px solid #e5dccc', textAlign: 'center', fontSize: 13, color: '#7a6e60' }}>
            RentLetter · Built in Toronto · Not legal advice
          </footer>
        </div>
      </>
    );
  }

  // ─────────────────────── FORM ───────────────────────
  if (step === 'form') {
    return (
      <>
        <Head><title>Your Details — RentLetter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: '#f5efe4', padding: '40px 20px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <button onClick={() => setStep('landing')} style={{ background: 'transparent', border: 'none', color: '#5a4f43', fontSize: 14, marginBottom: 24 }}>← back</button>
            <h1 style={{ fontSize: 36, marginBottom: 8, fontWeight: 700 }}>Tell us about you</h1>
            <p style={{ color: '#5a4f43', marginBottom: 36, fontSize: 15 }}>The more specific, the better your letter will be.</p>

            {error && (
              <div style={{ background: '#fee', border: '1px solid #fcc', padding: 14, borderRadius: 10, marginBottom: 24, color: '#a33', fontSize: 14 }}>
                {error}
              </div>
            )}

            <FormSection title="Where to send it" required>
              <Field label="Your email *" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" type="email" />
              <p style={{ fontSize: 12, color: '#7a6e60' }}>We email you the PDF + Word file as soon as it's ready.</p>
            </FormSection>

            <FormSection title="The apartment">
              <Field label="Apartment address (optional)" value={form.apartmentAddress} onChange={v => update('apartmentAddress', v)} placeholder="123 King St W, Toronto" />
              <Field label="Brief description (optional)" value={form.apartmentDescription} onChange={v => update('apartmentDescription', v)} placeholder="2BR condo, downtown, $2400/mo" />
            </FormSection>

            <FormSection title="About you" required>
              <Field label="Full name *" value={form.fullName} onChange={v => update('fullName', v)} placeholder="Jane Doe" />
              <Field label="Age (optional)" value={form.age} onChange={v => update('age', v)} placeholder="28" type="number" />
            </FormSection>

            <FormSection title="Employment" required>
              <Field label="Job title *" value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Software Engineer" />
              <Field label="Employer *" value={form.employer} onChange={v => update('employer', v)} placeholder="Shopify" />
              <Field label="Years at this job" value={form.yearsAtJob} onChange={v => update('yearsAtJob', v)} placeholder="3" />
              <Field label="Annual income (CAD) *" value={form.annualIncome} onChange={v => update('annualIncome', v)} placeholder="85000" type="number" />
            </FormSection>

            <FormSection title="Rental history">
              <Field label="Previous address" value={form.previousAddress} onChange={v => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
              <Field label="Years there" value={form.yearsAtPrevious} onChange={v => update('yearsAtPrevious', v)} placeholder="2" />
              <Field label="Previous landlord name" value={form.previousLandlordName} onChange={v => update('previousLandlordName', v)} placeholder="John Smith" />
              <Field label="Landlord contact (phone or email)" value={form.previousLandlordContact} onChange={v => update('previousLandlordContact', v)} placeholder="john@email.com" />
            </FormSection>

            <FormSection title="Your move" required>
              <Field label="Desired move-in date *" value={form.moveInDate} onChange={v => update('moveInDate', v)} type="date" />
              <Textarea label="Why are you moving? *" value={form.reasonForMoving} onChange={v => update('reasonForMoving', v)} placeholder="New job downtown, want shorter commute, lease ending..." />
            </FormSection>

            <FormSection title="Personal">
              <Textarea label="Personality / lifestyle" value={form.personality} onChange={v => update('personality', v)} placeholder="Quiet, work from home most days, into cooking and running. Non-smoker." />
              <Field label="Pets (optional)" value={form.pets} onChange={v => update('pets', v)} placeholder="One small cat, indoor only" />
              <Textarea label="Anything to address? (bad credit, gap, etc.)" value={form.redFlags} onChange={v => update('redFlags', v)} placeholder="Skip if nothing applies" />
            </FormSection>

            <div style={{ background: '#1a1612', color: '#f5efe4', padding: 24, borderRadius: 16, marginTop: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, opacity: 0.7 }}>Selected plan</span>
                <span style={{ fontWeight: 600 }}>{tier === 'single' ? 'Single Letter' : 'Unlimited 30 days'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, opacity: 0.7 }}>Total</span>
                <span style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 700 }}>${tier === 'single' ? '9.99' : '19.99'}</span>
              </div>
              <button
                onClick={handlePay}
                disabled={!isFormValid()}
                style={{
                  width: '100%', marginTop: 16,
                  background: isFormValid() ? '#ff6a1a' : '#3a3530',
                  color: '#fff', border: 'none', padding: '16px', borderRadius: 999,
                  fontSize: 15, fontWeight: 600,
                  cursor: isFormValid() ? 'pointer' : 'not-allowed',
                }}
              >
                {isFormValid() ? `Generate my letter — $${tier === 'single' ? '9.99' : '19.99'} CAD` : 'Complete required fields above'}
              </button>
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: '#7a6e60', textAlign: 'center' }}>
              Secure payment via Stripe · Not legal advice
            </p>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────── GENERATING ───────────────────────
  if (step === 'generating') {
    return (
      <>
        <Head><title>Generating — RentLetter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: '#f5efe4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, border: '4px solid #e5dccc', borderTopColor: '#ff6a1a', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 0.8s linear infinite' }} />
            <h2 style={{ fontSize: 28, marginBottom: 8 }}>Writing your letter…</h2>
            <p style={{ color: '#5a4f43' }}>This takes about 20 seconds.</p>
          </div>
          <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </>
    );
  }

  // ─────────────────────── RESULT ───────────────────────
  if (step === 'result') {
    return (
      <>
        <Head><title>Your Letter — RentLetter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: '#f5efe4', padding: '40px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h1 style={{ fontSize: 36, marginBottom: 8, fontWeight: 700 }}>Your letter is ready ✨</h1>
            <p style={{ color: '#5a4f43', marginBottom: 16 }}>Edit anything you'd like below. Changes save automatically.</p>

            {/* Email status */}
            {form.email && (
              <div style={{ background: emailSent ? '#e8f5e9' : '#fff8e1', border: `1px solid ${emailSent ? '#a5d6a7' : '#ffd54f'}`, padding: 14, borderRadius: 10, marginBottom: 24, fontSize: 14, color: emailSent ? '#2e7d32' : '#7a5a00' }}>
                {emailSending ? '📧 Sending to your email...' : emailSent ? `✅ Sent to ${form.email} — check your inbox for the PDF + Word files` : `📧 We'll email this to ${form.email}`}
              </div>
            )}

            {/* DOWNLOAD BAR */}
            <div style={{ background: '#1a1612', color: '#fff', padding: 20, borderRadius: 16, marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, minWidth: 200 }}>Download your finished letter:</span>
              <button onClick={() => downloadFile('pdf')} style={{ background: '#ff6a1a', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>↓ PDF</button>
              <button onClick={() => downloadFile('docx')} style={{ background: '#fff', color: '#1a1612', border: 'none', padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>↓ Word</button>
              {form.email && !emailSent && (
                <button onClick={() => sendEmail(form.email, form.fullName, letter, resume)} disabled={emailSending} style={{ background: 'transparent', color: '#fff', border: '1px solid #5a4f43', padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
                  {emailSending ? 'Sending...' : '✉ Resend email'}
                </button>
              )}
            </div>

            {/* COVER LETTER — EDITABLE */}
            <div style={{ background: '#fff', padding: 36, borderRadius: 16, border: '1px solid #e5dccc', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cover Letter <span style={{ fontSize: 13, color: '#7a6e60', fontWeight: 400 }}>· editable</span></h2>
                <button onClick={() => copyText(letter, setCopiedLetter)} style={{ background: '#ff6a1a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
                  {copiedLetter ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                value={letter}
                onChange={e => updateLetter(e.target.value)}
                style={{
                  width: '100%', minHeight: 480, padding: 20,
                  fontFamily: 'Inter, sans-serif', fontSize: 15, lineHeight: 1.7,
                  color: '#1a1612', background: '#fafaf7',
                  border: '1px solid #e5dccc', borderRadius: 10,
                  resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            {/* RESUME — EDITABLE */}
            <div style={{ background: '#fff', padding: 36, borderRadius: 16, border: '1px solid #e5dccc', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 22, fontWeight: 600 }}>Tenant Resume <span style={{ fontSize: 13, color: '#7a6e60', fontWeight: 400 }}>· editable</span></h2>
                <button onClick={() => copyText(resume, setCopiedResume)} style={{ background: '#ff6a1a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
                  {copiedResume ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                value={resume}
                onChange={e => updateResume(e.target.value)}
                style={{
                  width: '100%', minHeight: 360, padding: 20,
                  fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.7,
                  color: '#1a1612', background: '#fafaf7',
                  border: '1px solid #e5dccc', borderRadius: 10,
                  resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            <button onClick={startOver} style={{ background: 'transparent', border: '1px solid #1a1612', color: '#1a1612', padding: '14px 28px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
              Start a new letter
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}

// ─────────────────────── SUB-COMPONENTS ───────────────────────
function FormSection({ title, required, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5a4f43', marginBottom: 14 }}>
        {title} {required && <span style={{ color: '#ff6a1a' }}>· required</span>}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: '#5a4f43', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #d4c8b3', borderRadius: 10, background: '#fff', color: '#1a1612', outline: 'none' }} />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: '#5a4f43', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #d4c8b3', borderRadius: 10, background: '#fff', color: '#1a1612', outline: 'none', resize: 'vertical', fontFamily: 'Inter, sans-serif' }} />
    </div>
  );
}
