// tests/helpers/fakeStack.mjs  The one fake stack the route level tests run on. Nothing here
// touches the network. It behaves like the real clients as far as the code under test can tell:
//
//   fakeDb(tables, { absentColumns })   the Supabase query builder the code uses: from, select
//       (column lists, embedded application:applications(*)), eq, in, is, not, lt, gt, gte, lte,
//       match, order, limit, maybeSingle, single, insert, upsert, update, delete, rpc, plus
//       storage.from(bucket) with upload, remove, list and createSignedUrl. An unknown table is
//       42P01, an absent column is 42703, as PostgREST answers.
//   fakeKvStore({ now })                Upstash KV over a fake fetch with REAL TTL semantics: set,
//       get (null once expired), expire, ttl (remaining seconds), del, incr, mget, lpush, ltrim,
//       lrange, sadd, srem, smembers. clock.advance(seconds) moves time.
//   fakeResend()                        records every send.
//   fakeAnthropic(extractionFor)        answers the document analysis with fixed extracted fields.
//   installFakeStack({ ... })           wires them all behind the real modules through
//       tests/helpers/fakeStackHook.mjs (register it before importing anything under pages).
//
// tests/helpers/fakeSupabase.mjs re exports fakeDb as fakeSupabase and fakeKvStore's fetch as
// fakeKv, so the older tests keep running on the same code.
export const LATENCY = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the database ────────────────────────────────────────────────────────────────────────────────
const cmp = (op, a, b) => {
  switch (op) {
    case 'eq': return String(a) === String(b);
    case 'in': return (b || []).map(String).includes(String(a));
    case 'isnull': return a == null;
    case 'notnull': return a != null;
    case 'lt': return String(a) < String(b);
    case 'gt': return String(a) > String(b);
    case 'lte': return String(a) <= String(b);
    case 'gte': return String(a) >= String(b);
    default: return true;
  }
};
const missingColumnError = (table, col) => ({ code: '42703', message: `column ${table}.${col} does not exist` });

export function fakeDb(tables, { absentColumns = [], onQuery = null, failWhen = null } = {}) {
  const db = tables; const deletions = []; const updates = []; const inserts = []; const queries = [];
  const api = { failWhen }; // api.failWhen = (q) => error | null lets a test make a query fail
  const from = (table) => {
    const q = { table, select: '*', filters: [], order: null, limit: null, single: false, op: 'select', payload: null, onConflict: '' };
    const run = async () => {
      await sleep(LATENCY);
      queries.push({ table, op: q.op, select: q.select, filters: q.filters.map((f) => f.slice(0, 2)) });
      if (onQuery) onQuery(q);
      if (api.failWhen) { const err = api.failWhen(q); if (err) return { data: null, error: err }; }
      const rows = db[table];
      if (!rows) return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } };
      const wanted = String(q.select).replace(/\w+:\w+\([^)]*\)/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      const missing = wanted.find((c) => absentColumns.includes(c));
      if (missing) return { data: null, error: missingColumnError(table, missing) };
      if ((q.op === 'update' || q.op === 'insert' || q.op === 'upsert') && q.payload) {
        const bad = Object.keys(Array.isArray(q.payload) ? q.payload[0] || {} : q.payload).find((c) => absentColumns.includes(c));
        if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${table}' in the schema cache` } };
      }
      const matches = (r) => q.filters.every(([op, k, v]) => cmp(op, r[k], v));
      if (q.op === 'update') { const hit = rows.filter(matches); hit.forEach((r) => Object.assign(r, q.payload)); updates.push({ table, n: hit.length, payload: q.payload }); const out = hit.map((r) => ({ ...r })); return { data: q.single ? out[0] || null : out, error: null }; }
      if (q.op === 'insert') { const added = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r) => ({ id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...r })); rows.push(...added); inserts.push({ table, rows: added }); return { data: q.single ? added[0] : added, error: null }; }
      if (q.op === 'upsert') {
        const cols = q.onConflict.split(',').map((c) => c.trim()).filter(Boolean); const list = Array.isArray(q.payload) ? q.payload : [q.payload];
        const out = list.map((p) => { const hit = cols.length ? rows.find((r) => cols.every((c) => String(r[c]) === String(p[c]))) : null; if (hit) { Object.assign(hit, p); return { ...hit }; } const row = { id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...p }; rows.push(row); inserts.push({ table, rows: [row] }); return { ...row }; });
        return { data: q.single ? out[0] || null : out, error: null };
      }
      if (q.op === 'delete') { const keep = rows.filter((r) => !matches(r)); const n = rows.length - keep.length; db[table] = keep; deletions.push({ table, n }); return { data: null, error: null }; }
      let out = rows.filter(matches);
      if (q.order) out = [...out].sort((a, b) => (String(a[q.order.col] || '') < String(b[q.order.col] || '') ? -1 : 1) * (q.order.asc ? 1 : -1));
      if (q.limit) out = out.slice(0, q.limit);
      out = out.map((r) => ({ ...r }));
      if (/application:applications\(\*\)/.test(q.select)) out.forEach((r) => { r.application = (db.applications || []).find((a) => String(a.id) === String(r.application_id)) || null; });
      if (q.single) return { data: out[0] || null, error: null };
      return { data: out, error: null };
    };
    const b = {
      select(cols = '*') { if (q.op === 'select') q.select = cols; return b; },
      update(p) { q.op = 'update'; q.payload = p; return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      upsert(p, opts) { q.op = 'upsert'; q.payload = p; q.onConflict = String(opts?.onConflict || ''); return b; },
      delete() { q.op = 'delete'; return b; },
      eq(k, v) { q.filters.push(['eq', k, v]); return b; },
      in(k, v) { q.filters.push(['in', k, v]); return b; },
      not(k, op, v) { if (op === 'is' && v === null) q.filters.push(['notnull', k]); return b; },
      is(k, v) { if (v === null) q.filters.push(['isnull', k]); return b; },
      lt(k, v) { q.filters.push(['lt', k, v]); return b; },
      gt(k, v) { q.filters.push(['gt', k, v]); return b; },
      lte(k, v) { q.filters.push(['lte', k, v]); return b; },
      gte(k, v) { q.filters.push(['gte', k, v]); return b; },
      match(obj) { for (const [k, v] of Object.entries(obj || {})) q.filters.push(['eq', k, v]); return b; },
      order(col, o = {}) { q.order = { col, asc: o.ascending !== false }; return b; },
      limit(n) { q.limit = n; return b; },
      maybeSingle() { q.single = true; return b; },
      single() { q.single = true; return b; },
      then(ok, err) { return run().then(ok, err); },
    };
    return b;
  };
  // Storage: objects live in memory by bucket and path.
  const objects = {}; const storageCalls = [];
  const storage = { from: (bucket) => ({
    upload: async (path, bytes, opts) => { storageCalls.push(['upload', bucket, path]); if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return { data: null, error: { message: 'The file body must be bytes (Buffer or Uint8Array).' } }; (objects[bucket] = objects[bucket] || {})[path] = { bytes: Buffer.from(bytes), contentType: opts && opts.contentType }; return { data: { path }, error: null }; },
    remove: async (paths) => { storageCalls.push(['remove', bucket, paths]); for (const p of paths || []) if (objects[bucket]) delete objects[bucket][p]; return { data: paths, error: null }; },
    list: async (prefix = '', opts = {}) => { storageCalls.push(['list', bucket, prefix]); const keys = Object.keys(objects[bucket] || {}); const pre = prefix ? `${prefix.replace(/\/$/, '')}/` : ''; const names = new Map(); for (const k of keys) { if (!k.startsWith(pre)) continue; const rest = k.slice(pre.length); const head = rest.split('/')[0]; if (!names.has(head)) names.set(head, rest.includes('/') ? { name: head, id: null } : { name: head, id: k }); } const all = [...names.values()]; const off = Number(opts.offset) || 0; const lim = Number(opts.limit) || 100; return { data: all.slice(off, off + lim), error: null }; },
    createSignedUrl: async (path, seconds) => { storageCalls.push(['sign', bucket, path]); return objects[bucket] && objects[bucket][path] ? { data: { signedUrl: `https://signed.example/${bucket}/${path}?exp=${seconds}` }, error: null } : { data: null, error: { message: 'Object not found' } }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://public.example/${bucket}/${path}` } }),
  }) };
  const rpc = async (fn, args) => { queries.push({ table: `rpc:${fn}`, op: 'rpc' }); return { data: null, error: { code: '42883', message: `function ${fn} does not exist` } }; };
  return Object.assign(api, { from, rpc, storage, deletions, updates, inserts, queries, objects, storageCalls, tables: db, auth: { getUser: async () => ({ data: { user: null } }), signOut: async () => ({ error: null }) } });
}

// ── KV with real TTL semantics ─────────────────────────────────────────────────────────────────
export function fakeKvStore({ now = Date.now() } = {}) {
  const base = 'http://kv.fake';
  const values = {}; const expiresAt = {}; const lists = {}; const sets = {}; const calls = []; const expires = {}; const counters = values;
  const clock = { now, advance(seconds) { clock.now += seconds * 1000; } };
  const alive = (k) => { if (expiresAt[k] != null && expiresAt[k] <= clock.now) { delete values[k]; delete lists[k]; delete sets[k]; delete expiresAt[k]; } return values[k] !== undefined || lists[k] !== undefined || sets[k] !== undefined; };
  const get = (k) => (alive(k) ? values[k] : undefined);
  const handle = async (path, init) => {
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    const cmd = seg[0]; const key = seg[1];
    calls.push(cmd);
    const json = (result) => ({ ok: true, status: 200, json: async () => ({ result }), text: async () => JSON.stringify({ result }) });
    switch (cmd) {
      case 'get': { const v = get(key); return json(v === undefined ? null : (typeof v === 'string' ? v : JSON.stringify(v))); }
      case 'mget': return json(seg.slice(1).map((k) => { const v = get(k); return v === undefined ? null : (typeof v === 'string' ? v : JSON.stringify(v)); }));
      case 'set': { let body = null; try { body = init && init.body != null ? JSON.parse(init.body) : (seg[2] !== undefined ? seg[2] : null); } catch (e) { body = init && init.body; } if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { /* keep */ } } values[key] = body; delete expiresAt[key]; return json('OK'); }
      case 'del': { const had = alive(key) ? 1 : 0; delete values[key]; delete lists[key]; delete sets[key]; delete expiresAt[key]; return json(had); }
      case 'incr': { const cur = alive(key) ? Number(values[key]) || 0 : 0; values[key] = cur + 1; return json(values[key]); }
      case 'expire': { const secs = Number(seg[2]); if (!alive(key)) return json(0); expiresAt[key] = clock.now + secs * 1000; expires[key] = secs; return json(1); }
      case 'ttl': { if (!alive(key)) return json(-2); if (expiresAt[key] == null) return json(-1); return json(Math.max(0, Math.round((expiresAt[key] - clock.now) / 1000))); }
      case 'lpush': { alive(key); (lists[key] = lists[key] || []).unshift(...seg.slice(2)); return json(lists[key].length); }
      case 'ltrim': { alive(key); const l = lists[key] || []; lists[key] = l.slice(Number(seg[2]), Number(seg[3]) + 1); return json('OK'); }
      case 'lrange': { alive(key); const l = lists[key] || []; const end = Number(seg[3]); return json(l.slice(Number(seg[2]), end === -1 ? undefined : end + 1)); }
      case 'sadd': { alive(key); (sets[key] = sets[key] || new Set()).add(seg[2]); return json(1); }
      case 'srem': { alive(key); if (sets[key]) sets[key].delete(seg[2]); return json(1); }
      case 'smembers': { alive(key); return json([...(sets[key] || [])]); }
      default: return json('OK');
    }
  };
  const fetchImpl = async (url, init) => { await sleep(LATENCY); const u = String(url); return handle(u.slice(base.length), init); };
  return { base, values, lists, sets, expiresAt, expires, counters, calls, clock, fetch: fetchImpl, ttl: (k) => (alive(k) ? (expiresAt[k] == null ? -1 : Math.round((expiresAt[k] - clock.now) / 1000)) : -2), get, install() { process.env.KV_REST_API_URL = base; process.env.KV_REST_API_TOKEN = 'fake'; const real = globalThis.fetch; globalThis.fetch = async (url, init) => (String(url).startsWith(base) ? fetchImpl(url, init) : real(url, init)); return () => { globalThis.fetch = real; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; }; } };
}

// ── Resend and Anthropic ────────────────────────────────────────────────────────────────────────
export function fakeResend() {
  const sent = [];
  return { sent, emails: { send: async (mail) => { sent.push(mail); return { data: { id: `email-${sent.length}` }, error: null }; } } };
}
// extractionFor(filename) -> one document object; the fake returns the STRICT JSON the prompt asks for.
export const defaultExtraction = (filename) => {
  const f = String(filename || '').toLowerCase();
  if (/letter/.test(f)) return { filename, documentType: 'employment letter', unrecognized: false, extracted: { applicantName: 'Test Person', employer: 'Northwind Sample Clinic Inc.', employmentType: 'Full-time', jobTitle: 'Clinic Coordinator', startDate: 'March 1, 2023', annualSalaryPrinted: 85000, documentDate: 'August 25, 2026' }, notes: 'Signed.' };
  if (/credit/.test(f)) return { filename, documentType: 'credit report', unrecognized: false, extracted: { applicantName: 'Test Person', creditScore: 712, scoreBand: 'Good', bureau: 'Equifax', reportDate: 'August 30, 2026' }, notes: 'Score 712.' };
  return { filename, documentType: 'pay stub', unrecognized: false, extracted: { applicantName: 'Test Person', employer: 'Northwind Sample Clinic Inc.', periodStart: 'July 1, 2026', periodEnd: 'July 15, 2026', payDate: 'July 20, 2026', grossForPeriod: 3541.67, regularRate: 40.86, hours: 86.67, payFrequency: null, documentDate: 'July 20, 2026' }, notes: 'No frequency word printed.' };
};
export function fakeAnthropic(extractionFor = defaultExtraction) {
  const calls = [];
  return { calls, messages: { create: async (body) => {
    calls.push(body);
    const content = (body.messages && body.messages[0] && body.messages[0].content) || [];
    const names = content.filter((c) => c.type === 'text' && /filename: "/.test(c.text)).map((c) => (c.text.match(/filename: "([^"]+)"/) || [])[1]);
    const documents = names.map((n) => extractionFor(n));
    return { content: [{ type: 'text', text: JSON.stringify({ documents, overallSummary: `${documents.length} document(s) read.`, confidence: 'high' }) }] };
  } } };
}

// ── the stack ───────────────────────────────────────────────────────────────────────────────────
// installFakeStack({ tables, absentColumns, user, kv, extraction, env }) -> stack
//   The real modules (lib/supabase/server.js, lib/supabase/admin.js, resend, @anthropic-ai/sdk)
//   are resolved to fakes by tests/helpers/fakeStackHook.mjs; those fakes read globalThis.__rlStack
//   at call time, so a test can install a fresh stack per case. The RLS client sees only the
//   signed in realtor's rows for listings and profiles (the policies the reference SQL names).
export function installFakeStack({ tables = {}, absentColumns = [], user = null, kv = null, extraction = defaultExtraction, env = {} } = {}) {
  const db = fakeDb(tables, { absentColumns });
  const rls = rlsView(db, user);
  const store = kv || fakeKvStore();
  const restoreKv = store.install();
  const resend = fakeResend();
  const anthropic = fakeAnthropic(extraction);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-fake';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-fake';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  process.env.RESEND_API_KEY = 're_fake';
  process.env.SEND_SECRET = 'send-secret-fake';
  for (const [k, v] of Object.entries(env)) { if (v == null) delete process.env[k]; else process.env[k] = String(v); }
  const stack = { db, rls, kv: store, resend, anthropic, user, cookies: {}, restore() { restoreKv(); if (globalThis.__rlStack === stack) delete globalThis.__rlStack; } };
  globalThis.__rlStack = stack;
  return stack;
}

// The RLS client: the same tables, but listings and profiles are filtered to the signed in
// realtor (listings_all_own, profiles_select_own); listing_applicants through the listing.
function rlsView(db, user) {
  const own = (table, rows) => {
    if (!user) return [];
    if (table === 'profiles') return rows.filter((r) => String(r.id) === String(user.id));
    if (table === 'listings') return rows.filter((r) => String(r.profile_id) === String(user.id));
    if (table === 'listing_applicants') { const mine = new Set((db.tables.listings || []).filter((l) => String(l.profile_id) === String(user.id)).map((l) => String(l.id))); return rows.filter((r) => mine.has(String(r.listing_id))); }
    return rows;
  };
  const view = {
    from(table) {
      const real = db.tables[table];
      if (!real) return db.from(table);
      // A scoped copy for reads; writes go through the real table but only on the realtor's rows.
      const scoped = fakeDb({ ...db.tables, [table]: own(table, real) }, { onQuery: (q) => db.queries.push({ table: q.table, op: q.op, select: q.select, rls: true }), failWhen: (q) => (db.failWhen ? db.failWhen(q) : null) });
      const b = scoped.from(table);
      const proxy = new Proxy(b, { get(t, p, r) { if (p === 'update' || p === 'insert' || p === 'upsert' || p === 'delete') return (...a) => { const w = db.from(table)[p](...a); return user && table === 'listings' && p !== 'insert' ? w.eq('profile_id', user.id) : (user && table === 'profiles' && p !== 'insert' ? w.eq('id', user.id) : w); }; return Reflect.get(t, p, r); } });
      return proxy;
    },
    rpc: db.rpc, storage: db.storage,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'Auth session missing' } }), signOut: async () => ({ error: null }) },
  };
  return view;
}

// A request and response pair the way Next hands them to an API route.
export function fakeReq({ method = 'POST', body = null, query = {}, headers = {}, cookies = {}, ip = '203.0.113.10' } = {}) {
  return { method, body, query, headers: { 'x-forwarded-for': ip, ...headers }, cookies, socket: { remoteAddress: ip } };
}
export function fakeRes() {
  const r = { code: 200, body: null, headers: {}, redirected: null, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.send = (b) => { r.body = b; r.ended = true; return r; };
  r.end = (b) => { if (b !== undefined) r.body = b; r.ended = true; return r; };
  r.redirect = (c, u) => { r.code = c; r.redirected = u; r.ended = true; return r; };
  return r;
}
// A getServerSideProps context.
export const fakeCtx = ({ params = {}, query = {}, cookies = {}, ip = '203.0.113.10' } = {}) => ({ params, query, req: { cookies, headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } }, res: fakeRes() });

// Walk any value and collect the paths where a key is found (for "never a raw owner_token").
export function findKeys(value, keys, path = '$', out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) { value.forEach((v, i) => findKeys(v, keys, `${path}[${i}]`, out)); return out; }
  for (const [k, v] of Object.entries(value)) { if (keys.includes(k) && v != null) out.push(`${path}.${k}`); findKeys(v, keys, `${path}.${k}`, out); }
  return out;
}
export const countKvCalls = (stack, cmd) => stack.kv.calls.filter((c) => (cmd ? c === cmd : true)).length;
