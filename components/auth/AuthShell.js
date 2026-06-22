// components/auth/AuthShell.js
// Shared layout for the realtor auth screens (sign in / up / reset). Brand
// paper background, centered rounded card, wordmark. Presentation only.
import Head from 'next/head';
import { GlobalStyle, Wordmark } from '../ui';
import { C, R, SH } from '../theme';

export default function AuthShell({ title, eyebrow, heading, sub, children, footer }) {
  return (
    <>
      <Head>
        <title>{title} — Rentletter</title>
        <meta name="description" content="Rentletter realtor dashboard." />
      </Head>
      <GlobalStyle />
      <div style={{
        minHeight: '100vh', background: C.paper, color: C.ink,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 'clamp(20px, 5vw, 48px) clamp(16px, 4vw, 32px)',
      }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}>
            <a href="/" style={{ textDecoration: 'none' }}><Wordmark size="lg" /></a>
          </div>
          <div className="rl-card" style={{ padding: 'clamp(24px, 5vw, 36px)' }}>
            {eyebrow && (
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                {eyebrow}
              </div>
            )}
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: sub ? 8 : 22 }}>
              {heading}
            </h1>
            {sub && (
              <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 22 }}>{sub}</p>
            )}
            {children}
          </div>
          {footer && (
            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5, color: C.inkSoft }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Shared input + button styles for the auth forms.
export const authInputStyle = {
  width: '100%', padding: '13px 15px', fontSize: 15,
  border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl,
  background: C.paper, color: C.ink, outline: 'none', marginBottom: 4,
};

export function authButtonStyle(enabled) {
  return {
    width: '100%', borderRadius: R.ctrl, border: 'none',
    background: enabled ? C.red : '#c8c2b3', color: C.paper,
    padding: '15px', fontSize: 15, fontWeight: 700, marginTop: 8,
    cursor: enabled ? 'pointer' : 'not-allowed', minHeight: 52,
  };
}

export const authErrorStyle = {
  marginBottom: 12, padding: '10px 14px', background: '#fef2f0',
  borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`,
  fontSize: 13, color: C.ink,
};

export const authNoticeStyle = {
  marginBottom: 12, padding: '12px 14px', background: '#f0f7f3',
  borderRadius: R.ctrl, borderLeft: `3px solid ${C.green}`,
  fontSize: 13.5, color: C.ink, lineHeight: 1.5,
};

export const authLabelStyle = {
  display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600,
  letterSpacing: '0.04em', marginBottom: 6, marginTop: 14,
};
