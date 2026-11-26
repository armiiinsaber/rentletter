// Every styled-jsx style in the app has a name of its own. styled-jsx names each style at build time
// (the name the page's style registry keeps it under) and inserts a style only once per name: a
// second style under a name already on the page is taken for the first and never inserted, with no
// error. A style written inline is named from its own text; a style kept in a constant is named only
// when the constant is tagged with styled-jsx/css (css, css.global), whose tag the build compiles to
// the text and its name. A plain string constant carries no name, so every one of them came out
// under the same blank name, and on the dashboard the listing form's (components/listings/
// ListingSetupModal.js LF_CSS) mounted first and the send sheet's never loaded (found on
// fix/confirm-send-report). Here every file under components/ and pages/ that uses styled-jsx is
// compiled with Next's own SWC and its styled-jsx transform, as the build compiles it, and every
// style's name is read from what comes out: none may be blank, and no two different styles may share
// one, anywhere in the app (so none can on one page). The walk (tests/routes/shellWebkit.test.mjs)
// shows both constant styles loaded on one page in WebKit and in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');

// As next/dist/build/swc/options.js compiles a page or component: JSX, and styled-jsx always on.
const compile = async (source, filename) => (await swc.transform(source, { filename, sourceMaps: false, isModule: true, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'es6' }, styledJsx: {} })).code;

// ── Reading the compiled code: a string or template (its ${} included), a bracketed span ──
function stringEnd(code, i) {
  const q = code[i];
  for (let j = i + 1; j < code.length; j++) {
    const c = code[j];
    if (c === '\\') { j++; continue; }
    if (q === '`' && c === '$' && code[j + 1] === '{') { j = spanEnd(code, j + 1); continue; }
    if (c === q) return j;
  }
  return code.length;
}
function spanEnd(code, i) {
  let depth = 0;
  for (let j = i; j < code.length; j++) {
    const c = code[j];
    if (c === '"' || c === '\'' || c === '`') { j = stringEnd(code, j); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return j; }
  }
  return code.length;
}
// The top level properties of the object literal opening at i: { key: value text }.
function props(code, i) {
  const end = spanEnd(code, i); const out = {}; let depth = 0; let start = i + 1;
  const take = (to) => { const part = code.slice(start, to).trim(); const at = part.indexOf(':'); if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim(); };
  for (let j = i + 1; j < end; j++) {
    const c = code[j];
    if (c === '"' || c === '\'' || c === '`') { j = stringEnd(code, j); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { take(j); start = j + 1; }
  }
  take(end);
  return out;
}

// A constant's name and text in a compiled module: `X = new String(text); X.__hash = "name";`, the
// tag compiled away. Followed through an import to the module that defines it.
async function constantStyle(code, file, local, seen = new Set()) {
  const def = new RegExp(`\\b${local} = new String\\(`).exec(code);
  const named = new RegExp(`\\b${local}\\.__hash = "([^"]+)"`).exec(code);
  if (def || named) return { name: named ? named[1] : null, text: def ? code.slice(def.index + def[0].length, spanEnd(code, def.index + def[0].length - 1)) : null, from: file };
  const imp = [...code.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)].find((m) => new RegExp(`(^|[\\s{,])${local}([\\s},]|$)`).test(m[1].replace(/\b\w+ as /g, '')));
  if (!imp || !imp[2].startsWith('.')) return { name: null, text: null, from: file };
  const base = resolvePath(dirname(join(ROOT, file)), imp[2]);
  const target = ['', '.js', '/index.js'].map((x) => base + x).find((p) => existsSync(p) && !p.endsWith('/'));
  if (!target || seen.has(target)) return { name: null, text: null, from: file };
  seen.add(target);
  const isDefault = !imp[1].includes('{') || new RegExp(`default as ${local}\\b`).test(imp[1]);
  const named2 = (imp[1].match(new RegExp(`(\\w+) as ${local}\\b`)) || [])[1] || local;
  const other = await compile(readFileSync(target, 'utf8'), target);
  const exported = isDefault ? (other.match(/export default (\w+);/) || [])[1] : named2;
  return exported ? constantStyle(other, relative(ROOT, target), exported, seen) : { name: null, text: null, from: file };
}

// Every <style jsx> in one compiled module: { file, name, text, dynamic, constant }.
async function stylesOf(code, file) {
  const local = (code.match(/import (\w+) from "styled-jsx\/style";/) || [])[1];
  if (!local) return [];
  const out = [];
  for (const m of code.matchAll(new RegExp(`\\(${local},\\s*\\{`, 'g'))) {
    const p = props(code, m.index + m[0].length - 1);
    const id = p.id || '';
    if (/^"[^"]*"$/.test(id)) out.push({ file, name: id.slice(1, -1), text: p.children || '', dynamic: 'dynamic' in p, constant: null });
    else {
      const hash = /^(\w+)\.__hash$/.exec(id);
      const c = hash ? await constantStyle(code, file, hash[1]) : { name: null, text: null };
      out.push({ file, name: c.name, text: c.text != null ? c.text : (p.children || ''), dynamic: false, constant: hash ? hash[1] : id });
    }
  }
  return out;
}

// What is wrong with a set of styles: one line for each style with no name, and for each name two
// different styles share.
function problems(styles) {
  const out = [];
  for (const s of styles) if (!s.name) out.push(`${s.file}: the style ${s.constant || ''} has no name of its own (a plain string constant: tag it with css.global or css from styled-jsx/css)`);
  const byName = new Map();
  for (const s of styles) { if (!s.name) continue; const list = byName.get(s.name) || []; list.push(s); byName.set(s.name, list); }
  for (const [name, list] of byName) if (new Set(list.map((s) => s.text)).size > 1) out.push(`the name ${name} is shared by different styles in ${[...new Set(list.map((s) => s.file))].join(', ')}`);
  return out;
}

const own = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (`${dir}${e.name}/` === 'pages/api/' ? [] : own(`${dir}${e.name}/`)) : /\.js$/.test(e.name) ? [`${dir}${e.name}`] : []));

test('the check finds the trap: two plain string constants come out with no name and share it; tagged, each has its own', async () => {
  const plain = (n, color) => `const ${n}_CSS = \`.${n} { color: ${color}; }\`;\nexport default function ${n}() { return <div><style jsx global>{${n}_CSS}</style></div>; }\n`;
  const tagged = (n, color) => `import css from 'styled-jsx/css';\nconst ${n}_CSS = css.global\`.${n} { color: ${color}; }\`;\nexport default function ${n}() { return <div><style jsx global>{${n}_CSS}</style></div>; }\n`;
  const run = async (make) => (await Promise.all([['A', 'red'], ['B', 'blue']].map(async ([n, color]) => stylesOf(await compile(make(n, color), join(ROOT, `components/${n}.js`)), `components/${n}.js`)))).flat();
  const before = await run(plain);
  assert.equal(before.length, 2);
  assert.deepEqual(before.map((s) => s.name), [null, null], 'no name: the compiled id is the string\'s __hash, which a plain string does not have');
  assert.equal(problems(before).length, 2, problems(before).join('\n'));
  const after = await run(tagged);
  assert.ok(after.every((s) => /^[0-9a-f]{16}$/.test(s.name)) && after[0].name !== after[1].name, JSON.stringify(after));
  assert.deepEqual(problems(after), []);
  // The same text in two places is the same style, under the same name, inserted once: no problem.
  const twice = (await Promise.all(['A', 'B'].map(async (n) => stylesOf(await compile(`export default function ${n}() { return <div><style jsx global>{\`.same { color: red; }\`}</style></div>; }\n`, join(ROOT, `components/${n}.js`)), `components/${n}.js`)))).flat();
  assert.equal(twice[0].name, twice[1].name);
  assert.deepEqual(problems(twice), []);
});

test('every style in the app has a name of its own, and no two different styles share one', async () => {
  const files = [...own('components/'), ...own('pages/')].filter((f) => /<style\s+jsx\b|styled-jsx\/css/.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.ok(files.length >= 40, `the files that use styled-jsx (${files.length})`);
  const styles = (await Promise.all(files.map(async (f) => stylesOf(await compile(readFileSync(join(ROOT, f), 'utf8'), join(ROOT, f)), f)))).flat();
  const tags = files.reduce((n, f) => n + (readFileSync(join(ROOT, f), 'utf8').match(/<style\s+jsx\b/g) || []).length, 0);
  assert.equal(styles.length, tags, 'every <style jsx> read');
  assert.deepEqual(problems(styles), []);
  // The styles kept in a constant: each tagged, each named, each its own.
  const constants = styles.filter((s) => s.constant).map((s) => `${s.file} ${s.constant}`).sort();
  assert.deepEqual(constants, ['components/dashboard/SendReportSheet.js SRS_CSS', 'components/listings/ListingSetupModal.js LF_CSS']);
  for (const f of ['components/dashboard/SendReportSheet.js', 'components/listings/ListingSetupModal.js']) assert.match(readFileSync(join(ROOT, f), 'utf8'), /^import css from 'styled-jsx\/css';$/m, f);
});
