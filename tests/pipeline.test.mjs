// Pipeline. listPeople sort and fields (pending rows shown, muted, after the consented), the invite's refusals and prefill token, the
// prefill render, the renewal selection and expiry, the answer route on a renew token, remove,
// the pipeline_fit item, and the exclusions (expired, declined, another realtor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const P = await import('../lib/pipeline.js');
const { peopleRows, inviteEmail, renewalEmail, pipelineFitItems } = await import('../lib/pipelineState.js');
const { rowToForm } = await import('../lib/pipelinePrefill.js');
const { computeFit } = await import('../lib/fitScore.js');
const { buildActions, actionHref, KIND_ORDER } = await import('../lib/actions.js');

const NOW = new Date('2026-09-07T15:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();
const app = (id, over = {}) => ({ id, email: `${id}@example.com`, full_name: `Person ${id}`, annual_income: 110000, employer: 'Acme', job_title: 'Nurse', years_at_job: '5', prev_landlord_name: 'Gail', prev_address: '1 Main', years_at_previous: '4', references: [{ name: 'A' }, { name: 'B' }], owner_token: 'SECRET', cover_letter: 'x', phone: '(416) 555-0100', date_of_birth: '1994-08-14', move_in_date: '2026-10-01', pets: 'One cat', co_applicant: null, ...over });
const fixture = () => {
  const listings = [
    { id: 'L-active', profile_id: 'me', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', status: 'active', invite_token: 'abcdefabcdefabcdefab', pref_rent_to_income_max_pct: 40, created_at: days(-1) },
    { id: 'L-two', profile_id: 'me', name: '88 Harbour St', monthly_rent: 3100, status: 'active', invite_token: 'abcdefabcdefabcdef00', pref_min_annual_income: 120000, created_at: days(-30) },
    { id: 'L-rented', profile_id: 'me', name: '15 Logan Ave', monthly_rent: 2400, status: 'rented', created_at: days(-40) },
    { id: 'L-other', profile_id: 'them', name: 'Other realtor', monthly_rent: 2000, status: 'active', created_at: days(-2) },
  ];
  const applications = [app('A1'), app('A2', { annual_income: 48000, prev_landlord_name: null, references: [] }), app('A3'), app('A4'), app('A5')];
  const pipeline_consents = [
    { id: 'C1', profile_id: 'me', listing_id: 'L-rented', application_id: 'A1', email: 'a1@example.com', token: 't1', status: 'consented', consented_at: days(-9), expires_at: days(51), invites: [], renew_token: null, renew_sent_at: null },
    { id: 'C2', profile_id: 'me', listing_id: 'L-rented', application_id: 'A2', email: 'a2@example.com', token: 't2', status: 'consented', consented_at: days(-8), expires_at: days(52), invites: [{ listingId: 'L-two', at: days(-2) }], renew_token: null, renew_sent_at: null },
    { id: 'C3', profile_id: 'me', listing_id: 'L-rented', application_id: null, email: 'Jordan.Lee@example.com', token: 't3', status: 'consented', consented_at: days(-3), expires_at: days(5), invites: [], renew_token: null, renew_sent_at: null },
    { id: 'C4', profile_id: 'me', listing_id: 'L-rented', application_id: 'A3', email: 'a3@example.com', token: 't4', status: 'consented', consented_at: days(-70), expires_at: days(-10), invites: [], renew_token: null, renew_sent_at: null }, // expired
    { id: 'C5', profile_id: 'me', listing_id: 'L-rented', application_id: 'A4', email: 'a4@example.com', token: 't5', status: 'declined', consented_at: null, expires_at: days(50), invites: [], renew_token: null, renew_sent_at: null },
    { id: 'C7', profile_id: 'me', listing_id: 'L-rented', application_id: 'A3', email: 'a3@example.com', token: 't7', status: 'pending', consented_at: null, created_at: days(-1), expires_at: days(59), invites: [], renew_token: null, renew_sent_at: null }, // asked, no answer yet
    { id: 'C6', profile_id: 'them', listing_id: 'L-other', application_id: 'A5', email: 'a5@example.com', token: 't6', status: 'consented', consented_at: days(-1), expires_at: days(59), invites: [], renew_token: null, renew_sent_at: null },
  ];
  const listing_applicants = [
    { id: 'J1', listing_id: 'L-rented', application_id: 'A1', confirmations: { landlord: { at: days(-12), by: 'You' } } },
    { id: 'J2', listing_id: 'L-rented', application_id: 'A2', confirmations: {} },
    { id: 'J3', listing_id: 'L-two', application_id: 'A9', confirmations: {} },
  ];
  const applicantsByListing = { 'L-active': [], 'L-two': [{ linkId: 'J3', application: { email: 'A2@EXAMPLE.COM' } }] };
  const profiles = [{ id: 'me', full_name: 'Sarah Chen', email: 'sarah@example.com' }, { id: 'them', full_name: 'Other', email: 'o@example.com' }];
  const events = [];
  return { tables: { listings, applications, pipeline_consents, listing_applicants, profiles, events }, listings, applicantsByListing };
};

test('listPeople: fields, Fit against active listings only, applied by email, sorted best first with email only rows last', async () => {
  const { tables, listings, applicantsByListing } = fixture();
  const admin = fakeSupabase(tables);
  const people = await P.listPeople({ profileId: 'me', listings, admin, applicantsByListing, now: NOW });
  assert.deepEqual(people.map((p) => p.id), ['C1', 'C2', 'C3', 'C7'], 'expired, declined and the other realtor are out; email only last, then the pending');
  assert.equal(people[3].status, 'pending'); assert.equal(people[3].askedAt, days(-1)); assert.equal(people[3].name, 'Person A3');
  assert.equal(people[0].status, 'consented');
  const a1 = people[0];
  assert.equal(a1.display, 'Person A1'); assert.equal(a1.fromListingName, '15 Logan Ave'); assert.equal(a1.expiresAt, days(51));
  assert.deepEqual(a1.fits.map((f) => f.listingId), ['L-active', 'L-two'], 'rented and other realtor listings never appear');
  assert.ok(a1.best.score >= 4.0 && a1.best.listingId === 'L-active', `best ${JSON.stringify(a1.best)}`);
  assert.ok(a1.best.score > people[1].best.score, 'sorted by best score');
  assert.equal(people[1].applied, true, 'A2 applied to L-two under the same email in another case');
  assert.equal(people[1].fits.find((f) => f.listingId === 'L-two').invitedAt, days(-2));
  assert.equal(people[2].best, null); assert.equal(people[2].email, 'jordan.lee@example.com'); assert.equal(people[2].display, 'jordan.lee@example.com');
  for (const p of people) for (const f of p.fits) assert.equal('applicationRow' in f, false);
  const json = JSON.stringify(people);
  assert.doesNotMatch(json, /SECRET|cover_letter|owner_token/);
  assert.doesNotMatch(json, /occupant|household|smoker/i, 'nothing removed enters the list');
});

test('listPeople: confirmations carry into Fit, documents never do', () => {
  const { tables, listings, applicantsByListing } = fixture();
  const a1 = { ...tables.applications[0], years_at_previous: '1' };
  const with_ = peopleRows({ consents: tables.pipeline_consents.slice(0, 1), applications: [a1], junctions: tables.listing_applicants, listings, applicantsByListing, now: NOW });
  const without = peopleRows({ consents: tables.pipeline_consents.slice(0, 1), applications: [a1], junctions: [], listings, applicantsByListing, now: NOW });
  assert.ok(with_[0].best.score >= without[0].best.score, 'the landlord confirmation never lowers the score');
  const conf = tables.listing_applicants[0].confirmations;
  assert.ok(computeFit({ application: a1, listing: listings[0], verification: null, confirmations: conf }).scoreExact > computeFit({ application: a1, listing: listings[0], verification: null, confirmations: {} }).scoreExact, 'the landlord confirmation adds to R');
  assert.equal(with_[0].best.score, computeFit({ application: a1, listing: listings[0], verification: null, confirmations: conf }).score, 'the list shows the same Fit');
  assert.equal(with_[0].best.label, 'stated', 'no documents: the label is stated');
  const src = readFileSync(new URL('../lib/pipelineState.js', import.meta.url), 'utf8');
  assert.match(src, /computeFit\(\{ application: app, listing: l, verification: null, confirmations \}\)/);
});

test('listPeople: an absent table or column reads as nobody', async () => {
  const { listings } = fixture();
  assert.deepEqual(await P.listPeople({ profileId: 'me', listings, admin: fakeSupabase({ listings }), applicantsByListing: {} }), []);
});

test('invite: refusals, the prefill token in KV, the invites entry, the email', async () => {
  const { tables, listings } = fixture();
  const admin = fakeSupabase(tables);
  const kv = {}; const { calls, restore } = fakeKv(kv);
  try {
    const deps = { admin, userId: 'me', now: NOW };
    assert.equal((await P.prepareInvite(deps, {})).status, 400);
    assert.equal((await P.prepareInvite(deps, { consentId: 'C6', listingId: 'L-active' })).status, 403, 'another realtor\'s consent');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C1', listingId: 'L-other' })).status, 403, 'another realtor\'s listing');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C1', listingId: 'L-rented' })).status, 409, 'not active');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C2', listingId: 'L-two' })).status, 409, 'already invited');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C4', listingId: 'L-active' })).status, 410, 'expired');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C5', listingId: 'L-active' })).status, 410, 'declined');
    assert.equal((await P.prepareInvite(deps, { consentId: 'C7', listingId: 'L-active' })).status, 410, 'pending: no invite until they say yes');
    const r = await P.prepareInvite(deps, { consentId: 'C1', listingId: 'L-active' });
    assert.equal(r.status, 200);
    assert.ok(P.isPrefillToken(r.prefillToken), `prefill token ${r.prefillToken}`);
    assert.ok(calls.some((c) => /set/.test(c)), 'KV set');
    assert.deepEqual(tables.pipeline_consents[0].invites, [{ listingId: 'L-active', at: NOW.toISOString() }]);
    assert.equal(r.application.full_name, 'Person A1');
    const mail = inviteEmail({ listing: r.listing, realtorName: 'Sarah Chen', applicantName: 'Person A1', email: 'a1@example.com', applyUrl: `https://rentletter.ca/apply/${r.listing.invite_token}?from=${r.prefillToken}`, prefilled: true });
    assert.equal(mail.subject, '210 Carlaw Ave, Unit 4, Toronto: a unit you might like');
    assert.equal(mail.greeting, 'Hi Person,');
    assert.match(mail.text, /Your application from before is already filled in\. It takes about two minutes\./);
    assert.match(mail.text, /\?from=/);
    assert.doesNotMatch(mail.text + mail.html, /[–—]| - /);
    // a second invite to the same listing is refused now
    assert.equal((await P.prepareInvite(deps, { consentId: 'C1', listingId: 'L-active' })).status, 409);
    // email only: no prefill line, no token
    const r3 = await P.prepareInvite(deps, { consentId: 'C3', listingId: 'L-active' });
    assert.equal(r3.status, 200); assert.equal(r3.prefillToken, null);
    const m3 = inviteEmail({ listing: r3.listing, realtorName: 'Sarah Chen', applicantName: null, email: 'jordan.lee@example.com', applyUrl: 'https://rentletter.ca/apply/abcdefabcdefabcdefab', prefilled: false });
    assert.equal(m3.greeting, 'Hi jordan.lee,'); assert.doesNotMatch(m3.text, /already filled in/); assert.doesNotMatch(m3.text, /\?from=/);
  } finally { restore(); }
});

test('prefill: the token resolves to the application as a form, surviving fields only; a wrong token is nothing; consume deletes', async () => {
  const { tables } = fixture();
  const admin = fakeSupabase(tables);
  const token = P.newPrefillToken();
  const { calls, restore } = fakeKv({ [P.prefillKey(token)]: { applicationId: 'A1', consentId: 'C1' } });
  try {
    const r = await P.readPrefill(admin, token);
    assert.equal(r.consentId, 'C1'); assert.equal('owner_token' in r.application, false); assert.equal('cover_letter' in r.application, false);
    const form = rowToForm(r.application);
    assert.equal(form.email, 'A1@example.com'); assert.equal(form.fullName, 'Person A1'); assert.equal(form.annualIncome, '110000'); assert.equal(form.moveInDate, '2026-10-01'); assert.equal(form.rentalStatus, 'current'); assert.equal(form.pets, 'One cat');
    assert.equal(form.numberOfOccupants, '1'); assert.equal(form.occupantsDetails, ''); assert.equal(form.smoker, 'no'); // untouched defaults, never read from the row
    assert.equal(form.apartmentAddress, '', 'the unit comes from the invite');
    assert.equal(await P.readPrefill(admin, 'NOTATOKEN'), null);
    assert.equal(await P.readPrefill(admin, P.newPrefillToken()), null, 'unknown token');
    await P.consumePrefill(token);
    assert.ok(calls.some((c) => /del/.test(c)), 'deleted');
  } finally { restore(); }
  const src = readFileSync(new URL('../pages/apply/[token].js', import.meta.url), 'utf8');
  assert.match(src, /export async function getServerSideProps/); assert.match(src, /ctx\.query\?\.from/); assert.match(src, /readPrefill\(getSupabaseAdminClient\(\), from, \{ nonce/);
  assert.match(src, /data-invited-review/); assert.match(src, /\/api\/pipeline\/prefill/);
});

test('renewal: selection 7 days out and once, expiry set, the email', async () => {
  const { tables } = fixture();
  const admin = fakeSupabase(tables);
  const sent = []; const events = [];
  const out = await P.runPipelineCron({ admin, send: async (m) => sent.push(m), recordEvent: async (_a, e) => events.push(e), now: NOW, log: () => {} });
  assert.deepEqual(out, { renewalsSent: 1, expired: 1 });
  assert.equal(tables.pipeline_consents.find((c) => c.id === 'C4').status, 'expired');
  const c3 = tables.pipeline_consents.find((c) => c.id === 'C3');
  assert.ok(c3.renew_token && c3.renew_sent_at, 'renew token minted');
  assert.equal(sent[0].to, 'Jordan.Lee@example.com'); assert.equal(sent[0].subject, 'Still looking?'); assert.match(sent[0].from, /^Sarah Chen via Rentletter/); assert.equal(sent[0].reply_to, 'sarah@example.com');
  assert.match(sent[0].text, new RegExp(`Your "keep me in mind" with Sarah Chen ends on September 12, 2026\\. Tap below to keep it for another 60 days, or do nothing and it ends there\\.`));
  assert.match(sent[0].text, new RegExp(`/keep/${c3.renew_token}`));
  assert.equal(events[0].type, 'pipeline_renewal_sent');
  // a second run sends nothing more
  const again = await P.runPipelineCron({ admin, send: async (m) => sent.push(m), recordEvent: async () => {}, now: NOW, log: () => {} });
  assert.deepEqual(again, { renewalsSent: 0, expired: 0 }); assert.equal(sent.length, 1);
  const mail = renewalEmail({ realtorName: 'Sarah Chen', applicantName: 'Tasha Okafor', email: 't@example.com', expiresAt: days(5), keepUrl: 'https://rentletter.ca/keep/x' });
  assert.equal(mail.greeting, 'Hi Tasha,'); assert.doesNotMatch(mail.text + mail.html, /[–—]| - /);
});

test('answer on a renew token: yes extends 60 days and clears the token; no declines; the keep page reads it', async () => {
  const { tables } = fixture();
  const admin = fakeSupabase(tables);
  await P.runPipelineCron({ admin, send: async () => {}, recordEvent: async () => {}, now: NOW, log: () => {} });
  const c3 = tables.pipeline_consents.find((c) => c.id === 'C3'); const tok = c3.renew_token;
  const read = await P.readRenewal(admin, tok, { now: NOW });
  assert.equal(read.found, true); assert.equal(read.renew, true); assert.equal(read.realtorName, 'Sarah Chen');
  const yes = await P.answerRenewal(admin, tok, 'consented', { now: NOW });
  assert.equal(yes.renewed, true); assert.equal(c3.expires_at, days(60)); assert.equal(c3.renew_token, null); assert.equal(c3.renew_sent_at, null); assert.equal(c3.status, 'consented');
  assert.equal((await P.readRenewal(admin, tok)).found, false, 'the token is gone');
  // no
  c3.renew_token = 'again'; c3.renew_sent_at = NOW.toISOString();
  const no = await P.answerRenewal(admin, 'again', 'declined', { now: NOW });
  assert.equal(no.ok, true); assert.equal(c3.status, 'declined'); assert.equal(c3.renew_token, null);
  for (const f of ['../pages/api/pipeline/answer.js', '../pages/keep/[token].js']) assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), /Renewal\(admin, /);
  const keep = readFileSync(new URL('../pages/keep/[token].js', import.meta.url), 'utf8');
  assert.match(keep, /Done\. \$\{who\} will keep your application in mind for another 60 days\./);
  assert.doesNotMatch(keep.split('export default')[0], /\.update\(/, 'the page never writes on load');
});

test('remove: ownership, the row goes', async () => {
  const { tables } = fixture();
  const admin = fakeSupabase(tables);
  assert.equal((await P.removePerson({ admin, userId: 'me' }, { consentId: 'C6' })).status, 403);
  assert.equal((await P.removePerson({ admin, userId: 'me' }, { consentId: 'nope' })).status, 404);
  const r = await P.removePerson({ admin, userId: 'me' }, { consentId: 'C1' });
  assert.equal(r.status, 200); assert.equal(tables.pipeline_consents.some((c) => c.id === 'C1'), false);
});

test('pipeline_fit: one item per new active listing with people at 4.0 or above, signature is the listing and the count', async () => {
  const { tables, listings, applicantsByListing } = fixture();
  const people = await P.listPeople({ profileId: 'me', listings, admin: fakeSupabase(tables), applicantsByListing, now: NOW });
  const items = pipelineFitItems({ listings, people });
  assert.deepEqual(items.map((i) => [i.kind, i.listingId, i.title, i.reason, i.verb, i.panel, i.signature]), [['pipeline_fit', 'L-active', 'Pipeline fits', '1 person at 4.0 or above', 'Open', 'people', 'pipeline_fit:L-active:1']]);
  const all = buildActions({ listings, applicantsByListing, people, now: NOW.toISOString() });
  assert.ok(all.some((i) => i.kind === 'pipeline_fit')); assert.ok(KIND_ORDER.includes('pipeline_fit'));
  assert.equal(actionHref(items[0], { home: '/dashboard', listing: (id) => `/listing/${id}` }), '/dashboard#people');
  assert.deepEqual(pipelineFitItems({ listings, people: [] }), []);
  assert.ok(people.find((p) => p.id === 'C7').fits.some((f) => f.listingId === 'L-active' && f.score >= 4), 'the pending A3 would fit');
  assert.match(items[0].reason, /^1 person/, 'a pending row never counts toward Pipeline fits');
});

test('routes: session, entitlement and ownership; the sandbox covers the three routes; the cron is scheduled', () => {
  for (const f of ['invite', 'remove']) {
    const src = readFileSync(new URL(`../pages/api/pipeline/${f}.js`, import.meta.url), 'utf8');
    assert.match(src, /withRealtor\(/); assert.match(src, /userId: user\.id/);
  }
  const lib = readFileSync(new URL('../lib/pipeline.js', import.meta.url), 'utf8');
  assert.match(lib, /ownedConsent\(admin, consentId, userId\)/); assert.match(lib, /ownedListing\(admin, listingId, userId\)/);
  assert.match(lib, /\.eq\('profile_id', profileId\)/, 'the list reads this profile only');
  const routes = readFileSync(new URL('../lib/dashboardAdapter.js', import.meta.url), 'utf8');
  for (const r of ['GET /api/pipeline/people', 'POST /api/pipeline/invite', 'POST /api/pipeline/remove']) assert.ok(routes.includes(r), r);
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.crons.find((c) => c.path === '/api/cron/pipeline'), { path: '/api/cron/pipeline', schedule: '30 13 * * *' });
  const sql = readFileSync(new URL('../db/pipeline.sql', import.meta.url), 'utf8');
  for (const col of ['invites jsonb', 'renew_token text UNIQUE', 'renew_sent_at timestamptz', "'pipeline_invited'", "'pipeline_renewal_sent'", "'pipeline_removed'", "'expired'"]) assert.ok(sql.includes(col), col);
});
