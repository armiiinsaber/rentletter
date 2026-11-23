// The tenant's full name and phone, edited in place in Contact on their profile (pages/my-application.js,
// components/tenant/ProfileFacts.js contactName), saved through the route the page always used:
// POST /api/tenant/profile update-facts (pages/api/tenant/profile.js, lib/tenantProfileStore.js
// cleanFacts), over the fake stack. The walk drives the page itself
// (tests/routes/profileCircleWebkit.test.mjs).
//   1. a new name saves, and no other fact the profile held changes;
//   2. a new phone saves, as the field formats it;
//   3. a profile with no name: every save is refused until it has one, then the same save goes through;
//   4. the Contact form on the profile: the full name and the phone, with their input types and
//      autocomplete; the email shown as it is (it changes through its own confirmation); the
//      snapshot page's Contact form unchanged;
//   5. the page: a missing name said at the top with one button that opens the field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeReq, fakeRes } = await import('../helpers/fakeStack.mjs');
const { tables, USER } = await import('./fixture.mjs');
const S = await import('../../lib/tenantProfileStore.js');
const route = (await import('../../pages/api/tenant/profile.js')).default;
const { PROFILE_FACTS } = await import('../../lib/profileFacts.js');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const F = await import('../../components/tenant/ProfileFacts.js');

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const TYPED = { fullName: 'Maya Okafor', email: 'maya@example.com', phone: '(416) 555-0142', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000', yearsAtJob: '3', moveInDate: '2027-01-01' };

async function signedIn(facts) {
  const t = tables();
  Object.assign(t, { tenant_profiles: [], tenant_profile_shareable: [], tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [], profile_shares: [] });
  const stack = installFakeStack({ tables: t, user: USER });
  const p = S.blankProfile('maya@example.com'); p.facts = { ...facts }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z'; p.profileRevision = 1;
  await S.saveProfile(p);
  const token = await S.createSession(p.id);
  stack.kv.values[`tprofile_id:${p.id}`] = JSON.stringify(p.emailKey);
  const headers = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(token)}` };
  const call = async (method, body) => { const res = fakeRes(); await route(fakeReq({ method, body, headers }), res); return res; };
  const facts0 = async () => (await call('GET')).body.facts;
  // The page's own save: the whole draft, the email as the profile holds it (pages/my-application.js saveEdit).
  const save = async (draft) => call('POST', { action: 'update-facts', form: { ...draft, email: 'maya@example.com' } });
  return { call, facts0, save };
}

test('the name and the phone are facts the whitelist already carries', () => {
  for (const key of ['fullName', 'phone']) assert.ok(PROFILE_FACTS.some((f) => f.key === key), key);
});

test('1. a new name saves, and no other fact the profile held changes', async () => {
  const { facts0, save } = await signedIn(TYPED);
  const before = await facts0();
  const r = await save({ ...before, fullName: 'Maya Okafor Adeyemi' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const after = await facts0();
  assert.equal(after.fullName, 'Maya Okafor Adeyemi');
  for (const k of Object.keys(before)) if (k !== 'fullName') assert.equal(after[k], before[k], `${k}: only the name changed`);
});

test('2. a new phone saves, as the field formats it', async () => {
  const { facts0, save } = await signedIn(TYPED);
  const before = await facts0();
  assert.equal(F.formatPhone('4165550177'), '(416) 555-0177');
  const r = await save({ ...before, phone: F.formatPhone('4165550177') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const after = await facts0();
  assert.equal(after.phone, '(416) 555-0177');
  for (const k of Object.keys(before)) if (k !== 'phone') assert.equal(after[k], before[k], `${k}: only the phone changed`);
});

test('3. a profile with no name: every save is refused until it has one, then the same save goes through', async () => {
  const { facts0, save } = await signedIn({ ...TYPED, fullName: '' });
  const before = await facts0();
  const refused = await save({ ...before, jobTitle: 'Clinical Operations Lead' });
  assert.equal(refused.code, 400); assert.equal(refused.body.error, 'Your name is required.');
  assert.equal((await facts0()).jobTitle, 'Clinic Coordinator', 'nothing was written');
  const fixed = await save({ ...before, jobTitle: 'Clinical Operations Lead', fullName: 'Maya Okafor' });
  assert.equal(fixed.code, 200, JSON.stringify(fixed.body));
  const after = await facts0();
  assert.equal(after.fullName, 'Maya Okafor'); assert.equal(after.jobTitle, 'Clinical Operations Lead', 'what was typed before is saved with it');
});

test('4. the Contact form on the profile: the full name and the phone, with their types and autocomplete', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(F.FactSourceContext.Provider, { value: 'Typed by you on November 1, 2026' },
    React.createElement(F.FactSections, { facts: TYPED, draft: { ...TYPED }, editing: 'contact', setDraft() {}, canEdit: false, saving: false, onEdit() {}, onCancel() {}, onSave() {}, only: ['contact'], ...props })));
  const html = draw({ contactName: true });
  const input = (field) => (html.match(new RegExp(`<input[^>]*data-field="${field}"[^>]*>`)) || [''])[0];
  assert.match(input('fullName'), /type="text"/); assert.match(input('fullName'), /autoComplete="name"/i);
  assert.match(input('phone'), /type="tel"/); assert.match(input('phone'), /inputMode="tel"/i); assert.match(input('phone'), /autoComplete="tel"/i);
  assert.equal(input('email'), '', 'the email is not edited here: it changes through its own confirmation');
  // Read, the section shows all three; a tap on the name or the phone opens its field.
  const read = renderToStaticMarkup(React.createElement(F.FactSourceContext.Provider, { value: 'Typed by you' },
    React.createElement(F.FactSections, { facts: TYPED, draft: null, editing: null, setDraft() {}, canEdit: true, saving: false, onEdit() {}, onCancel() {}, onSave() {}, only: ['contact'], contactName: true })));
  for (const field of ['fullName', 'phone']) assert.match(read, new RegExp(`data-field-row="${field}"`), field);
  assert.match(read, /maya@example\.com/);
  assert.match(read, /data-section-edit="contact"/, 'Contact can be edited');
  // The snapshot page (one application, pages/my-application/[rl].js) keeps its email and phone form.
  const snap = draw({});
  assert.match(snap, /<input[^>]*data-field="email"/); assert.doesNotMatch(snap, /data-field="fullName"/);
  assert.doesNotMatch(src('pages/my-application/[rl].js'), /contactName/);
});

test('5. the page: Contact edits the name in place, and a missing name is said at the top with one button', () => {
  const page = src('pages/my-application.js');
  assert.match(page, /contactName saveLabel="Save to my profile"/);
  assert.doesNotMatch(page, /contactEditable=\{false\}/);
  const missing = page.slice(page.indexOf('data-name-missing'), page.indexOf('data-name-missing') + 600);
  assert.match(page, /\{f && !has\(f\.fullName\) && \(\s*<div className="tp-invite" data-name-missing=""/);
  assert.equal((missing.match(/<button/g) || []).length, 1, 'one button');
  assert.match(missing, /onClick=\{askName\}>Add your name<\/button>/);
  assert.match(page, /const askName = \(\) => \{\s*if \(!editing\) \{ startEdit\('contact', 'fullName'\); return; \}/);
  // Saves through the route the page always used, with the payload it always sent.
  assert.match(page, /const j = await post\(\{ action: 'update-facts', form: draft \}\);/);
  // One red button on the page, the apply box (tests/profileLayout.test.mjs).
  assert.equal((page.match(/mp-btn-red/g) || []).length, 1);
});
