// lib/listingStateLine.js
// The one line that says what state a listing's applicants are in, from lib/applicantState.js,
// in a fixed order of mention with only the non zero counts:
//   "{n} verified · {n} docs match · {n} to check · {n} waiting on documents · {n} no documents"
// Sent applicants (included in a sent report) are counted at the end as "{n} sent". Pure.
//   stateCounts(applicants)           -> { verified, matched, check, waiting, none, sent }
//   stateLine(applicants)             -> the line, or '' when nothing is active
//   listingStateLine(listing, apps)   -> the dashboard card's line, applicants then the report:
//     "2 applicants · 1 verified · report not sent" / "... · report sent Sep 1" /
//     "no applicants yet" plus " · invite live" only when the listing has an invite link
//     A rented or closed listing: "Rented · Sep 4 · Priya" (the winner's first name when the
//     unit went to an applicant on the listing) or "Rented · Sep 4" / "Closed · Sep 4".
import { applicantState } from './applicantState.js';
import { isWithdrawn, isSetAside } from './listingApplicantsVocabulary.js';
import { listingOpen } from './listingState.js';

const ORDER = [['verified', 'verified'], ['matched', 'docs match'], ['check', 'to check'], ['waiting', 'waiting on documents'], ['none', 'no documents'], ['sent', 'sent']];

export function activeOf(applicants) {
  return (applicants || []).filter((a) => a && !isWithdrawn(a) && !isSetAside(a));
}

export function stateCounts(applicants) {
  const c = { verified: 0, matched: 0, check: 0, waiting: 0, none: 0, sent: 0 };
  for (const a of activeOf(applicants)) {
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

export function stateLine(applicants) {
  const c = stateCounts(applicants);
  return ORDER.filter(([k]) => c[k] > 0).map(([k, label]) => `${c[k]} ${label}`).join(' · ');
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

export function listingStateLine(listing, applicants) {
  if (listing && !listingOpen(listing)) {
    const word = listing.status === 'closed' ? 'Closed' : 'Rented';
    const when = listing.closed_at ? ` · ${shortDate(listing.closed_at)}` : '';
    const winner = listing.rented_link_id ? (applicants || []).find((a) => a && (a.linkId || a.id) === listing.rented_link_id) : null;
    const firstName = winner ? String(winner.application?.full_name || '').trim().split(/\s+/)[0] : '';
    return `${word}${when}${firstName ? ` · ${firstName}` : ''}`;
  }
  const live = (applicants || []).filter((a) => a && !isWithdrawn(a));
  if (!live.length) return `no applicants yet${listing && (listing.invite_token || listing.invite_url) ? ' · invite live' : ''}`;
  const parts = [`${live.length} applicant${live.length === 1 ? '' : 's'}`];
  const states = stateLine(live);
  if (states) parts.push(states);
  const sentAt = live.map((a) => a.lastSentAt || a.last_sent_at || null).filter(Boolean).sort().pop();
  parts.push(sentAt ? `report sent ${shortDate(sentAt)}` : 'report not sent');
  return parts.join(' · ');
}
