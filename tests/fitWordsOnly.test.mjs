// The employer wording fix changed words and no number. tests/fixtures/fitBefore.json.gz is every
// Fit the unit tests computed at 0bc7a97, before the change: 2986 distinct cases from 23 test
// files, each with its input as given (the clock it read included) and the whole result as it came
// back, less the confirmations it echoes. It was recorded by running the unit tests with
// lib/fitScore.js wrapped, and replays identically on the code it came from. Here every case runs
// again through lib/fitScore.js as it is now: every score, every band (the Fit word beside the
// number: stated, docs match, check docs, verified), every pillar, fact weight and criterion, and
// every ordering is the same. The only differences are the two phrases that said the income was
// confirmed when what was recorded is a call to the employer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { computeFit, compareFit, fitReason, fitLine, fitLines } from '../lib/fitScore.js';

const { recordedAt, cases } = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/fitBefore.json.gz', import.meta.url))).toString('utf8'));
const strip = (o) => { if (!o) return null; const { confirmations, ...rest } = o; return rest; };
const before = cases.map((c) => c.before);
const after = cases.map((c) => JSON.parse(JSON.stringify(strip(computeFit(c.input)))));
// The two phrases, old to new, and nothing else.
const WORDS = [['Current income confirmed', 'Employer confirmed'], ['Income confirmed by you', 'Employer confirmed by you']];
const reword = (o) => JSON.parse(WORDS.reduce((s, [from, to]) => s.split(from).join(to), JSON.stringify(o)));
const OLD = /Current income confirmed|Income confirmed by you/;

test('the recording is the Fit cases of the unit tests before the change, and the old phrases are in it', () => {
  assert.equal(recordedAt, '0bc7a97');
  assert.equal(cases.length, 2986);
  assert.equal(new Set(cases.map((c) => c.file)).size, 23);
  const worded = before.filter((b) => OLD.test(JSON.stringify(b)));
  assert.equal(worded.length, 651, 'every case where the realtor called the employer carried the old words');
  assert.ok(worded.every((b) => b.label === 'verified' || b.evidence.employerConfirmed), 'and only those');
  assert.equal(after.filter((a) => OLD.test(JSON.stringify(a))).length, 0, 'no case carries them now');
});

test('every score and every band is the same, case by case', () => {
  cases.forEach((c, i) => {
    const b = before[i], a = after[i], at = `${c.file} case ${i}`;
    if (b == null) { assert.equal(a, null, at); return; }
    assert.equal(a.score, b.score, `${at}: score`);
    assert.equal(a.scoreExact, b.scoreExact, `${at}: exact score`);
    assert.equal(a.label, b.label, `${at}: band`);
    assert.deepEqual([a.A, a.E, a.R, a.ratio, a.incomeUsed, a.incomeSource, a.savingsMonths, a.assessed, a.of], [b.A, b.E, b.R, b.ratio, b.incomeUsed, b.incomeSource, b.savingsMonths, b.assessed, b.of], `${at}: pillars and ratio`);
    assert.deepEqual(a.pillars.map((p) => [p.name, p.assessed, p.value, p.facts.map((f) => [f.value, f.weight, f.share, f.date, f.context])]), b.pillars.map((p) => [p.name, p.assessed, p.value, p.facts.map((f) => [f.value, f.weight, f.share, f.date, f.context])]), `${at}: every fact's value, weight and date`);
    assert.deepEqual(a.criteria.map((x) => [x.key, x.status, x.value]), b.criteria.map((x) => [x.key, x.status, x.value]), `${at}: criteria`);
    assert.deepEqual(a.flags, b.flags, `${at}: flags`);
    assert.equal(fitLine(a), fitLine(b), `${at}: the Fit line`);
  });
});

test('only the words differ: each result is the old one with the two phrases replaced', () => {
  let changed = 0;
  cases.forEach((c, i) => {
    assert.deepEqual(after[i], reword(before[i]), `${c.file} case ${i}`);
    if (JSON.stringify(after[i]) !== JSON.stringify(before[i])) changed++;
    if (before[i]) assert.deepEqual(fitLines(after[i]), reword(fitLines(before[i])), `${c.file} case ${i}: the lines under the number`);
  });
  assert.equal(changed, 651, 'the words changed exactly where they were wrong');
});

test('every ordering is the same: all cases together, each test file\'s cases, and the reason lines between neighbours', () => {
  const wrap = (fit, i) => ({ i, application: { fit, created_at: (cases[i].input.application || {}).created_at || '' } });
  const order = (fits, idx) => idx.map((i) => wrap(fits[i], i)).sort(compareFit).map((x) => x.i);
  const all = cases.map((_, i) => i);
  const o = order(after, all);
  assert.deepEqual(o, order(before, all), 'all cases');
  for (const file of new Set(cases.map((c) => c.file))) {
    const idx = all.filter((i) => cases[i].file === file);
    assert.deepEqual(order(after, idx), order(before, idx), file);
  }
  for (let k = 1; k < o.length; k++) assert.equal(fitReason(after[o[k]], after[o[k - 1]]), fitReason(before[o[k]], before[o[k - 1]]), `the reason line at ${k}`);
});
