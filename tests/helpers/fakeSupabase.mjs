// The older tests' fakes, now thin wrappers over tests/helpers/fakeStack.mjs so one query builder
// and one KV stand in serve every test. fakeSupabase(tables, opts) is fakeDb; fakeKv(values)
// installs the KV fake fetch and returns { calls, values, counters, expires, lists, restore }.
export { LATENCY, fakeDb as fakeSupabase } from './fakeStack.mjs';
import { fakeKvStore } from './fakeStack.mjs';
export function fakeKv(values = {}) {
  const store = fakeKvStore();
  for (const [k, v] of Object.entries(values)) store.values[k] = v;
  const restore = store.install();
  const lists = new Proxy(store.lists, { get: (t, k) => t[k] });
  return { calls: store.calls, values: store.values, counters: store.values, expires: store.expires, lists, store, restore };
}
export { bigFixture } from './bigFixture.mjs';
