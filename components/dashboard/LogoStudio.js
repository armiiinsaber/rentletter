// components/dashboard/LogoStudio.js
// AI logo studio — a stepped, gated workflow so realtors can't get lost:
//   STEP 1 Colours  → pick primary + secondary (each unlocks nothing until both set)
//   STEP 2 Describe → revealed only once both colours are chosen (description optional)
//   STEP 3 Generate → active only when both colours are set
// Then 3 SVG concepts render live; "Use this logo" saves it (rasterized to PNG).
// No API calls in demo mode — this component is only mounted in the authenticated
// profile editor. Brand colours are controlled by the parent (saved with the profile).
import { useState, useEffect, useRef } from 'react';
import { C, R } from '../theme';
import ColorWheel from './ColorWheel';

const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

function safeForRender(svg) {
  return typeof svg === 'string' && /<svg[\s>]/i.test(svg) && !/<\s*script/i.test(svg) && !/\son\w+\s*=/i.test(svg);
}

// Make an injected SVG scale to its container: drop the root's fixed width/height
// (which otherwise break aspect ratio + overflow the small preview box) and let the
// viewBox + preserveAspectRatio fit it. Does NOT change what we save — preview only.
function fitSvg(svg) {
  if (typeof svg !== 'string') return svg;
  return svg.replace(/<svg\b[^>]*>/i, (tag) => {
    const hadPAR = /preserveAspectRatio/i.test(tag);
    const stripped = tag.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
    return stripped.replace(/<svg\b/i, `<svg width="100%" height="100%"${hadPAR ? '' : ' preserveAspectRatio="xMidYMid meet"'}`);
  });
}

// Prefix every id (and its url(#id)/href="#id" refs) with a per-instance key, so that
// multiple inline SVGs on the page (3 variations × 2 swatches) don't share gradient/clip
// ids — otherwise url(#g) resolves to the FIRST match and concepts bleed into each other.
function namespaceIds(svg, key) {
  const ids = new Set();
  svg.replace(/\sid\s*=\s*["']([^"']+)["']/gi, (_, id) => { ids.add(id); return _; });
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nid = `${key}-${id}`;
    out = out
      .replace(new RegExp(`(\\sid\\s*=\\s*["'])${esc}(["'])`, 'g'), `$1${nid}$2`)
      .replace(new RegExp(`url\\(\\s*#${esc}\\s*\\)`, 'g'), `url(#${nid})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*["'])#${esc}(["'])`, 'g'), `$1#${nid}$2`);
  }
  return out;
}
const prepSvg = (svg, key) => namespaceIds(fitSvg(svg), key);

const fitInner = { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' };

function Swatch({ svg, bg, label, idKey }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ background: bg, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, overflow: 'hidden' }}>
        {safeForRender(svg)
          ? <div style={fitInner} dangerouslySetInnerHTML={{ __html: prepSvg(svg, idKey) }} />
          : <span style={{ fontSize: 11, color: C.inkMute }}>—</span>}
      </div>
      <div style={{ fontSize: 9.5, color: C.inkMute, textAlign: 'center', marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

// A single colour control: full-spectrum HSV wheel + hex input + live swatch.
function ColorField({ label, value, onChange, disabled }) {
  const valid = isHex(value);
  const [hex, setHex] = useState(value || '');
  useEffect(() => { setHex(value || ''); }, [value]);
  const apply = (v) => { setHex(v); if (isHex(v)) onChange(v.toLowerCase()); };
  return (
    <div style={{ flex: 1, minWidth: 168 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: valid ? value : C.paperDeep, border: `1px solid ${C.ruleDark}`, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <ColorWheel value={valid ? value : '#1f3a5f'} onChange={onChange} size={150} disabled={disabled} />
      <input type="text" value={hex} disabled={disabled} onChange={(e) => apply(e.target.value)} placeholder="#1f3a5f" spellCheck={false}
        aria-label={`${label} hex`}
        style={{ width: 150, marginTop: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', borderRadius: R.ctrl, border: `1px solid ${valid || !hex ? C.rule : C.red}`, background: C.paper, color: C.ink, outline: 'none' }} />
    </div>
  );
}

function StepChip({ n, label, state }) {
  const done = state === 'done', active = state === 'active';
  const bg = done ? C.green : active ? C.ink : C.paperDeep;
  const fg = done || active ? C.paper : C.inkMute;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, opacity: state === 'locked' ? 0.55 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, border: `1px solid ${done ? C.green : active ? C.ink : C.ruleDark}` }}>{done ? '✓' : n}</span>
      <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 600, color: active ? C.ink : C.inkSoft }}>{label}</span>
    </div>
  );
}

export default function LogoStudio({ fullName, brokerage, primary, secondary, onPrimary, onSecondary, onChosen }) {
  const profileReady = !!(String(fullName || '').trim() && String(brokerage || '').trim());
  const colorsReady = profileReady && isHex(primary) && isHex(secondary);

  const [brief, setBrief] = useState('');
  const [refineBrief, setRefineBrief] = useState('');
  const [rounds, setRounds] = useState([]); // [{ brief, variations:[{label,svg}] }]
  const [roundIdx, setRoundIdx] = useState(0);
  const [refineTarget, setRefineTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [usingIdx, setUsingIdx] = useState(null);
  const [error, setError] = useState('');
  const [limitMsg, setLimitMsg] = useState('');
  const [savedOk, setSavedOk] = useState(false);
  const refineRef = useRef(null);

  const round = rounds[roundIdx];
  const colorsForGen = () => ({
    brandColor: isHex(primary) ? primary : undefined,
    brandColorSecondary: isHex(secondary) ? secondary : undefined,
  });

  const step1State = colorsReady ? 'done' : 'active';
  const step2State = !colorsReady ? 'locked' : (rounds.length || brief.trim()) ? 'done' : 'active';
  const step3State = !colorsReady ? 'locked' : 'active';

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
    if (!colorsReady) { setError('Pick your two brand colours first.'); return; }
    call({
      brief: brief.trim() || 'A clean, professional real-estate logo using my name and brand colours.',
      ...colorsForGen(),
      conversationContext: rounds.map((r) => r.brief).filter(Boolean),
    });
  };

  const refine = () => {
    if (!refineTarget || busy) return;
    if (!refineBrief.trim()) { setError('Tell us what to change (e.g. “bolder”, “bigger icon”, “drop the icon”).'); return; }
    call({ brief: refineBrief.trim(), refineFrom: refineTarget.svg, ...colorsForGen(), conversationContext: rounds.map((r) => r.brief).filter(Boolean) });
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
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(14px,3vw,18px)', background: C.paperDeep }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 2 }}>Generate a logo with AI</div>
      <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>Three steps. We design 3 concepts from your name, brokerage, and colours.</div>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,2vw,16px)', flexWrap: 'wrap', marginBottom: 14 }}>
        <StepChip n={1} label="Colours" state={step1State} />
        <StepChip n={2} label="Describe" state={step2State} />
        <StepChip n={3} label="Generate" state={step3State} />
      </div>

      {!profileReady && (
        <div style={{ padding: '10px 14px', marginBottom: 12, background: '#fff8ec', borderRadius: R.ctrl, borderLeft: `3px solid ${C.gold || '#b08d57'}`, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
          <strong>Add your name and brokerage first</strong> (in the fields below) so we can build your brand.
        </div>
      )}

      {limitMsg ? (
        <div style={{ padding: '10px 14px', background: '#fff8ec', borderRadius: R.ctrl, borderLeft: `3px solid ${C.gold || '#b08d57'}`, fontSize: 13, color: C.ink }}>{limitMsg}</div>
      ) : (
        <>
          {/* STEP 1 — COLOURS */}
          <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 'clamp(12px,3vw,16px)', marginBottom: 12, opacity: profileReady ? 1 : 0.55 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Step 1 · Brand colours</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <ColorField label="Primary" value={primary} onChange={onPrimary} disabled={!profileReady || busy} />
              <ColorField label="Secondary" value={secondary} onChange={onSecondary} disabled={!profileReady || busy} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: C.inkMute }}>Preview</span>
              <span style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.ruleDark}` }}>
                <span style={{ width: 28, height: 18, background: isHex(primary) ? primary : C.paperDeep }} />
                <span style={{ width: 28, height: 18, background: isHex(secondary) ? secondary : C.paperDeep }} />
              </span>
              {!colorsReady && profileReady && <span style={{ fontSize: 11.5, color: C.inkMute }}>Pick both to continue →</span>}
            </div>
          </div>

          {/* STEP 2 — DESCRIBE (revealed once colours are set) */}
          {colorsReady && (
            <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 'clamp(12px,3vw,16px)', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Step 2 · Describe <span style={{ color: C.inkMute, fontWeight: 600 }}>(optional)</span></div>
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} disabled={busy}
                placeholder="Describe your logo — a house, a key, your initials, a mood… or leave blank and we'll design from your name."
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          )}

          {/* STEP 3 — GENERATE */}
          {!busy && (
            <button onClick={generate} disabled={!colorsReady}
              title={colorsReady ? '' : 'Pick your two brand colours first'}
              style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: !colorsReady ? 'not-allowed' : 'pointer', opacity: !colorsReady ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {rounds.length ? 'Generate 3 again' : 'Generate 3 concepts'}
            </button>
          )}

          {/* Loading state — generation takes several seconds */}
          {busy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
              <span className="rl-lspin" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Designing your logos…</div>
                <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>This takes about 10–15 seconds. Please don’t refresh.</div>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div style={{ marginTop: 12, fontSize: 13, color: C.red }}>{error}</div>}
      {usingIdx !== null && (
        <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: C.inkSoft }}>
          <span className="rl-lspin" aria-hidden="true" /> Saving your logo…
        </div>
      )}
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
                  <Swatch svg={v.svg} bg="#ffffff" label="On light" idKey={`r${roundIdx}v${i}l`} />
                  <Swatch svg={v.svg} bg="#0f0f10" label="On dark" idKey={`r${roundIdx}v${i}d`} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => useLogo(v, i)} disabled={usingIdx !== null || busy}
                    style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: usingIdx !== null ? 'wait' : 'pointer', opacity: usingIdx !== null && usingIdx !== i ? 0.6 : 1 }}>
                    {usingIdx === i ? 'Saving…' : 'Use this logo'}
                  </button>
                  <button onClick={() => startRefine(v)} disabled={busy || usingIdx !== null}
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
                  {safeForRender(refineTarget.svg) && <div style={fitInner} dangerouslySetInnerHTML={{ __html: prepSvg(refineTarget.svg, 'refine') }} />}
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>Iterating on <strong>{refineTarget.label}</strong>. What should change?</div>
              </div>
              <input value={refineBrief} onChange={(e) => setRefineBrief(e.target.value)} disabled={busy}
                onKeyDown={(e) => { if (e.key === 'Enter') refine(); }}
                placeholder="e.g. bolder · bigger icon · centre the mark · drop the icon"
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }} />
              <button onClick={refine} disabled={busy}
                style={{ marginTop: 8, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Refining…' : 'Refine'}
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .rl-lspin {
          width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
          border: 2.5px solid ${C.rule}; border-top-color: ${C.red};
          display: inline-block; animation: rl-lspin 0.7s linear infinite;
        }
        @keyframes rl-lspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
