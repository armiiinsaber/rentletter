// The tenant's vault (lib/tenantVault.js, lib/tenantVaultRules.js, pages/api/tenant/vault.js,
// pages/api/cron/expire-vault.js, db/018-profile-vault.sql; docs/design/profile-and-circle.md
// Phases 3 and 4), over the fake stack: the real routes, the real store, a fake database, bucket,
// key value store and document reader.
//   1. A realtor reads the vault only through the one share reader (lib/profileShareStore.js,
//      db/019): nothing else on the realtor side names the vault, the vault route knows no realtor
//      session, a signed link is made in exactly one function behind an approved share, and the
//      realtor's own document routes answer nothing for a vault file.
//   2. A document is stored only after it is read, with the facts read from it, each from the
//      closed list; the tenant must have proved the address and agreed first.
//   3. A deleted document is gone, file included; the facts read from it stay until removed.
//   4. The expiry job removes exactly what is due and nothing else, and writes an event for each.
//   5. The kill switch stops new storage and leaves existing documents untouched.
//   6. A credit report is never stored in the profile; nor is a file that cannot be recognised.
//   7. Renewal: 90 days from the day, never for an ID.
//   8. Twelve months idle: the stored documents and the facts read from them go; unknown is not idle.
//   9. Before db/018 has run the page is told documents are not available and nothing is read.
//  10. Every fact on the page shows its source and its date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeReq, fakeRes, defaultExtraction } = await import('../helpers/fakeStack.mjs');
const S = await import('../../lib/tenantProfileStore.js');
const V = await import('../../lib/tenantVault.js');
const R = await import('../../lib/tenantVaultRules.js');
const { PROFILE_CHECK_KINDS } = await import('../../lib/profileFacts.js');
const vaultRoute = (await import('../../pages/api/tenant/vault.js')).default;
const cronRoute = (await import('../../pages/api/cron/expire-vault.js')).default;

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else if (/\.js$/.test(f)) out.push(rel); } return out; };
const DAY = 86400000;
const PDF = Buffer.from('%PDF-1.4 sample bytes for the vault test').toString('base64');
const FACTS = { fullName: 'Maya Okafor', email: 'maya@example.com', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000', yearsAtJob: '3' };
const extraction = (name) => (/^id/i.test(name) ? { filename: name, documentType: 'government ID', unrecognized: false, extracted: { applicantName: (String(name).match(/\(([^)]+)\)/) || [])[1] || 'Test Person' }, notes: '' }
  : /mystery/i.test(name) ? { filename: name, documentType: 'Other / Unrecognized', unrecognized: true, extracted: {}, notes: '' } : defaultExtraction(name));

// A stack with the vault's tables, one tenant signed in (address proved by the session).
async function setup({ tables = true, env = {}, consent = true } = {}) {
  const stack = installFakeStack({ tables: { tenant_profiles: [], ...(tables ? { tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [] } : {}), applicant_documents: [], listing_applicants: [], listings: [], profiles: [], events: [] }, extraction, env: { TENANT_VAULT_ENABLED: null, CRON_SECRET: 'cron-secret', ...env } });
  const p = S.blankProfile('maya@example.com'); p.facts = { ...FACTS }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z';
  await S.saveProfile(p);
  const token = await S.createSession(p.id);
  if (consent) await S.recordVaultConsent(p.id);
  const cookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(token)}` };
  const call = async (method, body) => { const res = fakeRes(); await vaultRoute(fakeReq({ method, body, headers: cookie }), res); return res; };
  const upload = (name, type = 'application/pdf') => call('POST', { action: 'upload', file: { name, type, data: PDF } });
  const docs = () => stack.db.tables.tenant_profile_documents;
  const objects = () => Object.keys(stack.db.objects[R.VAULT_BUCKET] || {});
  return { stack, p, call, upload, docs, objects, cookie };
}

test('1. a realtor cannot read any vault document or fact, through any route', async () => {
  // Nothing on the realtor side, and no library but the vault's own, names the vault.
  const NAMES = /tenant-vault|tenant_profile_documents|tenant_profile_checks|profile_access_log|tenantVault\b|VAULT_BUCKET/;
  const OWN = ['lib/tenantVault.js', 'lib/tenantVaultRules.js', 'pages/api/tenant/vault.js', 'pages/api/cron/expire-vault.js'];
  const namers = [...walk('lib/'), ...walk('pages/api/'), ...walk('components/dashboard/'), ...walk('components/listings/')].filter((f) => NAMES.test(src(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')));
  // With shares (db/019), a realtor reads the vault only through the one share reader: that
  // reader, the share lifecycle and the tenant's own shares route join the list, and nothing else.
  const SHARE = ['lib/profileShareStore.js', 'lib/profileShares.js', 'pages/api/tenant/shares.js'];
  // With the full profile (db/022), the tenant's own two routes for their photo and their download join it.
  const PERSONAL = ['pages/api/tenant/personal.js', 'pages/api/tenant/export.js'];
  assert.deepEqual(namers.sort(), [...OWN, ...SHARE, ...PERSONAL].sort(), 'only the vault, its rules, the tenant routes, the expiry job, and the one share reader with the share lifecycle');
  const route = src('pages/api/tenant/vault.js');
  assert.match(route, /const p = await sessionProfile\(req\);\s*\n\s*if \(!p\) return res\.status\(401\)/, 'the tenant session first');
  assert.doesNotMatch(route, /requireEntitlement|withRealtor|getSupabaseServerClient|req\.body\??\.profileId|req\.query/, 'no realtor session, and the profile id never comes from the request');
  for (const f of [...OWN, ...SHARE]) assert.doesNotMatch(src(f), /owner_token|ownerToken|getPublicUrl/, `${f}: no owner token, and no public link`);
  // A signed link is made in exactly one function, behind an approved share: signVaultDocument,
  // which only lib/profileShareStore.js openSharedDocument calls, after its share check and its log line.
  const signers = [...walk('lib/'), ...walk('pages/api/')].filter((f) => /createSignedUrl/.test(src(f)) && /tenant/i.test(f));
  assert.deepEqual(signers, ['lib/tenantVault.js'], 'one file of the vault makes a signed link');
  assert.equal((src('lib/tenantVault.js').match(/createSignedUrl/g) || []).length, 1, 'in one place');
  assert.match(src('lib/tenantVault.js'), /export async function signVaultDocument\(admin, \{ profileId, documentId, seconds = 60 \}\) \{[\s\S]*?createSignedUrl\(data\.storage_path, seconds, \{ download: false \}\)/, 'inside signVaultDocument');
  // An ID is never signed, linked or opened by a realtor: signVaultDocument refuses every kind
  // but proof of income and the employment letter, before the link is made, and the share reader
  // lists and opens those two kinds alone, whatever the share's purpose.
  assert.match(src('lib/tenantVault.js'), /export const SHARE_DOCUMENT_KINDS = Object\.freeze\(\['income', 'employment'\]\);/, 'the kinds a realtor may open: never id, never other');
  assert.match(src('lib/tenantVault.js'), /if \(!data\) return \{ ok: false, reason: 'missing' \};\s*\n\s*if \(!SHARE_DOCUMENT_KINDS\.includes\(data\.kind\)\) return \{ ok: false, reason: 'refused' \};\s*\n\s*const \{ data: signed, error: sErr \} = await admin\.storage\.from\(VAULT_BUCKET\)\.createSignedUrl/, 'an ID document is refused inside signVaultDocument, before any link');
  assert.doesNotMatch(src('lib/profileShareStore.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /purpose === 'application'|kind !== 'id'/, 'no purpose of share opens an ID');
  assert.equal((src('lib/profileShareStore.js').match(/SHARE_DOCUMENT_KINDS\.includes\(d\.kind\)/g) || []).length, 2, 'the list and the open both keep to the two kinds');
  const callers = [...walk('lib/'), ...walk('pages/'), ...walk('components/')].filter((f) => f !== 'lib/tenantVault.js' && /signVaultDocument/.test(src(f)));
  assert.deepEqual(callers, ['lib/profileShareStore.js'], 'called by the share reader alone');
  assert.match(src('lib/profileShareStore.js'), /const refused = shareRefusal\(share, viewer, now\);\s*\n\s*if \(refused\) return \{ ok: false, reason: refused \};\s*\n\s*if \(!documentsOpen\(share, now\)\) return \{ ok: false, reason: 'closed' \};[\s\S]*?if \(!logged\) return \{ ok: false, reason: 'not logged' \};\s*\n\s*return await signVaultDocument/, 'after the share check, the documents window and the log line');
  // A realtor who is signed in, with no tenant cookie: the vault route refuses every method.
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf');
  assert.equal(t.docs().length, 1);
  t.stack.user = { id: 'realtor-1', email: 'r@example.com' };
  for (const [method, body] of [['GET', null], ['POST', { action: 'upload', file: { name: 'x.pdf', type: 'application/pdf', data: PDF } }], ['POST', { action: 'delete', id: t.docs()[0].id }], ['POST', { action: 'renew', id: t.docs()[0].id }]]) {
    const res = fakeRes(); await vaultRoute(fakeReq({ method, body, headers: {}, cookies: { 'sb-access-token': 'realtor' } }), res);
    assert.equal(res.code, 401, `${method} ${body ? body.action : ''}: no tenant session, no vault`);
    assert.doesNotMatch(JSON.stringify(res.body), /Northwind|85000|Maya/, 'and nothing of the vault in the answer');
  }
  // Another tenant's session reaches only their own vault.
  const other = S.blankProfile('omar@example.com'); other.facts = { fullName: 'Omar Haddad' }; await S.saveProfile(other);
  const otherCookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(await S.createSession(other.id))}` };
  const seen = fakeRes(); await vaultRoute(fakeReq({ method: 'GET', headers: otherCookie }), seen);
  assert.deepEqual([seen.body.documents, seen.body.checks], [[], []], 'another tenant sees none of it');
  const stolen = fakeRes(); await vaultRoute(fakeReq({ method: 'POST', body: { action: 'delete', id: t.docs()[0].id }, headers: otherCookie }), stolen);
  assert.equal(stolen.code, 404); assert.equal(t.docs()[0].deleted_at ?? null, null, 'and cannot delete it');
  // The realtor's own document routes find nothing for a vault file, and no link is signed.
  const open = (await import('../../pages/api/documents/open.js')).default;
  const res = fakeRes(); await open(fakeReq({ method: 'POST', body: { documentId: t.docs()[0].id, id: t.docs()[0].id } }), res);
  assert.ok(res.code >= 400, 'the realtor route does not answer for a vault document');
  assert.equal(t.stack.db.storageCalls.filter((c) => c[0] === 'sign').length, 0, 'no signed link was made for any file');
  t.stack.restore();
});

test('2. stored only after the read, with facts from the closed list; address proved and consent first', async () => {
  const t = await setup({ consent: false });
  const first = await t.upload('letter (Maya Okafor).pdf');
  assert.equal(first.code, 403); assert.equal(first.body.code, 'consent');
  assert.equal(t.stack.anthropic.calls.length, 0, 'nothing is read before the consent');
  assert.equal((await t.call('POST', { action: 'consent' })).code, 200);
  const at = (await S.getProfileById(t.p.id)).vaultConsentAt;
  assert.ok(at); await t.call('POST', { action: 'consent' });
  assert.equal((await S.getProfileById(t.p.id)).vaultConsentAt, at, 'the consent time is recorded once');
  assert.equal(t.stack.db.tables.tenant_profiles[0].vault_consent_at, at, 'and written to the profile row');
  const ok = await t.upload('letter (Maya Okafor).pdf');
  assert.equal(ok.code, 200);
  const row = t.docs()[0];
  assert.equal(row.kind, 'employment'); assert.equal(row.tenant_profile_id, t.p.id);
  assert.match(row.storage_path, new RegExp(`^${t.p.id}/[0-9a-f-]{36}\\.pdf$`), 'the path is the profile and a random id: no filename, no email');
  assert.deepEqual(t.objects(), [row.storage_path], 'the file is in the tenant-vault bucket');
  assert.equal(Math.round((Date.parse(row.expires_at) - Date.parse(row.uploaded_at)) / DAY), 90);
  const checks = t.stack.db.tables.tenant_profile_checks;
  assert.deepEqual(checks.map((c) => c.kind).sort(), ['employer_name', 'employment_start', 'income_annual_gross']);
  assert.ok(checks.every((c) => PROFILE_CHECK_KINDS.includes(c.kind) && c.source_document_id === row.id && c.source_kind === 'employment'));
  assert.deepEqual(checks.find((c) => c.kind === 'income_annual_gross').value, { cents: 8500000 });
  assert.equal(checks.find((c) => c.kind === 'income_annual_gross').agrees_with_typed, true);
  assert.deepEqual(checks.find((c) => c.kind === 'employment_start').value, { month: '2023-03' });
  assert.doesNotMatch(JSON.stringify(checks.map((c) => c.value)), /birth|age|score|fit|rank|photo|citizen|assistance/i);
  const id = await t.upload('id (Maya Okafor).pdf');
  assert.equal(id.code, 200);
  const idRow = t.docs().find((d) => d.kind === 'id');
  assert.equal(Math.round((Date.parse(idRow.expires_at) - Date.parse(idRow.uploaded_at)) / DAY), 14, 'an ID is kept 14 days');
  assert.deepEqual(checks.find((c) => c.kind === 'identity_name_matches').value, { matches: true });
  assert.deepEqual(Object.keys(checks.find((c) => c.kind === 'identity_name_matches').value), ['matches'], 'no name, number or date from the ID is kept');
  const log = t.stack.db.tables.profile_access_log;
  assert.equal(log.filter((l) => l.action === 'document_added' && l.actor_type === 'tenant').length, 2);
  const seen = (await t.call('GET')).body;
  assert.equal(seen.documents.length, 2); assert.equal(seen.checks.length, 4); assert.deepEqual(seen.views, []);
  assert.doesNotMatch(JSON.stringify(seen), /storage_path|content_hash|[0-9a-f-]{36}\.pdf/, 'the browser never receives a path or a hash');
  // A tenant who has not proved the address: refused before anything is read.
  const q = await S.getProfileById(t.p.id); delete q.emailVerifiedAt; await S.saveProfile(q); t.stack.db.tables.tenant_profiles[0].email_verified_at = null;
  const n = t.stack.anthropic.calls.length;
  const un = await t.upload('paystub (Maya Okafor).pdf');
  assert.equal(un.code, 403); assert.equal(un.body.code, 'unproved'); assert.equal(t.stack.anthropic.calls.length, n);
  t.stack.restore();
});

test('3. a deleted document is gone, file included; the facts read from it stay until removed', async () => {
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf'); await t.upload('id (Maya Okafor).pdf');
  const letter = t.docs().find((d) => d.kind === 'employment'); const id = t.docs().find((d) => d.kind === 'id');
  assert.equal(t.objects().length, 2);
  const del = await t.call('POST', { action: 'delete', id: letter.id });
  assert.equal(del.code, 200);
  assert.deepEqual(t.objects(), [id.storage_path], 'the file is gone from the bucket, and only that file');
  const row = t.docs().find((d) => d.id === letter.id);
  assert.ok(row.deleted_at); assert.equal(row.deleted_by, 'tenant'); assert.equal(row.content_hash, null); assert.equal(row.object_removed, true);
  const seen = (await t.call('GET')).body;
  assert.deepEqual(seen.documents.map((d) => d.kind), ['id'], 'and gone from the page');
  const checks = t.stack.db.tables.tenant_profile_checks;
  assert.ok(checks.filter((c) => c.source_kind === 'employment').every((c) => c.source_document_id === null), 'the facts stay, with no document behind them');
  assert.ok(seen.checks.filter((c) => c.sourceKind === 'employment').every((c) => c.documentHeld === false));
  assert.equal((await t.call('POST', { action: 'delete', id: letter.id })).code, 404, 'a second delete finds nothing');
  assert.ok(t.stack.db.tables.profile_access_log.some((l) => l.action === 'document_deleted' && l.document_id === letter.id));
  const fact = checks.find((c) => c.kind === 'employer_name');
  assert.equal((await t.call('POST', { action: 'remove-check', id: fact.id })).code, 200);
  assert.equal(t.stack.db.tables.tenant_profile_checks.some((c) => c.kind === 'employer_name'), false, 'a removed fact is gone, not hidden');
  // Thirty days on, the emptied row is removed too.
  await V.reconcileVault(t.stack.db, { now: new Date(Date.now() + 31 * DAY) });
  assert.equal(t.docs().some((d) => d.id === letter.id), false);
  assert.equal(t.docs().some((d) => d.id === id.id), true);
  t.stack.restore();
});

test('4. the expiry job removes exactly what is due, writes an event for each, and needs the cron secret', async () => {
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf'); await t.upload('id (Maya Okafor).pdf'); await t.upload('paystub (Maya Okafor).pdf');
  const [letter, id, stub] = ['employment', 'id', 'income'].map((k) => t.docs().find((d) => d.kind === k));
  const run = async (headers) => { const res = fakeRes(); await cronRoute(fakeReq({ method: 'GET', headers }), res); return res; };
  assert.equal((await run({})).code, 401); assert.equal((await run({ authorization: 'Bearer wrong' })).code, 401);
  assert.equal(t.objects().length, 3, 'a refused run removes nothing');
  const good = { authorization: 'Bearer cron-secret' };
  assert.equal((await run(good)).body.expired, 0, 'nothing is due today');
  // Day 15: the ID is due, the others are not.
  const day15 = await V.expireVaultDocuments(t.stack.db, { now: new Date(Date.now() + 15 * DAY) });
  assert.deepEqual([day15.expired, day15.profiles], [1, 1]);
  assert.deepEqual(t.objects().sort(), [letter.storage_path, stub.storage_path].sort(), 'the ID file is gone and the other two are untouched');
  const gone = t.docs().find((d) => d.id === id.id);
  assert.equal(gone.deleted_by, 'expiry'); assert.ok(gone.deleted_at); assert.equal(gone.content_hash, null);
  for (const d of [letter, stub]) assert.equal(t.docs().find((x) => x.id === d.id).deleted_at ?? null, null);
  const events = t.stack.db.tables.profile_access_log.filter((l) => l.action === 'document_expired');
  assert.deepEqual(events.map((e) => [e.document_id, e.actor_type, e.tenant_profile_id]), [[id.id, 'system', t.p.id]], 'one event, for that document, from the system');
  assert.equal((await V.expireVaultDocuments(t.stack.db, { now: new Date(Date.now() + 15 * DAY) })).expired, 0, 'a second run the same day finds nothing');
  // A renewed file outlives its first date.
  await t.call('POST', { action: 'delete', id: stub.id });
  const day91 = await V.expireVaultDocuments(t.stack.db, { now: new Date(Date.now() + 91 * DAY) });
  assert.equal(day91.expired, 1); assert.deepEqual(t.objects(), []);
  assert.equal(t.stack.db.tables.profile_access_log.filter((l) => l.action === 'document_expired').length, 2);
  assert.equal(t.stack.db.tables.tenant_profile_checks.length > 0, true, 'the facts read outlive the files');
  assert.match(src('vercel.json'), /"\/api\/cron\/expire-vault",\s*"schedule": "15 3 \* \* \*"/);
  const noSecret = await setup({ env: { CRON_SECRET: null } });
  { const res = fakeRes(); await cronRoute(fakeReq({ method: 'GET', headers: good }), res); assert.equal(res.code, 503, 'no secret set: refused'); }
  noSecret.stack.restore();
});

test('5. the kill switch stops new storage and leaves existing documents untouched', async () => {
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf');
  const before = JSON.stringify(t.docs()); const objects = t.objects(); const reads = t.stack.anthropic.calls.length;
  process.env.TENANT_VAULT_ENABLED = 'false';
  const off = await t.upload('paystub (Maya Okafor).pdf');
  assert.equal(off.code, 503); assert.equal(off.body.code, 'paused');
  assert.equal(t.stack.anthropic.calls.length, reads, 'nothing is read while it is off');
  assert.equal((await t.call('POST', { action: 'renew', id: t.docs()[0].id })).code, 503, 'and nothing is renewed');
  assert.equal(JSON.stringify(t.docs()), before, 'every stored row is exactly as it was');
  assert.deepEqual(t.objects(), objects, 'and every file');
  const seen = (await t.call('GET')).body;
  assert.equal(seen.enabled, false); assert.equal(seen.documents.length, 1, 'the page still lists what is stored');
  assert.equal((await V.expireVaultDocuments(t.stack.db, { now: new Date() })).expired, 0, 'expiry still runs, and takes only what is due');
  assert.equal((await t.call('POST', { action: 'delete', id: t.docs()[0].id })).code, 200, 'the tenant can still delete');
  assert.deepEqual(t.objects(), []);
  for (const v of ['FALSE', ' false ']) assert.equal(R.vaultEnabled({ TENANT_VAULT_ENABLED: v }), false);
  for (const v of [undefined, '', 'true', '0', 'off']) assert.equal(R.vaultEnabled({ TENANT_VAULT_ENABLED: v }), true, `on unless exactly false (${v})`);
  process.env.TENANT_VAULT_ENABLED = 'true';
  assert.equal((await t.upload('paystub (Maya Okafor).pdf')).code, 200, 'back on at once');
  delete process.env.TENANT_VAULT_ENABLED;
  t.stack.restore();
});

test('6. a credit report is never stored in the profile, nor a file that cannot be recognised', async () => {
  const t = await setup();
  const credit = await t.upload('credit (Maya Okafor).pdf');
  assert.equal(credit.code, 422); assert.equal(credit.body.rejected, 'credit');
  const mystery = await t.upload('mystery.pdf');
  assert.equal(mystery.code, 422); assert.equal(mystery.body.rejected, 'unrecognized');
  assert.deepEqual([t.docs().length, t.objects().length, t.stack.db.tables.tenant_profile_checks.length], [0, 0, 0], 'no row, no file and no fact');
  assert.equal(t.stack.db.storageCalls.filter((c) => c[0] === 'upload').length, 0, 'nothing was ever sent to the bucket');
  assert.deepEqual(R.vaultKindOf({ documentType: 'credit report', extracted: {} }), { refused: 'credit' });
  assert.deepEqual(R.vaultKindOf({ documentType: 'pay stub', extracted: { creditScore: 700 } }), { refused: 'credit' }, 'a score on any file makes it a credit report');
  assert.ok(!R.VAULT_KINDS.includes('credit'));
  assert.match(src('db/018-profile-vault.sql'), /kind\s+text NOT NULL CHECK \(kind IN \('id', 'income', 'employment', 'other'\)\)/, 'and the table has no kind to store one under');
  assert.equal((await t.call('POST', { action: 'upload', file: { name: 'a.gif', type: 'image/gif', data: PDF } })).code, 400);
  t.stack.restore();
});

test('7. renewal is 90 days from the day, and never for an ID', async () => {
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf'); await t.upload('id (Maya Okafor).pdf');
  const letter = t.docs().find((d) => d.kind === 'employment'); const id = t.docs().find((d) => d.kind === 'id');
  const later = new Date(Date.now() + 80 * DAY);
  const out = await V.renewVaultDocument(t.stack.db, { profileId: t.p.id, id: letter.id, now: later });
  assert.equal(out.ok, true);
  assert.equal(t.docs().find((d) => d.id === letter.id).expires_at, new Date(later.getTime() + 90 * DAY).toISOString());
  const no = await t.call('POST', { action: 'renew', id: id.id });
  assert.equal(no.code, 400); assert.match(no.body.error, /cannot be renewed/);
  assert.deepEqual([R.canRenew('id'), R.canRenew('income'), R.canRenew('employment')], [false, true, true]);
  assert.ok(t.stack.db.tables.profile_access_log.some((l) => l.action === 'document_renewed'));
  t.stack.restore();
});

test('8. twelve months idle: the stored documents and the facts read go; unknown is never idle', async () => {
  const t = await setup();
  await t.upload('letter (Maya Okafor).pdf');
  const now = new Date();
  const months = (n) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString(); };
  for (const activity of [null, {}, { [t.p.id]: months(11) }, { [t.p.id]: null }]) {
    const r = await V.expireIdleVaults(t.stack.db, { now, activityFor: async () => activity });
    assert.equal(r.profiles, 0); assert.equal(t.objects().length, 1);
  }
  const r = await V.expireIdleVaults(t.stack.db, { now, activityFor: async () => ({ [t.p.id]: months(13) }) });
  assert.deepEqual([r.profiles, r.documents, r.checks], [1, 1, 3]);
  assert.deepEqual(t.objects(), []); assert.equal(t.stack.db.tables.tenant_profile_checks.length, 0);
  assert.equal(t.stack.db.tables.tenant_profiles.length, 1, 'the profile itself is not touched');
  const activity = await S.profileActivity([t.p.id]);
  assert.ok(Date.parse(activity[t.p.id]) > Date.now() - DAY, 'the last sign in is what counts');
  t.stack.restore();
});

test('9. before db/018 has run: not available, nothing read, nothing thrown', async () => {
  const t = await setup({ tables: false });
  const seen = await t.call('GET');
  assert.equal(seen.code, 200); assert.equal(seen.body.available, false); assert.deepEqual(seen.body.documents, []);
  const up = await t.upload('letter (Maya Okafor).pdf');
  assert.equal(up.code, 503); assert.equal(up.body.code, 'absent');
  assert.equal(t.stack.anthropic.calls.length, 0);
  const res = fakeRes(); await cronRoute(fakeReq({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }), res);
  assert.equal(res.code, 200); assert.equal(res.body.absent, true);
  t.stack.restore();
  // And before db/018 added the column: the consent stays in the profile's own record.
  const old = installFakeStack({ tables: { tenant_profiles: [] }, absentColumns: ['vault_consent_at'] });
  const p = S.blankProfile('lena@example.com'); await S.saveProfile(p);
  assert.ok(await S.recordVaultConsent(p.id));
  assert.ok((await S.getProfileByEmail('lena@example.com')).vaultConsentAt, 'kept in the profile record');
  assert.equal('vault_consent_at' in old.db.tables.tenant_profiles[0], false, 'and the row is written without the column');
  old.restore();
});

test('10. every fact on the page shows its source and its date', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const F = await import('../../components/tenant/ProfileFacts.js');
  const { youLine } = await import('../../components/tenant/ProfileVault.js');
  const line = youLine('typed', '2026-11-01T15:00:00.000Z');
  assert.match(line.replace(/ /g, ' '), /^Typed by you on November 1, 2026$/);
  assert.match(youLine('document', '2026-11-10T16:00:00Z'), /^Read from a document on November 10, 2026$/);
  const facts = { ...FACTS, phone: '4165550142', employmentType: 'full-time', netIncome: '61000', previousAddress: '214 Shaw St, Unit 3', yearsAtPrevious: '2', previousLandlordName: 'Lee', moveInDate: '2027-01-01', reference1Name: 'Ivy Chen' };
  const html = renderToStaticMarkup(React.createElement(F.FactSourceContext.Provider, { value: line }, React.createElement(F.FactSections, { facts, canEdit: true, onEdit() {}, onCancel() {}, onSave() {}, setDraft() {} })));
  const shown = (html.match(/class="mp-value(?! mp-empty)[^"]*"/g) || []).length;
  const sourced = (html.match(/data-fact-source=""/g) || []).length;
  assert.ok(shown >= 8, `the facts are shown (${shown})`);
  assert.equal(sourced, shown, 'each fact that holds a value carries its source line');
  assert.equal((html.replace(/ /g, ' ').match(/Typed by you on November 1, 2026/g) || []).length, shown);
  assert.equal((renderToStaticMarkup(React.createElement(F.FactSections, { facts, canEdit: false, onEdit() {}, onCancel() {}, onSave() {}, setDraft() {} })).match(/data-fact-source/g) || []).length, 0, 'a page that names no source shows none');
  const vault = src('components/tenant/ProfileVault.js');
  assert.match(vault, /<div className="mp-source" data-fact-source="">\{noWidow\(youLine\(SOURCE\.DOCUMENT, c\.readAt\)\)\}<\/div>/, 'each fact read from a document carries "Read from a document on DATE"');
  assert.match(vault, /data-vault-expiry="">\{noWidow\(`Kept until \$\{dateLong\(d\.expiresAt\)\}`\)\}/, 'each document its expiry');
  assert.match(src('pages/my-application.js'), /<FactSourceContext\.Provider value=\{youLine\(SOURCE\.TYPED, profile\.factsUpdatedAt\)\}>/);
  for (const f of ['components/tenant/ProfileVault.js', 'lib/tenantVaultRules.js', 'pages/api/tenant/vault.js']) assert.doesNotMatch(src(f).replace(/\/\/.*$/gm, ''), /\bverified\b|[–—]/i, f);
});
