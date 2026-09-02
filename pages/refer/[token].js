// pages/refer/[token].js
// PUBLIC applicant CONSENT page for a realtor→realtor referral. Reached only from the
// applicant's email (single-use token, 7-day TTL, hashed in KV). Shows exactly who would
// receive the application and exactly which facts — then Approve / Decline, equally weighted.
// Nothing is shared until Approve. Static header, reduced-motion-safe (no animation).
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C, R } from '../../components/theme';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';

const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ''; } };

export default function ReferralConsent() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | gone | done
  const [decision, setDecision] = useState(null); // 'approve' | 'decline'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    (async () => {
      try {
        const r = await fetch(`/api/referrals/consent?t=${encodeURIComponent(token)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setPhase('gone'); setError(j?.error || ''); return; }
        setData(j); setPhase(j.status === 'pending' ? 'ready' : 'gone');
      } catch (e) { setPhase('gone'); }
    })();
  }, [router.isReady, token]);

  const decide = async (d) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/referrals/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, decision: d }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Something went wrong.');
      setDecision(d); setPhase('done');
      window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const from = data?.from?.name ? `${data.from.name}${data.from.brokerage ? ` (${data.from.brokerage})` : ''}` : 'Your realtor';
  const to = data?.to?.name ? `${data.to.name}${data.to.brokerage ? ` at ${data.to.brokerage}` : ''}` : 'another realtor';
  const Eyebrow = ({ children, color = C.red }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span aria-hidden="true" style={{ width: 22, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span>
    </div>
  );

  return (
    <>
      <Head><title>Share your application? — Rentletter</title><meta name="robots" content="noindex, nofollow" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Referral consent</span>
        </header>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(28px, 5vw, 48px) clamp(16px, 4vw, 32px) 72px' }}>
          {phase === 'loading' && <p style={{ color: C.inkSoft }}>Loading…</p>}

          {phase === 'gone' && (
            <div className="rl-card" style={{ padding: 'clamp(22px, 5vw, 32px)' }}>
              <Eyebrow color={C.inkMute}>Referral</Eyebrow>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 34px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>
                {data?.status === 'approved' ? 'You already approved this referral.' : data?.status === 'declined' ? 'You already declined this referral.' : 'This link has expired or was already used.'}
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6 }}>
                {data?.status === 'approved' ? 'If you change your mind, you can revoke it from your profile at any time.' : data?.status === 'declined' ? 'Nothing was shared. Your current application is unaffected.' : 'Referral links work once and expire after 7 days. If a realtor still wants to refer you, they can send a new request — and you can still decline it.'}
              </p>
              <a href="/my-application" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, color: C.red, fontWeight: 700, textDecoration: 'none' }}>My profile <Icon name="arrow" size={14} /></a>
            </div>
          )}

          {phase === 'done' && (
            <div className="rl-card" style={{ padding: 'clamp(22px, 5vw, 32px)' }}>
              <Eyebrow color={decision === 'approve' ? C.green : C.inkMute}>{decision === 'approve' ? 'Shared' : 'Not shared'}</Eyebrow>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 34px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>
                {decision === 'approve' ? `Your application is on its way to ${data?.to?.name || 'them'}.` : 'Declined. Nothing was shared.'}
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6 }}>
                {decision === 'approve'
                  ? `${data?.to?.name || 'The receiving realtor'} gets a copy of your details to match against their listings. It appears in your profile as its own application, with its own lookup history — and you can revoke it there at any time, which removes their access going forward.`
                  : `${data?.from?.name || 'Your realtor'} will only see that you declined — no reason is collected. Your existing application with them is unchanged.`}
              </p>
              <a href="/my-application" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, color: C.red, fontWeight: 700, textDecoration: 'none' }}>Open my profile <Icon name="arrow" size={14} /></a>
            </div>
          )}

          {phase === 'ready' && data && (
            <>
              <Eyebrow>Your approval is needed</Eyebrow>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(28px, 6vw, 42px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 14, textWrap: 'balance' }}>
                Share your application with {data.to?.name || 'another realtor'}?
              </h1>
              <p style={{ fontSize: 15.5, color: C.inkSoft, lineHeight: 1.6, marginBottom: 8 }}>
                <strong style={{ color: C.ink }}>{from}</strong> thinks <strong style={{ color: C.ink }}>{to}</strong> may have units that fit you, and would like to pass your rental application along.
              </p>
              {data.note && <blockquote style={{ margin: '10px 0 18px', paddingLeft: 14, borderLeft: `3px solid ${C.rule}`, fontSize: 14, color: C.inkSoft, lineHeight: 1.55, fontStyle: 'italic' }}>“{data.note}” — {data.from?.name || 'your realtor'}</blockquote>}

              <div className="rl-card" style={{ padding: 'clamp(16px, 4vw, 22px)', marginTop: 18, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Exactly what would be shared</div>
                <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
                  {data.factsSource === 'profile' ? 'These are your current profile details.' : 'These are the details from your application.'} Nothing else — not your other applications, not your documents, not your owner key.
                </p>
                <div style={{ display: 'grid', gap: 0 }}>
                  {data.fields.map((f) => (
                    <div key={f.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 150px) 1fr', gap: '2px 14px', padding: '8px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                      <span style={{ color: C.inkMute, fontWeight: 600, fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase', paddingTop: 2 }}>{f.label}</span>
                      <span style={{ color: f.value ? C.ink : C.inkMute, fontWeight: f.value ? 600 : 500, overflowWrap: 'anywhere', lineHeight: 1.5 }}>{f.value || 'Not provided'}</span>
                    </div>
                  ))}
                </div>
                {data.verification && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
                    Also shared: a <strong style={{ color: C.ink }}>summary</strong> of the document check {from.split(' (')[0]} ran{data.verification.analyzedAt ? ` on ${dateLong(data.verification.analyzedAt)}` : ''}, which facts matched, and when. The documents themselves stay with that realtor for 14 days at most and are not shared.
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 14px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 20 }}>
                Either choice is fine. Declining changes nothing about your application with {data.from?.name || 'your current realtor'}, and they won’t be told why. Approving lets you revoke later from your profile.
              </div>

              {error && <div role="alert" style={{ marginBottom: 14, padding: '11px 14px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <button type="button" onClick={() => decide('decline')} disabled={busy} className="rl-btn"
                  style={{ background: C.paper, color: C.ink, border: `2px solid ${C.ink}`, borderRadius: R.ctrl, padding: '15px 18px', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', minHeight: 54 }}>
                  Decline — don’t share
                </button>
                <button type="button" onClick={() => decide('approve')} disabled={busy} className="rl-btn"
                  style={{ background: C.ink, color: C.paper, border: `2px solid ${C.ink}`, borderRadius: R.ctrl, padding: '15px 18px', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', minHeight: 54 }}>
                  {busy ? 'Working…' : `Approve — share with ${data.to?.name?.split(' ')[0] || 'them'}`}
                </button>
              </div>
              <p style={{ marginTop: 14, fontSize: 12, color: C.inkMute, lineHeight: 1.5, textAlign: 'center' }}>This link works once{data.expiresAt ? ` and expires ${dateLong(data.expiresAt)}` : ''}.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
