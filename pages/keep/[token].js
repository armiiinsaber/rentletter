// /keep/[token]  The link in the not selected message. Landing here flips the pending
// pipeline_consents row to consented; /keep/{token}?no=1 flips it to declined. One line either
// way, in the existing card container. Server side, through the service role; nothing runs in
// the browser. Sandbox tokens (demo…) render without a database.
import Head from 'next/head';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { C } from '../../components/theme';
import { isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { flipConsent } from '../../lib/listingStatus';

export async function getServerSideProps(ctx) {
  const token = String(ctx.params?.token || '');
  const decline = ctx.query?.no === '1';
  const status = decline ? 'declined' : 'consented';
  if (/^demo/.test(token)) return { props: { outcome: status, sandbox: true } };
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { outcome: 'unavailable' } };
  try {
    const r = await flipConsent(getSupabaseAdminClient(), token, status);
    if (!r.found) return { props: { outcome: 'missing' } };
    if (r.expired) return { props: { outcome: 'expired' } };
    return { props: { outcome: status } };
  } catch (e) {
    console.error('[keep] failed:', e?.message || e);
    return { props: { outcome: 'unavailable' } };
  }
}

const LINES = {
  consented: 'Done. Your realtor will keep your application in mind for similar units for the next 60 days.',
  declined: 'Understood. Nothing else happens, and your documents are deleted within 14 days if they are not already.',
  expired: 'This link has expired. Nothing was saved.',
  missing: 'This link is not valid.',
  unavailable: 'We could not save that right now. Please try the link again in a moment.',
};

export default function KeepPage({ outcome }) {
  return (
    <>
      <Head><title>Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100vh', background: C.paper, padding: 'var(--s-6) var(--s-4)' }}>
        <div style={{ maxWidth: 520, margin: '0 auto var(--s-5)' }}><Wordmark /></div>
        <div className="rl-card" style={{ maxWidth: 520, margin: '0 auto', padding: 'var(--card-pad)' }}>
          <p style={{ fontSize: 'var(--t-body)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>{LINES[outcome] || LINES.unavailable}</p>
        </div>
      </main>
    </>
  );
}
