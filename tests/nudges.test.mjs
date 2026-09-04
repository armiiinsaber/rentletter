// The automatic document reminders: the 48 hour and 5 day thresholds, no third, every exclusion,
// the pending set writes, the mint at submission for the invite path only, and the shared
// uploader on both tenant pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectNudge, nudgeEmail, runNudges } from '../lib/nudges.js';
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const H = 3600000, D = 24 * H;
const NOW = new Date('2026-09-10T13:00:00Z');
const at = (ms) => new Date(NOW.getTime() - ms).toISOString();
const base = () => ({
  pointer: { token: 'a'.repeat(32), status: 'requested', requestedAt: at(3 * D), nudgedAt: [] },
  junction: { id: 'J1', listing_id: 'L1', application_id: 'A1', decision_status: 'none', withdrawn_at: null, doc_verifications: null, docs_submitted_at: null },
  listing: { id: 'L1', status: 'active', name: 'Carlaw', profile_id: 'P1' },
  application: { id: 'A1', full_name: 'Priya Nair', email: 'priya@example.com' },
});

test('thresholds: nothing under 48 hours, nudge one from 48 hours, nudge two from 5 days, never a third', () => {
  const c = base();
  c.pointer.requestedAt = at(47 * H); assert.deepEqual(selectNudge(c, NOW), { skip: 'under 48 hours' });
  c.pointer.requestedAt = at(48 * H); assert.deepEqual(selectNudge(c, NOW), { nudge: 1 });
  c.pointer.requestedAt = at(4 * D); c.pointer.nudgedAt = [at(2 * D)]; assert.deepEqual(selectNudge(c, NOW), { skip: 'under 5 days' });
  c.pointer.requestedAt = at(5 * D); assert.deepEqual(selectNudge(c, NOW), { nudge: 2 });
  c.pointer.requestedAt = at(20 * D); c.pointer.nudgedAt = [at(18 * D), at(15 * D)]; assert.deepEqual(selectNudge(c, NOW), { skip: 'both sent' });
  c.pointer.nudgedAt = []; c.pointer.requestedAt = at(9 * D); assert.deepEqual(selectNudge(c, NOW), { nudge: 1 }, 'a late first nudge is still nudge one');
});

test('exclusions: report present, set aside, withdrawn, listing not active, no email, no request', () => {
  let c = base(); c.pointer.status = 'received'; assert.deepEqual(selectNudge(c, NOW), { drop: 'report present' });
  c = base(); c.junction.doc_verifications = [{ analyzedAt: at(D) }]; assert.deepEqual(selectNudge(c, NOW), { drop: 'report present' });
  c = base(); c.junction.docs_submitted_at = at(D); assert.deepEqual(selectNudge(c, NOW), { drop: 'report present' });
  c = base(); c.junction.decision_status = 'reject'; assert.deepEqual(selectNudge(c, NOW), { drop: 'set aside' });
  c = base(); c.junction.withdrawn_at = at(D); assert.deepEqual(selectNudge(c, NOW), { drop: 'withdrawn' });
  c = base(); c.listing.status = 'rented'; assert.deepEqual(selectNudge(c, NOW), { drop: 'listing rented' });
  c = base(); c.listing.status = 'closed'; assert.deepEqual(selectNudge(c, NOW), { drop: 'listing closed' });
  c = base(); c.listing = null; assert.deepEqual(selectNudge(c, NOW), { drop: 'listing gone' });
  c = base(); c.junction = null; assert.deepEqual(selectNudge(c, NOW), { drop: 'applicant gone' });
  c = base(); c.application.email = ''; assert.deepEqual(selectNudge(c, NOW), { skip: 'no email' });
  c = base(); c.pointer = null; assert.deepEqual(selectNudge(c, NOW), { drop: 'no request' });
});

test('the two emails as sent', () => {
  const one = nudgeEmail({ nudge: 1, listingName: 'Carlaw', realtorName: 'Sarah Chen', applicantName: 'Priya Nair', uploadUrl: 'https://rentletter.ca/upload/t' });
  assert.equal(one.subject, 'Carlaw: documents for your application');
  assert.equal(one.text, 'Hi Priya,\n\nYour application for Carlaw is in. It is waiting on one thing: a pay stub or employment letter.\n\nTwo minutes, held for 14 days for Sarah Chen\'s review, then deleted.\n\nAdd documents: https://rentletter.ca/upload/t\n\nSarah Chen\n');
  const two = nudgeEmail({ nudge: 2, listingName: 'Carlaw', realtorName: 'Sarah Chen', applicantName: 'Priya Nair', uploadUrl: 'https://rentletter.ca/upload/t' });
  assert.equal(two.paras[1], 'This is the last reminder.');
  assert.match(two.html, /Add documents/);
  assert.doesNotMatch(one.text + two.text, /[—–]/);
});

test('runNudges: sends one and two, stamps nudgedAt, records the event, prunes the set, never a third', async () => {
  const admin = fakeSupabase({
    listing_applicants: [
      { id: 'J1', listing_id: 'L1', application_id: 'A1', decision_status: 'none', withdrawn_at: null },
      { id: 'J2', listing_id: 'L1', application_id: 'A2', decision_status: 'none', withdrawn_at: null },
      { id: 'J3', listing_id: 'L1', application_id: 'A3', decision_status: 'reject', withdrawn_at: null },
      { id: 'J4', listing_id: 'L1', application_id: 'A4', decision_status: 'none', withdrawn_at: null },
    ],
    listings: [{ id: 'L1', status: 'active', name: 'Carlaw', profile_id: 'P1' }],
    applications: [
      { id: 'A1', full_name: 'Priya Nair', email: 'priya@example.com' }, { id: 'A2', full_name: 'Marc Tremblay', email: 'marc@example.com' },
      { id: 'A3', full_name: 'Aside', email: 'a@example.com' }, { id: 'A4', full_name: 'Done', email: 'd@example.com' },
    ],
    profiles: [{ id: 'P1', full_name: 'Sarah Chen', email: 'sarah@brokerage.ca' }],
  });
  const pointers = {
    'docreq-app:J1': { token: 'a'.repeat(32), status: 'requested', requestedAt: at(3 * D), nudgedAt: [] },
    'docreq-app:J2': { token: 'b'.repeat(32), status: 'requested', requestedAt: at(6 * D), nudgedAt: [at(4 * D)] },
    'docreq-app:J3': { token: 'c'.repeat(32), status: 'requested', requestedAt: at(6 * D), nudgedAt: [] },
    'docreq-app:J4': { token: 'd'.repeat(32), status: 'requested', requestedAt: at(9 * D), nudgedAt: [at(7 * D), at(4 * D)] },
  };
  const set = new Set(['J1', 'J2', 'J3', 'J4']);
  const sent = [], events = [], writes = [];
  const kv = { smembers: async () => [...set], mget: async (keys) => keys.map((k) => pointers[k] || null), set: async (k, v) => { pointers[k] = v; writes.push(k); }, srem: async (id) => set.delete(id), appKey: (id) => `docreq-app:${id}`, uploadUrl: (t) => `https://rentletter.ca/upload/${t}`, ttl: 1 };
  const out = await runNudges({ admin, kv, send: async (m) => sent.push(m), recordEvent: async (_a, e) => events.push(e) }, { now: NOW, log: () => {} });
  assert.equal(out.sent, 2); assert.equal(out.dropped, 1); assert.equal(out.skipped, 1);
  assert.deepEqual(sent.map((m) => [m.to, m.subject]), [['priya@example.com', 'Carlaw: documents for your application'], ['marc@example.com', 'Carlaw: documents for your application']]);
  assert.equal(sent[0].from, 'Sarah Chen via Rentletter <hello@rentletter.ca>'); assert.equal(sent[0].reply_to, 'sarah@brokerage.ca');
  assert.match(sent[1].text, /This is the last reminder\./); assert.doesNotMatch(sent[0].text, /last reminder/);
  assert.equal(pointers['docreq-app:J1'].nudgedAt.length, 1); assert.equal(pointers['docreq-app:J2'].nudgedAt.length, 2);
  assert.deepEqual(events.map((e) => [e.type, e.payload.nudge, e.profileId]), [['documents_nudged', 1, 'P1'], ['documents_nudged', 2, 'P1']]);
  assert.deepEqual([...set].sort(), ['J1', 'J2', 'J4'], 'the set aside applicant left the set; J4 stays skipped with both sent');
  const again = await runNudges({ admin, kv, send: async (m) => sent.push(m), recordEvent: async () => {} }, { now: NOW, log: () => {} });
  assert.equal(again.sent, 0, 'a second run the same day sends nothing');
});

test('the pending set writes and the mint sites', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('lib/docRequest.js'), /await kvSadd\(linkId\)/, 'sadd at mint');
  assert.match(read('pages/api/upload/finalize.js'), /kvSrem\(rec\.linkId\)/, 'srem on finalize');
  assert.match(read('pages/api/listings/status.js'), /kvSrem\(l\.id\)/, 'srem on rented or closed');
  assert.match(read('lib/nudges.js'), /kv\.srem\(linkId\)/, 'srem when the cron drops one');
  assert.match(read('pages/api/applications/mirror.js'), /mintRequest\(/, 'the invite mirror mints');
  assert.match(read('pages/api/applicants/request-documents.js'), /mintRequest\(/, 'the button mints through the same helper');
  assert.doesNotMatch(read('pages/api/listings/add-applicant.js'), /mintRequest|request-documents/, 'add by number does not mint');
  assert.doesNotMatch(read('lib/referrals.js'), /mintRequest/, 'referral acceptance does not mint');
  assert.match(read('vercel.json'), /"\/api\/cron\/nudges",\s*"schedule": "0 13 \* \* \*"/);
});

test('the uploader is shared by the upload page and the apply page', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('pages/upload/[token].js'), /components\/tenant\/DocumentUploader/);
  assert.match(read('pages/apply/[token].js'), /components\/tenant\/DocumentUploader/);
  assert.match(read('components/tenant/DocumentUploader.js'), /\/api\/upload\/analyze-file/);
  assert.match(read('components/tenant/DocumentUploader.js'), /\/api\/upload\/finalize/);
});
