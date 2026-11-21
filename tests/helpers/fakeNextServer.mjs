// The real realtor pages (pages/dashboard.js, pages/listing/[id].js, pages/profile.js and their
// API routes) served by Next in this process over the fake stack (tests/helpers/fakeStack.mjs) and
// the route fixture (tests/routes/fixture.mjs): signed in as its realtor, nothing on the network.
// The Supabase, Resend and Anthropic modules resolve to tests/helpers/fakeModules through Node's
// module hooks, which also cover the require() calls Next makes at run time. Each database or key
// value call waits LATENCY_MS, so a page's sequential reads cost what they would in production.
//   node tests/helpers/fakeNextServer.mjs <port> [dev|prod] [latencyMs]
// GET /__fake/pipeline?people=1|2 sets how many people the Pipeline holds (below).
// GET /__fake/docreq?link=J4&credit=1 mints (or returns) the tenant's document request for that
// applicant and answers { token }; credit=1 marks the listing as asking for a credit report.
// GET /__fake/documents?link=J6 answers the live held rows for that applicant; GET
// /__fake/events?type=document_rejected answers the matching events. The credit walk
// (tests/routes/creditWebkit.test.mjs) reads these. One held credit report (D9) sits on the other
// realtor's applicant J9 from the start, so the open route's ownership check can be walked.
// FAKE_PROFILE=lapsed signs in a realtor whose trial ended two days ago (the BILLING_OFF walk,
// tests/routes/billingOffWebkit.test.mjs); unset, the fixture's founding realtor.
// GET /__fake/kpi?seed=1 gives the founder office something to count (the office walk,
// tests/routes/officeWebkit.test.mjs, and the wrapped text walks): realtors at a brokerage's own
// address with listings, applications and confirmed tenants this month and last, and fourteen
// months of public.kpi_daily rows; history=0 takes the kpi_daily table away again (the office
// before db/013 has run). The office is opened with ADMIN_PASSWORD from the environment.
// GET /__fake/kpi?partner=1 (after seed=1) names the Lead Realtor Partner and the realtors who
// signed up from the partner's invite link (db/017-realtor-invites.sql).
// It builds into, or serves from, .next-fake-<port> (NEXT_DIST_DIR, next.config.js); prod needs
// `NEXT_DIST_DIR=.next-fake-<port> FAKE_STACK_BUILD=1 next build` first. Prints "ready" when up.
import { registerHooks, createRequire } from 'node:module';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FAKES = {
  '@supabase/ssr': new URL('./fakeModules/ssr.mjs', import.meta.url).href,
  '@supabase/supabase-js': new URL('./fakeModules/supabaseJs.mjs', import.meta.url).href,
  resend: new URL('./fakeModules/resend.mjs', import.meta.url).href,
  '@anthropic-ai/sdk': new URL('./fakeModules/anthropic.mjs', import.meta.url).href,
};
registerHooks({ resolve(spec, ctx, next) { return FAKES[spec] ? { url: FAKES[spec], format: 'module', shortCircuit: true } : next(spec, ctx); } });

const port = Number(process.argv[2] || 3150);
const mode = process.argv[3] || 'dev';
globalThis.__rlFakeLatencyMs = Number(process.argv[4] || 3);
const { installFakeStack } = await import('./fakeStack.mjs');
const { tables, USER } = await import('../routes/fixture.mjs');
// The real tables have every column; the fixture leaves out one the listing page passes on, which
// the database would send as null (Next refuses undefined in props).
const lapsed = process.env.FAKE_PROFILE === 'lapsed';
const t = tables(lapsed ? { plan: 'trial', profileOver: { trial_ends_at: new Date(Date.now() - 2 * 86400000).toISOString() } } : {});
for (const a of t.applications || []) if (!('rent_to_income_ratio' in a)) a.rent_to_income_ratio = null;
// FAKE_LONG=1: the same rows with the longest values a screen meets in practice (the wrapped text
// walks, tests/typeset/typesetWebkit.test.mjs): long names, a long brokerage, long addresses, long
// employers and emails, the widest short code (WWWWWWW, seeded below), a reference request still
// open, a Pipeline person asked and not yet answered, and one sent a renewal. Invented people.
const long = process.env.FAKE_LONG === '1';
// Names at the long end of real ones (26 to 33 characters; three words, and one of four that wraps
// two and two), emails of 30 to 37, the brokerage as Ontario requires it (", Brokerage").
const LONG_NAMES = { A1: 'Oluwaseun Adebayo Fitzgerald', A2: 'Anastasia Konstantinopoulou', A3: 'Bartholomew Nakamura Whitfield', A4: 'Guadalupe Thanabalasingham', A5: 'Oluwaseun Adebayo Fitzgerald', A6: 'María Fernanda González Rodríguez' };
const LONG_EMAILS = { A1: 'oluwaseun.fitzgerald@outlook.com', A2: 'anastasia.konstantinopoulou@gmail.com', A3: 'bartholomew.whitfield@outlook.com', A4: 'guadalupe.thanabalasingham@gmail.com', A5: 'o.fitzgerald@northwindclinic.ca', A6: 'mariafernanda.gonzalez@gmail.com' };
if (long) {
  Object.assign(t.profiles[0], { full_name: 'Alexandria Konstantinopoulou', brokerage: 'Harbourfront Residential Realty Inc., Brokerage', phone: '416 555 0199' });
  // Invite a realtor (db/017): two realtors who joined through this realtor's invite link, with names at the long end (emails inside the 30 to 37 characters above: the office list holds one line of that).
  t.profiles.push(
    { id: 'invited-realtor-1', email: 'mf.gonzalez@harbourfrontrealty.ca', full_name: 'María Fernanda González Rodríguez', plan: 'founding', province: 'ON', created_at: '2026-06-03T15:00:00Z', signup_source: null, invite_code: null, invited_by: USER.id },
    { id: 'invited-realtor-2', email: 'b.whitfield@harbourfrontrealty.ca', full_name: 'Bartholomew Nakamura Whitfield', plan: 'founding', province: 'ON', created_at: '2026-04-21T15:00:00Z', signup_source: null, invite_code: null, invited_by: USER.id },
  );
  const L = Object.fromEntries(t.listings.map((l) => [l.id, l]));
  Object.assign(L.L1, { name: '2150 Lake Shore Boulevard West, Penthouse 4512', address: '2150 Lake Shore Boulevard West, Penthouse 4512, Toronto', landlord_name: 'Bartholomew Castellanos Whitfield', landlord_email: 'b.castellanos.whitfield@outlook.com' });
  Object.assign(L.L2, { name: '1 Bloor Street East, Unit 3407', address: '1 Bloor Street East, Unit 3407, Toronto' });
  for (const a of t.applications) {
    const name = LONG_NAMES[a.id]; if (!name) continue;
    Object.assign(a, { full_name: name, email: LONG_EMAILS[a.id], employer: 'Northwind Pediatric Rehabilitation Clinic Inc.', job_title: 'Senior Clinical Operations Coordinator', prev_landlord_name: 'Harbourfront Residential Holdings Ltd.', prev_address: '4100 Yonge Street, Unit 1907, North York' });
  }
  const j1 = t.listing_applicants.find((j) => j.id === 'J1');
  j1.doc_verifications.active.documents[0].extracted = { ...j1.doc_verifications.active.documents[0].extracted, applicantName: LONG_NAMES.A1, employer: 'Northwind Pediatric Rehabilitation Clinic Inc.' };
  j1.doc_verifications.active.comparisons[0].found = 'Northwind Pediatric Rehabilitation Clinic Inc.';
  t.reference_responses.push({ id: 'RR2', listing_applicant_id: 'J2', profile_id: USER.id, token: 'p'.repeat(32), status: 'pending', answers: null, sent_to: 'leasing@harbourfrontholdings.ca', sent_at: new Date(Date.now() - 86400000).toISOString(), expires_at: new Date(Date.now() + 6 * 86400000).toISOString(), answered_at: null, created_at: new Date(Date.now() - 86400000).toISOString() });
  t.pipeline_consents.push(
    { id: 'PC3', profile_id: USER.id, listing_id: 'L1', application_id: 'A3', email: 'bartholomew.whitfield@outlook.com', token: 'keeplongpending00000000000000001', status: 'pending', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), expires_at: new Date(Date.now() + 28 * 86400000).toISOString(), invites: [] },
    { id: 'PC4', profile_id: USER.id, listing_id: 'L1', application_id: 'A4', email: 'guadalupe.thanabalasingham@gmail.com', token: 'keeplongconsented000000000000001', renew_token: 'keeplongrenew0000000000000000001', status: 'consented', consented_at: new Date(Date.now() - 50 * 86400000).toISOString(), expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), invites: [] },
  );
}
// The other realtor's held credit report: owned by OTHER through L9 and J9 (tests/routes/fixture.mjs).
t.applicant_documents = [...(t.applicant_documents || []), { id: 'D9', listing_applicant_id: 'J9', profile_id: 'realtor-2', storage_path: 'realtor-2/J9/d9.pdf', kind: 'credit report', mime: 'application/pdf', bytes: 1200, uploaded_by: 'tenant', uploaded_at: new Date(Date.now() - 86400000).toISOString(), expires_at: new Date(Date.now() + 13 * 86400000).toISOString(), deleted_at: null, deleted_by: null, opened_count: 0, last_opened_at: null }];
// The tenant's own profile and vault (db/tenant-profiles.sql, db/018-profile-vault.sql): empty
// until a walk asks for a tenant (GET /__fake/tenant below).
for (const name of ['tenant_profiles', 'tenant_profile_documents', 'tenant_profile_checks', 'profile_access_log', 'profile_shares', 'profile_share_invites', 'tenant_profile_shareable']) if (!t[name]) t[name] = [];
// The full tenant profile (db/022-full-tenant-profile.sql): the view the share reader uses holds
// the same rows as the table (GET /__fake/tenant?personal=1 fills them, below).
t.tenant_profile_personal = t.tenant_profiles;
// The realtor circle and the brokerage record (db/021-realtor-circle.sql): empty until a walk
// asks for a circle (GET /__fake/circle below).
for (const name of ['circle_connections', 'brokerages', 'brokerage_members']) if (!t[name]) t[name] = [];
const stack = installFakeStack({ tables: t, user: USER });
await stack.db.storage.from('applicant-documents').upload('realtor-2/J9/d9.pdf', Buffer.from('%PDF-1.4 other realtor credit report'), { contentType: 'application/pdf' });
const { mintRequest, kvSetJson } = await import('../../lib/docRequest.js');
const { newOwnerToken } = await import('../../lib/applicationIds.js');
globalThis.__rlFakeStackFor = stack;
// The founder office lists the auth users beside the profiles (lib/adminData.js listAuthUsers).
stack.db.auth.admin = { listUsers: async () => ({ data: { users: t.profiles.map((p) => ({ id: p.id, email: p.email || null, created_at: p.created_at || null, last_sign_in_at: null, banned_until: null })) }, error: null }) };
// The widest short code on the long listing's invite, the way pages/api/listings/invite.js writes
// it (short:{code} holds the token; the record carries the code, kept on every reuse).
if (long) {
  const { INVITE_TOKEN } = await import('../routes/fixture.mjs');
  const H = { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' };
  const p = t.profiles[0]; const l1 = t.listings.find((l) => l.id === 'L1');
  await fetch(`${process.env.KV_REST_API_URL}/set/short:WWWWWWW`, { method: 'POST', headers: H, body: JSON.stringify(INVITE_TOKEN) });
  await fetch(`${process.env.KV_REST_API_URL}/set/linvite:${INVITE_TOKEN}`, { method: 'POST', headers: H, body: JSON.stringify({ realtorEmail: USER.email, profileId: USER.id, realtorName: p.full_name, realtorBrokerage: p.brokerage, realtorPhone: p.phone, province: 'ON', listingId: 'L1', listingName: l1.name, unit: { address: l1.address, monthlyRent: String(l1.monthly_rent), bedrooms: l1.bedrooms, allowsPets: l1.allows_pets, allowsSmoking: l1.allows_smoking, parkingIncluded: l1.parking_included }, createdAt: new Date().toISOString(), submissionCount: 0, shortCode: 'WWWWWWW' }) });
}
process.env.NEXT_DIST_DIR = `.next-fake-${port}`;
if (mode === 'prod') process.env.NODE_ENV = 'production'; // one React build, the production one
const require = createRequire(ROOT);
const next = require('next');
const app = next({ dev: mode !== 'prod', dir: ROOT, hostname: 'localhost', port });
const handle = app.getRequestHandler();
await app.prepare();
// For a walk: how many people the Pipeline holds. GET /__fake/pipeline?people=2 adds a second
// consent beside the fixture's one: Applicant B2B2, asked on L2, who has applied to L1 (Applied on
// that row). people=1 puts it back.
const oneConsent = [...(t.pipeline_consents || [])];
const secondConsent = { id: 'PC2', profile_id: USER.id, listing_id: 'L2', application_id: 'A2', email: 'aB2B2@example.com', status: 'consented', consented_at: new Date(Date.now() - 4 * 86400000).toISOString(), expires_at: new Date(Date.now() + 56 * 86400000).toISOString(), invites: [] };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/__fake/docreq')) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const link = String(q.get('link') || ''); const j = (t.listing_applicants || []).find((x) => x.id === link); const a = j && (t.applications || []).find((x) => x.id === j.application_id); const l = j && (t.listings || []).find((x) => x.id === j.listing_id);
    if (!j || !a || !l) { res.statusCode = 404; res.end('{}'); return; }
    const minted = await mintRequest({ listingId: l.id, linkId: j.id, applicationId: a.id, tenantName: a.full_name, listingName: l.name, address: l.address, realtorName: 'Sarah Chen', brokerage: 'Demo Realty', askCreditReport: q.get('credit') === '1' }, { renew: q.get('renew') === '1' });
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ token: minted.token })); return;
  }
  // The parties walk (tests/routes/partiesWebkit.test.mjs): GET /__fake/app?link=J4 writes the KV
  // app:{RL} record for that applicant with a fresh owner token and answers { applicationNumber,
  // ownerToken }; GET /__fake/mail?to=x answers what the fake mailer sent to x; GET
  // /__fake/parties?app=A4 answers that application's party rows without their tokens.
  if (req.url.startsWith('/__fake/app')) {
    const link = String(new URL(req.url, 'http://localhost').searchParams.get('link') || '');
    const j = (t.listing_applicants || []).find((x) => x.id === link); const a = j && (t.applications || []).find((x) => x.id === j.application_id);
    if (!a) { res.statusCode = 404; res.end('{}'); return; }
    const ownerToken = newOwnerToken();
    a.owner_token = ownerToken;
    await kvSetJson(`app:${a.application_number}`, { applicationNumber: a.application_number, ownerToken, email: a.email, tenant: { fullName: a.full_name, phone: a.phone || '' }, employment: { annualIncome: a.annual_income }, createdAt: new Date().toISOString() }, 31536000);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ applicationNumber: a.application_number, ownerToken, email: a.email })); return;
  }
  // The Fit walk (tests/routes/fitWebkit.test.mjs): GET /__fake/history?link=J2&clear=1 clears that
  // applicant's rental history on the fixture row, so a stated income is all Fit has to read.
  // The document checks walk (tests/routes/integrityWebkit.test.mjs): GET /__fake/integrity?link=J1
  // holds one pay stub for that applicant (a stored object, so View document opens it) and puts one
  // check docs finding on their active report (lib/documentIntegrity.js), the way a finalize writes it.
  if (req.url.startsWith('/__fake/integrity')) {
    const link = String(new URL(req.url, 'http://localhost').searchParams.get('link') || '');
    const j = (t.listing_applicants || []).find((x) => x.id === link);
    if (!j) { res.statusCode = 404; res.end('{}'); return; }
    const id = `DI-${link}`;
    if (!(t.applicant_documents || []).some((d) => d.id === id)) {
      const path = `${USER.id}/${link}/${id}.pdf`;
      await stack.db.storage.from('applicant-documents').upload(path, Buffer.from('%PDF-1.4 a held pay stub for the document checks walk'), { contentType: 'application/pdf' });
      const now = new Date();
      t.applicant_documents.push({ id, listing_applicant_id: link, profile_id: USER.id, storage_path: path, kind: 'pay stub', mime: 'application/pdf', bytes: 2048, uploaded_by: 'tenant', uploaded_at: now.toISOString(), expires_at: new Date(now.getTime() + 14 * 86400000).toISOString(), deleted_at: null, deleted_by: null, opened_count: 0, last_opened_at: null, content_hash: 'walk' });
      const dv = j.doc_verifications && j.doc_verifications.active ? j.doc_verifications : { active: { analyzedAt: now.toISOString(), nameMatch: 'match', documents: [], comparisons: [] }, archived: [] };
      j.doc_verifications = { ...dv, active: { ...dv.active, integrity: [{ type: 'pay_arithmetic', documentId: id, sentence: 'The net pay on the September 18 stub does not equal gross less deductions ($312 apart).', at: now.toISOString() }] } };
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ documentId: id })); return;
  }
  // The form data walk (tests/routes/mlsWebkit.test.mjs): GET /__fake/seed-parties?link=J1 puts a
  // submitted co applicant and a submitted guarantor on that applicant's application, the rows the
  // party form writes (lib/parties.js), with an income on each so the walk can prove none shows.
  // &co=NAME names the co applicant (the typeset walk's long name on the checklist line), and
  // &status=invited leaves their form not in yet, as it is right after the tenant invites them.
  if (req.url.startsWith('/__fake/seed-parties')) {
    const link = String(new URL(req.url, 'http://localhost').searchParams.get('link') || '');
    const j = (t.listing_applicants || []).find((x) => x.id === link);
    if (!j) { res.statusCode = 404; res.end('{}'); return; }
    t.application_parties = (t.application_parties || []).filter((p) => p.application_id !== j.application_id);
    const now = new Date().toISOString();
    t.application_parties.push(
      { id: `P-co-${link}`, application_id: j.application_id, role: 'co_applicant', status: new URL(req.url, 'http://localhost').searchParams.get('status') === 'invited' ? 'invited' : 'submitted', full_name: String(new URL(req.url, 'http://localhost').searchParams.get('co') || 'Jordan Lee'), email: 'jordan@example.com', phone: '416 555 0142', address: null, employer: 'Northwind Sample Clinic Inc.', job_title: 'Analyst', annual_income: 64000, invited_at: now, submitted_at: now, consented_at: now, doc_verifications: null },
      { id: `P-g-${link}`, application_id: j.application_id, role: 'guarantor', status: 'submitted', full_name: 'Pat Guarantor', email: 'pat@example.com', phone: '416 555 0199', address: '14 Sample Cres, Toronto', employer: 'Northwind Sample Clinic Inc.', job_title: 'Clinic Coordinator', annual_income: 85000, invited_at: now, submitted_at: now, consented_at: now, doc_verifications: null },
    );
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, applicationId: j.application_id })); return;
  }
  // The Circle screen (pages/circle.js, components/dashboard/CircleView.js): GET /__fake/circle?seed=1
  // gives the signed in realtor a circle with the long values: one request waiting for them, one
  // realtor connected (with a confirmed brokerage record, rentals and areas), one request they
  // sent, and two realtors a search finds, one of whom turned findable off. brokerage=sent adds
  // the realtor's own record, waiting for its broker of record. seed=0 takes it all away again.
  // GET /__fake/circle?rows=1 answers the connection rows; ?brokerage-link=1 mints a fresh
  // confirmation link for the realtor's own record and answers { token }.
  if (req.url.startsWith('/__fake/circle')) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const ids = ['circle-r1', 'circle-r2', 'circle-r3', 'circle-r4', 'circle-r5'];
    const clear = () => {
      t.profiles = t.profiles.filter((p) => !ids.includes(p.id)); stack.db.tables.profiles = t.profiles;
      t.circle_connections.length = 0; t.brokerages.length = 0; t.brokerage_members.length = 0;
    };
    if (q.get('seed') === '0') clear();
    if (q.get('seed') === '1') {
      clear();
      const day = 86400000; const at = (n) => new Date(Date.now() - n * day).toISOString();
      const realtor = (id, full_name, brokerage, over = {}) => ({ id, email: `${id}@example.com`, full_name, brokerage, phone: '416 555 0177', plan: 'founding', province: 'ON', created_at: at(200), signup_source: 'direct', invite_code: null, invited_by: null, circle_findable: null, does_rentals: null, service_areas: null, ...over });
      t.profiles.push(
        realtor('circle-r1', 'Bartholomew Nakamura Whitfield', 'Harbourfront Residential Realty Inc., Brokerage'),
        realtor('circle-r2', 'Anastasia Konstantinopoulou', 'Lakeshore and Humber Valley Realty Ltd., Brokerage', { does_rentals: true, service_areas: ['Etobicoke', 'Mississauga', 'Liberty Village'] }),
        realtor('circle-r3', 'Guadalupe Thanabalasingham', 'Northwind Residential Realty Inc., Brokerage'),
        realtor('circle-r4', 'Oluwaseun Adebayo Fitzgerald', 'Harbourfront Residential Realty Inc., Brokerage'),
        realtor('circle-r5', 'Guadalupe Hidden', 'Northwind Residential Realty Inc., Brokerage', { circle_findable: false }),
      );
      t.circle_connections.push(
        { id: 'cc-1', requester_id: 'circle-r1', addressee_id: USER.id, status: 'pending', blocked_by: null, created_at: at(1), answered_at: null },
        { id: 'cc-2', requester_id: USER.id, addressee_id: 'circle-r2', status: 'accepted', blocked_by: null, created_at: at(40), answered_at: at(38) },
        { id: 'cc-4', requester_id: USER.id, addressee_id: 'circle-r4', status: 'pending', blocked_by: null, created_at: at(3), answered_at: null },
      );
      t.brokerages.push({ id: 'bk-2', legal_name: 'Lakeshore and Humber Valley Realty Ltd., Brokerage', address: '3080 Lake Shore Boulevard West, Suite 410, Etobicoke', phone: '416 555 0188', broker_of_record_name: 'Maximiliano Castellanos Ruiz', broker_of_record_email: 'broker@lakeshorehumber.ca', hst_number: null, status: 'confirmed', confirm_token_hash: null, confirm_sent_at: at(60), confirm_expires_at: at(46), broker_confirmed_at: at(58), confirmed_at: at(57), created_by: 'circle-r2', created_at: at(60), updated_at: at(57) });
      t.brokerage_members.push({ id: 'bm-2', brokerage_id: 'bk-2', profile_id: 'circle-r2', status: 'active', joined_at: at(60), left_at: null });
      if (q.get('brokerage') === 'sent') {
        const me = t.profiles.find((p) => p.id === USER.id);
        t.brokerages.push({ id: 'bk-1', legal_name: me.brokerage || 'Demo Realty', address: '2150 Lake Shore Boulevard West, Suite 1200, Toronto', phone: '416 555 0199', broker_of_record_name: 'Bartholomew Castellanos Whitfield', broker_of_record_email: 'broker@harbourfrontrealty.ca', hst_number: null, status: 'unconfirmed', confirm_token_hash: null, confirm_sent_at: at(1), confirm_expires_at: new Date(Date.now() + 13 * day).toISOString(), broker_confirmed_at: null, confirmed_at: null, created_by: USER.id, created_at: at(1), updated_at: at(1) });
        t.brokerage_members.push({ id: 'bm-1', brokerage_id: 'bk-1', profile_id: USER.id, status: 'active', joined_at: at(1), left_at: null });
      }
    }
    if (q.get('brokerage-link') === '1') {
      const { createHash, randomBytes } = await import('node:crypto');
      const b = t.brokerages.find((x) => x.created_by === USER.id && x.status === 'unconfirmed');
      if (!b) { res.statusCode = 404; res.end('{}'); return; }
      const token = randomBytes(32).toString('base64url');
      b.confirm_token_hash = createHash('sha256').update(token).digest('hex'); b.confirm_expires_at = new Date(Date.now() + 14 * 86400000).toISOString(); b.broker_confirmed_at = null;
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ token })); return;
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, rows: t.circle_connections.map((r) => ({ id: r.id, requester_id: r.requester_id, addressee_id: r.addressee_id, status: r.status })), brokerages: t.brokerages.map((b) => ({ id: b.id, status: b.status, confirmed: !!b.broker_confirmed_at })) })); return;
  }
  if (req.url.startsWith('/__fake/history')) {
    const q = new URL(req.url, 'http://localhost').searchParams; const link = String(q.get('link') || '');
    const j = (t.listing_applicants || []).find((x) => x.id === link); const a = j && (t.applications || []).find((x) => x.id === j.application_id);
    if (!a) { res.statusCode = 404; res.end('{}'); return; }
    if (q.get('clear') === '1') { a.prev_landlord_name = null; a.prev_landlord_contact = null; a.prev_address = null; a.years_at_previous = null; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: a.id, prev_landlord_name: a.prev_landlord_name, years_at_previous: a.years_at_previous })); return;
  }
  if (req.url.startsWith('/__fake/mail')) {
    const q = new URL(req.url, 'http://localhost').searchParams; const to = String(q.get('to') || '').toLowerCase();
    // html=1 adds each message's HTML (the email template audit renders it at phone widths).
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(stack.resend.sent.filter((m) => !to || String(m.to).toLowerCase() === to).map((m) => ({ to: m.to, subject: m.subject, text: m.text, ...(q.get('html') === '1' ? { html: m.html } : {}) })))); return;
  }
  if (req.url.startsWith('/__fake/parties')) {
    const appId = String(new URL(req.url, 'http://localhost').searchParams.get('app') || '');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify((t.application_parties || []).filter((p) => p.application_id === appId).map(({ party_token, ...p }) => p))); return;
  }
  if (req.url.startsWith('/__fake/documents')) {
    const link = String(new URL(req.url, 'http://localhost').searchParams.get('link') || '');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify((t.applicant_documents || []).filter((d) => d.listing_applicant_id === link && !d.deleted_at).map((d) => ({ id: d.id, kind: d.kind })))); return;
  }
  if (req.url.startsWith('/__fake/events')) {
    const type = String(new URL(req.url, 'http://localhost').searchParams.get('type') || '');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify((t.events || []).filter((e) => !type || e.type === type).map((e) => ({ type: e.type, payload: e.payload })))); return;
  }
  // The tenant's profile page (pages/my-application.js, components/tenant/ProfileVault.js): GET
  // /__fake/tenant?who=1 makes (or returns) a tenant profile with the long values, signed in, and
  // answers { token }, the value of the rl_tenant session cookie. docs=1 stores an ID, a pay
  // stub and an employment letter in its vault with the facts read from them; consent=0 leaves
  // the consent to keep documents ungiven; paused=1 turns the vault off for the whole server
  // (TENANT_VAULT_ENABLED=false) and paused=0 turns it back on.
  if (req.url.startsWith('/__fake/tenant')) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    if (q.get('paused') === '1') process.env.TENANT_VAULT_ENABLED = 'false';
    if (q.get('paused') === '0') delete process.env.TENANT_VAULT_ENABLED;
    const who = String(q.get('who') || '1').replace(/[^0-9]/g, '') || '1';
    // Written the way lib/tenantProfileStore.js writes them: the row, and the session under the
    // hash of its token (tsession:{sha256}), 30 days.
    const { createHash, randomBytes, randomUUID } = await import('node:crypto');
    const email = `m.castellanos${who}@outlook.com`;
    const now = new Date().toISOString();
    let row = t.tenant_profiles.find((r) => r.email === email);
    if (!row) {
      const facts = { fullName: 'Maximiliano Castellanos Ruiz', email, phone: '4165550142', employmentType: 'full-time', jobTitle: 'Senior Clinical Operations Coordinator', employer: 'Northwind Pediatric Rehabilitation Clinic Inc.', yearsAtJob: '4', annualIncome: '118000', netIncome: '84500', netIncomeSource: 'estimated', rentalStatus: 'renting', previousAddress: '4100 Yonge Street, Unit 1907, North York', yearsAtPrevious: '3.5', currentRent: '2650', previousLandlordName: 'Harbourfront Holdings Ltd.', previousLandlordContact: 'leasing@harbourfrontholdings.ca · 416 555 0188', moveInDate: '2026-12-01', ageConfirmed: true, reference1Name: 'Bartholomew Nakamura Whitfield', reference1Relationship: 'Manager', reference1Contact: 'b.whitfield@northwindclinic.ca' };
      row = { id: randomUUID(), email, email_key: createHash('sha256').update(email).digest('hex').slice(0, 32), facts, applications: [], facts_updated_at: new Date(Date.now() - 12 * 86400000).toISOString(), profile_revision: 0, created_at: now, updated_at: now, email_verified_at: now, last_active_at: now, vault_consent_at: null };
      t.tenant_profiles.push(row);
    }
    const token = randomBytes(32).toString('base64url');
    await kvSetJson(`tsession:${createHash('sha256').update(token).digest('hex')}`, { profileId: row.id, createdAt: now }, 30 * 24 * 3600);
    if (q.get('consent') !== '0' && !row.vault_consent_at) row.vault_consent_at = now;
    if (q.get('docs') === '1' && !t.tenant_profile_documents.some((d) => d.tenant_profile_id === row.id)) {
      const day = 86400000; const at = (n) => new Date(Date.now() + n * day).toISOString();
      const docs = [['id', -3, 11], ['income', -9, 81], ['employment', -9, 81]].map(([kind, up, exp], i) => ({ id: `vault-${who}-${i + 1}`, tenant_profile_id: row.id, storage_path: `${row.id}/vault-${who}-${i + 1}.pdf`, kind, mime: 'application/pdf', bytes: 1200, content_hash: null, uploaded_at: at(up), read_at: at(up), expires_at: at(exp), renewed_at: null, deleted_at: null, deleted_by: null, object_removed: false }));
      t.tenant_profile_documents.push(...docs);
      for (const d of docs) await stack.db.storage.from('tenant-vault').upload(d.storage_path, Buffer.from('%PDF-1.4 a tenant document'), { contentType: 'application/pdf' });
      const check = (kind, value, agrees, source, doc) => ({ id: `check-${who}-${kind}`, tenant_profile_id: row.id, kind, value, agrees_with_typed: agrees, source_kind: source, source_document_id: doc, read_at: at(source === 'id' ? -3 : -9), fresh_until: at(80), created_at: at(-9) });
      t.tenant_profile_checks.push(
        check('identity_name_matches', { matches: true }, true, 'id', docs[0].id),
        check('income_annual_gross', { cents: 11800000 }, true, 'income', docs[1].id),
        check('employer_name', { name: 'Northwind Pediatric Rehabilitation Clinic Inc.' }, true, 'employment', docs[2].id),
        check('employment_start', { month: '2022-09' }, null, 'employment', null),
      );
    }
    // share=J2: this tenant applied to the realtor's listing with their profile (db/019): the
    // application behind that applicant row is recorded as made from this profile, the share is
    // approved three days ago, and the realtor has viewed it and opened a document. stopped=1:
    // the tenant has since stopped it. The view the reader uses (db/015) holds the profile's facts.
    const shareLink = q.get('share');
    if (shareLink) {
      // share=new: an applicant of their own on the realtor's first listing (no party, nothing
      // another state touches), named after this tenant.
      if (shareLink === 'new' && !t.listing_applicants.some((x) => x.id === `J-share-${who}`)) {
        const a2 = t.applications.find((a) => a.id === 'A2'); const j2 = t.listing_applicants.find((x) => x.id === 'J2');
        const name = who === '5' ? 'Valentina Castellanos Ruiz' : 'Maximiliano Castellanos Ruiz';
        t.applications.push({ ...a2, id: `A-share-${who}`, application_number: `RL-2026-SHR${who}-TEST`, full_name: name, email, phone: `41655501${who}7`, owner_token: null });
        t.listing_applicants.push({ ...j2, id: `J-share-${who}`, application_id: `A-share-${who}`, doc_verifications: null, reviewed_at: null, confirmations: {}, created_at: new Date(Date.now() - 3 * 86400000).toISOString() });
      }
      const j = t.listing_applicants.find((x) => x.id === (shareLink === 'new' ? `J-share-${who}` : shareLink)); const app = j && t.applications.find((a) => a.id === j.application_id);
      if (app && !t.profile_shares.some((s) => s.tenant_profile_id === row.id && s.listing_id === j.listing_id)) {
        const day = 86400000; const at = (n) => new Date(Date.now() + n * day).toISOString();
        Object.assign(app, { prefill_source: 'profile', prefill_profile_id: row.id, prefill_profile_revision: 0, email_verified_at_submit: at(-3) });
        if (!t.tenant_profile_shareable.some((v) => v.id === row.id)) t.tenant_profile_shareable.push({ id: row.id, facts: row.facts, facts_updated_at: row.facts_updated_at, email_verified_at: row.email_verified_at });
        const stopped = q.get('stopped') === '1';
        const share = { id: `share-${who}`, tenant_profile_id: row.id, recipient_profile_id: USER.id, purpose: 'application', requested_by: null, listing_id: j.listing_id, status: stopped ? 'revoked' : 'approved', scope: ['facts', 'checks', 'documents'], approved_at: at(-3), approved_via: 'session', documents_until: at(11), expires_at: null, ended_at: stopped ? at(-1) : null, created_at: at(-3) };
        t.profile_shares.push(share);
        const p0 = t.profiles[0]; const actor = [p0.full_name, p0.brokerage].filter(Boolean).join(', ');
        const line = (action, n, doc = null) => ({ id: t.profile_access_log.length + 1, tenant_profile_id: row.id, share_id: share.id, actor_type: action === 'share_approved' || action === 'share_revoked' ? 'tenant' : 'realtor', actor_profile_id: USER.id, actor_label: actor, action, document_id: doc, at: at(n) });
        t.profile_access_log.push(line('share_approved', -3)); t.profile_access_log.push(line('profile_viewed', -2));
        t.profile_access_log.push(line('document_opened', -2, `vault-${who}-2`));
        if (stopped) t.profile_access_log.push(line('share_revoked', -1));
      }
    }
    // agent=1 (with share=new): the tenant also shared with the listing agent of that unit
    // (db/024-share-roles.sql), who has viewed it once, and invited another by email who has not
    // joined; the application is on the tenant's own list, so the unit can be shared for.
    if (q.get('agent') === '1') {
      const mine = t.profile_shares.find((s) => s.tenant_profile_id === row.id && s.recipient_profile_id === USER.id);
      const app = mine && t.applications.find((a) => a.prefill_profile_id === row.id);
      if (mine && app && !t.profile_shares.some((s) => s.tenant_profile_id === row.id && s.role === 'listing_agent')) {
        const day = 86400000; const at = (n) => new Date(Date.now() + n * day).toISOString();
        mine.role = 'realtor';
        row.applications = [{ applicationNumber: app.application_number, ownerToken: null }];
        if (!t.profiles.some((p) => p.id === 'listing-agent-1')) t.profiles.push({ id: 'listing-agent-1', email: 'b.whitfield@lakeshorehumber.ca', full_name: 'Bartholomew Nakamura Whitfield', brokerage: 'Lakeshore and Humber Valley Realty Ltd., Brokerage', plan: 'founding', province: 'ON', created_at: at(-200), circle_findable: null });
        if (!t.profiles.some((p) => p.id === 'listing-agent-2')) t.profiles.push({ id: 'listing-agent-2', email: 'g.thana@northwindrealty.ca', full_name: 'Guadalupe Thanabalasingham', brokerage: 'Northwind Residential Realty Inc., Brokerage', plan: 'founding', province: 'ON', created_at: at(-200), circle_findable: null });
        const share = { id: `share-agent-${who}`, tenant_profile_id: row.id, recipient_profile_id: 'listing-agent-1', purpose: 'application', requested_by: null, listing_id: mine.listing_id, role: 'listing_agent', status: 'approved', scope: ['facts', 'checks', 'documents'], approved_at: at(-2), approved_via: 'session', documents_until: at(12), expires_at: null, ended_at: null, created_at: at(-2) };
        t.profile_shares.push(share);
        t.profile_access_log.push({ id: t.profile_access_log.length + 1, tenant_profile_id: row.id, share_id: share.id, actor_type: 'realtor', actor_profile_id: 'listing-agent-1', actor_label: 'Bartholomew Nakamura Whitfield, Lakeshore and Humber Valley Realty Ltd., Brokerage, listing agent', action: 'profile_viewed', document_id: null, at: at(-1) });
        t.profile_share_invites.push({ id: `invite-${who}`, tenant_profile_id: row.id, listing_id: mine.listing_id, email: 'a.konstantinopoulou@harbourfront.ca', status: 'sent', created_at: at(-1), ended_at: null });
      }
    }
    // asagent=1: this tenant applied to ANOTHER realtor's listing (L9, applicant J9) and shared their
    // profile with the signed in realtor as its listing agent: the dashboard's "Shared with you".
    if (q.get('asagent') === '1' && !t.profile_shares.some((s) => s.tenant_profile_id === row.id && s.recipient_profile_id === USER.id && s.role === 'listing_agent')) {
      const day = 86400000; const at = (n) => new Date(Date.now() + n * day).toISOString();
      const j9 = t.listing_applicants.find((x) => x.id === 'J9'); const a9 = j9 && t.applications.find((a) => a.id === j9.application_id);
      if (a9) {
        Object.assign(a9, { tenant_profile_id: row.id, prefill_profile_id: row.id });
        if (!t.tenant_profile_shareable.some((v) => v.id === row.id)) t.tenant_profile_shareable.push({ id: row.id, facts: row.facts, facts_updated_at: row.facts_updated_at, email_verified_at: row.email_verified_at });
        t.profile_shares.push({ id: `share-asagent-${who}`, tenant_profile_id: row.id, recipient_profile_id: USER.id, purpose: 'application', requested_by: null, listing_id: 'L9', role: 'listing_agent', status: 'approved', scope: ['facts', 'checks', 'documents'], approved_at: at(-1), approved_via: 'session', documents_until: at(13), expires_at: null, ended_at: null, created_at: at(-1) });
      }
    }
    // personal=1: the tenant added a photo, a few words about themselves (long ones) and an offer
    // to prepay three months of rent (db/022). The photo is a real PNG, so the screens draw it.
    if (q.get('personal') === '1' && !row.photo_path) {
      const zlib = await import('node:zlib');
      const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
      const side = 96; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4); ihdr[8] = 8; ihdr[9] = 2;
      const raw = Buffer.alloc((side * 3 + 1) * side);
      for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const o = y * (side * 3 + 1) + 1 + x * 3; const head = (x - 48) ** 2 + (y - 36) ** 2 < 18 ** 2 || (x - 48) ** 2 + (y - 104) ** 2 < 44 ** 2; raw[o] = head ? 58 : 214; raw[o + 1] = head ? 58 : 207; raw[o + 2] = head ? 60 : 190; }
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
      const path = `${row.id}/photo-${randomUUID()}.png`;
      await stack.db.storage.from('tenant-vault').upload(path, png, { contentType: 'image/png' });
      Object.assign(row, { photo_path: path, photo_mime: 'image/png', photo_added_at: now, prepay_months: 3, landlord_report_ok: null, about_me: 'I coordinate operations at a pediatric rehabilitation clinic and have been there four years. I am looking for a quiet home near the lake, close to the streetcar, where I can stay for a long time.\n\nMost evenings I cook, read and go to bed early. On weekends I cycle the waterfront trail. I look after the places I live in and I get on well with neighbours.' });
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ token, vault: process.env.TENANT_VAULT_ENABLED === 'false' ? 'off' : 'on', documents: t.tenant_profile_documents.filter((d) => d.tenant_profile_id === row.id && !d.deleted_at).length })); return;
  }
  // The wrapped text walks: GET /__fake/state?plan=founding|trial|lapsed|paid|past_due&days=3 sets
  // the signed in realtor's plan (a trial with days left, one ended two days ago, a payment past
  // due with days of grace); listings=0 takes their listings away (the empty dashboard) and
  // listings=1 puts them back; name=0 blanks their name (onboarding) and name=1 puts it back.
  // Answers the profile's plan fields.
  if (req.url.startsWith('/__fake/state')) {
    const q = new URL(req.url, 'http://localhost').searchParams; const p = t.profiles[0]; const days = Number(q.get('days') || 3);
    const plan = q.get('plan');
    if (plan) {
      for (const k of ['trial_ends_at', 'subscription_status', 'grace_ends_at']) p[k] = null;
      if (plan === 'founding' || plan === 'paid') p.plan = plan;
      if (plan === 'trial') Object.assign(p, { plan: 'trial', trial_ends_at: new Date(Date.now() + (days - 0.5) * 86400000).toISOString() });
      if (plan === 'lapsed') Object.assign(p, { plan: 'trial', trial_ends_at: new Date(Date.now() - 2 * 86400000).toISOString() });
      if (plan === 'past_due') Object.assign(p, { plan: 'paid', subscription_status: 'past_due', grace_ends_at: new Date(Date.now() + (days - 0.5) * 86400000).toISOString() });
    }
    if (q.get('name') === '0' && p.full_name) { t.__name = p.full_name; p.full_name = ''; } // not onboarded: /onboarding
    if (q.get('name') === '1' && t.__name) { p.full_name = t.__name; t.__name = null; }
    if (q.get('listings') === '0' && !t.__stashed) { t.__stashed = t.listings.filter((l) => l.profile_id === USER.id); t.listings = t.listings.filter((l) => l.profile_id !== USER.id); }
    if (q.get('listings') === '1' && t.__stashed) { t.listings = [...t.__stashed, ...t.listings]; t.__stashed = null; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ plan: p.plan, trial_ends_at: p.trial_ends_at, subscription_status: p.subscription_status || null, listings: t.listings.filter((l) => l.profile_id === USER.id).length })); return;
  }
  if (req.url.startsWith('/__fake/kpi')) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const { monthOf, addMonths, torontoDate } = await import('../../lib/kpis.js');
    const now = Date.now(); const month = monthOf(now); const last = addMonths(month, -1);
    if (q.get('seed') === '1' && !t.__kpiSeeded) {
      t.__kpiSeeded = true;
      t.application_events = t.application_events || [];
      const mid = (m, day, hour = 16) => `${m}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
      const sources = ['apply', 'report', 'direct', 'direct', 'realtor_referral', 'direct'];
      // 34 realtors: all active last month (52 rentals closed), 12 active this month (9 closed, one fell through).
      for (let i = 0; i < 34; i++) {
        const id = `kpi-realtor-${String(i).padStart(2, '0')}`;
        const born = i < 6 ? mid(month, 1, 15 + (i % 6)) : mid(addMonths(month, -3), 4 + (i % 20));
        t.profiles.push({ id, email: `agent${i}@harbourfrontrealty.ca`, full_name: `Agent ${i} Harbourfront`, brokerage: 'Harbourfront Residential Realty Inc., Brokerage', plan: 'founding', province: 'ON', created_at: born, signup_source: i < 6 ? sources[i] : null });
        for (let n = 0; n < 2; n++) {
          const listing = `kpi-L${i}-${n}`;
          t.listings.push({ id: listing, profile_id: id, name: `${100 + i} Sample St, Unit ${n + 1}`, address: `${100 + i} Sample St, Unit ${n + 1}, Toronto`, monthly_rent: 2400, status: 'active', created_at: mid(last, 1) });
          const add = (suffix, at, email) => { const a = `kpi-A${i}-${n}-${suffix}`; const k = `kpi-K${i}-${n}-${suffix}`; t.applications.push({ id: a, application_number: `RL-KPI-${i}-${n}-${suffix}`, full_name: 'Invented Tenant', email, created_at: at }); t.listing_applicants.push({ id: k, listing_id: listing, application_id: a, decision_status: 'none', added_via: 'invite', created_at: at, state: 'submitted' }); return k; };
          const kLast = add('last', mid(last, 5 + (i % 20)), `tenant${i}@mail.ca`); // the same tenant on both of a realtor's listings
          if (i * 2 + n < 52) t.application_events.push({ id: `kpi-E${i}-${n}-last`, listing_applicant_id: kLast, from_state: 'shortlisted', to_state: 'accepted', created_at: mid(last, 20) });
          if (i < 12 && n === 0) {
            const kNow = add('now', mid(month, 1, 15), `newtenant${i}@mail.ca`);
            if (i < 10) t.application_events.push({ id: `kpi-E${i}-now`, listing_applicant_id: kNow, from_state: 'shortlisted', to_state: 'accepted', created_at: mid(month, 1, 16) });
            if (i === 9) t.application_events.push({ id: 'kpi-E-fell', listing_applicant_id: kNow, from_state: 'accepted', to_state: 'fell_through', created_at: mid(month, 1, 17) });
          }
        }
      }
    }
    if (q.get('seed') === '1' || q.get('history') === '1') {
      // Fourteen months of snapshots: a climb to the targets, one row on the first of each month and one today.
      const climb = [2, 3, 5, 6, 9, 11, 14, 17, 19, 23, 26, 31, 34];
      t.kpi_daily = [];
      for (let i = 12; i >= 1; i--) { const m = addMonths(month, -i + 1); const a = climb[13 - i]; t.kpi_daily.push({ day: `${m}-01`, active_realtors_mtd: 0, rentals_closed_mtd: 0, active_realtors_last_month: a, rentals_closed_last_month: Math.round(a * 1.55), streak_months: 0, profile_reuse: a, profile_reuse_tracked: false, signups_mtd: 0, signups_known_mtd: 0, referral_signups_mtd: 0, referral_share_mtd: null, signups_last_month: 0, signups_known_last_month: 0, referral_signups_last_month: 0, referral_share_last_month: null, days_left: 365, computed_at: new Date(now).toISOString() }); }
      t.kpi_daily.push({ ...t.kpi_daily[t.kpi_daily.length - 1], day: torontoDate(now), active_realtors_mtd: 12, rentals_closed_mtd: 9 });
    }
    // partner=1 (after seed=1): the Lead Realtor Partner section has someone to count. The first
    // seeded realtor is the partner (KPI_PARTNER_PROFILE_ID), four realtors from three months ago
    // signed up from the partner's invite link, two of them with an application in each of the
    // three complete months before this one, and a fifth was invited by one of those four (a
    // second level, counted nowhere). None of them signed up this month or last, so the referral
    // share the office walk reads is what it was.
    if (q.get('partner') === '1' && t.__kpiSeeded && !t.__partnerSeeded) {
      t.__partnerSeeded = true;
      process.env.KPI_PARTNER_PROFILE_ID = 'kpi-realtor-00';
      t.__partnerStart = `${addMonths(month, -4)}-17`;
      const byId = Object.fromEntries(t.profiles.map((p) => [p.id, p]));
      for (const p of t.profiles) if (!('invited_by' in p)) p.invited_by = null;
      for (const n of ['06', '07', '08', '09']) byId[`kpi-realtor-${n}`].invited_by = 'kpi-realtor-00';
      byId['kpi-realtor-10'].invited_by = 'kpi-realtor-06';
      for (const i of [6, 7]) for (const back of [2, 3]) {
        const at = `${addMonths(month, -back)}-12T16:00:00Z`; const a = `kpi-A${i}-0-back${back}`;
        t.applications.push({ id: a, application_number: `RL-KPI-${i}-0-B${back}`, full_name: 'Invented Tenant', email: `earlier${i}-${back}@mail.ca`, created_at: at });
        t.listing_applicants.push({ id: `kpi-K${i}-0-back${back}`, listing_id: `kpi-L${i}-0`, application_id: a, decision_status: 'none', added_via: 'invite', created_at: at, state: 'submitted' });
      }
    }
    // start=1 (the default once partner=1 has run) counts from a start date four months back
    // (KPI_PARTNER_START); start=0 takes the start date away: the counts are all time.
    if (t.__partnerSeeded) { if (q.get('start') === '0') delete process.env.KPI_PARTNER_START; else if (q.get('start') === '1' || q.get('partner') === '1') process.env.KPI_PARTNER_START = t.__partnerStart; }
    if (q.get('history') === '0') delete t.kpi_daily;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ seeded: !!t.__kpiSeeded, history: Array.isArray(t.kpi_daily) ? t.kpi_daily.length : null })); return;
  }
  if (req.url.startsWith('/__fake/pipeline')) {
    const n = Number(new URL(req.url, 'http://localhost').searchParams.get('people'));
    t.pipeline_consents = n === 2 ? [...oneConsent, secondConsent] : [...oneConsent];
    res.end(String(t.pipeline_consents.length)); return;
  }
  handle(req, res);
}).listen(port, () => console.log('ready'));
process.on('SIGTERM', () => process.exit(0));
