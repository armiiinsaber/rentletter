// The title follows the address, and only while it is the address. The listing setup form
// (components/listings/ListingSetupModal.js) has no name field: a new listing takes its name from
// the address, and an edit saves only what the realtor changed (listingEditPayload), from the stored
// row (listingStored: the form's answers, listingFormSeed, and the stored name). When the address
// changes and the stored name is the old address (case and surrounding spaces aside) or empty, the
// new address goes as the name too; a name of its own stays; an edit that leaves the address alone
// sends no name. The payloads go through the real update route (pages/api/listings/update.js) over
// the fake stack. A new listing still saves every answer, its name from the address as typed
// (pages/api/listings/create.js).
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
// The fixture, with the listing L1 changed by patch (its name, for most of these).
const up = (patch = null) => {
  if (stack) stack.restore();
  const t = tables({});
  if (patch) Object.assign(t.listings.find((l) => l.id === 'L1'), patch);
  stack = installFakeStack({ tables: t, user: USER });
  return stack;
};
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const OPTS = { askProvince: false, province: '', depositProvince: 'ON' };
const row = (s, id) => ({ ...s.db.tables.listings.find((l) => l.id === id) });
// Every column but the ones the edit meant to change, and the bookkeeping the route stamps.
const rest = (r, changed) => Object.fromEntries(Object.entries(r).filter(([k]) => !changed.includes(k) && !['updated_at'].includes(k)));
const NEW_ADDRESS = '212 Carlaw Ave, Unit 4, Toronto';
// The form opened on L1, its address changed as a realtor changes it, saved through the route.
async function editAddress(s, address = NEW_ADDRESS) {
  const before = row(s, 'L1');
  const stored = F.listingStored(before);
  const payload = F.listingEditPayload({ ...F.listingFormSeed(before), address }, stored, OPTS);
  const r = await call(update, { listingId: 'L1', ...payload });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return { before, payload, after: row(s, 'L1') };
}

test('edit only the rent: the name and the address are unchanged, and only the rent is sent', async () => {
  for (const name of ['210 Carlaw Ave, Unit 4', '210 Carlaw Ave, Unit 4, Toronto']) {
    const s = up({ name });
    const before = row(s, 'L1');
    const stored = F.listingStored(before);
    const form = { ...F.listingFormSeed(before, { listing_brokerage_name: null }), monthly_rent: '2750' };
    const payload = F.listingEditPayload(form, stored, OPTS);
    assert.deepEqual(payload, { monthly_rent: 2750 }, `the rent alone, never the name (${name})`);
    const r = await call(update, { listingId: 'L1', ...payload });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const after = row(s, 'L1');
    assert.equal(after.monthly_rent, 2750);
    assert.equal(after.name, before.name, `the name is unchanged (${name})`);
    assert.equal(after.address, before.address, `the address is unchanged (${name})`);
    assert.deepEqual(rest(after, ['monthly_rent']), rest(before, ['monthly_rent']), 'every other column as it was');
  }
});

test('a name that is the old address follows the new address, case and surrounding spaces aside', async () => {
  for (const name of ['210 Carlaw Ave, Unit 4, Toronto', '  210 CARLAW AVE, unit 4, toronto  ']) {
    const s = up({ name });
    const { before, payload, after } = await editAddress(s);
    assert.deepEqual(payload, { address: NEW_ADDRESS, name: NEW_ADDRESS }, `the address, and the new address as the name (${JSON.stringify(name)})`);
    assert.equal(after.address, NEW_ADDRESS);
    assert.equal(after.name, NEW_ADDRESS, `the title follows the address (${JSON.stringify(name)})`);
    assert.deepEqual(rest(after, ['address', 'name']), rest(before, ['address', 'name']), 'every other column as it was');
  }
});

test('a name of its own stays: editing the address changes only the address', async () => {
  const s = up();
  const { before, payload, after } = await editAddress(s);
  assert.notEqual(before.name.trim().toLowerCase(), before.address.trim().toLowerCase(), 'the fixture listing has a name of its own');
  assert.deepEqual(payload, { address: NEW_ADDRESS }, 'the address alone, never the name');
  assert.equal(after.address, NEW_ADDRESS);
  assert.equal(after.name, before.name, 'the name is not renamed to the address');
  assert.deepEqual(rest(after, ['address']), rest(before, ['address']), 'every other column as it was');
});

test('an empty name takes the new address', async () => {
  for (const name of [null, '', '   ']) {
    const s = up({ name });
    const { before, payload, after } = await editAddress(s);
    assert.deepEqual(payload, { address: NEW_ADDRESS, name: NEW_ADDRESS }, `the address, and the new address as the name (${JSON.stringify(name)})`);
    assert.equal(after.name, NEW_ADDRESS, `the empty name takes the address (${JSON.stringify(name)})`);
    assert.deepEqual(rest(after, ['address', 'name']), rest(before, ['address', 'name']), 'every other column as it was');
  }
});

test('an edit that does not touch the address changes neither the address nor the name', async () => {
  for (const name of ['210 Carlaw Ave, Unit 4, Toronto', '', '210 Carlaw Ave, Unit 4']) {
    const before = row(up({ name }), 'L1');
    const stored = F.listingStored(before);
    // The landlord's email, and the address typed again with spaces around it: the same address.
    const form = { ...F.listingFormSeed(before), landlord_email: 'new@example.com', address: `  ${before.address} ` };
    assert.deepEqual(F.listingEditPayload(form, stored, OPTS), { landlord_email: 'new@example.com' }, `the email alone, neither the address nor the name (${JSON.stringify(name)})`);
  }
});

test('the old address as the name, cut to 80 characters as a new listing cuts it, follows too; a stored row with no name to read keeps it', () => {
  const long = '1288 Lake Shore Boulevard West, Unit 2104, Toronto, Ontario, Canada, M8V 0C2, North Tower';
  assert.ok(long.length > 80, 'the address is longer than a name');
  const made = F.listingPayload({ ...F.EMPTY_LISTING_FORM, address: long }, OPTS).name;
  assert.equal(made, long.slice(0, 80).trim(), 'a new listing takes the first 80 characters');
  const stored = F.listingStored({ address: long, name: made, monthly_rent: 2600 });
  const form = { ...stored, address: '12 Board St, Toronto' };
  assert.deepEqual(F.listingEditPayload(form, stored, OPTS), { address: '12 Board St, Toronto', name: '12 Board St, Toronto' }, 'the cut name follows the new address');
  // The new address longer than a name: the name is its first 80 characters, as a new listing's is.
  const back = { ...F.listingStored({ address: '12 Board St, Toronto', name: '12 Board St, Toronto' }), address: long };
  assert.deepEqual(F.listingEditPayload(back, F.listingStored({ address: '12 Board St, Toronto', name: '12 Board St, Toronto' }), OPTS), { address: long, name: made }, 'the name is the new address cut to 80');
  const bare = F.listingFormSeed({ address: long, name: made });
  assert.deepEqual(F.listingEditPayload({ ...bare, address: '12 Board St, Toronto' }, bare, OPTS), { address: '12 Board St, Toronto' }, 'no stored name given: the name is left alone');
});

test('an edit with no change sends nothing; a prefilled brokerage the listing lacked is a change', () => {
  const before = { address: '88 Harbour St, Unit 2104, Toronto', name: '88 Harbour St, Unit 2104', monthly_rent: 3100, bedrooms: '2', landlord_email: 'Pat@Example.com', allows_smoking: null, pref_rent_to_income_max_pct: null };
  const stored = F.listingStored(before);
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
