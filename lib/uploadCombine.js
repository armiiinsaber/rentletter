// lib/uploadCombine.js  PURE. Assembles the combined analysis run from per file results, the
// same shape lib/applicantAnalysis.js runDocumentAnalysis produced for a batch, so the realtor
// facing report renders identically whoever uploaded and however many requests it took. Shared
// by pages/api/upload/finalize.js (tenant) and pages/api/applicants/finalize-analysis.js (realtor).
import { resolveNameMatch, authorityComparisons, crossReference } from './documentAuthority.js';

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
// stated: the application's screenableFacts (lib/applicantAnalysis.js), or a bare annual income.
export function buildCombinedRun(items, applicantName, stated = null) {
  const sorted = [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const documents = sorted.map((it) => it.document).filter(Boolean);
  const documentNames = documents
    .filter((d) => d && d.unrecognized !== true)
    .map((d) => (d.extracted && d.extracted.applicantName) || null)
    .filter((n) => typeof n === 'string' && n.trim());
  const nameMatch = resolveNameMatch(applicantName, documents); // 'match' | 'mismatch' | 'unclear'
  // EVERY COMPARISON IS RECOMPUTED HERE over all staged documents (lib/documentAuthority.js): the
  // per file rows are never merged, so a lone partial stub or a credit report's employer line
  // cannot outvote the letter. Income is annualized across every stub.
  const comparisons = authorityComparisons(documents, stated);

  // Confidence: the most conservative across the documents.
  const order = { low: 0, medium: 1, high: 2 };
  let confidence = documents.length ? 'high' : 'low';
  for (const it of sorted) { if ((order[it.confidence] ?? 1) < (order[confidence] ?? 1)) confidence = it.confidence || 'medium'; }

  return {
    analyzedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
    crossReference: crossReference(documents),
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
