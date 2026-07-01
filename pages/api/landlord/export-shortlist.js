// /api/landlord/export-shortlist
// Generate a PDF summary of shortlisted applicants for the landlord to share/save.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const INK = rgb(0.059, 0.059, 0.063);
const INK_SOFT = rgb(0.227, 0.227, 0.235);
const INK_MUTE = rgb(0.525, 0.525, 0.545);
const RED = rgb(0.843, 0.125, 0.153);
const GREEN = rgb(0.176, 0.490, 0.290);
const RULE = rgb(0.890, 0.866, 0.816);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { applications, decisions, options, realtorProfile } = req.body || {};
  const isRealtor = !!(realtorProfile && realtorProfile.isRealtor && realtorProfile.fullName);
  const realtorName = isRealtor ? String(realtorProfile.fullName || '').slice(0, 120) : '';
  const realtorBrokerage = isRealtor ? String(realtorProfile.brokerage || '').slice(0, 200) : '';
  const realtorPhone = isRealtor ? String(realtorProfile.phone || '').slice(0, 40) : '';
  if (!Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: 'No applications provided.' });
  }

  // Filter: only export shortlisted (default), or all if requested
  const includeAll = options?.includeAll === true;
  const apps = applications.filter(a => {
    const d = decisions?.[a.applicationNumber];
    if (includeAll) return true;
    return d?.status === 'shortlist';
  });

  if (apps.length === 0) {
    return res.status(400).json({ error: 'No shortlisted applicants to export. Shortlist some applicants first.' });
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ─── COVER PAGE ───
    const cover = pdfDoc.addPage([612, 792]);
    let y = 720;

    // Red bar accent
    cover.drawRectangle({ x: 48, y: y - 4, width: 3, height: 16, color: RED });
    cover.drawText('Rentletter', { x: 58, y, size: 14, font: helvBold, color: INK });

    y -= 80;
    cover.drawRectangle({ x: 48, y: y + 14, width: 24, height: 1, color: RED });
    cover.drawText('SHORTLIST', { x: 80, y: y + 10, size: 9, font: helvBold, color: RED });

    y -= 30;
    cover.drawText('Tenant shortlist', { x: 48, y, size: 36, font: helvBold, color: INK });
    y -= 38;
    cover.drawText(`${apps.length} applicant${apps.length === 1 ? '' : 's'}`, { x: 48, y, size: 14, font: helv, color: INK_SOFT });

    y -= 60;
    cover.drawText(`Generated ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`, { x: 48, y, size: 11, font: helv, color: INK_MUTE });

    y -= 24;
    cover.drawText('Self-reported data from tenants. Verify references independently.', { x: 48, y, size: 10, font: helv, color: INK_MUTE });

    // Realtor branding block — appears on cover when set
    if (isRealtor) {
      y -= 56;
      // Black filled rectangle as branding background
      cover.drawRectangle({ x: 48, y: y - 60, width: 380, height: 80, color: INK });
      cover.drawText('PREPARED BY', { x: 64, y: y - 4, size: 8, font: helvBold, color: { type: 'RGB', red: 0.78, green: 0.76, blue: 0.7 } });
      cover.drawText(realtorName, { x: 64, y: y - 22, size: 16, font: helvBold, color: { type: 'RGB', red: 0.98, green: 0.97, blue: 0.95 } });
      if (realtorBrokerage) {
        cover.drawText(realtorBrokerage.slice(0, 60), { x: 64, y: y - 40, size: 10, font: helv, color: { type: 'RGB', red: 0.78, green: 0.76, blue: 0.7 } });
      }
      if (realtorPhone) {
        cover.drawText(realtorPhone, { x: 64, y: y - 54, size: 10, font: helv, color: { type: 'RGB', red: 0.78, green: 0.76, blue: 0.7 } });
      }
      y -= 70;
    }

    // List of applicants in summary
    y -= 60;
    cover.drawText('CANDIDATES', { x: 48, y, size: 9, font: helvBold, color: INK_MUTE });
    y -= 24;
    apps.forEach((app, idx) => {
      if (y < 100) return;
      cover.drawText(`${idx + 1}.`, { x: 48, y, size: 11, font: helvBold, color: INK });
      cover.drawText(safe(app.tenant?.fullName || 'Unknown'), { x: 68, y, size: 11, font: helvBold, color: INK });
      const role = `${app.employment?.jobTitle || ''} · ${app.employment?.employer || ''}`;
      cover.drawText(safe(role).slice(0, 60), { x: 230, y, size: 10, font: helv, color: INK_SOFT });
      const overall = app.scorecard?.overall != null ? String(app.scorecard.overall) : '—';
      cover.drawText(`Score ${overall}/5`, { x: 500, y, size: 10, font: helvBold, color: INK });
      y -= 18;
    });

    // Footer on cover
    cover.drawLine({ start: { x: 48, y: 60 }, end: { x: 564, y: 60 }, thickness: 0.5, color: RULE });
    cover.drawText('rentletter.ca · Ontario · Free for landlords + realtors', { x: 48, y: 46, size: 9, font: helv, color: INK_MUTE });
    cover.drawText('Compliance: subject to Ontario Human Rights Code', { x: 48, y: 34, size: 9, font: helv, color: INK_MUTE });

    // ─── ONE PAGE PER APPLICANT ───
    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      const decision = decisions?.[app.applicationNumber] || {};
      const page = pdfDoc.addPage([612, 792]);
      let py = 720;

      // Top header bar
      page.drawRectangle({ x: 48, y: py + 4, width: 3, height: 14, color: RED });
      page.drawText(`${i + 1} / ${apps.length}`, { x: 58, y: py + 6, size: 10, font: helvBold, color: INK_MUTE });
      page.drawText(safe(app.applicationNumber), { x: 480, y: py + 6, size: 9, font: helv, color: INK_MUTE });

      py -= 30;
      page.drawText(safe(app.tenant?.fullName || 'Unknown'), { x: 48, y: py, size: 24, font: helvBold, color: INK });
      const score = app.scorecard?.overall;
      if (score != null) {
        const scoreColor = score >= 4.5 ? GREEN : score >= 3.5 ? INK : RED;
        page.drawRectangle({ x: 500, y: py - 4, width: 60, height: 28, color: scoreColor });
        page.drawText(`${score}/5`, { x: 510, y: py + 4, size: 14, font: helvBold, color: rgb(0.98, 0.973, 0.953) });
      }

      py -= 22;
      const role = `${app.employment?.jobTitle || ''} at ${app.employment?.employer || ''}`;
      page.drawText(safe(role), { x: 48, y: py, size: 12, font: helv, color: INK_SOFT });

      py -= 30;
      page.drawLine({ start: { x: 48, y: py }, end: { x: 564, y: py }, thickness: 0.5, color: RULE });
      py -= 24;

      // ── PROFILE GRID ──
      const drawRow = (label, value) => {
        if (py < 80) return;
        page.drawText(label.toUpperCase(), { x: 48, y: py, size: 8, font: helvBold, color: INK_MUTE });
        page.drawText(safe(value || '—').slice(0, 80), { x: 48, y: py - 14, size: 11, font: helv, color: INK });
        py -= 34;
      };

      drawRow('Annual income', `$${(app.employment?.annualIncome || 0).toLocaleString()} CAD`);
      if (app.coApplicant?.annualIncome) {
        const combined = (app.employment?.annualIncome || 0) + (app.coApplicant?.annualIncome || 0);
        drawRow('Combined household', `$${combined.toLocaleString()} CAD/year (joint with ${app.coApplicant?.name || 'co-applicant'})`);
      }
      drawRow('Rent-to-income', app.apartment?.rentToIncomeRatio ? `${app.apartment.rentToIncomeRatio}%` : '—');
      drawRow('Apartment', `${app.apartment?.address || '—'} · ${app.apartment?.description || ''}`);
      drawRow('Move-in', app.move?.moveInDate || '—');
      drawRow('Rental history', app.rental?.previousAddress
        ? `${app.rental.yearsAtPrevious || '?'} years at ${app.rental.previousAddress}`
        : 'First-time renter or not provided');
      drawRow('Reason for moving', app.move?.reasonForMoving || '—');
      drawRow('Smoker', app.household?.smoker === 'no' ? 'Non-smoker' : app.household?.smoker === 'outdoor' ? 'Outdoor only' : app.household?.smoker === 'yes' ? 'Yes' : '—');
      drawRow('Pets', app.lifestyle?.pets || 'None');
      drawRow('Vehicle', app.vehicle?.makeModel ? `${app.vehicle.makeModel}${app.vehicle.year ? ` (${app.vehicle.year})` : ''}` : 'None');

      // Contact
      const contact = [];
      if (app.tenant?.phone) contact.push(app.tenant.phone);
      if (app.email) contact.push(app.email);
      if (contact.length) drawRow('Contact', contact.join(' · '));

      // Disclosures
      if (app.disclosures) {
        if (py < 120) {
          // continue on next page
          const cont = pdfDoc.addPage([612, 792]);
          py = 720;
          cont.drawText(`${safe(app.tenant?.fullName)} — continued`, { x: 48, y: py, size: 12, font: helvBold, color: INK });
          py -= 30;
        }
        page.drawText('DISCLOSURES', { x: 48, y: py, size: 8, font: helvBold, color: RED });
        py -= 14;
        const wrapped = wrapText(safe(app.disclosures), 90);
        wrapped.slice(0, 4).forEach(line => {
          page.drawText(line, { x: 48, y: py, size: 10, font: helv, color: INK_SOFT });
          py -= 14;
        });
        py -= 10;
      }

      // Notes
      if (decision.notes && py > 100) {
        page.drawText('YOUR NOTES', { x: 48, y: py, size: 8, font: helvBold, color: RED });
        py -= 14;
        const wrapped = wrapText(safe(decision.notes), 90);
        wrapped.slice(0, 4).forEach(line => {
          page.drawText(line, { x: 48, y: py, size: 10, font: helv, color: INK_SOFT });
          py -= 14;
        });
      }

      // Footer
      page.drawLine({ start: { x: 48, y: 60 }, end: { x: 564, y: 60 }, thickness: 0.5, color: RULE });
      page.drawText(`Self-reported data · Verify references · rentletter.ca/landlord`, {
        x: 48, y: 46, size: 8, font: helv, color: INK_MUTE,
      });
    }

    const pdfBytes = await pdfDoc.save();

    const filename = `rentletter-shortlist-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('Shortlist PDF export error:', e);
    return res.status(500).json({ error: 'Failed to generate PDF.' });
  }
}

function safe(s) {
  return String(s || '').replace(/[^\x20-\x7E]/g, ch => {
    // Replace common smart punctuation/dashes with ASCII equivalents
    const map = { '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00A0': ' ' };
    return map[ch] || '';
  });
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxCharsPerLine) {
      if (line) lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}
