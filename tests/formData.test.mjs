// Form data (lib/formData.js, lib/boardDetails.js, docs/form-data.md): the groups in their order,
// the exact Copy all text for a fixture with a co applicant and a guarantor, what is skipped, what
// never appears (anyone's income, a guarantor's employer, owner_token, a document, a Fit number),
// the province's deposits and caps, and Fit identical with and without every board field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { buildFormData, formDataText, groupText, itemLine } = await import('../lib/formData.js');
const B = await import('../lib/boardDetails.js');
const { computeFit } = await import('../lib/fitScore.js');
const { EVENT_TYPES, eventTitle } = await import('../lib/eventTypes.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const { LISTING, PROFILE, APPLICATION, PARTIES, COPY_ALL } = await import('./fixtures/formData.mjs');

test('the groups, in the order an agreement to lease is organized, and the exact Copy all text', () => {
  const { groups } = buildFormData({ listing: LISTING, profile: PROFILE, application: APPLICATION, parties: PARTIES });
  assert.deepEqual(groups.map((g) => g.title), ['Landlord', 'Tenants', 'Guarantor', 'Premises', 'Term', 'Rent and deposits', 'Utilities and inclusions', 'Brokerages and commission']);
  assert.equal(formDataText(groups), COPY_ALL);
  assert.equal(groupText(groups[2]), 'Guarantor\nName: Pat Guarantor\nAddress: 14 Sample Cres, Toronto\nPhone: 416 555 0199');
  assert.equal(itemLine(groups[4].items[0]), 'Start: December 1, 2026');
  const all = JSON.stringify(groups);
  for (const never of ['92000', '92,000', '64000', '64,000', '85000', '85,000', 'Northwind', 'secret-token', 'owner_token', 'annual_income', 'employer', 'Nobody Here', 'no@example.com', 'Fit', 'credit', 'docVerifications']) assert.equal(all.includes(never), false, `${never} never appears`);
  // A guarantor: name, address and phone, nothing else.
  assert.deepEqual(groups[2].items.map((it) => it.label), ['Name', 'Address', 'Phone']);
});

test('empty values read null, are skipped by every copy, and an empty group is left out of Copy all', () => {
  const { groups } = buildFormData({ listing: { address: '5 New St', monthly_rent: 2000 }, profile: { full_name: 'Sarah Chen', province: 'ON' }, application: { full_name: 'Solo Tenant' }, parties: [] });
  assert.equal(groups[1].items[0].label, 'Tenant name', 'one tenant is Tenant');
  assert.deepEqual(groups[0].items.map((it) => it.value), [null, null, null]);
  assert.equal(groupText(groups[0]), '');
  assert.equal(groupText(groups[2]), '', 'no guarantor: nothing to copy');
  assert.equal(formDataText(groups), 'Tenants\nTenant name: Solo Tenant\n\nPremises\nAddress: 5 New St\n\nRent and deposits\nMonthly rent: $2,000\n\nBrokerages and commission\nListing salesperson: Sarah Chen');
  // Parking falls back to the listing's included switch when no count is typed.
  assert.equal(buildFormData({ listing: { parking_included: 'yes' }, profile: {}, application: {}, parties: [] }).groups[3].items[3].value, 'Included');
  // Utilities read nothing until the column exists (before db/012 the row carries no boolean).
  assert.deepEqual(buildFormData({ listing: {}, profile: {}, application: {}, parties: [] }).groups[6].items.map((it) => it.value), [null, null, null, null]);
});

test('the province picks the deposits: Ontario last month and key, British Columbia security and pet at most half a month, and the write refuses more', () => {
  const on = buildFormData({ listing: { ...LISTING, deposit_security: 900, deposit_pet: 900 }, profile: PROFILE, application: APPLICATION, parties: [] });
  assert.deepEqual(on.groups[5].items.map((it) => it.label), ['Monthly rent', 'Last month’s rent deposit', 'Key deposit']);
  const bc = buildFormData({ listing: { ...LISTING, deposit_security: 1300, deposit_pet: 1300 }, profile: { ...PROFILE, province: 'BC' }, application: APPLICATION, parties: [] });
  assert.deepEqual(bc.groups[5].items.map((it) => [it.label, it.value]), [['Monthly rent', '$2,600'], ['Security deposit', '$1,300'], ['Pet damage deposit', '$1,300']]);
  assert.equal(B.depositCap('half', 2600), 1300); assert.equal(B.depositCap('month', 2600), 2600); assert.equal(B.depositCap(null, 2600), null); assert.equal(B.depositCap('half', 0), null);
  // Cleaning: the province's deposits are kept, the others cleared, a cap refused with one sentence.
  const okOn = B.normalizeBoardDetails({ deposit_last_month: '2600', deposit_key: '50', deposit_security: '900', deposit_pet: '900' }, { province: 'ON', monthlyRent: 2600 });
  assert.deepEqual(okOn, { values: { deposit_last_month: 2600, deposit_key: 50, deposit_security: null, deposit_pet: null }, error: null });
  const overOn = B.normalizeBoardDetails({ deposit_last_month: 2601 }, { province: 'ON', monthlyRent: 2600 });
  assert.equal(overOn.error, 'Last month’s rent deposit is above what Ontario allows: at most $2,600 on this rent.');
  const overBc = B.normalizeBoardDetails({ deposit_pet: 1301 }, { province: 'BC', monthlyRent: 2600 });
  assert.equal(overBc.error, 'Pet damage deposit is above what British Columbia allows: at most $1,300 on this rent.');
  assert.equal(B.normalizeBoardDetails({ deposit_security: 1300, deposit_last_month: 2600 }, { province: 'BC', monthlyRent: 2600 }).values.deposit_last_month, null, 'BC clears the Ontario deposits');
  assert.equal(B.normalizeBoardDetails({ deposit_key: 5000 }, { province: 'ON', monthlyRent: 2600 }).error, null, 'the key deposit has no dollar cap');
  // Types: text trimmed and bounded, dates strict, integers, booleans, furnished three ways.
  const v = B.normalizeBoardDetails({ mls_number: '  C1 ', possession_date: 'December 1', lease_term_months: '12', utilities_heat: 'yes', utilities_hydro: false, furnished: 'no', parking_spaces: '-1', locker: '' }, { province: 'ON', monthlyRent: 2600 }).values;
  assert.deepEqual(v, { mls_number: 'C1', possession_date: null, lease_term_months: 12, utilities_heat: true, utilities_hydro: false, furnished: false, parking_spaces: null, locker: null });
  assert.equal(B.normalizeBoardDetails({ furnished: '' }, {}).values.furnished, null);
  assert.deepEqual(B.boardRows(LISTING, 'ON').map(([k]) => k), ['MLS number', 'Listing brokerage', 'Cooperating brokerage', 'Commission', 'Possession', 'Lease term', 'Utilities included', 'Parking spaces', 'Locker', 'Furnished', 'Last month’s rent deposit', 'Key deposit']);
  assert.deepEqual(B.boardRows({}, 'ON'), []);
  assert.equal(B.longDate('2026-12-01'), 'December 1, 2026'); assert.equal(B.longDate(null), null);
});

test('nothing here enters Fit or the criteria: Fit is byte identical with and without every board field', () => {
  const base = { id: 'L1', monthly_rent: 2600, pref_rent_to_income_max_pct: 40, pref_requires_landlord_reference: true, pref_requires_employer_verification: true };
  const application = { full_name: 'Applicant', annual_income: 92000, employer: 'Employer', years_at_job: '3', prev_landlord_name: 'A. Owner', years_at_previous: 2 };
  const a = computeFit({ application, listing: base, verification: null, confirmations: {}, now: Date.parse('2026-10-27T12:00:00Z') });
  const b = computeFit({ application, listing: { ...base, ...LISTING, id: 'L1', monthly_rent: 2600 }, verification: null, confirmations: {}, now: Date.parse('2026-10-27T12:00:00Z') });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const fit = src('lib/fitScore.js');
  for (const c of B.BOARD_FIELDS) assert.equal(fit.includes(c), false, `lib/fitScore.js never reads ${c}`);
  for (const f of ['lib/criteria.js', 'lib/listingForm.js']) { let s = ''; try { s = src(f); } catch (e) { s = ''; } for (const c of B.BOARD_FIELDS) assert.equal(s.includes(c), false, `${f} never reads ${c}`); }
});

test('the event type, the migration, the document and the sheet', () => {
  assert.ok(EVENT_TYPES.includes('form_data_opened'));
  assert.equal(eventTitle({ type: 'form_data_opened', payload: { listingName: '210 Carlaw Ave, Unit 4' } }), 'You opened the form data for 210 Carlaw Ave, Unit 4');
  const sql = src('db/012-board-details.sql');
  for (const c of B.BOARD_FIELDS) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c} `), `db/012 adds listings.${c}`);
  for (const c of B.PROFILE_BOARD_FIELDS) assert.match(sql, new RegExp(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ${c} text`));
  assert.match(sql, /IF cdef IS NOT NULL AND cdef LIKE '%form_data_opened%' THEN RETURN; END IF;/, 'the events constraint is rewritten once, the db/008 way');
  assert.match(src('db/events.sql'), /'form_data_opened'/);
  assert.equal(/[—–]/.test(sql), false, 'no dash in the SQL');
  const doc = src('docs/form-data.md');
  for (const c of B.BOARD_FIELDS) assert.ok(doc.includes(c), `docs/form-data.md names ${c}`);
  assert.match(doc, /OREA's copyrighted\s+form/);
  // The sheet: every board field is written from the form, none is required, and the route reads
  // the realtor's own province.
  const sheet = src('components/listings/ListingSetupModal.js');
  assert.match(sheet, /Board details \(optional\)/); assert.match(sheet, /aria-controls="listing-board-details"/);
  for (const c of B.BOARD_FIELDS) assert.ok(sheet.includes(c), `the sheet holds ${c}`);
  assert.match(sheet, /const req = \{\n    address:/, 'the required set is unchanged');
  const route = src('pages/api/listings/form-data.js');
  assert.match(route, /withRealtor\(/); assert.match(route, /ownedListing\(admin, listingId, user\.id\)/); assert.match(route, /String\(own\.profile_id\) !== String\(user\.id\)/);
  assert.match(route, /select\('id, full_name, email, phone, prev_address'\)/, 'the applicant row by named columns: owner_token never leaves the server');
  assert.match(route, /recordForListing\(admin, own\.id, 'form_data_opened'/);
  assert.match(src('components/dashboard/ListingView.js'), /tenantHeld && \(/);
});

test('no dash as punctuation in any of the new copy', () => {
  for (const f of ['lib/boardDetails.js', 'lib/formData.js', 'components/dashboard/FormDataSheet.js', 'docs/form-data.md', 'db/012-board-details.sql', 'pages/api/listings/form-data.js']) {
    const s = src(f);
    assert.equal(/[—–]/.test(s), false, `${f} carries an em or en dash`);
    // A hyphen as punctuation lives in prose: comments, strings and the documents; arithmetic is code.
    const prose = /\.(md|sql)$/.test(f) ? s.replace(/^\s*-\s/gm, '') : [...s.matchAll(/\/\/.*$|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/gm)].map((m) => m[0]).join('\n');
    assert.equal(/\s-\s|\w-\s|\s-\w/.test(prose), false, `${f} carries a hyphen as punctuation`);
  }
});
