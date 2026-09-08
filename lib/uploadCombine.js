// lib/uploadCombine.js  PURE. Assembles the combined analysis run from per file results, the
// same shape lib/applicantAnalysis.js runDocumentAnalysis produced for a batch, so the realtor
// facing report renders identically whoever uploaded and however many requests it took. Shared
// by pages/api/upload/finalize.js (tenant) and pages/api/applicants/finalize-analysis.js (realtor).
import { computeNameMatch } from './applicantAnalysis.js';
import { incomeComparison } from './incomeAnnualize.js';

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Cross-reference across documents (screenable facts only). Each file was read alone, so we derive
// consistency here from the extracted facts: a field is "consistent" if every document that states
// it agrees, otherwise a "discrepancy" (both values shown — factual, never an accusation). OHRC:
// only name / employer / income are ever compared.
function deriveCrossReference(documents) {
  const out = [];
  const stated = (field, onlyRecognized) => documents
    .filter((d) => d && (!onlyRecognized || d.unrecognized !== true))
    .map((d) => d.extracted && d.extracted[field])
    .filter((v) => v != null && String(v).trim());

  const names = stated('applicantName', true);
  if (names.length >= 2) {
    const same = names.every((n) => norm(n) === norm(names[0]));
    out.push({ field: 'Applicant name', status: same ? 'consistent' : 'discrepancy',
      detail: same ? `Name matches across ${names.length} documents.` : `Names differ across documents: ${[...new Set(names)].join(' vs ')}.` });
  }
  const employers = stated('employer', false);
  if (employers.length >= 2) {
    const same = employers.every((e) => norm(e) === norm(employers[0]));
    out.push({ field: 'Employer', status: same ? 'consistent' : 'discrepancy',
      detail: same ? `Employer matches across documents (${employers[0]}).` : `Employer differs across documents: ${[...new Set(employers)].join(' vs ')}.` });
  }
  return out;
}

// Merge each file's comparison-to-application into one per field. Drop not-found; surface the most
// informative status (a real mismatch or match beats "not found"). Keeps discrepancies realtor-side.
// Income is not merged: each file's income row was computed from that file alone, and the
// finalize recomputes it once over every staged pay document (incomeComparison below).
function mergeComparisons(items) {
  const rank = { mismatch: 3, close: 2, match: 1, not_found: 0 };
  const byField = {};
  for (const it of items) {
    for (const c of (it.comparisons || [])) {
      if (!c || !c.field || /income/i.test(String(c.field))) continue;
      const cur = byField[c.field];
      if (!cur || (rank[c.status] ?? 0) > (rank[cur.status] ?? 0)) byField[c.field] = c;
    }
  }
  return Object.values(byField);
}

function buildSummary(documents, comparisons, nameMatch) {
  if (!documents.length) return '';
  const n = documents.length;
  const parts = [`Read ${n} document${n === 1 ? '' : 's'}.`];
  const verified = comparisons.filter((c) => c.status === 'match').map((c) => c.field);
  const issues = comparisons.filter((c) => c.status === 'mismatch').map((c) => c.field);
  if (verified.length) parts.push(`${verified.join(', ')} verified against the application.`);
  if (issues.length) parts.push(`${issues.join(', ')} did not match the application, review the details.`);
  if (nameMatch === 'match') parts.push('Document name matches the applicant.');
  else if (nameMatch === 'mismatch') parts.push('Document name does not match the applicant.');
  return parts.join(' ').slice(0, 1200);
}

// Assemble the combined run in the exact shape runDocumentAnalysis produces for the realtor batch.
export function buildCombinedRun(items, applicantName, statedAnnual = null) {
  const sorted = [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const documents = sorted.map((it) => it.document).filter(Boolean);
  const documentNames = documents
    .filter((d) => d && d.unrecognized !== true)
    .map((d) => (d.extracted && d.extracted.applicantName) || null)
    .filter((n) => typeof n === 'string' && n.trim());
  const nameMatch = computeNameMatch(applicantName, documentNames); // 'match' | 'mismatch' | 'unclear'
  // EVERY STUB COUNTS: one income comparison over all staged pay documents (lib/incomeAnnualize.js).
  const comparisons = [...mergeComparisons(sorted), incomeComparison(documents, statedAnnual)];

  // Confidence: the most conservative across the documents.
  const order = { low: 0, medium: 1, high: 2 };
  let confidence = documents.length ? 'high' : 'low';
  for (const it of sorted) { if ((order[it.confidence] ?? 1) < (order[confidence] ?? 1)) confidence = it.confidence || 'medium'; }

  return {
    analyzedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
    crossReference: deriveCrossReference(documents),
    comparisons,
    overallSummary: buildSummary(documents, comparisons, nameMatch),
    confidence,
    nameMatch,
    documentNames,
    applicantName,
  };
}


// One staged entry per analyzed file (facts only, never bytes).
export function stagedItem(run, { index, name, size }) {
  return {
    index,
    filename: name,
    size,
    document: run.documents[0],
    comparisons: Array.isArray(run.comparisons) ? run.comparisons : [],
    documentName: (run.documentNames && run.documentNames[0]) || null,
    confidence: run.confidence || 'medium',
  };
}
export const PER_FILE_BYTES = 4 * 1024 * 1024; // decoded bytes per request, under Vercel's 4.5MB body cap
