// lib/profileExportPdf.js  SERVER ONLY. "Download my profile": one clean PDF of what the tenant's
// profile holds, for the tenant (pages/api/tenant/export.js): their photo and name, their own
// words, their offer to prepay rent, each typed fact with its date, each fact read from a
// document with its date, and the list of their stored documents with their dates. The files
// themselves are not in it. Nothing here scores or ranks anything, and profile strength is not
// printed: it is a page of facts.
//   buildProfilePdf({ name, email, about, prepayMonths, photo: { bytes, mime } | null, facts, checks, documents, generatedAt }) -> Uint8Array
//   profileLines(...)  the strings it prints, in order: what the tests read.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PROFILE_FACTS, longDate } from './profileFacts.js';
import { KIND_LABEL, checkText } from './tenantVaultRules.js';
import { prepayLine, PREPAY_LABEL } from './profilePersonal.js';

const INK = rgb(0.059, 0.059, 0.063); const SOFT = rgb(0.227, 0.227, 0.235); const MUTE = rgb(0.42, 0.42, 0.44); const RED = rgb(0.843, 0.125, 0.153); const RULE = rgb(0.890, 0.866, 0.816);
// Helvetica draws WinAnsi: the printable ASCII range and Latin 1. Curly quotes and dashes are
// made plain; anything else it cannot draw is left out.
const safe = (s) => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ').replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '');
function wrap(text, font, size, width) {
  const out = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) { const next = line ? `${line} ${w}` : w; if (!line || font.widthOfTextAtSize(next, size) <= width) line = next; else { out.push(line); line = w; } }
    out.push(line);
  }
  return out;
}

export function profileLines({ name, email, about, prepayMonths, facts = {}, factsUpdatedAt = null, checks = [], documents = [], generatedAt = null } = {}) {
  const typedOn = longDate(factsUpdatedAt);
  return {
    name: String(name || '').trim() || 'Your profile',
    email: email || null,
    prepared: `Downloaded ${longDate(generatedAt || new Date().toISOString())}`,
    about: about || null,
    prepay: prepayLine(prepayMonths) ? [PREPAY_LABEL, prepayLine(prepayMonths)] : null,
    facts: PROFILE_FACTS.filter((f) => facts && String(facts[f.key] ?? '').trim()).map((f) => [f.label, String(facts[f.key]).trim(), typedOn ? `Typed by you on ${typedOn}` : 'Typed by you']),
    checks: (checks || []).map((c) => { const t = checkText(c); return [t.label, t.value, longDate(c.readAt) ? `Read from a document on ${longDate(c.readAt)}` : 'Read from a document']; }),
    documents: (documents || []).map((d) => [KIND_LABEL[d.kind] || 'Document', `Added ${longDate(d.uploadedAt || d.readAt) || ''}`.trim(), d.expiresAt ? `Kept until ${longDate(d.expiresAt)}` : '']),
  };
}

export async function buildProfilePdf(input) {
  const L = profileLines(input);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const PW = 612; const PH = 792; const M = 56; const W = PW - 2 * M;
  let page = pdf.addPage([PW, PH]); let y = PH - M;
  const room = (h) => { if (y - h < M) { page = pdf.addPage([PW, PH]); y = PH - M; } };
  const text = (t, x, size, font, color = INK) => page.drawText(safe(t), { x, y, size, font, color });
  const para = (t, size, font, color, width = W, x = M, lead = 1.4) => { for (const ln of wrap(t, font, size, width)) { room(size * lead); y -= size * lead; text(ln, x, size, font, color); } };
  const heading = (t) => { room(40); y -= 26; text(String(t).toUpperCase(), M, 8.5, bold, RED); y -= 7; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: RULE }); };
  // The photo and the name at the top.
  let left = M;
  let photo = null;
  if (input && input.photo && input.photo.bytes) { try { photo = input.photo.mime === 'image/png' ? await pdf.embedPng(input.photo.bytes) : await pdf.embedJpg(input.photo.bytes); } catch (e) { photo = null; } }
  const top = y;
  if (photo) { const side = 84; const s = photo.scale(1); const k = Math.min(side / s.width, side / s.height); page.drawImage(photo, { x: M, y: top - s.height * k, width: s.width * k, height: s.height * k }); left = M + side + 18; }
  y = top - 4;
  for (const ln of wrap(L.name, bold, 22, PW - M - left)) { y -= 24; text(ln, left, 22, bold, INK); }
  if (L.email) { y -= 16; text(L.email, left, 10.5, regular, SOFT); }
  y -= 15; text(L.prepared, left, 9.5, regular, MUTE);
  if (photo) y = Math.min(y, top - 84);
  if (L.about) { heading('About me'); y -= 4; para(L.about, 11, regular, INK); }
  if (L.prepay) { heading(L.prepay[0]); y -= 4; para(L.prepay[1], 11, regular, INK); }
  const rows = (title, list, empty) => {
    heading(title);
    if (!list.length) { y -= 4; para(empty, 10.5, regular, MUTE); return; }
    for (const [label, value, source] of list) {
      room(46); y -= 16; text(String(label).toUpperCase(), M, 7.5, bold, MUTE);
      para(value, 11, regular, INK, W, M, 1.35);
      if (source) para(source, 9, regular, MUTE, W, M, 1.4);
    }
  };
  rows('Your details', L.facts, 'No details typed yet.');
  rows('Read from your documents', L.checks, 'No facts read from a document yet.');
  rows('Your documents', L.documents, 'No documents stored. The files themselves are never in this download.');
  room(30); y -= 26; para('Made by Rentletter from your own profile. The documents themselves are not included.', 8.5, regular, MUTE);
  return pdf.save();
}
