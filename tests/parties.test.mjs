// Parties on one application (lib/parties.js, docs/parties.md), through the real routes over the
// fake stack: the primary invites with their owner token and sees standing only; the party opens
// their own page with their own token, submits their own facts and income, gets their own document
// request, can decline or withdraw and the primary is told; the wrong token opens nothing; a
// guarantor only where the listing accepts one; the realtor's card reads every party with the
// same labels; Fit is byte identical with zero, one or two parties; mark rented and reconsider
// email every party once; a party's documents land on the party's row and under their name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from './helpers/fakeStack.mjs';
import { tables, USER } from './routes/fixture.mjs';

const P = await import('../lib/parties.js');
const { computeFit } = await import('../lib/fitScore.js');
const { buildSnapshot } = await import('../lib/reportSnapshot.js');
const { reportText } = await import('../lib/reportText.js');
const { reportLines } = await import('../lib/landlordReportPdf.js');
const { partyRecipients, partyUrl, isPartyToken } = await import('../lib/partyStore.js');
const { runNudges, NUDGE_ONE_AFTER_MS } = await import('../lib/nudges.js');
const { PENDING_KEY, appKey, kvSmembers, kvMgetJson, kvSetJson, kvSrem, reqKey, uploadUrl, DOCREQ_TTL } = await import('../lib/docRequest.js');
const { kvExpire } = await import('../lib/kv.js');
const { fetchListingApplicants, attachDocVerifications } = await import('../lib/supabaseBridge.js');
const manage = (await import('../pages/api/party/manage.js')).default;
const self = (await import('../pages/api/party/self.js')).default;
const appManage = (await import('../pages/api/application/manage.js')).default;
const tenantAnalyze = (await import('../pages/api/upload/analyze-file.js')).default;
const tenantFinalize = (await import('../pages/api/upload/finalize.js')).default;
const status = (await import('../pages/api/listings/status.js')).default;
const confirm = (await import('../pages/api/applicants/confirm.js')).default;
const openDocument = (await import('../pages/api/documents/open.js')).default;
const { reconsiderApplicant } = await import('../lib/realtorWrites.js');

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const call = async (handler, body, method = 'POST', query = {}) => { const res = fakeRes(); await handler(fakeReq({ method, body, query }), res); return res; };
const pdf = (name) => ({ name, type: 'application/pdf', data: Buffer.from(`%PDF-1.4 synthetic test file ${name} `.repeat(4)).toString('base64') });
const TOKEN = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
// The primary's KV record, as pages/api/generate.js writes it: the owner token lives there.
const withApp = (s, appId, ownerToken = TOKEN) => { const a = s.db.tables.applications.find((x) => x.id === appId); s.kv.values[`app:${a.application_number}`] = { applicationNumber: a.application_number, ownerToken, email: a.email, tenant: { fullName: a.full_name } }; a.owner_token = ownerToken; return a; };
const up = (over = {}) => { const t = tables(); return installFakeStack({ tables: { ...t, application_events: [], ...over }, user: USER }); };
const FORM = { fullName: 'Jordan Lee', phone: '416 555 0199', employmentType: 'full-time', jobTitle: 'Analyst', employer: 'Northwind Sample Clinic Inc.', yearsAtJob: '2', annualIncome: '64000', incomeKind: 'employment' };
const tokenFromMail = (s, to) => { const m = s.resend.sent.find((x) => String(x.to).toLowerCase() === to); const found = m && String(m.text).match(/\/party\/([A-Z2-9]{32})/); return found ? found[1] : null; };

test('the words and the rules: roles, labels, who may be invited where, the form rows', () => {
  assert.deepEqual([...P.INVITABLE_ROLES], ['co_applicant', 'guarantor'], 'the occupant role is offered on no screen');
  assert.equal(P.ROLE_LABEL.co_applicant, 'Co applicant'); assert.equal(P.INVITE_CARD.title, 'Applying with someone?'); assert.equal(P.INVITE_CARD.householdLine, 'Household income is shown, not scored.');
  assert.equal(P.canInviteRole('guarantor', { pref_guarantor_accepted: false }, []).ok, false);
  assert.equal(P.canInviteRole('guarantor', { pref_guarantor_accepted: true }, []).ok, true);
  assert.equal(P.canInviteRole('guarantor', {}, [{ role: 'guarantor', status: 'submitted' }]).reason, 'one_guarantor');
  assert.equal(P.canInviteRole('guarantor', {}, [{ role: 'guarantor', status: 'declined' }]).ok, true, 'a declined guarantor frees the seat');
  assert.equal(P.canInviteRole('occupant', {}, []).ok, false); assert.equal(P.canInviteRole('co_applicant', {}, [{}, {}, {}]).reason, 'full');
  const row = P.partyRowFromForm({ ...FORM, address: '1 Sample St' }, 'co_applicant');
  assert.equal(row.address, null, 'an address is kept for a guarantor alone'); assert.equal(row.annual_income, 64000); assert.equal(row.incomeKind, 'employment'); assert.equal(row.employer, 'Northwind Sample Clinic Inc.');
  assert.equal(P.partyRowFromForm({ ...FORM, employmentType: 'self-employed' }, 'guarantor').incomeKind, 'self_employed');
  assert.deepEqual(Object.keys(P.partyFormErrors({}, 'guarantor')).sort(), ['address', 'annualIncome', 'fullName']);
  for (const t of [P.GUARANTOR_SENTENCE, P.PARTY_CONSENT_LINE, P.DECLINE_LINE, P.WITHDRAW_LINE, ...Object.values(P.INVITE_CARD)]) { assert.doesNotMatch(t, /[\u2014\u2013]| - /); assert.doesNotMatch(t, /relationship|spouse|partner|family|married|children/i); }
  assert.equal(P.GUARANTOR_SENTENCE, 'A guarantor agrees to pay the rent if the tenants do not.');
});

test('the primary invites with their owner token, sees standing only; a guarantor only where the listing accepts one; the wrong token opens nothing', async () => {
  const s = up();
  try {
    const a4 = withApp(s, 'A4');
    const auth = { applicationNumber: a4.application_number, ownerToken: TOKEN };
    let r = await call(manage, { ...auth, action: 'list' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.parties, []); assert.equal(r.body.acceptsGuarantor, true, 'L1 accepts one'); assert.deepEqual(r.body.canInvite, { co_applicant: true, guarantor: true });
    assert.equal((await call(manage, { ...auth, ownerToken: 'WRONGWRONGWRONGWRONGWRONGWRONG22', action: 'list' })).code, 401);
    r = await call(manage, { ...auth, action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.parties.length, 1); assert.equal(r.body.parties[0].status, 'invited'); assert.equal(r.body.invited.emailed, true);
    assert.deepEqual(Object.keys(r.body.parties[0]).sort(), ['declinedAt', 'email', 'id', 'invitedAt', 'name', 'role', 'roleLabel', 'status', 'statusLabel', 'submittedAt', 'withdrawnAt'], 'standing only: no token, no income, no documents');
    const row = s.db.tables.application_parties[0];
    assert.ok(isPartyToken(row.party_token)); assert.equal(row.role, 'co_applicant'); assert.equal(row.application_id, 'A4');
    const mail = s.resend.sent.find((m) => m.to === 'jordan@example.com');
    assert.match(mail.subject, /210 Carlaw Ave, Unit 4: Applicant D4D4 is applying with you/); assert.match(mail.text, new RegExp(partyUrl(row.party_token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.doesNotMatch(mail.text, new RegExp(TOKEN), 'never the primary\'s owner token');
    assert.deepEqual(s.db.tables.events.filter((e) => e.type === 'party_invited').map((e) => [e.profile_id, e.payload.partyName, e.payload.role]), [[USER.id, 'Jordan Lee', 'co_applicant']]);
    assert.deepEqual(s.db.tables.application_events.map((e) => [e.listing_applicant_id, e.actor, e.actor_type, e.reason]), [['J4', row.id, 'applicant', 'party_invited']], 'progress rides application_events with actor applicant');
    // The same email twice is refused; the primary's own email is refused.
    assert.equal((await call(manage, { ...auth, action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' })).code, 400);
    assert.equal((await call(manage, { ...auth, action: 'invite', role: 'co_applicant', name: 'Me', email: a4.email })).code, 400);
    // A guarantor on L2, which does not accept one (tests/routes/fixture.mjs): refused; a co applicant there is fine.
    const a6 = withApp(s, 'A6', 'SECONDSECONDSECONDSECONDSECOND22');
    const auth6 = { applicationNumber: a6.application_number, ownerToken: 'SECONDSECONDSECONDSECONDSECOND22' };
    r = await call(manage, { ...auth6, action: 'list' }); assert.equal(r.body.acceptsGuarantor, false); assert.equal(r.body.canInvite.guarantor, false);
    assert.equal((await call(manage, { ...auth6, action: 'invite', role: 'guarantor', name: 'Pat Guarantor', email: 'pat@example.com' })).code, 400);
    assert.equal((await call(manage, { ...auth6, action: 'invite', role: 'co_applicant', name: 'Sam Co', email: 'sam@example.com' })).code, 200);
    // A guarantor on L1: once.
    assert.equal((await call(manage, { ...auth, action: 'invite', role: 'guarantor', name: 'Pat Guarantor', email: 'pat@example.com' })).code, 200);
    assert.equal((await call(manage, { ...auth, action: 'invite', role: 'guarantor', name: 'Second Guarantor', email: 'pat2@example.com' })).code, 400, 'one guarantor');
  } finally { s.restore(); }
});

test('the party: their own token opens their own page and nothing else; submit writes their row and income_sources, mints their request, moves the application to docs pending', async () => {
  const s = up();
  try {
    const a4 = withApp(s, 'A4');
    s.db.tables.listing_applicants.find((j) => j.id === 'J4').state = 'submitted';
    await call(manage, { applicationNumber: a4.application_number, ownerToken: TOKEN, action: 'invite', role: 'guarantor', name: 'Pat Guarantor', email: 'pat@example.com' });
    const token = tokenFromMail(s, 'pat@example.com');
    assert.ok(token, 'the link in the email');
    let r = await call(self, null, 'GET', { token });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.role, 'guarantor'); assert.equal(r.body.status, 'in_progress', 'opening the form is in progress'); assert.equal(r.body.primaryFirst, 'Applicant'); assert.equal(r.body.listingName, '210 Carlaw Ave, Unit 4');
    for (const k of ['annual_income', 'income', 'docVerifications', 'owner_token', 'ownerToken', 'documents']) assert.equal(JSON.stringify(r.body).includes(`"${k}"`), false, `nothing of the primary's: ${k}`);
    assert.equal((await call(self, null, 'GET', { token: 'WRONGWRONGWRONGWRONGWRONGWRONG22' })).code, 401);
    assert.equal((await call(appManage, { applicationNumber: a4.application_number, ownerToken: token, action: 'view' })).code, 401, 'a party token never opens the primary\'s page');
    // Submit: the address is required of a guarantor.
    r = await call(self, { token, action: 'submit', form: FORM });
    assert.equal(r.code, 400); assert.match(r.body.error, /address/i);
    r = await call(self, { token, action: 'submit', form: { ...FORM, fullName: 'Pat Guarantor', address: '9 Guarantor Rd, Ottawa' } });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'submitted'); assert.ok(r.body.docRequest && r.body.docRequest.token, 'their own document request');
    const row = s.db.tables.application_parties[0];
    assert.equal(row.status, 'submitted'); assert.equal(row.address, '9 Guarantor Rd, Ottawa'); assert.equal(row.annual_income, 64000); assert.ok(row.consented_at && row.submitted_at);
    assert.deepEqual(s.db.tables.income_sources.map((i) => [i.application_party_id, i.kind, i.annual_amount]), [[row.id, 'employment', 64000]]);
    assert.equal(s.db.tables.listing_applicants.find((j) => j.id === 'J4').state, 'docs_pending', 'a party\'s missing documents hold the application');
    const rec = s.kv.values[reqKey(r.body.docRequest.token)];
    assert.equal(rec.partyId, row.id); assert.equal(rec.tenantName, 'Pat Guarantor'); assert.ok(s.kv.sets[PENDING_KEY].has(`J4:p:${row.id}`), 'the reminders key is the party\'s own');
    assert.deepEqual(s.db.tables.application_events.map((e) => [e.from_state, e.to_state, e.actor_type, e.reason]), [['submitted', 'submitted', 'applicant', 'party_invited'], ['submitted', 'submitted', 'applicant', 'party_submitted'], ['submitted', 'docs_pending', 'applicant', 'party_documents_requested']]);
    // Their documents land on their row, under their name, and move the application back.
    const up1 = await call(tenantAnalyze, { token: r.body.docRequest.token, index: 0, total: 1, file: pdf('letter (Pat Guarantor).pdf') });
    assert.equal(up1.code, 200, JSON.stringify(up1.body));
    const held = s.db.tables.applicant_documents; assert.equal(held.length, 1); assert.equal(held[0].application_party_id, row.id); assert.equal(held[0].listing_applicant_id, 'J4');
    const fin = await call(tenantFinalize, { token: r.body.docRequest.token });
    assert.equal(fin.code, 200, JSON.stringify(fin.body));
    assert.ok(s.db.tables.application_parties[0].doc_verifications.active, 'the report on the party\'s row'); assert.equal(s.db.tables.listing_applicants.find((j) => j.id === 'J4').doc_verifications, null, 'never on the primary\'s');
    assert.equal(s.db.tables.listing_applicants.find((j) => j.id === 'J4').state, 'submitted');
    assert.equal(s.kv.sets[PENDING_KEY].has(`J4:p:${row.id}`), false);
    // The realtor reads the party with the same labels, and the checklist's confirmation key makes it verified.
    const list = await attachDocVerifications(s.db, 'L1', await fetchListingApplicants(s.db, 'L1'));
    const j4 = list.find((a) => a.linkId === 'J4');
    assert.equal(j4.parties.length, 1); assert.equal(j4.parties[0].name, 'Pat Guarantor'); assert.equal(j4.parties[0].label, 'check docs', 'the fake letter prints 85,000 against 64,000 stated: a mismatch, the label reads check docs'); assert.equal('party_token' in j4.parties[0], false); assert.equal(JSON.stringify(j4.parties).includes(token), false);
    assert.equal(j4.storedDocuments[0].partyId, row.id);
    const c = await call(confirm, { linkId: 'J4', key: P.partyConfirmKey(row.id), on: true });
    assert.equal(c.code, 200, JSON.stringify(c.body));
    const again = await attachDocVerifications(s.db, 'L1', await fetchListingApplicants(s.db, 'L1'));
    assert.equal(again.find((a) => a.linkId === 'J4').parties[0].label, 'verified');
    assert.equal((await call(confirm, { linkId: 'J4', key: 'party:x:income', on: true })).code, 400, 'only the employer key');
    // Withdraw from their own page: the primary is told, the row stays.
    const w = await call(self, { token, action: 'withdraw' });
    assert.equal(w.code, 200); assert.equal(w.body.status, 'withdrawn'); assert.equal(w.body.primaryTold, true);
    const notice = s.resend.sent.find((m) => m.to === a4.email); assert.match(notice.subject, /Pat Guarantor withdrew/); assert.match(notice.text, new RegExp(TOKEN), 'the primary\'s own link, to the primary alone');
    assert.equal(s.db.tables.events.filter((e) => e.type === 'party_withdrawn').length, 1);
  } finally { s.restore(); }
});

test('decline from the email: nothing kept, the primary told, the seat free again', async () => {
  const s = up();
  try {
    const a4 = withApp(s, 'A4');
    const auth = { applicationNumber: a4.application_number, ownerToken: TOKEN };
    await call(manage, { ...auth, action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    const token = tokenFromMail(s, 'jordan@example.com');
    const d = await call(self, { token, action: 'decline' });
    assert.equal(d.code, 200); assert.equal(d.body.status, 'declined');
    const row = s.db.tables.application_parties[0]; assert.equal(row.status, 'declined'); assert.equal(row.annual_income == null, true); assert.equal(s.db.tables.income_sources.length, 0);
    assert.match(s.resend.sent.find((m) => m.to === a4.email).subject, /Jordan Lee declined/);
    assert.equal((await call(self, { token, action: 'submit', form: FORM })).code, 409, 'a closed invite takes no form');
    const l = await call(manage, { ...auth, action: 'list' });
    assert.equal(l.body.parties[0].status, 'declined'); assert.equal(l.body.canInvite.co_applicant, true, 'invite someone else');
    assert.equal(s.db.tables.application_events.map((e) => e.reason).join(','), 'party_invited,party_declined');
  } finally { s.restore(); }
});

test('Fit is byte identical with zero, one or two parties attached, and the parties never enter the primary\'s report', () => {
  const application = { id: 'A1', full_name: 'Test Person', annual_income: 85000, employer: 'Northwind', years_at_job: '3', prev_landlord_name: 'A. Patel', years_at_previous: '4', references: [{ name: 'R' }] };
  const listing = { monthly_rent: 2600, pref_requires_employer_verification: true };
  const party = (role) => ({ id: `${role}-1`, role, status: 'submitted', annualIncome: 200000, label: 'docs match' });
  const zero = computeFit({ application, listing, verification: null, confirmations: {} });
  const one = computeFit({ application: { ...application, parties: [party('co_applicant')] }, listing, verification: null, confirmations: {} });
  const two = computeFit({ application: { ...application, parties: [party('co_applicant'), party('guarantor')] }, listing, verification: null, confirmations: {} });
  assert.equal(JSON.stringify(one), JSON.stringify(zero)); assert.equal(JSON.stringify(two), JSON.stringify(zero));
  assert.equal(zero.incomeUsed, 85000, 'the primary\'s income alone');
  assert.doesNotMatch(src('lib/fitScore.js'), /parties|income_sources|application_parties/, 'Fit reads no party');
  assert.doesNotMatch(src('lib/deriveScorecard.js'), /parties/);
  // The landlord surfaces carry the parties in the same words.
  const applicants = [{ linkId: 'J1', decisionStatus: 'none', confirmations: {}, docVerifications: [], parties: [{ ...party('guarantor'), name: 'Pat Guarantor', roleLabel: 'Guarantor', statusLabel: 'Submitted', employer: 'Acme', jobTitle: 'Clerk', yearsAtJob: '2', incomeKind: 'employment' }, { ...party('co_applicant'), name: 'Jordan Lee', roleLabel: 'Co applicant', status: 'invited', statusLabel: 'Invited', annualIncome: null }], application: { ...application, fit: { score: 4.1, scoreExact: 4.1, label: 'stated', ratio: 37, incomeUsed: 85000, parts: {}, evidence: {}, criteria: [] } } }];
  const p = buildSnapshot({ listing: { id: 'L1', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600 }, applicants, profile: { id: 'P1', full_name: 'Sarah Chen' }, now: new Date('2026-09-06T12:00:00Z') });
  assert.deepEqual(p.applicants[0].parties.map((x) => [x.name, x.roleLabel, x.statusLabel]), [['Pat Guarantor', 'Guarantor', 'Submitted'], ['Jordan Lee', 'Co applicant', 'Invited']]);
  assert.deepEqual(p.applicants[0].parties[0].facts, ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year (Employment)', 'Income stated']);
  assert.deepEqual(p.applicants[0].parties[1].facts, []);
  assert.equal(JSON.stringify(p.applicants).includes('email'), false); assert.equal(JSON.stringify(p.applicants).includes('token'), false);
  const text = reportText(p, { pageUrl: 'https://rentletter.ca/r/x' });
  assert.match(text, /   Pat Guarantor, guarantor, submitted: Acme, Clerk, 2 yrs at job, Income \$200,000 a year \(Employment\), Income stated/); assert.match(text, /   Household income is shown, not scored\./);
  assert.match(reportLines(p).blocks[0].parties[0], /^Pat Guarantor, guarantor, submitted: Acme/); assert.equal(reportLines(p).blocks[0].parties.at(-1), 'Household income is shown, not scored.');
  assert.doesNotMatch(text, /[\u2014\u2013]/);
  assert.match(src('pages/r/[token].js'), /data-parties-row/); assert.match(src('components/dashboard/ListingView.js'), /INVITE_CARD\.householdLine/);
});

test('mark rented emails every party once with what the primary gets; reconsider does the same; the reminders reach the party', async () => {
  const s = up();
  try {
    const a4 = withApp(s, 'A4');
    s.db.tables.listing_applicants.find((j) => j.id === 'J4').state = 'submitted';
    await call(manage, { applicationNumber: a4.application_number, ownerToken: TOKEN, action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    await call(manage, { applicationNumber: a4.application_number, ownerToken: TOKEN, action: 'invite', role: 'guarantor', name: 'Pat Guarantor', email: 'pat@example.com' });
    const tokens = [tokenFromMail(s, 'jordan@example.com'), tokenFromMail(s, 'pat@example.com')];
    await call(self, { token: tokens[0], action: 'submit', form: FORM });
    assert.deepEqual((await partyRecipients(s.db, 'A4')).map((p) => p.email), ['jordan@example.com', 'pat@example.com'], 'submitted and invited alike, each once');
    s.resend.sent.length = 0;
    const r = await call(status, { listingId: 'L1', status: 'rented', rentedLinkId: 'J1' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const to = s.resend.sent.map((m) => String(m.to).toLowerCase());
    assert.equal(to.filter((x) => x === 'jordan@example.com').length, 1); assert.equal(to.filter((x) => x === 'pat@example.com').length, 1); assert.equal(to.filter((x) => x === a4.email.toLowerCase()).length, 1, 'the primary once too');
    const primaryMail = s.resend.sent.find((m) => String(m.to).toLowerCase() === a4.email.toLowerCase()), partyMail = s.resend.sent.find((m) => m.to === 'pat@example.com');
    assert.equal(partyMail.subject, primaryMail.subject, 'the same email');
    // Reconsider: the party receives the same invite with their own page. The listing is live again first.
    Object.assign(s.db.tables.listings.find((l) => l.id === 'L1'), { status: 'active', state: 'live', rented_link_id: null });
    s.resend.sent.length = 0;
    const rec = await reconsiderApplicant({ admin: s.db, userId: USER.id, userEmail: USER.email, profile: { full_name: 'Sarah Chen' }, invalidate: () => {}, resend: s.resend }, { linkId: 'J4', reason: 'winner_fell_through' });
    assert.equal(rec.status, 200, JSON.stringify(rec.body));
    const recTo = s.resend.sent.map((m) => String(m.to).toLowerCase());
    assert.deepEqual(recTo.sort(), [a4.email.toLowerCase(), 'jordan@example.com', 'pat@example.com'].sort());
    assert.match(s.resend.sent.find((m) => m.to === 'pat@example.com').text, new RegExp(`/party/${tokens[1]}`)); assert.doesNotMatch(s.resend.sent.find((m) => m.to === 'pat@example.com').text, new RegExp(TOKEN), 'never the primary\'s token');
    // The document reminder for Jordan's own request goes to Jordan.
    s.resend.sent.length = 0;
    const row = s.db.tables.application_parties.find((p) => p.email === 'jordan@example.com');
    const member = `J4:p:${row.id}`;
    const ptr = s.kv.values[appKey('J4', row.id)]; s.kv.values[appKey('J4', row.id)] = { ...ptr, requestedAt: new Date(Date.now() - NUDGE_ONE_AFTER_MS - 60000).toISOString() };
    s.db.tables.listing_applicants.find((j) => j.id === 'J4').state = 'docs_pending';
    const out = await runNudges({ admin: s.db, kv: { smembers: kvSmembers, mget: kvMgetJson, set: kvSetJson, srem: kvSrem, expire: kvExpire, appKey, reqKey, uploadUrl, ttl: DOCREQ_TTL }, send: (m) => s.resend.emails.send(m), recordEvent: async () => true }, { log: () => {} });
    assert.ok(out.detail.includes(`${member}: nudge 1`), JSON.stringify(out));
    assert.deepEqual(s.resend.sent.map((m) => m.to), ['jordan@example.com']); assert.match(s.resend.sent[0].text, /Hi Jordan,/);
  } finally { s.restore(); }
});

test('the held files: the party\'s open goes through the realtor\'s session, entitlement and ownership like every document; the party\'s page lists no document of anyone else', async () => {
  const s = up();
  try {
    withApp(s, 'A4');
    await call(manage, { applicationNumber: s.db.tables.applications.find((a) => a.id === 'A4').application_number, ownerToken: TOKEN, action: 'invite', role: 'co_applicant', name: 'Jordan Lee', email: 'jordan@example.com' });
    const token = tokenFromMail(s, 'jordan@example.com');
    const sub = await call(self, { token, action: 'submit', form: FORM });
    await call(tenantAnalyze, { token: sub.body.docRequest.token, index: 0, total: 1, file: pdf('stub (Jordan Lee).pdf') });
    const doc = s.db.tables.applicant_documents[0];
    const own = await call(openDocument, { documentId: doc.id });
    assert.equal(own.code, 200, 'the owning realtor opens the party\'s file');
    const view = await call(self, null, 'GET', { token });
    assert.equal(JSON.stringify(view.body).includes(doc.id), false, 'the party\'s page carries no document id');
    assert.equal(JSON.stringify(view.body).includes('signed.example'), false);
    assert.match(src('pages/api/documents/open.js'), /requireEntitlement\(/);
    assert.doesNotMatch(src('pages/api/party/self.js'), /storage\.from|createSignedUrl/, 'the party routes never sign a file');
    assert.doesNotMatch(src('pages/api/party/manage.js'), /party_token:|partyToken|owner_token/, 'the primary never receives a party token');
    assert.doesNotMatch(src('components/tenant/PartiesCard.js') + src('pages/party/[token].js') + src('lib/parties.js') + src('lib/partyStore.js') + src('docs/parties.md') + src('db/008-application-parties-invites.sql'), /[\u2014\u2013]/);
  } finally { s.restore(); }
});
