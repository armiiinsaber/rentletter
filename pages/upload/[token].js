// pages/upload/[token].js
// PUBLIC, UNAUTHENTICATED tenant DOCUMENT-UPLOAD page, reached from a realtor's secure
// single-applicant request link (https://rentletter.ca/upload/{token}).
//
// Flow (KV only — no Supabase, no tenant login):
//   1. Resolve the token via GET /api/upload/resolve → show WHOSE application it's for.
//   2. Guided checklist of what to upload + a multi-file picker (document types; no forced camera).
//   3. Review-and-confirm step (double-check the files) with a transparent analyze-then-discard note.
//   4. Submit → analyze ONE file per request (POST /api/upload/analyze-file, with live progress),
//      then POST /api/upload/finalize once → success. Each file is analyzed, then the original is held
//      for the realtor's review for RETENTION_DAYS (lib/documentRetention.js) or until they delete it;
//      per-file requests keep every request under Vercel's 4.5MB body cap and 60s function limit.
// Expired/invalid/already-received tokens are handled with friendly messages.
import { useState, useEffect } from 'react';
import { RETENTION_DAYS } from '../../lib/documentRetention';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { C, R } from '../../components/theme';
import DocumentUploader from '../../components/tenant/DocumentUploader';

// Analysis only reads PDF/JPG/PNG (same as the realtor path), so restrict the picker to those.

const CHECKLIST = [
  'Recent pay stubs, last 2 to 3',
  'Employment or offer letter',
  'Credit report (Equifax, TransUnion, or Borrowell)',
  'Government issued photo ID',
];

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | invalid | ready | received | done
  const [invalidMsg, setInvalidMsg] = useState('');
  const [req, setReq] = useState(null); // { tenantName, listingName, address, realtorName }
  const [sentCount, setSentCount] = useState(0);

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

  const firstName = (req?.tenantName || '').trim().split(/\s+/)[0] || '';
  const unitLabel = req?.address || req?.listingName || '';

  const disclosure = (
    <div style={{ background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '13px 15px', fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6 }}>
      <strong style={{ color: C.ink }}>How your documents are used:</strong> they’re analyzed to verify income, employment, and credit for your rental application. <strong style={{ color: C.ink }}>Your realtor can view them for {RETENTION_DAYS} days, then they are deleted.</strong> Only the listing realtor sees them and the verified summary.
    </div>
  );

  return (
    <>
      <Head>
        <title>Upload your documents · Rentletter</title>
        <meta name="description" content="Securely upload your rental application documents." />
        <meta name="theme-color" content="#f2eee3" />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', paddingTop: 'calc(clamp(16px, 4vw, 22px) + env(safe-area-inset-top, 0px))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
                Your documents were submitted{req?.realtorName ? <> to <strong style={{ color: C.ink }}>{req.realtorName}</strong></> : ''}. There’s nothing more to do, if the listing realtor needs anything else, they’ll send a new request.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)' }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="check" size={15} color={C.green} strokeWidth={2.5} /> Documents received
              </div>
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 4, textWrap: 'balance' }}>
                Thanks{firstName ? `, ${firstName}` : ''}.
              </h1>
              <div style={{ fontSize: 'clamp(16px, 4vw, 21px)', fontWeight: 700, color: C.inkSoft, letterSpacing: '-0.01em', marginBottom: 18 }}>
                You’re all&nbsp;set.
              </div>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 22, textWrap: 'pretty' }}>
                Your {sentCount} document{sentCount === 1 ? '' : 's'} {sentCount === 1 ? 'was' : 'were'} received and sent{req?.realtorName ? <> to <strong style={{ color: C.ink }}>{req.realtorName}</strong></> : ' to the listing realtor'} for review. You can close this page.
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
                {req?.realtorName ? <><strong style={{ color: C.ink }}>{req.realtorName}</strong>, the realtor representing the landlord, requested a few documents to finalize your rental application</> : 'The listing realtor requested a few documents to finalize your rental application'}
                {unitLabel ? <> for <strong style={{ color: C.ink }}>{unitLabel}</strong></> : ''}.
              </p>

              <DocumentUploader
                token={String(router.query.token || '')}
                checklist={CHECKLIST}
                onDone={({ received }) => { setSentCount(received); setStatus('done'); window.scrollTo(0, 0); }}
                before={(
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
                      <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginTop: 12 }}>Upload what you have, you can add several files (PDF or image).</div>
                    </div>
                    <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, marginBottom: 10, textWrap: 'pretty' }}>Your realtor can view these for {RETENTION_DAYS} days, then they are deleted. Do not upload anything showing your SIN.</div>
                  </>
                )}
                disclosure={disclosure}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
