// The theme in force (components/themeMode.js, components/themeHead.js):
//   · the default follows the device: with nothing stored, no html[data-theme], and the dark tokens
//     only under prefers-color-scheme: dark; a stored light or dark wins; anything else, or storage
//     that throws, is Automatic
//   · the head script sets it before the first paint, from pages/_document.js, ahead of everything
//   · the landlord's report and the founder office are always light, marked by the server and kept
//     by the app as the route changes
//   · dark is only for a screen: printing is light; a subtree can be held light (.rl-theme-light)
//   · one source for the browser's theme-color (components/ThemeColor.js), color-scheme with it
//   · the choice on the realtor's Profile and the tenant's profile, kept on the device, never sent
//   · every colour in the pages and components comes from the tokens, with the few named exceptions
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = new URL('../', import.meta.url).pathname;
const src = (p) => readFileSync(`${ROOT}${p}`, 'utf8');
const { LIGHT, DARK, TOKENS, cssVar } = await import('../components/theme.js');
const H = await import('../components/themeHead.js');

// The head script in a sandbox: an html element, storage and a path.
function head({ stored, path = '/dashboard', throws = false, locked = false }) {
  const attrs = new Map(locked ? [['data-theme-lock', '']] : []);
  const html = { setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k), getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null) };
  const storage = { getItem: (k) => { if (throws) throw new Error('blocked'); return k === H.STORAGE_KEY ? stored ?? null : null; } };
  vm.runInNewContext(H.THEME_HEAD, { document: { documentElement: html }, window: { localStorage: storage }, location: { pathname: path } });
  return { theme: html.getAttribute('data-theme'), lock: html.hasAttribute('data-theme-lock') };
}

test('the head script: the device by default, a stored choice wins, anything else is Automatic', () => {
  assert.deepEqual(head({ stored: null }), { theme: null, lock: false }, 'nothing stored: the device decides');
  assert.deepEqual(head({ stored: 'dark' }), { theme: 'dark', lock: false });
  assert.deepEqual(head({ stored: 'light' }), { theme: 'light', lock: false });
  assert.deepEqual(head({ stored: 'auto' }), { theme: null, lock: false });
  assert.deepEqual(head({ stored: 'purple' }), { theme: null, lock: false });
  assert.deepEqual(head({ stored: 'dark', throws: true }), { theme: null, lock: false }, 'storage that throws: Automatic');
  for (const path of ['/r/abc123', '/admin', '/admin/crm', '/admin/mockups']) assert.deepEqual(head({ stored: 'dark', path }), { theme: 'light', lock: true }, `${path} is always light`);
  assert.deepEqual(head({ stored: 'dark', path: '/dashboard', locked: true }), { theme: 'light', lock: true }, 'a page the server marked light stays light');
  for (const path of ['/ref/abc', '/refer/abc', '/realtors', '/administration']) assert.deepEqual(head({ stored: 'dark', path }), { theme: 'dark', lock: false }, `${path} follows the choice`);
});

test('the routes that are always light: the report and the founder office, by pattern and by path', () => {
  for (const p of ['/r/[token]', '/r/x', '/admin', '/admin/stats', '/admin/commitment', '/r/x?y=1']) assert.equal(H.alwaysLight(p), true, p);
  for (const p of ['/', '/dashboard', '/listing/[id]', '/profile', '/circle', '/my-application', '/apply/[token]', '/ref/[token]', '/refer/[token]', '/landlord', '/realtors', '/faq', null, undefined, '']) assert.equal(H.alwaysLight(p), false, String(p));
});

test('the tokens on the root: light always, dark only on a screen, by the device or by the choice', () => {
  const css = H.THEME_CSS;
  const block = (start) => { const i = css.indexOf(start); assert.ok(i >= 0, start); return css.slice(i, css.indexOf('}', i)); };
  const light = block(':root {'); const byDevice = block(':root:not([data-theme="light"]) {'); const byChoice = block(':root[data-theme="dark"] {'); const held = block('.rl-theme-light {');
  for (const k of TOKENS) {
    assert.ok(light.includes(`${cssVar(k)}: ${LIGHT[k]};`), `light ${k}`);
    assert.ok(byDevice.includes(`${cssVar(k)}: ${DARK[k]};`) && byChoice.includes(`${cssVar(k)}: ${DARK[k]};`), `dark ${k}`);
    assert.ok(held.includes(`${cssVar(k)}: ${LIGHT[k]};`), `held light ${k}`);
  }
  assert.match(light, /color-scheme: light;/); assert.match(byDevice, /color-scheme: dark;/); assert.match(byChoice, /color-scheme: dark;/);
  assert.match(css, /@media screen and \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{/, 'the device, on a screen only');
  assert.match(css, /@media screen \{ :root\[data-theme="dark"\] \{/, 'the choice, on a screen only');
  // Nothing dark outside a screen query: printing is the light theme.
  assert.equal(css.split(DARK.paper).length - 1, 2, 'the dark paper is set in the two screen blocks only');
  // The root's derived variables follow the theme too, also inside a subtree held light.
  for (const b of [light, byDevice, held]) assert.match(b, /--paper: var\(--c-paper\); --rule: var\(--c-rule\); --action: var\(--c-red\); --focus-ring: var\(--c-ink\);/);
  // Landing a choice: no element plays a colour transition of its own.
  assert.match(css, /html\[data-theme-switch\] \*, html\[data-theme-switch\] \*::before, html\[data-theme-switch\] \*::after \{ transition: none !important; \}/);
  assert.doesNotMatch(src('components/themeMode.js').replace(/\/\/.*$/gm, ''), /startViewTransition|transition:/, 'the choice lands at once, with no animation of its own');
});

test('before the first paint: the head script first in the document, the light pages marked by the server', () => {
  const doc = src('pages/_document.js');
  assert.match(doc, /<Html lang="en" data-theme=\{light \? 'light' : undefined\} data-theme-lock=\{light \? '' : undefined\}>/);
  assert.match(doc, /const light = alwaysLight\(__NEXT_DATA__\?\.page\);/);
  const headAt = doc.indexOf('<Head>'); const scriptAt = doc.indexOf('__html: THEME_HEAD'); const next = doc.indexOf('<script', doc.indexOf('<script') + 1);
  assert.ok(headAt > 0 && scriptAt > headAt && scriptAt < next, 'the theme script is the first thing in the head');
  const app = src('pages/_app.js');
  assert.match(app, /useThemeRoute\(router\?\.pathname\);/, 'the mark follows the route');
  assert.match(app, /\$\{THEME_CSS\}/, 'the tokens on every page');
  assert.match(app, /<ThemeColor \/>/);
});

test('one theme-color: components/ThemeColor.js, the two device metas, by key', () => {
  const tc = src('components/ThemeColor.js');
  assert.match(tc, /key="rl-theme-color-light" name="theme-color" media="\(prefers-color-scheme: light\)"/);
  assert.match(tc, /key="rl-theme-color-dark" name="theme-color" media="\(prefers-color-scheme: dark\)"/);
  const files = []; const walk = (d) => { for (const n of readdirSync(`${ROOT}${d}`)) { const p = `${d}/${n}`; if (statSync(`${ROOT}${p}`).isDirectory()) { if (p !== 'pages/api') walk(p); } else if (/\.js$/.test(n)) files.push(p); } };
  walk('pages'); walk('components');
  const metas = files.filter((p) => p !== 'components/ThemeColor.js' && /name="theme-color"/.test(src(p)));
  assert.deepEqual(metas, [], 'no other file writes a theme-color');
});

test('the choice: on this device, Automatic unless it says light or dark, never thrown', async () => {
  const store = new Map(); let throwing = false; const attrs = new Map();
  const html = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k), getAttribute: (k) => attrs.get(k) ?? null, offsetWidth: 0 };
  globalThis.window = { localStorage: { getItem: (k) => { if (throwing) throw new Error('blocked'); return store.get(k) ?? null; }, setItem: (k, v) => { if (throwing) throw new Error('blocked'); store.set(k, v); }, removeItem: (k) => { if (throwing) throw new Error('blocked'); store.delete(k); } }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  globalThis.document = { documentElement: html };
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
  try {
    const M = await import('../components/themeMode.js');
    assert.equal(M.readThemePref(), 'auto');
    M.setThemePref('dark'); assert.equal(store.get('rl-theme'), 'dark'); assert.equal(attrs.get('data-theme'), 'dark'); assert.equal(M.resolvedTheme(), 'dark');
    M.setThemePref('light'); assert.equal(attrs.get('data-theme'), 'light'); assert.equal(M.resolvedTheme(), 'light');
    M.setThemePref('auto'); assert.equal(store.has('rl-theme'), false, 'Automatic stores nothing'); assert.equal(attrs.has('data-theme'), false);
    M.setThemePref('sepia'); assert.equal(M.readThemePref(), 'auto');
    store.set('rl-theme', 'nonsense'); assert.equal(M.readThemePref(), 'auto');
    throwing = true; assert.equal(M.readThemePref(), 'auto', 'storage that throws reads as Automatic');
    assert.doesNotThrow(() => M.setThemePref('dark'), 'a choice where storage throws still applies to the page');
    assert.equal(attrs.get('data-theme'), 'dark');
    throwing = false;
    attrs.set('data-theme-lock', ''); M.setThemePref('dark'); assert.equal(attrs.get('data-theme'), 'light', 'an always light page stays light'); assert.equal(M.resolvedTheme('dark'), 'light');
    await new Promise((r) => setTimeout(r, 10));
  } finally { delete globalThis.window; delete globalThis.document; delete globalThis.requestAnimationFrame; }
});

test('the choice is shown on the realtor Profile and the tenant profile, and never leaves the device', () => {
  const tc = src('components/ThemeChoice.js');
  assert.match(tc, /export const THEME_LINE = 'Automatic follows your device\. The choice is kept on this device only\.';/);
  assert.match(tc, /\[\['auto', 'Automatic'\], \['light', 'Light'\], \['dark', 'Dark'\]\]/);
  assert.match(src('components/dashboard/ProfileView.js'), /<InviteRealtor \/>\n\s*\{\/\*[^\n]*\*\/\}\n\s*<ThemeChoice \/>/);
  assert.match(src('pages/my-application.js'), /<ThemeChoice variant="tenant" \/>/);
  for (const f of ['components/ThemeChoice.js', 'components/themeMode.js', 'components/themeHead.js']) assert.doesNotMatch(src(f), /fetch\(|\/api\//, `${f} sends nothing`);
});

// Every colour literal in the pages and components (pages/api, the server's emails and PDFs, aside):
// only in the tokens, or in the few places that draw something that is not a theme colour.
const ALLOWED = {
  'components/theme.js': 'the tokens themselves',
  'components/DeviceFrame.js': 'a depiction of real hardware: the bezels, the laptop body, Safari\'s bar, the window buttons, the Dynamic Island',
  'pages/admin/commitment.js': 'the commitment poster\'s own print palette',
  'components/admin/Commitment.js': 'the commitment poster\'s own print palette',
  'components/film/beats.js': 'the product film: realtor brand palettes the logo beat shows and the film\'s own greys, drawn for export',
  'components/mockups/scenes.js': 'the export scenes: realtor brand palettes and the scenes\' own greys',
  'pages/admin/stats.js': 'the founder office\'s chart greys',
  'pages/admin/mockups.js': 'the export canvas stops of the ink background, redrawn in Canvas 2D',
  'components/dashboard/LogoStudio.js': 'the default of the realtor\'s own brand colour (#1f3a5f), a value, not a theme colour',
  'components/dashboard/ColorWheel.js': 'the brightness scale of the colour picker starts at black',
  'components/dashboard/HomeView.js': 'the colour sampled from the realtor\'s logo, computed',
};
test('every colour in the pages and components comes from the tokens, but the named exceptions', () => {
  const files = []; const walk = (d) => { for (const n of readdirSync(`${ROOT}${d}`)) { const p = `${d}/${n}`; if (statSync(`${ROOT}${p}`).isDirectory()) { if (p !== 'pages/api') walk(p); } else if (/\.js$/.test(n)) files.push(p); } };
  walk('pages'); walk('components');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  const hits = [];
  for (const f of files) {
    if (ALLOWED[f]) continue;
    strip(src(f)).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\((?!var\(|\$\{)[^)]*\)/g)) hits.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('the door mark on the page follows the theme; the kit and the app icons keep the hex tokens', async () => {
  const G = await import('../components/brand/doorGeometry.js');
  assert.deepEqual([...G.DOOR_THEMED].sort(), ['ink', 'logo', 'paper', 'red', 'wordmark']);
  const w = G.doorColours('wordmark');
  assert.deepEqual({ ground: w.ground, bar: w.bar, letter: w.letter, knob: w.knob }, { ground: 'var(--c-paper)', bar: 'var(--c-red)', letter: 'var(--c-ink)', knob: LIGHT.ink }, 'the wordmark: the theme\'s paper, red and ink; the knob ink on the red door');
  assert.deepEqual([w.barHex, w.barDark], [LIGHT.red, DARK.red], 'turning: the red of the theme in force, as hex');
  const ink = G.doorColours('ink');
  assert.deepEqual([ink.bar, ink.barHex, ink.barDark], ['var(--c-red-on-ink)', LIGHT.redOnInk, DARK.redOnInk], 'on an ink fill, the red for a mark on ink');
  assert.equal(G.doorColours('red').letter, 'var(--c-card)', 'in a red button, the card\'s colour');
  for (const k of ['realtor', 'admin', 'mark', 'logoInk']) assert.deepEqual({ ...G.doorColours(k), barHex: undefined, barDark: undefined }, { ...G.DOOR_GROUNDS[k], barHex: undefined, barDark: undefined }, `${k} keeps its colours`);
  const mark = src('components/brand/DoorMark.js');
  assert.match(mark, /const themed = !isStill && DOOR_THEMED\.includes\(kind\);/, 'the kit\'s still frames are drawn in the hex tokens');
  assert.match(mark, /p\.style\.fill=\(dk&&x\[3\]\)\|\|x\[1\];/, 'before React, the player draws a dark frame in dark');
});

test('the browser\'s bars take the page\'s ground: the deep paper on the tenant\'s pages', () => {
  for (const p of ['/my-application', '/my-application/[rl]', '/my-application/confirm', '/apply/[token]', '/party/[token]']) assert.equal(H.deepGround(p), true, p);
  for (const p of ['/', '/dashboard', '/applications', '/upload/[token]', '/r/[token]']) assert.equal(H.deepGround(p), false, p);
  assert.match(src('components/ThemeColor.js'), /const tone = given \|\| \(deepGround\(pathname\) \? 'paperDeep' : 'paper'\);/);
});
