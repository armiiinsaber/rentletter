// components/theme.js
// Single source of truth for presentation tokens. Presentation-only —
// no data, no logic. Imported by every page; do not fork these per-page.

export const C = {
  // Surfaces
  paper: '#faf8f3',      // page background (brand eggshell)
  paperDeep: '#f2eee3',  // recessed surface
  card: '#fffdf8',       // raised card surface
  // Instrument surfaces — the semantic home of the machine (AI/verification/live-data
  // panels). Paper = human/editorial, instrument = machine, red = signal between them.
  inst: '#101012',       // instrument panel background (near-ink, warm-neutral)
  instRaise: '#1b1b1e',  // raised element on an instrument panel
  instRule: '#2a2a2e',   // hairline on an instrument panel
  instText: '#e8e4d9',   // primary text on instrument (warm, not pure white)
  instMute: '#8f8b81',   // secondary text on instrument
  // Ink
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  inkInverse: '#c8c2b3', // muted text on ink backgrounds
  // Lines
  rule: '#e3ddd0',       // hairline
  ruleDark: '#d6cfbe',   // control borders (needs more affordance than rule)
  // Signal red — brand accent and PRIMARY ACTION only; never errors/destructive (see danger)
  red: '#d72027',
  redBright: '#ff5a5f',  // red for small text/marks on instrument surfaces (contrast)
  redDark: '#a8161c',
  redTint: '#fdf0ef',
  // Danger — errors and destructive actions. Deliberately distinct from brand red so
  // "send report" and "delete listing" never carry the same color.
  danger: '#a8161c',
  dangerTint: '#fdf0ef',
  // Status
  green: '#2d7d4a',
  greenTint: '#eef5f0',
  verified: '#2d7d4a',   // alias with intent — document-verification UI uses this name
  amber: '#b07818',
  amberTint: '#fdf6e9',
  gold: '#b08d57',       // premium notice accent (AI studio gates/limits)
  // Info/notice wells (policy boxes, preference blocks) — paper-toned, no off-brand blue
  info: '#f2eee3',       // = paperDeep
  infoBorder: '#e3ddd0', // = rule
  infoInk: '#3a3a3c',    // = inkSoft
};

// Radius system
export const R = { ctrl: 8, card: 12, modal: 16, pill: 999 };

// Shadow system — three levels only
export const SH = {
  rest: '0 1px 2px rgba(15,15,16,.05), 0 4px 16px rgba(15,15,16,.06)',
  raised: '0 2px 4px rgba(15,15,16,.06), 0 16px 40px rgba(15,15,16,.14)',
  modal: '0 4px 8px rgba(15,15,16,.08), 0 32px 80px rgba(15,15,16,.28)',
};

// Motion language — one curve, one vocabulary
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const FONT = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
};
