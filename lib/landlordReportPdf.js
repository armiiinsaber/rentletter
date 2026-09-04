// lib/landlordReportPdf.js
// Server-only. Builds a clean, WHITE-LABEL landlord report PDF using pdf-lib (the
// repo's existing PDF approach). The header is the REALTOR's branding (logo if
// PNG/JPG + name + brokerage + phone) — not Rentletter. Body = the FULL ranked list
// of applicants vs the landlord's criteria, best-fit-first, with the TOP 5 marked
// "Top matches", the rest below, and a clearly separated "Set aside" section (with
// the recorded OHRC-safe reason). OHRC-respecting footer; subtle "Powered by Rentletter".
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
const PAPER = rgb(0.98, 0.973, 0.953);

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
// Fonts are embedded WITHOUT subsetting — pdf-lib's subsetter corrupts the glyph data for
// several bundled fonts (e.g. Inter) and shredded body text. Full embedding renders correctly.
//
// IMPORTANT: pdf-lib embeds LAZILY. embedFont() only parses; the glyph walk that can throw
// (a malformed glyph, fontkit edge cases) runs inside pdfDoc.save(), long after any try/catch
// around embedFont(). So each face is first embedded into a throwaway document and forced
// through `.embed()` — if that fails, the face is rejected and the report falls back to
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
    console.error('[landlordReportPdf] brand font handling failed — report uses Helvetica', JSON.stringify({ errorName: e?.name || null, message: String(e?.message || e).slice(0, 300) }));
    bodyFont = helv; bodyBold = helvBold; headingFont = helvBold; headingIsScript = false;
  }
  // A SCRIPT heading is used ONLY for the realtor's name — never for the unit-address title
  // or any applicant/body data. Keep the title legible in that case.
  const titleFont = headingIsScript ? bodyBold : headingFont;
  return { bodyFont, bodyBold, headingFont, titleFont };
}

// The group report, from the FROZEN payload (lib/reportSnapshot.js buildSnapshot). Every printed
// field comes from the payload, so the PDF the landlord downloads matches the page and the email.
export async function buildLandlordReportPdf({ payload, fonts }) {
  const P = payload || {};
  const realtor = P.realtor || {};
  const unit = P.listing || {};
  const applicants = Array.isArray(P.applicants) ? P.applicants : [];
  const pdfDoc = await PDFDocument.create();
  const { bodyFont, bodyBold, headingFont, titleFont } = await resolveBrandFonts(pdfDoc, fonts);

  const logo = await tryEmbedLogo(pdfDoc, realtor.logoUrl);
  const total = applicants.length;

  const pal = realtor.brandPalette && typeof realtor.brandPalette === 'object' ? realtor.brandPalette : null;
  const PRIMARY_C = guardAccent(pal?.primary || realtor.brandColor, RED);
  const ACCENT_C = guardAccent(pal?.accent, PRIMARY_C);
  let DIVIDER = RULE;
  if (pal?.primary) { const hh = hexToHsl(pal.primary); if (hh) DIVIDER = hexToPdfRgb(hslToHex(hh.h, Math.min(hh.s, 16), 89), RULE); }

  const realtorName = safe(realtor.name || 'Realtor');
  const brokerage = safe(realtor.brokerage || '').slice(0, 120);
  const phone = safe(realtor.phone || '').slice(0, 40);

  const unitName = safe(unit.address || unit.name || 'Listing');
  const unitMeta = [
    unit.rent ? `$${Number(unit.rent).toLocaleString()}/mo` : null,
    unit.bedroomsLabel ? safe(unit.bedroomsLabel) : null,
  ].filter(Boolean).join('  ·  ');

  const MARGIN = 48;
  const PW = 612, PH = 792;
  let page = pdfDoc.addPage([PW, PH]);

  const hrCode = humanRightsCodeName(realtor.province);
  const drawFooter = (pg) => {
    pg.drawLine({ start: { x: MARGIN, y: 58 }, end: { x: PW - MARGIN, y: 58 }, thickness: 0.5, color: DIVIDER });
    pg.drawText(`Self reported data. Verify references independently. Screening must comply with the ${hrCode}.`, { x: MARGIN, y: 44, size: 8, font: bodyFont, color: INK_MUTE });
    pg.drawText('Powered by Rentletter', { x: PW - MARGIN - 92, y: 30, size: 8, font: bodyFont, color: INK_MUTE });
  };

  // Header: the realtor's letterhead.
  const LOGO_MAXW = 140, LOGO_MAXH = 52;
  const headerTopY = PH - 46;
  let nameX = MARGIN;
  let logoBottomY = headerTopY;
  if (logo) {
    const sz = logo.scale(1);
    const scale = Math.min(LOGO_MAXW / sz.width, LOGO_MAXH / sz.height);
    const dw = sz.width * scale, dh = sz.height * scale;
    page.drawImage(logo, { x: MARGIN, y: headerTopY - dh, width: dw, height: dh });
    nameX = MARGIN + dw + 18;
    logoBottomY = headerTopY - dh;
  }
  const blk = [{ text: realtorName, size: 17, font: headingFont, color: INK, gap: 18 }];
  if (brokerage) blk.push({ text: brokerage, size: 10.5, font: bodyFont, color: INK_SOFT, gap: 14 });
  if (phone) blk.push({ text: phone, size: 10.5, font: bodyFont, color: INK_SOFT, gap: 14 });
  const blkH = blk.reduce((acc, l) => acc + l.gap, 0);
  const logoH = headerTopY - logoBottomY;
  const blkTop = headerTopY - Math.max(0, (logoH - blkH) / 2);
  let ty = blkTop - 12;
  blk.forEach((l) => { page.drawText(safe(l.text).slice(0, 56), { x: nameX, y: ty, size: l.size, font: l.font, color: l.color }); ty -= l.gap; });
  const headerBottom = Math.min(logoBottomY, blkTop - blkH) - 16;
  page.drawLine({ start: { x: MARGIN, y: headerBottom }, end: { x: PW - MARGIN, y: headerBottom }, thickness: 0.5, color: DIVIDER });

  // Title.
  let y = headerBottom - 34;
  page.drawRectangle({ x: MARGIN, y: y + 12, width: 24, height: 2, color: PRIMARY_C });
  page.drawText('RANKED APPLICANTS', { x: MARGIN + 32, y: y + 8, size: 9, font: bodyBold, color: PRIMARY_C });
  y -= 26;
  page.drawText(unitName.slice(0, 60), { x: MARGIN, y, size: 24, font: titleFont, color: INK });
  y -= 20;
  const prepared = P.generatedAt ? new Date(P.generatedAt) : new Date();
  const sub = [unitMeta, `${total} applicant${total === 1 ? '' : 's'}, ranked best fit first`, `Prepared ${prepared.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}${unit.landlordName ? ` for ${safe(unit.landlordName)}` : ''}`]
    .filter(Boolean).join('   ·   ');
  page.drawText(safe(sub).slice(0, 120), { x: MARGIN, y, size: 11, font: bodyFont, color: INK_SOFT });
  y -= 28;

  const ensureSpace = (h) => { if (y - h < 80) { drawFooter(page); page = pdfDoc.addPage([PW, PH]); y = PH - 64; } };
  const drawSectionHeader = (label, color, sub2) => {
    ensureSpace(34);
    page.drawRectangle({ x: MARGIN, y: y + 11, width: 18, height: 2, color });
    page.drawText(safe(label), { x: MARGIN + 26, y: y + 7, size: 10, font: bodyBold, color });
    y -= 18;
    if (sub2) { page.drawText(safe(sub2).slice(0, 110), { x: MARGIN, y, size: 9, font: bodyFont, color: INK_MUTE }); y -= 14; }
    y -= 4;
  };

  // One applicant block from the payload: rank, name, Fit and word, the role line, the four
  // numbers, the confirmed line, the reason line.
  const drawApplicant = (a, highlight) => {
    const n = a.numbers || {};
    const blockH = 70 + (a.confirmedLine ? 13 : 0) + (a.reason ? 13 : 0);
    ensureSpace(blockH);
    page.drawText(`${a.rank}`, { x: MARGIN, y, size: 18, font: bodyBold, color: highlight ? PRIMARY_C : INK_MUTE });
    page.drawText(safe(a.name || 'Applicant'), { x: MARGIN + 28, y, size: 15, font: bodyBold, color: INK });
    const fit = a.fit || null;
    if (fit && fit.score != null) {
      const sc = fit.score >= 4.5 ? GREEN : fit.score >= 3.5 ? INK : RED;
      page.drawRectangle({ x: PW - MARGIN - 58, y: y - 4, width: 58, height: 24, color: sc });
      page.drawText(`${Number(fit.score).toFixed(1)}/5`, { x: PW - MARGIN - 48, y: y + 3, size: 12, font: bodyBold, color: PAPER });
      const word = String(fit.label || '').toUpperCase();
      page.drawText(word, { x: PW - MARGIN - 58 - 6 - bodyBold.widthOfTextAtSize(word, 7.5), y: y + 5, size: 7.5, font: bodyBold, color: INK_MUTE });
    } else {
      const word = 'RENT SHARE UNKNOWN';
      page.drawText(word, { x: PW - MARGIN - bodyBold.widthOfTextAtSize(word, 7.5), y: y + 5, size: 7.5, font: bodyBold, color: INK_MUTE });
    }
    y -= 18;
    const role = [a.jobTitle, a.employer].filter(Boolean).map(safe).join(' at ');
    page.drawText((role || 'Role not listed').slice(0, 80), { x: MARGIN + 28, y, size: 11, font: bodyFont, color: INK_SOFT });
    y -= 16;
    const facts = [];
    if (n.annualIncome) facts.push(`$${Number(n.annualIncome).toLocaleString()}/yr before tax`);
    if (n.rentSharePct != null) facts.push(`${Math.round(n.rentSharePct)}% rent share`);
    if (n.yearsAtJob) facts.push(`${n.yearsAtJob} yr${n.yearsAtJob === 1 ? '' : 's'} at job`);
    facts.push(`${n.references || 0} reference${n.references === 1 ? '' : 's'}`);
    if (a.landlordReference) facts.push('landlord reference on file');
    page.drawText(facts.join('   ·   ').slice(0, 110), { x: MARGIN + 28, y, size: 10, font: bodyFont, color: INK_MUTE });
    y -= 16;
    if (a.confirmedLine) { page.drawText(safe(a.confirmedLine).slice(0, 100), { x: MARGIN + 28, y, size: 9.5, font: bodyBold, color: INK_SOFT }); y -= 13; }
    if (a.reason) { page.drawText(safe(`Below the one above: ${a.reason}`).slice(0, 100), { x: MARGIN + 28, y, size: 9.5, font: bodyFont, color: INK_SOFT }); y -= 13; }
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PW - MARGIN, y: y + 4 }, thickness: 0.5, color: DIVIDER });
    y -= 14;
  };

  if (total === 0) {
    page.drawText('No applicants yet.', { x: MARGIN, y, size: 12, font: bodyFont, color: INK_MUTE });
  } else {
    const topN = applicants.slice(0, 5);
    const rest = applicants.slice(5);
    drawSectionHeader('TOP MATCHES', ACCENT_C, `The ${topN.length} best fit${topN.length === 1 ? '' : 's'} for your stated criteria`);
    topN.forEach((a) => drawApplicant(a, true));
    if (rest.length) { drawSectionHeader('ALSO RANKED', INK_MUTE, null); rest.forEach((a) => drawApplicant(a, false)); }
  }
  drawFooter(page);
  return await pdfDoc.save();
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

  // Header (white-label letterhead — identical treatment to the group report).
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

  // Footer — province-aware human-rights-code reference.
  page.drawLine({ start: { x: MARGIN, y: 58 }, end: { x: PW - MARGIN, y: 58 }, thickness: 0.5, color: DIVIDER });
  page.drawText(`Self reported data - verify references independently. Screening must comply with the ${humanRightsCodeName(profile?.province)}.`, { x: MARGIN, y: 44, size: 8, font: bodyFont, color: INK_MUTE });
  page.drawText('Powered by Rentletter', { x: PW - MARGIN - 92, y: 30, size: 8, font: bodyFont, color: INK_MUTE });

  return await pdfDoc.save();
}
