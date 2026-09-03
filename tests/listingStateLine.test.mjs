import test from 'node:test';
import assert from 'node:assert/strict';
import { stateLine, listingStateLine, stateCounts } from '../lib/listingStateLine.js';

const report = (over = {}) => ({ analyzedAt: '2026-08-12T15:00:00Z', nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', found: '$90,000' }], ...over });
const a = (extra = {}) => ({ linkId: Math.random().toString(36).slice(2), decisionStatus: 'none', withdrawnAt: null, confirmations: {}, lastSentAt: null, docRequest: null, docVerifications: [], application: {}, ...extra });

test('the state line in order, non zero counts only', () => {
  const apps = [
    a({ confirmations: { employer: { at: '2026-09-01T00:00:00Z', by: 'You' } } }),
    a({ docVerifications: [report()] }), a({ docVerifications: [report()] }),
    a({ docVerifications: [report({ nameMatch: 'mismatch' })] }), a({ docVerifications: [report({ comparisons: [{ field: 'Income', status: 'close' }] })] }),
    a({ docRequest: { status: 'requested', requestedAt: '2026-08-30T00:00:00Z' } }),
    a(), a({ decisionStatus: 'reject' }), a({ withdrawnAt: '2026-08-01T00:00:00Z' }),
  ];
  assert.equal(stateLine(apps), '1 verified · 2 docs match · 2 to check · 1 waiting on documents · 1 no documents');
  assert.deepEqual(stateCounts(apps), { verified: 1, matched: 2, check: 2, waiting: 1, none: 1, sent: 0 });
  assert.equal(stateLine([a({ confirmations: { employer: { at: 'x', by: 'You' } } }), a()]), '1 verified · 1 no documents');
  assert.equal(stateLine([]), '');
});

test('the dashboard card line: applicants, states, then the report', () => {
  const L = { invite_token: 'tok' };
  assert.equal(listingStateLine(L, []), 'no applicants yet · invite live');
  assert.equal(listingStateLine({}, []), 'no applicants yet');
  assert.equal(listingStateLine(L, [a({ confirmations: { employer: { at: 'x', by: 'You' } } }), a()]), '2 applicants · 1 verified · 1 no documents · report not sent');
  assert.equal(listingStateLine(L, [a({ lastSentAt: '2026-09-01T12:00:00Z' }), a({ decisionStatus: 'reject' })]), '2 applicants · 1 sent · report sent Sep 1');
});
