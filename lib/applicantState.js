// lib/applicantState.js
// Where an applicant is in the process, derived from what is already stored or attached. Pure.
//
//   applicantState({ application, junction, verification, listing }) -> { state, since }
//
//   junction      the dashboard applicant object (decisionStatus, withdrawnAt, decisionChangedAt,
//                 docRequest) or a raw listing_applicants row (decision_status, withdrawn_at)
//   verification  the ACTIVE document report (docVerifications[0]); an array is accepted
//
// States, in priority order:
//   set_aside   the realtor set them aside, or they withdrew
//   sent        included in a landlord report that was sent (listing_applicants.last_sent_at,
//               db/screening.sql, set by pages/api/listings/send-report.js)
//   verified    the realtor confirmed the employer (confirmations.employer, db/screening.sql)
//   mismatch    a report exists and the name on the documents did not match, or was unclear,
//               and the realtor has not confirmed ID
//   matched     a report exists and the documents matched the stated income
//   checked     a report exists, the name matched, nothing matched
//   requested   documents were requested and no report exists yet
//   new         none of the above
import { readVerification } from './fitScore.js';
import { DECISION_STATUS } from './listingApplicantsVocabulary.js';

export const APPLICANT_STATES = Object.freeze(['set_aside', 'sent', 'verified', 'mismatch', 'matched', 'checked', 'requested', 'new']);

export function applicantState({ junction, verification } = {}) {
  const j = junction || {};
  const withdrawnAt = j.withdrawnAt ?? j.withdrawn_at ?? null;
  if (withdrawnAt) return { state: 'set_aside', since: withdrawnAt };
  const decision = j.decisionStatus ?? j.decision_status ?? null;
  if (decision === DECISION_STATUS.REJECT) return { state: 'set_aside', since: j.decisionChangedAt ?? j.decision_changed_at ?? null };
  const lastSentAt = j.lastSentAt ?? j.last_sent_at ?? null;
  if (lastSentAt) return { state: 'sent', since: lastSentAt };
  const conf = j.confirmations && typeof j.confirmations === 'object' ? j.confirmations : {};
  if (conf.employer) return { state: 'verified', since: conf.employer.at || null };

  const report = Array.isArray(verification) ? verification[0] : verification;
  const v = readVerification(report, { ignoreName: !!conf.id });
  const analyzedAt = report && report.analyzedAt ? report.analyzedAt : null;
  if (v.state === 'mismatch' || v.state === 'unclear') return { state: 'mismatch', since: analyzedAt };
  if (v.state === 'ok') return { state: v.incomeMatched ? 'matched' : 'checked', since: analyzedAt };

  const req = j.docRequest || null;
  if (req && req.status === 'requested') return { state: 'requested', since: req.requestedAt || null };
  return { state: 'new', since: null };
}
