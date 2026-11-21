// components/dashboard/homeData.js  PURE, browser and tests.
// What the dashboard's desktop shell shows, counted from what the dashboard already loads: the
// listings, the signals (the applicants on each listing, the Pipeline people), the profiles shared
// with the realtor (components/dashboard/SharedWithMe.js) and the Circle count
// (components/dashboard/MainNav.js useCirclePending). No request of its own.
//   standingOf(open, byListing)       -> { listings, applicants, toSend } the three numbers
//   rowOf(listing, applicants)        -> one row of the listings table
//   needsYouItems({ ... })            -> the Needs you column, newest first
//   relTime(iso, now)                 -> "2 days ago", "Today", "In 3 days"
import { buildActions } from '../../lib/actions.js';
import { isWithdrawn } from '../../lib/listingApplicantsVocabulary.js';
import { stateCounts } from '../../lib/listingStateLine.js';
import { listingOpen } from '../../lib/listingState.js';
import { displayLabel } from '../../lib/listingAddress.js';
import { formatUnit } from '../../lib/unitType.js';

const DAY = 86400000;
const live = (apps) => (apps || []).filter((a) => a && !isWithdrawn(a));
const sentOf = (apps) => live(apps).map((a) => a.lastSentAt || a.last_sent_at || null).filter(Boolean).sort().pop() || null;

// The three numbers: the listings that take applications, the applicants on them, and the
// listings with applicants whose report has not gone yet.
export function standingOf(open, byListing) {
  let applicants = 0, toSend = 0;
  for (const l of open || []) {
    const apps = live((byListing || {})[l.id]);
    applicants += apps.length;
    if (apps.length && !sentOf(apps)) toSend++;
  }
  return { listings: (open || []).length, applicants, toSend };
}

// The newest moment anything happened on a listing: an applicant applied, was decided on, was
// reviewed, or a report went; else the day the listing was made.
const stamps = (a) => [a.createdAt, a.created_at, a.application && a.application.created_at, a.lastSentAt, a.last_sent_at, a.decisionChangedAt, a.reviewedAt];
export function lastActivity(listing, apps) {
  const all = [listing && listing.updated_at, listing && listing.created_at];
  for (const a of apps || []) if (a) all.push(...stamps(a));
  return all.filter(Boolean).map(String).sort().pop() || null;
}

export function rowOf(listing, applicants) {
  const apps = live(applicants);
  const counts = stateCounts(apps);
  const sent = sentOf(apps);
  const open = listingOpen(listing);
  return {
    id: listing.id,
    label: displayLabel(listing, 'Untitled listing'),
    rent: listing.monthly_rent ? Number(listing.monthly_rent) : null,
    beds: formatUnit(listing.bedrooms) || '',
    applicants: apps.length,
    verified: counts.verified,
    // The report's standing, a status word: sent on a date, not sent while there are applicants,
    // nothing yet without them; a rented or closed listing says so.
    report: !open ? 'closed' : sent ? 'sent' : apps.length ? 'not_sent' : 'none',
    sentAt: sent,
    lastAt: lastActivity(listing, applicants),
    open,
  };
}

// A relative time, from the client's clock (the caller passes it after mount, so the server's
// render and the first client render agree).
export function relTime(iso, now) {
  if (!iso || now == null) return '';
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return '';
  const startOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOf(t) - startOf(now)) / DAY);
  if (days === 0) {
    const mins = Math.floor((now - t) / 60000);
    if (mins >= 0 && mins < 1) return 'Just now';
    if (mins > 0 && mins < 60) return `${mins} min ago`;
    if (mins >= 60) { const h = Math.floor(mins / 60); return `${h} hour${h === 1 ? '' : 's'} ago`; }
    return 'Today';
  }
  if (days === -1) return 'Yesterday';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return -days < 30 ? `${-days} days ago` : new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return `In ${days} days`;
}

const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const HOLD_SOON_DAYS = 7;

// The Needs you column: the next things this realtor should do, newest first. From the applicants
// on each listing (lib/actions.js buildActions: documents to ask for or check, an applicant to
// verify or nudge, a report ready to send, a landlord who answered), the Pipeline (a person to
// invite to a new listing, a hold that ends within a week), profiles shared with the realtor, and
// Circle requests waiting. Each: { key, title, detail, at, go: { kind, item?, view?, href? }, verb }.
export function needsYouItems({ listings = [], applicantsByListing = {}, people = [], shares = [], circlePending = 0, now = Date.now(), paths = null } = {}) {
  const out = [];
  // An applicant item with no moment of its own (a new applicant: nothing asked yet) is timed by
  // when they applied.
  const appliedAt = (it) => {
    const a = it.linkId ? ((applicantsByListing || {})[it.listingId] || []).find((x) => x && x.linkId === it.linkId) : null;
    return a ? (a.createdAt || a.created_at || (a.application && a.application.created_at) || null) : null;
  };
  for (const it of buildActions({ listings, applicantsByListing, people, now })) {
    const pipeline = it.panel === 'people';
    out.push({
      key: it.key,
      title: pipeline ? 'Pipeline fits' : it.title,
      // The person and the listing, or for a listing level item the short why and the listing:
      // each its own line, so a long name and a long address each wrap on their own.
      detail: [it.name || it.reason, it.listingName].filter(Boolean).join(', '),
      lines: [it.name || it.reason, it.listingName].filter(Boolean),
      at: it.since || appliedAt(it),
      verb: it.verb || 'Open',
      go: pipeline ? { kind: 'view', view: 'pipeline' } : { kind: 'action', item: it },
    });
  }
  const t = new Date(now).getTime();
  for (const p of people || []) {
    if (!p || !p.expiresAt) continue;
    const left = new Date(p.expiresAt).getTime() - t;
    if (!(left > 0 && left <= HOLD_SOON_DAYS * DAY)) continue;
    out.push({ key: `hold:${p.id}`, title: p.status === 'pending' ? 'A Pipeline ask ends soon' : 'A Pipeline hold ends soon', detail: p.display || p.name || p.email || 'Someone', at: p.expiresAt, verb: 'Open', go: { kind: 'view', view: 'pipeline' }, ends: true });
  }
  for (const sh of shares || []) {
    if (!sh || sh.ended) continue;
    out.push({ key: `shared:${sh.id}`, title: 'A profile shared with you', detail: sh.listingName || 'A unit', at: sh.sharedAt || null, verb: 'View', go: { kind: 'view', view: 'shared' } });
  }
  const n = Number(circlePending) || 0;
  if (n > 0) out.push({ key: 'circle', title: n === 1 ? 'A Circle request' : `${n} Circle requests`, detail: 'Waiting for your answer', at: null, verb: 'Open', go: { kind: 'href', href: (paths && paths.circle) || '/circle' } });
  // Newest first; a hold that ends sits by the day it ends, so the soonest is near the top.
  out.sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0) || String(b.at || '').localeCompare(String(a.at || '')) || a.key.localeCompare(b.key));
  return out.map((x) => ({ ...x, first: first(x.detail) }));
}
