// Every pair of tokens the app sets one on the other, in both themes (components/theme.js LIGHT and
// DARK): text and the text of a control at 4.5 to 1 or better, a mark (an icon, a tick, a dot, the
// focus ring) and a boundary (a control's border, a filled control's edge against the page) at 3 to
// 1 or better. The dark theme holds every pair. The light theme is held as it was before the dark
// theme existed, with its three known gaps named here at their measured value and allowed no lower:
// red text on the deep paper (4.39), the ghost of an empty value in a preview (1.55), and the control
// border, ruleDark, against the surfaces (1.34 to 1.55). A hairline (rule, instRule) is decoration, not a boundary; it only has to show as a line in
// dark about as it does in light. Glass is held in tests/glass.test.mjs, the pages in the dark walk
// (tests/routes/darkWebkit.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LIGHT, DARK, TOKENS, C, cssVar } = await import('../components/theme.js');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const SURFACES = ['paper', 'paperDeep', 'card'];
const TEXT = 4.5; const MARK = 3;
// [what, foreground token, background token, the floor]
export const PAIRS = [
  ...['ink', 'inkSoft', 'inkMute', 'danger', 'red'].flatMap((t) => SURFACES.map((s) => [`${t} text on ${s}`, t, s, TEXT])),
  ['infoInk on an info well', 'infoInk', 'info', TEXT],
  ['inkMute on an info well', 'inkMute', 'info', TEXT],
  ['ghost text (an empty value in a live preview) on card', 'ghost', 'card', TEXT],
  // A filled control: its label on its fill.
  ['paper on an ink button, pill or band', 'paper', 'ink', TEXT],
  ['inkInverse on an ink fill', 'inkInverse', 'ink', TEXT],
  ['inkInverseMute on an ink fill (an eyebrow)', 'inkInverseMute', 'ink', TEXT],
  ['blush on an ink fill (an eyebrow)', 'blush', 'ink', TEXT],
  ['paper on a red button', 'paper', 'red', TEXT],
  ['card on a red button', 'card', 'red', TEXT],
  ['paper on a danger button', 'paper', 'danger', TEXT],
  ['red on its tint', 'red', 'redTint', TEXT],
  ['danger on its tint', 'danger', 'dangerTint', TEXT],
  ['ink on the danger tint (an error line)', 'ink', 'dangerTint', TEXT],
  ['inkSoft on the danger tint', 'inkSoft', 'dangerTint', TEXT],
  // The tenant's done state (components/tenant/ProfileLayout.js).
  ...['paper', 'paperDeep', 'card', 'doneTint'].map((s) => [`done on ${s}`, 'done', s, TEXT]),
  ['the card on done (the tick in a done mark)', 'card', 'done', TEXT],
  // The instrument surfaces.
  ...['instText', 'instMute', 'instInk', 'redBright', 'instDangerText'].flatMap((t) => ['inst', 'instRaise'].map((s) => [`${t} on ${s}`, t, s, TEXT])),
  ['instText on instDanger', 'instText', 'instDanger', TEXT],
  // Marks: the red tick and dot, the focus rings, a mark on an ink fill, the logo's white plate.
  ...SURFACES.map((s) => [`a red mark or the focus ring on ${s}`, 'red', s, MARK]),
  ...SURFACES.map((s) => [`the field focus ring (ink) on ${s}`, 'ink', s, MARK]),
  ['a red mark on an ink fill', 'redOnInk', 'ink', MARK],
  ['a red mark on an instrument panel', 'redBright', 'inst', MARK],
  ['done as a mark on its tint', 'done', 'doneTint', MARK],
  ['the door turning in a pending button', 'red', 'busy', MARK],
  // Boundaries: a control's border, and a filled control against the page.
  ...SURFACES.map((s) => [`a control border (ruleDark) on ${s}`, 'ruleDark', s, MARK]),
  ...SURFACES.map((s) => [`an ink control against ${s}`, 'ink', s, MARK]),
  ...SURFACES.map((s) => [`a red control against ${s}`, 'red', s, MARK]),
];
// The light theme's gaps, as they were before the dark theme: no lower, and no new one.
const LIGHT_GAPS = {
  'red text on paperDeep': 4.39,
  'ghost text (an empty value in a live preview) on card': 1.55,
  'a control border (ruleDark) on paper': 1.46,
  'a control border (ruleDark) on paperDeep': 1.34,
  'a control border (ruleDark) on card': 1.55,
};

test('both themes name the same tokens, each a six digit hex, and the pages read them as variables', () => {
  assert.deepEqual(Object.keys(DARK), Object.keys(LIGHT));
  for (const P of [LIGHT, DARK]) for (const k of TOKENS) assert.match(P[k], /^#[0-9a-f]{6}$/, k);
  for (const k of TOKENS) assert.equal(C[k], `var(${cssVar(k)})`, `C.${k} is its variable`);
  assert.equal(cssVar('paperDeep'), '--c-paper-deep');
});

test('every pair in the dark theme: text 4.5 to 1, marks and boundaries 3 to 1', () => {
  const low = PAIRS.map(([what, fg, bg, min]) => [what, ratio(DARK[fg], DARK[bg]), min]).filter(([, r, min]) => r < min);
  assert.deepEqual(low.map(([w, r]) => `${w}: ${r.toFixed(2)}`), []);
});

test('every pair in the light theme, with only its known gaps and none lower', () => {
  const low = PAIRS.map(([what, fg, bg, min]) => [what, ratio(LIGHT[fg], LIGHT[bg]), min]).filter(([, r, min]) => r < min);
  assert.deepEqual(low.map(([w]) => w).sort(), Object.keys(LIGHT_GAPS).sort(), 'the light gaps are the known ones');
  for (const [w, r] of low) assert.ok(Math.round(r * 100) / 100 >= LIGHT_GAPS[w], `${w}: ${r.toFixed(2)} is no lower than it was`);
});

test('ink and paper swap roles in dark; red stays the signal, brighter only to hold its contrast', () => {
  assert.ok(lum(DARK.paper) < 0.02 && lum(DARK.paper) > 0.003, 'the ground is a deep charcoal, not black');
  assert.ok(lum(DARK.ink) > 0.75, 'the text is a warm off white');
  const warm = (h) => { const [r, , b] = rgb(h); return r > b; };
  for (const t of ['paper', 'paperDeep', 'card', 'ink', 'inkSoft']) assert.ok(warm(DARK[t]), `${t} is warm`);
  assert.ok(lum(DARK.paperDeep) < lum(DARK.paper) && lum(DARK.paper) < lum(DARK.card), 'recessed, ground, raised: the light order kept in dark');
  // #d72027 as text on the dark card would hold only 3.09: the dark red is the brand's bright red.
  assert.ok(ratio(LIGHT.red, DARK.card) < TEXT);
  assert.equal(DARK.red, LIGHT.redBright);
  assert.notEqual(DARK.danger, DARK.red, 'danger is never the brand red');
});

test('a hairline shows in dark about as it does in light', () => {
  for (const s of SURFACES) {
    const light = ratio(LIGHT.rule, LIGHT[s]); const dark = ratio(DARK.rule, DARK[s]);
    assert.ok(dark >= light * 0.9 && dark >= 1.2 && dark < 1.8, `rule on ${s}: ${dark.toFixed(2)} in dark, ${light.toFixed(2)} in light`);
  }
  assert.ok(ratio(DARK.instRule, DARK.inst) >= ratio(LIGHT.instRule, LIGHT.inst), 'the instrument hairline');
});

test('the colours that do not change: the toast text, the plate, the red mark on an ink fill', () => {
  for (const k of ['instInk', 'plate', 'redOnInk', 'instText', 'instMute', 'redBright', 'instDanger', 'instDangerText']) assert.equal(DARK[k], LIGHT[k], k);
  assert.equal(LIGHT.redOnInk, LIGHT.red, 'the brand red on the ink tile, in light as before');
});
