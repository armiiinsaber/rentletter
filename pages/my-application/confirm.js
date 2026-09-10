// /my-application/confirm?t=…[&k=email]  The interstitial behind the magic link and the email
// change link. The page READS the token (peek, never consume) and writes nothing on load: mail
// scanners open every link before the person does. The action is a tap: one form button that
// POSTs the token to the route, which consumes it, sets the session or completes the change,
// and redirects. An expired or used token renders one line and no button. Same shape as /keep.
// Sandbox tokens: demo-ok, demo-email, demo-expired.
import Head from 'next/head';
import { isSandboxToken } from '../../lib/features';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { C } from '../../components/theme';
import { ProfileStyles, Eyebrow, noWidow } from '../../components/tenant/ProfileFacts';

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
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">
        <header className="mp-header">
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span className="mp-note">Profile</span>
        </header>
        <main className="mp-wrap">
          <div className="rl-card mp-card">
            <Eyebrow>{kind === 'email' ? 'Email change' : 'Your profile'}</Eyebrow>
            {state === 'ready' ? (
              <>
                <p className="mp-p" style={{ marginTop: 'var(--gap-line)', color: C.ink }}>{noWidow(copy.line)}</p>
                <form method="post" action={isDemo ? '/my-application' : copy.action} onSubmit={isDemo ? (e) => { e.preventDefault(); window.location.href = '/my-application'; } : undefined} style={{ marginTop: 'var(--gap-card)' }}>
                  <input type="hidden" name="t" value={t} />
                  <button type="submit" className="mp-btn mp-btn-auto">{copy.button}</button>
                </form>
              </>
            ) : (
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)', color: C.ink }}>{noWidow(state === 'expired' ? CONFIRM_COPY.expired : CONFIRM_COPY.unavailable)}</p>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
