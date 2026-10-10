// The document checks (lib/documentIntegrity.js, lib/documentFile.js, lib/documentIntegrityStore.js):
// false positives first (every clean document in tests/fixtures/integrityDocs.mjs raises nothing),
// one inconsistent document per check, the file history signal never alone, the same file only
// within one realtor, only four fields stored per finding, Fit identical with and without the
// findings, and none of the words a finding must never use on any surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const I = await import('../lib/documentIntegrity.js');
const { fileHistory, fileFacts, contentHash } = await import('../lib/documentFile.js');
const { sameFileFindings, applyMirrors } = await import('../lib/documentIntegrityStore.js');
const { buildCombinedRun, stagedItem } = await import('../lib/uploadCombine.js');
const { computeFit } = await import('../lib/fitScore.js');
const { storeAnalyzedDocuments, purgeStoredDocuments, expireDocuments } = await import('../lib/documentStore.js');
const { CLEAN, INCONSISTENT, itemsOf, UPLOADED_AT } = await import('./fixtures/integrityDocs.mjs');
const { PDFDocument } = await import('pdf-lib');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const run = (set) => I.integrityFindings(itemsOf(set), { applicantName: set.applicant, statedEmployer: set.statedEmployer, uploadedAt: UPLOADED_AT });

test('false positives first: every clean document raises no flag, and the old letter is a note', () => {
  const table = [];
  let docs = 0, falsePositives = 0;
  for (const set of CLEAN) {
    const found = run(set);
    set.docs.forEach((d, i) => {
      docs++;
      const mine = found.filter((f) => f.documentId === `${set.id}-doc-${i + 1}`);
      const flags = mine.filter((f) => !I.isNote(f));
      falsePositives += flags.length;
      const expected = d.note ? 'note, no flag' : 'no flag';
      const result = flags.length ? flags.map((f) => f.type).join(', ') : mine.length ? 'note, no flag' : 'no flag';
      table.push(`| ${set.id} ${d.label} | a to f | ${expected} | ${result} |`);
      assert.equal(result, expected, `${set.id} ${d.label}`);
    });
  }
  console.log(`  ${docs} clean documents, ${falsePositives} false positives`);
  console.log(['| document | check | expected | result |', '| --- | --- | --- | --- |', ...table].join('\n'));
  assert.ok(docs >= 30, `${docs} clean documents`);
  assert.equal(falsePositives, 0);
});

test('one inconsistent document per check raises exactly that finding, on that document', () => {
  const table = [];
  for (const set of INCONSISTENT) {
    const found = run(set).filter((f) => !I.isNote(f));
    const want = set.expect.type;
    const result = found.length ? found.map((f) => `${f.type} on ${f.documentId.replace(`${set.id}-doc-`, 'document ')}`).join(', ') : 'no flag';
    table.push(`| ${set.id} ${set.docs[set.expect.on].label} | ${set.check} | ${want ? `${want} on document ${set.expect.on + 1}` : 'no flag'} | ${result} |`);
    if (!want) { assert.deepEqual(found, [], set.id); continue; }
    assert.equal(found.length, 1, `${set.id}: ${result}`);
    assert.equal(found[0].type, want, set.id);
    assert.equal(found[0].documentId, `${set.id}-doc-${set.expect.on + 1}`, set.id);
    if (set.expect.fileLine) assert.ok(found[0].sentence.endsWith(I.FILE_HISTORY_LINE), set.id);
    else assert.ok(!found[0].sentence.includes(I.FILE_HISTORY_LINE), set.id);
  }
  console.log(['| document | check | expected | result |', '| --- | --- | --- | --- |', ...table].join('\n'));
  const checks = new Set(INCONSISTENT.map((s) => s.check[0]));
  for (const c of ['a', 'b', 'c', 'd', 'e', 'f']) assert.ok(checks.has(c), `check ${c} has an inconsistent document`);
});

test('a finding reads as one sentence of fact the realtor can check', () => {
  const [arith] = run(INCONSISTENT[0]);
  assert.equal(arith.sentence, 'The net pay on the September 18 stub does not equal gross less deductions ($312 apart).');
  const all = INCONSISTENT.flatMap(run);
  for (const f of all) {
    assert.match(f.sentence, /^The |^A |^This /, f.sentence);
    assert.doesNotMatch(f.sentence, /[\u2014\u2013]|\s-\s/, f.sentence);
    assert.doesNotMatch(f.sentence, /fraud|fake|forg|tamper|suspicious|likely|probably|seems|appears to/i, f.sentence);
    assert.deepEqual(Object.keys(f).sort(), ['at', 'documentId', 'sentence', 'type']);
  }
});

test('the readers never guess: an ambiguous date, an unreadable amount, a missing total raise nothing', () => {
  assert.equal(I.docDate('05/06/2026'), null); assert.equal(I.docDate('14/06/2026').toISOString().slice(0, 10), '2026-06-14');
  assert.equal(I.docDate('8 octobre 2026').toISOString().slice(0, 10), '2026-10-08'); assert.equal(I.docDate('Sept 26, 2026').toISOString().slice(0, 10), '2026-09-26');
  assert.equal(I.docDate('2026-02-30'), null); assert.equal(I.docDate('soon'), null);
  assert.equal(I.money('2 845,30 $'), 2845.30); assert.equal(I.money('$3,541.67'), 3541.67); assert.equal(I.money('1.234,56'), 1234.56); assert.equal(I.money('(12.00)'), -12); assert.equal(I.money('n/a'), null);
  const set = { id: 'G', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'no net printed', doc: { documentType: 'pay stub', extracted: { applicantName: 'Priya Sharma', employer: 'Sunnybrook', payDate: '05/06/2026', grossForPeriod: 3500, deductionsForPeriod: 900, netForPeriod: null, ytdGross: null } } }] };
  assert.deepEqual(run(set), [], 'an ambiguous pay date and no net printed: nothing');
  assert.equal(I.sameName('Priya Sharma', 'Priya'), null, 'a single name part is never a mismatch');
  assert.equal(I.sameEmployer('TD Bank', 'The Toronto-Dominion Bank'), true); assert.equal(I.sameEmployer('CIBC', 'Canadian Imperial Bank of Commerce'), true); assert.equal(I.sameEmployer('Maple Leaf Foods', 'Sunnybrook'), false);
});

async function pdf({ producer, creator, created, modified }) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([200, 200]);
  if (producer) doc.setProducer(producer);
  if (creator) doc.setCreator(creator);
  if (created) doc.setCreationDate(new Date(created));
  if (modified) doc.setModificationDate(new Date(modified));
  return Buffer.from(await doc.save({ updateFieldAppearances: false }));
}
test('file history: an editor save after creation is a weak signal, read from the PDF, and never a finding alone', async () => {
  const payroll = await pdf({ producer: 'ADP Payroll Services', creator: 'ADP', created: '2026-09-18T10:00:00Z', modified: '2026-09-18T10:00:00Z' });
  const reexport = await pdf({ producer: 'Adobe Acrobat Pro 2024', creator: 'Microsoft Word', created: '2026-09-18T10:00:00Z', modified: '2026-09-18T10:00:30Z' });
  const edited = await pdf({ producer: 'Adobe Acrobat Pro 2024', creator: 'ADP', created: '2026-09-18T10:00:00Z', modified: '2026-10-01T09:00:00Z' });
  const preview = await pdf({ producer: 'macOS Version 15.1 Quartz PDFContext', created: '2026-09-18T10:00:00Z', modified: '2026-09-30T09:00:00Z' });
  assert.equal((await fileHistory(payroll, 'application/pdf')).editedAfterCreation, false);
  assert.equal((await fileHistory(reexport, 'application/pdf')).editedAfterCreation, false, 'one export writes both dates together');
  assert.equal((await fileHistory(edited, 'application/pdf')).editedAfterCreation, true);
  assert.equal((await fileHistory(preview, 'application/pdf')).editedAfterCreation, true);
  assert.equal((await fileHistory(Buffer.from('%PDF-1.4 not really'), 'application/pdf')).editedAfterCreation, false, 'an unreadable PDF is no signal');
  assert.equal((await fileHistory(edited, 'image/png')).editedAfterCreation, false);
  const f = await fileFacts(edited, 'application/pdf');
  assert.equal(f.hash, contentHash(edited)); assert.match(f.hash, /^[0-9a-f]{64}$/); assert.deepEqual(Object.keys(f).sort(), ['editedAfterCreation', 'hash']);
  assert.deepEqual(run(INCONSISTENT.find((s) => s.id === 'X11')), [], 'alone it raises nothing');
});

test('the combined report keeps the findings as four fields and never the fields only the checks read', () => {
  for (const set of [...CLEAN, ...INCONSISTENT]) {
    const items = itemsOf(set);
    const r = buildCombinedRun(items, set.applicant, { statedEmployer: set.statedEmployer, statedAnnualIncome: 90000 }, { now: UPLOADED_AT });
    for (const f of r.integrity) assert.deepEqual(Object.keys(f).sort(), ['at', 'documentId', 'sentence', 'type']);
    for (const d of r.documents) for (const k of I.INTEGRITY_ONLY_FIELDS) assert.equal(k in (d.extracted || {}), false, `${set.id} keeps ${k}`);
    assert.equal(JSON.stringify(r).includes('fileEdited'), false);
  }
  const it = stagedItem({ documents: [{ documentType: 'pay stub' }], comparisons: [], documentNames: [], confidence: 'high' }, { index: 0, name: 'a.pdf', size: 10, documentId: 'D1', fileEdited: true });
  assert.equal(it.documentId, 'D1'); assert.equal(it.fileEdited, true);
});

test('flags never change Fit: the Fit output is byte identical with and without the findings', () => {
  const listing = { monthly_rent: 2600, pref_rent_to_income_max_pct: 40, pref_requires_employer_verification: true };
  const confirmations = [{}, { employer: { at: '2026-10-05T00:00:00Z', by: 'You' } }];
  let compared = 0;
  for (const set of [...CLEAN, ...INCONSISTENT]) {
    const report = buildCombinedRun(itemsOf(set), set.applicant, { statedEmployer: set.statedEmployer, statedAnnualIncome: 92000 }, { now: UPLOADED_AT });
    const withFlags = { ...report, integrity: [...report.integrity, { type: 'pay_arithmetic', documentId: 'x', sentence: 'The net pay on the September 18 stub does not equal gross less deductions ($312 apart).', at: UPLOADED_AT }] };
    const without = { ...report }; delete without.integrity;
    for (const c of confirmations) {
      const application = { full_name: set.applicant, annual_income: 92000, employer: set.statedEmployer, created_at: '2026-09-20T00:00:00Z', prev_landlord_name: 'A. Owner', years_at_previous: '2' };
      const a = computeFit({ application, listing, verification: withFlags, confirmations: c, now: Date.parse(UPLOADED_AT) });
      const b = computeFit({ application, listing, verification: without, confirmations: c, now: Date.parse(UPLOADED_AT) });
      assert.equal(JSON.stringify(a), JSON.stringify(b), set.id); compared++;
    }
  }
  assert.ok(compared >= 48);
  assert.doesNotMatch(src('lib/fitScore.js'), /integrity/i, 'Fit never reads the findings');
});

// ── g. the same file, per realtor ──
const tables = () => ({
  applicant_documents: [
    { id: 'D-new', listing_applicant_id: 'J2', profile_id: 'me', kind: 'pay stub', content_hash: 'h1', deleted_at: null },
    { id: 'D-old', listing_applicant_id: 'J1', profile_id: 'me', kind: 'pay stub', content_hash: 'h1', deleted_at: null },
    { id: 'D-gone', listing_applicant_id: 'J3', profile_id: 'me', kind: 'pay stub', content_hash: 'h2', deleted_at: '2026-10-01T00:00:00Z' },
    { id: 'D-mine2', listing_applicant_id: 'J2', profile_id: 'me', kind: 'pay stub', content_hash: 'h2', deleted_at: null },
    { id: 'D-theirs', listing_applicant_id: 'J9', profile_id: 'them', kind: 'pay stub', content_hash: 'h3', deleted_at: null },
    { id: 'D-mine3', listing_applicant_id: 'J2', profile_id: 'me', kind: 'employment letter', content_hash: 'h3', deleted_at: null },
    { id: 'D-same', listing_applicant_id: 'J4', profile_id: 'me', kind: 'pay stub', content_hash: 'h4', deleted_at: null },
    { id: 'D-mine4', listing_applicant_id: 'J2', profile_id: 'me', kind: 'pay stub', content_hash: 'h4', deleted_at: null },
  ],
  listing_applicants: [
    { id: 'J1', listing_id: 'L1', application_id: 'A1', doc_verifications: { active: { documents: [], integrity: [] }, archived: [] } },
    { id: 'J2', listing_id: 'L2', application_id: 'A2', doc_verifications: null },
    { id: 'J3', listing_id: 'L1', application_id: 'A3', doc_verifications: null },
    { id: 'J4', listing_id: 'L1', application_id: 'A4', doc_verifications: null },
    { id: 'J9', listing_id: 'L9', application_id: 'A9', doc_verifications: null },
  ],
  applications: [
    { id: 'A1', full_name: 'Daniel Moreau', email: 'daniel@example.com' },
    { id: 'A2', full_name: 'Priya Sharma', email: 'priya@example.com' },
    { id: 'A3', full_name: 'Someone Else', email: 'else@example.com' },
    { id: 'A4', full_name: 'Priya Sharma', email: 'priya.work@example.com' },
    { id: 'A9', full_name: 'Their Applicant', email: 'their@example.com' },
  ],
  listings: [
    { id: 'L1', profile_id: 'me', name: '210 Carlaw Ave', unit: '4' },
    { id: 'L2', profile_id: 'me', name: '88 Harbour St', unit: '2104' },
    { id: 'L9', profile_id: 'them', name: '1 Elsewhere Rd' },
  ],
});
test('the same file twice: another applicant on the same realtor\'s listings, never across realtors, never one person, never a deleted file', async () => {
  const t = tables(); const admin = fakeSupabase(t);
  const r = await sameFileFindings(admin, { profileId: 'me', linkId: 'J2', applicationId: 'A2', application: t.applications[1], documentIds: ['D-new', 'D-mine2', 'D-mine3', 'D-mine4'], at: UPLOADED_AT });
  assert.deepEqual(r.findings.map((f) => [f.type, f.documentId]), [['same_file', 'D-new']], 'only the live match from a different applicant of this realtor');
  assert.equal(r.findings[0].sentence, 'This pay stub is the same file another applicant submitted on 210 Carlaw Ave, Unit 4.');
  assert.deepEqual(r.mirrors.map((m) => [m.linkId, m.finding.documentId]), [['J1', 'D-old']]);
  assert.equal(r.mirrors[0].finding.sentence, 'This pay stub is the same file another applicant submitted on 88 Harbour St, Unit 2104.');
  await applyMirrors(admin, r.mirrors); await applyMirrors(admin, r.mirrors);
  assert.deepEqual(t.listing_applicants[0].doc_verifications.active.integrity.map((f) => f.documentId), ['D-old'], 'the earlier applicant gets it once');
  // Another realtor asking finds nothing of mine, and I find nothing of theirs.
  const theirs = await sameFileFindings(fakeSupabase(tables()), { profileId: 'them', linkId: 'J9', applicationId: 'A9', application: { full_name: 'Their Applicant' }, documentIds: ['D-theirs'], at: UPLOADED_AT });
  assert.deepEqual(theirs, { findings: [], mirrors: [] });
  // Before db/011 (no content_hash column) nothing is compared.
  const absent = { from: () => ({ select() { return this; }, in() { return this; }, eq() { return this; }, is() { return this; }, maybeSingle() { return this; }, then(res) { return Promise.resolve({ data: null, error: { code: '42703', message: 'column applicant_documents.content_hash does not exist' } }).then(res); } }) };
  assert.deepEqual(await sameFileFindings(absent, { profileId: 'me', linkId: 'J2', applicationId: 'A2', application: {}, documentIds: ['D-new'] }), { findings: [], mirrors: [] });
  const store = src('lib/documentIntegrityStore.js');
  assert.match(store, /\.eq\('profile_id', profileId\)/, 'every hash read is filtered by the realtor');
});

// A chainable mock of the store's client: records every write.
function mockAdmin(respond) {
  const calls = [];
  const from = (table) => { const q = { table, op: 'select', filters: [], payload: null }; const c = { select(s) { if (q.op === 'select') q.select = s; return c; }, update(p) { q.op = 'update'; q.payload = p; return c; }, insert(p) { q.op = 'insert'; q.payload = p; return c; }, eq(k, v) { q.filters.push(['eq', k, v]); return c; }, in(k, v) { q.filters.push(['in', k, v]); return c; }, is(k, v) { q.filters.push(['is', k, v]); return c; }, lt(k, v) { q.filters.push(['lt', k, v]); return c; }, limit() { return c; }, maybeSingle() { return c; }, then(res, rej) { calls.push(q); return Promise.resolve(respond(q, calls)).then(res, rej); } }; return c; };
  return { calls, admin: { from, storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), remove: async (p) => ({ data: p, error: null }) }) } } };
}
test('the hash is stored on the realtor\'s own row and goes with the file; before db/011 every write runs without it', async () => {
  const ok = mockAdmin(() => ({ data: [], error: null }));
  await storeAnalyzedDocuments(ok.admin, { profileId: 'me', listingId: 'L1', linkId: 'J1', applicationId: 'A1', uploadedBy: 'tenant', files: [{ mime: 'application/pdf', bytes: Buffer.from('x'), kind: 'pay stub', hash: 'a'.repeat(64) }] });
  const ins = ok.calls.find((q) => q.table === 'applicant_documents' && q.op === 'insert');
  assert.equal(ins.payload.content_hash, 'a'.repeat(64)); assert.equal(ins.payload.profile_id, 'me');
  // Absent column: the insert is retried without it, and the file is still held.
  let tries = 0;
  const old = mockAdmin((q) => (q.op === 'insert' && q.payload.content_hash && ++tries ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'content_hash' column" } } : { data: [], error: null }));
  const r = await storeAnalyzedDocuments(old.admin, { profileId: 'me', listingId: 'L1', linkId: 'J1', applicationId: 'A1', uploadedBy: 'tenant', files: [{ mime: 'application/pdf', bytes: Buffer.from('x'), kind: 'pay stub', hash: 'b'.repeat(64) }] });
  assert.equal(r.stored, 1); assert.equal(old.calls.filter((q) => q.op === 'insert').at(-1).payload.content_hash, undefined);
  // Every deletion clears it: the realtor's delete and the daily expiry.
  const del = mockAdmin((q) => (q.op === 'select' ? { data: [{ id: 'D1', storage_path: 'me/J1/x.pdf', listing_applicant_id: 'J1', profile_id: 'me' }], error: null } : { data: [], error: null }));
  await purgeStoredDocuments(del.admin, { linkId: 'J1', deletedBy: 'Sarah' });
  assert.equal(del.calls.find((q) => q.op === 'update').payload.content_hash, null);
  let expireCalls = 0;
  const exp = mockAdmin((q) => (q.op === 'select' && q.table === 'applicant_documents' ? (expireCalls++ ? { data: [], error: null } : { data: [{ id: 'D2', storage_path: 'me/J1/y.pdf', listing_applicant_id: 'J1', profile_id: 'me' }], error: null }) : { data: [], error: null }));
  await expireDocuments(exp.admin, { now: new Date(UPLOADED_AT) });
  assert.equal(exp.calls.find((q) => q.op === 'update' && q.table === 'applicant_documents').payload.content_hash, null);
  assert.match(src('db/011-document-content-hash.sql'), /ADD COLUMN IF NOT EXISTS content_hash text/);
});

test('the replacement request is the existing route, behind the session, the entitlement and the ownership check', () => {
  const ui = src('components/dashboard/IntegrityChecks.js');
  assert.match(ui, /adapter\.fetch\('\/api\/applicants\/request-documents'/);
  assert.match(ui, /sendEmail: true, renew: true/);
  const route = src('pages/api/applicants/request-documents.js');
  assert.match(route, /supabase\.auth\.getUser\(\)/); assert.match(route, /requireEntitlement\(req, res, supabase, user\)/); assert.match(route, /String\(ctx\.listing\.profile_id\) !== String\(user\.id\)/);
  assert.match(src('components/dashboard/ScreeningChecklist.js'), /title: 'Document checks', integrity: true/);
  assert.match(src('components/dashboard/ListingView.js'), /<IntegrityLine report=/);
});

// None of these words on any surface a realtor or tenant can see: comments are stripped first.
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(`../${dir}`, import.meta.url))) { const rel = `${dir}${f}`; if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) walk(`${rel}/`, out); else if (/\.(js|mjs|jsx|html|json|webmanifest|txt|svg)$/.test(f)) out.push(rel); } return out; };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
export const BANNED = /\b(fraud\w*|fake\w*|forg(?:ed|ery|eries|ing)|tamper\w*|suspicious\w*|suspicion)\b/i;
test('no user facing string says fraud, fake, forged, tampered or suspicious', () => {
  const files = ['components/', 'pages/', 'lib/', 'public/'].flatMap((d) => walk(d)).filter((p) => !/^public\/brand\/kit\//.test(p));
  const hits = [];
  for (const file of files) stripComments(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).split('\n').forEach((l, i) => { const m = l.match(BANNED); if (m) hits.push(`${file}:${i + 1} "${m[0]}"`); });
  assert.deepEqual(hits, []);
  for (const w of ['Fraud', 'fake data', 'forged', 'Tampered', 'suspicious']) assert.match(w, BANNED, w);
  assert.ok(files.length > 300);
});
