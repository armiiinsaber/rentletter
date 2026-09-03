// lib/queryTrace.js  SERVER ONLY.
// A query counter for the dashboard load, active only when RL_QUERY_TRACE is set. Every
// Supabase query (each .from(...) chain that is awaited) and every KV call is recorded with its
// start and end; the summary gives the counts, the wall time and the sequential depth: the
// longest chain of calls where each began after the previous one ended, which is the number of
// round trips the load could not overlap. Off by default: one boolean check per call.
export const traceEnabled = () => !!process.env.RL_QUERY_TRACE;

let current = null;
export function startTrace(label) {
  current = { label, t0: Date.now(), calls: [] };
  return current;
}
// note(kind, what) -> done(). kind: 'supabase' | 'kv'.
export function note(kind, what) {
  if (!current) return () => {};
  const c = { kind, what: String(what || ''), start: Date.now(), end: null };
  current.calls.push(c);
  return () => { c.end = Date.now(); };
}
export function summarize(trace = current) {
  if (!trace) return null;
  const calls = trace.calls.map((c) => ({ ...c, end: c.end == null ? Date.now() : c.end })).sort((a, b) => a.start - b.start);
  // Longest chain of calls that could not have overlapped: dynamic programming over start order.
  const best = new Array(calls.length).fill(1);
  for (let i = 0; i < calls.length; i++) for (let j = 0; j < i; j++) if (calls[j].end <= calls[i].start) best[i] = Math.max(best[i], best[j] + 1);
  const supabase = calls.filter((c) => c.kind === 'supabase').length;
  const kv = calls.filter((c) => c.kind === 'kv').length;
  const byWhat = {};
  for (const c of calls) byWhat[`${c.kind}:${c.what}`] = (byWhat[`${c.kind}:${c.what}`] || 0) + 1;
  return { label: trace.label, supabase, kv, depth: calls.length ? Math.max(...best) : 0, wallMs: Date.now() - trace.t0, byWhat };
}
export function endTrace() {
  const s = summarize(current);
  if (s) console.log(`[query-trace] ${s.label}: supabase=${s.supabase} kv=${s.kv} depth=${s.depth} wall=${s.wallMs}ms ${JSON.stringify(s.byWhat)}`);
  current = null;
  return s;
}

// Wrap a Supabase client so every awaited .from(table) chain is counted. Every builder method
// passes straight through; only `then` is timed. Returns the client itself when tracing is off.
export function tracedClient(client, label) {
  if (!traceEnabled() || !client || typeof client.from !== 'function') return client;
  const wrapBuilder = (builder, what) => new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        if (typeof target.then !== 'function') return undefined;
        return (onOk, onErr) => { const done = note('supabase', what); return target.then((v) => { done(); return v; }, (e) => { done(); throw e; }).then(onOk, onErr); };
      }
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      return (...args) => { const out = v.apply(target, args); return out && typeof out === 'object' && typeof out.then === 'function' ? wrapBuilder(out, what) : out; };
    },
  });
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') return (table) => wrapBuilder(target.from(table), `${label}.${table}`);
      return Reflect.get(target, prop, receiver);
    },
  });
}
