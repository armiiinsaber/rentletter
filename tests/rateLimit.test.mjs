import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubmitLimits, LIMITS, MESSAGES } from '../lib/rateLimit.js';

// A mock KV counter: increments in memory, records expiries; `down` makes incr return null.
function mockKv({ down = false } = {}) {
  const counts = new Map(); const expiries = [];
  return { counts, expiries, incr: async (k) => { if (down) return null; counts.set(k, (counts.get(k) || 0) + 1); return counts.get(k); }, expire: async (k, s) => { expiries.push([k, s]); } };
}
const NOW = Date.parse('2026-09-04T10:15:00Z');

test('per invite token: ten submissions an hour pass, the eleventh returns 429', async () => {
  const kv = mockKv();
  for (let i = 1; i <= 10; i++) { const r = await checkSubmitLimits(kv, { token: 'abc123', ip: '1.1.1.1', now: NOW }); assert.equal(r.ok, true, `submission ${i}`); }
  const eleventh = await checkSubmitLimits(kv, { token: 'abc123', ip: '1.1.1.1', now: NOW });
  assert.deepEqual([eleventh.ok, eleventh.status, eleventh.kind, eleventh.message], [false, 429, 'token', MESSAGES.token]);
  assert.equal(LIMITS.token, 10);
  // the hour window: one expiry per key, set on the first increment, one hour long
  assert.deepEqual(kv.expiries.filter(([k]) => k.includes(':token:')), [[`rl:apply:token:abc123:${Math.floor(NOW / 3600000)}`, 3600]]);
  // a different token in the same hour is not affected
  assert.equal((await checkSubmitLimits(kv, { token: 'other', ip: '2.2.2.2', now: NOW })).ok, true);
  // the next hour starts a fresh count
  assert.equal((await checkSubmitLimits(kv, { token: 'abc123', ip: '1.1.1.1', now: NOW + 3600000 })).ok, true);
});

test('per IP: thirty submissions an hour pass across tokens, the thirty first returns 429', async () => {
  const kv = mockKv();
  for (let i = 1; i <= 30; i++) { const r = await checkSubmitLimits(kv, { token: `t${i}`, ip: '9.9.9.9', now: NOW }); assert.equal(r.ok, true, `submission ${i}`); }
  const next = await checkSubmitLimits(kv, { token: 't31', ip: '9.9.9.9', now: NOW });
  assert.deepEqual([next.ok, next.status, next.kind, next.message], [false, 429, 'ip', MESSAGES.ip]);
  assert.equal(LIMITS.ip, 30);
  // KV down: the limiter fails open
  assert.equal((await checkSubmitLimits(mockKv({ down: true }), { token: 'x', ip: '9.9.9.9', now: NOW })).ok, true);
});
