// The tenant's profile page laid out to be filled in (pages/my-application.js,
// components/tenant/ProfileLayout.js, components/tenant/ProfileStrength.js): the done colour and
// where it may appear, the nine sections and their states, the strength panel over the numbers
// lib/profileStrength.js gives, unchanged, and the routes the page talks to, which are the ones it
// always used. The walks look at the page itself (tests/helpers/typesetStates.mjs, the tenant
// profile states at every width).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const { LIGHT: C, DARK } = await import('../components/theme.js');
const L = await import('../components/tenant/ProfileLayout.js');
const S = await import('../components/tenant/ProfileStrength.js');
const P = await import('../components/tenant/profileSteps.js');
const { profileStrength, STRENGTH_STEPS } = await import('../lib/profileStrength.js');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = (hex) => { const [r, g, b] = rgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn; let h = 0; if (c) { if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4; h *= 60; if (h < 0) h += 360; } return h; };

test('done is one calm colour: readable on the paper, the card and the deep paper, and not green', () => {
  // In both themes (components/theme.js LIGHT and DARK), at the same floors.
  for (const P of [C, DARK]) {
    for (const [bg, min] of [[P.paper, 6.1], [P.card, 6.5], [P.paperDeep, 5.6], [P.doneTint, 5.6]]) assert.ok(ratio(P.done, bg) >= min, `${P.done} on ${bg}: ${ratio(P.done, bg).toFixed(2)}`);
    // The card's colour on it, for the tick inside a done mark: white in light.
    assert.ok(ratio(P.card, P.done) >= 4.5);
    // A teal, outside the green range the house rule scans for (tests/noGreenAmber.test.mjs: 70 to 170).
    for (const hex of [P.done, P.doneTint]) { const h = hue(hex); assert.ok(h > 175 && h < 200, `${hex} hue ${h.toFixed(1)}`); }
  }
});

test('done is used for a done state and nothing else', () => {
  const uses = [];
  for (const dir of ['components/', 'pages/']) {
    const walk = (d) => { for (const e of readdirSync(new URL(d, ROOT), { withFileTypes: true })) { if (e.isDirectory()) walk(`${d}${e.name}/`); else if (/\.js$/.test(e.name)) src(`${d}${e.name}`).split('\n').forEach((line, i) => { if (/C\.done(?:Tint)?\b/.test(line) && !/^\s*\/\//.test(line)) uses.push({ where: `${d}${e.name}:${i + 1}`, line: line.trim() }); }); } };
    walk(dir);
  }
  // Exactly where: the section marks (the menu, the chips, the card's marks and the document
  // slots draw .tp-mark), the progress ticks and the checklist marks.
  assert.deepEqual(uses.map((u) => u.where.split(':')[0]).sort(), ['components/tenant/ProfileLayout.js', 'components/tenant/ProfileStrength.js', 'components/tenant/ProfileStrength.js'], JSON.stringify(uses));
  for (const u of uses) {
    assert.match(u.where, /^components\/tenant\/(ProfileLayout|ProfileStrength)\.js:/, `${u.where}: only the profile's state marks`);
    assert.match(u.line, /data-state='done'|data-done='yes'/, `${u.where}: a done rule (${u.line})`);
  }
  // Red stays the one main action: the apply button, once in each of its two places.
  const page = src('pages/my-application.js');
  assert.equal((page.match(/mp-btn-red/g) || []).length, 1, 'one red button in the markup, the apply box');
  assert.match(page, /<button type="submit" className="mp-btn mp-btn-red tp-apply-go">Open it with my profile<\/button>/);
  // At most one dark block: none of the page's own blocks is ink.
  assert.doesNotMatch(page, /className="mp-ink"/);
});

test('the nine sections, in the menu\'s order, each done, started or empty', () => {
  assert.deepEqual(L.SECTIONS.map((s) => s.label), ['Details', 'Employment and income', 'Contact', 'Rental history', 'References', 'Documents', 'About you', 'Who can see your profile', 'Your applications']);
  const none = L.sectionStates({ profile: { email: 'a@example.com', facts: null, applications: [] } });
  assert.deepEqual(none, { details: 'empty', employment: 'empty', contact: 'started', rental: 'empty', references: 'empty', documents: 'empty', about: 'empty', shares: 'empty', applications: 'empty' });
  const half = L.sectionStates({ profile: { email: 'a@example.com', facts: { fullName: 'A', phone: '4165550142', jobTitle: 'Nurse', employer: 'Clinic', moveInDate: '2026-12-01' }, applications: [] }, vault: { documents: [{ kind: 'id' }] }, personal: { photo: 'data:', about: null, prepayMonths: null }, shares: [] });
  assert.deepEqual(half, { details: 'started', employment: 'started', contact: 'done', rental: 'empty', references: 'empty', documents: 'started', about: 'started', shares: 'empty', applications: 'empty' });
  const full = L.sectionStates({ profile: { email: 'a@example.com', facts: { fullName: 'A', phone: '1', jobTitle: 'N', employer: 'C', annualIncome: '1', moveInDate: '2026-12-01', numberOfOccupants: '1', previousAddress: 'x', previousLandlordName: 'L', previousLandlordContact: 'l@x.ca', reference1Name: 'R', reference1Contact: 'r@x.ca' }, applications: [{}] }, vault: { documents: [{ kind: 'id' }, { kind: 'income' }, { kind: 'employment' }] }, personal: { photo: 'data:', about: 'Words', prepayMonths: null }, shares: [{ live: true }] });
  assert.ok(Object.values(full).every((s) => s === 'done'), JSON.stringify(full));
  assert.equal(L.factState('rental', { rentalStatus: 'none' }), 'done', 'no rental to list is an answer');
});

test('the progress panel shows lib/profileStrength.js as it is: the count, never a percent, the private line, the next step with what it changes for a realtor, and every step', () => {
  for (const input of [{}, { facts: { fullName: 'A', phone: '1', employer: 'C', jobTitle: 'N', annualIncome: '1' }, hasPhoto: true }, { facts: { fullName: 'A', phone: '1', employer: 'C', jobTitle: 'N', annualIncome: '1', previousLandlordName: 'L', previousLandlordContact: 'x' }, documentKinds: ['id', 'income', 'employment'], hasPhoto: true, hasAbout: true }]) {
    const s = profileStrength(input);
    const html = renderToStaticMarkup(React.createElement(S.StrengthPanel, { strength: s, onStep() {} })).replace(/ /g, ' ');
    assert.match(html, new RegExp(`data-strength-count=""[^>]*><span[^>]*>${s.done}</span><span class="tp-count-of"> of ${s.total} added</span>`), `${s.done} of ${s.total}`);
    assert.doesNotMatch(html.split('<style')[0], /\d\s*%|percent/i, 'no percent is shown');
    assert.ok(html.includes(S.PRIVATE_LINE), 'the line that says only the tenant sees it');
    assert.equal((html.match(/data-strength-step="/g) || []).length, s.steps.length, 'every step');
    for (const step of s.steps) assert.match(html, new RegExp(`data-strength-step="${step.key}" data-done="${step.done ? 'yes' : 'no'}"`));
    assert.equal((html.match(/<span data-done="yes"><\/span>/g) || []).length, s.done, 'a tick a done step');
    const next = S.nextStep(s);
    if (next) { assert.match(html, new RegExp(`data-strength-go="${next.key}"[^>]*>${next.title}</button>`)); assert.ok(html.includes(`data-strength-benefit="">${P.BENEFIT[next.key]}</p>`), `the benefit line of ${next.key}`); } else assert.ok(html.includes('Every step is done.'));
  }
  assert.equal(STRENGTH_STEPS.length, 8, 'the checklist that exists, unchanged');
  assert.equal(S.PRIVATE_LINE, 'Only you see this. It is never shown to a realtor or a landlord, and never used to score you.');
});

test('the page talks to the routes it always used, and nothing in it is new to a realtor', () => {
  const files = ['pages/my-application.js', ...readdirSync(new URL('components/tenant/', ROOT)).map((f) => `components/tenant/${f}`)];
  const routes = new Set();
  for (const f of files) for (const m of src(f).matchAll(/['"`](\/api\/[a-z0-9/_-]+)/gi)) routes.add(m[1]);
  // The same list as before this layout: the tenant routes, the party route (PartiesCard) and the
  // three upload routes (DocumentUploader).
  assert.deepEqual([...routes].sort(), ['/api/party/manage', '/api/tenant/export', '/api/tenant/personal', '/api/tenant/profile', '/api/tenant/request-link', '/api/tenant/shares', '/api/tenant/vault', '/api/upload/analyze-file', '/api/upload/finalize', '/api/upload/remove-file']);
  // The strength is read on the tenant's own page alone.
  // Nothing that writes to a share, a party or an upload reads it.
  for (const f of ['ProfileVault', 'ShareWithAgent', 'PartiesCard', 'DocumentUploader', 'ProfileFacts']) assert.doesNotMatch(src(`components/tenant/${f}.js`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /strength/i, f);
});
