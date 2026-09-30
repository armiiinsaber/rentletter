// lib/listingStateLine.js
// The one line that says what state a listing's applicants are in, from lib/applicantState.js,
// in a fixed order of mention with only the non zero counts:
//   "{n} verified · {n} docs match · {n} to check · {n} waiting on documents · {n} no documents"
// Sent applicants (included in a sent report) are counted at the end as "{n} sent". Pure.
//   stateCounts(applicants)           -> { verified, matched, check, waiting, none, sent }
//   stateLine(applicants)             -> the line, or '' when nothing is active
//   listingStateLine(listing, apps)   -> the dashboard card's line: the count, the two most urgent
//     non zero states, then the report: "6 applicants · 1 to check · 1 waiting on documents · report not sent" / "... · report sent Sep 1" /
//     "no applicants yet" plus " · invite live" only when the listing has an invite link
//     A rented or closed listing: "Rented · Sep 4 · Priya" (the winner's first name when the
//     unit went to an applicant on the listing) or "Rented · Sep 4" / "Closed · Sep 4".
import { applicantState, processState, STATE_LABELS } from './applicantState.js';
import { isWithdrawn, isSetAside } from './listingApplicantsVocabulary.js';
import { listingOpen } from './listingState.js';
import { listingStanding, APPLICATION_STATE } from './application-state.js';

// The count words come from the one label map (lib/applicantState.js STATE_LABELS.*.count).
const ORDER = [['verified', STATE_LABELS.verified.count], ['matched', STATE_LABELS.matched.count], ['check', STATE_LABELS.checked.count], ['waiting', STATE_LABELS.requested.count], ['none', STATE_LABELS.new.count], ['sent', STATE_LABELS.sent.count], ['lookedAgain', STATE_LABELS.reconsidered.count], ['notSelected', STATE_LABELS.not_selected.count]];

export function activeOf(applicants) {
  return (applicants || []).filter((a) => a && !isWithdrawn(a) && !isSetAside(a));
}

export function stateCounts(applicants) {
  const c = { verified: 0, matched: 0, check: 0, waiting: 0, none: 0, sent: 0, lookedAgain: 0, notSelected: 0 };
  for (const a of activeOf(applicants)) {
    // Told no, or looked at again: where they stand on the listing is what is counted.
    const p = processState(a);
    if (p === APPLICATION_STATE.RECONSIDERED) { c.lookedAgain++; continue; }
    if (p === APPLICATION_STATE.NOT_SELECTED) { c.notSelected++; continue; }
    const s = applicantState({ junction: a, verification: a.docVerifications?.[0] || null }).state;
    if (s === 'verified') c.verified++;
    else if (s === 'matched') c.matched++;
    else if (s === 'checked' || s === 'mismatch' || s === 'edited') c.check++;
    else if (s === 'requested') c.waiting++;
    else if (s === 'new') c.none++;
    else if (s === 'sent') c.sent++;
  }
  return c;
}

// The facts that need the realtor's own action, most pressing first: something to check, no
// documents asked for yet, documents that match and wait for the employer check. On a card, the
// first of these present is the one filled pill (components/ui.js StatusPills); with none of
// them, "report not sent" is.
const ACTION_ORDER = ['check', 'none', 'matched'];

// Every non zero state as a pill: [{ text, action }] (the listing header card).
export function statePills(applicants) {
  const c = stateCounts(applicants);
  const shown = ORDER.filter(([k]) => c[k] > 0);
  const act = ACTION_ORDER.find((k) => shown.some(([s]) => s === k));
  return shown.map(([k, label]) => ({ text: `${c[k]} ${label}`, action: k === act }));
}
export function stateLine(applicants) {
  return statePills(applicants).map((p) => p.text).join(' · ');
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

// The dashboard card's facts keep the two most urgent non zero states so they hold two rows at
// 390 with six applicants; the listing page shows every state through statePills. As pills:
// [{ text, action }], at most one action (ACTION_ORDER, else "report not sent").
export function listingStatePills(listing, applicants, { maxStates = 2 } = {}) {
  if (listing && !listingOpen(listing)) {
    const standing = listingStanding(listing);
    const winner = standing.rentedLinkId ? (applicants || []).find((a) => a && (a.linkId || a.id) === standing.rentedLinkId) : null;
    const firstName = winner ? String(winner.application?.full_name || '').trim().split(/\s+/)[0] : '';
    return [standing.withdrawn ? 'Closed' : 'Rented', standing.closedAt ? shortDate(standing.closedAt) : null, firstName || null].filter(Boolean).map((text) => ({ text, action: false }));
  }
  const live = (applicants || []).filter((a) => a && !isWithdrawn(a));
  if (!live.length) return [{ text: 'no applicants yet', action: false }, listing && (listing.invite_token || listing.invite_url) ? { text: 'invite live', action: false } : null].filter(Boolean);
  const out = [{ text: `${live.length} applicant${live.length === 1 ? '' : 's'}`, action: false }];
  const c = stateCounts(live);
  const shown = ORDER.filter(([k]) => c[k] > 0).slice(0, maxStates);
  const act = ACTION_ORDER.find((k) => shown.some(([s]) => s === k));
  for (const [k, label] of shown) out.push({ text: `${c[k]} ${label}`, action: k === act });
  const sentAt = live.map((a) => a.lastSentAt || a.last_sent_at || null).filter(Boolean).sort().pop();
  out.push(sentAt ? { text: `report sent ${shortDate(sentAt)}`, action: false } : { text: 'report not sent', action: !act });
  return out;
}
// The same facts as one line of text, for the places that read text (the bell, the tests).
export function listingStateLine(listing, applicants, opts) {
  return listingStatePills(listing, applicants, opts).map((p) => p.text).join(' · ');
}
