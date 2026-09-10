// components/dashboard/ActionRow.js
// The one action row (lib/actions.js items), used by the bell panel's Next tab: grouped by
// listing with the address line said once, then the person over the reason with the verb at the
// right, 44px minimum, dismissed by a swipe left on touch or the 44px X otherwise. A row whose item
// goes between loads slides out, a new one slides in (lib/motion.js durations, none under reduced
// motion). Empty: "Nothing waiting on you." with the red tick. No adapter here: the callers pass
// onGo and onDismiss, so the list renders anywhere, tests included.
import { useEffect, useRef, useState, useMemo } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { DURATION, CURVE, prefersReducedMotion } from '../../lib/motion';

const SWIPE = { axisLock: 8, commit: 64 };

export function ActionRow({ item, phase, onGo, onDismiss, first: firstRow = false }) {
  const ref = useRef(null);
  const drag = useRef({ active: false, lock: null, startX: 0, startY: 0, dx: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const paint = (dx, animate) => { el.style.transition = animate && !prefersReducedMotion() ? `transform ${DURATION.base}ms ${CURVE.settle}` : 'none'; el.style.transform = dx ? `translateX(${dx}px)` : ''; };
    const onStart = (e) => { if (e.touches.length !== 1) return; if (e.target.closest('button')) return; const t = e.touches[0]; drag.current = { active: true, lock: null, startX: t.clientX, startY: t.clientY, dx: 0 }; };
    const onMove = (e) => {
      const d = drag.current; if (!d.active) return;
      const t = e.touches[0]; const dx = t.clientX - d.startX, dy = t.clientY - d.startY;
      if (!d.lock) { if (Math.abs(dx) < SWIPE.axisLock && Math.abs(dy) < SWIPE.axisLock) return; if (Math.abs(dx) > Math.abs(dy) && e.cancelable) d.lock = 'h'; else { d.lock = 'v'; d.active = false; return; } }
      e.preventDefault();
      d.dx = Math.min(0, dx); paint(d.dx, false);
    };
    const onEnd = () => { const d = drag.current; if (!d.active) return; d.active = false; if (d.lock === 'h' && d.dx <= -SWIPE.commit) { paint(-el.offsetWidth, true); onDismiss(); return; } paint(0, true); };
    el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: false }); el.addEventListener('touchend', onEnd, { passive: true }); el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd); };
  }, [onDismiss]);
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(); } };
  // Line one is the person, or the item's title for a listing level item; line two is the short
  // reason, or the detail when the reason would only repeat line one.
  const lineOne = item.name || item.title;
  const lineTwo = item.reason && item.reason !== lineOne ? item.reason : item.detail;
  return (
    <li ref={ref} className={`al-row ${phase === 'enter' ? 'al-enter' : ''} ${phase === 'leave' ? 'al-leave' : ''}`} data-key={item.key} data-kind={item.kind}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', borderTop: firstRow ? 'none' : `1px solid ${C.rule}` }}>
      <div role="button" tabIndex={0} onClick={onGo} onKeyDown={key} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--s-2) 0', cursor: 'pointer' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere' }}>{lineOne}</span>
        <span style={{ display: 'block', fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>{lineTwo}</span>
      </div>
      <button type="button" onClick={onGo} style={{ minHeight: 44, padding: '0 var(--s-2)', background: 'transparent', border: 'none', color: C.ink, textDecoration: 'underline', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{item.verb}</button>
      <button type="button" className="al-x" onClick={onDismiss} aria-label={`Dismiss: ${item.title}`} title="Dismiss until something changes" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', flexShrink: 0 }}><Icon name="x" size={16} /></button>
    </li>
  );
}

// The rows, grouped by listing in the order each listing's first item appears, with enter and
// leave phases per key.
export function ActionRows({ items, onGo, onDismiss }) {
  const [rows, setRows] = useState(() => items.map((item) => ({ item, phase: 'in' })));
  const prevKeys = useRef(new Set(items.map((i) => i.key)));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const keys = new Set(items.map((i) => i.key));
    const reduced = prefersReducedMotion();
    setRows((cur) => {
      const fresh = items.map((item) => ({ item, phase: prevKeys.current.has(item.key) ? 'in' : 'enter' }));
      if (reduced) return fresh;
      const out = []; const seen = new Set();
      for (const r of cur) { if (keys.has(r.item.key)) { if (!seen.has(r.item.key)) { out.push(fresh.find((f) => f.item.key === r.item.key)); seen.add(r.item.key); } } else if (r.phase !== 'gone') out.push({ ...r, phase: 'leave' }); }
      for (const f of fresh) if (!seen.has(f.item.key)) out.push(f);
      return out;
    });
    prevKeys.current = keys;
    if (reduced) return undefined;
    const t = setTimeout(() => setRows((cur) => cur.filter((r) => r.phase !== 'leave')), DURATION.base + 40);
    return () => clearTimeout(t);
  }, [items]);
  const groups = useMemo(() => {
    const out = [];
    for (const r of rows) { let g = out.find((x) => x.listingId === r.item.listingId); if (!g) { g = { listingId: r.item.listingId || 'none', listingName: r.item.listingName || '', rows: [] }; out.push(g); } g.rows.push(r); }
    return out;
  }, [rows]);
  if (!rows.length) {
    return (
      <p className="al-empty" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, fontSize: 'var(--t-body)', color: C.ink, fontWeight: 600, lineHeight: 'var(--lh-body)', margin: 0 }}>
        <Icon name="check" size={16} color={C.red} strokeWidth={2.5} /> Nothing waiting on you.
      </p>
    );
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.listingId} className="al-group" data-listing={g.listingId}>
          <div className="al-address" style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', paddingTop: 'var(--s-3)', paddingBottom: 'var(--s-1)', overflowWrap: 'anywhere' }}>{g.listingName}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {g.rows.map((r, i) => <ActionRow key={r.item.key} item={r.item} phase={r.phase} first={i === 0} onGo={() => onGo(r.item)} onDismiss={() => onDismiss(r.item)} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}
