// /a/[code]  The short invite link. Resolves short:{code} in KV to the invite token and answers
// a 302 to /apply/{token}; the apply page then answers as it does for the long link (rented and
// closed listings included). An unknown or expired code renders the apply page's invalid link
// state here. Sandbox codes (DEMO1) open the sandbox invite.
import Head from 'next/head';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import { kvGet } from '../../lib/kv';
import { isShortCode, isDemoCode, shortKey } from '../../lib/shortLink';

export async function getServerSideProps(ctx) {
  const code = String(ctx.params?.code || '').toUpperCase();
  if (isDemoCode(code)) return { redirect: { destination: '/apply/demo0000000000000001', permanent: false } };
  if (!isShortCode(code)) return { props: { invalidMsg: 'This link does not look right. Please use the exact link the listing realtor posted.' } };
  try {
    const token = await kvGet(shortKey(code));
    const t = typeof token === 'string' ? token : (token && token.token) || null;
    if (t && /^[a-f0-9]{20}$/.test(t)) return { redirect: { destination: `/apply/${t}`, permanent: false } };
  } catch (e) { console.error('[a/code] resolve failed:', e?.message || e); }
  return { props: { invalidMsg: 'This invite link has expired or is no longer active. Please contact the listing realtor for a new link.' } };
}

export default function ShortLinkPage({ invalidMsg }) {
  return (
    <>
      <Head><title>Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Rental application</span>
        </header>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 80px' }}>
          <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', marginBottom: 14, color: C.inkMute }}><Icon name="link" size={30} /></div>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>This link is no longer active</h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px', textWrap: 'pretty' }}>{invalidMsg}</p>
            <a href="/" className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl, padding: '0 22px', fontSize: 14, fontWeight: 700 }}>Go to Rentletter</a>
          </div>
        </div>
      </div>
    </>
  );
}
