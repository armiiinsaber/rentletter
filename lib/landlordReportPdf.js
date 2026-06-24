// lib/landlordReportPdf.js
// Server-only. Builds a clean, WHITE-LABEL landlord report PDF using pdf-lib (the
// repo's existing PDF approach). The header is the REALTOR's branding (logo if
// PNG/JPG + name + brokerage + phone) — not Rentletter. Body = the FULL ranked list
// of applicants vs the landlord's criteria, best-fit-first, with the TOP 5 marked
// "Top matches", the rest below, and a clearly separated "Set aside" section (with
// the recorded OHRC-safe reason). OHRC-respecting footer; subtle "Powered by Rentletter".
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { reasonLabel } from './setAsideReasons';

const INK = rgb(0.059, 0.059, 0.063);
const INK_SOFT = rgb(0.227, 0.227, 0.235);
const INK_MUTE = rgb(0.525, 0.525, 0.545);
const RED = rgb(0.843, 0.125, 0.153);
const GREEN = rgb(0.176, 0.490, 0.290);
const RULE = rgb(0.890, 0.866, 0.816);
const PAPER = rgb(0.98, 0.973, 0.953);

// Parse a #rrggbb brand colour into a pdf-lib rgb accent. Falls back to the brand red
// if missing/invalid, or if the colour is too light to read as an accent on white.
function accentFrom(brandHex) {
  const m = String(brandHex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return RED;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum > 0.72) return RED; // too pale for accent text/rules on paper
  return rgb(r, g, b);
}

function safe(s) {
  return String(s || '').replace(/[^\x20-\x7E]/g, (ch) => {
    const map = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ' };
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

// Pull 2-3 OHRC-safe, screenable fit notes from the scorecard factor notes.
function fitNotes(scorecard) {
  if (!scorecard) return [];
  const out = [];
  const push = (f) => { const n = scorecard[f]?.note; if (n) out.push(safe(n)); };
  push('incomeStability');
  push('rentAffordability');
  push('rentalHistory');
  push('longTermIntent');
  return out.slice(0, 3);
}

export async function buildLandlordReportPdf({ profile, listing, active = [], setAside = [] }) {
  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await tryEmbedLogo(pdfDoc, profile?.logo_url);
  const total = active.length + setAside.length;
  const ACCENT = accentFrom(profile?.brand_color); // realtor's brand colour (or brand red)

  const realtorName = safe(profile?.full_name || '').slice(0, 120) || 'Realtor';
  const brokerage = safe(profile?.brokerage || '').slice(0, 120);
  const phone = safe(profile?.phone || '').slice(0, 40);

  const unitName = safe(listing?.name || listing?.address || 'Listing');
  const unitMeta = [
    listing?.monthly_rent ? `$${Number(listing.monthly_rent).toLocaleString()}/mo` : null,
    listing?.bedrooms ? `${safe(listing.bedrooms)} bed` : null,
  ].filter(Boolean).join('  ·  ');

  const MARGIN = 48;
  const PW = 612, PH = 792;

  let page = pdfDoc.addPage([PW, PH]);

  const drawFooter = (pg) => {
    pg.drawLine({ start: { x: MARGIN, y: 58 }, end: { x: PW - MARGIN, y: 58 }, thickness: 0.5, color: RULE });
    pg.drawText('Self-reported data - verify references independently. Screening must comply with the Ontario Human Rights Code.', {
      x: MARGIN, y: 44, size: 8, font: helv, color: INK_MUTE,
    });
    pg.drawText('Powered by Rentletter', { x: PW - MARGIN - 92, y: 30, size: 8, font: helv, color: INK_MUTE });
  };

  // ── Header (realtor branding) — letterhead layout ──
  // Fit the logo INTO a fixed max box, preserving aspect ratio (no stretch), top-left.
  // The name/brokerage block sits beside it, vertically centered to the logo.
  const LOGO_MAXW = 140, LOGO_MAXH = 52;
  const headerTopY = PH - 46; // top edge of header content
  let nameX = MARGIN;
  let logoBottomY = headerTopY;
  if (logo) {
    const s = logo.scale(1);
    const scale = Math.min(LOGO_MAXW / s.width, LOGO_MAXH / s.height);
    const dw = s.width * scale;
    const dh = s.height * scale;
    page.drawImage(logo, { x: MARGIN, y: headerTopY - dh, width: dw, height: dh });
    nameX = MARGIN + dw + 18;
    logoBottomY = headerTopY - dh;
  }

  // Name block (vertically centered against the logo box).
  const blk = [{ text: realtorName, size: 16, font: helvBold, color: INK, gap: 17 }];
  if (brokerage) blk.push({ text: brokerage, size: 10.5, font: helv, color: INK_SOFT, gap: 14 });
  if (phone) blk.push({ text: phone, size: 10.5, font: helv, color: INK_SOFT, gap: 14 });
  const blkH = blk.reduce((a, l) => a + l.gap, 0);
  const logoH = headerTopY - logoBottomY;
  const blkTop = headerTopY - Math.max(0, (logoH - blkH) / 2);
  let ty = blkTop - 12;
  blk.forEach((l) => { page.drawText(safe(l.text).slice(0, 56), { x: nameX, y: ty, size: l.size, font: l.font, color: l.color }); ty -= l.gap; });
  const blkBottomY = blkTop - blkH;

  const headerBottom = Math.min(logoBottomY, blkBottomY) - 16;
  page.drawLine({ start: { x: MARGIN, y: headerBottom }, end: { x: PW - MARGIN, y: headerBottom }, thickness: 0.5, color: RULE });

  // ── Title ──
  let y = headerBottom - 34;
  page.drawRectangle({ x: MARGIN, y: y + 12, width: 24, height: 2, color: ACCENT });
  page.drawText('RANKED APPLICANTS', { x: MARGIN + 32, y: y + 8, size: 9, font: helvBold, color: ACCENT });
  y -= 26;
  page.drawText(unitName.slice(0, 60), { x: MARGIN, y, size: 24, font: helvBold, color: INK });
  y -= 20;
  const sub = [unitMeta, `${total} applicant${total === 1 ? '' : 's'}, ranked best fit first`, `Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`]
    .filter(Boolean).join('   ·   ');
  page.drawText(safe(sub), { x: MARGIN, y, size: 11, font: helv, color: INK_SOFT });
  y -= 28;

  const ensureSpace = (h) => {
    if (y - h < 80) { drawFooter(page); page = pdfDoc.addPage([PW, PH]); y = PH - 64; }
  };

  const drawSectionHeader = (label, color, sub2) => {
    ensureSpace(34);
    page.drawRectangle({ x: MARGIN, y: y + 11, width: 18, height: 1, color });
    page.drawText(safe(label), { x: MARGIN + 26, y: y + 7, size: 10, font: helvBold, color });
    y -= 18;
    if (sub2) { page.drawText(safe(sub2).slice(0, 110), { x: MARGIN, y, size: 9, font: helv, color: INK_MUTE }); y -= 14; }
    y -= 4;
  };

  // Draw one applicant block. rankNum: number to show (or null). setAsideReasonText:
  // shown for set-aside applicants.
  const drawApplicant = (row, rankNum, highlight, setAsideReasonText) => {
    const app = row.application || {};
    const notes = fitNotes(app.scorecard);
    const realtorNote = safe(row.decisionNotes || '');
    const noteLines = (!setAsideReasonText && realtorNote) ? wrapText(`Note: ${realtorNote}`, 96).slice(0, 3) : [];
    const blockH = 70 + notes.length * 13 + noteLines.length * 12 + (setAsideReasonText ? 14 : 0);
    ensureSpace(blockH);

    if (rankNum != null) {
      page.drawText(`${rankNum}`, { x: MARGIN, y, size: 18, font: helvBold, color: highlight ? ACCENT : INK_MUTE });
    }
    page.drawText(safe(app.full_name || 'Applicant'), { x: MARGIN + 28, y, size: 15, font: helvBold, color: setAsideReasonText ? INK_SOFT : INK });
    const overall = app.scorecard?.overall;
    if (overall != null) {
      const sc = overall >= 4.5 ? GREEN : overall >= 3.5 ? INK : RED;
      page.drawRectangle({ x: PW - MARGIN - 58, y: y - 4, width: 58, height: 24, color: sc });
      page.drawText(`${Number(overall).toFixed(1)}/5`, { x: PW - MARGIN - 48, y: y + 3, size: 12, font: helvBold, color: PAPER });
    }
    y -= 18;
    const role = [app.job_title, app.employer].filter(Boolean).map(safe).join(' at ');
    page.drawText((role || 'Role not listed').slice(0, 80), { x: MARGIN + 28, y, size: 11, font: helv, color: INK_SOFT });
    y -= 16;
    const facts = [];
    if (app.annual_income) facts.push(`$${Number(app.annual_income).toLocaleString()}/yr`);
    if (app.co_applicant?.annualIncome) {
      const combined = (Number(app.annual_income) || 0) + (Number(app.co_applicant.annualIncome) || 0);
      facts.push(`household $${combined.toLocaleString()}/yr`);
    }
    if (app.rent_to_income_ratio != null) facts.push(`${app.rent_to_income_ratio}% rent-to-income`);
    if (app.application_number) facts.push(safe(app.application_number));
    page.drawText(facts.join('   ·   ').slice(0, 96), { x: MARGIN + 28, y, size: 10, font: helv, color: INK_MUTE });
    y -= 16;
    if (setAsideReasonText) {
      page.drawText(`Set aside - ${setAsideReasonText}`.slice(0, 100), { x: MARGIN + 28, y, size: 9.5, font: helvBold, color: INK_SOFT });
      y -= 14;
    }
    notes.forEach((n) => {
      page.drawText(`- ${n}`.slice(0, 100), { x: MARGIN + 28, y, size: 9.5, font: helv, color: INK_SOFT });
      y -= 13;
    });
    noteLines.forEach((ln) => {
      page.drawText(ln, { x: MARGIN + 28, y, size: 9.5, font: helv, color: INK });
      y -= 12;
    });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PW - MARGIN, y: y + 4 }, thickness: 0.5, color: RULE });
    y -= 14;
  };

  if (total === 0) {
    page.drawText('No applicants yet.', { x: MARGIN, y, size: 12, font: helv, color: INK_MUTE });
  } else {
    const topN = active.slice(0, 5);
    const rest = active.slice(5);
    if (topN.length) {
      drawSectionHeader('TOP MATCHES', ACCENT, `The ${topN.length} best fit${topN.length === 1 ? '' : 's'} for your stated criteria`);
      topN.forEach((row, i) => drawApplicant(row, i + 1, true, null));
    }
    if (rest.length) {
      drawSectionHeader('ALSO RANKED', INK_MUTE, null);
      rest.forEach((row, i) => drawApplicant(row, i + 6, false, null));
    }
    if (setAside.length) {
      drawSectionHeader('SET ASIDE', INK_MUTE, 'De-prioritized for the screenable reasons noted below.');
      setAside.forEach((row) => drawApplicant(row, null, false, reasonLabel(row.decisionReasonCode)));
    }
  }

  drawFooter(page);
  return await pdfDoc.save();
}
