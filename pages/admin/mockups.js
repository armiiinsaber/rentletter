// pages/admin/mockups.js
// FOUNDER-ONLY mockup showcase — the device-framed product scenes laid out to screenshot.
// Behind the /admin session (redirects to /admin otherwise). Not linked publicly, noindex.
// Each scene: a stage with a framing preset (Wide / Square / Portrait / Story) and a canvas
// (paper / ink). The founder screenshots the stage; nothing else is needed.
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { C, R } from '../../components/theme';
import { GlobalStyle, Wordmark } from '../../components/ui';
import DeviceFrame, { DEFAULT_ASPECT } from '../../components/DeviceFrame';
import { SCENES } from '../../components/mockups/scenes';
import { isAdmin } from '../../lib/adminAuth';
import { HERO_STEP_DURATIONS, HERO_TRANSITION_MS } from '../../components/mockups/HeroDemo';
import { renderPng, dataUrlToBlob, download, zipFiles, slug, captureLoopFrames, encodeFrames, encodeFramesMp4, bestVideoType } from '../../lib/mockupExport';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin', permanent: false } };
  return { props: {} };
}

// Stage presets: the ratio of the area you screenshot. Device sits centred with breathing room.
const PRESETS = [
  { key: 'wide', label: 'Wide 16:9', ratio: '16 / 9', hint: 'LinkedIn / X / decks' },
  { key: 'square', label: 'Square 1:1', ratio: '1 / 1', hint: 'Instagram feed' },
  { key: 'portrait', label: 'Portrait 4:5', ratio: '4 / 5', hint: 'Instagram / LinkedIn mobile' },
  { key: 'story', label: 'Story 9:16', ratio: '9 / 16', hint: 'Stories / Reels cover' },
];
const CANVAS = { paper: { bg: `radial-gradient(120% 90% at 50% 0%, ${C.card} 0%, ${C.paper} 55%, ${C.paperDeep} 100%)`, tone: 'paper', fg: C.ink }, ink: { bg: 'radial-gradient(120% 90% at 50% 0%, #1c1c1e 0%, #101012 60%, #0a0a0b 100%)', tone: 'ink', fg: '#e8e4d9' } };

// Scenes are laid out at a fixed DESIGN size and scaled to the device screen with a MEASURED
// transform: scale() (ResizeObserver) — no container-query units, no CSS trig, so it behaves
// identically in every browser. The device itself is sized from the measured stage so it fits
// by width AND height on every preset. Showcase-only — the hero keeps its own fluid sizing.
const DESIGN = { laptop: 560, phone: 330, tablet: 640 };

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    window.addEventListener('resize', read);
    return () => { ro?.disconnect(); window.removeEventListener('resize', read); };
  }, [ref]);
  return size;
}

// Fills its (position: relative, overflow: hidden) parent: the scene renders at dw×dh and is
// scaled by parentWidth/dw. The parent's aspect ratio equals dw/dh, so that also fills height.
function ScaledScene({ dw, dh, children }) {
  const ref = useRef(null);
  const { w } = useSize(ref);
  const scale = w ? w / dw : 0;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: dw, height: dh, transform: `scale(${scale})`, transformOrigin: 'top left', visibility: scale ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </div>
  );
}


function Stage({ scene, preset, canvas, caption, register, onExport, busy }) {
  const isPhone = scene.device === 'phone';
  const [demoStep, setDemoStep] = useState(null); // animated scenes: exporter drives the step
  const dw = DESIGN[scene.device] || 560;
  const [aw, ah] = String(scene.aspect || DEFAULT_ASPECT[scene.device] || '16 / 10').split('/').map((n) => Number(n.trim()));
  const ratio = ah / aw;
  const dh = Math.round(dw * ratio);
  const stageRef = useRef(null);
  const { w: sw, h: sh } = useSize(stageRef);
  useEffect(() => { register(scene.key, { el: stageRef.current, setDemoStep }); return () => register(scene.key, null); }, [register, scene.key]);
  // Device width: a share of the stage width, capped so the whole device (with chrome/base and
  // the caption band) fits the stage height. Computed in px from the measured stage.
  let width = 0;
  if (sw && sh) {
    const shareW = isPhone ? (preset.key === 'wide' ? 0.34 : 0.58) : (preset.key === 'wide' ? 0.78 : preset.key === 'square' ? 0.86 : 0.9);
    const maxH = sh * (caption ? 0.80 : 0.88);
    // solve FRAME_H(cw) ≤ maxH for the content width, then add the shell padding (~20px)
    // Everything on the device scales with its width W: content W'·ratio (W' = W minus bezel),
    // status 59/393, home band 22/330, phone bezel 2.8%×2; laptop bar 40/560, bezel 1.4%, base 2.1%.
    const perW = isPhone ? (1 - 0.056) * (ratio + 59 / 393 + 22 / 330) + 0.056 : (1 - 0.028) * (ratio + 40 / 560) + 0.014 + 0.021;
    width = Math.floor(Math.min(sw * shareW, maxH / perW, isPhone ? 360 : 1e9));
  }
  return (
    <div ref={stageRef} className="mk-stage" style={{ aspectRatio: preset.ratio, background: CANVAS[canvas].bg }}>
      <div style={{ width: width || undefined, visibility: width ? 'visible' : 'hidden', marginTop: caption ? '-4%' : 0 }}>
        <DeviceFrame variant={scene.device} url={scene.url} aspect={scene.aspect} tone={CANVAS[canvas].tone} dark={!!scene.dark}>
          <ScaledScene dw={dw} dh={dh}><scene.Scene phone={isPhone} demoStep={demoStep} /></ScaledScene>
        </DeviceFrame>
      </div>
      {/* export controls — class mk-ui is excluded from the rendered image */}
      <div className="mk-ui mk-export" aria-label="Export">
        <button type="button" className="mk-xbtn" disabled={!!busy} onClick={() => onExport('png', scene)}>{busy === `png:${scene.key}` ? 'Rendering…' : 'PNG'}</button>
        {scene.animated && <button type="button" className="mk-xbtn" disabled={!!busy} onClick={() => onExport('video', scene)}>{busy === `video:${scene.key}` ? 'Recording…' : 'Video'}</button>}
      </div>
      {caption && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '3.5%', textAlign: 'center', color: CANVAS[canvas].fg, padding: '0 6%' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'clamp(10px, 1.4vw, 13px)', fontWeight: 700, letterSpacing: '-0.01em' }}>
            <span style={{ width: 3, height: 14, background: C.red, display: 'inline-block' }} /> Rentletter
            <span style={{ fontWeight: 500, opacity: 0.7 }}>· {scene.title}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Mockups() {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [canvas, setCanvas] = useState('paper');
  const [caption, setCaption] = useState(true);
  const [only, setOnly] = useState('');
  const [density, setDensity] = useState(2);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const shown = SCENES.filter((s) => !only || s.key === only);
  const stages = useRef(new Map());
  const register = useCallback((key, entry) => { if (entry) stages.current.set(key, entry); else stages.current.delete(key); }, []);
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Wait until no CSS transitions are running under el (max 1.5s) — rasterizing while the hero
  // demo is mid-crossfade can stall the serializer.
  const settle = async (el) => { const t0 = performance.now(); while (performance.now() - t0 < 1500) { await nextPaint(); if (!el?.getAnimations || el.getAnimations({ subtree: true }).length === 0) return; } };
  const park = async (scene, st) => { st.setDemoStep(scene.stillStep ?? 0); await nextPaint(); st.el.getAnimations?.({ subtree: true }).forEach((a) => { try { a.cancel(); } catch (e) { /* ignore */ } }); await nextPaint(); };
  const release = async (st) => { st.setDemoStep(null); await nextPaint(); await settle(st.el); };
  const fileBase = (scene) => `rentletter-${slug(scene.title)}-${preset.key}`;

  // Still: animated scenes are parked on their best frame (the settled shortlist) first; other
  // scenes are captured as rendered.
  const stillBlob = async (scene, { keepParked = false } = {}) => {
    const st = stages.current.get(scene.key); if (!st?.el) throw new Error('Stage not mounted');
    if (scene.animated) await park(scene, st); else await settle(st.el);
    try { return await dataUrlToBlob(await renderPng(st.el, { pixelRatio: density })); }
    finally { if (scene.animated && !keepParked) await release(st); }
  };
  const videoBlob = async (scene) => {
    const st = stages.current.get(scene.key); if (!st?.el) throw new Error('Stage not mounted');
    try {
      const frames = await captureLoopFrames({ stage: st.el, setStep: st.setDemoStep, durations: HERO_STEP_DURATIONS, transitionMs: HERO_TRANSITION_MS, fps: 30, pixelRatio: density, onProgress: (i, n) => setProgress(`Rendering frames ${i}/${n}`) });
      setProgress('Encoding…');
      let out = null;
      try { out = await encodeFramesMp4({ ...frames, onProgress: (i, n) => setProgress(`Encoding ${i}/${n}`) }); } catch (e) { console.warn('[mockups] WebCodecs MP4 failed, falling back to MediaRecorder:', e?.message || e); }
      if (!out) out = await encodeFrames({ ...frames, onProgress: (i, n) => setProgress(`Encoding ${i}/${n}`) });
      return { blob: out.blob, ext: out.type.includes('mp4') ? 'mp4' : 'webm' };
    } finally { await release(st); setProgress(''); }
  };
  const onExport = async (kind, scene) => {
    if (busy) return; setBusy(`${kind}:${scene.key}`);
    try {
      if (kind === 'png') download(await stillBlob(scene), `${fileBase(scene)}-${density}x.png`);
      else { const { blob, ext } = await videoBlob(scene); download(blob, `${fileBase(scene)}-${density}x.${ext}`); }
    } catch (e) { alert(`Export failed: ${e.message}`); }
    setBusy('');
  };
  const downloadAll = async () => {
    if (busy) return; setBusy('all');
    try {
      const files = [];
      for (const scene of SCENES) { setProgress(`Rendering ${scene.title}…`); files.push({ name: `${fileBase(scene)}-${density}x.png`, blob: await stillBlob(scene, { keepParked: true }) }); }
      for (const scene of SCENES) if (scene.animated) await release(stages.current.get(scene.key));
      setProgress('Zipping…');
      download(await zipFiles(files), `rentletter-mockups-${preset.key}-${density}x.zip`);
    } catch (e) { alert(`Export failed: ${e.message}`); }
    setProgress(''); setBusy('');
  };
  // Test hook for automated verification (admin-only page; harmless).
  useEffect(() => { window.__rlMockups = { still: (k) => stillBlob(SCENES.find((x) => x.key === k)), video: (k) => videoBlob(SCENES.find((x) => x.key === k)), scenes: SCENES.map((x) => x.key), bestVideoType }; return () => { delete window.__rlMockups; }; });

  return (
    <>
      <Head><title>Mockups — Rentletter admin</title><meta name="robots" content="noindex, nofollow" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '14px clamp(16px, 3vw, 28px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Wordmark /><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.paper, background: C.ink, padding: '3px 8px', borderRadius: R.pill }}>Mockups</span></div>
          <a href="/admin" style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, textDecoration: 'none' }}>← Admin</a>
        </header>

        <div className="mk-wrap">
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><span style={{ width: 22, height: 2, background: C.red }} /><span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Product mockups</span></div>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 4vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 8 }}>Screenshot-ready scenes.</h1>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, maxWidth: 640 }}>Every scene is built in code with sample data — no real tenants, nothing to redact. Pick a framing, pick a canvas, screenshot the stage.</p>
          </div>

          {/* Controls — sticky so they travel with you down the page */}
          <div className="mk-controls">
            <div className="mk-group"><span className="mk-label">Framing</span>{PRESETS.map((p) => <button key={p.key} className={`mk-chip ${preset.key === p.key ? 'on' : ''}`} onClick={() => setPreset(p)} title={p.hint}>{p.label}</button>)}</div>
            <div className="mk-group"><span className="mk-label">Canvas</span>{['paper', 'ink'].map((c) => <button key={c} className={`mk-chip ${canvas === c ? 'on' : ''}`} onClick={() => setCanvas(c)}>{c === 'paper' ? 'Paper' : 'Ink'}</button>)}</div>
            <div className="mk-group"><span className="mk-label">Caption</span><button className={`mk-chip ${caption ? 'on' : ''}`} onClick={() => setCaption((v) => !v)}>{caption ? 'On' : 'Off'}</button></div>
            <div className="mk-group"><span className="mk-label">Show</span><select value={only} onChange={(e) => setOnly(e.target.value)} className="mk-select"><option value="">All scenes</option>{SCENES.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}</select></div>
            <div className="mk-group"><span className="mk-label">Export</span>{[2, 3].map((d) => <button key={d} className={`mk-chip ${density === d ? 'on' : ''}`} onClick={() => setDensity(d)}>{d}×</button>)}
              <button className="mk-chip" style={{ background: C.red, color: C.paper, borderColor: C.red }} disabled={!!busy} onClick={downloadAll}>{busy === 'all' ? 'Working…' : 'Download all (zip)'}</button>
              {progress && <span style={{ fontSize: 12, color: C.inkSoft }}>{progress}</span>}
            </div>
          </div>

          <div className="mk-tips">
            <strong style={{ color: C.ink }}>Export.</strong> PNG downloads the stage exactly as shown (device, scene, caption) at 2× or 3×; Video records one seamless 8.3 s loop of the ranked-list animation at 30 fps as MP4 (H.264) — ready for Instagram, LinkedIn and X; a WebM fallback only appears in browsers without WebCodecs. Download all zips every scene at the current framing. <strong style={{ color: C.ink }}>Screenshot tips</strong> if you prefer: Browser zoom 100% (⌘0), window at least 1440px wide for the laptop scenes. Use the OS screenshot tool (⌘⇧4 on Mac) and drag exactly the stage rectangle — the warm edge is the crop line. For Retina exports that’s 2× resolution automatically. “Story” stages are tall; scroll so the whole stage is on screen first. Reduced-motion on the OS freezes the ranked-list animation on the shortlist frame, which is usually the one you want.
          </div>

          <div className="mk-grid" data-preset={preset.key}>
            {shown.map((scene, i) => (
              <section key={scene.key} className="mk-item">
                <div className="mk-head">
                  <div><div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{String(i + 1).padStart(2, '0')} · {scene.device}</div><h2 style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{scene.title}</h2></div>
                  <p style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5, maxWidth: 420, margin: 0 }}>{scene.blurb}</p>
                </div>
                <Stage scene={scene} preset={preset} canvas={canvas} caption={caption} register={register} onExport={onExport} busy={busy} />
              </section>
            ))}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .mk-wrap { max-width: 1320px; margin: 0 auto; padding: clamp(20px, 3vw, 36px) clamp(16px, 3vw, 28px) 80px; }
        .mk-controls { position: sticky; top: 0; z-index: 20; background: rgba(250,248,243,0.92); backdrop-filter: blur(8px); border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 10px 12px; display: flex; gap: 14px 22px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
        .mk-group { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .mk-label { font-size: 10px; color: ${C.inkMute}; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-right: 4px; }
        .mk-chip { background: ${C.card}; border: 1px solid ${C.ruleDark}; color: ${C.ink}; border-radius: ${R.pill}px; padding: 6px 11px; font-size: 12.5px; font-weight: 600; cursor: pointer; min-height: 32px; }
        .mk-chip.on { background: ${C.ink}; color: ${C.paper}; border-color: ${C.ink}; }
        .mk-select { border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; padding: 6px 10px; font-size: 12.5px; background: ${C.card}; color: ${C.ink}; min-height: 32px; }
        .mk-tips { padding: 12px 14px; background: ${C.paperDeep}; border-radius: ${R.ctrl}px; font-size: 12.5px; color: ${C.inkSoft}; line-height: 1.55; margin-bottom: 22px; }
        .mk-grid { display: grid; gap: 28px; grid-template-columns: 1fr; }
        .mk-grid[data-preset="square"], .mk-grid[data-preset="portrait"] { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
        .mk-grid[data-preset="story"] { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
        .mk-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
        .mk-export { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; opacity: 0.55; transition: opacity 160ms ease; }
        .mk-stage:hover .mk-export, .mk-export:focus-within { opacity: 1; }
        .mk-xbtn { background: ${C.paper}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: ${R.pill}px; padding: 6px 11px; font-size: 12px; font-weight: 700; cursor: pointer; min-height: 30px; box-shadow: 0 2px 8px rgba(15,15,16,0.12); }
        .mk-xbtn:disabled { opacity: 0.5; cursor: wait; }
        .mk-stage { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; border-radius: ${R.card}px; overflow: hidden; outline: 1px solid ${C.rule}; outline-offset: -1px; }
        @media (max-width: 520px) { .mk-grid, .mk-grid[data-preset] { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
