// /keep/[token]  The link in the not selected message. The page READS the consent row (the
// realtor's name, expired, already answered) and WRITES NOTHING on load: email link scanners open
// every link before the recipient does. The answer is a tap: "Yes, keep me in mind" or "No
// thanks" posts to /api/pipeline/answer, and the page then shows one line of confirmation.
// Sandbox tokens (demo…) render without a database; demo-expired and demo-answered show the
// refusals.
import { useState } from 'react';
import Head from 'next/head';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { C, R } from '../../components/theme';
import { isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { readConsent } from '../../lib/listingStatus';

export async function getServerSideProps(ctx) {
  const token = String(ctx.params?.token || '');
  if (/^demo/.test(token)) {
    if (token === 'demo-expired') return { props: { token, state: 'expired', realtorName: 'Sarah Chen' } };
    if (token === 'demo-answered') return { props: { token, state: 'answered', realtorName: 'Sarah Chen' } };
    return { props: { token, state: 'ask', realtorName: 'Sarah Chen' } };
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { token, state: 'unavailable', realtorName: null } };
  try {
    // Read only: readConsent selects the row and the realtor's name, never updates.
    const r = await readConsent(getSupabaseAdminClient(), token);
    if (!r.found) return { props: { token, state: 'missing', realtorName: null } };
    if (r.expired) return { props: { token, state: 'expired', realtorName: r.realtorName } };
    if (r.answered) return { props: { token, state: 'answered', realtorName: r.realtorName } };
    return { props: { token, state: 'ask', realtorName: r.realtorName } };
  } catch (e) {
    console.error('[keep] failed:', e?.message || e);
    return { props: { token, state: 'unavailable', realtorName: null } };
  }
}

const LINES = {
  consented: 'Done. Your realtor will keep your application in mind for similar units for the next 60 days.',
  declined: 'Understood. Nothing else happens, and your documents are deleted within 14 days if they are not already.',
  expired: 'This link has expired. Nothing was saved.',
  answered: 'Already answered. Nothing changed.',
  missing: 'This link is not valid.',
  unavailable: 'We could not load that right now. Please try the link again in a moment.',
};

export default function KeepPage({ token, state, realtorName }) {
  const [view, setView] = useState(state); // ask | consented | declined | expired | answered | missing | unavailable
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const answer = async (a) => {
    setBusy(a); setError('');
    try {
      const r = await fetch('/api/pipeline/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, answer: a }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 410) { setView('expired'); return; }
      if (r.status === 409) { setView('answered'); return; }
      if (!r.ok || j?.error) { setError(j?.error || 'Could not save that. Please try again.'); return; }
      setView(j.status === 'declined' ? 'declined' : 'consented');
    } catch { setError('Could not save that. Please try again.'); }
    finally { setBusy(''); }
  };
  const who = realtorName || 'Your realtor';
  return (
    <>
      <Head><title>Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100vh', background: C.paper, padding: 'var(--s-6) var(--s-4)' }}>
        <div style={{ maxWidth: 520, margin: '0 auto var(--s-5)' }}><Wordmark /></div>
        <div className="rl-card" style={{ maxWidth: 520, margin: '0 auto', padding: 'var(--card-pad)' }}>
          {view === 'ask' ? (
            <>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-2)' }}>{who} asks:</div>
              <p style={{ fontSize: 'var(--t-body)', color: C.ink, fontWeight: 700, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'balance' }}>Keep your application in mind for similar units for 60 days?</p>
              {error && <div role="alert" style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-body-2)', color: C.danger }}>{error}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap', marginTop: 'var(--s-4)' }}>
                <button type="button" onClick={() => answer('yes')} disabled={!!busy}
                  style={{ minHeight: 44, padding: '0 var(--s-4)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {busy === 'yes' ? 'Saving' : 'Yes, keep me in mind'}
                </button>
                <button type="button" onClick={() => answer('no')} disabled={!!busy}
                  style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {busy === 'no' ? 'Saving' : 'No thanks'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 'var(--t-body)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>{LINES[view] || LINES.unavailable}</p>
          )}
        </div>
      </main>
    </>
  );
}
