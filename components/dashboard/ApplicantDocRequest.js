// components/dashboard/ApplicantDocRequest.js
// Realtor-side "Request documents from tenant" for ONE finalist applicant. An ALTERNATIVE to
// uploading the documents yourself (ApplicantDocIntel) — the two coexist. Generates a secure,
// single-applicant upload link the tenant opens to upload their own documents, with an optional
// "email to tenant" (Resend). Also reflects the request status (requested → received). Real
// dashboard only (calls the API). No raw files touch this component.
import { useState, useEffect } from 'react';
import { C, R } from '../theme';

function shortDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
}

export default function ApplicantDocRequest({ listingId, linkId, applicationId }) {
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(null); // null | 'requested' | 'received'
  const [url, setUrl] = useState('');
  const [requestedAt, setRequestedAt] = useState(null);
  const [receivedAt, setReceivedAt] = useState(null);
  const [tenantEmail, setTenantEmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailedNote, setEmailedNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Load current status on mount (single lightweight KV read on the server).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/applicants/doc-request-status?listingId=${encodeURIComponent(listingId)}&linkId=${encodeURIComponent(linkId)}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setStatus(j.status || null);
          setUrl(j.url || '');
          setRequestedAt(j.requestedAt || null);
          setReceivedAt(j.receivedAt || null);
          setTenantEmail(j.tenantEmail || null);
        }
      } catch (e) { /* non-fatal — the action still works */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [listingId, linkId]);

  const request = async (sendEmail = false) => {
    if (sendEmail) setEmailBusy(true); else setBusy(true);
    setError(''); setEmailedNote('');
    try {
      const r = await fetch('/api/applicants/request-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId, sendEmail }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not create the document request.'); }
      else {
        setStatus(j.status || 'requested');
        setUrl(j.url || '');
        setRequestedAt(j.requestedAt || requestedAt);
        if (j.tenantEmail !== undefined) setTenantEmail(j.tenantEmail);
        if (sendEmail) setEmailedNote(j.emailed ? `Emailed to ${j.tenantEmail || 'the tenant'}` : (j.emailError || 'Could not email — share the link instead.'));
      }
    } catch (e) { setError('Could not create the document request.'); }
    if (sendEmail) setEmailBusy(false); else setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* ignore */ }
  };

  const box = { marginTop: 12, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(14px, 3vw, 18px)', background: C.card };

  if (!loaded) {
    return <div style={{ ...box, color: C.inkMute, fontSize: 12.5 }}>Loading document request…</div>;
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>📄</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>Request documents from tenant</span>
        {status === 'requested' && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.amber, background: C.amberTint, border: `1px solid ${C.amber}`, padding: '2px 8px', borderRadius: R.pill }}>Pending</span>}
        {status === 'received' && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.green, background: C.greenTint, border: `1px solid ${C.green}`, padding: '2px 8px', borderRadius: R.pill }}>✓ Received</span>}
      </div>

      {status === 'received' ? (
        <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
          The tenant uploaded their documents{receivedAt ? ` on ${shortDate(receivedAt)}` : ''}. They’re ready to analyze.
        </div>
      ) : status === 'requested' ? (
        <>
          <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
            Secure link sent{requestedAt ? ` (${shortDate(requestedAt)})` : ''} — waiting for the tenant to upload. Copy the link or email it to them.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '8px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: C.inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{url}</span>
            <button onClick={copy} style={{ flexShrink: 0, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => request(true)} disabled={emailBusy || !tenantEmail}
              style={{ background: 'transparent', color: tenantEmail ? C.ink : C.inkMute, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: (emailBusy || !tenantEmail) ? 'default' : 'pointer', opacity: (emailBusy || !tenantEmail) ? 0.6 : 1 }}>
              {emailBusy ? 'Sending…' : tenantEmail ? 'Email to tenant' : 'No email on file'}
            </button>
            {emailedNote && <span style={{ fontSize: 12, color: C.inkSoft }}>{emailedNote}</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
            Instead of collecting the finalist’s documents yourself, send them a secure link to upload their own — no email back-and-forth. Their files are analyzed then discarded; nothing is stored.
          </div>
          <button onClick={() => request(false)} disabled={busy}
            style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Creating link…' : 'Request documents from tenant'}
          </button>
        </>
      )}

      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.red }}>{error}</div>}
    </div>
  );
}
