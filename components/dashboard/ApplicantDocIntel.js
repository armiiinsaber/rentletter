// components/dashboard/ApplicantDocIntel.js
// Realtor-side "Analyze documents" area for one applicant (real dashboard only — it calls
// the API). Drag/drop or pick UP TO 6 files → one Analyze action → ONE organized report
// (rendered by DocIntelReport) → optional "Generate AI insight". The raw files are read to
// base64 in the browser, POSTed once, and never re-stored; the server processes-and-discards.
import { useState, useRef } from 'react';
import { C, R } from '../theme';
import DocIntelReport from './DocIntelReport';

const MAX = 6;
const OK_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_TOTAL = 25 * 1024 * 1024;

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function ApplicantDocIntel({ listingId, linkId, applicationId, applicantName, initialVerifications, initialInsight, onSaved }) {
  const runs = Array.isArray(initialVerifications) ? initialVerifications : [];
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]); // File[]
  const [result, setResult] = useState(runs.length ? runs[runs.length - 1] : null);
  const [insight, setInsight] = useState(initialInsight || '');
  const [analyzing, setAnalyzing] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef(null);
  const hasReport = !!result;

  const addFiles = (incoming) => {
    setError('');
    const picked = Array.from(incoming || []);
    const next = [...files];
    for (const f of picked) {
      if (!OK_MIME.includes(f.type)) { setError('Only JPG, PNG, or PDF files.'); continue; }
      if (next.length >= MAX) { setError(`Up to ${MAX} documents at a time.`); break; }
      next.push(f);
    }
    if (next.length > MAX) next.length = MAX;
    const total = next.reduce((a, f) => a + f.size, 0);
    if (total > MAX_TOTAL) { setError('Those files are too large together (max 25MB).'); return; }
    setFiles(next);
  };

  const removeFile = (i) => setFiles((p) => p.filter((_, idx) => idx !== i));

  const analyze = async () => {
    if (!files.length || analyzing) return;
    setAnalyzing(true); setError('');
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await readAsBase64(f) })));
      const r = await fetch('/api/applicants/analyze-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId, files: payload }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not analyze those documents.'); setAnalyzing(false); return; }
      setResult(j.result);
      setFiles([]);
      onSaved?.({ docVerifications: j.verifications });
      if (j.saved === false) setError('Analysis ran but could not be saved — it may not persist on refresh.');
    } catch (e) {
      setError('Could not analyze those documents.');
    }
    setAnalyzing(false);
  };

  const genInsight = async () => {
    if (insightLoading) return;
    setInsightLoading(true); setError('');
    try {
      const r = await fetch('/api/applicants/insight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not generate the insight.'); setInsightLoading(false); return; }
      setInsight(j.insight);
      onSaved?.({ aiInsight: j.insight });
    } catch (e) {
      setError('Could not generate the insight.');
    }
    setInsightLoading(false);
  };

  // Clear this applicant's OWN doc_verifications + ai_insight (owner-auth, two-key bound). After
  // this the applicant shows "Not verified" everywhere (dashboard + landlord report). Used to
  // remove stale/incorrect verification.
  const clearAnalysis = async () => {
    if (clearing) return;
    setClearing(true); setError('');
    try {
      const r = await fetch('/api/applicants/clear-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not clear the analysis.'); setClearing(false); setConfirmClear(false); return; }
      setResult(null);
      setInsight('');
      setFiles([]);
      setConfirmClear(false);
      onSaved?.({ docVerifications: null, aiInsight: null });
    } catch (e) {
      setError('Could not clear the analysis.');
    }
    setClearing(false);
  };

  const ghostBtn = { background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, color: C.inkSoft, cursor: 'pointer' };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ ...ghostBtn, color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>🗎</span>
        {hasReport ? 'Document verification' : 'Analyze documents'}
        {hasReport && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.paper, background: C.green, padding: '2px 8px', borderRadius: R.pill }}>✓ done</span>}
        <span aria-hidden="true" style={{ color: C.inkMute, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Uploader */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            style={{ border: `1.5px dashed ${dragOver ? C.red : C.ruleDark}`, background: dragOver ? '#fef2f0' : C.paper, borderRadius: R.card, padding: '18px 16px', textAlign: 'center', cursor: 'pointer' }}>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Drop documents here or click to choose</div>
            <div style={{ fontSize: 12, color: C.inkMute, marginTop: 3 }}>Pay stubs, employment letters, bank statements, ID — up to {MAX} files (JPG/PNG/PDF, 25MB total)</div>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '7px 11px' }}>
                  <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: C.inkMute }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} aria-label="Remove"
                    style={{ background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={analyze} disabled={!files.length || analyzing}
              style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: !files.length || analyzing ? 'default' : 'pointer', opacity: !files.length || analyzing ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {analyzing && <span className="rl-dispin" aria-hidden="true" />}
              {analyzing ? `Reading ${files.length} document${files.length === 1 ? '' : 's'}…` : hasReport ? 'Re-analyze' : `Analyze ${files.length || ''} document${files.length === 1 ? '' : 's'}`.trim()}
            </button>
            <span style={{ fontSize: 11.5, color: C.inkMute }}>Files are read once and discarded — never stored.</span>
          </div>

          {error && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{error}</div>}

          {/* Report */}
          {hasReport && (
            <div style={{ marginTop: 16 }}>
              <DocIntelReport result={result} insight={insight} />
              {!insight && (
                <button onClick={genInsight} disabled={insightLoading}
                  style={{ marginTop: 14, background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: insightLoading ? 'wait' : 'pointer', opacity: insightLoading ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {insightLoading && <span className="rl-dispin" aria-hidden="true" />}
                  {insightLoading ? 'Writing insight…' : 'Generate AI insight'}
                </button>
              )}

              {/* Clear / reset this applicant's analysis (removes stale/incorrect verification). */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
                {!confirmClear ? (
                  <button onClick={() => { setConfirmClear(true); setError(''); }} disabled={clearing}
                    style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkMute, borderRadius: R.ctrl, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Clear document analysis
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
                      Remove this applicant’s document analysis? They’ll show as <strong style={{ color: C.ink }}>not verified</strong> on the dashboard and the landlord report.
                    </span>
                    <button onClick={clearAnalysis} disabled={clearing}
                      style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: clearing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {clearing && <span className="rl-dispin" aria-hidden="true" />}{clearing ? 'Clearing…' : 'Clear'}
                    </button>
                    <button onClick={() => setConfirmClear(false)} disabled={clearing}
                      style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .rl-dispin { width: 15px; height: 15px; flex-shrink: 0; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.4); border-top-color: #fff; display: inline-block; animation: rl-dispin 0.7s linear infinite; }
        @keyframes rl-dispin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
