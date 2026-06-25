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
function readKey(key) {
  if (!key || !FILES[key]) return null;
  if (cache.has(key)) return cache.get(key);
  let bytes = null;
  try { bytes = new Uint8Array(fs.readFileSync(path.join(DIR, FILES[key]))); } catch (e) { bytes = null; }
  cache.set(key, bytes);
  return bytes;
}

// brandFonts = profiles.brand_fonts jsonb: { heading:{family,weight,script?}, body:{family,weight} }
// → { headingBytes, bodyRegularBytes, bodyBoldBytes, headingIsScript } or null.
export function loadPairingFonts(brandFonts) {
  if (!brandFonts || typeof brandFonts !== 'object' || !brandFonts.heading || !brandFonts.body) return null;
  const h = brandFonts.heading, b = brandFonts.body;
  const headingBytes = readKey(`${h.family}:${h.weight || 400}`);
  const bodyRegularBytes = readKey(`${b.family}:${b.weight || 400}`);
  const bodyBoldBytes = readKey(`${b.family}:700`);
  if (!headingBytes && !bodyRegularBytes) return null;
  return { headingBytes, bodyRegularBytes, bodyBoldBytes, headingIsScript: !!h.script };
}
