// lib/noticed.js
// "Rentletter noticed" — LAYER 1 of the assistant. Deterministic rules over data the dashboard
// has ALREADY loaded; zero AI calls. Every card states one true thing and offers one action the
// realtor could take in the UI anyway. Nothing here ranks, recommends, or compares tenants —
// cards are about PROCESS state (unverified, undecided, unsent, unconsented), never about who
// to pick. ISOMORPHIC (no fs/env).
//
// computeNotices(input) → up to 3 cards, most urgent first. Input (all optional):
//   scope            'home' | 'listing'
//   listings         [{ id, name, address, landlord_email, landlord_name }]
//   applicantsByListing { [listingId]: dashboard applicants (linkId, decisionStatus,
//                      docVerifications [active] , decisionChangedAt, application{...}) }
//   notifications    items from /api/notifications ({ type, listingId, listingName, unread, ts })
//   referralsSent    [{ status, to{name}, createdAt, from{listingId, linkId}, applicantName }]
//   referralsInbox   items from /api/referrals/inbox ({ status, assignedListingId, applicant{name} })
//   profile          { logo_url, brand_color, full_name }
//   now              Date (injectable for tests)
import { editedAfterVerification } from './profileEdits';
import { activeReport } from './docVerifications';

const DAY = 86400000;
const norm = (s) => String(s || '').toLowerCase();
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'this applicant';
const ago = (iso, now) => Math.floor((now - new Date(iso).getTime()) / DAY);
const isVerified = (a) => { const r = activeReport(a?.docVerifications); return !!r && Array.isArray(r.documents) && r.documents.some((d) => d && d.unrecognized !== true) && r.nameMatch !== 'mismatch' && r.nameMatch !== 'unclear'; };
const byScore = (a, b) => (b.application?.scorecard?.overall ?? 0) - (a.application?.scorecard?.overall ?? 0);

// Rules return [] or one or more cards. Urgency: 5 = act today … 1 = nice to have.
const RULES = [
  // New applications since the realtor last looked (derived from the notifications feed).
  function newSinceLastVisit({ notifications, listings, scope }) {
    const unread = (notifications || []).filter((n) => n.type === 'new' && n.unread);
    const per = new Map();
    for (const n of unread) { const k = n.listingId; per.set(k, (per.get(k) || { n: 0, name: n.listingName, listingId: k })); per.get(k).n += 1; }
    return [...per.values()].map((g) => ({
      id: `new:${g.listingId}:${g.n}`, urgency: 4, kind: 'new', listingId: g.listingId,
      title: `${g.n} new application${g.n === 1 ? '' : 's'} on ${g.name || 'a listing'}`,
      detail: 'Since you last looked.',
      action: scope === 'listing' ? null : { label: 'Review', type: 'navigate', href: `/landlord/${g.listingId}` },
    }));
  },
  // Top-ranked applicant on a listing has no document verification yet.
  function topUnverified({ applicantsByListing, listings }) {
    const out = [];
    for (const l of listings || []) {
      const active = (applicantsByListing?.[l.id] || []).filter((a) => norm(a.decisionStatus) === 'ranked' || norm(a.decisionStatus) === 'none' || !a.decisionStatus).sort(byScore);
      const top = active[0];
      if (!top || isVerified(top) || active.length < 2) continue;
      const name = top.application?.full_name;
      out.push({ id: `unverified:${top.linkId}`, urgency: 3, kind: 'verify', listingId: l.id, linkId: top.linkId,
        title: `${name || 'Your top-ranked applicant'} is ranked first on ${l.name || 'this listing'} but not verified`,
        detail: 'Documents confirm income and employer before anything goes to the landlord.',
        action: { label: 'Request documents', type: 'event', event: 'request-docs', linkId: top.linkId, listingId: l.id } });
    }
    return out;
  },
  // Profile edited after the documents were verified (the existing marker).
  function editedAfterDocs({ applicantsByListing, listings }) {
    const out = [];
    for (const l of listings || []) for (const a of applicantsByListing?.[l.id] || []) {
      if (norm(a.decisionStatus) === 'withdrawn') continue;
      const e = editedAfterVerification(a.application, a.docVerifications);
      if (!e.edited) continue;
      out.push({ id: `edited:${a.linkId}:${e.editedAt}`, urgency: 4, kind: 'reverify', listingId: l.id, linkId: a.linkId,
        title: `${a.application?.full_name || 'An applicant'} updated their profile after their documents were verified`,
        detail: 'The verified facts may no longer match. Re-request if income or employer matters here.',
        action: { label: 'Re-request documents', type: 'event', event: 'request-docs', linkId: a.linkId, listingId: l.id, renew: true } });
    }
    return out;
  },
  // A verified finalist has sat without a decision for a while.
  function finalistStalled({ applicantsByListing, listings, now }) {
    const out = [];
    for (const l of listings || []) for (const a of applicantsByListing?.[l.id] || []) {
      if (norm(a.decisionStatus) !== 'ranked' && a.decisionStatus) continue;
      const r = activeReport(a.docVerifications); if (!isVerified(a) || !r?.analyzedAt) continue;
      const days = ago(r.analyzedAt, now); if (days < 5) continue;
      out.push({ id: `stalled:${a.linkId}:${Math.floor(days / 7)}`, urgency: 3, kind: 'stalled', listingId: l.id, linkId: a.linkId,
        title: `${first(a.application?.full_name)} has been verified for ${days} days with no next step`,
        detail: `Present ${l.landlord_name ? l.landlord_name : 'the landlord'} a shortlist, or set them aside with a reason.`,
        action: { label: 'Open listing', type: 'navigate', href: `/landlord/${l.id}#report` } });
    }
    return out;
  },
  // Enough applicants, at least one verified, landlord on file → ready to present.
  function readyToPresent({ applicantsByListing, listings, scope }) {
    const out = [];
    for (const l of listings || []) {
      const apps = (applicantsByListing?.[l.id] || []).filter((a) => norm(a.decisionStatus) !== 'withdrawn');
      const active = apps.filter((a) => norm(a.decisionStatus) === 'ranked' || !a.decisionStatus);
      if (active.length < 3 || !apps.some(isVerified) || !l.landlord_email) continue;
      out.push({ id: `present:${l.id}:${active.length}`, urgency: 2, kind: 'present', listingId: l.id,
        title: `Ready to send ${l.landlord_name || l.landlord_email} a shortlist for ${l.name || 'this listing'}?`,
        detail: `${active.length} ranked applicants, ${apps.filter(isVerified).length} verified.`,
        action: scope === 'listing' ? { label: 'Email the report', type: 'event', event: 'send-report', listingId: l.id } : { label: 'Open listing', type: 'navigate', href: `/landlord/${l.id}#report` } });
    }
    return out;
  },
  // Referrals: waiting on consent, or received but not assigned.
  function referrals({ referralsSent, referralsInbox, now, listings }) {
    const out = [];
    for (const r of referralsSent || []) {
      if (r.status !== 'pending' || ago(r.createdAt, now) < 2) continue;
      out.push({ id: `refwait:${r.id}`, urgency: 1, kind: 'referral', listingId: r.from?.listingId,
        title: `${r.applicantName || 'An applicant'} hasn’t answered the referral to ${r.to?.name || 'your colleague'} yet`, detail: `Sent ${ago(r.createdAt, now)} days ago. Consent links expire after 7.`, action: null });
    }
    for (const r of referralsInbox || []) {
      if (r.status !== 'approved' || r.assignedListingId || !r.applicant) continue;
      out.push({ id: `refin:${r.id}`, urgency: 3, kind: 'referral', listingId: null,
        title: `${r.applicant.name || 'A referred applicant'} was referred to you by ${r.from?.name || 'a colleague'} and isn’t on a listing yet`,
        detail: 'Assign them to a listing to rank them against that unit.', action: { label: 'Assign', type: 'navigate', href: '/landlord#referrals' } });
    }
    return out;
  },
  // Branding would appear on a landlord report but isn't set up.
  function brandingIncomplete({ profile, listings, applicantsByListing }) {
    if (!profile) return [];
    const missing = [!profile.logo_url && 'logo', !profile.brand_color && 'brand colour'].filter(Boolean);
    if (!missing.length) return [];
    const wouldReport = (listings || []).some((l) => l.landlord_email && (applicantsByListing?.[l.id] || []).length > 0);
    if (!wouldReport) return [];
    return [{ id: `brand:${missing.join('-')}`, urgency: 1, kind: 'brand', listingId: null,
      title: `Your landlord reports will go out without a ${missing.join(' or ')}`,
      detail: 'Reports are co-branded — add yours once and every report carries it.',
      action: { label: 'Set up branding', type: 'navigate', href: '/profile' } }];
  },
];

export function computeNotices(input) {
  const ctx = { ...input, now: input?.now ? new Date(input.now).getTime() : Date.now() };
  let cards = [];
  for (const rule of RULES) { try { cards.push(...(rule(ctx) || [])); } catch (e) { /* a broken rule never breaks the page */ } }
  const dismissed = new Set(input?.dismissed || []);
  cards = cards.filter((c) => !dismissed.has(c.id));
  cards.sort((a, b) => b.urgency - a.urgency);
  return cards.slice(0, 3);
}

// Dismissals live in localStorage for 3 days (ids carry a state salt, so a card that changes
// — a new count, a new edit — comes back on its own).
const LS = 'rl_noticed_dismissed';
export function readDismissed() {
  try { const m = JSON.parse(localStorage.getItem(LS) || '{}'); const cutoff = Date.now() - 3 * DAY; return Object.keys(m).filter((k) => m[k] > cutoff); } catch (e) { return []; }
}
export function dismissNotice(id) {
  try { const m = JSON.parse(localStorage.getItem(LS) || '{}'); m[id] = Date.now(); localStorage.setItem(LS, JSON.stringify(m)); } catch (e) { /* ignore */ }
}

// ── LAYER 3 helpers: plain-language narration, deterministic ─────────────────────────────
// One sentence for an applicant list. Only screenable, already-displayed facts; no ranking
// language beyond what the list itself shows.
export function narrateApplicants(listing, applicants) {
  const apps = (applicants || []).filter((a) => norm(a.decisionStatus) !== 'withdrawn');
  const active = apps.filter((a) => norm(a.decisionStatus) === 'ranked' || !a.decisionStatus);
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

