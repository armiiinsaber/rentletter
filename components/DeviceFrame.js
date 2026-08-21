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

export default function DeviceFrame({ variant = 'laptop', url, aspect, phoneAspect = '9 / 15', bg, tone = 'paper', children, style, className = '' }) {
  const isResp = variant === 'responsive';
  const v = isResp ? 'responsive' : variant;
  const defaultAspect = { laptop: '16 / 10', phone: '9 / 16', tablet: '4 / 3', responsive: '16 / 10' }[v] || '16 / 10';
  return (
    <div className={`df df-${v} df-tone-${tone} ${className}`} style={{ '--df-aspect': aspect || defaultAspect, '--df-phone-aspect': phoneAspect, '--df-bg': bg || `linear-gradient(160deg, ${C.card}, ${C.paperDeep})`, ...style }}>
      <div className="df-shell">
        {(v === 'laptop' || v === 'responsive') && <BrowserBar url={url} />}
        {(v === 'phone' || v === 'responsive') && <StatusBar />}
        {v === 'tablet' && <span className="df-cam" aria-hidden="true" />}
        <div className="df-content">{children}</div>
        {(v === 'phone' || v === 'responsive') && <span className="df-home" aria-hidden="true" />}
      </div>
      {(v === 'laptop' || v === 'responsive') && <div className="df-base" aria-hidden="true"><span className="df-notch" /></div>}
      <style jsx global>{`
        .df { position: relative; width: 100%; }
        .df-shell { position: relative; background: #101012; border: 1px solid #2a2a2e; overflow: hidden; display: flex; flex-direction: column; }
        .df-content { position: relative; overflow: hidden; background: var(--df-bg); aspect-ratio: var(--df-aspect); min-width: 0; container-type: inline-size; }
        .df-content > * { min-width: 0; }
        /* warm shadow: the device sits on paper, not floating */
        .df-tone-paper .df-shell { box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -18px rgba(15,15,16,0.45), 0 40px 70px -40px rgba(15,15,16,0.35); }
        .df-tone-ink .df-shell { box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 40px -18px rgba(0,0,0,0.8); border-color: #3a3a3e; }

        /* ── browser bar (laptop) ── */
        .df-bar { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: #1c1c1e; border-bottom: 1px solid #2a2a2e; }
        .df-dots { display: inline-flex; gap: 6px; }
        .df-dots i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: #3a3a3e; }
        .df-dots i:nth-child(1) { background: #ff5f57; } .df-dots i:nth-child(2) { background: #febc2e; } .df-dots i:nth-child(3) { background: #28c840; }
        .df-url { flex: 1; min-width: 0; display: inline-flex; align-items: center; gap: 6px; background: #2c2c2e; color: #9a9a9f; border-radius: 6px; padding: 5px 11px; font-size: 11px; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: Inter, -apple-system, system-ui, sans-serif; }

        /* ── laptop ── */
        .df-laptop .df-shell { border-radius: 14px 14px 6px 6px; padding: 8px 8px 0; }
        .df-laptop .df-bar { border-radius: 8px 8px 0 0; }
        .df-base { position: relative; height: 12px; margin: 0 -5%; background: linear-gradient(180deg, #2a2a2e 0%, #151517 55%, #0b0b0c 100%); border-radius: 0 0 10px 10px; box-shadow: 0 22px 30px -22px rgba(15,15,16,0.55); }
        .df-base::after { content: ''; position: absolute; left: 6%; right: 6%; bottom: -6px; height: 6px; border-radius: 0 0 50% 50% / 0 0 100% 100%; background: rgba(15,15,16,0.18); filter: blur(3px); }
        .df-notch { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 14%; height: 4px; border-radius: 0 0 4px 4px; background: #3a3a3e; }

        /* ── phone ── */
        .df-phone { max-width: 360px; margin-left: auto; margin-right: auto; }
        .df-phone .df-shell { border-radius: 44px; padding: 10px; }
        .df-phone .df-content { border-radius: 34px 34px 30px 30px; }
        .df-status { position: relative; height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 22px; color: #e8e4d9; font-size: 12px; font-weight: 700; font-family: Inter, -apple-system, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
        .df-island { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); width: 92px; height: 22px; border-radius: 14px; background: #000; border: 1px solid #2a2a2e; }
        .df-glyphs { display: inline-flex; align-items: center; gap: 6px; }
        .df-signal { display: inline-flex; align-items: flex-end; gap: 1.5px; height: 10px; }
        .df-signal i { width: 3px; background: #e8e4d9; border-radius: 1px; display: inline-block; }
        .df-signal i:nth-child(1) { height: 4px; } .df-signal i:nth-child(2) { height: 6px; } .df-signal i:nth-child(3) { height: 8px; } .df-signal i:nth-child(4) { height: 10px; }
        .df-batt { width: 22px; height: 10px; border: 1.5px solid #e8e4d9; border-radius: 3px; position: relative; display: inline-block; }
        .df-batt i { position: absolute; inset: 1.5px; right: 4px; background: #e8e4d9; border-radius: 1px; }
        .df-batt::after { content: ''; position: absolute; right: -4px; top: 2.5px; width: 2px; height: 4px; background: #e8e4d9; border-radius: 0 1px 1px 0; }
        .df-home { display: block; width: 34%; height: 4px; border-radius: 2px; background: #e8e4d9; opacity: 0.85; margin: 8px auto 4px; }

        /* ── tablet ── */
        .df-tablet .df-shell { border-radius: 26px; padding: 16px; }
        .df-tablet .df-content { border-radius: 10px; }
        .df-cam { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background: #2a2a2e; box-shadow: 0 0 0 1px #3a3a3e; }

        /* ── responsive: laptop ≥ breakpoint, phone below (one content node) ── */
        .df-responsive .df-shell { border-radius: 14px 14px 6px 6px; padding: 8px 8px 0; }
        .df-responsive .df-bar { border-radius: 8px 8px 0 0; }
        .df-responsive .df-status, .df-responsive .df-home { display: none; }
        @media (max-width: ${DEVICE_BREAKPOINT - 1}px) {
          .df-responsive { max-width: 360px; margin-left: auto; margin-right: auto; }
          .df-responsive .df-shell { border-radius: 44px; padding: 10px; }
          .df-responsive .df-bar, .df-responsive .df-base { display: none; }
          .df-responsive .df-status { display: flex; }
          .df-responsive .df-home { display: block; }
          .df-responsive .df-content { border-radius: 34px 34px 30px 30px; aspect-ratio: var(--df-phone-aspect); }
        }
      `}</style>
    </div>
  );
}
