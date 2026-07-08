// components/dashboard/ApplicantDocRequest.js
// Realtor-side "Request documents from tenant" for ONE finalist applicant. An ALTERNATIVE to
// uploading the documents yourself (ApplicantDocIntel) — the two coexist. Generates a secure,
// single-applicant upload link the tenant opens to upload their own documents, with an optional
// "email to tenant" (Resend). Also reflects the request status (requested → received). Real
// dashboard only (calls the API). No raw files touch this component.
import { useState, useEffect } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';

function shortDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
}

export default function ApplicantDocRequest({ listingId, linkId, applicationId, hasActiveAnalysis }) {
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
  const [confirmRenew, setConfirmRenew] = useState(false); // guard before re-requesting over an active analysis
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

  // Create (or re-create) the document request. renew=true mints a BRAND-NEW upload link via the
  // same server endpoint — used by "Request again" after a prior submission (the old link dies).
  const request = async (sendEmail = false, renew = false) => {
    if (sendEmail) setEmailBusy(true); else setBusy(true);
    setError(''); setEmailedNote('');
    try {
      const r = await fetch('/api/applicants/request-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, linkId, applicationId, sendEmail, renew }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'Could not create the document request.'); }
      else {
        setStatus(j.status || 'requested');
        setUrl(j.url || '');
        setRequestedAt(j.requestedAt || requestedAt);
        if (renew) { setReceivedAt(null); setConfirmRenew(false); } // fresh request → back to pending
        if (j.tenantEmail !== undefined) setTenantEmail(j.tenantEmail);
        if (sendEmail) setEmailedNote(j.emailed ? `Emailed to ${j.tenantEmail || 'the tenant'}` : (j.emailError || 'Could not email — share the link instead.'));
      }
    } catch (e) { setError('Could not create the document request.'); }
    if (sendEmail) setEmailBusy(false); else setBusy(false);
  };

  // "Request again" — if an active (non-archived) analysis exists, confirm first (a new submission
  // overwrites it); otherwise create the fresh link straight away.
  const requestAgain = () => {
    if (hasActiveAnalysis) { setConfirmRenew(true); setError(''); }
    else request(false, true);
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
        <Icon name="doc" size={15} color={C.ink} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>Request documents from tenant</span>
        {status === 'requested' && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.amber, background: C.amberTint, border: `1px solid ${C.amber}`, padding: '2px 8px', borderRadius: R.pill }}>Pending</span>}
        {status === 'received' && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.green, background: C.greenTint, border: `1px solid ${C.green}`, padding: '2px 8px', borderRadius: R.pill }}>✓ Received</span>}
      </div>

      {status === 'received' ? (
        <div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
            The tenant uploaded their documents{receivedAt ? ` on ${shortDate(receivedAt)}` : ''}. They’re analyzed automatically — see the verification in the document panel above.
          </div>
          {!confirmRenew ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={requestAgain} disabled={busy}
                style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Creating link…' : 'Request again'}
              </button>
              <span style={{ fontSize: 11.5, color: C.inkMute, minWidth: 0 }}>Need different documents? Send a fresh upload link.</span>
            </div>
          ) : (
            <div style={{ marginTop: 12, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '11px 13px' }}>
              <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
                A verified analysis already exists. Request new documents anyway? A new submission will overwrite the active analysis. <strong style={{ color: C.ink }}>Tip:</strong> archive the current analysis first if you want to keep it.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => request(false, true)} disabled={busy}
                  style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Creating link…' : 'Request new documents'}
                </button>
                <button onClick={() => setConfirmRenew(false)} disabled={busy}
                  style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, borderRadius: R.ctrl, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
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
