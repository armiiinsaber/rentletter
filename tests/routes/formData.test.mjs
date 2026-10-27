// The board details and the Form data view through the real handlers over the fake stack:
// pages/api/listings/create.js and update.js write every board field and refuse a deposit above
// the province's cap; pages/api/profile/update.js writes the brokerage address and the board;
// pages/api/listings/form-data.js answers 401, 402, 403, 404, 409 and then the groups with the
// event, never owner_token, never an income; and every write still lands before db/012 has run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER, ago } from './fixture.mjs';
import { COPY_ALL, PARTIES } from '../fixtures/formData.mjs';

const create = (await import('../../pages/api/listings/create.js')).default;
const update = (await import('../../pages/api/listings/update.js')).default;
const profileUpdate = (await import('../../pages/api/profile/update.js')).default;
const formData = (await import('../../pages/api/listings/form-data.js')).default;
const status = (await import('../../pages/api/listings/status.js')).default;
const { formDataText } = await import('../../lib/formData.js');
const { BOARD_FIELDS } = await import('../../lib/boardDetails.js');
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
let stack;
const up = (opts = {}) => {
  if (stack) stack.restore();
  const t = tables(opts.fixture || {});
  if (opts.parties) t.application_parties = opts.parties.map((p) => ({ ...p, application_id: 'A1' }));
  stack = installFakeStack({ tables: t, user: opts.user === undefined ? USER : opts.user, absentColumns: opts.absentColumns || [] });
  return stack;
};
const BOARD = {
  mls_number: 'C1234567', listing_brokerage_name: 'Demo Realty', listing_brokerage_address: '8 Sample Ave, Toronto', listing_brokerage_phone: '416 555 0100',
  coop_brokerage_name: 'Other Realty', coop_commission: 'Half a month’s rent plus HST', possession_date: '2026-12-01', lease_term_months: '12',
  utilities_heat: true, utilities_hydro: false, utilities_water: true, parking_spaces: '1', locker: 'B12', furnished: 'no',
  deposit_last_month: '2600', deposit_key: '50',
};
const BODY = { address: '5 New St, Unit 2, Toronto', monthly_rent: 2600, bedrooms: '2', landlord_name: 'Pat Owner', landlord_email: 'pat@example.com', pref_rent_to_income_max_pct: 40 };
const accept = async () => { const r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1', notify: false }); assert.equal(r.code, 200, JSON.stringify(r.body)); };

test('create and update write every board field, cleaned; a deposit above the province\'s cap is refused; nothing here is required', async () => {
  const s = up();
  const r = await call(create, { ...BODY, ...BOARD, evil: 'x' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const row = s.db.tables.listings.find((l) => l.address === BODY.address);
  assert.equal(row.mls_number, 'C1234567'); assert.equal(row.lease_term_months, 12); assert.equal(row.parking_spaces, 1); assert.equal(row.furnished, false); assert.equal(row.utilities_heat, true); assert.equal(row.utilities_hydro, false);
  assert.equal(row.deposit_last_month, 2600); assert.equal(row.deposit_key, 50); assert.equal(row.deposit_security, null, 'Ontario: no security deposit');
  assert.equal(row.possession_date, '2026-12-01'); assert.equal('evil' in row, false);
  // Without any of them a listing is still created.
  assert.equal((await call(create, { ...BODY, address: '6 Bare St' })).code, 200);
  const bare = s.db.tables.listings.find((l) => l.address === '6 Bare St');
  for (const c of BOARD_FIELDS) assert.ok(!(c in bare) || bare[c] == null || bare[c] === false, `${c} is empty on a bare listing`);
  // Above the cap: refused with the one sentence, nothing written.
  const over = await call(update, { listingId: 'L1', deposit_last_month: 2601 });
  assert.equal(over.code, 400); assert.equal(over.body.error, 'Last month’s rent deposit is above what Ontario allows: at most $2,600 on this rent.');
  assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').deposit_last_month, undefined);
  // The cap follows the rent being written in the same request.
  assert.equal((await call(update, { listingId: 'L1', monthly_rent: 3000, deposit_last_month: 2900 })).code, 200);
  assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').deposit_last_month, 2900);
  // British Columbia: the realtor's province picks the deposits and the half month cap.
  const bc = up({ fixture: { profileOver: { province: 'BC' } } });
  assert.equal((await call(update, { listingId: 'L1', deposit_security: 1301 })).code, 400);
  assert.equal((await call(update, { listingId: 'L1', deposit_security: 1300, deposit_pet: 1300, deposit_last_month: 2600 })).code, 200);
  const l1 = bc.db.tables.listings.find((l) => l.id === 'L1');
  assert.equal(l1.deposit_security, 1300); assert.equal(l1.deposit_pet, 1300); assert.equal(l1.deposit_last_month, null, 'BC clears the Ontario deposits');
});

test('the profile writes the brokerage address and the board, the board only from the list', async () => {
  const s = up();
  const r = await call(profileUpdate, { brokerage_address: '8 Sample Ave, Toronto', board: 'trreb' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const p = s.db.tables.profiles.find((x) => x.id === USER.id);
  assert.equal(p.brokerage_address, '8 Sample Ave, Toronto'); assert.equal(p.board, 'trreb');
  assert.equal((await call(profileUpdate, { board: 'elsewhere' })).code, 200);
  assert.equal(s.db.tables.profiles.find((x) => x.id === USER.id).board, null, 'a word off the list is stored as nothing');
});

test('form data: 401, 402, 404, 403 for another realtor, 409 before acceptance, then the groups with the event and never owner_token or an income', async () => {
  up({ user: null });
  assert.equal((await call(formData, { listingId: 'L1' })).code, 401);
  up({ fixture: { plan: 'trial', profileOver: { trial_ends_at: ago(2) } } });
  assert.equal((await call(formData, { listingId: 'L1' })).code, 402);
  let s = up({ parties: PARTIES });
  assert.equal((await call(formData, {})).code, 400);
  assert.equal((await call(formData, { listingId: 'nope' })).code, 404);
  assert.equal((await call(formData, { listingId: 'L9' })).code, 403, 'another realtor\'s listing');
  const early = await call(formData, { listingId: 'L1' });
  assert.equal(early.code, 409); assert.equal(early.body.code, 'not_accepted');
  assert.equal(s.db.tables.events.filter((e) => e.type === 'form_data_opened').length, 0, 'no event before it opens');
  // The board details on L1, then the tenant accepted through mark rented.
  assert.equal((await call(update, { listingId: 'L1', ...BOARD, address: '210 Carlaw Ave, Toronto', unit: '4', landlord_phone: '416 555 0133' })).code, 200);
  s.db.tables.profiles.find((x) => x.id === USER.id).license_number = 'RECO 1234567';
  await accept();
  const r = await call(formData, { listingId: 'L1' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.tenantName, 'Applicant A1A1'); assert.equal(r.body.province, 'ON');
  assert.equal(formDataText(r.body.groups), COPY_ALL, 'the exact Copy all text for the fixture');
  const json = JSON.stringify(r.body);
  for (const never of ['owner_token', '92000', '92,000', '85000', '85,000', '64000', '64,000', 'annual_income', 'Northwind', 'docVerifications', 'fit']) assert.equal(json.includes(never), false, `${never} never appears`);
  const ev = s.db.tables.events.filter((e) => e.type === 'form_data_opened');
  assert.equal(ev.length, 1); assert.equal(ev[0].listing_id, 'L1'); assert.equal(ev[0].profile_id, USER.id); assert.equal(ev[0].payload.tenantName, 'Applicant A1A1');
  await call(formData, { listingId: 'L1' });
  assert.equal(s.db.tables.events.filter((e) => e.type === 'form_data_opened').length, 2, 'one event per open');
  // Another realtor, signed in, never reads it.
  s = up({ user: OTHER, parties: PARTIES });
  assert.equal((await call(formData, { listingId: 'L1' })).code, 403);
  assert.equal(s.db.tables.events.filter((e) => e.type === 'form_data_opened').length, 0);
});

test('before db/012 has run: a listing with board details is still created and updated, the profile still saves, and the view reads Not entered', async () => {
  const absent = [...BOARD_FIELDS, 'brokerage_address', 'board'];
  const s = up({ absentColumns: absent });
  const r = await call(create, { ...BODY, ...BOARD });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const row = s.db.tables.listings.find((l) => l.address === BODY.address);
  assert.ok(row && !('mls_number' in row) && row.landlord_name === 'Pat Owner', 'the row lands without the board columns');
  assert.equal((await call(update, { listingId: 'L1', monthly_rent: 2700, mls_number: 'X' })).code, 200);
  assert.equal(s.db.tables.listings.find((l) => l.id === 'L1').monthly_rent, 2700);
  const p = await call(profileUpdate, { brokerage: 'Demo Realty', brokerage_address: '8 Sample Ave', board: 'trreb' });
  assert.equal(p.code, 200, JSON.stringify(p.body)); assert.deepEqual(p.body.skipped.sort(), ['board', 'brokerage_address']);
  await accept();
  const fd = await call(formData, { listingId: 'L1' });
  assert.equal(fd.code, 200, JSON.stringify(fd.body));
  const premises = fd.body.groups.find((g) => g.key === 'premises');
  assert.equal(premises.items.find((it) => it.key === 'locker').value, null);
  assert.equal(fd.body.groups.find((g) => g.key === 'rent').items[0].value, '$2,700');
});
