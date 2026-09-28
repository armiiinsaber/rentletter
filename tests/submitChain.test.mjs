// lib/submitChain.js: the tag then the mirror, three retries with a pause, done only when both
// answered, held (never done) when the last try fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSubmitChain, withRetry, CHAIN_RETRIES, CHAIN_BACKOFF_MS, SAVING_COPY } from '../lib/submitChain.js';

const noSleep = async () => {};
const answers = (script) => {
  const calls = [];
  const post = async (url, body) => { calls.push({ url, body }); const next = script[url].shift(); if (next instanceof Error) throw next; return next; };
  return { post, calls };
};
const ok = (json = {}) => ({ ok: true, status: 200, json });
const fail = (status = 500) => ({ ok: false, status, json: { error: 'Mirror failed.' } });

test('withRetry: three retries with the growing pause, then gives up', async () => {
  const slept = [];
  let n = 0;
  const out = await withRetry(async () => { n++; throw new Error(`try ${n}`); }, { sleep: async (ms) => { slept.push(ms); } });
  assert.equal(out.ok, false); assert.equal(out.attempts, CHAIN_RETRIES + 1); assert.equal(out.error.message, 'try 4');
  assert.deepEqual(slept, [...CHAIN_BACKOFF_MS]);
  const second = await withRetry(async (attempt) => (attempt < 2 ? { ok: false, status: 500 } : { ok: true, value: 1 }), { sleep: noSleep });
  assert.equal(second.ok, true); assert.equal(second.attempts, 3);
});

test('the chain: tag once, mirror once, docRequest through', async () => {
  const { post, calls } = answers({ '/api/invite/tag': [ok({ ok: true })], '/api/applications/mirror': [ok({ ok: true, mirrored: true, docRequest: { token: 'a'.repeat(32), url: 'https://rentletter.ca/upload/' + 'a'.repeat(32) } })] });
  const out = await runSubmitChain({ post, token: 't', applicationNumber: 'RL-2026-AAAA-BBBB', sleep: noSleep });
  assert.equal(out.ok, true); assert.equal(out.docRequest.token, 'a'.repeat(32));
  assert.deepEqual(calls.map((c) => c.url), ['/api/invite/tag', '/api/applications/mirror']);
  assert.deepEqual(calls[1].body, { token: 't', applicationNumber: 'RL-2026-AAAA-BBBB' });
});

test('the chain: the mirror fails once, is retried, and the application lands', async () => {
  const { post, calls } = answers({ '/api/invite/tag': [ok()], '/api/applications/mirror': [fail(500), ok({ ok: true, mirrored: true, docRequest: null })] });
  const out = await runSubmitChain({ post, token: 't', applicationNumber: 'RL-2026-AAAA-BBBB', sleep: noSleep });
  assert.equal(out.ok, true); assert.equal(out.docRequest, null); assert.equal(out.attempts.mirror, 2);
  assert.equal(calls.filter((c) => c.url === '/api/applications/mirror').length, 2); assert.equal(calls.filter((c) => c.url === '/api/invite/tag').length, 1, 'the tag is not repeated for a mirror retry');
});

test('the chain: four failures hold the tenant, never done; a network error counts as a failure', async () => {
  const { post, calls } = answers({ '/api/invite/tag': [ok()], '/api/applications/mirror': [fail(), new TypeError('Load failed'), fail(429), fail()] });
  const out = await runSubmitChain({ post, token: 't', applicationNumber: 'RL-2026-AAAA-BBBB', sleep: noSleep });
  assert.equal(out.ok, false); assert.equal(out.step, 'mirror'); assert.equal(out.attempts, 4);
  assert.equal(calls.filter((c) => c.url === '/api/applications/mirror').length, 4);
  const tagDown = answers({ '/api/invite/tag': [fail(), fail(), fail(), fail()], '/api/applications/mirror': [ok()] });
  const held = await runSubmitChain({ post: tagDown.post, token: 't', applicationNumber: 'RL-2026-AAAA-BBBB', sleep: noSleep });
  assert.equal(held.ok, false); assert.equal(held.step, 'tag'); assert.equal(tagDown.calls.filter((c) => c.url === '/api/applications/mirror').length, 0, 'the mirror is never tried after the tag gave up');
  assert.equal(SAVING_COPY.tryAgain, 'Try again'); assert.equal(SAVING_COPY.title, 'Saving your application');
});
