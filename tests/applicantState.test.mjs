import test from 'node:test';
import assert from 'node:assert/strict';
import { applicantState } from '../lib/applicantState.js';

const report = ({ income = true, nameMatch = 'match', analyzedAt = '2026-08-12T15:00:00Z' } = {}) => ({ analyzedAt, nameMatch, documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', found: '$90,000', status: income ? 'match' : 'close' }, { field: 'Employer', found: 'X', status: 'match' }] });
const junction = (extra = {}) => ({ decisionStatus: 'none', withdrawnAt: null, decisionChangedAt: null, docRequest: null, confirmations: {}, lastSentAt: null, ...extra });
const EMP = { employer: { at: '2026-09-02T14:00:00Z', by: 'Armin' } };

test('new: nothing recorded', () => { assert.deepEqual(applicantState({ junction: junction() }), { state: 'new', since: null }); assert.deepEqual(applicantState({}), { state: 'new', since: null }); });
test('requested: a request record and no report', () => { assert.deepEqual(applicantState({ junction: junction({ docRequest: { status: 'requested', requestedAt: '2026-08-30T10:00:00Z' } }) }), { state: 'requested', since: '2026-08-30T10:00:00Z' }); });
test('checked: a report, name matched, nothing matched', () => { assert.deepEqual(applicantState({ junction: junction(), verification: report({ income: false }) }), { state: 'checked', since: '2026-08-12T15:00:00Z' }); });
test('matched: a report with income matched', () => { assert.deepEqual(applicantState({ junction: junction(), verification: [report()] }), { state: 'matched', since: '2026-08-12T15:00:00Z' }); });
test('verified: the realtor confirmed the employer, with its date', () => { assert.deepEqual(applicantState({ junction: junction({ confirmations: EMP }) }), { state: 'verified', since: '2026-09-02T14:00:00Z' }); });
test('sent: included in a sent report', () => { assert.deepEqual(applicantState({ junction: junction({ lastSentAt: '2026-09-01T09:00:00Z', confirmations: EMP }), verification: report() }), { state: 'sent', since: '2026-09-01T09:00:00Z' }); });
test('mismatch: a report whose name did not match, or was unclear', () => {
  assert.equal(applicantState({ junction: junction(), verification: report({ nameMatch: 'mismatch' }) }).state, 'mismatch');
  assert.equal(applicantState({ junction: junction(), verification: report({ nameMatch: 'unclear' }) }).state, 'mismatch');
});
test('set_aside: a reject decision, or a withdrawal, with its date', () => {
  assert.deepEqual(applicantState({ junction: junction({ decisionStatus: 'reject', decisionChangedAt: '2026-08-20T09:00:00Z' }) }), { state: 'set_aside', since: '2026-08-20T09:00:00Z' });
  assert.deepEqual(applicantState({ junction: { decision_status: 'none', withdrawn_at: '2026-08-21T09:00:00Z' } }), { state: 'set_aside', since: '2026-08-21T09:00:00Z' });
});
test('priority: set aside beats sent and verified, sent beats verified, verified beats mismatch and matched, mismatch beats matched, id confirmed cancels mismatch, a report beats a pending request', () => {
  assert.equal(applicantState({ junction: junction({ decisionStatus: 'reject', lastSentAt: '2026-09-01T09:00:00Z', confirmations: EMP }), verification: report() }).state, 'set_aside');
  assert.equal(applicantState({ junction: junction({ lastSentAt: '2026-09-01T09:00:00Z', confirmations: EMP }) }).state, 'sent');
  assert.equal(applicantState({ junction: junction({ confirmations: EMP }), verification: report({ nameMatch: 'mismatch' }) }).state, 'verified');
  assert.equal(applicantState({ junction: junction({ confirmations: EMP }), verification: report() }).state, 'verified');
  assert.equal(applicantState({ junction: junction(), verification: report({ nameMatch: 'mismatch' }) }).state, 'mismatch');
  assert.equal(applicantState({ junction: junction({ confirmations: { id: { at: 'x', by: 'Armin' } } }), verification: report({ nameMatch: 'mismatch' }) }).state, 'matched');
  assert.equal(applicantState({ junction: junction({ docRequest: { status: 'requested', requestedAt: '2026-08-30T10:00:00Z' } }), verification: report() }).state, 'matched');
  assert.equal(applicantState({ junction: junction({ docRequest: { status: 'received' } }) }).state, 'new', 'a received request with no report is not "requested"');
});
