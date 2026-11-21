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
// inside it keep their own order; and the runs of a line are placed in reading order. On a line
// that holds right to left text the runs take levels from a small part of the Unicode
// bidirectional rules: the paragraph's direction is its first strong letter; a number after
// right to left text, and a space or a mark between two runs of different directions, goes with
// the paragraph; then each stretch at a level is turned (L2). A Latin word or a number inside a
// Persian or Arabic sentence keeps its own order and its place, with the spaces on the right
// sides. A line wrapped from a right to left paragraph keeps the paragraph's direction even when
// it starts with a Latin word. Where the caller asks for it (withRightToLeftParagraphs, the
// tenant's Download my profile), a right to left paragraph is set flush right in the width it was
// wrapped to; elsewhere it is set from the left margin, like the rest of the page.
// A character no bundled font has (an emoji, a script not listed) is left out and counted in
// kit.dropped, never drawn as a box.
//
//   const kit = await createTextKit(pdfDoc, fontkit, [texts...], [baseFonts...]);
//   kit.width(text, baseFont, size)                 the width as it will be drawn
//   kit.wrap(text, baseFont, size, maxWidth)        lines; Chinese and Japanese break between characters
//   kit.draw(page, text, { x, y, size, font, color })
//   paragraphDirection(text)                        'rtl' when its first strong letter is right to left
//   withRightToLeftParagraphs(fn)                   runs fn with right to left paragraphs set flush right
import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

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
// A letter with a direction of its own: right to left, or anything that is not a number, a space,
// punctuation or an invisible mark.
const isStrong = (cp) => cp >= 0x20 && !isDigit(cp) && !isNeutral(cp) && !isIgnorable(cp);

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

// The direction of a paragraph: that of its first strong letter (Unicode P2, P3); left to right
// when it has none.
export function paragraphDirection(text) {
  for (const cp of codePoints(text)) if (isStrong(cp)) return isRtl(cp) ? 'rtl' : 'ltr';
  return 'ltr';
}

// Right to left paragraphs set flush right, for the PDFs that ask (the tenant's Download my
// profile, pages/api/tenant/export.js): a kit made inside fn sets them so. Kept per request, so a
// landlord report made at the same moment is set as it always was.
const flushRight = new AsyncLocalStorage();
export const withRightToLeftParagraphs = (fn) => flushRight.run(true, fn);

// The level of each character of a line that holds right to left text (0 left to right, 1 right
// to left, 2 left to right inside right to left), from the paragraph's direction: strong letters
// take their own; a number takes the paragraph's side and stays left to right inside it; a
// space, a mark or punctuation takes its neighbours' direction when they agree, else the
// paragraph's (Unicode W2, W7, N1, N2, I1, I2, simplified for one line and no embeddings).
export function bidiLevels(cps, dir = null) {
  const rtl = (dir || paragraphDirection(String.fromCodePoint(...cps))) === 'rtl';
  const base = rtl ? 1 : 0;
  // The class of each: R, L, EN (a number after left to right text or at the start of a left to
  // right line), AN (a number after right to left text, or in Arabic digits), N, or null (a mark).
  let lastStrong = rtl ? 'R' : 'L';
  const cls = cps.map((cp) => {
    if (isIgnorable(cp) || cp < 0x20) return null;
    if (isDigit(cp)) return inRanges(cp, RTL_DIGITS) || lastStrong === 'R' ? 'AN' : 'EN';
    if (isNeutral(cp)) return 'N';
    lastStrong = isRtl(cp) ? 'R' : 'L';
    return lastStrong;
  });
  // A number counts as right to left for the marks beside it, unless it follows left to right text.
  const side = (c) => (c === 'L' || c === 'EN' ? 'L' : c === 'R' || c === 'AN' ? 'R' : null);
  const resolved = cls.slice();
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i] !== 'N') continue;
    let j = i; while (j < resolved.length && (resolved[j] === 'N' || resolved[j] === null)) j += 1;
    let before = null; for (let k = i - 1; k >= 0; k--) { if (side(resolved[k])) { before = side(resolved[k]); break; } }
    const after = j < resolved.length ? side(resolved[j]) : null;
    const to = (before || (rtl ? 'R' : 'L')) === (after || (rtl ? 'R' : 'L')) ? (before || after || (rtl ? 'R' : 'L')) : (rtl ? 'R' : 'L');
    for (let k = i; k < j; k++) if (resolved[k] === 'N') resolved[k] = to === 'R' ? 'NR' : 'NL';
    i = j - 1;
  }
  const levelOf = (c) => {
    if (base === 0) return c === 'R' || c === 'NR' ? 1 : c === 'AN' ? 2 : 0;
    return c === 'L' || c === 'NL' || c === 'EN' || c === 'AN' ? 2 : 1;
  };
  let prev = base;
  return resolved.map((c) => { if (c === null) return prev; prev = levelOf(c); return prev; });
}

// Reading order to drawing order, for the runs of one line (kinds: L, R, N for a number, S for
// spaces and punctuation standing between runs).
export function visualOrder(runs) {
  // Runs that carry their levels (a line that holds right to left text, from bidiLevels): from the
  // highest level down to 1, every stretch at that level or higher is turned (Unicode L2). A
  // right to left run is turned inside by the font engine, so it is placed whole.
  if (runs.length && runs.every((r) => Number.isInteger(r.level))) {
    let out = runs.slice();
    const top = Math.max(...out.map((r) => r.level));
    for (let lv = top; lv >= 1; lv--) {
      const next = []; let i = 0;
      while (i < out.length) {
        if (out[i].level < lv) { next.push(out[i]); i += 1; continue; }
        let j = i; while (j < out.length && out[j].level >= lv) j += 1;
        next.push(...out.slice(i, j).reverse()); i = j;
      }
      out = next;
    }
    return out;
  }
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
  // Each line kit.wrap made, with the direction and the width of its paragraph: a line drawn
  // later is placed by them.
  const wrapped = new Map();
  const alignRight = flushRight.getStore() === true;
  // The runs of a text in reading order: [{ text, font, kind, level? }]. dir: the paragraph's
  // direction, when the line was wrapped from one (else the line's own).
  const runs = (text, base, dir = null) => {
    const out = []; let cur = null;
    const cps = codePoints(text);
    // Numbers are runs of their own only on a line that holds right to left text: any other line
    // is drawn exactly as it always was, in as few runs as its fonts allow.
    const mixed = cps.some((cp) => isRtl(cp) || inRanges(cp, RTL_DIGITS));
    const levels = mixed ? bidiLevels(cps, dir) : null;
    cps.forEach((cp, i) => {
      const ch = String.fromCodePoint(cp);
      if (cp < 0x20) return;
      const level = levels ? levels[i] : undefined;
      if (isIgnorable(cp)) { if (cur && cur.font !== base && baseHas(cur.font, cp)) cur.text += ch; return; }
      // A space or a mark joins the run before it when it reads the same way (on a mixed line, the
      // same level): one that turns to the other side stands on its own.
      if (isNeutral(cp) && cur && cur.kind !== 'N' && baseHas(cur.font, cp) && cur.level === level) { cur.text += ch; return; }
      const font = fontFor(cp, base);
      if (!font) { dropped.add(ch); return; }
      const kind = mixed && isDigit(cp) ? 'N' : isRtl(cp) ? 'R' : mixed && isNeutral(cp) ? 'S' : 'L';
      if (cur && cur.font === font && cur.kind === kind && cur.level === level) cur.text += ch; else { cur = { text: ch, font, kind, ...(mixed ? { level } : {}) }; out.push(cur); }
    });
    return out;
  };
  // A number in a right to left script's own digits: the font engine reverses the run, so it is
  // handed over reversed and comes out in order.
  const shown = (r) => (r.kind === 'N' && inRanges(r.text.codePointAt(0), RTL_DIGITS) ? Array.from(r.text).reverse().join('') : r.text);
  // A run the font engine cannot lay out (a shaping fault in one font) is left out and counted,
  // so one word never costs the whole page.
  const usable = (r) => { try { r.font.widthOfTextAtSize(shown(r), 10); return true; } catch (e) { for (const ch of Array.from(r.text)) dropped.add(ch); return false; } };
  const laid = (text, base, dir = null) => runs(text, base, dir).filter(usable);
  const width = (text, base, size) => laid(text, base).reduce((w, r) => w + r.font.widthOfTextAtSize(shown(r), size), 0);
  const draw = (page, text, { x, y, size, font, color }) => {
    const from = wrapped.get(String(text == null ? '' : text));
    const dir = from ? from.dir : null;
    const list = visualOrder(laid(text, font, dir));
    const total = list.reduce((w, r) => w + r.font.widthOfTextAtSize(shown(r), size), 0);
    // A right to left paragraph, where the PDF asks for it: flush right in the width it was wrapped to.
    let cx = alignRight && from && from.dir === 'rtl' ? x + Math.max(0, from.width - total) : x;
    const x0 = cx;
    for (const r of list) { const t = shown(r); page.drawText(t, { x: cx, y, size, font: r.font, color }); cx += r.font.widthOfTextAtSize(t, size); }
    return cx - x0;
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
    const dir = paragraphDirection(text);
    for (const ln of lines) wrapped.set(ln, { dir, width: maxWidth });
    return lines;
  };
  return { runs, width, draw, wrap, dropped, embedded: () => [...embedded.keys()], alignRight };
}
