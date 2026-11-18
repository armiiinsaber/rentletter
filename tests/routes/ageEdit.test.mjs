// An edit never sets an age answer, and the tenant's own review and the British Columbia message
// read exactly as written (lib/tenantProfile.js storedAge, lib/applyAge.js AGE_MET and
// BC_UNDER_AGE, pages/api/application/manage.js).
//   · through the real edit route: a record stored not confirmed (false, null, or with no answer)
//     edited with ageConfirmed true stays not confirmed, in KV and in the mirrored row; a stored yes
//     edited with ageConfirmed false stays yes; the s. 4 answer is kept exactly and never added;
//   · the review reads "Age requirement met" for every yes, from a date of birth, from s. 4 or
//     stored, in both provinces and for every role, and nothing else on a tenant page says it;
//   · "Applications in British Columbia are open to people 19 or older." is shown only where the
//     British Columbia rule refuses an applicant or a co applicant, and the old sentence is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER } from './fixture.mjs';

const A = await import('../../lib/applyAge.js');
const { buildApplicationFromForm, formFromApplication, storedAge, EMPTY_FORM } = await import('../../lib/tenantProfile.js');
const manage = (await import('../../pages/api/application/manage.js')).default;
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(`../../${dir}`, import.meta.url))) { const p = `${dir}/${f}`; if (statSync(new URL(`../../${p}`, import.meta.url)).isDirectory()) walk(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; };
const dob = (years) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() - 30); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const OWNER = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
// A stored application (the shape pages/api/generate.js writes) for the fixture's A4, with the
// given tenant age answers.
const stored = (num, tenantAge) => ({
  applicationNumber: num, createdAt: '2026-09-01T15:00:00.000Z', email: 'a4@example.com', ownerToken: OWNER, revoked: false, profileRevision: 0,
  tenant: { fullName: 'Applicant D4D4', phone: '416 555 0144', ...tenantAge },
  employment: { jobTitle: 'Analyst', employer: 'Northwind', yearsAtJob: '3', annualIncome: 84000, monthlyIncome: 7000, employmentType: 'full-time', netIncome: null, netIncomeSource: 'estimated' },
  rental: { previousAddress: '12 Elm St', yearsAtPrevious: '2', previousLandlordName: 'Lee Park', previousLandlordContact: 'lee@mail.ca', currentRent: null },
  apartment: { address: '210 Carlaw Ave, Unit 4', description: '2 BR', estimatedRent: 2600, rentToIncomeRatio: 37 },
  move: { moveInDate: 'January 1, 2027', reasonForMoving: null }, household: { numberOfOccupants: '1', smoker: 'no', evParkingNeeded: null },
  coApplicant: null, lifestyle: { personality: null, pets: null }, vehicle: null, references: [], disclosures: null, scorecard: null,
});
// One edit through the route: the tenant's form, with whatever age answers it claims.
async function edit(tenantAge, claim) {
  const s = installFakeStack({ tables: { ...tables(), application_events: [] }, user: USER });
  try {
    const num = s.db.tables.applications.find((a) => a.id === 'A4').application_number;
    s.kv.values[`app:${num}`] = stored(num, tenantAge);
    const form = { ...formFromApplication(stored(num, tenantAge)), phone: '416 555 0199', ...claim };
    const res = fakeRes(); await manage(fakeReq({ body: { applicationNumber: num, ownerToken: OWNER, action: 'update', form } }), res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    return { record: s.kv.values[`app:${num}`], row: s.db.tables.applications.find((a) => a.application_number === num) };
  } finally { s.restore(); }
}

test('item 1: an edit of a stored not confirmed record that sends ageConfirmed true stays not confirmed', async () => {
  for (const [what, tenantAge] of [['stored false', { ageConfirmed: false }], ['stored null', { ageConfirmed: null }], ['no answer stored', {}]]) {
    const { record, row } = await edit(tenantAge, { ageConfirmed: true, withdrawnFromParentalControl: true });
    assert.equal(record.tenant.phone, '416 555 0199', `${what}: the edit itself landed`);
    assert.deepEqual(storedAge(record), tenantAge, `${what}: the age answers are exactly as stored`);
    assert.notEqual(record.tenant.ageConfirmed, true, `${what}: never a yes`);
    assert.equal('withdrawnFromParentalControl' in record.tenant, false, `${what}: an edit never adds an s. 4 answer`);
    assert.notEqual(row.age_confirmed, true, `${what}: the mirrored row is not a yes either`);
  }
});

test('item 1: an edit of a stored yes stays yes, and the s. 4 answer is kept exactly', async () => {
  let { record, row } = await edit({ ageConfirmed: true }, { ageConfirmed: false });
  assert.equal(record.tenant.ageConfirmed, true); assert.equal(row.age_confirmed, true); assert.equal('withdrawnFromParentalControl' in record.tenant, false);
  ({ record, row } = await edit({ ageConfirmed: true, withdrawnFromParentalControl: true }, { ageConfirmed: false, withdrawnFromParentalControl: false }));
  assert.equal(record.tenant.ageConfirmed, true); assert.equal(record.tenant.withdrawnFromParentalControl, true, 'kept as stored'); assert.equal(row.age_confirmed, true);
  assert.equal(JSON.stringify(row).includes('withdrawn'), false, 'never copied to the row');
  // The builder alone, for every caller (the route, the sandbox profile page, a referral copy).
  const base = { ...EMPTY_FORM, fullName: 'A', jobTitle: 'J', employer: 'E', annualIncome: '90000', email: 'a@b.co', ageConfirmed: true, withdrawnFromParentalControl: true };
  assert.deepEqual(storedAge(buildApplicationFromForm(null, base)), {}, 'a record built from a form alone holds no age answer');
  assert.deepEqual(Object.keys(buildApplicationFromForm({ tenant: {} }, base).tenant).sort(), ['fullName', 'phone'], 'nothing read from the form');
  assert.deepEqual(storedAge(buildApplicationFromForm({ tenant: { ageConfirmed: false } }, base)), { ageConfirmed: false });
  assert.deepEqual(storedAge(buildApplicationFromForm({ tenant: { ageConfirmed: true, withdrawnFromParentalControl: true } }, { ...base, ageConfirmed: false, withdrawnFromParentalControl: false })), { ageConfirmed: true, withdrawnFromParentalControl: true });
  // The one place an age answer is set: the submit route, by the rule.
  const builder = code('lib/tenantProfile.js').split('export function buildApplicationFromForm')[1].split('\n}\n')[0];
  assert.doesNotMatch(builder, /ageConfirmed|withdrawnFromParentalControl|rawForm\.age|f\.age/, 'the builder never reads an age answer from the form');
  assert.match(builder, /tenant: \{ fullName, \.\.\.storedAge\(existing\), phone: str\(f\.phone, 40\) \}/);
  assert.doesNotMatch(code('pages/api/application/manage.js'), /ageConfirmed|withdrawnFromParentalControl/, 'nor does the edit route');
});

test('item 2: the review reads "Age requirement met" for every yes, in both provinces, and says nothing else on a tenant page', () => {
  assert.equal(A.AGE_MET, 'Age requirement met');
  const yes = [
    ['Ontario 18, by date', { dateOfBirth: dob(18) }, A.ageRuleFor('ON', 'applicant')],
    ['Ontario 17, s. 4', { dateOfBirth: dob(17), withdrawnFromParentalControl: true }, A.ageRuleFor('ON', 'applicant')],
    ['Ontario 16, s. 4, co applicant', { dateOfBirth: dob(16), withdrawnFromParentalControl: true }, A.ageRuleFor('ON', 'co_applicant')],
    ['Ontario, a stored yes', { ageConfirmed: true }, A.ageRuleFor('ON', 'applicant')],
    ['Ontario guarantor 18', { dateOfBirth: dob(18) }, A.ageRuleFor('ON', 'guarantor')],
    ['British Columbia 19, by date', { dateOfBirth: dob(19) }, A.ageRuleFor('BC', 'applicant')],
    ['British Columbia 40, co applicant', { dateOfBirth: dob(40) }, A.ageRuleFor('BC', 'co_applicant')],
    ['British Columbia guarantor 19', { dateOfBirth: dob(19) }, A.ageRuleFor('BC', 'guarantor')],
  ];
  for (const [what, form, rule] of yes) { assert.equal(A.ageStepValid(form, rule), true, what); assert.equal(A.ageReviewLine(form, rule), 'Age requirement met', what); }
  const no = [
    ['no date, nothing stored', {}, A.ageRuleFor('ON'), 'not set'], ['British Columbia, a stored yes', { ageConfirmed: true }, A.ageRuleFor('BC'), 'not set'],
    ['Ontario 17, no', { dateOfBirth: dob(17), withdrawnFromParentalControl: false }, A.ageRuleFor('ON'), 'Under the age of majority'], ['Ontario 15', { dateOfBirth: dob(15) }, A.ageRuleFor('ON'), 'Under the age of majority'],
  ];
  for (const [what, form, rule, line] of no) assert.equal(A.ageReviewLine(form, rule), line, what);
  // Both tenant pages that show the age result take it from ageReviewLine, and no page or
  // component writes an age result of its own.
  assert.match(code('pages/apply/[token].js'), /\['Age of majority', ageReviewLine\(form, ageRule\)\]/);
  assert.match(code('pages/party/[token].js'), /\['Age', ageReviewLine\(form, ageRule\)\]/);
  const own = [...walk('pages'), ...walk('components')].filter((p) => /Confirmed \$\{|Confirmed 1[6-9]|or over`?\s*:/.test(code(p)));
  assert.deepEqual(own, []);
});

test('item 3: the British Columbia sentence, only where the British Columbia rule refuses an applicant or a co applicant', () => {
  assert.equal(A.BC_UNDER_AGE, 'Applications in British Columbia are open to people 19 or older.');
  for (const role of ['applicant', 'co_applicant']) {
    const rule = A.ageRuleFor('BC', role);
    for (const age of [10, 16, 17, 18]) assert.equal(A.ageProblem({ dateOfBirth: dob(age), withdrawnFromParentalControl: true }, rule), A.BC_UNDER_AGE, `British Columbia ${role} ${age}`);
    assert.equal(A.ageProblem({ dateOfBirth: dob(19) }, rule), '', `British Columbia ${role} 19: no message`);
    assert.equal(A.ageProblem({}, rule), 'Date of birth is required.', 'no date: asked for, not refused');
    assert.doesNotMatch(A.ageHint(rule), /open to people/, 'the hint is not the refusal');
  }
  assert.equal(A.ageProblem({ dateOfBirth: dob(18) }, A.ageRuleFor('BC', 'guarantor')), 'A guarantor must be at least 19 (the age of majority in British Columbia).', 'a guarantor keeps its own sentence');
  for (const role of ['applicant', 'co_applicant', 'guarantor']) for (const age of [10, 15, 16, 17, 18]) {
    assert.notEqual(A.ageProblem({ dateOfBirth: dob(age) }, A.ageRuleFor('ON', role)), A.BC_UNDER_AGE, `never in Ontario (${role} ${age})`);
  }
  // The old sentence is gone from every page, component and library.
  const left = [...walk('lib'), ...walk('pages'), ...walk('components')].filter((p) => /coming soon|need a guarantor/i.test(src(p)));
  assert.deepEqual(left, []);
});
