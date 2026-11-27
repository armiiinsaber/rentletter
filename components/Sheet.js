// components/Sheet.js
// The one sheet: every modal, confirm and panel on the realtor side. Under 1024px it is this iOS
// style bottom sheet. It rises from the bottom over 320ms on the iOS curve (lib/motion.js), the page behind
// dims (and on a phone scales back a little), a grab handle sits at the top, and dragging the handle or the
// header (anything marked data-sheet-drag) down dismisses it: the sheet follows the finger, resists
// an upward pull, and snaps back unless dragged far enough or flicked. Tapping the dimmed area or
// pressing Escape dismisses it too, except while busy; with unsaved input (dirty) it asks first.
// Under reduced motion the sheet and the dim crossfade over 120ms and nothing moves.
// At 1024px and wider it is a pop up, never a sheet from the bottom (desktop):
//   'dialog' (the default)  centred in the window, about 560px wide (dialogWidth where the content
//                           needs more; maxWidth when that is wider), 24px corners, the solid card
//                           surface over the dimmed glass, appearing with a short fade and a slight
//                           scale up, at once under reduced motion;
//   'top'                   the same, near the top centre of the window (the command menu, as a
//                           search box with its results under it);
//   'side'                  a panel at the window's right edge, inset 16px as the shell's sidebar is,
//                           the window's height, on its own paper (the new listing form, the
//                           brokerage form), coming in with a short slide and fade.
// Escape and a click on the dimmed page close it, nothing drags it, and long content scrolls inside it.
// At every width the focus stays inside while it is open (Tab and Shift Tab go round its controls)
// and goes back to what opened it.
//
// While any sheet is open the page behind is locked (lockPage): the scroll position is saved, the
// body is pinned in place, and on close the position is restored exactly, with no jump. The sheet's
// own scroller never hands a swipe to the page and never drags past its last element
// (overscroll-behavior: none); under the last control sits the safe area, nothing more.
//
//   <Sheet open onClose={fn} label="New listing" dirty={changed} busy={saving} role="dialog"
//     panelClassName="rl-modal" maxWidth={640} desktop="dialog" dialogWidth={680}>...</Sheet>
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, R, SH } from './theme';
import { CURVE, NATIVE, prefersReducedMotion } from '../lib/motion';

// ── The page lock, counted so a sheet over a sheet keeps it until the last one closes. ──────────
let locks = 0;
let saved = null;
let closingTimer = 0;
export function lockPage() {
  if (typeof document === 'undefined') return () => {};
  const html = document.documentElement; const body = document.body;
  if (locks === 0) {
    const y = window.scrollY || html.scrollTop || 0;
    // What stays on screen as the page scrolls (data-stuck: the sidebar, the tenant's top bar, the
    // phone's strength bar, a side column): pinning the body drops each to where it sits in the
    // page, so each is moved back by exactly that much while the sheet is up, and nothing behind
    // the sheet shifts.
    const stuck = [...document.querySelectorAll('[data-stuck]')].map((el) => [el, el.getBoundingClientRect().top]);
    saved = { y, body: body.getAttribute('style'), behavior: html.style.scrollBehavior, stuck: [] };
    html.style.setProperty('--rl-sheet-y', `${y}px`);
    body.style.position = 'fixed'; body.style.top = `-${y}px`; body.style.left = '0'; body.style.right = '0'; body.style.width = '100%'; body.style.overflow = 'hidden';
    for (const [el, top] of stuck) {
      const shift = top - el.getBoundingClientRect().top;
      if (Math.abs(shift) > 0.5) { el.style.setProperty('translate', `0 ${shift}px`); saved.stuck.push(el); }
    }
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return; released = true;
    locks -= 1;
    if (locks > 0 || !saved) return;
    const { y, body: style, behavior, stuck } = saved; saved = null;
    // The page is at full size again by now (sinkPage below); any last fraction of the scale is
    // dropped before the position comes back, or WebKit would shift it while the scale finished.
    clearTimeout(closingTimer); html.classList.remove('rl-sheet-open', 'rl-sheet-closing');
    if (style == null) body.removeAttribute('style'); else body.setAttribute('style', style);
    for (const el of stuck) el.style.removeProperty('translate');
    // Never a smooth scroll back: the page is simply where it was. The page's own smooth scrolling
    // is switched off first and the style flushed, then the jump is explicitly instant.
    html.style.scrollBehavior = 'auto';
    void html.offsetHeight;
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
    if (Math.round(window.scrollY) !== Math.round(y)) window.scrollTo(0, y);
    setTimeout(() => { html.style.scrollBehavior = behavior || ''; }, 0);
  };
}
export const pageLocked = () => locks > 0;

// The page behind scales back while a sheet is up, and returns to full size as the last sheet
// slides away (while it is still pinned), then carries no transition at all.
let sunk = 0;
function sinkPage() {
  if (typeof document === 'undefined') return () => {};
  const html = document.documentElement;
  sunk += 1;
  if (sunk === 1) { clearTimeout(closingTimer); html.classList.remove('rl-sheet-closing'); html.classList.add('rl-sheet-open'); }
  let done = false;
  return () => {
    if (done) return; done = true;
    sunk -= 1;
    if (sunk > 0) return;
    html.classList.remove('rl-sheet-open'); html.classList.add('rl-sheet-closing');
    closingTimer = setTimeout(() => html.classList.remove('rl-sheet-closing'), NATIVE.sheet + 40);
  };
}

// The drag: below this many px (or a quarter of the sheet) and slower than FLICK px per ms, it
// snaps back. Upward the sheet gives only a little (RESIST of the pull, at most UP_MAX px).
const DISMISS_MIN = 96, FLICK = 0.6, RESIST = 0.15, UP_MAX = 24;
const CONTROL = 'button, a, input, select, textarea, label, [role="button"], [contenteditable="true"]';
// The pop up at 1024px and wider: its width when the sheet asks for no more, its corners, its fade.
export const WIDE = '(min-width: 1024px)';
export const DIALOG_WIDTH = 560, DIALOG_RADIUS = 24, DIALOG_MS = 200;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// What opened the sheet, for the focus to go back to: what had the focus as the sheet was asked
// for (read while it renders open, before React applies an autoFocus inside it), or, where a click
// gives a button no focus (Safari and WebKit), the control pressed a moment before.
let pressed = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { const el = e.target && e.target.closest ? e.target.closest('button, a[href], [role="button"], input, select, textarea, [tabindex]') : null; pressed = el ? { el, at: Date.now() } : null; }, true);
}
function openerNow() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return a;
  return pressed && Date.now() - pressed.at < 2000 && document.contains(pressed.el) ? pressed.el : null;
}

export default function Sheet({
  open, onClose, label, role = 'dialog', dirty = false, busy = false, children,
  panelClassName = '', maxWidth = 560, tall = false, discardTitle = 'Discard your changes?',
  discardBody = 'What you entered here is not saved.', id, padSafe = true, flush = false, tone = 'paper',
  desktop = 'dialog', dialogWidth = null,
}) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState('enter'); // enter | open | leave
  const [asking, setAsking] = useState(false);
  const panelRef = useRef(null);
  const drag = useRef(null);
  const draggedAway = useRef(false); // dismissed by a drag: already off screen when open turns false
  const rise = useRef(null); // gives the page behind its full size back
  // What opened it, noted as it is asked for, before anything inside it takes the focus.
  const opener = useRef(null);
  if (open && !opener.current && typeof document !== 'undefined') opener.current = openerNow();
  // While it slides away the sheet keeps what it last showed, even if the caller has cleared it.
  const kept = useRef({ children, label });
  if (open) kept.current = { children, label };
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  const ms = reduced ? NATIVE.fade : NATIVE.sheet;

  // Mount, then rise on the next frame; on close, sink and unmount after the same time.
  useEffect(() => {
    if (open) { setMounted(true); setPhase('enter'); const r = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open'))); return () => cancelAnimationFrame(r); }
    if (!mounted) return undefined;
    if (rise.current) { rise.current(); rise.current = null; }
    if (draggedAway.current) { draggedAway.current = false; setMounted(false); setAsking(false); return undefined; }
    setPhase('leave'); setAsking(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // The page lock and the focus, for as long as the sheet is on screen.
  useEffect(() => {
    if (!mounted) return undefined;
    const unlock = lockPage();
    rise.current = sinkPage();
    const before = opener.current;
    const f = requestAnimationFrame(() => { const p = panelRef.current; if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true }); });
    // Focus goes back first, while the page is still pinned: WebKit would otherwise scroll to it
    // after the page is back in place, preventScroll or not.
    return () => { cancelAnimationFrame(f); opener.current = null; if (rise.current) { rise.current(); rise.current = null; } if (before && before.focus && before !== document.body && document.contains(before)) before.focus({ preventScroll: true }); unlock(); };
  }, [mounted]);

  const requestClose = useCallback(() => {
    if (busy) return false;
    if (dirty) { setAsking(true); return false; }
    onClose?.();
    return true;
  }, [busy, dirty, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape' && !asking) { e.stopPropagation(); requestClose(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, asking, requestClose]);

  // ── Drag to dismiss, from the handle or a data-sheet-drag header. ──
  const setY = (y, animate) => {
    const p = panelRef.current; if (!p) return;
    p.style.transition = animate ? `transform ${NATIVE.sheet}ms ${CURVE.ios}` : 'none';
    p.style.transform = y ? `translateY(${y}px)` : '';
  };
  // From 1024px the sheet is a pop up: nothing drags it.
  const onPointerDown = (e) => {
    if (reduced || e.button > 0 || phase !== 'open' || (window.matchMedia && window.matchMedia(WIDE).matches)) return;
    const t = e.target;
    if (!t.closest('.rl-sh-grab, [data-sheet-drag]') || (t.closest(CONTROL) && !t.closest('.rl-sh-grab'))) return;
    drag.current = { y0: e.clientY, t0: performance.now(), last: e.clientY, lastT: performance.now(), dy: 0, h: panelRef.current.getBoundingClientRect().height, id: e.pointerId };
    try { panelRef.current.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y0;
    d.dy = raw >= 0 ? raw : -Math.min(UP_MAX, -raw * RESIST);
    d.last = e.clientY; d.lastT = performance.now();
    setY(d.dy, false);
  };
  const onPointerUp = (e) => {
    const d = drag.current; if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const v = (e.clientY - d.last) / Math.max(1, performance.now() - d.lastT) || (d.dy / Math.max(1, performance.now() - d.t0));
    const far = d.dy > Math.max(DISMISS_MIN, d.h * 0.25) || (d.dy > 24 && v > FLICK);
    if (far && !busy && !dirty) { draggedAway.current = true; setY(d.h + 40, true); setTimeout(() => onClose?.(), NATIVE.sheet); return; }
    setY(0, true);
    if (far) requestClose(); // busy: stays; dirty: asks
  };

  // The focus stays inside: Tab and Shift Tab go round the sheet's own controls, in the sheet's
  // order, in every engine (Safari's own Tab skips buttons). A control inside that moves the focus
  // itself (the listing form) has already done so.
  const trap = (e) => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const p = panelRef.current; if (!p) return;
    const all = [...p.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden');
    e.preventDefault();
    if (!all.length) { p.focus({ preventScroll: true }); return; }
    const i = all.indexOf(document.activeElement);
    const to = i < 0 ? (e.shiftKey ? all[all.length - 1] : all[0]) : all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length];
    to.focus();
  };

  if (!mounted || typeof document === 'undefined') return null;
  const shown = phase === 'open';
  const at = desktop === 'side' || desktop === 'top' ? desktop : 'dialog';
  const wide = dialogWidth || (at === 'side' ? maxWidth : Math.max(DIALOG_WIDTH, maxWidth));
  return createPortal(
    <div className={`rl-sh-root rl-sh-at-${at}${reduced ? ' rl-sh-reduced' : ''}${shown ? ' rl-sh-shown' : ''}`} role="presentation" data-sheet="" data-sheet-desktop={at}>
      <div className="rl-sh-scrim rl-glass rl-glass-dim" data-tap="" onClick={() => requestClose()} aria-hidden="true" />
      <div ref={panelRef} id={id} className={`rl-sh-panel${tall ? ' rl-sh-tall' : ''}${tone === 'ink' ? ' rl-sh-ink' : ''}${flush ? ' rl-sh-flushed' : ''}${panelClassName ? ` ${panelClassName}` : ''}`} role={role} aria-modal="true" aria-label={kept.current.label} tabIndex={-1}
        style={{ maxWidth, '--rl-dlg-w': `${wide}px` }} onKeyDown={trap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {/* The sheet's own header: the grab strip. Where the content scrolls in the sheet it lies
            over the top of it, glass, and the content passes under it; a flush sheet lays out its
            own parts below it, so nothing passes under and it stays the panel's own paper. */}
        <div className={`rl-sh-grab${flush ? '' : ` rl-glass${tone === 'ink' ? ' rl-glass-ink' : ''}`}`} aria-hidden="true"><span className="rl-sh-handle" /></div>
        <div className={`rl-sh-scroll${padSafe ? '' : ' rl-sh-nosafe'}${flush ? ' rl-sh-flush' : ''}`} data-sheet-scroll={flush ? undefined : ''}>{kept.current.children}</div>
      </div>
      {asking && (
        <Sheet open={asking} role="alertdialog" label={discardTitle} onClose={() => setAsking(false)} maxWidth={420}>
          <div style={{ padding: '4px 20px 20px' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', margin: '0 0 8px' }}>{discardTitle}</h3>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5, margin: '0 0 16px' }}>{discardBody}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-destructive="" type="button" onClick={() => { setAsking(false); onClose?.(); }} style={{ flex: '1 1 0', minWidth: 0, minHeight: 48, background: C.danger, color: C.paper, border: `1px solid ${C.danger}`, borderRadius: 'var(--btn-radius)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
              <button type="button" onClick={() => setAsking(false)} autoFocus style={{ flex: '1 1 0', minWidth: 0, minHeight: 48, background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: 'var(--btn-radius)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Keep editing</button>
            </div>
          </div>
        </Sheet>
      )}
      <style jsx global>{`
        .rl-sh-root { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center; }
        /* The page behind: the dim glass (components/ui.js .rl-glass-dim), the page blurred under a
           dark tint; solid dim with reduced transparency. Only its opacity moves. */
        .rl-sh-scrim { position: absolute; inset: 0; opacity: 0; transition: opacity ${ms}ms ${CURVE.ios}; touch-action: none; }
        .rl-sh-shown .rl-sh-scrim { opacity: 1; }
        .rl-sh-root .rl-sh-panel { position: relative; width: 100%; max-height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px))); display: flex; flex-direction: column;
          background: ${C.paper}; border-radius: ${R.modal}px ${R.modal}px 0 0; box-shadow: ${SH.modal}; outline: none;
          transform: translateY(100%); transition: transform ${NATIVE.sheet}ms ${CURVE.ios}; }
        .rl-sh-root.rl-sh-shown .rl-sh-panel { transform: translateY(0); }
        .rl-sh-tall { height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px))); }
        .rl-sh-root.rl-sh-reduced .rl-sh-panel { transform: none; opacity: 0; transition: opacity ${NATIVE.fade}ms linear; }
        .rl-sh-root.rl-sh-reduced.rl-sh-shown .rl-sh-panel { opacity: 1; }
        .rl-sh-grab { flex: none; display: flex; justify-content: center; align-items: center; height: 24px; touch-action: none; cursor: grab; }
        .rl-sh-panel:not(.rl-sh-flushed) > .rl-sh-grab { position: absolute; top: 0; left: 0; right: 0; z-index: 2; border-radius: ${R.modal}px ${R.modal}px 0 0; --glass-edge: transparent; }
        .rl-sh-panel:not(.rl-sh-flushed) > .rl-sh-scroll { padding-top: 24px; border-radius: ${R.modal}px ${R.modal}px 0 0; }
        .rl-sh-handle { width: 36px; height: 5px; border-radius: 3px; background: ${C.sand}; }
        .rl-sh-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: none; -webkit-overflow-scrolling: touch;
          padding-bottom: env(safe-area-inset-bottom, 0px); }
        .rl-sh-scroll.rl-sh-nosafe { padding-bottom: 0; } /* its own last row carries the safe area */
        /* flush: the children lay out the height and scroll their own parts (each part scrolls with
           overscroll-behavior: none too). */
        .rl-sh-scroll.rl-sh-flush { overflow: hidden; display: flex; flex-direction: column; padding-bottom: 0; }
        .rl-sh-root .rl-sh-panel.rl-sh-ink { background: ${C.inst}; color: ${C.instText}; }
        .rl-sh-ink .rl-sh-handle { background: ${C.instRule}; }
        [data-sheet-drag] { touch-action: pan-x; }
        /* 1024px and wider: a pop up. Centred (dialog), near the top centre (top) or at the right
           edge (side); 24px corners; the solid card surface for a dialog, the panel's own paper at
           the side; a short fade with a slight scale up (a slide in at the side), at once under
           reduced motion. */
        @media (min-width: 1024px) {
          .rl-sh-root { align-items: center; padding: 24px; }
          .rl-sh-root.rl-sh-at-top { align-items: flex-start; padding-top: max(24px, 12vh); }
          .rl-sh-root.rl-sh-at-side { justify-content: flex-end; align-items: stretch; padding: 16px; }
          .rl-sh-root .rl-sh-panel { width: min(100%, var(--rl-dlg-w, ${DIALOG_WIDTH}px)); max-width: none !important; max-height: 100%; border-radius: ${DIALOG_RADIUS}px; opacity: 0; transform: scale(0.97); transition: none; }
          .rl-sh-root:not(.rl-sh-at-side) .rl-sh-panel:not(.rl-sh-ink) { background: ${C.card}; }
          .rl-sh-root.rl-sh-at-side .rl-sh-panel { transform: translateX(24px); }
          .rl-sh-root .rl-sh-tall { height: min(100%, 960px); }
          .rl-sh-root.rl-sh-at-side .rl-sh-panel, .rl-sh-root.rl-sh-at-side .rl-sh-tall { height: auto; }
          .rl-sh-root.rl-sh-shown .rl-sh-panel { opacity: 1; transform: none; }
          .rl-sh-root.rl-sh-reduced .rl-sh-panel { transform: none; transition: none; }
          .rl-sh-root.rl-sh-reduced .rl-sh-scrim { transition: none; }
          /* Nothing drags it, so no handle: the glass strip over the content goes (its blur would
             take the page's colour in at the corners), its 24px of room above the content stays, and
             a flush panel keeps the strip as plain room. */
          .rl-sh-handle { display: none; }
          .rl-sh-grab { cursor: default; }
          .rl-sh-panel:not(.rl-sh-flushed) > .rl-sh-grab { display: none; }
          .rl-sh-panel:not(.rl-sh-flushed) > .rl-sh-scroll { border-radius: ${DIALOG_RADIUS}px; }
        }
        @media (min-width: 1024px) and (prefers-reduced-motion: no-preference) {
          .rl-sh-root:not(.rl-sh-reduced) .rl-sh-panel { transition: opacity ${DIALOG_MS}ms ${CURVE.enter}, transform ${DIALOG_MS}ms ${CURVE.enter}; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

// The page behind an open sheet dims (the scrim) and, on a phone, scales back a little, about the
// middle of what was on screen. From 1024px a sheet is a panel over the view and nothing behind it
// moves: the sidebar and the header stay exactly where they were. Rendered once by GlobalStyle
// (components/ui.js) through SHEET_PAGE_CSS.
export const SHEET_PAGE_CSS = `
  html.rl-sheet-open { overscroll-behavior: none; }
  @media (prefers-reduced-motion: no-preference) and (max-width: 1023.98px) {
    html.rl-sheet-open #__next, html.rl-sheet-closing #__next { transition: scale ${NATIVE.sheet}ms ${CURVE.ios}, border-radius ${NATIVE.sheet}ms ${CURVE.ios}; transform-origin: 50% calc(var(--rl-sheet-y, 0px) + 50vh); }
    html.rl-sheet-open #__next { scale: 0.97; border-radius: ${R.modal}px; overflow: hidden; }
  }
`;
