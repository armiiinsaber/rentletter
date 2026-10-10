// components/dashboard/IntegrityChecks.js
// The document checks on one applicant (lib/documentIntegrity.js): each one a check docs item in
// one sentence of fact, the document it came from one tap away, and one tap to ask the tenant for a
// new copy through the existing request (POST /api/applicants/request-documents, renewed and
// emailed, behind the session, the entitlement and the ownership check). Notes (an employment
// letter older than 90 days) sit under them, never as a check docs item. Nothing here moves Fit.
//   <IntegrityLine report />            the collapsed card's line: the pill and the first sentence
//   <IntegrityChecks applicant listingId heldDocuments onViewDocument />   the checklist row's body
import { useState } from 'react';
import { C } from '../theme';
import { StatusPills } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { integrityOf } from '../../lib/documentIntegrity';
import { noWidow } from '../../lib/typeset';

export const CHECK_DOCS = 'check docs';
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
const textBtn = { minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' };
const outlineBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 var(--gap-card)', borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}` };
const line = { fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 'var(--lh-body)', margin: 0, overflowWrap: 'anywhere', textWrap: 'pretty' };

export function IntegrityLine({ report, style }) {
  const { flags } = integrityOf(report);
  if (!flags.length) return null;
  return (
    <div data-integrity-line="" style={style}>
      <StatusPills label="Document checks" items={[CHECK_DOCS, flags.length > 1 ? `${flags.length - 1} more` : null]} />
      <p style={{ ...line, color: C.inkSoft, marginTop: 'var(--s-1)' }}>{noWidow(flags[0].sentence)}</p>
    </div>
  );
}

export default function IntegrityChecks({ applicant, listingId, heldDocuments, onViewDocument }) {
  const adapter = useAdapter();
  const { flags, notes } = integrityOf(applicant && applicant.docVerifications ? applicant.docVerifications[0] : null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [requested, setRequested] = useState(null); // { at, emailed, note }
  const [error, setError] = useState('');
  if (!flags.length && !notes.length) return null;
  const held = (id) => (Array.isArray(heldDocuments) ? heldDocuments : []).find((d) => d && String(d.id) === String(id) && !d.deletedAt) || null;
  const view = async (doc) => { if (viewing) return; setViewing(doc.id); setError(''); const e = await onViewDocument?.(doc); if (e) setError(e); setViewing(null); };
  const requestCopy = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await adapter.fetch('/api/applicants/request-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId, linkId: applicant.linkId, applicationId: applicant.application?.id ?? null, sendEmail: true, renew: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send the request.');
      setRequested({ at: j.requestedAt || new Date().toISOString(), emailed: !!j.emailed, note: j.emailed ? `Emailed to ${j.tenantEmail || 'the tenant'}` : (j.emailError || 'The link is on file to share.') });
    } catch (e) { setError(e?.message || 'Could not send the request.'); }
    finally { setBusy(false); }
  };
  return (
    <div data-integrity="">
      {flags.map((f, i) => {
        const doc = held(f.documentId);
        return (
          <div key={`${f.type}:${f.documentId}:${i}`} data-integrity-flag={f.type} style={{ marginTop: i ? 'var(--s-3)' : 0 }}>
            <StatusPills label="Document check" items={[CHECK_DOCS]} />
            <p style={{ ...line, marginTop: 'var(--s-1)' }}>{noWidow(f.sentence)}</p>
            {doc
              ? <button type="button" onClick={() => view(doc)} disabled={viewing === doc.id} aria-label={`View the ${doc.kind || 'document'} this came from`} style={{ ...textBtn, opacity: viewing === doc.id ? 0.7 : 1 }}>View document</button>
              : <p style={{ ...line, color: C.inkMute, marginTop: 'var(--s-1)' }}>The document is no longer held.</p>}
          </div>
        );
      })}
      {flags.length ? (
        requested
          ? <div data-integrity-requested="" style={{ marginTop: 'var(--s-2)' }}>
              <StatusPills label="Replacement request" items={['New copy requested', shortDate(requested.at)]} />
              <p style={{ ...line, color: C.inkSoft, marginTop: 'var(--s-1)' }}>{noWidow(requested.note)}</p>
            </div>
          : <div className="rl-ctrl-row" style={{ marginTop: 'var(--s-2)' }}>
              <button type="button" onClick={requestCopy} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending' : 'Request a new copy'}</button>
            </div>
      ) : null}
      {notes.map((n, i) => <p key={`note:${n.documentId}:${i}`} data-integrity-note="" style={{ ...line, color: C.inkMute, marginTop: 'var(--s-2)' }}>{noWidow(n.sentence)}</p>)}
      {error ? <p role="alert" style={{ ...line, color: C.danger, marginTop: 'var(--s-1)' }}>{noWidow(error)}</p> : null}
    </div>
  );
}
