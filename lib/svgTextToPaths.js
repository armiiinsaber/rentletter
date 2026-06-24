// lib/svgTextToPaths.js
// Server-only. Converts <text>/<tspan> in a logo SVG into vector <path> outlines using
// the bundled Noto Sans, BEFORE rasterizing. This removes any dependency on a font being
// available to resvg at raster time — the #1 reason saved logos lost their text in the
// serverless runtime (resvg couldn't resolve the bundled font, so <text> rendered to
// nothing while shapes survived). After conversion the SVG has no <text>, so the
// rasterized PNG always contains the initials/wordmark. Falls back to the original SVG
// (unchanged) if anything can't be converted, so we never make things worse.
import opentype from 'opentype.js';
import { BRAND_FONT_TTF } from './fonts/brandFont';

let FONT = null;
function getFont() {
  if (FONT !== null) return FONT || null;
  try {
    const ab = BRAND_FONT_TTF.buffer.slice(BRAND_FONT_TTF.byteOffset, BRAND_FONT_TTF.byteOffset + BRAND_FONT_TTF.byteLength);
    FONT = opentype.parse(ab);
  } catch (e) { FONT = false; }
  return FONT || null;
}

const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseAttrs(tag) {
  const o = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) o[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
  if (o.style) o.style.split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o['style-' + d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); });
  return o;
}
const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; };
const pick = (a, ...keys) => { for (const k of keys) { if (a[k] != null && a[k] !== '') return a[k]; } return undefined; };

// Lay out a run of text into a single path `d`, honouring text-anchor + letter-spacing.
function outline(font, text, { x, y, fontSize, anchor, letterSpacing }) {
  if (!text) return null;
  const glyphs = font.stringToGlyphs(text);
  if (!glyphs.length) return null;
  const scale = fontSize / font.unitsPerEm;
  const advances = glyphs.map((g) => (g.advanceWidth || 0) * scale);
  const total = advances.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, glyphs.length - 1);
  let penX = x;
  if (anchor === 'middle') penX = x - total / 2;
  else if (anchor === 'end') penX = x - total;
  const full = new opentype.Path();
  glyphs.forEach((g, i) => { full.extend(g.getPath(penX, y, fontSize)); penX += advances[i] + letterSpacing; });
  const d = full.toPathData(2);
  return d && d.length > 4 ? d : null;
}

export function svgTextToPaths(svg) {
  if (typeof svg !== 'string' || !/<text\b/i.test(svg)) return svg;
  const font = getFont();
  if (!font) return svg; // can't outline → leave original (resvg font config is the fallback)
  try {
    return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (whole, tagAttrs, inner) => {
      const ta = parseAttrs(tagAttrs);
      const bSize = num(pick(ta, 'font-size', 'style-font-size')) ?? 16;
      const bAnchor = String(pick(ta, 'text-anchor', 'style-text-anchor') || 'start').toLowerCase();
      const bFill = pick(ta, 'fill', 'style-fill') || '#000000';
      const bLS = num(pick(ta, 'letter-spacing', 'style-letter-spacing')) ?? 0;
      const bx = num(ta.x) ?? 0;
      const by = num(ta.y) ?? 0;
      const transform = ta.transform;

      const runs = [];
      if (/<tspan\b/i.test(inner)) {
        const tre = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;
        let mm;
        while ((mm = tre.exec(inner))) {
          const sa = parseAttrs(mm[1]);
          const content = decodeEntities(mm[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
          if (!content) continue;
          runs.push({
            text: content,
            x: num(sa.x) ?? bx, y: num(sa.y) ?? by,
            size: num(pick(sa, 'font-size', 'style-font-size')) ?? bSize,
            anchor: String(pick(sa, 'text-anchor', 'style-text-anchor') || bAnchor).toLowerCase(),
            fill: pick(sa, 'fill', 'style-fill') || bFill,
            ls: num(pick(sa, 'letter-spacing', 'style-letter-spacing')) ?? bLS,
          });
        }
      } else {
        const content = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (content) runs.push({ text: content, x: bx, y: by, size: bSize, anchor: bAnchor, fill: bFill, ls: bLS });
      }
      if (!runs.length) return whole;

      const paths = runs.map((r) => {
        const d = outline(font, r.text, { x: r.x, y: r.y, fontSize: r.size, anchor: r.anchor, letterSpacing: r.ls });
        return d ? `<path d="${d}" fill="${escAttr(r.fill)}"/>` : null;
      });
      if (paths.some((p) => p === null)) return whole; // partial failure → keep original
      const joined = paths.join('');
      return transform ? `<g transform="${escAttr(transform)}">${joined}</g>` : joined;
    });
  } catch (e) {
    return svg;
  }
}
