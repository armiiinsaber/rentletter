// lib/landlordReportPdf.js
// Server only. Two PDFs with pdf-lib: the landlord report, which is the /r/{token} page on
// paper built from the frozen payload (buildLandlordReportPdf), and the single applicant
// verification confirmation (buildVerificationPdf), which still uses the realtor's brand fonts.
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { hexToHsl, hslToHex } from './brandPalette';
import { humanRightsCodeName } from './provinces';
import { signingName } from './reportSignature';

const INK = rgb(0.059, 0.059, 0.063);
const INK_SOFT = rgb(0.227, 0.227, 0.235);
const INK_MUTE = rgb(0.525, 0.525, 0.545);
const RED = rgb(0.843, 0.125, 0.153);
const GREEN = rgb(0.176, 0.490, 0.290);
const RULE = rgb(0.890, 0.866, 0.816);

function hexToPdfRgb(hex, fallback) {
  const m = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return fallback;
  return rgb(parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255);
}
// A brand colour usable as an accent (rules/labels/rank numbers on white paper).
// Falls back if missing/invalid or too light to read.
function guardAccent(hex, fallback) {
  const c = hexToPdfRgb(hex, null);
  if (!c) return fallback;
  const lum = 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue;
  return lum > 0.72 ? fallback : c;
}

function safe(s) {
  return String(s || '').replace(/[^\x20-\x7E]/g, (ch) => {
    // The middle dot is in WinAnsi and Helvetica draws it (the facts line prints it unsanitized).
    const map = { '‘': "'", '’': "'", '“': '"', '”': '"', ', ': '-', 'not set': '-', '…': '...', ' ': ' ', '·': '·' };
    return map[ch] || '';
  });
}
function wrapText(text, max) {
  const words = safe(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { if (line) lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line.trim());
  return lines;
}

async function tryEmbedLogo(pdfDoc, logoUrl) {
  if (!logoUrl) return null;
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const lower = String(logoUrl).toLowerCase();
    if (ct.includes('png') || lower.includes('.png')) return await pdfDoc.embedPng(bytes);
    if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g/.test(lower)) return await pdfDoc.embedJpg(bytes);
    return null; // pdf-lib can't embed SVG/WebP
  } catch (e) {
    return null;
  }
}

// "Confirmed by Armin: employer, previous landlord · Sep 2" from the junction row's confirmations
// (db/screening.sql). null when nothing was confirmed.
export { confirmedSummary } from './reportSnapshot.js';

// ── Brand font resolution (shared by both builders) ─────────────────────────────────────
// Embeds the realtor's chosen pairing if the server supplied TTF bytes; else Helvetica.
// fontkit is imported lazily so the browser/demo (which passes no fonts) never bundles it.
//
// Fonts are embedded WITHOUT subsetting: pdf-lib's subsetter corrupts the glyph data for
// several bundled fonts (e.g. Inter) and shredded body text. Full embedding renders correctly.
//
// IMPORTANT: pdf-lib embeds LAZILY. embedFont() only parses; the glyph walk that can throw
// (a malformed glyph, fontkit edge cases) runs inside pdfDoc.save(), long after any try/catch
// around embedFont(). So each face is first embedded into a throwaway document and forced
// through `.embed()`; if that fails, the face is rejected and the report falls back to
// Helvetica for that role. A font can therefore never hard-fail report generation.
// Validity is memoized per byte buffer (the server memoizes the buffers), so the check costs
// one extra parse per font per process.
const fontOk = new WeakMap();
async function validateFontBytes(bytes, fk) {
  if (!bytes) return false;
  if (fontOk.has(bytes)) return fontOk.get(bytes);
  let ok = false;
  try {
    const scratch = await PDFDocument.create();
    scratch.registerFontkit(fk);
    const f = await scratch.embedFont(bytes, { subset: false });
    await f.embed();
    await scratch.save();
    ok = true;
  } catch (e) {
    console.error('[landlordReportPdf] brand font rejected, falling back to Helvetica:', e?.message || e);
  }
  fontOk.set(bytes, ok);
  return ok;
}

async function resolveBrandFonts(pdfDoc, fonts) {
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let bodyFont = helv, bodyBold = helvBold, headingFont = helvBold, headingIsScript = false;
  // Belt and braces: whatever goes wrong anywhere in brand-font handling (fontkit import,
  // parse, validation), the report still renders in Helvetica.
  try {
  if (fonts && (fonts.headingBytes || fonts.bodyRegularBytes)) {
    let fk = null;
    try { const m = await import('@pdf-lib/fontkit'); fk = m.default || m; pdfDoc.registerFontkit(fk); } catch (e) { fk = null; }
    if (fk) {
      const embed = async (bytes) => {
        if (!(await validateFontBytes(bytes, fk))) return null;
        try { return await pdfDoc.embedFont(bytes, { subset: false }); } catch (e) { return null; }
      };
      const b = await embed(fonts.bodyRegularBytes);
      const bb = await embed(fonts.bodyBoldBytes);
      const h = await embed(fonts.headingBytes);
      if (b) bodyFont = b;
      bodyBold = bb || b || helvBold;          // bold → regular → Helvetica-Bold
      if (h) headingFont = h;
      headingIsScript = !!(h && fonts.headingIsScript); // only treat as script if it embedded
    }
  }
  } catch (e) {
    console.error('[landlordReportPdf] brand font handling failed, report uses Helvetica', JSON.stringify({ errorName: e?.name || null, message: String(e?.message || e).slice(0, 300) }));
    bodyFont = helv; bodyBold = helvBold; headingFont = helvBold; headingIsScript = false;
  }
  // A SCRIPT heading is used ONLY for the realtor's name, never for the unit address title
  // or any applicant/body data. Keep the title legible in that case.
  const titleFont = headingIsScript ? bodyBold : headingFont;
  return { bodyFont, bodyBold, headingFont, titleFont };
}

// The group report, from the FROZEN payload (lib/reportSnapshot.js buildSnapshot). Every printed
// field comes from the payload, so the PDF the landlord downloads matches the page and the email.
// ── THE LANDLORD REPORT: the /r/{token} page on paper ─────────────────────────────────────
// The payload (lib/reportSnapshot.js) is the only input. Letter, 0.75 inch margins, Inter and
// Fraunces from assets/fonts, ink text, the editorial red for the tick and the rank numerals,
// the rule colour for hairlines. One pass down the page: header, one block per applicant, the
// footer on the last page. A block that does not fit moves whole to the next page; no paragraph
// ends on a single word.
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_FILES = { inter: 'Inter-Regular.ttf', interMedium: 'Inter-Medium.ttf', fraunces: 'Fraunces-Regular.ttf' };
// Read once at module load; each document embeds the bytes (pdf-lib embeds per document).
const FONT_BYTES = Object.fromEntries(Object.entries(FONT_FILES).map(([k, f]) => { try { const raw = fs.readFileSync(path.join(FONT_DIR, f)); const b = new Uint8Array(raw.length + 16); b.set(raw); return [k, b]; } catch (e) { console.error('[landlordReportPdf] font missing, Helvetica stands in:', f); return [k, null]; } }));

const PT = { margin: 54, page: [612, 792] };
const RED_TICK = RED;

// Wrap to a width in points with the given font, then never leave one word alone on the last line.
function wrapWidth(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length >= 2 && lines[lines.length - 1].split(' ').length === 1) {
    const prev = lines[lines.length - 2].split(' ');
    if (prev.length >= 2) { const moved = prev.pop(); lines[lines.length - 2] = prev.join(' '); lines[lines.length - 1] = `${moved} ${lines[lines.length - 1]}`; }
  }
  return lines;
}

// The strings the report prints, in order: what the tests read and what the pages draw.
export function reportLines(payload) {
  const P = payload || {};
  const l = P.listing || {}, r = P.realtor || {};
  const money = (n) => (n != null ? `$${Number(n).toLocaleString('en-CA')}` : null);
  const longDate = (iso) => new Date(iso || Date.now()).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const header = {
    name: r.name || 'Your realtor', brokerage: r.brokerage || null, logoUrl: r.logoUrl || null,
    address: l.address || l.name || 'Listing',
    unitLine: [l.rent != null ? `${money(l.rent)} per month` : null, l.bedroomsLabel || null].filter(Boolean).join(' · '),
    prepared: `Prepared ${longDate(P.generatedAt)}${l.landlordName ? ` for ${l.landlordName}` : ''}`,
  };
  const blocks = (P.applicants || []).map((a) => {
    const n = a.numbers || {};
    return {
      rank: String(a.rank), name: a.name || 'Applicant',
      fit: a.fit && a.fit.score != null ? Number(a.fit.score).toFixed(1) : null,
      word: a.fit && a.fit.score != null ? String(a.fit.label || '').toUpperCase() : 'RENT SHARE UNKNOWN',
      sentence: a.sentence || '',
      confirmed: a.confirmedLine || null,
      reason: a.rank > 1 && a.reason ? `Below the one above: ${a.reason.charAt(0).toLowerCase() + a.reason.slice(1)}` : null,
      numbers: [['INCOME', n.annualIncome != null ? money(n.annualIncome) : 'not given'], ['RENT SHARE', n.rentSharePct != null ? `${Math.round(n.rentSharePct)}%` : 'unknown'], ['AT JOB', n.yearsAtJob ? `${n.yearsAtJob} yr${n.yearsAtJob === 1 ? '' : 's'}` : 'not given'], ['REFERENCES', String(n.references || 0)]],
    };
  });
  const footer = {
    criteria: l.criteriaLine ? `Ranked against ${r.name}'s criteria: ${l.criteriaLine}.` : null,
    signature: r.signature || null,
    sent: `Sent through Rentletter on behalf of ${r.name || 'your realtor'}.`,
  };
  return { header, blocks, footer };
}

export async function buildLandlordReportPdf({ payload }) {
  const { header, blocks, footer } = reportLines(payload);
  const pdfDoc = await PDFDocument.create();
  let fk = null;
  try { const m = await import('@pdf-lib/fontkit'); fk = m.default || m; pdfDoc.registerFontkit(fk); } catch (e) { fk = null; }
  // Layout features off: contextual and ligature substitutions swap in glyphs whose text layer
  // reads wrong. Tabular digits are the fonts' defaults (assets/fonts). Fraunces is subset by
  // pdf-lib (its full glyph order confuses the renderer); Inter is embedded whole.
  const FEATURES = { liga: false, calt: false, clig: false, dlig: false, rlig: false };
  const embed = async (bytes, std, subset) => { if (fk && bytes) { try { return await pdfDoc.embedFont(bytes, { subset, features: FEATURES }); } catch (e) { /* fall through */ } } return pdfDoc.embedFont(std); };
  const inter = await embed(FONT_BYTES.inter, StandardFonts.Helvetica, false);
  const interMedium = await embed(FONT_BYTES.interMedium, StandardFonts.HelveticaBold, false);
  const fraunces = await embed(FONT_BYTES.fraunces, StandardFonts.TimesRoman, true);
  const logo = await tryEmbedLogo(pdfDoc, header.logoUrl);

  const [PW, PH] = PT.page;
  const M = PT.margin;
  const W = PW - 2 * M;
  const pages = [];
  let page = null;
  let y = 0;
  const newPage = () => { page = pdfDoc.addPage([PW, PH]); pages.push(page); y = PH - M; };
  const text = (t, x, size, font, color = INK) => page.drawText(safe(t), { x, y, size, font, color });
  const hair = (yy) => page.drawLine({ start: { x: M, y: yy }, end: { x: PW - M, y: yy }, thickness: 0.5, color: RULE });
  // Letter spaced uppercase, drawn a character at a time (pdf-lib has no tracking option).
  const tracked = (t, x, size, font, color, spacing = size * 0.08) => { let cx = x; for (const ch of safe(t)) { page.drawText(ch, { x: cx, y, size, font, color }); cx += font.widthOfTextAtSize(ch, size) + spacing; } return cx - x - spacing; };
  const trackedWidth = (t, size, font, spacing = size * 0.08) => [...safe(t)].reduce((acc, ch) => acc + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
  const tick = (x, yy, size = 7) => { page.drawLine({ start: { x, y: yy + size * 0.45 }, end: { x: x + size * 0.36, y: yy }, thickness: 1.4, color: RED_TICK }); page.drawLine({ start: { x: x + size * 0.36, y: yy }, end: { x: x + size, y: yy + size * 0.9 }, thickness: 1.4, color: RED_TICK }); };

  // Heights, measured before drawing, so a block never splits.
  const LH = (size) => size * 1.3;
  const SMALL = 9.5 * 1.3;
  // Heights, measured before drawing, so a block never splits and four blocks fit one page.
  const blockHeight = (b) => {
    let h = 14; // air above the block
    h += 20; // line 1: rank, name, the Fit number
    h += 4 + wrapWidth(b.sentence, inter, 10.5, W).length * LH(10.5);
    if (b.confirmed) h += wrapWidth(b.confirmed, inter, 9.5, W - 14).length * SMALL;
    if (b.reason) h += wrapWidth(b.reason, inter, 9.5, W).length * SMALL;
    h += 6 + 8 + 3 + 10.5; // the four numbers: gap, label, gap, value
    h += 14; // air below, then the hairline
    return h;
  };
  const footerLines = footer.criteria ? wrapWidth(footer.criteria, inter, 9.5, W) : [];
  const footerHeight = 12 + footerLines.length * SMALL + 8 + 8 + (footer.signature ? SMALL : 0) + 8.5 * 1.3 + 2;

  // ── Header ──
  newPage();
  if (logo) {
    const s = logo.scale(1); const h = 28; const w = s.width * (h / s.height);
    page.drawImage(logo, { x: M, y: y - h, width: Math.min(w, 200), height: h });
    y -= h + 6;
  } else {
    y -= 13; text(header.name, M, 13, interMedium, INK); y -= 6;
  }
  if (header.brokerage) { y -= 10; text(header.brokerage, M, 10, inter, INK_MUTE); }
  y -= 8; hair(y); y -= 18 + 24;
  const addressLines = wrapWidth(header.address, fraunces, 24, W);
  addressLines.forEach((ln, i) => { text(ln, M, 24, fraunces, INK); if (i < addressLines.length - 1) y -= 24 * 1.15; });
  y -= 6 + 10;
  if (header.unitLine) { text(header.unitLine, M, 10, inter, INK_MUTE); y -= LH(10); }
  text(header.prepared, M, 10, inter, INK_MUTE);
  y -= 8; hair(y);

  // ── Blocks ──
  blocks.forEach((b, i) => {
    const last = i === blocks.length - 1;
    const need = blockHeight(b) + (last ? footerHeight : 0);
    if (y - need < M) { newPage(); }
    y -= 14; // air above
    // line 1: the rank as a red numeral, the name, the Fit number and word at the right edge.
    const lineTop = y;
    y = lineTop - 15;
    text(b.rank, M, 14, fraunces, RED);
    const rankW = fraunces.widthOfTextAtSize(b.rank, 14);
    text(b.name, M + rankW + 8, 13, interMedium, INK);
    if (b.fit) {
      const wordW = trackedWidth(b.word, 8, inter);
      const fitW = fraunces.widthOfTextAtSize(b.fit, 20);
      const wordX = PW - M - wordW;
      tracked(b.word, wordX, 8, inter, INK);
      y = lineTop - 17; text(b.fit, wordX - 8 - fitW, 20, fraunces, INK);
    } else {
      const wordW = trackedWidth(b.word, 8, inter);
      tracked(b.word, PW - M - wordW, 8, inter, INK_MUTE);
    }
    y = lineTop - 20 - 4 - 10.5;
    wrapWidth(b.sentence, inter, 10.5, W).forEach((ln) => { text(ln, M, 10.5, inter, INK); y -= LH(10.5); });
    y += LH(10.5) - SMALL;
    if (b.confirmed) { wrapWidth(b.confirmed, inter, 9.5, W - 14).forEach((ln, k) => { if (k === 0) tick(M, y + 1); text(ln, M + 14, 9.5, inter, INK); y -= SMALL; }); }
    if (b.reason) { wrapWidth(b.reason, inter, 9.5, W).forEach((ln) => { text(ln, M, 9.5, inter, INK_MUTE); y -= SMALL; }); }
    // the four numbers: labels above values, one tabular row
    y += SMALL; y -= 6 + 8;
    const colW = W / 4;
    b.numbers.forEach(([label, value], k) => { const x = M + k * colW; const save = y; tracked(label, x, 7.5, inter, INK_MUTE); y = save - 3 - 10.5; text(value, x, 10.5, inter, INK); y = save; });
    y -= 3 + 10.5;
    y -= 14; hair(y); // air below, then the hairline
  });

  // ── Footer, last page only ──
  y -= 12 + 9.5;
  footerLines.forEach((ln) => { text(ln, M, 9.5, inter, INK); y -= SMALL; });
  y += SMALL - 8; hair(y); y -= 8 + 9.5;
  if (footer.signature) { text(footer.signature, M, 9.5, interMedium, INK); y -= SMALL; }
  text(footer.sent, M, 8.5, inter, INK_MUTE);

  if (pages.length > 1) pages.forEach((pg, i) => { const label = `${i + 1} of ${pages.length}`; pg.drawText(label, { x: PW - M - inter.widthOfTextAtSize(label, 8.5), y: M - 18, size: 8.5, font: inter, color: INK_MUTE }); });
  // Plain objects (no object streams) so the font names stay inspectable in the file.
  return await pdfDoc.save({ useObjectStreams: false });
}

// ── STAGE 2: single-applicant document-verification confirmation ─────────────────────────────
// A compact, WHITE-LABEL confirmation for ONE finalist. Same letterhead/fonts/palette as the
// group report. Shows the verified facts (income/employment/credit) OR a clear "Not verified …"
// line (e.g. document-name mismatch). `verification` is the landlordVerification() result.
export async function buildVerificationPdf({ profile, listing, applicantName, verification, fonts }) {
  const pdfDoc = await PDFDocument.create();
  const { bodyFont, bodyBold, headingFont, titleFont } = await resolveBrandFonts(pdfDoc, fonts);
  const logo = await tryEmbedLogo(pdfDoc, profile?.logo_url);

  const pal = (profile?.brand_palette && typeof profile.brand_palette === 'object') ? profile.brand_palette : null;
  const PRIMARY_C = guardAccent(pal?.primary || profile?.brand_color, RED);
  let DIVIDER = RULE;
  if (pal?.primary) { const hh = hexToHsl(pal.primary); if (hh) DIVIDER = hexToPdfRgb(hslToHex(hh.h, Math.min(hh.s, 16), 89), RULE); }

  const realtorName = safe(signingName(profile, 'Realtor'));
  const brokerage = safe(profile?.brokerage || '').slice(0, 120);
  const phone = safe(profile?.phone || '').slice(0, 40);
  const who = safe(applicantName || 'Applicant').slice(0, 80);
  const unitName = safe(listing?.name || listing?.address || '');

  const MARGIN = 48, PW = 612, PH = 792;
  const page = pdfDoc.addPage([PW, PH]);

  // Header (white label letterhead, the same treatment as the group report).
  const LOGO_MAXW = 140, LOGO_MAXH = 52;
  const headerTopY = PH - 46;
  let nameX = MARGIN, logoBottomY = headerTopY;
  if (logo) {
    const s = logo.scale(1);
    const scale = Math.min(LOGO_MAXW / s.width, LOGO_MAXH / s.height);
    const dw = s.width * scale, dh = s.height * scale;
    page.drawImage(logo, { x: MARGIN, y: headerTopY - dh, width: dw, height: dh });
    nameX = MARGIN + dw + 18; logoBottomY = headerTopY - dh;
  }
  const blk = [{ text: realtorName, size: 17, font: headingFont, color: INK, gap: 18 }];
  if (brokerage) blk.push({ text: brokerage, size: 10.5, font: bodyFont, color: INK_SOFT, gap: 14 });
  if (phone) blk.push({ text: phone, size: 10.5, font: bodyFont, color: INK_SOFT, gap: 14 });
  const blkH = blk.reduce((a, l) => a + l.gap, 0);
  const logoH = headerTopY - logoBottomY;
  const blkTop = headerTopY - Math.max(0, (logoH - blkH) / 2);
  let ty = blkTop - 12;
  blk.forEach((l) => { page.drawText(safe(l.text).slice(0, 56), { x: nameX, y: ty, size: l.size, font: l.font, color: l.color }); ty -= l.gap; });
  const headerBottom = Math.min(logoBottomY, blkTop - blkH) - 16;
  page.drawLine({ start: { x: MARGIN, y: headerBottom }, end: { x: PW - MARGIN, y: headerBottom }, thickness: 0.5, color: DIVIDER });

  // Title.
  let y = headerBottom - 34;
  page.drawRectangle({ x: MARGIN, y: y + 12, width: 24, height: 2, color: PRIMARY_C });
  page.drawText('DOCUMENT VERIFICATION', { x: MARGIN + 32, y: y + 8, size: 9, font: bodyBold, color: PRIMARY_C });
  y -= 26;
  page.drawText(`Verification summary - ${who}`.slice(0, 56), { x: MARGIN, y, size: 22, font: titleFont, color: INK });
  y -= 20;
  const sub = [unitName ? `For ${unitName}` : null, `Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`].filter(Boolean).join('   ·   ');
  page.drawText(safe(sub).slice(0, 110), { x: MARGIN, y, size: 11, font: bodyFont, color: INK_SOFT });
  y -= 36;

  const v = verification || { verified: false };
  if (v.verified) {
    page.drawRectangle({ x: MARGIN, y: y + 1, width: 9, height: 9, color: GREEN });
    page.drawText('Documents verified', { x: MARGIN + 16, y, size: 13, font: bodyBold, color: GREEN });
    y -= 26;
    const facts = [];
    if (v.incomeVerified) facts.push(`Income matched documents${v.incomeFigure ? ` (${safe(v.incomeFigure)})` : ''}`);
    if (v.employmentVerified) facts.push('Employment verified');
    if (v.credit && v.credit.score != null) {
      const meta = [v.credit.bureau, v.credit.band].filter(Boolean).map(safe).join(', ');
      facts.push(`Credit score ${v.credit.score}${meta ? ` (${meta})` : ''}`);
    }
    if (!facts.length) facts.push('Supporting documents reviewed.');
    facts.forEach((f) => {
      page.drawRectangle({ x: MARGIN + 2, y: y + 3, width: 3, height: 3, color: PRIMARY_C });
      page.drawText(safe(f).slice(0, 92), { x: MARGIN + 14, y, size: 12, font: bodyFont, color: INK });
      y -= 20;
    });
  } else {
    const isMismatch = v.reason === 'name_mismatch';
    page.drawRectangle({ x: MARGIN, y: y + 1, width: 9, height: 9, color: isMismatch ? RED : INK_MUTE });
    page.drawText(safe(v.message || 'Not verified - no documents provided').slice(0, 72), { x: MARGIN + 16, y, size: 13, font: bodyBold, color: isMismatch ? RED : INK_SOFT });
    y -= 24;
    const explain = isMismatch
      ? 'The name on the supplied documents does not match this applicant. No verified facts are shown.'
      : v.reason === 'name_unclear'
        ? 'The document name could not be confirmed against this applicant. No verified facts are shown.'
        : 'No supporting documents have been reviewed for this applicant.';
    wrapText(explain, 92).forEach((ln) => { page.drawText(ln, { x: MARGIN, y, size: 11, font: bodyFont, color: INK_SOFT }); y -= 15; });
  }
  y -= 14;

  wrapText('Verification reflects documents supplied to the realtor and reviewed via Rentletter; documents are not retained.', 96)
    .forEach((ln) => { page.drawText(ln, { x: MARGIN, y, size: 9, font: bodyFont, color: INK_MUTE }); y -= 12; });

  // Footer: the province's human rights code reference.
  page.drawLine({ start: { x: MARGIN, y: 58 }, end: { x: PW - MARGIN, y: 58 }, thickness: 0.5, color: DIVIDER });
  page.drawText(`Self reported data - verify references independently. Screening must comply with the ${humanRightsCodeName(profile?.province)}.`, { x: MARGIN, y: 44, size: 8, font: bodyFont, color: INK_MUTE });
  page.drawText('Powered by Rentletter', { x: PW - MARGIN - 92, y: 30, size: 8, font: bodyFont, color: INK_MUTE });

  return await pdfDoc.save();
}
