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
  if (req.url.startsWith('/__fake/seed-parties')) {
    const link = String(new URL(req.url, 'http://localhost').searchParams.get('link') || '');
    const j = (t.listing_applicants || []).find((x) => x.id === link);
    if (!j) { res.statusCode = 404; res.end('{}'); return; }
    t.application_parties = (t.application_parties || []).filter((p) => p.application_id !== j.application_id);
    const now = new Date().toISOString();
    t.application_parties.push(
      { id: `P-co-${link}`, application_id: j.application_id, role: 'co_applicant', status: 'submitted', full_name: 'Jordan Lee', email: 'jordan@example.com', phone: '416 555 0142', address: null, employer: 'Northwind Sample Clinic Inc.', job_title: 'Analyst', annual_income: 64000, invited_at: now, submitted_at: now, consented_at: now, doc_verifications: null },
      { id: `P-g-${link}`, application_id: j.application_id, role: 'guarantor', status: 'submitted', full_name: 'Pat Guarantor', email: 'pat@example.com', phone: '416 555 0199', address: '14 Sample Cres, Toronto', employer: 'Northwind Sample Clinic Inc.', job_title: 'Clinic Coordinator', annual_income: 85000, invited_at: now, submitted_at: now, consented_at: now, doc_verifications: null },
    );
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, applicationId: j.application_id })); return;
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
