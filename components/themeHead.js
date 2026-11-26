// components/themeHead.js
// The theme's plain parts, with no React: the CSS that sets the tokens for the theme in force, the
// script that runs before the first paint, and the routes that are always light. Read by
// pages/_document.js (the server), components/themeMode.js (the choice) and components/ui.js
// (GlobalStyle). See components/themeMode.js for the whole of it.
import { LIGHT, DARK, TOKENS, cssVar, SH_LIGHT, SH_DARK } from './theme.js';

export const STORAGE_KEY = 'rl-theme';
export const PREFS = Object.freeze(['auto', 'light', 'dark']);
// The routes that are always light: the landlord's report and the founder office. Tested against
// both a route pattern (/r/[token]) and a real path (/r/abc).
export const ALWAYS_LIGHT = /^\/(r|admin)(\/|$)/;
export const alwaysLight = (path) => ALWAYS_LIGHT.test(String(path || '').split('?')[0]);
// The tenant's pages, whose ground is the deep paper (.mp-page, components/ui.js --canvas): Your
// profile, an application and its confirmation, the apply flow, the co applicant and guarantor form.
// The browser's bars take that ground (components/ThemeColor.js).
export const DEEP_GROUND = /^\/(my-application|apply|party)(\/|$)/;
export const deepGround = (path) => DEEP_GROUND.test(String(path || '').split('?')[0]);

const triplet = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
// One theme's declarations: each token, its rgb triplet, the shadows, and the root's derived
// variables (components/ui.js), declared again so a subtree held light (.rl-theme-light) resolves
// them from its own tokens.
export const themeDecls = (P, S) => [
  ...TOKENS.map((k) => `${cssVar(k)}: ${P[k]}; ${cssVar(k)}-rgb: ${triplet(P[k])};`),
  `--sh-rest: ${S.rest}; --sh-raised: ${S.raised}; --sh-modal: ${S.modal};`,
  '--paper: var(--c-paper); --rule: var(--c-rule); --action: var(--c-red); --focus-ring: var(--c-ink); --glass-solid: var(--c-paper);',
].join(' ');
const LIGHT_DECLS = `${themeDecls(LIGHT, SH_LIGHT)} color-scheme: light;`;
const DARK_DECLS = `${themeDecls(DARK, SH_DARK)} color-scheme: dark;`;
// Where the dark theme is in force: by the device when nothing chose light, or by the choice.
export const DARK_ROOT = Object.freeze(['@media screen and (prefers-color-scheme: dark) { :root:not([data-theme="light"])', '@media screen { :root[data-theme="dark"]']);
// rules, written once, in force wherever the dark theme is: each selector under the dark root (a
// selector that starts with :root on the dark root itself). Plain rules only, no @media inside.
export const inDark = (rules) => DARK_ROOT.map((open) => {
  const scope = open.slice(open.indexOf('{') + 1).trim();
  const body = rules.trim().split('}').map((r) => r.trim()).filter(Boolean).map((r) => {
    const at = r.indexOf('{');
    const under = (sel) => (sel === ':root' ? scope : sel.startsWith(':root') ? `${scope}${sel.slice(5)}` : `${scope} ${sel}`);
    return `${r.slice(0, at).split(',').map((sel) => under(sel.trim())).join(', ')} {${r.slice(at + 1)}}`;
  }).join(' ');
  return `${open.slice(0, open.indexOf('{') + 1)} ${body} }`;
}).join('\n');
export const THEME_CSS = `
:root { ${LIGHT_DECLS} }
${DARK_ROOT[0]} { ${DARK_DECLS} } }
${DARK_ROOT[1]} { ${DARK_DECLS} } }
.rl-theme-light { ${LIGHT_DECLS} color: ${LIGHT.ink}; }
/* While a choice lands, no element plays a colour transition of its own (components/themeMode.js
   setThemePref): the new theme is there at once. */
html[data-theme-switch] *, html[data-theme-switch] *::before, html[data-theme-switch] *::after { transition: none !important; }
`;

// Before the first paint (pages/_document.js): the stored choice onto html[data-theme], unless the
// page is always light. Anything but light or dark, or no storage, is Automatic.
export const THEME_HEAD = `(function(){var d=document.documentElement;try{if(d.hasAttribute('data-theme-lock')||${ALWAYS_LIGHT}.test(location.pathname)){d.setAttribute('data-theme','light');d.setAttribute('data-theme-lock','');return;}var p=null;try{p=window.localStorage.getItem('${STORAGE_KEY}');}catch(e){}if(p==='light'||p==='dark')d.setAttribute('data-theme',p);else d.removeAttribute('data-theme');}catch(e){}})();`;
