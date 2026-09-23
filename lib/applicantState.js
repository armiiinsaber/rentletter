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
//   edited      the tenant edited their profile after the active report was analyzed
//               (application.profile_updated_at later than analyzedAt) and the realtor has not
//               confirmed the employer since; a confirmation dated after the edit clears it
//   verified    the realtor confirmed the employer (confirmations.employer, db/screening.sql)
//   mismatch    a report exists and the name on the documents did not match, or was unclear,
//               and the realtor has not confirmed ID
//   matched     a report exists and the documents matched the stated income, or came within 15%
//               (a close status is not a contradiction, lib/fitScore.js label rule)
//   checked     a report exists, the name matched, nothing matched
//   requested   documents were requested and no report exists yet
//   new         none of the above
import { readVerification } from './fitScore.js';
import { editedAfterReport, confirmationCounts } from './editedAfter.js';
import { applicantStanding, listingStanding, APPLICATION_STATE, RECONSIDER_REASON } from './application-state.js';

export const APPLICANT_STATES = Object.freeze(['set_aside', 'sent', 'edited', 'verified', 'mismatch', 'matched', 'checked', 'requested', 'new']);
// Where an applicant stands on the listing, beside what their documents say (processState below).
export const PROCESS_STATES = Object.freeze([APPLICATION_STATE.NOT_SELECTED, APPLICATION_STATE.RECONSIDERED]);

// The one label map lives in lib/stateLabels.js (no imports there, so lib/fitScore.js can read it too).
export { STATE_LABELS, stateLabel } from './stateLabels.js';
import { stateLabel as labelFor } from './stateLabels.js';

export function applicantState({ junction, verification } = {}) {
  const j = junction || {};
  // Where the row stands comes from lib/application-state.js (the state, then the old columns).
  const standing = applicantStanding(j);
  if (standing.withdrawn) return { state: 'set_aside', since: standing.withdrawnSince };
  if (standing.setAside) return { state: 'set_aside', since: standing.changedAt };
  const lastSentAt = j.lastSentAt ?? j.last_sent_at ?? null;
  if (lastSentAt) return { state: 'sent', since: lastSentAt };
  const conf = j.confirmations && typeof j.confirmations === 'object' ? j.confirmations : {};
  const report = Array.isArray(verification) ? verification[0] : verification;
  const editedAt = editedAfterReport(j.application || null, report);
  const employerCounts = confirmationCounts(conf.employer, editedAt);
  if (editedAt && !employerCounts) return { state: 'edited', since: editedAt };
  if (employerCounts) return { state: 'verified', since: conf.employer.at || null };

  const v = readVerification(report, { ignoreName: confirmationCounts(conf.id, editedAt) });
  const analyzedAt = report && report.analyzedAt ? report.analyzedAt : null;
  if (v.state === 'mismatch' || v.state === 'unclear') return { state: 'mismatch', since: analyzedAt };
  if (v.state === 'ok') return { state: v.incomeMatched || v.incomeClose ? 'matched' : 'checked', since: analyzedAt };

  const req = j.docRequest || null;
  if (req && req.status === 'requested') return { state: 'requested', since: req.requestedAt || null };
  return { state: 'new', since: null };
}

// Where the applicant stands on the listing, when that is the thing to say: told no, or looked at
// again. null for everyone else, whose card keeps saying what their documents say. Read from the
// stored state only (lib/application-state.js applicantStanding), so a row with no state column
// reads as it always did.
export function processState(junction) {
  const st = applicantStanding(junction || {});
  if (!st.stored || st.withdrawn || st.setAside) return null;
  return PROCESS_STATES.includes(st.state) ? st.state : null;
}

// The Reconsider pill shows for someone told no, and only while the listing is live (the server's
// guard, lib/application-state.js TRANSITION_GUARDS, allows the move then and only then).
export const offersReconsider = (applicant, listing) => processState(applicant) === APPLICATION_STATE.NOT_SELECTED && listingStanding(listing).open;
// Shortlist shows for someone looked at again: their one way on (never the winner directly).
export const offersShortlist = (applicant) => processState(applicant) === APPLICATION_STATE.RECONSIDERED;

// ── Reconsider: every string the card, the sheet and the dead end show ──
export const RECONSIDER_REASON_LABELS = Object.freeze({
  [RECONSIDER_REASON.WINNER_FELL_THROUGH]: 'The first choice fell through',
  [RECONSIDER_REASON.WINNER_WITHDREW]: 'The first choice withdrew',
  [RECONSIDER_REASON.LISTING_REOPENED]: 'The listing reopened',
});
export const RECONSIDER_COPY = Object.freeze({
  action: 'Reconsider',
  sheetTitle: 'Why look again?',
  confirm: 'Reconsider',
  undo: 'Undo',
  shortlist: 'Shortlist',
  deadEnd: 'Reconsider them first.',
  deadEndShortlist: 'Shortlist them first.',
  emailNotSent: 'Email not sent',
});
// The card's state line for someone looked at again: the reason, lower case after the dot.
// Without a known reason (a card loaded fresh: the reason lives in application_events) the line is
// the state word alone, never a line that ends on its separator.
export const reconsideredLine = (reason) => (RECONSIDER_REASON_LABELS[reason]
  ? labelFor(APPLICATION_STATE.RECONSIDERED, 'line', { reason: RECONSIDER_REASON_LABELS[reason].replace(/^./, (c) => c.toLowerCase()) })
  : labelFor(APPLICATION_STATE.RECONSIDERED, 'line', { reason: '' }).replace(/\s*·\s*$/, ''));

// The re invite (lib/reconsiderInvite.js). Neutral: nothing about why they were not chosen.
export const RECONSIDER_EMAIL = Object.freeze({
  subject: '{address}: still interested?',
  greeting: 'Hi {first},',
  greetingNoName: 'Hi,',
  lines: Object.freeze([
    'The unit at {address} is available again, and {realtor} would like to look at your application once more.',
    'If you are still interested, open your application below.',
  ]),
  expired: 'Your documents were removed after 14 days, so you may be asked to add them again.',
  button: 'Open my application',
  after: 'If not, there is nothing to do.',
  footer: 'Sent through Rentletter on behalf of {realtor}.',
});
