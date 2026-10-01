// scripts/brand/kit.mjs
// The Rentletter brand kit, built from the product's own source: the logo and mark paths
// (lib/brand/logoPaths.js), the colour tokens (components/theme.js), the type scale
// (components/ui.js) and the two self hosted fonts (public/fonts). Nothing is traced or captured
// from a screen: every logo, mark, sheet and page is drawn from those vectors.
//   npm run brand:kit   (node scripts/brand/build-brand.mjs kit)
// Writes public/brand/kit:
//   Rentletter-Brand-Kit/       every file, as static files the admin page links one by one
//   Rentletter-Brand-Kit.zip    the same folder, zipped
//   manifest.json               each file with its size and hash, the groups the admin page shows,
//                               the mark contrast pairs and the source hashes (scripts/brand/kitSources.mjs)
//   previews/                   small previews for the admin page, not part of the kit
// Needs python3 with fontTools and brotli (scripts/brand/font-instance.py) for the font files and
// the text on the sheets.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, crc32 } from 'node:zlib';
import { createRequire } from 'node:module';
import { LOGO, MARK } from '../../lib/brand/logoPaths.js';
import { C, R } from '../../components/theme.js';
import { PALETTES, IOS_RADIUS, logoSvg, markSvg, bareFrame, r2 } from './draw.mjs';
import { kitSources, typeScale } from './kitSources.mjs';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const { Resvg } = require('@resvg/resvg-js');
const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setCharacterSpacing } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = process.cwd();
const OUT = join(ROOT, 'public/brand/kit');
const KIT = 'Rentletter-Brand-Kit';
const WHITE = C.card;
// Every PDF carries this date, so a rebuild from the same source writes the same bytes.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

// ── COLOUR ───────────────────────────────────────────────────────────────────────────────────
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = hexRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// A plain device CMYK conversion. Print shops profile their own presses, so the sheet says approximate.
const cmyk = (h) => { const [r, g, b] = hexRgb(h).map((v) => v / 255); const k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100]; return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100)); };
const pdfColour = (h) => { const [r, g, b] = hexRgb(h); return rgb(r / 255, g / 255, b / 255); };

// The palette: every colour token the product draws with, by group, with its job. The status
// colours (green, amber, gold) and the tints stay out: they are states, not the brand.
export const PALETTE = [
  ['paper', 'Paper', 'Page ground'], ['paperDeep', 'Paper deep', 'Recessed surface'], ['card', 'White', 'Cards'],
  ['rule', 'Rule', 'Hairlines'], ['ruleDark', 'Rule dark', 'Control borders'],
  ['ink', 'Ink', 'Text and the logo'], ['inkSoft', 'Ink soft', 'Secondary text'], ['inkMute', 'Ink mute', 'Quiet text'],
  ['red', 'Signal red', 'The bar, one primary action'], ['danger', 'Danger', 'Errors and delete'],
  ['inst', 'Instrument', 'Ink panels'], ['instRaise', 'Instrument raised', 'Raised on ink'], ['instRule', 'Instrument rule', 'Hairlines on ink'],
  ['instText', 'Instrument text', 'Text on ink'], ['instMute', 'Instrument mute', 'Quiet text on ink'], ['redBright', 'Red bright', 'Red on ink'],
].map(([token, name, role]) => ({ token, name, role, hex: C[token], rgb: hexRgb(C[token]), cmyk: cmyk(C[token]) }));

// ── FONTS ────────────────────────────────────────────────────────────────────────────────────
// Static instances for the text on the sheets and in the PDFs, and the variable files for type/.
const tmp = mkdtempSync(join(tmpdir(), 'rl-kit-'));
const FONT_SRC = { inter: 'public/fonts/inter-latin.woff2', fraunces: 'public/fonts/fraunces-latin.woff2' };
const INSTANCES = {
  i400: ['inter', 'wght=400'], i500: ['inter', 'wght=500'], i600: ['inter', 'wght=600'], i700: ['inter', 'wght=700'],
  f18: ['fraunces', 'wght=600', 'opsz=18'], f22: ['fraunces', 'wght=600', 'opsz=22'], f28: ['fraunces', 'wght=600', 'opsz=28'], f72: ['fraunces', 'wght=600', 'opsz=72'],
};
const fontFile = {}; const otf = {};
function loadFonts() {
  for (const [key, [fam, ...axes]] of Object.entries(INSTANCES)) {
    const out = join(tmp, `${key}.ttf`);
    execFileSync('python3', ['scripts/brand/font-instance.py', FONT_SRC[fam], out, ...axes], { stdio: 'ignore' });
    fontFile[key] = readFileSync(out); otf[key] = opentype.loadSync(out);
  }
  for (const fam of Object.keys(FONT_SRC)) execFileSync('python3', ['scripts/brand/font-instance.py', FONT_SRC[fam], join(tmp, `${fam}-var.ttf`)], { stdio: 'ignore' });
}

// ── SCENES ───────────────────────────────────────────────────────────────────────────────────
// A sheet or a page is a scene: a size, a ground and a list of items in points (top left origin).
// The same scene draws to SVG (for the PNG) and to PDF, so the two never differ.
//   rect { x, y, w, h, fill, rx, stroke, sw, opacity }   line { x1, y1, x2, y2, stroke, sw, dash }
//   text { x, y (baseline), str, font, size, fill, tracking (em), anchor, opacity }
//   logo { x, y, height, ink, bar, opacity }   mark { x, y, size, palette, rounded, bare, colour }
//   group { m: [a, b, c, d, e, f], items }   (an SVG matrix in the scene's own units)
const textWidth = (it) => otf[it.font].getAdvanceWidth(it.str, it.size, { kerning: true, letterSpacing: it.tracking || 0 }) - (it.tracking || 0) * it.size;
const anchorX = (it, w) => (it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x);
const rrPath = (w, h, r) => { const k = r * 0.4477; return `M${r} 0H${w - r}C${w - k} 0 ${w} ${k} ${w} ${r}V${h - r}C${w} ${h - k} ${w - k} ${h} ${w - r} ${h}H${r}C${k} ${h} 0 ${h - k} 0 ${h - r}V${r}C0 ${k} ${k} 0 ${r} 0Z`; };
const n = (v) => r2(v);

function svgItem(it) {
  const op = it.opacity != null && it.opacity < 1 ? ` opacity="${it.opacity}"` : '';
  switch (it.t) {
    case 'rect': return `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.rx ? ` rx="${n(it.rx)}"` : ''} fill="${it.fill || 'none'}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw || 1}"` : ''}${op}/>`;
    case 'line': return `<line x1="${n(it.x1)}" y1="${n(it.y1)}" x2="${n(it.x2)}" y2="${n(it.y2)}" stroke="${it.stroke}" stroke-width="${it.sw || 1}"${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}${op}/>`;
    case 'text': { const w = textWidth(it); const d = otf[it.font].getPath(it.str, anchorX(it, w), it.y, it.size, { kerning: true, letterSpacing: it.tracking || 0 }).toPathData(2); return `<path d="${d}" fill="${it.fill}"${op}/>`; }
    case 'logo': { const s = it.height / LOGO.h; return `<g transform="translate(${n(it.x)} ${n(it.y)}) scale(${r2(s * 1e4) / 1e4})"${op}><rect x="${LOGO.bar.x}" y="${LOGO.bar.y}" width="${LOGO.bar.w}" height="${LOGO.bar.h}" rx="${LOGO.bar.rx}" fill="${it.bar}"/><path d="${LOGO.text}" fill="${it.ink}"/></g>`; }
    case 'mark': {
      const s = it.size / MARK.size; const m = MARK.any; const b = m.bar;
      if (it.bare) { const f = bareFrame(MARK); return `<g transform="translate(${n(it.x)} ${n(it.y)}) scale(${r2(s * 1e4) / 1e4}) translate(${r2(f.tx)} ${r2(f.ty)}) scale(${r2(f.k * 1e4) / 1e4})"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}" fill="${it.colour}"/><path d="${m.r}" fill="${it.colour}"/></g>`; }
      const { ground, stripe, letter } = it.palette;
      return `<g transform="translate(${n(it.x)} ${n(it.y)}) scale(${r2(s * 1e4) / 1e4})"><rect width="${MARK.size}" height="${MARK.size}"${it.rounded ? ` rx="${r2(MARK.size * IOS_RADIUS)}"` : ''} fill="${ground}"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}" fill="${stripe}"/><path d="${m.r}" fill="${letter}"/></g>`;
    }
    case 'group': return `<g transform="matrix(${it.m.map((v) => r2(v * 1e4) / 1e4).join(' ')})">${it.items.map(svgItem).join('')}</g>`;
    default: throw new Error(`Unknown scene item ${it.t}`);
  }
}
export const sceneSvg = (sc) => `<svg xmlns="http://www.w3.org/2000/svg" width="${sc.w}" height="${sc.h}" viewBox="0 0 ${sc.w} ${sc.h}">${sc.bg ? `<rect width="${sc.w}" height="${sc.h}" fill="${sc.bg}"/>` : ''}${sc.items.map(svgItem).join('')}</svg>`;

// Affine matrices as [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
const mul = (P, Q) => [P[0] * Q[0] + P[2] * Q[1], P[1] * Q[0] + P[3] * Q[1], P[0] * Q[2] + P[2] * Q[3], P[1] * Q[2] + P[3] * Q[3], P[0] * Q[4] + P[2] * Q[5] + P[4], P[1] * Q[4] + P[3] * Q[5] + P[5]];

async function pdfItems(page, H, items, font) {
  const Y = (y) => H - y;
  for (const it of items) {
    const opacity = it.opacity ?? 1;
    switch (it.t) {
      case 'rect': {
        const fill = it.fill && it.fill !== 'none' ? pdfColour(it.fill) : undefined;
        if (it.rx) page.drawSvgPath(rrPath(it.w, it.h, it.rx), { x: it.x, y: Y(it.y), scale: 1, color: fill, borderColor: it.stroke ? pdfColour(it.stroke) : undefined, borderWidth: it.stroke ? it.sw || 1 : 0, opacity, borderOpacity: opacity });
        else page.drawRectangle({ x: it.x, y: Y(it.y + it.h), width: it.w, height: it.h, color: fill, borderColor: it.stroke ? pdfColour(it.stroke) : undefined, borderWidth: it.stroke ? it.sw || 1 : 0, opacity, borderOpacity: opacity });
        break;
      }
      case 'line': page.drawLine({ start: { x: it.x1, y: Y(it.y1) }, end: { x: it.x2, y: Y(it.y2) }, thickness: it.sw || 1, color: pdfColour(it.stroke), dashArray: it.dash, opacity }); break;
      case 'text': {
        const f = await font(it.font); const tr = (it.tracking || 0) * it.size;
        const w = f.widthOfTextAtSize(it.str, it.size) + tr * (it.str.length - 1);
        if (tr) page.pushOperators(pushGraphicsState(), setCharacterSpacing(tr));
        page.drawText(it.str, { x: anchorX(it, w), y: Y(it.y), size: it.size, font: f, color: pdfColour(it.fill), opacity });
        if (tr) page.pushOperators(popGraphicsState());
        break;
      }
      case 'logo': { const s = it.height / LOGO.h; page.drawSvgPath(LOGO.barPath, { x: it.x, y: Y(it.y), scale: s, color: pdfColour(it.bar), opacity }); page.drawSvgPath(LOGO.text, { x: it.x, y: Y(it.y), scale: s, color: pdfColour(it.ink), opacity }); break; }
      case 'mark': {
        const s = it.size / MARK.size; const m = MARK.any; const b = m.bar;
        const bar = (x, y, k, colour) => page.drawSvgPath(rrPath(b.w, b.h, b.rx), { x: x + b.x * k, y: Y(y + b.y * k), scale: k, color: pdfColour(colour) });
        if (it.bare) { const f = bareFrame(MARK); const k = s * f.k; const x = it.x + f.tx * s, y = it.y + f.ty * s; bar(x, y, k, it.colour); page.drawSvgPath(m.r, { x, y: Y(y), scale: k, color: pdfColour(it.colour) }); break; }
        const { ground, stripe, letter } = it.palette;
        if (it.rounded) page.drawSvgPath(rrPath(MARK.size, MARK.size, MARK.size * IOS_RADIUS), { x: it.x, y: Y(it.y), scale: s, color: pdfColour(ground) });
        else page.drawRectangle({ x: it.x, y: Y(it.y + it.size), width: it.size, height: it.size, color: pdfColour(ground) });
        bar(it.x, it.y, s, stripe); page.drawSvgPath(m.r, { x: it.x, y: Y(it.y), scale: s, color: pdfColour(letter) });
        break;
      }
      case 'group': {
        const F = [1, 0, 0, -1, 0, H]; const cm = mul(F, mul(it.m, F));
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...cm));
        await pdfItems(page, H, it.items, font);
        page.pushOperators(popGraphicsState());
        break;
      }
      default: throw new Error(`Unknown scene item ${it.t}`);
    }
  }
}
async function scenesPdf(scenes, title) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  doc.setTitle(title); doc.setAuthor('Rentletter'); doc.setCreator('npm run brand:kit'); doc.setProducer('Rentletter brand kit');
  doc.setCreationDate(FIXED_DATE); doc.setModificationDate(FIXED_DATE);
  const embedded = {}; const font = async (key) => (embedded[key] ||= await doc.embedFont(fontFile[key], { subset: false }));
  for (const sc of scenes) {
    const page = doc.addPage([sc.w, sc.h]);
    if (sc.bg) page.drawRectangle({ x: 0, y: 0, width: sc.w, height: sc.h, color: pdfColour(sc.bg) });
    await pdfItems(page, sc.h, sc.items, font);
  }
  return Buffer.from(await doc.save());
}
const png = (svg, width) => Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false }, ...(width ? { fitTo: { mode: 'width', value: width } } : {}) }).render().asPng());

// Text helpers: a line, and a paragraph wrapped to a width with no single word left on its last line.
const T = (x, y, str, font, size, fill, o = {}) => ({ t: 'text', x, y, str, font, size, fill, ...o });
function para(x, y, str, { font = 'i400', size = 12, lh = 1.5, maxW, fill = C.inkSoft, anchor } = {}) {
  const words = str.split(' '); const lines = []; let cur = '';
  const w = (s) => otf[font].getAdvanceWidth(s, size, { kerning: true });
  for (const word of words) { const next = cur ? `${cur} ${word}` : word; if (cur && w(next) > maxW) { lines.push(cur); cur = word; } else cur = next; }
  if (cur) lines.push(cur);
  if (lines.length > 1 && !lines[lines.length - 1].includes(' ')) { const prev = lines[lines.length - 2].split(' '); if (prev.length > 1) { const moved = prev.pop(); const joined = `${moved} ${lines[lines.length - 1]}`; if (w(joined) <= maxW) { lines[lines.length - 2] = prev.join(' '); lines[lines.length - 1] = joined; } } }
  return lines.map((l, i) => T(x, y + i * size * lh, l, font, size, fill, anchor ? { anchor } : {}));
}

// ── THE SHEETS AND PAGES (A4 landscape, in points) ───────────────────────────────────────────
const PW = 842, PH = 595, M = 48;
function frame(title, sub, page) {
  return [
    { t: 'logo', x: M, y: 34, height: 14, ink: C.ink, bar: C.red },
    T(PW - M, 44, page ? `Brand guidelines, ${page}` : 'Brand kit', 'i500', 9, C.inkMute, { anchor: 'end' }),
    T(M, 104, title, 'f28', 28, C.ink, { tracking: -0.02 }),
    ...para(M, 128, sub, { size: 12, maxW: 560 }),
  ];
}

// The palette sheet: four by four swatches. Returns the scene and each swatch's rectangle.
function paletteScene() {
  const items = frame('Colour', 'Every colour token the product draws with. CMYK values are approximate: match print by eye.');
  const cols = 4, gapX = 14, top = 160, rowH = 96, gapY = 10; const colW = (PW - 2 * M - gapX * (cols - 1)) / cols;
  const swatches = [];
  PALETTE.forEach((p, i) => {
    const x = M + (i % cols) * (colW + gapX), y = top + Math.floor(i / cols) * (rowH + gapY);
    items.push({ t: 'rect', x, y, w: colW, h: 42, rx: 6, fill: p.hex, stroke: C.rule, sw: 1 });
    swatches.push({ token: p.token, hex: p.hex, x: x + 4, y: y + 4, w: colW - 8, h: 34 });
    items.push(T(x, y + 57, p.name, 'i600', 10, C.ink), T(x + colW, y + 57, p.token, 'i400', 8.5, C.inkMute, { anchor: 'end' }));
    items.push(T(x, y + 70, p.role, 'i400', 8.5, C.inkSoft));
    items.push(T(x, y + 82, `${p.hex.toUpperCase()}   RGB ${p.rgb.join(' ')}`, 'i400', 8.5, C.ink));
    items.push(T(x, y + 94, `CMYK ${p.cmyk.join(' ')} (approximate)`, 'i400', 8.5, C.ink));
  });
  return { scene: { w: PW, h: PH, bg: C.paper, items }, swatches };
}

// The type specimen: the product's scale, then the two families.
function specimenScene(scale) {
  const items = frame('Type', 'Fraunces sets display lines, Inter sets everything else. This is the scale the product uses.');
  const rows = [
    [scale.d1, 'f28', 'Fraunces 600', 'Your applicants, ranked.', -0.02],
    [scale.d2, 'f22', 'Fraunces 600', 'Shortlist for your landlord', -0.015],
    [scale.d3, 'f18', 'Fraunces 600', 'Pipeline', -0.01],
    [scale.body, 'i400', 'Inter 400', 'Rentletter organizes your applicants.', 0],
    [scale['body-2'], 'i400', 'Inter 400', '8 applicants, 1 verified, report not sent', 0],
    [scale.eyebrow, 'i700', 'Inter 700, tracked', 'LISTING STATUS', 0.1],
  ];
  let y = 196;
  for (const [size, font, face, sample, tracking] of rows) {
    items.push(T(M, y, `${size}`, 'i600', 10, C.ink), T(M + 28, y, face, 'i400', 10, C.inkMute));
    items.push(T(M + 170, y, sample, font, size, C.ink, { tracking }));
    items.push({ t: 'line', x1: M, y1: y + 14, x2: PW - M, y2: y + 14, stroke: C.rule, sw: 0.75 });
    y += Math.max(40, size * 1.15 + 20);
  }
  const boxY = y + 6, boxH = PH - 40 - boxY, boxW = (PW - 2 * M - 16) / 2;
  [['f72', 'Fraunces', 'Display. Weight 600. Latin.'], ['i500', 'Inter', 'Text. Weights 400 to 700. Latin.']].forEach(([font, name, note], i) => {
    const x = M + i * (boxW + 16);
    items.push({ t: 'rect', x, y: boxY, w: boxW, h: boxH, rx: 10, fill: C.card, stroke: C.rule, sw: 1 });
    items.push(T(x + 20, boxY + boxH - 26, 'Aa', font, 56, C.ink, { tracking: font === 'f72' ? -0.02 : 0 }));
    items.push(T(x + 110, boxY + boxH - 50, name, 'i600', 13, C.ink), T(x + 110, boxY + boxH - 32, note, 'i400', 10, C.inkSoft));
    items.push(T(x + 110, boxY + boxH - 18, 'SIL Open Font License, in type/', 'i400', 10, C.inkMute));
  });
  return { w: PW, h: PH, bg: C.paper, items };
}

// The guidelines, five pages.
function guidelinePages(scale) {
  const pages = [];
  const rh = (height) => (height * 100) / LOGO.h; // the R's height for a logo drawn at this height
  // 1. The logo and its clear space.
  {
    const items = frame('The logo', 'The red bar and the word Rentletter, drawn as one. Keep clear space the height of the R on every side.', 1);
    const h = 80, w = (LOGO.w * h) / LOGO.h, cs = rh(h);
    const x = (PW - w) / 2, y = 244;
    items.push({ t: 'rect', x: x - cs, y: y - cs, w: w + 2 * cs, h: h + 2 * cs, fill: C.card, stroke: C.ruleDark, sw: 1 });
    items.push({ t: 'rect', x, y, w, h, fill: 'none', stroke: C.ruleDark, sw: 0.75 });
    for (const [bx, by] of [[x - cs, y + (h - cs) / 2], [x + w, y + (h - cs) / 2], [x + (w - cs) / 2, y - cs], [x + (w - cs) / 2, y + h]]) {
      items.push({ t: 'rect', x: bx, y: by, w: cs, h: cs, fill: C.paperDeep, stroke: C.rule, sw: 0.75 });
      items.push(T(bx + cs / 2, by + cs * 0.78, 'R', 'f72', cs * 0.72, C.inkMute, { anchor: 'middle' }));
    }
    items.push({ t: 'logo', x, y, height: h, ink: C.ink, bar: C.red });
    items.push(...para(PW / 2, y + h + cs + 40, 'Clear space: the height of the R, on every side.', { size: 11, maxW: 400, fill: C.inkMute, anchor: 'middle' }));
    pages.push({ w: PW, h: PH, bg: C.paper, items });
  }
  // 2. Minimum size, and which version on which ground.
  {
    const items = frame('Size and ground', 'The logo is never smaller than 80px wide on screen. The mark is never smaller than 16px.', 2);
    const y0 = 176;
    items.push(T(M, y0, 'Minimum size', 'i600', 11, C.ink));
    const lh80 = (80 * LOGO.h) / LOGO.w;
    items.push({ t: 'rect', x: M, y: y0 + 14, w: 200, h: 70, rx: 8, fill: C.card, stroke: C.rule, sw: 1 });
    items.push({ t: 'logo', x: M + 20, y: y0 + 14 + (70 - lh80) / 2, height: lh80, ink: C.ink, bar: C.red });
    items.push({ t: 'mark', x: M + 150, y: y0 + 14 + 27, size: 16, palette: PALETTES.realtor, rounded: true });
    items.push(T(M, y0 + 104, 'Logo: 80px wide.', 'i400', 10, C.inkSoft), T(M, y0 + 118, 'Mark: 16px.', 'i400', 10, C.inkSoft));
    const gx = M + 250, gw = (PW - M - gx - 16) / 2, gh = 118;
    items.push(T(gx, y0, 'Which version on which ground', 'i600', 11, C.ink));
    const grounds = [
      [C.paper, C.ink, C.red, 'Paper: the primary.'], [C.card, C.ink, C.red, 'White: the primary.'],
      [C.inst, C.paper, C.red, 'Ink: the reversed.'], [C.red, C.card, C.card, 'Red or a dark photo: mono white.'],
    ];
    grounds.forEach(([g, ink, bar, cap], i) => {
      const x = gx + (i % 2) * (gw + 16), y = y0 + 14 + Math.floor(i / 2) * (gh + 30);
      const lh = 26, lw = (LOGO.w * lh) / LOGO.h;
      items.push({ t: 'rect', x, y, w: gw, h: gh, rx: 8, fill: g, stroke: C.rule, sw: 1 });
      items.push({ t: 'logo', x: x + (gw - lw) / 2, y: y + (gh - lh) / 2, height: lh, ink, bar });
      items.push(T(x, y + gh + 16, cap, 'i400', 10, C.inkSoft));
    });
    items.push(...para(M, y0 + 160, 'One colour print uses mono ink. Never set the primary on a ground it does not read on.', { size: 10, maxW: 200, fill: C.inkSoft }));
    pages.push({ w: PW, h: PH, bg: C.paper, items });
  }
  // 3. The two app marks.
  {
    const items = frame('The app marks', 'Two square marks share one drawing: the stripe and the R. The ground tells the two apps apart.', 3);
    const s = 132, y = 196;
    const cards = [
      [PALETTES.realtor, 'Realtor', 'The app realtors add to the Home Screen. Also the favicon and every realtor page.'],
      [PALETTES.admin, 'Admin', 'The founder admin app. Never on a realtor, tenant or landlord page.'],
    ];
    cards.forEach(([palette, name, note], i) => {
      const x = M + i * 380;
      items.push({ t: 'mark', x, y, size: s, palette, rounded: true });
      items.push(T(x + s + 24, y + 30, name, 'f22', 22, C.ink, { tracking: -0.015 }));
      items.push(...para(x + s + 24, y + 56, note, { size: 11, maxW: 190 }));
    });
    const y2 = y + s + 56;
    items.push(T(M, y2, 'Bare marks and inverted grounds', 'i600', 11, C.ink));
    const small = 56; const row = [
      { t: 'mark', palette: { ground: C.inst, stripe: C.red, letter: C.card }, rounded: true },
      { t: 'mark', palette: { ground: C.red, stripe: C.inst, letter: C.instText }, rounded: true },
      { bare: true, colour: C.ink, ground: C.paper }, { bare: true, colour: C.paper, ground: C.inst },
    ];
    row.forEach((it, i) => {
      const x = M + i * (small + 24);
      if (it.bare) { items.push({ t: 'rect', x, y: y2 + 14, w: small, h: small, rx: 10, fill: it.ground, stroke: C.rule, sw: 1 }); items.push({ t: 'mark', x, y: y2 + 14, size: small, bare: true, colour: it.colour }); }
      else items.push({ t: 'mark', x, y: y2 + 14, size: small, palette: it.palette, rounded: true });
    });
    items.push(...para(M + 4 * (small + 24) + 8, y2 + 30, 'Inverted marks sit on grounds that match the main colour. Bare marks go where a square will not fit.', { size: 11, maxW: 380 }));
    pages.push({ w: PW, h: PH, bg: C.paper, items });
  }
  // 4. Colour and type.
  {
    const items = frame('Colour and type', 'Paper and ink carry the page. Red is the signal: the bar, and one primary action on a screen.', 4);
    const keys = ['paper', 'card', 'rule', 'ink', 'inkMute', 'red', 'inst'];
    const sw = (PW - 2 * M - 12 * (keys.length - 1)) / keys.length;
    keys.forEach((k, i) => {
      const p = PALETTE.find((x) => x.token === k); const x = M + i * (sw + 12), y = 176;
      items.push({ t: 'rect', x, y, w: sw, h: 70, rx: 8, fill: p.hex, stroke: C.rule, sw: 1 });
      items.push(T(x, y + 88, p.name, 'i600', 10, C.ink), T(x, y + 102, p.hex.toUpperCase(), 'i400', 9, C.inkSoft));
    });
    const ty = 330;
    items.push(T(M, ty, 'Fraunces', 'f28', 28, C.ink, { tracking: -0.02 }), T(M, ty + 22, 'Display lines at 28, 22 and 18. Weight 600.', 'i400', 11, C.inkSoft));
    items.push(T(PW / 2, ty, 'Inter', 'i600', 28, C.ink), T(PW / 2, ty + 22, `Text at ${scale.body} and ${scale['body-2']}, labels at ${scale.eyebrow}. Weights 400 to 700.`, 'i400', 11, C.inkSoft));
    items.push({ t: 'line', x1: M, y1: ty + 44, x2: PW - M, y2: ty + 44, stroke: C.rule, sw: 0.75 });
    items.push(T(M, ty + 84, 'Your applicants, ranked.', 'f28', 28, C.ink, { tracking: -0.02 }));
    items.push(T(M, ty + 114, 'Rentletter organizes your applicants. Run credit checks wherever you already do.', 'i400', 16, C.ink));
    items.push(T(M, ty + 144, 'LISTING STATUS', 'i700', 11, C.inkMute, { tracking: 0.1 }));
    pages.push({ w: PW, h: PH, bg: C.paper, items });
  }
  // 5. Do not.
  {
    const items = frame('Do not', 'The logo only ever appears as drawn in this kit.', 5);
    // Three tiles, then two, the same size.
    const cols = 3, gap = 16, tw = (PW - 2 * M - gap * (cols - 1)) / cols, th = 128, top = 168;
    const lh = 24, lw = (LOGO.w * lh) / LOGO.h;
    const tiles = [
      ['Do not stretch it.', (cx, cy) => [{ t: 'group', m: [1.45, 0, 0, 0.7, cx - 1.45 * cx, cy - 0.7 * cy], items: [{ t: 'logo', x: cx - lw / 2, y: cy - lh / 2, height: lh, ink: C.ink, bar: C.red }] }]],
      ['Do not recolour the bar.', (cx, cy) => [{ t: 'logo', x: cx - lw / 2, y: cy - lh / 2, height: lh, ink: C.ink, bar: C.inkMute }]],
      ['Do not add effects.', (cx, cy) => [1, 2, 3, 4].map((d) => ({ t: 'logo', x: cx - lw / 2 + d, y: cy - lh / 2 + d, height: lh, ink: C.ink, bar: C.ink, opacity: 0.12 })).concat([{ t: 'logo', x: cx - lw / 2, y: cy - lh / 2, height: lh, ink: C.ink, bar: C.red }])],
      ['Do not rotate it.', (cx, cy) => { const a = (-14 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [{ t: 'group', m: [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy], items: [{ t: 'logo', x: cx - lw / 2, y: cy - lh / 2, height: lh, ink: C.ink, bar: C.red }] }]; }],
      ['Do not set the primary on a busy photo.', (cx, cy, x0, y0) => busy(x0, y0, tw, th).concat([{ t: 'logo', x: cx - lw / 2, y: cy - lh / 2, height: lh, ink: C.ink, bar: C.red }])],
    ];
    tiles.forEach(([cap, draw], i) => {
      const x = M + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + 64);
      items.push({ t: 'rect', x, y, w: tw, h: th, rx: 8, fill: C.card, stroke: C.rule, sw: 1 });
      items.push(...draw(x + tw / 2, y + th / 2, x, y));
      items.push(...para(x, y + th + 18, cap, { size: 10, maxW: tw, fill: C.ink, font: 'i500' }));
    });
    pages.push({ w: PW, h: PH, bg: C.paper, items });
  }
  return pages;
}
// A stand in for a busy photograph: overlapping blocks in the product's own tones, from a fixed
// seed so every build draws the same one.
function busy(x0, y0, w, h) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tones = [C.inkSoft, C.inkMute, C.ruleDark, C.paperDeep, C.instRaise, C.red, C.instMute, C.rule];
  const out = [{ t: 'rect', x: x0 + 1, y: y0 + 1, w: w - 2, h: h - 2, rx: 7, fill: C.instMute }];
  for (let i = 0; i < 70; i++) { const bw = 6 + rnd() * 34, bh = 6 + rnd() * 30; out.push({ t: 'rect', x: x0 + 2 + rnd() * (w - bw - 4), y: y0 + 2 + rnd() * (h - bh - 4), w: bw, h: bh, rx: rnd() * 6, fill: tones[Math.floor(rnd() * tones.length)], opacity: 0.85 }); }
  return out;
}

// ── THE OFL ──────────────────────────────────────────────────────────────────────────────────
// The license text is the SIL Open Font License 1.1 exactly as SIL publishes it, under each
// family's own copyright line (read from the font's name table).
const OFL_BODY = `This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) and the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
`;
const copyrightOf = (key) => { const names = otf[key].names; const c = names.copyright; return (c && (c.en || Object.values(c)[0])) || ''; };

// ── ZIP ──────────────────────────────────────────────────────────────────────────────────────
// A plain zip (deflate), every entry dated 1 January 2026, so the same files zip to the same bytes.
function zipOf(entries) {
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1, TIME = 0;
  const locals = []; const central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8'); const deflated = deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length; const body = store ? data : deflated; const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(store ? 0 : 8, 8); lh.writeUInt16LE(TIME, 10); lh.writeUInt16LE(DATE, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(store ? 0 : 8, 10); ch.writeUInt16LE(TIME, 12); ch.writeUInt16LE(DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt32LE(0, 34); ch.writeUInt32LE(0o100644 * 65536, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ── THE KIT ──────────────────────────────────────────────────────────────────────────────────
export const LOGO_BASE = 600;
export const MARK_SIZES = [1024, 512, 180, 64, 32, 16];
export const LOGOS = [
  { key: 'primary', title: 'Primary', note: 'Ink word, red bar. For paper and white.', ink: C.ink, bar: C.red, ground: null, preview: 'paper' },
  { key: 'reversed', title: 'Reversed', note: 'Paper word, red bar. For ink.', ink: C.paper, bar: C.red, ground: null, preview: 'ink' },
  { key: 'mono-ink', title: 'Mono ink', note: 'One colour print on light grounds.', ink: C.ink, bar: C.ink, ground: null, preview: 'paper' },
  { key: 'mono-white', title: 'Mono white', note: 'One colour on red and dark photos.', ink: WHITE, bar: WHITE, ground: null, preview: 'ink' },
  { key: 'on-paper', title: 'On paper', note: 'The primary on paper, clear space included.', ink: C.ink, bar: C.red, ground: C.paper, preview: 'paper' },
  { key: 'on-ink', title: 'On ink', note: 'The reversed on ink, clear space included.', ink: C.paper, bar: C.red, ground: C.inst, preview: 'ink' },
];
export const MARKS = [
  { key: 'realtor', title: 'Realtor', note: 'The realtor app: Home Screen, favicon, realtor pages.', palette: PALETTES.realtor },
  { key: 'admin', title: 'Admin', note: 'The founder admin app only.', palette: PALETTES.admin },
  { key: 'realtor-inverted', title: 'Realtor inverted', note: 'Ink ground, red stripe, white R.', palette: { ground: C.inst, stripe: C.red, letter: C.card } },
  { key: 'admin-inverted', title: 'Admin inverted', note: 'Red ground, ink stripe, paper R.', palette: { ground: C.red, stripe: C.inst, letter: C.instText } },
];
export const BARE = [
  { key: 'bare-ink', title: 'Bare ink', note: 'The stripe and R alone, for paper and white.', colour: C.ink, ground: C.paper },
  { key: 'bare-paper', title: 'Bare paper', note: 'The stripe and R alone, for ink.', colour: C.paper, ground: C.inst },
];
const TOKEN_OF = Object.fromEntries(Object.entries(C).reverse().map(([k, v]) => [v, k]));
const name = (hex) => TOKEN_OF[hex] || hex;

export async function buildKit() {
  loadFonts();
  const scale = typeScale(ROOT);
  const files = new Map(); // path inside the kit folder -> bytes
  const put = (p, data) => files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
  const groups = [];

  // Logos.
  const logoGroup = { key: 'logo', title: 'Logo', items: [] };
  for (const L of LOGOS) {
    const W = LOGO_BASE; let H, height;
    if (L.ground) { const s = LOGO_BASE / (LOGO.w + 200); height = s * LOGO.h; H = Math.ceil(s * (LOGO.h + 200)); }
    else { height = ((LOGO_BASE - 4) * LOGO.h) / LOGO.w; H = Math.ceil(height) + 2; } // 2px of air on every side
    const svg = logoSvg(LOGO, { height, ink: L.ink, bar: L.bar, bg: L.ground, w: W, h: H });
    const base = `logo/rentletter-logo-${L.key}`;
    put(`${base}.svg`, svg);
    const s = height / LOGO.h;
    put(`${base}.pdf`, await scenesPdf([{ w: W, h: H, bg: L.ground, items: [{ t: 'logo', x: (W - LOGO.w * s) / 2, y: (H - LOGO.h * s) / 2, height, ink: L.ink, bar: L.bar }] }], `Rentletter logo, ${L.title.toLowerCase()}`));
    for (const k of [1, 2, 4]) put(`${base}-${k}x.png`, png(svg, W * k));
    logoGroup.items.push({ key: L.key, title: L.title, note: L.note, ground: L.ground ? null : L.preview, preview: `${base}.svg`, colours: [L.ground, L.ink, L.bar].filter(Boolean).map(name), size: [W, H],
      rows: [{ formats: [['SVG', `${base}.svg`], ['PDF', `${base}.pdf`], ['PNG 1x', `${base}-1x.png`], ['PNG 2x', `${base}-2x.png`], ['PNG 4x', `${base}-4x.png`]] }] });
  }
  groups.push(logoGroup);

  // Marks: each pair of colours in a mark, measured; a mark with any pair under 3 to 1 is left out.
  const pairs = []; const dropped = [];
  const markGroup = { key: 'mark', title: 'Mark', items: [] };
  for (const Mk of MARKS) {
    const p = Mk.palette;
    const mine = [['R on ground', p.letter, p.ground], ['Stripe on ground', p.stripe, p.ground]].map(([pair, a, b]) => ({ mark: Mk.key, pair, fg: name(a), bg: name(b), ratio: Math.round(contrast(a, b) * 100) / 100 }));
    pairs.push(...mine);
    if (mine.some((x) => x.ratio < 3)) { dropped.push(Mk.key); continue; }
    const rows = [];
    for (const rounded of [false, true]) {
      const set = rounded ? 'rounded' : 'square'; const base = `mark/${set}/rentletter-mark-${Mk.key}-${set}`;
      put(`${base}.svg`, markSvg(MARK, { px: 512, palette: p, rounded }));
      for (const px of MARK_SIZES) put(`${base}-${px}.png`, png(markSvg(MARK, { px, palette: p, rounded })));
      rows.push({ label: rounded ? 'iOS corner' : 'Full bleed', formats: [['SVG', `${base}.svg`], ...MARK_SIZES.map((px) => [String(px), `${base}-${px}.png`])] });
    }
    markGroup.items.push({ key: Mk.key, title: Mk.title, note: Mk.note, ground: 'paper', preview: `mark/rounded/rentletter-mark-${Mk.key}-rounded.svg`, colours: [p.ground, p.stripe, p.letter].map(name), rows });
  }
  for (const B of BARE) {
    const mine = { mark: B.key, pair: 'Mark on its ground', fg: name(B.colour), bg: name(B.ground), ratio: Math.round(contrast(B.colour, B.ground) * 100) / 100 };
    pairs.push(mine);
    if (mine.ratio < 3) { dropped.push(B.key); continue; }
    const base = `mark/bare/rentletter-mark-${B.key}`;
    put(`${base}.svg`, markSvg(MARK, { px: 512, bare: true, palette: { letter: B.colour } }));
    for (const px of MARK_SIZES) put(`${base}-${px}.png`, png(markSvg(MARK, { px, bare: true, palette: { letter: B.colour } })));
    markGroup.items.push({ key: B.key, title: B.title, note: B.note, ground: B.ground === C.paper ? 'paper' : 'ink', preview: `${base}.svg`, colours: [name(B.colour)], rows: [{ formats: [['SVG', `${base}.svg`], ...MARK_SIZES.map((px) => [String(px), `${base}-${px}.png`])] }] });
  }
  groups.push(markGroup);

  // Social.
  const social = { key: 'social', title: 'Social', items: [] };
  for (const [key, palette, title] of [['realtor', PALETTES.realtor, 'Profile, realtor'], ['admin', PALETTES.admin, 'Profile, admin']]) {
    const p = `social/rentletter-profile-${key}-400.png`;
    put(p, png(markSvg(MARK, { px: 400, kind: 'maskable', palette })));
    social.items.push({ key: `profile-${key}`, title, note: '400 by 400. The mark sits inside a circle crop.', ground: 'paper', preview: p, colours: [palette.ground, palette.stripe, palette.letter].map(name), rows: [{ formats: [['PNG', p]] }] });
  }
  put('social/rentletter-og-1200x630.png', png(logoSvg(LOGO, { height: (600 * LOGO.h) / LOGO.w, bg: C.paper, w: 1200, h: 630 })));
  social.items.push({ key: 'og', title: 'Open Graph', note: '1200 by 630, for link previews.', ground: 'paper', preview: 'social/rentletter-og-1200x630.png', colours: ['paper', 'ink', 'red'], rows: [{ formats: [['PNG', 'social/rentletter-og-1200x630.png']] }] });
  put('social/rentletter-email-signature-264x52.png', png(logoSvg(LOGO, { height: ((264 - 4) * LOGO.h) / LOGO.w, w: 264, h: 52 })));
  social.items.push({ key: 'email', title: 'Email signature', note: '264 by 52, shown at 132 by 26.', ground: 'paper', preview: 'social/rentletter-email-signature-264x52.png', colours: ['ink', 'red'], rows: [{ formats: [['PNG 2x', 'social/rentletter-email-signature-264x52.png']] }] });
  groups.push(social);

  // Colour.
  const { scene: pal, swatches } = paletteScene();
  const PALETTE_SCALE = 3;
  put('colour/rentletter-palette.png', png(sceneSvg(pal), PW * PALETTE_SCALE));
  put('colour/rentletter-palette.pdf', await scenesPdf([pal], 'Rentletter colour'));
  const tokens = {
    name: 'Rentletter', note: 'Built from components/theme.js. CMYK values are approximate.',
    colour: Object.fromEntries(PALETTE.map((p) => [p.token, { name: p.name, role: p.role, hex: p.hex, rgb: p.rgb, cmykApproximate: p.cmyk }])),
    type: { display: { family: 'Fraunces', weight: 600 }, text: { family: 'Inter', weights: [400, 500, 600, 700] }, scale },
    radius: { control: R.ctrl, card: R.card, modal: R.modal, pill: R.pill },
  };
  put('colour/tokens.json', `${JSON.stringify(tokens, null, 2)}\n`);
  put('colour/tokens.css', `/* Rentletter tokens, built from components/theme.js. */\n:root {\n${PALETTE.map((p) => `  --rl-${p.token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${p.hex};`).join('\n')}\n  --rl-font-display: 'Fraunces', Georgia, serif;\n  --rl-font-text: 'Inter', -apple-system, sans-serif;\n${Object.entries(scale).map(([k, v]) => `  --rl-type-${k}: ${v}px;`).join('\n')}\n  --rl-radius-control: ${R.ctrl}px;\n  --rl-radius-card: ${R.card}px;\n  --rl-radius-pill: ${R.pill}px;\n}\n`);
  groups.push({ key: 'colour', title: 'Colour', items: [
    { key: 'palette', title: 'Palette sheet', note: 'Every colour token with HEX, RGB and approximate CMYK.', ground: 'paper', preview: '../previews/palette.png', rows: [{ formats: [['PNG', 'colour/rentletter-palette.png'], ['PDF', 'colour/rentletter-palette.pdf']] }] },
    { key: 'tokens', title: 'Tokens', note: 'The same colours, the type scale and the radii, for code.', ground: 'paper', preview: '../previews/tokens.svg', rows: [{ formats: [['JSON', 'colour/tokens.json'], ['CSS', 'colour/tokens.css']] }] },
  ] });

  // Type.
  const specimen = specimenScene(scale);
  put('type/rentletter-type-specimen.png', png(sceneSvg(specimen), PW * 3));
  put('type/rentletter-type-specimen.pdf', await scenesPdf([specimen], 'Rentletter type'));
  const typeItems = [];
  for (const [fam, Fam, key, note] of [['fraunces', 'Fraunces', 'f28', 'Display. Variable weight and optical size.'], ['inter', 'Inter', 'i400', 'Text. Variable weight.']]) {
    put(`type/${Fam}/${Fam}-Variable.ttf`, readFileSync(join(tmp, `${fam}-var.ttf`)));
    put(`type/${Fam}/${Fam}-Variable.woff2`, readFileSync(join(ROOT, FONT_SRC[fam])));
    put(`type/${Fam}/OFL.txt`, `${copyrightOf(key)}\n\n${OFL_BODY}`);
    typeItems.push({ key: fam, title: Fam, note, ground: 'paper', preview: `../previews/${fam}.svg`, rows: [{ formats: [['TTF', `type/${Fam}/${Fam}-Variable.ttf`], ['WOFF2', `type/${Fam}/${Fam}-Variable.woff2`], ['License', `type/${Fam}/OFL.txt`]] }] });
  }
  groups.push({ key: 'type', title: 'Type', items: [
    { key: 'specimen', title: 'Specimen', note: `The scale: ${Object.values(scale).join(', ')}.`, ground: 'paper', preview: '../previews/specimen.png', rows: [{ formats: [['PNG', 'type/rentletter-type-specimen.png'], ['PDF', 'type/rentletter-type-specimen.pdf']] }] },
    ...typeItems,
  ] });

  // Guidelines.
  const pages = guidelinePages(scale);
  put('guidelines/rentletter-brand-guidelines.pdf', await scenesPdf(pages, 'Rentletter brand guidelines'));
  groups.push({ key: 'guidelines', title: 'Guidelines', items: [
    { key: 'guidelines', title: 'Brand guidelines', note: `${pages.length} pages: logo, size, marks, colour, type and what not to do.`, ground: 'paper', preview: '../previews/guidelines.png', rows: [{ formats: [['PDF', 'guidelines/rentletter-brand-guidelines.pdf']] }] },
  ] });

  put('README.txt', `Rentletter brand kit

logo        The logo: the red bar and the word. Primary, reversed, mono ink,
            mono white, and the primary and reversed on their own grounds.
            SVG, PDF, and PNG at 1x, 2x and 4x (600px wide at 1x).
mark        The square app marks. square: full bleed. rounded: the iOS corner.
            bare: the stripe and R alone. SVG, and PNG from 1024 to 16.
social      Profile images, the Open Graph image, the email signature logo.
colour      The palette sheet, tokens.json and tokens.css.
            CMYK values are approximate.
type        Fraunces and Inter with their licenses, and the type specimen.
guidelines  How to use all of the above.

Built from the product's own source with npm run brand:kit.
`);

  // Write: a clean folder, every file, the zip, the previews and the manifest.
  rmSync(OUT, { recursive: true, force: true });
  const sorted = [...files.keys()].sort();
  for (const p of sorted) { const full = join(OUT, KIT, p); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, files.get(p)); }
  const zip = zipOf(sorted.map((p) => ({ name: `${KIT}/${p}`, data: files.get(p) })));
  writeFileSync(join(OUT, `${KIT}.zip`), zip);
  mkdirSync(join(OUT, 'previews'), { recursive: true });
  writeFileSync(join(OUT, 'previews/palette.png'), png(sceneSvg(pal), PW));
  writeFileSync(join(OUT, 'previews/specimen.png'), png(sceneSvg(specimen), PW));
  writeFileSync(join(OUT, 'previews/guidelines.png'), png(sceneSvg(pages[0]), PW));
  const strip = ['paper', 'card', 'rule', 'ink', 'inkMute', 'red', 'inst'];
  writeFileSync(join(OUT, 'previews/tokens.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">${strip.map((k, i) => `<rect x="${i * 60}" y="0" width="60" height="120" fill="${C[k]}"/>`).join('')}</svg>`);
  for (const [fam, key] of [['fraunces', 'f72'], ['inter', 'i500']]) writeFileSync(join(OUT, `previews/${fam}.svg`), sceneSvg({ w: 240, h: 120, items: [T(120, 86, 'Aa', key, 72, C.ink, { anchor: 'middle' })] }));

  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const size = (p) => files.get(p).length;
  for (const g of groups) for (const it of g.items) for (const row of it.rows) row.formats = row.formats.map(([label, p]) => ({ label, path: p, file: basename(p), size: size(p) }));
  const manifest = {
    note: 'GENERATED by npm run brand:kit (scripts/brand/kit.mjs). Do not edit by hand.',
    sources: kitSources(ROOT),
    folder: KIT,
    zip: { path: `${KIT}.zip`, size: zip.length, sha256: sha(zip) },
    files: sorted.map((p) => ({ path: p, size: size(p), sha256: sha(files.get(p)) })),
    groups,
    marks: { pairs, dropped },
    palette: { png: 'colour/rentletter-palette.png', scale: PALETTE_SCALE, swatches },
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`brand kit: ${sorted.length} files, zip ${(zip.length / 1e6).toFixed(2)} MB, ${pairs.length} mark pairs, ${dropped.length} dropped`);
}
