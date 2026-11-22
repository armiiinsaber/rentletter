// An archived listing takes no applications (db/025-listing-archive.sql, lib/listingArchive.js
// ARCHIVED_REFUSAL), checked on the server by every route that creates one, on the fake stack:
//   · a direct submit (pages/api/generate.js) is refused with the one line the apply page shows,
//     and writes no application, no event and sends no mail; the tag and the mirror refuse a
//     number made some other way, so nothing reaches the listing by going around the form;
//   · one tap apply is refused the same way, and the tenant's profile is as it was;
//   · restored, the same submit goes through;
//   · before db/025 has run the submit works as it always has;
//   · the realtor's own routes (add by number, a referral put on a listing) refuse it too;
//   · the old delete route is gone: nothing answers at its path and nothing calls it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { clockAt } from '../helpers/clockAt.mjs';
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, INVITE_TOKEN, NOW } from './fixture.mjs';

const generate = (await import('../../pages/api/generate.js')).default;
const tag = (await import('../../pages/api/invite/tag.js')).default;
const mirror = (await import('../../pages/api/applications/mirror.js')).default;
const send = (await import('../../pages/api/send.js')).default;
const archive = (await import('../../pages/api/listings/archive.js')).default;
const addApplicant = (await import('../../pages/api/listings/add-applicant.js')).default;
const assign = (await import('../../pages/api/referrals/assign.js')).default;
const tenantShares = (await import('../../pages/api/tenant/shares.js')).default;
const ticketRoute = (await import('../../pages/api/tenant/prefill-ticket.js')).default;
const S = await import('../../lib/tenantProfileStore.js');
const A = await import('../../lib/listingArchive.js');
const { overrideFeature } = await import('../../lib/features.js');

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else out.push(rel); } return out; };
const LINE = 'This listing is no longer taking applications.';
const REFUSED = { error: LINE, code: 'listing_archived' };
const FORM = { inviteToken: INVITE_TOKEN, fullName: 'Test Person', email: 'tenant@example.com', phone: '416 555 0199', ageConfirmed: true, jobTitle: 'Nurse', employer: 'Northwind Sample Clinic Inc.', yearsAtJob: '3', annualIncome: '90000', previousAddress: '1 Old St', yearsAtPrevious: '2', previousLandlordName: 'A. Owner', currentRent: '2100', moveInDate: '2026-11-01', numberOfOccupants: '1', smoker: 'no', pets: '' };
const settle = () => new Promise((r) => setTimeout(r, 60));
const until = async (fn, tries = 100) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } return null; };

// The fixture with db/025 run (every listing carries archived_at) or not, the invite record the
// realtor's link wrote, and nobody signed in: the tenant's side of the link.
function world(tc, { migrated = true, archived = false } = {}) {
  clockAt(tc, NOW + 30 * 60 * 1000);
  const t = tables();
  Object.assign(t, { application_events: [], tenant_profiles: [], tenant_profile_shareable: [], tenant_profile_documents: [], tenant_profile_checks: [], profile_access_log: [], profile_shares: [] });
  if (migrated) for (const l of t.listings) l.archived_at = null;
  if (archived) t.listings.find((l) => l.id === 'L1').archived_at = new Date(NOW).toISOString();
  const s = installFakeStack({ tables: t, user: null, absentColumns: migrated ? [] : ['archived_at'], env: { RESEND_API_KEY: 're_fake' } });
  s.kv.values[`linvite:${INVITE_TOKEN}`] = { profileId: USER.id, listingId: 'L1', realtorName: 'Sarah Chen', listingName: '210 Carlaw Ave, Unit 4', unit: { monthlyRent: '2600' }, submissionCount: 0 };
  const call = async (handler, body, headers = {}) => { const res = fakeRes(); await handler(fakeReq({ body, headers }), res); return res; };
  // A realtor's request, then the tenant's side again: the same tables and the same store.
  const as = async (user, handler, body) => { const r = installFakeStack({ tables: t, user, kv: s.kv, absentColumns: migrated ? [] : ['archived_at'] }); try { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; } finally { r.restore(); globalThis.__rlStack = s; s.kv.install(); } };
  const snap = () => JSON.stringify({ applications: t.applications, listing_applicants: t.listing_applicants, events: t.events || [], application_events: t.application_events, profile_shares: t.profile_shares });
  const stored = () => Object.keys(s.kv.values).filter((k) => /^(app|docreq|docreq-app):/.test(k));
  return { s, t, call, as, snap, stored };
}
// The whole submit as the apply page runs it; each answer, and the number when there is one.
async function submit(w, form = FORM, extra = {}) {
  const g = await w.call(generate, form, extra.headers);
  if (g.code !== 200) return { g };
  const applicationNumber = g.body.applicationNumber;
  await until(() => w.s.kv.values[`app:${applicationNumber}`]);
  const tg = await w.call(tag, { token: INVITE_TOKEN, applicationNumber });
  const m = tg.code === 200 ? await w.call(mirror, { token: INVITE_TOKEN, applicationNumber, ...(extra.ticket ? { prefillTicket: extra.ticket } : {}) }, extra.headers) : null;
  return { g, tg, m, applicationNumber };
}

test('a direct submit to an archived listing is refused: no application, no event, no mail', async (tc) => {
  const w = world(tc, { archived: true });
  try {
    const before = w.snap(); const count = w.s.kv.values[`linvite:${INVITE_TOKEN}`].submissionCount;
    const g = await w.call(generate, FORM);
    assert.equal(g.code, 409); assert.deepEqual(g.body, REFUSED, 'the one line, and nothing else: no number, no token, no signature for the mail');
    await settle();
    assert.deepEqual(w.stored(), [], 'no application record');
    assert.equal(w.snap(), before, 'no application, no link, no event');
    assert.equal(w.s.resend.sent.length, 0, 'no mail');
    // The confirmation email needs the signature only a submit that went through hands out.
    const mail = await w.call(send, { email: FORM.email, fullName: FORM.fullName, applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'x'.repeat(32) });
    assert.equal(mail.code, 401); assert.equal(w.s.resend.sent.length, 0);

    // Around the form: a number made with no invite, then tagged and mirrored to the archived listing.
    const loose = await w.call(generate, { ...FORM, inviteToken: undefined });
    assert.equal(loose.code, 200, JSON.stringify(loose.body));
    const applicationNumber = loose.body.applicationNumber;
    assert.ok(await until(() => w.s.kv.values[`app:${applicationNumber}`]));
    const tg = await w.call(tag, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(tg.code, 409); assert.deepEqual(tg.body, REFUSED);
    assert.equal(w.s.kv.lists[`invite_submissions:${INVITE_TOKEN}`], undefined, 'nothing tagged to the invite');
    assert.equal(w.s.kv.values[`linvite:${INVITE_TOKEN}`].submissionCount, count, 'the invite counts no submission');
    // Even with the tag there (written before the listing was archived), the mirror refuses.
    w.s.kv.lists[`invite_submissions:${INVITE_TOKEN}`] = [applicationNumber];
    const m = await w.call(mirror, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(m.code, 409); assert.deepEqual(m.body, REFUSED);
    assert.equal(w.snap(), before, 'no application row, no link, no applicant_applied, no state written');
    assert.deepEqual(w.stored().filter((k) => /^docreq/.test(k)), [], 'no document request');
    assert.equal(w.s.resend.sent.length, 0);
  } finally { w.s.restore(); }
});

test('one tap apply to an archived listing is refused the same way, and the profile is as it was', async (tc) => {
  const w = world(tc, { archived: true });
  try {
    // A tenant with a profile, signed in: the page fills the form from it and is handed a ticket.
    const p = S.blankProfile('maya@example.com'); p.facts = { fullName: 'Maya Okafor', email: 'maya@example.com', employer: 'Northwind Sample Clinic Inc.', jobTitle: 'Clinic Coordinator', annualIncome: '85000' }; p.factsUpdatedAt = '2026-11-01T15:00:00.000Z';
    await S.saveProfile(p);
    const cookie = { cookie: `${S.COOKIE_NAME}=${encodeURIComponent(await S.createSession(p.id))}` };
    w.s.kv.values[`tprofile_id:${p.id}`] = JSON.stringify(p.emailKey);
    const profileBefore = JSON.stringify(w.s.kv.values[`tprofile:${p.emailKey}`]);
    const tr = await w.call(ticketRoute, { source: 'profile' }, cookie);
    assert.equal(tr.body.ok, true);
    const before = w.snap();
    const out = await submit(w, { ...FORM, fullName: 'Maya Okafor', email: 'maya@example.com' }, { headers: cookie, ticket: tr.body.ticket });
    assert.equal(out.g.code, 409); assert.deepEqual(out.g.body, REFUSED);
    await settle();
    assert.deepEqual(w.stored(), [], 'no application record');
    // The share the page asks for after a one tap submit: there is no application to share for.
    const share = await w.call(tenantShares, { action: 'apply', inviteToken: INVITE_TOKEN, applicationNumber: 'RL-2026-ABCD-EFGH' }, cookie);
    assert.notEqual(share.body.shared, true);
    assert.equal(w.t.profile_shares.length, 0, 'no share');
    assert.equal(w.snap(), before, 'no application, no link, no event');
    assert.equal(w.s.resend.sent.length, 0, 'no mail');
    assert.equal(JSON.stringify(w.s.kv.values[`tprofile:${p.emailKey}`]), profileBefore, 'everything in the profile is kept');
    assert.ok(await S.sessionProfile(fakeReq({ headers: cookie })), 'and the tenant is still signed in');
  } finally { w.s.restore(); }
});

test('restoring the listing lets a submit through', async (tc) => {
  const w = world(tc);
  try {
    assert.equal((await w.as(USER, archive, { listingIds: ['L1'], archived: true })).code, 200);
    assert.equal((await w.call(generate, FORM)).code, 409, 'archived by the realtor: refused');
    assert.equal((await w.as(USER, archive, { listingIds: ['L1'], archived: false })).code, 200);
    const out = await submit(w);
    assert.equal(out.g.code, 200, JSON.stringify(out.g.body)); assert.equal(out.tg.code, 200); assert.equal(out.m.code, 200, JSON.stringify(out.m.body));
    assert.equal(out.m.body.linked, true);
    const row = w.t.applications.find((a) => a.application_number === out.applicationNumber);
    assert.ok(row, 'the application row');
    assert.equal(w.t.listing_applicants.filter((j) => String(j.application_id) === String(row.id) && j.listing_id === 'L1').length, 1);
    assert.equal(w.t.events.filter((e) => e.type === 'applicant_applied' && String(e.application_id) === String(row.id)).length, 1);
    const sent = await w.call(send, { email: FORM.email, fullName: FORM.fullName, applicationNumber: out.applicationNumber, ownerToken: out.g.body.ownerToken, signature: out.g.body.emailSig });
    assert.equal(sent.code, 200); assert.equal(w.s.resend.sent.length, 1, 'and the confirmation goes out');
  } finally { w.s.restore(); }
});

test('before db/025 has run a submit succeeds as it does today', async (tc) => {
  const w = world(tc, { migrated: false });
  try {
    assert.equal(await A.inviteArchived(INVITE_TOKEN), false);
    assert.equal(await A.archivedById(w.s.db, 'L1'), false);
    const out = await submit(w);
    assert.equal(out.g.code, 200, JSON.stringify(out.g.body)); assert.equal(out.tg.code, 200); assert.equal(out.m.code, 200, JSON.stringify(out.m.body));
    assert.equal(out.m.body.mirrored, true); assert.equal(out.m.body.linked, true);
    const row = w.t.applications.find((a) => a.application_number === out.applicationNumber);
    assert.ok(row); assert.equal(w.t.events.filter((e) => e.type === 'applicant_applied' && String(e.application_id) === String(row.id)).length, 1);
    assert.match(out.m.body.docRequest.token, /^[a-f0-9]{32}$/, 'the document request as before');
    // The realtor's add by number, the same.
    const added = await w.as(USER, addApplicant, { listingId: 'L2', applicationNumber: out.applicationNumber });
    assert.equal(added.code, 200, JSON.stringify(added.body));
  } finally { w.s.restore(); }
});

test('the realtor\'s own routes refuse an archived listing: add by number and a referral', async (tc) => {
  const w = world(tc);
  try {
    const loose = await w.call(generate, { ...FORM, inviteToken: undefined });
    const applicationNumber = loose.body.applicationNumber;
    assert.ok(await until(() => w.s.kv.values[`app:${applicationNumber}`]));
    w.t.listings.find((l) => l.id === 'L2').archived_at = new Date(NOW).toISOString();
    const before = w.snap();
    const refused = await w.as(USER, addApplicant, { listingId: 'L2', applicationNumber });
    assert.equal(refused.code, 409); assert.deepEqual(refused.body, REFUSED);
    assert.equal(w.snap(), before, 'nothing written');
    assert.equal((await w.as(USER, addApplicant, { listingId: 'L9', applicationNumber })).code, 404, 'someone else\'s listing is still not found, archived or not');
    // A referral put on an archived listing (the route is paused; switched on for this test).
    overrideFeature('referrals', true);
    try {
      const id = '11111111-2222-4333-8444-555555555555';
      w.s.kv.values[`referral:${id}`] = { id, status: 'approved', from: { profileId: 'realtor-2' }, to: { email: USER.email }, referredApplicationNumber: applicationNumber };
      const kept = JSON.stringify(w.s.kv.values[`referral:${id}`]);
      const r = await w.as(USER, assign, { referralId: id, listingId: 'L2' });
      assert.equal(r.code, 409); assert.deepEqual(r.body, REFUSED);
      assert.equal(JSON.stringify(w.s.kv.values[`referral:${id}`]), kept, 'the referral is as it was');
      assert.equal(w.snap(), before);
    } finally { overrideFeature('referrals', undefined); }
    // Restored, the add goes through.
    w.t.listings.find((l) => l.id === 'L2').archived_at = null;
    const added = await w.as(USER, addApplicant, { listingId: 'L2', applicationNumber });
    assert.equal(added.code, 200, JSON.stringify(added.body));
    assert.equal(w.t.listing_applicants.filter((j) => j.listing_id === 'L2').length, 2);
  } finally { w.s.restore(); }
});

// Archived during a submit: the number exists (generate answered before the realtor archived), and
// the save to the listing is refused. The tag refuses; with the tag already written, the mirror
// refuses. Nothing reaches the listing, and the page shows the closed line with no Try again.
test('archived between the submit and its save: the tag and the mirror refuse, and the page shows the closed line, not Try again', async (tc) => {
  const { runSubmitChain, SAVING_COPY } = await import('../../lib/submitChain.js');
  const w = world(tc);
  try {
    const g = await w.call(generate, FORM);
    assert.equal(g.code, 200, JSON.stringify(g.body));
    const applicationNumber = g.body.applicationNumber;
    assert.ok(await until(() => w.s.kv.values[`app:${applicationNumber}`]));
    assert.equal((await w.as(USER, archive, { listingIds: ['L1'], archived: true })).code, 200, 'the realtor archives while the tenant\'s save is on its way');
    const before = w.snap();
    // The chain as the page runs it, over the real routes: every try of the tag is refused.
    const answers = [];
    const post = async (url, body) => { const res = await w.call(url === '/api/invite/tag' ? tag : mirror, body); answers.push({ url, code: res.code, body: res.body }); return { ok: res.code >= 200 && res.code < 300, status: res.code, json: res.body }; };
    const out = await runSubmitChain({ post, token: INVITE_TOKEN, applicationNumber, sleep: async () => {} });
    assert.equal(out.ok, false); assert.equal(out.step, 'tag'); assert.equal(out.error.message, LINE);
    assert.ok(answers.length && answers.every((a) => a.url === '/api/invite/tag' && a.code === 409), 'the mirror is never asked');
    assert.deepEqual(answers[0].body, REFUSED, 'the answer the page reads: the line and its code');
    // Archived after the tag was written: the mirror refuses the same way.
    w.s.kv.lists[`invite_submissions:${INVITE_TOKEN}`] = [applicationNumber];
    const m = await w.call(mirror, { token: INVITE_TOKEN, applicationNumber });
    assert.equal(m.code, 409); assert.deepEqual(m.body, REFUSED);
    assert.equal(w.snap(), before, 'no application row, no link, no event');
    assert.deepEqual(w.stored().filter((k) => /^docreq/.test(k)), [], 'no document request');
    assert.equal(w.s.resend.sent.length, 0, 'no mail');
  } finally { w.s.restore(); }

  // The page: the refusal's code decides, it is final (nothing asked again, no pause), and the form
  // comes back with the line above the tenant's answers. Try again is for a save that only failed.
  const page = code('pages/apply/[token].js');
  assert.match(page, /import \{ ARCHIVED_LINE, ARCHIVED_CODE \} from '\.\.\/\.\.\/lib\/listingArchiveRule';/);
  assert.match(page, /if \(closed\) return closed;/, 'once refused, no further request is sent');
  assert.match(page, /if \(!r\.ok && answer\.json && answer\.json\.code === ARCHIVED_CODE\) closed = answer;/);
  const closedAt = page.indexOf('if (!out.ok && closed) {'); const heldAt = page.indexOf('setSaveHeld(true)');
  assert.ok(closedAt > 0 && heldAt > closedAt, 'the closed answer is read before the page holds with Try again');
  assert.match(page.slice(closedAt, heldAt), /setError\(ARCHIVED_LINE\);\s*setStatus\('ready'\);\s*window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\);\s*return;/, 'the line, the form with its answers, and out before Try again');
  assert.doesNotMatch(page.slice(closedAt, heldAt), /setForm\(|setStep\(/, 'the answers and the step stay as they were');
  // Try again shows only while the page is held on the saving card, which the closed answer never reaches.
  assert.match(page, /\{saveHeld\s*\? <button type="button" onClick=\{saveToListing\} className="mp-btn mp-btn-red"[^>]*>\{SAVING_COPY\.tryAgain\}<\/button>/);
  assert.equal(SAVING_COPY.tryAgain, 'Try again');
});

test('every route that creates an application asks before it writes, and the page shows the line', () => {
  // The five routes, each with the refusal ahead of its first write.
  const order = (p, check, write) => { const text = code(p); const at = text.indexOf(check); assert.ok(at > 0, `${p} asks`); const w = text.indexOf(write); assert.ok(w > at, `${p} asks before it writes`); assert.match(text, /res\.status\(ARCHIVED_REFUSAL\.status\)\.json\(ARCHIVED_REFUSAL\.body\)/, p); };
  order('pages/api/generate.js', 'await inviteArchived(inviteToken)', 'storeApplication(applicationNumber');
  order('pages/api/invite/tag.js', 'await inviteArchived(token)', "kv.command(['lpush'");
  order('pages/api/applications/mirror.js', 'await archivedById(admin, listing.id)', 'await upsertApplication(admin, app)');
  order('pages/api/listings/add-applicant.js', 'await archivedById(getSupabaseAdminClient(), listing.id)', 'await upsertApplication(admin, app)');
  order('pages/api/referrals/assign.js', 'await archivedById(getSupabaseAdminClient(), listing.id)', 'assignReferral(ref, listing, ctx.user)');
  // The realtor's two stay behind the session, the entitlement and the ownership read.
  for (const p of ['pages/api/listings/add-applicant.js', 'pages/api/referrals/assign.js']) {
    const text = code(p); const asks = text.indexOf('archivedById(');
    assert.ok(text.indexOf('requireEntitlement(') < asks && text.indexOf('requireEntitlement(') > 0, `${p}: entitlement first`);
    assert.ok(text.indexOf(".from('listings')") < asks, `${p}: the ownership read first`);
  }
  // No other file under pages/api or lib links an application to a listing or writes the row.
  const writers = [...walk('pages/api/'), ...walk('lib/')].filter((p) => /\.js$/.test(p) && /(linkApplicantToListing|upsertApplication)\(/.test(code(p)) && !/^lib\/supabaseBridge\.js$/.test(p)).sort();
  assert.deepEqual(writers, ['lib/referrals.js', 'pages/api/application/manage.js', 'pages/api/applications/mirror.js', 'pages/api/listings/add-applicant.js']);
  assert.doesNotMatch(code('pages/api/application/manage.js'), /linkApplicantToListing\(/, 'the tenant\'s edit of their own application links nothing');
  assert.deepEqual([...walk('pages/api/')].filter((p) => /assignReferral\(/.test(code(p))), ['pages/api/referrals/assign.js'], 'the one route that puts a referral on a listing');
  // One line, said once, and the same one the archived link shows.
  assert.equal(A.ARCHIVED_REFUSAL.status, 409); assert.deepEqual(A.ARCHIVED_REFUSAL.body, REFUSED);
  assert.equal((code('lib/listingArchiveRule.js').match(/no longer taking applications/g) || []).length, 1);
  const page = code('pages/apply/[token].js');
  assert.ok(page.includes(`{noWidow('${LINE}')}`), 'the archived link says the same line');
  // The page shows what the route answered above the form, and the form keeps what was typed.
  assert.match(page, /throw new Error\(json\?\.error \|\| 'Could not submit your application\. Please try again\.'\);/);
  assert.match(page, /setError\(e\.message \|\| 'Something went wrong\. Please try again\.'\);\s*\n\s*setStatus\('ready'\);/);
  assert.match(page, /\{error && n === step && <p role="alert" className="mp-alert"[^>]*>\{noWidow\(error\)\}<\/p>\}/);
  assert.doesNotMatch(code('lib/listingArchive.js'), /owner_token/);
});

test('the old delete route is gone: nothing answers at its path and nothing calls it', () => {
  assert.equal(existsSync(new URL('pages/api/listings/delete.js', ROOT)), false, 'no file, so Next answers 404 at /api/listings/delete');
  // Nothing else can answer there: no dynamic or catch all route beside it, no rewrite, no middleware.
  assert.deepEqual(walk('pages/api/').filter((p) => /\[/.test(p)), [], 'no dynamic API route');
  assert.doesNotMatch(src('next.config.js'), /rewrites|redirects/);
  for (const f of ['middleware.js', 'middleware.mjs', 'pages/_middleware.js']) assert.equal(existsSync(new URL(f, ROOT)), false, f);
  // No page, component or script asks for it; the only delete is the one behind the rule.
  const callers = [...walk('pages/'), ...walk('components/'), ...walk('scripts/'), ...walk('public/').filter((p) => /\.(js|html)$/.test(p))].filter((p) => /\.(js|mjs|html)$/.test(p) && /listings\/delete/.test(src(p)));
  assert.deepEqual(callers, []);
  // Nor does the dashboard's seam name it: not in the routes the UI can hit, not in the sandbox.
  assert.deepEqual(walk('lib/').filter((p) => /listings\/delete/.test(src(p))), [], 'no entry for the removed route under lib');
  assert.match(code('lib/demoAdapter.js'), /'POST \/api\/listings\/archive': /); assert.match(code('lib/demoAdapter.js'), /'POST \/api\/listings\/remove': /);
  assert.match(code('components/dashboard/HomeView.js'), /post\('\/api\/listings\/remove', \{ listingIds: ids \}\)/);
  assert.match(code('components/dashboard/ListingView.js'), /adapter\.fetch\('\/api\/listings\/remove',/);
  assert.match(code('pages/api/listings/remove.js'), /removeListings\(/);
  assert.match(code('lib/listingArchive.js'), /const checks = Object\.fromEntries\(ids\.map\(\(id\) => \[id, deleteCheck\(apps\[id\]\)\]\)\);/, 'the rule decides every delete');
  const routes = walk('pages/api/').filter((p) => /deleteListing\(/.test(code(p)));
  assert.deepEqual(routes, [], 'no route deletes a listing without the rule');
});
