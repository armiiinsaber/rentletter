// components/admin/AdminShell.js
// The founder's admin surfaces (/admin, /admin/crm, /admin/mockups) share ONE shell: the same
// header, nav, sign-out menu, PWA head, and the one dark stylesheet (.ad-*) every admin page
// draws from. Editorial Terminal in its dark register — instrument tokens from components/theme
// (paper/ink/red are the product; inst/instRaise/instRule/instText/instMute/redBright are its
// dark form), Fraunces/Inter, the red tick as the mark, danger red distinct from brand red.
// 390px first: the nav is a full-width segmented row on phones, inline on desktop; Sign out
// lives in the ⋯ menu so the header never wraps. Safe areas top and bottom (home-screen app).
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { C, R, SH, FONT } from '../theme';
import { GlobalStyle, Wordmark, Icon } from '../ui';

export const NAV = [
  { key: 'realtors', href: '/admin', label: 'Realtors' },
  { key: 'crm', href: '/admin/crm', label: 'CRM' },
  { key: 'promos', href: '/admin/promos', label: 'Promos' },
  { key: 'mockups', href: '/admin/mockups', label: 'Mockups' },
];

export async function signOut() { try { await fetch('/api/admin/logout', { method: 'POST' }); } catch (e) { /* the cookie is cleared regardless */ } window.location.href = '/admin'; }

export default function AdminShell({ page, title, signedIn = true, right = null, children }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [menu]);
  return (
    <>
      <Head>
        <title>{title ? `${title} — Rentletter admin` : 'Rentletter admin'}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={C.inst} />
        <meta name="color-scheme" content="dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rentletter" />
        <link rel="manifest" href="/admin.webmanifest" />
        <link rel="apple-touch-icon" href="/admin-icon-180.png" />
      </Head>
      <GlobalStyle />
      <div className="ad-shell">
        <header className="ad-top">
          <div className="ad-top-row">
            <a href="/admin" className="ad-brand" aria-label="Rentletter admin"><Wordmark onDark /><span className="ad-brand-tag"><span className="ad-tick" aria-hidden="true" />Admin</span></a>
            {signedIn && (
              <nav className="ad-nav ad-nav-inline" aria-label="Admin">
                {NAV.map((n) => <a key={n.key} href={n.href} aria-current={page === n.key ? 'page' : undefined}>{n.label}</a>)}
              </nav>
            )}
            <div className="ad-top-r">
              {right}
              {signedIn && (
                <div ref={menuRef} className="ad-more-wrap">
                  <button type="button" className="ad-iconbtn" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="more" size={18} /></button>
                  {menu && (
                    <div className="ad-menu" role="menu">
                      <div className="ad-menu-h">This device</div>
                      <button type="button" role="menuitem" className="ad-menu-i" onClick={signOut}>Sign out<span className="ad-menu-hint">Ends the session on this device only</span></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {signedIn && (
            <nav className="ad-nav ad-nav-row" aria-label="Admin">
              {NAV.map((n) => <a key={n.key} href={n.href} aria-current={page === n.key ? 'page' : undefined}>{n.label}</a>)}
            </nav>
          )}
        </header>
        {children}
      </div>
      <style jsx global>{`
        body { background: ${C.inst}; color: ${C.instText}; }
        ::selection { background: ${C.red}; color: ${C.paper}; }
        .ad-shell { min-height: 100dvh; background: ${C.inst}; color: ${C.instText}; padding-bottom: max(24px, env(safe-area-inset-bottom)); font-family: ${FONT.sans}; }
        /* ── header ── */
        .ad-top { position: sticky; top: 0; z-index: 60; background: rgba(16,16,18,0.86); -webkit-backdrop-filter: saturate(160%) blur(14px); backdrop-filter: saturate(160%) blur(14px); border-bottom: 1px solid ${C.instRule}; padding-top: env(safe-area-inset-top); }
        .ad-top-row { display: flex; align-items: center; gap: 14px; padding: 10px clamp(14px, 3vw, 28px); min-height: 56px; }
        .ad-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; min-width: 0; flex-shrink: 0; }
        .ad-brand-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.instMute}; }
        .ad-tick { display: inline-block; width: 3px; height: 12px; background: ${C.redBright}; border-radius: 1px; flex-shrink: 0; }
        .ad-top-r { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .ad-nav { display: flex; gap: 2px; min-width: 0; }
        .ad-nav a { font-size: 13.5px; font-weight: 700; color: ${C.instMute}; text-decoration: none; padding: 8px 12px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: ${R.pill}px; white-space: nowrap; }
        .ad-nav a[aria-current="page"] { color: ${C.instText}; box-shadow: inset 0 -2px 0 ${C.redBright}; border-radius: 0; }
        .ad-nav-inline { margin-left: 6px; }
        .ad-nav-row { display: none; }
        @media (max-width: 719px) {
          .ad-nav-inline { display: none; }
          .ad-nav-row { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0; padding: 0 clamp(14px, 3vw, 28px); }
          .ad-nav-row a { min-height: 44px; padding: 8px 4px; border-radius: 0; font-size: 13px; }
        }
        .ad-iconbtn { width: 44px; height: 44px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: ${C.instText}; background: transparent; border: 1px solid transparent; cursor: pointer; }
        .ad-iconbtn:hover, .ad-iconbtn[aria-expanded="true"] { border-color: ${C.instRule}; background: ${C.instRaise}; }
        .ad-more-wrap { position: relative; }
        .ad-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 80; min-width: 240px; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; box-shadow: ${SH.modal}; padding: 6px; }
        .ad-menu-h { font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; padding: 8px 10px 4px; }
        .ad-menu-i { display: grid; gap: 2px; width: 100%; text-align: left; background: transparent; border: none; border-radius: ${R.ctrl}px; padding: 10px 10px; font: inherit; font-size: 14px; font-weight: 700; color: ${C.instText}; cursor: pointer; min-height: 44px; }
        .ad-menu-i:hover { background: ${C.inst}; }
        .ad-menu-hint { font-size: 12px; font-weight: 500; color: ${C.instMute}; }
        /* ── layout + type ── */
        .ad-wrap { max-width: 1280px; margin: 0 auto; padding: clamp(16px, 2.6vw, 28px) clamp(14px, 2.6vw, 24px) 72px; }
        .ad-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 11px; color: ${C.redBright}; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
        .ad-eyebrow::before { content: ''; width: 18px; height: 2px; background: ${C.redBright}; border-radius: 1px; flex-shrink: 0; }
        .ad-h1 { font-family: ${FONT.serif}; font-weight: 600; font-size: clamp(26px, 4vw, 36px); letter-spacing: -0.025em; line-height: 1.05; color: ${C.instText}; text-wrap: balance; }
        .ad-h2 { font-family: ${FONT.serif}; font-weight: 600; font-size: clamp(20px, 3vw, 26px); letter-spacing: -0.02em; line-height: 1.1; color: ${C.instText}; text-wrap: balance; }
        .ad-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px 16px; flex-wrap: wrap; margin-bottom: 16px; }
        .ad-quiet { font-size: 13px; color: ${C.instMute}; line-height: 1.55; text-wrap: pretty; }
        .ad-num { font-variant-numeric: tabular-nums; }
        .ad-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
        /* ── surfaces ── */
        .ad-card { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; min-width: 0; }
        .ad-well { background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; }
        /* ── buttons: primary (brand red) / secondary / danger (never brand red) / ghost ── */
        .ad-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: ${R.ctrl}px; padding: 10px 14px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; min-height: 44px; text-decoration: none; white-space: nowrap; color: ${C.instText}; background: ${C.instRaise}; }
        .ad-btn.primary { background: ${C.red}; color: ${C.paper}; }
        .ad-btn.secondary { background: transparent; border-color: ${C.instRule}; color: ${C.instText}; }
        .ad-btn.danger { background: ${C.instDanger}; color: ${C.instText}; }
        .ad-btn.ghost { background: transparent; color: ${C.instMute}; }
        .ad-btn.sm { min-height: 36px; padding: 6px 11px; font-size: 13px; }
        .ad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ad-link { background: transparent; border: none; color: ${C.redBright}; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; }
        /* ── pills ── */
        .ad-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: ${R.pill}px; white-space: nowrap; border: 1px solid transparent; }
        .ad-pill.green { color: ${C.instGreen}; background: rgba(95,191,133,0.12); border-color: rgba(95,191,133,0.35); }
        .ad-pill.amber { color: ${C.instAmber}; background: rgba(224,168,74,0.12); border-color: rgba(224,168,74,0.35); }
        .ad-pill.danger { color: ${C.instText}; background: ${C.instDanger}; }
        .ad-pill.quiet { color: ${C.instMute}; border-color: ${C.instRule}; }
        .ad-pill.red { color: ${C.redBright}; border-color: rgba(255,90,95,0.4); }
        /* ── inputs: 16px minimum so iOS never auto-zooms ── */
        .ad-input { width: 100%; padding: 11px 12px; font: inherit; font-size: 16px; line-height: 1.3; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; background: ${C.inst}; color: ${C.instText}; outline: none; min-height: 46px; -webkit-appearance: none; appearance: none; }
        .ad-input::placeholder { color: ${C.instMute}; }
        .ad-input:focus { border-color: ${C.instText}; }
        select.ad-input { background-image: linear-gradient(45deg, transparent 50%, ${C.instMute} 50%), linear-gradient(135deg, ${C.instMute} 50%, transparent 50%); background-position: calc(100% - 18px) 55%, calc(100% - 13px) 55%; background-size: 5px 5px; background-repeat: no-repeat; padding-right: 34px; }
        textarea.ad-input { resize: vertical; line-height: 1.5; }
        input.ad-input[type="date"], input.ad-input[type="datetime-local"] { color-scheme: dark; }
        .ad-f { display: grid; gap: 5px; min-width: 0; }
        .ad-f-l { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.instMute}; }
        .ad-check { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; color: ${C.instText}; font-weight: 600; min-height: 44px; cursor: pointer; }
        .ad-check input { width: 20px; height: 20px; accent-color: ${C.red}; }
        /* ── segmented control ── */
        .ad-seg { display: inline-flex; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.pill}px; padding: 3px; max-width: 100%; }
        .ad-seg button { border: none; background: transparent; color: ${C.instMute}; font: inherit; font-size: 13.5px; font-weight: 700; padding: 8px 14px; min-height: 38px; border-radius: ${R.pill}px; cursor: pointer; white-space: nowrap; flex: 1 1 auto; }
        .ad-seg button.on { background: ${C.instText}; color: ${C.inst}; }
        /* ── info affordance (definitions live here, not in body copy) ── */
        .ad-info { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${C.instRule}; background: transparent; color: ${C.instMute}; cursor: help; vertical-align: middle; margin-left: 4px; }
        .ad-info:hover { color: ${C.instText}; border-color: ${C.instMute}; }
        /* ── sheet / modal: bottom sheet on phones, centred on desktop ── */
        .ad-scrim { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.6); display: flex; align-items: flex-end; justify-content: center; }
        .ad-sheet { width: 100%; max-height: 92dvh; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.modal}px ${R.modal}px 0 0; box-shadow: ${SH.modal}; display: flex; flex-direction: column; overflow: hidden; }
        .ad-sheet-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px clamp(16px, 3vw, 22px) 12px; border-bottom: 1px solid ${C.instRule}; }
        .ad-sheet-b { flex: 1; overflow-y: auto; padding: 14px clamp(16px, 3vw, 22px) 20px; -webkit-overflow-scrolling: touch; }
        .ad-sheet-f { padding: 12px clamp(16px, 3vw, 22px); padding-bottom: max(12px, env(safe-area-inset-bottom)); border-top: 1px solid ${C.instRule}; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: ${C.instRaise}; }
        @media (min-width: 720px) {
          .ad-scrim { align-items: center; padding: 24px; }
          .ad-sheet { width: min(600px, 100%); max-height: 90vh; border-radius: ${R.modal}px; }
          .ad-sheet.wide { width: min(760px, 100%); }
        }
        .ad-toast { position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 1200; background: ${C.instText}; color: ${C.inst}; padding: 11px 16px; border-radius: ${R.pill}px; font-size: 13.5px; font-weight: 700; max-width: calc(100vw - 32px); text-align: center; box-shadow: ${SH.raised}; }
        .ad-alert { padding: 12px 14px; background: rgba(173,34,41,0.18); border-left: 3px solid ${C.instDangerText}; border-radius: ${R.ctrl}px; font-size: 13.5px; color: ${C.instText}; line-height: 1.5; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ad-alert > span { flex: 1 1 200px; }
        /* ── motion ── */
        @media (prefers-reduced-motion: no-preference) {
          .ad-sheet { animation: ad-sheet-in 240ms cubic-bezier(0.22, 1, 0.36, 1); }
          @keyframes ad-sheet-in { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
          .ad-btn, .ad-iconbtn, .ad-nav a { transition: background 140ms ease, border-color 140ms ease, color 140ms ease; }
        }
      `}</style>
    </>
  );
}

// Bottom sheet on phones, centred dialog on desktop. Escape closes.
export function Sheet({ title, eyebrow, onClose, children, footer, wide, labelledBy }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="ad-scrim" onClick={onClose}>
      <div className={`ad-sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="ad-sheet-h">
          <div style={{ minWidth: 0 }}>{eyebrow && <div className="ad-eyebrow">{eyebrow}</div>}<h2 className="ad-h2" id={labelledBy} style={{ overflowWrap: 'anywhere' }}>{title}</h2></div>
          <button type="button" className="ad-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>
        <div className="ad-sheet-b">{children}</div>
        {footer && <footer className="ad-sheet-f">{footer}</footer>}
      </div>
    </div>
  );
}

// A definition behind an affordance instead of body copy: hover/focus shows the title, tap
// toggles it as a small popover (iOS has no hover).
export function Info({ text, label = 'What counts' }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="ad-info" title={text} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="question" size={13} /></button>
      {open && <span role="note" style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 'min(300px, 80vw)', background: C.instRaise, border: `1px solid ${C.instRule}`, borderRadius: R.ctrl, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, color: C.instText, boxShadow: SH.raised, textWrap: 'pretty', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{text}</span>}
    </span>
  );
}
