// lib/documentsLine.js  PURE, isomorphic. The document panel's one line and its fold rows, in
// the checklist's words, from the active report (lib/fitScore.js readVerification reads it the
// same way).
//   documentsLine(report, docRequest) -> { line, canSendAgain }
//     "Documents · 4 read · income and employer on the letter" | "… · income on pay stubs" |
//     "… · nothing matched" | "Documents · none yet"
//   comparisonRows(report) -> [{ key, field, said, docs, status, also }]
//     status: 'match' (the red tick), 'mismatch' (the ink dot), anything else (nothing)
import { readVerification } from './fitScore.js';

const activeOf = (report) => (Array.isArray(report) ? report[0] : report) || null;

export function whatMatched(report) {
  const r = activeOf(report);
  if (!r) return 'none yet';
  const v = readVerification(r);
  if (v.state !== 'ok') return 'nothing matched';
  const rows = Array.isArray(r.comparisons) ? r.comparisons : [];
  const income = rows.find((c) => c && /income/i.test(String(c.field || '')));
  const basis = String((income && income.basis) || '');
  const onLetter = /letter/.test(basis);
  const source = onLetter ? 'on the letter' : 'on pay stubs';
  if (v.incomeMatched && v.employerMatched) return `income and employer ${source}`;
  if (v.incomeMatched) return `income ${source}`;
  if (v.employerMatched) { const emp = rows.find((c) => c && /employer/i.test(String(c.field || ''))); return `employer on ${emp && /stub/i.test(String(emp.source || '')) ? 'pay stubs' : 'the letter'}`; }
  return 'nothing matched';
}

export function documentsLine(report, docRequest) {
  const r = activeOf(report);
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true) : [];
  const requested = !!(docRequest && docRequest.status === 'requested' && !docRequest.receivedAt);
  if (!docs.length) return { line: 'Documents · none yet', canSendAgain: requested };
  return { line: `Documents · ${docs.length} read · ${whatMatched(r)}`, canSendAgain: false };
}

const FIELD = { Income: 'Income', Employer: 'Employer', 'Job title': 'Job title' };
export function comparisonRows(report) {
  const r = activeOf(report);
  const rows = r && Array.isArray(r.comparisons) ? r.comparisons : [];
  const v = r ? readVerification(r) : null;
  return rows.filter((c) => c && c.field).map((c) => {
    const isEmployer = /employer/i.test(String(c.field));
    const isIncome = /income/i.test(String(c.field));
    // The employer status is the recomputed one (lib/employerName.js), as everywhere else.
    const status = isEmployer && v ? (v.employerMatched ? 'match' : v.employerMismatch ? 'mismatch' : (c.status === 'match' || c.status === 'mismatch' ? 'close' : c.status)) : c.status;
    const docs = isIncome ? (c.explanation || c.found || 'not on documents') : (c.found == null || c.found === '' ? 'not on documents' : String(c.found));
    const said = c.stated == null || c.stated === '' ? 'not given' : String(c.stated);
    const also = [...(Array.isArray(c.alsoSeen) ? c.alsoSeen : []), ...(c.since ? [c.since] : [])];
    return { key: String(c.field), field: FIELD[c.field] || String(c.field), said, docs, status, also };
  });
}
