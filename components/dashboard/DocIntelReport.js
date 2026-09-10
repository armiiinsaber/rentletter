// components/dashboard/DocIntelReport.js
// PURE PRESENTATIONAL. What the documents say, in the checklist's words: one row per fact,
// "Said: {stated} · Docs: {found}", the red tick for a match, the ink dot for a mismatch, nothing
// for close or not on documents, the "Also seen" lines where they exist (lib/documentsLine.js
// comparisonRows). Then the documents read, one small card each. No summary paragraph, no
// confidence, no status colours: state is the tick, the dot and the words.
import { C, R } from '../theme';
import { Icon } from '../ui';
import { comparisonRows } from '../../lib/documentsLine';

const DOC_LABEL = {
  'pay stub': 'Pay stub', 'employment letter': 'Employment letter', 'credit report': 'Credit report',
  'bank statement': 'Bank statement', 'government ID': 'Government ID', 'reference letter': 'Reference letter',
  'tax document': 'Tax document', other: 'Document',
};
const prettyType = (t) => DOC_LABEL[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Document');
const FIELD_LABEL = {
  applicantName: 'Name', employer: 'Employer', employmentType: 'Employment', jobTitle: 'Job title', startDate: 'Start date',
  annualSalaryPrinted: 'Annual figure printed', periodStart: 'Period start', periodEnd: 'Period end', payDate: 'Pay date',
  grossForPeriod: 'Gross for period', regularRate: 'Hourly rate', hours: 'Hours', payFrequency: 'Pay frequency', income: 'Income', documentDate: 'Date',
};
const STD_FIELDS = ['applicantName', 'employer', 'employmentType', 'jobTitle', 'startDate', 'annualSalaryPrinted', 'periodStart', 'periodEnd', 'payDate', 'grossForPeriod', 'regularRate', 'hours', 'payFrequency', 'income', 'documentDate'];

// The mark: the red tick, the ink dot, or nothing.
export function Mark({ status }) {
  return (
    <span aria-hidden="true" style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {status === 'match' ? <Icon name="check" size={14} color={C.red} strokeWidth={2.5} /> : status === 'mismatch' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.ink, display: 'inline-block' }} /> : null}
    </span>
  );
}

export default function DocIntelReport({ result }) {
  if (!result) return null;
  const documents = Array.isArray(result.documents) ? result.documents : [];
  const rows = comparisonRows(result);
  const nameLine = result.nameMatch === 'mismatch' ? `Name on the documents did not match${result.applicantName ? ` ${result.applicantName}` : ''}${Array.isArray(result.documentNames) && result.documentNames.length ? `: they name ${result.documentNames.filter(Boolean).join(', ')}` : ''}.` : result.nameMatch === 'unclear' ? 'The name on the documents could not be confirmed.' : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s-3)' }}>
      {nameLine && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 'var(--lh-body)', textWrap: 'pretty' }}><Mark status="mismatch" />{nameLine}</div>}
      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
          {rows.map((r) => (
            <li key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', minWidth: 0 }}>
              <span style={{ marginTop: 3 }}><Mark status={r.status} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.ink, lineHeight: 'var(--lh-body)' }}>{r.field}</div>
                <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>Said: {r.said} · Docs: {r.docs}</div>
                {r.also.map((line) => <div key={line} style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere' }}>Also seen: {line}</div>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {documents.length > 0 && (
        <div>
          <div style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 'var(--s-2)' }}>Documents read ({documents.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s-2)' }}>
            {documents.map((d, i) => {
              const ex = d.extracted || {};
              const type = d.documentType || '';
              const isUnrecognized = d.unrecognized === true || /unrecognized/i.test(type);
              const isCredit = !isUnrecognized && (/credit\s*report/i.test(type) || ex.creditScore != null || ex.scoreBand != null);
              const rowKeys = (isCredit ? [] : STD_FIELDS).filter((k) => ex[k] != null && ex[k] !== '');
              return (
                <div key={i} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'var(--s-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginBottom: 'var(--s-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.ink }}>{isUnrecognized ? 'Not a supporting document' : prettyType(type)}</span>
                    <span style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }} title={d.filename}>{d.filename}</span>
                  </div>
                  {isUnrecognized && <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>{d.notes || 'This file does not read as a rental screening document. Ask the applicant to resend.'}</div>}
                  {isCredit && <div style={{ fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere' }}>Credit report on file · score {ex.creditScore != null ? ex.creditScore : 'not legible'} · not used in Fit</div>}
                  {rowKeys.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s-1)' }}>
                      {rowKeys.map((k) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)', fontSize: 'var(--t-body-2)' }}>
                          <span style={{ color: C.inkMute, minWidth: 0 }}>{FIELD_LABEL[k] || k}</span>
                          <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{String(ex[k])}</span>
                        </div>
                      ))}
                    </div>
                  ) : (!isCredit && !isUnrecognized) ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute }}>No screenable fields read.</div> : null}
                  {d.notes && !isUnrecognized && !isCredit && <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, marginTop: 'var(--s-2)', lineHeight: 'var(--lh-body)' }}>{d.notes}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
