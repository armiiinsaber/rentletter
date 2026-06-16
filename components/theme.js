// components/theme.js
// Single source of truth for presentation tokens. Presentation-only —
// no data, no logic. Imported by every page; do not fork these per-page.

export const C = {
  // Surfaces
  paper: '#faf8f3',      // page background (brand eggshell)
  paperDeep: '#f2eee3',  // recessed surface
  card: '#fffdf8',       // raised card surface
  // Ink
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  inkInverse: '#c8c2b3', // muted text on ink backgrounds
  // Lines
  rule: '#e3ddd0',       // hairline
  ruleDark: '#d6cfbe',   // control borders (needs more affordance than rule)
  // Signal red — editorial accent, used like punctuation
  red: '#d72027',
  redDark: '#a8161c',
  redTint: '#fdf0ef',
  // Status
  green: '#2d7d4a',
  greenTint: '#eef5f0',
  amber: '#b07818',
  amberTint: '#fdf6e9',
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
