// The document panel's one line and its fold rows (lib/documentsLine.js), from stored reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentsLine, comparisonRows, whatMatched } from '../lib/documentsLine.js';

const letterReport = { analyzedAt: '2026-09-08T00:00:00Z', nameMatch: 'match', documents: [{ documentType: 'employment letter' }, { documentType: 'pay stub' }, { documentType: 'credit report' }, { documentType: 'government ID' }], comparisons: [
  { field: 'Employer', stated: 'Sunnybrook Health Sciences Centre', found: 'Sunnybrook Health Sciences Centre', status: 'match', source: 'employment letter', alsoSeen: ['credit report lists Lakeshore Family Practice (historical)'], since: 'since Sep 2022' },
  { field: 'Job title', stated: 'Registered Nurse', found: 'Registered Nurse', status: 'match', informational: true },
  { field: 'Income', stated: '$92,000', found: '$92,000 a year on the letter, pay stubs annualize to $92,000 (letter and pay stubs agree)', annual: 92000, basis: 'letter and pay stubs agree', explanation: '$92,000 a year on the letter, pay stubs annualize to $92,000 (letter and pay stubs agree)', status: 'match' },
] };

test('the line: none yet, n read with what matched, and Send again only while a request waits', () => {
  assert.deepEqual(documentsLine(null, null), { line: 'Documents · none yet', canSendAgain: false });
  assert.deepEqual(documentsLine(null, { status: 'requested', requestedAt: 'x', receivedAt: null }), { line: 'Documents · none yet', canSendAgain: true });
  assert.deepEqual(documentsLine(null, { status: 'received', receivedAt: 'x' }), { line: 'Documents · none yet', canSendAgain: false });
  assert.deepEqual(documentsLine([letterReport], { status: 'requested', receivedAt: null }), { line: 'Documents · 4 read · income and employer on the letter', canSendAgain: false });
  const stubs = { ...letterReport, documents: [{ documentType: 'pay stub' }, { documentType: 'pay stub' }], comparisons: [{ field: 'Employer', stated: 'A', found: 'B Corp', status: 'mismatch' }, { field: 'Income', stated: '$85,000', found: '$3,541.67 semi monthly × 24 from 2 of 2 stubs', annual: 85000, basis: 'median full period', status: 'match' }] };
  assert.equal(documentsLine(stubs).line, 'Documents · 2 read · income on pay stubs');
  const nothing = { ...letterReport, comparisons: [{ field: 'Employer', stated: 'A', found: 'B Corp', status: 'mismatch' }, { field: 'Income', stated: '$85,000', found: null, status: 'not_found' }] };
  assert.equal(documentsLine(nothing).line, 'Documents · 4 read · nothing matched');
  assert.equal(whatMatched({ ...letterReport, nameMatch: 'mismatch' }), 'nothing matched', 'a name that did not match counts nothing');
  assert.equal(documentsLine({ ...letterReport, documents: [{ documentType: 'Other / Unrecognized', unrecognized: true }] }).line, 'Documents · none yet', 'an unrecognized upload is not a document read');
  for (const s of [documentsLine([letterReport]).line, documentsLine(stubs).line]) assert.doesNotMatch(s, /[\u2014\u2013]/);
});

test('the fold rows in the checklist words: Said and Docs, the tick for match, the dot for mismatch, nothing otherwise, the Also seen lines', () => {
  const rows = comparisonRows([letterReport]);
  assert.deepEqual(rows.map((r) => [r.field, r.status]), [['Employer', 'match'], ['Job title', 'match'], ['Income', 'match']]);
  assert.equal(rows[0].said, 'Sunnybrook Health Sciences Centre'); assert.equal(rows[0].docs, 'Sunnybrook Health Sciences Centre');
  assert.deepEqual(rows[0].also, ['credit report lists Lakeshore Family Practice (historical)', 'since Sep 2022']);
  assert.equal(rows[2].docs, '$92,000 a year on the letter, pay stubs annualize to $92,000 (letter and pay stubs agree)');
  const old = comparisonRows({ ...letterReport, comparisons: [{ field: 'Employer', stated: 'Livenation', found: 'Live Nation Canada Inc', status: 'mismatch' }, { field: 'Income', stated: '$96,000', found: null, status: 'not_found' }] });
  assert.equal(old[0].status, 'match', 'an old stored mismatch reads through the current employer rule');
  assert.equal(old[1].docs, 'not on documents'); assert.equal(old[1].status, 'not_found');
  const bad = comparisonRows({ ...letterReport, comparisons: [{ field: 'Employer', stated: 'Shopify', found: 'Loblaw', status: 'match' }] });
  assert.equal(bad[0].status, 'mismatch');
  assert.deepEqual(comparisonRows(null), []);
});
