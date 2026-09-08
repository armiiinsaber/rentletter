// components/tenant/DocumentUploader.js
// The tenant's per file upload control, shared by the upload page (pages/upload/[token].js) and
// the last step of the application (pages/apply/[token].js). Exactly the tenant path: each file
// is analyzed on its own as soon as it is added (POST /api/upload/analyze-file, one request per
// file so every request stays under the body cap), then POST /api/upload/finalize once on submit.
// The token is the document request token; owner_token never appears here.
//
// The card asks for the set (lib/documentSet.js: one to three recent pay stubs, an employment
// letter, a credit report if they have one) and ticks each row as the analysis recognises a file
// of that type. Recognition is the analysed document type, so a tick appears when that file's
// analysis returns, never on selection. An analysed file is already held for the realtor's review
// (the route stores it after analysis), so removing one before Submit asks POST /api/upload/remove-file
// to drop its staged facts and the held copy; the row unticks if the set no longer meets it. After
// Submit nothing can be removed here.
//
//   <DocumentUploader token={t} before={node} disclosure={node} onDone={({ received }) => …} laterLine="…" />
// before: rendered between the set rows and the drop zone (the retention line).
// disclosure: rendered above the submit buttons in both phases.
// laterLine: the line above the button while the set is incomplete.
import { useState, useRef, useEffect } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { setStatus } from '../../lib/documentSet';

export const MAX_FILES = 6; // the same cap the routes enforce (lib/applicantAnalysis.js MAX_DOCS)
export const MAX_FILE = 3 * 1024 * 1024;
export const OK_EXT = ['pdf', 'png', 'jpg', 'jpeg'];
export const OK_ACCEPT = '.pdf,.png,.jpg,.jpeg';
export const COMPLETE_LINE = 'That is a complete set.';
export const LATER_LINE = 'You can add the rest later from your confirmation email.';

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// Analyze ONE file, with a single automatic retry on network or 5xx. Returns { ok, documentType, message }.
async function analyzeFile(token, f, index, total) {
  let body;
  try { body = JSON.stringify({ token, index, total, file: { name: f.name, type: f.type, data: await readAsBase64(f) } }); }
  catch (e) { return { ok: false, message: `We couldn't read ${f.name}. Please try again.` }; }
  let lastMsg = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('/api/upload/analyze-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, documentType: j?.documentType || null };
      lastMsg = j?.error || '';
      if (r.status === 400 || r.status === 413 || r.status === 404 || r.status === 429) return { ok: false, message: lastMsg || `We couldn't process ${f.name}.` };
    } catch (e) { /* network blip, retry once */ }
  }
  return { ok: false, message: lastMsg || `We couldn't process ${f.name}. Please try again.` };
}

const TYPE_LABEL = { 'pay stub': 'Pay stub', 'employment letter': 'Employment letter', 'credit report': 'Credit report', 'bank statement': 'Bank statement', 'government ID': 'Government ID', 'reference letter': 'Reference letter' };
const typeLabel = (t) => (!t || /unrecognized/i.test(t) ? 'Not recognised' : TYPE_LABEL[t] || t.charAt(0).toUpperCase() + t.slice(1));

export default function DocumentUploader({ token, before = null, disclosure = null, onDone, laterLine = LATER_LINE }) {
  // [{ file, key, status: 'queued' | 'analyzing' | 'done' | 'failed', documentType, message }]
  const [files, setFiles] = useState([]);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizePending, setFinalizePending] = useState(false);
  const [turn, setTurn] = useState(0);
  const busy = useRef(false);
  const nextIndex = useRef(0); // the staged index the routes know each file by, never reused within a session
  const inputRef = useRef(null);

  const addFiles = (incoming) => {
    setError('');
    const picked = Array.from(incoming || []);
    const next = [...files];
    let msg = '';
    let added = 0;
    for (const f of picked) {
      if (next.length >= MAX_FILES) { msg = `You can add up to ${MAX_FILES} files.`; break; }
      const key = `${f.name}::${f.size}`;
      if (next.some((x) => x.key === key)) continue;
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!OK_EXT.includes(ext)) { msg = 'Please upload a PDF or image (JPG or PNG).'; continue; }
      if (f.size > MAX_FILE) { msg = `${f.name} is too large, please upload a version under 3MB.`; continue; }
      next.push({ file: f, key, status: 'queued', documentType: null, message: '', stagedIndex: nextIndex.current++ }); added++;
    }
    if (msg) setError(msg);
    if (added) setFinalizePending(false);
    setFiles(next);
  };
  // A queued or failed file is dropped here; an analysed one is removed through the route first.
  const removeFile = async (key) => {
    const f = files.find((x) => x.key === key);
    if (!f || f.status === 'analyzing' || f.status === 'removing') return;
    if (f.status !== 'done') { setFiles((p) => p.filter((x) => x.key !== key)); return; }
    setError('');
    setFiles((p) => p.map((x) => (x.key === key ? { ...x, status: 'removing' } : x)));
    try {
      const r = await fetch('/api/upload/remove-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, index: f.stagedIndex }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `We could not remove ${f.file.name}. Please try again.`);
      setFiles((p) => p.filter((x) => x.key !== key));
    } catch (e) {
      setFiles((p) => p.map((x) => (x.key === key ? { ...x, status: 'done' } : x)));
      setError(e?.message || `We could not remove ${f.file.name}. Please try again.`);
    }
  };

  // One analysis at a time, in the order the files were added, as soon as each is added.
  useEffect(() => {
    if (busy.current) return;
    const next = files.find((f) => f.status === 'queued');
    if (!next) return;
    busy.current = true;
    const patch = (key, p) => setFiles((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
    patch(next.key, { status: 'analyzing' });
    analyzeFile(token, next.file, next.stagedIndex, files.length)
      .then((res) => patch(next.key, res.ok ? { status: 'done', documentType: res.documentType } : { status: 'failed', message: res.message }))
      .finally(() => { busy.current = false; setTurn((t) => t + 1); });
  }, [files, turn, token]);

  const done = files.filter((f) => f.status === 'done');
  const analyzing = files.find((f) => f.status === 'analyzing' || f.status === 'queued');
  const removing = files.some((f) => f.status === 'removing');
  const failed = files.filter((f) => f.status === 'failed');
  const set = setStatus(done.map((f) => ({ documentType: f.documentType })));
  const ready = done.length > 0 && !analyzing && !removing && failed.length === 0;
  const analyzingLabel = analyzing ? `Analyzing document ${files.indexOf(analyzing) + 1} of ${files.length}…` : null;

  const runSubmit = async () => {
    if (!done.length || submitting) return;
    setSubmitting(true); setError(''); setFinalizing(true);
    try {
      const r = await fetch('/api/upload/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFinalizePending(true); setError(j?.error || 'We received your documents but could not finish. Please tap Finish to complete.'); setFinalizing(false); setSubmitting(false); return; }
      const received = j.received || done.length;
      setFiles([]); setSubmitting(false); setFinalizing(false);
      onDone?.({ received, verified: !!j.verified });
    } catch (e) {
      setFinalizePending(true);
      setError('We received your documents but could not finish. Please tap Finish to complete.');
      setFinalizing(false); setSubmitting(false);
    }
  };

  const submitLabel = finalizing ? 'Finalizing…' : finalizePending ? 'Finish submitting' : `Submit ${done.length} document${done.length === 1 ? '' : 's'}`;

  // The set: an empty circle per row that becomes the red tick as files of that type are recognised.
  const setRows = (
    <div role="list" aria-label="Your document set" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginBottom: 14 }}>
      {set.items.map((it) => (
        <div key={it.key} role="listitem" aria-label={`${it.label}${it.met ? ', added' : ''}${it.max > 1 ? `, ${Math.min(it.count, it.max)} of ${it.max}` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 24 }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${it.met ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {it.met ? <Icon name="check" size={12} color={C.red} strokeWidth={3} /> : null}
          </span>
          <span style={{ fontSize: 14, color: C.ink, lineHeight: 1.4, flex: 1, minWidth: 0, textWrap: 'pretty' }}>
            {it.label}{it.optional ? <span style={{ color: C.inkMute, whiteSpace: 'nowrap' }}> · not used in scoring</span> : null}
          </span>
          {it.max > 1 ? <span style={{ fontSize: 12.5, color: C.inkMute, flexShrink: 0 }}>{Math.min(it.count, it.max)} of {it.max}</span> : null}
        </div>
      ))}
    </div>
  );
  const setLine = <div style={{ fontSize: 13, color: set.complete ? C.ink : C.inkSoft, lineHeight: 1.5, marginBottom: 10, textWrap: 'pretty' }}>{set.complete ? COMPLETE_LINE : laterLine}</div>;

  const fileRow = (f, bg, removable) => (
    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: bg, border: `1px solid ${f.status === 'failed' ? C.danger : C.rule}`, borderRadius: R.ctrl, padding: '9px 12px', minHeight: 44 }}>
      <span style={{ display: 'inline-flex', flexShrink: 0, width: 15, justifyContent: 'center' }}>
        {f.status === 'analyzing' || f.status === 'removing' ? <span className="rl-spin" aria-hidden="true" />
          : f.status === 'done' ? <Icon name="check" size={15} color={C.red} strokeWidth={2.5} />
            : f.status === 'failed' ? <span aria-hidden="true" style={{ color: C.danger, fontWeight: 800 }}>!</span>
              : <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${C.ruleDark}` }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: f.status === 'failed' ? C.danger : C.inkMute, lineHeight: 1.4 }}>
          {f.status === 'done' ? typeLabel(f.documentType) : f.status === 'analyzing' ? 'Reading…' : f.status === 'removing' ? 'Removing…' : f.status === 'failed' ? (f.message || 'Could not read this file.') : 'Waiting'}
        </span>
      </span>
      <span style={{ fontSize: 11, color: C.inkMute, flexShrink: 0 }}>{(f.file.size / 1024 / 1024).toFixed(1)}MB</span>
      {removable && f.status !== 'analyzing' && f.status !== 'removing' && <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(f.key); }} aria-label={`Remove ${f.file.name}`}
        style={{ background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44, flexShrink: 0 }}>×</button>}
    </div>
  );

  return (
    <div className="rl-uploader">
      <style jsx>{`
        .rl-uploader :global(.rl-spin) { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 2px solid ${C.rule}; border-top-color: ${C.red}; flex-shrink: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .rl-uploader :global(.rl-spin) { animation: rl-rotate 0.8s linear infinite; }
        }
        @keyframes rl-rotate { to { transform: rotate(360deg); } }
      `}</style>
      {!reviewing ? (
        <>
          {setRows}
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
            <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 4, textWrap: 'pretty' }}>PDF or image, up to {MAX_FILES} files, 3MB each</div>
          </div>
          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginBottom: 14 }}>{files.map((f) => fileRow(f, C.card, true))}</div>
          )}
          {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, color: C.danger }}>{error}</div>}
          {disclosure && <div style={{ marginBottom: 16 }}>{disclosure}</div>}
          {setLine}
          <button type="button" onClick={() => { if (ready) { setError(''); setReviewing(true); } }} disabled={!ready} aria-live="polite"
            style={{ width: '100%', minHeight: 48, background: ready ? C.red : C.ruleDark, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {analyzingLabel || `Review ${done.length ? `${done.length} file${done.length === 1 ? '' : 's'}` : ''} & submit`}
          </button>
        </>
      ) : (
        <>
          <div className="rl-card" style={{ padding: 'clamp(18px, 4vw, 24px)', marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Double check before you send</div>
            <div style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.5, marginBottom: 14, textWrap: 'pretty' }}>You are about to send {done.length} document{done.length === 1 ? '' : 's'}. Each one was read as the type shown.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginBottom: 14 }}>{done.map((f) => fileRow(f, C.paperDeep, false))}</div>
            <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>{setRows}</div>
          </div>
          {disclosure && <div style={{ marginBottom: 16 }}>{disclosure}</div>}
          {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, color: C.danger }}>{error}</div>}
          {submitting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 11.5, color: C.inkMute }}>
              <span className="rl-spin" aria-hidden="true" /> Sending to your realtor, please keep this page open.
            </div>
          )}
          {setLine}
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
