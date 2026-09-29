// Every input, select and textarea in pages/ and components/ is 16px or more. iOS Safari zooms the
// page when a field under 16px takes focus; Face ID autofill focuses the sign in field, and that
// zoom carried into the dashboard. Read from the source: each field's inline style (a literal, a
// named style object, a spread of one), then its class rule, then the global rule in
// components/ui.js. The WebKit walk (tests/routes/zoomWebkit.test.mjs) checks the computed size on
// every screen it opens; this scan also covers the fields no walk reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (f !== 'api') walk(p, out); } else if (/\.js$/.test(f)) out.push(p); } return out; };
const FILES = [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components'))];
const SKIP_TYPES = /type=["'](checkbox|radio|hidden|file|range|color)["']/;
const TOKENS = { 'var(--t-body)': 16, 'var(--t-body-2)': 14, 'var(--t-eyebrow)': 11 };

// The opening tag from `<input` to its end, braces balanced.
function openingTags(src) {
  const out = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    let i = m.index + m[0].length; let depth = 0; let q = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0) break;
    }
    out.push({ tag: m[1], text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}
// A size written as a number, a px string or a type token; null when not a literal size.
const sizeOf = (raw) => { const v = String(raw).trim().replace(/^['"]|['"]$/g, ''); if (TOKENS[v] != null) return TOKENS[v]; const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
// The object literal body of `const name = { ... }` in the file, balanced.
function objectBody(src, name) {
  const m = new RegExp(`(?:const|let|export const) ${name}\\s*=\\s*\\{`).exec(src); if (!m) return null;
  let i = m.index + m[0].length; let depth = 1;
  for (; i < src.length && depth; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; }
  return src.slice(m.index + m[0].length, i - 1);
}
const IMPORTED = { authInputStyle: 'components/auth/AuthShell.js' };
function fontSizeIn(body, src, seen = new Set()) {
  // the last fontSize written wins, after any spread before it
  let size = null;
  for (const part of body.matchAll(/\.\.\.(\w+)|fontSize:\s*([^,}\n]+)/g)) {
    if (part[1]) { const name = part[1]; if (seen.has(name)) continue; seen.add(name); const file = IMPORTED[name] ? readFileSync(join(ROOT, IMPORTED[name]), 'utf8') : src; const b = objectBody(file, name); if (b) { const s = fontSizeIn(b, file, seen); if (s != null) size = s; } }
    else size = sizeOf(part[2]);
  }
  return size;
}
// A class rule's font-size in any stylesheet string of the file or of the shared stylesheets.
const SHEETS = ['components/tenant/ProfileFacts.js', 'components/admin/AdminShell.js', 'components/ui.js'];
function classSize(cls, src) {
  for (const text of [src, ...SHEETS.map((f) => readFileSync(join(ROOT, f), 'utf8'))]) {
    const m = new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}\\s*\\{((?:\\$\\{[^}]*\\}|[^}])*)\\}`).exec(text); // a rule body may hold \${token} interpolations
    if (m) { const f = /font-size:\s*([^;]+);/.exec(m[1]); if (f) return sizeOf(f[1]); }
  }
  return null;
}

export function fieldSizes() {
  const rows = [];
  for (const p of FILES) {
    const src = readFileSync(p, 'utf8'); const rel = relative(ROOT, p);
    for (const t of openingTags(src)) {
      if (t.tag === 'input' && SKIP_TYPES.test(t.text)) continue;
      let size = null; let from = 'the global rule (components/ui.js)';
      const lit = /style=\{\{([\s\S]*)\}\}/.exec(t.text); const named = /style=\{(\w+)\}/.exec(t.text);
      if (lit) { const s = fontSizeIn(lit[1], src); if (s != null) { size = s; from = 'inline style'; } }
      else if (named) { const b = objectBody(src, named[1]) || (IMPORTED[named[1]] ? objectBody(readFileSync(join(ROOT, IMPORTED[named[1]]), 'utf8'), named[1]) : null); const s = b ? fontSizeIn(b, src) : null; if (s != null) { size = s; from = `style ${named[1]}`; } }
      if (size == null) { const cls = /className="([^"]+)"/.exec(t.text); for (const c of cls ? cls[1].split(/\s+/) : []) { const s = classSize(c, src); if (s != null) { size = s; from = `class .${c}`; } } }
      if (size == null) size = 16;
      rows.push({ where: `${rel}:${t.line}`, tag: t.tag, size, from });
    }
  }
  return rows;
}

test('the global rule sets every field to the body size, and the body size is 16px', () => {
  const ui = readFileSync(join(ROOT, 'components/ui.js'), 'utf8');
  assert.match(ui, /input, textarea, select \{ font-size: var\(--t-body\); \}/);
  assert.match(ui, /--t-body: 16px;/);
  assert.doesNotMatch(ui, /input:focus, textarea:focus, select:focus \{ outline: none; \}/, 'the rule that hid the focus ring is gone');
});

test('every input, select and textarea is 16px or more', () => {
  const rows = fieldSizes();
  console.log(`fields read: ${rows.length}\n${rows.map((r) => `  ${r.where} ${r.tag} ${r.size}px (${r.from})`).join('\n')}`);
  assert.ok(rows.length >= 70, `the scan found the fields (${rows.length})`);
  const small = rows.filter((r) => !(r.size >= 16));
  assert.deepEqual(small.map((r) => `${r.where} ${r.tag} ${r.size}px from ${r.from}`), []);
});

test('the scan reads the ways a field is sized, and catches a small one', () => {
  const tags = openingTags(`<input style={{ fontSize: 15 }} /><select style={{ ...base, fontSize: 'var(--t-body-2)' }}>x</select><textarea style={{ padding: 1 }} />`);
  assert.equal(tags.length, 3);
  assert.equal(fontSizeIn(/style=\{\{([\s\S]*)\}\}/.exec(tags[0].text)[1], ''), 15);
  assert.equal(fontSizeIn(/style=\{\{([\s\S]*)\}\}/.exec(tags[1].text)[1], 'const base = { fontSize: 18 };'), 14);
  assert.equal(fontSizeIn('...base', 'const base = { fontSize: 18 };'), 18);
  assert.equal(sizeOf("'var(--t-body)'"), 16);
});
