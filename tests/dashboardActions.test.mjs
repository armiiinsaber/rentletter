// The dashboard says each thing once: the listing card's one action line (lib/actions.js
// listingAction), the greeting from a client hour (lib/greeting.js), and the bell panel's rows
// (components/dashboard/ActionRow.js) rendered with three items across two listings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const { buildActions, listingAction, actionLabel } = await import('../lib/actions.js');
const { greetingFor, greetWordFor } = await import('../lib/greeting.js');

const NOW = '2026-09-10T12:00:00Z'; const ago = (d) => new Date(Date.parse(NOW) - d * 86400000).toISOString();
const report = (over = {}) => ({ analyzedAt: ago(2), nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', annual: 90000, found: '$90,000' }, { field: 'Employer', stated: 'Acme', found: 'Acme', status: 'match' }], ...over });
const app = (linkId, name, extra = {}) => ({ linkId, decisionStatus: 'none', withdrawnAt: null, confirmations: {}, lastSentAt: null, docRequest: null, docVerifications: [], application: { full_name: name, fit: { score: 4.2, label: 'stated' } }, ...extra });
const L1 = { id: 'L1', name: '210 Carlaw Ave, Unit 4', created_at: ago(1) }, L2 = { id: 'L2', name: '88 Harbour St, Unit 2104', created_at: ago(1) }, L3 = { id: 'L3', name: '1 Quiet St', created_at: ago(1) };

test('the listing card action line, one wording per kind, nothing when the listing has no item', () => {
  const build = (apps, listing = L1) => buildActions({ listings: [listing], applicantsByListing: { [listing.id]: apps }, people: [], now: NOW });
  const label = (apps, listing) => { const items = build(apps, listing); const a = listingAction(items, (listing || L1).id); return a && a.label; };
  assert.equal(label([app('a', 'Sofia Russo'), app('b', 'Omar Haddad')]), 'Request documents · 2');
  assert.equal(label([app('a', 'Sofia Russo')]), 'Request documents · 1');
  assert.equal(label([app('a', 'Lucia Fernandez', { docVerifications: [report({ nameMatch: 'mismatch' })] })]), 'Review documents · 1');
  assert.equal(label([app('a', 'Lucia Fernandez', { docVerifications: [report({ nameMatch: 'mismatch' })] }), app('b', 'Wei Chen', { docVerifications: [report({ comparisons: [{ field: 'Income', status: 'mismatch' }] })] })]), 'Review documents · 2', 'mismatch and checked count together');
  assert.equal(label([app('a', 'Wei Chen', { docVerifications: [report()] })]), 'Verify Wei');
  assert.equal(label([app('a', 'Marc Tremblay', { docRequest: { status: 'requested', requestedAt: ago(5) } })]), 'Nudge Marc');
  assert.equal(label([app('a', 'Priya Sharma', { confirmations: { employer: { at: ago(1), by: 'You' } } })]), 'Send report');
  const answered = { ...L1, snapshot: { id: 'S1', sentAt: ago(1), answers: { 1: { answer: 'meet', at: ago(0.5) } } } };
  assert.equal(label([app('a', 'Priya Sharma', { landlordAnswer: { answer: 'meet', at: ago(0.5), rank: 1 } })], answered), 'Open');
  // the top item wins: a name mismatch outranks a request on the same listing
  assert.equal(label([app('a', 'Sofia Russo'), app('b', 'Lucia Fernandez', { docVerifications: [report({ nameMatch: 'mismatch' })] })]), 'Review documents · 1');
  // no item: nothing
  assert.equal(listingAction(build([]), 'L1'), null);
  assert.equal(listingAction(build([app('a', 'Priya Sharma', { confirmations: { employer: { at: ago(1), by: 'You' } }, lastSentAt: ago(1) })]), 'L1'), null, 'verified and sent: nothing is next');
  const rented = build([app('a', 'Sofia Russo')], { ...L3, status: 'rented' });
  assert.equal(listingAction(rented, 'L3'), null, 'a rented listing has no item');
  assert.equal(actionLabel({ kind: 'sent_waiting', verb: 'Open', listingId: 'L1' }), 'Open');
  assert.equal(actionLabel(null), null);
});

test('the greeting from a client hour', () => {
  assert.equal(greetWordFor(6), 'Good morning'); assert.equal(greetWordFor(11), 'Good morning'); assert.equal(greetWordFor(12), 'Good afternoon'); assert.equal(greetWordFor(17), 'Good afternoon'); assert.equal(greetWordFor(18), 'Good evening'); assert.equal(greetWordFor(23), 'Good evening');
  assert.equal(greetingFor(21, 'Sam'), 'Good evening, Sam.'); assert.equal(greetingFor(9, ''), 'Good morning.');
  for (const s of [greetingFor(21, 'Sam'), greetingFor(9, '')]) assert.doesNotMatch(s, /[—–]/);
});

test('the panel rows: three items across two listings render grouped by listing with the address line, the person over the reason and the verb', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ActionRows } = await import('../components/dashboard/ActionRow.js');
  const apps = { L1: [app('a', 'Sofia Russo'), app('b', 'Wei Chen', { docVerifications: [report()] })], L2: [app('c', 'Lucia Fernandez', { docVerifications: [report({ nameMatch: 'mismatch' })] })] };
  const items = buildActions({ listings: [L1, L2], applicantsByListing: apps, people: [], now: NOW });
  assert.equal(items.length, 3);
  const html = renderToStaticMarkup(React.createElement(ActionRows, { items, onGo: () => {}, onDismiss: () => {} }));
  const text = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  const groups = [...html.matchAll(/data-listing="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['L2', 'L1'], 'grouped in the order of each listing\'s first item; the mismatch on L2 is most urgent');
  const addresses = [...html.matchAll(/class="al-address"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(addresses, ['88 Harbour St, Unit 2104', '210 Carlaw Ave, Unit 4'], 'the address said once per group');
  const rows = [...html.matchAll(/data-key="([^"]+)" data-kind="([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(rows, ['mismatch', 'verify', 'request']);
  for (const name of ['Lucia Fernandez', 'Wei Chen', 'Sofia Russo']) assert.ok(text.includes(name), name);
  assert.ok(text.includes('|Name did not match|')); assert.ok(text.includes('|4.2 docs match|')); assert.ok(text.includes('|No documents yet|'));
  assert.ok(text.includes('|Review|') && text.includes('|Verify|') && text.includes('|Request|'), 'the verbs at the right');
  assert.equal((html.match(/aria-label="Dismiss: /g) || []).length, 3, 'a 44px X per row');
  assert.equal(/Assistant/.test(html), false);
  const empty = renderToStaticMarkup(React.createElement(ActionRows, { items: [], onGo: () => {}, onDismiss: () => {} }));
  assert.ok(empty.includes('Nothing waiting on you.'));
  assert.doesNotMatch(html + empty, /[—–]/);
});
