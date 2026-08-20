// lib/profileEdits.js
// ISOMORPHIC. "Edited after verification": the tenant updated their profile AFTER the active
// document verification was run, so the verified facts may no longer match what's on the
// application. A caution, not an error — the applicant did nothing wrong; the realtor may
// want to re-request documents if the edited facts matter (income, employer).
//
//   application.profile_updated_at  ← mirrored from the KV record's updatedAt (db/profile-edits.sql)
//   active report.analyzedAt        ← lib/applicantAnalysis run timestamp
import { activeReport } from './docVerifications';

// docVerifications: the display array the dashboard holds ([active] or []), OR the raw jsonb.
export function editedAfterVerification(application, docVerifications) {
  const editedAt = application?.profile_updated_at || null;
  const report = Array.isArray(docVerifications) && docVerifications.length && !('active' in (docVerifications[0] || {}))
    ? docVerifications[docVerifications.length - 1]
    : activeReport(docVerifications);
  const verifiedAt = report?.analyzedAt || null;
  if (!editedAt || !verifiedAt) return { edited: false, editedAt, verifiedAt };
  const e = new Date(editedAt).getTime(), v = new Date(verifiedAt).getTime();
  if (!Number.isFinite(e) || !Number.isFinite(v)) return { edited: false, editedAt, verifiedAt };
  return { edited: e > v, editedAt, verifiedAt };
}

export function fmtShort(iso) {
  try { return new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
}
