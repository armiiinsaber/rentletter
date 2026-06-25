// lib/brandFonts.js
// Curated heading + body font pairings for a realtor's brand. Each has a mood and full
// CSS stacks with graceful web-safe fallbacks (so previews still read serif-vs-sans even
// before the Google fonts load). The selected pairing is saved to profiles.brand_fonts
// and will drive the business card / signature / brand kit later.

export const FONT_PAIRINGS = [
  {
    id: 'classic-editorial', name: 'Classic Editorial', mood: 'Established · elegant',
    heading: { family: 'Playfair Display', css: "'Playfair Display', Georgia, 'Times New Roman', serif", weight: 700, letterSpacing: '-0.01em' },
    body: { family: 'Inter', css: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 400 },
  },
  {
    id: 'modern-minimal', name: 'Modern Minimal', mood: 'Clean · contemporary',
    heading: { family: 'Inter', css: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 800, letterSpacing: '-0.02em' },
    body: { family: 'Inter', css: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 400 },
  },
  {
    id: 'bold-geometric', name: 'Bold Geometric', mood: 'Confident · approachable',
    heading: { family: 'Poppins', css: "'Poppins', system-ui, 'Segoe UI', sans-serif", weight: 700, letterSpacing: '-0.01em' },
    body: { family: 'Inter', css: "'Inter', system-ui, -apple-system, sans-serif", weight: 400 },
  },
  {
    id: 'warm-premium', name: 'Warm Premium', mood: 'Warm · high-end',
    heading: { family: 'Fraunces', css: "'Fraunces', Georgia, serif", weight: 600, letterSpacing: '-0.005em' },
    body: { family: 'Work Sans', css: "'Work Sans', system-ui, sans-serif", weight: 400 },
  },
  {
    id: 'trusted-professional', name: 'Trusted Professional', mood: 'Solid · readable',
    heading: { family: 'Source Serif 4', css: "'Source Serif 4', Georgia, serif", weight: 600, letterSpacing: '0' },
    body: { family: 'Work Sans', css: "'Work Sans', system-ui, sans-serif", weight: 400 },
  },
  {
    id: 'structured-modern', name: 'Structured Modern', mood: 'Architectural · precise',
    heading: { family: 'Work Sans', css: "'Work Sans', system-ui, sans-serif", weight: 700, letterSpacing: '0.02em' },
    body: { family: 'Inter', css: "'Inter', system-ui, -apple-system, sans-serif", weight: 400 },
  },
];

export const DEFAULT_PAIRING_ID = 'classic-editorial';
export const findPairing = (id) => FONT_PAIRINGS.find((p) => p.id === id) || null;

// One Google Fonts stylesheet covering every family/weight used above (display=swap).
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;800&family=Playfair+Display:wght@700&family=Poppins:wght@700&family=Source+Serif+4:wght@600&family=Work+Sans:wght@400;700&display=swap';

// Lightweight auto-suggestion. With no explicit logo-style metadata yet, suggest by
// brokerage tone if obvious, else the default. (Extended next stage from logo style.)
export function suggestPairingId(profile) {
  const b = String(profile?.brokerage || '').toLowerCase();
  if (/\b(luxury|estate|estates|prestige|signature|heritage)\b/.test(b)) return 'classic-editorial';
  if (/\b(group|team|realty|properties|homes)\b/.test(b)) return 'modern-minimal';
  return DEFAULT_PAIRING_ID;
}
