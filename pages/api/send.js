import { Resend } from 'resend';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Build DOCX from letter text ───────────────────────────────
async function buildDocx(letterText, resumeText, fullName) {
  const letterParagraphs = letterText.split('\n').map(line =>
    new Paragraph({
      children: [new TextRun({ text: line || ' ', font: 'Calibri', size: 24 })],
      spacing: { after: 120 },
    })
  );

  const resumeParagraphs = resumeText.split('\n').map(line => {
    const isHeader = /^[A-Z][A-Z\s]+$/.test(line.trim()) && line.trim().length > 2;
    return new Paragraph({
      children: [new TextRun({
        text: line || ' ',
        font: 'Calibri',
        size: isHeader ? 28 : 22,
        bold: isHeader,
      })],
      spacing: { after: isHeader ? 160 : 100 },
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'RENTAL COVER LETTER', font: 'Calibri', size: 32, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          ...letterParagraphs,
          new Paragraph({ children: [new TextRun({ text: '', break: 2 })] }),
          new Paragraph({
            children: [new TextRun({ text: 'TENANT RESUME', font: 'Calibri', size: 32, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
          }),
          ...resumeParagraphs,
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

// ─── Build PDF from letter text ────────────────────────────────
async function buildPdf(letterText, resumeText, fullName) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const drawTextWrapped = (page, text, x, y, maxWidth, size, useFont) => {
    const words = text.split(' ');
    let line = '';
    let cursorY = y;
    const lineHeight = size * 1.4;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const width = useFont.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) {
        page.drawText(line, { x, y: cursorY, size, font: useFont, color: rgb(0.1, 0.09, 0.07) });
        line = word;
        cursorY -= lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x, y: cursorY, size, font: useFont, color: rgb(0.1, 0.09, 0.07) });
      cursorY -= lineHeight;
    }
    return cursorY;
  };

  // ── Page 1: Cover letter ─────────────────────────────────────
  let page = pdfDoc.addPage([612, 792]); // US Letter
  const margin = 60;
  const maxW = 612 - margin * 2;
  let y = 792 - margin;

  page.drawText('RENTAL COVER LETTER', { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.09, 0.07) });
  y -= 40;

  const letterLines = letterText.split('\n');
  for (const line of letterLines) {
    if (!line.trim()) {
      y -= 14;
      continue;
    }
    if (y < margin + 30) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }
    y = drawTextWrapped(page, line, margin, y, maxW, 11, font);
    y -= 4;
  }

  // ── Page break for resume ────────────────────────────────────
  page = pdfDoc.addPage([612, 792]);
  y = 792 - margin;

  page.drawText('TENANT RESUME', { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.09, 0.07) });
  y -= 40;

  const resumeLines = resumeText.split('\n');
  for (const line of resumeLines) {
    if (!line.trim()) {
      y -= 10;
      continue;
    }
    if (y < margin + 30) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }
    const isHeader = /^[A-Z][A-Z\s]+$/.test(line.trim()) && line.trim().length > 2;
    y = drawTextWrapped(page, line, margin, y, maxW, isHeader ? 13 : 11, isHeader ? fontBold : font);
    y -= isHeader ? 8 : 3;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, fullName, letter, resume } = req.body;

  if (!email || !letter) {
    return res.status(400).json({ error: 'Missing email or letter content' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const docxBuffer = await buildDocx(letter, resume || '', fullName || 'Applicant');
    const pdfBuffer = await buildPdf(letter, resume || '', fullName || 'Applicant');

    const safeName = (fullName || 'rental').replace(/[^a-zA-Z0-9]/g, '_');

    const result = await resend.emails.send({
      from: 'RentLetter <hello@rentletter.ca>',
      to: email,
      subject: 'Your rental cover letter is ready',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1612;">
          <h1 style="font-size: 24px; margin-bottom: 12px;">Your letter is ready ✨</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #5a4f43;">
            Hi ${fullName || 'there'},
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #5a4f43;">
            Attached are your cover letter and tenant resume in both PDF and Word formats.
            Submit them alongside your standard rental application (Form 410 in Ontario).
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #5a4f43;">
            <strong>Quick tip:</strong> Print both, or attach the PDF when applying online.
            The Word file is there if you want to make edits before sending.
          </p>
          <p style="font-size: 13px; color: #7a6e60; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5dccc;">
            RentLetter · Built in Toronto<br>
            Not legal advice. Results not guaranteed.
          </p>
        </div>
      `,
      attachments: [
        { filename: `${safeName}_rental_letter.pdf`, content: pdfBuffer.toString('base64') },
        { filename: `${safeName}_rental_letter.docx`, content: docxBuffer.toString('base64') },
      ],
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

// Increase body size limit for large letters
export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
