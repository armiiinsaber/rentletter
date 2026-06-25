// lib/brandFonts.js
// Curated heading + body font pairings for a realtor's brand. Each is GENUINELY distinct
// from the others (high-contrast serif, geometric sans, slab, condensed, old-style serif,
// bold display, and two script headings) while staying professional. CSS stacks carry a
// web-safe fallback so previews still read the right category before the Google fonts load.
//
// Every family/weight here maps to a bundled TTF in lib/pdfFonts.js, so the chosen pairing
// embeds into the landlord PDF. `heading.script: true` marks a script face — used for the
// realtor NAME / heading role only; body fonts are always clean and readable, and the PDF
// never uses a script for the unit title or applicant data.

const STACK = {
  inter: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  workSans: "'Work Sans', system-ui, -apple-system, sans-serif",
  poppins: "'Poppins', system-ui, 'Segoe UI', sans-serif",
  playfair: "'Playfair Display', Georgia, 'Times New Roman', serif",
  garamond: "'EB Garamond', Garamond, Georgia, serif",
  robotoSlab: "'Roboto Slab', 'Rockwell', Georgia, serif",
  oswald: "'Oswald', 'Arial Narrow', system-ui, sans-serif",
  archivoBlack: "'Archivo Black', 'Arial Black', system-ui, sans-serif",
  dancing: "'Dancing Script', 'Segoe Script', 'Brush Script MT', cursive",
  greatVibes: "'Great Vibes', 'Snell Roundhand', 'Brush Script MT', cursive",
};

export const FONT_PAIRINGS = [
  {
    id: 'editorial-luxe', name: 'Editorial Luxe', mood: 'Established · high-contrast',
    heading: { family: 'Playfair Display', weight: 700, css: STACK.playfair, letterSpacing: '-0.01em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'modern-minimal', name: 'Modern Minimal', mood: 'Clean · geometric',
    heading: { family: 'Inter', weight: 800, css: STACK.inter, letterSpacing: '-0.03em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'geometric-bold', name: 'Geometric Bold', mood: 'Confident · friendly',
    heading: { family: 'Poppins', weight: 700, css: STACK.poppins, letterSpacing: '-0.01em' },
    body: { family: 'Work Sans', weight: 400, css: STACK.workSans },
  },
  {
    id: 'slab-authority', name: 'Slab Authority', mood: 'Solid · grounded',
    heading: { family: 'Roboto Slab', weight: 700, css: STACK.robotoSlab, letterSpacing: '-0.005em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'condensed-editorial', name: 'Condensed Editorial', mood: 'Tall · modern',
    heading: { family: 'Oswald', weight: 600, css: STACK.oswald, letterSpacing: '0.01em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'classic-heritage', name: 'Classic Heritage', mood: 'Timeless · refined',
    heading: { family: 'EB Garamond', weight: 600, css: STACK.garamond, letterSpacing: '0' },
    body: { family: 'Work Sans', weight: 400, css: STACK.workSans },
  },
  {
    id: 'bold-display', name: 'Bold Display', mood: 'Strong · impactful',
    heading: { family: 'Archivo Black', weight: 400, css: STACK.archivoBlack, letterSpacing: '-0.02em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'humanist-warm', name: 'Humanist Warm', mood: 'Approachable · warm',
    heading: { family: 'Work Sans', weight: 700, css: STACK.workSans, letterSpacing: '-0.01em' },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'signature-script', name: 'Signature Script', mood: 'Personal · handwritten',
    heading: { family: 'Dancing Script', weight: 700, css: STACK.dancing, letterSpacing: '0', script: true },
    body: { family: 'Inter', weight: 400, css: STACK.inter },
  },
  {
    id: 'elegant-script', name: 'Elegant Script', mood: 'Elegant · luxe',
    heading: { family: 'Great Vibes', weight: 400, css: STACK.greatVibes, letterSpacing: '0.01em', script: true },
    body: { family: 'Work Sans', weight: 400, css: STACK.workSans },
  },
];

export const DEFAULT_PAIRING_ID = 'editorial-luxe';
export const findPairing = (id) => FONT_PAIRINGS.find((p) => p.id === id) || null;

// One Google Fonts stylesheet covering every family/weight used above (display=swap).
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Dancing+Script:wght@700&family=EB+Garamond:wght@600&family=Great+Vibes&family=Inter:wght@400;700;800&family=Oswald:wght@600&family=Playfair+Display:wght@700&family=Poppins:wght@700&family=Roboto+Slab:wght@700&family=Work+Sans:wght@400;700&display=swap';

// Lightweight auto-suggestion from brokerage tone (no logo-style metadata yet).
export function suggestPairingId(profile) {
  const b = String(profile?.brokerage || '').toLowerCase();
  if (/\b(luxury|estate|estates|prestige|signature|heritage|boutique)\b/.test(b)) return 'editorial-luxe';
  if (/\b(group|team|realty|properties|homes|modern)\b/.test(b)) return 'modern-minimal';
  return DEFAULT_PAIRING_ID;
}
