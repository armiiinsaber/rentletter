// pages/join/index.js — a realtor's own invite link: /join?invite=<code> (Invite a realtor,
// lib/realtorInvite.js). PUBLIC, paper treatment, the same shape as the personal invitation
// beside it (pages/join/[code].js). The page itself stores nothing and looks nothing up: the
// first touch cookie is set by the app shell on landing (pages/_app.js rememberFirstTouch,
// lib/signupSource.js), and the invite is credited only when a signup is completed
// (pages/auth/callback.js). A visit alone credits nobody. An address without a code of the right
// shape goes to the ordinary signup. It does not carry the app head (components/AppHead.js): the
// list of pages that do is fixed (tests/brand.test.mjs).
import Head from 'next/head';
import { C } from '../../components/theme';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { isInviteCode } from '../../lib/signupSource';

export async function getServerSideProps({ query, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  const invite = typeof query.invite === 'string' ? query.invite : '';
  if (!isInviteCode(invite)) return { redirect: { destination: '/signup', permanent: false } };
  return { props: {} };
}

export default function JoinByInvite() {
  return (
    <>
      <Head><title>Join Rentletter</title><meta name="robots" content="noindex, nofollow" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <GlobalStyle />
      <main data-realtor-invite-landing="" style={{ minHeight: '100dvh', background: C.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'max(24px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))', textAlign: 'center' }}>
        <div style={{ marginBottom: 'clamp(28px, 6vh, 48px)' }}><a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark size="auth" /></a></div>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <span aria-hidden="true" style={{ display: 'block', width: 26, height: 3, background: C.red, borderRadius: 1, margin: '0 auto 18px' }} />
          <h1 className="rl-serif" style={{ fontSize: 'clamp(28px, 6vw, 40px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 14, textWrap: 'balance' }}>A realtor invited you to Rentletter.</h1>
          <p style={{ fontSize: 16.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 26, textWrap: 'balance' }}>A full background check on every applicant. Read and organized, so you close sooner with confidence.</p>
          <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '0 var(--gap-card)', background: C.redFill, color: C.onRed, borderRadius: 'var(--btn-radius)', fontSize: 16, fontWeight: 700, textDecoration: 'none', width: '100%', maxWidth: 320 }}>Create your account</a>
          <p style={{ fontSize: 13, color: C.inkMute, marginTop: 16, lineHeight: 1.5, textWrap: 'balance' }}>Already have an account? <a href="/signin" style={{ color: C.ink, fontWeight: 600 }}>Sign in</a></p>
        </div>
      </main>
    </>
  );
}
