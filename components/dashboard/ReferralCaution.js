// components/dashboard/ReferralCaution.js
// PURE PRESENTATIONAL. Shown wherever a REFERRED applicant appears in the receiving realtor's
// views. Never a bare checkmark: the prior verification is shown WITH its date and a plain
// caution that it was run for a different listing on documents as of then.
import { C, R } from '../theme';

const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return 'not set'; } };

export default function ReferralCaution({ meta, compact = false }) {
  if (!meta) return null;
  const v = meta.verification;
  return (
    <div style={{ marginTop: compact ? 8 : 12, padding: compact ? '8px 12px' : '10px 14px', background: C.paperDeep, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55 }}>
      <div style={{ color: C.ink, fontWeight: 700, textWrap: 'pretty' }}>Referred by {meta.fromName || 'another realtor'}{meta.fromBrokerage ? ` · ${meta.fromBrokerage}` : ''}{meta.approvedAt ? ` · applicant approved ${dateLong(meta.approvedAt)}` : ''}</div>
      {meta.note && <div style={{ marginTop: 'var(--s-1)', fontStyle: 'italic', textWrap: 'pretty' }}>“{meta.note}”</div>}
      {v ? (
        <div style={{ marginTop: 'var(--s-1)', padding: 'var(--s-2) var(--s-2)', background: C.amberTint, borderLeft: `3px solid ${C.amber}`, borderRadius: R.ctrl, color: C.ink }}>
          <strong>Prior document check, {v.analyzedAt ? dateLong(v.analyzedAt) : 'date unknown'}</strong>, run by {meta.fromName || 'the referring realtor'} for a different listing{v.forListing ? ` (${v.forListing})` : ''}, on documents as of then.{' '}
          {v.verified
            ? <>It found: {[v.incomeVerified ? `income${v.incomeFigure ? ` ${v.incomeFigure}` : ''} matched` : null, v.employmentVerified ? `employer${v.employerName ? ` ${v.employerName}` : ''} matched` : null, v.credit ? `credit ${v.credit.band || v.credit.score || 'report'} (${v.credit.bureau || 'bureau'})` : null].filter(Boolean).join('; ') || 'documents analysed'}.</>
            : <>It did not verify the applicant ({v.reason === 'name_mismatch' ? 'document name mismatch' : v.reason === 'name_unclear' ? 'name could not be confirmed' : 'no usable documents'}).</>}
          {' '}<strong>This is not a verification for your listing, request documents again if it matters.</strong> No documents were transferred.
        </div>
      ) : (
        <div style={{ marginTop: 'var(--s-1)' }}>No document check was shared. Request documents as you would for any applicant.</div>
      )}
    </div>
  );
}
