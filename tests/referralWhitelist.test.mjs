// The realtor to realtor referral sends the fact whitelist and nothing else
// (lib/referrals.js, lib/profileFacts.js; docs/design/profile-and-circle.md sections 1.5 and 6).
//   · the referral payload is lib/profileFacts.js sharePayload, checked by assertSharePayload:
//     a form holding household size, a note, pets, every other apply form key and a set of
//     planted protected ground keys comes out as the whitelisted facts alone;
//   · end to end over a KV stand in: Realtor 1 asks, the tenant reads the consent page and
//     approves, Realtor 2 reads the inbox and assigns. Nothing planted reaches the consent page's
//     list, the copy of the application made for Realtor 2, the inbox or the emails;
//   · no note is taken: one sent to the library or the route is dropped, and no screen asks;
//   · older rows: a referral and a derived application made before this rule hold a note, a
//     document summary and a household size. They stay stored, and none is read or sent again:
//     not by the inbox, not by the assign, not by the read of a realtor's listing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import * as F from '../lib/profileFacts.js';
import * as features from '../lib/features.js';
import { EMPTY_FORM } from '../lib/tenantProfile.js';
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\{\/\*)/.test(l)).join('\n');

// Values no whitelisted fact holds: if one of these strings is in what Realtor 2 gets, it leaked.
const PLANTED = {
  numberOfOccupants: 'OCCUPANTS-7', householdSize: 'HOUSEHOLD-7', household: 'HOUSEHOLD-OBJ', children: 'CHILDREN-3', dependents: 'DEPENDENTS-3',
  note: 'NOTE-my-strongest-applicant', notes: 'NOTES-family-of-four', realtorNote: 'REALTORNOTE-x', decisionNotes: 'DECISIONNOTES-x',
  fitScore: 'FIT-91', rank: 'RANK-1', ranking: 'RANKING-1', scorecard: 'SCORECARD-x', priority: 'PRIORITY-high',
  familyStatus: 'FAMILY-married', maritalStatus: 'MARITAL-married', age: 'AGE-41', dateOfBirth: 'DOB-1985-03-04', gender: 'GENDER-x', sex: 'SEX-x',
  sexualOrientation: 'ORIENTATION-x', genderIdentity: 'GENDERID-x', race: 'RACE-x', ancestry: 'ANCESTRY-x', colour: 'COLOUR-x', ethnicOrigin: 'ETHNIC-x',
  placeOfOrigin: 'ORIGIN-x', citizenship: 'CITIZEN-x', immigrationStatus: 'IMMIGRATION-x', religion: 'RELIGION-x', creed: 'CREED-x', disability: 'DISABILITY-x',
  serviceAnimal: 'SERVICEANIMAL-x', incomeSource: 'INCOMESOURCE-odsp', publicAssistance: 'ASSISTANCE-x', sourceOfIncome: 'SOURCEOFINCOME-x', criminalRecord: 'RECORD-x',
  pets: 'PETS-service-dog', smoker: 'SMOKER-yes', netIncome: '61061', currentRent: '2123', businessName: 'BUSINESS-x',
  hasCoApplicant: true, coApplicantName: 'CONAME-Sam', coApplicantRelationship: 'CORELATION-spouse', coApplicantAge: 'COAGE-39', coApplicantEmployer: 'COEMPLOYER-x', coApplicantJobTitle: 'COJOB-x', coApplicantIncome: '70707',
  reference1Name: 'REF1-Ivy', reference1Relationship: 'REF1REL-friend', reference1Contact: 'REF1CONTACT-x', reference2Name: 'REF2-Jo', reference2Contact: 'REF2CONTACT-x',
};
const MARKERS = Object.values(PLANTED).filter((v) => typeof v === 'string');
const clean = (value, what) => { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const m of MARKERS) assert.equal(text.includes(m), false, `${what}: ${m} reached the receiving realtor`); };

const FACTS = { fullName: 'Maya Okafor', email: 'maya@mail.ca', phone: '416 555 0101', employer: 'Northwind', jobTitle: 'Analyst', employmentType: 'full-time', yearsAtJob: '3', annualIncome: '84000',
  previousAddress: '12 Elm St, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Lee Park', previousLandlordContact: 'lee@mail.ca', moveInDate: '2027-01-01' };
const SOURCE_RL = 'RL-2026-AAAA-BBBB';
// Realtor 1's application: everything a tenant may have typed, and a date of birth.
const sourceApp = () => ({
  applicationNumber: SOURCE_RL, createdAt: '2026-11-01T15:00:00.000Z', email: 'maya@mail.ca', ownerToken: 'OWNERTOKENSECRET', revoked: false, coverLetter: 'COVERLETTER-x',
  tenant: { fullName: 'Maya Okafor', phone: '416 555 0101', dateOfBirth: PLANTED.dateOfBirth, ageConfirmed: true },
  employment: { jobTitle: 'Analyst', employer: 'Northwind', yearsAtJob: '3', annualIncome: 84000, employmentType: 'full-time', netIncome: 61061, businessName: PLANTED.businessName },
  rental: { previousAddress: '12 Elm St, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Lee Park', previousLandlordContact: 'lee@mail.ca', currentRent: 2123 },
  apartment: { address: 'REALTOR1-LISTING-9 King St', description: '2 BR', estimatedRent: 2600, rentToIncomeRatio: 37 },
  move: { moveInDate: 'January 1, 2027' }, household: { numberOfOccupants: PLANTED.numberOfOccupants, smoker: 'yes' },
  coApplicant: { name: PLANTED.coApplicantName, jobTitle: PLANTED.coApplicantJobTitle, employer: PLANTED.coApplicantEmployer, annualIncome: 70707 },
  lifestyle: { pets: PLANTED.pets }, references: [{ name: PLANTED.reference1Name, relationship: PLANTED.reference1Relationship, contact: PLANTED.reference1Contact }],
});
const LINK = { linkId: '11111111-1111-4111-8111-111111111111', application: { application_number: SOURCE_RL, email: 'maya@mail.ca', full_name: 'Maya Okafor' }, docVerifications: [{ analyzedAt: '2026-11-02T15:00:00Z', documents: [{ name: 'DOCUMENT-paystub.pdf' }], status: 'done' }] };
const REALTOR1 = { id: 'aaaaaaaa-0000-4000-8000-000000000001', full_name: 'Sarah Chen', brokerage: 'Harbourfront Realty' };
const LISTING1 = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'REALTOR1-LISTING-9 King St', address: '9 King St' };
const REALTOR2 = { id: 'cccccccc-0000-4000-8000-000000000002', email: 'priya@brokerage.ca' };
const res = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };

test('the referral payload is the share payload: planted household size, notes and protected grounds never come out', async () => {
  const R = await import('../lib/referrals.js');
  const form = { ...EMPTY_FORM, ...FACTS, ...PLANTED, nested: { numberOfOccupants: 'OCCUPANTS-7' } };
  const payload = R.referralPayload(form, '2026-11-10T15:00:00Z');
  assert.deepEqual(Object.keys(payload).sort(), ['checks', 'emailProvedAt', 'facts', 'profileId']);
  assert.deepEqual(payload.facts.map((f) => f.key), Object.keys(FACTS), 'the whitelisted facts, in the list\'s order');
  for (const f of payload.facts) { assert.ok(F.isProfileFactKey(f.key)); assert.equal(f.source, 'typed'); assert.equal(f.line, 'Typed by the tenant on November 10, 2026'); }
  assert.deepEqual(payload.checks, [], 'no document read travels');
  clean(payload, 'the payload');
  assert.doesNotThrow(() => F.assertSharePayload(payload));
  // Every key of the apply form that is not on the list comes back as the form's own blank.
  const back = R.formFromPayload(payload);
  for (const k of Object.keys(EMPTY_FORM)) {
    if (F.isProfileFactKey(k)) assert.equal(back[k], FACTS[k], `${k} travels`);
    else if (k !== 'rentalStatus') assert.deepEqual(back[k], EMPTY_FORM[k], `${k} does not travel`);
  }
  assert.equal(back.numberOfOccupants, EMPTY_FORM.numberOfOccupants); assert.equal(back.pets, ''); assert.equal(back.hasCoApplicant, false);
  clean(back, 'the form built back from the payload');
  // A payload that was not built by sharePayload is refused, not trimmed.
  assert.throws(() => R.formFromPayload({ ...payload, note: 'x' }), /share payload refused/);
  assert.throws(() => R.sharedFields({ ...payload, facts: [...payload.facts, { key: 'numberOfOccupants', label: 'Household', value: '4', source: 'typed', at: null, line: 'Typed by the tenant' }] }), /share payload refused/);
  // The consent page's list: one row per whitelisted fact under the whitelist's own labels.
  const rows = R.sharedFields(payload);
  assert.deepEqual(rows.map((r) => r.label), F.PROFILE_FACTS.map((f) => f.label));
  assert.equal(rows.some((r) => /household|pets|occupant|^references$|after tax/i.test(r.label)), false, 'no household, pets, personal references or after tax income row');
  assert.equal(rows.find((r) => r.label === 'Income before tax').value, '$84,000 a year');
  clean(rows, 'the consent page list');
  assert.equal(typeof R.SHARED_FIELDS, 'undefined', 'the old list, with its Household & pets row, is gone');
  assert.equal(typeof R.verificationSummary, 'undefined', 'Realtor 1\'s document read has no builder');
});

test('end to end: nothing planted reaches the consent list, Realtor 2\'s copy, the inbox or the emails', async () => {
  const R = await import('../lib/referrals.js');
  const { emailKey } = await import('../lib/tenantProfileStore.js');
  const kv = fakeKv({
    [`app:${SOURCE_RL}`]: sourceApp(),
    // The tenant's own profile keeps every answer: the whitelist limits the share, not the profile.
    [`tprofile:${emailKey('maya@mail.ca')}`]: { id: 'dddddddd-0000-4000-8000-000000000001', email: 'maya@mail.ca', emailKey: emailKey('maya@mail.ca'), facts: { ...EMPTY_FORM, ...FACTS, ...PLANTED }, factsUpdatedAt: '2026-11-10T15:00:00.000Z', applications: [], profileRevision: 2 },
  });
  features.overrideFeature('referrals', true);
  try {
    // Realtor 1 asks. A note sent anyway (an old client, a crafted request) is dropped.
    const { ref, token } = await R.createReferral({ fromProfile: REALTOR1, fromListing: LISTING1, link: LINK, toName: 'Priya Patel', toEmail: 'Priya@Brokerage.ca', note: PLANTED.note });
    assert.equal('note' in ref, false, 'no note on the referral'); assert.equal('verification' in ref, false, 'no document summary on the referral');
    clean(kv.values[`referral:${ref.id}`], 'the stored referral');
    assert.equal(JSON.stringify(kv.values[`referral:${ref.id}`]).includes('DOCUMENT-paystub'), false);

    // The tenant's consent page.
    const { default: consent } = await import('../pages/api/referrals/consent.js');
    const page = res(); await consent({ method: 'GET', query: { t: token }, headers: {} }, page);
    assert.equal(page.code, 200);
    assert.deepEqual(Object.keys(page.body).sort(), ['applicantName', 'expiresAt', 'factsSource', 'fields', 'from', 'status', 'to'], 'no note and no document summary on the consent page');
    assert.deepEqual(page.body.fields.map((f) => f.label), F.PROFILE_FACTS.map((f) => f.label));
    assert.equal(page.body.factsSource, 'profile');
    clean(page.body, 'the consent page');

    // The tenant approves: the copy made for Realtor 2.
    const out = await R.decideReferral(token, true);
    assert.equal(out.ok, true);
    const derived = kv.values[`app:${out.ref.referredApplicationNumber}`];
    clean(derived, 'the application made for Realtor 2');
    assert.equal(derived.household.numberOfOccupants, '1', 'the form\'s blank, not the tenant\'s answer');
    assert.equal(derived.coApplicant, null); assert.deepEqual(derived.references, []); assert.equal(derived.lifestyle.pets, null);
    assert.equal(derived.employment.netIncome, null); assert.equal(derived.rental.currentRent, null);
    assert.deepEqual(derived.tenant, { fullName: 'Maya Okafor', ageConfirmed: false, phone: '416 555 0101' }, 'no date of birth');
    assert.deepEqual(Object.keys(derived.referral).sort(), ['approvedAt', 'factsSource', 'fromBrokerage', 'fromName', 'id', 'toEmail', 'toName'], 'who referred and when: no note, no document summary');
    assert.notEqual(derived.ownerToken, 'OWNERTOKENSECRET', 'a new owner token, never Realtor 1\'s');
    assert.equal(JSON.stringify(derived).includes('REALTOR1-LISTING'), false, 'nothing about Realtor 1\'s listing');
    assert.equal(derived.employment.annualIncome, 84000); assert.equal(derived.rental.previousLandlordName, 'Lee Park');

    // Realtor 2's inbox.
    const inbox = await R.inboxFor(REALTOR2);
    assert.equal(inbox.length, 1);
    assert.deepEqual(Object.keys(inbox[0]).sort(), ['applicant', 'applicationNumber', 'approvedAt', 'assignedAt', 'assignedListingId', 'claimed', 'createdAt', 'factsSource', 'from', 'id', 'revoked', 'status']);
    assert.deepEqual(Object.keys(inbox[0].applicant).sort(), ['annualIncome', 'employer', 'employmentType', 'hasLandlordRef', 'jobTitle', 'moveInDate', 'name', 'rentalYears', 'yearsAtJob']);
    clean(inbox, 'the inbox');
    assert.equal(JSON.stringify(inbox).includes('OWNERTOKENSECRET') || JSON.stringify(inbox).includes(derived.ownerToken), false, 'no owner token on the realtor side');

    // The emails to Realtor 2 print no note, even when handed one.
    const E = await import('../lib/referralEmails.js');
    for (const html of [E.receivedEmail({ fromName: 'Sarah Chen', fromBrokerage: 'Harbourfront Realty', applicantName: 'Maya Okafor', note: PLANTED.note, dashboardUrl: 'https://rentletter.ca/dashboard' }), E.inviteEmail({ fromName: 'Sarah Chen', fromBrokerage: 'Harbourfront Realty', applicantName: 'Maya Okafor', note: PLANTED.note, signupUrl: 'https://rentletter.ca/signup' })]) {
      clean(html, 'an email to Realtor 2'); assert.doesNotMatch(html, /note|household|references|full rental application/i);
    }
    assert.doesNotMatch(E.consentEmail({ url: 'https://rentletter.ca/refer/x', fromName: 'Sarah Chen', toName: 'Priya Patel', applicantFirst: 'Maya' }), /household|references|your intro/i, 'the tenant is told what really travels');
  } finally { features.overrideFeature('referrals'); kv.restore(); }
});

test('no note is asked for, sent or printed anywhere in the referral flow', () => {
  const modal = code('components/dashboard/ReferModal.js');
  assert.doesNotMatch(modal, /textarea|setNote|\bnote\b/i, 'the sheet has no note field');
  assert.match(modal, /JSON\.stringify\(\{ listingId, linkId: applicant\.linkId, toName, toEmail \}\)/, 'and sends none');
  assert.doesNotMatch(modal, /household|references|intro/i);
  const create = code('pages/api/referrals/create.js');
  assert.doesNotMatch(create, /\bnote\b|attachDocVerifications|docVerifications/, 'the route takes no note and attaches no document read');
  assert.match(create, /requireRealtor\(req, res\)/); assert.match(create, /requireEntitlement\(req, res, ctx\.supabase, ctx\.user\)/); assert.match(create, /ctx\.supabase\.from\('listings'\)/, 'still behind session, entitlement and the ownership read');
  const lib = code('lib/referrals.js');
  assert.doesNotMatch(lib, /\bnote\s*:|\.note\b|verification_summary\s*:|\.verification\b|numberOfOccupants|dateOfBirth|netIncome|\bpets\b/, 'the library reads and writes no note, no document summary, no household size');
  assert.doesNotMatch(code('pages/api/referrals/consent.js'), /\.note\b|note:|verification|SHARED_FIELDS/);
  for (const p of ['components/dashboard/ReferralInbox.js', 'components/dashboard/ReferralCaution.js', 'pages/refer/[token].js']) assert.doesNotMatch(code(p), /\.note\b|note:|\.verification\b|verification:|occupant|\.pets\b|netIncome|household/i, `${p} shows no note, document summary, household size, pets or after tax income`);
  const emails = code('lib/referralEmails.js');
  assert.doesNotMatch(emails, /\bnote\b|household/i);
});

test('older rows: a stored note, document summary and household size stay stored and are never read again', async () => {
  const R = await import('../lib/referrals.js');
  const { emailKey } = await import('../lib/tenantProfileStore.js');
  const OLD_ID = 'eeeeeeee-0000-4000-8000-00000000000e'; const OLD_RL = 'RL-2026-0LD0-0LD0';
  const oldVerification = { analyzedAt: '2026-09-01T15:00:00Z', verified: true, incomeVerified: true, incomeFigure: 'SUMMARY-$84,000', employmentVerified: true, employerName: 'SUMMARY-Northwind', credit: { band: 'SUMMARY-credit-good' }, documentsCount: 2, forListing: 'SUMMARY-9 King St' };
  const oldRef = { id: OLD_ID, status: 'approved', from: { profileId: REALTOR1.id, name: 'Sarah Chen', brokerage: 'Harbourfront Realty', listingId: LISTING1.id, linkId: LINK.linkId }, to: { email: REALTOR2.email, name: 'Priya Patel', profileId: null },
    note: PLANTED.note, verification: oldVerification, sourceApplicationNumber: SOURCE_RL, applicantEmail: 'maya@mail.ca', applicantEmailKey: emailKey('maya@mail.ca'), applicantName: 'Maya Okafor',
    referredApplicationNumber: OLD_RL, assignedListingId: null, assignedAt: null, createdAt: '2026-09-01T15:00:00.000Z', decidedAt: '2026-09-02T15:00:00.000Z', expiresAt: '2026-09-08T15:00:00.000Z', factsSource: 'snapshot' };
  const oldDerived = { ...sourceApp(), applicationNumber: OLD_RL, ownerToken: 'OLDDERIVEDTOKEN', apartment: { address: null, description: null, estimatedRent: null, rentToIncomeRatio: null },
    referral: { id: OLD_ID, fromName: 'Sarah Chen', fromBrokerage: 'Harbourfront Realty', toName: 'Priya Patel', toEmail: REALTOR2.email, note: PLANTED.note, approvedAt: '2026-09-02T15:00:00.000Z', factsSource: 'snapshot', verification: oldVerification } };
  const kv = fakeKv({ [`referral:${OLD_ID}`]: oldRef, [`app:${OLD_RL}`]: oldDerived });
  kv.store.lists[`referrals_to:${emailKey(REALTOR2.email)}`] = [OLD_ID];
  const old = (value, what) => { clean(value, what); assert.equal(/SUMMARY-/.test(JSON.stringify(value)), false, `${what}: the old document summary was read`); };
  try {
    const inbox = await R.inboxFor(REALTOR2);
    assert.equal(inbox.length, 1); assert.equal(inbox[0].applicant.name, 'Maya Okafor');
    assert.equal('note' in inbox[0], false); assert.equal('verification' in inbox[0], false);
    old(inbox, 'the inbox over an old referral');
    // A claim saves the referral again: what was stored is still stored, nothing is deleted.
    assert.equal(await R.claimReferrals(REALTOR2), 1);
    assert.equal(kv.values[`referral:${OLD_ID}`].note, PLANTED.note, 'the stored note is not deleted');
    assert.deepEqual(kv.values[`referral:${OLD_ID}`].verification, oldVerification, 'nor the stored summary');
    // Assigning rebuilds the application from the whitelist before it reaches Realtor 2's listing.
    // (No database in this test: the write to KV happens first, then the library stops.)
    await assert.rejects(R.assignReferral(kv.values[`referral:${OLD_ID}`], { id: 'L2', name: '30 Bay St', monthly_rent: 2500, bedrooms: 2 }, REALTOR2), /Supabase is not configured/);
    const next = kv.values[`app:${OLD_RL}`];
    assert.equal(next.household.numberOfOccupants, '1'); assert.equal(next.coApplicant, null); assert.deepEqual(next.references, []); assert.equal(next.lifestyle.pets, null); assert.equal(next.employment.netIncome, null);
    assert.equal('dateOfBirth' in next.tenant, false);
    assert.equal(next.apartment.estimatedRent, 2500, 'scored against Realtor 2\'s rent');
  } finally { kv.restore(); }

  // The mirror to the referrals table leaves both columns out, so an upsert cannot touch them.
  const mirror = code('lib/referrals.js').match(/async function mirror\(ref\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(mirror, /\bnote\b|verification_summary/);

  // The read of a realtor's listing: referral_meta is cut to who and when, household size to null.
  const { fetchListingApplicants } = await import('../lib/supabaseBridge.js');
  const db = fakeSupabase({
    listings: [{ id: 'L2', profile_id: REALTOR2.id, monthly_rent: 2500 }],
    listing_applicants: [{ id: 'J2', listing_id: 'L2', application_id: 'A2', decision_status: 'none', added_via: 'referral', created_at: '2026-09-03T15:00:00Z' }],
    applications: [{ id: 'A2', application_number: OLD_RL, full_name: 'Maya Okafor', email: 'maya@mail.ca', annual_income: 84000, number_of_occupants: PLANTED.numberOfOccupants, owner_token: 'OLDDERIVEDTOKEN',
      referral_meta: { id: OLD_ID, fromName: 'Sarah Chen', fromBrokerage: 'Harbourfront Realty', approvedAt: '2026-09-02T15:00:00.000Z', note: PLANTED.note, factsSource: 'snapshot', verification: oldVerification } }],
  });
  const list = await fetchListingApplicants(db, 'L2');
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].application.referral_meta, { id: OLD_ID, fromName: 'Sarah Chen', fromBrokerage: 'Harbourfront Realty', approvedAt: '2026-09-02T15:00:00.000Z', factsSource: 'snapshot' });
  assert.equal(list[0].application.number_of_occupants, null);
  assert.equal(JSON.stringify(list).includes(PLANTED.note) || JSON.stringify(list).includes(PLANTED.numberOfOccupants) || /SUMMARY-/.test(JSON.stringify(list)), false, 'the old note, summary and household size do not reach the realtor\'s browser');
  assert.equal(JSON.stringify(list).includes('OLDDERIVEDTOKEN'), false, 'and no owner token');
  assert.equal(db.tables.applications[0].referral_meta.note, PLANTED.note, 'the stored row is untouched');
});
