// components/theme.js
// Single source of truth for presentation tokens. Presentation-only —
// no data, no logic. Imported by every page; do not fork these per-page.
//
// Two themes, one set of names. LIGHT is the brand's palette as hex, and DARK the same tokens for
// the dark theme. What the pages read is C: each token as its CSS variable (var(--c-paper)), set
// on the root for the theme in force (components/themeMode.js THEME_CSS), so a page follows the
// theme the moment it changes, with no reload. Anything that needs the value itself (the brand
// kit, the door's turning fill, a canvas, a test) reads LIGHT or DARK.
// In dark, ink and paper swap roles: paper is a deep warm charcoal and ink a warm off white. A
// surface filled with ink (an ink button, an ink pill, an ink tile, card or band) is inkFill, which
// in dark is a raised charcoal a step lighter than the page and the card, never a light slab, with
// off white text on it (onInk). A red filled control is the brand red in both themes with a white
// label (redFill, onRed); the brighter red of the dark theme is only red text (redText) and a small
// red mark (red). The instrument surfaces stay ink-black panels in both. Every text pair keeps 4.5
// to 1 and every mark and control border 3 to 1 in both themes (tests/themeContrast.test.mjs).

export const LIGHT = Object.freeze({
  // Surfaces
  paper: '#faf8f3',      // page background (brand eggshell)
  paperDeep: '#f2eee3',  // recessed surface
  card: '#ffffff',       // raised card surface
  // Instrument surfaces — the semantic home of the machine (AI/verification/live-data
  // panels). Paper = human/editorial, instrument = machine, red = signal between them.
  inst: '#101012',       // instrument panel background (near-ink, warm-neutral)
  instRaise: '#1b1b1e',  // raised element on an instrument panel
  instRule: '#2a2a2e',   // hairline on an instrument panel
  instText: '#e8e4d9',   // primary text on instrument (warm, not pure white)
  instMute: '#8f8b81',   // secondary text on instrument
  instInk: '#faf8f3',    // the brightest text on an instrument surface (a toast on the ink glass), in both themes
  // Status on instrument surfaces: ink tones and the red tick only, no green or amber anywhere
  // (tests/noGreenAmber.test.mjs). Brand signal on instrument stays redBright; DANGER on
  // instrument is a distinct, cooler red (fill + text) so "overdue"/"delete" never reads as the
  // brand mark.
  instDanger: '#ad2229',     // fill (instText on it ≈ 5.4:1)
  instDangerText: '#ff8a8f', // small text / borders on instrument (≈ 7.5:1 on inst)
  // Ink
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#6b6b70',    // secondary text and placeholders: 4.99 on paper, 5.30 on white, 4.57 on paperDeep (WCAG AA 4.5)
  inkInverse: '#c8c2b3', // muted text on an ink fill: 10.79 on inkFill
  inkInverseMute: '#8f8b81', // an eyebrow on an ink fill, a step quieter than inkInverse (the tenant's applying banner): 5.64
  // A surface filled with ink: an ink button, pill, badge or avatar, the selected segment, the Ready
  // to send tile, the FAQ's closing card, the homepage's closing band. Ink in light; in dark a raised
  // charcoal (DARK below). A bar, a track, a dot or a progress fill that only marks stays ink.
  inkFill: '#0f0f10',
  onInk: '#faf8f3',      // text and icons on inkFill: 18.05
  // Lines
  rule: '#e3ddd0',       // hairline
  ruleDark: '#908978',   // control borders (an input, a select, an outlined control): 3.00 on paperDeep, 3.28 on paper, 3.48 on the card
  sand: '#d6cfbe',       // the warm sand that is not a border: the dashboard's glow, a switch's off track, a disabled fill, the sheet's handle
  ghost: '#6b6b70',      // the ghost of an empty value in a live preview (the new listing form's "The address"), read as text: = inkMute, 5.30 on the card
  busy: '#d6cfbe',       // a button's fill while it works, the door turning in it (components/ui.js ConfirmSheet)
  // Signal red — brand accent and PRIMARY ACTION only; never errors/destructive (see danger)
  red: '#d72027',        // a red mark: the tick, the dot, the bar, a red border, the focus ring
  redFill: '#d72027',    // a red filled control (New listing, Send, the tab bar's +, a primary button), in both themes
  onRed: '#ffffff',      // the label on redFill, in both themes: 5.09
  redText: '#d51c25',    // red text: the brand red darkened the least that holds 4.5 on paperDeep (4.50, 4.92 on paper, 5.22 on the card)
  redBright: '#ff5a5f',  // red for small text/marks on instrument surfaces (contrast)
  redDark: '#a8161c',
  redTint: '#fdf0ef',
  redOnInk: '#d72027',   // a red mark on an ink fill (the Ready to send tile's dot): 3.76
  blush: '#f0b8bb',      // a red eyebrow on an ink fill (the FAQ's closing card): 11.20 on inkFill
  // Danger — errors and destructive actions. Deliberately distinct from brand red so
  // "send report" and "delete listing" never carry the same color.
  danger: '#a8161c',
  dangerTint: '#fdf0ef',
  // Status: no green, amber or gold token exists. A done state is ink or the red tick, a
  // notice is a paper well (info below), an error is danger.
  // Done, on the tenant's own profile only (components/tenant/ProfileLayout.js): a deep teal,
  // hue 187, outside the green range tests/noGreenAmber.test.mjs scans for. 6.19 to 1 on paper,
  // 6.58 on the card and 5.64 on paperDeep (tests/profileLayout.test.mjs). Used for a done state
  // and nothing else: never a control, never a notice.
  done: '#1e6670',
  doneTint: '#e9f1f2',
  // Info/notice wells (policy boxes, preference blocks) — paper-toned, no off-brand blue
  info: '#f2eee3',       // = paperDeep
  infoBorder: '#e3ddd0', // = rule
  infoInk: '#3a3a3c',    // = inkSoft
  // The white a realtor's logo or a tenant's document sits on: a logo's plate in dark, so a dark logo
  // never disappears (components/ui.js .rl-logo-plate), the Profile's logo slot, the document viewer.
  // White in both themes.
  plate: '#ffffff',
  // The shadow's colour.
  shadow: '#0f0f10',
});

// The dark theme: the same tokens. Ratios are on the dark card (#25221e), the lightest of the three
// dark surfaces, unless named.
export const DARK = Object.freeze({
  paper: '#1b1916',      // the ground: a deep warm charcoal, never pure black
  paperDeep: '#141210',  // recessed: the tenant pages' ground and the wells inside a card
  card: '#25221e',       // raised: a step lighter than the ground
  // The instrument panels stay ink-black, a little deeper and cooler than the warm ground.
  inst: '#0b0b0d',
  instRaise: '#18181b',
  instRule: '#2e2e33',
  instText: '#e8e4d9',   // 15.5 on inst
  instMute: '#8f8b81',   // 5.79 on inst, 5.21 on instRaise
  instInk: '#faf8f3',
  instDanger: '#ad2229',
  instDangerText: '#ff8a8f',
  // Ink: warm off white text, in the same three steps.
  ink: '#f3efe6',        // 13.8 on the card, 15.3 on paper
  inkSoft: '#cdc6b8',    // 9.32
  inkMute: '#9c968a',    // 5.39, 5.97 on paper, 6.36 on paperDeep
  inkInverse: '#c8c2b3', // muted text on the raised ink fill: 6.76
  inkInverseMute: '#aca69a', // 4.96 on inkFill
  // The ink fill in dark: a raised charcoal, lighter than the page (1.46) and the card (1.32), the
  // same shadow as in light, never a light slab.
  inkFill: '#3a3630',
  onInk: '#f3efe6',      // = ink, the off white: 10.46 on inkFill
  rule: '#3b3731',       // hairline: 1.34 on the card, about the step the light rule makes
  ruleDark: '#78726a',   // control borders: 3.33 on the card, 3.69 on paper, 3.93 on paperDeep
  sand: '#78726a',       // = ruleDark: the glow, an off track, a disabled fill, the handle
  ghost: '#9c968a',      // = inkMute, the placeholder colour: 5.39 on the card
  busy: '#3b3731',       // the bright red door 3.87 on it, the off white letters 10.3
  // Red as text and as a small mark is brighter in dark: #d72027 holds only 3.11 to 1 on the
  // charcoal card. The brand's own bright red holds 5.19 as text on the card, and the same as a
  // mark. A red filled control keeps the brand red, with its white label: 5.09, and 3.11 against
  // the card as a boundary.
  red: '#ff5a5f',
  redFill: '#d72027',
  onRed: '#ffffff',
  redText: '#ff5a5f',
  redBright: '#ff5a5f',
  redDark: '#ff8a8f',
  redTint: '#361d1d',    // red on it 5.09
  redOnInk: '#ff5a5f',   // on the raised ink fill: 3.93, where the brand red would hold 2.36
  blush: '#f0b8bb',      // on the raised ink fill: 7.02
  // Danger: lighter and cooler than the red, as it is darker than the red in light. 7.00.
  danger: '#ff8a8f',
  dangerTint: '#361d1d', // danger on it 6.88
  // Done: the teal lightened, hue 186. 6.53 on the card, 6.25 on its tint, and the card's own
  // colour on it 6.53.
  done: '#5fb3bc',
  doneTint: '#15292c',
  info: '#141210',       // = paperDeep
  infoBorder: '#3b3731', // = rule
  infoInk: '#cdc6b8',    // = inkSoft
  plate: '#ffffff',
  shadow: '#000000',
});

export const TOKENS = Object.freeze(Object.keys(LIGHT));
// The CSS variable of a token: paperDeep is --c-paper-deep. Its rgb triplet, for a colour at an
// alpha (rgba(var(--c-paper-rgb), 0.24)), is --c-paper-deep-rgb.
export const cssVar = (token) => `--c-${token.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
export const C = Object.freeze(Object.fromEntries(TOKENS.map((k) => [k, `var(${cssVar(k)})`])));
export const RGB = Object.freeze(Object.fromEntries(TOKENS.map((k) => [k, `var(${cssVar(k)}-rgb)`])));

// Radius system
export const R = { ctrl: 8, card: 12, modal: 16, pill: 999 };

// Shadow system — three levels only, each a variable set with the theme. In dark the shadow is
// black and stronger, since a soft shadow barely shows on the charcoal.
export const SH_LIGHT = Object.freeze({
  rest: '0 1px 2px rgba(15,15,16,.05), 0 4px 16px rgba(15,15,16,.06)',
  raised: '0 2px 4px rgba(15,15,16,.06), 0 16px 40px rgba(15,15,16,.14)',
  modal: '0 4px 8px rgba(15,15,16,.08), 0 32px 80px rgba(15,15,16,.28)',
});
export const SH_DARK = Object.freeze({
  rest: '0 1px 2px rgba(0,0,0,.32), 0 4px 16px rgba(0,0,0,.28)',
  raised: '0 2px 4px rgba(0,0,0,.36), 0 16px 40px rgba(0,0,0,.44)',
  modal: '0 4px 8px rgba(0,0,0,.4), 0 32px 80px rgba(0,0,0,.6)',
});
export const SH = Object.freeze({ rest: 'var(--sh-rest)', raised: 'var(--sh-raised)', modal: 'var(--sh-modal)' });

// Motion language — one curve, one vocabulary
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const FONT = {
  // The metric matched fallbacks (components/ui.js GlobalStyle) sit right behind each webfont.
  sans: "'Inter', 'Inter Fallback', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Fraunces', 'Fraunces Fallback', Georgia, 'Times New Roman', serif",
};
