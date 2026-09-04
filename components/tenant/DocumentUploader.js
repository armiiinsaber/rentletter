// components/tenant/DocumentUploader.js
// The tenant's per file upload control, shared by the upload page (pages/upload/[token].js) and
// the last step of the application (pages/apply/[token].js). Exactly the tenant path: each file
// is analyzed on its own (POST /api/upload/analyze-file, one request per file so every request
// stays under the body cap), then POST /api/upload/finalize once. The token is the document
// request token; owner_token never appears here.
//
//   <DocumentUploader token={t} before={node} disclosure={node} onDone={({ received }) => …} />
// before: rendered above the drop zone while choosing files (the upload page's checklist).
// disclosure: rendered above the submit buttons in both phases.
import { useState, useRef } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';

export const MAX_FILES = 12;
export const MAX_FILE = 3 * 1024 * 1024;
export const OK_EXT = ['pdf', 'png', 'jpg', 'jpeg'];
export const OK_ACCEPT = '.pdf,.png,.jpg,.jpeg';

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function DocumentUploader({ token, before = null, disclosure = null, onDone, checklist = [] }) {
  const [files, setFiles] = useState([]);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ phase: 'idle', index: 0, total: 0, filename: '' });
  const [stagedKeys, setStagedKeys] = useState(() => new Set());
  const [finalizePending, setFinalizePending] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (incoming) => {
    setError('');
    const picked = Array.from(incoming || []);
    const next = [...files];
    let msg = '';
    let added = 0;
    for (const f of picked) {
      if (next.length >= MAX_FILES) { msg = `You can add up to ${MAX_FILES} files.`; break; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!OK_EXT.includes(ext)) { msg = 'Please upload a PDF or image (JPG or PNG).'; continue; }
      if (f.size > MAX_FILE) { msg = `${f.name} is too large, please upload a version under 3MB.`; continue; }
      next.push(f); added++;
    }
    if (msg) setError(msg);
    if (added) setFinalizePending(false);
    setFiles(next);
  };
  const removeFile = (i) => setFiles((p) => p.filter((_, idx) => idx !== i));
  const encodeFile = async (f) => ({ name: f.name, type: f.type, data: await readAsBase64(f) });

  // Analyze ONE file, with a single automatic retry on network or 5xx. Returns { ok, message }.
  const analyzeOne = async (f, index, total) => {
    let body;
    try { body = JSON.stringify({ token, index, total, file: await encodeFile(f) }); }
    catch (e) { return { ok: false, message: `We couldn't read ${f.name}. Please try again.` }; }
    let lastMsg = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch('/api/upload/analyze-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (r.ok) return { ok: true };
        const j = await r.json().catch(() => ({}));
        lastMsg = j?.error || '';
        if (r.status === 400 || r.status === 413 || r.status === 404) return { ok: false, message: lastMsg || `We couldn't process ${f.name}.` };
      } catch (e) { /* network blip, retry once */ }
    }
    return { ok: false, message: lastMsg || `We couldn't process ${f.name}. Please try again.` };
  };
  const clearProgress = () => setProgress({ phase: 'idle', index: 0, total: 0, filename: '' });

  const runSubmit = async () => {
    if (!files.length || submitting) return;
    setSubmitting(true); setError('');
    const total = files.length;
    if (!finalizePending) {
      const staged = new Set(stagedKeys);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const key = `${f.name}::${f.size}`;
        if (staged.has(key)) continue;
        setProgress({ phase: 'analyzing', index: i + 1, total, filename: f.name });
        const res = await analyzeOne(f, i, total); // eslint-disable-line no-await-in-loop
        if (!res.ok) { setError(res.message || `We couldn't process ${f.name}. Please try again.`); clearProgress(); setSubmitting(false); return; }
        staged.add(key); setStagedKeys(new Set(staged));
      }
    }
    setProgress({ phase: 'finalizing', index: total, total, filename: '' });
    try {
      const r = await fetch('/api/upload/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFinalizePending(true); setError(j?.error || 'We received your documents but could not finish. Please tap Finish to complete.'); clearProgress(); setSubmitting(false); return; }
      const received = j.received || total;
      setFiles([]); setSubmitting(false); clearProgress();
      onDone?.({ received, verified: !!j.verified });
      return;
    } catch (e) {
      setFinalizePending(true);
      setError('We received your documents but could not finish. Please tap Finish to complete.');
      clearProgress(); setSubmitting(false); return;
    }
  };

  const submitLabel = progress.phase === 'analyzing'
    ? `Analyzing document ${progress.index} of ${progress.total}…`
    : progress.phase === 'finalizing' ? 'Finalizing…' : finalizePending ? 'Finish submitting' : `Submit ${files.length} document${files.length === 1 ? '' : 's'}`;
  const barFrac = progress.phase === 'finalizing' ? 1 : (progress.phase === 'analyzing' && progress.total ? progress.index / progress.total : 0);
  const fileRow = (f, i, bg, removable) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: bg, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px', minHeight: 44 }}>
      <span style={{ color: C.green, display: 'inline-flex', flexShrink: 0 }}><Icon name="check" size={15} color={C.green} strokeWidth={2.5} /></span>
      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f.name}</span>
      <span style={{ fontSize: 11, color: C.inkMute, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
      {removable && <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} aria-label={`Remove ${f.name}`}
        style={{ background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44, flexShrink: 0 }}>×</button>}
    </div>
  );

  return (
    <div className="rl-uploader">
      <style jsx>{`
        .rl-uploader :global(.rl-spin) { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 2px solid ${C.rule}; border-top-color: ${C.red}; flex-shrink: 0; }
        .rl-uploader :global(.rl-bar-fill) { height: 100%; width: 100%; background: ${C.red}; transform-origin: left center; transform: scaleX(var(--frac, 0)); border-radius: inherit; }
        @media (prefers-reduced-motion: no-preference) {
          .rl-uploader :global(.rl-spin) { animation: rl-rotate 0.8s linear infinite; }
          .rl-uploader :global(.rl-bar-fill) { transition: transform 0.35s ease; }
        }
        @keyframes rl-rotate { to { transform: rotate(360deg); } }
      `}</style>
      {!reviewing ? (
        <>
          {before}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            style={{ border: `1.5px dashed ${dragOver ? C.red : C.ruleDark}`, background: dragOver ? '#fef2f0' : C.card, borderRadius: R.card, padding: 'clamp(22px, 5vw, 30px) 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12, minHeight: 44 }}>
            <input ref={inputRef} type="file" multiple accept={OK_ACCEPT} style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <div style={{ display: 'inline-flex', marginBottom: 8, color: C.red }}><Icon name="plus" size={22} /></div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>Tap to choose files, or drop them here</div>
            <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 4, textWrap: 'pretty' }}>You can select more than one · PDF or image (JPG/PNG) · up to {MAX_FILES} files, 3MB each</div>
          </div>
          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginBottom: 14 }}>{files.map((f, i) => fileRow(f, i, C.card, true))}</div>
          )}
          {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, color: C.danger }}>{error}</div>}
          {disclosure && <div style={{ marginBottom: 16 }}>{disclosure}</div>}
          <button type="button" onClick={() => { if (files.length) { setError(''); setReviewing(true); } }} disabled={!files.length}
            style={{ width: '100%', minHeight: 48, background: files.length ? C.red : C.ruleDark, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: files.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Review {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''} & submit
          </button>
        </>
      ) : (
        <>
          <div className="rl-card" style={{ padding: 'clamp(18px, 4vw, 24px)', marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Double check before you send</div>
            <div style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.5, marginBottom: 14, textWrap: 'pretty' }}>You are about to send {files.length} document{files.length === 1 ? '' : 's'}. Make sure you have included everything the realtor needs.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginBottom: checklist.length ? 14 : 0 }}>{files.map((f, i) => fileRow(f, i, C.paperDeep, false))}</div>
            {checklist.length > 0 && (
              <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>Checklist: {checklist.join(' · ')}</div>
            )}
          </div>
          {disclosure && <div style={{ marginBottom: 16 }}>{disclosure}</div>}
          {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, color: C.danger }}>{error}</div>}
          {submitting && (
            <div style={{ marginBottom: 14 }}>
              <div role="progressbar" aria-valuenow={Math.round(barFrac * 100)} aria-valuemin={0} aria-valuemax={100}
                style={{ height: 8, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.pill, overflow: 'hidden' }}>
                <div className="rl-bar-fill" style={{ '--frac': barFrac }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11.5, color: C.inkMute }}>
                <span className="rl-spin" aria-hidden="true" /> Analyzing one at a time, please keep this page open.
              </div>
            </div>
          )}
          <button type="button" onClick={runSubmit} disabled={submitting} aria-live="polite"
            style={{ width: '100%', minHeight: 48, background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.85 : 1, marginBottom: 10, fontFamily: 'inherit' }}>
            {submitLabel}
          </button>
          <button type="button" onClick={() => setReviewing(false)} disabled={submitting}
            style={{ width: '100%', minHeight: 44, background: 'transparent', color: submitting ? C.inkMute : C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Back to add more
          </button>
        </>
      )}
    </div>
  );
}
