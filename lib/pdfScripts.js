// lib/pdfScripts.js  SERVER ONLY. Every script in a PDF.
// The PDFs print names and words a tenant typed, in whatever script they typed them
// (lib/profileExportPdf.js "Download my profile", lib/landlordReportPdf.js the landlord report).
// The page's own fonts keep drawing what they can draw, so Latin text looks as it did; a
// character they cannot draw is drawn by the first bundled font that has it. Nothing is fetched
// at run time: every file is in assets/fonts, each folder with its own licence, unedited.
//
//   Inter (assets/fonts/Inter-400.ttf, OFL 1.1)                 accented Latin, Vietnamese, Cyrillic, Greek
//   Noto Sans Arabic, Hebrew, Devanagari, Gurmukhi, Bengali,
//   Gujarati, Tamil, Thai (assets/fonts/scripts, OFL 1.1)        Persian, Arabic, Urdu, Hebrew, Hindi, Punjabi, Bengali, Gujarati, Tamil, Thai
//   Droid Sans Fallback (Apache 2.0)                             Chinese, simplified and traditional, and Japanese
//   Nanum Gothic (OFL 1.1)                                       Korean
//
// A font is embedded only in a PDF that needs it, and only the glyphs used (Nanum Gothic and
// Inter are embedded whole: the PDF library's subsetter loses glyphs from them).
// Right to left: an Arabic or Hebrew run is shaped and reversed by the font engine; numbers
// inside it keep their own order; and the runs of a line are placed in reading order (a small
// part of the Unicode bidirectional rules: enough for a name, a sentence and a number). A
// right to left paragraph is set from the left margin, like the rest of the page.
// A character no bundled font has (an emoji, a script not listed) is left out and counted in
// kit.dropped, never drawn as a box.
//
//   const kit = await createTextKit(pdfDoc, fontkit, [texts...], [baseFonts...]);
//   kit.width(text, baseFont, size)                 the width as it will be drawn
//   kit.wrap(text, baseFont, size, maxWidth)        lines; Chinese and Japanese break between characters
//   kit.draw(page, text, { x, y, size, font, color })
import fs from 'fs';
import path from 'path';

// The Hindi, Punjabi, Bengali, Gujarati and Tamil shapers in the PDF library's font engine were
// compiled to call a generator runtime the engine does not ship (one generator, in its state
// machine). This is that runtime, as far as that one generator uses it; set only if absent.
if (!globalThis.regeneratorRuntime) {
  globalThis.regeneratorRuntime = {
    mark: (fn) => fn,
    wrap: (step) => {
      const ctx = { prev: 0, next: 0, done: false, stop() { this.done = true; } };
      return { next() { if (ctx.done) return { value: undefined, done: true }; const value = step(ctx); return ctx.done ? { value: undefined, done: true } : { value, done: false }; }, [Symbol.iterator]() { return this; } };
    },
  };
}

const DIR = path.join(process.cwd(), 'assets', 'fonts');
// In the order a character is looked for. Hangul goes to Nanum Gothic first (below).
export const SCRIPT_FONTS = Object.freeze([
  Object.freeze({ key: 'latin', file: 'Inter-400.ttf', subset: false }),
  Object.freeze({ key: 'arabic', file: 'scripts/NotoSansArabic/NotoSansArabic-Regular.ttf', subset: true }),
  Object.freeze({ key: 'hebrew', file: 'scripts/NotoSansHebrew/NotoSansHebrew-Regular.ttf', subset: true }),
  Object.freeze({ key: 'devanagari', file: 'scripts/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf', subset: true }),
  // Punjabi: the font engine fails on this font's above-base mark positioning, so that one feature is off.
  Object.freeze({ key: 'gurmukhi', file: 'scripts/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf', subset: true, features: { abvm: false } }),
  Object.freeze({ key: 'bengali', file: 'scripts/NotoSansBengali/NotoSansBengali-Regular.ttf', subset: true }),
  Object.freeze({ key: 'gujarati', file: 'scripts/NotoSansGujarati/NotoSansGujarati-Regular.ttf', subset: true }),
  Object.freeze({ key: 'tamil', file: 'scripts/NotoSansTamil/NotoSansTamil-Regular.ttf', subset: true }),
  Object.freeze({ key: 'thai', file: 'scripts/NotoSansThai/NotoSansThai-Regular.ttf', subset: true }),
  Object.freeze({ key: 'cjk', file: 'scripts/DroidSansFallback/DroidSansFallbackFull.ttf', subset: true }),
  Object.freeze({ key: 'korean', file: 'scripts/NanumGothic/NanumGothic-Regular.ttf', subset: false }),
]);

const inRanges = (cp, ranges) => ranges.some(([a, b]) => cp >= a && cp <= b);
const HANGUL = [[0x1100, 0x11ff], [0x3130, 0x318f], [0xac00, 0xd7af]];
const RTL = [[0x0590, 0x08ff], [0xfb1d, 0xfdff], [0xfe70, 0xfeff]];
const RTL_DIGITS = [[0x0660, 0x0669], [0x06f0, 0x06f9]];
const NO_SPACES = [[0x2e80, 0x30ff], [0x31f0, 0x31ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef], [0x20000, 0x2ffff]]; // Han, kana, their punctuation, full width forms
const isDigit = (cp) => (cp >= 0x30 && cp <= 0x39) || inRanges(cp, RTL_DIGITS);
const isRtl = (cp) => inRanges(cp, RTL) && !inRanges(cp, RTL_DIGITS);
// Drawn by whichever font is drawing around them: spaces and the punctuation every font carries.
const isNeutral = (cp) => cp === 0x20 || cp === 0xa0 || (cp >= 0x21 && cp <= 0x2f) || (cp >= 0x3a && cp <= 0x40) || (cp >= 0x5b && cp <= 0x60) || (cp >= 0x7b && cp <= 0x7e);
// Invisible joiners and marks: they belong to the run they are in, and are never "dropped".
const isIgnorable = (cp) => cp === 0xad || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2069) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff;
export const breaksAnywhere = (cp) => inRanges(cp, NO_SPACES);

// One read of each file a process, padded as lib/landlordReportPdf.js pads its own (the font
// engine reads a glyph header past the end of an empty last glyph).
const loaded = new Map();
function fileOf(spec, fk) {
  if (loaded.has(spec.key)) return loaded.get(spec.key);
  let entry = null;
  try {
    const raw = fs.readFileSync(path.join(DIR, spec.file));
    const bytes = new Uint8Array(raw.length + 16); bytes.set(raw);
    entry = { spec, bytes, has: new Set(fk.create(Buffer.from(bytes)).characterSet) };
  } catch (e) { console.error('[pdfScripts] font not usable', JSON.stringify({ key: spec.key, message: String(e && e.message ? e.message : e).slice(0, 160) })); }
  loaded.set(spec.key, entry);
  return entry;
}
// The bundled font for one character the page's own font cannot draw, or null.
function fallbackFor(cp, fk) {
  const order = inRanges(cp, HANGUL) ? [SCRIPT_FONTS.find((s) => s.key === 'korean'), ...SCRIPT_FONTS] : SCRIPT_FONTS;
  for (const spec of order) { const f = fileOf(spec, fk); if (f && f.has.has(cp)) return f; }
  return null;
}
const codePoints = (text) => Array.from(String(text == null ? '' : text), (ch) => ch.codePointAt(0));

// Reading order to drawing order, for the runs of one line (kinds: L, R, N for a number, S for
// spaces and punctuation standing between runs).
export function visualOrder(runs) {
  const strong = runs.find((r) => r.kind === 'L' || r.kind === 'R');
  const flipWithin = (list, isInner, worth = () => true) => { // reverse each longest stretch of runs that matches
    const out = []; let i = 0;
    while (i < list.length) {
      if (!isInner(list[i], i, list)) { out.push(list[i]); i += 1; continue; }
      let j = i; while (j < list.length && isInner(list[j], j, list)) j += 1;
      const stretch = list.slice(i, j); out.push(...(worth(stretch) ? stretch.reverse() : stretch)); i = j;
    }
    return out;
  };
  if (!strong || strong.kind === 'L') {
    // Left to right line: a stretch of right to left runs, with the numbers between them, is reversed.
    const weak = (x) => x.kind === 'N' || x.kind === 'S';
    const inner = (r, i, list) => r.kind === 'R' || (weak(r) && list.slice(0, i).reverse().find((x) => !weak(x))?.kind === 'R' && list.slice(i + 1).find((x) => !weak(x))?.kind === 'R');
    return flipWithin(runs, inner);
  }
  // Right to left line: every run is placed from the right; left to right stretches keep their own order.
  // (a stretch of numbers and spaces alone has no order of its own to keep).
  return flipWithin([...runs].reverse(), (r) => r.kind !== 'R', (stretch) => stretch.some((r) => r.kind === 'L'));
}

export async function createTextKit(pdfDoc, fk, texts = [], bases = []) {
  const charSets = new WeakMap();
  const baseHas = (font, cp) => { if (!charSets.has(font)) charSets.set(font, new Set(font.getCharacterSet())); return charSets.get(font).has(cp); };
  const embedded = new Map(); // key -> PDFFont
  const dropped = new Set();
  // Embed, before anything is drawn, each bundled font some text needs.
  if (fk) {
    const need = new Set();
    for (const t of texts) for (const cp of codePoints(t)) { if (isIgnorable(cp) || cp < 0x20) continue; if (!bases.length || bases.some((b) => !baseHas(b, cp))) { const f = fallbackFor(cp, fk); if (f) need.add(f); } }
    for (const f of need) { try { embedded.set(f.spec.key, await pdfDoc.embedFont(f.bytes, { subset: f.spec.subset, ...(f.spec.features ? { features: f.spec.features } : {}) })); } catch (e) { console.error('[pdfScripts] embed failed', f.spec.key, String(e && e.message ? e.message : e).slice(0, 160)); } }
  }
  const fontFor = (cp, base) => {
    if (baseHas(base, cp)) return base;
    const f = fk ? fallbackFor(cp, fk) : null;
    return (f && embedded.get(f.spec.key)) || null;
  };
  // The runs of a text in reading order: [{ text, font, kind }].
  const runs = (text, base) => {
    const out = []; let cur = null;
    const cps = codePoints(text);
    // Numbers are runs of their own only on a line that holds right to left text: any other line
    // is drawn exactly as it always was, in as few runs as its fonts allow.
    const mixed = cps.some((cp) => isRtl(cp) || inRanges(cp, RTL_DIGITS));
    for (const cp of cps) {
      const ch = String.fromCodePoint(cp);
      if (cp < 0x20) continue;
      if (isIgnorable(cp)) { if (cur && cur.font !== base && baseHas(cur.font, cp)) cur.text += ch; continue; }
      if (isNeutral(cp) && cur && cur.kind !== 'N' && baseHas(cur.font, cp)) { cur.text += ch; continue; }
      const font = fontFor(cp, base);
      if (!font) { dropped.add(ch); continue; }
      const kind = mixed && isDigit(cp) ? 'N' : isRtl(cp) ? 'R' : mixed && isNeutral(cp) ? 'S' : 'L';
      if (cur && cur.font === font && cur.kind === kind) cur.text += ch; else { cur = { text: ch, font, kind }; out.push(cur); }
    }
    return out;
  };
  // A number in a right to left script's own digits: the font engine reverses the run, so it is
  // handed over reversed and comes out in order.
  const shown = (r) => (r.kind === 'N' && inRanges(r.text.codePointAt(0), RTL_DIGITS) ? Array.from(r.text).reverse().join('') : r.text);
  // A run the font engine cannot lay out (a shaping fault in one font) is left out and counted,
  // so one word never costs the whole page.
  const usable = (r) => { try { r.font.widthOfTextAtSize(shown(r), 10); return true; } catch (e) { for (const ch of Array.from(r.text)) dropped.add(ch); return false; } };
  const laid = (text, base) => runs(text, base).filter(usable);
  const width = (text, base, size) => laid(text, base).reduce((w, r) => w + r.font.widthOfTextAtSize(shown(r), size), 0);
  const draw = (page, text, { x, y, size, font, color }) => {
    let cx = x;
    for (const r of visualOrder(laid(text, font))) { const t = shown(r); page.drawText(t, { x: cx, y, size, font: r.font, color }); cx += r.font.widthOfTextAtSize(t, size); }
    return cx - x;
  };
  // Lines no wider than maxWidth. Words break at spaces; Chinese and Japanese between any two
  // characters. A last line of one word takes a word from the line above (as the report always did).
  const wrap = (text, base, size, maxWidth) => {
    const units = []; // { text, glue }: glue is what joins it to the unit before
    for (const word of String(text == null ? '' : text).split(/\s+/).filter(Boolean)) {
      let piece = ''; let first = true;
      const push = () => { if (piece) { units.push({ text: piece, glue: first ? ' ' : '' }); first = false; piece = ''; } };
      for (const ch of Array.from(word)) { if (breaksAnywhere(ch.codePointAt(0))) { push(); units.push({ text: ch, glue: first ? ' ' : '' }); first = false; } else piece += ch; }
      push();
    }
    const lines = []; let line = '';
    for (const u of units) {
      const next = line ? `${line}${u.glue}${u.text}` : u.text;
      if (!line || width(next, base, size) <= maxWidth) line = next; else { lines.push(line); line = u.text; }
    }
    if (line) lines.push(line);
    if (lines.length >= 2 && lines[lines.length - 1].split(' ').length === 1 && !Array.from(lines[lines.length - 1]).some((ch) => breaksAnywhere(ch.codePointAt(0)))) {
      const prev = lines[lines.length - 2].split(' ');
      if (prev.length >= 2) { const moved = prev.pop(); lines[lines.length - 2] = prev.join(' '); lines[lines.length - 1] = `${moved} ${lines[lines.length - 1]}`; }
    }
    return lines;
  };
  return { runs, width, draw, wrap, dropped, embedded: () => [...embedded.keys()] };
}
