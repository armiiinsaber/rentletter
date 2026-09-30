// Status facts are pills (components/ui.js StatusPills), never a dot line.
//   DotLine is gone: no file in pages, components or lib imports it, renders it or defines it, and
//   the tenant helpers that wrapped it (Dots, DotText) are gone too.
//   Every pill style reads at 4.5 or better against its own background, from the tokens the CSS
//   uses: ink on the paper pill, paper on the filled ink pill, paper on each ink surface that holds
//   the transparent pill.
//   No pill carries a transition or an animation, and no style rule anywhere animates a pill.
//   The installed app is portrait only: the manifest says so, and the overlay is on the app head.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); } else out.push(p); } return out; };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
// CSS with each template value (\${C.ink}) replaced, so a brace is always a CSS brace.
const css = (s) => s.replace(/\$\{[^{}]*\}/g, 'X');
const CODE = [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))].filter((p) => /\.(js|mjs)$/.test(p));

// WCAG 2 contrast between two opaque sRGB hex colours; a colour with alpha is laid over its backdrop.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

test('DotLine is imported, rendered or defined nowhere', () => {
  const hits = [];
  for (const p of CODE) {
    const s = readFileSync(p, 'utf8');
    if (/import\s*\{[^}]*\bDotLine\b[^}]*\}/.test(s)) hits.push(`${relative(ROOT, p)}: imports DotLine`);
    if (/<DotLine\b/.test(s)) hits.push(`${relative(ROOT, p)}: renders DotLine`);
    if (/export\s+(const|function)\s+DotLine\b/.test(s)) hits.push(`${relative(ROOT, p)}: defines DotLine`);
    if (/<(Dots|DotText)\b/.test(s) || /\bexport\s+(const|function)\s+(Dots|DotText)\b/.test(s)) hits.push(`${relative(ROOT, p)}: the old tenant dot helpers`);
    if (/className=["'`][^"'`]*\brl-dots?\b/.test(s)) hits.push(`${relative(ROOT, p)}: the old dot line classes`);
  }
  assert.deepEqual(hits, []);
  const ui = src('components/ui.js');
  assert.match(ui, /export const StatusPills = /);
  assert.doesNotMatch(ui, /\.rl-dots\b/, 'the dot line CSS is gone');
});

test('every pill reads at 4.5 or better on its own background', async () => {
  const { C } = await import('../components/theme.js');
  const ui = src('components/ui.js');
  // The three styles, as the CSS writes them.
  assert.match(ui, /\.rl-pill \{[^}]*border: 1px solid \$\{C\.rule\}; background: \$\{C\.paper\}; color: \$\{C\.ink\};/);
  assert.match(ui, /\.rl-pill\.rl-pill-action \{ background: \$\{C\.inst\}; border-color: \$\{C\.inst\}; color: \$\{C\.paper\}; \}/);
  assert.match(ui, /\.rl-pills\.rl-pills-ink \.rl-pill \{ background: transparent; border-color: rgba\(250, 248, 243, 0\.24\); color: \$\{C\.paper\}; \}/);
  assert.match(ui, /font-size: 14px; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums;/);
  assert.match(ui, /height: 28px; max-width: 100%; padding: 0 12px;\s*border-radius: 999px;/);
  // The transparent pill sits on the ink surfaces that use tone="ink": the Pipeline and welcome
  // cards (C.inst) and the tenant's applying banner (.mp-ink, C.ink).
  assert.match(src('components/dashboard/PeopleList.js'), /id="people"[^>]*background: C\.inst\b/);
  assert.match(src('components/dashboard/HomeView.js'), /className="dash-ink"[^>]*background: C\.inst\b/);
  assert.match(src('components/tenant/ProfileFacts.js'), /\.mp-ink \{ background: \$\{C\.ink\};/);
  const rows = [
    ['informational pill: ink on paper', C.ink, C.paper],
    ['action pill: paper on ink', C.paper, C.inst],
    ['pill on the Pipeline and welcome cards: paper on the ink card', C.paper, C.inst],
    ['pill on the applying banner: paper on ink', C.paper, C.ink],
  ];
  for (const [name, fg, bg] of rows) assert.ok(contrast(rgb(fg), rgb(bg)) >= 4.5, `${name}: ${contrast(rgb(fg), rgb(bg)).toFixed(2)}`);
  // The border at paper 24 percent is a decoration, not text; it still shows on the ink card.
  assert.ok(contrast(over(rgb(C.paper), 0.24, rgb(C.inst)), rgb(C.inst)) > 1.5);
  // No filled pill on an ink surface: StatusPills marks the action only in the paper tone.
  assert.match(ui, /const action = tone === 'paper' \? list\.findIndex\(\(x\) => x\.action\) : -1;/);
});

test('no pill has a transition or an animation, and nothing animates one', () => {
  const ui = css(src('components/ui.js'));
  const pill = ui.match(/\.rl-pill \{[^}]*\}/)[0];
  assert.match(pill, /opacity: 1; transition: none; animation: none;/);
  const offenders = [];
  for (const p of CODE) {
    const s = css(readFileSync(p, 'utf8'));
    for (const m of s.matchAll(/([^{}]*\.rl-pills?\b[^{}]*)\{([^}]*)\}/g)) {
      if (/(transition|animation)\s*:\s*(?!\s|none\b)/.test(m[2])) offenders.push(`${relative(ROOT, p)}: ${m[1].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
  // The pulse that faded the old dot line is on the bell's badge only.
  assert.deepEqual(CODE.filter((p) => /className=["'`{][^\n]*\brl-dot\b/.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p)), ['components/dashboard/AssistantBell.js']);
});

test('the installed app is portrait only, and the overlay rides on the app head', () => {
  const man = JSON.parse(src('public/manifest.webmanifest'));
  assert.equal(man.orientation, 'portrait');
  const app = src('components/AppHead.js');
  assert.match(app, /<UprightOverlay \/>/);
  const o = src('components/UprightOverlay.js');
  assert.match(o, /UPRIGHT_MEDIA = '\(orientation: landscape\) and \(max-height: 500px\)'/);
  assert.match(o, /@media \(display-mode: standalone\) and \$\{UPRIGHT_MEDIA\} \{ \.rl-upright \{ display: flex; \} \}/);
  assert.match(o, /html\.rl-standalone \.rl-upright \{ display: flex; \}/);
  assert.match(o, />Turn your phone upright\.</);
  assert.doesNotMatch(o, /<button|<a |onClick|transition: (?!none\b)|animation: (?!none\b)|@keyframes/, 'no buttons, no motion');
  // The admin install never carries the overlay; its manifest and icons stay byte for byte
  // (tests/brand.test.mjs, the admin install).
  assert.doesNotMatch(src('components/admin/AdminShell.js'), /AppHead|UprightOverlay/);
});
