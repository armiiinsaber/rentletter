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
import { C, R } from './theme';

export const DEVICE_BREAKPOINT = 720;

function BrowserBar({ url }) {
  return (
    <div className="df-bar" aria-hidden="true">
      <span className="df-dots"><i /><i /><i /></span>
      <span className="df-url">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        {url || 'rentletter.ca'}
      </span>
    </div>
  );
}
function StatusBar() {
  return (
    <div className="df-status" aria-hidden="true">
      <span className="df-time">9:41</span>
      <span className="df-island" />
      <span className="df-glyphs">
        <span className="df-signal"><i /><i /><i /><i /></span>
        <span className="df-batt"><i /></span>
      </span>
    </div>
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
  return (
    <div className={`df df-${v} df-tone-${tone} ${dark ? 'df-dark' : ''} ${className}`} style={{ '--df-aspect': aspect || DEFAULT_ASPECT[v] || '16 / 10', '--df-phone-aspect': phoneAspect, '--df-bg': bg || (dark ? '#101012' : C.paper), ...style }}>
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

        /* ── browser bar (laptop) — part of the screen surface ── */
        .df-bar { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: #1c1c1e; border-bottom: 1px solid #2a2a2e; flex: none; }
        .df-dots { display: inline-flex; gap: 6px; }
        .df-dots i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .df-dots i:nth-child(1) { background: #ff5f57; } .df-dots i:nth-child(2) { background: #febc2e; } .df-dots i:nth-child(3) { background: #28c840; }
        .df-url { flex: 1; min-width: 0; display: inline-flex; align-items: center; gap: 6px; background: #2c2c2e; color: #9a9a9f; border-radius: 6px; padding: 5px 11px; font-size: 11px; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: Inter, -apple-system, system-ui, sans-serif; }

        /* ── laptop: lid radius 14 with an 8px bezel → screen radius 6 on top, square where it
              meets the hinge. The lid has NO bottom edge line so lid + base read as one body. ── */
        .df-laptop .df-shell, .df-responsive .df-shell { border-radius: 14px 14px 0 0; padding: 8px 8px 0; }
        .df-laptop .df-screen, .df-responsive .df-screen { border-radius: 6px 6px 0 0; }
        .df-base { position: relative; height: 12px; margin: 0 -5%; background: linear-gradient(180deg, #34343a 0%, #1a1a1d 20%, #131315 60%, #0b0b0c 100%); border-radius: 0 0 10px 10px; box-shadow: 0 22px 30px -22px rgba(15,15,16,0.55); }
        .df-base::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(255,255,255,0.10); }
        .df-base::after { content: ''; position: absolute; left: 6%; right: 6%; bottom: -6px; height: 6px; border-radius: 0 0 50% 50% / 0 0 100% 100%; background: rgba(15,15,16,0.18); filter: blur(3px); }
        .df-notch { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 14%; height: 4px; border-radius: 0 0 4px 4px; background: #3a3a3e; }

        /* ── phone: shell radius 44, bezel 10 → screen radius 34, exactly continuing the curve.
              Status bar, island and home indicator all live ON the screen surface. ── */
        .df-phone { max-width: 360px; margin-left: auto; margin-right: auto; }
        .df-phone .df-shell { border-radius: 44px; padding: 10px; }
        .df-phone .df-screen { border-radius: 34px; }
        .df-status { position: relative; height: 34px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 22px; color: #0f0f10; font-size: 12px; font-weight: 700; font-family: Inter, -apple-system, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
        .df-dark .df-status { color: #e8e4d9; }
        .df-island { position: absolute; left: 50%; top: 7px; transform: translateX(-50%); width: 92px; height: 22px; border-radius: 14px; background: #000; }
        .df-glyphs { display: inline-flex; align-items: center; gap: 6px; }
        .df-signal { display: inline-flex; align-items: flex-end; gap: 1.5px; height: 10px; }
        .df-signal i { width: 3px; background: currentColor; border-radius: 1px; display: inline-block; }
        .df-signal i:nth-child(1) { height: 4px; } .df-signal i:nth-child(2) { height: 6px; } .df-signal i:nth-child(3) { height: 8px; } .df-signal i:nth-child(4) { height: 10px; }
        .df-batt { width: 22px; height: 10px; border: 1.5px solid currentColor; border-radius: 3px; position: relative; display: inline-block; }
        .df-batt i { position: absolute; inset: 1.5px; right: 4px; background: currentColor; border-radius: 1px; }
        .df-batt::after { content: ''; position: absolute; right: -4px; top: 2.5px; width: 2px; height: 4px; background: currentColor; border-radius: 0 1px 1px 0; }
        .df-safe { position: relative; height: 22px; flex: none; }
        .df-home { position: absolute; left: 50%; bottom: 7px; transform: translateX(-50%); width: 36%; height: 4px; border-radius: 2px; background: #0f0f10; opacity: 0.8; }
        .df-dark .df-home { background: #e8e4d9; }

        /* ── tablet: shell radius 26, bezel 16 → screen radius 10 ── */
        .df-tablet .df-shell { border-radius: 26px; padding: 16px; }
        .df-tablet .df-screen { border-radius: 10px; }
        .df-cam { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background: #2a2a2e; box-shadow: 0 0 0 1px #3a3a3e; z-index: 1; }

        /* ── responsive: laptop ≥ breakpoint, phone below (one content node) ── */
        .df-responsive .df-status, .df-responsive .df-safe { display: none; }
        @media (max-width: ${DEVICE_BREAKPOINT - 1}px) {
          .df-responsive { max-width: 360px; margin-left: auto; margin-right: auto; }
          .df-responsive .df-shell { border-radius: 44px; padding: 10px; }
          .df-responsive .df-screen { border-radius: 34px; }
          .df-responsive .df-bar, .df-responsive .df-base { display: none; }
          .df-responsive .df-status { display: flex; }
          .df-responsive .df-safe { display: block; }
          .df-responsive .df-content { aspect-ratio: var(--df-phone-aspect); }
        }
      `}</style>
    </div>
  );
}
