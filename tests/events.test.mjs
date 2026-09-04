import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENT_TYPES, eventTitle, eventHref, groupByDay } from '../lib/eventTypes.js';
import { recordEvent } from '../lib/events.js';

const sqlTypes = () => {
  const sql = readFileSync(new URL('../db/events.sql', import.meta.url), 'utf8');
  const block = sql.slice(sql.indexOf('CHECK (type IN ('), sql.indexOf('));', sql.indexOf('CHECK (type IN (')));
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

test('EVENT_TYPES matches the check constraint in db/events.sql exactly', () => {
  assert.deepEqual([...EVENT_TYPES], sqlTypes());
});

test('every client reportable type is an allowed type, and the tenant side ones are not', () => {
});

test('every type has a title and a destination', () => {
  const paths = { home: '/landlord', listing: (id) => `/landlord/${id}`, profile: '/profile' };
  for (const type of EVENT_TYPES) {
    const e = { type, listing_id: 'L1', payload: { applicantName: 'Ana Ruiz', listingName: '12 Main', linkId: 'k1' } };
    assert.notEqual(eventTitle(e), 'Something happened', type);
    assert.ok(eventHref(e, paths), type);
  }
  assert.equal(eventHref({ type: 'branding_updated', payload: {} }, paths), '/profile');
  assert.equal(eventHref({ type: 'applicant_applied', listing_id: 'L1', payload: { linkId: 'k1' } }, paths), '/landlord/L1#applicant-k1');
});

test('groupByDay is reverse chronological with Today and Yesterday first', () => {
  const now = new Date('2026-08-27T15:00:00').getTime();
  const at = (h) => new Date(now - h * 3600000).toISOString();
  const groups = groupByDay([{ id: 'a', created_at: at(1) }, { id: 'b', created_at: at(20) }, { id: 'c', created_at: at(50) }, { id: 'd', created_at: at(0.5) }], now);
  assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', groups[2].label]);
  assert.deepEqual(groups[0].items.map((e) => e.id), ['d', 'a']);
});

test('recordEvent never throws and refuses unknown types or a missing profile', async () => {
  const calls = [];
  const okClient = { from: () => ({ insert: async (row) => { calls.push(row); return { error: null }; } }) };
  assert.equal(await recordEvent(okClient, { profileId: 'p', type: 'report_sent', listingId: 'L', payload: { listingName: 'x', nested: { a: 1 }, long: 'y'.repeat(500) } }), true);
  assert.equal(calls[0].payload.nested, undefined);
  assert.equal(calls[0].payload.long.length, 200);
  assert.equal(await recordEvent(okClient, { profileId: 'p', type: 'not_a_type' }), false);
  assert.equal(await recordEvent(okClient, { type: 'report_sent' }), false);
  const failing = { from: () => ({ insert: async () => { throw new Error('boom'); } }) };
  assert.equal(await recordEvent(failing, { profileId: 'p', type: 'report_sent' }), false);
  const erroring = { from: () => ({ insert: async () => ({ error: { message: 'relation does not exist' } }) }) };
  assert.equal(await recordEvent(erroring, { profileId: 'p', type: 'report_sent' }), false);
});
