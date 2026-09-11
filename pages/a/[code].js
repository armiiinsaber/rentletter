// /a/[code]  The short invite link. An IP limiter (60 an hour, lib/rateLimit.js) runs before the
// KV read; then short:{code} resolves to the invite token and answers a 302 to /apply/{token};
// the apply page then answers as it does for the long link (rented and closed listings included).
// Seven character codes are minted now; five character codes keep resolving. An unknown or
// expired code renders the invalid link state here. Sandbox codes (DEMO1, DEMO001) open the
// sandbox invite and never touch KV. The resolve itself is lib/shortLink.js resolveShortCode.
import Head from 'next/head';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import { kvGet, kvIncr, kvExpire } from '../../lib/kv';
import { resolveShortCode } from '../../lib/shortLink';
import { checkSubmitLimits } from '../../lib/rateLimit';

export async function getServerSideProps(ctx) {
  const ip = String(ctx.req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || ctx.req?.socket?.remoteAddress || '';
  const r = await resolveShortCode(ctx.params?.code, { kvGet, limiter: { incr: kvIncr, expire: kvExpire }, checkLimits: checkSubmitLimits, ip });
  if (r.redirect) return { redirect: { destination: r.redirect, permanent: false } };
  return { props: { invalidMsg: r.limited || r.invalid } };
}

export default function ShortLinkPage({ invalidMsg }) {
  return (
    <>
      <Head><title>Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', paddingTop: 'calc(clamp(16px, 4vw, 22px) + env(safe-area-inset-top, 0px))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Rental application</span>
        </header>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 80px' }}>
          <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', marginBottom: 14, color: C.inkMute }}><Icon name="link" size={30} /></div>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>This link is no longer active</h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px', textWrap: 'pretty' }}>{invalidMsg}</p>
            <a href="/" className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: 'var(--btn-radius)', padding: '0 var(--gap-card)', fontSize: 14, fontWeight: 700 }}>Go to Rentletter</a>
          </div>
        </div>
      </div>
    </>
  );
}
