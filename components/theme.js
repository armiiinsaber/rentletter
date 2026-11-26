// components/theme.js
// Single source of truth for presentation tokens. Presentation-only —
// no data, no logic. Imported by every page; do not fork these per-page.
//
// Two themes, one set of names. LIGHT is the brand's palette as hex, and DARK the same tokens for
// the dark theme. What the pages read is C: each token as its CSS variable (var(--c-paper)), set
// on the root for the theme in force (components/themeMode.js THEME_CSS), so a page follows the
// theme the moment it changes, with no reload. Anything that needs the value itself (the brand
// kit, the door's turning fill, a canvas, a test) reads LIGHT or DARK.
// In dark, ink and paper swap roles: paper is a deep warm charcoal, ink a warm off white, and a
// surface filled with ink (an ink button, an ink pill, an ink band) turns light with dark text on
// it. The instrument surfaces stay ink-black panels in both. Every text pair keeps 4.5 to 1 and
// every mark and control border 3 to 1 in dark (tests/themeContrast.test.mjs).

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
  inkInverse: '#c8c2b3', // muted text on ink backgrounds
  inkInverseMute: '#8f8b81', // an eyebrow on an ink fill, a step quieter than inkInverse (the tenant's applying banner)
  // Lines
  rule: '#e3ddd0',       // hairline
  ruleDark: '#d6cfbe',   // control borders (needs more affordance than rule)
  ghost: '#d6cfbe',      // the ghost of an empty value in a live preview (the new listing form's "The address")
  busy: '#d6cfbe',       // a button's fill while it works, the door turning in it (components/ui.js ConfirmSheet)
  // Signal red — brand accent and PRIMARY ACTION only; never errors/destructive (see danger)
  red: '#d72027',
  redBright: '#ff5a5f',  // red for small text/marks on instrument surfaces (contrast)
  redDark: '#a8161c',
  redTint: '#fdf0ef',
  redOnInk: '#d72027',   // a red mark on an ink fill (the Ready to send tile's dot): the brand red in both themes
  blush: '#f0b8bb',      // a red eyebrow on an ink fill (the FAQ's closing card): 11.4 on ink
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
  inkInverse: '#57524a', // muted text on an ink fill, which is light in dark: 6.75 on ink
  inkInverseMute: '#6b665d', // 4.95 on ink
  rule: '#3b3731',       // hairline: 1.34 on the card, about the step the light rule makes
  ruleDark: '#78726a',   // control borders: 3.33 on the card, 3.69 on paper
  ghost: '#9c968a',      // = inkMute, the placeholder colour: 5.39 on the card
  busy: '#3b3731',       // the bright red door 3.87 on it, the off white letters 10.3
  // Signal red, brighter in dark: #d72027 holds only 3.5 to 1 as text on the charcoal. The brand's
  // own bright red holds 5.19 as text on the card, and 5.75 under paper (charcoal) text on a red
  // button. A mark in red holds the same.
  red: '#ff5a5f',
  redBright: '#ff5a5f',
  redDark: '#ff8a8f',
  redTint: '#361d1d',    // red on it 5.09
  redOnInk: '#d72027',   // on the light ink fill: 4.41, where the bright red would hold 2.66
  blush: '#a8161c',      // on the light ink fill: 6.63
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
