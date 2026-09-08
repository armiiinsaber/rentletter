// The one definition of a complete document set, and the copy that describes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOCUMENT_SET, setStatus, SET_SENTENCE, SET_SENTENCE_LOWER, SET_SENTENCE_REALTOR } from '../lib/documentSet.js';
import { nudgeEmail } from '../lib/nudges.js';

const stubs = (n) => Array.from({ length: n }, (_, i) => ({ documentType: i % 2 ? 'Earnings statement' : 'pay stub' }));
const LETTER = { documentType: 'employment letter' }, CREDIT = { documentType: 'credit report' };
const by = (r) => Object.fromEntries(r.items.map((it) => [it.key, it]));

test('the set as coded', () => {
  assert.deepEqual(DOCUMENT_SET.map((d) => [d.key, d.label, d.min, d.max, [...d.types], !!d.optional]), [
    ['paystubs', '1 to 3 recent pay stubs', 1, 3, ['pay stub'], false],
    ['letter', 'An employment letter', 1, 1, ['employment letter'], false],
    ['credit', 'A credit report, if you have one', 0, 1, ['credit report'], true],
  ]);
});

test('setStatus: zero, one, three and four stubs, with and without the letter and the credit report', () => {
  const none = setStatus([]);
  assert.deepEqual(by(none).paystubs.count, 0); assert.equal(by(none).paystubs.met, false); assert.equal(by(none).letter.met, false); assert.equal(by(none).credit.met, false); assert.equal(none.complete, false);
  const one = setStatus(stubs(1));
  assert.equal(by(one).paystubs.count, 1); assert.equal(by(one).paystubs.met, true); assert.equal(one.complete, false, 'no letter yet');
  const oneLetter = setStatus([...stubs(1), LETTER]);
  assert.equal(by(oneLetter).letter.met, true); assert.equal(oneLetter.complete, true, 'the credit report is optional');
  const three = setStatus([...stubs(3), LETTER]);
  assert.equal(by(three).paystubs.count, 3); assert.equal(three.complete, true);
  const four = setStatus([...stubs(4), LETTER, CREDIT]);
  assert.equal(by(four).paystubs.count, 4); assert.equal(by(four).paystubs.met, true); assert.equal(by(four).credit.count, 1); assert.equal(by(four).credit.met, true); assert.equal(four.complete, true);
  const letterOnly = setStatus([LETTER]);
  assert.equal(by(letterOnly).paystubs.met, false); assert.equal(letterOnly.complete, false);
  const creditOnly = setStatus([CREDIT, { documentType: 'Other / Unrecognized', unrecognized: true }]);
  assert.equal(by(creditOnly).credit.met, true); assert.equal(creditOnly.complete, false);
  assert.equal(setStatus(['pay stub', 'employment letter']).complete, true, 'bare type strings read too');
});

test('the copy carries no dash, and the four emails and the realtor helper say the same sentence', () => {
  const uploader = readFileSync(new URL('../components/tenant/DocumentUploader.js', import.meta.url), 'utf8');
  const strings = [SET_SENTENCE, SET_SENTENCE_LOWER, SET_SENTENCE_REALTOR, ...DOCUMENT_SET.map((d) => d.label), uploader];
  for (const s of strings) assert.doesNotMatch(s, /[—–]/);
  assert.doesNotMatch(uploader, /\s-\s/, 'no hyphen used as punctuation in the card');
  assert.equal(SET_SENTENCE, 'One to three recent pay stubs, an employment letter, and a credit report if you have one.');
  assert.equal(SET_SENTENCE_REALTOR, 'Ask for one to three recent pay stubs, an employment letter, and a credit report if they have one.');
  for (const n of [1, 2]) assert.match(nudgeEmail({ nudge: n, listingName: 'Carlaw', realtorName: 'S', applicantName: 'P', uploadUrl: 'https://rentletter.ca/upload/t' }).paras[0], /waiting on your documents: one to three recent pay stubs, an employment letter, and a credit report if you have one\.$/);
  for (const f of ['pages/api/applicants/request-documents.js', 'pages/api/send.js', 'components/dashboard/ApplicantDocIntel.js', 'lib/nudges.js']) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /SET_SENTENCE_(LOWER|REALTOR)/, f);
  assert.match(uploader, /PDF or image, up to \{MAX_FILES\} files, 3MB each/);
  assert.match(uploader, /not used in scoring/);
});
