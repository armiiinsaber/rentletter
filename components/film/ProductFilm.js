// components/film/ProductFilm.js
// The 43-second product film — a camera moving through the product, built from DOM.
//
//   stage (perspective)  →  pivot (scale · rotateX · rotateY = the camera)  →  world (1000×562)
//       └ overlays (wordmark / tagline, in stage space)     └ laptop (DeviceFrame) ─ six screens
//                                                           └ phone  (DeviceFrame) ─ the application
//
// ONE clock. `t` (seconds) is the only state; camera, screens and beats are pure functions of it
// (components/film/timeline.js), so scrubbing, playing and frame-stepping for export all render
// the same pixels. No CSS transitions; transform + opacity only.
//
//   <ProductFilm />                       autoplay from 0 (reduced motion → the final frame, still)
//   <ProductFilm time={12.5} />           controlled (exporter / scrubber)
//   ref: play() pause() seek(t) restart() getTime() isPlaying()
//
// Not imported by the landing page yet — when it is, load it with next/dynamic (ssr: false) so it
// stays out of the initial bundle. /admin/mockups renders it as a scene with a scrubber.
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import DeviceFrame from '../DeviceFrame';
import { C } from '../theme';
import { FILM_DURATION, WORLD, LAPTOP, PHONE, LAPTOP_DESIGN, PHONE_DESIGN, camera, screenOpacity, phonePose, overlays, beats } from './timeline';
import { ListingScreen, ApplyScreen, RankedScreen, VerifyScreen, ReportScreen, StudioScreen } from './beats';

const LAPTOP_SCALE = (LAPTOP.w * (1 - 0.028)) / LAPTOP_DESIGN;   // DeviceFrame laptop bezel is 1.4% a side
const PHONE_SCALE = (PHONE.w * (1 - 0.056)) / PHONE_DESIGN;      // phone bezel 2.8% a side
const LAPTOP_SCREEN_H = Math.round(LAPTOP_DESIGN * 10 / 16);

// A screen laid out at design size, scaled into the device. Memoised on its beat values so a
// held shot re-renders nothing but the camera.
const Scaled = memo(function Scaled({ scale, w, h, opacity, children }) {
  if (opacity <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }} aria-hidden={opacity < 0.5}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}, (a, b) => a.opacity === b.opacity && a.scale === b.scale && a.beatKey === b.beatKey);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); setReduced(m.matches); const h = () => setReduced(m.matches); m.addEventListener?.('change', h); return () => m.removeEventListener?.('change', h); }, []);
  return reduced;
}
function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const read = () => setW(el.getBoundingClientRect().width); read(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null; ro?.observe(el); return () => ro?.disconnect(); }, [ref]);
  return w;
}

const ProductFilm = forwardRef(function ProductFilm({ time = null, autoplay = true, loop = false, onTime, style, className = '' }, ref) {
  const controlled = typeof time === 'number';
  const reduced = useReducedMotion();
  const [t, setT] = useState(controlled ? time : 0);
  const [playing, setPlaying] = useState(false);
  const clock = useRef({ raf: 0, t0: 0, base: 0 });
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const narrow = width > 0 && width < 720;

  // ── the clock ──
  const stop = () => { cancelAnimationFrame(clock.current.raf); clock.current.raf = 0; setPlaying(false); };
  const play = (from) => {
    if (controlled) return;
    const start = typeof from === 'number' ? from : (clock.current.base >= FILM_DURATION ? 0 : clock.current.base);
    cancelAnimationFrame(clock.current.raf);
    clock.current.t0 = performance.now() - start * 1000; setPlaying(true);
    const tick = (now) => {
      let cur = (now - clock.current.t0) / 1000;
      if (cur >= FILM_DURATION) { if (loop) { clock.current.t0 = now; cur = 0; } else { cur = FILM_DURATION; clock.current.base = cur; setT(cur); onTime?.(cur); stop(); return; } }
      clock.current.base = cur; setT(cur); onTime?.(cur);
      clock.current.raf = requestAnimationFrame(tick);
    };
    clock.current.raf = requestAnimationFrame(tick);
  };
  const seek = (to) => { const v = Math.max(0, Math.min(FILM_DURATION, Number(to) || 0)); clock.current.base = v; if (clock.current.raf) { clock.current.t0 = performance.now() - v * 1000; } else { setT(v); onTime?.(v); } };
  useImperativeHandle(ref, () => ({ play: () => play(), pause: stop, seek, restart: () => play(0), getTime: () => (controlled ? time : clock.current.base), isPlaying: () => !!clock.current.raf, duration: FILM_DURATION }));

  useEffect(() => {
    if (controlled) { setT(time); return undefined; }
    if (reduced) { stop(); clock.current.base = FILM_DURATION; setT(FILM_DURATION); return undefined; }
    if (autoplay) play(0);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, time, reduced, autoplay]);

  // ── everything below is a pure function of t ──
  const cam = camera(t, { narrow });
  const so = screenOpacity(t); const ph = phonePose(t); const ov = overlays(t); const b = beats(t);
  const fit = width ? width / WORLD.w : 1;
  const keys = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, JSON.stringify(v)]));
  const stageAspect = narrow ? '4 / 5' : '16 / 9';

  return (
    <div ref={wrapRef} className={`rl-film ${className}`} style={{ position: 'relative', width: '100%', aspectRatio: stageAspect, overflow: 'hidden', background: `radial-gradient(120% 90% at 50% 0%, ${C.card} 0%, ${C.paper} 55%, ${C.paperDeep} 100%)`, perspective: 1400, perspectiveOrigin: '50% 45%', contain: 'layout paint', ...style }} data-film-time={t.toFixed(2)} aria-label="Rentletter product film">
      {/* camera */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d', transform: `scale(${fit * cam.z}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`, willChange: 'transform' }}>
        {/* world */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: WORLD.w, height: WORLD.h, transform: `translate3d(${-cam.x}px, ${-cam.y}px, 0)`, transformStyle: 'preserve-3d' }}>
          {/* laptop */}
          <div style={{ position: 'absolute', left: LAPTOP.x, top: LAPTOP.y, width: LAPTOP.w }}>
            <DeviceFrame variant="laptop" url="rentletter.ca/dashboard" aspect="16 / 10" tone="paper" dark={so.verify > 0.5} style={{ boxShadow: 'none' }}>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.listing} beatKey={keys.listing}><ListingScreen b={b.listing} /></Scaled>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.ranked} beatKey={keys.ranked}><RankedScreen b={b.ranked} /></Scaled>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.verify} beatKey={keys.verify}><VerifyScreen b={b.verify} /></Scaled>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.report} beatKey={keys.report}><ReportScreen b={b.report} /></Scaled>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.studio} beatKey={keys.studio}><StudioScreen b={b.studio} /></Scaled>
              <Scaled scale={LAPTOP_SCALE} w={LAPTOP_DESIGN} h={LAPTOP_SCREEN_H} opacity={so.report2} beatKey={keys.report2}><ReportScreen b={{ mast: 1, brand: 1, rows: [1, 1, 1], logo: 1, foot: 1 }} logo={b.report2.logo} /></Scaled>
            </DeviceFrame>
          </div>
          {/* phone — enters for the tenant beat, leaves on the pull-back */}
          {ph.k > 0 && (
            <div style={{ position: 'absolute', left: PHONE.x, top: PHONE.y, width: PHONE.w, opacity: ph.k, transform: `translate3d(0, ${ph.dy}px, 60px) rotateY(${ph.ry}deg) scale(${ph.scale})`, transformOrigin: '50% 60%' }}>
              <DeviceFrame variant="phone" tone="paper" style={{ boxShadow: 'none' }}>
                <Scaled scale={PHONE_SCALE} w={PHONE_DESIGN} h={Math.round(PHONE_DESIGN * 1.62)} opacity={1} beatKey={keys.apply}><ApplyScreen b={b.apply} /></Scaled>
              </DeviceFrame>
            </div>
          )}
        </div>
      </div>
      {/* overlays — stage space */}
      <div style={{ position: 'absolute', left: '5%', bottom: '6%', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: ov.wordmarkIntro * 0.85, transform: `translate3d(0, ${(1 - ov.wordmarkIntro) * 6}px, 0)` }} aria-hidden="true">
        <span style={{ width: 3.5, height: 21, background: C.red, borderRadius: 1 }} /><span style={{ fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 800, letterSpacing: '-0.025em', color: C.ink }}>Rentletter</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: narrow ? '7%' : '9%', textAlign: 'center', padding: '0 6%' }} aria-hidden={ov.endWordmark < 0.5}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 11, opacity: ov.endWordmark, transform: `translate3d(0, ${(1 - ov.endWordmark) * 10}px, 0)` }}>
          <span style={{ width: 5, height: 30, background: C.red, borderRadius: 1 }} /><span className="rl-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', letterSpacing: '-0.025em', color: C.ink, lineHeight: 1 }}>Rentletter</span>
        </div>
        <div style={{ fontSize: 'clamp(12px, 1.5vw, 15px)', color: C.inkSoft, marginTop: 8, opacity: ov.endTagline, transform: `translate3d(0, ${(1 - ov.endTagline) * 6}px, 0)`, textWrap: 'balance' }}>The AI assistant for rental realtors.</div>
      </div>
      {/* reduced motion: the film holds its final frame; say so once, quietly */}
      {reduced && !controlled && <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, color: C.inkMute, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 999, padding: '3px 8px' }}>Motion reduced</div>}
      {/* clock state for tests / tooling */}
      <span hidden data-film-playing={playing ? 1 : 0} />
      <style jsx global>{`
        /* device shadows: blurred, no negative spread (the shape browsers rasterize consistently) */
        .rl-film .df-shell { box-shadow: 0 0 0 1px #2a2a2e, 0 22px 44px rgba(15,15,16,0.18) !important; }
        .rl-film .df-base { box-shadow: 0 18px 26px rgba(15,15,16,0.16) !important; }
        .rl-film .df-base::after { display: none; }
      `}</style>
    </div>
  );
});
export default ProductFilm;
export { FILM_DURATION };
