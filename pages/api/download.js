import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function buildDocx(letterText, resumeText) {
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
    sections: [{
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
    }],
  });

  return await Packer.toBuffer(doc);
}

async function buildPdf(letterText, resumeText) {
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

  let page = pdfDoc.addPage([612, 792]);
  const margin = 60;
  const maxW = 612 - margin * 2;
  let y = 792 - margin;

  page.drawText('RENTAL COVER LETTER', { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.09, 0.07) });
  y -= 40;

  for (const line of letterText.split('\n')) {
    if (!line.trim()) { y -= 14; continue; }
    if (y < margin + 30) { page = pdfDoc.addPage([612, 792]); y = 792 - margin; }
    y = drawTextWrapped(page, line, margin, y, maxW, 11, font);
    y -= 4;
  }

  page = pdfDoc.addPage([612, 792]);
  y = 792 - margin;
  page.drawText('TENANT RESUME', { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.09, 0.07) });
  y -= 40;

  for (const line of resumeText.split('\n')) {
    if (!line.trim()) { y -= 10; continue; }
    if (y < margin + 30) { page = pdfDoc.addPage([612, 792]); y = 792 - margin; }
    const isHeader = /^[A-Z][A-Z\s]+$/.test(line.trim()) && line.trim().length > 2;
    y = drawTextWrapped(page, line, margin, y, maxW, isHeader ? 13 : 11, isHeader ? fontBold : font);
    y -= isHeader ? 8 : 3;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { format, letter, resume, fullName } = req.body;

  if (!letter) return res.status(400).json({ error: 'Missing letter content' });
  if (!['pdf', 'docx'].includes(format)) return res.status(400).json({ error: 'Invalid format' });

  const safeName = (fullName || 'rental').replace(/[^a-zA-Z0-9]/g, '_');

  try {
    if (format === 'pdf') {
      const buf = await buildPdf(letter, resume || '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_rental_letter.pdf"`);
      return res.send(buf);
    } else {
      const buf = await buildDocx(letter, resume || '');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_rental_letter.docx"`);
      return res.send(buf);
    }
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Failed to generate file' });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
