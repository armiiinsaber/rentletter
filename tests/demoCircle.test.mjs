// The sandbox Circle (lib/demoAdapter.js, lib/demoFixture.js, components/dashboard/CircleView.js):
// the real Circle screen over sample realtors kept in the browser tab. It starts with one request
// waiting, a few connections and realtors a search finds; every action answers as the product's
// route does; every brokerage is named a sample; and nothing leaves the tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { createDemoAdapter, freshState, DEMO_PATHS } = await import('../lib/demoAdapter.js');
const { demoCircle } = await import('../lib/demoFixture.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const sandbox = () => {
  const adapter = createDemoAdapter(freshState());
  const post = async (body, url = '/api/circle') => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { adapter, post };
};

test('the sandbox Circle opens with one request waiting, a few connections and a request sent', async () => {
  const { post } = sandbox();
  const { status, body } = await post({ action: 'load' });
  assert.equal(status, 200); assert.equal(body.available, true); assert.equal(body.sample, true);
  assert.deepEqual(body.requests.map((r) => r.name), ['Daniel Okafor']);
  assert.deepEqual(body.connections.map((c) => c.name).sort(), ['Hannah Lindqvist', 'Marcus Oyelaran', 'Priya Raman']);
  assert.deepEqual(body.sent.map((r) => r.name), ['Mei Tanaka']);
  assert.equal((await post({ action: 'count' })).body.pending, 1);
  // The same shape the product's route answers, so the same screen draws it.
  assert.deepEqual(Object.keys(body).sort(), ['available', 'blocked', 'brokerage', 'connections', 'invite', 'me', 'requests', 'sample', 'sent']);
  assert.deepEqual(Object.keys(body.connections[0]).sort(), ['brokerage', 'connectionId', 'doesRentals', 'history', 'initials', 'name', 'record', 'serviceAreas', 'since']);
  assert.deepEqual(body.connections[0].history, { sent: 0, received: 0, closed: 0 });
  assert.equal(body.connections.find((c) => c.name === 'Priya Raman').record.confirmed, true);
  assert.equal(body.invite.link, 'https://rentletter.ca/join?invite=SAMPLE-LINK');
});

test('it behaves like the real Circle: find, add, accept, decline, remove, block, settings, brokerage', async () => {
  const { post } = sandbox();
  // Search by name or brokerage; a realtor who turned findable off is in none.
  assert.deepEqual((await post({ action: 'search', q: 'riverside' })).body.results.map((r) => r.name), ['Sofia Petrova']);
  assert.deepEqual((await post({ action: 'search', q: 'Elena' })).body.results, []);
  assert.deepEqual((await post({ action: 'search', q: 'x' })).body, { available: true, results: [], tooShort: true });
  const found = (await post({ action: 'search', q: 'Sofia' })).body.results[0];
  assert.deepEqual(Object.keys(found).sort(), ['brokerage', 'connectionId', 'id', 'initials', 'name', 'state']);
  assert.equal(found.state, 'none');
  // Add: a request, not a connection.
  const asked = await post({ action: 'request', profileId: found.id });
  assert.equal(asked.body.state, 'sent');
  assert.equal((await post({ action: 'search', q: 'Sofia' })).body.results[0].state, 'sent');
  assert.equal((await post({ action: 'load' })).body.connections.length, 3);
  // The request waiting: only it can be accepted; a request the sandbox realtor sent cannot.
  const load = (await post({ action: 'load' })).body;
  assert.equal((await post({ action: 'accept', id: load.sent[0].connectionId })).status, 404);
  assert.equal((await post({ action: 'accept', id: load.requests[0].connectionId })).body.state, 'connected');
  assert.deepEqual((await post({ action: 'load' })).body.requests, []);
  assert.equal((await post({ action: 'load' })).body.connections.length, 4);
  assert.equal((await post({ action: 'count' })).body.pending, 0);
  // Remove and block.
  const priya = (await post({ action: 'load' })).body.connections.find((c) => c.name === 'Priya Raman');
  assert.equal((await post({ action: 'remove', id: priya.connectionId })).status, 200);
  assert.equal((await post({ action: 'load' })).body.connections.some((c) => c.name === 'Priya Raman'), false);
  const marcus = (await post({ action: 'load' })).body.connections.find((c) => c.name === 'Marcus Oyelaran');
  await post({ action: 'block', id: marcus.connectionId });
  assert.deepEqual((await post({ action: 'load' })).body.blocked.map((b) => b.name), ['Marcus Oyelaran']);
  assert.deepEqual((await post({ action: 'search', q: 'Marcus' })).body.results, []);
  await post({ action: 'unblock', id: marcus.connectionId });
  assert.equal((await post({ action: 'search', q: 'Marcus' })).body.results[0].state, 'none');
  // Settings and the brokerage form are kept in the tab, and no email is sent.
  assert.equal((await post({ action: 'settings', findable: false })).body.findable, false);
  assert.equal((await post({ action: 'load' })).body.me.findable, false);
  const saved = await post({ action: 'save', legalName: 'Sample Demo Realty, Brokerage', address: '1 Sample Street, Toronto', brokerName: 'Jordan Sample', brokerEmail: 'jordan@example.com' }, '/api/circle/brokerage');
  assert.equal(saved.status, 200); assert.equal(saved.body.emailed, false); assert.equal(saved.body.sample, true);
  assert.equal((await post({ action: 'load' })).body.brokerage.legalName, 'Sample Demo Realty, Brokerage');
  assert.equal((await post({ action: 'save', legalName: 'x' }, '/api/circle/brokerage')).status, 400);
  assert.equal((await post({ action: 'nope' })).status, 400);
});

test('all of it is sample data, never a real account, and nothing is written anywhere real', async () => {
  const c = demoCircle();
  assert.ok(c.realtors.length >= 8);
  for (const r of c.realtors) {
    assert.match(r.brokerage, /^Sample /, `${r.name}: a sample brokerage`);
    assert.match(r.id, /^demo-realtor-\d+$/, 'a sandbox id, never a profile id');
    assert.deepEqual(Object.keys(r).filter((k) => /email|phone|plan|token|invite/i.test(k)), [], 'no contact, plan or token');
  }
  assert.match(c.invite.link, /invite=SAMPLE-LINK$/, 'the invite link is a sample, not a realtor\'s code');
  // The sandbox answers from its own store: a call while the network is unreachable still works.
  const real = globalThis.fetch; let network = 0; globalThis.fetch = async () => { network += 1; throw new Error('the sandbox must not use the network'); };
  try {
    const { post } = sandbox();
    for (const body of [{ action: 'load' }, { action: 'search', q: 'sample' }, { action: 'request', profileId: 'demo-realtor-8' }, { action: 'settings', doesRentals: false }]) assert.equal((await post(body)).status, 200);
    assert.equal((await post({ action: 'save', legalName: 'Sample Realty', address: '1 Sample Street', brokerName: 'A Sample', brokerEmail: 'a@example.com' }, '/api/circle/brokerage')).status, 200);
  } finally { globalThis.fetch = real; }
  assert.equal(network, 0, 'no request left the sandbox');
  const routes = code('lib/demoAdapter.js'); const circle = routes.slice(routes.indexOf('const circleState'), routes.indexOf('async function demoFetch'));
  assert.ok(circle.length > 1000);
  assert.doesNotMatch(circle, /fetch\(|supabase|Resend|localStorage/, 'the sandbox Circle touches only its own store');
  // The screen says so, and the tab is in the sandbox's navigation.
  const view = code('components/dashboard/CircleView.js');
  assert.match(view, /\{adapter\.kind !== 'real' \? <p data-circle-sample="" className="cv-standing"[^>]*>Sample realtors\. None of these are real accounts, and nothing here is sent to anyone\.<\/p> : null\}/);
  assert.equal(DEMO_PATHS.circle, '/demo/dashboard?circle=1');
  assert.match(code('pages/demo/dashboard.js'), /if \(router\.query\.circle === '1'\) return \{ key: 'circle', el: <CircleView initialProfile=\{\{ \.\.\.s\.profile \}\} \/> \};/);
  assert.doesNotMatch(code('components/dashboard/MainNav.js'), /adapter\.kind !== 'real'/, 'the sandbox draws the navigation too');
});
