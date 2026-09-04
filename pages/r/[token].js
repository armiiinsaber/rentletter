// /r/[token]  The landlord's private page, built from the frozen snapshot. The token is the only
// credential and the only thing it opens. Server side: the snapshot by token, 404 for unknown,
// "This report has expired" past expiry, opened_count and last_opened_at bumped, report_opened
// recorded at most once an hour. The page carries screenable facts only (lib/reportSnapshot.js
// forLandlordPage strips the realtor side mapping). Answers post to /api/report/answer.
// Sandbox tokens DEMO-{listingId} build from the fixture and keep answers in this browser.
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import { isReportToken } from '../../lib/applicationIds';
import { forLandlordPage, answerLine } from '../../lib/reportSnapshot';

const DEMO_RE = /^DEMO-[a-z0-9-]{1,40}$/;

export async function getServerSideProps(ctx) {
  const token = String(ctx.params?.token || '');
  if (DEMO_RE.test(token)) {
    const { demoSnapshot } = await import('../../lib/demoReport');
    const payload = demoSnapshot(token.slice(5));
    if (!payload) return { notFound: true };
    return { props: { token, payload: forLandlordPage(payload), answers: {}, state: 'ok', sandbox: true } };
  }
  if (!isReportToken(token)) return { notFound: true };
  const { isSupabaseConfigured } = await import('../../lib/supabase/server');
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { token, payload: null, answers: {}, state: 'unavailable', sandbox: false } };
  try {
    const { getSupabaseAdminClient } = await import('../../lib/supabase/admin');
    const { snapshotByToken, noteOpened } = await import('../../lib/reportSnapshotStore');
    const { recordEvent } = await import('../../lib/events');
    const admin = getSupabaseAdminClient();
    const row = await snapshotByToken(admin, token);
    if (!row) return { notFound: true };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { props: { token, payload: null, answers: {}, state: 'expired', sandbox: false } };
    // opened_count, last_opened_at and report_opened at most once an hour (lib/reportSnapshotStore.js).
    try { await noteOpened(admin, row, { recordEvent }); } catch (e) { console.warn('[r] open not recorded:', e?.message || e); }
    return { props: { token, payload: forLandlordPage(row.payload), answers: row.answers && typeof row.answers === 'object' ? row.answers : {}, state: 'ok', sandbox: false } };
  } catch (e) {
    console.error('[r] failed:', e?.message || e);
    return { props: { token, payload: null, answers: {}, state: 'unavailable', sandbox: false } };
  }
}

const demoKey = (token) => `rl_demo_report:${token.slice(5)}`;
const money = (n) => (n != null ? `$${Number(n).toLocaleString('en-CA')}` : null);
const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
const card = { padding: 'var(--card-pad)', marginBottom: 'var(--gap-card)' };
const eyebrow = { fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' };

export default function ReportPage({ token, payload, answers: initial, state, sandbox }) {
  const [answers, setAnswers] = useState(initial || {});
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  // Sandbox: answers and opens live in this browser so the realtor's sandbox can read them.
  useEffect(() => {
    if (!sandbox) return;
    try {
      const raw = localStorage.getItem(demoKey(token));
      const rec = raw ? JSON.parse(raw) : { opened: 0, answers: {} };
      rec.opened = (Number(rec.opened) || 0) + 1;
      localStorage.setItem(demoKey(token), JSON.stringify(rec));
      if (rec.answers) setAnswers(rec.answers);
    } catch (e) { /* private mode */ }
  }, [sandbox, token]);

  const answer = async (rank, a, name) => {
    setBusy(rank); setError('');
    try {
      const r = await fetch('/api/report/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, rank, answer: a }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) { setError(j?.error || 'Could not save that. Please try again.'); return; }
      const next = { ...answers, [String(rank)]: { answer: a, at: j.at || new Date().toISOString(), name } };
      setAnswers(next); setEditing((e) => ({ ...e, [rank]: false }));
      if (sandbox) { try { const raw = localStorage.getItem(demoKey(token)); const rec = raw ? JSON.parse(raw) : { opened: 1 }; rec.answers = next; localStorage.setItem(demoKey(token), JSON.stringify(rec)); } catch (e) { /* ignore */ } }
    } catch (e) { setError('Could not save that. Please try again.'); }
    finally { setBusy(null); }
  };

  const shell = (children) => (
    <>
      <Head><title>Applicants · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100vh', background: C.paper, padding: 'var(--s-5) var(--s-4) var(--s-7)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>{children}</div>
      </main>
    </>
  );
  if (state !== 'ok' || !payload) {
    return shell(
      <div className="rl-card" style={card}>
        <div style={{ marginBottom: 'var(--s-4)' }}><Wordmark /></div>
        <p style={{ fontSize: 'var(--t-body)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>{state === 'expired' ? 'This report has expired. Ask your realtor for a fresh one.' : 'This report is not available right now. Please try the link again in a moment.'}</p>
      </div>,
    );
  }
  const { listing, realtor, applicants } = payload;
  return shell(
    <>
      {/* Header card: the realtor's branding, the address in the display face. */}
      <section className="rl-card" style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
          {realtor.logoUrl ? <img src={realtor.logoUrl} alt="" style={{ height: 40, width: 'auto', maxWidth: 140, objectFit: 'contain' }} /> : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, overflowWrap: 'anywhere' }}>{realtor.name}</div>
            {realtor.brokerage ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, overflowWrap: 'anywhere' }}>{realtor.brokerage}</div> : null}
          </div>
        </div>
        <h1 className="t-d1" style={{ color: C.ink, margin: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{listing.address}</h1>
        <div className="num" style={{ fontSize: 'var(--t-body)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginTop: 'var(--s-2)' }}>
          {[listing.rent != null ? `${money(listing.rent)} per month` : null, listing.bedroomsLabel || null].filter(Boolean).join(' · ')}
        </div>
        <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, marginTop: 'var(--s-2)', textWrap: 'pretty' }}>
          Prepared {longDate(payload.generatedAt)}{listing.landlordName ? ` for ${listing.landlordName}` : ''}
        </div>
      </section>

      {applicants.map((a) => {
        const given = answers[String(a.rank)];
        const isEditing = !!editing[a.rank];
        const n = a.numbers || {};
        return (
          <section key={a.rank} className="rl-card" style={card} aria-label={`${a.rank}. ${a.name}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
              <div className="t-d3" style={{ color: C.ink, minWidth: 0, overflowWrap: 'anywhere' }}><span className="num" style={{ color: C.inkMute, marginRight: 'var(--s-2)' }}>{a.rank}</span>{a.name}</div>
              {a.fit && a.fit.score != null ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', flexShrink: 0 }}>
                  <span className="t-d3 num" style={{ color: C.ink }}>{Number(a.fit.score).toFixed(1)}</span>
                  <span style={{ ...eyebrow, color: a.fit.label === 'verified' ? C.green : C.inkMute }}>{a.fit.label}</span>
                </div>
              ) : <span style={eyebrow}>Rent share unknown</span>}
            </div>
            {a.sentence ? <p style={{ fontSize: 'var(--t-body)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 'var(--s-3) 0 0', textWrap: 'pretty' }}>{a.sentence}</p> : null}
            {a.confirmedLine ? <div style={{ fontSize: 'var(--t-body-2)', color: C.green, fontWeight: 600, marginTop: 'var(--s-2)', textWrap: 'pretty' }}>{String(a.confirmedLine).replace(/ · (\S+ \S+)$/, '\u00a0·\u00a0$1')}</div> : null}
            {a.rank > 1 && a.reason ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-2)', textWrap: 'pretty' }}>Below the one above: {a.reason.charAt(0).toLowerCase() + a.reason.slice(1)}</div> : null}
            <div className="num" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--s-2)', marginTop: 'var(--s-3)', paddingTop: 'var(--s-3)', borderTop: `1px solid ${C.rule}` }}>
              {[['Income', n.annualIncome != null ? money(n.annualIncome) : 'not given'], ['Rent share', n.rentSharePct != null ? `${Math.round(n.rentSharePct)}%` : 'unknown'], ['At job', n.yearsAtJob ? `${n.yearsAtJob} yr${n.yearsAtJob === 1 ? '' : 's'}` : 'not given'], ['References', String(n.references || 0)]].map(([k, v]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={{ ...eyebrow, fontSize: 10, marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 'var(--t-body-2)', color: C.ink, fontWeight: 700, overflowWrap: 'anywhere' }}>{v}</div>
                </div>
              ))}
            </div>
            {/* The answer: two controls, or the given answer as an ink pill with the red tick, tap to change. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap', marginTop: 'var(--s-4)' }}>
              {given && !isEditing ? (
                <button type="button" data-answer={given.answer} onClick={() => setEditing((e) => ({ ...e, [a.rank]: true }))} aria-label={`You answered ${answerLine(given.answer)}. Tap to change.`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, padding: '0 var(--s-4)', background: C.ink, color: C.paper, border: 'none', borderRadius: R.pill, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Icon name="check" size={14} color={C.red} strokeWidth={2.5} /> {given.answer === 'meet' ? 'You want to meet them' : 'Not for you'}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => answer(a.rank, 'meet', a.name)} disabled={busy === a.rank}
                    style={{ minHeight: 44, padding: '0 var(--s-4)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>I'd like to meet them</button>
                  <button type="button" onClick={() => answer(a.rank, 'pass', a.name)} disabled={busy === a.rank}
                    style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>Not for me</button>
                </>
              )}
            </div>
          </section>
        );
      })}

      {error ? <div role="alert" className="rl-card" style={{ ...card, color: C.danger, fontSize: 'var(--t-body-2)' }}>{error}</div> : null}

      <section className="rl-card" style={card}>
        {listing.criteriaLine ? <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>Ranked against {realtor.name}'s criteria: {listing.criteriaLine}.</p> : null}
        {realtor.signature ? <p style={{ fontSize: 'var(--t-body-2)', color: C.ink, fontWeight: 600, lineHeight: 'var(--lh-body)', margin: 'var(--s-3) 0 0', overflowWrap: 'anywhere' }}>{realtor.signature}</p> : null}
        <p style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: 'var(--s-3) 0 0', textWrap: 'pretty' }}>Sent through Rentletter on behalf of {realtor.name}. This link is private to you.</p>
        <a href={`/api/report/pdf?token=${encodeURIComponent(token)}`} download style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 'var(--s-3)', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline' }}>Download PDF</a>
      </section>
    </>,
  );
}
