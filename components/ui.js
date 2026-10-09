// components/ui.js
// Shared presentation primitives. Presentation-only. Inline-style idiom to
// match the codebase. Import { GlobalStyle, Wordmark, Icon, ScrollHeader,
// TickMeter } where needed.

import { useEffect, useRef } from 'react';
import { C, R, SH, EASE, FONT } from './theme';
import { noWidow } from '../lib/typeset';
import { LOGO } from '../lib/brand/logoPaths';
import { PRESS_CSS, NAV_CSS, HIT_CSS } from '../lib/motion';
import Sheet, { SHEET_PAGE_CSS } from './Sheet';

// ─── GLOBAL STYLE + MOTION LANGUAGE ──────────────────────────
// One stylesheet. All motion guarded by prefers-reduced-motion so the page
// reads fully static (and works with JS off) for opt-out users.
export const GlobalStyle = () => (
  <style jsx global>{`
    /* Font faces (Inter + Fraunces) are loaded once for every page in
       pages/_document.js via preconnect + <link>, no @import here. */
    /* ── THE SCALES (realtor side). Space 4 8 12 16 24 32 48; type display 28 22 18 in Fraunces,
       body 16 14 in Inter, eyebrow 11 uppercase tracked; numerals tabular. Card padding 16 at
       390, one rule colour. Sections 32 apart, cards 16, related lines 8 inside a card. ── */
    :root {
      --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px;
      --t-d1: 28px; --t-d2: 22px; --t-d3: 18px; --t-body: 16px; --t-body-2: 14px; --t-eyebrow: 11px;
      --lh-display: 1.15; --lh-body: 1.5; --lh-eyebrow: 1;
      --f-display: ${FONT.serif}; --f-body: ${FONT.sans};
      --card-pad: 16px; --card-radius: ${R.card}px; --rule: ${C.rule};
      /* The one page canvas. Painted on html, body and the Next root below, so the area under short
         content and the iOS overscroll region carry it too. */
      --paper: ${C.paper};
      /* Every control is a pill: buttons, text buttons, chips, the confirm pills, the Invite
         controls, every control on the tenant side. Cards, inputs, the drop zone, the meter and
         the ink blocks keep --card-radius. */
      --btn-radius: ${R.pill}px;
      --gap-section: 32px; --gap-card: 16px; --gap-line: 8px;
      /* The red budget: --action fills exactly one button per screen, the screen's primary action.
         Every other control is ink. The red tick and the red dot are signals, not controls. */
      --action: ${C.red};
      /* The field focus ring: ink, 18.05 to 1 on paper and 19.16 on white. An instrument surface
         sets its own (components/admin/AdminShell.js). */
      --focus-ring: ${C.ink};
    }
    /* The two webfonts, self hosted (public/fonts, the latin variable files), swapped in when they
       arrive; the preloads live in pages/_document.js. */
    @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('/fonts/inter-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('/fonts/fraunces-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    /* Metric matched fallbacks so text set in the system face before the webfont arrives takes the
       same space (size-adjust from the real font files against Arial and Georgia). */
    @font-face { font-family: 'Inter Fallback'; src: local('Arial'); size-adjust: 107.48%; ascent-override: 90.14%; descent-override: 22.44%; line-gap-override: 0%; }
    @font-face { font-family: 'Fraunces Fallback'; src: local('Georgia'); size-adjust: 109.40%; ascent-override: 89.39%; descent-override: 23.31%; line-gap-override: 0%; }
    .t-d1 { font-family: var(--f-display); font-size: var(--t-d1); line-height: var(--lh-display); font-weight: 600; letter-spacing: -0.02em; }
    .t-d2 { font-family: var(--f-display); font-size: var(--t-d2); line-height: var(--lh-display); font-weight: 600; letter-spacing: -0.015em; }
    .t-d3 { font-family: var(--f-display); font-size: var(--t-d3); line-height: var(--lh-display); font-weight: 600; letter-spacing: -0.01em; }
    .t-body { font-size: var(--t-body); line-height: var(--lh-body); }
    .t-body-2 { font-size: var(--t-body-2); line-height: var(--lh-body); }
    .t-eyebrow { font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .num { font-variant-numeric: tabular-nums; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: var(--paper);
      min-height: 100%;
    }
    /* The overscroll bounce and the region behind the notch (viewport-fit=cover) paint the ROOT
       element's background, so html carries the canvas explicitly, not only through body. */
    html {
      background-color: var(--paper);
      scroll-behavior: smooth;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
      /* Nothing drags past the last element: no rubber band past the page's end. On the root only:
         body is a scroll box too (overflow-x hidden on both), and the same rule on it left Chrome
         no way to hand a touch scroll up to the page, so the page did not scroll under a finger. */
      overscroll-behavior-y: none;
    }
    /* The press (lib/motion.js), the page behind a sheet (components/Sheet.js), the push. */
    ${PRESS_CSS}
    ${HIT_CSS}
    ${SHEET_PAGE_CSS}
    ${NAV_CSS}
    /* The Next root sits between body and the page, so it carries the canvas too: nothing between
       the root and a card can paint a different tone. */
    #__next {
      background-color: var(--paper);
      min-height: 100%;
    }
    body {
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
    /* Every field is 16px or more: iOS Safari zooms the page when a field under 16px takes focus,
       Face ID autofill focuses the sign in field, and the zoom carried into the dashboard. A field
       may set a larger size; tests/fieldSize.test.mjs fails on any smaller one. */
    input, textarea, select { font-size: var(--t-body); }
    /* One placeholder colour, the mute token, which passes 4.5 to 1 on every field background. */
    input::placeholder, textarea::placeholder { color: ${C.inkMute}; opacity: 1; }
    button { cursor: pointer; border: none; background: none; }
    /* Zero sharp edges — every control gets a soft radius unless it sets its
       own inline (pills, circles, and bespoke radii keep theirs since inline
       styles only override the properties they declare). */
    /* Controls that sit together: one height, one gap (the card gap), one left edge, and at 390
       one width, so a row never mixes a full width control with a narrower one. */
    /* Status pills (StatusPills below): each fact its own pill, wrapping as a whole unit, 8px apart
       both ways, left aligned. Paper fill, rule border and ink text on white cards; the one fact
       that needs the realtor's action is filled ink. On ink surfaces, transparent with a paper
       border at 24 percent. Never animated: no transition, no animation, full opacity. */
    .rl-pills { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .rl-pill { box-sizing: border-box; display: inline-flex; align-items: center; height: 28px; max-width: 100%; padding: 0 12px;
      border-radius: 999px; border: 1px solid ${C.rule}; background: ${C.paper}; color: ${C.ink};
      font-family: ${FONT.sans}; font-size: 14px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 1; transition: none; animation: none; }
    .rl-pill.rl-pill-action { background: ${C.inst}; border-color: ${C.inst}; color: ${C.paper}; }
    .rl-pills.rl-pills-ink .rl-pill { background: transparent; border-color: rgba(250, 248, 243, 0.24); color: ${C.paper}; }
    /* The same pill at the type scale of a scaled mockup (components/mockups, components/film), where
       body text is 9 to 13px: half its text size in height, as on the live card. */
    .rl-pills.rl-pills-mock { gap: 4px; }
    .rl-pills.rl-pills-mock .rl-pill { height: 16px; padding: 0 7px; font-size: 9px; font-weight: 600; }
    .rl-ctrl-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-card); }
    .rl-ctrl-row > * { min-height: 44px; flex: 0 1 auto; }
    @media (max-width: 420px) { .rl-ctrl-row > * { flex: 1 1 100%; width: 100%; } }
    button { border-radius: var(--btn-radius); }
    input, textarea, select { border-radius: var(--card-radius); }
    input[type="range"] { border-radius: ${R.pill}px; }
    a { color: inherit; }
    ::selection { background: ${C.red}; color: ${C.paper}; }

    /* The wordmark is a link on every screen: a 44px tap target, the art untouched. */
    .rl-mark { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; color: inherit; }
    .rl-serif { font-family: ${FONT.serif}; font-weight: 600; }

    /* ── Surfaces — always applied, no motion dependency ── */
    .rl-card  { border-radius: ${R.card}px; border: 1px solid ${C.rule}; background: ${C.card}; box-shadow: ${SH.rest}; }
    .rl-modal { border-radius: ${R.modal}px; background: ${C.paper}; box-shadow: ${SH.modal}; overflow: hidden; }

    /* ── Sticky scroll-shrink header — site-wide ── */
    .rl-header { position: sticky; top: 0; z-index: 60; background: rgba(250,248,243,0.72); padding-top: env(safe-area-inset-top, 0px);
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
      @keyframes rl-pulse    { 0%,80%,100% { opacity: .2; transform: scale(.8) } 40% { opacity: 1; transform: scale(1) } }

      /* Hover lifts, for pointers that hover only: a tap on a phone never leaves one stuck. The
         press itself is the shared one (lib/motion.js installPress). */
      @media (hover: hover) {
        .rl-btn { transition: transform 200ms ${EASE}, box-shadow 200ms ease, background 160ms ease, border-color 160ms ease; }
        .rl-btn:not(:disabled):hover  { transform: translateY(-2px); box-shadow: ${SH.raised}; }
        .rl-btn .rl-arrow { display: inline-block; transition: transform 220ms ${EASE}; }
        .rl-btn:not(:disabled):hover .rl-arrow { transform: translateX(4px); }
        .rl-card-lift { transition: transform 240ms ${EASE}, box-shadow 240ms ease; }
        .rl-card-lift:hover { transform: translateY(-4px); box-shadow: ${SH.raised}; }
      }

      .rl-dot { animation: rl-pulse 1.3s ease-in-out infinite; }
    }

    /* Focus ring for keyboard users on links and buttons, always on. The outline follows each
       control's own radius, so a pill stays a pill. */
    a:focus-visible, button:focus-visible {
      outline: 2px solid ${C.red}; outline-offset: 2px;
    }
    /* Fields: a visible ink ring on every focus (a text field matches :focus-visible on a tap too),
       on paper and on white. Important because a field's inline style must never switch it off. */
    input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 2px solid var(--focus-ring) !important; outline-offset: 2px;
    }
  `}</style>
);

// ─── STATUS PILLS: a list of short facts, one pill each ─────
// <StatusPills items={['2 applicants', { text: 'report not sent', action: true }]} />. The one
// component for every list of short status or count facts; a full sentence stays text. items:
// strings or { text, action }; null, false and '' are skipped. tone 'paper' on white and paper
// cards, 'ink' on ink surfaces (the Pipeline card, the welcome card). At most one pill is filled:
// the first fact marked action, and only on paper. Pills are not controls; a list, not buttons.
export const StatusPills = ({ items, tone = 'paper', label, className = '', style }) => {
  const list = (items || []).map((x) => (typeof x === 'string' ? { text: x } : x)).filter((x) => x && x.text);
  if (!list.length) return null;
  const action = tone === 'paper' ? list.findIndex((x) => x.action) : -1;
  return (
    <ul className={`rl-pills rl-pills-${tone}${className ? ` ${className}` : ''}`} aria-label={label} style={style}>
      {list.map((x, i) => <li key={i} className={`rl-pill${i === action ? ' rl-pill-action' : ''}`}>{x.text}</li>)}
    </ul>
  );
};

// ─── STACKED LINES: parts of one value, one per line ───────
// For a value made of several parts that are not statuses (an employer and the employment type, a
// name and a phone number): each part on its own line, no separator, the last two words of each
// kept together. parts: strings or nodes; empty ones are skipped. A value string written with
// " · " between its parts is split on it.
export const StackedLines = ({ parts, text }) => {
  const list = (parts || String(text ?? '').split(' · ')).filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <>{list.map((x, i) => <span key={i} style={{ display: 'block' }}>{typeof x === 'string' ? noWidow(x) : x}</span>)}</>;
};

// ─── WORDMARK: the official logo, the one mark everywhere ─────
// The red bar (the tick motif), then "Rentletter" in Fraunces 600 at optical size 144, drawn as
// vector paths (lib/brand/logoPaths.js, built by scripts/brand/build-brand.mjs), so it is the same
// logo before the web font arrives, in the PDF and in the email PNG. size: a named size (the cap
// height in px) or a number of px; onDark: paper letters on ink. Inside a link, the link carries
// the name; standalone, the SVG does (role img, "Rentletter"). The 44px target stays on the link
// (.rl-mark). At 32px and under the brand is the small mark (public/icons), never this.
export const WORDMARK_CAP = Object.freeze({ header: 16, footer: 13, auth: 22, hero: 32, mock: 9 });
export const Wordmark = ({ size = 'header', onDark = false, style }) => {
  const cap = typeof size === 'number' ? size : (WORDMARK_CAP[size] || WORDMARK_CAP.header);
  const k = cap / 100;
  return (
    <svg className="rl-wordmark" width={Math.round(LOGO.w * k * 10) / 10} height={Math.round(LOGO.h * k * 10) / 10}
      viewBox={`0 0 ${LOGO.w} ${LOGO.h}`} role="img" aria-label="Rentletter" focusable="false"
      style={{ display: 'block', flexShrink: 0, overflow: 'visible', ...style }}>
      <rect x={LOGO.bar.x} y={LOGO.bar.y} width={LOGO.bar.w} height={LOGO.bar.h} rx={LOGO.bar.rx} fill={C.red} />
      <path d={LOGO.text} fill={onDark ? C.paper : C.ink} />
    </svg>
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
    // While a sheet pins the page (components/Sheet.js), the jump to the top is not a scroll: the
    // header keeps its state, so nothing shifts when the page is put back.
    const onScroll = () => { if (document.body.style.position === 'fixed') return; el.classList.toggle('rl-shrink', window.scrollY > 8); };
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

// No scroll reveal anywhere: every element renders at full opacity, laid out first. The motion
// that remains lives in lib/motion.js and components/motion: the meter fill on mount, the card
// state slide, and the opacity fade on a newly mounted card, all behind the motion query.

// ─── TICK METER — the red tick-mark motif as the score language ──────────────
// Renders a score (e.g. scorecard 0–5) as a row of tick marks instead of bare
// "4.2/5" text: filled ticks in signal red, a half-opacity tick for the fraction,
// empty ticks in rule. Pass showValue to print the tabular-nums numeral beside it.
// Purely presentational — no motion, safe under reduced-motion.
// muted: the same meter with grey ticks instead of the editorial red. The colour carries the
// confidence: muted while the Fit rests on stated facts, red once documents match or the realtor
// has verified (the caller decides from fit.label; components/dashboard/ListingView.js).
export const TickMeter = ({ value, max = 5, size = 14, showValue = true, onDark = false, muted = false }) => {
  const v = Math.max(0, Math.min(Number(value) || 0, max));
  const full = Math.floor(v);
  const hasPartial = v - full >= 0.25 && full < max;
  const empty = onDark ? C.instRule : C.rule;
  const fill = muted ? (onDark ? C.instMute : C.inkMute) : (onDark ? C.redBright : C.red);
  return (
    <span role="img" aria-label={`${v} out of ${max}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ display: 'inline-flex', gap: 3 }} aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{
            width: 3, height: size, borderRadius: 1, flexShrink: 0,
            background: i < full ? fill : (i === full && hasPartial) ? fill : empty,
            opacity: i === full && hasPartial ? 0.4 : 1,
          }} />
        ))}
      </span>
      {showValue && (
        <span style={{
          fontSize: size - 1, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1,
          color: onDark ? C.instText : C.ink, fontVariantNumeric: 'tabular-nums',
        }}>
          {v}<span style={{ fontSize: size - 4, fontWeight: 500, color: onDark ? C.instMute : C.inkMute }}>/{max}</span>
        </span>
      )}
    </span>
  );
};

// ─── CONFIRM SHEET: in place of the native window.confirm() ─────────────────
// One confirmation idiom product wide, on the one sheet (components/Sheet.js): an iOS style
// bottom sheet with its grab handle; the title drags it down. The confirm button carries the
// action verb, never "OK"; destructive actions use the danger red, not brand red. Escape, a
// drag down or a tap on the dimmed page cancels, never while busy.
// footer renders under the buttons (a line about the action just refused sits under it).
export const ConfirmSheet = ({
  open, title, body, footer = null, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, busy = false, onConfirm, onCancel,
}) => {
  const accent = danger ? C.danger : C.red;
  return (
    <Sheet open={open} onClose={onCancel} role="alertdialog" label={title} busy={busy} maxWidth={480}>
      <div style={{ padding: '4px 20px 20px' }}>
        <h3 data-sheet-drag="" style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', marginBottom: 8 }}>
          {title}
        </h3>
        {body && <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18, textWrap: 'pretty' }}>{typeof body === 'string' ? noWidow(body) : body}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* A confirmation is only ever a direct hit (lib/motion.js: the tap resolver skips it). */}
          <button data-destructive="" onClick={onConfirm} disabled={busy} autoFocus
            style={{
              flex: '1 1 0', minWidth: 0, background: busy ? C.ruleDark : accent, color: C.paper, border: `1px solid ${busy ? C.ruleDark : accent}`,
              borderRadius: 'var(--btn-radius)', padding: '14px var(--gap-card)', fontSize: 15, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer', minHeight: 48,
            }}>
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button onClick={onCancel} disabled={busy}
            style={{
              flex: '1 1 0', minWidth: 0, background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`,
              borderRadius: 'var(--btn-radius)', padding: '14px var(--gap-card)', fontSize: 15, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer', minHeight: 48,
            }}>
            {cancelLabel}
          </button>
        </div>
        {footer}
      </div>
    </Sheet>
  );
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
  more:     <><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="1.5" /><path d="M4 10h16M8 3.5v4M16 3.5v4" /></>,
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
