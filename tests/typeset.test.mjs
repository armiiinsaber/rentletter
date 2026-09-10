// The tenant pages' text rules (lib/typeset.js): the tied last word, the date, money and count forms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { noWidow, dateLong, moneyYr, moneyMo, count, NBSP } = await import('../lib/typeset.js');

test('noWidow ties the last two words; one word stays as it is', () => {
  assert.equal(noWidow('Edits change what Sarah sees.'), `Edits change what Sarah${NBSP}sees.`);
  assert.equal(noWidow('Saved'), 'Saved');
  assert.equal(noWidow(''), '');
});
test('dates, money and counts read one way', () => {
  assert.equal(dateLong('2026-09-08'), `September 8,${NBSP}2026`);
  assert.equal(dateLong('2026-09-08T14:00:00Z').startsWith('September'), true);
  assert.equal(dateLong(null), null);
  assert.equal(moneyYr('90000'), '$90,000/yr'); assert.equal(moneyMo(3400), '$3,400/mo'); assert.equal(moneyYr(''), null);
  assert.equal(count(0, 'provided', 'provided'), `0${NBSP}provided`); assert.equal(count(1, 'person', 'people'), `1${NBSP}person`); assert.equal(count(2, 'person', 'people'), `2${NBSP}people`);
});
