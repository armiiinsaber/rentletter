// Sharing with the listing agent (lib/profileShares.js, pages/api/tenant/shares.js,
// pages/api/profile-shares/shared-with-me.js, db/024-share-roles.sql):
//   · a tenant shares their profile with the listing agent of a unit, beside their realtor;
//   · the listing agent sees the same view, with the screening score;
//   · the tenant's profile strength never reaches any realtor response;
//   · the ID never opens for a listing agent;
//   · Stop sharing works per role;
//   · no realtor can create or approve a share on a tenant's behalf;
//   · a listing agent invited by email sees nothing before joining, and nothing until the tenant shares;
//   · each realtor's timeline says which kind of share it was; the app before db/024; the words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeReq, fakeRes, findKeys } = await import('../helpers/fakeStack.mjs');
const { tables, USER, OTHER, INVITE_TOKEN } = await import('./fixture.mjs');
const S = await import('../../lib/tenantProfileStore.js');
const P = await import('../../lib/profileShares.js');
const E = await import('../../lib/eventTypes.js');
const tenantShares = (await import('../../pages/api/tenant/shares.js')).default;
const personal = (await import('../../pages/api/tenant/personal.js')).default;
const view = (await import('../../pages/api/profile-shares/view.js')).default;
const mine = (await import('../../pages/api/profile-shares/shared-with-me.js')).default;

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else if (/\.js$/.test(f)) out.push(rel); } return out; };

const TYPED = { fullName: 'Maya Okafor', email: 'maya@example.com', phone: '4165550142', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000', yearsAtJob: '3', previousAddress: '214 Shaw St, Unit 3', moveInDate: '2027-01-01' };
const THIRD = { id: 'realtor-3', email: 'third@example.com', user_metadata: {} };
const DAY = 86400000;

// Sarah (USER) is Maya's realtor: Maya applied to Sarah's listing L1 (applicant J1, application
// A1) with her profile. Omar (OTHER) is the listing agent of that unit. Priya is a third realtor.
async function setup({ withRealtorShare = true, absent = [] } = {}) {
  const t = tables();
  Object.assign(t, { tenant_profiles: [], tenant_profile_shareable: [], tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [], profile_shares: [], profile_share_invites: [], events: [] });
  t.tenant_profile_personal = t.tenant_profiles;
  Object.assign(t.profiles.find((p) => p.id === USER.id), { invite_code: 'K7M2Q9XW4TPB3HNC', circle_findable: null });
  t.profiles = t.profiles.filter((p) => p.id === USER.id);
  t.profiles.push(
    { id: OTHER.id, email: OTHER.email, full_name: 'Omar Haddad', brokerage: 'Lakeview Realty Inc., Brokerage', plan: 'founding', created_at: '2026-05-01T15:00:00Z', circle_findable: null, phone: '416 555 0177' },
    { id: THIRD.id, email: THIRD.email, full_name: 'Priya Raman', brokerage: 'Lakeview Realty Inc., Brokerage', plan: 'founding', created_at: '2026-05-01T15:00:00Z', circle_findable: null },
    { id: 'realtor-hidden', email: 'hidden@example.com', full_name: 'Omar Hidden', brokerage: 'Lakeview Realty Inc., Brokerage', plan: 'founding', created_at: '2026-05-01T15:00:00Z', circle_findable: false },
  );
  if (absent.includes('invites')) delete t.profile_share_invites;
  const stack = installFakeStack({ tables: t, user: USER, env: { TENANT_VAULT_ENABLED: null }, ...(absent.includes('role') ? { absentColumns: ['role'] } : {}) });
  const p = S.blankProfile('maya@example.com'); p.facts = { ...TYPED }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z'; p.profileRevision = 2;
  const a1 = t.applications.find((a) => a.id === 'A1');
  p.applications = [{ applicationNumber: a1.application_number, ownerToken: 'OWNERTOKENSECRET' }];
  await S.saveProfile(p);
  const token = await S.createSession(p.id);
  stack.kv.values[`tprofile_id:${p.id}`] = JSON.stringify(p.emailKey);
  const cookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(token)}` };
  t.tenant_profile_shareable.push({ id: p.id, facts: { ...TYPED }, facts_updated_at: '2026-11-01T15:00:00.000Z', email_verified_at: '2026-11-02T15:00:00.000Z' });
  Object.assign(a1, { email: 'maya@example.com', prefill_profile_id: null, tenant_profile_id: p.id, owner_token: 'OWNERTOKENSECRET' });
  const doc = (id, kind) => ({ id, tenant_profile_id: p.id, storage_path: `${p.id}/${id}.pdf`, kind, mime: 'application/pdf', bytes: 1200, uploaded_at: '2026-11-10T16:00:00.000Z', read_at: '2026-11-10T16:00:00.000Z', expires_at: new Date(Date.now() + 80 * DAY).toISOString(), deleted_at: null });
  t.tenant_profile_documents.push(doc('doc-pay', 'income'), doc('doc-id', 'id'));
  for (const d of t.tenant_profile_documents) await stack.db.storage.from('tenant-vault').upload(d.storage_path, Buffer.from('%PDF-1.4 tenant file'), { contentType: 'application/pdf' });
  t.tenant_profile_checks.push({ id: 'c1', tenant_profile_id: p.id, kind: 'identity_name_matches', value: { matches: true }, agrees_with_typed: true, source_kind: 'id', source_document_id: 'doc-id', read_at: '2026-11-03T16:00:00.000Z', fresh_until: '2027-11-03T16:00:00.000Z' });
  stack.kv.values[`linvite:${INVITE_TOKEN}`] = { profileId: USER.id, listingId: 'L1', realtorName: 'Sarah Chen' };
  const tenant = async (method, body, headers = cookie, route = tenantShares) => { const res = fakeRes(); await route(fakeReq({ method, body, headers }), res); return res; };
  const realtor = async (route, body, user = USER) => {
    // Another realtor signed in: the same tables, store, bucket and mailbox behind that session.
    if (user !== USER) { const other = installFakeStack({ tables: t, user, kv: stack.kv, env: { TENANT_VAULT_ENABLED: null } }); Object.assign(other.db.objects, stack.db.objects); other.resend.sent = stack.resend.sent; }
    try { const res = fakeRes(); await route(fakeReq({ body }), res); return res; } finally { globalThis.__rlStack = stack; }
  };
  const rl = a1.application_number;
  if (withRealtorShare) assert.equal((await tenant('POST', { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: rl })).body.shared, true);
  const agentShare = () => t.profile_shares.find((s) => s.role === 'listing_agent');
  return { stack, t, p, a1, rl, cookie, tenant, realtor, agentShare, log: () => t.profile_access_log };
}

test('1. a tenant shares their profile with the listing agent of a unit, beside their realtor', async () => {
  const w = await setup();
  // The units are the tenant's own open applications; the search is by name or brokerage.
  const start = (await w.tenant('GET')).body;
  assert.deepEqual(start.agents.units, [{ applicationNumber: w.rl, listingName: start.agents.units[0].listingName, realtorName: 'Sarah Chen' }]);
  assert.ok(start.agents.units[0].listingName);
  const found = await w.tenant('POST', { action: 'agent-search', applicationNumber: w.rl, q: 'omar' });
  assert.deepEqual(found.body.results, [{ id: OTHER.id, name: 'Omar Haddad', brokerage: 'Lakeview Realty Inc., Brokerage', initials: 'OH' }], 'a name, a brokerage and initials; never a realtor who turned findable off');
  assert.doesNotMatch(JSON.stringify(found.body), /@example|416 555/, 'no email, no phone');
  assert.deepEqual((await w.tenant('POST', { action: 'agent-search', applicationNumber: w.rl, q: 'Sarah' })).body.results, [], 'their own realtor on that unit is not offered');
  assert.equal((await w.tenant('POST', { action: 'agent-search', applicationNumber: w.rl, q: 'Lakeview' })).body.results.length, 2);
  assert.equal((await w.tenant('POST', { action: 'agent-search', applicationNumber: w.rl, q: 'o' })).body.tooShort, true);
  // The share: the same table, the same approval, the same log line as a share with their realtor.
  const shared = await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  assert.deepEqual([shared.code, shared.body], [200, { ok: true, shared: true }]);
  const row = w.agentShare();
  assert.deepEqual({ tenant: row.tenant_profile_id, recipient: row.recipient_profile_id, listing: row.listing_id, purpose: row.purpose, status: row.status, via: row.approved_via, scope: row.scope }, { tenant: w.p.id, recipient: OTHER.id, listing: 'L1', purpose: 'application', status: 'approved', via: 'session', scope: ['facts', 'checks', 'documents'] });
  assert.ok(Date.parse(row.documents_until) - Date.parse(row.approved_at) === 14 * DAY, 'documents for 14 days');
  assert.equal(w.log().filter((l) => l.action === 'share_approved' && l.share_id === row.id && l.actor_type === 'tenant').length, 1);
  // Both at once for the same unit, each with its role.
  assert.equal(w.t.profile_shares.length, 2);
  const list = (await w.tenant('GET')).body.shares;
  assert.deepEqual(list.map((s) => [s.role, s.roleLabel, s.realtorName, s.live]).sort(), [['listing_agent', 'Listing agent', 'Omar Haddad', true], ['realtor', 'Your realtor', 'Sarah Chen', true]]);
  assert.equal(new Set(list.map((s) => s.listingName)).size, 1, 'the same unit');
  // Asking again keeps the one share; their own realtor cannot be made the listing agent.
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  assert.equal(w.t.profile_shares.length, 2);
  const self = await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: USER.id });
  assert.equal(self.code, 400); assert.equal(w.t.profile_shares.length, 2);
  assert.equal((await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: 'realtor-nobody' })).code, 404);
  assert.equal((await w.tenant('POST', { action: 'agent-share', applicationNumber: 'RL-NOTMINE-0000', agentId: OTHER.id })).code, 404);
  // The same library and the same table: nothing parallel.
  assert.match(code('lib/profileShares.js'), /const ins = await admin\.from\(SHARES\)\.insert\(row\)\.select\('\*'\)\.maybeSingle\(\);/);
  assert.match(code('pages/api/tenant/shares.js'), /approveListingAgentShare\(admin, \{ tenantProfileId: p\.id, recipientProfileId, listing \}\)/);
});

test('2. the listing agent sees the same view as the tenant\'s realtor, with the screening score', async () => {
  const w = await setup();
  await w.tenant('POST', { action: 'about', text: 'I coordinate a clinic and cycle to work. ABOUT-MARKER' }, w.cookie, personal);
  await w.tenant('POST', { action: 'prepay', months: 3 }, w.cookie, personal);
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  // The list says which unit and since when, and nothing of the tenant; it reads and logs nothing.
  const before = w.log().length;
  const list = await w.realtor(mine, { action: 'list' }, OTHER);
  assert.equal(list.code, 200); assert.equal(list.body.shares.length, 1);
  assert.deepEqual(Object.keys(list.body.shares[0]).sort(), ['ended', 'id', 'listingName', 'sharedAt']);
  assert.doesNotMatch(JSON.stringify(list.body), /Maya|maya@|ABOUT-MARKER/);
  assert.equal(w.log().length, before);
  // The view: the same facts, checks, words, offer and files the tenant's realtor is sent.
  const agent = (await w.realtor(mine, { action: 'view', shareId: w.agentShare().id }, OTHER)).body;
  const own = (await w.realtor(view, { linkId: 'J1' })).body;
  for (const k of ['facts', 'checks', 'documents', 'about', 'prepayMonths', 'photo']) assert.deepEqual(agent[k], own[k], k);
  assert.deepEqual(Object.keys(agent).sort(), [...Object.keys(own), 'role', 'screening'].sort());
  assert.equal(agent.role, 'listing_agent'); assert.equal(agent.about.includes('ABOUT-MARKER'), true); assert.equal(agent.prepayMonths, 3);
  // The screening score: Fit as the application holds it on that listing, and nothing else of the file.
  const fit = (await import('../../lib/listingReportData.js').then((R) => R.loadReportContext(w.stack.rls, w.stack.db, 'L1', USER.id))).active.find((a) => a.linkId === 'J1').application.fit;
  assert.equal(typeof agent.screening.score, 'number');
  assert.deepEqual(agent.screening, { score: Number(fit.score), label: fit.label, assessed: fit.assessed ?? null, of: fit.of ?? null, listingName: agent.screening.listingName });
  assert.deepEqual(Object.keys(agent.screening).sort(), ['assessed', 'label', 'listingName', 'of', 'score']);
  assert.deepEqual(findKeys(agent, ['pillars', 'basis', 'notes', 'decision', 'decisionStatus', 'rank', 'confirmations', 'criteria', 'owner_token', 'ownerToken', 'linkId']), [], 'no checklist, note, decision or rank');
  assert.equal(own.screening, undefined, 'the realtor\'s own shared view is unchanged: their Fit is on their own card');
  // Logged first, in the tenant's log, under the listing agent's name.
  const line = w.log().filter((l) => l.share_id === w.agentShare().id && l.actor_type === 'realtor');
  assert.deepEqual(line.map((l) => [l.action, l.actor_label]), [['profile_viewed', 'Omar Haddad, Lakeview Realty Inc., Brokerage, listing agent']]);
  // The tenant sees that view under the listing agent's share.
  const mineShare = (await w.tenant('GET')).body.shares.find((s) => s.role === 'listing_agent');
  assert.equal(mineShare.views.length, 1);
  assert.match(code('components/dashboard/SharedProfile.js'), /<div style=\{label\}>Screening score<\/div>/);
});

test('3. the tenant\'s profile strength never reaches any realtor response', async () => {
  const w = await setup();
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const strength = (await w.tenant('GET', null, w.cookie, personal)).body.strength;
  assert.ok(strength && typeof strength.percent === 'number', 'the tenant has one, on their own page');
  const answers = [
    ['the listing agent\'s list', (await w.realtor(mine, { action: 'list' }, OTHER)).body],
    ['the listing agent\'s view', (await w.realtor(mine, { action: 'view', shareId: w.agentShare().id }, OTHER)).body],
    ['the listing agent\'s document open', (await w.realtor(mine, { action: 'open', shareId: w.agentShare().id, documentId: 'doc-pay' }, OTHER)).body],
    ['the realtor\'s view', (await w.realtor(view, { linkId: 'J1' })).body],
    ['the realtor\'s peek', (await w.realtor(view, { linkId: 'J1', peek: true })).body],
  ];
  for (const [name, body] of answers) {
    assert.deepEqual(findKeys(body, ['strength', 'percent', 'steps', 'profileStrength', 'done', 'total']), [], name);
    assert.doesNotMatch(JSON.stringify(body), /strength|"percent"|Add a photo|Write about me|Fill in your details/i, name);
  }
  // On the server, not only on the screen: nothing a realtor route runs can reach it.
  const users = [...walk('lib/'), ...walk('pages/')].filter((f) => /profileStrength|profileStrength\.js/.test(code(f)));
  assert.deepEqual(users.sort(), ['lib/profileStrength.js', 'pages/api/tenant/personal.js']);
  for (const f of ['pages/api/profile-shares/shared-with-me.js', 'pages/api/profile-shares/view.js', 'pages/api/profile-shares/open.js', 'lib/profileShares.js', 'lib/profileShareStore.js', 'lib/profileShareRoutes.js']) assert.doesNotMatch(code(f), /strength|tenant\/personal|getPersonal\(/i, f);
  assert.doesNotMatch(code('components/dashboard/SharedProfile.js'), /strength/i);
  assert.doesNotMatch(code('components/dashboard/SharedWithMe.js'), /strength/i);
  // The screening score is not the strength: it comes from the realtor's listing, never from the profile.
  assert.match(code('lib/profileShares.js'), /const fit = mine && mine\.application \? mine\.application\.fit : null;/);
});

test('4. the ID never opens for a listing agent; income and employment do, for 14 days', async () => {
  const w = await setup();
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const id = w.agentShare().id;
  const seen = (await w.realtor(mine, { action: 'view', shareId: id }, OTHER)).body;
  assert.deepEqual(seen.documents.map((d) => d.kind), ['income'], 'the ID is not on the list');
  assert.ok(seen.checks.some((c) => c.kind === 'identity_name_matches'), 'the identity check shows as a fact');
  const refused = await w.realtor(mine, { action: 'open', shareId: id, documentId: 'doc-id' }, OTHER);
  assert.equal(refused.code, 404); assert.equal(refused.body.url, undefined);
  assert.equal(w.log().some((l) => l.action === 'document_opened' && l.document_id === 'doc-id'), false);
  const ok = await w.realtor(mine, { action: 'open', shareId: id, documentId: 'doc-pay' }, OTHER);
  assert.equal(ok.code, 200); assert.match(ok.body.url, /^https:\/\/signed\.example\/tenant-vault\//);
  assert.deepEqual(w.log().filter((l) => l.action === 'document_opened').map((l) => [l.share_id, l.document_id]), [[id, 'doc-pay']]);
  // After the 14 days the files close, and the profile still shows.
  w.agentShare().documents_until = new Date(Date.now() - 1000).toISOString();
  assert.equal((await w.realtor(mine, { action: 'open', shareId: id, documentId: 'doc-pay' }, OTHER)).code, 403);
  assert.deepEqual((await w.realtor(mine, { action: 'view', shareId: id }, OTHER)).body.documents, []);
  // It is the same reader as for the tenant's realtor, so the same rule.
  assert.match(code('pages/api/profile-shares/shared-with-me.js'), /const out = await openSharedDocument\(admin, \{ share, viewer, documentId \}\);/);
});

test('5. Stop sharing works per role: one ends, the other goes on', async () => {
  const w = await setup();
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const agentId = w.agentShare().id; const realtorId = w.t.profile_shares.find((s) => s.role !== 'listing_agent').id;
  // Stop the listing agent's: theirs ends at once, the realtor's goes on.
  assert.equal((await w.tenant('POST', { action: 'stop', id: agentId })).code, 200);
  const ended = (await w.realtor(mine, { action: 'view', shareId: agentId }, OTHER)).body;
  assert.deepEqual(ended, { shared: true, role: 'listing_agent', ended: 'stopped', message: 'The tenant stopped sharing their profile.' });
  assert.equal((await w.realtor(mine, { action: 'open', shareId: agentId, documentId: 'doc-pay' }, OTHER)).code, 403);
  assert.ok((await w.realtor(view, { linkId: 'J1' })).body.facts.length > 0, 'their realtor still sees the profile');
  assert.deepEqual((await w.tenant('GET')).body.shares.map((s) => [s.role, s.live]).sort(), [['listing_agent', false], ['realtor', true]]);
  // Share again with the listing agent, then stop the realtor's: the listing agent's goes on.
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const again = w.t.profile_shares.filter((s) => s.role === 'listing_agent' && s.status === 'approved')[0];
  assert.ok(again && again.id !== agentId, 'a new share, asked of the tenant again');
  assert.equal((await w.tenant('POST', { action: 'stop', id: realtorId })).code, 200);
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.ended, 'stopped');
  assert.ok((await w.realtor(mine, { action: 'view', shareId: again.id }, OTHER)).body.facts.length > 0);
  // When the application is no longer open, the listing agent's share ends on its own.
  w.t.listing_applicants.find((j) => j.id === 'J1').withdrawn_at = new Date().toISOString();
  const closed = (await w.realtor(mine, { action: 'view', shareId: again.id }, OTHER)).body;
  assert.equal(closed.ended, 'ended'); assert.equal(closed.facts, undefined);
  assert.equal(again.status, 'expired');
});

test('6. no realtor can create or approve a share on a tenant\'s behalf', async () => {
  const w = await setup({ withRealtorShare: false });
  // A realtor's session is not a tenant's: the tenant's route answers 401 to it, whatever it sends.
  for (const body of [{ action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id }, { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id, tenantProfileId: w.p.id }, { action: 'agent-share-invited', id: 'x' }, { action: 'agent-invite', applicationNumber: w.rl, email: 'omar@lakeview.ca' }, { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: w.rl }]) {
    for (const user of [USER, OTHER]) { const res = await w.realtor(tenantShares, body, user); assert.equal(res.code, 401, `${user.id} ${body.action}`); }
  }
  assert.equal(w.t.profile_shares.length, 0); assert.equal(w.t.profile_share_invites.length, 0);
  // The listing agent's route only reads: it has no action that makes, approves or changes a share.
  for (const action of ['approve', 'share', 'request', 'create', 'agent-share', 'stop']) assert.equal((await w.realtor(mine, { action, shareId: 'x', tenantProfileId: w.p.id }, OTHER)).code, 400, action);
  assert.equal(w.t.profile_shares.length, 0);
  const route = code('pages/api/profile-shares/shared-with-me.js');
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|approve[A-Z]\w*\(|inviteListingAgent|stopShare/, 'no write of a share');
  assert.match(route, /export default withRealtor\(/);
  assert.match(route, /if \(String\(share\.recipient_profile_id\) !== String\(user\.id\)\) return res\.status\(404\)/, 'the explicit ownership check');
  // The functions that make a share are called by the tenant's route and by nothing else.
  for (const fn of ['approveListingAgentShare', 'approveApplicationShare', 'inviteListingAgent']) {
    const callers = [...walk('pages/'), ...walk('components/')].filter((f) => new RegExp(`\\b${fn}\\(`).test(code(f)));
    assert.deepEqual(callers, ['pages/api/tenant/shares.js'], fn);
  }
  assert.match(code('pages/api/tenant/shares.js'), /const p = await sessionProfile\(req\);\s*\n\s*if \(!p\) return res\.status\(401\)/);
  // With a share in place: a realtor it does not name sees nothing through it, and learns nothing from the answer.
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const id = w.agentShare().id; const lines = w.log().length;
  for (const user of [USER, THIRD]) {
    const res = await w.realtor(mine, { action: 'view', shareId: id }, user);
    assert.equal(res.code, 404, user.id);
    assert.deepEqual(res.body, (await w.realtor(mine, { action: 'view', shareId: 'no-such-share' }, user)).body);
    assert.deepEqual((await w.realtor(mine, { action: 'list' }, user)).body.shares, []);
    assert.equal((await w.realtor(mine, { action: 'open', shareId: id, documentId: 'doc-pay' }, user)).code, 404);
  }
  assert.equal(w.log().length, lines, 'and nothing was read');
  // Another tenant cannot share Maya's profile, or share for Maya's application.
  const other = S.blankProfile('omar.tenant@example.com'); other.facts = { fullName: 'Omar Tenant' }; await S.saveProfile(other);
  const otherCookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(await S.createSession(other.id))}` };
  w.stack.kv.values[`tprofile_id:${other.id}`] = JSON.stringify(other.emailKey);
  assert.equal((await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: THIRD.id }, otherCookie)).code, 404);
  assert.equal((await w.tenant('POST', { action: 'stop', id }, otherCookie)).code, 404);
  assert.equal(w.t.profile_shares.length, 1);
  // No session, no share.
  assert.equal((await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: THIRD.id }, {})).code, 401);
});

test('7. a listing agent invited by email sees nothing before joining, and nothing until the tenant shares', async () => {
  const w = await setup();
  const invited = await w.tenant('POST', { action: 'agent-invite', applicationNumber: w.rl, email: 'Nadia.Agent@Lakeshore.ca' });
  assert.deepEqual([invited.code, invited.body], [200, { ok: true, invited: true, emailed: true, joined: false }]);
  // One email, to that address, with the invite link of the realtor on that unit; no fact of the tenant beyond their name.
  const mail = w.stack.resend.sent;
  assert.equal(mail.length, 1); assert.equal(mail[0].to, 'nadia.agent@lakeshore.ca');
  assert.match(mail[0].text, /https:\/\/rentletter\.ca\/join\?invite=K7M2Q9XW4TPB3HNC/, 'their realtor\'s invite link');
  assert.match(mail[0].text, /Maya Okafor would like to share their rental profile with you/);
  assert.match(mail[0].text, /Nothing has been shared yet/);
  assert.doesNotMatch(`${mail[0].text}${mail[0].html}`, /85000|4165550142|maya@example|Northwind|214 Shaw|OWNERTOKEN/);
  // Nothing is shared: no share row exists, and there is no account to see anything.
  assert.equal(w.t.profile_shares.filter((s) => s.role === 'listing_agent').length, 0);
  assert.deepEqual(w.t.profile_share_invites.map((v) => [v.email, v.status, v.listing_id]), [['nadia.agent@lakeshore.ca', 'sent', 'L1']]);
  const waiting = (await w.tenant('GET')).body.agents.invites;
  assert.deepEqual(waiting.map((v) => [v.email, v.joined]), [['nadia.agent@lakeshore.ca', null]]);
  const early = await w.tenant('POST', { action: 'agent-share-invited', id: waiting[0].id });
  assert.equal(early.code, 409); assert.equal(w.t.profile_shares.filter((s) => s.role === 'listing_agent').length, 0, 'the tenant cannot share with nobody');
  // Sending again does not send a second email.
  await w.tenant('POST', { action: 'agent-invite', applicationNumber: w.rl, email: 'nadia.agent@lakeshore.ca' });
  assert.equal(w.stack.resend.sent.length, 1); assert.equal(w.t.profile_share_invites.length, 1);
  // She joins. Joining alone shares nothing: her list is empty and there is still no share.
  const NADIA = { id: 'realtor-nadia', email: 'nadia.agent@lakeshore.ca', user_metadata: {} };
  w.t.profiles.push({ id: NADIA.id, email: NADIA.email, full_name: 'Nadia Farouk', brokerage: 'Lakeshore Realty', plan: 'founding', created_at: new Date().toISOString(), circle_findable: null });
  assert.deepEqual((await w.realtor(mine, { action: 'list' }, NADIA)).body.shares, []);
  assert.equal(w.t.profile_shares.filter((s) => s.role === 'listing_agent').length, 0);
  // The tenant's page says she is there, and offers Share. Only that tap shares.
  const joined = (await w.tenant('GET')).body.agents.invites[0];
  assert.deepEqual(joined.joined, { id: NADIA.id, name: 'Nadia Farouk', brokerage: 'Lakeshore Realty', initials: 'NF' });
  assert.equal((await w.tenant('POST', { action: 'agent-share-invited', id: joined.id })).code, 200);
  assert.equal(w.agentShare().recipient_profile_id, NADIA.id);
  assert.equal(w.t.profile_share_invites[0].status, 'shared');
  assert.ok((await w.realtor(mine, { action: 'view', shareId: w.agentShare().id }, NADIA)).body.facts.length > 0, 'now she sees it');
  // An invite the tenant cancels can never become a share; and an invite is the tenant's own.
  const w2 = await setup();
  await w2.tenant('POST', { action: 'agent-invite', applicationNumber: w2.rl, email: 'x@lakeshore.ca' });
  const inviteId = w2.t.profile_share_invites[0].id;
  assert.equal((await w2.tenant('POST', { action: 'agent-invite-cancel', id: inviteId })).code, 200);
  w2.t.profiles.push({ id: 'realtor-x', email: 'x@lakeshore.ca', full_name: 'X Agent', plan: 'founding' });
  assert.equal((await w2.tenant('POST', { action: 'agent-share-invited', id: inviteId })).code, 404);
  assert.equal(w2.t.profile_shares.filter((s) => s.role === 'listing_agent').length, 0);
  assert.equal((await w2.tenant('POST', { action: 'agent-invite', applicationNumber: w2.rl, email: 'not an email' })).code, 400);
  // No signup code makes a share: the callback and the first touch library do not know of shares.
  for (const f of ['pages/auth/callback.js', 'lib/signupSource.js', 'lib/realtorInvite.js', 'lib/circle.js']) assert.doesNotMatch(code(f), /profile_shares|profile_share_invites|approveListingAgentShare/, f);
});

test('8. each realtor\'s timeline says which kind of share it was', async () => {
  const w = await setup();
  await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  const forSarah = w.t.events.filter((e) => e.profile_id === USER.id && e.type === 'profile_share_approved');
  const forOmar = w.t.events.filter((e) => e.profile_id === OTHER.id && e.type === 'profile_share_approved');
  assert.equal(forSarah.length, 1); assert.equal(forOmar.length, 1);
  assert.equal(forSarah[0].payload.role, 'realtor'); assert.equal(forOmar[0].payload.role, 'listing_agent');
  assert.deepEqual(Object.keys(forOmar[0].payload).sort(), ['applicantName', 'listingName', 'role'], 'the tenant, the unit and the kind of share: no fact of the profile, no link into another realtor\'s listing');
  assert.equal(forOmar[0].listing_id ?? null, null, 'not placed on a listing that is not theirs');
  assert.equal(E.eventTitle(forOmar[0]), `${forOmar[0].payload.applicantName} shared their profile with you as listing agent for ${forOmar[0].payload.listingName}`);
  assert.equal(E.eventTitle(forSarah[0]), `${forSarah[0].payload.applicantName} shared their profile with you for ${forSarah[0].payload.listingName}`);
  assert.doesNotMatch(JSON.stringify(forOmar[0].payload), /85000|maya@|4165550142|OWNERTOKEN/);
  // Stopped: the listing agent's timeline says so, with the role; the realtor's says nothing new.
  await w.tenant('POST', { action: 'stop', id: w.agentShare().id });
  const stopped = w.t.events.filter((e) => e.type === 'profile_share_revoked');
  assert.deepEqual(stopped.map((e) => [e.profile_id, e.payload.role]), [[OTHER.id, 'listing_agent']]);
  assert.match(E.eventTitle(stopped[0]), /stopped sharing their profile with you as listing agent for /);
  assert.ok(E.eventHref(forOmar[0], { home: '/dashboard', listing: (id) => `/listing/${id}`, profile: '/profile' }) === '/dashboard');
  // No new event type: db/020's two carry the role, so the events check is not rewritten.
  assert.doesNotMatch(code('db/024-share-roles.sql'), /events_type_check|public\.events/);
});

test('9. before db/024 has run the app works: a share with the realtor as before, none with a listing agent', async () => {
  const w = await setup({ absent: ['role', 'invites'] });
  // The share with their realtor was made (in setup), without a role, and reads as Your realtor.
  assert.equal(w.t.profile_shares.length, 1); assert.equal('role' in w.t.profile_shares[0], false);
  const body = (await w.tenant('GET')).body;
  assert.deepEqual(body.shares.map((s) => [s.role, s.roleLabel]), [['realtor', 'Your realtor']]);
  assert.equal(body.agents.available, false);
  const refused = await w.tenant('POST', { action: 'agent-share', applicationNumber: w.rl, agentId: OTHER.id });
  assert.equal(refused.code, 503); assert.equal(refused.body.code, 'absent');
  assert.equal(w.t.profile_shares.length, 1, 'no share that would read as the wrong kind');
  assert.equal((await w.tenant('POST', { action: 'agent-invite', applicationNumber: w.rl, email: 'a@b.ca' })).code, 503);
  assert.ok((await w.realtor(view, { linkId: 'J1' })).body.facts.length > 0);
  assert.deepEqual((await w.realtor(mine, { action: 'list' }, OTHER)).body.shares, [], 'nothing is shared with a listing agent');
  assert.equal(P.roleOf({}), 'realtor'); assert.equal(P.roleOf({ role: null }), 'realtor'); assert.equal(P.roleOf({ role: 'listing_agent' }), 'listing_agent');
  assert.match(code('components/tenant/ShareWithAgent.js'), /data-agent-absent=""/);
});

test('10. the migration, the words and the screens', () => {
  const sql = src('db/024-share-roles.sql');
  assert.match(sql, /IF to_regclass\('public\.profile_shares'\) IS NULL THEN/);
  assert.match(sql, /ALTER TABLE public\.profile_shares ADD COLUMN IF NOT EXISTS role text;/);
  assert.match(sql, /CHECK \(role IS NULL OR role IN \('realtor', 'listing_agent'\)\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.profile_share_invites \(/);
  assert.match(sql, /ALTER TABLE public\.profile_share_invites ENABLE ROW LEVEL SECURITY;\s+REVOKE ALL ON public\.profile_share_invites FROM anon, authenticated;/);
  assert.doesNotMatch(code('db/024-share-roles.sql'), /CREATE POLICY|GRANT |UPDATE public|DELETE FROM|INSERT INTO/, 'no policy, no grant, no row written or changed');
  assert.doesNotMatch(code('db/024-share-roles.sql'), /score|strength|fit\b|note/i, 'no column for a score or a note');
  // The privacy page, the tenant's screen and the realtor's.
  assert.ok(src('pages/privacy.js').includes("When you apply to a listing with your profile, you approve sharing it with that listing's realtor. You can also share your profile with the listing agent. It's always your choice, and you can stop sharing at any time."));
  const ui = code('components/tenant/ShareWithAgent.js');
  assert.match(ui, />Share with the listing agent<\/h3>/);
  assert.match(ui, /export const AGENT_SEES = 'They see what your realtor sees: [^']*your screening score for this unit\. They can open your income and employment documents for 14 days\. Never your ID\.';/);
  assert.match(ui, /An invite shares nothing\. You share once they have joined\./);
  assert.match(code('components/tenant/ProfileVault.js'), /<div className="mp-label" data-share-role=\{sh\.role \|\| 'realtor'\}>\{sh\.roleLabel \|\| 'Your realtor'\}<\/div>/);
  assert.match(code('components/tenant/ProfileVault.js'), /<ShareWithAgent agents=\{agents\} onChanged=\{load\} \/>/);
  assert.deepEqual({ ...P.ROLE_LABEL }, { realtor: 'Your realtor', listing_agent: 'Listing agent' });
  assert.match(code('components/dashboard/HomeView.js'), /<SharedWithMe \/>/);
  assert.match(code('components/dashboard/SharedWithMe.js'), /<SharedProfile shareId=\{sh\.id\} initial=/, 'the same shared view component');
});
