// The new listing form (components/listings/ListingSetupModal.js): it saves exactly what it saved
// before, every field it collects is still there with the right type, inputmode and autocomplete
// and a label above it, the rent is formatted as typed, the move in chips are dated, the errors are
// plain words, and the draft lives in this browser only and survives a storage that throws. The
// browser walk (tests/routes/listingsDeskWebkit.test.mjs) drives the steps, the panel and the keyboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const F = await import('../components/listings/ListingSetupModal.js');
const { BOARD_FIELDS } = await import('../lib/boardDetails.js');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const src = readFileSync(new URL('../components/listings/ListingSetupModal.js', import.meta.url), 'utf8');

test('it saves exactly what it saved: every field, the same shape', () => {
  const form = { ...F.EMPTY_LISTING_FORM, address: ' 88 Bay Street ', unit: ' 4B ', monthly_rent: '2400', bedrooms: '2', allows_pets: 'yes', allows_smoking: 'outdoor', parking_included: 'yes', landlord_name: ' Pat Owner ', landlord_email: ' Owner@Email.com ', landlord_phone: '416 555 0199', pref_rent_to_income_max_pct: '35', pref_notes: ' Quiet building ', mls_number: 'C1234567', possession_date: '2026-12-01', lease_term_months: '12', utilities_heat: 'yes', utilities_hydro: 'no', utilities_water: '', furnished: 'no', parking_spaces: '1', locker: 'B12', deposit_last_month: '2400', deposit_key: '50' };
  const p = F.listingPayload(form, { askProvince: true, province: 'ON', depositProvince: 'ON' });
  assert.equal(p.province, 'ON', 'the province rides along for the profile, once');
  assert.deepEqual({ name: p.name, address: p.address, unit: p.unit, monthly_rent: p.monthly_rent, bedrooms: p.bedrooms, allows_pets: p.allows_pets, allows_smoking: p.allows_smoking, parking_included: p.parking_included, landlord_name: p.landlord_name, landlord_email: p.landlord_email, landlord_phone: p.landlord_phone, pref_notes: p.pref_notes },
    { name: '88 Bay Street', address: '88 Bay Street', unit: '4B', monthly_rent: 2400, bedrooms: '2', allows_pets: 'yes', allows_smoking: 'outdoor', parking_included: 'yes', landlord_name: 'Pat Owner', landlord_email: 'owner@email.com', landlord_phone: '416 555 0199', pref_notes: 'Quiet building' });
  assert.equal(p.pref_rent_to_income_max_pct, 35);
  for (const k of ['pref_requires_landlord_reference', 'pref_requires_employer_verification', 'pref_ask_credit_report', 'pref_guarantor_accepted']) assert.equal(typeof p[k], 'boolean', k);
  assert.equal(p.possession_date, '2026-12-01'); assert.equal(p.lease_term_months, 12); assert.equal(p.utilities_heat, true); assert.equal(p.utilities_hydro, false); assert.equal(p.utilities_water, null); assert.equal(p.furnished, false);
  assert.equal(p.deposit_last_month, 2400); assert.equal(p.deposit_key, 50);
  for (const k of BOARD_FIELDS) assert.ok(k in p || /deposit_(security|pet)/.test(k), `${k} is written (BC deposits only in BC)`);
  assert.equal(F.listingPayload({ ...F.EMPTY_LISTING_FORM, address: 'x' }).province, undefined, 'no province unless asked');
  // The component saves through it and nothing else.
  assert.match(src, /const buildPayload = \(\) => listingPayload\(form, \{ askProvince, province, depositProvince \}\);/);
  assert.match(src, /const req = \{\n    address:/, 'the required set is unchanged');
});

test('every field a label above it, the right type, inputmode and autocomplete, one column', () => {
  const html = renderToStaticMarkup(React.createElement(F.default, { mode: 'edit', inline: true, initial: { address: '88 Bay Street', monthly_rent: 2400, bedrooms: '2' }, onSave: () => {}, onCancel: () => {} }));
  const input = (id) => (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
  for (const [id, type, mode, auto] of [['lf-address', 'text', 'text', 'street-address'], ['lf-unit', 'text', 'text', 'address-line2'], ['lf-rent', 'text', 'numeric', 'off'], ['lf-landlord-name', 'text', 'text', 'off'], ['lf-landlord-email', 'email', 'email', 'off'], ['lf-landlord-phone', 'tel', 'tel', 'off'], ['lf-cap', 'number', 'numeric', 'off']]) {
    const el = input(id); assert.ok(el, id);
    assert.match(el, new RegExp(`type="${type}"`), `${id} type`); assert.match(el, new RegExp(`inputMode="${mode}"`), `${id} inputmode`); assert.match(el, new RegExp(`autoComplete="${auto}"`), `${id} autocomplete`);
    // The field is its label: the words first, then the control, inside it (the whole field is the target).
    const field = (html.match(new RegExp(`<label class="lf-field" for="${id}">([\\s\\S]*?)</label>`)) || [])[1] || '';
    assert.match(field, /^<span id="[^"]+-label" class="lf-label">/, `${id}: its words come first`);
    assert.ok(field.indexOf('lf-label') < field.indexOf(`id="${id}"`), `${id}: the words are above the control`);
  }
  assert.match(input('lf-rent'), /value="2,400"/, 'the rent formatted');
  assert.match(html, /role="radiogroup" aria-labelledby="lf-beds-label"/, 'bedrooms are chips');
  assert.doesNotMatch(html, /<select[^>]*id="lf-beds/, 'never a dropdown for the bedrooms');
  assert.match(html, /aria-controls="listing-board-details"/); assert.match(html, /Board details \(optional\)/);
  assert.match(src, /\.lf-cols \{ display: grid; grid-template-columns: minmax\(0, 568px\) minmax\(0, 1fr\); \}/, 'the desktop form column about 520px with its padding');
});

test('the rent, the move in chips and the words', () => {
  assert.equal(F.formatRent('2400'), '2,400'); assert.equal(F.formatRent('$2,4a00'), '2,400'); assert.equal(F.formatRent(''), '');
  const c = F.moveInChoices(new Date(2026, 10, 21, 15));
  assert.deepEqual(c.map((x) => [x.label, x.value]), [['Now', '2026-11-21'], ['Dec 1', '2026-12-01'], ['Jan 1', '2027-01-01']]);
  for (const w of [...Object.values(F.FIELD_ERRORS), ...F.STEPS.map((s) => s.title)]) assert.doesNotMatch(w, /[—–]| - /, w);
  assert.deepEqual(F.STEPS.map((s) => s.key), ['where', 'basics', 'landlord'], 'address first, then the rent and the basics, then the landlord');
});

test('the draft: this browser only, cleared on save, and a storage that throws breaks nothing', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  try {
    F.writeListingDraft('k', { form: { address: '7 Walk St' }, step: 1 });
    assert.deepEqual(F.readListingDraft('k'), { form: { address: '7 Walk St' }, step: 1 });
    F.clearListingDraft('k'); assert.equal(F.readListingDraft('k'), null);
    store.set('k', '{not json'); assert.equal(F.readListingDraft('k'), null, 'a broken draft reads as none');
    globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } };
    assert.equal(F.readListingDraft('k'), null); F.writeListingDraft('k', { form: {} }); F.clearListingDraft('k');
  } finally { delete globalThis.window; }
  assert.match(src, /clearListingDraft/); assert.doesNotMatch(src, /fetch\(|sessionStorage|document\.cookie/, 'the draft never leaves the browser');
  assert.match(readFileSync(new URL('../components/dashboard/HomeView.js', import.meta.url), 'utf8'), /clearListingDraft\(draftKey\);/, 'cleared on save');
});

test('no address service: no vendor, no key, no network call', () => {
  assert.doesNotMatch(src, /maps\.googleapis|places|mapbox|addresscomplete|canadapost|loqate|api_key|apiKey/i);
});
