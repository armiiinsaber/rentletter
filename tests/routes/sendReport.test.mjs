// Sending the report and what follows: pages/api/listings/send-report.js, the landlord page
// pages/r/[token].js getServerSideProps, and pages/api/report/answer.js over the fake stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes, fakeCtx } from '../helpers/fakeStack.mjs';
import { tables, USER, DAY } from './fixture.mjs';

const sendReport = (await import('../../pages/api/listings/send-report.js')).default;
const page = await import('../../pages/r/[token].js');
const answer = (await import('../../pages/api/report/answer.js')).default;
const { setCachedSignals, getCachedSignals } = await import('../../lib/signalsCache.js');
const { attachLandlordAnswers } = await import('../../lib/reportSnapshotStore.js');
const { answerLine } = await import('../../lib/reportSnapshot.js');
const { landlordAnsweredItem } = await import('../../lib/actionsLandlord.js');
const { fetchListingApplicants } = await import('../../lib/supabaseBridge.js');
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };

async function pdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, useSystemFonts: false }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) { const c = await (await doc.getPage(p)).getTextContent(); text += c.items.map((i) => i.str).join(' ') + '\n'; }
  await doc.destroy();
  return text;
}

test('503 without RESEND_API_KEY; 400 without a landlord email', async () => {
  let s = installFakeStack({ tables: tables(), user: USER, env: { RESEND_API_KEY: null } });
  try { assert.equal((await call(sendReport, { listingId: 'L1' })).code, 503); } finally { s.restore(); }
  s = installFakeStack({ tables: tables(), user: USER });
  try { const r = await call(sendReport, { listingId: 'L2' }); assert.equal(r.code, 400); assert.match(r.body.error, /landlord's email/); assert.equal(s.resend.sent.length, 0); } finally { s.restore(); }
});

test('the send freezes the snapshot, mails the PDF with every active applicant, marks the rows, records the event, clears the cache; then the page opens and the landlord answers', async () => {
  const s = installFakeStack({ tables: tables(), user: USER });
  try {
    setCachedSignals(USER.id, { loaded: true });
    const t0 = Date.now();
    const r = await call(sendReport, { listingId: 'L1' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.sentTo, 'marco@example.com');
    const row = s.db.tables.report_snapshots[0];
    assert.ok(row, 'one snapshot row'); assert.equal(row.token.length, 32); assert.equal(r.body.snapshot.token, row.token); assert.equal(r.body.pageUrl, `https://rentletter.ca/r/${row.token}`);
    const expiresIn = (Date.parse(row.expires_at) - t0) / DAY;
    assert.ok(expiresIn > 89.9 && expiresIn < 90.1, `90 day expiry, got ${expiresIn}`);
    assert.deepEqual(row.payload.applicants.map((a) => a.name), ['Applicant A1A1', 'Applicant B2B2', 'Applicant D4D4'], 'active only, best fit first, the duplicate folded, the set aside one left out');
    // the email and its PDF
    assert.equal(s.resend.sent.length, 1);
    const mail = s.resend.sent[0];
    assert.equal(mail.to, 'marco@example.com'); assert.match(mail.subject, /^210 Carlaw Ave, Unit 4, Toronto: applicants from Sarah Chen$/);
    assert.ok(mail.html.includes(r.body.pageUrl));
    assert.ok(Buffer.isBuffer(mail.attachments[0].content)); assert.match(mail.attachments[0].filename, /^applicants-\d{4}-\d{2}-\d{2}\.pdf$/);
    const text = await pdfText(mail.attachments[0].content);
    for (const name of ['Applicant A1A1', 'Applicant B2B2', 'Applicant D4D4']) assert.ok(text.includes(name), `${name} in the PDF text layer`);
    assert.equal(text.includes('Applicant C3C3'), false, 'the set aside applicant is not on the PDF');
    assert.equal(text.includes('Applicant E5E5'), false, 'the duplicate is folded');
    const spaced = (w) => w.split('').join(' '); // the label is drawn letter by letter
    assert.ok(text.includes(spaced('VERIFIED')), 'A1 verified'); assert.ok(text.includes(spaced('STATED')), 'A2 stated');
    // the rows and the event
    const sentAt = Object.fromEntries(s.db.tables.listing_applicants.map((j) => [j.id, j.last_sent_at]));
    assert.ok(sentAt.J1 && sentAt.J2 && sentAt.J4, 'last_sent_at on every included row'); assert.equal(sentAt.J3, null, 'not on the set aside row'); assert.equal(sentAt.J6, null);
    const ev = s.db.tables.events.find((e) => e.type === 'report_sent');
    assert.equal(ev.profile_id, USER.id); assert.equal(ev.listing_id, 'L1'); assert.equal(ev.payload.snapshotId, row.id); assert.equal(ev.payload.landlordEmail, 'marco@example.com');
    assert.equal(getCachedSignals(USER.id), null, 'the signals cache is cleared');

    // the landlord opens the page
    const open1 = await page.getServerSideProps(fakeCtx({ params: { token: row.token } }));
    assert.equal(open1.props.state, 'ok'); assert.deepEqual(open1.props.payload.applicants.map((a) => a.name), ['Applicant A1A1', 'Applicant B2B2', 'Applicant D4D4']);
    assert.equal('linkId' in open1.props.payload.applicants[0], false, 'the page copy never carries the realtor side link id');
    assert.equal(s.db.tables.report_snapshots[0].opened_count, 1);
    assert.equal(s.db.tables.events.filter((e) => e.type === 'report_opened').length, 1);
    const open2 = await page.getServerSideProps(fakeCtx({ params: { token: row.token } }));
    assert.equal(open2.props.state, 'ok'); assert.equal(s.db.tables.report_snapshots[0].opened_count, 2);
    assert.equal(s.db.tables.events.filter((e) => e.type === 'report_opened').length, 1, 'a second open within the hour records no second event');
    assert.deepEqual(await page.getServerSideProps(fakeCtx({ params: { token: 'x'.repeat(32) } })), { notFound: true });

    // the landlord answers meet on rank 1
    setCachedSignals(USER.id, { loaded: true });
    const a = await call(answer, { token: row.token, rank: 1, answer: 'meet' });
    assert.equal(a.code, 200, JSON.stringify(a.body));
    const updated = s.db.tables.report_snapshots[0];
    assert.equal(updated.answers['1'].answer, 'meet'); assert.ok(updated.answers['1'].at);
    const ans = s.db.tables.events.filter((e) => e.type === 'landlord_answered');
    assert.equal(ans.length, 1); assert.equal(ans[0].payload.rank, 1); assert.equal(ans[0].payload.applicantName, 'Applicant A1A1');
    assert.equal(getCachedSignals(USER.id), null);
    // the realtor's side reads the answer
    const applicants = await fetchListingApplicants(s.db, 'L1');
    await attachLandlordAnswers(s.db, ['L1'], applicants);
    const j1 = applicants.find((x) => x.linkId === 'J1');
    assert.deepEqual([j1.landlordAnswer.answer, j1.landlordAnswer.rank], ['meet', 1]); assert.equal(answerLine('meet'), 'wants to meet');
    const item = landlordAnsweredItem(s.db.tables.listings.find((l) => l.id === 'L1'), applicants);
    assert.equal(item.title, 'Landlord answered'); assert.match(item.detail, /1 wants to meet/);
    assert.equal((await call(answer, { token: row.token, rank: 9, answer: 'meet' })).code, 400, 'no applicant at that rank');
  } finally { s.restore(); }
});
