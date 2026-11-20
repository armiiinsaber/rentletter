// Shares and the view log, one tap apply and stop sharing (lib/profileShares.js,
// lib/profileShareStore.js, pages/api/tenant/shares.js, pages/api/profile-shares/view.js and
// open.js, db/019-profile-shares.sql; docs/design/profile-and-circle.md Phases 5 and 6), over
// the fake stack: the real routes and libraries, a fake database, bucket and key value store.
//   1. A realtor with no share sees nothing, and neither does a realtor who is not the recipient.
//   2. A realtor with a share sees only the whitelist and the checks, each with its source and
//      date; every planted Fit, rank, note, household and protected ground key is refused.
//   3. A revoked share ends access at once, and the realtor is told the tenant stopped sharing.
//   4. Every view is logged, before the answer, and shown to the tenant; a read that cannot be
//      logged is refused.
//   5. Stored documents open through the share alone: for 14 days, logged, a 60 second link.
//      Only proof of income and an employment letter: an ID is never opened by a realtor.
//   6. An application that is no longer open ends its share on its own.
//   7. One tap apply writes the reuse record, with the kinds of document check the share
//      carries, and counts in lib/kpis.js (profile reuse, and reuse with documents).
//   8. The age rule holds on one tap apply.
//   9. A tenant can never approve or stop a share on another tenant's profile, and no realtor
//      route can write a share.
//  10. Before db/019 has run: no share is made, nothing is listed, nothing is thrown.
//  11. The realtor's timeline says the tenant shared their profile and that they stopped, on
//      that applicant, naming the tenant and the listing and holding no fact of the profile.
//  12. A share request that fails after submit offers one retry of the share alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeReq, fakeRes } = await import('../helpers/fakeStack.mjs');
const { tables, USER, OTHER, INVITE_TOKEN } = await import('./fixture.mjs');
const S = await import('../../lib/tenantProfileStore.js');
const P = await import('../../lib/profileShares.js');
const PR = await import('../../lib/prefillRecord.js');
const K = await import('../../lib/kpis.js');
const A = await import('../../lib/applyAge.js');
const { PROFILE_FACT_KEYS, PROFILE_CHECK_KINDS } = await import('../../lib/profileFacts.js');
const tenantShares = (await import('../../pages/api/tenant/shares.js')).default;
const view = (await import('../../pages/api/profile-shares/view.js')).default;
const open = (await import('../../pages/api/profile-shares/open.js')).default;
const ticketRoute = (await import('../../pages/api/tenant/prefill-ticket.js')).default;

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else if (/\.js$/.test(f)) out.push(rel); } return out; };
const DAY = 86400000;
// What the tenant typed, and beside it everything a share must never show.
const TYPED = { fullName: 'Maya Okafor', email: 'maya@example.com', phone: '4165550142', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000', yearsAtJob: '3', previousAddress: '214 Shaw St, Unit 3', moveInDate: '2027-01-01' };
const PLANTED = { fit: 4.6, fitScore: 4.6, score: 91, rank: 1, ranking: 'top', notes: 'PLANTED-NOTE strongest applicant', decision_notes: 'PLANTED-NOTE', numberOfOccupants: '4', householdSize: 4, age: '31', dateOfBirth: '1995-02-03', coApplicantRelationship: 'spouse', pets: 'service dog', smoker: 'no', incomeSource: 'assistance', citizenship: 'PLANTED-STATUS', religion: 'PLANTED-CREED', maritalStatus: 'married', netIncome: '61000', ownerToken: 'OWNERTOKENSECRET' };

// Sarah's listing L1 with applicant J1 (application A1), made from Maya's profile; Maya signed in.
async function setup({ shares = true, shared = false } = {}) {
  const t = tables();
  Object.assign(t, { tenant_profiles: [], tenant_profile_shareable: [], tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [], ...(shares ? { profile_shares: [] } : {}) });
  if (!t.profiles.some((p) => p.id === OTHER.id)) t.profiles.push({ id: OTHER.id, email: OTHER.email, full_name: 'Other Realtor', plan: 'founding', created_at: '2026-05-01T15:00:00Z' });
  Object.assign(t.profiles.find((p) => p.id === USER.id), { brokerage: 'Junction Lane Realty' });
  const stack = installFakeStack({ tables: t, user: USER, env: { TENANT_VAULT_ENABLED: null } });
  const tenant = async (email, facts) => {
    const p = S.blankProfile(email); p.facts = { ...facts, email }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z'; p.profileRevision = 2;
    await S.saveProfile(p);
    const token = await S.createSession(p.id);
    // The pointer the real store keeps as a JSON string (the fake keeps a bare one otherwise).
    stack.kv.values[`tprofile_id:${p.id}`] = JSON.stringify(p.emailKey);
    return { p, cookie: { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(token)}` } };
  };
  const maya = await tenant('maya@example.com', TYPED);
  // The view db/015 makes: here it holds the planted keys too, so the code's own whitelist is what is tested.
  t.tenant_profile_shareable.push({ id: maya.p.id, facts: { ...TYPED, ...PLANTED }, facts_updated_at: '2026-11-01T15:00:00.000Z', email_verified_at: '2026-11-02T15:00:00.000Z' });
  const doc = (id, kind) => ({ id, tenant_profile_id: maya.p.id, storage_path: `${maya.p.id}/${id}.pdf`, kind, mime: 'application/pdf', bytes: 1200, content_hash: 'HASHSECRET', uploaded_at: '2026-11-10T16:00:00.000Z', read_at: '2026-11-10T16:00:00.000Z', expires_at: new Date(Date.now() + 80 * DAY).toISOString(), deleted_at: null, deleted_by: null, object_removed: false });
  t.tenant_profile_documents.push(doc('doc-pay', 'income'), doc('doc-id', 'id'));
  for (const d of t.tenant_profile_documents) await stack.db.storage.from('tenant-vault').upload(d.storage_path, Buffer.from('%PDF-1.4 tenant file'), { contentType: 'application/pdf' });
  t.tenant_profile_checks.push(
    { id: 'c1', tenant_profile_id: maya.p.id, kind: 'income_annual_gross', value: { cents: 8500000, score: 91, incomeSource: 'assistance' }, agrees_with_typed: true, source_kind: 'income', source_document_id: 'doc-pay', read_at: '2026-11-10T16:00:00.000Z', fresh_until: '2027-02-08T16:00:00.000Z', notes: 'PLANTED-NOTE' },
    { id: 'c2', tenant_profile_id: maya.p.id, kind: 'identity_name_matches', value: { matches: true, dateOfBirth: '1995-02-03', idNumber: 'PLANTED-ID' }, agrees_with_typed: true, source_kind: 'id', source_document_id: 'doc-id', read_at: '2026-11-03T16:00:00.000Z', fresh_until: '2027-11-03T16:00:00.000Z' },
    { id: 'c3', tenant_profile_id: maya.p.id, kind: 'date_of_birth', value: { date: '1995-02-03' }, source_kind: 'id', read_at: '2026-11-03T16:00:00.000Z' },
    { id: 'c4', tenant_profile_id: maya.p.id, kind: 'fit_score', value: { score: 4.6 }, source_kind: 'income', read_at: '2026-11-03T16:00:00.000Z' },
  );
  const a1 = t.applications.find((a) => a.id === 'A1');
  Object.assign(a1, { email: 'maya@example.com', prefill_source: null, prefill_profile_id: null, prefill_profile_revision: null, email_verified_at_submit: null, reused_checks: null, tenant_profile_id: maya.p.id, owner_token: 'OWNERTOKENSECRET' });
  stack.kv.values[`linvite:${INVITE_TOKEN}`] = { profileId: USER.id, listingId: 'L1', realtorName: 'Sarah Chen' };
  // Another realtor (or nobody) signed in: the same tables and store behind that session, then Sarah's again.
  const realtor = async (route, body, user = USER) => {
    if (user !== USER) installFakeStack({ tables: t, user, kv: stack.kv, env: { TENANT_VAULT_ENABLED: null } });
    try { const res = fakeRes(); await route(fakeReq({ body }), res); return res; } finally { globalThis.__rlStack = stack; }
  };
  const tenantCall = async (who, method, body) => { const res = fakeRes(); await tenantShares(fakeReq({ method, body, headers: who.cookie }), res); return res; };
  const apply = (who = maya, rl = a1.application_number) => tenantCall(who, 'POST', { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: rl });
  if (shared) assert.equal((await apply()).body.shared, true);
  const log = () => t.profile_access_log;
  return { stack, t, maya, a1, tenant, realtor, tenantCall, apply, log, share: () => (t.profile_shares || [])[0] };
}

test('1. a realtor with no share sees nothing; nor does a realtor who is not the recipient', async () => {
  const w = await setup();
  const none = await w.realtor(view, { linkId: 'J1' });
  assert.deepEqual([none.code, none.body], [200, { shared: false }], 'no share: nothing but that');
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' })).code, 404);
  assert.equal(w.log().length, 0, 'and nothing was read, so nothing was logged');
  assert.equal(w.stack.db.queries.some((q) => q.table === 'tenant_profile_shareable' || q.table === 'tenant_profile_checks'), false, 'no query touched the profile or its facts');
  assert.equal(w.stack.db.storageCalls.filter((c) => c[0] === 'sign').length, 0);
  // With a share for Sarah: another realtor, on Sarah's applicant, is refused by the ownership check.
  await w.apply();
  const other = await w.realtor(view, { linkId: 'J1' }, OTHER);
  assert.equal(other.code, 403); assert.doesNotMatch(JSON.stringify(other.body), /Maya|85000|Northwind/);
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' }, OTHER)).code, 403);
  // On their own applicant (J9, another tenant's application) the same realtor finds no share.
  assert.deepEqual((await w.realtor(view, { linkId: 'J9' }, OTHER)).body, { shared: false });
  // The reader itself refuses a share whose recipient is someone else, whatever the route did.
  const { readSharedProfile, openSharedDocument } = await import('../../lib/profileShareStore.js');
  assert.deepEqual(await readSharedProfile(w.stack.db, { share: w.share(), viewer: { id: OTHER.id, label: 'Other' } }), { ok: false, reason: 'not yours' });
  assert.deepEqual(await openSharedDocument(w.stack.db, { share: w.share(), viewer: { id: OTHER.id, label: 'Other' }, documentId: 'doc-pay' }), { ok: false, reason: 'not yours' });
  assert.deepEqual(await readSharedProfile(w.stack.db, { share: null, viewer: USER }), { ok: false, reason: 'no share' });
  // Signed out, and a locked plan: the gate answers before anything else.
  assert.equal((await w.realtor(view, { linkId: 'J1' }, null)).code, 401);
  assert.equal(w.log().filter((l) => l.actor_type === 'realtor').length, 0, 'none of it left a view in the log');
  for (const f of ['pages/api/profile-shares/view.js', 'pages/api/profile-shares/open.js']) assert.match(src(f), /export default withRealtor\(async \(\{ user, admin \}, req, res\) => \{/, `${f}: session and entitlement first`);
  assert.match(src('lib/profileShareRoutes.js'), /const own = await ownedApplicant\(admin, linkId, user\.id\);\s*\n\s*if \(!own\) return/, 'then the explicit ownership check');
  w.stack.restore();
});

test('2. a realtor with a share sees only the whitelist and the checks, each with its source and date', async () => {
  const w = await setup({ shared: true });
  const peek = await w.realtor(view, { linkId: 'J1', peek: true });
  assert.deepEqual(peek.body, { shared: true, ended: null }); assert.equal(w.log().filter((l) => l.action === 'profile_viewed').length, 0, 'a peek reads nothing and logs nothing');
  const res = await w.realtor(view, { linkId: 'J1' });
  assert.equal(res.code, 200);
  const body = res.body;
  assert.deepEqual(Object.keys(body).sort(), ['checks', 'documents', 'documentsUntil', 'ended', 'facts', 'shared', 'sharedAt']);
  assert.ok(body.facts.length >= 8 && body.facts.every((f) => PROFILE_FACT_KEYS.includes(f.key)), 'every fact is on the whitelist');
  assert.deepEqual(body.facts.map((f) => f.key), PROFILE_FACT_KEYS.filter((k) => TYPED[k] !== undefined), 'and they are exactly the whitelisted answers the tenant gave');
  assert.ok(body.facts.every((f) => /^Typed by the tenant on November 1, 2026$/.test(f.line) && f.source === 'typed'), 'each typed fact with its source and date');
  assert.deepEqual(body.checks.map((c) => c.kind).sort(), ['identity_name_matches', 'income_annual_gross'], 'the two facts read from documents, and no kind off the closed list');
  assert.ok(body.checks.every((c) => PROFILE_CHECK_KINDS.includes(c.kind) && /^Read from a document on November (3|10), 2026$/.test(c.line)));
  assert.deepEqual(body.checks.find((c) => c.kind === 'income_annual_gross').value, { cents: 8500000 }, 'a check keeps its own keys and drops every planted one');
  assert.deepEqual(body.checks.find((c) => c.kind === 'identity_name_matches').value, { matches: true });
  const sent = JSON.stringify(body);
  for (const [k, v] of Object.entries(PLANTED)) { assert.equal(sent.includes(`"${k}"`), false, `the key ${k} is refused`); if (typeof v === 'string' && v.length > 3) assert.equal(sent.includes(v), false, `and its value (${k})`); }
  assert.doesNotMatch(sent, /PLANTED|OWNERTOKENSECRET|HASHSECRET|storage_path|\.pdf|owner|decision|fit|rank|score|household|occupant|birth|"age"|pets|smok|citizen|relig|marital|assistance/i);
  assert.deepEqual(body.documents.map((d) => Object.keys(d).sort()), [['id', 'kind', 'readAt']], 'a document is named by what it is and when it was read, nothing more');
  assert.deepEqual(body.documents.map((d) => d.kind), ['income'], 'the proof of income is listed; the ID is not');
  // The payload is built by lib/profileFacts.js and checked before it leaves.
  assert.match(code('lib/profileShareStore.js'), /return \{ ok: true, payload: assertSharePayload\(read\.payload\), documents/);
  assert.doesNotMatch(code('lib/profileShareStore.js'), /listing_applicants|doc_verifications|decision_|scorecard|tenant_profiles\b/, 'the reader has no way to the Fit, the checklist, the decision or the notes');
  assert.doesNotMatch(src('db/019-profile-shares.sql').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n'), /note|score|rank|fit\b/i, 'and the table has no column for one');
  w.stack.restore();
});

test('3. a revoked share ends access at once, and the realtor is told the tenant stopped sharing', async () => {
  const w = await setup({ shared: true });
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.facts.length > 0, true);
  const before = JSON.stringify(w.t.applications) + JSON.stringify(w.t.listing_applicants);
  const stop = await w.tenantCall(w.maya, 'POST', { action: 'stop', id: w.share().id });
  assert.equal(stop.code, 200);
  assert.equal(w.share().status, 'revoked'); assert.ok(w.share().ended_at);
  const after = await w.realtor(view, { linkId: 'J1' });
  assert.deepEqual(after.body, { shared: true, ended: 'stopped', message: 'The tenant stopped sharing their profile.' }, 'the very next read: no fact, no check, no document');
  const opened = await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' });
  assert.equal(opened.code, 403); assert.match(opened.body.error, /stopped sharing/);
  assert.equal(w.stack.db.storageCalls.filter((c) => c[0] === 'sign').length, 0);
  assert.equal(w.log().filter((l) => l.action === 'share_revoked' && l.actor_type === 'tenant' && l.share_id === w.share().id).length, 1, 'share_revoked is in the log');
  assert.equal(w.log().filter((l) => l.action === 'profile_viewed').length, 1, 'and no view after the stop');
  assert.equal(JSON.stringify(w.t.applications) + JSON.stringify(w.t.listing_applicants), before, 'the application already sent stays with the realtor, untouched');
  assert.equal((await w.tenantCall(w.maya, 'POST', { action: 'stop', id: w.share().id })).code, 404, 'a stopped share cannot be stopped twice');
  const mine = (await w.tenantCall(w.maya, 'GET')).body.shares[0];
  assert.deepEqual([mine.live, mine.status, mine.documentsUntil], [false, 'revoked', null]);
  // Applying again to the same listing is a new approval, a new row.
  await w.apply();
  assert.deepEqual(w.t.profile_shares.map((s) => s.status), ['revoked', 'approved']);
  w.stack.restore();
});

test('4. every view is logged before the answer and shown to the tenant; a read that cannot be logged is refused', async () => {
  const w = await setup({ shared: true });
  await w.realtor(view, { linkId: 'J1' }); await w.realtor(view, { linkId: 'J1' });
  const opened = await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' });
  assert.equal(opened.code, 200);
  const lines = w.log().filter((l) => l.actor_type === 'realtor');
  assert.deepEqual(lines.map((l) => l.action), ['profile_viewed', 'profile_viewed', 'document_opened']);
  assert.ok(lines.every((l) => l.share_id === w.share().id && l.actor_profile_id === USER.id && l.tenant_profile_id === w.maya.p.id && l.actor_label === 'Sarah Chen, Junction Lane Realty'), 'each with the share, the realtor and their name as it was');
  assert.equal(lines[2].document_id, 'doc-pay');
  const seen = (await w.tenantCall(w.maya, 'GET')).body;
  assert.equal(seen.available, true);
  const sh = seen.shares[0];
  assert.deepEqual([sh.realtorName, sh.realtorBrokerage, sh.listingName, sh.live, sh.purpose], ['Sarah Chen', 'Junction Lane Realty', '210 Carlaw Ave, Unit 4', true, 'application']);
  assert.deepEqual(sh.views.map((v) => v.action).sort(), ['document_opened', 'profile_viewed', 'profile_viewed'], 'the tenant sees every view, under the share it went through');
  assert.ok(sh.views.every((v) => !Number.isNaN(Date.parse(v.at))), 'each with its date');
  assert.doesNotMatch(JSON.stringify(seen), /recipient_profile_id|realtor-1|OWNERTOKENSECRET/, 'and no id of the realtor');
  // The log cannot be written: the read is refused, and no file is signed.
  const signsBefore = w.stack.db.storageCalls.filter((c) => c[0] === 'sign').length;
  w.stack.db.failWhen = (q) => (q.table === 'profile_access_log' && q.op === 'insert' ? { code: '57014', message: 'canceling statement due to timeout' } : null);
  const blind = await w.realtor(view, { linkId: 'J1' });
  assert.equal(blind.code, 503); assert.doesNotMatch(JSON.stringify(blind.body), /Maya|85000/);
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' })).code, 503);
  assert.equal(w.stack.db.storageCalls.filter((c) => c[0] === 'sign').length, signsBefore, 'no link was made');
  w.stack.db.failWhen = null;
  const page = src('components/tenant/ProfileVault.js');
  assert.match(page, /data-share-view="">\{noWidow\(`\$\{v\.action === 'document_opened' \? 'Opened a document' : 'Viewed your profile'\} on \$\{dateLong\(v\.at\)\}`\)\}/, 'the profile page lists each view with its date');
  assert.match(page, /<h2 id="vault-views-h" className="mp-h2">Who can see your profile<\/h2>/);
  w.stack.restore();
});

test('5. stored documents open through the share alone: 14 days, logged, a 60 second link', async () => {
  const w = await setup({ shared: true });
  const until = Date.parse(w.share().documents_until) - Date.parse(w.share().approved_at);
  assert.equal(Math.round(until / DAY), 14);
  assert.deepEqual(w.share().scope, ['facts', 'checks', 'documents']);
  const ok = await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' });
  assert.equal(ok.code, 200); assert.deepEqual(Object.keys(ok.body).sort(), ['kind', 'mime', 'url']);
  assert.match(ok.body.url, /^https:\/\/signed\.example\/tenant-vault\/.+\?exp=60$/, 'a 60 second signed link');
  // The ID is never opened by a realtor, through an application share or any other: the route
  // refuses it, nothing is logged as opened, and the one signer refuses it whoever asks.
  const opensBefore = w.log().filter((l) => l.action === 'document_opened').length;
  const idOpen = await w.realtor(open, { linkId: 'J1', documentId: 'doc-id' });
  assert.equal(idOpen.code, 404, 'the ID is refused, on the listing the tenant applied to as on any other');
  assert.equal(idOpen.body.url, undefined, 'and no link is made');
  assert.equal(w.log().filter((l) => l.action === 'document_opened').length, opensBefore, 'nor a line saying it was opened');
  const V = await import('../../lib/tenantVault.js');
  assert.deepEqual([...V.SHARE_DOCUMENT_KINDS], ['income', 'employment'], 'a realtor opens proof of income and the employment letter, nothing else');
  assert.deepEqual(await V.signVaultDocument(w.stack.db, { profileId: w.maya.p.id, documentId: 'doc-id' }), { ok: false, reason: 'refused' }, 'signVaultDocument makes no link to an ID');
  assert.equal((await V.signVaultDocument(w.stack.db, { profileId: w.maya.p.id, documentId: 'doc-pay' })).ok, true);
  // The identity check still reaches the realtor as a fact, with its date.
  const idFact = (await w.realtor(view, { linkId: 'J1' })).body;
  assert.equal(idFact.documents.some((d) => d.kind === 'id'), false);
  assert.match(idFact.checks.find((c) => c.kind === 'identity_name_matches').line, /^Read from a document on November 3, 2026$/);
  for (const id of ['no-such', 'doc-other']) assert.equal((await w.realtor(open, { linkId: 'J1', documentId: id })).code, 404);
  // A deleted file is not opened.
  w.t.tenant_profile_documents.find((d) => d.id === 'doc-pay').deleted_at = new Date().toISOString();
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' })).code, 404);
  // Day 15: the documents window is over; the facts still show, the files do not.
  w.share().documents_until = new Date(Date.now() - DAY).toISOString();
  const late = await w.realtor(open, { linkId: 'J1', documentId: 'doc-id' });
  assert.equal(late.code, 403); assert.match(late.body.error, /14 days/);
  const v = (await w.realtor(view, { linkId: 'J1' })).body;
  assert.deepEqual([v.documents, v.documentsUntil], [[], null]); assert.ok(v.facts.length > 0);
  // A pass on never opens an ID.
  const { openSharedDocument, readSharedProfile } = await import('../../lib/profileShareStore.js');
  const pass = { ...w.share(), purpose: 'pass_on', documents_until: new Date(Date.now() + DAY).toISOString() };
  assert.deepEqual(await openSharedDocument(w.stack.db, { share: pass, viewer: { id: USER.id, label: 'S' }, documentId: 'doc-id' }), { ok: false, reason: 'missing' });
  assert.equal((await readSharedProfile(w.stack.db, { share: pass, viewer: { id: USER.id, label: 'S' } })).documents.some((d) => d.kind === 'id'), false);
  // A share without documents in scope opens none.
  assert.deepEqual(await openSharedDocument(w.stack.db, { share: { ...w.share(), scope: ['facts', 'checks'], documents_until: new Date(Date.now() + DAY).toISOString() }, viewer: { id: USER.id, label: 'S' }, documentId: 'doc-id' }), { ok: false, reason: 'closed' });
  w.stack.restore();
});

test('6. an application that is no longer open ends its share on its own', async () => {
  const w = await setup({ shared: true });
  assert.equal(P.applicationOpen({ state: 'submitted' }), true); assert.equal(P.applicationOpen({ state: 'shortlisted' }), true);
  for (const state of ['accepted', 'lease_signed', 'not_selected', 'withdrawn_by_applicant']) assert.equal(P.applicationOpen({ state }), false, state);
  assert.equal(P.applicationOpen({ decision_status: 'reject' }), false, 'set aside');
  assert.equal(P.applicationOpen({ withdrawn_at: null, decision_status: 'none' }), true); assert.equal(P.applicationOpen({ withdrawn_at: '2026-11-01' }), false);
  w.t.listing_applicants.find((j) => j.id === 'J1').state = 'accepted';
  const res = await w.realtor(view, { linkId: 'J1' });
  assert.deepEqual(res.body, { shared: true, ended: 'ended', message: 'This share has ended.' });
  assert.equal(w.share().status, 'expired'); assert.ok(w.share().ended_at);
  assert.equal(w.log().filter((l) => l.action === 'share_expired' && l.actor_type === 'system').length, 1);
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' })).code, 403);
  // A share with its own end date is over once that date passes.
  assert.equal(P.shareLive({ status: 'approved', ended_at: null, expires_at: new Date(Date.now() - 1000).toISOString() }), false);
  assert.equal(P.shareLive({ status: 'approved', ended_at: null, expires_at: null }), true);
  for (const status of ['pending', 'declined', 'revoked', 'expired']) assert.equal(P.shareLive({ status, ended_at: null }), false, status);
  w.stack.restore();
});

test('7. one tap apply writes the reuse record and counts in lib/kpis.js', async () => {
  const w = await setup();
  // The page fills the form from the signed in profile and is handed a ticket by the server.
  const tr = fakeRes(); await ticketRoute(fakeReq({ body: { source: 'profile' }, headers: w.maya.cookie }), tr);
  assert.equal(tr.body.ok, true);
  // The mirror writes where the answers came from (lib/prefillRecord.js), then the page asks for the share.
  const rec = await PR.recordPrefill(w.stack.db, { applicationId: 'A1', ticketId: tr.body.ticket, req: fakeReq({ headers: w.maya.cookie }) });
  assert.equal(rec.written, true);
  assert.deepEqual([w.a1.prefill_source, w.a1.prefill_profile_id, w.a1.prefill_profile_revision], ['profile', w.maya.p.id, 2], 'the source, the profile and its revision');
  assert.ok(w.a1.email_verified_at_submit, 'and that the email was proved at submit');
  const applied = await w.apply();
  assert.deepEqual(applied.body, { ok: true, shared: true });
  const sh = w.share();
  assert.deepEqual([sh.tenant_profile_id, sh.recipient_profile_id, sh.listing_id, sh.purpose, sh.status, sh.approved_via], [w.maya.p.id, USER.id, 'L1', 'application', 'approved', 'session'], 'one share: this tenant, this listing\'s realtor, approved by the tenant\'s own session');
  assert.equal(w.log().filter((l) => l.action === 'share_approved' && l.actor_type === 'tenant').length, 1);
  // The reuse record now names the kinds of document check the share carries: from the closed
  // list, in its order, and none of the planted kinds.
  assert.deepEqual(w.a1.reused_checks, ['identity_name_matches', 'income_annual_gross'], 'reused_checks holds the kinds the share carries');
  assert.ok(w.a1.reused_checks.every((k) => PROFILE_CHECK_KINDS.includes(k)));
  await w.apply();
  assert.equal(w.t.profile_shares.length, 1, 'a second tap makes no second share');
  assert.deepEqual(w.a1.reused_checks, ['identity_name_matches', 'income_annual_gross']);
  // The office counts her.
  const data = { prefillTracked: true, profiles: w.t.profiles.map((r) => ({ ...r, email: String(r.email).replace('@example.com', '@brokerage.ca') })), listings: w.t.listings, links: w.t.listing_applicants.map((j) => ({ ...j, state: 'submitted' })), applications: w.t.applications.map((a) => ({ ...a, email: String(a.email).replace('@example.com', '@mail.ca') })), events: [] };
  assert.equal(K.profileReuse(data).count, 1, 'profile reuse counts this tenant');
  assert.equal(K.profileReuse({ ...data, applications: data.applications.map((a) => ({ ...a, prefill_source: 'none' })) }).count, 0, 'and would not without the record');
  // The office's stricter count, reuse with documents, moves with reused_checks.
  assert.equal(K.profileReuse(data).withDocuments, 1, 'the reused documents count moves');
  assert.equal(K.profileReuse({ ...data, applications: data.applications.map((a) => ({ ...a, reused_checks: a.reused_checks ? [] : a.reused_checks })) }).withDocuments, 0, 'and would not with an empty list');
  // The realtor finds the share from the application's own record of its profile.
  assert.equal((await w.realtor(view, { linkId: 'J1', peek: true })).body.shared, true);
  const page = src('pages/apply/[token].js');
  assert.match(page, /const applyWithProfile = async \(\) => \{\s*\n\s*if \(!saved \|\| saved\.source !== 'profile' \|\| prefill\.state === 'loading'\) return;\s*\n\s*await applySavedProfile\(\);/, 'one tap fills from the profile through the same path that takes the ticket');
  assert.match(page, /body: JSON\.stringify\(saved\.source === 'profile' \? \{ source: 'profile' \}/, 'the ticket says profile');
  assert.match(page, /if \(oneTap\) \{ try \{ await fetch\('\/api\/tenant\/shares', \{ method: 'POST'[\s\S]{0,120}?body: JSON\.stringify\(\{ action: 'apply', inviteToken: g\.token, applicationNumber: g\.applicationNumber \}\)/, 'and the share is asked for after the application is saved');
  assert.match(page, /data-one-tap-share=""/, 'the review lists what the realtor sees from the profile');
  w.stack.restore();
});

test('8. the age rule holds on one tap apply', async () => {
  const STEPS = [{ keys: ['email'] }, { keys: ['fullName', 'dateOfBirth', 'phone'] }, { keys: [] }, { keys: [] }];
  const on = A.ageRuleFor('ON', A.AGE_ROLE.APPLICANT); const bc = A.ageRuleFor('BC', A.AGE_ROLE.APPLICANT);
  assert.equal(A.startStep({ form: { ageConfirmed: true } }, STEPS, on), 4, 'a stored yes in Ontario: straight to the review');
  for (const form of [{ ageConfirmed: false }, {}, { ageConfirmed: 'true' }, { ageConfirmed: null }]) assert.equal(A.startStep({ form }, STEPS, on), 2, 'no explicit yes: the age step first');
  assert.equal(A.startStep({ form: { ageConfirmed: true } }, STEPS, bc), bc.storedYesCounts ? 4 : 2, 'and in British Columbia only where a stored yes counts');
  const page = src('pages/apply/[token].js');
  assert.match(page, /const at = startStep\(\{ form: saved\.form \}, STEPS, ageRule\);\s*\n\s*setFromReview\(at !== STEPS\.length\);\s*\n\s*setStep\(at\);/, 'one tap starts where the rule says, and Continue returns to the review');
  assert.match(page, /ageConfirmed: ageForSubmit\(form, ageRule\)/, 'the submission carries the page\'s own age answer, as every submission does');
  // The server refuses a submission without an explicit yes, however it was filled.
  for (const body of [{}, { ageConfirmed: false }, { ageConfirmed: 'true' }]) assert.deepEqual(A.submittedAge(body, on), { ok: false, error: A.AGE_NOT_CONFIRMED });
  assert.equal(A.submittedAge({ ageConfirmed: true }, on).ok, true);
  assert.match(src('pages/api/generate.js'), /const age = submittedAge\(formData, ageRuleFor\(province, AGE_ROLE\.APPLICANT\)\);/);
  // The profile never holds a date of birth to send: the share and the profile's form have none.
  assert.equal(PROFILE_FACT_KEYS.some((k) => /birth|age/i.test(k)), false);
});

test('9. a tenant can never approve or stop a share on another tenant\'s profile; no realtor route writes a share', async () => {
  const w = await setup();
  const omar = await w.tenant('omar@example.com', { fullName: 'Omar Haddad' });
  // Omar names Maya's application: refused, and nothing is shared from either profile.
  const stolen = await w.apply(omar);
  assert.equal(stolen.code, 403); assert.equal(w.t.profile_shares.length, 0);
  // A profile id in the request is never read.
  const forced = await w.tenantCall(omar, 'POST', { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: w.a1.application_number, tenantProfileId: w.maya.p.id, profileId: w.maya.p.id });
  assert.equal(forced.code, 403); assert.equal(w.t.profile_shares.length, 0);
  await w.apply();
  assert.equal(w.share().tenant_profile_id, w.maya.p.id);
  // Omar cannot stop Maya's share, and does not see it.
  assert.equal((await w.tenantCall(omar, 'POST', { action: 'stop', id: w.share().id })).code, 404);
  assert.equal(w.share().status, 'approved');
  assert.deepEqual((await w.tenantCall(omar, 'GET')).body.shares, []);
  // An application that is not on the invite's listing makes no share.
  const a6 = w.t.applications.find((a) => a.id === 'A6'); a6.email = 'maya@example.com';
  assert.equal((await w.apply(w.maya, a6.application_number)).code, 403);
  // No session: 401. A realtor's session is not a tenant's.
  for (const [method, body] of [['GET', null], ['POST', { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: w.a1.application_number }], ['POST', { action: 'stop', id: w.share().id }]]) {
    const res = fakeRes(); w.stack.user = USER; await tenantShares(fakeReq({ method, body }), res); assert.equal(res.code, 401, `${method} ${body ? body.action : ''}`);
  }
  assert.equal(w.t.profile_shares.length, 1);
  const route = code('pages/api/tenant/shares.js');
  assert.match(route, /const p = await sessionProfile\(req\);\s*\n\s*if \(!p\) return res\.status\(401\)/);
  assert.doesNotMatch(route, /req\.body\??\.(tenantProfileId|profileId|recipient)|req\.query|requireEntitlement|withRealtor/, 'the profile is the session\'s; the realtor and the listing come from the invite');
  assert.match(route, /approveApplicationShare\(admin, \{ tenantProfileId: p\.id, recipientProfileId: listing\.profile_id, listingId: listing\.id \}\)/);
  // Only the tenant's route approves or stops; the realtor routes only read and let a share end on its own.
  const writers = [...walk('pages/api/'), ...walk('lib/')].filter((f) => /approveApplicationShare|stopShare\(/.test(code(f)) && f !== 'lib/profileShares.js');
  assert.deepEqual(writers, ['pages/api/tenant/shares.js']);
  const touching = [...walk('pages/api/'), ...walk('lib/')].filter((f) => /from\(SHARES\)|from\('profile_shares'\)/.test(code(f)));
  assert.deepEqual(touching, ['lib/profileShares.js'], 'one file touches the table');
  assert.equal((code('lib/profileShares.js').match(/status: 'approved'/g) || []).filter(Boolean).length >= 1, true);
  for (const f of ['lib/profileShares.js', 'lib/profileShareStore.js', 'lib/profileShareRoutes.js', 'pages/api/profile-shares/view.js', 'pages/api/profile-shares/open.js', 'pages/api/tenant/shares.js', 'components/dashboard/SharedProfile.js']) assert.doesNotMatch(code(f), /owner_token|ownerToken/, `${f}: no owner token`);
  w.stack.restore();
});

test('10. before db/019 has run: no share is made, nothing is listed, nothing is thrown', async () => {
  const w = await setup({ shares: false });
  assert.deepEqual((await w.apply()).body, { ok: true, shared: false }, 'the application stands, nothing is shared');
  const seen = await w.tenantCall(w.maya, 'GET');
  assert.equal(seen.code, 200); assert.deepEqual([seen.body.available, seen.body.shares], [false, []]);
  assert.deepEqual((await w.realtor(view, { linkId: 'J1' })).body, { shared: false });
  assert.equal((await w.realtor(open, { linkId: 'J1', documentId: 'doc-pay' })).code, 404);
  w.stack.restore();
});

test('11. the realtor\'s timeline says the tenant shared their profile, and that they stopped', async () => {
  const w = await setup({ shared: true });
  const E = await import('../../lib/eventTypes.js');
  const events = () => (w.t.events || []).filter((e) => /^profile_share_/.test(e.type));
  assert.deepEqual(events().map((e) => e.type), ['profile_share_approved'], 'one event when the one tap apply makes the share');
  const made = events()[0];
  assert.deepEqual([made.profile_id, made.listing_id, made.application_id], [USER.id, 'L1', 'A1'], 'on the realtor\'s timeline, on that applicant');
  assert.deepEqual(Object.keys(made.payload).sort(), ['applicantName', 'linkId', 'listingName'], 'it names the tenant and the listing and where to go, nothing else');
  assert.deepEqual([made.payload.applicantName, made.payload.listingName, made.payload.linkId], [w.a1.full_name, '210 Carlaw Ave, Unit 4', 'J1']);
  assert.equal(E.eventTitle(made), `${w.a1.full_name} shared their profile with you for 210 Carlaw Ave, Unit 4`);
  // A second tap makes no second share and no second event.
  await w.apply();
  assert.equal(events().length, 1);
  // The tenant stops sharing.
  assert.equal((await w.tenantCall(w.maya, 'POST', { action: 'stop', id: w.share().id })).code, 200);
  assert.deepEqual(events().map((e) => e.type), ['profile_share_approved', 'profile_share_revoked']);
  const stopped = events()[1];
  assert.deepEqual([stopped.profile_id, stopped.listing_id, stopped.application_id], [USER.id, 'L1', 'A1']);
  assert.deepEqual(Object.keys(stopped.payload).sort(), ['applicantName', 'linkId', 'listingName']);
  assert.equal(E.eventTitle(stopped), `${w.a1.full_name} stopped sharing their profile for 210 Carlaw Ave, Unit 4`);
  // No fact of the profile, no planted key and no token is in either event.
  const sent = JSON.stringify(events());
  for (const v of [TYPED.email, TYPED.phone, TYPED.employer, TYPED.annualIncome, TYPED.previousAddress, 'PLANTED', 'OWNERTOKENSECRET', 'HASHSECRET', w.maya.p.id]) assert.equal(sent.includes(v), false, `no ${v} in a timeline event`);
  // A share that ended on its own, or was already stopped, writes no revoked event.
  assert.equal((await w.tenantCall(w.maya, 'POST', { action: 'stop', id: w.share().id })).code, 404);
  assert.equal(events().length, 2);
  // The vocabulary, the first migration and the new one hold the same two types.
  for (const type of ['profile_share_approved', 'profile_share_revoked']) {
    assert.ok(E.EVENT_TYPES.includes(type));
    assert.match(src('db/events.sql'), new RegExp(`'${type}'`)); assert.match(src('db/020-share-events.sql'), new RegExp(`'${type}'`));
  }
  assert.match(src('db/020-share-events.sql'), /IF to_regclass\('public\.events'\) IS NULL THEN RETURN; END IF;[\s\S]*?IF cdef IS NOT NULL AND cdef LIKE '%profile_share_revoked%' THEN RETURN; END IF;/, 'guarded as db/012 is, and rewritten once');
  const listed = [...src('db/020-share-events.sql').split('CHECK (type IN (')[1].split('));')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(listed, [...E.EVENT_TYPES], 'db/020 holds the whole vocabulary, in order');
  // The events are written by the share lifecycle alone, through the one event writer.
  const lib = code('lib/profileShares.js');
  assert.match(lib, /await noteOnTimeline\(admin, share, 'profile_share_approved'\);/); assert.match(lib, /await noteOnTimeline\(admin, data, 'profile_share_revoked'\);/);
  assert.match(lib, /select\('id, full_name, prefill_profile_id, tenant_profile_id'\)/, 'three columns of the application and its id, never the owner token');
  w.stack.restore();
});

test('12. a share request that fails after submit offers one retry of the share alone', () => {
  const page = src('pages/apply/[token].js');
  assert.match(page, /noWidow\("Your application was sent\. Sharing your profile didn't go through\."\)/, 'the words the tenant reads');
  assert.match(page, /data-share-retry="" onClick=\{retryShare\}[^>]*>\s*<Pending[^>]*>Try again<\/Pending>/, 'with a Try again button');
  assert.match(page, /setShareState\(r\.ok && j\.shared \? 'shared' : 'failed'\); \}\); \} catch \(e\) \{ setShareState\('failed'\); \}/, 'a refused, unshared or unreachable request is a failure');
  const retry = page.slice(page.indexOf('const retryShare = async () => {'), page.indexOf('const applyWithProfile = async () => {'));
  assert.ok(retry.length > 0 && retry.length < 1200);
  assert.match(retry, /if \(shareState !== 'failed' \|\| !g\) return;\s*\n\s*setShareState\('retrying'\);/, 'only from failed, so the retry runs once');
  assert.match(retry, /setShareState\(r\.ok && j\.shared \? 'retried' : 'gave-up'\);/, 'and a second failure offers no third try');
  assert.match(page, /\{shareState !== 'gave-up' && <button type="button" data-share-retry=""/);
  // The retry asks for the share and nothing else: the application is never sent twice.
  assert.equal((retry.match(/fetch\(/g) || []).length, 1);
  assert.match(retry, /fetch\('\/api\/tenant\/shares', \{ method: 'POST'[\s\S]{0,120}?body: JSON\.stringify\(\{ action: 'apply', inviteToken: g\.token, applicationNumber: g\.applicationNumber \}\)/);
  assert.doesNotMatch(retry, /runSubmitChain|saveToListing|\/api\/generate|\/api\/applications\/mirror|setStatus|prefillTicket/, 'no path back to the submit chain');
});
