// The full tenant profile (lib/profilePersonal.js, lib/profileStrength.js, lib/tenantVault.js,
// lib/tenantProfileStore.js, lib/profileShareStore.js, lib/listingReportData.js,
// pages/api/tenant/personal.js, pages/api/tenant/export.js, db/022-full-tenant-profile.sql):
//   · the photo, the words and the prepay offer never reach Fit, a document check or any AI step;
//   · a realtor without an approved share sees none of them;
//   · the landlord report carries the words and the offer only through a live share and while
//     the tenant leaves the switch on, and never the photo;
//   · profile strength never leaves the tenant's own session;
//   · the prepay suggestion depends on one thing, never on a personal trait;
//   · delete removes the photo file, and a new photo removes the one it replaces;
//   · the download writes the log line;
//   · "Help me write this" sends only what the tenant typed and saves nothing;
//   · the app before db/022 has run, the words on the screens, and the migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
const { installFakeStack, fakeReq, fakeRes, findKeys } = await import('../helpers/fakeStack.mjs');
const { tables, USER, OTHER, INVITE_TOKEN } = await import('./fixture.mjs');
const S = await import('../../lib/tenantProfileStore.js');
const PP = await import('../../lib/profilePersonal.js');
const { profileStrength, STRENGTH_STEPS } = await import('../../lib/profileStrength.js');
const R = await import('../../lib/listingReportData.js');
const { buildSnapshot, forLandlordPage } = await import('../../lib/reportSnapshot.js');
const { reportLines } = await import('../../lib/landlordReportPdf.js');
const { profileLines } = await import('../../lib/profileExportPdf.js');
const personal = (await import('../../pages/api/tenant/personal.js')).default;
const { SUGGEST_SYSTEM } = await import('../../pages/api/tenant/personal.js');
const exportRoute = (await import('../../pages/api/tenant/export.js')).default;
const tenantShares = (await import('../../pages/api/tenant/shares.js')).default;
const view = (await import('../../pages/api/profile-shares/view.js')).default;

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else if (/\.js$/.test(f)) out.push(rel); } return out; };

const TYPED = { fullName: 'Maya Okafor', email: 'maya@example.com', phone: '4165550142', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000', yearsAtJob: '3', previousAddress: '214 Shaw St, Unit 3', moveInDate: '2027-01-01' };
const ABOUT = 'I coordinate a pediatric clinic and cycle to work. I am looking for a quiet home near the lake, and I cook most evenings. ABOUT-MARKER';
// The smallest thing that is a JPEG to its first bytes, and one that is not.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.from('PHOTO-BYTES-ONE')]);
const JPEG2 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.from('PHOTO-BYTES-TWO')]);

// Sarah's listing L1 with applicant J1 (application A1), made from Maya's profile; Maya signed in.
async function setup({ shared = false, absent = false } = {}) {
  const t = tables();
  Object.assign(t, { tenant_profiles: [], tenant_profile_shareable: [], tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [], profile_shares: [] });
  // The view db/022 makes reads the same rows as the table.
  t.tenant_profile_personal = t.tenant_profiles;
  if (!t.profiles.some((p) => p.id === OTHER.id)) t.profiles.push({ id: OTHER.id, email: OTHER.email, full_name: 'Other Realtor', plan: 'founding', created_at: '2026-05-01T15:00:00Z' });
  const stack = installFakeStack({ tables: t, user: USER, env: { TENANT_VAULT_ENABLED: null }, ...(absent ? { absentColumns: ['about_me', 'prepay_months', 'landlord_report_ok', 'photo_path', 'photo_mime', 'photo_added_at'] } : {}) });
  if (absent) delete t.tenant_profile_personal;
  const p = S.blankProfile('maya@example.com'); p.facts = { ...TYPED }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z'; p.profileRevision = 2;
  await S.saveProfile(p);
  const token = await S.createSession(p.id);
  stack.kv.values[`tprofile_id:${p.id}`] = JSON.stringify(p.emailKey);
  const cookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(token)}` };
  t.tenant_profile_shareable.push({ id: p.id, facts: { ...TYPED }, facts_updated_at: '2026-11-01T15:00:00.000Z', email_verified_at: '2026-11-02T15:00:00.000Z' });
  const a1 = t.applications.find((a) => a.id === 'A1');
  Object.assign(a1, { email: 'maya@example.com', prefill_profile_id: null, tenant_profile_id: p.id, owner_token: 'OWNERTOKENSECRET' });
  stack.kv.values[`linvite:${INVITE_TOKEN}`] = { profileId: USER.id, listingId: 'L1', realtorName: 'Sarah Chen' };
  const call = async (route, method, body, headers = cookie) => { const res = fakeRes(); await route(fakeReq({ method, body, headers }), res); return res; };
  const mine = (body) => (body ? call(personal, 'POST', body) : call(personal, 'GET', null));
  const realtor = async (route, body, user = USER) => {
    if (user !== USER) installFakeStack({ tables: t, user, kv: stack.kv, env: { TENANT_VAULT_ENABLED: null } });
    try { const res = fakeRes(); await route(fakeReq({ body }), res); return res; } finally { globalThis.__rlStack = stack; }
  };
  const share = () => call(tenantShares, 'POST', { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: a1.application_number });
  if (shared) assert.equal((await share()).body.shared, true);
  const row = () => t.tenant_profiles.find((r) => r.id === p.id);
  const fill = async () => {
    assert.equal((await mine({ action: 'about', text: ABOUT })).code, 200);
    assert.equal((await mine({ action: 'prepay', months: 3 })).code, 200);
    assert.equal((await mine({ action: 'photo', type: 'image/jpeg', data: JPEG.toString('base64') })).code, 200);
  };
  const report = () => R.loadReportContext(stack.rls, stack.db, 'L1', USER.id);
  return { stack, t, p, a1, cookie, call, mine, realtor, share, row, fill, report, log: () => t.profile_access_log, bucket: () => Object.keys(stack.db.objects['tenant-vault'] || {}) };
}

test('1. the photo, the words and the prepay offer never reach Fit, a document check or any AI step', async () => {
  const before = await setup({ shared: true });
  const fitBefore = (await before.report()).active.map((a) => [a.linkId, a.application.fit]);
  const w = await setup({ shared: true });
  await w.fill();
  // Nothing was read by a model to store any of the three, and no document check was made.
  assert.equal(w.stack.anthropic.calls.length, 0, 'no model saw the photo, the words or the offer');
  assert.deepEqual(w.t.tenant_profile_checks, [], 'no check was recorded from a photo');
  assert.deepEqual(w.t.tenant_profile_documents, [], 'a photo is not a document: nothing is read from it');
  // They live in their own columns and never in facts, which fill the next application.
  const stored = await S.getProfileById(w.p.id);
  assert.deepEqual(stored.facts, { ...TYPED }, 'the facts are exactly what was typed');
  assert.deepEqual(findKeys(S.clientProfile(stored), ['about', 'about_me', 'aboutMe', 'prepay', 'prepayMonths', 'prepay_months', 'photo', 'photo_path', 'strength']), []);
  assert.equal(JSON.stringify(w.t.applications).includes('ABOUT-MARKER'), false, 'no application carries the words');
  // Fit, for every applicant on the listing, is what it was without them: before and after the report read them.
  const ctx = await w.report();
  assert.deepEqual(ctx.active.map((a) => [a.linkId, a.application.fit]), fitBefore, 'Fit is unchanged, and so is the order');
  assert.equal(ctx.active.some((a) => a.tenantWords && a.tenantWords.about === ABOUT), true, 'the words were read for the report');
  assert.equal(ctx.active.some((a) => JSON.stringify(a.application).includes('ABOUT-MARKER')), false, 'and never placed in the application Fit reads');
  // No scoring, checking or document reading code names any of them.
  for (const f of ['lib/fitScore.js', 'lib/deriveScorecard.js', 'lib/applicantAnalysis.js', 'lib/applicantSynthesis.js', 'lib/documentIntegrity.js', 'lib/documentAuthority.js', 'lib/tenantVaultRules.js', 'lib/creditShared.js', 'lib/prefillRecord.js', 'lib/tenantProfile.js', 'lib/applicationMap.js', 'lib/submitChain.js']) {
    assert.doesNotMatch(code(f), /about_me|aboutMe|tenantWords|prepay|photo_path|profilePhoto|photoDataUrl|profileStrength|ProfilePersonal/i, f);
  }
  // The only model call the feature makes is the wording suggestion, in the tenant's own route.
  const callers = [...walk('lib/'), ...walk('pages/'), ...walk('components/')].filter((f) => /SUGGEST_SYSTEM|suggestWording/.test(code(f)));
  assert.deepEqual(callers, ['pages/api/tenant/personal.js']);
  const vault = code('lib/tenantVault.js'); const photoCode = vault.slice(vault.indexOf('export async function putProfilePhoto'), vault.indexOf('export const photoDataUrl'));
  assert.ok(photoCode.length > 400);
  assert.doesNotMatch(photoCode, /runDocumentAnalysis|anthropic|checksFromDocument|from\(CHECKS\)|from\(DOCS\)|\.upsert\(|\.insert\(/i, 'the photo is put, sent back and removed, and nothing else');
});

test('2. a realtor without an approved share sees none of them; with one, all three; after the tenant stops, none', async () => {
  const w = await setup();
  await w.fill();
  const none = await w.realtor(view, { linkId: 'J1' });
  assert.deepEqual([none.code, none.body], [200, { shared: false }]);
  assert.equal(w.stack.db.queries.some((q) => q.table === 'tenant_profile_personal'), false, 'nothing of it was read');
  assert.equal(w.stack.db.storageCalls.filter((c) => c[0] === 'download').length, 0, 'and the photo was sent to nobody');
  // The tenant applies with their profile: Sarah, the recipient, sees the three, logged first.
  assert.equal((await w.share()).body.shared, true);
  const peek = await w.realtor(view, { linkId: 'J1', peek: true });
  assert.deepEqual(peek.body, { shared: true, ended: null }, 'a peek reads nothing');
  const seen = (await w.realtor(view, { linkId: 'J1' })).body;
  assert.equal(seen.about, ABOUT); assert.equal(seen.prepayMonths, 3);
  assert.equal(seen.photo, `data:image/jpeg;base64,${JPEG.toString('base64')}`, 'the photo is its bytes: no link to it exists');
  assert.deepEqual(w.log().filter((l) => l.actor_type === 'realtor').map((l) => l.action), ['profile_viewed'], 'the view was logged');
  assert.equal(w.stack.db.storageCalls.filter((c) => c[0] === 'sign').length, 0, 'no link to the photo is ever made');
  assert.equal(JSON.stringify(seen).includes(w.row().photo_path), false, 'nor is its path sent');
  assert.deepEqual(findKeys(seen, ['strength', 'percent', 'steps', 'landlordReportOk', 'landlord_report_ok', 'photo_path', 'owner_token', 'ownerToken']), []);
  // Another realtor, on Sarah's applicant: refused before anything is read.
  const other = await w.realtor(view, { linkId: 'J1' }, OTHER);
  assert.equal(other.code, 403); assert.equal(JSON.stringify(other.body).includes('ABOUT-MARKER'), false);
  // The realtor reads the view, never the table.
  assert.match(code('lib/profileShareStore.js'), /export const PERSONAL_VIEW = 'tenant_profile_personal';/);
  assert.doesNotMatch(code('lib/profileShareStore.js'), /from\('tenant_profiles'\)/);
  assert.doesNotMatch(code('lib/tenantVault.js'), /from\('tenant_profiles'\)/);
  // The tenant stops sharing: nothing more.
  const shareId = w.t.profile_shares[0].id;
  assert.equal((await w.call(tenantShares, 'POST', { action: 'stop', id: shareId })).code, 200);
  const after = (await w.realtor(view, { linkId: 'J1' })).body;
  assert.deepEqual(Object.keys(after).sort(), ['ended', 'message', 'shared']);
  assert.equal(JSON.stringify(after).includes('ABOUT-MARKER'), false);
});

test('3. the landlord report: the words and the offer through a live share while the switch is on, and never the photo', async () => {
  // No share: nothing on the report, and nothing read.
  const w0 = await setup(); await w0.fill();
  const snap0 = buildSnapshot({ listing: (await w0.report()).listing, applicants: (await w0.report()).active, profile: { full_name: 'Sarah Chen' } });
  assert.equal(snap0.applicants.every((a) => a.tenant === null), true);
  assert.equal(w0.log().filter((l) => l.actor_type === 'realtor').length, 0);
  // A live share, the switch on (the default).
  const w = await setup({ shared: true }); await w.fill();
  const ctx = await w.report();
  const snap = buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: { full_name: 'Sarah Chen' } });
  const maya = snap.applicants.find((a) => a.name === w.a1.full_name);
  assert.deepEqual(maya.tenant, { about: ABOUT, offer: 'Open to prepaying 3 months of rent', offerLabel: 'Offered by the tenant' });
  assert.equal(snap.applicants.filter((a) => a.tenant).length, 1, 'only the tenant who shared');
  const text = JSON.stringify(forLandlordPage(snap));
  assert.equal(/data:image|photo|PHOTO-BYTES/i.test(text), false, 'the photo is never on a report');
  assert.deepEqual(findKeys(snap, ['photo', 'strength', 'percent', 'prepayMonths', 'landlordReportOk']), []);
  assert.deepEqual(w.log().filter((l) => l.actor_type === 'realtor').map((l) => [l.action, l.actor_label]), [['profile_viewed', 'Sarah Chen, Demo Realty, for a landlord report']], 'the tenant sees it in their log');
  // On paper and on the page: the tenant's own words, and the offer under its label.
  const block = reportLines(snap).blocks.find((b) => b.name === w.a1.full_name);
  assert.deepEqual(block.tenant, [`In their own words: ${ABOUT}`, 'Offered by the tenant: open to prepaying 3 months of rent']);
  assert.match(src('pages/r/[token].js'), /<div style=\{\{ \.\.\.eyebrow, fontSize: 10, marginBottom: 2 \}\}>\{a\.tenant\.offerLabel\}<\/div>/);
  // The tenant turns the switch off: nothing on the next report, and nothing logged for it.
  assert.equal((await w.mine({ action: 'landlord', ok: false })).code, 200);
  assert.equal(w.row().landlord_report_ok, false);
  const lines = w.log().length;
  const off = await w.report();
  assert.equal(off.active.some((a) => a.tenantWords), false);
  assert.equal(w.log().length, lines, 'nothing was read, so nothing was logged');
  // The realtor's own shared view is not the report: it still shows them.
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.about, ABOUT);
  // Only the report data reads for a landlord, and only through the share reader.
  assert.match(code('lib/listingReportData.js'), /const read = await readForLandlordReport\(adminClient, \{ share: found\.share, viewer \}\);/);
  assert.match(code('lib/profileShareStore.js'), /if \(!row\.landlordReportOk\) return \{ ok: false, reason: 'off' \};/);
});

test('4. profile strength never leaves the tenant\'s own session', async () => {
  const w = await setup({ shared: true }); await w.fill();
  const own = (await w.mine()).body;
  assert.equal(own.available, true);
  assert.deepEqual(Object.keys(own.strength).sort(), ['done', 'percent', 'steps', 'total']);
  assert.equal(own.strength.percent, Math.round((3 / 7) * 100), 'details, a photo and the words, of seven steps');
  assert.deepEqual(own.strength.steps.filter((s) => s.done).map((s) => s.key), ['details', 'photo', 'about', 'prepay']);
  // No session: nothing.
  const anon = await w.call(personal, 'GET', null, {});
  assert.equal(anon.code, 401); assert.deepEqual(Object.keys(anon.body).sort(), ['code', 'error']);
  // Nothing a realtor or a landlord is ever sent carries it.
  const seen = (await w.realtor(view, { linkId: 'J1' })).body;
  const ctx = await w.report();
  const snap = buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: { full_name: 'Sarah Chen' } });
  const shares = (await w.call(tenantShares, 'GET', null)).body;
  for (const [name, out] of [['the realtor\'s view', seen], ['the report', snap], ['the report context', ctx.active.map((a) => ({ ...a }))], ['what a realtor sees', shares.preview]]) {
    assert.deepEqual(findKeys(out, ['strength', 'percent', 'steps', 'profileStrength']), [], name);
    assert.equal(/Profile strength|"percent"/.test(JSON.stringify(out)), false, name);
  }
  // It is computed in one place and answered by one route; no table holds it.
  const users = [...walk('lib/'), ...walk('pages/'), ...walk('components/')].filter((f) => /profileStrength\(|from '[^']*profileStrength'/.test(code(f)));
  assert.deepEqual(users.sort(), ['lib/profileStrength.js', 'pages/api/tenant/personal.js']);
  assert.doesNotMatch(src('db/022-full-tenant-profile.sql'), /strength|percent/i);
  assert.doesNotMatch(code('lib/fitScore.js'), /strength/i);
  assert.deepEqual([...walk('components/dashboard/'), ...walk('components/listings/'), 'pages/r/[token].js'].filter((f) => /strength/i.test(code(f))), [], 'no realtor or landlord screen names it');
  // The download is a page of facts: no strength on it.
  const lines = JSON.stringify(profileLines({ name: 'Maya Okafor', about: ABOUT, prepayMonths: 3, facts: TYPED }));
  assert.equal(/strength|%/.test(lines), false);
});

test('5. the prepay suggestion depends on one thing: no Canadian credit report shared. Never on a personal trait', () => {
  const base = { facts: { ...TYPED }, documentKinds: [], checkKinds: [], hasPhoto: false, hasAbout: false, prepayMonths: null };
  const has = (out) => out.steps.some((s) => s.key === 'prepay');
  assert.equal(has(profileStrength({ ...base, creditShared: false })), true, 'no credit report shared: suggested');
  assert.equal(has(profileStrength({ ...base, creditShared: true })), false, 'a credit report shared: not suggested');
  assert.equal(has(profileStrength({ ...base })), true, 'not known is not shared');
  assert.equal(has(profileStrength({ ...base, creditShared: true, prepayMonths: 2 })), true, 'an offer already made stays on the list, done');
  // It is optional and never counted: the percent is the same with it and without.
  const prepay = profileStrength({ ...base, creditShared: false }).steps.find((s) => s.key === 'prepay');
  assert.equal(prepay.optional, true);
  assert.equal(profileStrength({ ...base, prepayMonths: 6 }).percent, profileStrength({ ...base }).percent);
  // Whatever is said about the person, the answer is the same.
  const answer = JSON.stringify(profileStrength({ ...base, creditShared: false }));
  const traits = [{ age: '19' }, { age: '71' }, { dateOfBirth: '2006-03-01' }, { student: true, employmentType: 'student' }, { citizenship: 'visitor', statusInCanada: 'study permit' }, { countryOfOrigin: 'Elsewhere', newcomer: true }, { numberOfOccupants: '5', coApplicantRelationship: 'spouse' }, { incomeSource: 'assistance' }, { religion: 'x', disability: 'y', gender: 'z' }];
  for (const t of traits) {
    assert.equal(JSON.stringify(profileStrength({ ...base, creditShared: false, facts: { ...TYPED, ...t } })), answer, JSON.stringify(t));
    assert.equal(has(profileStrength({ ...base, creditShared: true, facts: { ...TYPED, ...t } })), false, JSON.stringify(t));
    assert.equal(has(profileStrength({ ...base, creditShared: true, ...t })), false, 'nor as an input of its own');
  }
  // The function is handed seven things and no other, and reads five typed details.
  const fn = code('lib/profileStrength.js');
  assert.match(fn, /export function profileStrength\(\{ facts = null, documentKinds = \[\], checkKinds = \[\], hasPhoto = false, hasAbout = false, prepayMonths = null, creditShared = false \} = \{\}\) \{/);
  assert.deepEqual([...new Set([...fn.matchAll(/\bf\.([A-Za-z]+)/g)].map((m) => m[1]))].sort(), ['annualIncome', 'employer', 'fullName', 'jobTitle', 'phone', 'previousLandlordContact', 'previousLandlordName']);
  assert.doesNotMatch(fn, /\bage\b|birth|student|study|citizen|immigr|newcomer|origin|nationality|religion|family|gender|disab|occupant|employmentType|incomeSource/i);
  assert.match(fn, /const steps = STRENGTH_STEPS\.filter\(\(s\) => s\.key !== 'prepay' \|\| creditShared !== true \|\| done\.prepay\)/);
  assert.deepEqual(STRENGTH_STEPS.map((s) => s.key), ['details', 'photo', 'about', 'id', 'income', 'employment', 'reference', 'prepay']);
  for (const s of STRENGTH_STEPS) assert.ok(s.adds.split(' ').length <= 9 && /\.$/.test(s.adds), `${s.key}: what it adds, in one short line`);
  // Where the one fact comes from: a credit report the tenant shared on an application they sent.
  assert.match(code('lib/tenantProfileStore.js'), /return \(links \|\| \[\]\)\.some\(\(l\) => \{ try \{ return !!creditLines\(activeReport\(l\.doc_verifications\)\)\.shared; \}/);
  assert.match(code('pages/api/tenant/personal.js'), /creditShared: await creditReportShared\(p\) \}\);/);
});

test('6. delete removes the photo file, and a new photo removes the one it replaces', async () => {
  const w = await setup({ shared: true });
  assert.equal((await w.mine({ action: 'photo', type: 'image/jpeg', data: JPEG.toString('base64') })).code, 200);
  const first = w.row().photo_path;
  assert.match(first, new RegExp(`^${w.p.id}/photo-[0-9a-f-]{36}\\.jpg$`), 'the path holds no filename, email or token');
  assert.deepEqual(w.bucket(), [first]);
  assert.equal(w.stack.db.objects['tenant-vault'][first].bytes.equals(JPEG), true, 'stored as it was sent');
  // Replaced: one file, the new one.
  assert.equal((await w.mine({ action: 'photo', type: 'image/jpeg', data: JPEG2.toString('base64') })).code, 200);
  const second = w.row().photo_path;
  assert.notEqual(second, first); assert.deepEqual(w.bucket(), [second], 'the photo it replaced is gone from the bucket');
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.photo, `data:image/jpeg;base64,${JPEG2.toString('base64')}`);
  // Deleted: the file is removed, the profile forgets it, and a realtor with a share sees none.
  const gone = await w.mine({ action: 'photo-delete' });
  assert.equal(gone.code, 200);
  assert.deepEqual(w.bucket(), [], 'the file is gone');
  assert.deepEqual([w.row().photo_path, w.row().photo_mime, w.row().photo_added_at], [null, null, null]);
  assert.equal((await w.mine()).body.photo, null);
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.photo, null);
  assert.deepEqual(w.log().filter((l) => l.actor_type === 'tenant' && /^photo_/.test(l.action)).map((l) => l.action), ['photo_added', 'photo_added', 'photo_removed']);
  assert.deepEqual(w.log().filter((l) => /^document_/.test(l.action)), [], 'a photo is never written as a document');
  // The tenant's page is sent their own photo lines, newest first, and says them in plain words.
  assert.deepEqual((await w.mine()).body.photoLog.map((l) => [l.action, l.by]).sort(), [['photo_added', 'you'], ['photo_added', 'you'], ['photo_removed', 'you']]);
  assert.match(code('components/tenant/ProfilePersonal.js'), /l\.action === 'photo_added' \? 'Photo added' : 'Photo removed'/);
  assert.equal((await w.mine({ action: 'photo-delete' })).code, 200, 'deleting again is not an error');
  // What is refused, before anything is kept: not an image to its own bytes, too large, another type.
  assert.equal((await w.mine({ action: 'photo', type: 'image/jpeg', data: Buffer.from('%PDF-1.4 not a photo at all').toString('base64') })).code, 400);
  assert.equal((await w.mine({ action: 'photo', type: 'application/pdf', data: JPEG.toString('base64') })).code, 400);
  assert.equal((await w.mine({ action: 'photo', type: 'image/jpeg', data: Buffer.concat([JPEG, Buffer.alloc(PP.PHOTO_MAX_BYTES)]).toString('base64') })).code, 413);
  assert.deepEqual(w.bucket(), []);
  // Another tenant's session cannot touch it: the profile is the session's own, never the request's.
  assert.doesNotMatch(code('pages/api/tenant/personal.js'), /body\.(profileId|id|path)\b/);
  assert.equal((await w.call(personal, 'POST', { action: 'photo-delete' }, {})).code, 401);
  // The file comes off the bucket before the profile forgets it.
  assert.match(code('pages/api/tenant/personal.js'), /if \(!\(await removeProfilePhoto\(admin, \{ profileId: p\.id, path: mine\.photo\.path \}\)\)\) return res\.status\(503\)[^\n]*\n\s*if \(!\(await savePersonal\(p, \{ photo_path: null, photo_mime: null, photo_added_at: null \}\)\)\)/);
});

test('7. Download my profile: a PDF of the profile, never the files, and profile_exported in the tenant\'s log', async () => {
  const w = await setup(); await w.fill();
  const before = w.log().length;
  const res = await w.call(exportRoute, 'GET', null);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'application/pdf');
  assert.equal(Buffer.from(res.body).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(w.log().slice(before).map((l) => [l.actor_type, l.action, l.tenant_profile_id]), [['tenant', 'profile_exported', w.p.id]]);
  assert.match(code('pages/api/tenant/export.js'), /if \(admin\) await logVault\(admin, \{ profileId: p\.id, action: 'profile_exported', at: now \}\);\s*\n\s*res\.setHeader\('Content-Type', 'application\/pdf'\);/, 'the line is written before the file is sent');
  // What it prints: the words, the offer, each fact with its date, the documents by kind and date.
  const lines = profileLines({ name: 'Maya Okafor', email: 'maya@example.com', about: ABOUT, prepayMonths: 3, facts: TYPED, factsUpdatedAt: '2026-11-01T15:00:00.000Z', checks: [{ kind: 'income_annual_gross', value: { cents: 8500000 }, readAt: '2026-11-10T16:00:00.000Z' }], documents: [{ kind: 'income', uploadedAt: '2026-11-10T16:00:00.000Z', expiresAt: '2027-02-08T16:00:00.000Z' }], generatedAt: '2026-11-20T15:00:00.000Z' });
  assert.equal(lines.about, ABOUT); assert.deepEqual(lines.prepay, ['Offered by the tenant', 'Open to prepaying 3 months of rent']);
  assert.deepEqual(lines.facts[0], ['Name', 'Maya Okafor', 'Typed by you on November 1, 2026']);
  assert.deepEqual(lines.documents, [['Proof of income', 'Added November 10, 2026', 'Kept until February 8, 2027']]);
  assert.equal(/storage_path|\.pdf|tenant-vault/.test(JSON.stringify(lines)), false, 'the list of documents, not the files');
  // No session, no download and no line.
  const anon = await w.call(exportRoute, 'GET', null, {});
  assert.equal(anon.code, 401); assert.equal(w.log().length, before + 1);
  assert.equal((await w.call(exportRoute, 'POST', {})).code, 405);
});

test('8. "Help me write this" sends only what the tenant typed, suggests, and saves nothing', async () => {
  const w = await setup(); await w.mine({ action: 'about', text: ABOUT });
  const typed = 'i work at a clinic, i like quiet and i cook a lot. looking for somewhere near the lake';
  const res = await w.mine({ action: 'suggest', text: typed });
  assert.equal(res.code, 200); assert.equal(typeof res.body.suggestion, 'string');
  assert.equal(w.stack.anthropic.calls.length, 1);
  const sent = w.stack.anthropic.calls[0];
  assert.deepEqual(sent.messages, [{ role: 'user', content: [{ type: 'text', text: typed }] }], 'the text in the box, and nothing else');
  assert.equal(sent.system, SUGGEST_SYSTEM);
  assert.equal(sent.model, 'claude-opus-5-5');
  const all = JSON.stringify(sent);
  for (const secret of ['Maya Okafor', '4165550142', 'maya@example.com', '85000', 'Northwind', 'ABOUT-MARKER', 'OWNERTOKENSECRET']) assert.equal(all.includes(secret), false, `${secret} was not sent`);
  assert.match(SUGGEST_SYSTEM, /Use only what the note says\. Add no fact, detail, claim or adjective that is not already in it/);
  assert.match(SUGGEST_SYSTEM, /Never add or guess anything about family, relationships, religion, health, age, origin, nationality or money\./);
  // Nothing was saved: the stored words are the tenant's own until they save again.
  assert.equal(w.row().about_me, ABOUT);
  assert.equal((await w.mine()).body.about, ABOUT);
  // It runs only when asked, on a sentence or two, and the screen changes the box only on accept.
  assert.equal((await w.mine({ action: 'suggest', text: 'hi' })).code, 400);
  assert.equal(w.stack.anthropic.calls.length, 1);
  const ui = code('components/tenant/ProfilePersonal.js');
  assert.match(ui, /<button type="button" data-about-accept="" className="mp-btn" onClick=\{\(\) => \{ setText\(suggestion\); setSuggestion\(''\);/);
  assert.equal((ui.match(/action: 'suggest'/g) || []).length, 1, 'asked for in one place: the button');
  assert.match(ui, /onClick=\{suggest\}><Pending busy=\{busy === 'suggest'\} label="Writing a suggestion">Help me write this<\/Pending><\/button>/);
  // The words: 600 characters, the tenant's own, removable.
  assert.equal(PP.ABOUT_MAX, 600);
  assert.equal((await w.mine({ action: 'about', text: 'x'.repeat(601) })).code, 400);
  assert.equal((await w.mine({ action: 'about', text: 'é'.repeat(600) })).code, 200);
  assert.equal((await w.mine({ action: 'about', text: '   ' })).body.about, null, 'empty removes them');
  assert.equal(w.row().about_me, null);
});

test('9. prepaying is the tenant\'s own offer: 1 to 12 months, never a deposit, never a requirement', async () => {
  const w = await setup({ shared: true });
  for (const bad of [0, 13, 2.5, -1, 'many']) assert.equal((await w.mine({ action: 'prepay', months: bad })).code, 400, String(bad));
  assert.equal(w.row().prepay_months ?? null, null);
  for (const ok of [1, 12]) { assert.equal((await w.mine({ action: 'prepay', months: ok })).code, 200); assert.equal(w.row().prepay_months, ok); }
  assert.equal(PP.prepayLine(1), 'Open to prepaying 1 month of rent'); assert.equal(PP.prepayLine(12), 'Open to prepaying 12 months of rent'); assert.equal(PP.prepayLine(13), null);
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.prepayMonths, 12);
  assert.equal((await w.mine({ action: 'prepay', months: null })).body.prepayMonths, null, 'the offer is withdrawn');
  assert.equal((await w.realtor(view, { linkId: 'J1' })).body.prepayMonths, null);
  // The words beside it, exactly, and the label a realtor and a landlord read.
  assert.equal(PP.PREPAY_FIELD, 'I’m open to prepaying rent');
  assert.equal(PP.PREPAY_NOTE, 'Entirely your choice. A landlord can’t require it, and your rent deposit stays at one month.');
  assert.equal(PP.PREPAY_LABEL, 'Offered by the tenant');
  assert.equal(PP.PHOTO_NOTE, 'Optional. Many landlords like to put a face to a name. Your photo is never used to score or rank you.');
  assert.equal(PP.ABOUT_NOTE, 'Share what you’re comfortable with. You never need to mention family, religion or health.');
  assert.deepEqual([...PP.ABOUT_PROMPTS], ['What you do', 'Why this home', 'How you live day to day']);
  // The offer is never called a deposit, and nothing says a landlord may ask for it.
  for (const s of [PP.PREPAY_FIELD, PP.PREPAY_LABEL, PP.prepayLine(3), STRENGTH_STEPS.find((x) => x.key === 'prepay').title, STRENGTH_STEPS.find((x) => x.key === 'prepay').adds]) assert.doesNotMatch(s, /deposit|required|must|landlord may|landlords can/i, s);
  const shown = [code('components/dashboard/SharedProfile.js'), code('pages/r/[token].js'), code('lib/landlordReportPdf.js'), code('lib/reportSnapshot.js')].join('\n');
  assert.doesNotMatch(shown, /prepa[^\n]{0,80}deposit|deposit[^\n]{0,80}prepa/i, 'never called a deposit where a realtor or a landlord reads it');
  assert.match(code('components/dashboard/SharedProfile.js'), /<div style=\{label\}>\{PREPAY_LABEL\}<\/div>/);
  assert.match(code('components/dashboard/SharedProfile.js'), /Their own offer\. It cannot be required\./);
  // The screens draw the three notes from the one place they are written.
  const ui = code('components/tenant/ProfilePersonal.js');
  for (const name of ['PHOTO_NOTE', 'ABOUT_NOTE', 'PREPAY_NOTE', 'PREPAY_FIELD', 'LANDLORD_SWITCH']) assert.match(ui, new RegExp(`\\{noWidow\\(${name}\\)\\}|label=\\{${name}\\}`), name);
  assert.doesNotMatch(ui, /required(?! anywhere)|\brequired=/, 'nothing here is required');
});

test('10. before db/022 has run the app works, and the migration opens nothing to the browser', async () => {
  const w = await setup({ shared: true, absent: true });
  const own = (await w.mine()).body;
  assert.equal(own.available, false); assert.deepEqual([own.about, own.prepayMonths, own.photo], [null, null, null]);
  assert.ok(own.strength && own.strength.steps.length, 'strength still reads from what is there');
  for (const body of [{ action: 'about', text: ABOUT }, { action: 'prepay', months: 2 }, { action: 'landlord', ok: false }, { action: 'photo', type: 'image/jpeg', data: JPEG.toString('base64') }, { action: 'photo-delete' }]) {
    const r = await w.mine(body); assert.equal(r.code, 503, body.action); assert.equal(r.body.code, 'absent', body.action);
  }
  assert.deepEqual(w.bucket(), [], 'no file was kept');
  const seen = await w.realtor(view, { linkId: 'J1' });
  assert.equal(seen.code, 200); assert.deepEqual([seen.body.about, seen.body.prepayMonths, seen.body.photo], [null, null, null]);
  assert.ok(seen.body.facts.length > 0, 'the realtor\'s view shows the facts as before');
  assert.equal((await w.report()).active.some((a) => a.tenantWords), false);
  assert.equal((await w.call(exportRoute, 'GET', null)).code, 200, 'the download still works');
  assert.match(code('components/tenant/ProfilePersonal.js'), /data-personal-absent=""/);
  const sql = src('db/022-full-tenant-profile.sql');
  assert.doesNotMatch(code('db/022-full-tenant-profile.sql'), /CREATE POLICY|GRANT /);
  assert.match(sql, /IF to_regclass\('public\.tenant_profiles'\) IS NULL THEN/);
  for (const col of ['about_me text', 'prepay_months smallint', 'landlord_report_ok boolean', 'photo_path text', 'photo_mime text', 'photo_added_at timestamptz']) assert.match(sql, new RegExp(`ALTER TABLE public\\.tenant_profiles ADD COLUMN IF NOT EXISTS ${col};`));
  assert.match(sql, /CHECK \(about_me IS NULL OR char_length\(about_me\) BETWEEN 1 AND 600\)/);
  assert.match(sql, /CHECK \(prepay_months IS NULL OR prepay_months BETWEEN 1 AND 12\)/);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.tenant_profile_personal WITH \(security_invoker = true\) AS\s+SELECT p\.id, p\.about_me, p\.prepay_months, p\.landlord_report_ok, p\.photo_path, p\.photo_mime, p\.photo_added_at\s+FROM public\.tenant_profiles p/);
  assert.match(sql, /REVOKE ALL ON public\.tenant_profile_personal FROM anon, authenticated;/);
  assert.doesNotMatch(sql, /p\.facts|p\.applications|p\.email\b/, 'the view holds no fact, application or address');
  // The privacy page says it, and the two questions are with the lawyer.
  assert.match(src('pages/privacy.js'), /\*\*What you choose to add about yourself\.\*\* A tenant may add a photo of themselves, a few words about themselves and an offer to prepay rent\. Each is optional and the tenant's own choice/);
  assert.match(src('docs/design/profile-and-circle.md'), /^22\. A photo on a rental profile\./m);
  assert.match(src('docs/design/profile-and-circle.md'), /^23\. Voluntary prepaid rent\./m);
});

test('11. the photo expires with the profile: the twelve month rule removes the file, clears its columns and logs it', async () => {
  const V = await import('../../lib/tenantVault.js');
  const cron = (await import('../../pages/api/cron/expire-vault.js')).default;
  const w = await setup();
  assert.equal((await w.mine({ action: 'photo', type: 'image/jpeg', data: JPEG.toString('base64') })).code, 200);
  const path = w.row().photo_path;
  // A second profile with a photo that was here last week, and a third nobody can place.
  const other = async (email) => { const p = S.blankProfile(email); p.facts = { fullName: 'Other Tenant' }; await S.saveProfile(p); const file = `${p.id}/photo-11111111-1111-4111-8111-111111111111.jpg`; await w.stack.db.storage.from('tenant-vault').upload(file, JPEG2, { contentType: 'image/jpeg' }); Object.assign(w.t.tenant_profiles.find((r) => r.id === p.id), { photo_path: file, photo_mime: 'image/jpeg', photo_added_at: '2026-01-01T00:00:00.000Z' }); return { id: p.id, file }; };
  const active = await other('active@example.com'); const unknown = await other('unknown@example.com');
  const now = new Date('2028-01-15T12:00:00Z');
  const activityFor = async () => ({ [w.p.id]: '2026-11-01T00:00:00.000Z', [active.id]: '2028-01-08T00:00:00.000Z' }); // 14 months ago; last week; the third unknown
  const photos = { holders: S.photoHolders, clear: S.clearPhoto };
  const before = w.log().length;
  const out = await V.expireIdleVaults(w.stack.db, { now, activityFor, photos });
  assert.deepEqual(out, { profiles: 1, documents: 0, checks: 0, photos: 1, absent: false }, 'a profile that holds only a photo still expires');
  assert.equal(w.bucket().includes(path), false, 'the file is gone');
  assert.deepEqual([w.row().photo_path, w.row().photo_mime, w.row().photo_added_at], [null, null, null], 'and its three columns are empty');
  assert.deepEqual(w.log().slice(before).map((l) => [l.tenant_profile_id, l.actor_type, l.action]), [[w.p.id, 'system', 'photo_removed']], 'said in the tenant\'s log, by the system');
  assert.deepEqual((await w.mine()).body.photoLog[0].by, 'system');
  assert.equal((await w.mine()).body.photo, null);
  // Active, and unknown, are not idle: untouched.
  assert.deepEqual(w.bucket().sort(), [active.file, unknown.file].sort());
  assert.equal(w.t.tenant_profiles.find((r) => r.id === active.id).photo_path, active.file);
  assert.equal(w.t.tenant_profiles.find((r) => r.id === unknown.id).photo_path, unknown.file);
  // Again: nothing more to do. And without the photo store handed in, photos are left alone.
  assert.deepEqual(await V.expireIdleVaults(w.stack.db, { now, activityFor, photos }), { profiles: 0, documents: 0, checks: 0, photos: 0, absent: false });
  // A file the bucket would not remove is not forgotten: the profile keeps pointing at it for the next run.
  const w2 = await setup(); await w2.mine({ action: 'photo', type: 'image/jpeg', data: JPEG.toString('base64') });
  const real = w2.stack.db.storage.from; w2.stack.db.storage.from = (b) => ({ ...real(b), remove: async () => ({ data: null, error: { message: 'storage down' } }) });
  const stuck = await V.expireIdleVaults(w2.stack.db, { now, activityFor: async () => ({ [w2.p.id]: '2026-11-01T00:00:00.000Z' }), photos });
  w2.stack.db.storage.from = real;
  assert.equal(stuck.photos, 0); assert.ok(w2.row().photo_path, 'still recorded'); assert.equal(w2.log().some((l) => l.action === 'photo_removed'), false);
  // The daily job hands the photo store in, and the route is the cron's alone.
  assert.match(code('pages/api/cron/expire-vault.js'), /idle = await expireIdleVaults\(admin, \{ activityFor: profileActivity, photos: \{ holders: photoHolders, clear: clearPhoto \} \}\);/);
  const res = fakeRes(); await cron(fakeReq({ method: 'GET' }), res); assert.ok([401, 503].includes(res.code), 'no bearer, no run');
  // The vault library still never reads the profile table itself.
  assert.doesNotMatch(code('lib/tenantVault.js'), /from\('tenant_profiles'\)/);
});

test('12. db/023: the log\'s action list gains photo_added and photo_removed, and only that constraint is rewritten', () => {
  const sql = src('db/023-photo-log-actions.sql'); const old = src('db/018-profile-vault.sql');
  const list = (text) => [...text.split('CHECK (action IN (')[1].split('))')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(list(sql), [...list(old), 'photo_added', 'photo_removed'], 'every action db/018 listed, in order, and the two new ones');
  assert.match(sql, /IF to_regclass\('public\.profile_access_log'\) IS NULL THEN RETURN; END IF;/);
  assert.match(sql, /IF cdef IS NOT NULL AND cdef LIKE '%photo_removed%' THEN RETURN; END IF;/);
  assert.doesNotMatch(code('db/023-photo-log-actions.sql'), /CREATE POLICY|GRANT |CREATE TABLE|ADD COLUMN|UPDATE |DELETE |INSERT /);
  assert.equal((code('db/023-photo-log-actions.sql').match(/ADD CONSTRAINT/g) || []).length, 1);
  // Every place a photo is logged uses the two words.
  for (const f of ['pages/api/tenant/personal.js', 'lib/tenantVault.js']) assert.doesNotMatch(code(f).split('\n').filter((l) => /photo/i.test(l)).join('\n'), /document_added|document_deleted/, f);
  assert.match(code('pages/api/tenant/personal.js'), /action: 'photo_added', at \}\);/); assert.match(code('pages/api/tenant/personal.js'), /action: 'photo_removed' \}\);/);
});
