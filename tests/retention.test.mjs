// The retention rule is the policy's: twelve months after last activity, never on an active
// listing. Real functions over the fake service role client; every run lands in retention_runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';
register('./helpers/loader.mjs', import.meta.url);
const { retentionCutoff, selectExpired, runRetention, lastActivity } = await import('../lib/retention.js');

const NOW = new Date('2026-09-08T03:30:00Z');
const tables = () => ({
  applications: [
    { id: 'A1', application_number: 'RL-2025-IDLE', created_at: '2025-08-01T00:00:00Z', profile_updated_at: null },                 // no junction: expired
    { id: 'A2', application_number: 'RL-2025-EDIT', created_at: '2025-06-01T00:00:00Z', profile_updated_at: '2026-01-10T00:00:00Z' }, // edited this year: kept
    { id: 'A3', application_number: 'RL-2025-LIVE', created_at: '2025-05-01T00:00:00Z' },                                             // on an active listing: kept
    { id: 'A4', application_number: 'RL-2025-DONE', created_at: '2025-05-01T00:00:00Z' },                                             // rented listing, last confirmation 2025-07-01: expired
    { id: 'A5', application_number: 'RL-2025-DOCS', created_at: '2025-05-01T00:00:00Z' },                                             // a document uploaded in March: kept
    { id: 'A6', application_number: 'RL-2026-NEW1', created_at: '2026-06-01T00:00:00Z' },
  ],
  listing_applicants: [
    { id: 'J3', application_id: 'A3', listing_id: 'L-active', created_at: '2025-05-02T00:00:00Z', confirmations: {} },
    { id: 'J4', application_id: 'A4', listing_id: 'L-rented', created_at: '2025-05-02T00:00:00Z', reviewed_at: '2025-05-03T00:00:00Z', confirmations: { employer: { at: '2025-07-01T00:00:00Z', by: 'You' } } },
    { id: 'J5', application_id: 'A5', listing_id: 'L-rented', created_at: '2025-05-02T00:00:00Z', confirmations: {} },
    { id: 'J6', application_id: 'A6', listing_id: 'L-active', created_at: '2026-06-01T00:00:00Z', confirmations: {} },
  ],
  listings: [{ id: 'L-active', status: 'active', closed_at: null }, { id: 'L-rented', status: 'rented', closed_at: '2025-08-01T00:00:00Z' }],
  applicant_documents: [{ id: 'D5', listing_applicant_id: 'J5', uploaded_at: '2026-03-01T00:00:00Z', deleted_at: '2026-03-15T00:00:00Z' }, { id: 'D4', listing_applicant_id: 'J4', uploaded_at: '2025-06-01T00:00:00Z', deleted_at: null }],
  retention_runs: [],
});

test('last activity is the latest of the application, junction, confirmation and document timestamps', () => {
  assert.equal(lastActivity({ created_at: '2025-08-01T00:00:00Z' }), '2025-08-01T00:00:00.000Z');
  assert.equal(lastActivity({ created_at: '2025-06-01T00:00:00Z', profile_updated_at: '2026-01-10T00:00:00Z' }), '2026-01-10T00:00:00.000Z');
  assert.equal(lastActivity({ created_at: '2025-05-01T00:00:00Z' }, [{ created_at: '2025-05-02T00:00:00Z', reviewed_at: '2025-05-03T00:00:00Z', confirmations: { employer: { at: '2025-07-01T00:00:00Z' } } }]), '2025-07-01T00:00:00.000Z');
  assert.equal(lastActivity({ created_at: '2025-05-01T00:00:00Z' }, [{ created_at: '2025-05-02T00:00:00Z', last_sent_at: '2025-09-09T00:00:00Z' }], [{ uploaded_at: '2026-03-01T00:00:00Z' }]), '2026-03-01T00:00:00.000Z');
  assert.equal(lastActivity({}, [], []), null);
});

test('the selection: older than twelve months of last activity and on no active listing', async () => {
  assert.equal(retentionCutoff(NOW), '2025-09-08T03:30:00.000Z');
  const rows = await selectExpired(fakeSupabase(tables()), retentionCutoff(NOW));
  assert.deepEqual(rows.map((r) => [r.application_number, r.lastActivity, r.junctionIds, r.heldDocuments]), [
    ['RL-2025-DONE', '2025-07-01T00:00:00.000Z', ['J4'], 1],
    ['RL-2025-IDLE', '2025-08-01T00:00:00.000Z', [], 0],
  ], 'the edited one, the one on the active listing and the one with a March document are kept');
});

test('dry run logs the counts, records the run and deletes nothing', async () => {
  const t = tables(); const admin = fakeSupabase(t); const lines = [];
  const out = await runRetention(admin, { now: NOW, log: (l) => lines.push(l) });
  assert.deepEqual([out.enforce, out.applications, out.junctions, out.heldDocuments, out.deleted, out.recorded], [false, 2, 1, 1, 0, true]);
  assert.deepEqual(out.oldest, ['RL-2025-DONE (last activity 2025-07-01)', 'RL-2025-IDLE (last activity 2025-08-01)']);
  assert.equal(admin.deletions.length, 0); assert.equal(t.applications.length, 6);
  const line = lines.find((l) => /DRY RUN/.test(l));
  assert.match(line, /rule=last activity older than 12 months and no active listing applications=2 junctions=1 heldDocuments=1 deleted=0/);
  assert.doesNotMatch(line, /closedListing|90/);
  assert.equal(t.retention_runs.length, 1);
  const run = t.retention_runs[0];
  assert.deepEqual([run.mode, run.applications_considered, run.applications_deleted, run.oldest_application_number, run.details.cutoff], ['dry', 2, 0, 'RL-2025-DONE', '2025-09-08T03:30:00.000Z']);
  assert.equal(t.events?.length ?? 0, 0, 'no events attempt');
});

test('enforce deletes the junction rows then the applications, records the run, and leaves the rest', async () => {
  const t = tables(); const admin = fakeSupabase(t);
  const out = await runRetention(admin, { now: NOW, enforce: true, log: () => {} });
  assert.deepEqual([out.deleted, out.applications, out.recorded], [2, 2, true]);
  assert.deepEqual(admin.deletions, [{ table: 'listing_applicants', n: 1 }, { table: 'applications', n: 2 }]);
  assert.deepEqual(t.applications.map((a) => a.id), ['A2', 'A3', 'A5', 'A6']);
  assert.deepEqual(t.listing_applicants.map((j) => j.id), ['J3', 'J5', 'J6']);
  assert.deepEqual([t.retention_runs[0].mode, t.retention_runs[0].applications_deleted], ['enforce', 2]);
});

test('retention_runs absent: the run is logged and not recorded, nothing throws', async () => {
  const t = tables(); delete t.retention_runs; const admin = fakeSupabase(t);
  const out = await runRetention(admin, { now: NOW, log: () => {} });
  assert.equal(out.recorded, false); assert.equal(out.applications, 2);
});
