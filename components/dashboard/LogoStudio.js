// components/dashboard/LogoStudio.js
// AI logo studio: a chat-style box where the realtor describes what they want, we
// call /api/branding/generate-logo (3 SVG concepts), render them live on light + dark
// swatches, let them iterate (refine) on a chosen direction, and "Use this logo" to
// save it (rasterized to PNG) via /api/branding/use-logo. No API calls in demo mode —
// this component is only mounted in the authenticated profile editor.
import { useState, useRef } from 'react';
import { C, R } from '../theme';

// Defensive client-side guard before we dangerouslySetInnerHTML a server-validated SVG.
function safeForRender(svg) {
  return typeof svg === 'string' && /<svg[\s>]/i.test(svg) && !/<\s*script/i.test(svg) && !/\son\w+\s*=/i.test(svg);
}

function Swatch({ svg, bg, label }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        background: bg, border: `1px solid ${C.rule}`, borderRadius: R.ctrl,
        height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 10, overflow: 'hidden',
      }}>
        {safeForRender(svg)
          ? <div style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }} dangerouslySetInnerHTML={{ __html: svg }} />
          : <span style={{ fontSize: 11, color: C.inkMute }}>—</span>}
      </div>
      <div style={{ fontSize: 9.5, color: C.inkMute, textAlign: 'center', marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

export default function LogoStudio({ fullName, brokerage, onChosen }) {
  const profileReady = !!(String(fullName || '').trim() && String(brokerage || '').trim());
  const [brief, setBrief] = useState('');
  const [refineBrief, setRefineBrief] = useState('');
  const [rounds, setRounds] = useState([]); // [{ brief, variations:[{label,svg}] }]
  const [roundIdx, setRoundIdx] = useState(0);
  const [refineTarget, setRefineTarget] = useState(null); // { label, svg }
  const [busy, setBusy] = useState(false);
  const [usingIdx, setUsingIdx] = useState(null);
  const [error, setError] = useState('');
  const [limitMsg, setLimitMsg] = useState('');
  const [savedOk, setSavedOk] = useState(false);
  const refineRef = useRef(null);

  const round = rounds[roundIdx];

  const call = async (body) => {
    setError(''); setSavedOk(false); setBusy(true);
    try {
      const r = await fetch('/api/branding/generate-logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (r.status === 429) { setLimitMsg(j?.error || "You've hit today's generation limit."); setBusy(false); return; }
      if (!r.ok || !Array.isArray(j.variations) || j.variations.length === 0) {
        setError(j?.error || 'Could not generate logos. Please try again.'); setBusy(false); return;
      }
      setRounds((prev) => {
        const next = [...prev, { brief: body.refineFrom ? `Refine: ${body.brief}` : body.brief, variations: j.variations }];
        setRoundIdx(next.length - 1);
        return next;
      });
      setRefineTarget(null);
    } catch (e) {
      setError('Could not generate logos. Please try again.');
    }
    setBusy(false);
  };

  const generate = () => {
    if (!profileReady) { setError('Add your name and brokerage first so we can build your brand.'); return; }
    if (!brief.trim()) { setError('Describe the logo you want first.'); return; }
    call({ brief: brief.trim(), conversationContext: rounds.map((r) => r.brief).filter(Boolean) });
  };

  const refine = () => {
    if (!refineTarget) return;
    if (!refineBrief.trim()) { setError('Tell us what to change (e.g. “bolder”, “try navy”, “drop the icon”).'); return; }
    call({ brief: refineBrief.trim(), refineFrom: refineTarget.svg, conversationContext: rounds.map((r) => r.brief).filter(Boolean) });
    setRefineBrief('');
  };

  const startRefine = (v) => {
    setRefineTarget(v); setError('');
    setTimeout(() => refineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
  };

  const useLogo = async (v, idx) => {
    setUsingIdx(idx); setError(''); setSavedOk(false);
    try {
      const r = await fetch('/api/branding/use-logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ svg: v.svg }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not save that logo.'); setUsingIdx(null); return; }
      setSavedOk(true);
      onChosen?.(j.logo_url, j.profile);
    } catch (e) {
      setError('Could not save that logo.');
    }
    setUsingIdx(null);
  };

  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(14px,3vw,18px)', background: C.paperDeep, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 2 }}>Generate a logo with AI</div>
      <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>
        Describe what you want — we’ll design 3 concepts using your name and brokerage. No design skills needed.
      </div>

      {limitMsg ? (
        <div style={{ padding: '10px 14px', background: '#fff8ec', borderRadius: R.ctrl, borderLeft: `3px solid ${C.gold || '#b08d57'}`, fontSize: 13, color: C.ink }}>{limitMsg}</div>
      ) : (
        <>
          {/* Required-profile gate */}
          {!profileReady && (
            <div style={{ padding: '10px 14px', marginBottom: 10, background: '#fff8ec', borderRadius: R.ctrl, borderLeft: `3px solid ${C.gold || '#b08d57'}`, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
              <strong>Add your name and brokerage first</strong> so we can build your brand. Fill in the <strong>Your full name</strong> and <strong>Brokerage</strong> fields just below, then come back up here.
            </div>
          )}

          {/* Friendly help box */}
          <div style={{ padding: '10px 12px', marginBottom: 10, background: C.paper, border: `1px dashed ${C.ruleDark}`, borderRadius: R.ctrl, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
            Describe it however you like — it doesn’t have to mention your name, and you can be as specific as you want: a mark like a house or key, colours, mood, or a style (serif, minimal, bold). By default we build around your name + brokerage; your description can add to or override that.
          </div>

          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} disabled={!profileReady}
            placeholder="e.g. clean and modern, a simple house, navy blue"
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: profileReady ? C.paper : C.paperDeep, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: 'inherit', opacity: profileReady ? 1 : 0.7 }} />
          <button onClick={generate} disabled={busy || !profileReady} title={profileReady ? '' : 'Add your name and brokerage first'}
            style={{ marginTop: 8, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, cursor: (busy || !profileReady) ? 'not-allowed' : 'pointer', opacity: (busy || !profileReady) ? 0.5 : 1 }}>
            {busy ? 'Designing…' : rounds.length ? 'Generate again' : 'Generate 3 concepts'}
          </button>
        </>
      )}

      {error && <div style={{ marginTop: 12, fontSize: 13, color: C.red }}>{error}</div>}
      {savedOk && <div style={{ marginTop: 12, fontSize: 13, color: C.green, fontWeight: 600 }}>✓ Saved — this is now your branding.</div>}

      {round && (
        <div style={{ marginTop: 16 }}>
          {rounds.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <button onClick={() => setRoundIdx((i) => Math.max(0, i - 1))} disabled={roundIdx === 0}
                style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '4px 10px', fontSize: 13, cursor: roundIdx === 0 ? 'default' : 'pointer', color: C.inkSoft, opacity: roundIdx === 0 ? 0.4 : 1 }}>‹</button>
              <span style={{ fontSize: 11.5, color: C.inkMute }}>Attempt {roundIdx + 1} of {rounds.length}</span>
              <button onClick={() => setRoundIdx((i) => Math.min(rounds.length - 1, i + 1))} disabled={roundIdx === rounds.length - 1}
                style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '4px 10px', fontSize: 13, cursor: roundIdx === rounds.length - 1 ? 'default' : 'pointer', color: C.inkSoft, opacity: roundIdx === rounds.length - 1 ? 0.4 : 1 }}>›</button>
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {round.variations.map((v, i) => (
              <div key={i} style={{ border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 12, background: C.paper }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 8 }}>{v.label}</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Swatch svg={v.svg} bg="#ffffff" label="On light" />
                  <Swatch svg={v.svg} bg="#0f0f10" label="On dark" />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => useLogo(v, i)} disabled={usingIdx !== null}
                    style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: usingIdx !== null ? 'wait' : 'pointer', opacity: usingIdx !== null && usingIdx !== i ? 0.6 : 1 }}>
                    {usingIdx === i ? 'Saving…' : 'Use this logo'}
                  </button>
                  <button onClick={() => startRefine(v)} disabled={busy}
                    style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Refine this →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {refineTarget && !limitMsg && (
            <div ref={refineRef} style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 56, height: 40, border: `1px solid ${C.rule}`, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, overflow: 'hidden', flexShrink: 0 }}>
                  {safeForRender(refineTarget.svg) && <div style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }} dangerouslySetInnerHTML={{ __html: refineTarget.svg }} />}
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>Iterating on <strong>{refineTarget.label}</strong>. What should change?</div>
              </div>
              <input value={refineBrief} onChange={(e) => setRefineBrief(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') refine(); }}
                placeholder="e.g. bolder · try navy · drop the icon · serif wordmark"
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }} />
              <button onClick={refine} disabled={busy}
                style={{ marginTop: 8, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Refining…' : 'Refine'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
