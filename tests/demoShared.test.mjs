// The sandbox's Shared with you (lib/demoAdapter.js, lib/demoFixture.js demoSharedWithMe,
// components/dashboard/SharedWithMe.js): one sample share, the listing agent's view, answered in the
// shapes the product's route answers, from fixture data only: the facts on the whitelist, the
// checks on the closed list, the screening score on that unit, no document that opens and no ID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { createDemoAdapter, freshState } = await import('../lib/demoAdapter.js');
const { demoSharedWithMe } = await import('../lib/demoFixture.js');
const { PROFILE_FACT_KEYS, PROFILE_CHECK_KINDS } = await import('../lib/profileFacts.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const post = async (adapter, body) => { const r = await adapter.fetch('/api/profile-shares/shared-with-me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

test('the sandbox lists one share and opens the listing agent\'s view of it', async () => {
  const adapter = createDemoAdapter(freshState());
  const list = await post(adapter, { action: 'list' });
  assert.equal(list.status, 200); assert.equal(list.body.available, true);
  assert.equal(list.body.shares.length, 1);
  assert.deepEqual(Object.keys(list.body.shares[0]).sort(), ['ended', 'id', 'listingName', 'sharedAt'], 'the list says the unit and when, nothing of the tenant');
  const view = await post(adapter, { action: 'view', shareId: list.body.shares[0].id });
  assert.equal(view.status, 200); assert.equal(view.body.role, 'listing_agent'); assert.equal(view.body.ended, null);
  for (const f of view.body.facts) assert.ok(PROFILE_FACT_KEYS.includes(f.key), `${f.key} is on the whitelist`);
  for (const c of view.body.checks) assert.ok(PROFILE_CHECK_KINDS.includes(c.kind), `${c.kind} is on the closed list`);
  assert.ok(view.body.screening && view.body.screening.score > 0, 'the screening score on that unit');
  assert.deepEqual(view.body.documents, [], 'no document opens in the sandbox, and never an ID');
  assert.equal((await post(adapter, { action: 'open', shareId: list.body.shares[0].id, documentId: 'x' })).status, 403);
  assert.equal((await post(adapter, { action: 'view', shareId: 'someone-else' })).status, 404);
  const text = JSON.stringify(view.body);
  assert.doesNotMatch(text, /owner_token|ownerToken|dateOfBirth|numberOfOccupants|smoker|coApplicant|rank|household/i, 'nothing off the list travels');
});

test('fixture data only, and the dashboard reads it through the adapter', () => {
  const sample = demoSharedWithMe();
  assert.equal(sample.share.id, 'demo-share-1');
  assert.match(src('lib/demoAdapter.js'), /'POST \/api\/profile-shares\/shared-with-me': \(q, b\) => \{\s*const sample = demoSharedWithMe\(\);/);
  assert.doesNotMatch(src('components/dashboard/SharedWithMe.js'), /adapter\.kind !== 'real'/, 'the sandbox is not skipped any more');
});
