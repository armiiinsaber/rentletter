// lib/noticed.js
// "Rentletter noticed": a thin adapter over the assistant's action list (lib/actions.js). The
// dashboard's Noticed block and the assistant panel show the SAME items with the SAME copy; this
// module only reshapes them into the card shape the block renders. Nothing here ranks,
// recommends or compares tenants: every item is a process state. ISOMORPHIC (no fs/env).
//
// computeNotices(input) -> cards, most urgent first. Input (all optional):
//   scope               'home' | 'listing' (kept for callers; the items are the same)
//   listings            [{ id, name, address, landlord_email, landlord_name }]
//   applicantsByListing { [listingId]: dashboard applicants }
//   dismissed           { key: signature } from the assistant store (an item hides while unchanged)
//   now                 Date (injectable for tests)
import { compareFit } from './fitScore.js';
import { isActive, isWithdrawn } from './listingApplicantsVocabulary.js';
import { activeReport } from './docVerifications.js';
import { buildActions, visibleActions } from './actions.js';

export const isVerified = (a) => { const r = activeReport(a?.docVerifications); return !!r && Array.isArray(r.documents) && r.documents.some((d) => d && d.unrecognized !== true) && r.nameMatch !== 'mismatch' && r.nameMatch !== 'unclear'; };
export { compareFit as byScore };

// A card: the action item plus the navigate action the block renders. id is the item key.
export function toCard(item) {
  return { ...item, id: item.key, action: { label: item.verb, type: 'navigate', href: `/landlord/${item.listingId}?${item.linkId ? `applicant=${encodeURIComponent(item.linkId)}&` : ''}panel=${item.panel}` } };
}

export function computeNotices(input) {
  const items = buildActions({ listings: input?.listings || [], applicantsByListing: input?.applicantsByListing || {}, now: input?.now });
  return visibleActions(items, input?.dismissed).map(toCard);
}

// The newest timestamp among the facts the rules read: notification events, referral activity,
// document analyses. This is when the observation was made, in the only sense the data can
// support; the dashboard prefers the events timeline when the server provides latestEventAt.
export function latestSignalAt(input) {
  let best = 0;
  const take = (v) => { const t = typeof v === 'number' ? v : Date.parse(v || ''); if (Number.isFinite(t) && t > best) best = t; };
  for (const n of input?.notifications || []) take(n.ts);
  for (const r of input?.referralsSent || []) { take(r.createdAt); take(r.decidedAt); }
  for (const r of input?.referralsInbox || []) { take(r.approvedAt); take(r.assignedAt); take(r.createdAt); }
  for (const apps of Object.values(input?.applicantsByListing || {})) for (const a of apps || []) { take(activeReport(a?.docVerifications)?.analyzedAt); take(a?.decisionChangedAt); take(a?.application?.profile_updated_at); }
  return best ? new Date(best).toISOString() : null;
}

// "4 minutes ago", "3 hours ago", "2 days ago", then the date. Plain words, no ticker.
export function relativeTime(iso, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return `on ${new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
}

// ── LAYER 3 helpers: plain-language narration, deterministic ─────────────────────────────
// One sentence for an applicant list. Only screenable, already-displayed facts; no ranking
// language beyond what the list itself shows.
export function narrateApplicants(listing, applicants) {
  const apps = (applicants || []).filter((a) => !isWithdrawn(a));
  const active = apps.filter(isActive);
  if (!apps.length) return null;
  const parts = [`${active.length === 1 ? 'One application' : `${active.length} applications`}${apps.length > active.length ? ` (${apps.length - active.length} set aside)` : ''}.`];
  const min = Number(listing?.pref_min_annual_income) || 0;
  if (min) { const n = active.filter((a) => Number(a.application?.annual_income) >= min).length; parts.push(`${n === active.length ? 'All' : n === 0 ? 'None' : n} clear your stated income threshold.`); }
  const maxPct = Number(listing?.pref_rent_to_income_max_pct) || 0;
  if (maxPct) { const n = active.filter((a) => a.application?.rent_to_income_ratio != null && Number(a.application.rent_to_income_ratio) <= maxPct).length; parts.push(`${n} within your rent-to-income cap.`); }
  const v = apps.filter(isVerified).length;
  parts.push(v ? `${v} verified.` : 'None verified yet.');
  return parts.join(' ');
}

