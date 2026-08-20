// lib/pdfFonts.js
// SERVER-ONLY. Reads the bundled TTF files (assets/fonts) for the realtor's chosen
// font pairing so the landlord-report routes can embed them into the PDF. Maps a
// "Family:weight" key to a committed TTF. Uses fs — never import this in client/demo
// code (the demo runs buildLandlordReportPdf in the browser and just falls back to
// Helvetica). Returns Uint8Array bytes, memoized.
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'assets', 'fonts');

// Every Family:weight we ship a TTF for (heading + body needs across all pairings).
const FILES = {
  'Inter:400': 'Inter-400.ttf',
  'Inter:700': 'Inter-700.ttf',
  'Inter:800': 'Inter-800.ttf',
  'Work Sans:400': 'WorkSans-400.ttf',
  'Work Sans:700': 'WorkSans-700.ttf',
  'Playfair Display:700': 'PlayfairDisplay-700.ttf',
  'Poppins:700': 'Poppins-700.ttf',
  'Roboto Slab:700': 'RobotoSlab-700.ttf',
  'Oswald:600': 'Oswald-600.ttf',
  'EB Garamond:600': 'EBGaramond-600.ttf',
  'Archivo Black:400': 'ArchivoBlack-400.ttf',
  'Dancing Script:700': 'DancingScript-700.ttf',
  'Great Vibes:400': 'GreatVibes-400.ttf',
};

const cache = new Map();
// Read one face. NEVER throws: a missing/unreadable file yields null (→ Helvetica for that
// role) and ONE structured log line naming the file, the resolved path and the cwd — which is
// exactly what you need to tell "not in the serverless bundle" from "wrong path".
function readKey(key) {
  if (!key) return null;
  if (!FILES[key]) {
    console.error('[pdfFonts] no bundled TTF for', JSON.stringify({ key, known: Object.keys(FILES) }));
    return null;
  }
  if (cache.has(key)) return cache.get(key);
  let bytes = null;
  const file = path.join(DIR, FILES[key]);
  try {
    const raw = fs.readFileSync(file);
    // Pad the buffer with a few zero bytes. fontkit reads a glyph header even for an EMPTY
    // glyph, and when that empty glyph is the last entry of a trailing glyf table (e.g.
    // DancingScript-700 glyph #611) the read runs past the end of the buffer and throws
    // "Trying to access beyond buffer length" — not at embedFont(), but later inside
    // pdfDoc.save(), which killed the whole report. Trailing bytes after the table
    // directory are ignored by every TrueType parser, so this is harmless.
    bytes = new Uint8Array(raw.length + 16);
    bytes.set(raw);
  } catch (e) {
    bytes = null;
    let dirListing = null;
    try { dirListing = fs.existsSync(DIR) ? fs.readdirSync(DIR).length : 'dir-missing'; } catch (e2) { dirListing = 'unreadable'; }
    console.error('[pdfFonts] font file unreadable — falling back to Helvetica for this role', JSON.stringify({
      key, file, cwd: process.cwd(), fontsDir: DIR, fontsDirEntries: dirListing, errorCode: e?.code || null, message: String(e?.message || e).slice(0, 200),
    }));
  }
  cache.set(key, bytes);
  return bytes;
}

// brandFonts = profiles.brand_fonts jsonb: { heading:{family,weight,script?}, body:{family,weight} }
// → { headingBytes, bodyRegularBytes, bodyBoldBytes, headingIsScript } or null.
// Never throws. Any shape problem or read failure degrades to null/partial (→ Helvetica).
export function loadPairingFonts(brandFonts) {
  try {
    if (!brandFonts || typeof brandFonts !== 'object' || !brandFonts.heading || !brandFonts.body) return null;
    const h = brandFonts.heading, b = brandFonts.body;
    const headingBytes = readKey(`${h.family}:${h.weight || 400}`);
    const bodyRegularBytes = readKey(`${b.family}:${b.weight || 400}`);
    const bodyBoldBytes = readKey(`${b.family}:700`);
    if (!headingBytes && !bodyRegularBytes) return null;
    return { headingBytes, bodyRegularBytes, bodyBoldBytes, headingIsScript: !!h.script };
  } catch (e) {
    console.error('[pdfFonts] loadPairingFonts failed — using Helvetica', JSON.stringify({ pairing: brandFonts?.id || null, message: String(e?.message || e).slice(0, 200) }));
    return null;
  }
}
