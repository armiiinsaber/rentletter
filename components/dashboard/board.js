// components/dashboard/board.js  PURE, browser and tests.
// THE ONE SOURCE of every count and every next step the realtor dashboard shows: the status board's
// four tiles, each listing card's stage, next step and wait, the Needs you column, the sidebar's
// Listings count and the Needs attention first order all read boardOf. It calls the action list
// (lib/actions.js buildActions, the bell's own source) once, on the listings and the signals the
// dashboard already loads, and counts from its items, so no two places on the page can disagree.
//   boardOf({ listings, applicantsByListing, people, now })
//     -> { items, byId: { [listingId]: card }, tiles }
//        items  the action list, most urgent first (Needs you is built from these)
//        card   { stage, next, applicants, initials, link, dot } for one listing (cardOf below)
//        tiles  { toSend, toCheck, applicants, active, newThisWeek, withoutApplicants,
//                 oldestSend, oldestCheck }
//   cardOf(listing, applicants, items, now)  one listing's card, from the items of the same call
//   stageOf(listing, applicants)  the progress strip: { done: [6 booleans], current, rented, closed }
//   applicantFacts(applicant)     what is recorded for one applicant, stage by stage
//   waitWords(days)               "waiting 6 days", "waiting since today"
//   STAGES, STEPS
//
// THE STAGE. Six stages: Invited, Applied, Documents, Employer called, Report, Rented. Each says only
// what is recorded:
//   Invited          the listing has its apply link (invite_token or invite_url), or anyone applied
//                    through it. Rentletter does not record who the link was sent to.
//   Applied          an applicant still in the running: not withdrawn, not set aside, not told no.
//   Documents        that applicant's documents were read and matched the income they stated, or
//                    came within 15% (lib/applicantState.js 'matched', read with the employer
//                    confirmation and the report left out).
//   Employer called  the realtor tapped Called employer for them and it still counts: the tenant has
//                    not edited their profile since (lib/editedAfter.js confirmationCounts).
//   Report           they were in a report the realtor sent to the landlord (last_sent_at).
//   Rented           the listing is marked rented.
// The most advanced applicant decides: the one who reached the furthest stage (then the one with
// more stages done). Their facts colour Applied to Report; a stage they skipped stays pale (a report
// sent before anyone called the employer leaves Employer called pale). The current stage, red, is
// the one after the furthest done; a rented listing has every stage done and none current; a
// listing withdrawn from the market shows what was done and no current stage.
import { buildActions } from '../../lib/actions.js';
import { applicantState, processState } from '../../lib/applicantState.js';
import { APPLICATION_STATE, listingStanding } from '../../lib/application-state.js';
import { isWithdrawn, isSetAside } from '../../lib/listingApplicantsVocabulary.js';
import { editedAfterReport, confirmationCounts } from '../../lib/editedAfter.js';
import { listingOpen } from '../../lib/listingState.js';

export const STAGES = Object.freeze(['Invited', 'Applied', 'Documents', 'Employer called', 'Report', 'Rented']);
const DAY = 86400000;

// ── one applicant ──────────────────────────────────────────────────────────────────────────────
const reportOf = (a) => (a && Array.isArray(a.docVerifications) ? a.docVerifications[0] || null : null);
export const appliedAt = (a) => (a && (a.createdAt || a.created_at || (a.application && a.application.created_at))) || null;
// Still in the running: not withdrawn, not set aside, not told no.
export const inRunning = (a) => !!a && !isWithdrawn(a) && !isSetAside(a) && processState(a) !== APPLICATION_STATE.NOT_SELECTED;
export function applicantFacts(a) {
  const conf = a && a.confirmations && typeof a.confirmations === 'object' ? a.confirmations : {};
  const report = reportOf(a);
  // The documents alone: the state with the employer confirmation and the report left out.
  const docsOnly = applicantState({ junction: { ...a, lastSentAt: null, last_sent_at: null, confirmations: { ...conf, employer: undefined } }, verification: report }).state;
  return {
    applied: true,
    documents: docsOnly === 'matched',
    employer: confirmationCounts(conf.employer, editedAfterReport((a && a.application) || null, report)),
    report: !!(a && (a.lastSentAt || a.last_sent_at)),
  };
}
const furthestOf = (f) => (f.report ? 4 : f.employer ? 3 : f.documents ? 2 : 1);
const doneCount = (f) => [f.applied, f.documents, f.employer, f.report].filter(Boolean).length;

// ── the progress strip ─────────────────────────────────────────────────────────────────────────
export function stageOf(listing, applicants) {
  const standing = listingStanding(listing || {});
  const all = (applicants || []).filter(Boolean);
  const running = all.filter(inRunning);
  let best = null; let bestAt = 0; let bestN = 0;
  for (const a of running) {
    const f = applicantFacts(a); const at = furthestOf(f); const n = doneCount(f);
    if (!best || at > bestAt || (at === bestAt && n > bestN)) { best = f; bestAt = at; bestN = n; }
  }
  const invited = !!(listing && (listing.invite_token || listing.invite_url)) || all.length > 0;
  if (standing.rented) return { done: STAGES.map(() => true), current: null, rented: true, closed: false };
  const done = [invited, !!best, !!(best && best.documents), !!(best && best.employer), !!(best && best.report), false];
  const furthest = done.lastIndexOf(true);
  return { done, current: standing.open ? Math.min(furthest + 1, STAGES.length - 1) : null, rented: false, closed: !standing.open };
}

// ── the next step ──────────────────────────────────────────────────────────────────────────────
// The card's one main action, in this order: a report ready to send, documents to check, documents
// to ask for, an employer to call; anything else the listing has in the action list (a landlord who
// answered, documents asked for long ago, a report with no reply) opens it. kind 'quiet': nothing
// waits on the realtor.
export const STEPS = Object.freeze({
  send: { label: 'Send report' },
  check: { label: 'Check documents' },
  ask: { label: 'Ask for documents' },
  call: { label: 'Call the employer' },
  open: { label: 'Open' },
  quiet: { label: 'Open' },
});
const CHECK = new Set(['check_docs', 'mismatch', 'edited']);
const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
const oldest = (list, at = (i) => i.since) => list.reduce((best, i) => (best == null || (at(i) && (!at(best) || String(at(i)) < String(at(best)))) ? i : best), null);
export const waitDays = (since, now) => { const t = since ? Date.parse(since) : NaN; return Number.isFinite(t) && now != null ? Math.max(0, Math.floor((now - t) / DAY)) : null; };
export const waitWords = (days) => (days == null ? '' : days === 0 ? 'waiting since today' : `waiting ${days} day${days === 1 ? '' : 's'}`);

function nextOf(listing, applicants, mine) {
  const standing = listingStanding(listing || {});
  if (!standing.open) return { kind: 'quiet', words: `${standing.rented ? 'Rented' : 'Closed'}${standing.closedAt ? ` ${shortDay(standing.closedAt)}` : ''}`, n: 0, since: null, item: null };
  const byKind = (fn) => mine.filter(fn);
  const appliedOf = (i) => { const a = (applicants || []).find((x) => x && x.linkId === i.linkId); return appliedAt(a); };
  const ready = byKind((i) => i.kind === 'ready')[0];
  // n: the applicants whose employer was called, the ones the report is ready for (lib/actions.js 'ready').
  if (ready) return { kind: 'send', words: 'Ready to send', n: (applicants || []).filter((a) => inRunning(a) && !processState(a) && applicantState({ junction: a, verification: reportOf(a) }).state === 'verified').length || 1, since: ready.since || null, item: ready };
  const check = byKind((i) => CHECK.has(i.kind));
  if (check.length) { const o = oldest(check); return { kind: 'check', words: `${check.length} to check`, n: check.length, since: o.since || null, item: o }; }
  const ask = byKind((i) => i.kind === 'request');
  if (ask.length) { const o = oldest(ask, appliedOf); return { kind: 'ask', words: `${ask.length} to ask for documents`, n: ask.length, since: appliedOf(o), item: o }; }
  const call = byKind((i) => i.kind === 'verify');
  if (call.length) { const o = oldest(call); return { kind: 'call', words: call.length === 1 ? '1 employer to call' : `${call.length} employers to call`, n: call.length, since: o.since || null, item: o }; }
  const answered = byKind((i) => i.kind === 'landlord_answered')[0];
  if (answered) return { kind: 'open', words: 'The landlord answered', n: 1, since: answered.since || null, item: answered };
  const nudge = byKind((i) => i.kind === 'waiting');
  if (nudge.length) { const o = oldest(nudge); return { kind: 'open', words: nudge.length === 1 ? 'Documents asked for, none yet' : `${nudge.length} asked for documents, none yet`, n: nudge.length, since: o.since || null, item: o }; }
  const noReply = byKind((i) => i.kind === 'sent_waiting')[0];
  if (noReply) return { kind: 'open', words: 'Report sent, no reply yet', n: 1, since: noReply.since || null, item: noReply };
  // Nothing waits on the realtor: say where the listing stands.
  const live = (applicants || []).filter((a) => a && !isWithdrawn(a));
  if (!live.length) return { kind: 'quiet', words: 'No applicants yet', n: 0, since: null, item: null };
  const sent = live.map((a) => a.lastSentAt || a.last_sent_at || null).filter(Boolean).sort().pop();
  if (sent) return { kind: 'quiet', words: `Report sent ${shortDay(sent)}`, n: 0, since: null, item: null };
  const asked = live.filter((a) => inRunning(a) && !processState(a) && applicantState({ junction: a, verification: reportOf(a) }).state === 'requested').length;
  if (asked) return { kind: 'quiet', words: asked === 1 ? 'Waiting on documents' : `${asked} waiting on documents`, n: 0, since: null, item: null };
  return { kind: 'quiet', words: 'Nothing waiting on you', n: 0, since: null, item: null };
}

// ── one listing's card ─────────────────────────────────────────────────────────────────────────
const initials = (name) => { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
export function cardOf(listing, applicants, items, now) {
  const id = listing && listing.id;
  const mine = (items || []).filter((i) => i && i.listingId === id && i.panel !== 'people');
  const live = (applicants || []).filter((a) => a && !isWithdrawn(a));
  // Newest first, the way the listing page lists them.
  const people = [...live].sort((a, b) => String(appliedAt(b) || '').localeCompare(String(appliedAt(a) || ''))).map((a) => ({ id: a.linkId || a.id, name: String((a.application && a.application.full_name) || a.name || '').trim() || 'Applicant' }));
  const next = nextOf(listing, applicants, mine);
  const days = waitDays(next.since, now);
  return {
    id,
    stage: stageOf(listing, applicants),
    next: { ...next, label: STEPS[next.kind].label, days, wait: next.kind === 'quiet' ? '' : waitWords(days), long: days != null && days > 3 },
    // A red dot on the card exactly when the listing has something in Needs you.
    dot: mine.length > 0,
    applicants: live.length,
    toCheck: mine.filter((i) => CHECK.has(i.kind)).length,
    people: people.map((p) => ({ ...p, initials: initials(p.name) })),
    link: (listing && (listing.invite_url || (listing.invite_token ? `/apply/${listing.invite_token}` : ''))) || '',
  };
}

// ── the whole board ────────────────────────────────────────────────────────────────────────────
// listings: the realtor's listings not archived (an archived one leaves the counts, Needs you and
// the bell, as it always has). now: the client's clock (Date.now() before it is known).
export function boardOf({ listings = [], applicantsByListing = {}, people = [], now = Date.now() } = {}) {
  const items = buildActions({ listings, applicantsByListing, people, now });
  const byId = {};
  let applicants = 0; let newThisWeek = 0; let active = 0; let withoutApplicants = 0;
  for (const l of listings || []) {
    if (!l || l.id == null) continue;
    const apps = (applicantsByListing || {})[l.id] || [];
    byId[l.id] = cardOf(l, apps, items, now);
    if (!listingOpen(l)) continue;
    active++;
    const live = apps.filter((a) => a && !isWithdrawn(a));
    applicants += live.length;
    if (!live.length) withoutApplicants++;
    for (const a of live) { const d = waitDays(appliedAt(a), now); if (d != null && d < 7) newThisWeek++; }
  }
  const sends = items.filter((i) => i.kind === 'ready');
  const checks = items.filter((i) => CHECK.has(i.kind));
  return {
    items,
    byId,
    tiles: { toSend: sends.length, toCheck: checks.length, applicants, active, newThisWeek, withoutApplicants, oldestSend: oldest(sends), oldestCheck: oldest(checks) },
  };
}
