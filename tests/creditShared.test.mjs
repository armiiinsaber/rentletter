// Credit shared by applicant (lib/creditShared.js, docs/credit-shared.md): exactly CREDIT_FIELDS
// reach the row and nothing else from the report; a report whose name, date or kind cannot be
// kept is refused, never stored, and recorded; the row's words carry no judgement; Fit is byte
// identical with and without a report; the reserved label is never a Fit label and no credit fact
// can read verified; the owning realtor alone opens the held file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes, defaultExtraction } from './helpers/fakeStack.mjs';
import { tables, USER, OTHER } from './routes/fixture.mjs';

const CS = await import('../lib/creditShared.js');
const { SOURCE_LABELS } = await import('../lib/stateLabels.js');
const { computeFit, readVerification } = await import('../lib/fitScore.js');
const { runDocumentAnalysis } = await import('../lib/applicantAnalysis.js');
const { landlordVerification, verificationText } = await import('../lib/listingReportData.js');
const { buildSnapshot } = await import('../lib/reportSnapshot.js');
const { reportText } = await import('../lib/reportText.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { synthesisLine } = await import('../lib/applicantSynthesis.js');
const { mintRequest } = await import('../lib/docRequest.js');
const tenantAnalyze = (await import('../pages/api/upload/analyze-file.js')).default;
const tenantFinalize = (await import('../pages/api/upload/finalize.js')).default;
const realtorAnalyze = (await import('../pages/api/applicants/analyze-file.js')).default;
const openDocument = (await import('../pages/api/documents/open.js')).default;

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const pdf = (name) => ({ name, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 synthetic test file ${name} `.repeat(4)).toString('base64') });
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// Everything a report can print that the product must never keep (the fake's "extra" variant).
const FORBIDDEN = ['4520 1234', 'Visa', '1 Old Rd', 'Old Harbour', 'inquiries', 'scoreBand', 'Good', '12 Sample St'];
const credit = (over = {}) => ({ filename: 'credit.pdf', documentType: 'credit report', unrecognized: false, extracted: { applicantName: 'Test Person', provider: 'Equifax', reportDate: daysAgo(10), creditScore: 712, scoreScale: '300 to 900', openAccounts: 4, collections: 0, bankruptcyOrProposal: false, latePayments: ['2025-03'], addressMatches: true, ...over } });
const letter = { filename: 'letter.pdf', documentType: 'employment letter', unrecognized: false, extracted: { applicantName: 'Test Person', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', startDate: 'March 1, 2023', annualSalaryPrinted: 85000 } };
const stub = { filename: 'stub.pdf', documentType: 'pay stub', unrecognized: false, extracted: { applicantName: 'Test Person', employer: 'Northwind Sample Clinic Inc.', periodStart: '2026-07-01', periodEnd: '2026-07-15', grossForPeriod: 3541.67 } };
const report = (documents) => ({ analyzedAt: '2026-09-01T00:00:00Z', nameMatch: 'match', documents, comparisons: [{ field: 'Income', stated: '$85,000', found: '$85,000', annual: 85000, status: 'match' }, { field: 'Employer', stated: 'Northwind Sample Clinic Inc.', found: 'Northwind Sample Clinic Inc.', status: 'match' }] });

test('the fields: exactly CREDIT_FIELDS are persisted, and the shaping drops everything else the model returns', async () => {
  assert.deepEqual([...CS.CREDIT_FIELDS], ['applicantName', 'provider', 'reportDate', 'creditScore', 'scoreScale', 'openAccounts', 'collections', 'bankruptcyOrProposal', 'latePayments', 'addressMatches']);
  const raw = defaultExtraction('credit extra (Test Person).pdf');
  assert.ok(raw.extracted.accountNumbers && raw.extracted.employerHistory, 'the fake returns what a report prints');
  const shaped = CS.shapeCreditDocument(raw, { statedAddress: '12 Sample St, Unit 4, Toronto' });
  assert.deepEqual(Object.keys(shaped.extracted), [...CS.CREDIT_FIELDS]);
  assert.deepEqual(Object.keys(shaped).sort(), ['documentType', 'extracted', 'filename', 'notes', 'unrecognized']);
  assert.equal(shaped.notes, ''); assert.equal(shaped.extracted.addressMatches, true, 'the address is compared in code'); assert.equal(shaped.extracted.scoreScale, '300 to 900'); assert.deepEqual(shaped.extracted.latePayments, ['2025-03']);
  for (const word of FORBIDDEN) assert.equal(JSON.stringify(shaped).includes(word), false, `${word} was kept`);
  // Through the engine itself, with the fake model answering the extra fields.
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    const run = await runDocumentAnalysis({ files: [pdf('credit extra (Test Person).pdf')], application: { full_name: 'Test Person', prev_address: '99 Elsewhere Rd' }, listing: null });
    assert.deepEqual(Object.keys(run.documents[0].extracted), [...CS.CREDIT_FIELDS]);
    assert.equal(run.documents[0].extracted.addressMatches, false, 'a different address reads false, the address itself is gone');
    for (const word of FORBIDDEN) assert.equal(JSON.stringify(run).includes(word), false, `${word} left the engine`);
    assert.doesNotMatch(run.overallSummary, /score|712|Equifax/i, 'the summary says nothing about the report');
  } finally { s.restore(); }
});

test('the refusals: wrong name, no name, no date, older than 90 days, and not a credit report when one was expected', () => {
  const now = new Date();
  assert.equal(CS.creditRejection(credit(), 'Test Person', { now }), null);
  assert.equal(CS.creditRejection(credit({ applicantName: 'T. Person' }), 'Test Person', { now }), null, 'an initial is not a different person');
  assert.equal(CS.creditRejection(credit({ applicantName: 'Someone Else' }), 'Test Person', { now }).code, 'name');
  assert.equal(CS.creditRejection(credit({ applicantName: null }), 'Test Person', { now }).code, 'no_name');
  assert.equal(CS.creditRejection(credit({ reportDate: null }), 'Test Person', { now }).code, 'no_date');
  assert.equal(CS.creditRejection(credit({ reportDate: daysAgo(91) }), 'Test Person', { now }).code, 'stale');
  assert.equal(CS.creditRejection(credit({ reportDate: daysAgo(89) }), 'Test Person', { now }), null);
  assert.equal(CS.creditRejection(stub, 'Test Person', { now, expected: true }).code, 'not_credit');
  assert.equal(CS.creditRejection(stub, 'Test Person', { now, expected: false }), null, 'a pay stub added as a pay stub is nobody\'s business here');
  for (const m of Object.values(CS.CREDIT_REJECTIONS)) { assert.doesNotMatch(m, /[\u2014\u2013]| - /); assert.ok(m.length < 140); }
});

test('the tenant route: a refused report is never stored or staged and document_rejected is recorded; a kept one is held like any other document', async () => {
  const s = installFakeStack({ tables: tables(), user: null });
  try {
    const minted = await mintRequest({ listingId: 'L1', linkId: 'J4', applicationId: 'A4', tenantName: 'Applicant D4D4', listingName: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', realtorName: 'Sarah Chen', brokerage: 'Demo Realty', askCreditReport: true });
    const wrongName = await call(tenantAnalyze, { token: minted.token, index: 0, total: 1, expect: 'credit report', file: pdf('credit (Someone Else).pdf') });
    assert.equal(wrongName.code, 422); assert.equal(wrongName.body.rejected, 'name'); assert.equal(wrongName.body.error, CS.CREDIT_REJECTIONS.name);
    const stale = await call(tenantAnalyze, { token: minted.token, index: 1, total: 1, expect: 'credit report', file: pdf('credit stale (Applicant D4D4).pdf') });
    assert.equal(stale.code, 422); assert.equal(stale.body.rejected, 'stale');
    const notCredit = await call(tenantAnalyze, { token: minted.token, index: 2, total: 1, expect: 'credit report', file: pdf('stub (Applicant D4D4).pdf') });
    assert.equal(notCredit.code, 422); assert.equal(notCredit.body.rejected, 'not_credit');
    assert.equal(s.db.storageCalls.filter((c) => c[0] === 'upload').length, 0, 'nothing reached the bucket');
    assert.equal(s.db.tables.applicant_documents.length, 0, 'no row');
    assert.equal(s.kv.values[`docreq:${minted.token}:staging`], undefined, 'nothing staged');
    const rejected = s.db.tables.events.filter((e) => e.type === 'document_rejected');
    assert.deepEqual(rejected.map((e) => [e.profile_id, e.listing_id, e.application_id, e.payload.reason, e.payload.kind]), [[USER.id, 'L1', 'A4', 'name', 'credit report'], [USER.id, 'L1', 'A4', 'stale', 'credit report'], [USER.id, 'L1', 'A4', 'not_credit', 'credit report']]);
    // The applicant's own, recent report is kept.
    const kept = await call(tenantAnalyze, { token: minted.token, index: 3, total: 1, expect: 'credit report', file: pdf('credit (Applicant D4D4).pdf') });
    assert.equal(kept.code, 200, JSON.stringify(kept.body)); assert.equal(kept.body.documentType, 'credit report');
    const rows = s.db.tables.applicant_documents.filter((d) => d.listing_applicant_id === 'J4');
    assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'credit report'); assert.equal(rows[0].uploaded_by, 'tenant'); assert.equal(rows[0].profile_id, USER.id);
    assert.ok(rows[0].expires_at && new Date(rows[0].expires_at) - new Date(rows[0].uploaded_at) === 14 * 86400000, 'the same 14 day hold');
    const fin = await call(tenantFinalize, { token: minted.token });
    assert.equal(fin.code, 200, JSON.stringify(fin.body));
    const j4 = s.db.tables.listing_applicants.find((j) => j.id === 'J4');
    const doc = j4.doc_verifications.active.documents[0];
    assert.equal(doc.documentType, 'credit report'); assert.deepEqual(Object.keys(doc.extracted), [...CS.CREDIT_FIELDS], 'the persisted row carries exactly the fields');
    for (const word of FORBIDDEN) assert.equal(JSON.stringify(j4.doc_verifications).includes(word), false, `${word} was persisted`);
    assert.equal(CS.creditLines(j4.doc_verifications).shared, true);
  } finally { s.restore(); }
});

test('the realtor route refuses the same way, with the event under the realtor', async () => {
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    const r = await call(realtorAnalyze, { listingId: 'L1', linkId: 'J2', applicationId: 'A2', index: 0, total: 1, file: pdf('credit stale (Applicant B2B2).pdf') });
    assert.equal(r.code, 422); assert.equal(r.body.rejected, 'stale');
    assert.equal(s.db.tables.applicant_documents.length, 0); assert.equal(s.db.storageCalls.filter((c) => c[0] === 'upload').length, 0);
    assert.deepEqual(s.db.tables.events.filter((e) => e.type === 'document_rejected').map((e) => [e.profile_id, e.payload.reason, e.payload.by]), [[USER.id, 'stale', 'realtor']]);
  } finally { s.restore(); }
});

test('the row: the reserved label, plain facts, no judgement word, no colour, "No credit report shared" otherwise', () => {
  const r = report([letter, credit()]);
  const c = CS.creditLines(r);
  assert.equal(c.shared, true); assert.equal(c.label, SOURCE_LABELS.creditShared); assert.equal(c.label, 'credit shared by applicant');
  assert.deepEqual(c.lines, [`Equifax, ${new Date(daysAgo(10) + 'T00:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`, 'Score 712 on a 300 to 900 scale', 'Open accounts: 4', 'Collections: none', 'Bankruptcy or consumer proposal: none', 'Late payments in the last 24 months: Mar 2025', 'Address matches the application']);
  const none = CS.creditLines(report([letter]));
  assert.deepEqual(none, { shared: false, label: 'No credit report shared', lines: [] });
  assert.deepEqual(CS.creditLines(null), none);
  const all = [c.label, ...c.lines, none.label, CS.creditSentence(r), CS.CREDIT_OPTIONAL_LINE, CS.CREDIT_CONSENT_LINE, CS.CREDIT_ASK_LABEL].join('\n');
  assert.doesNotMatch(all, /verified|good|poor|excellent|fair|bad|risk|strong|weak|warning/i, 'no judgement word');
  assert.doesNotMatch(all, /[\u2014\u2013]| - /, 'no dash');
  // A report stored before this module (score, band and bureau) still reads through the same keys, band dropped.
  const old = CS.creditLines({ documents: [{ documentType: 'credit report', extracted: { applicantName: 'P', creditScore: 748, scoreBand: 'Very Good', bureau: 'Equifax', reportDate: 'Aug 1, 2026' } }] });
  assert.deepEqual(old.lines, ['Equifax, Aug 1, 2026', 'Score 748', 'Late payments in the last 24 months: none']);
  // Collections and late payments, when there are some.
  const some = CS.creditLines(report([credit({ collections: 2, bankruptcyOrProposal: true, latePayments: ['2025-07', '2024-11'], addressMatches: false })]));
  assert.deepEqual(some.lines.slice(3), ['Collections: 2 accounts', 'Bankruptcy or consumer proposal: yes', 'Late payments in the last 24 months: Nov 2024, Jul 2025', 'Address differs from the application']);
});

test('Fit is byte identical with and without a credit report, and a credit report alone is no report at all', () => {
  const application = { full_name: 'Test Person', annual_income: 85000, employer: 'Northwind Sample Clinic Inc.', years_at_job: '3', prev_landlord_name: 'A. Patel', years_at_previous: '4', references: [{ name: 'R' }] };
  const listing = { monthly_rent: 2600, pref_requires_employer_verification: true };
  const without = computeFit({ application, listing, verification: report([letter, stub]), confirmations: {} });
  const withCredit = computeFit({ application, listing, verification: report([letter, stub, credit()]), confirmations: {} });
  assert.equal(JSON.stringify(withCredit), JSON.stringify(without));
  const bare = computeFit({ application, listing, verification: null, confirmations: {} });
  const creditAlone = computeFit({ application, listing, verification: { ...report([credit()]), comparisons: [] }, confirmations: {} });
  assert.equal(JSON.stringify(creditAlone), JSON.stringify(bare), 'a credit report alone changes nothing');
  assert.equal(readVerification({ ...report([credit()]), comparisons: [] }).state, 'none');
  assert.equal(synthesisLine({ application, docVerifications: [{ ...report([credit()]), comparisons: [] }] }), synthesisLine({ application, docVerifications: [] }));
  // The reserved label is never a Fit label, and verified is said only when the realtor confirmed.
  for (const f of [without, withCredit, bare, creditAlone]) { assert.ok(['stated', 'docs match', 'check docs', 'verified'].includes(f.label)); assert.notEqual(f.label, SOURCE_LABELS.creditShared); }
  assert.equal(withCredit.label, 'docs match');
  assert.match(src('lib/stateLabels.js'), /creditShared: 'credit shared by applicant'/);
  assert.match(src('lib/applicantState.js'), /SOURCE_LABELS/); assert.match(src('lib/fitScore.js'), /SOURCE_LABELS/);
});

test('the landlord surfaces carry the row in the same words, and a credit report alone is not verification', () => {
  const docV = { active: report([letter, credit()]), archived: [] };
  const v = landlordVerification(docV);
  assert.equal(v.verified, true); assert.equal(v.credit.label, 'credit shared by applicant');
  assert.match(verificationText(v), /credit shared by applicant, Equifax/); assert.doesNotMatch(verificationText(v), /credit score/i);
  const alone = landlordVerification({ active: { ...report([credit()]), comparisons: [] }, archived: [] });
  assert.equal(alone.verified, false); assert.equal(alone.reason, 'no_documents'); assert.equal(alone.credit.shared, true, 'the row still shows');
  const listing = { id: 'L1', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, pref_rent_to_income_max_pct: 40, landlord_name: 'Marco' };
  const profile = { id: 'P1', full_name: 'Sarah Chen' };
  const fit = { score: 4.1, scoreExact: 4.1, label: 'docs match', ratio: 37, incomeUsed: 85000, parts: {}, evidence: {}, criteria: [] };
  const applicants = [
    { linkId: 'J1', decisionStatus: 'none', confirmations: {}, docVerifications: [report([letter, credit()])], application: { id: 'A1', full_name: 'Test Person', annual_income: 85000, references: [], fit } },
    { linkId: 'J2', decisionStatus: 'none', confirmations: {}, docVerifications: [], application: { id: 'A2', full_name: 'Other Person', annual_income: 80000, references: [], fit: { ...fit, score: 3.9, scoreExact: 3.9 } } },
  ];
  const p = buildSnapshot({ listing, applicants, profile, now: new Date('2026-09-06T12:00:00Z') });
  assert.equal(p.applicants[0].credit.label, 'credit shared by applicant'); assert.equal(p.applicants[0].credit.lines[1], 'Score 712 on a 300 to 900 scale');
  assert.deepEqual(p.applicants[1].credit, { shared: false, label: 'No credit report shared', lines: [] });
  const text = reportText(p, { pageUrl: 'https://rentletter.ca/r/x' });
  assert.match(text, /   Credit: credit shared by applicant, Equifax, .*Score 712 on a 300 to 900 scale/); assert.match(text, /   Credit: No credit report shared/);
  const lines = reportLines(p);
  assert.match(lines.blocks[0].credit, /^Credit: credit shared by applicant, Equifax/); assert.equal(lines.blocks[1].credit, 'Credit: No credit report shared');
  assert.doesNotMatch(JSON.stringify(p) + text, /[\u2014\u2013]/);
  // The page prints the row (source).
  assert.match(src('pages/r/[token].js'), /data-credit-row/); assert.match(src('components/dashboard/ScreeningChecklist.js'), /creditLines\(report\)/); assert.match(src('components/dashboard/ListingView.js'), /\['Credit', /);
});

test('the held file: the owning realtor opens it and nobody else, through session, entitlement and ownership', async () => {
  const theirs = { id: 'D9', listing_applicant_id: 'J9', profile_id: OTHER.id, storage_path: `${OTHER.id}/J9/d9.pdf`, kind: 'credit report', mime: 'application/pdf', bytes: 1200, uploaded_by: 'tenant', uploaded_at: new Date().toISOString(), expires_at: new Date(Date.now() + 13 * 86400000).toISOString(), deleted_at: null, opened_count: 0 };
  const mine = { ...theirs, id: 'D4', listing_applicant_id: 'J4', profile_id: USER.id, storage_path: `${USER.id}/J4/d4.pdf` };
  const t = tables(); t.applicant_documents = [theirs, mine];
  const s = installFakeStack({ tables: t, user: USER });
  try {
    await s.db.storage.from('applicant-documents').upload(theirs.storage_path, Buffer.from('x'), { contentType: 'application/pdf' });
    await s.db.storage.from('applicant-documents').upload(mine.storage_path, Buffer.from('x'), { contentType: 'application/pdf' });
    const foreign = await call(openDocument, { documentId: 'D9' });
    assert.equal(foreign.code, 403); assert.equal(foreign.body.url, undefined);
    const own = await call(openDocument, { documentId: 'D4' });
    assert.equal(own.code, 200); assert.match(own.body.url, /signed/); assert.equal(own.body.kind, 'credit report');
    assert.deepEqual(s.db.tables.events.filter((e) => e.type === 'document_opened').map((e) => [e.profile_id, e.payload.kind]), [[USER.id, 'credit report']], 'the open is logged like any other');
    assert.equal(s.db.storageCalls.filter((c) => c[0] === 'sign' && c[2] === theirs.storage_path).length, 0, 'no signed URL was ever made for the other realtor\'s file');
  } finally { s.restore(); }
  // Signed out: 401 before anything is read.
  const out = installFakeStack({ tables: t, user: null });
  try { const r = await call(openDocument, { documentId: 'D4' }); assert.equal(r.code, 401); } finally { out.restore(); }
  assert.match(src('pages/api/documents/open.js'), /requireEntitlement\(req, res, supabase, user\)/); assert.match(src('pages/api/documents/open.js'), /ownedApplicant\(admin, doc\.listing_applicant_id, user\.id\)/);
});

test('the copy and the switch: optional everywhere, the consent sentence names what is read and the hold, nothing requires the report', () => {
  const uploader = src('components/tenant/DocumentUploader.js');
  assert.match(uploader, /CREDIT_CONSENT_LINE/); assert.match(uploader, /expect: expect \|\| undefined/);
  assert.match(CS.CREDIT_CONSENT_LINE, /provider, the date, the name, the score and its scale, open accounts, collections, a bankruptcy or consumer proposal, and late payments in the last 24 months/);
  assert.match(CS.CREDIT_CONSENT_LINE, /held for 14 days/);
  assert.match(src('lib/documentSet.js'), /optional: true/);
  assert.doesNotMatch(src('lib/nudges.js'), /credit report is required|credit report\./i);
  assert.doesNotMatch(src('lib/fitScore.js'), /pref_ask_credit_report/, 'the switch is not a criterion');
  assert.doesNotMatch(src('lib/reportSnapshot.js'), /pref_ask_credit_report/, 'and not on the criteria line');
  assert.match(src('components/listings/ListingSetupModal.js'), /pref_ask_credit_report: false/);
  assert.match(src('lib/realtorWrites.js'), /'pref_ask_credit_report'/);
  assert.match(src('db/credit-shared.sql'), /ADD COLUMN IF NOT EXISTS pref_ask_credit_report boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(src('db/credit-shared.sql'), /[\u2014\u2013]/);
  assert.doesNotMatch(src('lib/creditShared.js') + src('docs/credit-shared.md'), /[\u2014\u2013]/);
});
