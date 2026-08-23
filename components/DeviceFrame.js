// components/DeviceFrame.js
// Reusable device shell for product mockups — pure CSS, no images, no SVG assets beyond a
// handful of inline spans. Restrained: an ink (#101012) instrument surface with a hairline
// bezel, a laptop hinge/base, a phone status bar + island, soft warm shadow so the device sits
// on the paper canvas. Content stays LIVE (children render as-is; animations keep running).
//
//   <DeviceFrame variant="laptop" url="rentletter.ca/dashboard" aspect="16 / 10">…</DeviceFrame>
//   <DeviceFrame variant="phone">…</DeviceFrame>
//   <DeviceFrame variant="tablet">…</DeviceFrame>
//   <DeviceFrame variant="responsive" …>   laptop ≥ 720px, phone below — ONE content node; only
//                                          the decorations swap (CSS), so live content is never
//                                          duplicated and nothing re-mounts at the breakpoint.
//
// props: variant, url (laptop browser bar), aspect (content box ratio; laptop default 16/10,
// phone 9/16, tablet 4/3), phoneAspect (responsive: ratio used in phone mode, default 9/15),
// bg (content background), tone 'paper' | 'ink' (shadow colour), style, className.
import { useEffect, useRef } from 'react';
import { C, R } from './theme';

export const DEVICE_BREAKPOINT = 720;

// ── Laptop browser chrome — macOS Safari proportions in a 560×40 viewBox (scales with the
// screen): traffic lights Ø12 at x=14/34/54 (8pt gaps), a centred 400×26 address field r=7,
// a 12pt shield, 12.5px URL text clipped to the field. ──
function BrowserBar({ url }) {
  return (
    <svg className="df-bar" viewBox="0 0 560 40" width="100%" aria-hidden="true" focusable="false">
      <defs><clipPath id="df-urlclip"><rect x="80" y="7" width="400" height="26" rx="7" /></clipPath></defs>
      <rect x="0" y="0" width="560" height="40" fill="#1c1c1e" />
      <rect x="0" y="39.5" width="560" height="0.5" fill="#2a2a2e" />
      <circle cx="20" cy="20" r="6" fill="#ff5f57" stroke="rgba(0,0,0,0.22)" strokeWidth="0.6" />
      <circle cx="40" cy="20" r="6" fill="#febc2e" stroke="rgba(0,0,0,0.22)" strokeWidth="0.6" />
      <circle cx="60" cy="20" r="6" fill="#28c840" stroke="rgba(0,0,0,0.22)" strokeWidth="0.6" />
      <rect x="80" y="7" width="400" height="26" rx="7" fill="#2c2c2e" />
      <g clipPath="url(#df-urlclip)" fill="#9a9a9f">
        <path transform="translate(92 14)" d="M6 0 1.2 1.7v3.6c0 3.1 2 5.9 4.8 6.7 2.8-.8 4.8-3.6 4.8-6.7V1.7L6 0z" fill="none" stroke="#9a9a9f" strokeWidth="1.15" strokeLinejoin="round" />
        <text x="110" y="24.3" fontFamily="Inter, -apple-system, system-ui, sans-serif" fontSize="12.5" fontWeight="500" letterSpacing="0.01">{url || 'rentletter.ca'}</text>
      </g>
    </svg>
  );
}
// ── iPhone 15 Pro status bar — real metrics in a 393×59 viewBox (59pt = top safe-area inset):
//   Dynamic Island 126×37.33 at y=11, fully rounded (r = 18.67), centred → x 133.5–259.5.
//   Time: SF-style 17pt semibold, left edge x=41, vertically centred on the island (cy 29.67).
//   Right cluster, right edge at x=372 (21pt margin), 5pt gaps, all centred on cy 29.67:
//     signal 19.1×12.3 (4 bars 3.2 wide, 2.1 gaps, heights 4.5/7/9.7/12.3, bottoms y=35.8)
//     wifi 17×12 (three 47° arcs r=5.4/9.1/12.8, stroke 2.3, round caps + 1.7 dot)
//     battery 27.3×12.3 (25×12.3 body r=3.7, 35% outline; 2pt-inset fill r=2; nub 1.5×4.7 centred)
// Everything is in pt units so it scales identically at every frame size. ──
function StatusBar() {
  return (
    <svg className="df-status" viewBox="0 0 393 59" width="100%" aria-hidden="true" focusable="false">
      <text x="41" y="35.7" fontFamily="-apple-system, 'SF Pro Text', Inter, system-ui, sans-serif" fontSize="17" fontWeight="600" letterSpacing="-0.4" fill="currentColor">9:41</text>
      <rect x="133.5" y="11" width="126" height="37.33" rx="18.67" fill="#000" />
      {/* signal */}
      <rect x="299" y="31.3" width="3.2" height="4.5" rx="1" fill="currentColor" />
      <rect x="304.3" y="28.8" width="3.2" height="7" rx="1" fill="currentColor" />
      <rect x="309.6" y="26.1" width="3.2" height="9.7" rx="1" fill="currentColor" />
      <rect x="314.9" y="23.5" width="3.2" height="12.3" rx="1" fill="currentColor" />
      {/* wifi */}
      <path d="M327.75 31.62A5.4 5.4 0 0 1 335.65 31.62" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M325.04 29.09A9.1 9.1 0 0 1 338.36 29.09" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M322.34 26.57A12.8 12.8 0 0 1 341.06 26.57" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="331.7" cy="35.3" r="1.7" fill="currentColor" />
      {/* battery */}
      <rect x="345.55" y="24.05" width="23.9" height="11.2" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.36" />
      <rect x="347.5" y="26" width="20" height="7.3" rx="2" fill="currentColor" />
      <path d="M370.8 27.6a2.3 2.3 0 0 1 0 4.2z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// Phone content box ratio (below the status bar). The screen = status bar + content + the home
// indicator band, all ONE rounded surface; the bezel is the shell around it.
export const PHONE_ASPECT = '9 / 17';
export const DEFAULT_ASPECT = { laptop: '16 / 10', phone: PHONE_ASPECT, tablet: '4 / 3', responsive: '16 / 10' };

export default function DeviceFrame({ variant = 'laptop', url, aspect, phoneAspect = '9 / 13.5', bg, tone = 'paper', dark = false, children, style, className = '' }) {
  const v = variant === 'responsive' ? 'responsive' : variant;
  const hasBar = v === 'laptop' || v === 'responsive';
  const hasPhone = v === 'phone' || v === 'responsive';
  // Bezel, corner radii and hinge are PROPORTIONAL to the device width (a real iPhone 15 Pro
  // bezel is ~2.8% of its width, corner ~12%), so the shell looks identical at 213px and 360px.
  // --df-w is measured; the SSR fallback matches the common rendered sizes so hydration
  // doesn't shift layout.
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    // offsetWidth, NOT getBoundingClientRect: the film scales devices with ancestor transforms,
    // and bezel/radius proportions must follow the LAYOUT width (stable, transform-independent) —
    // rect width would bake in whatever camera zoom was current when the observer fired.
    const set = () => { el.style.setProperty('--df-w', `${el.offsetWidth}px`); };
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={ref} className={`df df-${v} df-tone-${tone} ${dark ? 'df-dark' : ''} ${className}`} style={{ '--df-aspect': aspect || DEFAULT_ASPECT[v] || '16 / 10', '--df-phone-aspect': phoneAspect, '--df-bg': bg || (dark ? '#101012' : C.paper), ...style }}>
      {/* shell = bezel. screen = ONE rounded clipping surface (inner radius = outer − bezel) that
          contains the browser bar / status bar / island / content / home band. Anything inside
          (including transform-scaled content) is clipped by .df-screen, so corners stay clean. */}
      <div className="df-shell">
        {v === 'tablet' && <span className="df-cam" aria-hidden="true" />}
        <div className="df-screen">
          {hasBar && <BrowserBar url={url} />}
          {hasPhone && <StatusBar />}
          <div className="df-content">{children}</div>
          {hasPhone && <div className="df-safe" aria-hidden="true"><span className="df-home" /></div>}
        </div>
      </div>
      {hasBar && <div className="df-base" aria-hidden="true"><span className="df-notch" /></div>}
      <style jsx global>{`
        .df { position: relative; width: 100%; }
        .df-shell { position: relative; background: #101012; box-shadow: 0 0 0 1px #2a2a2e; }
        .df-screen { position: relative; overflow: hidden; background: var(--df-bg); display: flex; flex-direction: column; isolation: isolate; }
        .df-content { position: relative; overflow: hidden; aspect-ratio: var(--df-aspect); min-width: 0; flex: none; }
        .df-content > * { min-width: 0; }
        /* warm shadow: the device sits on paper, not floating */
        .df-tone-paper .df-shell { box-shadow: 0 0 0 1px #2a2a2e, 0 18px 40px -18px rgba(15,15,16,0.45), 0 40px 70px -40px rgba(15,15,16,0.35); }
        .df-tone-ink .df-shell { box-shadow: 0 0 0 1px #3a3a3e, 0 18px 40px -18px rgba(0,0,0,0.8); }

        /* ── browser bar (laptop) — proportional SVG strip on the screen surface ── */
        .df-bar { display: block; width: 100%; height: auto; flex: none; }

        /* ── laptop: lid radius 14 with an 8px bezel → screen radius 6 on top, square where it
              meets the hinge. The lid has NO bottom edge line so lid + base read as one body. ── */
        .df-laptop, .df-responsive { --df-w: 560px; }
        .df-laptop .df-shell, .df-responsive .df-shell { border-radius: calc(var(--df-w) * 0.025) calc(var(--df-w) * 0.025) 0 0; padding: calc(var(--df-w) * 0.014) calc(var(--df-w) * 0.014) 0; }
        .df-laptop .df-screen, .df-responsive .df-screen { border-radius: calc(var(--df-w) * 0.011) calc(var(--df-w) * 0.011) 0 0; }
        .df-base { position: relative; height: calc(var(--df-w) * 0.021); margin: 0 -5%; background: linear-gradient(180deg, #34343a 0%, #1a1a1d 20%, #131315 60%, #0b0b0c 100%); border-radius: 0 0 10px 10px; box-shadow: 0 22px 30px -22px rgba(15,15,16,0.55); }
        .df-base::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(255,255,255,0.10); }
        .df-base::after { content: ''; position: absolute; left: 6%; right: 6%; bottom: -6px; height: 6px; border-radius: 0 0 50% 50% / 0 0 100% 100%; background: rgba(15,15,16,0.18); filter: blur(3px); }
        .df-notch { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 14%; height: calc(var(--df-w) * 0.007); border-radius: 0 0 4px 4px; background: #3a3a3e; }

        /* ── phone: shell radius 44, bezel 10 → screen radius 34, exactly continuing the curve.
              Status bar, island and home indicator all live ON the screen surface. ── */
        .df-phone { --df-w: 360px; max-width: 360px; margin-left: auto; margin-right: auto; }
        .df-phone .df-shell { border-radius: calc(var(--df-w) * 0.139); padding: calc(var(--df-w) * 0.028); }
        .df-phone .df-screen { border-radius: calc(var(--df-w) * 0.111); }
        /* status bar + home band are proportional to screen width (viewBox / aspect-ratio), so
           the phone looks identical at 211px (Story) and 360px. */
        .df-status { display: block; width: 100%; height: auto; flex: none; color: #0f0f10; }
        .df-dark .df-status { color: #e8e4d9; }
        .df-safe { position: relative; width: 100%; aspect-ratio: 330 / 22; flex: none; }
        .df-home { position: absolute; left: 50%; bottom: 30%; transform: translateX(-50%); width: 36%; height: 18%; border-radius: 999px; background: #0f0f10; opacity: 0.8; }
        .df-dark .df-home { background: #e8e4d9; }

        /* ── tablet: shell radius 26, bezel 16 → screen radius 10 ── */
        .df-tablet .df-shell { border-radius: 26px; padding: 16px; }
        .df-tablet .df-screen { border-radius: 10px; }
        .df-cam { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background: #2a2a2e; box-shadow: 0 0 0 1px #3a3a3e; z-index: 1; }

        /* ── responsive: laptop ≥ breakpoint, phone below (one content node) ── */
        .df-responsive .df-status, .df-responsive .df-safe { display: none; }
        @media (max-width: ${DEVICE_BREAKPOINT - 1}px) {
          .df-responsive { --df-w: 358px; max-width: 360px; margin-left: auto; margin-right: auto; }
          .df-responsive .df-shell { border-radius: calc(var(--df-w) * 0.139); padding: calc(var(--df-w) * 0.028); }
          .df-responsive .df-screen { border-radius: calc(var(--df-w) * 0.111); }
          .df-responsive .df-bar, .df-responsive .df-base { display: none; }
          .df-responsive .df-status { display: block; }
          .df-responsive .df-safe { display: block; }
          .df-responsive .df-content { aspect-ratio: var(--df-phone-aspect); }
        }
      `}</style>
    </div>
  );
}
