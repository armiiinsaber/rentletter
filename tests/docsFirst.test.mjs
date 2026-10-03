// The documents first prototype (components/mockups/DocsFirst.js), below the browser walk
// (tests/routes/docsFirstWebkit.test.mjs): the comparison strip counts the live form's real steps,
// the prototype lives on /admin/mockups alone, and its copy keeps the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const { FLOWS, READ_MS } = await import('../components/mockups/DocsFirst.js');

test('the strip counts the live form as it is', () => {
  const apply = src('pages/apply/[token].js');
  const steps = apply.slice(apply.indexOf('const STEPS = ['), apply.indexOf('];', apply.indexOf('const STEPS = [')));
  assert.equal((steps.match(/\{ id: '/g) || []).length, FLOWS.today.steps, 'today: the steps of pages/apply/[token].js');
  assert.equal(FLOWS.docs.steps, 3, 'documents first: documents, confirm, review');
  assert.ok(FLOWS.today.minutes > FLOWS.docs.minutes);
  assert.equal(READ_MS, 1200, 'reading is a 1.2 second state');
});

test('the prototype lives on the admin mockups page alone', () => {
  const walk = (dir, out = []) => { for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) { const p = join(dir, f.name); if (f.isDirectory()) walk(p, out); else if (/\.js$/.test(f.name)) out.push(p); } return out; };
  const users = [...walk('pages'), ...walk('components'), ...walk('lib')].filter((p) => /DocsFirst/.test(src(p)) && !/DocsFirst\.js$/.test(p));
  assert.deepEqual(users.sort(), ['components/mockups/scenes.js', 'pages/admin/mockups.js']);
});

test('the copy: no verified, no dash as punctuation, the real standing line', () => {
  const s = src('components/mockups/DocsFirst.js');
  const strings = [...s.matchAll(/(['`])((?:(?!\1).)*)\1|>([^<>{}]+)</g)].map((m) => m[2] || m[3] || '').filter((t) => /[a-z]/i.test(t));
  for (const t of strings) {
    assert.doesNotMatch(t, /\bverified\b/i, t);
    assert.doesNotMatch(t, /[–—]| - /, t);
  }
  assert.match(s, /TENANT_LINES\[APPLICATION_STATE\.SUBMITTED\]/, 'the submitted line from lib/applicantState.js');
  assert.match(s, /synthesisLine\(applicant\)/, 'the realtor card line from lib/applicantSynthesis.js');
});
