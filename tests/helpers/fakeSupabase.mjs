// An in memory stand in for the two Supabase clients and Upstash KV, enough for the dashboard
// load: from(table).select/eq/in/not/order/limit/maybeSingle/single/update(applies the payload)/insert/upsert, embedded
// `application:applications(*)`, a fake fetch for the KV REST calls. Every call takes LATENCY
// ms so sequential chains show up in the trace as depth and wall time.
export const LATENCY = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fakeSupabase(tables, { absentColumns = [] } = {}) {
  const db = tables; const deletions = [];
  const updates = [];
  const from = (table) => {
    const q = { table, select: '*', filters: [], order: null, limit: null, single: false, op: 'select', payload: null };
    const run = async () => {
      await sleep(LATENCY);
      const rows = db[table];
      if (!rows) return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } };
      const wanted = String(q.select).split(',').map((s) => s.trim()).filter(Boolean);
      const missing = wanted.find((c) => absentColumns.includes(c));
      if (missing) return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } };
      if (q.op === 'update') { const hit = rows.filter((r) => q.filters.every(([op, k, v]) => (op === 'eq' ? String(r[k]) === String(v) : op === 'in' ? (v || []).map(String).includes(String(r[k])) : true))); hit.forEach((r) => Object.assign(r, q.payload)); updates.push({ table, payload: q.payload, count: hit.length }); return { data: q.single ? {} : [], error: null }; }
      if (q.op === 'insert') { const added = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r) => ({ id: `${table}-${rows.length + 1}`, ...r })); rows.push(...added); return { data: q.single ? added[0] : added, error: null }; }
      if (q.op === 'upsert') return { data: q.single ? {} : [], error: null };
      if (q.op === 'delete') { const keep = rows.filter((r) => !q.filters.every(([op, k, v]) => (op === 'eq' ? String(r[k]) === String(v) : op === 'in' ? (v || []).map(String).includes(String(r[k])) : true))); const n = rows.length - keep.length; db[table] = keep; deletions.push({ table, n }); return { data: null, error: null, count: n }; }
      let out = rows.filter((r) => q.filters.every(([op, k, v]) => (op === 'eq' ? String(r[k]) === String(v) : op === 'in' ? (v || []).map(String).includes(String(r[k])) : op === 'notnull' ? r[k] != null : op === 'isnull' ? r[k] == null : op === 'lt' ? String(r[k]) < String(v) : true)));
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
      upsert(p) { q.op = 'upsert'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      eq(k, v) { q.filters.push(['eq', k, v]); return b; },
      in(k, v) { q.filters.push(['in', k, v]); return b; },
      not(k, op, v) { if (op === 'is' && v === null) q.filters.push(['notnull', k]); return b; },
      is(k, v) { if (v === null) q.filters.push(['isnull', k]); return b; },
      lt(k, v) { q.filters.push(['lt', k, v]); return b; },
      order(col, o = {}) { q.order = { col, asc: o.ascending !== false }; return b; },
      limit(n) { q.limit = n; return b; },
      maybeSingle() { q.single = true; return b; },
      single() { q.single = true; return b; },
      then(ok, err) { return run().then(ok, err); },
    };
    return b;
  };
  return { from, deletions, updates, auth: { getUser: async () => ({ data: { user: null } }) } };
}

// KV: a map of key -> JSON value. Installs a fake global fetch for the KV base URL and returns
// a restore function plus the call log.
export function fakeKv(values = {}) {
  const base = 'http://kv.fake';
  process.env.KV_REST_API_URL = base; process.env.KV_REST_API_TOKEN = 'fake';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!u.startsWith(base)) return realFetch(url, init);
    await sleep(LATENCY);
    const path = u.slice(base.length);
    calls.push(path.split('/')[1]);
    const json = (result) => ({ ok: true, json: async () => ({ result }) });
    if (path.startsWith('/get/')) { const v = values[decodeURIComponent(path.slice(5))]; return json(v == null ? null : JSON.stringify(v)); }
    if (path.startsWith('/mget/')) { const keys = path.slice(6).split('/').map(decodeURIComponent); return json(keys.map((k) => (values[k] == null ? null : JSON.stringify(values[k])))); }
    if (path.startsWith('/lrange/')) return json([]);
    return json('OK');
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; } };
}

// The measurement fixture: N listings for one realtor, K applicants each. Every third applicant
// has a document report, every third a document request pointer in KV, one per listing is set
// aside (the first). Applications carry owner_token and cover_letter so the strip is exercised.
export function bigFixture({ listings = 12, perListing = 3, profileId = 'p-1' } = {}) {
  const day = 86400000; const base = Date.parse('2026-09-01T12:00:00Z');
  const t = (d) => new Date(base - d * day).toISOString();
  const L = [], J = [], A = [], docs = [], kv = {};
  let n = 0;
  for (let i = 0; i < listings; i++) {
    const lid = `L${i + 1}`;
    L.push({ id: lid, profile_id: profileId, name: `${100 + i} Main St, Unit ${i + 1}`, address: `${100 + i} Main St, Toronto`, monthly_rent: 2000 + i * 100, landlord_email: i % 2 ? `ll${i}@example.com` : null, landlord_name: i % 2 ? `Landlord ${i}` : null, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 60000, pref_min_years_at_job: 1, pref_requires_landlord_reference: false, pref_requires_employer_verification: false, created_at: t(30 - i) });
    for (let k = 0; k < perListing; k++) {
      n++;
      const aid = `A${n}`, jid = `J${n}`;
      A.push({ id: aid, application_number: `RL-2026-${String(n).padStart(4, '0')}`, full_name: `Applicant ${n}`, email: `a${n}@example.com`, annual_income: 60000 + (n % 5) * 9000, years_at_job: String(1 + (n % 4)), employer: `Employer ${n}`, job_title: 'Analyst', prev_landlord_name: n % 2 ? 'L. Wong' : null, years_at_previous: String(n % 3), references: n % 3 ? [{ name: 'r' }] : [], rent_to_income_ratio: 30, owner_token: `ot_${n}_secret`, cover_letter: 'private', created_at: t(10 - (n % 10)) });
      const report = n % 3 === 0 ? { active: { analyzedAt: t(2), nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', found: '$90,000' }, { field: 'Employer', status: 'match' }] }, archived: [] } : null;
      J.push({ id: jid, listing_id: lid, application_id: aid, decision_status: k === 0 ? 'reject' : 'none', decision_priority: null, decision_notes: '', decision_reason_code: k === 0 ? 'income_below_min' : null, decision_changed_at: k === 0 ? t(1) : null, added_via: 'invite', created_at: t(10 - (n % 10)), doc_verifications: report, ai_insight: null, reviewed_at: t(3), withdrawn_at: null, confirmations: {}, last_sent_at: null, docs_submitted_at: report ? t(2) : null, docs_verified: !!report });
      if (n % 3 === 2) kv[`docreq-app:${jid}`] = { status: 'requested', requestedAt: t(4), receivedAt: null };
      if (report) docs.push({ id: `D${n}`, listing_applicant_id: jid, profile_id: profileId, storage_path: `${profileId}/${jid}/x.pdf`, kind: 'pay stub', mime: 'application/pdf', bytes: 1000, uploaded_by: 'realtor', uploaded_at: t(2), expires_at: t(-12), deleted_at: null, deleted_by: null, opened_count: 0, last_opened_at: null });
    }
  }
  const tables = { listings: L, listing_applicants: J, applications: A, applicant_documents: docs, profiles: [{ id: profileId, full_name: 'Test Realtor', notifications_last_seen: t(5) }], events: [{ id: 'e1', profile_id: profileId, created_at: t(1) }] };
  return { tables, kv, listings: L };
}
