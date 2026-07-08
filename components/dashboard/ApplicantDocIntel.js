// components/dashboard/ApplicantDocIntel.js
// Realtor-side "Analyze documents" area for one applicant (real dashboard only — it calls
// the API). Drag/drop or pick UP TO 6 files → one Analyze action → ONE organized report
// (rendered by DocIntelReport) → optional "Generate AI insight". The raw files are read to
// base64 in the browser, POSTed once, and never re-stored; the server processes-and-discards.
import { useState, useRef } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
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

export default function ApplicantDocIntel({ listingId, linkId, applicationId, applicantName, initialVerifications, initialArchived, initialInsight, onSaved }) {
  const runs = Array.isArray(initialVerifications) ? initialVerifications : [];
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]); // File[]
  const [result, setResult] = useState(runs.length ? runs[runs.length - 1] : null);
  const [insight, setInsight] = useState(initialInsight || '');
  const [analyzing, setAnalyzing] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [textBusy, setTextBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Feature 4 — archive / delete a completed analysis.
  const [archived, setArchived] = useState(Array.isArray(initialArchived) ? initialArchived : []);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [viewing, setViewing] = useState(null);       // an archived entry being viewed read-only
  const [managing, setManaging] = useState('');        // '' | 'archive' | 'delete' | 'delete-archived'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchId, setConfirmArchId] = useState('');
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

  // Feature 4 — archive / delete the analysis (owner-auth, two-key bound). Archive moves the
  // active report into history; delete removes it permanently. Either way the applicant returns
  // to the clean pre-analysis state (re-upload or a fresh tenant request lands a new active report).
  const manage = async (action, archivedId) => {
    if (managing) return null;
    setManaging(action); setError('');
    try {
      const r = await fetch('/api/applicants/manage-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId, action, archivedId }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not update the analysis.'); setManaging(''); return null; }
      setManaging('');
      return j;
    } catch (e) {
      setError('Could not update the analysis.'); setManaging(''); return null;
    }
  };

  const archiveActive = async () => {
    const j = await manage('archive');
    if (!j) return;
    setArchived(j.docArchived || []);
    setResult(null); setInsight(''); setFiles([]);
    onSaved?.({ docVerifications: j.docVerifications || [], docArchived: j.docArchived || [], aiInsight: null });
  };

  const deleteActive = async () => {
    const j = await manage('delete');
    if (!j) return;
    setResult(null); setInsight(''); setFiles([]); setConfirmDelete(false);
    setArchived(j.docArchived || archived);
    onSaved?.({ docVerifications: j.docVerifications || [], docArchived: j.docArchived || archived, aiInsight: null });
  };

  const deleteArchivedEntry = async (id) => {
    const j = await manage('delete-archived', id);
    if (!j) return;
    setArchived(j.docArchived || []);
    setConfirmArchId('');
    if (viewing && viewing.id === id) setViewing(null);
    onSaved?.({ docArchived: j.docArchived || [] });
  };

  const fmtDate = (iso) => {
    if (!iso) return 'earlier';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return 'earlier'; }
  };

  // Stage-2: a SEPARATE landlord verification confirmation for THIS applicant only, as a
  // branded PDF or paste-ready text. Reads the applicant's own saved analysis (two-key bound).
  const downloadConfirmPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true); setError('');
    try {
      const r = await fetch('/api/applicants/verify-confirm-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j?.error || 'Could not generate the verification PDF.'); setPdfBusy(false); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `verification-${String(applicantName || 'applicant').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError('Could not generate the verification PDF.'); }
    setPdfBusy(false);
  };
  const copyConfirmText = async () => {
    if (textBusy) return;
    setTextBusy(true); setError('');
    try {
      const r = await fetch('/api/applicants/verify-confirm-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not generate the verification text.'); setTextBusy(false); return; }
      await navigator.clipboard.writeText(j.text || '');
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch (e) { setError('Could not copy the verification text.'); }
    setTextBusy(false);
  };

  const ghostBtn = { background: 'transparent', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, color: C.inkSoft, cursor: 'pointer' };
  const secondaryBtn = { background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.ink, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
  const destOutlineBtn = { background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
  const destSolidBtn = { background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ ...ghostBtn, color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="doc" size={14} color={C.ink} />
        {hasReport ? 'Document verification' : 'Analyze documents'}
        {hasReport && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.paper, background: C.green, padding: '2px 8px', borderRadius: R.pill }}>✓ done</span>}
        <span aria-hidden="true" style={{ color: C.inkMute, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Archived report — read-only view. */}
      {open && viewing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.paper, background: C.inkMute, padding: '3px 10px', borderRadius: R.pill, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Archived — {fmtDate(viewing.archived_at)}{viewing.source === 'tenant' ? ' · tenant' : ''}</span>
            <button onClick={() => setViewing(null)} style={{ ...ghostBtn, color: C.ink }}>← Back</button>
          </div>
          <DocIntelReport result={viewing.report} insight={viewing.ai_insight || ''} />
        </div>
      )}

      {open && !viewing && (
        <div style={{ marginTop: 12 }}>
          {/* Uploader */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            style={{ border: `1.5px dashed ${dragOver ? C.red : C.ruleDark}`, background: dragOver ? '#fef2f0' : C.paper, borderRadius: R.card, padding: '18px 16px', textAlign: 'center', cursor: 'pointer' }}>
            <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx" style={{ display: 'none' }}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Drop documents here or click to choose</div>
            <div style={{ fontSize: 12, color: C.inkMute, marginTop: 3 }}>Pay stubs, employment letters, bank statements, ID — up to {MAX} files (JPG/PNG/PDF, 25MB total)</div>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
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

              {/* Stage 2 — SEPARATE landlord confirmation for THIS applicant only (PDF + text). */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 3 }}>Verify &amp; confirm to landlord</div>
                <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>Send the landlord a verification confirmation for <strong style={{ color: C.inkSoft }}>{applicantName || 'this applicant'}</strong> only — separate from the ranked shortlist.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={downloadConfirmPdf} disabled={pdfBusy}
                    style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: pdfBusy ? 'wait' : 'pointer', opacity: pdfBusy ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {pdfBusy && <span className="rl-dispin" aria-hidden="true" />}{pdfBusy ? 'Preparing…' : 'Download PDF'}
                  </button>
                  <button onClick={copyConfirmText} disabled={textBusy}
                    style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: textBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {copied ? '✓ Copied' : textBusy ? 'Preparing…' : 'Copy text'}
                  </button>
                </div>
              </div>

              {/* Archive / delete this applicant's active analysis (Feature 4). */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
                {!confirmDelete ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={archiveActive} disabled={!!managing} style={{ ...secondaryBtn, opacity: managing ? 0.6 : 1 }}>
                      {managing === 'archive' && <span className="rl-dispin rl-dispin--dark" aria-hidden="true" />}{managing === 'archive' ? 'Archiving…' : 'Archive'}
                    </button>
                    <button onClick={() => { setConfirmDelete(true); setError(''); }} disabled={!!managing} style={{ ...destOutlineBtn, opacity: managing ? 0.6 : 1 }}>
                      Delete
                    </button>
                    <span style={{ fontSize: 11.5, color: C.inkMute, minWidth: 0 }}>Archive keeps a copy in history · Delete removes it permanently.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>Delete this analysis? This can’t be undone.</span>
                    <button onClick={deleteActive} disabled={managing === 'delete'} style={destSolidBtn}>
                      {managing === 'delete' && <span className="rl-dispin" aria-hidden="true" />}{managing === 'delete' ? 'Deleting…' : 'Delete'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} disabled={!!managing} style={{ ...ghostBtn }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Archived analyses (collapsed) — view-only history, each with a permanent delete. */}
          {archived.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
              <button onClick={() => setArchiveOpen((o) => !o)}
                style={{ ...ghostBtn, color: C.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="list" size={13} color={C.inkSoft} /> Archived analyses ({archived.length})
                <span aria-hidden="true" style={{ color: C.inkMute }}>{archiveOpen ? '▲' : '▼'}</span>
              </button>
              {archiveOpen && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                  {archived.map((entry) => (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Archived — {fmtDate(entry.archived_at)}{entry.source === 'tenant' ? ' · tenant upload' : ''}
                      </span>
                      <button onClick={() => setViewing(entry)} style={{ ...ghostBtn, padding: '6px 11px', color: C.ink }}>View</button>
                      {confirmArchId === entry.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => deleteArchivedEntry(entry.id)} disabled={managing === 'delete-archived'} style={{ ...destSolidBtn, padding: '6px 11px' }}>
                            {managing === 'delete-archived' && <span className="rl-dispin" aria-hidden="true" />}Delete
                          </button>
                          <button onClick={() => setConfirmArchId('')} style={{ ...ghostBtn, padding: '6px 11px' }}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => { setConfirmArchId(entry.id); setError(''); }} style={{ ...destOutlineBtn, padding: '6px 11px' }}>Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .rl-dispin { width: 15px; height: 15px; flex-shrink: 0; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.4); border-top-color: #fff; display: inline-block; }
        .rl-dispin--dark { border-color: rgba(15,15,16,0.2); border-top-color: ${C.ink}; }
        @media (prefers-reduced-motion: no-preference) {
          .rl-dispin { animation: rl-dispin 0.7s linear infinite; }
        }
        @keyframes rl-dispin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
