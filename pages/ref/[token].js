// /ref/[token]  The previous landlord's six questions. GET is READ ONLY: the row is read for the
// realtor's and the applicant's names and the state (open, expired, answered); nothing is
// written on a page load, since email link scanners open every link. The tap posts to
// /api/references/answer. Fixed, closed questions (lib/referenceQuestions.js), one pill per
// option, every question has Prefer not to say, no free text anywhere. Sandbox tokens
// (demo-ref-open, demo-ref-expired, demo-ref-answered) render without a database.
import { useState } from 'react';
import Head from 'next/head';
import { GlobalStyle, Wordmark } from '../../components/ui';
import { C, R } from '../../components/theme';
import { isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { readRequest } from '../../lib/referenceStore';
import { QUESTIONS, MONTHS, PNS, visibleQuestions } from '../../lib/referenceQuestions';

export async function getServerSideProps(ctx) {
  const token = String(ctx.params?.token || '');
  const base = { token, realtorName: 'Sarah Chen', applicantName: 'Priya Sharma' };
  if (/^demo-ref/.test(token)) {
    if (token === 'demo-ref-expired') return { props: { ...base, state: 'expired' } };
    if (token === 'demo-ref-answered') return { props: { ...base, state: 'answered' } };
    return { props: { ...base, state: 'open' } };
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { token, state: 'unavailable', realtorName: null, applicantName: null } };
  try {
    const r = await readRequest(getSupabaseAdminClient(), token); // read only
    if (!r.found) return { props: { token, state: 'missing', realtorName: null, applicantName: null } };
    return { props: { token, state: r.answered ? 'answered' : r.expired ? 'expired' : 'open', realtorName: r.realtorName, applicantName: r.applicantName } };
  } catch (e) {
    console.error('[ref] failed:', e?.message || e);
    return { props: { token, state: 'unavailable', realtorName: null, applicantName: null } };
  }
}

const LINES = {
  answered: (who) => `Thank you. Your answers went to ${who}.`,
  expired: () => 'This link has expired.',
  missing: () => 'This link is not valid.',
  unavailable: () => 'We could not load that right now. Please try the link again in a moment.',
};

const years = (() => { const y = new Date().getFullYear(); const out = []; for (let i = y + 1; i >= y - 40; i--) out.push(i); return out; })();

export default function ReferencePage({ token, state, realtorName, applicantName }) {
  const [view, setView] = useState(state);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const who = realtorName || 'The realtor';
  const first = String(applicantName || 'the applicant').trim().split(/\s+/)[0];
  const shown = visibleQuestions(answers);
  const set = (key, v) => setAnswers((a) => ({ ...a, [key]: v }));
  const when = answers.when && answers.when !== PNS ? answers.when : { from: {}, to: {} };
  const setWhen = (side, part, v) => setAnswers((a) => { const cur = a.when && a.when !== PNS ? a.when : { from: {}, to: {} }; return { ...a, when: { ...cur, [side]: { ...(cur[side] || {}), [part]: v ? Number(v) : undefined } } }; });
  const complete = shown.every((q) => (q.kind === 'range' ? answers.when === PNS || (when.from?.m && when.from?.y) || (when.to?.m && when.to?.y) : !!answers[q.key]));
  const submit = async () => {
    if (busy || !complete) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/references/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, answers }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 410) { setView('expired'); return; }
      if (r.status === 409) { setView('answered'); return; }
      if (!r.ok) { setError(j?.error || 'Could not save that. Please try again.'); return; }
      setView('answered');
    } catch { setError('Could not save that. Please try again.'); }
    finally { setBusy(false); }
  };
  const pill = (on) => ({ minHeight: 44, padding: '0 var(--s-3)', background: on ? C.ink : 'transparent', color: on ? C.paper : C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 999, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
  const select = { minHeight: 44, fontSize: 16, padding: '0 var(--s-2)', border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, background: 'transparent', color: C.ink, fontFamily: 'inherit' };
  return (
    <>
      <Head><title>Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle />
      <main style={{ minHeight: '100vh', background: C.paper, padding: 'var(--s-6) var(--s-4)', paddingTop: 'calc(var(--s-6) + env(safe-area-inset-top, 0px))' }}>
        <div style={{ maxWidth: 560, margin: '0 auto var(--s-5)' }}><Wordmark /></div>
        <div className="rl-card" style={{ maxWidth: 560, margin: '0 auto', padding: 'var(--card-pad)' }}>
          {view === 'open' ? (
            <>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-1)' }}>{who} asks:</div>
              <p style={{ fontSize: 'var(--t-body)', color: C.ink, fontWeight: 700, lineHeight: 'var(--lh-body)', margin: '0 0 var(--s-2)', textWrap: 'balance' }}>Six questions about {applicantName || 'the applicant'}&apos;s tenancy with you.</p>
              <p style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: '0 0 var(--s-4)', textWrap: 'pretty' }}>One tap each. Every question has Prefer not to say. Nothing else is asked.</p>
              {shown.map((q, i) => (
                <div key={q.key} style={{ borderTop: `1px solid ${C.rule}`, padding: 'var(--s-3) 0' }}>
                  <div style={{ fontSize: 'var(--t-body)', color: C.ink, fontWeight: 600, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-2)' }}><span className="num" style={{ color: C.inkMute, marginRight: 'var(--s-2)' }}>{i + 1}</span>{q.text(first)}</div>
                  {q.kind === 'range' && answers.when !== PNS && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 'var(--s-2)', alignItems: 'center', marginBottom: 'var(--s-2)' }}>
                      <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>From</span>
                      <select aria-label="From month" value={when.from?.m || ''} onChange={(e) => setWhen('from', 'm', e.target.value)} style={select}><option value="">Month</option>{MONTHS.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select>
                      <select aria-label="From year" value={when.from?.y || ''} onChange={(e) => setWhen('from', 'y', e.target.value)} style={select}><option value="">Year</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
                      <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>To</span>
                      <select aria-label="To month" value={when.to?.m || ''} onChange={(e) => setWhen('to', 'm', e.target.value)} style={select}><option value="">Month</option>{MONTHS.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select>
                      <select aria-label="To year" value={when.to?.y || ''} onChange={(e) => setWhen('to', 'y', e.target.value)} style={select}><option value="">Year</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
                    {q.options.map(([code, label]) => (
                      <button key={code} type="button" aria-pressed={answers[q.key] === code} onClick={() => set(q.key, answers[q.key] === code && q.kind === 'range' ? undefined : code)} style={pill(answers[q.key] === code)}>{label}</button>
                    ))}
                  </div>
                </div>
              ))}
              {error && <div role="alert" style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-body-2)', color: C.danger }}>{error}</div>}
              <button type="button" onClick={submit} disabled={busy || !complete}
                style={{ marginTop: 'var(--s-4)', minHeight: 44, width: '100%', padding: '0 var(--s-4)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 'var(--t-body)', fontWeight: 700, cursor: busy || !complete ? 'default' : 'pointer', opacity: busy || !complete ? 0.5 : 1, fontFamily: 'inherit' }}>
                {busy ? 'Sending' : 'Submit'}
              </button>
            </>
          ) : (
            <p style={{ fontSize: 'var(--t-body)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>{(LINES[view] || LINES.unavailable)(who)}</p>
          )}
        </div>
      </main>
    </>
  );
}
