// The Lead Realtor Partner counts (lib/kpis.js partnerKpis, lib/kpiStore.js partnerSection) and
// the referral share with Invite a realtor (db/017-realtor-invites.sql). Pure functions of the
// rows and a clock; every month a calendar month in America/Toronto. One level only: a realtor
// invited by a realtor the partner invited is counted nowhere. Fixed clocks at the month
// boundary, in daylight time and in standard time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as K from '../lib/kpis.js';
import { loadKpiData, loadCommitment, partnerSection } from '../lib/kpiStore.js';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';
const { partnerTiles, partnerStartLine } = await import('../components/admin/partnerTiles.js');

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = (iso) => Date.parse(iso);

function world() {
  const d = { profiles: [], listings: [], links: [], events: [], applications: [], invites: [] };
  let seq = 0;
  const api = {
    d,
    // A realtor with one listing, L-<id>; by names who invited them.
    realtor(id, by = null, over = {}) { d.profiles.push({ id, email: `${id}@brokerage.ca`, created_at: '2026-01-10T15:00:00Z', signup_source: null, ...over }); d.listings.push({ id: `L-${id}`, profile_id: id }); if (by) d.invites.push({ id, invited_by: by }); return api; },
    listing(id, profileId) { d.listings.push({ id, profile_id: profileId }); return api; },
    submit(listingId, at) { seq += 1; d.applications.push({ id: `A${seq}`, email: `tenant${seq}@mail.ca` }); d.links.push({ id: `K${seq}`, listing_id: listingId, application_id: `A${seq}`, created_at: at, state: 'submitted' }); return `K${seq}`; },
    move(linkId, to, at, from = 'shortlisted') { d.events.push({ listing_applicant_id: linkId, from_state: from, to_state: to, created_at: at }); return api; },
    // A listing of this realtor's with a tenant confirmed at `at`.
    close(realtor, at, n = '') { const l = `L-${realtor}${n}`; if (!d.listings.some((x) => x.id === l)) d.listings.push({ id: l, profile_id: realtor }); const k = api.submit(l, at); api.move(k, 'accepted', at); return k; },
  };
  return api;
}
// The partner P invited A and B; A invited C (a second level); D is nobody's.
const tree = () => world().realtor('P').realtor('A', 'P').realtor('B', 'P').realtor('C', 'A').realtor('D');

test('one level only: the partner\'s own rentals, the rentals of realtors the partner invited, and nobody further along', () => {
  const w = tree(); const at = '2026-10-15T16:00:00Z';
  w.close('P', at); w.close('P', at, '-2');           // the partner: 2
  w.close('A', at); w.close('B', at); w.close('B', at, '-2'); // invited: 3
  w.close('C', at); w.close('C', at, '-2');           // invited by A: the partner's second level
  w.close('D', at);                                   // nobody's
  const now = T('2026-11-17T17:00:00Z');
  assert.deepEqual(K.invitedRealtorIds(w.d, 'P').sort(), ['A', 'B'], 'C was invited by A, not by the partner');
  const p = K.partnerKpis(w.d, 'P', now);
  assert.equal(p.found, true); assert.equal(p.invited, 2);
  assert.deepEqual(p.rentals.partner, { toDate: 2, mtd: 0, last: 2 });
  assert.deepEqual(p.rentals.invited, { toDate: 3, mtd: 0, last: 3 });
  assert.deepEqual(p.rentals.total, { toDate: 5, mtd: 0, last: 5 }, 'C\'s two and D\'s one are in no figure');
  assert.deepEqual(p.rentals.others, { toDate: 3, mtd: 0, last: 3 }, 'of the total, the ones not from the partner\'s own listings');
  assert.equal(K.rentalsClosed(w.d, '2026-10'), 8, 'the company wide count still holds all eight');
  // A is a partner in their own right only for the one realtor A invited.
  const a = K.partnerKpis(w.d, 'A', now);
  assert.equal(a.invited, 1); assert.deepEqual(a.rentals.total, { toDate: 3, mtd: 0, last: 3 }); assert.deepEqual(a.rentals.others, { toDate: 2, mtd: 0, last: 2 });
  // Nobody is their own invitee, even if a row says so.
  const self = world().realtor('P'); self.d.invites.push({ id: 'P', invited_by: 'P' }); self.close('P', at);
  assert.deepEqual(K.invitedRealtorIds(self.d, 'P'), []);
  assert.deepEqual(K.partnerKpis(self.d, 'P', now).rentals.total, { toDate: 1, mtd: 0, last: 1 }, 'the partner\'s rental is counted once');
  // A chain never loops or deepens: two realtors who name each other each have one.
  const loop = world().realtor('X', 'Y').realtor('Y', 'X');
  assert.deepEqual(K.invitedRealtorIds(loop.d, 'X'), ['Y']); assert.deepEqual(K.invitedRealtorIds(loop.d, 'Y'), ['X']);
  assert.match(src('lib/kpis.js'), /ONE LEVEL ONLY/);
});

test('a closed rental is the same thing as in the commitment: confirmed, less the ones that fell through', () => {
  const w = tree(); const now = T('2026-11-17T17:00:00Z');
  const k1 = w.close('A', '2026-10-10T16:00:00Z');
  w.move(k1, 'fell_through', '2026-10-20T16:00:00Z', 'accepted'); // closed and fell through in October
  const k2 = w.close('B', '2026-10-10T16:00:00Z');
  w.move(k2, 'withdrawn_by_applicant', '2026-11-05T16:00:00Z', 'accepted'); // closed in October, the tenant withdrew in November
  const k3 = w.close('B', '2026-09-10T16:00:00Z', '-2');
  w.move(k3, 'fell_through', '2026-09-12T16:00:00Z', 'accepted'); w.move(k3, 'accepted', '2026-10-03T16:00:00Z'); // fell through, then confirmed again
  w.submit('L-A', '2026-11-02T16:00:00Z'); // an application alone closes nothing
  const p = K.partnerKpis(w.d, 'P', now);
  assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 0, last: 2 }, 'October left two closed; today only the one confirmed again still stands');
  assert.equal(p.rentals.invited.last, K.rentalsClosed(w.d, '2026-10'), 'the month figure is the commitment\'s own count for those listings');
  assert.deepEqual(p.rentals.partner, { toDate: 0, mtd: 0, last: 0 });
  // A move after the clock is not counted yet.
  const early = K.partnerKpis(w.d, 'P', T('2026-10-15T16:00:00Z'));
  assert.deepEqual(early.rentals.invited, { toDate: 3, mtd: 3, last: 0 }, 'on October 15 neither fall had happened, and the September fall had been confirmed again');
});

test('the month boundary is midnight in Toronto, in daylight time and in standard time', () => {
  // Daylight time: November 1, 2026 starts at 04:00 UTC.
  let w = tree();
  w.close('P', '2026-11-01T03:59:59Z'); // 23:59:59 on October 31 in Toronto
  w.close('A', '2026-11-01T04:00:00Z'); // midnight, November 1
  let p = K.partnerKpis(w.d, 'P', T('2026-11-17T17:00:00Z'));
  assert.deepEqual(p.rentals.partner, { toDate: 1, mtd: 0, last: 1 }, 'one second before midnight belongs to October');
  assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 1, last: 0 }, 'midnight belongs to November');
  assert.equal(p.month, '2026-11'); assert.equal(p.lastMonth, '2026-10');
  // The clock itself one second either side of midnight: what was this month becomes last month.
  p = K.partnerKpis(w.d, 'P', T('2026-12-01T04:59:59Z'));
  assert.equal(p.month, '2026-11'); assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 1, last: 0 });
  p = K.partnerKpis(w.d, 'P', T('2026-12-01T05:00:00Z'));
  assert.equal(p.month, '2026-12'); assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 0, last: 1 }); assert.deepEqual(p.rentals.partner, { toDate: 1, mtd: 0, last: 0 });
  // Standard time: January 1, 2027 starts at 05:00 UTC.
  w = tree();
  w.close('B', '2027-01-01T04:59:59Z'); w.close('B', '2027-01-01T05:00:00Z', '-2');
  p = K.partnerKpis(w.d, 'P', T('2027-01-20T17:00:00Z'));
  assert.deepEqual(p.rentals.invited, { toDate: 2, mtd: 1, last: 1 });
});

test('active invited realtors: a submitted application in each of the three complete months before this one', () => {
  const now = T('2026-11-17T17:00:00Z');
  assert.deepEqual(K.lastThreeMonths(now), ['2026-08', '2026-09', '2026-10']);
  const w = world().realtor('P').realtor('A', 'P').realtor('B', 'P').realtor('E', 'P').realtor('F', 'P').realtor('C', 'A').realtor('D');
  const each = (r, months) => { for (const m of months) w.submit(`L-${r}`, `${m}-15T16:00:00Z`); };
  each('A', ['2026-08', '2026-09', '2026-10']);            // active
  each('B', ['2026-08', '2026-10', '2026-11']);            // missed September
  each('E', ['2026-09', '2026-10', '2026-11']);            // this month does not stand in for August
  w.listing('L-F-2', 'F'); w.submit('L-F', '2026-08-03T16:00:00Z'); w.submit('L-F-2', '2026-09-03T16:00:00Z'); w.submit('L-F-2', '2026-10-03T16:00:00Z'); // active across two listings
  each('C', ['2026-08', '2026-09', '2026-10']);            // the second level: not the partner's
  each('D', ['2026-08', '2026-09', '2026-10']);            // nobody's
  each('P', ['2026-08', '2026-09', '2026-10']);            // the partner is not an invited realtor
  const p = K.partnerKpis(w.d, 'P', now);
  assert.equal(p.invited, 4);
  assert.deepEqual(p.activeInvited, { count: 2, months: ['2026-08', '2026-09', '2026-10'] });
  assert.deepEqual(K.activeEachMonth(w.d, K.invitedRealtorIds(w.d, 'P'), now).sort(), ['A', 'F']);
  // At the boundary. An application at 23:59:59 on August 31 (Toronto, daylight time) is August's; at midnight it is September's.
  const edge = world().realtor('P').realtor('A', 'P').realtor('B', 'P');
  edge.submit('L-A', '2026-09-01T03:59:59Z'); edge.submit('L-A', '2026-09-20T16:00:00Z'); edge.submit('L-A', '2026-10-20T16:00:00Z');
  edge.submit('L-B', '2026-09-01T04:00:00Z'); edge.submit('L-B', '2026-10-20T16:00:00Z'); // nothing in August
  assert.deepEqual(K.activeEachMonth(edge.d, ['A', 'B'], now), ['A']);
  // The window moves with the clock at midnight Toronto time (standard time: 05:00 UTC).
  assert.deepEqual(K.lastThreeMonths(T('2026-12-01T04:59:59Z')), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(K.lastThreeMonths(T('2026-12-01T05:00:00Z')), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(K.lastThreeMonths(T('2027-02-10T17:00:00Z')), ['2026-11', '2026-12', '2027-01'], 'across the year');
  assert.deepEqual(K.activeEachMonth(edge.d, ['A', 'B'], T('2026-12-01T05:00:00Z')), [], 'neither received an application in November');
  // A draft is not a submitted application.
  const draft = world().realtor('P').realtor('A', 'P');
  for (const m of ['2026-08', '2026-09']) draft.submit('L-A', `${m}-15T16:00:00Z`);
  draft.d.links.push({ id: 'KD', listing_id: 'L-A', application_id: 'AD', created_at: '2026-10-15T16:00:00Z', state: 'draft' });
  assert.equal(K.partnerKpis(draft.d, 'P', now).activeInvited.count, 0);
});

test('the start date: a rental the day before does not count, a rental the day of does', () => {
  // KPI_PARTNER_START 2026-11-17, a Toronto date in standard time: the day begins at 05:00 UTC.
  const start = '2026-11-17'; const now = T('2026-12-10T17:00:00Z');
  const w = tree();
  w.close('P', '2026-11-16T16:00:00Z');        // the day before, the partner
  w.close('P', '2026-11-17T16:00:00Z', '-2');  // the day of, the partner
  w.close('A', '2026-11-17T04:59:59Z');        // 23:59:59 on the 16th in Toronto: the day before
  w.close('B', '2026-11-17T05:00:00Z');        // midnight on the 17th in Toronto: the day of
  w.close('B', '2026-10-03T16:00:00Z', '-2');  // weeks before
  w.close('C', '2026-11-20T16:00:00Z');        // after the start, but the second level
  const p = K.partnerKpis(w.d, 'P', now, { start });
  assert.equal(p.start, start);
  assert.deepEqual(p.rentals.partner, { toDate: 1, mtd: 0, last: 1 }, 'the partner: the day of counts, the day before does not');
  assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 0, last: 1 }, 'invited realtors: midnight Toronto time is the line');
  assert.deepEqual(p.rentals.total, { toDate: 2, mtd: 0, last: 2 });
  assert.deepEqual(p.rentals.others, { toDate: 1, mtd: 0, last: 1 }, 'the split from other realtors starts on the same day');
  // Without a start date the same rows are all time.
  const all = K.partnerKpis(w.d, 'P', now);
  assert.equal(all.start, null);
  assert.deepEqual(all.rentals.partner, { toDate: 2, mtd: 0, last: 2 }); assert.deepEqual(all.rentals.invited, { toDate: 3, mtd: 0, last: 2 }); assert.deepEqual(all.rentals.total, { toDate: 5, mtd: 0, last: 4 });
  // One day later as the start date: the rentals of the 17th are now the day before.
  assert.deepEqual(K.partnerKpis(w.d, 'P', now, { start: '2026-11-18' }).rentals.total, { toDate: 0, mtd: 0, last: 0 });
  // One day earlier: the rentals of the 16th are the day of.
  assert.deepEqual(K.partnerKpis(w.d, 'P', now, { start: '2026-11-16' }).rentals.total, { toDate: 4, mtd: 0, last: 4 });
  // In daylight time the day begins at 04:00 UTC.
  const d = tree(); d.close('P', '2026-07-01T03:59:59Z'); d.close('P', '2026-07-01T04:00:00Z', '-2');
  assert.equal(K.partnerKpis(d.d, 'P', now, { start: '2026-07-01' }).rentals.partner.toDate, 1);
  // A move from before the start date is not read at all: a rental closed before it is not counted
  // because nothing fell through afterwards, and one confirmed again after it is.
  const f = tree();
  const k = f.close('A', '2026-11-10T16:00:00Z'); f.move(k, 'fell_through', '2026-11-12T16:00:00Z', 'accepted'); f.move(k, 'accepted', '2026-11-19T16:00:00Z');
  const k2 = f.close('B', '2026-11-10T16:00:00Z'); f.move(k2, 'fell_through', '2026-11-19T16:00:00Z', 'accepted');
  assert.deepEqual(K.partnerKpis(f.d, 'P', now, { start }).rentals.invited, { toDate: 1, mtd: 0, last: 1 });
});

test('the start date: an invited realtor is active only on applications from that date', () => {
  const now = T('2026-11-17T17:00:00Z'); // the three months: August, September, October
  const w = world().realtor('P').realtor('A', 'P').realtor('B', 'P');
  w.submit('L-A', '2026-08-10T16:00:00Z'); w.submit('L-A', '2026-09-10T16:00:00Z'); w.submit('L-A', '2026-10-10T16:00:00Z');
  w.submit('L-B', '2026-08-20T16:00:00Z'); w.submit('L-B', '2026-09-10T16:00:00Z'); w.submit('L-B', '2026-10-10T16:00:00Z');
  assert.equal(K.partnerKpis(w.d, 'P', now).activeInvited.count, 2, 'all time: both');
  assert.equal(K.partnerKpis(w.d, 'P', now, { start: '2026-08-10' }).activeInvited.count, 2, 'an application on the start date counts');
  assert.equal(K.partnerKpis(w.d, 'P', now, { start: '2026-08-11' }).activeInvited.count, 1, 'the day before the start date does not: A has nothing left in August');
  assert.deepEqual(K.activeEachMonth(w.d, ['A', 'B'], now, { start: '2026-08-11' }), ['B']);
  assert.equal(K.partnerKpis(w.d, 'P', now, { start: '2026-09-01' }).activeInvited.count, 0, 'a month before the start date can never be met');
  // The same line at midnight Toronto time (daylight time: 04:00 UTC).
  const e = world().realtor('P').realtor('A', 'P').realtor('B', 'P');
  for (const r of ['A', 'B']) { e.submit(`L-${r}`, '2026-09-10T16:00:00Z'); e.submit(`L-${r}`, '2026-10-10T16:00:00Z'); }
  e.submit('L-A', '2026-08-15T03:59:59Z'); e.submit('L-B', '2026-08-15T04:00:00Z');
  assert.deepEqual(K.activeEachMonth(e.d, ['A', 'B'], now, { start: '2026-08-15' }), ['B']);
});

test('the start date is a real Toronto date or it is none, and the store reads it from KPI_PARTNER_START', () => {
  for (const good of ['2026-11-17', '2027-02-28', '2028-02-29', ' 2026-11-17 ']) assert.equal(K.parsePartnerStart(good), good.trim(), good);
  for (const bad of ['', null, undefined, '2026-11-31', '2027-02-29', '2026-13-01', '17-11-2026', '2026/11/17', 'November 17, 2026', '2026-11-17T05:00:00Z', '20261117']) assert.equal(K.parsePartnerStart(bad), null, String(bad));
  const NOW = T('2026-12-10T17:00:00Z');
  const w = tree(); w.close('P', '2026-11-16T16:00:00Z'); w.close('A', '2026-11-17T16:00:00Z');
  const data = { ...w.d, invitesTracked: true };
  const unset = partnerSection(data, NOW, { KPI_PARTNER_PROFILE_ID: 'P' });
  assert.equal(unset.start, null); assert.equal(unset.startSet, false); assert.equal(unset.startValid, true);
  assert.deepEqual(unset.rentals.total, { toDate: 2, mtd: 0, last: 2 }, 'unset: all time');
  const set = partnerSection(data, NOW, { KPI_PARTNER_PROFILE_ID: 'P', KPI_PARTNER_START: '2026-11-17' });
  assert.equal(set.start, '2026-11-17'); assert.equal(set.startSet, true); assert.equal(set.startValid, true);
  assert.deepEqual(set.rentals.partner, { toDate: 0, mtd: 0, last: 0 }, 'the partner\'s rental was the day before');
  assert.deepEqual(set.rentals.total, { toDate: 1, mtd: 0, last: 1 });
  const wrong = partnerSection(data, NOW, { KPI_PARTNER_PROFILE_ID: 'P', KPI_PARTNER_START: 'Nov 17' });
  assert.equal(wrong.start, null); assert.equal(wrong.startSet, true); assert.equal(wrong.startValid, false);
  assert.deepEqual(wrong.rentals.total, { toDate: 2, mtd: 0, last: 2 }, 'not a date: all time, and said so');
  assert.deepEqual(partnerSection(data, NOW, { KPI_PARTNER_START: '2026-11-17' }), { configured: false }, 'a start date alone configures nothing');
  // What the office says above the tiles, and under each count.
  assert.equal(partnerStartLine(set), 'Counted from November 17, 2026, Toronto time.');
  assert.equal(partnerStartLine(unset), 'No start date is set (KPI_PARTNER_START). These counts are all time.');
  assert.equal(partnerStartLine(wrong), 'KPI_PARTNER_START is not a date (YYYY-MM-DD). These counts are all time.');
  assert.deepEqual(partnerTiles(set).slice(0, 3).map((t) => t.note), ['rentals, since the start date', 'rentals, since the start date, one level only', 'rentals, since the start date']);
  assert.deepEqual(partnerTiles(unset).slice(0, 3).map((t) => t.note), ['rentals, all time', 'rentals, all time, one level only', 'rentals, all time']);
  assert.deepEqual(partnerTiles(set).map((t) => [t.key, t.value]), [['partner', 0], ['invited', 1], ['total', 1], ['others', 1], ['active', 0]]);
  assert.match(src('components/admin/Commitment.js'), /\{data\.partner\.configured && data\.partner\.found && <p className="ad-quiet cm-partner-note" data-partner-start=\{data\.partner\.start \|\| ''\} style=\{\{ marginBottom: 12 \}\}>\{partnerStartLine\(data\.partner\)\}<\/p>\}/);
});

test('the accounts counted out stay out, and a partner who is not a counted realtor is not found', () => {
  const now = T('2026-11-17T17:00:00Z'); const at = '2026-10-15T16:00:00Z';
  const w = world().realtor('P').realtor('A', 'P').realtor('QA', 'P', { email: 'qa@example.com' }).realtor('X', 'P');
  w.close('A', at); w.close('QA', at); w.close('X', at);
  const p = K.partnerKpis(w.d, 'P', now, { excludeIds: K.parseExcludeIds('x') });
  assert.equal(p.invited, 1, 'a test account and an excluded profile are not invited realtors');
  assert.deepEqual(p.rentals.invited, { toDate: 1, mtd: 0, last: 1 });
  for (const id of ['nobody', '', null, undefined]) {
    const none = K.partnerKpis(w.d, id, now);
    assert.equal(none.found, false); assert.equal(none.invited, 0); assert.deepEqual(none.rentals.total, { toDate: 0, mtd: 0, last: 0 }); assert.equal(none.activeInvited.count, 0);
  }
  assert.equal(K.partnerKpis(w.d, 'P', now, { excludeIds: K.parseExcludeIds('P') }).found, false);
  // No invites recorded at all (before db/017): the partner's own rentals, nobody invited.
  const bare = world().realtor('P').realtor('A'); delete bare.d.invites; bare.close('P', at); bare.close('A', at);
  const b = K.partnerKpis(bare.d, 'P', now);
  assert.equal(b.invited, 0); assert.deepEqual(b.rentals.total, { toDate: 1, mtd: 0, last: 1 }); assert.deepEqual(b.rentals.others, { toDate: 0, mtd: 0, last: 0 });
});

test('referral share: a realtor who signed up through an invite link is a referral', () => {
  const born = '2026-11-05T15:00:00Z';
  const w = world();
  w.realtor('S', null, { created_at: '2026-01-10T15:00:00Z', signup_source: 'direct' })
    .realtor('R1', 'S', { created_at: born, signup_source: 'ref:K7M2Q9XW4TPB3HNC' }) // through an invite link
    .realtor('R2', 'S', { created_at: born, signup_source: null })                   // invited, the word unknown: known, and a referral
    .realtor('R3', 'S', { created_at: born, signup_source: 'direct' })               // invited: a referral whatever the word says
    .realtor('R4', null, { created_at: born, signup_source: 'direct' })
    .realtor('R5', null, { created_at: born, signup_source: 'invite' })              // the founder's personal invitation is not a referral
    .realtor('R6', null, { created_at: born, signup_source: null })                  // unknown
    .realtor('R7', 'S', { created_at: born, signup_source: 'direct', email: 'qa@example.com' }); // a test account
  const r = K.referralShare(w.d, '2026-11');
  assert.deepEqual({ signups: r.signups, known: r.known, unknown: r.unknown, referral: r.referral }, { signups: 6, known: 5, unknown: 1, referral: 3 });
  assert.equal(r.share, 3 / 5);
  // Without the invites the same rows read as before: only the word counts.
  const before = K.referralShare({ ...w.d, invites: undefined }, '2026-11');
  assert.deepEqual({ signups: before.signups, known: before.known, unknown: before.unknown, referral: before.referral }, { signups: 6, known: 4, unknown: 2, referral: 1 });
  // A row naming a realtor as their own inviter is not a referral.
  const self = world().realtor('Z', null, { created_at: born, signup_source: 'direct' }); self.d.invites.push({ id: 'Z', invited_by: 'Z' });
  assert.equal(K.referralShare(self.d, '2026-11').referral, 0);
  assert.equal(K.computeKpis(w.d, T('2026-11-17T17:00:00Z'), {}).referralShare.mtd.referral, 3, 'the tile, the snapshot and the email read the same count');
});

test('the store: the invites beside the profiles, the partner by KPI_PARTNER_PROFILE_ID, and nothing when it is unset', async () => {
  const NOW = T('2026-11-17T17:00:00Z');
  const w = tree(); w.close('P', '2026-10-15T16:00:00Z'); w.close('A', '2026-10-15T16:00:00Z'); w.close('C', '2026-10-15T16:00:00Z');
  const by = Object.fromEntries(w.d.invites.map((i) => [i.id, i.invited_by]));
  const t = (withColumn) => ({
    profiles: w.d.profiles.map((p) => ({ ...p, full_name: 'A Realtor', plan: 'founding', ...(withColumn ? { invite_code: null, invited_by: by[p.id] || null } : {}) })),
    listings: w.d.listings, listing_applicants: w.d.links, applications: w.d.applications, application_events: w.d.events.map((e, i) => ({ id: `E${i}`, ...e })),
  });
  const { data } = await loadKpiData(fakeSupabase(t(true)));
  assert.deepEqual(data.invites, [{ id: 'A', invited_by: 'P' }, { id: 'B', invited_by: 'P' }, { id: 'C', invited_by: 'A' }]);
  assert.equal(data.invitesTracked, true);
  assert.deepEqual(Object.keys(data.profiles[0]).sort(), ['created_at', 'email', 'id', 'signup_source'], 'a profile row is what it was');
  // Unset: not configured, and nothing else.
  for (const env of [{}, { KPI_PARTNER_PROFILE_ID: '' }, { KPI_PARTNER_PROFILE_ID: '   ' }]) assert.deepEqual(partnerSection(data, NOW, env), { configured: false });
  assert.deepEqual((await loadCommitment(fakeSupabase(t(true)), NOW, {})).partner, { configured: false });
  // Set: the counts.
  const c = await loadCommitment(fakeSupabase(t(true)), NOW, { KPI_PARTNER_PROFILE_ID: 'P' });
  assert.equal(c.partner.configured, true); assert.equal(c.partner.tracked, true); assert.equal(c.partner.found, true); assert.equal(c.partner.invited, 2);
  assert.deepEqual(c.partner.rentals.total, { toDate: 2, mtd: 0, last: 2 }); assert.deepEqual(c.partner.rentals.others, { toDate: 1, mtd: 0, last: 1 });
  assert.deepEqual(c.partner.activeInvited, { count: 0, months: ['2026-08', '2026-09', '2026-10'] });
  assert.ok(!JSON.stringify(c.partner).includes('A Realtor') && !JSON.stringify(c.partner).includes('@brokerage.ca'), 'numbers only: no realtor\'s name or email');
  // The exclusion list applies to the partner section as to everything else.
  assert.equal((await loadCommitment(fakeSupabase(t(true)), NOW, { KPI_PARTNER_PROFILE_ID: 'P', KPI_EXCLUDE_PROFILE_IDS: 'A' })).partner.invited, 1);
  // Before db/017: no invites, said so, the partner's own rentals still counted.
  const old = await loadCommitment(fakeSupabase(t(false)), NOW, { KPI_PARTNER_PROFILE_ID: 'P' });
  assert.equal(old.partner.tracked, false); assert.equal(old.partner.invited, 0); assert.deepEqual(old.partner.rentals.total, { toDate: 1, mtd: 0, last: 1 });
  // The office says so when the variable is unset, and draws nothing else in the section.
  const ui = src('components/admin/Commitment.js');
  assert.match(ui, /\{!data\.partner\.configured && <p className="ad-quiet cm-partner-note" data-partner-unset="">KPI_PARTNER_PROFILE_ID is not set\.<\/p>\}/);
  assert.equal((ui.match(/\{data\.partner\.configured && /g) || []).length, 4, 'every other part of the section needs the variable');
  assert.match(src('pages/api/admin/commitment.js'), /if \(!\(await requireAdmin\(req, res\)\)\) return;/);
});
