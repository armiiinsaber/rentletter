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
// A press on a control in an open applicant card, which runs over 1000px tall: html scrolls
// smoothly (components/ui.js, whatever the reduced motion setting), so scrollIntoViewIfNeeded
// animates and a press can land where the control was, retried until it times out. The control
// is scrolled to the middle at once, then pressed.
const press = async (p, l) => { await l.waitFor({ timeout: 30000 }); await l.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(p, 300); await l.click(); };
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
// The dashboard's order of the listings, kept on the device (components/dashboard/listingSort.js):
// each state that sets one leaves none behind.
const clearSort = (p) => p.evaluate(() => { try { localStorage.removeItem('rl-listing-sort-active'); localStorage.removeItem('rl-listing-sort-archived'); localStorage.removeItem('rl-listing-view'); } catch (e) { /* none */ } }).catch(() => {});
// The Compact table, switched next to Active and Archived (kept on the device; clearSort forgets it).
const compact = async (p) => { await vis(p, '[data-view-mode-to="compact"]').click(); await p.locator('[data-listings-view] [data-listings-table]').first().waitFor({ timeout: 30000 }); await wait(p, 200); };
const TABLE = '[data-listings-view] [data-listings-table]';
// The realtor's listings brought to n in the view with the fake stack's extra ones (many=, tests/
// helpers/fakeNextServer.mjs), from the count it answers: a write state before has saved one of
// its own. At least three extra, so both on Queens Quay West and the one with no rent are there.
const listingsTo = async (f, n, extra = '') => {
  const { listings } = await f(`/__fake/state?many=0${extra}`); const more = n - listings;
  if (more < 3 || more > 7) throw new Error(`the realtor has ${listings} listings: ${n} in the view takes ${more} more`);
  await f(`/__fake/state?many=${more}`);
};
// The first listings table as it stands: the heading that holds the order, the arrows drawn, the
// rents down its rows, the rows picked, the bar's count, the scroll, the page's mark and its address.
const tableNow = (p) => p.evaluate((sel) => {
  const t = document.querySelector(sel);
  return {
    sorted: [...t.querySelectorAll('[role=columnheader][aria-sort]')].map((h) => [h.dataset.col, h.getAttribute('aria-sort')]),
    arrows: [...t.querySelectorAll('.lt-arrow')].filter((a) => a.getClientRects().length && getComputedStyle(a).visibility === 'visible').map((a) => [a.closest('[data-col]').dataset.col, a.dataset.dir]),
    rents: [...t.querySelectorAll('[data-listing-row] [data-col="rent"]')].map((c) => Number(c.textContent.replace(/[^\d]/g, '')) || null),
    ids: [...t.querySelectorAll('[data-listing-row]')].map((r) => r.dataset.listingRow),
    picked: [...document.querySelectorAll('[data-row-check]:checked')].map((c) => c.dataset.rowCheck),
    bar: ((document.querySelector('[data-bulk-bar] .hv-bulk-n') || {}).textContent || '').trim(),
    y: Math.round(window.scrollY), mark: window.__sortMark || 0, url: location.href,
  };
}, TABLE);
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
// The send sheet (components/dashboard/SendReportSheet.js), opened from L1's card: L1's report made
// ready to send again (/__fake/state?unsent=L1; the landlord report state sent it), its landlord
// email and the realtor's signing name set as the state asks. What it changes it reads from the
// page first and puts back after (sendSheetBack), with the report's times.
const SEND = [390, 320, 1440, 1920];
// The paywall, centred in the main area from 1024 (components/dashboard/DashShell.js ds-mid).
const PAYWALL = [390, 320, 1440, 1920];
const LONG_SIGNATURE = 'Alexandria Konstantinopoulou, Harbourfront Residential Realty Inc., Brokerage';
const sendKept = {};
const postJson = (p, url, body) => p.evaluate(async ([u, b]) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).ok, [url, body]);
async function sendSheet(p, f, { email, signature }) {
  await f('/__fake/state?unsent=L1');
  await open(p, '/dashboard');
  const was = await p.evaluate(() => { const pp = window.__NEXT_DATA__.props.pageProps; const l = (pp.initialListings || []).find((x) => x.id === 'L1'); return { email: l ? l.landlord_email || null : null, signature: (pp.initialProfile && pp.initialProfile.report_signature) || null }; });
  if (!('email' in sendKept)) Object.assign(sendKept, was);
  if (!(await postJson(p, '/api/listings/update', { listingId: 'L1', landlord_email: email }))) throw new Error('L1\'s landlord email was not set');
  if (!(await postJson(p, '/api/profile/update', { report_signature: signature }))) throw new Error('the signing name was not set');
  await open(p, '/dashboard');
  await vis(p, '[data-listing-card="L1"] [data-card-action="send"]').click();
  await p.locator('[data-send-sheet="L1"]').waitFor({ timeout: 15000 }); await wait(p, 500);
}
async function sendSheetBack(f, p) {
  if ('email' in sendKept) {
    try { await postJson(p, '/api/listings/update', { listingId: 'L1', landlord_email: sendKept.email }); await postJson(p, '/api/profile/update', { report_signature: sendKept.signature }); } catch (e) { /* the page is gone */ }
    for (const k of Object.keys(sendKept)) delete sendKept[k];
  }
  await f('/__fake/state?unsent=0');
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
// A tenant whose profile holds no facts: the page opens on the guided first run.
async function tenantSetup(p, f, query) {
  const { token } = await f(`/__fake/tenant?${query}`);
  await open(p, '/my-application');
  await p.context().addCookies([{ name: 'rl_tenant', value: encodeURIComponent(token), url: new URL(p.url()).origin, httpOnly: true, sameSite: 'Lax' }]);
  await open(p, '/my-application');
  await p.locator('[data-run-screen="name"]').waitFor({ timeout: 30000 });
  await wait(p, 400);
}
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
  // The homepage scrolled under its navigation, which is glass then (components/ui.js .rl-glass).
  { name: 'home, the navigation scrolled', kind: 'public', widths: WIDE, go: async (p) => { await open(p, '/'); await p.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' })); await wait(p, 500); } },
  // Where we fit: the black sentence line one and the grey one line two from 1024, each balanced under it.
  { name: 'home, the Where we fit line', kind: 'public', widths: WIDE, go: async (p) => { await open(p, '/'); await p.locator('[data-where-we-fit]').scrollIntoViewIfNeeded(); await wait(p, 400); } },
  { name: 'sign in', kind: 'public', go: (p) => open(p, '/signin') },
  { name: 'sign in, an error', kind: 'public', go: (p) => open(p, '/signin?error=Sign-in%20is%20temporarily%20unavailable.') },
  { name: 'sign up', kind: 'public', go: (p) => open(p, '/signup') },
  { name: 'forgot password', kind: 'public', go: (p) => open(p, '/forgot-password') },
  { name: 'reset password', kind: 'public', go: (p) => open(p, '/reset-password?token_hash=x&type=recovery') },
  { name: 'reset password, no link', kind: 'public', go: (p) => open(p, '/reset-password') },
  { name: 'privacy', kind: 'public', go: (p) => open(p, '/privacy') },
  { name: 'terms', kind: 'public', go: (p) => open(p, '/terms') },
  // The answer on background checks changed (pages/faq.js): measured at the desktop widths too.
  { name: 'faq', kind: 'public', widths: [390, 320, 1440, 1920], go: (p) => open(p, '/faq'), steps: async function* (p) { await openAll(p); yield 'faq, every answer open'; } },
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
  // The listing page's Send opens the send sheet (components/dashboard/SendReportSheet.js): nothing is sent.
  { name: 'listing, the send sheet', kind: 'realtor', widths: SEND, go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Send to /); await p.locator('[data-send-sheet="L1"]').waitFor({ timeout: 15000 }); await wait(p, 400); } },
  { name: 'rented sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Details/); await tap(p, /Mark as rented/); } },
  { name: 'edit listing sheet', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, 'Edit', { exact: true }); }, steps: async function* (p) { await openAll(p, '[role=dialog]'); yield 'edit listing sheet, every fold open'; } },
  { name: 'delete listing', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await tap(p, /^Details/); await tap(p, /Delete listing/); } },
  { name: 'request documents', kind: 'realtor', go: async (p) => { await open(p, '/listing/L1'); await expand(p, LONG.a2); await tap(p, /^Request documents/); } },
  { name: 'profile', kind: 'realtor', go: async (p) => { await open(p, '/profile'); await p.locator('[data-invite-realtor]').waitFor({ timeout: 30000 }); }, steps: async function* (p) { await openAll(p); yield 'profile, every fold open'; } },
  // Measured on the desktop too: its line is the homepage's (pages/join/index.js).
  { name: 'join, a realtor\'s invite link', kind: 'public', widths: [390, 320, 1440, 1920], go: async (p) => { await open(p, '/join?invite=K7M2Q9XW4TPB3HNC'); await p.locator('[data-realtor-invite-landing]').waitFor({ timeout: 30000 }); } },
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
  // A navigation inside the dashboard (components/nav/RouteFrame.js): at 1440 through the sidebar,
  // Pipeline then Circle; at 390 through the Circle tab. Nothing slides; the screen is measured
  // where the navigation left it.
  { name: 'dashboard, a navigation through the sidebar', kind: 'realtor', widths: WIDE, go: async (p) => { await desk(p); await open(p, '/dashboard'); await p.locator('[data-shell-place="pipeline"]').click(); await p.waitForURL((u) => u.searchParams.get('view') === 'pipeline', { timeout: 15000 }); await p.locator('[data-shell-place="circle"]').click(); await p.waitForURL((u) => u.pathname === '/circle', { timeout: 15000 }); await p.locator('[data-circle-list], [data-circle-empty]').first().waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'dashboard, a navigation through the phone tabs', kind: 'realtor', widths: WIDE, go: async (p) => { await open(p, '/dashboard'); await p.locator('[data-main-nav] [data-nav="circle"]').click(); await p.waitForURL((u) => u.pathname === '/circle', { timeout: 15000 }); await p.locator('[data-circle-list], [data-circle-empty]').first().waitFor({ timeout: 30000 }); await wait(p, 400); } },
  // A sheet open: New listing over Circle, opened from the sidebar where it is, the view behind as it was.
  { name: 'circle, New listing open over it', kind: 'realtor', widths: WIDE, go: async (p) => { await desk(p); await open(p, '/circle'); await noDraft(p); await p.locator('[data-shell-new]').click(); await p.locator('.lf-panel').waitFor({ timeout: 15000 }); await wait(p, 500); }, after: async (f, p) => { if (p) await noDraft(p); } },
  { name: 'dashboard, Pipeline view', kind: 'realtor', widths: WIDE, go: (p) => open(p, '/dashboard?view=pipeline') },
  // The other screens in the same shell: a view, a form and two reading columns, at the main area's left.
  { name: 'dashboard, Shared with you view, the desktop shell', kind: 'realtor', widths: DESK, go: (p) => open(p, '/dashboard?view=shared') },
  { name: 'profile, the desktop shell', kind: 'realtor', widths: DESK, go: async (p) => { await open(p, '/profile'); await p.locator('[data-invite-realtor]').waitFor({ timeout: 30000 }); } },
  // The Profile in two columns from 1024px (components/dashboard/ProfileView.js): the form in its
  // three groups, the preview beside it; one column with the back row under 1024px.
  { name: 'profile, the form and the preview', kind: 'realtor', widths: WIDE, go: async (p) => { await open(p, '/profile'); await p.locator('[data-invite-realtor]').waitFor({ timeout: 30000 }); await p.locator('[data-profile-preview] [data-report-brand]').waitFor({ state: 'attached', timeout: 30000 }); } },
  { name: 'listing, the desktop shell', kind: 'realtor', widths: DESK, go: (p) => open(p, '/listing/L1') },
  // The Fit section of an applicant whose employer you confirmed (Applicant A1A1, lib/fitScore.js):
  // the basis, the Ability fact and the Truth line say Employer confirmed, the Truth line once.
  // Measured at the phone widths and at 1440 and 1920.
  { name: 'listing, the Fit of an applicant whose employer you confirmed', kind: 'realtor', widths: [390, 320, 1440, 1920], go: async (p) => {
    await open(p, '/listing/L1');
    const head = p.locator('#applicant-J1 [role=button][aria-controls$="-body"]').first();
    await head.waitFor({ timeout: 30000 });
    if ((await head.getAttribute('aria-expanded')) !== 'true') { await press(p, head); await wait(p, 600); }
    const fold = p.locator('#applicant-J1 button[aria-controls$="-fit"]').first();
    await fold.waitFor({ timeout: 15000 });
    if ((await fold.getAttribute('aria-expanded')) !== 'true') { await press(p, fold); await wait(p, 400); }
    const section = p.locator('#applicant-J1 [data-fit-section]');
    await section.waitFor({ timeout: 15000 });
    const text = await section.innerText();
    const truth = await section.locator('[data-fit-pillar="truth"]').innerText();
    if (!/Employer\s+confirmed\./.test(text) || /income\s+confirmed|confirmed\s+income/i.test(text) || (truth.match(/Employer\s+confirmed\s+by\s+you/g) || []).length !== 1) throw new Error(`the Fit section reads: ${text.replace(/\s+/g, ' ')}`);
    await section.scrollIntoViewIfNeeded();
  } },
  { name: 'circle, the desktop shell', kind: 'realtor', phase: 'alone', widths: DESK, go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); await open(p, '/circle'); await p.locator('[data-circle-list]').waitFor({ timeout: 30000 }); await wait(p, 400); }, after: (f) => f('/__fake/circle?seed=0') },
  // Circle in two columns from 1024px (components/dashboard/CircleView.js): empty, the invitation
  // with its two ways to start; five realtors and a request, a grid of cards; and the brokerage
  // form open over the view from its card (under 1024px the same form in the page).
  { name: 'circle, empty', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/circle?seed=0'); await open(p, '/circle'); await p.locator('[data-circle-empty]').waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'circle, five connections and a request', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/circle?seed=5&brokerage=sent'); await open(p, '/circle'); await p.locator('[data-circle-connection]').first().waitFor({ timeout: 30000 }); await p.locator('[data-circle-request]').waitFor({ timeout: 30000 }); await wait(p, 400); }, after: (f) => f('/__fake/circle?seed=0') },
  { name: 'circle, the brokerage panel open', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/circle?seed=5&brokerage=sent'); await desk(p); await open(p, '/circle'); await p.locator('[data-brokerage-open]').click(); await p.locator('[data-brokerage-panel]').waitFor({ timeout: 15000 }); await wait(p, 500); }, after: (f) => f('/__fake/circle?seed=0') },
  { name: 'dashboard, empty, the start', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/state?listings=0'); await open(p, '/dashboard'); await p.locator('[data-get-started]').first().waitFor({ state: 'attached', timeout: 30000 }); }, after: (f) => f('/__fake/state?listings=1') },
  { name: 'dashboard, Archived', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/state?archive=1'); await open(p, '/dashboard');
    await p.evaluate(async () => { await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L2'], archived: true }) }); });
    await open(p, '/dashboard'); await vis(p, '[data-shelf-to="archived"]').click(); await wait(p, 400);
  }, after: async (f, p) => { try { await p.evaluate(async () => { await fetch('/api/listings/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: ['L2'], archived: false }) }); }); } catch (e) { /* the page is gone */ } await f('/__fake/state?archive=0'); } },
  // Select mode on the cards (feat/dashboard-2026): a checkbox on each card, two picked, the bar.
  { name: 'dashboard, Select mode and the bulk bar', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/state?archive=1'); await desk(p); await open(p, '/dashboard');
    await vis(p, '[data-select-mode]').click();
    const ids = await p.locator('[data-card-check]').evaluateAll((els) => els.map((e) => e.dataset.cardCheck));
    for (const id of ids.slice(0, 2)) await p.locator(`[data-card-check="${id}"]`).check();
    await p.locator('[data-bulk-bar]').waitFor({ timeout: 15000 });
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
  }, after: (f) => f('/__fake/state?archive=0') },
  // The board with nothing waiting: the listing with a report to send archived, the one rented and
  // the one with no applicant left; every tile quiet, no dot, no action line.
  { name: 'dashboard, the board with nothing waiting', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/state?archive=1'); await open(p, '/dashboard'); await setArchived(p, true); await open(p, '/dashboard');
    await p.locator('[data-status-board]').waitFor({ timeout: 30000 }); await wait(p, 300);
    const tiles = await p.evaluate(() => [...document.querySelectorAll('[data-status-board] [data-tile]')].map((e) => [e.dataset.tile, e.querySelector('[data-roll]').dataset.roll, !!e.querySelector('.sb-dot'), e.tagName]));
    if (JSON.stringify(tiles.slice(0, 2)) !== JSON.stringify([['toSend', '0', false, 'BUTTON'], ['toCheck', '0', false, 'BUTTON']])) throw new Error(`nothing waiting: ${JSON.stringify(tiles)}`);
  }, after: async (f, p) => { try { await setArchived(p, false); } catch (e) { /* the page is gone */ } await f('/__fake/state?archive=0'); } },
  // The Compact table at 1024 and wider (the cards under it), kept on the device.
  { name: 'dashboard, the Compact view', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p) => { await desk(p); await open(p, '/dashboard'); await clearSort(p); await open(p, '/dashboard'); await compact(p); }, after: async (f, p) => { await clearSort(p); } },
  // The command menu (components/dashboard/CommandMenu.js), opened from the search bar, an address typed.
  { name: 'dashboard, the command menu open', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p) => {
    await desk(p); await open(p, '/dashboard'); await vis(p, '[data-command-open]').click();
    await p.locator('[data-command-menu]').waitFor({ timeout: 15000 }); await wait(p, 400);
    await p.locator('[data-command-input]').fill('a'); await wait(p, 300);
    if (!(await p.locator('[data-command-result^="listing:"]').count()) || !(await p.locator('[data-command-result^="applicant:"]').count())) throw new Error('the menu found no listing and no applicant');
  } },
  // The order of the listings (components/dashboard/listingSort.js), on eight listings in the view
  // (the fixture's, the one a write state saved and enough more): at 1440 the Rent heading, a click high to low with its
  // arrow and aria-sort, a second low to high, a third high to low again, the one with no rent last
  // each time; the row picked before stays picked, the bar keeps its count, nothing reloads,
  // navigates or scrolls; the order is kept on this device for Active alone and read again after a
  // reload. No search with eight. Measured sorted by rent at every width.
  { name: 'dashboard, the table sorted by rent', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await listingsTo(f, 8, '&archive=1'); await desk(p); await open(p, '/dashboard'); await clearSort(p); await open(p, '/dashboard');
    await compact(p);
    if (await p.locator('[data-listing-search]:visible').count()) throw new Error('the search shows with eight listings');
    const before = await tableNow(p);
    if (JSON.stringify(before.sorted) !== '[["when","descending"]]' || before.ids.length < 6) throw new Error(`the default order: ${JSON.stringify(before)}`);
    await p.locator('[data-row-check="L1"]').check(); await p.locator('[data-bulk-bar]').waitFor({ timeout: 15000 });
    await p.evaluate(() => { window.__sortMark = 1; window.scrollTo({ top: 120, behavior: 'instant' }); }); await wait(p, 300);
    const y0 = await p.evaluate(() => window.scrollY);
    for (const [aria, dir] of [['descending', 'desc'], ['ascending', 'asc'], ['descending', 'desc']]) {
      await p.locator(`${TABLE} [data-sort-col="rent"]`).first().click(); await wait(p, 300);
      const s = await tableNow(p);
      const set = s.rents.filter((n) => n != null);
      if (JSON.stringify(s.sorted) !== JSON.stringify([['rent', aria]]) || JSON.stringify(s.arrows) !== JSON.stringify([['rent', dir]])) throw new Error(`the rent heading, ${dir}: ${JSON.stringify(s)}`);
      if (JSON.stringify(set) !== JSON.stringify([...set].sort((a, b) => (dir === 'desc' ? b - a : a - b))) || s.rents[s.rents.length - 1] !== null || s.rents.slice(s.rents.indexOf(null)).some((n) => n != null)) throw new Error(`the rows by rent, ${dir}: ${JSON.stringify(s.rents)}`);
      if (JSON.stringify(s.picked) !== '["L1"]' || s.bar !== '1 selected' || s.mark !== 1 || s.url !== before.url || Math.abs(s.y - y0) > 1) throw new Error(`a sort changed more than the order: ${JSON.stringify({ ...s, y0 })}`);
    }
    const kept = await p.evaluate(() => { try { return [localStorage.getItem('rl-listing-sort-active'), localStorage.getItem('rl-listing-sort-archived')]; } catch (e) { return String(e); } });
    if (JSON.stringify(kept) !== JSON.stringify(['{"key":"rent","dir":"desc"}', null])) throw new Error(`kept on the device: ${JSON.stringify(kept)}`);
    // Archived keeps its own order; a reload reads Active's back.
    await vis(p, '[data-shelf-to="archived"]').click(); await wait(p, 300);
    if ((await vis(p, '[data-sort-menu-open]').innerText()).trim() !== 'Latest activity') throw new Error('Archived took the order of Active');
    await vis(p, '[data-shelf-to="active"]').click(); await wait(p, 300);
    await open(p, '/dashboard'); await p.locator(TABLE).first().waitFor({ timeout: 30000 }); await wait(p, 300);
    const again = await tableNow(p);
    if (JSON.stringify(again.sorted) !== '[["rent","descending"]]' || (await vis(p, '[data-sort-menu-open]').innerText()).trim() !== 'Rent high to low') throw new Error(`after a reload: ${JSON.stringify(again)}`);
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
    if ((await vis(p, '[data-sort-open]').innerText()).trim() !== 'Rent high to low') throw new Error('the phone\'s Sort control does not read the order');
  }, after: async (f, p) => { await clearSort(p); await f('/__fake/state?archive=0&many=0'); } },
  // The Sort sheet under 1024: the eight choices, Latest activity the one ticked; Rent low to high
  // puts the cards in that order at once, the sheet goes, the page is where it was and did not
  // reload; opened again with that choice ticked, and measured open at every width.
  { name: 'dashboard, the Sort sheet', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await listingsTo(f, 8); await open(p, '/dashboard'); await clearSort(p); await open(p, '/dashboard');
    await vis(p, '[data-sort-open]').waitFor({ timeout: 30000 });
    await p.evaluate(() => { window.__sortMark = 1; window.scrollTo({ top: 80, behavior: 'instant' }); }); await wait(p, 300);
    const y0 = await p.evaluate(() => window.scrollY);
    const choices = async () => p.evaluate(() => [...document.querySelectorAll('[data-sort-sheet] [role=radio]')].map((b) => [b.textContent.trim(), b.getAttribute('aria-checked')]));
    await vis(p, '[data-sort-open]').click(); await p.locator('[data-sort-sheet]').waitFor({ timeout: 15000 }); await wait(p, 500);
    const first = await choices();
    const EIGHT = ['Latest activity', 'Newest listing', 'Rent high to low', 'Rent low to high', 'Most applicants', 'Needs attention first', 'Move in date soonest', 'Address A to Z'];
    if (JSON.stringify(first) !== JSON.stringify(EIGHT.map((t, i) => [t, i === 0 ? 'true' : 'false']))) throw new Error(`the sheet: ${JSON.stringify(first)}`);
    await p.locator('[data-sort-sheet] [data-sort-choice="rent-low"]').click();
    await p.locator('[data-sort-sheet]').waitFor({ state: 'detached', timeout: 15000 }); await wait(p, 300);
    // The cards that take applications (the rented ones are under their own heading): the rent is
    // each card's first fact.
    const cards = await p.evaluate(() => ({
      rents: [...document.querySelectorAll('[data-listing-cards] [data-listing-card]')].map((c) => c.querySelector('.lc-narrow .lc-fact').textContent.replace(/\s*·$/, '').trim()),
      y: window.scrollY, mark: window.__sortMark || 0, label: [...document.querySelectorAll('[data-sort-open]')].find((b) => b.getClientRects().length).textContent.trim(),
    }));
    const nums = cards.rents.filter((r) => r !== 'No rent set').map((r) => Number(r.replace(/[^\d]/g, '')));
    if (cards.rents.length < 6 || JSON.stringify(nums) !== JSON.stringify([...nums].sort((a, b) => a - b)) || cards.rents[cards.rents.length - 1] !== 'No rent set' || cards.label !== 'Rent low to high') throw new Error(`the cards after Rent low to high: ${JSON.stringify(cards)}`);
    if (cards.mark !== 1 || Math.abs(cards.y - y0) > 1) throw new Error(`the choice moved the page: ${JSON.stringify({ ...cards, y0 })}`);
    await vis(p, '[data-sort-open]').click(); await p.locator('[data-sort-sheet]').waitFor({ timeout: 15000 }); await wait(p, 500);
    if (JSON.stringify((await choices()).filter(([, on]) => on === 'true')) !== '[["Rent low to high","true"]]') throw new Error('the sheet does not tick the order on view');
  }, after: async (f, p) => { await clearSort(p); await f('/__fake/state?many=0'); } },
  // Nine listings: the search above the list at 390, by address and unit as the realtor types;
  // none matches, the one line with Clear; Clear brings them all back; "queens quay" two, said;
  // Archived (none there) shows no search, and back on Active the query is still there. At 1440
  // the desktop field holds the same query over the table's two rows. Measured with it typed.
  { name: 'dashboard, nine listings and the search', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await listingsTo(f, 9, '&archive=1'); await open(p, '/dashboard'); await clearSort(p); await open(p, '/dashboard');
    const field = vis(p, '[data-listing-search-input]');
    await field.waitFor({ timeout: 30000 });
    const seen = () => p.evaluate(() => { const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length); return { cards: shown('[data-listing-card]').length, rows: shown('[data-listings-view] [data-listing-row]').length, count: (shown('[data-search-count]')[0] || {}).textContent || '', empty: shown('[data-search-empty]').length, fields: shown('[data-listing-search-input]').map((i) => i.value) }; });
    await field.fill('zzzz'); await wait(p, 300);
    let s = await seen();
    if (s.cards !== 0 || s.empty !== 1 || s.count) throw new Error(`no match: ${JSON.stringify(s)}`);
    await vis(p, '[data-search-clear]').click(); await wait(p, 300);
    s = await seen();
    if (s.cards !== 9 || s.empty || JSON.stringify(s.fields) !== '[""]') throw new Error(`after Clear: ${JSON.stringify(s)}`);
    await field.fill('QUEENS quay'); await wait(p, 300);
    s = await seen();
    if (s.cards !== 2 || s.count !== '2 listings match') throw new Error(`queens quay: ${JSON.stringify(s)}`);
    await vis(p, '[data-shelf-to="archived"]').click(); await wait(p, 300);
    if ((await seen()).fields.length) throw new Error('the search shows on Archived, with nothing there');
    await vis(p, '[data-shelf-to="active"]').click(); await wait(p, 300);
    s = await seen();
    if (JSON.stringify(s.fields) !== '["QUEENS quay"]' || s.cards !== 2) throw new Error(`back on Active: ${JSON.stringify(s)}`);
    await desk(p); s = await seen();
    if (JSON.stringify(s.fields) !== '["QUEENS quay"]' || s.cards !== 2 || s.count !== '2 listings match') throw new Error(`at 1440: ${JSON.stringify(s)}`);
    await compact(p); s = await seen();
    if (JSON.stringify(s.fields) !== '["QUEENS quay"]' || s.rows !== 2) throw new Error(`at 1440, Compact: ${JSON.stringify(s)}`);
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
  }, after: async (f, p) => { await clearSort(p); await f('/__fake/state?archive=0&many=0'); } },
  { name: 'new listing form, step 1 on a phone', kind: 'realtor', widths: NARROW, go: async (p) => { await open(p, '/dashboard'); await noDraft(p); await p.locator('[data-tab-new]').click(); await p.locator('.lf-panel').waitFor({ timeout: 15000 }); await wait(p, 500); }, steps: async function* (p) {
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
  { name: 'dashboard, trial ended', kind: 'billing', server: 'on', widths: PAYWALL, go: async (p, f) => { await f('/__fake/state?plan=lapsed'); await open(p, '/dashboard'); } },
  { name: 'listing, trial ended', kind: 'billing', server: 'on', widths: PAYWALL, go: async (p, f) => { await f('/__fake/state?plan=lapsed'); await open(p, '/listing/L1'); } },
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
  // The tenant's top bar (components/tenant/TenantBar.js): solid at the very top, glass scrolled.
  { name: 'tenant profile, the top bar at the top', kind: 'tenant', phase: 'alone', widths: WIDE, go: (p, f) => tenantProfile(p, f, 'who=21&docs=1') },
  { name: 'tenant profile, the top bar scrolled', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=21&docs=1'); await p.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' })); await wait(p, 500); } },
  // Your applications with three rows: the address and the status, the date and the number.
  { name: 'tenant profile, Your applications with three rows', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=22&docs=1&apps=3'); await p.locator('[data-application-row]').first().waitFor({ timeout: 15000 }); await p.evaluate(() => document.getElementById('applications').scrollIntoView({ block: 'start', behavior: 'instant' })); await wait(p, 400); } },
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
  // About me in Persian (db/026): the box reads from the right and spelling is not checked, and
  // under it the English version waits for the tenant's approval; then "Help me write this"
  // answers in Persian, and the suggestion reads from the right too.
  { name: 'tenant profile, about me in Persian with the approval box', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantProfile(p, f, 'who=14&docs=1&personal=fa'); await p.locator('[data-about-english="review"]').waitFor({ timeout: 15000 }); await p.locator('[data-strength-bar]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const box = await p.locator('[data-about-text]').evaluate((el) => ({ dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign, spell: el.spellcheck }));
    if (box.dir !== 'rtl' || box.spell !== false || !/^(start|right)$/.test(box.align)) throw new Error(`the About me box with Persian in it: ${JSON.stringify(box)}`);
    const en = await p.locator('[data-english-shown] p').evaluateAll((els) => els.map((el) => getComputedStyle(el).direction));
    if (en.length !== 2 || en.some((d) => d !== 'ltr')) throw new Error(`the English version reads ${JSON.stringify(en)}`);
    if (await p.locator('[data-english-approve]').count() !== 1) throw new Error('Looks right is not offered');
  }, steps: async function* (p) {
    await p.locator('[data-about-help]').click(); await p.locator('[data-about-suggestion]').waitFor({ timeout: 15000 }); await wait(p, 400);
    const said = await p.locator('[data-about-suggested] p').evaluateAll((els) => els.map((el) => ({ dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign })));
    if (!said.length || said.some((x) => x.dir !== 'rtl' || x.align !== 'right')) throw new Error(`the suggestion in Persian reads ${JSON.stringify(said)}`);
    yield 'tenant profile, a suggestion in Persian';
    // Used and saved: How realtors will read it follows directly under the words saved.
    await p.locator('[data-about-accept]').click(); await p.locator('[data-about-save]').click();
    await p.locator('[data-about-english]').waitFor({ timeout: 30000 }); await wait(p, 300);
    const next = await p.evaluate(() => { const row = document.querySelector('[data-about-save]').closest('.mp-actions'); const n = row.nextElementSibling; return { next: n && n.dataset.aboutEnglish, saved: row.textContent.replace(/\s+/g, ' ').trim() }; });
    if (!next.next || !/Saved\./.test(next.saved)) throw new Error(`after the Persian suggestion was saved: ${JSON.stringify(next)}`);
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
  { name: 'dashboard, a profile shared with the listing agent', kind: 'realtor', phase: 'alone', widths: [390, 320, 1440, 1920], go: async (p, f) => { await f('/__fake/tenant?who=10&docs=1&personal=1&asagent=1'); await open(p, '/dashboard'); await p.locator('[data-shared-with-me]').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
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
  // The realtor's view of a profile whose About me is in Persian, with the English version the
  // tenant approved (db/026): the English first, its label, then the original, from the right.
  { name: 'listing, a shared profile with an approved translation', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await f('/__fake/tenant?who=15&docs=1&share=new&personal=fa-approved'); await open(p, '/listing/L1'); await expand(p, 'Parisa Castellanos Ruiz'); await p.locator('[data-shared-view]').waitFor({ timeout: 30000 });
    await p.locator('[data-shared-view]').click(); await p.locator('[data-shared-facts]').waitFor({ timeout: 30000 }); await p.locator('[data-shared-about="translated"]').waitFor({ timeout: 30000 }); await wait(p, 400);
    const read = await p.locator('[data-shared-about] p').evaluateAll((els) => els.map((el) => ({ dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign, text: el.textContent.slice(0, 24), rtl: /[\u0600-\u06ff]/.test(el.textContent) })));
    const order = read.map((x) => (x.rtl ? 'fa' : /^Translated from Persian, approved by the tenant$/.test(x.text.trim()) || x.text.startsWith('Translated from Persian') ? 'label' : 'en')).join(' ');
    if (order !== 'en en label fa fa') throw new Error(`the shared About me reads ${order}`);
    if (read.some((x) => (x.rtl ? x.dir !== 'rtl' || x.align !== 'right' : x.dir !== 'ltr'))) throw new Error(`the shared About me is set ${JSON.stringify(read)}`);
  }, steps: async function* (p) {
    // The landlord's report for the same listing: the English first, its label, then the original
    // from the right (lib/listingReportData.js, pages/r/[token].js).
    const token = await report(p); await open(p, `/r/${token}`); await p.locator('[data-tenant-about="translated"]').waitFor({ timeout: 30000 });
    // The translated block (another applicant on this listing may carry words of their own in English).
    const read = await p.locator('[data-tenant-about="translated"] p').evaluateAll((els) => els.map((el) => ({ dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign, text: el.textContent, rtl: /[\u0600-\u06ff]/.test(el.textContent) })));
    const order = read.map((x) => (x.rtl ? 'fa' : /^Translated from Persian, approved by the tenant$/.test(x.text.replace(/\s+/g, ' ').trim()) ? 'label' : 'en')).join(' ');
    if (order !== 'en en label fa fa') throw new Error(`the landlord report's About me reads ${order}`);
    if (read.some((x) => (x.rtl ? x.dir !== 'rtl' || x.align !== 'right' : x.dir !== 'ltr'))) throw new Error(`the landlord report's About me is set ${JSON.stringify(read.map(({ dir, align, rtl }) => ({ dir, align, rtl })))}`);
    yield 'landlord report, About me translated and approved';
  } },
  // The checklist line "Co applicant: {long name}": the label stands above the name where both
  // do not fit on one line (components/ui.js LabelValue), so no word is left alone.
  { name: 'listing, checklist with a long co applicant name', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f(`/__fake/seed-parties?link=J2&status=invited&co=${encodeURIComponent(LONG.a2)}`); await open(p, '/listing/L1'); await expand(p, LONG.a2); await p.locator('[data-checklist-title="party"]').first().waitFor({ timeout: 30000 }); await p.locator('[data-checklist-title="party"]').first().scrollIntoViewIfNeeded(); await wait(p, 300); } },
  { name: 'listing, a profile the tenant stopped sharing', kind: 'realtor', phase: 'alone', go: async (p, f) => { await f('/__fake/tenant?who=5&docs=1&share=new&stopped=1'); await open(p, '/listing/L1'); await expand(p, 'Valentina Castellanos Ruiz'); await p.locator('[data-shared-ended]').waitFor({ timeout: 30000 }); await wait(p, 300); } },
  // A co applicant whose employer the realtor confirmed (lib/parties.js): their row on the card reads
  // employer confirmed, never verified, and so do the landlord report's facts; the report's Fit word
  // verified carries the line saying what it means (pages/r/[token].js). At 390, 320, 1440 and 1920.
  { name: 'listing, a co applicant whose employer you confirmed', kind: 'realtor', phase: 'alone', widths: [390, 320, 1440, 1920], go: async (p, f) => {
    await f('/__fake/seed-parties?link=J1'); await open(p, '/listing/L1');
    const status = await p.evaluate(async () => (await fetch('/api/applicants/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: 'J1', key: 'party:P-co-J1:employer', on: true }) })).status);
    if (status !== 200) throw new Error(`the confirmation answered ${status}`);
    await open(p, '/listing/L1');
    await press(p, p.locator('[aria-controls="applicant-J1-body"]').first()); await wait(p, 600);
    await press(p, p.locator('[aria-controls="applicant-J1-party-P-co-J1"]').first()); await wait(p, 400);
    const row = await p.locator('[data-party="P-co-J1"]').first().innerText();
    // The last two words are joined by a no break space (lib/typeset.js noWidow): \s matches it.
    if (!/employer\s+confirmed/i.test(row) || /verified/i.test(row)) throw new Error(`the co applicant's row reads ${JSON.stringify(row)}`);
  }, steps: async function* (p) {
    const token = await report(p); await open(p, `/r/${token}`); await p.locator('[data-verified-meaning]').first().waitFor({ timeout: 30000 });
    const people = await p.locator('[data-parties-row]').filter({ hasText: 'Jordan Lee' }).first().innerText();
    if (!/Employer\s+confirmed/.test(people) || /verified/i.test(people)) throw new Error(`the landlord report's people read ${JSON.stringify(people)}`);
    yield 'landlord report, a co applicant whose employer you confirmed';
  } },
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
  // The profile laid out to be filled in (pages/my-application.js): the tenant's card at the top
  // (components/tenant/ProfileCard.js), the section menu, the cards with their lead values, and the
  // progress panel at every width; empty (no facts yet: the first run, left at once), about half
  // filled (two of seven steps added, a card that needs something and its button), complete (every
  // step, a share and an application) and its Preview, and on a phone the checklist as a sheet (it
  // is there only below 1024: the slim bar that opens it is the phone's).
  { name: 'tenant profile, empty', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantSetup(p, f, 'who=11&facts=none&consent=0');
    await p.locator('[data-run-leave]').click(); await p.locator('[data-card-empty]').waitFor({ timeout: 15000 }); await p.locator('[data-section-invite="employment"]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const card = await p.locator('[data-profile-card]').evaluate((el) => ({ buttons: el.querySelectorAll('[data-card-empty] button').length, marks: [...el.querySelectorAll('[data-mark]')].map((m) => m.dataset.done), photo: !!el.querySelector('[data-card-photo="no"]') }));
    if (card.buttons !== 1 || card.marks.length !== 6 || card.marks.some((d) => d !== 'no') || !card.photo) throw new Error(`the empty card: ${JSON.stringify(card)}`);
    if (await p.locator('[data-first-run]').count()) throw new Error('the first run is still open after Leave setup');
  } },
  { name: 'tenant profile, half filled', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantProfile(p, f, 'who=12&facts=half&docs=2'); await p.locator('[data-section-invite="rental"]').waitFor({ timeout: 15000 }); await p.locator('[data-strength-bar]').waitFor({ timeout: 15000 }); await wait(p, 300);
    // The progress at 2 of 7, never a percent; the card fits the first screen of a phone.
    const bar = (await p.locator('[data-strength-bar] [data-strength-count]').innerText()).replace(/\s+/g, ' ').trim();
    if (bar !== '2 of 7 added') throw new Error(`the phone's bar reads "${bar}"`);
    if (/\d\s*%/.test(await p.locator('[data-tp-top]').innerText())) throw new Error('a percent is shown');
    const fit = await p.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); const r = document.querySelector('[data-profile-card]').getBoundingClientRect(); return { bottom: Math.round(r.bottom), height: window.innerHeight }; });
    if (fit.bottom > fit.height) throw new Error(`the card runs past the first screen at 390 (${JSON.stringify(fit)})`);
    // A card that needs something: one line, one button.
    const need = await p.locator('[data-section-need="employment"]').evaluate((el) => ({ lines: el.querySelectorAll('p').length, buttons: el.querySelectorAll('button').length, text: el.innerText.replace(/\s+/g, ' ').trim() }));
    if (need.lines !== 1 || need.buttons !== 1) throw new Error(`what the employment card needs: ${JSON.stringify(need)}`);
    if (await p.locator('[data-section="household"] [data-field-row="moveInDate"]').count() !== 1 || await p.locator('[data-section="move"]').count()) throw new Error('the move in date is not on Your move and household');
    if (await p.locator('.tp-tag, [data-section-state]').count()) throw new Error('a Done pill is still drawn');
  }, steps: async function* (p) {
    // Its one button opens the card for editing, at the field it needs.
    await p.locator('[data-section-fill="employment"]').click(); await p.locator('[data-section-form="employment"]').waitFor({ timeout: 15000 }); await wait(p, 400);
    if (!(await p.evaluate(() => document.activeElement && document.activeElement.dataset.field === 'annualIncome'))) throw new Error('the button of what the card needs does not open its field');
    yield 'tenant profile, a section open for editing';
  } },
  // A pay stub added and its income read, no amount typed (components/tenant/ProfileCard.js): the
  // card's income is the amount read, with the line that it was read from a document, beside the
  // mark that says the income was read; never Not added.
  { name: 'tenant profile, the income read from a pay stub', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantProfile(p, f, 'who=16&facts=half&docs=2'); await p.locator('[data-key-fact="annualIncome"] [data-key-source="document"]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const seen = await p.evaluate(() => { const t = (sel) => (document.querySelector(sel) || {}).innerText || ''; return { fact: t('[data-key-fact="annualIncome"]').replace(/\s+/g, ' ').trim(), mark: t('[data-mark="income"]').replace(/\s+/g, ' ').trim(), done: (document.querySelector('[data-mark="income"]') || {}).dataset?.done }; });
    if (seen.fact !== 'Income before tax $118,000 a year Read from a document' || seen.mark !== 'Income read from your document' || seen.done !== 'yes') throw new Error(`the card's income: ${JSON.stringify(seen)}`);
  } },
  { name: 'tenant profile, complete', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => { await tenantProfile(p, f, 'who=13&facts=full&docs=1&personal=1&share=new&agent=1'); await p.locator('[data-strength-next="none"]').first().waitFor({ state: 'attached', timeout: 15000 }); await p.locator('[data-share="live"]').first().waitFor({ timeout: 15000 }); await wait(p, 300); }, steps: async function* (p) {
    // Preview: the realtor's own view of the profile (components/dashboard/SharedProfileView.js),
    // the facts "What a realtor would see" lists and nothing else: no progress, no document, no ID.
    await p.locator('[data-mode-preview]').click(); await p.locator('[data-preview] [data-shared-facts]').waitFor({ timeout: 15000 }); await wait(p, 400);
    const seen = await p.evaluate(async () => {
      const profile = await (await fetch('/api/tenant/profile')).json(); const vault = await (await fetch('/api/tenant/vault')).json();
      const box = document.querySelector('[data-preview]');
      const shown = (sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0);
      return { facts: [...box.querySelectorAll('[data-shared-fact]')].map((el) => el.dataset.sharedFact), checks: [...box.querySelectorAll('[data-shared-check]')].map((el) => el.dataset.sharedCheck), profile, vaultChecks: (vault.checks || []).map((c) => ({ kind: c.kind, value: c.value, read_at: c.readAt })),
        line: !!document.querySelector('[data-preview-line]'), progress: shown('[data-strength]') || shown('[data-strength-bar]') || shown('[data-strength-count]'), counted: /of \d+ added|\d\s*%/.test(document.body.innerText),
        documents: box.querySelectorAll('[data-shared-open], [data-shared-documents]').length, sections: shown('[data-section]') || shown('[data-vault-documents]'), photos: box.querySelectorAll('img').length };
    });
    // What a realtor reads, from the library the share reader uses (lib/profileFacts.js sharePayload).
    const { sharePayload } = await import('../../lib/profileFacts.js');
    const want = sharePayload(seen.profile, seen.vaultChecks);
    if (JSON.stringify(seen.facts) !== JSON.stringify(want.facts.map((x) => x.key))) throw new Error(`Preview shows ${seen.facts} where a realtor reads ${want.facts.map((x) => x.key)}`);
    if (JSON.stringify(seen.checks) !== JSON.stringify(want.checks.map((x) => x.kind))) throw new Error(`Preview shows the checks ${seen.checks} where a realtor reads ${want.checks.map((x) => x.kind)}`);
    if (!seen.line || seen.progress || seen.counted || seen.documents || seen.sections || seen.photos !== 1) throw new Error(`Preview: ${JSON.stringify({ ...seen, profile: undefined })}`);
    yield 'tenant profile, Preview';
    await p.locator('[data-mode-edit]').click(); await p.locator('[data-profile-card]').waitFor({ timeout: 15000 });
  } },
  { name: 'tenant profile, the checklist sheet on a phone', kind: 'tenant', phase: 'alone', go: async (p, f) => { await tenantProfile(p, f, 'who=12&facts=half&docs=2'); await p.locator('[data-strength-bar]').click(); await p.locator('[data-strength-sheet] [data-strength-steps]').waitFor({ timeout: 15000 }); await wait(p, 500); } },
  { name: 'tenant profile, documents paused', kind: 'tenant', phase: 'alone', go: async (p, f) => { try { await tenantProfile(p, f, 'who=3&docs=1&paused=1'); await p.locator('[data-vault-paused]').waitFor({ timeout: 15000 }); } finally { await f('/__fake/tenant?who=3&paused=0'); } } },
  // The guided first run (components/tenant/FirstRun.js): each screen, one question, saved as the
  // tenant goes through the save route the page always used; it ends on the card filled in with the
  // next step offered; it opens again from the card, and Leave setup keeps what is typed.
  { name: 'tenant profile, the first run, the name', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    p.__saves = []; p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/tenant\/profile$/.test(r.url())) p.__saves.push(JSON.parse(r.postData() || '{}')); });
    await tenantSetup(p, f, 'who=41&facts=none&consent=0');
  }, steps: async function* (p) {
    const answer = async (fields, then, next) => {
      for (const [field, value] of fields) await p.locator(`[data-run-screen] [data-field="${field}"]`).fill(value);
      await p.locator(then).click(); await p.locator(`[data-run-screen="${next}"], [data-run-end]`).first().waitFor({ timeout: 15000 }); await wait(p, 300);
    };
    await answer([['fullName', 'Maximiliano Castellanos Ruiz']], '[data-run-continue]', 'move'); yield 'tenant profile, the first run, when to move in';
    await answer([['moveInDate', '2026-12-01']], '[data-run-continue]', 'household'); yield 'tenant profile, the first run, the household';
    await answer([['numberOfOccupants', '2']], '[data-run-continue]', 'work'); yield 'tenant profile, the first run, the work';
    await answer([['jobTitle', 'Senior Clinical Operations Coordinator'], ['employer', 'Northwind Pediatric Rehabilitation Clinic Inc.']], '[data-run-continue]', 'income'); yield 'tenant profile, the first run, the income';
    await answer([['annualIncome', '118000']], '[data-run-continue]', 'phone'); yield 'tenant profile, the first run, the phone';
    await answer([], '[data-run-skip]', 'landlord'); yield 'tenant profile, the first run, the landlord';
    await answer([['previousLandlordName', 'Harbourfront Holdings Ltd.'], ['prevLandlordEmail', 'leasing@harbourfrontholdings.ca']], '[data-run-continue]', 'end');
    await p.locator('[data-run-end] [data-profile-card] [data-marks]').waitFor({ timeout: 15000 }); await p.locator('[data-run-next]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const facts = await p.evaluate(async () => (await (await fetch('/api/tenant/profile')).json()).facts);
    const saved = p.__saves.map((x) => x.action);
    if (saved.length !== 6 || saved.some((a) => a !== 'update-facts')) throw new Error(`the first run saved ${JSON.stringify(saved)}: one update-facts a screen answered`);
    const got = { fullName: facts.fullName, moveInDate: facts.moveInDate, numberOfOccupants: facts.numberOfOccupants, jobTitle: facts.jobTitle, annualIncome: facts.annualIncome, phone: facts.phone, previousLandlordName: facts.previousLandlordName };
    if (JSON.stringify(got) !== JSON.stringify({ fullName: 'Maximiliano Castellanos Ruiz', moveInDate: '2026-12-01', numberOfOccupants: '2', jobTitle: 'Senior Clinical Operations Coordinator', annualIncome: '118000', phone: '', previousLandlordName: 'Harbourfront Holdings Ltd.' })) throw new Error(`the first run saved ${JSON.stringify(got)}`);
    yield 'tenant profile, the first run, the card at the end';
    // To the full page; open again from the card; a change typed and left is kept.
    await p.locator('[data-run-finish]').click(); await p.locator('[data-setup-reopen]').waitFor({ timeout: 15000 });
    await p.locator('[data-setup-reopen]').click(); await p.locator('[data-run-screen="name"]').waitFor({ timeout: 15000 });
    await p.locator('[data-run-screen] [data-field="fullName"]').fill('Maximiliano Castellanos');
    await p.locator('[data-run-leave]').click(); await p.locator('[data-profile-card]').waitFor({ timeout: 15000 }); await wait(p, 400);
    const name = (await p.locator('[data-profile-name]').textContent()).trim();
    const stored = await p.evaluate(async () => (await (await fetch('/api/tenant/profile')).json()).facts.fullName);
    if (name !== 'Maximiliano Castellanos' || stored !== name) throw new Error(`Leave setup kept ${JSON.stringify({ name, stored })}`);
  } },
  // The writing helper (components/tenant/ProfilePersonal.js): its own card at the top of About me;
  // with About me empty the three questions, one at a time, then a suggestion made from them alone
  // with Use this and Keep mine. Write about me opens it from the progress panel, the phone's sheet
  // and the card's mark; used and saved, its mark fills and the count moves on.
  { name: 'tenant profile, the writing helper, About me empty', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantProfile(p, f, 'who=42&facts=full&docs=1');
    await p.locator('[data-about-helper="start"] [data-about-help-start]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const helper = await p.locator('[data-about-helper]').evaluate((el) => { const box = el.closest('[data-about]'); return { first: box.querySelector('[data-about-helper]') === el, aboveBox: !!(el.compareDocumentPosition(box.querySelector('#pp-about')) & Node.DOCUMENT_POSITION_FOLLOWING), button: el.querySelector('button.mp-btn') && el.querySelector('button.mp-btn').textContent.trim(), lines: [...el.querySelectorAll('p')].map((x) => x.textContent.trim()) }; });
    if (!helper.aboveBox || helper.button !== 'Help me write this' || helper.lines.length !== 2 || !/any language/i.test(helper.lines[1])) throw new Error(`the helper's card: ${JSON.stringify(helper)}`);
    // Write about me opens the helper itself: from the panel at 1440, from the sheet on a phone, from the card's mark.
    const opened = async (how) => { await p.locator('[data-about-guide="0"]').waitFor({ timeout: 15000 }); await wait(p, 300); const ok = await p.evaluate(() => document.activeElement && document.activeElement.dataset.guideAnswer === '0'); if (!ok) throw new Error(`${how}: the first question is not focused`); await p.locator('[data-guide-back]').click(); await p.locator('[data-about-helper="start"]').waitFor({ timeout: 15000 }); };
    await p.setViewportSize({ width: 1440, height: 900 }); await wait(p, 300);
    await p.locator('.tp-aside [data-strength-step="about"] button').click(); await opened('the progress panel');
    await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 300);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.locator('[data-strength-bar]').click(); await p.locator('[data-strength-sheet] [data-strength-step="about"] button').waitFor({ timeout: 15000 }); await wait(p, 400);
    await p.locator('[data-strength-sheet] [data-strength-step="about"] button').click(); await p.locator('[data-strength-sheet]').waitFor({ state: 'detached', timeout: 15000 }); await opened('the phone\'s sheet');
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.locator('[data-mark="about"]').click(); await opened('the card\'s mark');
  }, steps: async function* (p) {
    await p.locator('[data-about-help-start]').click(); await p.locator('[data-about-guide="0"]').waitFor({ timeout: 15000 });
    await p.locator('[data-guide-answer="0"]').fill('I coordinate operations at a children’s clinic'); await p.locator('[data-guide-next]').click(); await p.locator('[data-about-guide="1"]').waitFor({ timeout: 15000 }); await wait(p, 300);
    yield 'tenant profile, the writing helper, mid questions';
    await p.locator('[data-guide-answer="1"]').fill('a quiet street near the lake and my work'); await p.locator('[data-guide-next]').click(); await p.locator('[data-about-guide="2"]').waitFor({ timeout: 15000 });
    await p.locator('[data-guide-answer="2"]').fill('i cook, read and go to bed early'); await p.locator('[data-guide-write]').click();
    await p.locator('[data-about-suggestion]').waitFor({ timeout: 30000 }); await wait(p, 400);
    const text = await p.locator('[data-about-suggested]').innerText();
    const words = (t) => t.toLowerCase().match(/[\p{L}’']+|\d+/gu) || [];
    const said = new Set(words('I coordinate operations at a children’s clinic a quiet street near the lake and my work i cook, read and go to bed early'));
    if (words(text).filter((x) => !said.has(x)).length) throw new Error(`the suggestion adds to the answers: ${text}`);
    yield 'tenant profile, the writing helper, a suggestion';
    // Used and saved: About me is added, its mark fills (no motion under reduced motion) and the count moves on.
    const before = (await p.locator('[data-strength-bar] [data-strength-count] .tp-num').innerText()).trim();
    await p.locator('[data-about-accept]').click(); await p.locator('[data-about-save]').click();
    await p.locator('[data-mark="about"][data-done="yes"]').waitFor({ timeout: 15000 });
    const after = await p.evaluate(() => ({ count: document.querySelector('[data-strength-bar] [data-strength-count] .tp-num').textContent.trim(), fresh: !!document.querySelector('[data-mark="about"] .tp-mark.tp-fresh'), animation: getComputedStyle(document.querySelector('[data-mark="about"] .tp-mark')).animationName }));
    if (Number(after.count) !== Number(before) + 1 || !after.fresh || after.animation !== 'none') throw new Error(`after About me was saved: ${JSON.stringify({ before, ...after })}`);
  } },
  // Each upload says who can open it and when it is deleted, right beside it, from the periods
  // lib/tenantVaultRules.js holds; then a pay stub added, read, and its slot filled.
  { name: 'tenant profile, an upload and who can open it', kind: 'tenant', phase: 'alone', widths: WIDE, go: async (p, f) => {
    await tenantProfile(p, f, 'who=43&facts=full&docs=id');
    await p.locator('[data-vault-add-kind="income"]').waitFor({ timeout: 15000 }); await wait(p, 300);
    const { ID_DAYS, DOCUMENT_DAYS, IDLE_MONTHS } = await import('../../lib/tenantVaultRules.js');
    const kept = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-kept]')].map((el) => [el.dataset.kept, { text: el.textContent.replace(/\s+/g, ' ').trim(), beside: !!(el.closest('[data-vault-slot]') || el.closest('[data-photo]')).querySelector('button') }])));
    const want = { photo: `${IDLE_MONTHS} months`, id: `${ID_DAYS} days`, income: `${DOCUMENT_DAYS} days`, employment: `${DOCUMENT_DAYS} days` };
    for (const [k, period] of Object.entries(want)) if (!kept[k] || !kept[k].text.includes(period) || !kept[k].beside) throw new Error(`the line beside ${k}: ${JSON.stringify(kept[k])}`);
    if (kept.id.text !== `No realtor can open the ID you add here, even one you share your profile with. It is deleted ${ID_DAYS} days after you add it.` || /verified|checked|confirmed/i.test(Object.values(kept).map((x) => x.text).join(' '))) throw new Error(`the lines: ${JSON.stringify(kept)}`);
  }, steps: async function* (p) {
    await p.locator('[data-vault-documents] input[type=file]').setInputFiles({ name: 'paystub.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 a pay stub') });
    await p.locator('[data-vault-slot="income"][data-held="yes"]').waitFor({ timeout: 30000 }); await wait(p, 400);
    const slot = (await p.locator('[data-vault-slot="income"]').innerText()).replace(/\s+/g, ' ');
    if (!/Income read from your document/.test(slot) || !/Realtors you share with can open it/.test(slot)) throw new Error(`the income slot after the upload: ${slot}`);
    yield 'tenant profile, a document added, who can open it';
  } },
  // ── landlord ──
  { name: 'landlord report', kind: 'landlord', phase: 'write', go: async (p) => { const t = await report(p); await open(p, `/r/${t}`); }, steps: async function* (p) { await tap(p, /meet/i); await wait(p, 400); yield 'landlord report, answered'; await tap(p, /Tap to change/); yield 'landlord report, changing an answer'; } },
  // The sandbox's first applicant is verified: the line under the Fit lines says what that means.
  { name: 'landlord report, sandbox', kind: 'landlord', widths: [390, 320, 1440, 1920], go: async (p) => { await open(p, '/r/demo-demo-carlaw'); await p.locator('[data-verified-meaning]').first().waitFor({ timeout: 30000 }); } },
  // ── the founder office: the Commitment section first, and the poster ──
  { name: 'office, the commitment counted', kind: 'office', phase: 'write', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await office(p); await open(p, '/admin'); await p.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await p.locator('.cm-svg').waitFor({ timeout: 15000 }); await wait(p, 400); } },
  { name: 'office, the Lead Realtor Partner counted', kind: 'office', phase: 'write', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await f('/__fake/kpi?partner=1'); await office(p); await open(p, '/admin'); await p.locator('[data-partner-tile="active"]').waitFor({ timeout: 30000 }); await p.locator('[data-partner-start]:not([data-partner-start=""])').waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'office, brokerages to review', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/circle?seed=1&brokerage=sent'); try { await office(p); await open(p, '/admin/brokerages'); await p.locator('[data-brokerage-row]').first().waitFor({ timeout: 30000 }); } finally { await f('/__fake/circle?seed=0'); } } },
  { name: 'office, the commitment poster', kind: 'office', phase: 'write', go: async (p) => { await office(p); await open(p, '/admin/commitment'); await p.locator('[data-poster]').waitFor({ timeout: 30000 }); await wait(p, 400); } },
  { name: 'office, the Lead Realtor Partner with no start date', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/kpi?seed=1'); await f('/__fake/kpi?partner=1'); await f('/__fake/kpi?start=0'); try { await office(p); await open(p, '/admin'); await p.locator('[data-partner-start=""]').waitFor({ timeout: 30000 }); await wait(p, 400); } finally { await f('/__fake/kpi?start=1'); } } },
  { name: 'office, the commitment before its table exists', kind: 'office', phase: 'alone', go: async (p, f) => { await f('/__fake/kpi?history=0'); try { await office(p); await open(p, '/admin'); await p.locator('[data-tile="days"]').waitFor({ timeout: 30000 }); await wait(p, 400); } finally { await f('/__fake/kpi?history=1'); } } },
  // ── the send sheet (components/dashboard/SendReportSheet.js), part 6 ──
  // Every line at its longest: the long address, the landlord's long name and email, the long
  // signing name, the applicants' long names with their Fit words, the two buttons.
  { name: 'dashboard, the send sheet', kind: 'realtor', phase: 'alone', widths: SEND, go: (p, f) => sendSheet(p, f, { email: 'b.castellanos.whitfield@outlook.com', signature: LONG_SIGNATURE }), after: sendSheetBack },
  // The email and the signing name missing, each with its button; then the signing name's field.
  { name: 'dashboard, the send sheet, the email and the signing name missing', kind: 'realtor', phase: 'alone', widths: SEND, go: (p, f) => sendSheet(p, f, { email: null, signature: null }), steps: async function* (p) {
    await p.locator('[data-send-add-signature]').click(); await p.locator('[data-send-signature-field] input').waitFor({ timeout: 15000 }); await wait(p, 400);
    yield 'dashboard, the send sheet, the signing name field';
  }, after: sendSheetBack },
  // ── the listing page in two columns (components/dashboard/ListingView.js), part 6 ──
  // Three applicants (L4, /__fake/state?three=1): one column under 1280; from 1280 the header card
  // and the applicants at the left, the landlord card, Post kit and Details at the right; from 1440
  // each card one row across its column. At every width, then the first applicant open, then
  // Details open in the right column.
  { name: 'listing, three applicants', kind: 'realtor', phase: 'alone', widths: WIDE, go: async (p, f) => { await f('/__fake/state?three=1'); await open(p, '/listing/L4'); await p.locator('#applicant-J41').waitFor({ timeout: 30000 }); await wait(p, 300); }, steps: async function* (p) {
    await press(p, p.locator('#applicant-J41 [role=button][aria-controls$="-body"]')); await wait(p, 600);
    yield 'listing, three applicants, the first open';
    await press(p, p.getByRole('button', { name: /^Details/ }).first()); await wait(p, 600);
    yield 'listing, three applicants, Details open';
  }, after: (f) => f('/__fake/state?three=0') },
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
