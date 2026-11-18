// Null means unknown, and unknown is not confirmed: the age of majority answer through a
// Pipeline invite (lib/applicationMap.js ageConfirmedOf, lib/pipelinePrefill.js rowToForm,
// lib/applyAge.js, pages/apply/[token].js, pages/api/generate.js).
//   Four stored rows: a null column, an absent column with no scorecard answer, a null column
//   with an old scorecard false, and a stored true. Each goes through the prefill, the step the
//   applicant lands on, the age step, the review line, the submission and the stored new
//   application. Only the stored true prefills as confirmed; the other three must confirm on this
//   visit, and nothing ever stores a yes the applicant did not give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { clockAt } from '../helpers/clockAt.mjs';
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, INVITE_TOKEN, NOW } from './fixture.mjs';

const generate = (await import('../../pages/api/generate.js')).default;
const { ageConfirmedOf, kvAppToRow } = await import('../../lib/applicationMap.js');
const { rowToForm } = await import('../../lib/pipelinePrefill.js');
const { ageRuleFor, AGE_ROLE, ageStepValid, ageForSubmit, withdrawnForSubmit, ageReviewLine, startStep, AGE_NOT_CONFIRMED } = await import('../../lib/applyAge.js');
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const until = async (fn, tries = 100) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } return null; };

// The page's steps, read from the page itself so the test follows it.
const STEPS = [...src('pages/apply/[token].js').matchAll(/\{ id: '(\w+)', title: '[^']+', keys: \[([^\]]*)\] \}/g)].map((m) => ({ id: m[1], keys: m[2].split(',').map((k) => k.trim().replace(/'/g, '')).filter(Boolean) }));
const AGE_STEP = STEPS.findIndex((s) => s.keys.includes('dateOfBirth')) + 1;
const RULE = ageRuleFor('ON', AGE_ROLE.APPLICANT); // Ontario, the applicant
const BASE = { full_name: 'Nadia Test', email: 'nadia@example.com', phone: '416 555 0199', job_title: 'Nurse', employer: 'Northwind Sample Clinic Inc.', years_at_job: '3', annual_income: 90000, prev_address: '1 Old St', years_at_previous: '2', prev_landlord_name: 'A. Owner', move_in_date: '2027-01-01' };
const ROWS = {
  'a null column': { id: 'A1', application_number: 'RL-2026-TEST-NULL', ...BASE, age_confirmed: null, scorecard: null },
  'an absent column with no scorecard key': { id: 'A2', application_number: 'RL-2026-TEST-NONE', ...BASE, scorecard: { overall: 4.1 } },
  'a null column with an old scorecard false': { id: 'A3', application_number: 'RL-2026-TEST-OLDF', ...BASE, age_confirmed: null, scorecard: { ageConfirmed: false } },
};
const STORED_TRUE = { id: 'A4', application_number: 'RL-2026-TEST-TRUE', ...BASE, age_confirmed: true, scorecard: null };
// What the page posts (pages/apply/[token].js submitApplication).
const body = (form) => ({ ...form, withdrawnFromParentalControl: withdrawnForSubmit(form, RULE), dateOfBirth: undefined, age: undefined, ageConfirmed: ageForSubmit(form, RULE), mode: 'application', inviteToken: INVITE_TOKEN });
const submit = async (s, form, ip) => {
  const res = fakeRes(); await generate(fakeReq({ body: body(form), ip }), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  return until(() => s.kv.values[`app:${res.body.applicationNumber}`] || null);
};

test('the page reads the age step from lib/applyAge.js, and the step that asks the date is found', () => {
  assert.ok(STEPS.length >= 3 && AGE_STEP >= 1, 'the steps were read from the page');
  const page = src('pages/apply/[token].js');
  assert.match(page, /useState\(startStep\(invited, STEPS\)\)/, 'where an invited applicant lands');
  assert.match(page, /dateOfBirth: ageStepValid\(form, ageRule\)/, 'the age step');
  assert.match(page, /\['Age of majority', ageReviewLine\(form, ageRule\)\]/, 'the review line');
  assert.match(page, /ageConfirmed: ageForSubmit\(form, ageRule\), mode: 'application'/, 'the submission');
  assert.doesNotMatch(page, /form\.ageConfirmed/, 'no second reading of the stored answer on the page');
  assert.doesNotMatch(src('lib/applicationMap.js').split('export function ageConfirmedOf')[1].split('\n}')[0], /a\.id|application_number/, 'being a stored row is not an answer');
});

test('a stored confirmation that is not an explicit yes: unticked at prefill, asked on this visit, never stored as yes unasked', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const s = installFakeStack({ tables: tables(), user: null, env: { RESEND_API_KEY: 're_fake' } });
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2600' }, submissionCount: 0 };
  try {
    let n = 0;
    for (const [what, row] of Object.entries(ROWS)) {
      assert.equal(ageConfirmedOf(row), false, `${what}: not confirmed`);
      // Prefill.
      const form = rowToForm(row);
      assert.equal(form.ageConfirmed, false, `${what}: the prefilled form is unticked`);
      assert.equal(form.fullName, 'Nadia Test', `${what}: the rest still prefills`);
      // Where they land, the age step, the review.
      assert.equal(startStep({ token: 'x', form }, STEPS), AGE_STEP, `${what}: lands on the step that asks, not on the review`);
      assert.notEqual(startStep({ token: 'x', form }, STEPS), STEPS.length);
      assert.equal(ageStepValid(form, RULE), false, `${what}: the age step is open, so the review cannot submit`);
      assert.equal(ageReviewLine(form, RULE), 'not set', `${what}: the review does not say confirmed`);
      assert.equal(ageForSubmit(form, RULE), false);
      // A date that makes them under age does not confirm it either.
      const minor = { ...form, dateOfBirth: `${new Date(NOW).getFullYear() - 10}-01-01` };
      assert.equal(ageStepValid(minor, RULE), false); assert.equal(ageReviewLine(minor, RULE), 'Under the age of majority'); assert.equal(ageForSubmit(minor, RULE), false);
      // Sent anyway (a crafted request): refused by the server, and nothing is stored.
      const apps = () => Object.keys(s.kv.values).filter((k) => k.startsWith('app:')).length;
      const before = apps();
      const forced = fakeRes(); await generate(fakeReq({ body: body(form), ip: `203.0.113.${20 + n}` }), forced);
      assert.equal(forced.code, 400, `${what}: nothing stores a yes the applicant did not give`); assert.equal(forced.body.error, AGE_NOT_CONFIRMED);
      assert.equal(apps(), before, `${what}: no application is stored`);
      // Confirmed on this visit: the step closes, the review says so, the new application stores yes.
      const confirmed = { ...form, dateOfBirth: '1990-06-15' };
      assert.equal(ageStepValid(confirmed, RULE), true); assert.equal(ageReviewLine(confirmed, RULE), 'Age requirement met'); assert.equal(ageForSubmit(confirmed, RULE), true);
      assert.equal('dateOfBirth' in JSON.parse(JSON.stringify(body(confirmed))), false, 'the date stays on the device');
      const stored = await submit(s, confirmed, `203.0.113.${20 + n}`);
      assert.equal(stored.tenant.ageConfirmed, true, `${what}: confirmed on this visit, stored true`);
      assert.equal(kvAppToRow(stored).age_confirmed, true);
      assert.equal(JSON.stringify(stored).includes('1990-06-15'), false, 'and the date is not stored');
      n += 1;
    }
  } finally { s.restore(); }
});

test('a stored true still prefills as today: straight to the review, confirmed, stored true', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const s = installFakeStack({ tables: tables(), user: null, env: { RESEND_API_KEY: 're_fake' } });
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2600' }, submissionCount: 0 };
  try {
    assert.equal(ageConfirmedOf(STORED_TRUE), true);
    assert.equal(ageConfirmedOf({ id: 'A5', scorecard: { ageConfirmed: true } }), true, 'column absent, the scorecard says true');
    assert.equal(ageConfirmedOf({ id: 'A6', age_confirmed: null, scorecard: { ageConfirmed: true } }), false, 'a null column is not overruled by the scorecard');
    assert.equal(ageConfirmedOf({ id: 'A7', age_confirmed: false }), false); assert.equal(ageConfirmedOf({ id: 'A8', scorecard: { ageConfirmed: false } }), false); assert.equal(ageConfirmedOf(null), false);
    const form = rowToForm(STORED_TRUE);
    assert.equal(form.ageConfirmed, true);
    assert.equal(startStep({ token: 'x', form }, STEPS), STEPS.length, 'the review');
    assert.equal(startStep(null, STEPS), 1, 'not invited: the first step, as before');
    assert.equal(ageStepValid(form, RULE), true); assert.equal(ageReviewLine(form, RULE), 'Age requirement met'); assert.equal(ageForSubmit(form, RULE), true);
    const stored = await submit(s, form, '203.0.113.40');
    assert.equal(stored.tenant.ageConfirmed, true); assert.equal(kvAppToRow(stored).age_confirmed, true);
  } finally { s.restore(); }
});

test('the compare view says Not shared for a referred copy, never "not stated"', () => {
  const view = src('components/dashboard/ListingView.js'); const compare = src('components/dashboard/CompareTenants.js');
  assert.match(view, /smokerNotShared: notShared\(app, 'smoker'\),\s*petsNotShared: notShared\(app, 'pets'\)/);
  assert.match(compare, /t\.smokerNotShared \? `smoking: \$\{NOT_SHARED\}` : t\.smoker \? t\.smoker\.toLowerCase\(\) : 'smoking not stated'/);
  assert.match(compare, /t\.petsNotShared \? `pets: \$\{NOT_SHARED\}` : t\.pets \? `pets: \$\{t\.pets\}` : 'no pets stated'/);
  assert.match(compare, /import \{ NOT_SHARED \} from '\.\.\/\.\.\/lib\/referredCopy'/);
});
