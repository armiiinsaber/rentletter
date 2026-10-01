// The in app viewer for a held document: a tall ink bottom sheet (components/Sheet.js) with the
// image or the browser's own PDF embed, one Close button at 44px, no download button, no new tab.
// The URL is a 60 second signed link from POST /api/documents/open; when it lapses the sheet is
// closed and reopened from the list. Escape, a drag down on its header or a tap above it closes.
import { useRef } from 'react';
import { C } from '../theme';
import Sheet from '../Sheet';

export default function DocumentViewer({ doc, onClose }) {
  // The sheet keeps showing the document while it slides away.
  const last = useRef(doc); if (doc) last.current = doc;
  const d = doc || last.current;
  const isImage = d ? /^image\//i.test(String(d.mime || '')) : false;
  const kind = String(d?.kind || 'document');
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <Sheet open={!!doc} onClose={onClose} label={`${title}, held document`} tall flush tone="ink" maxWidth={900} panelClassName="rl-docviewer">
      <div data-sheet-drag="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', padding: '0 14px 10px 16px', borderBottom: `1px solid ${C.instRule}`, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.instText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 'var(--t-body-2)', color: C.instMute, marginTop: 'var(--s-1)' }}>Held for your review. This view is logged.</div>
        </div>
        <button type="button" onClick={onClose} style={{ minHeight: 44, minWidth: 72, padding: '0 var(--gap-card)', borderRadius: 'var(--btn-radius)', border: `1.5px solid ${C.instText}`, background: 'transparent', color: C.instText, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isImage ? 12 : 0, paddingBottom: `max(${isImage ? 12 : 0}px, env(safe-area-inset-bottom, 0px))`, overflow: 'auto', overscrollBehavior: 'none' }}>
        {d ? (isImage ? (
          <img src={d.url} alt={`${title} for review`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} />
        ) : (
          <iframe src={`${d.url}#toolbar=0&navpanes=0`} title={`${title} for review`} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
        )) : null}
      </div>
    </Sheet>
  );
}
