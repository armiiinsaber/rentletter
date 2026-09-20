// The unit joined into the address (lib/listingAddress.js), and the write path that stores the
// column and carries on when it is not there yet (db/listing-unit.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const { displayAddress, displayLabel, carriesUnit, joinUnit } = await import('../lib/listingAddress.js');
const W = await import('../lib/realtorWrites.js');

test('the join: the unit goes on the end, once', () => {
  assert.equal(displayAddress({ address: '88 Bay Street', unit: '4B' }), '88 Bay Street, Unit 4B');
  assert.equal(displayAddress({ address: '88 Bay Street' }), '88 Bay Street', 'no unit, no change');
  assert.equal(displayAddress({ address: '88 Bay Street', unit: '   ' }), '88 Bay Street', 'a blank unit is no unit');
  assert.equal(displayAddress({ address: '  88  Bay   Street ', unit: ' 4B ' }), '88 Bay Street, Unit 4B', 'both sides are trimmed');
  assert.equal(displayAddress({ name: 'The Carlaw', unit: '4' }), 'The Carlaw, Unit 4', 'the short label stands in for a missing street');
  assert.equal(displayAddress({ unit: '4B' }), 'Unit 4B', 'a unit with no address still reads');
  assert.equal(displayAddress({}, 'the unit'), 'the unit', 'the fallback is used when there is nothing');
  assert.equal(displayLabel({ name: '88 Bay Street', address: '88 Bay Street, Toronto', unit: '12' }), '88 Bay Street, Unit 12', 'the label prefers the name');
  assert.equal(displayAddress({ name: '88 Bay Street', address: '88 Bay Street, Toronto', unit: '12' }), '88 Bay Street, Toronto, Unit 12', 'the address prefers the street');
});

test('the join: an address that already carries the unit is left alone', () => {
  assert.equal(displayAddress({ address: '88 Bay Street, Unit 4B', unit: '4B' }), '88 Bay Street, Unit 4B');
  assert.equal(displayAddress({ address: '88 Bay Street, unit 4b', unit: '4B' }), '88 Bay Street, unit 4b', 'however it was typed');
  assert.equal(displayAddress({ address: '88 Bay Street, Suite 400, Toronto', unit: '400' }), '88 Bay Street, Suite 400, Toronto', 'a named unit counts mid line');
  assert.equal(displayAddress({ address: '210 Carlaw Ave, Unit 4, Toronto', unit: '4' }), '210 Carlaw Ave, Unit 4, Toronto', 'the city may follow it');
  assert.equal(displayAddress({ address: '88 Bay Street, 4B', unit: '4B' }), '88 Bay Street, 4B', 'a bare unit at the end counts');
  assert.equal(displayAddress({ address: '210 Carlaw Ave', unit: '210' }), '210 Carlaw Ave, Unit 210', 'a street number is not a unit');
  assert.equal(displayAddress({ address: '9 Unit Street', unit: '3' }), '9 Unit Street, Unit 3', 'the word unit in a street name is not a unit');
  assert.equal(displayAddress({ address: '88 Bay Street, Unit 4', unit: '4B' }), '88 Bay Street, Unit 4, Unit 4B', 'a different unit is still joined');
  assert.equal(carriesUnit('88 Bay Street, Apt. 6', '6'), true);
  assert.equal(carriesUnit('88 Bay Street', '6'), false);
  assert.equal(joinUnit('', ''), '');
});

test('the write path stores the unit, and retries without it before the migration', async () => {
  const tables = { listings: [], profiles: [{ id: 'me' }], events: [] };
  const admin = fakeSupabase(tables);
  const body = { name: '88 Bay Street', address: '88 Bay Street', unit: '4B', monthly_rent: 2400, bedrooms: '2' };
  assert.deepEqual(Object.keys(W.pickListingFields(body)).includes('unit'), true, 'the form field is one the write path takes');
  const created = await W.createListing({ admin, userId: 'me' }, body);
  assert.equal(created.status, 200);
  assert.equal(created.body.listing.unit, '4B', 'the column is written');
  assert.equal(displayAddress(created.body.listing), '88 Bay Street, Unit 4B');

  // Before db/listing-unit.sql has run, PostgREST answers PGRST204 for the unknown column.
  const missing = { code: 'PGRST204', message: "Could not find the 'unit' column of 'listings' in the schema cache" };
  assert.equal(W.optionalColumnMissing(missing, { unit: '4B' }), true);
  assert.equal(W.optionalColumnMissing(missing, { address: 'x' }), false, 'a row without the column is not retried');
  assert.deepEqual(W.withoutOptional({ address: 'x', unit: '4B' }), { address: 'x' });
  let calls = 0;
  const picky = {
    from: (t) => ({
      insert: (row) => ({ select: () => ({ single: async () => { calls++; return 'unit' in row ? { data: null, error: missing } : { data: { id: 'L1', ...row }, error: null }; } }) }),
      update: (row) => ({ eq: () => ({ select: () => ({ single: async () => { calls++; return 'unit' in row ? { data: null, error: missing } : { data: { id: 'L1', ...row }, error: null }; } }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'L1', profile_id: 'me' }, error: null }) }) }),
    }),
  };
  const before = await W.createListing({ admin: picky, userId: 'me' }, body);
  assert.equal(before.status, 200, 'the listing is still created');
  assert.equal(before.body.listing.address, '88 Bay Street');
  assert.equal('unit' in before.body.listing, false, 'without the column, and without an error for the realtor');
  assert.equal(calls, 2, 'one write, then one retry');
  const edited = await W.updateListing({ admin: picky, userId: 'me' }, { listingId: 'L1', unit: '5C' });
  assert.equal(edited.status, 200, 'an edit retries the same way');
});

test('the migration is idempotent and only adds the column', () => {
  const sql = readFileSync(new URL('../db/listing-unit.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE public\.listings ADD COLUMN IF NOT EXISTS unit text;/);
  assert.match(sql, /COMMENT ON COLUMN public\.listings\.unit IS/);
  assert.doesNotMatch(sql, /DROP|DELETE|UPDATE public\.listings/i, 'nothing existing is touched');
});
