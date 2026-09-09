// The closing pass (docs/audit-2026-09-07.md items 18, 19, 24, 27, 28): behaviour over the real
// functions and handlers with fakes; one grep over every file that builds an email body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const res = () => { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const memLimiter = (start = 0) => { const c = {}; return { incr: async (k) => { c[k] = (c[k] || start) + 1; return c[k]; }, expire: async () => {}, c }; };

test('18: the short link limiter by IP runs before the KV read; five and seven character codes both resolve', async () => {
  const { resolveShortCode, newShortCode, SHORT_LINK_IP_LIMIT } = await import('../lib/shortLink.js');
  const { checkSubmitLimits } = await import('../lib/rateLimit.js');
  const token = 'b'.repeat(20);
  const reads = []; const kvGet = async (k) => { reads.push(k); return { 'short:ABCDE': token, 'short:ABCDEFG': token }[k] || null; };
  const limiter = memLimiter();
  assert.deepEqual(await resolveShortCode('abcde', { kvGet, limiter, checkLimits: checkSubmitLimits, ip: '203.0.113.7' }), { redirect: `/apply/${token}` }, 'a five character code from before');
  assert.deepEqual(await resolveShortCode('ABCDEFG', { kvGet, limiter, checkLimits: checkSubmitLimits, ip: '203.0.113.7' }), { redirect: `/apply/${token}` }, 'a seven character code');
  assert.equal(newShortCode().length, 7);
  assert.equal(SHORT_LINK_IP_LIMIT, 60);
  assert.ok(Object.keys(limiter.c).every((k) => k.startsWith('rl:short:ip:')), `its own scope: ${Object.keys(limiter.c)}`);
  const full = memLimiter(60);
  const r = await resolveShortCode('ABCDE', { kvGet, limiter: full, checkLimits: checkSubmitLimits, ip: '203.0.113.7' });
  assert.match(r.limited, /Too many link opens/); assert.equal(reads.length, 2, 'the sixty first open never reads KV');
  assert.deepEqual(await resolveShortCode('DEMO1', { kvGet, limiter: full, checkLimits: checkSubmitLimits, ip: 'x' }), { redirect: '/apply/demo0000000000000001', sandbox: true }, 'sandbox first, before the limiter');
  assert.deepEqual(await resolveShortCode('DEMO001', { kvGet, limiter: full, checkLimits: checkSubmitLimits, ip: 'x' }), { redirect: '/apply/demo0000000000000001', sandbox: true });
  assert.match((await resolveShortCode('ZZZZZ', { kvGet, limiter: memLimiter(), checkLimits: checkSubmitLimits, ip: 'x' })).invalid, /expired or is no longer active/);
  assert.match((await resolveShortCode('ABCD', { kvGet })).invalid, /does not look right/);
  assert.equal(reads.length, 3);
});

test('19: no em or en dash, as a character or an entity, in any file under lib and pages that builds an email body', () => {
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(new URL(dir, root))) { const p = `${dir}${f}`; const st = statSync(new URL(p, root)); if (st.isDirectory()) walk(`${p}/`); else if (/\.js$/.test(f)) files.push(p); } };
  walk('lib/'); walk('pages/');
  const builders = files.filter((p) => /resend\.emails\.send|<html|\bhtml:/.test(read(p)));
  assert.ok(builders.length >= 10, `email builders found: ${builders.length}`);
  for (const p of builders) { const s = read(p); assert.equal(/[—–]|&mdash;|&ndash;/.test(s), false, `${p} carries a dash`); }
  const send = read('pages/api/send.js');
  assert.match(send, /Apply in seconds: open your profile/); assert.match(send, /fresh link, no password needed/); assert.match(send, /\nThe Rentletter desk\n/); assert.match(send, /Ontario and BC · Not legal advice/);
  assert.match(read('lib/tenantEmails.js'), /ignore this email; nothing changes/);
});

test('20: the request email no longer says documents verify credit', () => {
  const s = read('pages/api/applicants/request-documents.js');
  assert.match(s, /read to match income and employer to the application; a credit report is never scored/);
  assert.doesNotMatch(s, /verify income, employment, and credit/);
});

test('24: age_confirmed is a column; the read falls back to the scorecard key only while the column is absent', async () => {
  const { kvAppToRow, ageConfirmedOf, OPTIONAL_COLUMNS } = await import('../lib/applicationMap.js');
  const { rowToForm } = await import('../lib/pipelinePrefill.js');
  const row = kvAppToRow({ applicationNumber: 'RL-1', tenant: { fullName: 'A', ageConfirmed: true }, scorecard: { overall: 4 } });
  assert.equal(row.age_confirmed, true); assert.equal(row.scorecard, null, 'the flag is no longer written into scorecard');
  assert.equal(kvAppToRow({ applicationNumber: 'RL-2', tenant: { fullName: 'B' } }).age_confirmed, false);
  assert.ok(OPTIONAL_COLUMNS.includes('age_confirmed'), 'the write retries without it while the column is absent');
  assert.equal(ageConfirmedOf({ id: 'A1', age_confirmed: true, scorecard: { ageConfirmed: false } }), true, 'the column wins');
  assert.equal(ageConfirmedOf({ id: 'A1', age_confirmed: false, scorecard: { ageConfirmed: true } }), false, 'the column wins');
  assert.equal(ageConfirmedOf({ id: 'A1', scorecard: { ageConfirmed: true } }), true, 'column absent: the scorecard key');
  assert.equal(ageConfirmedOf({ id: 'A1', scorecard: { ageConfirmed: false } }), false, 'column absent: the scorecard key');
  assert.equal(ageConfirmedOf({ id: 'A1', age_confirmed: null }), true, 'a stored row from before the flag was accepted under the same check');
  assert.equal(ageConfirmedOf({}), false);
  assert.equal(rowToForm({ id: 'A1', full_name: 'A', age_confirmed: true }).ageConfirmed, true);
  assert.equal(rowToForm({ id: 'A1', full_name: 'A', age_confirmed: false }).ageConfirmed, false);
  assert.equal(rowToForm({ id: 'A1', full_name: 'A', scorecard: { ageConfirmed: true } }).ageConfirmed, true);
  // the write path: the column is retried away when the table lacks it (the probe pattern)
  const { upsertApplication } = await import('../lib/supabaseBridge.js');
  const admin = fakeSupabase({ applications: [] }, { absentColumns: ['age_confirmed'] });
  const id = await upsertApplication(admin, { applicationNumber: 'RL-3', tenant: { fullName: 'C', ageConfirmed: true } });
  assert.ok(id); const { data } = await admin.from('applications').select('*').eq('application_number', 'RL-3').maybeSingle();
  assert.equal('age_confirmed' in data, false, 'written without the column'); assert.equal(data.scorecard, null);
  const sql = read('db/age-confirmed.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS age_confirmed boolean/); assert.match(sql, /scorecard->>'ageConfirmed' = 'true'/); assert.doesNotMatch(sql, /[—–]/);
});

test('27: the dead files are gone, nothing imports them, the scorecard is written null, and the homepage asks no age', async () => {
  for (const p of ['components/dashboard/ProfileEditorModal.js', 'components/film/ProductFilmLazy.js', 'pages/api/applicants/clear-analysis.js', 'pages/api/pass/create.js', 'pages/api/pass/verify.js', 'pages/api/promos/validate.js', 'lib/scoring.js', 'lib/scorecard.js']) assert.equal(existsSync(new URL(p, root)), false, p);
  assert.match(read('pages/join/[code].js'), /validatePromoCode/, 'join validates through lib/promos directly, never the deleted route');
  for (const p of ['pages/api/generate.js', 'lib/tenantProfile.js']) { const s = read(p); assert.doesNotMatch(s, /calculateScorecard/); assert.match(s, /const scorecard = null;/); }
  const home = read('pages/index.js');
  assert.doesNotMatch(home, /label="Age"/); assert.doesNotMatch(home, /label="Date of birth"/); assert.doesNotMatch(home, /age: '', dateOfBirth: ''/);
  const { toApplication } = await import('../lib/tenantProfile.js').catch(() => ({}));
  void toApplication;
  const { withLiveScore } = await import('../lib/deriveScorecard.js');
  assert.equal('scorecard' in withLiveScore({ application: { annual_income: 60000 } }, { monthly_rent: 2000 }).application, false);
});

test('28: isSandboxToken answers first, before the limiter and the clients, on every listed route', async () => {
  const { isSandboxToken } = await import('../lib/features.js');
  for (const t of ['demo-expired', 'demo-ref-open', 'demo0000000000000001', 'DEMO-demo-carlaw', 'DEMO1']) assert.equal(isSandboxToken(t), true, t);
  for (const t of ['a'.repeat(20), 'RL-2026-1A2B-3C4D', '', null, 'xdemo']) assert.equal(isSandboxToken(t), false, String(t));
  const throwing = { incr: async () => { throw new Error('limiter must not run'); }, expire: async () => {} };
  void throwing;
  // resolve: the sandbox token answers with no client at all
  const { createHandler } = await import('../pages/api/invite/resolve.js');
  const h = createHandler({ getAdmin: () => { throw new Error('client must not be built'); }, record: async () => { throw new Error('KV must not be read'); } });
  let r = res(); await h({ method: 'GET', query: { token: 'demo0000000000000001' } }, r); assert.equal(r.code, 200); assert.equal(r.body.realtorName, 'Sarah Chen');
  r = res(); await h({ method: 'GET', query: { token: 'demo0000000000000009' } }, r); assert.equal(r.body.rented, true);
  // the source order on every listed file: the sandbox check comes before checkSubmitLimits and before any client
  for (const p of ['pages/api/pipeline/answer.js', 'pages/api/pipeline/consent.js', 'pages/api/references/answer.js', 'pages/api/invite/resolve.js', 'pages/api/applications/mirror.js', 'pages/api/report/answer.js', 'pages/api/report/pdf.js', 'pages/keep/[token].js', 'pages/ref/[token].js', 'pages/r/[token].js']) {
    const s = read(p); const bodyAt = Math.max(s.indexOf('async function handler'), s.indexOf('async function getServerSideProps')); assert.ok(bodyAt > 0, `${p} has a handler`);
    const body = s.slice(bodyAt); const at = body.indexOf('isSandboxToken(');
    assert.ok(at > 0, `${p} asks isSandboxToken`);
    const lim = body.indexOf('checkSubmitLimits(');
    if (lim > 0) assert.ok(at < lim, `${p}: sandbox before the limiter`);
    const client = Math.min(...['getSupabaseAdminClient()', 'kvGet(', 'kvGetJson(', 'snapshotByToken(', 'record(', 'readConsent('].map((k) => { const i = body.indexOf(k); return i < 0 ? Infinity : i; }));
    if (client !== Infinity) assert.ok(at < client, `${p}: sandbox before any client call`);
    assert.doesNotMatch(body, /\/\^demo|\/\^DEMO-/, `${p}: no private demo regex left`);
  }
  const adapter = read('lib/demoAdapter.js');
  assert.match(adapter, /sandbox=fresh/); assert.doesNotMatch(adapter, /profile=fresh/); assert.match(adapter, /state\.freshApplied = true/);
});
