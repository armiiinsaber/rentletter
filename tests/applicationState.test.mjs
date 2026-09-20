// lib/application-state.js: the map of allowed moves, the forbidden ones, the terminal states,
// the cascades (rented, fell through, reopen), the mapping from the columns that came before,
// and the migrations in db/ that carry the same words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../lib/application-state.js';

const { APPLICATION_STATE: A, LISTING_STATE: L } = S;
const sql = (name) => readFileSync(new URL(`../db/${name}`, import.meta.url), 'utf8');
const NEW_SQL = ['001-application-state-enums.sql', '002-application-state-tables.sql', '003-application-state-backfill.sql', '999-application-state-rollback.sql'];

// Written out by hand, so a change to the module has to be made here as well.
const EXPECTED = {
  draft: ['submitted', 'withdrawn_by_applicant', 'expired'],
  submitted: ['docs_pending', 'shortlisted', 'accepted', 'not_selected', 'withdrawn_by_applicant', 'withdrawn_by_realtor', 'expired'],
  docs_pending: ['submitted', 'shortlisted', 'accepted', 'not_selected', 'withdrawn_by_applicant', 'withdrawn_by_realtor', 'expired'],
  shortlisted: ['submitted', 'accepted', 'not_selected', 'withdrawn_by_applicant', 'withdrawn_by_realtor', 'expired'],
  accepted: ['agreement_signed', 'fell_through', 'withdrawn_by_applicant'],
  agreement_signed: ['deposit_received', 'fell_through'],
  deposit_received: ['lease_signed', 'fell_through'],
  lease_signed: ['moved_in', 'fell_through'],
  fell_through: ['shortlisted', 'not_selected', 'withdrawn_by_applicant', 'expired'],
  withdrawn_by_applicant: ['submitted', 'shortlisted', 'expired'],
  moved_in: [], not_selected: [], withdrawn_by_realtor: [], expired: [],
};
const EXPECTED_LISTING = {
  draft: ['live', 'withdrawn'],
  live: ['paused', 'rented', 'withdrawn'],
  paused: ['live', 'rented', 'withdrawn'],
  rented: ['live', 'withdrawn'],
  withdrawn: ['live'],
};

test('the fourteen application states and the five listing states, by name', () => {
  assert.deepEqual([...S.APPLICATION_STATES], ['draft', 'submitted', 'docs_pending', 'shortlisted', 'accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in', 'not_selected', 'withdrawn_by_applicant', 'withdrawn_by_realtor', 'fell_through', 'expired']);
  assert.deepEqual([...S.LISTING_STATES], ['draft', 'live', 'paused', 'rented', 'withdrawn']);
});

test('every allowed transition is allowed, and nothing else is', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(S.ALLOWED_TRANSITIONS)), EXPECTED);
  let allowed = 0; let refused = 0;
  for (const from of S.APPLICATION_STATES) for (const to of S.APPLICATION_STATES) {
    const ok = EXPECTED[from].includes(to);
    assert.equal(S.canTransition(from, to), ok, `${from} to ${to}`);
    if (ok) { assert.equal(S.assertTransition(from, to), to); allowed++; } else { assert.throws(() => S.assertTransition(from, to), (e) => S.isTransitionError(e) && e.from === from && e.to === to && e.kind === 'application'); refused++; }
  }
  assert.equal(allowed, 39); assert.equal(allowed + refused, 14 * 14);
  assert.deepEqual(JSON.parse(JSON.stringify(S.ALLOWED_LISTING_TRANSITIONS)), EXPECTED_LISTING);
  for (const from of S.LISTING_STATES) for (const to of S.LISTING_STATES) assert.equal(S.canTransitionListing(from, to), EXPECTED_LISTING[from].includes(to), `listing ${from} to ${to}`);
});

test('forbidden transitions throw, submitted to moved_in first among them', () => {
  const forbidden = [
    [A.SUBMITTED, A.MOVED_IN], [A.SUBMITTED, A.LEASE_SIGNED], [A.SUBMITTED, A.DEPOSIT_RECEIVED], [A.SHORTLISTED, A.AGREEMENT_SIGNED],
    [A.ACCEPTED, A.MOVED_IN], [A.ACCEPTED, A.DEPOSIT_RECEIVED], [A.ACCEPTED, A.NOT_SELECTED], [A.ACCEPTED, A.WITHDRAWN_BY_REALTOR],
    [A.AGREEMENT_SIGNED, A.LEASE_SIGNED], [A.DEPOSIT_RECEIVED, A.MOVED_IN],
    [A.NOT_SELECTED, A.SHORTLISTED], [A.NOT_SELECTED, A.ACCEPTED], [A.MOVED_IN, A.FELL_THROUGH], [A.EXPIRED, A.SUBMITTED], [A.WITHDRAWN_BY_REALTOR, A.SUBMITTED],
    [A.DRAFT, A.ACCEPTED], [A.SUBMITTED, A.SUBMITTED], [A.SUBMITTED, 'rejected'], ['nonsense', A.SUBMITTED],
  ];
  for (const [from, to] of forbidden) {
    assert.equal(S.canTransition(from, to), false, `${from} to ${to}`);
    assert.throws(() => S.assertTransition(from, to), /cannot move/);
  }
  // A row that does not exist yet may only start as a draft or as submitted.
  assert.equal(S.assertTransition(null, A.SUBMITTED), A.SUBMITTED);
  assert.equal(S.canTransition(null, A.DRAFT), true);
  for (const to of S.APPLICATION_STATES.filter((s) => s !== A.DRAFT && s !== A.SUBMITTED)) assert.throws(() => S.assertTransition(null, to));
});

test('accepted goes to agreement_signed, fell_through or withdrawn_by_applicant, and nowhere else', () => {
  assert.deepEqual([...S.ALLOWED_TRANSITIONS[A.ACCEPTED]].sort(), [A.AGREEMENT_SIGNED, A.FELL_THROUGH, A.WITHDRAWN_BY_APPLICANT].sort());
});

test('terminal: not_selected, moved_in, withdrawn_by_realtor and expired, and only those', () => {
  assert.deepEqual(S.APPLICATION_STATES.filter(S.isTerminal).sort(), [A.EXPIRED, A.MOVED_IN, A.NOT_SELECTED, A.WITHDRAWN_BY_REALTOR].sort());
  assert.equal(S.isTerminal('nonsense'), false);
});

test('nothing skips the closing: the shortest way from submitted to moved_in is every step in order', () => {
  const shortest = (start, goal) => { const seen = new Map([[start, [start]]]); const q = [start]; while (q.length) { const s = q.shift(); if (s === goal) return seen.get(s); for (const n of S.ALLOWED_TRANSITIONS[s]) if (!seen.has(n)) { seen.set(n, [...seen.get(s), n]); q.push(n); } } return null; };
  assert.deepEqual(shortest(A.SUBMITTED, A.MOVED_IN), [A.SUBMITTED, A.ACCEPTED, A.AGREEMENT_SIGNED, A.DEPOSIT_RECEIVED, A.LEASE_SIGNED, A.MOVED_IN]);
  // moved_in can only be reached from lease_signed, lease_signed only from deposit_received, and so on back.
  const into = (to) => S.APPLICATION_STATES.filter((from) => S.canTransition(from, to));
  assert.deepEqual(into(A.MOVED_IN), [A.LEASE_SIGNED]);
  assert.deepEqual(into(A.LEASE_SIGNED), [A.DEPOSIT_RECEIVED]);
  assert.deepEqual(into(A.DEPOSIT_RECEIVED), [A.AGREEMENT_SIGNED]);
  assert.deepEqual(into(A.AGREEMENT_SIGNED), [A.ACCEPTED]);
});

test('fell_through: the listing returns to live and the remaining shortlisted applications are actionable again', () => {
  const applications = [{ id: 'win', state: A.AGREEMENT_SIGNED }, { id: 's1', state: A.SHORTLISTED }, { id: 's2', state: A.SHORTLISTED }, { id: 'sub', state: A.SUBMITTED }, { id: 'no', state: A.NOT_SELECTED }, { id: 'gone', state: A.WITHDRAWN_BY_APPLICANT }];
  // While the deal stands, nobody else can be acted on.
  for (const a of applications.slice(1)) assert.equal(S.isActionable(a.state, applications.filter((x) => x !== a).map((x) => x.state)), false, a.id);
  for (const listingState of [L.RENTED, L.PAUSED]) {
    const out = S.fellThroughCascade({ listingState, applications, applicationId: 'win' });
    assert.deepEqual(out.application, { id: 'win', from: A.AGREEMENT_SIGNED, to: A.FELL_THROUGH });
    assert.deepEqual(out.listing, { from: listingState, to: L.LIVE });
    assert.equal(out.listingState, L.LIVE);
    assert.deepEqual(out.actionable, ['s1', 's2'], 'the shortlisted ones, not the terminal one and not the withdrawn one');
  }
  assert.equal(S.fellThroughCascade({ listingState: L.LIVE, applications, applicationId: 'win' }).listing, null, 'a listing already live does not move');
  assert.throws(() => S.fellThroughCascade({ listingState: L.RENTED, applications, applicationId: 's1' }), /cannot move/, 'only a deal can fall through');
  assert.throws(() => S.fellThroughCascade({ listingState: L.RENTED, applications, applicationId: 'missing' }));
  // Reopening a rented listing is the same thing for whoever held it.
  assert.deepEqual(S.reopenCascade(applications), [{ id: 'win', from: A.AGREEMENT_SIGNED, to: A.FELL_THROUGH }]);
  assert.deepEqual(S.reopenCascade([{ id: 'in', state: A.MOVED_IN }]), [], 'a tenant who moved in stays moved in');
});

test('marking a listing rented: the winner is accepted and every other application still in play is not_selected', () => {
  const applications = [{ id: 'w', state: A.SHORTLISTED }, { id: 'a', state: A.SUBMITTED }, { id: 'b', state: A.DOCS_PENDING }, { id: 'c', state: A.SHORTLISTED }, { id: 'ft', state: A.FELL_THROUGH }, { id: 'gone', state: A.WITHDRAWN_BY_APPLICANT }, { id: 'no', state: A.NOT_SELECTED }, { id: 'ex', state: A.EXPIRED }];
  const moves = S.rentedCascade(applications, 'w');
  assert.deepEqual(moves, [
    { id: 'w', from: A.SHORTLISTED, to: A.ACCEPTED },
    { id: 'a', from: A.SUBMITTED, to: A.NOT_SELECTED }, { id: 'b', from: A.DOCS_PENDING, to: A.NOT_SELECTED }, { id: 'c', from: A.SHORTLISTED, to: A.NOT_SELECTED }, { id: 'ft', from: A.FELL_THROUGH, to: A.NOT_SELECTED },
  ]);
  for (const m of moves) assert.equal(S.canTransition(m.from, m.to), true);
  assert.deepEqual(S.rentedCascade(applications, null).filter((m) => m.to === A.ACCEPTED), [], 'rented outside Rentletter: nobody is accepted');
  assert.equal(S.rentedCascade(applications, null).length, 5);
  assert.throws(() => S.rentedCascade(applications, 'no'), /cannot move from not_selected to accepted/, 'an applicant already told no cannot be the winner');
  assert.deepEqual(S.rentedCascade([{ id: 'w', state: A.ACCEPTED }, { id: 'a', state: A.SUBMITTED }], 'w'), [{ id: 'a', from: A.SUBMITTED, to: A.NOT_SELECTED }], 'a winner already accepted does not move');
});

test('a label for every state: short, no emoji, no dash', () => {
  for (const s of S.APPLICATION_STATES) { const l = S.applicationStateLabel(s); assert.ok(l && l.length <= 20, s); assert.match(l, /^[A-Z][a-z ]+$/, s); }
  for (const s of S.LISTING_STATES) assert.match(S.listingStateLabel(s), /^[A-Z][a-z]+$/, s);
  assert.equal(S.applicationStateLabel('nonsense'), '');
});

test('the columns that came before: the same mapping the backfill applies', () => {
  const rented = { status: 'rented', rented_link_id: 'J1' };
  const cases = [
    [{ id: 'J1', state: 'lease_signed', withdrawn_at: '2026-09-01' }, null, A.LEASE_SIGNED, 'the state column wins when it is there'],
    [{ id: 'J2', withdrawn_at: '2026-09-01', decision_priority: 'top' }, rented, A.WITHDRAWN_BY_APPLICANT, 'a withdrawal wins'],
    [{ id: 'J1', decision_status: 'none' }, rented, A.ACCEPTED, 'the winner of a rented listing'],
    [{ id: 'J3', decision_status: 'reject' }, rented, A.NOT_SELECTED, 'anyone else on a rented listing'],
    [{ id: 'J4', decision_status: 'shortlist' }, { status: 'active' }, A.SHORTLISTED, 'the unused shortlist value'],
    [{ id: 'J5', decision_status: 'none', decision_priority: 'top' }, { status: 'active' }, A.SHORTLISTED, 'the finalist mark'],
    [{ id: 'J6', decision_status: 'reject', decision_priority: 'top' }, { status: 'active' }, A.SUBMITTED, 'set aside is a working sort, not an ending'],
    [{ id: 'J7', decision_status: 'none', decision_priority: 'normal' }, { status: 'closed' }, A.SUBMITTED, 'everything else'],
    [{ id: 'J8' }, null, A.SUBMITTED, 'an empty row'],
  ];
  for (const [j, l, want, why] of cases) assert.equal(S.applicationStateOf(j, l), want, why);
  assert.equal(S.listingStateOf({ status: 'active' }), L.LIVE);
  assert.equal(S.listingStateOf({ status: 'rented' }), L.RENTED);
  assert.equal(S.listingStateOf({ status: 'closed' }), L.WITHDRAWN);
  assert.equal(S.listingStateOf({}), L.LIVE, 'an absent column reads as live');
  assert.equal(S.listingStateOf({ status: 'active', state: 'paused' }), L.PAUSED, 'the state column wins when it is there');
  const back = sql('003-application-state-backfill.sql');
  for (const line of ["WHEN la.withdrawn_at IS NOT NULL THEN 'withdrawn_by_applicant'", "WHEN l.status = 'rented' AND l.rented_link_id = la.id THEN 'accepted'", "WHEN l.status = 'rented' THEN 'not_selected'", "WHEN la.decision_status = 'shortlist' THEN 'shortlisted'", "WHEN la.decision_priority = 'top' AND la.decision_status IS DISTINCT FROM 'reject' THEN 'shortlisted'", "ELSE 'submitted'", "WHEN 'rented' THEN 'rented' WHEN 'closed' THEN 'withdrawn' ELSE 'live'"]) assert.ok(back.includes(line), line);
  assert.match(back, /WHERE l\.id = la\.listing_id AND la\.state IS NULL;/, 'only rows with no state are written');
  assert.doesNotMatch(back, /UPDATE[^;]*SET\s+(status|decision_status|decision_priority|withdrawn_at)\b/i, 'the old columns are left as they are');
});

test('the tenant still reads what they read before', () => {
  assert.deepEqual(S.tenantStatusFor({ withdrawn_at: '2026-09-01', decision_status: 'reject' }), { key: 'withdrawn', label: 'Withdrawn' });
  assert.deepEqual(S.tenantStatusFor({ decision_status: 'reject' }), { key: 'not_selected', label: 'Not selected for this unit' });
  assert.deepEqual(S.tenantStatusFor({ decision_status: 'none' }), { key: 'submitted', label: 'Submitted' });
});

test('the enums in db/001 carry exactly the module\'s values', () => {
  const file = sql('001-application-state-enums.sql');
  const values = (type) => [...file.matchAll(new RegExp(`ALTER TYPE public\\.${type} ADD VALUE IF NOT EXISTS '([a-z_]+)';`, 'g'))].map((m) => m[1]);
  assert.deepEqual(values('application_state'), [...S.APPLICATION_STATES]);
  assert.deepEqual(values('listing_state'), [...S.LISTING_STATES]);
  assert.deepEqual(values('application_party_role'), [...S.PARTY_ROLES]);
  assert.deepEqual(values('income_source_kind'), [...S.INCOME_KINDS]);
  assert.deepEqual(values('application_actor_type'), [...S.ACTOR_TYPES]);
  assert.equal((file.match(/IF NOT EXISTS \(SELECT 1 FROM pg_type/g) || []).length, 5, 'every type is created behind a guard');
  assert.doesNotMatch(file, /ADD VALUE '(?!.*IF NOT EXISTS)/, 'every value is added behind a guard');
});

test('the migrations: idempotent, owned like the tables they hang off, and nothing they must not carry', () => {
  const tables = sql('002-application-state-tables.sql');
  for (const t of ['applicant_people', 'application_parties', 'income_sources', 'closings', 'application_events']) {
    assert.match(tables, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`), t);
    assert.match(tables, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), `${t} has RLS on`);
    assert.match(tables, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated;`), `${t} starts from nothing`);
    assert.match(sql('999-application-state-rollback.sql'), new RegExp(`DROP TABLE IF EXISTS public\\.${t};`), `${t} has a way back`);
  }
  // Only the two tables that hang off listing_applicants have a policy, and it is a read of the realtor's own.
  assert.deepEqual([...tables.matchAll(/CREATE POLICY (\w+) ON public\.(\w+) FOR (\w+) TO authenticated/g)].map((m) => [m[1], m[2], m[3]]), [['closings_select_own', 'closings', 'SELECT'], ['application_events_select_own', 'application_events', 'SELECT']]);
  assert.equal((tables.match(/l\.profile_id = auth\.uid\(\)/g) || []).length, 2);
  assert.doesNotMatch(tables, /GRANT (INSERT|UPDATE|DELETE|ALL)/, 'no client role writes');
  assert.doesNotMatch(tables.replace(/^\s*--.*$/gm, ''), /^\s*(ALTER TABLE \S+ ADD COLUMN(?! IF NOT EXISTS)|CREATE TABLE(?! IF NOT EXISTS)|CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS))/m, 'every statement is guarded');
  // The deposit can never be more than one month's rent, and the closing cannot skip a step.
  assert.match(tables, /deposit_amount_cents <= monthly_rent_cents/);
  assert.match(tables, /SELECT l\.monthly_rent::bigint \* 100 INTO NEW\.monthly_rent_cents/, 'the rent comes from the listing, never from the caller');
  for (const c of ['closings_deposit_after_agreement', 'closings_lease_after_deposit', 'closings_keys_after_lease']) assert.ok(tables.includes(c), c);
  // An occupant carries no income; a person never carries a Fit result.
  assert.match(tables, /application_parties_occupant_no_income/); assert.match(tables, /income_sources_refuse_occupant/);
  assert.match(tables, /applicant_people_no_fit_result/); assert.match(tables, /email_verified_at\s+timestamptz NOT NULL/);
  // A person or a party going never takes a document row with it: the expiry job still finds the file.
  assert.equal((tables.match(/ALTER TABLE public\.applicant_documents ADD COLUMN IF NOT EXISTS \w+ uuid REFERENCES public\.\w+\(id\) ON DELETE SET NULL;/g) || []).length, 2);
  assert.doesNotMatch(tables, /expires_at/, 'the 14 day window is not touched');

  for (const name of NEW_SQL) {
    const body = sql(name);
    assert.doesNotMatch(body, /owner_token|ownerToken/i, `${name}: the owner token appears nowhere`);
    assert.doesNotMatch(body, /\b(gender|sex|age|birth|dob|marital|family|children|race|ethnic|religio\w*|disab\w*|citizen\w*|nationality|immigra\w*|orientation|welfare|odsp|assistance|form_?410)\b/i, `${name}: no protected ground, no proxy, no Form 410`);
    assert.doesNotMatch(body, /[–—]| - /, `${name}: no dash as punctuation`);
  }
  for (const name of ['lib/application-state.js', 'lib/applicationTransitions.js']) assert.doesNotMatch(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'), /owner_token|ownerToken|[–—]/, name);
});

test('the Fit score does not know the new tables exist', () => {
  for (const name of ['lib/fitScore.js', 'lib/deriveScorecard.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'), /application_parties|income_sources|applicant_people|INCOME_KIND|PARTY_ROLE|application-state/, name);
  }
});
