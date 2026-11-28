// What floats over the page on a phone holds its place on the screen at every moment
// (fix/phone-standalone). A transform, translate, scale, rotate, filter, backdrop filter,
// perspective, will-change, contain, container type or view transition name on any box around a
// fixed or sticky element makes that box the one the element is placed against, in place of the
// screen. In the installed app on an iPhone the tab bar then scrolled with the page and sat in the
// middle of the screen, after a sheet had scaled the page behind it.
//   FIXED (the phone's tab bar and the fade behind it, the phone's top bar, the toast on a listing,
//     the logo studio's toast, the tenant's toast): drawn on the body, outside the Next root
//     (components/FloatLayer.js), so the only boxes around one are body and html (and, for the two
//     bars, a box of their own on the body, at its start or its end, whose one style is overflow-y
//     auto), and no rule or script anywhere sets one of those properties on any of them.
//   STICKY (the tenant's top bar, the strength bar and chips under it, the bar for the cards
//     picked): in the page, so the Next root is around each. The one rule that scales the Next
//     root (the page behind a sheet, components/Sheet.js) never applies while one is on the page;
//     the page slides (lib/motion.js slideIn) and follows the edge swipe (components/nav/EdgeBack.js)
//     only between realtor screens, never on a tenant page, never on the dashboard as it is left
//     by the swipe; and no scroll box is left above any of them (body and the Next root clip where
//     each is, instead of hiding).
// The walk (tests/routes/phoneBarWebkit.test.mjs) reads every box around each surface in WebKit and
// in Chrome, at rest, scrolled, with a sheet open, as a screen pushes in and goes back, and after
// the theme changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walkJs = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? walkJs(p) : /\.m?js$/.test(f) ? [p] : []; });
const SOURCES = [...walkJs('components'), ...walkJs('pages').filter((p) => !p.startsWith('pages/api/')), 'lib/motion.js'];
// The properties that make a box the containing block of what floats inside it.
const PROPS = ['transform', 'translate', 'scale', 'rotate', 'filter', 'backdrop-filter', '-webkit-backdrop-filter', 'perspective', 'will-change', 'contain', 'container-type', 'container', 'view-transition-name'];
const JS_PROPS = ['transform', 'translate', 'scale', 'rotate', 'filter', 'backdropFilter', 'webkitBackdropFilter', 'perspective', 'willChange', 'contain', 'containerType', 'container', 'viewTransitionName'];
const INERT = /^(none|normal|auto|initial|unset)$/;

// A template's interpolations (${C.ink}, ${PAGE_STICKY}) as braceless marks (§C.ink§), innermost
// first, so their braces never pass for a rule's.
const unbrace = (src) => { let s = src; for (let i = 0; i < 8; i++) { const t = s.replace(/\$\{([^{}]*)\}/g, (m, x) => `§${x.replace(/[{}]/g, '')}§`); if (t === s) break; s = t; } return s; };
// Every innermost CSS rule in a file: [selector list, declarations]. Comments go first.
const rulesOf = (src) => [...unbrace(src).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
// A selector list split at its top level commas (not those inside :has(...) or :not(...)).
const splitList = (sel) => { const out = []; let depth = 0; let cur = ''; for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
// The element a selector styles: its last compound, outside every parenthesis, without :global().
const subjectOf = (sel) => {
  const s = sel.replace(/:global\(([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*)\)/g, '$1').trim();
  let depth = 0; let last = 0;
  for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; else if (depth === 0 && /[\s>+~]/.test(ch)) last = i + 1; }
  return s.slice(last).trim();
};
// The bare element of a compound: html, :root, body or #__next, else null. A pseudo element of it
// (::view-transition-old(root), ::before) is another box and is not it.
const elementOf = (compound) => {
  if (/::/.test(compound)) return null;
  const bare = compound.replace(/\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/[.:][\w-]+/g, (m) => (m === ':root' ? m : ''));
  return ['html', ':root', 'body', '#__next'].includes(bare) ? (bare === ':root' ? 'html' : bare) : null;
};
const setsProp = (decls) => decls.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).replace(/!important/, '').trim()]; })
  .filter(([p, v]) => PROPS.includes(p) && !INERT.test(v));

// Every rule anywhere that sets one of the properties on html, body or the Next root.
const ROOT_RULES = [];
for (const file of SOURCES) for (const [sel, decls] of rulesOf(read(file))) {
  const props = setsProp(decls); if (!props.length) continue;
  for (const one of splitList(sel)) { const el = elementOf(subjectOf(one)); if (el) ROOT_RULES.push({ file, el, sel: one, props: props.map(([p]) => p) }); }
}

test('fixed surfaces are drawn on the body: the tab bar and its fade, the top bar and the three toasts', () => {
  const layer = read('components/FloatLayer.js');
  assert.match(layer, /export const FloatInPlace = createContext\(false\);/);
  // The body once hydrated, in place inside the picture beneath an edge swipe; at the widths the
  // surface names; at the end of the body, or for the top bar in a box of its own before the Next root.
  assert.match(layer, /if \(inPlace\) \{ setHost\(null\); return undefined; \}/, 'in place beneath an edge swipe');
  assert.match(layer, /if \(!media \|\| typeof window\.matchMedia !== 'function'\) \{ setHost\(hostOf\(where\)\); return undefined; \}/, 'the body, once hydrated');
  assert.match(layer, /const pick = \(\) => setHost\(mq\.matches \? hostOf\(where\) : null\);/, 'at the widths it names');
  assert.match(layer, /export function useFloating\(\{ media = null, where = 'body' \} = \{\}\) \{/, 'the body itself unless a surface names its box (the toasts)');
  assert.match(layer, /if \(where !== 'start' && where !== 'end'\) return document\.body;/);
  assert.match(layer, /if \(where === 'start'\) \{ if \(root && root\.parentNode === document\.body\) document\.body\.insertBefore\(box, root\);/, 'the top bar\'s box before the Next root');
  assert.match(layer, /else if \(box\.parentNode !== document\.body\) document\.body\.appendChild\(box\);/, 'the tab bar\'s box at the end of the body');
  // One style on each box, overflow-y auto: a scroller of its own for the hit areas (lib/motion.js
  // applyHitAreas), never a containing block, never a class.
  assert.deepEqual([...layer.matchAll(/box\.style\.(\w+)/g)].map((m) => m[1]), ['overflowY'], 'the boxes\' one style');
  assert.match(layer, /box\.style\.overflowY = 'auto';/);
  assert.doesNotMatch(layer, /box\.className|box\.classList/, 'no class on the boxes');
  const header = read('components/dashboard/DashboardHeader.js');
  assert.match(header, /const host = useFloating\(\{ media: PHONE, where: 'start' \}\);/);
  assert.match(header, /export const PHONE = '\(max-width: 1023\.98px\)';/);
  assert.match(header, /\{host \? createPortal\(bar, host\) : bar\}/, 'the top bar on the body under 1024px');
  assert.match(header, /:global\(\.rl-header\[data-shell-bar\]\[data-float='body'\]\) \{ view-transition-name: rl-top-bar; \}/, 'a picture of its own, on itself');
  assert.match(read('components/dashboard/LogoStudio.js'), /<FloatLayer>\s*<div role="status" data-tap="" onClick=\{\(\) => setToast\(''\)\} className="rl-glass rl-glass-ink" data-logo-toast=""/, 'the logo studio\'s toast');
  assert.match(layer, /return host \? createPortal\(children, host\) : children;/);
  const nav = read('components/dashboard/MainNav.js');
  assert.match(nav, /const host = useFloating\(\{ where: 'end' \}\);/, 'the tab bar in its box at the end of the body');
  assert.match(nav, /return host \? createPortal\(bar, host\) : bar;/, 'the tab bar on the body');
  assert.match(nav, /\.mn \{ position: fixed;/);
  assert.match(nav, /\.mn\[data-float='body'\] \{ view-transition-name: rl-main-nav; \}/, 'a picture of its own in a view transition, on itself, never on a box around it');
  assert.match(nav, /<div className="mn-fade" aria-hidden="true" data-tab-fade="" data-float=\{host \? 'body' : 'in-place'\} \/>/, 'the fade, on the body with the bar');
  assert.match(nav, /:global\(\.mn-fade\[data-float='body'\]\) \{ view-transition-name: rl-main-fade; \}/);
  assert.match(read('components/dashboard/ListingView.js'), /<FloatLayer><div role="status" aria-live="polite" className="lv-toast rl-glass rl-glass-ink"/);
  for (const p of ['pages/my-application.js', 'pages/my-application/[rl].js']) assert.match(read(p), /\{toast && <FloatLayer><div role="status" data-tap="" onClick=\{\(\) => setToast\(''\)\} className="mp-toast rl-glass rl-glass-ink">/, p);
  // In the screen drawn beneath an edge swipe the bar stays in that picture, under the page.
  assert.match(read('components/nav/RouteFrame.js'), /<FloatInPlace\.Provider value><RouteLoader route=\{beneath\.route\} \/><\/FloatInPlace\.Provider>/);
});

test('no rule and no script sets a containing block property on html or body', () => {
  const onRoot = ROOT_RULES.filter((r) => r.el !== '#__next');
  assert.deepEqual(onRoot, [], onRoot.map((r) => `${r.file}: ${r.sel} { ${r.props.join(', ')} }`).join('\n'));
  // The parser sees what it must: a rule of each shape it reads.
  const probe = rulesOf(':global(html.x) { scale: 0.9; color: ${C.ink}; } body:has(.a, .b) { will-change: transform; } html[data-nav="push"]::view-transition-old(root) { transform: none; } :root { contain: paint; } .a html { filter: blur(${n ? `${k}px` : 0}); }');
  const seen = probe.flatMap(([sel, d]) => splitList(sel).map((one) => [elementOf(subjectOf(one)), setsProp(d).map(([p]) => p)]));
  assert.deepEqual(seen, [['html', ['scale']], ['body', ['will-change']], [null, []], ['html', ['contain']], ['html', ['filter']]]);
  // Scripts: no style, setProperty or animation on the document's root or the body.
  for (const file of [...SOURCES, ...walkJs('lib')]) {
    const s = read(file).replace(/\/\/[^\n]*/g, '');
    for (const p of JS_PROPS) assert.doesNotMatch(s, new RegExp(`(documentElement|body|\\bhtml|\\bd|\\broot)\\.style\\.${p}\\s*=(?!=)`), `${file}: ${p} set on html or body`);
    assert.doesNotMatch(s, new RegExp(`(documentElement|body)\\.style\\.setProperty\\(['"](${PROPS.join('|')})['"]`), `${file}: set on html or body`);
    assert.doesNotMatch(s, /(document\.documentElement|document\.body)\.animate\(/, `${file}: html or body animated`);
    assert.doesNotMatch(s, /slideIn\(document\.(body|documentElement)/, `${file}: the push on html or body`);
  }
});

test('sticky surfaces: the page never scales around one, never slides with one, and no scroll box sits above one', () => {
  // The only rules that set such a property on the Next root: the page behind a sheet, and only
  // while no sticky surface is on the page.
  const sheet = read('components/Sheet.js');
  assert.match(sheet, /export const PAGE_STICKY = '\[data-tenant-bar\], \[data-bulk-bar\]';/);
  const onNext = ROOT_RULES.filter((r) => r.el === '#__next');
  assert.ok(onNext.length >= 1, 'the sheet\'s scale is found');
  for (const r of onNext) {
    assert.equal(r.file, 'components/Sheet.js', `${r.file}: ${r.sel} { ${r.props.join(', ')} }`);
    assert.match(r.sel, /^html\.rl-sheet-(open|closing):not\(:has\(§PAGE_STICKY§\)\) #__next$/, r.sel);
  }
  // Each sticky surface carries the mark PAGE_STICKY reads (the strength bar and chips sit under
  // the tenant's bar, on the tenant's own profile).
  assert.match(read('components/tenant/TenantBar.js'), /<header className="rl-tbar rl-glass rl-glass-auto" data-tenant-bar="" data-stuck="">/);
  assert.match(read('components/dashboard/HomeView.js'), /<div className="hv-bulk rl-glass" role="region" aria-label="Selected listings" data-bulk-bar="" data-stuck="">/);
  assert.match(read('pages/my-application.js'), /<TenantBar\b/);
  // The push and the edge swipe move the Next root only between realtor screens (components/nav/
  // routes.js routeOf knows no tenant page), never on a quiet page, and the swipe never on the
  // dashboard; the dashboard comes in with nothing picked, so the bar for the picked is never up
  // while it slides in.
  const frame = read('components/nav/RouteFrame.js');
  assert.match(frame, /if \(!from \|\| !to \|\| QUIET\.test\(window\.location\.pathname\)\) return;/);
  assert.match(frame, /if \(!isStandalone\(\) \|\| QUIET\.test\(window\.location\.pathname\)\) return false;/);
  assert.match(frame, /if \(!here \|\| here\.kind === 'demo' \|\| here\.depth === 0\) return false; \/\/ never on the dashboard/);
  assert.match(frame, /const page = \(\) => document\.getElementById\('__next'\);/);
  const routes = read('components/nav/routes.js');
  const table = routes.slice(routes.indexOf('const ROUTES = ['), routes.indexOf('];', routes.indexOf('const ROUTES = [')));
  assert.deepEqual([...table.matchAll(/kind: '(\w+)'/g)].map((m) => m[1]), ['dashboard', 'listing', 'profile', 'circle', 'billing', 'demo'], 'realtor screens only');
  assert.match(read('components/dashboard/HomeView.js'), /const \[picked, setPicked\] = useState\(\(\) => new Set\(\)\);/);
  // No scroll box above a sticky surface: body and the Next root clip where each one is.
  assert.match(read('components/tenant/TenantBar.js'), /:root:has\(\[data-tenant-bar\]\) body, #__next:has\(\[data-tenant-bar\]\) \{ overflow-x: clip !important; \}/);
  assert.match(read('components/tenant/ProfileLayout.js'), /:root:has\(\[data-tp-shell\]\) body, #__next:has\(\[data-tp-shell\]\), :has\(> \[data-tp-shell\]\) \{ overflow-x: clip !important; \}/);
  assert.match(read('components/dashboard/HomeView.js'), /:global\(:root:has\(\[data-bulk-bar\]\) body\), :global\(#__next:has\(\[data-bulk-bar\]\)\) \{ overflow-x: clip !important; \}/);
});

test('the parser reads the rules of the files it walks', () => {
  // A rule known to exist in each shape: html in GlobalStyle, the sheet's scale on the Next root.
  const ui = rulesOf(read('components/ui.js')).filter(([sel]) => splitList(sel).some((one) => elementOf(subjectOf(one)) === 'html'));
  assert.ok(ui.length >= 3, `html rules in components/ui.js (${ui.length})`);
  assert.ok(SOURCES.length > 150, `the sources walked (${SOURCES.length})`);
  assert.ok(SOURCES.every((p) => !relative(ROOT, join(ROOT, p)).startsWith('pages/api/')));
});
