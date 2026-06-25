// lib/brandPalette.js
// Pure colour-theory helpers (no deps, browser + server safe). From the realtor's
// primary + secondary picks, derive a harmonious brand palette: primary, secondary,
// an analogous accent, and tinted light/mid/dark neutrals, with readable-text helpers.
// Fed to the profile swatches, the PDF accents, and the future brand kit.

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function hexToRgb(hex) {
  const m = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}
const toHex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
const rgbToHex = (r, g, b) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

export function hexToHsl(hex) {
  const c = hexToRgb(hex);
  if (!c) return null;
  let { r, g, b } = c; r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; const l = (max + min) / 2;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = c; b = x; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function relLum(hex) {
  const c = hexToRgb(hex); if (!c) return 0;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
export function contrastRatio(a, b) {
  const l1 = relLum(a), l2 = relLum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// Pick #0f0f10 or #ffffff for legible text on a given background.
export function readableText(bg) {
  return contrastRatio(bg, '#0f0f10') >= contrastRatio(bg, '#ffffff') ? '#0f0f10' : '#ffffff';
}

// Build a harmonious palette from two brand colours.
export function buildPalette(primary, secondary) {
  const p = hexToHsl(primary) || { h: 355, s: 74, l: 48 };   // brand red fallback
  const s = hexToHsl(secondary) || { h: (p.h + 150) % 360, s: Math.min(p.s, 60), l: 40 };
  // Accent: analogous (~+28° hue) off the more vivid of the two, with a distinct value
  // so it reads as a third, harmonious colour — never a muddy blend.
  const base = s.s >= p.s ? s : p;
  const accent = hslToHex((base.h + 28) % 360, clamp(base.s * 0.9, 45, 82), clamp(base.l < 50 ? base.l + 12 : base.l - 10, 30, 64));
  // Neutrals subtly tinted toward the primary hue for cohesion.
  const nh = p.h;
  return {
    primary: hexToRgb(primary) ? primary.toLowerCase() : hslToHex(p.h, p.s, p.l),
    secondary: hexToRgb(secondary) ? secondary.toLowerCase() : hslToHex(s.h, s.s, s.l),
    accent,
    neutralDark: hslToHex(nh, Math.min(p.s, 14), 13),
    neutralMid: hslToHex(nh, Math.min(p.s, 10), 52),
    neutralLight: hslToHex(nh, Math.min(p.s, 18), 96),
  };
}

// Ordered list for rendering swatches.
export const PALETTE_ORDER = [
  ['primary', 'Primary'], ['secondary', 'Secondary'], ['accent', 'Accent'],
  ['neutralLight', 'Light'], ['neutralMid', 'Mid'], ['neutralDark', 'Dark'],
];
