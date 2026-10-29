// The old homepage slogan read as written by AI and is gone everywhere: no user facing string in
// pages, components or lib may carry "Handled by AI", "Approved by you" or "stays yours" again.
// Comments are stripped before the scan (they are not user facing, and the rule may be written down
// in them); the match ignores case and allows any spacing or a line break between the words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const BANNED = [/handled\s+by\s+ai\b/i, /approved\s+by\s+you\b/i, /stays\s+yours\b/i];
const TEXT = /\.(js|jsx|mjs|cjs|json|md|txt|html|css|svg)$/;

// Block comments become blank lines, so a hit keeps its real line number.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
  .replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const files = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    const p = `${dir}/${n}`;
    if (statSync(p).isDirectory()) walk(p); else if (TEXT.test(n)) files.push(p);
  }
};
for (const d of ['pages', 'components', 'lib']) walk(`${root}${d}`);

const hitsIn = (src) => {
  const code = stripComments(src); const hits = [];
  for (const re of BANNED) {
    const g = new RegExp(re.source, 'gi'); let m;
    while ((m = g.exec(code))) hits.push({ line: code.slice(0, m.index).split('\n').length, text: m[0].replace(/\s+/g, ' ') });
  }
  return hits;
};

test('the scan catches the old slogan in every form it took', () => {
  const old = [
    "{['Handled by AI.', 'Approved by you.'].map((line) => <span>{line}</span>)}",
    '<title>Rentletter: Handled by AI. Approved by you.</title>',
    'Every rental application, read and ranked. The decision stays yours.',
    '<h1>Approved by\n  you.</h1>',
  ];
  for (const s of old) assert.ok(hitsIn(s).length > 0, `missed: ${s}`);
  assert.deepEqual(hitsIn('// Handled by AI. Approved by you.\n/* stays yours */'), [], 'comments are not user facing');
});

test('no user facing string in pages, components or lib carries the old slogan', () => {
  assert.ok(files.length > 50, 'the walk found the source files');
  const hits = [];
  for (const f of files) for (const h of hitsIn(readFileSync(f, 'utf8'))) hits.push(`${f.replace(root, '')}:${h.line} "${h.text}"`);
  assert.deepEqual(hits, []);
});
