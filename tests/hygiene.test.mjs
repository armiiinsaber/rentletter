// Six hygiene fixes: the realtor per file upload route and its finalize, the duplicate applicant
// marks, the age check's answer replacing the date of birth, the rent from the invite, and the
// rent edit warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const U = await import('../lib/realtorUpload.js');
const { markDuplicates, duplicateLine } = await import('../lib/duplicates.js');
const { kvAppToRow } = await import('../lib/applicationMap.js');
const { rentFromInvite } = await import('../lib/inviteRent.js');
const { needsRentConfirm, RENT_WARNING } = await import('../lib/listingEditWarning.js');
const { rowToForm } = await import('../lib/pipelinePrefill.js');
const { formFromApplication, buildApplicationFromForm, EMPTY_FORM } = await import('../lib/tenantProfile.js');

const b64 = (n) => Buffer.alloc(n, 1).toString('base64');
const fakeKv = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null), set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); }, m }; };
const db = () => ({
  listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', address: '210 Carlaw', status: 'active' }, { id: 'L2', profile_id: 'other', name: 'Theirs' }],
  listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1', doc_verifications: null }, { id: 'J2', listing_id: 'L2', application_id: 'A2', doc_verifications: null }],
  applications: [{ id: 'A1', full_name: 'Priya Nair', employer: 'Sunnybrook', annual_income: 92000, owner_token: 'SECRET' }, { id: 'A2', full_name: 'Not Mine' }],
  events: [],
});
const run = () => ({ documents: [{ documentType: 'pay stub', extracted: { applicantName: 'Priya Nair', employer: 'Sunnybrook', income: '$92,000' } }], comparisons: [{ field: 'Income', status: 'match', found: '$92,000' }, { field: 'Employer', status: 'match', found: 'Sunnybrook' }], documentNames: ['Priya Nair'], confidence: 'high' });

test('per file route: refusals, then one staged entry per file', async () => {
  const tables = db(); const admin = fakeSupabase(tables); const kv = fakeKv();
  const analyzed = []; const stored = [];
  const deps = { admin, userId: 'me', kv, analyze: async (a) => { analyzed.push(a.files.length); return run(); }, store: async (a) => stored.push(a) };
  const file = (over = {}) => ({ name: 'stub.png', type: 'image/png', data: b64(2000), ...over });
  const r = (body) => U.analyzeOneFile(deps, body);
  assert.equal((await r({})).status, 400, 'no applicant reference');
  assert.equal((await r({ listingId: 'L1', linkId: 'J1' })).status, 400, 'no file');
  assert.equal((await r({ listingId: 'L1', linkId: 'J1', file: file({ type: 'text/plain' }) })).status, 400, 'mime');
  assert.equal((await r({ listingId: 'L1', linkId: 'J1', file: file({ data: b64(4 * 1024 * 1024 + 10) }) })).status, 413, 'over the per file cap');
  assert.equal((await r({ listingId: 'L1', linkId: 'J1', total: 7, file: file() })).status, 400, 'too many');
  assert.equal((await r({ listingId: 'L2', linkId: 'J2', file: file() })).status, 403, 'another realtor\'s listing');
  assert.equal((await r({ listingId: 'L9', linkId: 'J1', file: file() })).status, 404, 'no listing');
  assert.equal((await r({ listingId: 'L1', linkId: 'J2', file: file() })).status, 404, 'a row on another listing');
  assert.equal((await r({ listingId: 'L1', linkId: 'J1', applicationId: 'A2', file: file() })).status, 409, 'binding mismatch');
  assert.equal(analyzed.length, 0, 'nothing analyzed before the checks pass');
  const one = await r({ listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 0, total: 2, file: file() });
  assert.equal(one.status, 200); assert.equal(one.body.staged, 1); assert.deepEqual(analyzed, [1]);
  assert.equal(stored[0].replace, true, 'the first file replaces the held set'); assert.equal(stored[0].uploadedBy, 'realtor');
  const two = await r({ listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 1, total: 2, file: file({ name: 'two.png', data: b64(3000) }) });
  assert.equal(two.body.staged, 2); assert.equal(stored[1].replace, false);
  const again = await r({ listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 1, total: 2, file: file({ name: 'two.png', data: b64(3000) }) });
  assert.equal(again.body.skipped, true, 'a retried file is not analyzed twice'); assert.equal(analyzed.length, 2);
  assert.equal(tables.listing_applicants[0].doc_verifications, null, 'nothing written before finalize');
});

test('finalize: ownership, the combined report on the row, the event, the cache, the staging cleared', async () => {
  const tables = db(); const admin = fakeSupabase(tables); const kv = fakeKv();
  const deps = { admin, userId: 'me', kv, analyze: async () => run(), store: null };
  await U.analyzeOneFile(deps, { listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 0, total: 2, file: { name: 'a.png', type: 'image/png', data: b64(1000) } });
  await U.analyzeOneFile(deps, { listingId: 'L1', linkId: 'J1', applicationId: 'A1', index: 1, total: 2, file: { name: 'b.png', type: 'image/png', data: b64(1200) } });
  const events = []; const invalidated = [];
  const fin = (body) => U.finalizeAnalysis({ admin, userId: 'me', kv, recordEvent: async (_a, e) => events.push(e), invalidate: (id) => invalidated.push(id), listHeld: async () => [] }, body);
  assert.equal((await fin({ listingId: 'L2', linkId: 'J2' })).status, 403);
  assert.equal((await fin({ listingId: 'L1', linkId: 'J1', applicationId: 'A2' })).status, 409);
  const r = await fin({ listingId: 'L1', linkId: 'J1', applicationId: 'A1' });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  assert.equal(r.body.result.documentCount, 2); assert.equal(r.body.result.source, 'realtor');
  assert.equal(tables.listing_applicants[0].doc_verifications.active.documentCount, 2, 'the row carries the combined report');
  assert.deepEqual(events.map((e) => e.type), ['verification_completed']); assert.equal(events[0].payload.documents, 2);
  assert.deepEqual(invalidated, ['me']);
  assert.equal(kv.m.size, 0, 'staging cleared');
  assert.equal((await fin({ listingId: 'L1', linkId: 'J1', applicationId: 'A1' })).status, 400, 'nothing staged now');
  assert.equal(existsSync(new URL('../pages/api/applicants/analyze-documents.js', import.meta.url)), false, 'the batched route is gone');
  const comp = readFileSync(new URL('../components/dashboard/ApplicantDocIntel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(comp, /analyze-documents/); assert.match(comp, /\/api\/applicants\/analyze-file/); assert.match(comp, /\/api\/applicants\/finalize-analysis/); assert.match(comp, /3MB each/);
});

test('duplicates: phone, email, name and employer; a non match; set aside rows never match', () => {
  const app = (linkId, a, over = {}) => ({ linkId, decisionStatus: 'none', withdrawnAt: null, application: a, ...over });
  const rows = markDuplicates([
    app('j1', { full_name: 'Sofia Russo', phone: '(647) 555-0648', email: 'sofia@x.com', employer: 'Klick' }),
    app('j2', { full_name: 'S. Russo', phone: '647-555-0648', email: 'work@x.com', employer: 'Other' }),
    app('j3', { full_name: 'Marc T', phone: '', email: 'SOFIA@X.COM ', employer: 'A' }),
    app('j4', { full_name: 'sofia  russo', phone: '', email: 'third@x.com', employer: 'KLICK' }),
    app('j5', { full_name: 'Wei Chen', phone: '(437) 555-0377', email: 'wei@x.com', employer: 'Klick' }),
    app('j6', { full_name: 'Wei Chen', phone: '(437) 555-0377', email: 'wei@x.com', employer: 'Klick' }, { decisionStatus: 'reject' }),
  ]);
  assert.equal(rows[0].duplicateOf, undefined);
  assert.deepEqual([rows[1].duplicateOf, rows[1].duplicateBy], ['j1', 'phone']);
  assert.deepEqual([rows[2].duplicateOf, rows[2].duplicateBy], ['j1', 'email']);
  assert.deepEqual([rows[3].duplicateOf, rows[3].duplicateBy], ['j1', 'name and employer']);
  assert.equal(rows[4].duplicateOf, undefined, 'a different person');
  assert.equal(rows[5].duplicateOf, undefined, 'set aside: not active');
  assert.equal(duplicateLine(rows[1]), 'Same phone as Sofia Russo');
  assert.equal(duplicateLine(rows[2]), 'Same email as Sofia Russo');
  assert.equal(duplicateLine(rows[3]), 'Same name and employer as Sofia Russo');
  const actions = readFileSync(new URL('../lib/actions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(actions, /duplicate/i, 'no action item for it');
  const bridge = readFileSync(new URL('../lib/supabaseBridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /markDuplicates\(byListing\[id\]\)/);
});

test('age: the answer is written, the date and the age are not, and every read follows', () => {
  const row = kvAppToRow({ applicationNumber: 'RL-1', tenant: { fullName: 'A', ageConfirmed: true, phone: '1' }, scorecard: { overall: 4.1 } });
  assert.equal('date_of_birth' in row, false); assert.equal('age' in row, false);
  assert.deepEqual(row.scorecard, { overall: 4.1, ageConfirmed: true });
  const row2 = kvAppToRow({ applicationNumber: 'RL-2', tenant: { fullName: 'B', age: '31', dateOfBirth: '1994-08-14' } });
  assert.equal('date_of_birth' in row2, false); assert.equal(row2.scorecard, null, 'no answer, no scorecard object invented');
  assert.equal(rowToForm({ full_name: 'A', date_of_birth: '1994-08-14', scorecard: { ageConfirmed: true } }).ageConfirmed, true);
  assert.equal(rowToForm({ full_name: 'A', date_of_birth: '1994-08-14' }).dateOfBirth, '', 'the date is never read back');
  const f = formFromApplication({ tenant: { fullName: 'A', dateOfBirth: '1994-08-14', ageConfirmed: true } });
  assert.equal(f.dateOfBirth, ''); assert.equal(f.age, ''); assert.equal(f.ageConfirmed, true);
  const rec = buildApplicationFromForm({ tenant: { ageConfirmed: true } }, { ...EMPTY_FORM, fullName: 'A', jobTitle: 'J', employer: 'E', annualIncome: '90000', email: 'a@b.co', dateOfBirth: '1994-08-14' });
  assert.deepEqual(Object.keys(rec.tenant).sort(), ['ageConfirmed', 'fullName', 'phone']);
  const gen = readFileSync(new URL('../pages/api/generate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(gen, /dateOfBirth/); assert.doesNotMatch(gen, /\bage: age/); assert.match(gen, /ageConfirmed: ageConfirmed === true/);
  const apply = readFileSync(new URL('../pages/apply/[token].js', import.meta.url), 'utf8');
  assert.match(apply, /dateOfBirth: undefined, age: undefined, ageConfirmed:/, 'the date never leaves the device');
});

test('rent at submit: from the invite record, null otherwise, no regex over the description', () => {
  assert.equal(rentFromInvite({ unit: { monthlyRent: '2600' } }), 2600);
  assert.equal(rentFromInvite({ unit: { monthlyRent: '$2,600' } }), 2600);
  assert.equal(rentFromInvite({ unit: { monthlyRent: '' } }), null);
  assert.equal(rentFromInvite(null), null);
  const gen = readFileSync(new URL('../pages/api/generate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(gen, /apartmentDescription\.match/); assert.match(gen, /rentFromInvite\(await kvGet\(`linvite:\$\{inviteToken\}`\)\)/);
  const tp = readFileSync(new URL('../lib/tenantProfile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(tp, /description\)\.match/);
});

test('rent edit warning: only when the rent changes and someone is on the listing', () => {
  assert.equal(needsRentConfirm({ monthly_rent: 2600 }, { monthly_rent: 2750 }, 3), true);
  assert.equal(needsRentConfirm({ monthly_rent: 2600 }, { monthly_rent: 2600 }, 3), false);
  assert.equal(needsRentConfirm({ monthly_rent: 2600 }, { monthly_rent: 2750 }, 0), false);
  assert.equal(needsRentConfirm({ monthly_rent: '2600' }, { monthly_rent: 2600 }, 3), false, 'string and number agree');
  assert.equal(RENT_WARNING, 'Changing rent re scores every applicant on this listing.');
  const modal = readFileSync(new URL('../components/listings/ListingSetupModal.js', import.meta.url), 'utf8');
  assert.match(modal, /needsRentConfirm\(initial, buildPayload\(\), activeApplicants\)/);
  const cmp = readFileSync(new URL('../components/dashboard/CompareTenants.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cmp, /occupants/i);
});
