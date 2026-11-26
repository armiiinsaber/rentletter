// Editing a listing never renames it. The listing setup form (components/listings/ListingSetupModal.js)
// once saved the name as the address on every save, so any edit renamed the listing. An edit now
// saves only what the realtor changed (listingEditPayload): the form opens from the stored row
// (listingFormSeed), the answers are changed as a realtor changes them, and the payload goes through
// the real update route (pages/api/listings/update.js) over the fake stack. A new listing still
// saves every answer, its name from the address as typed (pages/api/listings/create.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER } from './fixture.mjs';

const F = await import('../../components/listings/ListingSetupModal.js');
const create = (await import('../../pages/api/listings/create.js')).default;
const update = (await import('../../pages/api/listings/update.js')).default;
let stack;
const up = () => { if (stack) stack.restore(); stack = installFakeStack({ tables: tables({}), user: USER }); return stack; };
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const OPTS = { askProvince: false, province: '', depositProvince: 'ON' };
const row = (s, id) => ({ ...s.db.tables.listings.find((l) => l.id === id) });
// Every column but the ones the edit meant to change, and the bookkeeping the route stamps.
const rest = (r, changed) => Object.fromEntries(Object.entries(r).filter(([k]) => !changed.includes(k) && !['updated_at'].includes(k)));

test('edit only the rent: the name and the address are unchanged, and only the rent is sent', async () => {
  const s = up();
  const before = row(s, 'L1');
  assert.notEqual(before.name, before.address, 'the fixture listing has a name of its own');
  const stored = F.listingFormSeed(before);
  const form = { ...F.listingFormSeed(before, { listing_brokerage_name: null }), monthly_rent: '2750' };
  const payload = F.listingEditPayload(form, stored, OPTS);
  assert.deepEqual(payload, { monthly_rent: 2750 }, 'the rent alone');
  const r = await call(update, { listingId: 'L1', ...payload });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const after = row(s, 'L1');
  assert.equal(after.monthly_rent, 2750);
  assert.equal(after.name, before.name, 'the name is unchanged');
  assert.equal(after.address, before.address, 'the address is unchanged');
  assert.deepEqual(rest(after, ['monthly_rent']), rest(before, ['monthly_rent']), 'every other column as it was');
});

test('edit only the address: only the address changes, the name stays', async () => {
  const s = up();
  const before = row(s, 'L1');
  const stored = F.listingFormSeed(before);
  const form = { ...stored, address: '212 Carlaw Ave, Unit 4, Toronto' };
  const payload = F.listingEditPayload(form, stored, OPTS);
  assert.deepEqual(payload, { address: '212 Carlaw Ave, Unit 4, Toronto' }, 'the address alone, never the name');
  const r = await call(update, { listingId: 'L1', ...payload });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const after = row(s, 'L1');
  assert.equal(after.address, '212 Carlaw Ave, Unit 4, Toronto');
  assert.equal(after.name, before.name, 'the name is not renamed to the address');
  assert.deepEqual(rest(after, ['address']), rest(before, ['address']), 'every other column as it was');
});

test('an edit with no change sends nothing; a prefilled brokerage the listing lacked is a change', () => {
  const before = { address: '88 Harbour St, Unit 2104, Toronto', name: '88 Harbour St, Unit 2104', monthly_rent: 3100, bedrooms: '2', landlord_email: 'Pat@Example.com', allows_smoking: null, pref_rent_to_income_max_pct: null };
  const stored = F.listingFormSeed(before);
  assert.deepEqual(F.listingEditPayload({ ...stored }, stored, OPTS), {}, 'nothing changed, nothing sent: a stored null stays null, the email is not rewritten');
  const shown = F.listingFormSeed(before, { listing_brokerage_name: 'Demo Realty' });
  assert.deepEqual(F.listingEditPayload(shown, stored, OPTS), { listing_brokerage_name: 'Demo Realty' }, 'what the form showed from the profile is saved, as before');
});

test('create a listing: the name and the address are saved as entered', async () => {
  const s = up();
  const form = { ...F.EMPTY_LISTING_FORM, address: ' 5 New St, Unit 2, Toronto ', unit: '', monthly_rent: '2600', bedrooms: '2', landlord_name: 'Pat Owner', landlord_email: 'pat@example.com' };
  const payload = F.listingPayload(form, OPTS);
  const r = await call(create, payload);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const made = s.db.tables.listings.find((l) => l.id === r.body.listing.id);
  assert.equal(made.address, '5 New St, Unit 2, Toronto', 'the address as typed, trimmed');
  assert.equal(made.name, '5 New St, Unit 2, Toronto', 'the name from the address as typed');
  assert.equal(made.monthly_rent, 2600);
});
