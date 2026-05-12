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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background: #faf8f3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #faf8f3;">
    <tr>
      <td align="center" style="padding: 56px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; background: #faf8f3;">

          <!-- Header — wordmark with red bar -->
          <tr>
            <td style="padding-bottom: 28px; border-bottom: 1px solid #e3ddd0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 8px;">
                    <div style="width: 4px; height: 24px; background: #d72027;"></div>
                  </td>
                  <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; color: #0f0f10; letter-spacing: -0.02em;">
                    Rentletter
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Big headline -->
          <tr>
            <td style="padding: 56px 0 24px;">
              <h1 style="font-family: 'Inter', sans-serif; font-weight: 800; font-size: 52px; line-height: 0.95; letter-spacing: -0.03em; color: #0f0f10; margin: 0;">
                Your letter<br>is <span style="color: #d72027;">ready,</span><br>${firstName}.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.6; color: #3a3a3c; margin: 0 0 16px;">
                Your cover letter and tenant resume are attached — both as PDF and Word.
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.6; color: #3a3a3c; margin: 0;">
                Send them with your standard rental application. In Ontario, that's <span style="color: #0f0f10; font-weight: 600;">Form 410</span>.
              </p>
            </td>
          </tr>

          <!-- Document manifest -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f10;">
                <tr>
                  <td style="padding: 28px 28px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">
                          Attached
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 700; color: #faf8f3; letter-spacing: -0.01em;">
                          Cover letter
                        </td>
                        <td align="right" style="font-family: 'Inter', sans-serif; font-size: 13px; color: #86868b;">
                          PDF · DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px;">
                    <div style="height: 1px; background: #3a3a3c;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 28px 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 700; color: #faf8f3; letter-spacing: -0.01em;">
                          Tenant resume
                        </td>
                        <td align="right" style="font-family: 'Inter', sans-serif; font-size: 13px; color: #86868b;">
                          PDF · DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tip block with red accent -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="width: 3px; background: #d72027;"></td>
                  <td style="padding-left: 20px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px;">
                      Quick tip
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.6; color: #3a3a3c; margin: 0;">
                      Attach the PDF when applying online. Print both for in-person viewings. The Word file is there if you want to edit before sending.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-top: 32px; border-top: 1px solid #e3ddd0;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: #0f0f10; margin: 0 0 4px;">
                Good luck out there<span style="color: #d72027;">.</span>
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: #86868b; margin: 6px 0 24px;">
                — The Rentletter desk
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 6px;">
                          <div style="width: 3px; height: 14px; background: #d72027;"></div>
                        </td>
                        <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 800; color: #0f0f10; letter-spacing: -0.01em;">
                          Rentletter
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="font-family: 'Inter', sans-serif; font-size: 12px; color: #86868b;">
                    Toronto · Not legal advice
                  </td>
                </tr>
              </table>
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
