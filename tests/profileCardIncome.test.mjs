// The tenant's card agrees with itself (components/tenant/ProfileCard.js): the income fact is the
// income the tenant typed; with none typed and an income read from their document, the amount that
// was read with the page's own line for that source (lib/profileFacts.js sourceLine); with neither,
// Not added. And the line at the ID upload (components/tenant/ProfileVault.js KEPT.id) says the ID
// added here, its number of days from lib/tenantVaultRules.js. The walks open the card itself
// (tests/helpers/typesetStates.mjs: the tenant card with a read income).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const Card = await import('../components/tenant/ProfileCard.js');
const { KEPT } = await import('../components/tenant/ProfileVault.js');
const { ID_DAYS } = await import('../lib/tenantVaultRules.js');
const { sourceLine, SOURCE } = await import('../lib/profileFacts.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const income = (cents, readAt = '2026-11-10T16:00:00.000Z', id = 'c1') => ({ id, kind: 'income_annual_gross', value: { cents }, readAt, agreesWithTyped: null, documentHeld: true });
const vaultWith = (checks) => ({ enabled: true, available: true, consentAt: '2026-11-01T00:00:00.000Z', emailProved: true, documents: [{ id: 'd1', kind: 'income' }], checks });
const FACTS = { fullName: 'Maximiliano Castellanos Ruiz', jobTitle: 'Senior Clinical Operations Coordinator', employer: 'Northwind Pediatric Rehabilitation Clinic Inc.', moveInDate: '2026-12-01' };
const STEPS = ['photo', 'about', 'id', 'income', 'employment', 'reference'];
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/[\s ]+/g, ' ').trim();
function card(facts, vault, { done = ['income'] } = {}) {
  const strength = { steps: STEPS.map((key) => ({ key, title: key, done: done.includes(key) })) };
  const html = renderToStaticMarkup(React.createElement(Card.default, { profile: { applications: [] }, facts, strength, vault, photo: null, canEdit: true, onEdit() {}, onStep() {}, onSetup: null }));
  const tile = html.match(/<button type="button" class="([^"]*)" data-key-fact="annualIncome">([\s\S]*?)<\/button>/);
  assert.ok(tile, 'the income fact is on the card');
  const mark = html.match(/data-mark="income"[^>]*>([\s\S]*?)<\/button>/);
  return { cls: tile[1], tile: text(tile[2]), raw: tile[2], mark: mark ? text(mark[1]) : null };
}

test('an income read from a pay stub, none typed: the amount read, with the line that it was read from a document', () => {
  const c = card(FACTS, vaultWith([income(11800000)]));
  assert.equal(c.tile, 'Income before tax $118,000 a year Read from a document');
  assert.equal(sourceLine(SOURCE.DOCUMENT), 'Read from a document', 'the page\'s own words for that source');
  assert.match(c.raw, /<span class="tp-key-src" data-key-source="document">Read from a document<\/span>/);
  assert.match(c.cls, /\btp-key-read\b/);
  assert.doesNotMatch(c.tile, /Not added/, 'never Not added beside a mark that says the income was read');
  assert.equal(c.mark, 'Income read from your document');
});

test('a typed amount and a read one: the typed amount, with no source line', () => {
  const c = card({ ...FACTS, annualIncome: '95000' }, vaultWith([income(11800000)]));
  assert.equal(c.tile, 'Income before tax $95,000 a year');
  assert.doesNotMatch(c.raw, /tp-key-src|118,000/);
  assert.doesNotMatch(c.cls, /tp-key-read/);
});

test('neither typed nor read: Not added, no unit, no source line', () => {
  for (const vault of [null, vaultWith([]), vaultWith([{ id: 'x', kind: 'employer_name', value: { name: 'Northwind' }, readAt: '2026-11-10T16:00:00.000Z' }]), vaultWith([income(0)])]) {
    const c = card(FACTS, vault, { done: [] });
    assert.equal(c.tile, 'Income before tax Not added', JSON.stringify(vault && vault.checks));
    assert.doesNotMatch(c.raw, /tp-key-src/);
  }
});

test('the key facts read only what the page holds: the newest income read, the typed one first', () => {
  const k = (facts, vault) => Card.keyFacts(facts, vault)[0];
  assert.deepEqual(k({}, vaultWith([income(9000000, '2026-10-01T00:00:00.000Z', 'old'), income(11800000, '2026-11-10T16:00:00.000Z', 'new')])), { field: 'annualIncome', section: 'employment', label: 'Income before tax', value: '$118,000', unit: 'a year', source: 'Read from a document' });
  assert.deepEqual(k({ annualIncome: '118000' }, null), { field: 'annualIncome', section: 'employment', label: 'Income before tax', value: '$118,000', unit: 'a year', source: null });
  assert.equal(Card.readIncome(null), null); assert.equal(Card.readIncome({ checks: [income(11800049)] }), 118000);
  // The other three facts are as they were.
  assert.deepEqual(Card.keyFacts(FACTS, vaultWith([income(11800000)])).slice(1).map((x) => x.field), ['moveInDate', 'numberOfOccupants', 'yearsAtJob']);
  // The page hands the card the vault it already reads (components/tenant/ProfileVault.js useVault).
  assert.match(src('pages/my-application.js'), /<ProfileCard profile=\{profile\} facts=\{f\} strength=\{strength\} vault=\{vault\}/);
  assert.match(src('components/tenant/ProfileCard.js'), /\{keyFacts\(f, vault\)\.map\(\(k\) => \{/);
});

test('the line at the ID upload: the ID added here, its days from the constant', () => {
  assert.equal(KEPT.id, `No realtor can open the ID you add here, even one you share your profile with. It is deleted ${ID_DAYS} days after you add it.`);
  assert.match(src('components/tenant/ProfileVault.js'), /id: `No realtor can open the ID you add here, even one you share your profile with\. It is deleted \$\{ID_DAYS\} days after you add it\.`,/, 'the number comes from ID_DAYS');
  assert.doesNotMatch(src('components/tenant/ProfileVault.js'), /No realtor can open your ID, even one you share with/);
});
