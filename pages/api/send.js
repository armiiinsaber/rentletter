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

    const firstName = (fullName || '').split(' ')[0] || 'there';

    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: email,
      subject: 'Your letter is ready',
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background: #f4f1ea; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f4f1ea;">
    <tr>
      <td align="center" style="padding: 48px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; background: #f4f1ea;">

          <!-- Masthead -->
          <tr>
            <td style="padding-bottom: 28px; border-bottom: 1px solid #d8d2c4;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align: baseline;">
                    <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 22px; color: #0e1a2b;">R</span><span style="font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #0e1a2b; letter-spacing: 0.02em;">entletter</span><span style="font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #7a8392; letter-spacing: 0.15em; margin-left: 6px;">/ CA</span>
                  </td>
                  <td align="right" style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7a8392; letter-spacing: 0.1em; text-transform: uppercase;">
                    Vol. 1 · Delivered
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Section marker -->
          <tr>
            <td style="padding-top: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width: 32px; height: 1px; background: #b8412e; padding: 0; line-height: 1px; font-size: 1px;">&nbsp;</td>
                  <td style="padding-left: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #7a8392; letter-spacing: 0.12em; text-transform: uppercase;">
                    <span style="color: #b8412e;">§04</span> &nbsp; Documents enclosed
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 20px 0 24px;">
              <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: 48px; line-height: 1.0; letter-spacing: -0.02em; color: #0e1a2b; margin: 0;">
                Your letter is <em style="font-style: italic;">ready,</em><br>${firstName}.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.65; color: #3a4658; margin: 0 0 18px;">
                Attached are two documents — your cover letter and a one-page tenant resume — in both PDF and Word formats.
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.65; color: #3a4658; margin: 0 0 18px;">
                Send them alongside your standard rental application. In Ontario, that's Form 410.
              </p>
            </td>
          </tr>

          <!-- Document manifest -->
          <tr>
            <td style="padding: 8px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #d8d2c4; background: #fafaf5;">
                <tr>
                  <td style="padding: 18px 24px; border-bottom: 1px solid #d8d2c4;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Instrument Serif', Georgia, serif; font-size: 18px; color: #0e1a2b;">
                          The Cover Letter
                        </td>
                        <td align="right" style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7a8392; letter-spacing: 0.1em; text-transform: uppercase;">
                          PDF · DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Instrument Serif', Georgia, serif; font-size: 18px; color: #0e1a2b;">
                          The Tenant Resume
                        </td>
                        <td align="right" style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7a8392; letter-spacing: 0.1em; text-transform: uppercase;">
                          PDF · DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notes -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #7a8392; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 14px;">
                A note on use
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.65; color: #3a4658; margin: 0 0 14px;">
                Most applicants attach the PDF when applying online, or print both for in-person viewings. The Word file is there if you want to make further edits before sending.
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.65; color: #3a4658; margin: 0;">
                Good luck out there.
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-top: 32px; border-top: 1px solid #d8d2c4;">
              <p style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 18px; color: #0e1a2b; margin: 0 0 4px;">
                — The desk at Rentletter
              </p>
              <p style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7a8392; letter-spacing: 0.1em; text-transform: uppercase; margin: 18px 0 0;">
                Toronto · For informational use · Not legal advice
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
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
