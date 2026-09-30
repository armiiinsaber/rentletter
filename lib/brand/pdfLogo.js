// lib/brand/pdfLogo.js  The logo in a PDF, as vector (pdf-lib drawSvgPath): the same paths as the
// web Wordmark (lib/brand/logoPaths.js), so it prints sharp at any zoom and needs no font.
//   drawPdfLogo(page, { x, y, height, ink, red })
// x, y: the logo's bottom left corner in PDF points; height: its height in points.
import { LOGO } from './logoPaths.js';

export const pdfLogoWidth = (height) => (LOGO.w * height) / LOGO.h;

export function drawPdfLogo(page, { x, y, height, ink, red }) {
  const scale = height / LOGO.h;
  // drawSvgPath reads SVG coordinates (y down) from a top left origin.
  const top = y + height;
  page.drawSvgPath(LOGO.barPath, { x, y: top, scale, color: red, borderWidth: 0 });
  page.drawSvgPath(LOGO.text, { x, y: top, scale, color: ink, borderWidth: 0 });
  return pdfLogoWidth(height);
}
