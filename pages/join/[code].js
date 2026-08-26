// pages/join/[code].js — the personal invitation link. PUBLIC, paper treatment.
// Server side: validates the code directly (lib/promos, no HTTP hop) and, when it's live, drops
// it in an HttpOnly rl_promo cookie (30 days, SameSite=Lax) so it survives the signup round
// trip; the auth callback redeems it once the account exists. A dead or spent link gets a
// neutral page and the normal signup — no scolding.
import Head from 'next/head';
import { C, R } from '../../components/theme';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { validatePromoCode, normalizeCode, CODE_RE } from '../../lib/promos';

export const PROMO_COOKIE = 'rl_promo';
const THIRTY_DAYS = 30 * 24 * 3600;

export async function getServerSideProps({ params, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  const code = normalizeCode(params?.code);
  let v = { valid: false };
  if (CODE_RE.test(code) && process.env.SUPABASE_SERVICE_ROLE_KEY) { try { v = await validatePromoCode(code); } catch (e) { v = { valid: false }; } }
  if (v.valid) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${PROMO_COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS}${secure}`);
  }
  return { props: { code, valid: !!v.valid, recipientName: v.recipientName || null, grantType: v.grantType || null, trialDays: v.trialDays || null } };
}

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const grantLine = (grantType, trialDays) => {
  if (grantType === 'lifetime') return 'Free for life, founding member.';
  if (!trialDays) return 'Free to start, no card required.';
  if (trialDays % 30 === 0) { const m = trialDays / 30; return `${m === 1 ? 'One month' : `${m} months`} free, no card required.`; }
  if (trialDays % 7 === 0) { const w = trialDays / 7; return `${w === 1 ? 'One week' : `${w} weeks`} free, no card required.`; }
  return `${trialDays} days free, no card required.`;
};

export default function Join({ valid, recipientName, grantType, trialDays }) {
  const name = firstName(recipientName);
  return (
    <>
      <Head><title>{valid ? 'Your access to Rentletter' : 'Rentletter'}</title><meta name="robots" content="noindex, nofollow" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100dvh', background: C.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'max(24px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))', textAlign: 'center' }}>
        <div style={{ marginBottom: 'clamp(28px, 6vh, 48px)' }}><Wordmark size="lg" /></div>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <span aria-hidden="true" style={{ display: 'block', width: 26, height: 3, background: C.red, borderRadius: 1, margin: '0 auto 18px' }} />
          {valid ? (
            <>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(28px, 6vw, 40px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 14, textWrap: 'balance' }}>
                {name ? `${name}, your access to Rentletter is ready.` : 'Your access to Rentletter is ready.'}
              </h1>
              <p style={{ fontSize: 16.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 26, textWrap: 'balance' }}>{grantLine(grantType, trialDays)}</p>
              <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '0 28px', background: C.red, color: C.paper, borderRadius: R.ctrl, fontSize: 16, fontWeight: 700, textDecoration: 'none', width: '100%', maxWidth: 320 }}>Create your account</a>
              <p style={{ fontSize: 13, color: C.inkMute, marginTop: 16, lineHeight: 1.5, textWrap: 'balance' }}>Already have an account? <a href="/signin" style={{ color: C.ink, fontWeight: 600 }}>Sign in</a> and your access is applied.</p>
            </>
          ) : (
            <>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5.5vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 14, textWrap: 'balance' }}>This link is no longer active.</h1>
              <p style={{ fontSize: 16, color: C.inkSoft, lineHeight: 1.55, marginBottom: 26, textWrap: 'balance' }}>You can still create a Rentletter account the usual way.</p>
              <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '0 28px', background: C.ink, color: C.paper, borderRadius: R.ctrl, fontSize: 16, fontWeight: 700, textDecoration: 'none', width: '100%', maxWidth: 320 }}>Go to signup</a>
            </>
          )}
        </div>
      </main>
    </>
  );
}
