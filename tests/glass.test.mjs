// The glass (components/ui.js .rl-glass): one surface, defined once, on the floating layer only.
//   · Defined once: the fill, the blur, the edge and the highlight live in components/ui.js and
//     nowhere else on the realtor, tenant and public pages.
//   · Only on what floats: the tenant's top bar, the phone's strength bar and chips, the bulk bar,
//     the shared sticky header, the area behind a sheet and a sheet's own header, the notification
//     panel's header, the toasts. Never on a card, a button, a field or a table.
//   · Text on it keeps 4.5 to 1 over black and over white: ink and inkSoft on the paper tone, paper
//     and instText on the ink tone; inkMute would not, so it is never set on glass.
//   · The change from solid to glass animates opacity alone, inside the reduced motion query, and
//     reduced transparency and a browser without backdrop-filter get the solid surface.
// The walk (tests/routes/onePlaceWebkit.test.mjs) checks the same on the pages, in both engines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ui = read('components/ui.js');
const theme = read('components/theme.js');
const hex = (name) => { const m = theme.match(new RegExp(`\\b${name}: '#([0-9a-f]{6})'`, 'i')); assert.ok(m, name); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = L(a); const y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (top, a, under) => top.map((c, i) => c * a + under[i] * (1 - a));
const tone = (sel, name) => { const m = ui.match(new RegExp(`${sel}[^{]*\\{[^}]*--glass-bg: rgba\\((\\d+), (\\d+), (\\d+), ([\\d.]+)\\)`)); assert.ok(m, name); return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) }; };
const files = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.js$/.test(f) ? [p] : []; });
const PAGES = [...files('components'), ...files('pages')].filter((p) => !/^pages\/api\//.test(p) && !/admin/.test(p));

test('text on glass keeps 4.5 to 1 over anything that can pass under it', () => {
  const paper = tone(':root', 'the paper tone'); const ink = tone('\\.rl-glass\\.rl-glass-ink', 'the ink tone');
  const black = [0, 0, 0]; const white = [255, 255, 255];
  for (const name of ['ink', 'inkSoft']) {
    for (const under of [black, white]) assert.ok(ratio(hex(name), over(paper.rgb, paper.a, under)) >= 4.5, `${name} on the paper glass over ${under[0] ? 'white' : 'black'}`);
  }
  for (const name of ['paper', 'instText']) {
    for (const under of [black, white]) assert.ok(ratio(hex(name), over(ink.rgb, ink.a, under)) >= 4.5, `${name} on the ink glass over ${under[0] ? 'white' : 'black'}`);
  }
  assert.ok(ratio(hex('inkMute'), over(paper.rgb, paper.a, black)) < 4.5, 'inkMute would not hold over black: it stays off glass');
});

test('defined once, in components/ui.js, and only on what floats', () => {
  for (const p of PAGES) {
    if (p === 'components/ui.js') continue;
    const s = read(p);
    assert.doesNotMatch(s.replace(/backdrop-filter: none !important;/g, ''), /backdrop-filter:|backdropFilter/, `${p}: no blur of its own (the shared glass instead)`);
  }
  const uses = [];
  for (const p of PAGES) read(p).split('\n').forEach((line, i) => { if (/rl-glass\b(?!-)/.test(line) && !/^\s*(\/\/|\/\*|\*)/.test(line) && !/\.rl-glass/.test(line)) uses.push({ at: `${p}:${i + 1}`, line }); });
  assert.ok(uses.length >= 10, `the surfaces that wear it (${uses.length})`);
  for (const u of uses) {
    assert.doesNotMatch(u.line, /<(button|input|select|textarea|table|tr|td)\b|rl-card|ds-btn|mp-btn/, `${u.at}: never on a card, a button, a field or a table`);
    assert.match(u.line, /rl-tbar|tp-top|hv-bulk|rl-header|rl-sh-scrim|rl-sh-grab|al-head|mp-toast|lv-toast|position: 'fixed'|setToast/, `${u.at}: a floating surface`);
  }
});

test('solid to glass by opacity alone, instant under reduced motion; solid without the blur', () => {
  assert.match(ui, /@media \(prefers-reduced-motion: no-preference\) \{ \.rl-glass\.rl-glass-auto::before \{ transition: opacity \$\{DURATION\.base\}ms \$\{CURVE\.settle\}; \} \}/);
  const css = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media \(prefers-reduced-motion: no-preference\) \{ \.rl-glass\.rl-glass-auto::before \{[^}]*\} \}/, '');
  const moving = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.rl-glass/.test(m[1]) && /transition|animation/.test(m[2])).map((m) => m[1].trim());
  assert.deepEqual(moving, [], 'no other transition or animation on the glass');
  assert.match(ui, /@supports not \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\) \{ \.rl-glass \{ background-color: var\(--glass-solid\); \} \}/);
  assert.match(ui, /@media \(prefers-reduced-transparency: reduce\) \{ \.rl-glass, html\[data-scrolled\] \.rl-glass\.rl-glass-auto \{ background-color: var\(--glass-solid\); -webkit-backdrop-filter: none; backdrop-filter: none; \} \}/);
  // The page's scroll state comes from an IntersectionObserver on one probe, never a scroll listener.
  const hook = ui.slice(ui.indexOf('export function usePageScrolled'), ui.indexOf('// ─── SCROLL-SHRINK STICKY HEADER'));
  assert.match(hook, /new IntersectionObserver\(/); assert.doesNotMatch(hook, /addEventListener\('scroll'/);
});

test('the tenant bar is one component, on every tenant page that has a bar', () => {
  for (const p of ['pages/my-application.js', 'pages/my-application/[rl].js', 'pages/my-application/confirm.js', 'pages/apply/[token].js', 'pages/party/[token].js', 'pages/upload/[token].js', 'pages/refer/[token].js', 'pages/a/[code].js']) {
    const s = read(p);
    assert.match(s, /<TenantBar\b/, `${p} uses components/tenant/TenantBar.js`);
    assert.doesNotMatch(s, /<header\b/, `${p}: no header of its own`);
  }
  const bar = read('components/tenant/TenantBar.js');
  assert.match(bar, /className="rl-tbar rl-glass rl-glass-auto" data-tenant-bar="" data-stuck=""/);
  assert.match(bar, /export const TBAR_HEIGHT = 69;/, 'as tall as the header it replaced');
  assert.doesNotMatch(bar, /inkMute/, 'its label is never inkMute on glass');
});
