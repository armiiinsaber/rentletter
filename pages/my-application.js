import { useState, useEffect } from 'react';
import Head from 'next/head';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, ScrollHeader, Icon } from '../components/ui';

export default function MyApplication() {
  const [step, setStep] = useState('input'); // 'input' | 'loaded'
  const [appNumber, setAppNumber] = useState('');
  const [ownerToken, setOwnerToken] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Pre-fill from URL parameters or localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlApp = params.get('app');
    const urlToken = params.get('token');
    const storedApp = localStorage.getItem('rentletter_app_number');
    const storedToken = localStorage.getItem('rentletter_owner_token');

    const app = urlApp || storedApp;
    const tok = urlToken || storedToken;

    if (app && tok) {
      setAppNumber(app);
      setOwnerToken(tok);
      // Auto-load
      loadAudit(app, tok);
    } else if (app) {
      setAppNumber(app);
    }
  }, []);

  const loadAudit = async (app, tok) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/application/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationNumber: app, ownerToken: tok, action: 'view' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setStep('loaded');
      // Save for return visits
      localStorage.setItem('rentletter_app_number', app);
      localStorage.setItem('rentletter_owner_token', tok);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const performAction = async (action) => {
    if (action === 'revoke' && !confirm('Revoke this application? Anyone with the application number will no longer be able to view it. You can un-revoke later if you change your mind.')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/application/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationNumber: appNumber, ownerToken, action }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // Reload the data
      await loadAudit(appNumber, ownerToken);
    } catch (e) {
      setError(e.message);
    }
    setActionLoading(false);
  };

  const formatTimeAgo = (iso) => {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const d = Math.floor(hr / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  };

  // ════════════════════════════════════════════════════════════
  // INPUT STEP — ask for app number + owner token
  // ════════════════════════════════════════════════════════════
  if (step === 'input') {
    return (
      <>
        <Head><title>Manage your application — Rentletter</title></Head>
        <GlobalStyle />
        <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', flexDirection: 'column' }}>
          <ScrollHeader>
            <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
            <a href="/" style={{ color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Home
            </a>
          </ScrollHeader>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(24px, 5vw, 48px) clamp(20px, 4vw, 32px)' }}>
            <div style={{ maxWidth: 520, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span style={{ width: 28, height: 2, background: C.red, borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  My application
                </span>
              </div>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(32px, 5.5vw, 48px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 18 }}>
                See who viewed your application. Revoke it if you need to.
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, marginBottom: 32 }}>
                Enter your application number and owner token. You received both when you first generated your Rentletter application — check your confirmation email.
              </p>

              <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Application number
              </label>
              <input
                value={appNumber}
                onChange={e => setAppNumber(e.target.value.toUpperCase())}
                placeholder="RL-2026-XXXX-XXXX"
                style={{
                  width: '100%', padding: '15px 16px', fontSize: 15,
                  fontFamily: 'monospace', letterSpacing: '0.04em',
                  border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink,
                  outline: 'none', marginBottom: 20,
                }}
              />

              <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Owner token
              </label>
              <input
                value={ownerToken}
                onChange={e => setOwnerToken(e.target.value.toUpperCase())}
                placeholder="32-character code"
                style={{
                  width: '100%', padding: '15px 16px', fontSize: 14,
                  fontFamily: 'monospace', letterSpacing: '0.02em',
                  border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink,
                  outline: 'none', marginBottom: 16,
                }}
              />

              {error && (
                <div style={{ marginBottom: 14, padding: '11px 14px', background: C.redTint, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink }}>
                  {error}
                </div>
              )}

              <button
                onClick={() => loadAudit(appNumber, ownerToken)}
                disabled={loading || !appNumber || !ownerToken}
                className="rl-btn"
                style={{
                  width: '100%',
                  background: (loading || !appNumber || !ownerToken) ? '#c8c2b3' : C.ink,
                  color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '16px',
                  fontSize: 15, fontWeight: 600,
                  cursor: (loading || !appNumber || !ownerToken) ? 'not-allowed' : 'pointer',
                }}>
                {loading ? 'Loading...' : 'View my application →'}
              </button>

              <div style={{ marginTop: 32, padding: '14px 16px', background: '#fafaf5', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
                <strong style={{ color: C.ink }}>Don't have your owner token?</strong> Check the confirmation email we sent when you generated your application. Search your inbox for "Rentletter."
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  // LOADED STEP — show audit log and revoke control
  // ════════════════════════════════════════════════════════════
  return (
    <>
      <Head><title>My application — Rentletter</title></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <ScrollHeader maxWidth={760}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <button onClick={() => { setStep('input'); setData(null); setOwnerToken(''); localStorage.removeItem('rentletter_owner_token'); }}
            style={{ background: 'transparent', color: C.inkSoft, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Sign out
          </button>
        </ScrollHeader>

        <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 32px) 64px' }}>

          {/* Application card */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'monospace' }}>
              {appNumber}
              {data?.revoked && (
                <span style={{
                  marginLeft: 12, background: C.red, color: C.paper,
                  padding: '3px 9px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em',
                }}>
                  Revoked
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 12 }}>
              Your application activity.
            </h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, maxWidth: 540 }}>
              Every time a landlord looks up your application, it's logged below. You can revoke the application at any time — landlords will see a "revoked" message instead of your data.
            </p>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14,
            marginBottom: 32,
          }}>
            <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: '20px' }}>
              <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Lookups
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {data?.lookupCount || 0}
              </div>
            </div>
            <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: '20px' }}>
              <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Status
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: data?.revoked ? C.red : C.green, letterSpacing: '-0.01em' }}>
                {data?.revoked ? '✗ Revoked' : '✓ Active'}
              </div>
            </div>
            <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: '20px' }}>
              <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Created
              </div>
              <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                {data?.createdAt ? new Date(data.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
          </div>

          {/* Revoke/un-revoke control */}
          <div style={{ background: C.ink, color: C.paper, padding: '24px 28px', marginBottom: 32, position: 'relative', overflow: 'hidden', borderRadius: R.card }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: C.red }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Privacy control
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                  {data?.revoked ? 'Application is revoked' : 'Application is currently active'}
                </div>
                <div style={{ fontSize: 13, color: '#a4adbb', lineHeight: 1.55 }}>
                  {data?.revoked
                    ? 'Landlords with your application number see a "revoked" message instead of your data.'
                    : 'Anyone with your application number can view your full profile. If that changes, you can revoke any time.'}
                </div>
              </div>
              <button
                onClick={() => performAction(data?.revoked ? 'unrevoke' : 'revoke')}
                disabled={actionLoading}
                style={{
                  background: data?.revoked ? C.green : C.red,
                  color: C.paper, border: 'none',
                  padding: '14px 22px', fontSize: 14, fontWeight: 700,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.5 : 1,
                }}>
                {actionLoading ? 'Working...' : (data?.revoked ? 'Reactivate application' : 'Revoke now')}
              </button>
            </div>
          </div>

          {/* Audit log */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', marginBottom: 16 }}>
              Lookup history
            </h2>
            {(data?.lookups || []).length === 0 ? (
              <div style={{ padding: '32px 24px', background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card, textAlign: 'center', fontSize: 14, color: C.inkSoft }}>
                No one has looked up your application yet. Share your number with the landlords you're applying to.
              </div>
            ) : (
              <div className="rl-card" style={{ overflow: 'hidden' }}>
                {[...(data.lookups || [])].reverse().map((entry, idx) => (
                  <div key={idx} style={{
                    padding: '14px 18px',
                    borderBottom: idx < data.lookups.length - 1 ? `1px solid ${C.rule}` : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 12,
                    background: idx === 0 ? '#fafaf5' : C.paper,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                        Viewer {entry.ipHash || 'unknown'}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMute }}>
                        {entry.uaShort ? entry.uaShort.split(' ').slice(0, 4).join(' ') : 'Unknown device'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.inkSoft, textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: C.ink }}>{formatTimeAgo(entry.at)}</div>
                      <div style={{ color: C.inkMute, fontSize: 11 }}>
                        {new Date(entry.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ marginTop: 16, fontSize: 12, color: C.inkMute, lineHeight: 1.55 }}>
              Viewer identifiers are hashed for privacy — we don't store full IP addresses. A repeating identifier means the same person looked you up more than once.
            </p>
          </div>

          {error && (
            <div style={{ marginTop: 20, padding: '12px 16px', background: C.redTint, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
