// lib/kpis.js  PURE (no clock of its own, no database; its one import is the state vocabulary). Every number the Commitment
// section of the founder office shows (components/admin/Commitment.js), the daily snapshot
// (pages/api/cron/kpi-snapshot.js, db/013-kpi-daily.sql) and the daily email
// (pages/api/cron/kpi-email.js) is defined here and nowhere else. Each function takes the rows
// (lib/kpiStore.js loadKpiData reads them) and a clock: a Date or milliseconds. A month is a
// calendar month in America/Toronto, named 'YYYY-MM'; a day is a Toronto date, 'YYYY-MM-DD'.
//
// The rows:
//   profiles      [{ id, email, created_at, signup_source }]            one per realtor
//   listings      [{ id, profile_id }]
//   links         [{ id, listing_id, application_id, created_at, state }]  public.listing_applicants:
//                 one application on one listing. The row is written when the tenant submits
//                 (lib/supabaseBridge.js linkApplicantToListing), so created_at is the submit time.
//   events        [{ listing_applicant_id, from_state, to_state, created_at }]  public.application_events
//   applications  [{ id, email }]
//
// Counted out of every metric (isExcludedProfile): a profile named in KPI_EXCLUDE_PROFILE_IDS, and
// a test account by its email (the company's own domain, example.com and its kin, a +test address).
// Their listings, and every application on those listings, go with them. Sandbox data never
// reaches the database (lib/features.js isSandboxToken), so there is none to take out.

import { APPLICATION_STATE as A } from './application-state.js';

export const TARGETS = Object.freeze({ activeRealtors: 30, rentalsClosed: 50, streak: 3, profileReuse: 100, referralShare: 1 / 3 });
export const DEADLINE = '2027-11-17';
export const START = '2026-11-17';
export const TRIGGER_SENTENCE = 'When 30 realtors close 50 rentals a month through Rentletter for three straight months, and 100 tenants have reused their profile, I go full time and raise. If not by November 17, 2027, I decide again on purpose.';
export const REUSE_LABEL_UNTRACKED = 'applied twice (reuse not yet tracked)';

// ── Toronto time ────────────────────────────────────────────────────────────────────────────
const ms = (clock) => (clock instanceof Date ? clock.getTime() : Number(clock));
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function torontoParts(clock) {
  const out = {};
  for (const p of FMT.formatToParts(new Date(ms(clock)))) if (p.type !== 'literal') out[p.type] = p.value;
  return { year: Number(out.year), month: Number(out.month), day: Number(out.day), hour: Number(out.hour) % 24 };
}
const two = (n) => String(n).padStart(2, '0');
export const torontoDate = (clock) => { const p = torontoParts(clock); return `${p.year}-${two(p.month)}-${two(p.day)}`; };
export const torontoHour = (clock) => torontoParts(clock).hour;
export const monthOf = (clock) => torontoDate(clock).slice(0, 7);
export function addMonths(month, n) {
  const [y, m] = String(month).split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${two((i % 12) + 1)}`;
}
export const lastCompleteMonth = (clock) => addMonths(monthOf(clock), -1);
// Whole days between two Toronto dates (a date has no hour, so no daylight saving step).
const dayIndex = (date) => { const [y, m, d] = String(date).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const daysBetween = (from, to) => dayIndex(to) - dayIndex(from);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (month) => MONTH_NAMES[Number(String(month).split('-')[1]) - 1];
export const monthShort = (month) => monthName(month).slice(0, 3);

// 1f. Days left until November 17, 2027, Toronto time. Never below zero.
export const daysLeft = (clock) => Math.max(0, daysBetween(torontoDate(clock), DEADLINE));
// Day 1 is November 17, 2026; day 365 is the day before the deadline, and stays 365 from there.
export const dayNumber = (clock) => Math.min(365, Math.max(1, daysBetween(START, torontoDate(clock)) + 1));

// ── who is counted ──────────────────────────────────────────────────────────────────────────
export const parseExcludeIds = (value) => new Set(String(value || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const TEST_EMAIL = /(\+test[^@]*@|@rentletter\.ca$|@example\.(com|org|net)$|\.(test|invalid|example)$)/i;
export const isTestEmail = (email) => TEST_EMAIL.test(String(email || '').trim());
export const isExcludedProfile = (profile, excludeIds = new Set()) => !profile || excludeIds.has(String(profile.id).toLowerCase()) || isTestEmail(profile.email);

// The rows that count: the realtors left in, their listings, the applications on those listings.
export function scope(data, { excludeIds = new Set() } = {}) {
  const profiles = (data.profiles || []).filter((p) => !isExcludedProfile(p, excludeIds));
  const counted = new Set(profiles.map((p) => String(p.id)));
  const owner = new Map();
  for (const l of data.listings || []) if (counted.has(String(l.profile_id))) owner.set(String(l.id), String(l.profile_id));
  const links = (data.links || []).filter((k) => owner.has(String(k.listing_id)) && k.state !== A.DRAFT);
  const listingOfLink = new Map(links.map((k) => [String(k.id), String(k.listing_id)]));
  const events = (data.events || []).filter((e) => listingOfLink.has(String(e.listing_applicant_id)));
  return { profiles, owner, links, listingOfLink, events };
}
const inMonth = (iso, month) => !!iso && monthOf(Date.parse(iso)) === month;

// 1a. Active realtors in a month: distinct realtors with at least one listing that received at
// least one submitted application in that month.
export function activeRealtors(data, month, opts) {
  const s = scope(data, opts);
  const active = new Set();
  for (const k of s.links) if (inMonth(k.created_at, month)) active.add(s.owner.get(String(k.listing_id)));
  return active.size;
}

// 1b. Rentals closed in a month: distinct listings whose tenant was confirmed that month (an
// application moved to accepted), minus the listings whose deal fell through in the same month.
// A deal falls through when the accepted application moves to fell_through, or the tenant
// withdraws after the yes. A listing accepted, fallen through and accepted again inside the month
// counts once: what matters is how the month left it.
const CLOSING = new Set([A.ACCEPTED, A.AGREEMENT_SIGNED, A.DEPOSIT_RECEIVED, A.LEASE_SIGNED]);
// The moves this metric reads (lib/kpiStore.js asks the database for these and no others).
export const RENTAL_MOVES = Object.freeze([A.ACCEPTED, A.FELL_THROUGH, A.WITHDRAWN_BY_APPLICANT]);
const isConfirm = (e) => e.to_state === A.ACCEPTED;
const isFellThrough = (e) => e.to_state === A.FELL_THROUGH || (e.to_state === A.WITHDRAWN_BY_APPLICANT && CLOSING.has(e.from_state));
export function rentalsClosed(data, month, opts) {
  const s = scope(data, opts);
  const last = new Map(); // listing → its last confirm or fell through of the month
  for (const e of s.events) {
    if (!inMonth(e.created_at, month) || !(isConfirm(e) || isFellThrough(e))) continue;
    const listing = s.listingOfLink.get(String(e.listing_applicant_id));
    const at = Date.parse(e.created_at);
    const prev = last.get(listing);
    // On a tie the fell through wins: the month never counts a deal it cannot place after the fall.
    if (!prev || at > prev.at || (at === prev.at && isFellThrough(e))) last.set(listing, { at, closed: isConfirm(e) });
  }
  let n = 0;
  for (const v of last.values()) if (v.closed) n += 1;
  return n;
}

export const monthMet = (data, month, opts) => activeRealtors(data, month, opts) >= TARGETS.activeRealtors && rentalsClosed(data, month, opts) >= TARGETS.rentalsClosed;

// 1c. The streak: consecutive complete months, counting back from the last complete month, in
// which both 1a and 1b met their target. The month the clock is in never counts.
export function streak(data, clock, opts) {
  let month = lastCompleteMonth(clock); let n = 0;
  while (n < 240 && monthMet(data, month, opts)) { n += 1; month = addMonths(month, -1); }
  return n;
}

// 1d. Profile reuse, all time. The schema today cannot tell a reused profile from a form typed
// again (nothing on an application records where its answers came from), so this counts the
// tenants, by the email on their applications, with submitted applications on two or more
// different listings, and says so in its label. tracked turns true once the application records
// the reuse (see the report on db/013 for what the tenant profile build must write).
export function profileReuse(data, opts) {
  const s = scope(data, opts);
  const emailOf = new Map((data.applications || []).map((a) => [String(a.id), String(a.email || '').trim().toLowerCase()]));
  const listingsOf = new Map();
  for (const k of s.links) {
    const email = emailOf.get(String(k.application_id));
    if (!email || isTestEmail(email)) continue;
    if (!listingsOf.has(email)) listingsOf.set(email, new Set());
    listingsOf.get(email).add(String(k.listing_id));
  }
  let count = 0;
  for (const set of listingsOf.values()) if (set.size >= 2) count += 1;
  return { count, tracked: false, label: REUSE_LABEL_UNTRACKED };
}

// 1e. Referral share in a month: of the realtors who signed up that month, the share whose first
// touch was a referral link, a realtor referral, or a tenant or landlord facing page. A profile
// with no recorded first touch is unknown: it is left out of the share, never counted against it.
export const REFERRAL_SOURCE = /^(ref:[A-Za-z0-9_-]{1,32}|realtor_referral|apply|report|my_application|tenant_page|landlord_page)$/;
export const isReferralSource = (source) => REFERRAL_SOURCE.test(String(source || ''));
export function referralShare(data, month, opts) {
  const s = scope(data, opts);
  const signed = s.profiles.filter((p) => inMonth(p.created_at, month));
  const known = signed.filter((p) => p.signup_source != null && p.signup_source !== '');
  const referral = known.filter((p) => isReferralSource(p.signup_source)).length;
  return { signups: signed.length, known: known.length, unknown: signed.length - known.length, referral, share: known.length ? referral / known.length : null };
}

// ── the whole picture at one moment ─────────────────────────────────────────────────────────
// Everything the tiles, the snapshot row and the email read. This month is month to date; last
// month is the last complete one.
export function computeKpis(data, clock, opts) {
  const month = monthOf(clock); const last = lastCompleteMonth(clock);
  const reuse = profileReuse(data, opts);
  return {
    day: torontoDate(clock), month, lastMonth: last,
    activeRealtors: { mtd: activeRealtors(data, month, opts), last: activeRealtors(data, last, opts), target: TARGETS.activeRealtors },
    rentalsClosed: { mtd: rentalsClosed(data, month, opts), last: rentalsClosed(data, last, opts), target: TARGETS.rentalsClosed },
    streak: { months: streak(data, clock, opts), target: TARGETS.streak, inProgress: monthMet(data, month, opts) },
    profileReuse: { ...reuse, target: TARGETS.profileReuse },
    referralShare: { mtd: referralShare(data, month, opts), last: referralShare(data, last, opts), target: TARGETS.referralShare },
    daysLeft: daysLeft(clock), dayNumber: dayNumber(clock),
  };
}

// The public.kpi_daily row for one Toronto date (db/013-kpi-daily.sql). Column names are the
// table's; computeKpis(…) is the only source.
export function snapshotRow(kpis, clock) {
  const share = (r) => (r.share == null ? null : Math.round(r.share * 10000) / 10000);
  return {
    day: kpis.day,
    active_realtors_mtd: kpis.activeRealtors.mtd, active_realtors_last_month: kpis.activeRealtors.last,
    rentals_closed_mtd: kpis.rentalsClosed.mtd, rentals_closed_last_month: kpis.rentalsClosed.last,
    streak_months: kpis.streak.months,
    profile_reuse: kpis.profileReuse.count, profile_reuse_tracked: kpis.profileReuse.tracked,
    signups_mtd: kpis.referralShare.mtd.signups, signups_known_mtd: kpis.referralShare.mtd.known, referral_signups_mtd: kpis.referralShare.mtd.referral, referral_share_mtd: share(kpis.referralShare.mtd),
    signups_last_month: kpis.referralShare.last.signups, signups_known_last_month: kpis.referralShare.last.known, referral_signups_last_month: kpis.referralShare.last.referral, referral_share_last_month: share(kpis.referralShare.last),
    days_left: kpis.daysLeft,
    computed_at: new Date(ms(clock)).toISOString(),
  };
}

// The chart: the last 12 months ending at the clock's month, from the kpi_daily rows alone. A
// complete month reads the *_last_month figure of a row dated in the month after it (the whole
// month, counted once it ended); failing that, and for the month in progress, the latest month to
// date row inside the month. A month with no row is null: drawn as a gap, never as a zero.
export function monthlySeries(rows, clock) {
  const now = monthOf(clock);
  const byMonth = new Map();
  for (const r of [...(rows || [])].sort((a, b) => String(a.day).localeCompare(String(b.day)))) {
    const m = String(r.day).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, { first: r, latest: r }); else byMonth.get(m).latest = r;
  }
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const month = addMonths(now, -i);
    const after = byMonth.get(addMonths(month, 1)); const within = byMonth.get(month);
    let point = { month, activeRealtors: null, rentalsClosed: null, complete: month !== now };
    if (month !== now && after) point = { ...point, activeRealtors: after.first.active_realtors_last_month, rentalsClosed: after.first.rentals_closed_last_month };
    else if (within) point = { ...point, activeRealtors: within.latest.active_realtors_mtd, rentalsClosed: within.latest.rentals_closed_mtd };
    out.push(point);
  }
  return out;
}

// One third, one half, 20%: the share as a person reads it. Unknown reads as a dash.
export const sharePct = (share) => (share == null ? '—' : `${Math.round(share * 100)}%`);
