// lib/editedAfter.js
// The tenant edited their profile after the active document report: profile_updated_at later
// than the report's analyzedAt. A confirmation counts after such an edit only when it is dated
// after the edit (the realtor re checked). Pure; shared by lib/applicantState.js and lib/fitScore.js.
const ts = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
export function editedAfterReport(application, report) {
  const e = ts(application && application.profile_updated_at); const a = ts(report && report.analyzedAt);
  return e != null && a != null && e > a ? application.profile_updated_at : null;
}
export function confirmationCounts(entry, editedAt) {
  if (!entry) return false;
  if (!editedAt) return true;
  const c = ts(entry.at); return c != null && c > ts(editedAt);
}
