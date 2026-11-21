// Persian and Arabic in the tenant's PDF export (lib/pdfScripts.js, pages/api/tenant/export.js):
// a paragraph in Persian is set flush right and reads right to left; a mixed paragraph keeps its
// numbers and Latin words in their own order and in their places, with a space on each side. The
// landlord report, which does not ask, keeps its paragraphs set from the left margin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { PDFDocument, StandardFonts } = await import('pdf-lib');
const fkm = await import('@pdf-lib/fontkit'); const fk = fkm.default || fkm;
const { withRightToLeftParagraphs, paragraphDirection, bidiLevels, createTextKit } = await import('../lib/pdfScripts.js');
const { buildProfilePdf } = await import('../lib/profileExportPdf.js');

const PW = 612; const M = 56; const RIGHT = PW - M;
const PERSIAN = 'من در یک کلینیک توانبخشی کودکان کار می‌کنم و چهار سال است که آنجا هستم. به دنبال خانه‌ای آرام نزدیک دریاچه هستم تا سال‌ها در آن بمانم.';
const MIXED = 'من از سال 2019 در Toronto زندگی می‌کنم و واحد من 1204 است.';
const ARABIC = /\p{Script=Arabic}/u;
const profile = (about) => ({ name: 'Maryam Rezaei', email: 'tenant@example.com', about, prepayMonths: null, facts: { fullName: 'Maryam Rezaei' }, factsUpdatedAt: '2026-11-08T15:00:00Z', checks: [], documents: [], generatedAt: '2026-11-21T15:00:00Z' });
// Every piece of text on the first page with its box.
const items = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  return (await page.getTextContent()).items.filter((x) => x.str && x.str.trim()).map((x) => ({ str: x.str, x: x.transform[4], y: Math.round(x.transform[5]), right: x.transform[4] + x.width }));
};
// Where the kit places each piece of a paragraph wrapped to width W at x M: its own numbers, the
// ones the PDF is written with (pdfjs reads extra spaces into an Arabic run and widens it).
const placed = async (text, ask) => {
  const go = async () => {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fk);
    const base = await pdf.embedFont(StandardFonts.Helvetica);
    const kit = await createTextKit(pdf, fk, [text], [base]);
    const out = [];
    const page = { drawText: (t, o) => out.push({ t, x: o.x, right: o.x + o.font.widthOfTextAtSize(t, o.size) }) };
    for (const ln of kit.wrap(text, base, 11, PW - 2 * M)) { const from = out.length; kit.draw(page, ln, { x: M, y: 0, size: 11, font: base }); out.push({ line: out.slice(from) }); }
    return out.filter((x) => x.line).map((x) => x.line);
  };
  return ask ? withRightToLeftParagraphs(go) : go();
};
const linesOf = (list) => { const by = new Map(); for (const it of list) { if (!by.has(it.y)) by.set(it.y, []); by.get(it.y).push(it); } return [...by.values()].map((l) => l.sort((a, b) => a.x - b.x)); };

test('a Persian paragraph is set flush right and reads right to left', async () => {
  assert.equal(paragraphDirection(PERSIAN), 'rtl'); assert.equal(paragraphDirection(MIXED), 'rtl'); assert.equal(paragraphDirection('Toronto ۲۰۱۹ کار'), 'ltr');
  // Every line ends at the right margin and starts inside the left one.
  const lines = await placed(PERSIAN, true);
  assert.ok(lines.length >= 2, `the paragraph wraps (${lines.length} lines)`);
  for (const l of lines) {
    assert.ok(Math.abs(Math.max(...l.map((p) => p.right)) - RIGHT) < 0.01, `flush right at ${RIGHT} (${Math.max(...l.map((p) => p.right)).toFixed(2)})`);
    assert.ok(Math.min(...l.map((p) => p.x)) >= M - 0.01, 'inside the margin');
  }
  // In the file itself: the short last line starts well in from the left margin.
  const set = linesOf(await items(await withRightToLeftParagraphs(() => buildProfilePdf(profile(PERSIAN))))).filter((l) => l.some((it) => ARABIC.test(it.str)));
  assert.equal(set.length, lines.length, 'as many lines in the file');
  assert.ok(Math.min(...set[set.length - 1].map((it) => it.x)) > M + 40, 'the short last line is set from the right');
  // Without the ask (the landlord report's way) the same paragraph is set from the left margin.
  for (const l of await placed(PERSIAN, false)) assert.ok(Math.abs(Math.min(...l.map((p) => p.x)) - M) < 0.01, 'set from the left margin when not asked');
  const plain = linesOf(await items(await buildProfilePdf(profile(PERSIAN)))).filter((l) => l.some((it) => ARABIC.test(it.str)));
  for (const l of plain) assert.ok(Math.abs(Math.min(...l.map((it) => it.x)) - M) < 1.5, 'and so in the file');
  assert.match(readFileSync(new URL('../pages/api/tenant/export.js', import.meta.url), 'utf8'), /await withRightToLeftParagraphs\(\(\) => buildProfilePdf\(\{/, 'the export asks for it');
});

test('a mixed paragraph: numbers and Latin words in their order and their places, spaced', async () => {
  const list = await items(await withRightToLeftParagraphs(() => buildProfilePdf(profile(MIXED))));
  const line = linesOf(list).find((l) => l.some((it) => /Toronto/.test(it.str)));
  assert.ok(line, 'the line with Toronto');
  const at = (re) => line.find((it) => re.test(it.str));
  const toronto = at(/^Toronto$/); const year = at(/^2019$/); const unit = at(/^1204$/);
  assert.ok(toronto && year && unit, `Toronto, 2019 and 1204 each drawn whole and in order: ${line.map((it) => it.str).join(' | ')}`);
  // Read right to left: 2019 comes before Toronto and Toronto before 1204, so on the page from the
  // right: 2019, then Toronto, then 1204.
  assert.ok(year.x > toronto.x && toronto.x > unit.x, `2019 right of Toronto, Toronto right of 1204 (${year.x.toFixed(1)}, ${toronto.x.toFixed(1)}, ${unit.x.toFixed(1)})`);
  // A space on each side of each: nothing touches the Latin word or the numbers.
  for (const w of [toronto, year, unit]) {
    const leftN = line.filter((it) => it !== w && it.right <= w.x + 0.5).sort((a, b) => b.right - a.right)[0];
    const rightN = line.filter((it) => it !== w && it.x >= w.right - 0.5).sort((a, b) => a.x - b.x)[0];
    if (leftN) assert.ok(w.x - leftN.right >= 1.5, `${w.str}: a space on its left (${(w.x - leftN.right).toFixed(1)})`);
    if (rightN) assert.ok(rightN.x - w.right >= 1.5, `${w.str}: a space on its right (${(rightN.x - w.right).toFixed(1)})`);
  }
  const [mixed] = await placed(MIXED, true);
  assert.ok(Math.abs(Math.max(...mixed.map((p) => p.right)) - RIGHT) < 0.01, 'and the line is flush right');
  assert.deepEqual(mixed.filter((p) => /^(2019|Toronto|1204)$/.test(p.t)).sort((a, b) => b.x - a.x).map((p) => p.t), ['2019', 'Toronto', '1204'], 'from the right: 2019, Toronto, 1204');
});

test('the levels: a number after Persian goes with it, a space between two directions with the paragraph', () => {
  const cps = (s) => Array.from(s, (c) => c.codePointAt(0));
  // "در Toronto کار": R R space L... space R R R; the space after Toronto sits between L and R: the paragraph's (1).
  const lv = bidiLevels(cps('در Toronto کار'));
  assert.deepEqual(lv, [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
  // A left to right paragraph with Persian inside: the Persian at 1, and a number right after it
  // goes with it (2), the space between them too (1); "Suite " stays at 0.
  assert.deepEqual(bidiLevels(cps('Suite کار 12')), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2]);
  // A Latin paragraph with a number and no Persian: all 0 (and drawn as one run, as it always was).
  assert.deepEqual(bidiLevels(cps('Unit 12')), [0, 0, 0, 0, 0, 0, 0]);
});
