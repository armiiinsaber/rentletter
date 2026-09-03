import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActions, visibleActions, actionHref, KIND_ORDER } from '../lib/actions.js';
import { computeNotices } from '../lib/noticed.js';

const NOW = '2026-09-02T12:00:00Z';
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 86400000).toISOString();
const report = (over = {}) => ({ analyzedAt: daysAgo(2), nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', found: '$90,000' }, { field: 'Employer', status: 'match' }], ...over });
const app = (linkId, name, extra = {}) => ({ linkId, decisionStatus: 'none', withdrawnAt: null, confirmations: {}, lastSentAt: null, docRequest: null, docVerifications: [], application: { full_name: name, fit: { score: 4.65, label: 'docs match' } }, ...extra });
const L1 = { id: 'L1', name: '210 Carlaw Ave, Unit 4' }, L2 = { id: 'L2', name: '88 Harbour St' };

const fixture = () => ({
  listings: [L1, L2],
  applicantsByListing: {
    L1: [
      app('a-check', 'David Kowalski', { docVerifications: [report({ comparisons: [{ field: 'Income', status: 'close' }] })] }),
      app('a-mismatch', 'Lucia Fernandez', { docVerifications: [report({ nameMatch: 'mismatch' })] }),
      app('a-verify', 'Wei Chen', { docVerifications: [report()] }),
      app('a-waiting', 'Marc Tremblay', { docRequest: { status: 'requested', requestedAt: daysAgo(4) } }),
      app('a-fresh', 'Ana Ruiz', { docRequest: { status: 'requested', requestedAt: daysAgo(2) } }),
      app('a-request', 'Sofia Russo'),
      app('a-verified', 'Priya Sharma', { confirmations: { employer: { at: daysAgo(1), by: 'You' } } }),
      app('a-aside', 'Tasha Okafor', { decisionStatus: 'reject' }),
    ],
    L2: [app('b-sent', 'Omar Haddad', { lastSentAt: daysAgo(6) })],
  },
  now: NOW,
});

test('one item per kind, with the copy', () => {
  const items = buildActions(fixture());
  const by = Object.fromEntries(items.map((i) => [i.kind, i]));
  items.forEach((i) => console.log(`  ${i.kind.padEnd(13)} ${i.title.padEnd(20)} ${i.detail.padEnd(40)} ${i.verb.padEnd(8)} ${i.panel.padEnd(10)} ${i.key}`));
  assert.deepEqual(Object.keys(by).sort(), [...KIND_ORDER].sort());
  assert.deepEqual([by.check_docs.title, by.check_docs.detail, by.check_docs.verb, by.check_docs.panel], ['Documents differ', 'David Kowalski · 210 Carlaw Ave, Unit 4', 'Review', 'documents']);
  assert.deepEqual([by.mismatch.title, by.mismatch.detail, by.mismatch.verb, by.mismatch.panel], ['Name did not match', 'Lucia Fernandez · 210 Carlaw Ave, Unit 4', 'Review', 'documents']);
  assert.deepEqual([by.verify.title, by.verify.detail, by.verify.verb, by.verify.panel], ['Verify Wei', '4.7 docs match · 210 Carlaw Ave, Unit 4', 'Verify', 'checklist']);
  assert.deepEqual([by.waiting.title, by.waiting.detail, by.waiting.verb, by.waiting.panel], ['Waiting 4 days', 'Marc Tremblay · documents requested', 'Nudge', 'documents']);
  assert.deepEqual([by.request.title, by.request.detail, by.request.verb, by.request.panel], ['Request documents', 'Sofia Russo · 210 Carlaw Ave, Unit 4', 'Request', 'documents']);
  assert.deepEqual([by.ready.title, by.ready.detail, by.ready.verb, by.ready.panel, by.ready.linkId], ['Ready to send', '1 verified · 210 Carlaw Ave, Unit 4', 'Send', 'report', null]);
  assert.deepEqual([by.sent_waiting.title, by.sent_waiting.detail, by.sent_waiting.verb, by.sent_waiting.panel], ['Sent 6 days ago', '88 Harbour St · no reply yet', 'Open', 'report']);
  // a request two days old, a verified applicant, a set aside one: no item of their own
  assert.ok(!items.some((i) => i.linkId === 'a-fresh' || i.linkId === 'a-verified' || i.linkId === 'a-aside'));
  for (const i of items) { assert.ok(i.title.split(/\s+/).length <= 5, i.title); assert.ok(!/—|–/.test(i.title + i.detail)); }
});

test('priority order and stable keys', () => {
  const items = buildActions(fixture());
  assert.deepEqual(items.map((i) => i.kind), [...KIND_ORDER]);
  const again = buildActions({ ...fixture(), now: '2026-09-02T18:00:00Z' });
  assert.deepEqual(again.map((i) => i.key), items.map((i) => i.key));
  assert.equal(items.find((i) => i.kind === 'verify').key, 'verify:a-verify');
  assert.equal(items.find((i) => i.kind === 'ready').key, 'ready:L1');
  // a listing with a sent applicant is not "ready" even with a verified one
  const f = fixture(); f.applicantsByListing.L1.push(app('a-sent', 'Sent One', { lastSentAt: daysAgo(1) }));
  assert.ok(!buildActions(f).some((i) => i.kind === 'ready'));
});

test('dismissal holds while the signature is unchanged and lifts when the state changes', () => {
  const items = buildActions(fixture());
  const verify = items.find((i) => i.kind === 'verify');
  assert.equal(verify.signature, `matched:${daysAgo(2)}`);
  const hidden = visibleActions(items, { [verify.key]: verify.signature });
  assert.ok(!hidden.some((i) => i.key === verify.key));
  const f = fixture(); f.applicantsByListing.L1.find((a) => a.linkId === 'a-verify').docVerifications = [report({ analyzedAt: daysAgo(0) })];
  const later = buildActions(f).find((i) => i.kind === 'verify');
  assert.equal(later.key, verify.key); assert.notEqual(later.signature, verify.signature);
  assert.ok(visibleActions(buildActions(f), { [verify.key]: verify.signature }).some((i) => i.key === verify.key));
  assert.equal(computeNotices({ ...fixture(), dismissed: { [verify.key]: verify.signature } }).length, items.length - 1);
});

test('deep links through the adapter paths', () => {
  const items = buildActions(fixture());
  const verify = items.find((i) => i.kind === 'verify'), ready = items.find((i) => i.kind === 'ready');
  assert.equal(actionHref(verify, { listing: (id) => `/landlord/${id}` }), '/landlord/L1?applicant=a-verify&panel=checklist');
  assert.equal(actionHref(ready, { listing: (id) => `/demo/dashboard?listing=${id}` }), '/demo/dashboard?listing=L1&panel=report');
  assert.equal(computeNotices(fixture())[2].action.href, '/landlord/L1?applicant=a-verify&panel=checklist');
});
