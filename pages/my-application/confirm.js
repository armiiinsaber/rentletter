// /my-application/confirm?t=…[&k=email]  The interstitial behind the magic link and the email
// change link. The page READS the token (peek, never consume) and writes nothing on load: mail
// scanners open every link before the person does. The action is a tap: one form button that
// POSTs the token to the route, which consumes it, sets the session or completes the change,
// and redirects. An expired or used token renders one line and no button. Same shape as /keep.
// Sandbox tokens: demo-ok, demo-email, demo-expired.
import Head from 'next/head';
import { isSandboxToken } from '../../lib/features';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { C, R } from '../../components/theme';

export async function getServerSideProps(ctx) {
  const t = String(ctx.query?.t || '');
  const kind = ctx.query?.k === 'email' ? 'email' : 'magic';
  if (isSandboxToken(t)) return { props: { t, kind: t === 'demo-email' ? 'email' : kind, state: t === 'demo-expired' ? 'expired' : 'ready' } };
  try {
    const { kvReady, peekMagicLink, peekEmailChange } = await import('../../lib/tenantProfileStore');
    if (!kvReady()) return { props: { t, kind, state: 'unavailable' } };
    const rec = kind === 'email' ? await peekEmailChange(t) : await peekMagicLink(t);
    return { props: { t, kind, state: rec ? 'ready' : 'expired' } };
  } catch (e) {
    console.error('[my-application/confirm] failed:', e?.message || e);
    return { props: { t, kind, state: 'unavailable' } };
  }
}

export const CONFIRM_COPY = {
  magic: { line: 'Tap once to open your profile. Nothing happens until you do.', button: 'Open my profile', action: '/api/tenant/verify' },
  email: { line: 'Tap once to make this address the one you sign in with.', button: 'Confirm new email', action: '/api/tenant/verify-email-change' },
  expired: 'This link has expired. Request a fresh one from your profile page.',
  unavailable: 'We could not check that link right now. Please try it again in a moment.',
};

export default function ConfirmPage({ t, kind, state }) {
  const copy = CONFIRM_COPY[kind] || CONFIRM_COPY.magic;
  const isDemo = isSandboxToken(t);
  return (
    <>
      <Head><title>Confirm · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Profile</span>
        </header>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 80px' }}>
          <div className="rl-card" style={{ padding: 'clamp(22px, 5vw, 32px)' }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{kind === 'email' ? 'Email change' : 'Your profile'}</div>
            {state === 'ready' ? (
              <>
                <p style={{ fontSize: 16, color: C.ink, lineHeight: 1.6, margin: '0 0 18px', textWrap: 'pretty' }}>{copy.line}</p>
                <form method="post" action={isDemo ? '/my-application' : copy.action} onSubmit={isDemo ? (e) => { e.preventDefault(); window.location.href = '/my-application'; } : undefined}>
                  <input type="hidden" name="t" value={t} />
                  <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 22px', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{copy.button}</button>
                </form>
              </>
            ) : (
              <p style={{ fontSize: 16, color: C.ink, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>{state === 'expired' ? CONFIRM_COPY.expired : CONFIRM_COPY.unavailable}</p>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
