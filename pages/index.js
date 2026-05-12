import { useState, useEffect } from 'react';
import Head from 'next/head';

// Stripe payment links — both must redirect to:
// https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}
const STRIPE_SINGLE = 'https://buy.stripe.com/REPLACE_WITH_SINGLE_LINK';
const STRIPE_UNLIMITED = 'https://buy.stripe.com/REPLACE_WITH_UNLIMITED_LINK';

// ─── DESIGN TOKENS ────────────────────────────────────────────
const C = {
  paper: '#f4f1ea',       // off-white, warmer than pure white — page background
  paperDeep: '#ebe6db',   // section divider tint
  ink: '#0e1a2b',         // deep navy, almost black — primary text
  inkSoft: '#3a4658',     // secondary text
  inkMute: '#7a8392',     // tertiary / labels
  rule: '#d8d2c4',        // hairline borders
  accent: '#b8412e',      // saxophone red — single CTA color
  accentDark: '#8e3122',  // hover state
  success: '#2d5a3f',     // confirmation green (rarely used)
};

const GlobalStyle = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${C.paper}; color: ${C.ink};
      font-family: 'Inter', -apple-system, sans-serif;
      font-feature-settings: 'ss01', 'cv11';
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .serif { font-family: 'Instrument Serif', 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.01em; }
    .mono { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'ss01', 'cv11'; }
    button, input, textarea, select { font-family: 'Inter', sans-serif; }
    button { cursor: pointer; }
    input:focus, textarea:focus { outline: 1px solid ${C.ink}; outline-offset: -1px; }
    ::selection { background: ${C.ink}; color: ${C.paper}; }
  `}</style>
);

// ─── BRAND WORDMARK ───────────────────────────────────────────
const Wordmark = ({ size = 'sm' }) => {
  const isLg = size === 'lg';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: isLg ? 2 : 1 }}>
      <span className="serif" style={{ fontSize: isLg ? 28 : 20, color: C.ink, lineHeight: 1, fontStyle: 'italic' }}>R</span>
      <span style={{ fontSize: isLg ? 16 : 12, color: C.ink, fontWeight: 600, letterSpacing: '0.02em', lineHeight: 1 }}>
        entletter
      </span>
      <span style={{ fontSize: isLg ? 10 : 8, color: C.inkMute, fontWeight: 500, letterSpacing: '0.15em', marginLeft: isLg ? 6 : 4, lineHeight: 1 }}>
        / CA
      </span>
    </div>
  );
};

// ─── REUSABLE LABELS ──────────────────────────────────────────
const Eyebrow = ({ children, num }) => (
  <div className="mono" style={{ fontSize: 11, color: C.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
    {num && <span style={{ color: C.accent }}>§{num}</span>}
    <span>{children}</span>
  </div>
);

const Rule = ({ vertical, ...rest }) => (
  <div style={{
    background: C.rule,
    ...(vertical ? { width: 1, height: '100%' } : { height: 1, width: '100%' }),
    ...rest,
  }} />
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
  // LANDING
  // ════════════════════════════════════════════════════════════
  if (step === 'landing') {
    return (
      <>
        <Head>
          <title>Rentletter — A better rental application, in two minutes.</title>
          <meta name="description" content="A personalized cover letter and tenant resume for renters competing in Toronto's apartment market. Drafted in two minutes." />
        </Head>
        <GlobalStyle />

        <div style={{ minHeight: '100vh', background: C.paper, position: 'relative' }}>
          {/* Paper grain texture */}
          <div style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.4,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix values=\'0 0 0 0 0.05 0 0 0 0 0.1 0 0 0 0 0.17 0 0 0 0.05 0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          }} />

          {/* ── HEADER ──────────────────────────────────────── */}
          <header style={{ position: 'relative', zIndex: 2, borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Wordmark />
              <div className="mono" style={{ fontSize: 11, color: C.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Est. 2026 · Toronto
              </div>
            </div>
          </header>

          {/* ── HERO ────────────────────────────────────────── */}
          <section style={{ position: 'relative', zIndex: 1, padding: '90px 32px 60px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 1, background: C.accent }} />
              <Eyebrow num="01">Volume 1 · The Application</Eyebrow>
            </div>

            <h1 className="serif" style={{
              fontSize: 'clamp(56px, 9vw, 124px)',
              lineHeight: 0.92,
              letterSpacing: '-0.025em',
              color: C.ink,
              marginBottom: 36,
              maxWidth: 980,
            }}>
              Fifty applicants <span style={{ fontStyle: 'italic', color: C.accent }}>per&nbsp;unit.</span>
              <br />
              One letter that <span style={{ fontStyle: 'italic' }}>reads&nbsp;different.</span>
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, maxWidth: 920, marginTop: 48 }}>
              <div>
                <p style={{ fontSize: 17, lineHeight: 1.55, color: C.inkSoft, marginBottom: 24 }}>
                  A landlord spends ten seconds on each application before deciding which pile to put yours in. The difference between approval and the inbox graveyard is almost always tone — sounding stable, specific, and human, not desperate.
                </p>
                <p style={{ fontSize: 17, lineHeight: 1.55, color: C.inkSoft }}>
                  Rentletter drafts both documents — a cover letter and a one-page tenant resume — calibrated to what Toronto landlords actually read for.
                </p>
              </div>

              <div style={{ paddingLeft: 40, borderLeft: `1px solid ${C.rule}` }}>
                <Eyebrow>By the numbers</Eyebrow>
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {[
                    { n: '50+', l: 'applications per unit' },
                    { n: '1 in 4', l: 'applicants get rejected' },
                    { n: '$2,720', l: 'avg. 2BR you\'re after' },
                    { n: '10 sec', l: 'to land in the right pile' },
                  ].map(s => (
                    <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px dotted ${C.rule}`, paddingBottom: 12 }}>
                      <span className="serif" style={{ fontSize: 28, color: C.ink }}>{s.n}</span>
                      <span className="mono" style={{ fontSize: 11, color: C.inkMute, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 64, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => setStep('form')}
                style={{
                  background: C.ink, color: C.paper, border: 'none',
                  padding: '20px 32px', fontSize: 14, fontWeight: 500,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  cursor: 'pointer', transition: 'background 0.2s',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
                onMouseOver={e => e.currentTarget.style.background = C.accent}
                onMouseOut={e => e.currentTarget.style.background = C.ink}
              >
                Begin your letter
                <span style={{ fontSize: 18 }}>→</span>
              </button>
              <span className="mono" style={{ fontSize: 12, color: C.inkMute, letterSpacing: '0.05em' }}>
                Two minutes · From $9.99 CAD
              </span>
            </div>
          </section>

          {/* ── PROCESS ─────────────────────────────────────── */}
          <section style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${C.rule}`, background: C.paperDeep, padding: '80px 32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <div style={{ marginBottom: 48, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 1, background: C.accent }} />
                <Eyebrow num="02">The Process</Eyebrow>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1, background: C.rule, border: `1px solid ${C.rule}` }}>
                {[
                  { n: 'I', t: 'Particulars', d: 'You answer sixteen short questions — your job, your tenure, your rental history, why you\'re moving. Nothing invasive.' },
                  { n: 'II', t: 'The draft', d: 'A model trained on what landlords actually approve writes your cover letter and a one-page tenant resume. Stable. Specific. Yours.' },
                  { n: 'III', t: 'Edits & dispatch', d: 'Read it over. Change anything. Download the PDF or Word file, or receive both by email and send them on.' },
                ].map((s, i) => (
                  <div key={s.n} style={{ background: C.paper, padding: '40px 32px' }}>
                    <div className="serif" style={{ fontSize: 14, color: C.accent, fontStyle: 'italic', marginBottom: 14, letterSpacing: '0.05em' }}>
                      Step {s.n}
                    </div>
                    <h3 className="serif" style={{ fontSize: 32, color: C.ink, marginBottom: 14, lineHeight: 1.1 }}>
                      {s.t}
                    </h3>
                    <p style={{ fontSize: 15, lineHeight: 1.6, color: C.inkSoft }}>{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── PRICING ─────────────────────────────────────── */}
          <section style={{ position: 'relative', zIndex: 1, padding: '90px 32px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ marginBottom: 48, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 1, background: C.accent }} />
              <Eyebrow num="03">The Terms</Eyebrow>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32, alignItems: 'stretch' }}>
              {/* Single */}
              <div style={{ background: C.paper, border: `1px solid ${C.rule}`, padding: '36px 32px', display: 'flex', flexDirection: 'column' }}>
                <Eyebrow>One application</Eyebrow>
                <div style={{ margin: '20px 0 14px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="serif" style={{ fontSize: 72, lineHeight: 1, color: C.ink }}>$9</span>
                  <span className="serif" style={{ fontSize: 36, lineHeight: 1, color: C.ink }}>.99</span>
                  <span className="mono" style={{ fontSize: 11, color: C.inkMute, marginLeft: 4 }}>CAD</span>
                </div>
                <Rule style={{ margin: '20px 0 28px' }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 28 }}>
                  {['One cover letter', 'One tenant resume', 'PDF and Word formats', 'Delivered by email'].map(f => (
                    <li key={f} style={{ padding: '10px 0', fontSize: 14, color: C.inkSoft, display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: `1px dotted ${C.rule}` }}>
                      <span className="mono" style={{ color: C.accent, fontSize: 10 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('single'); setStep('form'); }}
                  style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '16px', fontSize: 13, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'all 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.paper; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink; }}>
                  Select single
                </button>
              </div>

              {/* Unlimited — accented */}
              <div style={{ background: C.ink, border: `1px solid ${C.ink}`, padding: '36px 32px', display: 'flex', flexDirection: 'column', position: 'relative', color: C.paper }}>
                <div style={{ position: 'absolute', top: -1, right: -1, background: C.accent, color: C.paper, padding: '6px 14px' }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Recommended</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: '#a4adbb', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Thirty-day pass</div>
                <div style={{ margin: '20px 0 14px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="serif" style={{ fontSize: 72, lineHeight: 1 }}>$19</span>
                  <span className="serif" style={{ fontSize: 36, lineHeight: 1 }}>.99</span>
                  <span className="mono" style={{ fontSize: 11, color: '#a4adbb', marginLeft: 4 }}>CAD</span>
                </div>
                <div style={{ height: 1, background: '#2a3548', margin: '20px 0 28px' }} />
                <ul style={{ listStyle: 'none', flex: 1, marginBottom: 28 }}>
                  {['Unlimited letters', 'Unlimited resumes', 'Apply with confidence', 'Thirty full days'].map(f => (
                    <li key={f} style={{ padding: '10px 0', fontSize: 14, color: '#c8cfd9', display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px dotted #2a3548' }}>
                      <span className="mono" style={{ color: C.accent, fontSize: 10 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTier('unlimited'); setStep('form'); }}
                  style={{ background: C.accent, color: C.paper, border: 'none', padding: '16px', fontSize: 13, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'background 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.background = C.accentDark}
                  onMouseOut={e => e.currentTarget.style.background = C.accent}>
                  Select pass
                </button>
              </div>
            </div>

            <p className="serif" style={{ fontStyle: 'italic', fontSize: 16, color: C.inkMute, marginTop: 32, textAlign: 'center', maxWidth: 600, margin: '32px auto 0' }}>
              Most applicants will write to ten landlords before signing a lease.
            </p>
          </section>

          {/* ── FOOTER ──────────────────────────────────────── */}
          <footer style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${C.rule}`, padding: '40px 32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <Wordmark />
              <div className="mono" style={{ fontSize: 11, color: C.inkMute, letterSpacing: '0.08em' }}>
                For informational use. Not legal advice.
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
        <Head><title>Particulars — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <button onClick={() => setStep('landing')} className="mono" style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ← Return
            </button>
          </header>

          <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 32px 80px' }}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 1, background: C.accent }} />
              <Eyebrow num="01">Particulars</Eyebrow>
            </div>
            <h1 className="serif" style={{ fontSize: 56, lineHeight: 1, color: C.ink, marginBottom: 20, letterSpacing: '-0.02em' }}>
              Tell us about <span style={{ fontStyle: 'italic' }}>yourself.</span>
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 48, lineHeight: 1.6, maxWidth: 540 }}>
              The more specific the answers, the more personal the letter. Skip anything that doesn't apply.
            </p>

            {error && (
              <div style={{ background: '#fef2f0', border: `1px solid ${C.accent}`, padding: '14px 18px', marginBottom: 32, color: C.accentDark, fontSize: 14 }}>
                {error}
              </div>
            )}

            <FormSection num="i" title="Where to send it" required>
              <Field label="Your email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" type="email" />
              <p className="mono" style={{ fontSize: 11, color: C.inkMute, letterSpacing: '0.04em' }}>
                Documents arrive in PDF and Word when ready.
              </p>
            </FormSection>

            <FormSection num="ii" title="The apartment">
              <Field label="Address" value={form.apartmentAddress} onChange={v => update('apartmentAddress', v)} placeholder="123 King St W, Toronto" />
              <Field label="Brief description" value={form.apartmentDescription} onChange={v => update('apartmentDescription', v)} placeholder="2BR condo, downtown, $2,400/mo" />
            </FormSection>

            <FormSection num="iii" title="About you" required>
              <Field label="Full name" value={form.fullName} onChange={v => update('fullName', v)} placeholder="Jane Doe" />
              <Field label="Age" value={form.age} onChange={v => update('age', v)} placeholder="28" type="number" />
            </FormSection>

            <FormSection num="iv" title="Employment" required>
              <Field label="Job title" value={form.jobTitle} onChange={v => update('jobTitle', v)} placeholder="Software engineer" />
              <Field label="Employer" value={form.employer} onChange={v => update('employer', v)} placeholder="Shopify" />
              <Field label="Years at this job" value={form.yearsAtJob} onChange={v => update('yearsAtJob', v)} placeholder="3" />
              <Field label="Annual income (CAD)" value={form.annualIncome} onChange={v => update('annualIncome', v)} placeholder="85,000" type="number" />
            </FormSection>

            <FormSection num="v" title="Rental history">
              <Field label="Previous address" value={form.previousAddress} onChange={v => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
              <Field label="Years there" value={form.yearsAtPrevious} onChange={v => update('yearsAtPrevious', v)} placeholder="2" />
              <Field label="Previous landlord name" value={form.previousLandlordName} onChange={v => update('previousLandlordName', v)} placeholder="John Smith" />
              <Field label="Landlord contact" value={form.previousLandlordContact} onChange={v => update('previousLandlordContact', v)} placeholder="phone or email" />
            </FormSection>

            <FormSection num="vi" title="Your move" required>
              <Field label="Desired move-in date" value={form.moveInDate} onChange={v => update('moveInDate', v)} type="date" />
              <Textarea label="Why are you moving?" value={form.reasonForMoving} onChange={v => update('reasonForMoving', v)} placeholder="New job downtown, lease ending, want shorter commute..." />
            </FormSection>

            <FormSection num="vii" title="Personal">
              <Textarea label="Lifestyle and habits" value={form.personality} onChange={v => update('personality', v)} placeholder="Quiet, work from home most days, into cooking and running. Non-smoker." />
              <Field label="Pets" value={form.pets} onChange={v => update('pets', v)} placeholder="One small cat, indoor only" />
              <Textarea label="Anything to address?" value={form.redFlags} onChange={v => update('redFlags', v)} placeholder="Bad credit, gap in history, etc. Skip if not applicable." />
            </FormSection>

            {/* Receipt-style summary */}
            <div style={{ marginTop: 56, background: C.paper, border: `1px solid ${C.ink}`, padding: '28px 32px' }}>
              <Eyebrow>Receipt</Eyebrow>
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 14, borderBottom: `1px dashed ${C.rule}` }}>
                <span style={{ fontSize: 15, color: C.inkSoft }}>{tier === 'single' ? 'Single letter' : 'Thirty-day pass'}</span>
                <span className="mono" style={{ fontSize: 13, color: C.inkSoft }}>1 ×</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: C.inkMute, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="mono">Total</span>
                <span className="serif" style={{ fontSize: 36, color: C.ink }}>${tier === 'single' ? '9.99' : '19.99'}</span>
              </div>
              <button
                onClick={handlePay}
                disabled={!isFormValid()}
                style={{
                  width: '100%', marginTop: 24,
                  background: isFormValid() ? C.ink : '#c8c2b3',
                  color: C.paper, border: 'none', padding: '18px',
                  fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: isFormValid() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => { if (isFormValid()) e.currentTarget.style.background = C.accent; }}
                onMouseOut={e => { if (isFormValid()) e.currentTarget.style.background = C.ink; }}
              >
                {isFormValid() ? `Proceed to payment — $${tier === 'single' ? '9.99' : '19.99'}` : 'Complete required fields above'}
              </button>
              <p className="mono" style={{ fontSize: 10, color: C.inkMute, marginTop: 14, textAlign: 'center', letterSpacing: '0.05em' }}>
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
        <Head><title>Drafting — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ display: 'inline-flex', gap: 6, marginBottom: 32 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.ink, animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.ink, animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, background: C.accent, animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </div>
            <Eyebrow num="02">In Draft</Eyebrow>
            <h2 className="serif" style={{ fontSize: 48, marginTop: 16, marginBottom: 16, lineHeight: 1.05, color: C.ink }}>
              Composing your <span style={{ fontStyle: 'italic' }}>letter.</span>
            </h2>
            <p style={{ color: C.inkSoft, fontSize: 15, lineHeight: 1.6 }}>
              Approximately twenty seconds. Please do not refresh.
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
        <Head><title>Your Letter — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <button onClick={startOver} className="mono" style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Start fresh
            </button>
          </header>

          <div style={{ maxWidth: 820, margin: '0 auto', padding: '60px 32px 80px' }}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 1, background: C.accent }} />
              <Eyebrow num="03">Delivered</Eyebrow>
            </div>
            <h1 className="serif" style={{ fontSize: 56, lineHeight: 1, color: C.ink, marginBottom: 14, letterSpacing: '-0.02em' }}>
              Your letter is <span style={{ fontStyle: 'italic' }}>ready.</span>
            </h1>
            <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 40, lineHeight: 1.6, maxWidth: 540 }}>
              Read it through. Edit anything you'd like — changes save automatically.
            </p>

            {/* Email status */}
            {form.email && (
              <div style={{
                background: emailSent ? '#f0f5f1' : '#faf6e8',
                border: `1px solid ${emailSent ? '#c8d8cc' : '#e0d5a8'}`,
                padding: '14px 18px', marginBottom: 28, fontSize: 14,
                color: emailSent ? C.success : '#665a1f',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {emailSending ? 'In transit' : emailSent ? 'Sent' : 'Queued'}
                </span>
                <span style={{ color: C.rule }}>·</span>
                <span>
                  {emailSending ? `Delivering to ${form.email}` : emailSent ? `Documents sent to ${form.email}` : `Documents will arrive at ${form.email}`}
                </span>
              </div>
            )}

            {/* Download bar */}
            <div style={{ background: C.ink, color: C.paper, padding: '20px 24px', marginBottom: 32, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a4adbb', flex: 1, minWidth: 180 }}>
                Download finished letter
              </span>
              <button onClick={() => downloadFile('pdf')}
                style={{ background: C.accent, color: C.paper, border: 'none', padding: '12px 22px', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                PDF ↓
              </button>
              <button onClick={() => downloadFile('docx')}
                style={{ background: C.paper, color: C.ink, border: 'none', padding: '12px 22px', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Word ↓
              </button>
              {form.email && !emailSent && (
                <button onClick={() => sendEmail(form.email, form.fullName, letter, resume)} disabled={emailSending}
                  style={{ background: 'transparent', color: C.paper, border: `1px solid ${C.inkSoft}`, padding: '12px 22px', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {emailSending ? 'Sending' : 'Resend ✉'}
                </button>
              )}
            </div>

            {/* Cover Letter */}
            <ResultDoc title="The Cover Letter" subtitle="Editable">
              <textarea value={letter} onChange={e => updateLetter(e.target.value)}
                style={resultTextarea} />
              <ResultActions>
                <button onClick={() => copyText(letter, setCopiedLetter)} style={copyBtn}>
                  {copiedLetter ? '✓ Copied' : 'Copy text'}
                </button>
              </ResultActions>
            </ResultDoc>

            {/* Resume */}
            <ResultDoc title="The Tenant Resume" subtitle="Editable">
              <textarea value={resume} onChange={e => updateResume(e.target.value)}
                style={{ ...resultTextarea, minHeight: 320, fontSize: 13 }} />
              <ResultActions>
                <button onClick={() => copyText(resume, setCopiedResume)} style={copyBtn}>
                  {copiedResume ? '✓ Copied' : 'Copy text'}
                </button>
              </ResultActions>
            </ResultDoc>

            <button onClick={startOver} className="mono"
              style={{ marginTop: 32, background: 'transparent', border: `1px solid ${C.ink}`, color: C.ink, padding: '14px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Begin a new letter
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}

// ─── DOC WRAPPER FOR RESULT PAGE ──────────────────────────────
const resultTextarea = {
  width: '100%', minHeight: 460, padding: 28,
  fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.7,
  color: '#0e1a2b', background: '#fafaf5',
  border: 'none', outline: 'none', resize: 'vertical',
};
const copyBtn = {
  background: '#0e1a2b', color: '#f4f1ea', border: 'none',
  padding: '10px 20px', fontSize: 11, fontWeight: 500,
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

function ResultDoc({ title, subtitle, children }) {
  return (
    <div style={{ background: '#fafaf5', border: `1px solid ${C.rule}`, marginBottom: 24, position: 'relative' }}>
      <div style={{ padding: '22px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="serif" style={{ fontSize: 26, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h2>
        <span className="mono" style={{ fontSize: 10, color: C.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{subtitle}</span>
      </div>
      <div style={{ padding: '14px 28px 0' }}>
        <Rule />
      </div>
      {children}
    </div>
  );
}

function ResultActions({ children }) {
  return (
    <div style={{ padding: '16px 28px 22px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${C.rule}` }}>
      {children}
    </div>
  );
}

// ─── FORM SECTION ─────────────────────────────────────────────
function FormSection({ num, title, required, children }) {
  return (
    <div style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span className="mono" style={{ fontSize: 11, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>§ {num}</span>
        <h3 className="serif" style={{ fontSize: 22, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h3>
        {required && <span className="mono" style={{ fontSize: 9, color: C.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Required</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="mono" style={{ display: 'block', fontSize: 11, color: C.inkMute, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</label>
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
      <label className="mono" style={{ display: 'block', fontSize: 11, color: C.inkMute, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</label>
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
