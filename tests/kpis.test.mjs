// The commitment's numbers (lib/kpis.js): every metric as a pure function of the rows and a clock,
// every month a calendar month in America/Toronto. Fixed clocks throughout: the month boundary at
// midnight Toronto time in daylight and in standard time, a rental that fell through, the accounts
// counted out, and a streak broken by one month. Then the snapshot row, the chart's months, the
// store over the fake database (with and without db/013), the email and the two crons' gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as K from '../lib/kpis.js';
import { loadKpiData, loadCommitment, writeSnapshot, readSnapshots } from '../lib/kpiStore.js';
import { kpiEmail, kpiRows } from '../lib/kpiEmail.js';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = (iso) => Date.parse(iso);

// ── rows ────────────────────────────────────────────────────────────────────────────────────
// n realtors, each with one listing; submit(month data) adds applications; close and fall add moves.
function world() {
  const d = { profiles: [], listings: [], links: [], events: [], applications: [] };
  let seq = 0;
  const api = {
    d,
    realtor(id, over = {}) { d.profiles.push({ id, email: `${id}@brokerage.ca`, created_at: '2026-01-10T15:00:00Z', signup_source: null, ...over }); return api; },
    listing(id, profileId) { d.listings.push({ id, profile_id: profileId }); return api; },
    submit(listingId, at, email = `tenant${seq + 1}@mail.ca`, over = {}) { seq += 1; d.applications.push({ id: `A${seq}`, email }); d.links.push({ id: `K${seq}`, listing_id: listingId, application_id: `A${seq}`, created_at: at, state: 'submitted', ...over }); return `K${seq}`; },
    move(linkId, to, at, from = 'shortlisted') { d.events.push({ listing_applicant_id: linkId, from_state: from, to_state: to, created_at: at }); return api; },
  };
  return api;
}
// A month that meets both targets: 30 realtors each receive an application, 50 listings close.
function fullMonth(w, month, { realtors = 30, rentals = 50 } = {}) {
  const at = `${month}-15T16:00:00Z`;
  for (let i = 0; i < Math.max(realtors, 1); i++) {
    const id = `R${i}`;
    if (!w.d.profiles.some((p) => p.id === id)) w.realtor(id);
  }
  for (let i = 0; i < rentals; i++) {
    const listing = `L-${month}-${i}`; const owner = `R${i % Math.max(realtors, 1)}`;
    w.listing(listing, owner);
    const link = w.submit(listing, i < realtors ? at : `${K.addMonths(month, -1)}-20T16:00:00Z`);
    w.move(link, 'accepted', at);
  }
  // Realtors beyond the rentals still need an application this month to be active.
  for (let i = rentals; i < realtors; i++) { const listing = `L-${month}-x${i}`; w.listing(listing, `R${i}`); w.submit(listing, at); }
}

// ── Toronto time ────────────────────────────────────────────────────────────────────────────
test('a month turns over at midnight Toronto time, in daylight time and in standard time', () => {
  // Daylight time (UTC-4): October ends at 2026-11-01T04:00:00Z.
  assert.equal(K.monthOf(T('2026-11-01T03:59:59Z')), '2026-10');
  assert.equal(K.monthOf(T('2026-11-01T04:00:00Z')), '2026-11');
  assert.equal(K.torontoDate(T('2026-11-01T03:59:59Z')), '2026-10-31');
  // Standard time (UTC-5): November ends at 2026-12-01T05:00:00Z.
  assert.equal(K.monthOf(T('2026-12-01T04:59:59Z')), '2026-11');
  assert.equal(K.monthOf(T('2026-12-01T05:00:00Z')), '2026-12');
  // The year turns the same way; a Date and milliseconds read alike.
  assert.equal(K.monthOf(new Date('2027-01-01T04:59:59Z')), '2026-12');
  assert.equal(K.monthOf(new Date('2027-01-01T05:00:00Z')), '2027-01');
  assert.equal(K.torontoHour(T('2026-07-01T10:00:00Z')), 6); assert.equal(K.torontoHour(T('2026-12-01T11:00:00Z')), 6);
  assert.equal(K.torontoHour(T('2026-12-01T05:00:00Z')), 0, 'midnight reads 0, never 24');
  assert.equal(K.addMonths('2026-01', -1), '2025-12'); assert.equal(K.addMonths('2026-12', 1), '2027-01'); assert.equal(K.addMonths('2026-11', -11), '2025-12');
  assert.equal(K.lastCompleteMonth(T('2026-11-17T17:00:00Z')), '2026-10');
});

test('an application submitted one second before midnight counts in the month that is ending', () => {
  const w = world(); w.realtor('R1').realtor('R2').listing('L1', 'R1').listing('L2', 'R2');
  w.submit('L1', '2026-11-01T03:59:59Z'); // October 31, 23:59:59 in Toronto
  w.submit('L2', '2026-11-01T04:00:00Z'); // November 1, 00:00:00 in Toronto
  assert.equal(K.activeRealtors(w.d, '2026-10'), 1);
  assert.equal(K.activeRealtors(w.d, '2026-11'), 1);
  const link = w.d.links[0].id;
  w.move(link, 'accepted', '2026-12-01T04:59:59Z'); // November 30, 23:59:59 standard time
  assert.equal(K.rentalsClosed(w.d, '2026-11'), 1); assert.equal(K.rentalsClosed(w.d, '2026-12'), 0);
});

// ── 1a ──────────────────────────────────────────────────────────────────────────────────────
test('active realtors: distinct realtors with a listing that received a submitted application that month', () => {
  const w = world(); w.realtor('R1').realtor('R2').realtor('R3').listing('L1', 'R1').listing('L1b', 'R1').listing('L2', 'R2').listing('L3', 'R3');
  w.submit('L1', '2026-11-03T15:00:00Z'); w.submit('L1b', '2026-11-04T15:00:00Z'); w.submit('L1', '2026-11-05T15:00:00Z'); // one realtor, three applications
  w.submit('L2', '2026-10-20T15:00:00Z'); // last month only
  w.submit('L3', '2026-11-09T15:00:00Z', 'draft@mail.ca', { state: 'draft' }); // not submitted
  assert.equal(K.activeRealtors(w.d, '2026-11'), 1);
  assert.equal(K.activeRealtors(w.d, '2026-10'), 1);
  assert.equal(K.activeRealtors(w.d, '2026-09'), 0);
  assert.equal(K.TARGETS.activeRealtors, 30);
});

test('the accounts counted out: the env list, the company domain, test addresses; their listings go with them', () => {
  const w = world();
  w.realtor('R1').realtor('founder-1', { email: 'armin@elsewhere.ca' }).realtor('R3', { email: 'info@rentletter.ca' }).realtor('R4', { email: 'sarah@example.com' }).realtor('R5', { email: 'agent+test2@gmail.com' }).realtor('R6', { email: null });
  for (const [l, p] of [['L1', 'R1'], ['L2', 'founder-1'], ['L3', 'R3'], ['L4', 'R4'], ['L5', 'R5'], ['L6', 'R6']]) { w.listing(l, p); const k = w.submit(l, '2026-11-05T15:00:00Z'); w.move(k, 'accepted', '2026-11-06T15:00:00Z'); }
  const opts = { excludeIds: K.parseExcludeIds(' FOUNDER-1 , another-id ,') };
  assert.deepEqual([...opts.excludeIds], ['founder-1', 'another-id']);
  assert.equal(K.activeRealtors(w.d, '2026-11', opts), 2, 'R1 and R6 (no email on the profile) stay; the rest are out');
  assert.equal(K.rentalsClosed(w.d, '2026-11', opts), 2);
  assert.equal(K.activeRealtors(w.d, '2026-11'), 3, 'without the env list the named account counts, the test addresses still do not');
  assert.equal(K.referralShare(w.d, '2026-01', opts).signups, 2);
  assert.equal(K.isExcludedProfile(null), true);
  for (const e of ['a@example.org', 'x@rentletter.ca', 'someone@mail.test', 'me+test@gmail.com']) assert.equal(K.isTestEmail(e), true, e);
  for (const e of ['sarah@remax.ca', 'contest@gmail.com', 'a@rentletter.ca.evil.com', '']) assert.equal(K.isTestEmail(e), false, e);
});

// ── 1b ──────────────────────────────────────────────────────────────────────────────────────
test('rentals closed: listings with a tenant confirmed that month, less the ones that fell through in it', () => {
  const w = world(); w.realtor('R1');
  for (const l of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) w.listing(l, 'R1');
  const k1 = w.submit('L1', '2026-11-02T15:00:00Z'); w.move(k1, 'accepted', '2026-11-04T15:00:00Z'); // closed
  const k2 = w.submit('L2', '2026-11-02T15:00:00Z'); w.move(k2, 'accepted', '2026-11-05T15:00:00Z').move(k2, 'fell_through', '2026-11-20T15:00:00Z', 'agreement_signed'); // fell through the same month
  const k3 = w.submit('L3', '2026-11-02T15:00:00Z'); w.move(k3, 'accepted', '2026-11-06T15:00:00Z').move(k3, 'fell_through', '2026-12-03T15:00:00Z', 'accepted'); // fell through the month after
  const k4 = w.submit('L4', '2026-11-02T15:00:00Z'); const k4b = w.submit('L4', '2026-11-03T15:00:00Z');
  w.move(k4, 'accepted', '2026-11-07T15:00:00Z').move(k4, 'fell_through', '2026-11-10T15:00:00Z', 'accepted').move(k4b, 'accepted', '2026-11-12T15:00:00Z'); // fell through, then closed with another tenant
  const k5 = w.submit('L5', '2026-11-02T15:00:00Z'); w.move(k5, 'accepted', '2026-11-08T15:00:00Z').move(k5, 'withdrawn_by_applicant', '2026-11-09T15:00:00Z', 'accepted'); // the tenant withdrew after the yes
  const k6 = w.submit('L6', '2026-11-02T15:00:00Z'); w.move(k6, 'withdrawn_by_applicant', '2026-11-09T15:00:00Z', 'submitted').move(k6, 'shortlisted', '2026-11-10T15:00:00Z', 'submitted'); // never confirmed
  w.move(k1, 'agreement_signed', '2026-11-15T15:00:00Z', 'accepted'); // a closing step is not a second rental
  assert.equal(K.rentalsClosed(w.d, '2026-11'), 3, 'L1, L3 and L4');
  assert.equal(K.rentalsClosed(w.d, '2026-12'), 0, 'a fall in December takes nothing from November and adds nothing to December');
  assert.equal(K.TARGETS.rentalsClosed, 50);
});

test('rentals closed counts a listing once however many of its applications were confirmed', () => {
  const w = world(); w.realtor('R1').listing('L1', 'R1');
  const a = w.submit('L1', '2026-11-02T15:00:00Z'); const b = w.submit('L1', '2026-11-02T16:00:00Z');
  w.move(a, 'accepted', '2026-11-04T15:00:00Z').move(b, 'accepted', '2026-11-04T15:00:00Z');
  assert.equal(K.rentalsClosed(w.d, '2026-11'), 1);
});

// ── 1c ──────────────────────────────────────────────────────────────────────────────────────
test('the streak counts complete months back from the last complete one; the current month never counts', () => {
  const w = world();
  for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) fullMonth(w, m);
  const now = T('2026-11-17T17:00:00Z');
  assert.equal(K.monthMet(w.d, '2026-11'), true, 'November has already met both targets');
  assert.equal(K.streak(w.d, now), 3, 'August, September, October: November is in progress and is not counted');
  assert.equal(K.streak(w.d, T('2026-12-01T04:59:59Z')), 3, 'the last second of November: still in progress');
  assert.equal(K.streak(w.d, T('2026-12-01T05:00:00Z')), 4, 'midnight on December 1 in Toronto: November is complete');
  assert.equal(K.TARGETS.streak, 3);
});

test('a streak broken by one month starts again after it', () => {
  const w = world();
  fullMonth(w, '2026-06'); fullMonth(w, '2026-07');
  fullMonth(w, '2026-08', { realtors: 29 }); // one realtor short: August breaks it
  fullMonth(w, '2026-09'); fullMonth(w, '2026-10');
  assert.equal(K.activeRealtors(w.d, '2026-08'), 29); assert.equal(K.rentalsClosed(w.d, '2026-08'), 50);
  assert.equal(K.streak(w.d, T('2026-11-17T17:00:00Z')), 2, 'September and October; June and July sit behind the break');
  assert.equal(K.streak(w.d, T('2026-09-10T17:00:00Z')), 0, 'counted from August, the broken month');
  assert.equal(K.streak(w.d, T('2026-08-10T17:00:00Z')), 2, 'June and July, before the break');
  const short = world(); fullMonth(short, '2026-10', { rentals: 49 });
  assert.equal(K.streak(short.d, T('2026-11-17T17:00:00Z')), 0, 'realtors met, rentals one short: both must be met');
});

// ── 1d ──────────────────────────────────────────────────────────────────────────────────────
test('profile reuse: tenants with submitted applications on two or more different listings, labelled as not yet tracked', () => {
  const w = world(); w.realtor('R1').realtor('R2', { email: 'x@example.com' }).listing('L1', 'R1').listing('L2', 'R1').listing('L3', 'R2');
  w.submit('L1', '2026-05-02T15:00:00Z', 'Maya@Mail.ca'); w.submit('L2', '2026-09-02T15:00:00Z', ' maya@mail.ca '); // the same person, two listings
  w.submit('L1', '2026-05-02T15:00:00Z', 'omar@mail.ca'); w.submit('L1', '2026-06-02T15:00:00Z', 'omar@mail.ca'); // twice on one listing
  w.submit('L1', '2026-05-02T15:00:00Z', 'lena@mail.ca'); w.submit('L3', '2026-06-02T15:00:00Z', 'lena@mail.ca'); // the second is on a test account's listing
  w.submit('L1', '2026-05-02T15:00:00Z', 'qa@example.com'); w.submit('L2', '2026-06-02T15:00:00Z', 'qa@example.com'); // a test tenant
  w.submit('L1', '2026-05-02T15:00:00Z', ''); w.submit('L2', '2026-06-02T15:00:00Z', ''); // no email: nobody
  const r = K.profileReuse(w.d);
  assert.deepEqual(r, { count: 1, tracked: false, label: 'applied twice (reuse not yet tracked)' });
  assert.equal(K.TARGETS.profileReuse, 100);
});

// ── 1e ──────────────────────────────────────────────────────────────────────────────────────
test('referral share: of the month\'s new realtors with a known first touch, the share who arrived by referral', () => {
  const w = world();
  const born = '2026-11-05T15:00:00Z';
  w.realtor('R1', { created_at: born, signup_source: 'apply' }).realtor('R2', { created_at: born, signup_source: 'realtor_referral' }).realtor('R3', { created_at: born, signup_source: 'ref:maya-k' })
    .realtor('R4', { created_at: born, signup_source: 'direct' }).realtor('R5', { created_at: born, signup_source: 'invite' }).realtor('R6', { created_at: born, signup_source: 'report' })
    .realtor('R7', { created_at: born, signup_source: null }) // from before the column: unknown
    .realtor('R8', { created_at: '2026-11-01T03:59:59Z', signup_source: 'apply' }) // October 31 in Toronto
    .realtor('R9', { created_at: born, signup_source: 'apply', email: 'qa@example.com' }); // a test account
  const r = K.referralShare(w.d, '2026-11');
  assert.deepEqual({ signups: r.signups, known: r.known, unknown: r.unknown, referral: r.referral }, { signups: 7, known: 6, unknown: 1, referral: 4 });
  assert.equal(r.share, 4 / 6, 'the unknown profile is left out of the share, not counted against it');
  assert.equal(K.referralShare(w.d, '2026-10').share, 1);
  const none = K.referralShare(w.d, '2026-09'); assert.equal(none.share, null); assert.equal(K.sharePct(none.share), '—');
  const unknownOnly = world(); unknownOnly.realtor('R1', { created_at: born });
  assert.deepEqual(K.referralShare(unknownOnly.d, '2026-11'), { signups: 1, known: 0, unknown: 1, referral: 0, share: null });
  for (const s of ['apply', 'report', 'my_application', 'tenant_page', 'landlord_page', 'realtor_referral', 'ref:abc']) assert.equal(K.isReferralSource(s), true, s);
  for (const s of ['direct', 'invite', '', null, 'ref:', 'https://rentletter.ca/apply/x']) assert.equal(K.isReferralSource(s), false, String(s));
  assert.equal(K.TARGETS.referralShare, 1 / 3); assert.equal(K.sharePct(1 / 3), '33%');
});

// ── 1f ──────────────────────────────────────────────────────────────────────────────────────
test('days left to November 17, 2027, by the Toronto date', () => {
  assert.equal(K.daysLeft(T('2026-11-17T17:00:00Z')), 365);
  assert.equal(K.dayNumber(T('2026-11-17T17:00:00Z')), 1);
  assert.equal(K.daysLeft(T('2026-11-18T04:59:59Z')), 365, '23:59:59 on the 17th in Toronto');
  assert.equal(K.daysLeft(T('2026-11-18T05:00:00Z')), 364, 'midnight in Toronto');
  assert.equal(K.dayNumber(T('2026-11-18T05:00:00Z')), 2);
  assert.equal(K.daysLeft(T('2027-03-14T12:00:00Z')), 248, 'across the spring change of clocks a day is still a day');
  assert.equal(K.daysLeft(T('2027-11-16T17:00:00Z')), 1); assert.equal(K.dayNumber(T('2027-11-16T17:00:00Z')), 365);
  assert.equal(K.daysLeft(T('2027-11-17T17:00:00Z')), 0); assert.equal(K.dayNumber(T('2027-11-17T17:00:00Z')), 365);
  assert.equal(K.daysLeft(T('2028-01-01T17:00:00Z')), 0, 'never below zero');
  assert.equal(K.DEADLINE, '2027-11-17');
});

// ── the whole picture, the row and the chart ────────────────────────────────────────────────
test('computeKpis and the snapshot row: this month to date beside the last complete month', () => {
  const w = world(); fullMonth(w, '2026-10'); fullMonth(w, '2026-11', { realtors: 4, rentals: 2 });
  w.realtor('N1', { created_at: '2026-11-03T15:00:00Z', signup_source: 'apply' }).realtor('N2', { created_at: '2026-11-04T15:00:00Z', signup_source: 'direct' }).realtor('N3', { created_at: '2026-11-04T15:00:00Z', signup_source: 'direct' });
  const now = T('2026-11-17T11:00:00Z');
  const k = K.computeKpis(w.d, now, {});
  assert.deepEqual(k.activeRealtors, { mtd: 4, last: 30, target: 30 });
  assert.deepEqual(k.rentalsClosed, { mtd: 2, last: 50, target: 50 });
  assert.deepEqual(k.streak, { months: 1, target: 3, inProgress: false });
  assert.equal(k.day, '2026-11-17'); assert.equal(k.month, '2026-11'); assert.equal(k.lastMonth, '2026-10'); assert.equal(k.daysLeft, 365);
  const row = K.snapshotRow(k, now);
  assert.deepEqual(row, {
    day: '2026-11-17', active_realtors_mtd: 4, active_realtors_last_month: 30, rentals_closed_mtd: 2, rentals_closed_last_month: 50, streak_months: 1,
    profile_reuse: 0, profile_reuse_tracked: false,
    signups_mtd: 3, signups_known_mtd: 3, referral_signups_mtd: 1, referral_share_mtd: 0.3333,
    signups_last_month: 0, signups_known_last_month: 0, referral_signups_last_month: 0, referral_share_last_month: null,
    days_left: 365, computed_at: '2026-11-17T11:00:00.000Z',
  });
  // Every column the row carries is a column of the table, and the other way round.
  const sql = src('db/013-kpi-daily.sql');
  const columns = [...sql.split('CREATE TABLE IF NOT EXISTS public.kpi_daily (')[1].split('\n);')[0].matchAll(/^\s{2}([a-z_]+)\s/gm)].map((m) => m[1]);
  assert.deepEqual(Object.keys(row).sort(), [...columns].sort());
});

test('the chart: twelve months from the snapshots, a complete month from the row after it, a missing month a gap', () => {
  const rows = [
    { day: '2026-09-29', active_realtors_mtd: 9, rentals_closed_mtd: 6, active_realtors_last_month: 5, rentals_closed_last_month: 3 },
    { day: '2026-09-30', active_realtors_mtd: 11, rentals_closed_mtd: 7, active_realtors_last_month: 5, rentals_closed_last_month: 3 }, // counted at 06:00: misses the rest of the day
    { day: '2026-11-01', active_realtors_mtd: 0, rentals_closed_mtd: 0, active_realtors_last_month: 21, rentals_closed_last_month: 17 },
    { day: '2026-11-17', active_realtors_mtd: 8, rentals_closed_mtd: 4, active_realtors_last_month: 21, rentals_closed_last_month: 17 },
  ];
  const s = K.monthlySeries(rows, T('2026-11-17T17:00:00Z'));
  assert.equal(s.length, 12); assert.equal(s[0].month, '2025-12'); assert.equal(s[11].month, '2026-11');
  const by = Object.fromEntries(s.map((p) => [p.month, p]));
  assert.deepEqual([by['2026-11'].activeRealtors, by['2026-11'].rentalsClosed, by['2026-11'].complete], [8, 4, false], 'the month in progress: its latest month to date');
  assert.deepEqual([by['2026-10'].activeRealtors, by['2026-10'].rentalsClosed], [21, 17], 'October whole, from the first November row');
  assert.deepEqual([by['2026-09'].activeRealtors, by['2026-09'].rentalsClosed], [11, 7], 'no October row: September reads its own latest month to date');
  assert.deepEqual([by['2026-08'].activeRealtors, by['2026-08'].rentalsClosed], [5, 3], 'August whole, from the first September row');
  assert.equal(by['2026-07'].activeRealtors, null, 'no row: a gap, not a zero');
  assert.deepEqual(K.monthlySeries([], T('2026-11-17T17:00:00Z')).map((p) => p.activeRealtors), Array(12).fill(null));
});

// ── the store ───────────────────────────────────────────────────────────────────────────────
const NOW = T('2026-11-17T11:00:00Z');
function tables({ kpiDaily = false, events = true } = {}) {
  const w = world(); w.realtor('R1', { created_at: '2026-11-02T15:00:00Z', signup_source: 'apply' }).realtor('R2', { email: 'sarah@example.com' }).listing('L1', 'R1').listing('L2', 'R2');
  const k = w.submit('L1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); w.move(k, 'accepted', '2026-11-09T15:00:00Z'); w.submit('L2', '2026-11-05T15:00:00Z');
  const t = { profiles: w.d.profiles.map((p) => ({ ...p, full_name: 'A Realtor', plan: 'founding' })), listings: w.d.listings, listing_applicants: w.d.links, applications: w.d.applications.map((a) => ({ ...a, owner_token: 'OWNERTOKENSECRET', full_name: 'A Tenant' })) };
  if (events) t.application_events = w.d.events.map((e, i) => ({ id: `E${i}`, ...e }));
  if (kpiDaily) t.kpi_daily = [];
  return t;
}

test('the office counts live before db/013 has run, and says the history has not started', async () => {
  const db = fakeSupabase(tables());
  const c = await loadCommitment(db, NOW, {});
  assert.deepEqual(c.history, { exists: false, days: 0, series: null });
  assert.equal(c.kpis.activeRealtors.mtd, 1); assert.equal(c.kpis.rentalsClosed.mtd, 1); assert.equal(c.kpis.referralShare.mtd.share, 1);
  const w = await writeSnapshot(db, NOW, {});
  assert.equal(w.stored, false); assert.match(w.reason, /db\/013-kpi-daily\.sql/);
  assert.equal(db.inserts.length, 0, 'nothing is written anywhere');
});

test('with db/013 the daily run writes one row per Toronto date, and a second run that day replaces it', async () => {
  const t = tables({ kpiDaily: true }); const db = fakeSupabase(t);
  const first = await writeSnapshot(db, NOW, {});
  assert.equal(first.stored, true); assert.equal(t.kpi_daily.length, 1); assert.equal(t.kpi_daily[0].day, '2026-11-17'); assert.equal(t.kpi_daily[0].active_realtors_mtd, 1);
  await writeSnapshot(db, NOW + 3600000, {});
  assert.equal(t.kpi_daily.length, 1, 'the same date: the row is replaced');
  await writeSnapshot(db, T('2026-11-18T11:00:00Z'), {});
  assert.deepEqual(t.kpi_daily.map((r) => r.day), ['2026-11-17', '2026-11-18']);
  const c = await loadCommitment(db, T('2026-11-18T12:00:00Z'), {});
  assert.equal(c.history.exists, true); assert.equal(c.history.days, 2); assert.equal(c.history.series[11].activeRealtors, 1);
  assert.equal((await readSnapshots(db, NOW)).rows.length, 2);
});

test('the store reads no tenant name or owner token, tolerates a missing audit table, and honours the env list', async () => {
  const db = fakeSupabase(tables({ events: false }));
  const { data, missing } = await loadKpiData(db);
  assert.deepEqual(missing, ['application_events']);
  assert.deepEqual(Object.keys(data.applications[0]).sort(), ['email', 'id']);
  assert.deepEqual(Object.keys(data.profiles[0]).sort(), ['created_at', 'email', 'id', 'signup_source']);
  assert.ok(!JSON.stringify(data).includes('OWNERTOKENSECRET'));
  const selects = db.queries.filter((q) => q.table === 'applications').map((q) => q.select);
  assert.deepEqual([...new Set(selects)], ['id, email, prefill_source, prefill_profile_id, email_verified_at_submit, reused_checks']);
  const c = await loadCommitment(fakeSupabase(tables()), NOW, { KPI_EXCLUDE_PROFILE_IDS: 'R1' });
  assert.equal(c.kpis.activeRealtors.mtd, 0);
  assert.doesNotMatch(src('lib/kpiStore.js'), /'[^'\n]*(owner_token|cover_letter|full_name|phone)[^'\n]*'/, 'no query string names a tenant column');
});

test('the store pages past a thousand rows', async () => {
  const w = world(); w.realtor('R1').listing('L1', 'R1');
  for (let i = 0; i < 2300; i++) { w.d.applications.push({ id: `A${String(i).padStart(5, '0')}`, email: `t${i}@mail.ca` }); w.d.links.push({ id: `K${String(i).padStart(5, '0')}`, listing_id: 'L1', application_id: `A${String(i).padStart(5, '0')}`, created_at: '2026-11-05T15:00:00Z', state: 'submitted' }); }
  const db = fakeSupabase({ profiles: w.d.profiles, listings: w.d.listings, listing_applicants: w.d.links, applications: w.d.applications, application_events: [] });
  const { data } = await loadKpiData(db);
  assert.equal(data.links.length, 2300); assert.equal(new Set(data.links.map((k) => k.id)).size, 2300);
  assert.equal(db.queries.filter((q) => q.table === 'listing_applicants').length, 3);
});

// ── the email and the crons ─────────────────────────────────────────────────────────────────
test('the daily email: day n of 365, the six numbers with their targets, a link to the office, no fixed width', () => {
  const w = world(); fullMonth(w, '2026-11', { realtors: 4, rentals: 2 });
  const kpis = K.computeKpis(w.d, T('2026-11-19T13:00:00Z'), {});
  const mail = kpiEmail({ kpis, officeUrl: 'https://rentletter.ca/admin' });
  assert.equal(mail.subject, 'Rentletter, day 3 of 365');
  const rows = kpiRows(kpis);
  assert.equal(rows.length, 6);
  for (const [label, value, target] of rows) { assert.ok(mail.text.includes(`${label}: ${value} (target ${target})`), label); assert.ok(mail.html.includes(`Target ${target}`), label); }
  assert.ok(mail.text.includes('Active realtors, this month: 4 (target 30)')); assert.ok(mail.text.includes('Days left: 363 (target November 17, 2027)'));
  assert.ok(mail.text.includes('Tenants who applied twice (reuse not yet tracked): 0 (target 100)'));
  assert.ok(mail.text.includes('https://rentletter.ca/admin')); assert.ok(mail.html.includes('href="https://rentletter.ca/admin"'));
  assert.match(mail.html, /max-width:100%/); assert.doesNotMatch(mail.html, /<table|width="?\d{3}|width:\s*520px/);
  assert.match(mail.html, /name="viewport" content="width=device-width/);
});

const call = async (handler, { method = 'GET', authorization } = {}) => {
  const res = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: authorization ? { authorization } : {} }, res);
  return res;
};
const withEnv = async (vars, fn) => {
  const before = {}; for (const k of Object.keys(vars)) { before[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(vars)) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
};

test('both crons refuse anything without the CRON_SECRET header, and the email is skipped when KPI_EMAIL_TO is unset', async () => {
  const snapshot = (await import('../pages/api/cron/kpi-snapshot.js')).default;
  const email = (await import('../pages/api/cron/kpi-email.js')).default;
  for (const handler of [snapshot, email]) {
    await withEnv({ CRON_SECRET: 'test-cron-secret', KPI_EMAIL_TO: 'founder@mail.ca' }, async () => {
      assert.equal((await call(handler)).code, 401, 'no header');
      assert.equal((await call(handler, { authorization: 'Bearer wrong' })).code, 401, 'the wrong secret');
      assert.equal((await call(handler, { authorization: 'test-cron-secret' })).code, 401, 'the secret without Bearer');
      assert.equal((await call(handler, { method: 'POST', authorization: 'Bearer test-cron-secret' })).code, 405);
    });
    await withEnv({ CRON_SECRET: null }, async () => { assert.equal((await call(handler, { authorization: 'Bearer ' })).code, 503, 'no secret set: refused'); });
  }
  await withEnv({ CRON_SECRET: 'test-cron-secret', KPI_EMAIL_TO: null }, async () => {
    const r = await call(email, { authorization: 'Bearer test-cron-secret' });
    assert.equal(r.code, 200); assert.deepEqual(r.body, { ok: true, skipped: 'KPI_EMAIL_TO is not set' });
  });
  const text = src('pages/api/cron/kpi-email.js');
  assert.ok(text.indexOf('cronGate(req)') > 0 && text.indexOf('cronGate(req)') < text.indexOf('process.env.KPI_EMAIL_TO') && text.indexOf('process.env.KPI_EMAIL_TO') < text.indexOf('emails.send('), 'the gate, then the address, then the send');
  assert.doesNotMatch(text, /to: ['"`][^'"`]*@/, 'no address is written in the route');
  assert.doesNotMatch(src('lib/kpiEmail.js'), /@(gmail|rentletter)\./);
});

test('vercel.json runs each cron in the two UTC hours that are 06:00 and 08:00 in Toronto, and the route keeps the one that is', () => {
  const crons = JSON.parse(src('vercel.json')).crons;
  const of = (name) => crons.filter((c) => c.path.startsWith(`/api/cron/${name}`)).map((c) => c.schedule).sort();
  assert.deepEqual(of('kpi-snapshot'), ['0 10 * * *', '0 11 * * *']);
  assert.deepEqual(of('kpi-email'), ['0 12 * * *', '0 13 * * *']);
  // Daylight time: 10:00 UTC is 06:00, 11:00 UTC is 07:00. Standard time: 11:00 UTC is 06:00.
  assert.deepEqual([K.torontoHour(T('2027-07-01T10:00:00Z')), K.torontoHour(T('2027-07-01T11:00:00Z'))], [6, 7]);
  assert.deepEqual([K.torontoHour(T('2027-01-15T10:00:00Z')), K.torontoHour(T('2027-01-15T11:00:00Z'))], [5, 6]);
  assert.deepEqual([K.torontoHour(T('2027-07-01T12:00:00Z')), K.torontoHour(T('2027-01-15T13:00:00Z'))], [8, 8]);
  assert.match(src('pages/api/cron/kpi-snapshot.js'), /torontoHour\(now\) !== SNAPSHOT_HOUR/); assert.match(src('pages/api/cron/kpi-snapshot.js'), /SNAPSHOT_HOUR = 6;/);
  assert.match(src('pages/api/cron/kpi-email.js'), /torontoHour\(now\) !== EMAIL_HOUR/); assert.match(src('pages/api/cron/kpi-email.js'), /EMAIL_HOUR = 8;/);
});

test('the trigger sentence, word for word', () => {
  assert.equal(K.TRIGGER_SENTENCE, 'When 30 realtors close 50 rentals a month through Rentletter for three straight months, and 100 tenants have reused their profile, I go full time and raise. If not by November 17, 2027, I decide again on purpose.');
  // Shown as its two sentences, each on lines of its own, made from the constant and nothing else.
  assert.match(src('components/admin/Commitment.js'), /const TRIGGER_PARTS = TRIGGER_SENTENCE\.split\(\/\(\?<=\\\.\) \(\?=\[A-Z\]\)\/\);/);
  assert.match(src('components/admin/Commitment.js'), /<p className="cm-trigger">\{TRIGGER_PARTS\.map\(\(t, i\) => <span key=\{i\} className="cm-trigger-s">\{i \? ' ' : ''\}\{t\}<\/span>\)\}<\/p>/);
  assert.deepEqual(K.TRIGGER_SENTENCE.split(/(?<=\.) (?=[A-Z])/), ['When 30 realtors close 50 rentals a month through Rentletter for three straight months, and 100 tenants have reused their profile, I go full time and raise.', 'If not by November 17, 2027, I decide again on purpose.'], 'two sentences, the words unchanged');
});

// ── 1d, counted from the record (db/014-prefill-record.sql, lib/prefillRecord.js) ─────────────
// One application: where its answers came from, the profile, and when its email was proved.
const PROVED_AT = '2026-11-03T15:00:00Z';
const fresh = { prefill_source: 'none', prefill_profile_id: null, email_verified_at_submit: null, reused_checks: null };
const legacy = { prefill_source: null, prefill_profile_id: null, email_verified_at_submit: null, reused_checks: null };
const reused = (profile, over = {}) => ({ prefill_source: 'profile', prefill_profile_id: profile, email_verified_at_submit: PROVED_AT, reused_checks: [], ...over });
function tracked() {
  const w = world(); w.d.prefillTracked = true;
  const submit = (listing, at, email, record) => { const link = w.submit(listing, at, email); Object.assign(w.d.applications[w.d.applications.length - 1], record); return link; };
  return { w, submit };
}

test('true reuse: a fresh application, a prefilled one, an unproved email and a legacy row', () => {
  const { w, submit } = tracked(); w.realtor('R1').listing('L1', 'R1').listing('L2', 'R1');
  submit('L1', '2026-11-04T15:00:00Z', 'maya@mail.ca', fresh);
  assert.deepEqual(K.profileReuse(w.d), { count: 0, tracked: true, label: null, withDocuments: 0 }, 'typed fresh: nobody reused anything, and the label is gone');
  submit('L2', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya'));
  assert.deepEqual(K.profileReuse(w.d), { count: 1, tracked: true, label: null, withDocuments: 0 }, 'filled from her profile, her email proved at submit: one tenant');
  submit('L1', '2026-11-06T15:00:00Z', 'omar@mail.ca', reused('P-omar', { email_verified_at_submit: null }));
  assert.equal(K.profileReuse(w.d).count, 1, 'filled from a profile but the email was not proved at submit: not counted');
  // A legacy tenant on two listings: the old count would have taken them; the record does not know.
  submit('L1', '2026-05-02T15:00:00Z', 'lena@mail.ca', legacy); submit('L2', '2026-09-02T15:00:00Z', 'lena@mail.ca', legacy);
  assert.equal(K.profileReuse(w.d).count, 1, 'null is unknown, never a reuse');
  // The other sources are not the tenant reusing a profile.
  submit('L1', '2026-11-07T15:00:00Z', 'ivy@mail.ca', { ...fresh, prefill_source: 'previous_application', email_verified_at_submit: PROVED_AT });
  submit('L1', '2026-11-07T15:00:00Z', 'noor@mail.ca', { ...fresh, prefill_source: 'pipeline_invite', email_verified_at_submit: PROVED_AT });
  submit('L1', '2026-11-07T15:00:00Z', 'sam@mail.ca', { ...fresh, email_verified_at_submit: PROVED_AT });
  assert.equal(K.profileReuse(w.d).count, 1, 'one old application, a realtor\'s invite, and a proved email typed fresh: none is a reuse');
  submit('L1', '2026-11-08T15:00:00Z', 'kai@mail.ca', reused('P-kai', { prefill_source: 'pass_on' }));
  assert.equal(K.profileReuse(w.d).count, 2, 'a pass on made from the profile counts');
  submit('L1', '2026-11-08T15:00:00Z', 'zoe@mail.ca', { ...reused('P-zoe'), prefill_profile_id: null });
  assert.equal(K.profileReuse(w.d).count, 2, 'a source with no profile names nobody');
  // The stricter number beside it: a reuse that carried a document check.
  submit('L2', '2026-11-09T15:00:00Z', 'kai@mail.ca', reused('P-kai', { reused_checks: ['income_annual_gross'] }));
  assert.deepEqual(K.profileReuse(w.d), { count: 2, tracked: true, label: null, withDocuments: 1 });
});

test('true reuse counts a tenant once: two listings of one realtor, or two realtors', () => {
  const one = tracked(); one.w.realtor('R1').listing('L1', 'R1').listing('L2', 'R1');
  one.submit('L1', '2026-10-04T15:00:00Z', 'maya@mail.ca', reused('P-maya')); one.submit('L2', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya'));
  assert.equal(K.profileReuse(one.w.d).count, 1, 'the same tenant on two listings of one realtor: one');
  const two = tracked(); two.w.realtor('R1').realtor('R2').listing('L1', 'R1').listing('L3', 'R2');
  two.submit('L1', '2026-10-04T15:00:00Z', 'maya@mail.ca', reused('P-maya')); two.submit('L3', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya'));
  assert.equal(K.profileReuse(two.w.d).count, 1, 'the same tenant with two realtors: one');
  // One reuse is enough: no second listing is needed.
  const once = tracked(); once.w.realtor('R1').listing('L1', 'R1');
  once.submit('L1', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya'));
  assert.equal(K.profileReuse(once.w.d).count, 1, 'a single application filled from the profile is a reuse');
  // The tenant is the profile, not the email on the form.
  const renamed = tracked(); renamed.w.realtor('R1').listing('L1', 'R1').listing('L2', 'R1');
  renamed.submit('L1', '2026-10-04T15:00:00Z', 'maya@mail.ca', reused('P-maya')); renamed.submit('L2', '2026-11-06T15:00:00Z', 'maya.k@mail.ca', reused('P-maya'));
  assert.equal(K.profileReuse(renamed.w.d).count, 1, 'one profile under two addresses: one');
});

test('true reuse leaves out the accounts and the applications every other metric leaves out', () => {
  const { w, submit } = tracked(); w.realtor('R1').realtor('R2', { email: 'x@example.com' }).realtor('R3').listing('L1', 'R1').listing('L2', 'R2').listing('L3', 'R3');
  submit('L2', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya')); // on a test account's listing
  submit('L1', '2026-11-06T15:00:00Z', 'qa@example.com', reused('P-qa')); // a test tenant
  submit('L3', '2026-11-06T15:00:00Z', 'omar@mail.ca', reused('P-omar')); // on a listing counted out by the env list
  const draft = submit('L1', '2026-11-06T15:00:00Z', 'lena@mail.ca', reused('P-lena')); w.d.links.find((k) => k.id === draft).state = 'draft'; // never submitted
  assert.equal(K.profileReuse(w.d, { excludeIds: K.parseExcludeIds('R3') }).count, 0);
  assert.equal(K.profileReuse(w.d).count, 1, 'without the env list R3\'s listing counts');
});

test('the record at a fixed clock: the snapshot row, the tile and the email say tracked', async () => {
  const { w, submit } = tracked(); w.realtor('R1').listing('L1', 'R1').listing('L2', 'R1');
  submit('L1', '2026-11-04T15:00:00Z', 'maya@mail.ca', fresh); submit('L2', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya'));
  const NOON = T('2026-11-17T17:00:00Z');
  const k = K.computeKpis(w.d, NOON);
  assert.deepEqual(k.profileReuse, { count: 1, tracked: true, label: null, withDocuments: 0, target: 100 });
  const row = K.snapshotRow(k, NOON);
  assert.deepEqual([row.profile_reuse, row.profile_reuse_tracked], [1, true]);
  // The tile (components/admin/Commitment.js, JSX: read as source): tracked shows the count with
  // "tenants, all time" and the stricter number beside it; untracked keeps the old label.
  assert.ok(src('components/admin/Commitment.js').includes("note: k.profileReuse.tracked ? 'tenants, all time' : k.profileReuse.label, pairs: k.profileReuse.tracked ? [['With documents', k.profileReuse.withDocuments ?? 0]] : undefined,"), 'the tile drops "applied twice (reuse not yet tracked)" once tracked');
  const mail = kpiEmail({ kpis: k, officeUrl: 'https://rentletter.ca/admin' });
  assert.ok(mail.text.includes('Tenants who reused their profile: 1 (target 100)')); assert.ok(!mail.text.includes('not yet tracked'));
  // The same rows before the record exists: the old count, with its label.
  const before = { ...w.d, prefillTracked: false };
  assert.deepEqual(K.profileReuse(before), { count: 1, tracked: false, label: 'applied twice (reuse not yet tracked)' });
  assert.equal(K.computeKpis(before, NOON).profileReuse.label, 'applied twice (reuse not yet tracked)');
});

test('the store reads the record once db/014 has run, and the old columns alone before it', async () => {
  const withRecord = tables(); withRecord.applications = withRecord.applications.map((a, i) => ({ ...a, ...(i === 0 ? reused('P-maya') : legacy), prefill_profile_revision: i === 0 ? 2 : null }));
  const { data, missing } = await loadKpiData(fakeSupabase(withRecord));
  assert.equal(data.prefillTracked, true); assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(data.applications[0]).sort(), ['email', 'email_verified_at_submit', 'id', 'prefill_profile_id', 'prefill_source', 'reused_checks']);
  assert.ok(!JSON.stringify(data).includes('OWNERTOKENSECRET'));
  const c = await loadCommitment(fakeSupabase(withRecord), NOW, {});
  assert.deepEqual([c.kpis.profileReuse.count, c.kpis.profileReuse.tracked], [1, true]);
  // Before db/014: PostgREST refuses the unknown column, the store reads id and email, and the old count stands.
  const refuses = fakeSupabase(tables(), { failWhen: (q) => (q.table === 'applications' && /prefill_source/.test(q.select || '') ? { code: '42703', message: 'column applications.prefill_source does not exist' } : null) });
  const old = await loadKpiData(refuses);
  assert.equal(old.data.prefillTracked, false); assert.deepEqual(Object.keys(old.data.applications[0]).sort(), ['email', 'id']);
  assert.deepEqual(K.profileReuse(old.data), { count: 0, tracked: false, label: 'applied twice (reuse not yet tracked)' });
});
