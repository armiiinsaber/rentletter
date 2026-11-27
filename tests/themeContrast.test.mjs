// Every pair of tokens the app sets one on the other, in both themes (components/theme.js LIGHT and
// DARK): text and the text of a control at 4.5 to 1 or better, a mark (an icon, a tick, a dot, the
// focus ring) and a boundary (a control's border, a filled control's edge against the page) at 3 to
// 1 or better. Both themes hold every pair; there is no known gap. The light theme's three old gaps
// were closed by fix/theme-refine: red text on the deep paper (4.39, now redText at 4.50), the ghost
// of an empty value in a preview (1.55, now 5.30) and the control border, ruleDark, against the
// surfaces (1.34 to 1.55, now 3.00 to 3.48). A hairline (rule, instRule) is decoration, not a
// boundary; it only has to show as a line in dark about as it does in light. The ink fill is ink in
// light and a raised charcoal in dark, bounded there by being lighter than the page and the card,
// with its text held like any other. Glass is held in tests/glass.test.mjs, the pages in the dark
// walk (tests/routes/darkWebkit.test.mjs).
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
  ...['ink', 'inkSoft', 'inkMute', 'danger', 'redText'].flatMap((t) => SURFACES.map((s) => [`${t} text on ${s}`, t, s, TEXT])),
  ['infoInk on an info well', 'infoInk', 'info', TEXT],
  ['inkMute on an info well', 'inkMute', 'info', TEXT],
  ['ghost text (an empty value in a live preview) on card', 'ghost', 'card', TEXT],
  // A filled control: its label on its fill.
  ['onInk on an ink fill (a button, pill, tile, card or band)', 'onInk', 'inkFill', TEXT],
  ['inkInverse on an ink fill', 'inkInverse', 'inkFill', TEXT],
  ['inkInverseMute on an ink fill (an eyebrow)', 'inkInverseMute', 'inkFill', TEXT],
  ['blush on an ink fill (an eyebrow)', 'blush', 'inkFill', TEXT],
  ['onRed on a red button', 'onRed', 'redFill', TEXT],
  ['paper on a danger button', 'paper', 'danger', TEXT],
  ['redText on its tint', 'redText', 'redTint', TEXT],
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
  ['a red mark on an ink fill', 'redOnInk', 'inkFill', MARK],
  ['a red mark on an instrument panel', 'redBright', 'inst', MARK],
  ['done as a mark on its tint', 'done', 'doneTint', MARK],
  ['the door turning in a pending button', 'red', 'busy', MARK],
  // Boundaries: a control's border (an input, a select, an outlined control), an ink border or
  // track, and a red filled control against the page.
  ...SURFACES.map((s) => [`a control border (ruleDark) on ${s}`, 'ruleDark', s, MARK]),
  // The progress strip on a listing card (components/dashboard/ListingCard.js): a stage not reached
  // yet is ruleDark on the card, and a skipped stage an ink outline on it.
  ['the progress strip, a stage not reached yet, on the card', 'ruleDark', 'card', MARK],
  ['the progress strip, a skipped stage\'s outline, on the card', 'ink', 'card', MARK],
  ...SURFACES.map((s) => [`an ink border or track against ${s}`, 'ink', s, MARK]),
  ...SURFACES.map((s) => [`a red control against ${s}`, 'redFill', s, MARK]),
];

test('both themes name the same tokens, each a six digit hex, and the pages read them as variables', () => {
  assert.deepEqual(Object.keys(DARK), Object.keys(LIGHT));
  for (const P of [LIGHT, DARK]) for (const k of TOKENS) assert.match(P[k], /^#[0-9a-f]{6}$/, k);
  for (const k of TOKENS) assert.equal(C[k], `var(${cssVar(k)})`, `C.${k} is its variable`);
  assert.equal(cssVar('paperDeep'), '--c-paper-deep');
});

for (const [name, P] of [['light', LIGHT], ['dark', DARK]]) {
  test(`every pair in the ${name} theme: text 4.5 to 1, marks and boundaries 3 to 1, no known gap`, () => {
    const low = PAIRS.map(([what, fg, bg, min]) => [what, ratio(P[fg], P[bg]), min]).filter(([, r, min]) => r < min);
    assert.deepEqual(low.map(([w, r]) => `${w}: ${r.toFixed(2)}`), []);
  });
}

test('the light fixes are the least that pass: the text red and the control border just over the line, the fills unchanged', () => {
  const ch = (h) => rgb(h);
  // The text red: the brand red darkened, no channel lighter, and only just past 4.5 on the deep paper.
  assert.ok(ch(LIGHT.redText).every((v, i) => v <= ch(LIGHT.red)[i]) && lum(LIGHT.redText) < lum(LIGHT.red), 'redText is the brand red darkened');
  const rt = ratio(LIGHT.redText, LIGHT.paperDeep); assert.ok(rt >= TEXT && rt < 4.55, `redText on paperDeep: ${rt.toFixed(3)}`);
  assert.equal(LIGHT.redFill, LIGHT.red, 'the red fill is the brand red'); assert.equal(LIGHT.red, '#d72027', 'the red mark is the brand red');
  // The control border: only just past 3 on the deep paper, the darkest of the three light surfaces.
  const rd = ratio(LIGHT.ruleDark, LIGHT.paperDeep); assert.ok(rd >= MARK && rd < 3.05, `ruleDark on paperDeep: ${rd.toFixed(3)}`);
  assert.equal(LIGHT.sand, '#d6cfbe', 'the sand that is not a border keeps the old colour');
  assert.equal(LIGHT.ghost, LIGHT.inkMute, 'the ghost reads as the placeholder colour');
});

test('the red fill is the brand red with a white label in both themes; the bright red is text and marks only', () => {
  for (const P of [LIGHT, DARK]) { assert.equal(P.redFill, '#d72027'); assert.equal(P.onRed, '#ffffff'); }
  assert.ok(ratio(DARK.onRed, DARK.redFill) >= TEXT, 'white on the brand red');
  assert.equal(DARK.redText, LIGHT.redBright); assert.equal(DARK.red, LIGHT.redBright);
});

test('the ink fill: ink in light, in dark a raised charcoal lighter than the page and the card, never a light slab', () => {
  assert.equal(LIGHT.inkFill, LIGHT.ink); assert.equal(LIGHT.onInk, LIGHT.paper);
  for (const s of SURFACES) assert.ok(ratio(LIGHT.inkFill, LIGHT[s]) >= MARK, `light: an ink filled control against ${s}`);
  assert.ok(lum(DARK.inkFill) > lum(DARK.card) && lum(DARK.card) > lum(DARK.paper), 'raised: lighter than the card, which is lighter than the page');
  assert.ok(lum(DARK.inkFill) < 0.05, 'a charcoal, not a light surface');
  assert.ok(lum(DARK.onInk) > 0.75 && DARK.onInk === DARK.ink, 'off white text on it');
  const [r, , b] = rgb(DARK.inkFill); assert.ok(r > b, 'warm, like the ground');
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

test('the colours that do not change: the toast text, the plate, the red fill and its label', () => {
  for (const k of ['instInk', 'plate', 'redFill', 'onRed', 'instText', 'instMute', 'redBright', 'instDanger', 'instDangerText']) assert.equal(DARK[k], LIGHT[k], k);
  assert.equal(LIGHT.redOnInk, LIGHT.red, 'the brand red on the ink tile, in light as before');
  assert.equal(DARK.redOnInk, DARK.red, 'the bright red on the raised ink fill in dark');
});
