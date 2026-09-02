// The in app viewer for a held document: a full screen instrument sheet with the image or the
// browser's own PDF embed, one Close button at 44px, no download button, no new tab. The URL is
// a 60 second signed link from POST /api/documents/open; when it lapses the sheet is closed and
// reopened from the list. Escape closes. Motion: opacity and transform only, behind the reduced
// motion query (lib/motion.js vocabulary), static otherwise.
import { useEffect } from 'react';
import { C, R } from '../theme';

export default function DocumentViewer({ doc, onClose }) {
  useEffect(() => {
    if (!doc) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [doc, onClose]);
  if (!doc) return null;
  const isImage = /^image\//i.test(String(doc.mime || ''));
  const kind = String(doc.kind || 'document');
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}, held document`} className="rl-docviewer" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: C.inst, color: C.instText, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'max(10px, env(safe-area-inset-top)) 14px 10px 16px', borderBottom: `1px solid ${C.instRule}`, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.instText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#9a958a', marginTop: 1 }}>Held for your review · this view is logged</div>
        </div>
        <button type="button" onClick={onClose} style={{ minHeight: 44, minWidth: 72, padding: '0 16px', borderRadius: R.ctrl, border: `1.5px solid ${C.instText}`, background: 'transparent', color: C.instText, fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isImage ? 12 : 0 }}>
        {isImage ? (
          <img src={doc.url} alt={`${title} for review`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} />
        ) : (
          <iframe src={`${doc.url}#toolbar=0&navpanes=0`} title={`${title} for review`} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
        )}
      </div>
      <style jsx>{`
        @media (prefers-reduced-motion: no-preference) {
          .rl-docviewer { animation: rl-docsheet var(--m-base, 280ms) var(--m-enter, cubic-bezier(0.22, 1, 0.36, 1)) both; }
        }
        @keyframes rl-docsheet { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
