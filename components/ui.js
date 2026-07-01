// components/ui.js
// Shared presentation primitives. Presentation-only. Inline-style idiom to
// match the codebase. Import { GlobalStyle, Wordmark, Icon, ScrollHeader,
// useReveal } where needed.

import { useEffect, useRef } from 'react';
import { C, R, SH, EASE, FONT } from './theme';

// ─── GLOBAL STYLE + MOTION LANGUAGE ──────────────────────────
// One stylesheet. All motion guarded by prefers-reduced-motion so the page
// reads fully static (and works with JS off) for opt-out users.
export const GlobalStyle = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html {
      scroll-behavior: smooth;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    body {
      background: ${C.paper};
      color: ${C.ink};
      font-family: ${FONT.sans};
      overflow-x: hidden;
      max-width: 100%;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    #__next { overflow-x: hidden; max-width: 100%; }
    /* Media never forces the page wider than the viewport */
    img, svg, video, canvas, iframe { max-width: 100%; }
    button, input, textarea, select { font-family: ${FONT.sans}; }
    button { cursor: pointer; border: none; background: none; }
    /* Zero sharp edges — every control gets a soft radius unless it sets its
       own inline (pills, circles, and bespoke radii keep theirs since inline
       styles only override the properties they declare). */
    button, input, textarea, select { border-radius: ${R.ctrl}px; }
    input[type="range"] { border-radius: ${R.pill}px; }
    input:focus, textarea:focus, select:focus { outline: none; }
    a { color: inherit; }
    ::selection { background: ${C.red}; color: ${C.paper}; }

    .rl-serif { font-family: ${FONT.serif}; font-weight: 600; }

    /* ── Surfaces — always applied, no motion dependency ── */
    .rl-card  { border-radius: ${R.card}px; border: 1px solid ${C.rule}; background: ${C.card}; box-shadow: ${SH.rest}; }
    .rl-modal { border-radius: ${R.modal}px; background: ${C.paper}; box-shadow: ${SH.modal}; overflow: hidden; }

    /* ── Sticky scroll-shrink header — site-wide ── */
    .rl-header { position: sticky; top: 0; z-index: 60; background: rgba(250,248,243,0.72);
      -webkit-backdrop-filter: saturate(180%) blur(14px); backdrop-filter: saturate(180%) blur(14px);
      border-bottom: 1px solid transparent;
      transition: box-shadow 280ms ease, border-color 280ms ease, background 280ms ease; }
    .rl-header.rl-shrink { border-bottom-color: ${C.rule}; box-shadow: 0 1px 0 rgba(15,15,16,.03), 0 8px 24px rgba(15,15,16,.05); background: rgba(250,248,243,0.86); }
    .rl-header-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
      padding: 18px clamp(18px, 4vw, 32px); transition: padding 280ms ${EASE}; }
    .rl-header.rl-shrink .rl-header-inner { padding: 11px clamp(18px, 4vw, 32px); }

    /* ── Accordion (FAQ) — smooth height via grid-rows trick ── */
    .rl-acc { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 360ms ${EASE}; }
    .rl-acc.rl-acc-open { grid-template-rows: 1fr; }
    .rl-acc > div { overflow: hidden; min-height: 0; }
    .rl-chev { transition: transform 300ms ${EASE}; }
    .rl-chev.rl-chev-open { transform: rotate(180deg); }

    /* ── Baselines visible without motion / JS ── */
    .rl-rule-draw { width: 28px; }
    .rl-step-bar  { display: block; height: 2px; }
    .rl-line-wrap { display: contents; }

    @media (prefers-reduced-motion: no-preference) {
      @keyframes rl-draw     { from { width: 0 }                                 to { width: 28px } }
      @keyframes rl-slide-up { from { opacity: 0; transform: translateY(34px) } to { opacity: 1; transform: none } }
      @keyframes rl-fade-seq { from { opacity: 0; transform: translateY(22px) } to { opacity: 1; transform: none } }
      @keyframes rl-pulse    { 0%,80%,100% { opacity: .2; transform: scale(.8) } 40% { opacity: 1; transform: scale(1) } }

      .rl-rule-draw { animation: rl-draw 560ms ${EASE} both; }

      /* Hero text lines slide up out of an overflow clip */
      .rl-line-wrap { overflow: hidden; display: block; padding-bottom: .04em; }
      .rl-line      { display: block; animation: rl-slide-up 640ms ${EASE} both; }

      /* Sequential fade-up for hero supporting elements */
      .rl-hero-seq  { animation: rl-fade-seq 500ms ${EASE} both; }

      /* Scroll reveal — fires once via IntersectionObserver adding .rl-vis */
      .rl-reveal { opacity: 0; transform: translateY(28px); transition: opacity 620ms ease, transform 680ms ${EASE}; }
      .rl-reveal.rl-vis { opacity: 1; transform: none; }

      /* Stepped reveal — parent gets .rl-vis, children stagger */
      .rl-steps .rl-step { opacity: 0; transform: translateY(28px); transition: opacity 560ms ease, transform 620ms ${EASE}; }
      .rl-steps.rl-vis .rl-step:nth-child(1) { opacity: 1; transform: none; }
      .rl-steps.rl-vis .rl-step:nth-child(2) { opacity: 1; transform: none; transition-delay: 110ms; }
      .rl-steps.rl-vis .rl-step:nth-child(3) { opacity: 1; transform: none; transition-delay: 220ms; }
      .rl-steps.rl-vis .rl-step:nth-child(4) { opacity: 1; transform: none; transition-delay: 330ms; }
      .rl-step-bar { transform: scaleX(0); transform-origin: left; transition: transform 480ms ${EASE}; }
      .rl-steps.rl-vis .rl-step:nth-child(1) .rl-step-bar { transform: scaleX(1); }
      .rl-steps.rl-vis .rl-step:nth-child(2) .rl-step-bar { transform: scaleX(1); transition-delay: 110ms; }
      .rl-steps.rl-vis .rl-step:nth-child(3) .rl-step-bar { transform: scaleX(1); transition-delay: 220ms; }
      .rl-steps.rl-vis .rl-step:nth-child(4) .rl-step-bar { transform: scaleX(1); transition-delay: 330ms; }

      /* Button micro-interactions */
      .rl-btn { transition: transform 200ms ${EASE}, box-shadow 200ms ease, background 160ms ease, border-color 160ms ease; }
      .rl-btn:not(:disabled):hover  { transform: translateY(-2px); box-shadow: ${SH.raised}; }
      .rl-btn:not(:disabled):active { transform: translateY(0); box-shadow: none; transition-duration: 90ms; }
      .rl-btn .rl-arrow { display: inline-block; transition: transform 220ms ${EASE}; }
      .rl-btn:not(:disabled):hover .rl-arrow { transform: translateX(4px); }

      /* Card lift */
      .rl-card-lift { transition: transform 240ms ${EASE}, box-shadow 240ms ease; }
      .rl-card-lift:hover { transform: translateY(-4px); box-shadow: ${SH.raised}; }

      .rl-dot { animation: rl-pulse 1.3s ease-in-out infinite; }
    }

    /* Focus-visible ring for keyboard users — accessibility, always on */
    a:focus-visible, button:focus-visible, input:focus-visible,
    textarea:focus-visible, select:focus-visible {
      outline: 2px solid ${C.red}; outline-offset: 2px; border-radius: 4px;
    }
  `}</style>
);

// ─── WORDMARK — Time-magazine red bar + bold sans ────────────
export const Wordmark = ({ size = 'sm', onDark = false }) => {
  const isLg = size === 'lg';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: isLg ? 11 : 8 }}>
      <span style={{ width: isLg ? 5 : 3.5, height: isLg ? 30 : 21, background: C.red, borderRadius: 1, flexShrink: 0 }} />
      <span style={{
        fontSize: isLg ? 25 : 18, color: onDark ? C.paper : C.ink,
        fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1,
      }}>
        Rentletter
      </span>
    </span>
  );
};

// ─── SCROLL-SHRINK STICKY HEADER ─────────────────────────────
// Sticky header that gains a hairline + shadow and tightens its padding once
// the page scrolls. Pass header content as children (left + right groups).
export const ScrollHeader = ({ children, maxWidth = 1200 }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => el.classList.toggle('rl-shrink', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header ref={ref} className="rl-header">
      <div className="rl-header-inner" style={{ maxWidth }}>{children}</div>
    </header>
  );
};

// ─── SCROLL FADE ─────────────────────────────────────────────
// Fades and lifts its children away as the page scrolls down (opacity 1→0
// over `distance` px). Opacity/transform only; static for reduced-motion.
export const ScrollFade = ({ children, distance = 220, style }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = Math.min(Math.max(window.scrollY / distance, 0), 1);
        el.style.opacity = String(1 - t);
        el.style.transform = `translateY(${-12 * t}px)`;
        el.style.pointerEvents = t > 0.85 ? 'none' : 'auto';
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [distance]);
  return <div ref={ref} style={{ transition: 'opacity 120ms linear', willChange: 'opacity, transform', ...style }}>{children}</div>;
};

// ─── SCROLL REVEAL HOOK ──────────────────────────────────────
// Adds .rl-vis to every .rl-reveal / .rl-steps element as it enters view, once.
// No-ops for reduced-motion (elements are already visible via the static base).
export const useReveal = (dep) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const els = document.querySelectorAll('.rl-reveal:not(.rl-vis), .rl-steps:not(.rl-vis)');
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rl-vis'); obs.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [dep]);
};

// ─── ICON SET — inline SVG, 1.5px stroke, currentColor ───────
const PATHS = {
  arrow:    <path d="M5 12h14M13 6l6 6-6 6" />,
  check:    <path d="M4 12.5l5 5L20 6.5" />,
  x:        <path d="M6 6l12 12M18 6L6 18" />,
  question: <><path d="M9.2 9a2.8 2.8 0 0 1 5.5.8c0 1.9-2.8 2.5-2.8 4" /><circle cx="12" cy="17.5" r=".6" fill="currentColor" stroke="none" /></>,
  phone:    <path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 5 6.6 1.5 1.5 0 0 1 6.5 4z" />,
  mail:     <><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></>,
  edit:     <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2 4 20z" />,
  search:   <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  link:     <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17.2" />,
  plus:     <path d="M12 5v14M5 12h14" />,
  copy:     <><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" /><path d="M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" /></>,
  chevron:  <path d="M9 6l6 6-6 6" />,
  chevronD: <path d="M6 9l6 6 6-6" />,
  doc:      <><path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V5A1.5 1.5 0 0 1 6 3.5z" /><path d="M13 3.5V8.5h5" /></>,
  send:     <path d="M20 4L3 11l6 2.5L11.5 20 20 4z" />,
  shield:   <path d="M12 3.5l7 2.5v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-2.5z" />,
  user:     <><circle cx="12" cy="8.5" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  users:    <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 5.8M16.5 19a5.5 5.5 0 0 0-2-4.3" /></>,
  list:     <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />,
  grid:     <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  home:     <path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" />,
  bell:     <><path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 5.5 2 6H4c.5-.5 2-1.5 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  print:    <><path d="M7 8.5V4h10v4.5" /><rect x="4.5" y="8.5" width="15" height="8" rx="1.5" /><path d="M7 14.5h10V21H7z" /></>,
};

export const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.5, style }) => {
  const d = PATHS[name];
  if (!d) return null;
  const filled = name === 'star';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={filled ? 'none' : color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }} aria-hidden="true">
      {d}
    </svg>
  );
};

// Filled star — kept separate since it uses fill, not stroke
export const StarIcon = ({ size = 14, on = true }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.5l1.2-6L3.4 9.3l6-.7L12 3z"
      fill={on ? C.red : 'none'} stroke={on ? 'none' : C.ruleDark} strokeWidth="1.5" />
  </svg>
);
