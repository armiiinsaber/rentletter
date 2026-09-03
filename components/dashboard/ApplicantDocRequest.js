// components/dashboard/ApplicantDocRequest.js
// Realtor-side "Request documents from tenant" for ONE finalist applicant. An ALTERNATIVE to
// uploading the documents yourself (ApplicantDocIntel) — the two coexist. Generates a secure,
// single-applicant upload link the tenant opens to upload their own documents, with an optional
// "email to tenant" (Resend). Also reflects the request status (requested → received). Real
// dashboard only (calls the API). No raw files touch this component.
import { useState, useEffect, useRef } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';

function shortDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
}

export default function ApplicantDocRequest({ listingId, linkId, applicationId, hasActiveAnalysis, focus = null }) {
  const adapter = useAdapter();
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
  // Driven by a "Rentletter noticed" card: highlight this panel (and pre-arm the renewal confirm).
  const [highlight, setHighlight] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { if (focus) { setHighlight(true); if (focus.renew && hasActiveAnalysis) setConfirmRenew(true); const t = setTimeout(() => setHighlight(false), 4000); return () => clearTimeout(t); } return undefined; }, [focus, hasActiveAnalysis]);
  // Once the panel has its status, put keyboard focus on its first control so the realtor can act
  // immediately (the card was scrolled into view by the caller; no second scroll here).
  useEffect(() => { if (focus && loaded) boxRef.current?.querySelector('button')?.focus({ preventScroll: true }); }, [focus, loaded]);

  // Load current status on mount (single lightweight KV read on the server).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await adapter.fetch(`/api/applicants/doc-request-status?listingId=${encodeURIComponent(listingId)}&linkId=${encodeURIComponent(linkId)}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setStatus(j.status || null);
          setUrl(j.url || '');
          setRequestedAt(j.requestedAt || null);
          setReceivedAt(j.receivedAt || null);
          setTenantEmail(j.tenantEmail || null);
        }
      } catch (e) { /* non-fatal, the action still works */ }
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
      const r = await adapter.fetch('/api/applicants/request-documents', {
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
        if (sendEmail) setEmailedNote(j.emailed ? `Emailed to ${j.tenantEmail || 'the tenant'}` : (j.emailError || 'Could not email, share the link instead.'));
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

  const box = { marginTop: 'var(--s-3)', border: `1px solid ${highlight ? C.red : C.rule}`, boxShadow: highlight ? `0 0 0 2px ${C.redTint}` : 'none', borderRadius: R.card, padding: 'var(--card-pad)', background: C.card };

  if (!loaded) {
    return <div ref={boxRef} style={{ ...box, color: C.inkMute, fontSize: 'var(--t-body-2)' }}>Loading document request…</div>;
  }

  return (
    <div ref={boxRef} style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap', marginBottom: 'var(--s-1)' }}>
        <Icon name="doc" size={15} color={C.ink} />
        <span style={{ fontSize: 'var(--t-body-2)', fontWeight: 800, color: C.ink }}>Request documents from tenant</span>
        {status === 'requested' && <span style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 800, color: C.amber, background: C.amberTint, border: `1px solid ${C.amber}`, padding: 'var(--s-1) var(--s-2)', borderRadius: R.pill }}>Pending</span>}
        {status === 'received' && <span style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 800, color: C.green, background: C.greenTint, border: `1px solid ${C.green}`, padding: 'var(--s-1) var(--s-2)', borderRadius: R.pill }}>✓ Received</span>}
      </div>

      {status === 'received' ? (
        <div>
          <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55 }}>
            The tenant uploaded their documents{receivedAt ? ` on ${shortDate(receivedAt)}` : ''}. They’re analyzed automatically, see the verification in the document panel above.
          </div>
          {!confirmRenew ? (
            <div style={{ marginTop: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={requestAgain} disabled={busy}
                style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Creating link…' : 'Request again'}
              </button>
              <span style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, minWidth: 0 }}>Need different documents? Send a fresh upload link.</span>
            </div>
          ) : (
            <div style={{ marginTop: 'var(--s-3)', background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 'var(--s-3) var(--s-3)' }}>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-2)' }}>
                A verified analysis already exists. Request new documents anyway? A new submission will overwrite the active analysis. <strong style={{ color: C.ink }}>Tip:</strong> archive the current analysis first if you want to keep it.
              </div>
              <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => request(false, true)} disabled={busy}
                  style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Creating link…' : 'Request new documents'}
                </button>
                <button onClick={() => setConfirmRenew(false)} disabled={busy}
                  style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : status === 'requested' ? (
        <>
          <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-2)' }}>
            Secure link sent{requestedAt ? ` (${shortDate(requestedAt)})` : ''}, waiting for the tenant to upload. Copy the link or email it to them.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-2)', marginBottom: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{url}</span>
            <button onClick={copy} style={{ flexShrink: 0, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => request(true)} disabled={emailBusy || !tenantEmail}
              style={{ background: 'transparent', color: tenantEmail ? C.ink : C.inkMute, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: (emailBusy || !tenantEmail) ? 'default' : 'pointer', opacity: (emailBusy || !tenantEmail) ? 0.6 : 1 }}>
              {emailBusy ? 'Sending…' : tenantEmail ? 'Email to tenant' : 'No email on file'}
            </button>
            {emailedNote && <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>{emailedNote}</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-3)', textWrap: 'pretty' }}>
            Instead of collecting the finalist’s documents yourself, send them a secure link to upload their own, no email back and forth. Their files are analyzed, then held for your review for 14 days or until you delete them.
          </div>
          <button onClick={() => request(false)} disabled={busy}
            style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Creating link…' : 'Request documents from tenant'}
          </button>
        </>
      )}

      {error && <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.red }}>{error}</div>}
    </div>
  );
}
