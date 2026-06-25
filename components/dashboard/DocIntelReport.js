// components/dashboard/DocIntelReport.js
// PURE PRESENTATIONAL — renders ONE document-intelligence result: documents grouped by type,
// a cross-reference section, a comparison-to-application section (match/close/mismatch/not-
// found badges), an overall verification summary, and (optionally) the OHRC-safe insight
// paragraph. No API calls, no data fetching — safe to use in the demo with a hardcoded sample.
import { C, R } from '../theme';

const AMBER = '#b3791f';
const AMBER_BG = '#fff8ec';

const cmp = {
  match: { label: 'Verified', fg: C.green, bg: '#f0f7f3', mark: '✓' },
  close: { label: 'Close', fg: AMBER, bg: AMBER_BG, mark: '≈' },
  mismatch: { label: 'Mismatch', fg: C.red, bg: '#fef2f0', mark: '!' },
  not_found: { label: 'Not found', fg: C.inkMute, bg: C.paperDeep, mark: '–' },
};

const DOC_LABEL = {
  'pay stub': 'Pay stub', 'employment letter': 'Employment letter', 'bank statement': 'Bank statement',
  'government ID': 'Government ID', 'reference letter': 'Reference letter', 'tax document': 'Tax document', other: 'Document',
};

const FIELD_LABEL = {
  applicantName: 'Name', income: 'Income', payFrequency: 'Pay frequency', employer: 'Employer',
  employmentType: 'Employment', jobTitle: 'Job title', documentDate: 'Date',
};

function Chip({ children, fg, bg }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: fg, background: bg, padding: '3px 9px', borderRadius: R.pill, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{children}</span>
  );
}

export default function DocIntelReport({ result, insight }) {
  if (!result) return null;
  const documents = Array.isArray(result.documents) ? result.documents : [];
  const crossReference = Array.isArray(result.crossReference) ? result.crossReference : [];
  const comparisons = Array.isArray(result.comparisons) ? result.comparisons : [];
  const conf = result.confidence;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Overall summary */}
      {result.overallSummary && (
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${C.ink}`, borderRadius: R.card, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.inkSoft, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Verification summary</span>
            {conf && <Chip fg={conf === 'high' ? C.green : conf === 'low' ? AMBER : C.inkSoft} bg={conf === 'high' ? '#f0f7f3' : conf === 'low' ? AMBER_BG : C.paperDeep}>{conf} confidence</Chip>}
          </div>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>{result.overallSummary}</div>
        </div>
      )}

      {/* Comparison to the application */}
      {comparisons.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Compared to the application</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {comparisons.map((c, i) => {
              const s = cmp[c.status] || cmp.not_found;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px' }}>
                  <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%', background: s.bg, color: s.fg, border: `1px solid ${s.fg}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{s.mark}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, minWidth: 72 }}>{c.field}</span>
                  <span style={{ fontSize: 12.5, color: C.inkSoft, flex: 1, minWidth: 0 }}>
                    stated <strong style={{ color: C.ink }}>{c.stated ?? '—'}</strong>
                    <span style={{ color: C.inkMute }}> · found </span>
                    <strong style={{ color: C.ink }}>{c.found ?? '—'}</strong>
                  </span>
                  <Chip fg={s.fg} bg={s.bg}>{s.label}</Chip>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-reference across documents */}
      {crossReference.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Cross-reference across documents</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {crossReference.map((x, i) => {
              const ok = x.status === 'consistent';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, color: ok ? C.green : AMBER, fontWeight: 800 }}>{ok ? '✓' : '⚠'}</span>
                  <span><strong style={{ color: C.ink }}>{x.field}:</strong> {x.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents grouped by type */}
      {documents.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Documents read ({documents.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {documents.map((d, i) => {
              const ex = d.extracted || {};
              const rows = Object.keys(FIELD_LABEL).filter((k) => ex[k] != null && ex[k] !== '');
              return (
                <div key={i} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Chip fg={C.paper} bg={C.ink}>{DOC_LABEL[d.documentType] || 'Document'}</Chip>
                    <span style={{ fontSize: 11, color: C.inkMute, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }} title={d.filename}>{d.filename}</span>
                  </div>
                  {rows.length > 0 ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {rows.map((k) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                          <span style={{ color: C.inkMute, fontWeight: 600 }}>{FIELD_LABEL[k]}</span>
                          <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{String(ex[k])}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: 12, color: C.inkMute }}>No screenable fields read.</div>}
                  {d.notes && <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 8, lineHeight: 1.45 }}>{d.notes}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OHRC-safe insight */}
      {insight && (
        <div style={{ background: C.card, border: `1px solid ${C.ruleDark}`, borderLeft: `4px solid ${C.red}`, borderRadius: R.card, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI insight</span>
            <span style={{ fontSize: 10.5, color: C.inkMute }}>screenable facts only</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>{insight}</div>
        </div>
      )}
    </div>
  );
}
