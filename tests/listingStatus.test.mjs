// A listing can be rented: the status route's ownership and transitions, the resolver's rented
// answer, the not selected recipient set, the consent flip both ways and its expiry, the state
// line, and the retention second selection excluding consented rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statusPatch, inviteAnswer, notSelectedRecipients, notSelectedEmail, listingOpen, consentExpiry } from '../lib/listingState.js';
import { ownedListing, flipConsent, readConsent, newConsentToken } from '../lib/listingStatus.js';
import { listingStateLine } from '../lib/listingStateLine.js';
import { buildActions } from '../lib/actions.js';
import { selectClosedListingApplications } from '../lib/retention.js';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');

test('status route: session, entitlement and the explicit ownership check are in the source', () => {
  const src = readFileSync(new URL('../pages/api/listings/status.js', import.meta.url), 'utf8');
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /requireEntitlement\(req, res, supabase, user\)/);
  assert.match(src, /ownedListing\(admin, listingId, user\.id\)/);
  assert.match(src, /getSupabaseAdminClient\(\)/);
  assert.doesNotMatch(src, /supabase\.from\('listings'\)\.update/);
});

test('ownedListing: the listing row must carry the caller as profile_id', async () => {
  const admin = fakeSupabase({ listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', status: 'active' }] });
  assert.equal((await ownedListing(admin, 'L1', 'me')).id, 'L1');
  assert.equal(await ownedListing(admin, 'L1', 'someone-else'), false);
  assert.equal(await ownedListing(admin, 'L9', 'me'), null);
});

test('three transitions: rented sets closed_at and the winner, closed sets closed_at, active clears both', () => {
  const rented = statusPatch('rented', { now: NOW, rentedLinkId: 'J1' });
  assert.deepEqual(rented, { status: 'rented', closed_at: NOW.toISOString(), rented_link_id: 'J1' });
  const closed = statusPatch('closed', { now: NOW, rentedLinkId: 'J1' });
  assert.deepEqual(closed, { status: 'closed', closed_at: NOW.toISOString(), rented_link_id: null });
  assert.deepEqual(statusPatch('active', { now: NOW }), { status: 'active', closed_at: null, rented_link_id: null });
  assert.equal(statusPatch('sold'), null);
  assert.equal(listingOpen({ status: 'rented' }), false);
  assert.equal(listingOpen({}), true, 'absent column reads as active');
});

test('resolver: rented with the listing row, rented without it, active otherwise, 404 without the record', () => {
  const record = { realtorName: 'Sarah Chen', listingName: 'Carlaw' };
  assert.deepEqual(inviteAnswer(record, { status: 'rented' }), { status: 200, rented: true, realtorName: 'Sarah Chen', listingName: 'Carlaw' });
  assert.equal(inviteAnswer(record, { status: 'closed' }).rented, true);
  assert.equal(inviteAnswer(record, null).rented, true, 'listing row gone, record remains');
  assert.equal(inviteAnswer(record, { status: 'active' }).rented, false);
  assert.equal(inviteAnswer(null, null).status, 404);
});

test('not selected recipients: active rows with an email, never the winner, set aside or withdrawn', () => {
  const rows = [
    { id: 'J1', decision_status: 'none', application: { id: 'A1', full_name: 'Priya Nair', email: 'Priya@x.ca' } },
    { id: 'J2', decision_status: 'none', application: { id: 'A2', full_name: 'Winner', email: 'w@x.ca' } },
    { id: 'J3', decision_status: 'reject', application: { id: 'A3', full_name: 'Aside', email: 'a@x.ca' } },
    { id: 'J4', decision_status: 'none', withdrawn_at: '2026-09-01T00:00:00Z', application: { id: 'A4', full_name: 'Gone', email: 'g@x.ca' } },
    { id: 'J5', decision_status: 'shortlisted', application: { id: 'A5', full_name: 'No Email', email: '' } },
    { id: 'J6', decision_status: 'none', application: { id: 'A6', full_name: 'Dup', email: 'priya@x.ca' } },
  ];
  const out = notSelectedRecipients(rows, 'J2');
  assert.deepEqual(out.map((r) => r.linkId), ['J1']);
  assert.equal(out[0].email, 'priya@x.ca');
  assert.equal(notSelectedRecipients(rows, null).length, 2, 'outside winner: every active applicant with an email');
});

test('the message speaks as a person: greeting, four neutral lines, the realtor signs; no winner, no score, no reason', () => {
  const m = notSelectedEmail({ listingName: 'Carlaw', realtorName: 'Sarah Chen', applicantName: 'Priya Nair', keepUrl: 'https://rentletter.ca/keep/t' });
  assert.equal(m.subject, 'Carlaw: an update from Sarah Chen');
  assert.equal(m.greeting, 'Hi Priya,'); assert.equal(m.signoff, 'Sarah Chen');
  assert.ok(m.text.startsWith('Hi Priya,\n\nCarlaw went to another applicant.'));
  assert.match(m.text, /within 14 days\.\n\nSarah Chen\n/);
  assert.equal(notSelectedEmail({ listingName: 'Carlaw', realtorName: 'Sarah Chen', keepUrl: 'x' }).greeting, 'Hi,');
  assert.equal(m.lines.length, 4);
  assert.doesNotMatch(m.text, /score|Fit|because|chosen|selected applicant/i);
  assert.match(m.html, /Keep me in mind/);
  assert.match(m.html, /No thanks/);
  assert.doesNotMatch(m.text, /[—–]/);
});

test('GET /keep: readConsent reads the row and the realtor name and writes nothing', async () => {
  const rows = [{ id: 'C1', token: 'tok1', status: 'pending', profile_id: 'P1', expires_at: '2026-11-03T00:00:00Z' }];
  const admin = fakeSupabase({ pipeline_consents: rows, profiles: [{ id: 'P1', full_name: 'Sarah Chen' }] });
  const r = await readConsent(admin, 'tok1', { now: NOW });
  assert.deepEqual(r, { found: true, expired: false, answered: false, status: 'pending', realtorName: 'Sarah Chen' });
  assert.equal(rows[0].status, 'pending');
  assert.deepEqual(admin.updates, [], 'no update ran');
  assert.equal((await readConsent(admin, 'tok1', { now: new Date('2026-12-01T00:00:00Z') })).expired, true);
  assert.equal((await readConsent(admin, 'nope')).found, false);
  const page = readFileSync(new URL('../pages/keep/[token].js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /flipConsent|\.update\(/, 'the page never imports the flip');
  assert.match(page, /readConsent\(/);
});

test('POST /api/pipeline/answer: yes and no flip once; expired and already answered are refused', async () => {
  const rows = [
    { id: 'C1', token: 'tok1', status: 'pending', expires_at: '2026-11-03T00:00:00Z' },
    { id: 'C2', token: 'tok2', status: 'pending', expires_at: '2026-11-03T00:00:00Z' },
    { id: 'C3', token: 'tok3', status: 'pending', expires_at: '2026-09-01T00:00:00Z' },
    { id: 'C4', token: 'tok4', status: 'declined', expires_at: '2026-11-03T00:00:00Z' },
  ];
  const admin = fakeSupabase({ pipeline_consents: rows });
  const a = await flipConsent(admin, 'tok1', 'consented', { now: NOW });
  assert.equal(a.ok, true); assert.equal(rows[0].status, 'consented'); assert.equal(rows[0].consented_at, NOW.toISOString());
  const b = await flipConsent(admin, 'tok2', 'declined', { now: NOW });
  assert.equal(b.ok, true); assert.equal(rows[1].status, 'declined'); assert.equal(rows[1].consented_at, null);
  const c = await flipConsent(admin, 'tok3', 'consented', { now: NOW });
  assert.equal(c.expired, true); assert.equal(rows[2].status, 'pending', 'expired rows do not flip');
  const d = await flipConsent(admin, 'tok4', 'consented', { now: NOW });
  assert.equal(d.answered, true); assert.equal(rows[3].status, 'declined', 'answered rows do not flip');
  const again = await flipConsent(admin, 'tok1', 'declined', { now: NOW });
  assert.equal(again.answered, true); assert.equal(rows[0].status, 'consented', 'a second tap changes nothing');
  assert.equal(admin.updates.length, 2, 'exactly two updates ran');
  assert.equal((await flipConsent(admin, 'nope', 'consented')).found, false);
  assert.equal(new Date(consentExpiry(NOW)).getTime() - NOW.getTime(), 60 * 86400000);
  const t1 = newConsentToken(), t2 = newConsentToken();
  assert.notEqual(t1, t2); assert.ok(t1.length >= 32);
  const src = readFileSync(new URL('../pages/api/pipeline/answer.js', import.meta.url), 'utf8');
  assert.match(src, /checkSubmitLimits\(/); assert.match(src, /req\.method !== 'POST'/);
});

test('the message: both links open /keep/{token}, no ?no=1', () => {
  const m = notSelectedEmail({ listingName: 'Carlaw', realtorName: 'Sarah Chen', keepUrl: 'https://rentletter.ca/keep/t' });
  assert.equal((m.html.match(/https:\/\/rentletter\.ca\/keep\/t"/g) || []).length, 2);
  assert.doesNotMatch(m.text, /no=1/); assert.doesNotMatch(m.html, /no=1/);
  assert.match(m.text, /No thanks: https:\/\/rentletter\.ca\/keep\/t/);
});

test('state line: rented with the winner, rented outside, closed, and active unchanged', () => {
  const apps = [{ linkId: 'J1', application: { full_name: 'Priya Nair' } }];
  assert.equal(listingStateLine({ status: 'rented', closed_at: '2026-09-04T15:00:00Z', rented_link_id: 'J1' }, apps), 'Rented · Sep 4 · Priya');
  assert.equal(listingStateLine({ status: 'rented', closed_at: '2026-09-04T15:00:00Z', rented_link_id: null }, apps), 'Rented · Sep 4');
  assert.equal(listingStateLine({ status: 'closed', closed_at: '2026-09-04T15:00:00Z' }, []), 'Closed · Sep 4');
  assert.equal(listingStateLine({ status: 'active', invite_token: 'x' }, []), 'no applicants yet · invite live');
});

test('next list: items on rented or closed listings are ignored', () => {
  const junction = { linkId: 'J1', decisionStatus: 'none', createdAt: '2026-09-01T00:00:00Z', application: { full_name: 'Priya Nair' } };
  const open = buildActions({ listings: [{ id: 'L1', name: 'Carlaw', status: 'active' }], applicantsByListing: { L1: [junction] }, now: NOW });
  const rented = buildActions({ listings: [{ id: 'L1', name: 'Carlaw', status: 'rented' }], applicantsByListing: { L1: [junction] }, now: NOW });
  assert.ok(open.length > 0);
  assert.equal(rented.length, 0);
});

test('retention second selection: every junction on a closed listing older than 90 days, minus consented rows', async () => {
  const old = '2026-05-01T00:00:00Z', recent = '2026-08-20T00:00:00Z';
  const admin = fakeSupabase({
    listings: [{ id: 'L1', status: 'rented', closed_at: old }, { id: 'L2', status: 'active', closed_at: null }, { id: 'L3', status: 'closed', closed_at: recent }],
    listing_applicants: [
      { id: 'J1', listing_id: 'L1', application_id: 'A1' },              // only on the old rented listing: selected
      { id: 'J2', listing_id: 'L1', application_id: 'A2' }, { id: 'J3', listing_id: 'L2', application_id: 'A2' }, // also on a live listing: kept
      { id: 'J4', listing_id: 'L1', application_id: 'A3' },              // consented, not expired: kept
      { id: 'J5', listing_id: 'L1', application_id: 'A4' },              // consented but expired: selected
      { id: 'J6', listing_id: 'L3', application_id: 'A5' },              // closed recently: not yet
    ],
    pipeline_consents: [
      { id: 'C1', application_id: 'A3', status: 'consented', expires_at: '2026-10-01T00:00:00Z' },
      { id: 'C2', application_id: 'A4', status: 'consented', expires_at: '2026-08-01T00:00:00Z' },
      { id: 'C3', application_id: 'A1', status: 'declined', expires_at: '2026-10-01T00:00:00Z' },
    ],
  });
  const r = await selectClosedListingApplications(admin, NOW);
  assert.deepEqual(r.applications.sort(), ['A1', 'A4']);
  assert.equal(r.listings, 1);
});
