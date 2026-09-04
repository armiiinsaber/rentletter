import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';
register('./helpers/loader.mjs', import.meta.url);
const { retentionCutoff, selectExpired, runRetention } = await import('../lib/retention.js');

const NOW = new Date('2026-09-04T03:30:00Z');
const tables = () => ({
  applications: [
    { id: 'A1', application_number: 'RL-2025-OLD1', created_at: '2025-08-01T00:00:00Z', scorecard: { v: 1 } },
    { id: 'A2', application_number: 'RL-2025-OLD2', created_at: '2025-09-03T00:00:00Z', scorecard: null },
    { id: 'A3', application_number: 'RL-2025-EDGE', created_at: '2025-09-04T03:30:00Z' },
    { id: 'A4', application_number: 'RL-2026-NEW1', created_at: '2026-06-01T00:00:00Z' },
  ],
  listing_applicants: [{ id: 'J1', application_id: 'A1', listing_id: 'L1' }, { id: 'J4', application_id: 'A4', listing_id: 'L1' }],
  applicant_documents: [{ id: 'D1', listing_applicant_id: 'J1', deleted_at: null }],
  events: [],
});

test('the query selects only applications older than twelve months', async () => {
  assert.equal(retentionCutoff(NOW), '2025-09-04T03:30:00.000Z');
  const admin = fakeSupabase(tables());
  const rows = await selectExpired(admin, retentionCutoff(NOW));
  assert.deepEqual(rows.map((r) => r.application_number), ['RL-2025-OLD1', 'RL-2025-OLD2']);
});

test('dry run logs the counts and the oldest numbers and deletes nothing', async () => {
  const admin = fakeSupabase(tables()); const lines = [];
  const out = await runRetention(admin, { now: NOW, log: (l) => lines.push(l) });
  assert.deepEqual([out.enforce, out.applications, out.junctions, out.heldDocuments, out.deleted], [false, 2, 1, 1, 0]);
  assert.deepEqual(out.oldest, ['RL-2025-OLD1 (2025-08-01)', 'RL-2025-OLD2 (2025-09-03)']);
  assert.equal(admin.deletions.length, 0);
  assert.equal(admin.from('applications').select('id').then ? 4 : 0, 4);
  console.log('  ' + lines[lines.length - 1]);
  assert.match(lines[lines.length - 1], /DRY RUN cutoff=2025-09-04T03:30:00.000Z applications=2 junctions=1 heldDocuments=1 deleted=0/);
});

test('enforce deletes the junction rows then the applications, in batches, and leaves the rest', async () => {
  const t = tables(); const admin = fakeSupabase(t);
  const out = await runRetention(admin, { now: NOW, enforce: true, log: () => {} });
  assert.deepEqual([out.deleted, out.applications], [2, 2]);
  assert.deepEqual(admin.deletions, [{ table: 'listing_applicants', n: 1 }, { table: 'applications', n: 2 }]);
  assert.deepEqual(t.applications.map((a) => a.id), ['A3', 'A4']);
  assert.deepEqual(t.listing_applicants.map((j) => j.id), ['J4']);
});
