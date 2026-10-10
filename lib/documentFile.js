// lib/documentFile.js  SERVER ONLY. Two facts about an uploaded file, read from its bytes while the
// upload request still holds them (pages/api/upload/analyze-file.js, lib/realtorUpload.js):
//   contentHash(bytes)            sha256 hex of the bytes, stored on the realtor's own
//                                 applicant_documents row (db/011) and cleared when the file goes
//   fileHistory(bytes, mime)      { editedAfterCreation }: a PDF whose metadata shows it was saved
//                                 by a general purpose PDF editor after it was created. A weak
//                                 signal that never raises a finding alone (lib/documentIntegrity.js f).
//   fileFacts(bytes, mime)        both, never throwing
// Nothing else from the file is kept: no metadata value, no producer name.
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

// General purpose editors, as they write themselves into Producer or Creator. Payroll systems,
// word processors that export once, and print drivers are not on this list.
export const GENERAL_EDITORS = Object.freeze([/acrobat(?!\s*distiller)/i, /\bpdf\s*expert\b/i, /\bpdfelement\b/i, /\bfoxit\b/i, /\bnitro\b/i, /pdf-?xchange/i, /\bsejda\b/i, /\bilovepdf\b/i, /\bsmallpdf\b/i, /\bpdfescape\b/i, /\bpdffiller\b/i, /\bsoda\s*pdf\b/i, /\bpdf24\b/i, /\bpreview\b/i, /quartz\s*pdfcontext/i, /\bdocfly\b/i, /\bpdfsam\b/i, /\bkami\b/i]);
// A save at least this long after creation counts as a later edit (an export writes both at once).
export const EDIT_AFTER_MS = 5 * 60 * 1000;

export const contentHash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function fileHistory(bytes, mime) {
  if (String(mime || '').toLowerCase() !== 'application/pdf' || !bytes || !bytes.length) return { editedAfterCreation: false };
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const created = pdf.getCreationDate(), modified = pdf.getModificationDate();
    const tools = [pdf.getProducer(), pdf.getCreator()].filter(Boolean).map(String);
    const editor = tools.some((t) => GENERAL_EDITORS.some((re) => re.test(t)));
    const later = created instanceof Date && modified instanceof Date && modified.getTime() - created.getTime() >= EDIT_AFTER_MS;
    return { editedAfterCreation: !!(editor && later) };
  } catch (e) {
    return { editedAfterCreation: false };
  }
}

export async function fileFacts(bytes, mime) {
  try {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
    if (!buf.length) return { hash: null, editedAfterCreation: false };
    return { hash: contentHash(buf), ...(await fileHistory(buf, mime)) };
  } catch (e) {
    return { hash: null, editedAfterCreation: false };
  }
}
