// lib/svgSanitize.js
// Server-side validation + light sanitization for AI-generated logo SVGs before we
// ever render or store them. Logos must be self-contained, sandbox-safe vector:
// no scripts, no event handlers, no external/remote references, no embedded raster.
// Returns { ok, svg } — on failure { ok:false, reason }.

const MAX_LEN = 200 * 1024; // 200KB ceiling for a logo SVG

// Patterns that make an SVG unsafe or non-self-contained.
const FORBIDDEN = [
  { re: /<\s*script/i, reason: 'contains <script>' },
  { re: /<\s*foreignObject/i, reason: 'contains <foreignObject>' },
  { re: /<\s*image\b/i, reason: 'contains <image> (raster)' },
  { re: /<!DOCTYPE/i, reason: 'contains DOCTYPE' },
  { re: /<!ENTITY/i, reason: 'contains ENTITY' },
  { re: /\son\w+\s*=/i, reason: 'contains an event handler (on*)' },
  { re: /javascript:/i, reason: 'contains javascript: URI' },
  { re: /\b(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:|\/\/|ftp:)/i, reason: 'external reference' },
  { re: /data:(?!image\/svg)/i, reason: 'embedded data: URI' },
  { re: /url\(\s*["']?\s*(?:https?:|\/\/)/i, reason: 'external url() reference' },
  { re: /@import/i, reason: '@import in styles' },
];

export function validateLogoSvg(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'not a string' };
  let svg = input.trim();

  // Strip XML prolog / DOCTYPE / comments before structural checks.
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '').trim();
  svg = svg.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!svg) return { ok: false, reason: 'empty' };
  if (svg.length > MAX_LEN) return { ok: false, reason: 'too large' };

  // Must be a single, well-formed-enough <svg> ... </svg> root.
  const openMatch = svg.match(/<svg[\s>]/i);
  if (!openMatch) return { ok: false, reason: 'no <svg> root' };
  if (!/<\/svg>\s*$/i.test(svg)) return { ok: false, reason: 'no closing </svg> at end' };
  // Reject anything before the root <svg> (e.g. prose the model leaked).
  if (svg.slice(0, openMatch.index).trim() !== '') return { ok: false, reason: 'content before <svg>' };
  // Exactly one root svg.
  if ((svg.match(/<svg[\s>]/gi) || []).length !== 1) return { ok: false, reason: 'multiple <svg> roots' };

  for (const { re, reason } of FORBIDDEN) {
    if (re.test(svg)) return { ok: false, reason };
  }

  // Ensure the root carries a viewBox (scalable). If missing but width/height exist,
  // synthesize one so downstream rasterizing/scaling behaves.
  if (!/<svg[^>]*\bviewBox\s*=/i.test(svg)) {
    const w = svg.match(/<svg[^>]*\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/i);
    const h = svg.match(/<svg[^>]*\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/i);
    if (w && h) {
      svg = svg.replace(/<svg/i, `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
    } else {
      return { ok: false, reason: 'no viewBox and no width/height' };
    }
  }

  // Guarantee an xmlns so it renders standalone (in <img>/rasterizer).
  if (!/<svg[^>]*\bxmlns\s*=/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return { ok: true, svg };
}
