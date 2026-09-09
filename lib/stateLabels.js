// lib/stateLabels.js  PURE, no imports. ONE LABEL MAP. Per state, the one wording each surface uses; no surface keeps its own string.
//   title   the Next list item (lib/actions.js)          line   the card's state line (ListingView)
//   count   the listing state line (lib/listingStateLine.js)   docs   the checklist's Identity Docs fact
//   reason  the report's reason line (lib/fitScore.js fitReason)
// null: that surface has nothing to say for the state. Templates: {first} {days} {who} {date} {reason}.
export const STATE_LABELS = Object.freeze({
  new: Object.freeze({ title: 'Request documents', line: 'No documents yet', count: 'no documents', docs: 'none', reason: 'no documents yet' }),
  requested: Object.freeze({ title: 'Waiting {days} days', line: 'Documents requested', count: 'waiting on documents', docs: 'none', reason: 'no documents yet' }),
  checked: Object.freeze({ title: 'Documents differ', line: 'Documents on file · nothing matched', count: 'to check', docs: 'name matches', reason: 'documents did not match' }),
  mismatch: Object.freeze({ title: 'Name did not match', line: 'Name on documents did not match', count: 'to check', docs: 'did not match', reason: 'documents did not match' }),
  edited: Object.freeze({ title: 'Edited after documents', line: 'Profile edited {date} · analyse again', count: 'to check', docs: 'name matches', reason: 'profile edited after documents' }),
  matched: Object.freeze({ title: 'Verify {first}', line: null, count: 'docs match', docs: 'name matches', reason: 'employer not confirmed' }),
  verified: Object.freeze({ title: null, line: 'Verified by {who}', count: 'verified', docs: 'name matches', reason: null }),
  sent: Object.freeze({ title: null, line: 'Sent to landlord', count: 'sent', docs: 'name matches', reason: null }),
  set_aside: Object.freeze({ title: null, line: '{reason}', count: null, docs: 'name matches', reason: null }),
});
// stateLabel('requested', 'title', { days: 4 }) -> 'Waiting 4 days'
export function stateLabel(state, surface, vars = {}) {
  const t = STATE_LABELS[state] && STATE_LABELS[state][surface];
  if (t == null) return null;
  return String(t).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k]))).replace(/\s{2,}/g, ' ').trim();
}
