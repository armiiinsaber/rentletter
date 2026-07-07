// pages/upload/[token].js
// PUBLIC, UNAUTHENTICATED tenant DOCUMENT-UPLOAD page, reached from a realtor's secure
// single-applicant request link (https://rentletter.ca/upload/{token}).
//
// Flow (KV only — no Supabase, no tenant login):
//   1. Resolve the token via GET /api/upload/resolve → show WHOSE application it's for.
//   2. Guided checklist of what to upload + a multi-file picker (document types; no forced camera).
//   3. Review-and-confirm step (double-check the files) with a transparent analyze-then-discard note.
//   4. Submit → POST /api/upload/submit (files received transiently, NOT stored) → success.
// Expired/invalid/already-received tokens are handled with friendly messages.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';

const OK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx';
const MAX_FILES = 12;
const MAX_TOTAL = 25 * 1024 * 1024; // 25MB

const CHECKLIST = [
  'Recent pay stubs — last 2–3',
  'Employment or offer letter',
  'Credit report (Equifax, TransUnion, or Borrowell)',
  'Government-issued photo ID',
];

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | invalid | ready | received | done
  const [invalidMsg, setInvalidMsg] = useState('');
  const [req, setReq] = useState(null); // { tenantName, listingName, address, realtorName }
  const [files, setFiles] = useState([]); // File[]
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.token;
    let cancelled = false;
    if (!token || !/^[a-f0-9]{32}$/.test(String(token))) { setStatus('invalid'); setInvalidMsg('This upload link is not valid.'); return; }
    (async () => {
      try {
        const r = await fetch(`/api/upload/resolve?token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) { setStatus('invalid'); setInvalidMsg(j?.error || 'This upload link is no longer active.'); return; }
        setReq(j);
        setStatus(j.status === 'received' ? 'received' : 'ready');
      } catch (e) {
        if (!cancelled) { setStatus('invalid'); setInvalidMsg('Could not load this upload link. Please try again.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, router.query.token]);

  const addFiles = (incoming) => {
    setError('');
    const picked = Array.from(incoming || []);
    const next = [...files];
    for (const f of picked) {
      if (next.length >= MAX_FILES) { setError(`You can add up to ${MAX_FILES} files.`); break; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue; // de-dupe
      next.push(f);
    }
    const total = next.reduce((a, f) => a + f.size, 0);
    if (total > MAX_TOTAL) { setError('Those files are too large together (max 25MB). Try fewer or smaller files.'); return; }
    setFiles(next);
  };
  const removeFile = (i) => setFiles((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!files.length || submitting) return;
    setSubmitting(true); setError('');
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await readAsBase64(f) })));
      const r = await fetch('/api/upload/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: router.query.token, files: payload }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not submit your documents. Please try again.'); setSubmitting(false); return; }
      setSentCount(j.received || files.length);
      setFiles([]);
      setStatus('done');
    } catch (e) {
      setError('Could not submit your documents. Please try again.');
    }
    setSubmitting(false);
  };

  const firstName = (req?.tenantName || '').trim().split(/\s+/)[0] || '';
  const unitLabel = req?.address || req?.listingName || '';

  const disclosure = (
    <div style={{ background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '13px 15px', fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6 }}>
      <strong style={{ color: C.ink }}>How your documents are used:</strong> they’re analyzed to verify income, employment, and credit for your rental application, then <strong style={{ color: C.ink }}>discarded — we do not store them</strong>. Only your realtor sees the verified summary.
    </div>
  );

  return (
    <>
      <Head>
        <title>Upload your documents — Rentletter</title>
        <meta name="description" content="Securely upload your rental application documents to your realtor." />
        <meta name="theme-color" content="#f2eee3" />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Document request</span>
        </header>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 80px' }}>

          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: C.inkSoft, fontSize: 15 }}>Loading…</div>
          )}

          {status === 'invalid' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', marginBottom: 14, color: C.inkMute }}><Icon name="link" size={30} /></div>
              <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>This link is no longer active</h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px' }}>{invalidMsg}</p>
              <a href="/" className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl, padding: '13px 22px', fontSize: 14, fontWeight: 700 }}>Go to Rentletter</a>
            </div>
          )}

          {status === 'received' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', marginBottom: 12, color: C.green }}><Icon name="check" size={30} color={C.green} strokeWidth={2.5} /></div>
              <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>Documents already received</h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
                Your documents were submitted{req?.realtorName ? <> to <strong style={{ color: C.ink }}>{req.realtorName}</strong></> : ''}. There’s nothing more to do — if your realtor needs anything else, they’ll send a new request.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)' }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="check" size={15} color={C.green} strokeWidth={2.5} /> Documents received
              </div>
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10 }}>
                Thanks{firstName ? `, ${firstName}` : ''} — you’re all set.
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 22 }}>
                Your {sentCount} document{sentCount === 1 ? '' : 's'} {sentCount === 1 ? 'was' : 'were'} received and sent{req?.realtorName ? <> to <strong style={{ color: C.ink }}>{req.realtorName}</strong></> : ' to your realtor'} for review. You can close this page.
              </p>
              {disclosure}
            </div>
          )}

          {status === 'ready' && (
            <>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Document request</div>
              <h1 style={{ fontSize: 'clamp(24px, 5.5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10 }}>
                Upload your documents{firstName ? `, ${firstName}` : ''}
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 22 }}>
                {req?.realtorName ? <><strong style={{ color: C.ink }}>{req.realtorName}</strong> requested a few documents to finalize your rental application</> : 'Your realtor requested a few documents to finalize your rental application'}
                {unitLabel ? <> for <strong style={{ color: C.ink }}>{unitLabel}</strong></> : ''}.
              </p>

              {!reviewing ? (
                <>
                  {/* Guided checklist */}
                  <div className="rl-card" style={{ padding: 'clamp(16px, 4vw, 22px)', marginBottom: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, letterSpacing: '0.02em', marginBottom: 12 }}>Please upload:</div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                      {CHECKLIST.map((item) => (
                        <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: C.inkSoft, lineHeight: 1.45 }}>
                          <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: C.red, display: 'inline-flex' }}><Icon name="check" size={15} color={C.red} strokeWidth={2.5} /></span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginTop: 12 }}>Upload what you have — you can add several files (PDF, image, or Word).</div>
                  </div>

                  {/* Uploader */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                    onClick={() => inputRef.current?.click()}
                    style={{ border: `1.5px dashed ${dragOver ? C.red : C.ruleDark}`, background: dragOver ? '#fef2f0' : C.card, borderRadius: R.card, padding: 'clamp(22px, 5vw, 30px) 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
                    <input ref={inputRef} type="file" multiple accept={OK_ACCEPT} style={{ display: 'none' }}
                      onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                    <div style={{ display: 'inline-flex', marginBottom: 8, color: C.red }}><Icon name="plus" size={22} /></div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>Tap to choose files, or drop them here</div>
                    <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 4 }}>You can select more than one · up to {MAX_FILES} files, 25MB total</div>
                  </div>

                  {files.length > 0 && (
                    <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px' }}>
                          <span style={{ color: C.green, display: 'inline-flex', flexShrink: 0 }}><Icon name="check" size={15} color={C.green} strokeWidth={2.5} /></span>
                          <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f.name}</span>
                          <span style={{ fontSize: 11, color: C.inkMute, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                          <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} aria-label={`Remove ${f.name}`}
                            style={{ background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <div style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{error}</div>}

                  <div style={{ marginBottom: 16 }}>{disclosure}</div>

                  <button onClick={() => { if (files.length) { setError(''); setReviewing(true); window.scrollTo(0, 0); } }} disabled={!files.length}
                    style={{ width: '100%', background: files.length ? C.red : C.ruleDark, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: files.length ? 'pointer' : 'default', opacity: files.length ? 1 : 0.6, minHeight: 52 }}>
                    Review {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''} &amp; submit
                  </button>
                </>
              ) : (
                <>
                  {/* Review & confirm */}
                  <div className="rl-card" style={{ padding: 'clamp(18px, 4vw, 24px)', marginBottom: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Double-check before you send</div>
                    <div style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.5, marginBottom: 14 }}>You’re about to send {files.length} document{files.length === 1 ? '' : 's'}. Make sure you’ve included everything from the checklist.</div>
                    <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px' }}>
                          <span style={{ color: C.green, display: 'inline-flex', flexShrink: 0 }}><Icon name="check" size={15} color={C.green} strokeWidth={2.5} /></span>
                          <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f.name}</span>
                          <span style={{ fontSize: 11, color: C.inkMute, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
                      Checklist: {CHECKLIST.join(' · ')}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>{disclosure}</div>
                  {error && <div style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{error}</div>}

                  <button onClick={submit} disabled={submitting}
                    style={{ width: '100%', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.75 : 1, minHeight: 52, marginBottom: 10 }}>
                    {submitting ? 'Sending…' : `Submit ${files.length} document${files.length === 1 ? '' : 's'}`}
                  </button>
                  <button onClick={() => { setReviewing(false); window.scrollTo(0, 0); }} disabled={submitting}
                    style={{ width: '100%', background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
                    ← Back to add more
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
