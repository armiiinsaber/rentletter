// lib/landlordReportPdf.js
// Server-only. Builds a clean, WHITE-LABEL landlord report PDF for a realtor's
// shortlist using pdf-lib (the repo's existing PDF approach). The header is the
// REALTOR's branding (logo if PNG/JPG + name + brokerage + phone) — not Rentletter.
// Body = ranked shortlisted applicants with the screenable facts a landlord needs.
// OHRC-respecting footer; only a subtle "Powered by Rentletter".
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const INK = rgb(0.059, 0.059, 0.063);
const INK_SOFT = rgb(0.227, 0.227, 0.235);
const INK_MUTE = rgb(0.525, 0.525, 0.545);
const RED = rgb(0.843, 0.125, 0.153);
const GREEN = rgb(0.176, 0.490, 0.290);
const RULE = rgb(0.890, 0.866, 0.816);
const PAPER = rgb(0.98, 0.973, 0.953);

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

export async function buildLandlordReportPdf({ profile, listing, shortlisted }) {
  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await tryEmbedLogo(pdfDoc, profile?.logo_url);

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

  // ── Header (realtor branding) ──
  let headerBottom = PH - 56;
  let nameX = MARGIN;
  if (logo) {
    const scaled = logo.scale(1);
    const h = 40;
    const w = Math.min((scaled.width / scaled.height) * h, 150);
    page.drawImage(logo, { x: MARGIN, y: PH - 52 - h, width: w, height: h });
    nameX = MARGIN + w + 16;
  }
  let hy = PH - 64;
  page.drawText(realtorName, { x: nameX, y: hy, size: 16, font: helvBold, color: INK });
  hy -= 16;
  if (brokerage) { page.drawText(brokerage, { x: nameX, y: hy, size: 10, font: helv, color: INK_SOFT }); hy -= 13; }
  if (phone) { page.drawText(phone, { x: nameX, y: hy, size: 10, font: helv, color: INK_SOFT }); hy -= 13; }
  headerBottom = Math.min(hy, PH - 52 - 44) - 14;

  page.drawLine({ start: { x: MARGIN, y: headerBottom }, end: { x: PW - MARGIN, y: headerBottom }, thickness: 0.5, color: RULE });

  // ── Title ──
  let y = headerBottom - 34;
  page.drawRectangle({ x: MARGIN, y: y + 12, width: 24, height: 1, color: RED });
  page.drawText('TENANT SHORTLIST', { x: MARGIN + 32, y: y + 8, size: 9, font: helvBold, color: RED });
  y -= 26;
  page.drawText(unitName.slice(0, 60), { x: MARGIN, y, size: 24, font: helvBold, color: INK });
  y -= 20;
  const sub = [unitMeta, `${shortlisted.length} candidate${shortlisted.length === 1 ? '' : 's'}`, `Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`]
    .filter(Boolean).join('   ·   ');
  page.drawText(safe(sub), { x: MARGIN, y, size: 11, font: helv, color: INK_SOFT });
  y -= 28;

  // ── Ranked applicant blocks ──
  shortlisted.forEach((row, idx) => {
    const app = row.application || {};
    const notes = fitNotes(app.scorecard);
    const realtorNote = safe(row.decisionNotes || '');
    const noteLines = realtorNote ? wrapText(`Note: ${realtorNote}`, 96).slice(0, 3) : [];
    // Estimate block height for pagination.
    const blockH = 70 + notes.length * 13 + noteLines.length * 12;
    if (y - blockH < 80) {
      drawFooter(page);
      page = pdfDoc.addPage([PW, PH]);
      y = PH - 64;
    }

    // Rank + name
    page.drawText(`${idx + 1}`, { x: MARGIN, y, size: 18, font: helvBold, color: idx === 0 ? RED : INK_MUTE });
    page.drawText(safe(app.full_name || 'Applicant'), { x: MARGIN + 28, y, size: 15, font: helvBold, color: INK });
    // Score badge
    const overall = app.scorecard?.overall;
    if (overall != null) {
      const sc = overall >= 4.5 ? GREEN : overall >= 3.5 ? INK : RED;
      page.drawRectangle({ x: PW - MARGIN - 58, y: y - 4, width: 58, height: 24, color: sc });
      page.drawText(`${Number(overall).toFixed(1)}/5`, { x: PW - MARGIN - 48, y: y + 3, size: 12, font: helvBold, color: PAPER });
    }
    y -= 18;
    // Role · employer
    const role = [app.job_title, app.employer].filter(Boolean).map(safe).join(' at ');
    page.drawText((role || 'Role not listed').slice(0, 80), { x: MARGIN + 28, y, size: 11, font: helv, color: INK_SOFT });
    y -= 16;
    // Facts line: income, combined, rent-to-income
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
    // Fit notes (screenable)
    notes.forEach((n) => {
      page.drawText(`- ${n}`.slice(0, 100), { x: MARGIN + 28, y, size: 9.5, font: helv, color: INK_SOFT });
      y -= 13;
    });
    // Realtor note
    noteLines.forEach((ln) => {
      page.drawText(ln, { x: MARGIN + 28, y, size: 9.5, font: helv, color: INK });
      y -= 12;
    });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PW - MARGIN, y: y + 4 }, thickness: 0.5, color: RULE });
    y -= 14;
  });

  if (shortlisted.length === 0) {
    page.drawText('No shortlisted applicants yet.', { x: MARGIN, y, size: 12, font: helv, color: INK_MUTE });
  }

  drawFooter(page);
  return await pdfDoc.save();
}
