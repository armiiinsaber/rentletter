// Every realtor, tenant and landlord screen the sandbox opens, plus sign in and the public pages,
// and the two checks the zoom walk runs on each (tests/routes/zoomWebkit.test.mjs). go(page) takes
// a page whose context has baseURL set to the dev server.
export const APPLY = '/apply/demo0000000000000001';
const wait = (p, ms = 500) => p.waitForTimeout(ms);
const tapButton = async (p, re) => { const l = p.getByRole('button', { name: re }).first(); await l.scrollIntoViewIfNeeded(); await l.click(); await wait(p, 500); };
const openDetails = async (p) => { if (!(await p.getByRole('button', { name: /Delete listing/ }).count())) await tapButton(p, /^Details/); };
const openListing = async (p) => { await p.goto('/demo/dashboard?listing=demo-carlaw'); await wait(p, 1200); };
const expand = async (p, name) => { await p.locator('[role=button][aria-controls]').filter({ hasText: name }).first().click(); await wait(p, 700); };
const applyTo = async (p, step) => {
  await p.goto(APPLY, { waitUntil: 'networkidle' }); await p.getByLabel('Email').waitFor({ timeout: 20000 });
  const fill = [
    async () => { await p.getByLabel('Email').fill('priya@example.com'); },
    async () => { await p.getByLabel('Full name').fill('Priya Sharma'); await p.getByLabel('Date of birth').fill('1994-08-14'); await p.getByLabel('Phone').fill('4165550142'); },
    async () => { await p.getByLabel('Job title').fill('Nurse'); await p.getByLabel('Employer').fill('Northwind Clinic'); await p.getByLabel('Annual income before tax (CAD)').fill('90000'); },
    async () => {},
    async () => { await p.getByLabel('Desired move in date').fill('2026-11-01'); },
    async () => {}, async () => {},
  ];
  for (let i = 0; i < step - 1; i++) { await fill[i](); await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 300); }
};

export const SCREENS = [
  { name: 'sign in', kind: 'auth', go: (p) => p.goto('/signin') },
  { name: 'sign up', kind: 'auth', go: (p) => p.goto('/signup') },
  { name: 'forgot password', kind: 'auth', go: (p) => p.goto('/forgot-password') },
  { name: 'reset password', kind: 'auth', go: (p) => p.goto('/reset-password?token_hash=x&type=recovery') },
  { name: 'dashboard', kind: 'realtor', go: (p) => p.goto('/demo/dashboard') },
  { name: 'new listing modal', kind: 'realtor', go: async (p) => { await p.goto('/demo/dashboard'); await wait(p, 1200); await tapButton(p, /New listing|Add a listing|Create a listing/); } },
  { name: 'listing', kind: 'realtor', go: (p) => openListing(p) },
  { name: 'listing, details open', kind: 'realtor', go: async (p) => { await openListing(p); await openDetails(p); } },
  { name: 'listing, card expanded', kind: 'realtor', go: async (p) => { await openListing(p); await expand(p, 'David Kowalski'); } },
  { name: 'set aside sheet', kind: 'realtor', go: async (p) => { await openListing(p); await expand(p, 'David Kowalski'); await tapButton(p, /^Set aside$/); } },
  { name: 'rented sheet', kind: 'realtor', go: async (p) => { await openListing(p); await openDetails(p); await tapButton(p, /Mark as rented/); } },
  { name: 'compare', kind: 'realtor', go: async (p) => { await openListing(p); await tapButton(p, /^Compare$/); } },
  { name: 'profile', kind: 'realtor', go: (p) => p.goto('/demo/dashboard?profile=1') },
  { name: 'demo landing', kind: 'realtor', go: (p) => p.goto('/demo') },
  { name: 'apply landing', kind: 'tenant', go: (p) => p.goto(APPLY) },
  { name: 'apply step 6', kind: 'tenant', go: (p) => applyTo(p, 6) },
  { name: 'apply review', kind: 'tenant', go: (p) => applyTo(p, 8) },
  { name: 'apply done', kind: 'tenant', go: (p) => p.goto(`${APPLY}?preview=done`) },
  { name: 'apply rented', kind: 'tenant', go: (p) => p.goto('/apply/demo0000000000000009') },
  { name: 'my application sign in', kind: 'tenant', go: (p) => p.goto('/my-application') },
  { name: 'my application', kind: 'tenant', go: (p) => p.goto('/my-application/DEMO') },
  { name: 'keep', kind: 'tenant', go: (p) => p.goto('/keep/demo-token-0001') },
  { name: 'keep renew', kind: 'tenant', go: (p) => p.goto('/keep/demo-renew') },
  { name: 'upload', kind: 'tenant', go: (p) => p.goto('/upload/demo0000000000000000000000000000') },
  { name: 'landlord report', kind: 'landlord', go: (p) => p.goto('/r/demo-demo-carlaw') },
  { name: 'home', kind: 'public', go: (p) => p.goto('/') },
  { name: 'realtors', kind: 'public', go: (p) => p.goto('/realtors') },
  { name: 'landlord page', kind: 'public', go: (p) => p.goto('/landlord') },
  { name: 'faq', kind: 'public', go: (p) => p.goto('/faq') },
  { name: 'compliance', kind: 'public', go: (p) => p.goto('/compliance') },
  { name: 'privacy', kind: 'public', go: (p) => p.goto('/privacy') },
  { name: 'terms', kind: 'public', go: (p) => p.goto('/terms') },
];

// Run in the page. Every field under 16px, by computed size (hidden ones too: they show later).
export const SMALL_FIELDS = () => [...document.querySelectorAll('input, select, textarea')]
  .filter((el) => !/^(checkbox|radio|hidden|file|range|color|submit|button|image|reset)$/.test(el.type))
  .map((el) => ({ el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.name ? '[' + el.name + ']' : ''} "${el.getAttribute('aria-label') || el.placeholder || ''}"`, size: parseFloat(getComputedStyle(el).fontSize) }))
  .filter((f) => !(f.size >= 16));

// Run in the page. Lift the overflow masks on html, body and the Next root (components/ui.js), so
// a cause they would hide still counts, then read the page width and every element that sticks
// out of the viewport: past its edge while its parent is not (where it starts), whether or not a
// container clips it (cut off content counts), outside a horizontal scroller and a visually hidden
// element (clip, the route announcer).
export const WIDER_THAN_VIEWPORT = () => {
  const iw = window.innerWidth;
  const asIs = document.documentElement.scrollWidth;
  const lift = document.createElement('style'); lift.textContent = 'html, body, #__next { overflow-x: visible !important; }'; document.head.appendChild(lift);
  const lifted = document.documentElement.scrollWidth;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const hidden = (el) => { const cs = getComputedStyle(el); return (cs.clip && cs.clip !== 'auto') || /inset\((50|100)%/.test(cs.clipPath || ''); };
  const scroller = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const x = getComputedStyle(a).overflowX; if (x === 'auto' || x === 'scroll') return true; } return false; };
  const past = (el) => { const r = el.getBoundingClientRect(); return r.right > iw + 0.5 || r.left < -0.5 || r.width > iw + 0.5; };
  const desc = (el) => { const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || hidden(el) || scroller(el) || getComputedStyle(el).position === 'fixed' || !past(el)) continue;
    const par = el.parentElement; if (par && par !== document.body && vis(par) && !hidden(par) && past(par)) continue;
    const r = el.getBoundingClientRect(); out.push({ el: desc(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }
  lift.remove();
  return { iw, asIs, lifted, scale: window.visualViewport ? window.visualViewport.scale : 1, metas: [...document.querySelectorAll('meta[name=viewport]')].map((m) => m.content), out: out.slice(0, 8) };
};
export const VIEWPORT_META = 'width=device-width, initial-scale=1, viewport-fit=cover';
