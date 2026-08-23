// components/crm/useDrag.js
// One drag mechanism for mouse AND touch, no library. Pointer events on the dragged element:
//   mouse  — drag starts after a 6px move (a plain click still opens the card)
//   touch  — drag starts after a 380ms press WITHOUT movement (so normal scrolling is untouched);
//            once started, touchmove is cancelled (non-passive listener) so the page holds still
// A ghost copy of the element follows the pointer using transform only. On release, the drop
// target is whatever `[data-drop]` element sits under the pointer. Returns bind props for
// draggables and the id currently being dragged (for a "lifted" style), plus the hovered target.
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useDrag(onDrop) {
  const [dragging, setDragging] = useState(null); // { id, kind }
  const [over, setOver] = useState(null);          // data-drop value under the pointer
  const st = useRef(null);

  const cleanup = useCallback(() => {
    const s = st.current; if (!s) return;
    clearTimeout(s.timer); if (s.raf) clearInterval(s.raf);
    s.ghost?.remove();
    document.removeEventListener('pointermove', s.move); document.removeEventListener('pointerup', s.up); document.removeEventListener('pointercancel', s.cancel);
    document.removeEventListener('touchmove', s.block); document.removeEventListener('contextmenu', s.block);
    document.body.style.userSelect = ''; document.body.style.cursor = '';
    st.current = null; setDragging(null); setOver(null);
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const begin = useCallback((s) => {
    const r = s.el.getBoundingClientRect();
    const ghost = s.el.cloneNode(true);
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 1000, pointerEvents: 'none', opacity: 0.96, boxShadow: '0 18px 40px rgba(15,15,16,0.22)', transform: 'translate(0,0) rotate(1.2deg)', willChange: 'transform' });
    ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    s.ghost = ghost; s.ox = s.x0 - r.left; s.oy = s.y0 - r.top; s.active = true;
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing';
    document.addEventListener('touchmove', s.block, { passive: false });
    document.addEventListener('contextmenu', s.block);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } }
    setDragging({ id: s.id, kind: s.kind });
    s.place(s.lastX, s.lastY);
    // Edge auto-scroll: the nearest horizontally scrolling ancestor (the board on a phone shows
    // ~1.5 columns) scrolls while the pointer sits within 48px of its left/right edge.
    let sc = s.el.parentElement;
    while (sc && sc !== document.body) { const o = getComputedStyle(sc).overflowX; if ((o === 'auto' || o === 'scroll') && sc.scrollWidth > sc.clientWidth + 1) break; sc = sc.parentElement; }
    s.scroller = sc && sc !== document.body ? sc : null;
    const tick = () => {
      if (!s.active) return;
      const r = s.scroller?.getBoundingClientRect();
      if (r) { const edge = 48; const dx = s.lastX < r.left + edge ? -(edge - (s.lastX - r.left)) : s.lastX > r.right - edge ? edge - (r.right - s.lastX) : 0; if (dx) { s.scroller.scrollLeft += dx * 0.25; s.place(s.lastX, s.lastY); } }
      const vy = s.lastY < 56 ? -(56 - s.lastY) : s.lastY > window.innerHeight - 56 ? 56 - (window.innerHeight - s.lastY) : 0;
      if (vy) window.scrollBy(0, vy * 0.25);
    };
    s.raf = setInterval(tick, 16); // an interval, not rAF: rAF can stall while a touch is held
  }, []);

  const bind = useCallback(({ id, kind = 'item' }) => ({
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const ctl = e.target.closest('button, a, input, select, textarea');
      if (ctl && ctl !== e.currentTarget) return; // nested controls (the Move menu) are not drag handles
      const el = e.currentTarget;
      const s = { id, kind, el, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
      s.place = (x, y) => { if (!s.ghost) return; s.ghost.style.transform = `translate(${x - s.x0}px, ${y - s.y0}px) rotate(1.2deg)`; const under = document.elementFromPoint(x, y)?.closest('[data-drop]'); setOver(under ? under.getAttribute('data-drop') : null); };
      s.move = (ev) => {
        s.lastX = ev.clientX; s.lastY = ev.clientY;
        const dist = Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0);
        if (!s.active) { if (s.touch) { if (dist > 8) cleanup(); } else if (dist > 6) begin(s); return; }
        s.place(ev.clientX, ev.clientY);
      };
      s.up = (ev) => {
        if (s.active) { const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]'); const target = under?.getAttribute('data-drop'); cleanup(); if (target) onDrop({ id, kind, target }); }
        else cleanup();
      };
      s.cancel = () => cleanup();
      s.block = (ev) => { if (s.active) ev.preventDefault(); };
      st.current = s;
      document.addEventListener('pointermove', s.move); document.addEventListener('pointerup', s.up); document.addEventListener('pointercancel', s.cancel);
      if (s.touch) s.timer = setTimeout(() => { if (st.current === s && !s.active) begin(s); }, 380);
    },
  }), [begin, cleanup, onDrop]);

  return { bind, dragging, over };
}
