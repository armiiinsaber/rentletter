// tests/helpers/typesetStates.mjs  Every page and state a person can reach, for the wrapped text
// walks (tests/typeset/typesetWebkit.test.mjs) and the audit behind them: public, realtor, billing,
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
//   sweep({ browser, bases, concurrency, measure, onContext })   opens every state at 390, calls
//                 measure(page, name, kind) after each, and answers the names that did not open;
//                 onContext(context, key) is called once for each browser context it opens.
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
  { name: 'home', kind: 'public', go: (p) => open(p, '/') },
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
  { name: 'tenant profile, about you filled', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=7&docs=1&personal=1'); await p.locator('[data-photo="yes"]').waitFor({ timeout: 15000 }); await p.locator('[data-strength-steps]').waitFor({ timeout: 15000 }); await wait(p, 300); }, steps: async function* (p) {
    await p.locator('[data-photo="yes"]').getByRole('button', { name: 'Remove photo' }).click(); await p.locator('[data-photo-confirm]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, photo removal asked';
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

// Every state, in its phase, concurrency at a time; measure(page, name, kind) after each state
// and each step. Answers [{ name, error }] for the states that did not open.
export async function sweep({ browser, bases, contextOptions, concurrency = 4, measure, onContext }) {
  const ctx = {};
  for (const [k, base] of Object.entries(bases)) { ctx[k] = await browser.newContext({ ...contextOptions, baseURL: base }); await ctx[k].route(/supabase\.co\//, (r) => r.abort()); if (onContext) await onContext(ctx[k], k); }
  const failed = [];
  const one = async (s) => {
    const key = s.server === 'on' ? 'on' : 'off';
    const f = (path) => fetch(`${bases[key]}${path}`).then((r) => r.json());
    const page = await ctx[key].newPage();
    try {
      await s.go(page, f); await measure(page, s.name, s.kind);
      if (s.steps) for await (const name of s.steps(page, f)) await measure(page, name, s.kind);
    } catch (e) { failed.push({ name: s.name, error: String(e.message).split('\n')[0] }); }
    await page.close();
  };
  const pool = async (list, n) => { const queue = [...list]; await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await one(queue.shift()); })); };
  const billing = STATES.filter((s) => s.server === 'on');
  const rest = STATES.filter((s) => s.server !== 'on');
  const on = pool(billing, 1); // each sets the plan: one after another, beside the rest
  await pool(rest.filter((s) => !s.phase || s.phase === 'read'), concurrency);
  await pool(rest.filter((s) => s.phase === 'write'), concurrency);
  await on;
  await pool(rest.filter((s) => s.phase === 'alone'), 1);
  for (const c of Object.values(ctx)) await c.close();
  return failed;
}
