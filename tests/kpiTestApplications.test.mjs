// A test application never counts toward a number (lib/kpis.js isTestApplication, asked once, in
// scope): one from a test email (a +test address, the company's own domain, example.com and its
// kin), on anyone's listing. For each metric: with only test applications it reads zero, and with
// one real and one test application it counts one. Pure functions, fixed clocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as K from '../lib/kpis.js';

const T = (iso) => Date.parse(iso);
const NOW = T('2026-11-17T17:00:00Z');
const TEST = 'sarah+test@mail.ca';

// Realtors each with one listing, L-<id>; submit names the tenant's email.
function world() {
  const d = { profiles: [], listings: [], links: [], events: [], applications: [], invites: [] };
  let seq = 0;
  const api = {
    d,
    realtor(id, by = null) { d.profiles.push({ id, email: `${id}@brokerage.ca`, created_at: '2026-01-10T15:00:00Z', signup_source: null }); d.listings.push({ id: `L-${id}`, profile_id: id }); if (by) d.invites.push({ id, invited_by: by }); return api; },
    listing(id, profileId) { d.listings.push({ id, profile_id: profileId }); return api; },
    submit(listingId, at, email, over = {}) { seq += 1; d.applications.push({ id: `A${seq}`, email, ...over }); d.links.push({ id: `K${seq}`, listing_id: listingId, application_id: `A${seq}`, created_at: at, state: 'submitted' }); return `K${seq}`; },
    move(linkId, to, at, from = 'shortlisted') { d.events.push({ listing_applicant_id: linkId, from_state: from, to_state: to, created_at: at }); return api; },
    // A tenant confirmed on a listing at `at`.
    close(listingId, at, email) { const k = api.submit(listingId, at, email); api.move(k, 'accepted', at); return k; },
  };
  return api;
}
// A month that meets both targets (30 active realtors, 50 rentals closed), every application from
// email(i): R0 to R29, a listing each per rental.
function fullMonth(w, month, email) {
  const at = `${month}-15T16:00:00Z`;
  for (let i = 0; i < 30; i++) if (!w.d.profiles.some((p) => p.id === `R${i}`)) w.realtor(`R${i}`);
  for (let i = 0; i < 50; i++) { const l = `L-${month}-${i}`; w.listing(l, `R${i % 30}`); w.close(l, at, email(i)); }
}
const real = (i) => `tenant${i}@mail.ca`;
const fake = (i) => `tenant${i}+test@mail.ca`;

test('the one helper: a test application is one from a test email, by the test Profile reuse already used', () => {
  for (const email of ['sarah+test@mail.ca', 'sarah+test2@mail.ca', ' Sarah+TEST@mail.ca ', 'qa@rentletter.ca', 'qa@example.com', 'qa@example.org', 'qa@mail.test', 'qa@mail.invalid']) {
    assert.equal(K.isTestApplication({ id: 'A1', email }), true, email);
    assert.equal(K.isTestApplication({ id: 'A1', email }), K.isTestEmail(email), 'the same test as isTestEmail');
  }
  for (const email of ['sarah@mail.ca', 'test@mail.ca', 'sarah.test@mail.ca', 'contest+one@mail.ca']) assert.equal(K.isTestApplication({ id: 'A1', email }), false, email);
  assert.equal(K.isTestApplication({ id: 'A1', email: null }), false, 'an application with no email is real');
  assert.equal(K.isTestApplication({ id: 'A1' }), false);
  assert.equal(K.isTestApplication(null), false, 'a row that was not read is not known to be a test');
  // Asked in one place: scope takes the link out, and no metric asks about an email on its own.
  const code = readFileSync(new URL('../lib/kpis.js', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.equal((code.match(/isTestApplication/g) || []).length, 2, 'defined once, used once');
  assert.match(code, /const tests = new Set\(\(data\.applications \|\| \[\]\)\.filter\(isTestApplication\)/);
  assert.equal((code.match(/isTestEmail\(/g) || []).length, 2, 'isTestEmail: a profile\'s email, and the helper');
  // scope: the test application's link and its moves are out; the real one's stay.
  const w = world().realtor('R1');
  const t = w.close('L-R1', '2026-11-05T15:00:00Z', TEST); const r = w.close('L-R1', '2026-11-06T15:00:00Z', 'maya@mail.ca');
  const s = K.scope(w.d);
  assert.deepEqual(s.links.map((k) => k.id), [r]); assert.deepEqual(s.events.map((e) => e.listing_applicant_id), [r]);
  assert.ok(!s.listingOfLink.has(t));
});

test('active realtors: only test applications reads zero; one real and one test counts one', () => {
  const only = world().realtor('R1').realtor('R2');
  only.submit('L-R1', '2026-11-05T15:00:00Z', TEST); only.submit('L-R1', '2026-11-06T15:00:00Z', 'qa@example.com'); only.submit('L-R2', '2026-11-07T15:00:00Z', 'office@rentletter.ca');
  assert.equal(K.activeRealtors(only.d, '2026-11'), 0, 'a realtor whose only activity is test applications is not active');
  const mixed = world().realtor('R1').realtor('R2');
  mixed.submit('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); mixed.submit('L-R2', '2026-11-06T15:00:00Z', TEST);
  assert.equal(K.activeRealtors(mixed.d, '2026-11'), 1, 'R1 by the real one; R2 holds a test alone');
  // The real and the test application on the same listing: the realtor is active, once.
  const same = world().realtor('R1');
  same.submit('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); same.submit('L-R1', '2026-11-06T15:00:00Z', TEST);
  assert.equal(K.activeRealtors(same.d, '2026-11'), 1);
  // A real application last month and a test one this month: active last month only.
  const months = world().realtor('R1');
  months.submit('L-R1', '2026-10-20T15:00:00Z', 'maya@mail.ca'); months.submit('L-R1', '2026-11-06T15:00:00Z', TEST);
  assert.equal(K.activeRealtors(months.d, '2026-10'), 1); assert.equal(K.activeRealtors(months.d, '2026-11'), 0);
});

test('rentals closed: only test applications reads zero; one real and one test counts one', () => {
  const only = world().realtor('R1').listing('L-R1-2', 'R1');
  only.close('L-R1', '2026-11-05T15:00:00Z', TEST); only.close('L-R1-2', '2026-11-06T15:00:00Z', 'qa@example.com');
  assert.equal(K.rentalsClosed(only.d, '2026-11'), 0, 'a rental closed with a test applicant is not a closed rental');
  const mixed = world().realtor('R1').listing('L-R1-2', 'R1');
  mixed.close('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); mixed.close('L-R1-2', '2026-11-06T15:00:00Z', TEST);
  assert.equal(K.rentalsClosed(mixed.d, '2026-11'), 1);
  // On one listing: the real tenant confirmed, then a test application confirmed and fallen through
  // after it. The test moves are not read, so the listing stays closed, once.
  const same = world().realtor('R1');
  same.close('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca');
  const t = same.close('L-R1', '2026-11-06T15:00:00Z', TEST); same.move(t, 'fell_through', '2026-11-07T15:00:00Z', 'accepted');
  assert.equal(K.rentalsClosed(same.d, '2026-11'), 1);
  // And the other way: a real deal that fell through is not put back by a test confirm after it.
  const fell = world().realtor('R1');
  const r = fell.close('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); fell.move(r, 'fell_through', '2026-11-06T15:00:00Z', 'accepted');
  fell.close('L-R1', '2026-11-07T15:00:00Z', TEST);
  assert.equal(K.rentalsClosed(fell.d, '2026-11'), 0);
});

test('the streak: months met only by test applications read zero; a real month beside a test month counts one', () => {
  const only = world();
  for (const m of ['2026-08', '2026-09', '2026-10']) fullMonth(only, m, fake);
  assert.equal(K.activeRealtors(only.d, '2026-10'), 0); assert.equal(K.rentalsClosed(only.d, '2026-10'), 0);
  assert.equal(K.monthMet(only.d, '2026-10'), false);
  assert.equal(K.streak(only.d, NOW), 0);
  // October met by real applications, September by test ones alone: October counts, September ends it.
  const mixed = world();
  fullMonth(mixed, '2026-09', fake); fullMonth(mixed, '2026-10', real);
  assert.equal(K.monthMet(mixed.d, '2026-10'), true); assert.equal(K.monthMet(mixed.d, '2026-09'), false);
  assert.equal(K.streak(mixed.d, NOW), 1);
  // A month one short of each target without its test application is not met: 29 real active
  // realtors and a 30th by a test alone; 49 real rentals and a 50th closed with a test applicant.
  const short = world();
  fullMonth(short, '2026-10', (i) => (i === 29 || i === 49 ? fake(i) : real(i)));
  assert.equal(K.activeRealtors(short.d, '2026-10'), 29); assert.equal(K.rentalsClosed(short.d, '2026-10'), 48, 'rentals 29 and 49 were the test ones');
  assert.equal(K.streak(short.d, NOW), 0);
});

test('profile reuse: only test applications reads zero; one real and one test counts one, tracked and before the record', () => {
  const reused = (profile) => ({ prefill_source: 'profile', prefill_profile_id: profile, email_verified_at_submit: '2026-11-06T15:00:00Z', reused_checks: ['income'] });
  // The record (db/014): counted by the profile the form was filled from.
  const only = world().realtor('R1'); only.d.prefillTracked = true;
  only.submit('L-R1', '2026-11-06T15:00:00Z', TEST, reused('P-test')); only.submit('L-R1', '2026-11-06T15:00:00Z', 'qa@example.com', reused('P-qa'));
  assert.deepEqual(K.profileReuse(only.d), { count: 0, tracked: true, label: null, withDocuments: 0 });
  const mixed = world().realtor('R1'); mixed.d.prefillTracked = true;
  mixed.submit('L-R1', '2026-11-06T15:00:00Z', 'maya@mail.ca', reused('P-maya')); mixed.submit('L-R1', '2026-11-06T15:00:00Z', TEST, reused('P-test'));
  assert.deepEqual(K.profileReuse(mixed.d), { count: 1, tracked: true, label: null, withDocuments: 1 });
  // Before the record: tenants, by email, on two or more listings.
  const old = world().realtor('R1').realtor('R2');
  old.submit('L-R1', '2026-11-05T15:00:00Z', TEST); old.submit('L-R2', '2026-11-06T15:00:00Z', TEST);
  assert.equal(K.profileReuse(old.d).count, 0);
  old.submit('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); old.submit('L-R2', '2026-11-06T15:00:00Z', 'maya@mail.ca');
  assert.deepEqual(K.profileReuse(old.d), { count: 1, tracked: false, label: K.REUSE_LABEL_UNTRACKED });
});

test('partner, active each month: only test applications reads zero; one real and one test realtor counts one', () => {
  const months = ['2026-08', '2026-09', '2026-10'];
  const each = (w, r, email) => { for (const m of months) w.submit(`L-${r}`, `${m}-15T16:00:00Z`, email); };
  const only = world().realtor('P').realtor('A', 'P').realtor('B', 'P');
  each(only, 'A', TEST); each(only, 'B', 'qa@example.com');
  assert.deepEqual(K.activeEachMonth(only.d, ['A', 'B'], NOW), []);
  assert.equal(K.partnerKpis(only.d, 'P', NOW).activeInvited.count, 0);
  const mixed = world().realtor('P').realtor('A', 'P').realtor('B', 'P');
  each(mixed, 'A', 'maya@mail.ca'); each(mixed, 'B', TEST);
  assert.deepEqual(K.activeEachMonth(mixed.d, ['A', 'B'], NOW), ['A']);
  assert.equal(K.partnerKpis(mixed.d, 'P', NOW).activeInvited.count, 1);
  // A test application does not stand in for a month the realtor missed.
  const gap = world().realtor('P').realtor('A', 'P');
  gap.submit('L-A', '2026-08-15T16:00:00Z', 'maya@mail.ca'); gap.submit('L-A', '2026-09-15T16:00:00Z', TEST); gap.submit('L-A', '2026-10-15T16:00:00Z', 'omar@mail.ca');
  assert.equal(K.partnerKpis(gap.d, 'P', NOW).activeInvited.count, 0);
});

test('partner, closed rentals: only test applications reads zero; one real and one test counts one', () => {
  const zero = { toDate: 0, mtd: 0, last: 0 };
  const only = world().realtor('P').realtor('A', 'P');
  only.close('L-P', '2026-11-05T15:00:00Z', TEST); only.close('L-A', '2026-11-06T15:00:00Z', 'qa@example.com'); only.close('L-A', '2026-10-06T15:00:00Z', TEST);
  assert.deepEqual(K.partnerKpis(only.d, 'P', NOW).rentals, { partner: zero, invited: zero, total: zero, others: zero });
  // The partner's own: one listing closed with a real tenant, one with a test applicant.
  const own = world().realtor('P').realtor('A', 'P').listing('L-P-2', 'P');
  own.close('L-P', '2026-11-05T15:00:00Z', 'maya@mail.ca'); own.close('L-P-2', '2026-11-06T15:00:00Z', TEST);
  const o = K.partnerKpis(own.d, 'P', NOW).rentals;
  assert.deepEqual(o.partner, { toDate: 1, mtd: 1, last: 0 }); assert.deepEqual(o.invited, zero); assert.deepEqual(o.total, { toDate: 1, mtd: 1, last: 0 });
  // An invited realtor's, last month: the same.
  const theirs = world().realtor('P').realtor('A', 'P').listing('L-A-2', 'A');
  theirs.close('L-A', '2026-10-05T15:00:00Z', 'maya@mail.ca'); theirs.close('L-A-2', '2026-10-06T15:00:00Z', TEST);
  const t = K.partnerKpis(theirs.d, 'P', NOW).rentals;
  assert.deepEqual(t.invited, { toDate: 1, mtd: 0, last: 1 }); assert.deepEqual(t.partner, zero); assert.deepEqual(t.others, { toDate: 1, mtd: 0, last: 1 });
});

test('the whole picture and the snapshot row carry the same numbers: the test applications are in neither', () => {
  const w = world().realtor('R1').realtor('R2').listing('L-R1-2', 'R1');
  w.close('L-R1', '2026-11-05T15:00:00Z', 'maya@mail.ca'); w.close('L-R1-2', '2026-11-06T15:00:00Z', TEST);
  w.close('L-R2', '2026-11-07T15:00:00Z', TEST); w.close('L-R2', '2026-10-07T15:00:00Z', 'qa@example.com');
  const k = K.computeKpis(w.d, NOW);
  assert.deepEqual([k.activeRealtors.mtd, k.activeRealtors.last, k.rentalsClosed.mtd, k.rentalsClosed.last, k.streak.months], [1, 0, 1, 0, 0]);
  const row = K.snapshotRow(k, NOW);
  assert.deepEqual([row.active_realtors_mtd, row.active_realtors_last_month, row.rentals_closed_mtd, row.rentals_closed_last_month, row.streak_months], [1, 0, 1, 0, 0]);
});
