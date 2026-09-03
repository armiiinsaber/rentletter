// node --test tests/   (npm test). Pure module, no DOM, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesisLine, synthesisFacts, wordCount } from '../lib/applicantSynthesis.js';

const verifiedReport = (overrides = {}) => ({
  analyzedAt: '2026-08-01T00:00:00Z', nameMatch: 'match',
  documents: [{ documentType: 'Pay stub' }],
  comparisons: [{ field: 'Annual income', status: 'match', found: 90000 }, { field: 'Employer', status: 'match' }],
  ...overrides,
});
const applicant = (app = {}, docVerifications = []) => ({ linkId: 'l1', application: app, docVerifications });

test('documented income with a landlord reference and a ratio; verified once the employer is confirmed', () => {
  const a = applicant({ annual_income: 90000, rent_to_income_ratio: 34, prev_landlord_name: 'J. Wong', references: [{}, {}] }, [verifiedReport()]);
  assert.equal(synthesisLine(a), 'Documented income at 2.9x rent, landlord reference on file');
  assert.equal(synthesisLine({ ...a, confirmations: { employer: { at: '2026-09-02T14:00:00Z', by: 'Armin' } } }), 'Verified income at 2.9x rent, landlord reference on file');
  assert.equal(synthesisLine({ ...applicant({ annual_income: 90000, rent_to_income_ratio: 34 }), confirmations: { employer: { at: 'x', by: 'Armin' } } }), 'Verified income at 2.9x rent, no reference yet');
  assert.equal(synthesisFacts(a).incomeVerified, true);
});

test('unverified: stated income, no documents, no reference', () => {
  const a = applicant({ annual_income: 60000, rent_to_income_ratio: 40 });
  assert.equal(synthesisLine(a), 'Stated income at 2.5x rent, unverified, no reference yet');
});

test('documents that differ on income say so, never verified, never documented', () => {
  const report = verifiedReport({ comparisons: [{ field: 'Annual income', status: 'close' }] });
  const a = applicant({ annual_income: 60000, rent_to_income_ratio: 25 }, [report]);
  assert.equal(synthesisLine(a), 'Documents differ on stated income at 4x rent, no reference yet');
  const emp = applicant({ annual_income: 60000, rent_to_income_ratio: 25 }, [verifiedReport({ comparisons: [{ field: 'Annual income', status: 'match' }, { field: 'Employer', status: 'mismatch' }] })]);
  assert.equal(synthesisLine(emp), 'Documents differ on employer, stated income at 4x rent, no reference yet');
  const nothing = applicant({ annual_income: 60000, rent_to_income_ratio: 25 }, [verifiedReport({ comparisons: [] })]);
  assert.equal(synthesisLine(nothing), 'Stated income at 4x rent, unconfirmed by documents, no reference yet');
});

test('a name mismatch on the documents never counts as verified', () => {
  const a = applicant({ annual_income: 60000, rent_to_income_ratio: 30 }, [verifiedReport({ nameMatch: 'mismatch' })]);
  assert.match(synthesisLine(a), /^Name on documents differs, stated income at 3\.3x rent/);
});

test('reference present versus absent, with other references listed', () => {
  const withRef = applicant({ annual_income: 70000, rent_to_income_ratio: 30, prev_landlord_name: 'A. Patel' });
  const listed = applicant({ annual_income: 70000, rent_to_income_ratio: 30, references: [{}] });
  const none = applicant({ annual_income: 70000, rent_to_income_ratio: 30, references: [] });
  assert.match(synthesisLine(withRef), /landlord reference on file$/);
  assert.match(synthesisLine(listed), /, no landlord reference$/);
  assert.match(synthesisLine(none), /no reference yet$/);
});

test('high and low ratio are stated as multiples, never judged', () => {
  const high = synthesisLine(applicant({ annual_income: 150000, rent_to_income_ratio: 15 }));
  const low = synthesisLine(applicant({ annual_income: 30000, rent_to_income_ratio: 60 }));
  assert.match(high, /at 6\.7x rent/);
  assert.match(low, /at 1\.7x rent/);
  for (const s of [high, low]) assert.doesNotMatch(s, /strong|weak|good|poor|risk|recommend|approve|reject/i);
});

test('missing data produces a truthful line, never a confident one', () => {
  assert.equal(synthesisLine(applicant({})), 'Income not stated, no reference yet');
  assert.equal(synthesisLine(applicant({ annual_income: 50000 })), 'Stated income, unverified, no reference yet');
  assert.equal(synthesisLine(applicant({}, [verifiedReport({ comparisons: [] })])), 'Income not stated, documents on file, no reference yet');
  assert.equal(synthesisLine(null), 'Income not stated, no reference yet');
  assert.equal(synthesisLine(applicant({ annual_income: 'abc', rent_to_income_ratio: 0 })), 'Income not stated, no reference yet');
});

test('every line stays under twelve words and reads nothing protected', () => {
  const cases = [
    applicant({}), applicant({ annual_income: 1, rent_to_income_ratio: 99, references: [{}, {}, {}, {}] }),
    applicant({ annual_income: 90000, rent_to_income_ratio: 34, prev_landlord_name: 'X' }, [verifiedReport()]),
    applicant({ annual_income: 90000, rent_to_income_ratio: 34, references: [{}, {}] }, [verifiedReport({ comparisons: [] })]),
  ];
  for (const a of cases) assert.ok(wordCount(synthesisLine(a)) <= 12, synthesisLine(a));
  // Protected or proxy fields present on the row must change nothing.
  const base = applicant({ annual_income: 90000, rent_to_income_ratio: 34 });
  const loaded = applicant({ annual_income: 90000, rent_to_income_ratio: 34, number_of_occupants: 4, pets: 'two dogs', smoker: 'yes', personality: 'I love hosting family', full_name: 'Someone', previous_address: '1 Main St', reason_for_moving: 'family', co_applicant: { annualIncome: 50000 } });
  assert.equal(synthesisLine(loaded), synthesisLine(base));
});
