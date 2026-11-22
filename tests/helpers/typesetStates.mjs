// tests/helpers/typesetStates.mjs  Every page and state a person can reach, for the wrapped text
// walks (tests/helpers/typesetWalk.mjs, in parts) and the audit behind them: public, realtor, billing,
// tenant and landlord, on the fake stack with the long values (tests/helpers/fakeNextServer.mjs,
// FAKE_LONG=1). Each state opens on a page of its own: go(page, f), where f(path) answers a GET on
// the fake server as JSON; a state with steps(page, f) then yields the name of each further state
// it reaches on the same page (each applicant card open in turn, each step of the apply flow).
//   server 'on'   the build with billing on (BILLING_OFF=false); the rest run on the build with
//                 billing off, as production runs today. The billing states run one after another
//                 (each sets the plan).
//   phase         'read' (the default) changes nothing another state shows, so these run side by
//                 side; 'write' adds what only its own page shows, after every read; 'alone' takes
//                 the realtor's listings or name away for a moment and runs last, by itself.
//   widths        the widths a state is measured at: 390 and 320 unless it names its own (WIDE:
//                 390, 320, 1024, 1280, 1440, 1920 and 2560, for the desktop shell, the listing form
//                 and the homepage; DESK: the five desktop widths alone, for a screen whose phone
//                 widths another state measures).
//   sweep({ browser, bases, states, concurrency, measure, onContext })   opens every state (of
//                 states, STATES unless given) at 390, calls measure(page, name, kind, widths) after
//                 each, and answers the names that did not open; onContext(context, key) is called
//                 once for each browser context it opens.
const wait = (p, ms = 400) => p.waitForTimeout(ms);
const settle = async (p) => { await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await wait(p, 400); };
export const open = async (p, path) => { await p.goto(path, { waitUntil: 'load', timeout: 60000 }); await settle(p); };
export const tap = async (p, name, { exact = false } = {}) => { const l = p.getByRole('button', { name, exact }).first(); await l.waitFor({ timeout: 15000 }); await l.scrollIntoViewIfNeeded(); await l.click(); await wait(p, 500); };
// Opens every fold under within, in the page, a round at a time until none is left closed: each
// toggle is pressed once. Menus, the to do panel, applicant cards and Pipeline rows are left alone
// (one of each opens at a time: the steps below open them in turn).
export async function openAll(p, within = '#__next') {
  for (let round = 0; round < 12; round++) {
    const pressed = await p.evaluate((sel) => {
      const root = document.querySelector(sel) || document.body;
      const tried = window.__tlTried || (window.__tlTried = new WeakSet());
      let n = 0;
      for (const el of root.querySelectorAll('[aria-expanded="false"]:not([aria-haspopup]):not(a)')) {
        const r = el.getBoundingClientRect();
        if (tried.has(el) || !r.width || !r.height || el.matches('[aria-controls$="-body"], [data-person-row]') || /things? to do/i.test(el.textContent || '')) continue;
        tried.add(el); el.click(); n++;
      }
      return n;
    }, within);
    if (!pressed) return;
    await wait(p, 450);
  }
}
// Each applicant card (or Pipeline person) open in turn, its folds open too: yields its name.
async function* eachOpen(p, selector, label) {
  const n = await p.locator(selector).count();
  for (let i = 0; i < n; i++) {
    const row = p.locator(selector).nth(i);
    if ((await row.getAttribute('aria-expanded')) !== 'true') { await row.scrollIntoViewIfNeeded(); await row.click(); await wait(p, 600); }
    await openAll(p);
    yield `${label} ${i + 1} open`;
  }
}
const CARD = '[role=button][aria-controls$="-body"]';
const card = (p, name) => p.locator(CARD).filter({ hasText: name }).first();
const expand = async (p, name) => { const c = card(p, name); await c.waitFor({ timeout: 30000 }); await c.scrollIntoViewIfNeeded(); await c.click(); await wait(p, 600); };
const LONG = { a1: 'Oluwaseun Adebayo Fitzgerald', a2: 'Anastasia Konstantinopoulou', a3: 'Bartholomew Nakamura Whitfield' };
export const INVITE = 'a1b2c3d4e5f6a7b8c9d0';
export const NARROW = [390, 320];
export const WIDE = [390, 320, 1024, 1280, 1440, 1920, 2560];
export const DESK = [1024, 1280, 1440, 1920, 2560];
// The new listing form keeps a draft in the browser (components/listings/ListingSetupModal.js):
// each form state starts and ends with none, so no other state finds it.
const noDraft = (p) => p.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('rl-listing-draft')) localStorage.removeItem(k); } catch (e) { /* none */ } });
const desk = async (p) => { await p.setViewportSize({ width: 1440, height: 900 }); await wait(p, 300); };
const vis = (p, sel) => p.locator(`${sel}:visible`).first();
const NEW_LISTING = /^(\+\s*)?(New listing|Add a listing|Add listing)/i;
// The tenant's apply flow: each step filled with the long values, then Continue.
const STEPS = [
  async (p) => { await p.getByLabel('Email').fill('maximiliano.castellanos@outlook.com'); },
  async (p) => { await p.getByLabel('Full name').fill('Maximiliano Castellanos Ruiz'); await p.getByLabel('Date of birth').fill('1991-03-14'); await p.getByLabel('Phone').fill('4165550142'); },
  async (p) => { await p.getByLabel('Job title').fill('Senior Clinical Operations Coordinator'); await p.getByLabel('Employer').fill('Northwind Pediatric Rehabilitation Clinic Inc.'); await p.getByLabel('Annual income before tax (CAD)').fill('118000'); },
  async () => {},
  async (p) => { await p.getByLabel('Desired move in date').fill('2026-12-01'); },
  async () => {}, async () => {},
];
const applyStart = async (p) => { await open(p, `/apply/${INVITE}`); await p.getByLabel('Email').waitFor({ timeout: 30000 }); };
// A listing in British Columbia, for the age rule's refusal there (lib/applyAge.js BC_UNDER_AGE):
// the fake stack's realtors are in Ontario, so the page's own read of the province is answered
// with BC, the rest of the answer as the server gave it. path: the GET that carries the province.
const inBC = (p, path) => p.route((url) => url.pathname === path, async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const r = await route.fetch(); const body = await r.json().catch(() => ({}));
  return route.fulfill({ response: r, json: { ...body, province: 'BC' } });
});
// A date of birth that makes someone `n` years old today.
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 30); const z = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const BC_UNDER_AGE = 'Applications in British Columbia are open to people 19 or older.';
async function applyTo(p, step) { await applyStart(p); for (let i = 0; i < step - 1; i++) { await STEPS[i](p); await tap(p, 'Continue'); } }
// L1 archived or restored by its realtor (POST /api/listings/archive), from this page.
const setArchived = async (p, archived) => { const status = await p.evaluate(async (a) => (await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L1'], archived: a }) })).status, archived); if (status !== 200) throw new Error(`archive ${archived} answered ${status}`); };
// The apply form after an archived refusal: the closed line in the alert above the answers, the
// form still there with what was typed, and no Try again.
const CLOSED_LINE = 'This listing is no longer taking applications.';
async function closedLine(p) {
  const alert = p.locator('p[role=alert].mp-alert');
  await alert.waitFor({ timeout: 30000 }); await wait(p, 400);
  const seen = await p.evaluate(() => ({ alert: [...document.querySelectorAll('p[role=alert].mp-alert')].map((e) => e.textContent.replace(/\u00a0/g, ' ').trim()), text: document.body.innerText.replace(/\u00a0/g, ' '), buttons: [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim()) }));
  if (seen.alert.length !== 1 || seen.alert[0] !== CLOSED_LINE) throw new Error(`the alert reads ${JSON.stringify(seen.alert)}`);
  if (seen.buttons.some((b) => /try again/i.test(b)) || /not on the listing yet/i.test(seen.text)) throw new Error('Try again shows after the archived refusal');
  if (!seen.buttons.includes('Submit')) throw new Error('the form is not back on its review step');
  for (const kept of ['Maximiliano Castellanos Ruiz', 'Northwind Pediatric Rehabilitation Clinic Inc.']) if (!seen.text.includes(kept)) throw new Error(`the tenant's answer "${kept}" is not on the page`);
}
// The landlord's report for L1, sent from the realtor's session on this page.
async function report(p) {
  await open(p, '/dashboard');
  const sent = await p.evaluate(async () => { const r = await fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L1' }) }); return r.json(); });
  return sent.snapshot.token;
}
// L2 rented to J6 (POST /api/listings/status), a co applicant and a guarantor on the application.
async function rentL2(p, f) {
  await f('/__fake/seed-parties?link=J6');
  if (!p.url().startsWith('http')) await open(p, '/dashboard');
  await p.evaluate(async () => { await fetch('/api/listings/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: 'L2', status: 'rented', rentedLinkId: 'J6', notify: false }) }); });
}
// A party invite sent from the primary's own page (each state its own applicant, so none finds the
// role already taken), its token read from the mail the fake mailer kept.
async function partyToken(p, f, role, link) {
  const { applicationNumber, ownerToken } = await f(`/__fake/app?link=${link}`);
  await open(p, `/my-application/${applicationNumber}?token=${ownerToken}`);
  const email = `${role}.${link.toLowerCase()}@outlook.com`;
  await tap(p, role === 'guarantor' ? 'Add a guarantor' : /co applicant/i);
  await p.getByLabel('Their full name').fill(role === 'guarantor' ? 'Bartholomew Castellanos Whitfield' : 'Anastasia Konstantinopoulou');
  await p.getByLabel('Their email').fill(email);
  await tap(p, 'Send the invite');
  const mails = await f(`/__fake/mail?to=${encodeURIComponent(email)}`);
  return mails.map((x) => String(x.text).match(/\/party\/([A-Z2-9]{32})/)).find(Boolean)[1];
}
const myApplication = async (p, f, link) => { const { applicationNumber, ownerToken } = await f(`/__fake/app?link=${link}`); await open(p, `/my-application/${applicationNumber}?token=${ownerToken}`); };

// The founder office (/admin): the session cookie from the real login route, with the password the
// walk made up for this run (TYPESET_ADMIN_PASSWORD, handed to the server as ADMIN_PASSWORD). One
// sign in per server: a context that already holds a live session keeps it.
async function office(p) {
  const live = await p.request.get('/api/admin/session');
  if (live.status() === 200) return;
  const r = await p.request.post('/api/admin/login', { data: { password: process.env.TYPESET_ADMIN_PASSWORD } });
  if (!r.ok()) throw new Error(`office sign in failed: ${r.status()}`);
  const m = /rl_admin=([^;]+)/.exec(r.headers()['set-cookie'] || '');
  if (!m) throw new Error('office sign in set no session cookie');
  await p.context().addCookies([{ name: 'rl_admin', value: decodeURIComponent(m[1]), url: new URL(r.url()).origin, httpOnly: true, sameSite: 'Strict' }]);
}
// The tenant's own profile (pages/my-application.js): a tenant the fake stack signs in
// (/__fake/tenant, tests/helpers/fakeNextServer.mjs), with its session cookie. These states run
// in the last phase, one at a time ('alone'): every state that needs a tenant signed out (the
// sign in page, the apply flow, which fills from a signed in profile) has finished by then.
async function tenantProfile(p, f, query) {
  const { token } = await f(`/__fake/tenant?${query}`);
  await open(p, '/my-application'); // signed out first: the page's own address gives the cookie its origin
  await p.context().addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: new URL(p.url()).origin, httpOnly: true, sameSite: 'Lax' }]);
  await open(p, '/my-application');
  await p.locator('[data-vault-documents]').waitFor({ timeout: 30000 });
  await wait(p, 400);
}
export const STATES = [
  // ── public ──
  { name: 'home', kind: 'public', widths: WIDE, go: (p) => open(p, '/') },
  { name: 'sign in', kind: 'public', go: (p) => open(p, '/signin') },
  { name: 'sign in, an error', kind: 'public', go: (p) => open(p, '/signin?error=Sign-in%20is%20temporarily%20unavailable.') },
  { name: 'sign up', kind: 'public', go: (p) => open(p, '/signup') },
  { name: 'forgot password', kind: 'public', go: (p) => open(p, '/forgot-password') },
  { name: 'reset password', kind: 'public', go: (p) => open(p, '/reset-password?token_hash=x&type=recovery') },
  { name: 'reset password, no link', kind: 'public', go: (p) => open(p, '/reset-password') },
  { name: 'privacy', kind: 'public', go: (p) => open(p, '/privacy') },
  { name: 'terms', kind: 'public', go: (p) => open(p, '/terms') },
  { name: 'faq', kind: 'public', go: (p) => open(p, '/faq'), steps: async function* (p) { await openAll(p); yield 'faq, every answer open'; } },
  { name: 'compliance', kind: 'public', go: (p) => open(p, '/compliance') },
  { name: 'sandbox dashboard', kind: 'public', go: (p) => open(p, '/demo/dashboard') },
  // The sandbox Circle: the real screen over sample realtors, with a request waiting, connections
  // and a request sent; then a search result, the invite when nobody matches, and a removal asked.
  { name: 'sandbox circle', kind: 'public', go: async (p) => { await open(p, '/demo/dashboard?circle=1'); await p.locator('[data-circle-sample]').waitFor({ timeout: 30000 }); await p.locator('[data-circle-request]').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('#cv-search').fill('Sofia'); await p.locator('[data-circle-results]').waitFor({ timeout: 30000 }); await wait(p, 400);
    yield 'sandbox circle, a search result';
    await p.locator('[data-circle-add]').first().click(); await p.locator('[data-circle-requested]').first().waitFor({ timeout: 30000 }); await wait(p, 400);
    yield 'sandbox circle, added: requested';
    await p.locator('#cv-search').fill('Zoltan Nobody'); await p.locator('[data-circle-invite]').waitFor({ timeout: 30000 }); await wait(p, 400);
    yield 'sandbox circle, nobody found: the invite';
  } },
  { name: 'sandbox listing', kind: 'public', go: (p) => open(p, '/demo/dashboard?listing=demo-carlaw'), steps: (p) => eachOpen(p, CARD, 'sandbox listing, applicant') },
  { name: 'join, a code that is not valid', kind: 'public', go: (p) => open(p, '/join/ZZZZZZZZ') },
  { name: 'short link no longer active', kind: 'public', go: (p) => open(p, '/a/ZZZZZZZ') },
  { name: 'page not found', kind: 'public', go: (p) => open(p, '/no-such-page') },
  // ── realtor (billing off, as production runs) ──
  { name: 'dashboard', kind: 'realtor', go: (p) => open(p, '/dashboard'), steps: async function* (p) { await openAll(p); yield 'dashboard, every fold open'; yield* eachOpen(p, '[data-person-row]', 'dashboard, Pipeline person'); } },
  { name: 'dashboard, the to do panel', kind: 'realtor', go: async (p) => { await open(p, '/dashboard'); await tap(p, /things? to do/i); } },
  { name: 'new listing sheet', kind: 'realtor', go: async (p) => { await open(p, '/dashboard'); await tap(p, NEW_LISTING); }, steps: async function* (p) { await openAll(p, '[role=dialog]'); yield 'new listing sheet, every fold open'; } },
  { name: 'listing', kind: 'realtor', go: (p) => open(p, '/listing/L1'), steps: async function* (p) { await openAll(p); yield 'listing, every fold open'; yield* eachOpen(p, CARD, 'listing, applicant'); } },
  { name: 'listing, second', kind: 'realtor', go: (p) => open(p, '/listing/L2'), steps: async function* (p) { await openAll(p); yield* eachOpen(p, CARD, 'listing, second, applicant'); } },
  { name: 'listing, the to do panel', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /things? to do/i); } },
  { name: 'listing, add by application number', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Details/); await tap(p, /Add by application number/); } },
  { name: 'set aside sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await expand(p, LONG.a2); await tap(p, /^Set aside$/); } },
  { name: 'compare', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Compare$/); } },
  { name: 'landlord sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Send to /); } },
  { name: 'rented sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Details/); await tap(p, /Mark as rented/); } },
  { name: 'edit listing sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, 'Edit', { exact: true }); }, steps: async function* (p) { await openAll(p, '[role=dialog]'); yield 'edit listing sheet, every fold open'; } },
  { name: 'delete listing', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Details/); await tap(p, /Delete listing/); } },
  { name: 'request documents', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await expand(p, LONG.a2); await tap(p, /^Request documents/); } },
  { name: 'profile', kind: 'realtor', go: async (p) => { await open(p, '/profile'); await p.locator('[data-invite-realtor]').waitFor({ timeout: 30000 }); }, steps: async function* (p) { await openAll(p); yield 'profile, every fold open'; } },
  { name: 'join, a realtor\'s invite link', kind: 'public', go: async (p) => { await open(p, '/join?invite=K7M2Q9XW4TPB3HNC'); await p.locator('[data-realtor-invite-landing]').waitFor({ timeout: 30000 }); } },
  // The Circle screen (pages/circle.js): a request waiting, the circle with a connection's
  // brokerage record, a request sent, the invite card, the realtor's own brokerage and settings;
  // then a search that finds a realtor, the same after Add (Requested), a search that finds
  // nobody (the invite link with Copy link and Share by text), and the sheet that asks before a
  // removal. Alone, and the seeded circle is taken away after: its realtors are profiles.
  { name: 'circle', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); await open(p, '/circle'); await p.locator('[data-circle-list]').waitFor({ timeout: 30000 }); await wait(p, 400); }, steps: async function* (p, f) {
    try {
      await p.locator('#cv-search').fill('Guadalupe'); await p.locator('[data-circle-results]').waitFor({ timeout: 30000 }); await wait(p, 500);
      if (await p.locator('[data-circle-result]').count() !== 1) throw new Error('the search shows a realtor who turned findable off');
      yield 'circle, a search result';
      await p.locator('[data-circle-add]').first().click(); await p.locator('[data-circle-requested]').first().waitFor({ timeout: 30000 }); await wait(p, 500);
      yield 'circle, added: requested';
      await p.locator('#cv-search').fill('Zoltan Nobody'); await p.locator('[data-circle-invite]').waitFor({ timeout: 30000 }); await wait(p, 500);
      yield 'circle, nobody found: the invite';
      await p.locator('#cv-search').fill(''); await wait(p, 300);
      await p.locator('[data-circle-connection]').getByRole('button', { name: 'Remove' }).click(); await wait(p, 600);
      yield 'circle, remove asked';
    } finally { await f('/__fake/circle?seed=0'); }
  } },
  // The broker of record's page from the emailed link, its answer, and a link that is spent.
  { name: 'brokerage, the broker of record\'s page', kind: 'public', phase: 'alone', go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); const { token } = await f('/__fake/circle?brokerage-link=1'); await open(p, `/brokerage/confirm/${token}`); await p.locator('[data-brokerage-confirm="ask"]').waitFor({ timeout: 30000 }); }, steps: async function* (p, f) {
    try {
      await tap(p, 'Yes, confirm'); await p.locator('[data-brokerage-confirm="confirm"]').waitFor({ timeout: 30000 }); await wait(p, 300);
      yield 'brokerage, confirmed by the broker of record';
      await p.reload({ waitUntil: 'load' }); await p.locator('[data-brokerage-confirm="gone"]').waitFor({ timeout: 30000 }); await wait(p, 300);
      yield 'brokerage, a link that was used';
    } finally { await f('/__fake/circle?seed=0'); }
  } },
  // The second listing rented to its applicant, with a co applicant and a guarantor on the
  // application: Form data and the rented listing.
  { name: 'form data sheet', kind: 'realtor', phase: 'write', go: async (p, f) => { await rentL2(p, f); await open(p, '/listing/L2'); await tap(p, /^Details/); await p.locator('[data-form-data-row]').getByRole('button', { name: 'Form data' }).click(); await wait(p, 600); } },
  { name: 'listing, rented', kind: 'realtor', phase: 'write', go: async (p, f) => { await rentL2(p, f); await open(p, '/listing/L2'); await openAll(p); }, steps: (p) => eachOpen(p, CARD, 'listing, rented, applicant') },
  { name: 'dashboard, a listing rented', kind: 'realtor', phase: 'write', go: async (p, f) => { await rentL2(p, f); await open(p, '/dashboard'); await openAll(p); } },
  { name: 'dashboard, empty', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/state?listings=0'); try { await open(p, '/dashboard'); } finally { await f('/__fake/state?listings=1'); } } },
  // ── the desktop dashboard (components/dashboard/DashShell.js) and the listing form, at every width ──
  { name: 'dashboard, the desktop shell with listings', kind: 'realtor', widths: WIDE, go: (p) => open(p, '/dashboard') },
  { name: 'dashboard, Pipeline view', kind: 'realtor', widths: WIDE, go: (p) => open(p, '/dashboard?view=pipeline') },
  // The other screens in the same shell: a view, a form and two reading columns, at the main area's left.
  { name: 'dashboard, Shared with you view, the desktop shell', kind: 'realtor', widths: DESK, go: (p) => open(p, '/dashboard?view=shared') },
  { name: 'profile, the desktop shell', kind: 'realtor', widths: DESK, go: async (p) => { await open(p, '/profile'); await p.locator('[data-invite-realtor]').waitFor({ timeout: 30000 }); } },
  { name: 'listing, the desktop shell', kind: 'realtor', widths: DESK, go: (p) => open(p, '/listing/L1') },
  { name: 'circle, the desktop shell', kind: 'realtor', phase: 'alone', widths: DESK, go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); await open(p, '/circle'); await p.locator('[data-circle-list]').waitFor({ timeout: 30000 }); await wait(p, 400); }, after: (f) => f('/__fake/circle?seed=0') },
  { name: 'dashboard, empty, the start', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/state?listings=0'); await open(p, '/dashboard'); await p.locator('[data-get-started]').first().waitFor({ state: 'attached', timeout: 30000 }); }, after: (f) => f('/__fake/state?listings=1') },
  { name: 'dashboard, Archived', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/state?archive=1'); await open(p, '/dashboard');
    await p.evaluate(async () => { await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L2'], archived: true }) }); });
    await open(p, '/dashboard'); await vis(p, '[data-shelf-to="archived"]').click(); await wait(p, 400);
  }, after: async (f, p) => { try { await p.evaluate(async () => { await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L2'], archived: false }) }); }); } catch (e) { /* the page is gone */ } await f('/__fake/state?archive=0'); } },
  { name: 'dashboard, the bulk bar', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/state?archive=1'); await desk(p); await open(p, '/dashboard');
    await p.locator('[data-row-check="L1"]').check(); await p.locator('[data-row-check="L2"]').check(); await p.locator('[data-bulk-bar]').waitFor({ timeout: 15000 });
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
  }, after: (f) => f('/__fake/state?archive=0') },
  { name: 'new listing form, step 1 on a phone', kind: 'realtor', widths: NARROW, go: async (p) => { await open(p, '/dashboard'); await noDraft(p); await p.locator('.dash-new').click(); await p.locator('.lf-panel').waitFor({ timeout: 15000 }); await wait(p, 500); }, steps: async function* (p) {
    try {
      await p.locator('#lf-address').fill('2150 Lake Shore Boulevard West'); await p.locator('#lf-unit').fill('Penthouse 4512');
      await p.locator('#lf-unit').focus(); await p.locator('#lf-address').focus(); await wait(p, 200);
      await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 400);
      yield 'new listing form, step 2 on a phone';
      await p.locator('#lf-rent').fill('3450'); await p.locator('[data-chips="lf-beds"] [data-chip="__more"]').click(); await p.locator('[data-chips="lf-beds-more"] [data-chip="2-storey loft"]').click();
      await p.locator('[data-chips="lf-move"] [data-chip="__other"]').click(); await wait(p, 300);
      yield 'new listing form, step 2 with every choice open';
      await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 400);
      await p.locator('#lf-landlord-name').focus(); await p.locator('#lf-landlord-email').focus(); await p.locator('#lf-landlord-name').focus(); await wait(p, 200);
      yield 'new listing form, step 3 on a phone, an error beside a field';
      await p.locator('[data-add-details]').click(); await openAll(p, '[role=dialog]'); await wait(p, 300);
      yield 'new listing form, step 3 with every detail open';
    } finally { await noDraft(p); }
  } },
  { name: 'new listing form, the desktop panel', kind: 'realtor', widths: WIDE, go: async (p) => { await desk(p); await open(p, '/dashboard'); await noDraft(p); await p.locator('[data-shell-new]').click(); await p.locator('.lf-panel').waitFor({ timeout: 15000 }); await p.locator('#lf-address').fill('2150 Lake Shore Boulevard West'); await p.locator('#lf-rent').fill('3450'); await p.locator('[data-chips="lf-beds"] [data-chip="2"]').click(); await wait(p, 300); await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300); }, steps: async function* (p) {
    try { await desk(p); await p.locator('[data-add-details]').click(); await openAll(p, '[role=dialog]'); await wait(p, 300); await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300); yield 'new listing form, the desktop panel with every detail open'; } finally { await noDraft(p); }
  } },
  { name: 'new listing form, the apply link after the save', kind: 'realtor', phase: 'write', widths: WIDE, go: async (p) => {
    await desk(p); await open(p, '/dashboard'); await noDraft(p); await p.locator('[data-shell-new]').click(); await p.locator('.lf-panel').waitFor({ timeout: 15000 });
    await p.locator('#lf-address').fill('2150 Lake Shore Boulevard West, Penthouse 4512'); await p.locator('#lf-rent').fill('3450'); await p.locator('[data-chips="lf-beds"] [data-chip="2"]').click();
    await p.locator('#lf-landlord-name').fill('Bartholomew Castellanos Whitfield'); await p.locator('#lf-landlord-email').fill('b.castellanos.whitfield@outlook.com');
    await p.getByRole('button', { name: 'Create listing' }).click(); await p.locator('[data-listing-done] [data-apply-link]').waitFor({ timeout: 30000 });
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
  } },
  { name: 'onboarding', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/state?name=0'); try { await open(p, '/onboarding'); } finally { await f('/__fake/state?name=1'); } } },
  // ── billing (billing on) ──
  { name: 'dashboard, founding member', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=founding'); await open(p, '/dashboard'); } },
  { name: 'dashboard, trial with 3 days left', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=trial&days=3'); await open(p, '/dashboard'); } },
  { name: 'dashboard, trial ended', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=lapsed'); await open(p, '/dashboard'); } },
  { name: 'listing, trial ended', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=lapsed'); await open(p, '/listing/L1'); } },
  { name: 'dashboard, payment past due', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=past_due&days=3'); await open(p, '/dashboard'); } },
  { name: 'billing, founding member', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=founding'); await open(p, '/billing'); } },
  { name: 'billing, trial', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=trial&days=3'); await open(p, '/billing'); } },
  { name: 'billing, trial ended', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=lapsed'); await open(p, '/billing'); } },
  { name: 'billing, subscribed', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=paid'); await open(p, '/billing'); } },
  { name: 'billing, payment past due', kind: 'billing', server: 'on', go: async (p, f) => { await f('/__fake/state?plan=past_due&days=3'); await open(p, '/billing'); } },
  // ── tenant ──
  { name: 'apply, the first step', kind: 'tenant', go: applyStart, steps: async function* (p) { for (let i = 0; i < STEPS.length; i++) { await STEPS[i](p); await tap(p, 'Continue'); yield i + 2 > STEPS.length ? 'apply, review' : `apply, step ${i + 2}`; } } },
  { name: 'apply, through the short link', kind: 'tenant', go: (p) => open(p, '/a/WWWWWWW') },
  { name: 'apply, British Columbia, under 19', kind: 'tenant', go: async (p) => { await inBC(p, '/api/invite/resolve'); await applyStart(p); await STEPS[0](p); await tap(p, 'Continue'); await p.getByLabel('Full name').fill('Maximiliano Castellanos Ruiz'); await p.getByLabel('Date of birth').fill(yearsAgo(18)); await p.getByLabel('Phone').fill('4165550142'); await tap(p, 'Continue'); await p.getByText(BC_UNDER_AGE).first().waitFor({ timeout: 15000 }); } },
  { name: 'apply, a field left empty', kind: 'tenant', go: async (p) => { await applyStart(p); await tap(p, 'Continue'); } },
  { name: 'apply, sent', kind: 'tenant', phase: 'write', go: async (p) => { await applyTo(p, 8); await p.getByRole('checkbox').first().check().catch(() => {}); await tap(p, /^(Send|Submit)/); await p.getByText('Application submitted').first().waitFor({ timeout: 30000 }); await wait(p, 400); } },
  // A real archived submit, twice on one page (tests/routes/archivedSubmit.test.mjs has the routes):
  // the realtor archives L1 while the form is open and the submit is refused; then, restored, the
  // realtor archives it between the tenant's submit and its save to the listing (the tag request
  // is held until the archive answered, then goes to the server as it was). Both times the server's
  // own refusal puts the closed line above the answers, with no Try again.
  { name: 'apply, archived while the form is open', kind: 'tenant', phase: 'alone', go: async (p, f) => {
    await f('/__fake/state?archive=1'); await applyTo(p, 8);
    await setArchived(p, true); await tap(p, /^(Send|Submit)/); await closedLine(p);
  }, steps: async function* (p) {
    await setArchived(p, false);
    let tags = 0;
    await p.route('**/api/invite/tag', async (route) => { tags += 1; await setArchived(p, true); await route.continue(); });
    await tap(p, /^(Send|Submit)/); await closedLine(p);
    await p.unroute('**/api/invite/tag');
    if (tags !== 1) throw new Error(`the tag was asked ${tags} times; the archived refusal is final`);
    yield 'apply, archived during the submit';
  }, after: async (f, p) => { try { await setArchived(p, false); } catch (e) { /* the page is gone */ } await f('/__fake/state?archive=0'); } },
  { name: 'apply, the unit is rented', kind: 'tenant', go: (p) => open(p, '/apply/demo0000000000000009') },
  { name: 'apply, a link that is not valid', kind: 'tenant', go: (p) => open(p, '/apply/ffffffffffffffffffff') },
  { name: 'upload', kind: 'tenant', phase: 'write', go: async (p, f) => { const { token } = await f('/__fake/docreq?link=J4'); await open(p, `/upload/${token}`); } },
  { name: 'upload, with the credit report', kind: 'tenant', phase: 'write', go: async (p, f) => { const { token } = await f('/__fake/docreq?link=J2&credit=1'); await open(p, `/upload/${token}`); } },
  { name: 'upload, a link that is not valid', kind: 'tenant', go: (p) => open(p, '/upload/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ') },
  { name: 'my application, sign in', kind: 'tenant', go: (p) => open(p, '/my-application') },
  { name: 'my application, link sent', kind: 'tenant', go: async (p) => { await open(p, '/my-application'); await p.getByLabel(/email/i).first().fill('maximiliano.castellanos@outlook.com'); await tap(p, /^(Send|Email)/); await wait(p, 600); } },
  { name: 'my application', kind: 'tenant', go: (p, f) => myApplication(p, f, 'J1'), steps: async function* (p) { await openAll(p); yield 'my application, every fold open'; } },
  { name: 'my application, invite a co applicant', kind: 'tenant', go: async (p, f) => { await myApplication(p, f, 'J2'); await tap(p, /co applicant/i); } },
  { name: 'my application, no key', kind: 'tenant', go: (p) => open(p, '/my-application/RL-2026-TEST-A1A1') },
  { name: 'confirm, ready', kind: 'tenant', go: (p) => open(p, '/my-application/confirm?t=demo-ok') },
  { name: 'confirm, email', kind: 'tenant', go: (p) => open(p, '/my-application/confirm?t=demo-email') },
  { name: 'confirm, expired', kind: 'tenant', go: (p) => open(p, '/my-application/confirm?t=demo-expired') },
  { name: 'party form, co applicant', kind: 'tenant', phase: 'write', go: async (p, f) => { const t = await partyToken(p, f, 'co', 'J1'); await open(p, `/party/${t}`); } },
  { name: 'party form, guarantor step 2', kind: 'tenant', phase: 'write', go: async (p, f) => { const t = await partyToken(p, f, 'guarantor', 'J5'); await open(p, `/party/${t}`); await p.getByLabel('Full name').fill('Bartholomew Castellanos Whitfield'); await p.getByLabel('Date of birth').fill('1978-11-02'); await p.getByLabel('Phone').fill('4165550199'); await p.getByLabel('Address').fill('4100 Yonge Street, Unit 1907, North York').catch(() => {}); await tap(p, 'Continue'); } },
  { name: 'party form, British Columbia co applicant, under 19', kind: 'tenant', phase: 'write', go: async (p, f) => { const t = await partyToken(p, f, 'co', 'J2'); await inBC(p, '/api/party/self'); await open(p, `/party/${t}`); await p.getByLabel('Full name').fill('Anastasia Konstantinopoulou'); await p.getByLabel('Date of birth').fill(yearsAgo(18)); await tap(p, 'Continue'); await p.getByText(BC_UNDER_AGE).first().waitFor({ timeout: 15000 }); } },
  { name: 'party form, decline', kind: 'tenant', phase: 'write', go: async (p, f) => { const t = await partyToken(p, f, 'co', 'J4'); await open(p, `/party/${t}?decline=1`); } },
  { name: 'party form, a link that is not valid', kind: 'tenant', go: (p) => open(p, '/party/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ') },
  { name: 'reference, open', kind: 'tenant', go: (p) => open(p, `/ref/${'p'.repeat(32)}`) },
  { name: 'reference, answered', kind: 'tenant', go: (p) => open(p, `/ref/${'r'.repeat(32)}`) },
  { name: 'reference, expired', kind: 'tenant', go: (p) => open(p, '/ref/demo-ref-expired') },
  { name: 'reference, not valid', kind: 'tenant', go: (p) => open(p, `/ref/${'z'.repeat(32)}`) },
  { name: 'keep, asked', kind: 'tenant', go: (p) => open(p, '/keep/keeplongpending00000000000000001') },
  { name: 'keep, renew', kind: 'tenant', go: (p) => open(p, '/keep/keeplongrenew0000000000000000001') },
  { name: 'keep, answered', kind: 'tenant', go: (p) => open(p, '/keep/keeplongconsented000000000000001') },
  { name: 'keep, expired', kind: 'tenant', go: (p) => open(p, '/keep/demo-expired') },
  { name: 'keep, not valid', kind: 'tenant', go: (p) => open(p, `/keep/${'z'.repeat(32)}`) },
  { name: 'referral, not valid', kind: 'tenant', go: (p) => open(p, `/refer/${'z'.repeat(32)}`) },
  // The tenant's profile, their home: the typed facts each with its source and date, the vault
  // (the facts read from documents, the documents with their expiry, Renew and Delete), who has
  // viewed it, and what a realtor would see.
  { name: 'tenant profile, documents stored', kind: 'tenant', phase: 'alone', go: (p, f) => tenantProfile(p, f, 'who=1&docs=1'), steps: async function* (p) {
    await openAll(p); yield 'tenant profile, every fold open';
    await p.locator('[data-vault-document="income"]').getByRole('button', { name: /^Delete/ }).click(); await p.locator('[data-vault-confirm]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, a delete asked';
    await p.locator('[data-vault-confirm]').getByRole('button', { name: 'Keep it' }).click(); await wait(p, 200);
    await p.locator('[data-vault-check="employer_name"]').getByRole('button', { name: /^Remove/ }).click(); await p.locator('[data-vault-confirm]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, a fact removal asked';
  } },
  { name: 'tenant profile, before the first document', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=2&consent=0'); await p.locator('[data-vault-consent]').waitFor({ timeout: 15000 }); }, steps: async function* (p) {
    await tap(p, 'Agree and continue'); await p.locator('[data-vault-add]').waitFor({ timeout: 15000 }); await wait(p, 300); yield 'tenant profile, agreed, no documents yet';
  } },
  // Shares (db/019): the tenant's share list with each view and Stop sharing; one tap apply and
  // its review, which lists what is sent and what the realtor sees from the profile; and the
  // realtor's view of a shared profile on the applicant's card, and of one the tenant stopped.
  { name: 'tenant profile, a share and its views', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=4&docs=1&share=new'); await p.locator('[data-share="live"]').waitFor({ timeout: 15000 }); }, steps: async function* (p) {
    await p.locator('[data-share="live"]').getByRole('button', { name: /^Stop sharing/ }).click(); await p.locator('[data-vault-confirm]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, stop sharing asked';
  } },
  // The full profile (db/022): strength with its checklist, a photo, the tenant's own words, an
  // offer to prepay rent and the landlord report switch, all filled; then the photo's removal asked.
  { name: 'tenant profile, about you filled', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=7&docs=1&personal=1'); await p.locator('[data-photo="yes"]').waitFor({ timeout: 15000 }); await p.locator('[data-strength-bar]').waitFor({ timeout: 15000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-photo="yes"]').getByRole('button', { name: 'Remove photo' }).click(); await p.locator('[data-photo-confirm]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, photo removal asked';
  } },
  // Sharing with the listing agent (db/024): the tenant's share list with both roles and an invite
  // waiting; then the search for a listing agent, the confirm that says what they see, and the
  // share made. And the listing agent's own view of a shared profile, on their dashboard.
  { name: 'tenant profile, shares with both roles', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=9&docs=1&share=new&agent=1&personal=1'); await p.locator('[data-share-role="listing_agent"]').waitFor({ timeout: 15000 }); await p.locator('[data-agent-invited]').waitFor({ timeout: 15000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-agent-search]').fill('Guadalupe'); await p.locator('[data-agent-result]').first().waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, a listing agent found';
    await p.locator('[data-agent-pick]').first().click(); await p.locator('[data-agent-sees]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, share with the listing agent asked';
    await p.locator('[data-agent-share]').click(); await p.locator('[data-agent-note="ok"]').waitFor({ timeout: 15000 }); await wait(p, 400);
    if (await p.locator('[data-share-role="listing_agent"]').count() !== 2) throw new Error('the share with the listing agent is not on the list');
    yield 'tenant profile, shared with a second listing agent';
  } },
  { name: 'dashboard, a profile shared with the listing agent', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/tenant?who=10&docs=1&personal=1&asagent=1'); await open(p, '/dashboard'); await p.locator('[data-shared-with-me]').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-shared-with-me] [data-shared-view]').first().click(); await p.locator('[data-shared-screening]').waitFor({ timeout: 30000 }); await p.locator('[data-shared-facts]').waitFor({ timeout: 30000 }); await wait(p, 400);
    if (await p.locator('[data-shared-with-me] [data-shared-open="id"]').count()) throw new Error('the ID is offered to a listing agent');
    yield 'dashboard, the listing agent\'s view of a shared profile';
  } },
  { name: 'tenant profile, a share the tenant stopped', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=5&docs=1&share=new&stopped=1'); await p.locator('[data-share="revoked"]').waitFor({ timeout: 15000 }); } },
  { name: 'listing, a shared profile', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/tenant?who=4&docs=1&share=new&personal=1'); await open(p, '/listing/L1'); await expand(p, 'Maximiliano Castellanos Ruiz'); await p.locator('[data-shared-view]').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-shared-view]').click(); await p.locator('[data-shared-facts]').waitFor({ timeout: 30000 }); await p.locator('[data-shared-photo]').waitFor({ timeout: 30000 }); await p.locator('[data-shared-about]').waitFor({ timeout: 30000 }); await wait(p, 400);
    yield 'listing, the shared profile viewed';
    // The landlord's report for the same listing now carries that tenant's own words and offer, and no photo.
    const token = await report(p); await open(p, `/r/${token}`); await p.locator('[data-tenant-about]').waitFor({ timeout: 30000 }); await p.locator('[data-tenant-offer]').waitFor({ timeout: 30000 });
    if (await p.locator('img[src^="data:image"]').count()) throw new Error('a photo is on the landlord report');
    yield 'landlord report, a tenant\'s own words and offer';
  } },
  // The checklist line "Co applicant: {long name}": the label stands above the name where both
  // do not fit on one line (components/ui.js LabelValue), so no word is left alone.
  { name: 'listing, checklist with a long co applicant name', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f(`/__fake/seed-parties?link=J2&status=invited&co=${encodeURIComponent(LONG.a2)}`); await open(p, '/listing/L1'); await expand(p, LONG.a2); await p.locator('[data-checklist-title="party"]').first().waitFor({ timeout: 30000 }); await p.locator('[data-checklist-title="party"]').first().scrollIntoViewIfNeeded(); await wait(p, 300); } },
  { name: 'listing, a profile the tenant stopped sharing', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/tenant?who=5&docs=1&share=new&stopped=1'); await open(p, '/listing/L1'); await expand(p, 'Valentina Castellanos Ruiz'); await p.locator('[data-shared-ended]').waitFor({ timeout: 30000 }); await wait(p, 300); } },
  // After the realtor's shared profile states: its last steps send an application to L1 under the same sample name.
  { name: 'one tap apply, the offer', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=6&docs=1'); await open(p, `/apply/${INVITE}`); await p.locator('[data-one-tap]').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-one-tap-apply]').click(); await p.locator('[data-one-tap-share]').waitFor({ timeout: 30000 }); await wait(p, 500);
    yield 'one tap apply, the review of what is shared';
    // The share request after submit fails once: the application is sent, the done page says the
    // share did not go through and offers Try again; the second request goes through.
    let mirrors = 0; p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/applications\/mirror/.test(r.url())) mirrors += 1; });
    await p.route('**/api/tenant/shares', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' }) : r.fallback()));
    await p.getByRole('checkbox').first().check().catch(() => {}); await tap(p, /^(Send|Submit)/);
    await p.locator('[data-share-failed="failed"]').waitFor({ timeout: 30000 }); await p.locator('[data-share-failed]').scrollIntoViewIfNeeded(); await wait(p, 400);
    yield 'one tap apply, sent, the share did not go through';
    await p.unroute('**/api/tenant/shares');
    await p.locator('[data-share-retry]').click(); await p.locator('[data-share-retried]').waitFor({ timeout: 30000 }); await wait(p, 300);
    if (mirrors !== 1) throw new Error(`the application was sent ${mirrors} times; the retry must send the share alone`);
    yield 'one tap apply, the share went through on the retry';
  } },
  // The profile laid out to be filled in (pages/my-application.js): the section menu, the sections
  // and the strength panel at every width; empty (no facts yet, no document, nothing about them),
  // about half filled and then one section open for editing, complete (every step of the strength
  // done, a share and an application), and on a phone the checklist as a sheet (it is there only
  // below 1024: the slim bar that opens it is the phone's).
  { name: 'tenant profile, empty', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=11&facts=none&consent=0'); await p.locator('[data-section-invite="employment"]').waitFor({ timeout: 15000 }); await wait(p, 300); } },
  { name: 'tenant profile, half filled', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=12&facts=half&docs=id'); await p.locator('[data-section-invite="rental"]').waitFor({ timeout: 15000 }); await p.locator('[data-strength-bar]').waitFor({ timeout: 15000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-section-edit="employment"]').click(); await p.locator('[data-section-form="employment"]').waitFor({ timeout: 15000 }); await wait(p, 400);
    yield 'tenant profile, a section open for editing';
  } },
  { name: 'tenant profile, complete', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=13&facts=full&docs=1&personal=1&share=new&agent=1'); await p.locator('[data-strength-next="none"]').first().waitFor({ state: 'attached', timeout: 15000 }); await p.locator('[data-share="live"]').first().waitFor({ timeout: 15000 }); await wait(p, 300); } },
  { name: 'tenant profile, the checklist sheet on a phone', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=12&facts=half&docs=id'); await p.locator('[data-strength-bar]').click(); await p.locator('[data-strength-sheet] [data-strength-steps]').waitFor({ timeout: 15000 }); await wait(p, 500); } },
  { name: 'tenant profile, documents paused', kind: 'tenant', phase: 'alone', go: async (p, f) => { try { await tenantProfile(p, f, 'who=3&docs=1&paused=1'); await p.locator('[data-vault-paused]').waitFor({ timeout: 15000 }); } finally { await f('/__fake/tenant?who=3&paused=0'); } } },
  // ── landlord ──
  { name: 'landlord report', kind: 'landlord', phase: 'write', go: async (p) => { const t = await report(p); await open(p, `/r/${t}`); }, steps: async function* (p) { await tap(p, /meet/i); await wait(p, 400); yield 'landlord report, answered'; await tap(p, /Tap to change/); yield 'landlord report, changing an answer'; } },
  { name: 'landlord report, sandbox', kind: 'landlord', go: (p) => open(p, '/r/demo-demo-carlaw') },
  // ── the founder office: the Commitment section first, and the poster ──
  { name: 'office, the commitment counted', kind: 'office', phase: 'write', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await office(p); await open(p, '/admin'); await p.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await p.locator('.cm-svg').waitFor({ timeout: 15000 }); await wait(p, 400); } },
  { name: 'office, the Lead Realtor Partner counted', kind: 'office', phase: 'write', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await f('/__fake/kpi?partner=1'); await office(p); await open(p, '/admin'); await p.locator('[data-partner-tile="active"]').waitFor({ timeout: 30000 }); await p.locator('[data-partner-start]:not([data-partner-start=""])').waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'office, brokerages to review', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); try { await office(p); await open(p, '/admin/brokerages'); await p.locator('[data-brokerage-row]').first().waitFor({ timeout: 30000 }); } finally { await f('/__fake/circle?seed=0'); } } },
  { name: 'office, the commitment poster', kind: 'office', phase: 'write', go: async (p) => { await office(p); await open(p, '/admin/commitment'); await p.locator('[data-poster]').waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'office, the Lead Realtor Partner with no start date', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await f('/__fake/kpi?partner=1'); await f('/__fake/kpi?start=0'); try { await office(p); await open(p, '/admin'); await p.locator('[data-partner-start=""]').waitFor({ timeout: 30000 }); await wait(p, 400); } finally { await f('/__fake/kpi?start=1'); } } },
  { name: 'office, the commitment before its table exists', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/kpi?history=0'); try { await office(p); await open(p, '/admin'); await p.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await wait(p, 400); } finally { await f('/__fake/kpi?history=1'); } } },
];

// Every state (of states), in its phase, concurrency at a time; measure(page, name, kind) after
// each state and each step. Answers [{ name, error }] for the states that did not open.
export async function sweep({ browser, bases, states = STATES, contextOptions, concurrency = 4, measure, onContext }) {
  const ctx = {};
  for (const [k, base] of Object.entries(bases)) { ctx[k] = await browser.newContext({ ...contextOptions, baseURL: base }); await ctx[k].route(/supabase\.co\//, (r) => r.abort()); if (onContext) await onContext(ctx[k], k); }
  const failed = [];
  const one = async (s) => {
    const key = s.server === 'on' ? 'on' : 'off';
    const f = (path) => fetch(`${bases[key]}${path}`).then((r) => r.json());
    const page = await ctx[key].newPage();
    try {
      await s.go(page, f); await measure(page, s.name, s.kind, s.widths || NARROW);
      if (s.steps) for await (const name of s.steps(page, f)) await measure(page, name, s.kind, s.widths || NARROW);
    } catch (e) { failed.push({ name: s.name, error: String(e.message).split('\n')[0] }); }
    // A state that changed what the fake stack holds puts it back, whether it opened or not.
    if (s.after) { try { await s.after(f, page); } catch (e) { /* the next state starts from the fixture as it can */ } }
    await page.close();
  };
  const pool = async (list, n) => { const queue = [...list]; await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await one(queue.shift()); })); };
  const billing = states.filter((s) => s.server === 'on');
  const rest = states.filter((s) => s.server !== 'on');
  const on = pool(billing, 1); // each sets the plan: one after another, beside the rest
  await pool(rest.filter((s) => !s.phase || s.phase === 'read'), concurrency);
  await pool(rest.filter((s) => s.phase === 'write'), concurrency);
  await on;
  await pool(rest.filter((s) => s.phase === 'alone'), 1);
  for (const c of Object.values(ctx)) await c.close();
  return failed;
}
