// /brokerage/confirm/[token]  The link in the broker of record's email (lib/brokerage.js,
// lib/circleEmails.js). The page READS the brokerage record and WRITES NOTHING on load: email
// link scanners open every link before the recipient does. It shows the details the realtor
// entered and asks one thing: are these right, and is this realtor registered with you? The
// answer is a tap that posts to /api/brokerage/confirm; the link then stops working. No account,
// no dashboard. A used, unknown or expired link shows one line.
import { useState } from 'react';
import Head from 'next/head';
import { GlobalStyle, Wordmark } from '../../../components/ui';
import { C } from '../../../components/theme';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { readConfirmation } from '../../../lib/brokerage';
import { Pending } from '../../../components/brand/Loader';

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('X-Robots-Tag', 'noindex, nofollow'); ctx.res.setHeader('Cache-Control', 'no-store');
  const token = String(ctx.params?.token || '');
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { token, state: 'unavailable', record: null } };
  try {
    const r = await readConfirmation(getSupabaseAdminClient(), token); // read only
    if (r.gone) return { props: { token, state: 'gone', record: null } };
    return { props: { token, state: 'ask', record: { legalName: r.legalName, address: r.address, phone: r.phone, brokerName: r.brokerName, realtorName: r.realtorName } } };
  } catch (e) {
    console.error('[brokerage/confirm] failed:', e?.message || e);
    return { props: { token, state: 'unavailable', record: null } };
  }
}

const LINES = {
  confirm: 'Thank you. Your confirmation is recorded.',
  not_ours: 'Thank you. We have recorded that this realtor is not your agent.',
  gone: 'This link has been used or has expired.',
  unavailable: 'We could not load that right now. Please try the link again in a moment.',
};
const Row = ({ label, value }) => (value ? (
  <div style={{ padding: '10px 0', borderTop: `1px solid ${C.rule}` }}>
    <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
    <div className="bc-value" style={{ color: C.ink, lineHeight: 1.4, overflowWrap: 'anywhere', textWrap: 'balance' }}>{value}</div>
  </div>
) : null);

export default function BrokerageConfirmPage({ token, state, record }) {
  const [view, setView] = useState(state); // ask | confirm | not_ours | gone | unavailable
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const answer = async (a) => {
    setBusy(a); setError('');
    try {
      const r = await fetch('/api/brokerage/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, answer: a }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 410) { setView('gone'); return; }
      if (!r.ok || j?.error) { setError(j?.error || 'Could not save that. Please try again.'); return; }
      setView(a);
    } catch { setError('Could not save that. Please try again.'); }
    finally { setBusy(''); }
  };
  const btn = { minHeight: 44, padding: '0 var(--gap-card)', borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer' };
  return (
    <>
      <Head><title>Confirm a brokerage · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100vh', background: C.paper, padding: 'var(--s-6) var(--s-4)', paddingTop: 'calc(var(--s-6) + env(safe-area-inset-top, 0px))' }}>
        <div style={{ maxWidth: 520, margin: '0 auto var(--s-5)' }}><a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark /></a></div>
        <div className="rl-card" data-brokerage-confirm={view} style={{ maxWidth: 520, margin: '0 auto', padding: 'var(--card-pad)' }}>
          {view === 'ask' && record ? (
            <>
              <h1 className="t-d2" style={{ color: C.ink, margin: '0 0 var(--gap-line)', textWrap: 'balance' }}>Is this your brokerage, and your agent?</h1>
              <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', margin: '0 0 var(--s-3)', textWrap: 'balance' }}>{record.realtorName} uses Rentletter to organize rental applications, and entered these details.</p>
              <Row label="Realtor" value={record.realtorName} />
              <Row label="Brokerage" value={record.legalName} />
              <Row label="Address" value={record.address} />
              <Row label="Phone" value={record.phone} />
              <Row label="Broker of record" value={record.brokerName} />
              <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', margin: 'var(--s-3) 0 0', paddingTop: 'var(--s-3)', borderTop: `1px solid ${C.rule}`, textWrap: 'balance' }}>Confirming says the brokerage exists and this realtor is registered with it. Nothing else is agreed to.</p>
              {error && <div role="alert" style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-body-2)', color: C.danger }}>{error}</div>}
              <div className="rl-ctrl-row" style={{ marginTop: 'var(--s-4)' }}>
                <button type="button" onClick={() => answer('confirm')} disabled={!!busy} style={{ ...btn, background: C.ink, color: C.paper, border: `1.5px solid ${C.ink}` }}>
                  <Pending busy={busy === 'confirm'} label="Saving your answer">Yes, confirm</Pending>
                </button>
                <button type="button" onClick={() => answer('not_ours')} disabled={!!busy} style={{ ...btn, background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}` }}>
                  <Pending busy={busy === 'not_ours'} label="Saving your answer">This is not our agent</Pending>
                </button>
              </div>
            </>
          ) : (
            <p role="status" style={{ fontSize: 'var(--t-body)', color: C.ink, fontWeight: 700, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'balance' }}>{LINES[view] || LINES.unavailable}</p>
          )}
        </div>
      </main>
      {/* Below 345px a long name takes the 14px size, so it holds one line. */}
      <style jsx global>{`
        .bc-value { font-size: var(--t-body); }
        @media (max-width: 344.98px) { .bc-value { font-size: var(--t-body-2); } }
      `}</style>
    </>
  );
}
