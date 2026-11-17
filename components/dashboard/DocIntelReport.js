// components/dashboard/DocIntelReport.js
// PURE PRESENTATIONAL. What the documents say, in the checklist's words: one row per fact,
// "Said: {stated} · Docs: {found}", the red tick for a match, the ink dot for a mismatch, nothing
// for close or not on documents, the "Also seen" lines where they exist (lib/documentsLine.js
// comparisonRows). Then the documents read, one small card each. No summary paragraph, no
// confidence, no status colours: state is the tick, the dot and the words.
import { C, R } from '../theme';
import { Icon, StatusPills, StackedLines, LabelValue } from '../ui';
import { comparisonRows } from '../../lib/documentsLine';
import { creditLines } from '../../lib/creditShared';

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
      <style jsx global>{`@media (max-width: 344.98px) { .di-doc { background: transparent !important; border: 0 !important; border-top: 1px solid ${C.rule} !important; border-radius: 0 !important; padding: var(--s-2) 0 0 !important; } }`}</style>
      {nameLine && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 'var(--lh-body)', textWrap: 'balance' }}><Mark status="mismatch" />{nameLine}</div>}
      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
          {rows.map((r) => (
            <li key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', minWidth: 0 }}>
              <span style={{ marginTop: 3 }}><Mark status={r.status} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.ink, lineHeight: 'var(--lh-body)' }}>{r.field}</div>
                <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere', textWrap: 'balance' }}><StackedLines parts={[<LabelValue key="said" label="Said:" value={r.said} />, <LabelValue key="docs" label="Docs:" value={r.docs} />]} /></div>
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
                // Below 345px (a 320 screen, three cards deep) each document is a row under a rule, not a box of
                // its own, so a long value (a three word name) keeps its line (.di-doc above).
                <div key={i} className="di-doc" style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'var(--s-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginBottom: 'var(--s-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.ink }}>{isUnrecognized ? 'Not a supporting document' : prettyType(type)}</span>
                    {/* The file name whole beside the type, or on the line under it when the two do not fit. */}
                    <span style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontFamily: 'monospace', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.filename}>{d.filename}</span>
                  </div>
                  {isUnrecognized && <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>{d.notes || 'This file does not read as a rental screening document. Ask the applicant to resend.'}</div>}
                  {/* The credit facts are sentences, a line each (a pill is one 28px line and would cut them); the pill says it is not scored. */}
                  {isCredit && (() => { const c = creditLines({ documents: [d] }); return <><div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-2)' }}><StackedLines parts={[c.label, ...c.lines]} /></div><StatusPills label="Credit report" items={['not used in Fit']} /></>; })()}
                  {rowKeys.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s-1)' }}>
                      {rowKeys.map((k) => (
                        // The label whole at the left, the value at the right, or under the label when the two do not fit (R3).
                        <div key={k} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 var(--s-3)', fontSize: 'var(--t-body-2)' }}>
                          <span style={{ color: C.inkMute, flexShrink: 0 }}>{FIELD_LABEL[k] || k}</span>
                          <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, marginLeft: 'auto', overflowWrap: 'anywhere' }}>{String(ex[k])}</span>
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
