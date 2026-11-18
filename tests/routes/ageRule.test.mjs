// The age rule, on the page and on the server (lib/applyAge.js, pages/apply/[token].js,
// pages/party/[token].js, pages/api/generate.js, pages/api/party/self.js).
//   · Ontario: 18 or over, or 16 or 17 with a yes to the s. 4 question (Human Rights Code s. 4),
//     asked only when the date makes them 16 or 17. British Columbia: 19. A guarantor: the age of
//     majority in both provinces. The cases: Ontario 17 who confirms, Ontario 17 who does not,
//     Ontario 15, British Columbia 18, an Ontario 17 year old guarantor.
//   · Both submit routes refuse a request without an explicit yes (none, false, null) and store
//     nothing; a confirmed one is stored as before.
//   · The s. 4 answer is stored beside the age confirmation for the applicant alone, kept on an
//     edit, dropped outside Ontario, and never copied to the applications table or read by a realtor.
//   · A stored yes counts in Ontario; in British Columbia the date is asked on this visit.
//   · The old homepage form is gone: /?invite={token} opens the apply page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { clockAt } from '../helpers/clockAt.mjs';
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, INVITE_TOKEN, NOW } from './fixture.mjs';

const A = await import('../../lib/applyAge.js');
const generate = (await import('../../pages/api/generate.js')).default;
const manage = (await import('../../pages/api/party/manage.js')).default;
const self = (await import('../../pages/api/party/self.js')).default;
const { kvAppToRow } = await import('../../lib/applicationMap.js');
const { buildApplicationFromForm, EMPTY_FORM } = await import('../../lib/tenantProfile.js');
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(`../../${dir}`, import.meta.url))) { const p = `${dir}/${f}`; if (statSync(new URL(`../../${p}`, import.meta.url)).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; };
const until = async (fn, tries = 100) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } return null; };

// A date of birth that makes someone exactly `years` old today (a month past the birthday).
const dob = (years) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() - 30); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const ON = A.ageRuleFor('ON', A.AGE_ROLE.APPLICANT);
const ON_CO = A.ageRuleFor('ON', 'co_applicant');
const ON_GUARANTOR = A.ageRuleFor('ON', 'guarantor');
const BC = A.ageRuleFor('BC', A.AGE_ROLE.APPLICANT);
const BC_GUARANTOR = A.ageRuleFor('BC', 'guarantor');
// What each page decides, from the same functions the pages call.
const page = (form, rule) => ({ band: A.ageBand(form, rule), asks: A.asksWithdrawn(form, rule), valid: A.ageStepValid(form, rule), sends: A.ageForSubmit(form, rule), s4: A.withdrawnForSubmit(form, rule), problem: A.ageProblem(form, rule), review: A.ageReviewLine(form, rule) });
// What the apply page posts (pages/apply/[token].js submitApplication).
const FORM = { fullName: 'Nadia Test', email: 'nadia@example.com', phone: '416 555 0199', jobTitle: 'Nurse', employer: 'Northwind Sample Clinic Inc.', yearsAtJob: '3', annualIncome: '90000', moveInDate: '2027-01-01' };
const applyBody = (form, rule) => ({ ...form, withdrawnFromParentalControl: A.withdrawnForSubmit(form, rule), dateOfBirth: undefined, age: undefined, ageConfirmed: A.ageForSubmit(form, rule), mode: 'application', inviteToken: INVITE_TOKEN });
// The fake stack with L1 reached by the invite token, its realtor in the given province.
const stack = (province) => {
  const t = tables({ profileOver: { province } });
  t.listings.find((l) => l.id === 'L1').invite_token = INVITE_TOKEN;
  const s = installFakeStack({ tables: { ...t, application_events: [] }, user: USER, env: { RESEND_API_KEY: 're_fake' } });
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2600' }, submissionCount: 0 };
  return s;
};
const apps = (s) => Object.keys(s.kv.values).filter((k) => k.startsWith('app:'));
const post = async (handler, body, ip = '203.0.113.60') => { const res = fakeRes(); await handler(fakeReq({ body, ip }), res); return res; };
const stored = async (s, res) => until(() => s.kv.values[`app:${res.body.applicationNumber}`] || null);

test('Ontario 17 who confirms: asked once, the rule is met, the answer is stored beside the confirmation and nowhere a realtor reads', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const seventeen = { ...EMPTY_FORM, ...FORM, dateOfBirth: dob(17) };
  assert.deepEqual(page(seventeen, ON), { band: 's4', asks: true, valid: false, sends: false, s4: undefined, problem: 'Answer the question below.', review: 'Under the age of majority' }, 'asked, and open until answered');
  const yes = { ...seventeen, withdrawnFromParentalControl: true };
  assert.deepEqual(page(yes, ON), { band: 's4', asks: true, valid: true, sends: true, s4: true, problem: '', review: 'Confirmed 16 or 17, withdrawn from parental control' });
  assert.equal(A.WITHDRAWN_QUESTION, 'Have you withdrawn from parental control?', 'one plain yes or no question');
  for (const age of [16, 17]) assert.equal(page({ dateOfBirth: dob(age), withdrawnFromParentalControl: true }, ON).valid, true, `Ontario ${age}`);
  assert.equal(page({ dateOfBirth: dob(18) }, ON).asks, false, 'not asked of an 18 year old');
  assert.equal(page({ dateOfBirth: dob(18) }, ON).valid, true);
  // A co applicant in Ontario: the same.
  assert.equal(page(yes, ON_CO).valid, true); assert.equal(page(seventeen, ON_CO).asks, true);
  // The applicant's submission is stored with the s. 4 answer beside the confirmation.
  const s = stack('ON');
  try {
    const body = applyBody(yes, ON);
    assert.equal('dateOfBirth' in JSON.parse(JSON.stringify(body)), false, 'the date stays on the device');
    const r = await post(generate, body);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const app = await stored(s, r);
    assert.deepEqual(app.tenant, { fullName: 'Nadia Test', ageConfirmed: true, phone: '416 555 0199', withdrawnFromParentalControl: true });
    assert.equal(JSON.stringify(app).includes(dob(17)), false, 'no date stored');
    // Never copied to the applications table, which every realtor read comes from.
    const row = kvAppToRow(app);
    assert.equal(row.age_confirmed, true); assert.equal(JSON.stringify(row).includes('withdrawn'), false);
    // An edit by the tenant keeps it; an edit never adds it.
    const edited = buildApplicationFromForm(app, { ...EMPTY_FORM, ...FORM, phone: '416 555 0100' });
    assert.equal(edited.tenant.withdrawnFromParentalControl, true, 'kept on an edit'); assert.equal(edited.tenant.ageConfirmed, true); assert.equal(edited.tenant.phone, '416 555 0100');
    const plain = buildApplicationFromForm({ tenant: { ageConfirmed: true } }, { ...EMPTY_FORM, ...FORM, withdrawnFromParentalControl: true });
    assert.deepEqual(Object.keys(plain.tenant).sort(), ['ageConfirmed', 'fullName', 'phone'], 'an edit never adds the answer');
  } finally { s.restore(); }
  // A co applicant's submission through their own route: accepted, and nothing about age stored.
  const p = stack('ON');
  try {
    const a4 = p.db.tables.applications.find((x) => x.id === 'A4');
    p.kv.values[`app:${a4.application_number}`] = { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', email: a4.email, tenant: { fullName: a4.full_name } }; a4.owner_token = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
    await post(manage, { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    const token = String(p.resend.sent.find((m) => m.to === 'jordan@example.com').text).match(/\/party\/([A-Z2-9]{32})/)[1];
    const form = { fullName: 'Jordan Lee', phone: '416 555 0199', employmentType: 'full-time', jobTitle: 'Analyst', employer: 'Northwind', yearsAtJob: '1', annualIncome: '41000', incomeKind: 'employment', dateOfBirth: dob(17), withdrawnFromParentalControl: true };
    // What pages/party/[token].js sends: the answer, never the date or the s. 4 answer.
    const sent = { ...form, dateOfBirth: undefined, withdrawnFromParentalControl: undefined, ageConfirmed: A.ageForSubmit(form, ON_CO) };
    assert.equal(sent.ageConfirmed, true);
    const r = await post(self, { token, action: 'submit', form: JSON.parse(JSON.stringify(sent)) });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const party = p.db.tables.application_parties[0];
    assert.equal(party.status, 'submitted');
    assert.equal(/age|birth|withdrawn/i.test(Object.keys(party).join(' ')), false, 'no age, date or s. 4 answer on the party row');
  } finally { p.restore(); }
});

test('Ontario 17 who does not confirm: the step stays open on the page and the server refuses what it is sent', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const no = { ...EMPTY_FORM, ...FORM, dateOfBirth: dob(17), withdrawnFromParentalControl: false };
  assert.deepEqual(page(no, ON), { band: 's4', asks: true, valid: false, sends: false, s4: undefined, problem: 'In Ontario you can apply at 16 or 17 only if you have withdrawn from parental control.', review: 'Under the age of majority' });
  assert.equal(page(no, ON_CO).valid, false);
  const s = stack('ON');
  try {
    const before = apps(s).length;
    const r = await post(generate, applyBody(no, ON));
    assert.equal(r.code, 400); assert.equal(r.body.error, A.AGE_NOT_CONFIRMED);
    assert.equal(apps(s).length, before, 'nothing stored');
  } finally { s.restore(); }
});

test('Ontario 15: never asked the question, never meets the rule, whatever the form holds', () => {
  const fifteen = { dateOfBirth: dob(15), withdrawnFromParentalControl: true, ageConfirmed: true };
  assert.deepEqual(page(fifteen, ON), { band: 'under', asks: false, valid: false, sends: false, s4: undefined, problem: 'In Ontario you must be at least 16 to apply, and 18 unless you have withdrawn from parental control.', review: 'Under the age of majority' });
  assert.equal(page(fifteen, ON_CO).valid, false);
  assert.equal(page({ dateOfBirth: dob(16), withdrawnFromParentalControl: true }, ON).valid, true, '16 is the youngest s. 4 age');
});

test('British Columbia 18: no s. 4 question, 19 is the rule, a stored yes is asked again, and an s. 4 answer is dropped on the server', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const eighteen = { ...EMPTY_FORM, ...FORM, dateOfBirth: dob(18), withdrawnFromParentalControl: true };
  assert.deepEqual(page(eighteen, BC), { band: 'under', asks: false, valid: false, sends: false, s4: undefined, problem: 'You must be at least 19 (the age of majority in British Columbia) to submit a rental application on your own. Applicants under 19 need a guarantor, support for that is coming soon.', review: 'Under the age of majority' });
  assert.equal(page({ dateOfBirth: dob(17), withdrawnFromParentalControl: true }, BC).valid, false, 's. 4 is Ontario law');
  assert.equal(page({ dateOfBirth: dob(19) }, BC).valid, true);
  assert.equal(A.ageHint(BC), 'You must be 19 or over (British Columbia age of majority) to apply on your own. The date stays on this device.');
  // A stored yes: counts in Ontario, not in British Columbia.
  const STEPS = [{ keys: ['email'] }, { keys: ['fullName', 'dateOfBirth', 'phone'] }, { keys: [] }, { keys: [] }];
  const invited = { token: 'x', form: { ...FORM, ageConfirmed: true } };
  assert.equal(A.startStep(invited, STEPS, ON), STEPS.length, 'Ontario: the review, as before');
  assert.equal(A.startStep(invited, STEPS), STEPS.length, 'before the province is known: as in Ontario');
  assert.equal(A.startStep(invited, STEPS, BC), 2, 'British Columbia: the step that asks the date');
  assert.equal(A.ageStepValid(invited.form, ON), true); assert.equal(A.ageStepValid(invited.form, BC), false);
  assert.equal(A.ageReviewLine(invited.form, BC), 'not set'); assert.equal(A.ageForSubmit(invited.form, BC), false);
  assert.equal(A.ageStepValid({ ...invited.form, dateOfBirth: dob(20) }, BC), true, 'a date on this visit settles it');
  assert.equal(A.ageStepValid({ ...invited.form, dateOfBirth: dob(17) }, ON), false, 'a date on this visit overrides a stored yes');
  // The server keeps an s. 4 answer only for a listing in Ontario, read from the listing's realtor.
  for (const [province, kept] of [['BC', false], ['ON', true]]) {
    const s = stack(province);
    try {
      const r = await post(generate, { ...FORM, ageConfirmed: true, withdrawnFromParentalControl: true, mode: 'application', inviteToken: INVITE_TOKEN });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      const app = await stored(s, r);
      assert.equal(app.tenant.ageConfirmed, true);
      assert.equal(app.tenant.withdrawnFromParentalControl === true, kept, `${province}: the s. 4 answer is ${kept ? 'kept' : 'dropped'}`);
    } finally { s.restore(); }
  }
  // Without a row, the KV invite record's province; the sandbox listing is in Ontario.
  const k = stack('ON');
  try {
    k.db.tables.listings.find((l) => l.id === 'L1').invite_token = null; k.kv.values[`linvite:${INVITE_TOKEN}`].province = 'BC';
    const r = await post(generate, { ...FORM, ageConfirmed: true, withdrawnFromParentalControl: true, mode: 'application', inviteToken: INVITE_TOKEN });
    assert.equal((await stored(k, r)).tenant.withdrawnFromParentalControl, undefined, 'the KV record says British Columbia');
  } finally { k.restore(); }
});

test('an Ontario 17 year old guarantor: the age of majority in both provinces, no s. 4 question, refused by the party route without a yes', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const g = { dateOfBirth: dob(17), withdrawnFromParentalControl: true };
  assert.deepEqual(page(g, ON_GUARANTOR), { band: 'under', asks: false, valid: false, sends: false, s4: undefined, problem: 'A guarantor must be at least 18 (the age of majority in Ontario).', review: 'Under the age of majority' });
  assert.equal(page({ dateOfBirth: dob(18) }, ON_GUARANTOR).valid, true);
  assert.equal(page({ dateOfBirth: dob(18) }, BC_GUARANTOR).valid, false); assert.equal(page({ dateOfBirth: dob(19) }, BC_GUARANTOR).valid, true);
  assert.equal(ON_GUARANTOR.s4, false); assert.equal(ON_GUARANTOR.storedYesCounts, false, 'a guarantor never has a stored yes');
  assert.equal(A.ageHint(ON_GUARANTOR), 'A guarantor must be 18 or over (Ontario age of majority). The date stays on this device.');
  const p = stack('ON');
  try {
    const a4 = p.db.tables.applications.find((x) => x.id === 'A4');
    p.kv.values[`app:${a4.application_number}`] = { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', email: a4.email, tenant: { fullName: a4.full_name } }; a4.owner_token = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
    await post(manage, { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', action: 'invite', role: 'guarantor', name: 'Pat Guarantor', email: 'pat@example.com' });
    const token = String(p.resend.sent.find((m) => m.to === 'pat@example.com').text).match(/\/party\/([A-Z2-9]{32})/)[1];
    const form = { fullName: 'Pat Guarantor', address: '9 Guarantor Rd, Ottawa', employmentType: 'full-time', annualIncome: '85000', incomeKind: 'employment' };
    // What the party page sends for a 17 year old guarantor: no yes.
    const r = await post(self, { token, action: 'submit', form: { ...form, ageConfirmed: A.ageForSubmit(g, ON_GUARANTOR) } });
    assert.equal(r.code, 400); assert.equal(r.body.error, A.AGE_NOT_CONFIRMED); assert.deepEqual(Object.keys(r.body.errors), ['dateOfBirth']);
    const party = p.db.tables.application_parties[0];
    assert.notEqual(party.status, 'submitted'); assert.equal(party.annual_income ?? null, null, 'nothing written'); assert.equal((p.db.tables.income_sources || []).length, 0);
  } finally { p.restore(); }
});

test('item 3: a forced submit with no confirmation, false or null is refused by both routes and stores nothing; a confirmed one is stored as before', async (tc) => {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const cases = [['no confirmation', {}], ['false', { ageConfirmed: false }], ['null', { ageConfirmed: null }], ['a string', { ageConfirmed: 'true' }]];
  const s = stack('ON');
  try {
    let n = 0;
    for (const [what, extra] of cases) {
      const before = apps(s).length;
      const r = await post(generate, { ...FORM, ...extra, mode: 'application', inviteToken: INVITE_TOKEN }, `203.0.113.${70 + n++}`);
      assert.equal(r.code, 400, `${what}: refused`); assert.equal(r.body.error, A.AGE_NOT_CONFIRMED);
      assert.equal(apps(s).length, before, `${what}: nothing stored`);
    }
    // The sandbox flow: a demo token through the same route.
    const demo = await post(generate, { ...FORM, mode: 'application', inviteToken: 'demo0000000000000001' }, '203.0.113.79');
    assert.equal(demo.code, 400, 'the sandbox is held to the same rule');
    const ok = await post(generate, { ...FORM, ageConfirmed: true, mode: 'application', inviteToken: 'demo0000000000000001' }, '203.0.113.79');
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
    // Confirmed: stored as today, the same tenant keys as before.
    const r = await post(generate, { ...FORM, ageConfirmed: true, mode: 'application', inviteToken: INVITE_TOKEN }, '203.0.113.78');
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const app = await stored(s, r);
    assert.deepEqual(app.tenant, { fullName: 'Nadia Test', ageConfirmed: true, phone: '416 555 0199' });
    assert.equal(kvAppToRow(app).age_confirmed, true);
  } finally { s.restore(); }
  // The party route.
  const p = stack('ON');
  try {
    const a4 = p.db.tables.applications.find((x) => x.id === 'A4');
    p.kv.values[`app:${a4.application_number}`] = { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', email: a4.email, tenant: { fullName: a4.full_name } }; a4.owner_token = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
    await post(manage, { applicationNumber: a4.application_number, ownerToken: 'ABCDEFGHJKMNPQRSTUVWXYZ234567892', action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    const token = String(p.resend.sent.find((m) => m.to === 'jordan@example.com').text).match(/\/party\/([A-Z2-9]{32})/)[1];
    const form = { fullName: 'Jordan Lee', phone: '416 555 0199', employmentType: 'full-time', annualIncome: '64000', incomeKind: 'employment' };
    for (const [what, extra] of cases) {
      const r = await post(self, { token, action: 'submit', form: { ...form, ...extra } });
      assert.equal(r.code, 400, `party, ${what}: refused`); assert.equal(r.body.error, A.AGE_NOT_CONFIRMED);
      assert.notEqual(p.db.tables.application_parties[0].status, 'submitted', `party, ${what}: nothing written`);
      assert.equal((p.db.tables.income_sources || []).length, 0);
    }
    const r = await post(self, { token, action: 'submit', form: { ...form, ageConfirmed: true } });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(p.db.tables.application_parties[0].status, 'submitted'); assert.equal(p.db.tables.application_parties[0].annual_income, 64000);
  } finally { p.restore(); }
});

test('one rule: every page and route takes its age decisions from lib/applyAge.js, and the s. 4 answer goes nowhere a realtor reads', () => {
  const apply = code('pages/apply/[token].js'); const party = code('pages/party/[token].js');
  assert.match(apply, /const ageRule = ageRuleFor\(listingProvince, AGE_ROLE\.APPLICANT\)/);
  assert.match(apply, /withdrawnFromParentalControl: withdrawnForSubmit\(form, ageRule\), dateOfBirth: undefined, age: undefined, ageConfirmed: ageForSubmit\(form, ageRule\)/);
  assert.match(apply, /setStep\(startStep\(invited, STEPS, ageRuleFor\(json\.province, AGE_ROLE\.APPLICANT\)\)\)/, 'British Columbia asks a stored yes again');
  assert.match(party, /const ageRule = ageRuleFor\(ctx \? ctx\.province : null, ctx \? ctx\.role : null\)/);
  assert.match(party, /form: \{ \.\.\.form, dateOfBirth: undefined, withdrawnFromParentalControl: undefined, ageConfirmed: ageForSubmit\(form, ageRule\) \}/, 'the party page sends the answer, not the date');
  assert.match(code('pages/api/generate.js'), /submittedAge\(formData, ageRuleFor\(province, AGE_ROLE\.APPLICANT\)\)/);
  assert.match(code('pages/api/party/self.js'), /submittedAge\(form, ageRuleFor\(ctx\.profile \? ctx\.profile\.province : null, party\.role\)\)/);
  for (const p of ['pages/apply/[token].js', 'pages/party/[token].js', 'pages/api/generate.js', 'pages/api/party/self.js']) assert.doesNotMatch(code(p), /ageOfMajority\(|>= ?1[6-9]\b|underAgeMsg/, `${p} holds no age arithmetic of its own`);
  // Where the s. 4 answer may appear at all: the rule, the two forms, the route that stores it and
  // the builder that keeps it on an edit. No realtor screen, route, report or email.
  const holders = [...walk('lib'), ...walk('pages'), ...walk('components')].filter((p) => /withdrawnFromParentalControl/.test(src(p))).sort();
  assert.deepEqual(holders, ['lib/applyAge.js', 'lib/tenantProfile.js', 'pages/api/generate.js', 'pages/apply/[token].js', 'pages/party/[token].js']);
  assert.doesNotMatch(src('lib/applicationMap.js'), /withdrawn/i, 'never mapped to a column');
  // The old homepage form: an invite link opens the apply page.
  assert.match(code('pages/index.js'), /if \(inviteParam && \(\/\^\[a-f0-9\]\{20\}\$\/\.test\(inviteParam\) \|\| \/\^demo\\d\{16\}\$\/\.test\(inviteParam\)\)\) \{\s*window\.location\.replace\(`\/apply\/\$\{encodeURIComponent\(inviteParam\)\}`\);\s*return;/);
  assert.doesNotMatch(code('pages/index.js'), /setInviteContext\(json\)/, 'it no longer loads the invite to show its own form');
  // The question and the copy: plain, no dash.
  for (const t of [A.WITHDRAWN_QUESTION, A.AGE_NOT_CONFIRMED, A.ageHint(ON), A.ageHint(ON_CO), A.ageHint(BC), A.ageHint(ON_GUARANTOR)]) assert.doesNotMatch(t, /[—–]| - /);
});
