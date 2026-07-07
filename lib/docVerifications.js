// lib/docVerifications.js
// SERVER + CLIENT safe compatibility shim for the listing_applicants.doc_verifications jsonb.
//
// NEW canonical shape:
//   { active: <report|null>, archived: [ { id, report, ai_insight, archived_at, source } ] }
// OLD shape (pre-archive): a bare ARRAY of report objects — each analysis was appended, but only
// the LAST was ever displayed. normalizeDocV() upgrades EITHER shape in memory, so NO SQL
// migration is needed: old rows keep rendering exactly as before (the last run becomes `active`,
// any earlier runs become archived history so nothing is lost), and the first archive/delete or
// the next analysis persists the new object shape.
//
// A "report" here is the run object produced by lib/applicantAnalysis.runDocumentAnalysis
// (documents/comparisons/crossReference/nameMatch/…). This module never inspects its internals.

function makeArchiveId(report) {
  const seed = (report && report.analyzedAt) || Date.now();
  return `a_${String(seed).replace(/[^a-z0-9]/gi, '')}_${Math.random().toString(36).slice(2, 7)}`;
}

// Normalize whatever is stored → { active, archived }. Tolerates null / old-array / new-object.
export function normalizeDocV(raw) {
  if (!raw) return { active: null, archived: [] };
  if (Array.isArray(raw)) {
    if (!raw.length) return { active: null, archived: [] };
    const active = raw[raw.length - 1] || null;
    // Earlier array entries were never individually shown; keep them as archived history.
    const archived = raw.slice(0, -1).filter(Boolean).map((r) => ({
      id: makeArchiveId(r), report: r, ai_insight: null,
      archived_at: (r && r.analyzedAt) || null, source: (r && r.source) || 'realtor',
    }));
    return { active, archived };
  }
  if (typeof raw === 'object') {
    return { active: raw.active || null, archived: Array.isArray(raw.archived) ? raw.archived : [] };
  }
  return { active: null, archived: [] };
}

// The current report to display (the "active analysis"), or null.
export function activeReport(raw) { return normalizeDocV(raw).active; }
export function archivedList(raw) { return normalizeDocV(raw).archived; }
// Any analysis at all (active OR archived) — used for de-dup scoring of duplicate junction rows.
export function hasAnyDocV(raw) { const n = normalizeDocV(raw); return !!n.active || n.archived.length > 0; }

// WRITE a fresh analysis as active, leaving archived[] intact. Returns the jsonb to persist.
export function withActiveReport(raw, report) {
  const n = normalizeDocV(raw);
  return { active: report || null, archived: n.archived };
}

// ARCHIVE the active report (with its insight) into archived[], clearing active.
export function withArchivedActive(raw, aiInsight) {
  const n = normalizeDocV(raw);
  if (!n.active) return { active: null, archived: n.archived };
  const entry = {
    id: makeArchiveId(n.active), report: n.active, ai_insight: aiInsight || null,
    archived_at: new Date().toISOString(), source: n.active.source || 'realtor',
  };
  return { active: null, archived: [entry, ...n.archived] }; // newest first
}

// DELETE the active report permanently. Archived history is NOT touched.
export function withoutActive(raw) {
  const n = normalizeDocV(raw);
  return { active: null, archived: n.archived };
}

// DELETE one archived entry by id. Active is NOT touched.
export function withoutArchived(raw, id) {
  const n = normalizeDocV(raw);
  return { active: n.active, archived: n.archived.filter((e) => e && e.id !== id) };
}
