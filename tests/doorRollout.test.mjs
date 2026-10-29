// The door rolled out (components/brand/Loader.js, HomeDoor.js, AppStart.js), the arithmetic and the
// source:
//   1. No spinner and no "Loading" text remains in components or pages: no rotating keyframes, no
//      spinner classes, no "Loading" anywhere a person would read it (a Loader's accessible name is
//      the one place the word is kept), and no pending label (Saving..., Sending...) on a realtor,
//      tenant or landlord screen: a pending button shows the door instead.
//   2. Every Loader and every Pending is named for what is loading; a Loader renders role status
//      with that name, the same words inside for screen readers, the door hidden from assistive
//      technology, at 28px or more. A pending button keeps its resting label in place, unseen.
//   3. Every use goes through DoorMark: the homepage header (HomeDoor), the opening screen in the
//      frame (RouteFrame, ink in the admin app), held from sign in, the head script in
//      pages/_document.js.
//   4. No skeleton and no shimmer remains: the screens wait behind one door each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('../scripts/brand/jsxLoader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); } else if (/\.js$/.test(p)) out.push(p); } return out; };
const FILES = [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'pages'))].map((p) => relative(ROOT, p)).filter((p) => !p.startsWith('pages/api/')).sort();
// Code without its comments (a comment may say what it replaced).
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
// The admin tools, the product film and the marketing mockups are not realtor, tenant or landlord
// screens: their own work labels stay (they show no spinner and no Loading text either).
const PRODUCT = (p) => !/^(pages\/admin|components\/admin|components\/crm|components\/film|components\/mockups)/.test(p);

test('no spinner and no Loading text remains in components or pages', () => {
  const found = [];
  for (const f of FILES) {
    const c = code(src(f));
    if (/rotate\(\s*360deg\s*\)/.test(c)) found.push(`${f}: a rotating keyframe`);
    if (/@keyframes\s+[\w-]*spin/i.test(c) || /className=["'`{][^"'`}]*\b[\w-]*spin\b/i.test(c) || /\bspinner\b/i.test(c)) found.push(`${f}: a spinner`);
    for (const m of c.matchAll(/\bLoading\b/g)) {
      const before = c.slice(Math.max(0, m.index - 60), m.index);
      if (!/\blabel(?:=|:\s*)(?:"|'|`|\{`|\{')[^"`'}]*$/.test(before)) found.push(`${f}: "${c.slice(m.index, m.index + 40).split('\n')[0]}"`);
    }
    if (PRODUCT(f)) {
      for (const m of c.matchAll(/'[A-Z][a-z]+ing(?:…|\.\.\.)'|\?\s*'[A-Z][a-z]+ing'\s*:/g)) found.push(`${f}: pending label ${m[0]}`);
    }
  }
  assert.deepEqual(found, []);
});

test('no skeleton and no shimmer remains in components or pages', () => {
  // Code only: a comment may say what was replaced.
  const found = FILES.filter((f) => /skeleton|shimmer/i.test(code(src(f))));
  assert.deepEqual(found, []);
  // The screens wait behind the door, one reveal each (components/brand/Loader.js Reveal).
  assert.match(src('components/dashboard/HomeView.js'), /<Reveal ready=\{ready\} label="Loading your workspace"/);
  assert.match(src('components/dashboard/ListingView.js'), /<Reveal ready=\{applicantsLoaded\} label="Loading the listing"/);
  assert.match(src('components/nav/RouteLoader.js'), /<ScreenLoader label=\{f\.label\} \/>/);
});

// Each <Loader> and <Pending> tag, with its attributes, read with braces and quotes in mind.
function tags(text, name) {
  const out = []; const re = new RegExp(`<${name}\\b`, 'g'); let m;
  while ((m = re.exec(text))) {
    let i = m.index + name.length + 1; let depth = 0; let q = null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '{') depth++; else if (ch === '}') depth--; else if (ch === '>' && depth === 0) break;
    }
    out.push(text.slice(m.index, i + 1));
  }
  return out;
}

test('every Loader and Pending is named for what is loading', async () => {
  let loaders = 0; let pendings = 0; const unnamed = [];
  for (const f of FILES) {
    if (f === 'components/brand/Loader.js') continue;
    const c = code(src(f));
    for (const t of [...tags(c, 'Loader'), ...tags(c, 'ScreenLoader')]) { loaders++; if (!/\blabel=(?:"[^"]{3,}"|\{)/.test(t)) unnamed.push(`${f}: ${t}`); }
    for (const t of tags(c, 'Pending')) { pendings++; if (!/\blabel=(?:"[^"]{3,}"|\{)/.test(t)) unnamed.push(`${f}: ${t}`); }
  }
  assert.deepEqual(unnamed, []);
  assert.ok(loaders >= 14 && pendings >= 60, `${loaders} loaders and ${pendings} pending buttons`);
  // Rendered: role status, the name, the words inside, the door hidden, 28px or more.
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Loader, Pending, LOADER_MIN } = await import('../components/brand/Loader.js');
  assert.equal(LOADER_MIN, 28);
  const html = renderToStaticMarkup(React.createElement(Loader, { label: 'Loading your application', size: 12 }));
  assert.match(html, /^<span role="status" aria-label="Loading your application" data-loader="paper" style="[^"]*width:28px;height:28px/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/, 'the door itself is hidden from assistive technology');
  assert.match(html, />Loading your application<\/span><\/span>$/, 'the same words inside, for screen readers');
  for (const tone of ['paper', 'ink', 'red']) assert.match(renderToStaticMarkup(React.createElement(Loader, { label: 'x', tone })), new RegExp(`data-door="${tone}"`));
  const rest = renderToStaticMarkup(React.createElement(Pending, { busy: false, label: 'Sending' }, 'Send report'));
  const busy = renderToStaticMarkup(React.createElement(Pending, { busy: true, label: 'Sending' }, 'Send report'));
  assert.ok(rest.includes('>Send report<') && busy.includes('>Send report<'), 'the resting label stays in place while pending');
  assert.match(busy, /opacity:0/); assert.doesNotMatch(rest, /role="status"/); assert.match(busy, /role="status" aria-label="Sending"/);
});

test('every use goes through DoorMark: the header, app start, the head script', () => {
  assert.match(src('pages/index.js'), /<a href="\/" className="rl-mark" aria-label="Rentletter home"><HomeDoor \/><\/a>/);
  // The opening screen lives in the frame, so it outlives a navigation: paper, ink in the admin app.
  assert.match(src('components/nav/RouteFrame.js'), /<AppStart tone=\{\/\^\\\/admin\(\\\/\|\$\)\/\.test\(pathname \|\| ''\) \? 'ink' : 'paper'\} \/>/);
  assert.match(src('pages/signin.js'), /holdOpening\(\);\s*\n\s*router\.replace\(next\);/, 'sign in hands its door to the next screen');
  assert.match(src('pages/_document.js'), /<script dangerouslySetInnerHTML=\{\{ __html: APP_START_HEAD \}\} \/>/);
  for (const f of ['components/brand/Loader.js', 'components/brand/HomeDoor.js', 'components/brand/AppStart.js']) assert.match(src(f), /import DoorMark/);
  assert.doesNotMatch(src('components/AppHead.js'), /<AppStart/); assert.doesNotMatch(src('components/admin/AdminShell.js'), /<AppStart/);
  // No other file draws the door or the bar's swing itself.
  const drawers = FILES.filter((f) => /doorFrame|doorQuad|data-door-panel/.test(code(src(f))));
  assert.deepEqual(drawers, ['components/brand/DoorMark.js', 'components/brand/doorGeometry.js']);
});
