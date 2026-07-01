// components/dashboard/NotificationBell.js
// Bell + unread badge + dropdown for the realtor dashboard header. On-load only (no realtime):
// it fetches /api/notifications once on mount. Opening the panel clears the unread count and
// marks everything seen (POST /api/notifications); items stay in the list, unread ones lose
// their dot once opened. Tapping an item navigates to that listing.
//
// Demo mode (`demo` + `items`) renders hardcoded SAMPLE notifications and makes NO network
// calls — so the demo can showcase the feature without touching real data.
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '../ui';
import { C, R } from '../theme';

function relTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function NotificationBell({ demo = false, items: demoItems = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(demo ? demoItems : []);
  const [unread, setUnread] = useState(demo ? demoItems.filter((i) => i.unread).length : 0);
  const [seen, setSeen] = useState(false); // once the panel has been opened, dots read as seen
  const [menuPos, setMenuPos] = useState(null); // {top,left,width} in viewport (fixed) coords
  const ref = useRef(null);

  // Position the panel in VIEWPORT coordinates so it can never clip off either edge (the bell
  // is not the rightmost control, so a plain right:0 anchor ran off the left). Anchor its right
  // edge near the bell, then clamp left/right within the viewport with a small margin.
  const computePos = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(340, window.innerWidth - margin * 2);
    let left = rect.right - width; // prefer right-aligned to the bell
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    setMenuPos({ top: Math.round(rect.bottom + 8), left: Math.round(left), width: Math.round(width) });
  };

  // Fetch once on mount (real mode only).
  useEffect(() => {
    if (demo) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch('/api/notifications');
        const j = await r.json().catch(() => ({}));
        if (cancel) return;
        setItems(Array.isArray(j.items) ? j.items : []);
        setUnread(Number(j.unreadCount) || 0);
      } catch (e) { /* bell just stays empty */ }
    })();
    return () => { cancel = true; };
  }, [demo]);

  // Close on outside click / Escape; keep the panel aligned to the bell on resize/scroll.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onReflow = () => computePos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    if (next) computePos();
    setOpen(next);
    if (next && !seen) {
      setSeen(true);
      setUnread(0);
      if (!demo) fetch('/api/notifications', { method: 'POST' }).catch(() => {});
    }
  };

  const openItem = (it) => {
    setOpen(false);
    if (demo || !it.listingId) return;
    router.push(`/landlord/${it.listingId}`);
  };

  const badge = seen ? 0 : unread;
  const badgeLabel = badge > 9 ? '9+' : String(badge);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={toggle}
        aria-label={badge > 0 ? `Notifications, ${badge} unread` : 'Notifications'}
        aria-haspopup="true" aria-expanded={open}
        style={{
          height: 34, width: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: R.pill, background: open ? C.paperDeep : C.card, border: `1px solid ${C.ruleDark}`,
          color: C.inkSoft, cursor: 'pointer', position: 'relative', padding: 0,
        }}>
        <Icon name="bell" size={17} color={C.inkSoft} />
        {badge > 0 && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box',
            background: C.red, color: '#fff', borderRadius: 9, fontSize: 10.5, fontWeight: 800, lineHeight: '17px',
            textAlign: 'center', border: `2px solid ${C.paper}`,
          }}>{badgeLabel}</span>
        )}
      </button>

      {open && menuPos && (
        <div role="menu" style={{
          position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 1000,
          width: menuPos.width, maxHeight: '70vh', overflowY: 'auto',
          background: C.card, border: `1px solid ${C.ruleDark}`, borderRadius: R.card,
          boxShadow: '0 12px 34px rgba(15,15,16,0.16)',
        }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>Notifications</span>
            {demo && <span style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sample</span>}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>
              No notifications yet.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((it) => {
                const isUnread = it.unread && !seen;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => openItem(it)}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '12px 16px', background: isUnread ? '#fdf3f2' : 'transparent',
                        border: 'none', borderBottom: `1px solid ${C.rule}`, cursor: demo ? 'default' : 'pointer',
                      }}>
                      <span aria-hidden="true" style={{
                        marginTop: 6, width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: isUnread ? C.red : 'transparent',
                      }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, color: C.ink, fontWeight: isUnread ? 700 : 500, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                          {it.title}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: C.inkMute, marginTop: 2, overflowWrap: 'anywhere' }}>
                          {it.listingName}{it.ts ? ` · ${relTime(it.ts)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
