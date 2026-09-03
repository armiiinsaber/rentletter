// lib/applicantSynthesis.js
// ONE LINE under an applicant's name: why they score the way they do, in under twelve words.
// Deterministic, same conventions as lib/noticed.js: pure rules over data the dashboard has
// already loaded, zero AI calls, zero network. ISOMORPHIC (no fs/env, no React).
//
// It DESCRIBES and never advises: no adjectives of judgement, no recommendation, no conclusion
// the facts do not support. Missing data reads as missing ("Income not stated"), never as fine.
//
// SCREENABLE FACTS ONLY. The line is built from exactly these inputs and nothing else:
//   application.annual_income          stated income
//   application.rent_to_income_ratio   rent as a percent of monthly income (the scorecard's ratio)
//   application.prev_landlord_name     a landlord reference is on file (presence only)
//   application.references             count of references listed
//   application.years_at_job           tenure, used only when nothing else can be said
//   docVerifications (active report)   whether documents verified the income or the employer
// Never read here, by design: occupants, co applicants, pets, smoking, move in reason, free text,
// name, address, or anything that touches or stands in for a protected ground (OHRC / BC Code).
import { activeReport } from './docVerifications.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Verification as the landlord report reads it (lib/listingReportData.landlordVerification):
// at least one analyzed document, the name on it belongs to this applicant, and only a 'match'
// comparison counts. Repeated here so this module stays pure (no server imports).
export function verificationFacts(docVerifications) {
  const r = activeReport(docVerifications);
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true) : [];
  if (!r || docs.length === 0) return { documents: false, incomeVerified: false, employmentVerified: false, nameMismatch: false, incomeMismatch: false, employerMismatch: false };
  if (r.nameMatch === 'mismatch' || r.nameMatch === 'unclear') return { documents: true, incomeVerified: false, employmentVerified: false, nameMismatch: true, incomeMismatch: false, employerMismatch: false };
  const comparisons = Array.isArray(r.comparisons) ? r.comparisons : [];
  const match = (re) => comparisons.some((c) => re.test(String(c.field || '')) && c.status === 'match');
  // A figure was found and differs (mismatch or close): the documents contradict the application.
  const differs = (re) => !match(re) && comparisons.some((c) => re.test(String(c.field || '')) && (c.status === 'mismatch' || c.status === 'close'));
  return { documents: true, incomeVerified: match(/income/i), employmentVerified: match(/employer/i), nameMismatch: false, incomeMismatch: differs(/income/i), employerMismatch: differs(/employer/i) };
}

// The facts the line is built from. Exposed for tests and for anything that wants the same read.
export function synthesisFacts(applicant) {
  const app = (applicant && applicant.application) || {};
  const income = num(app.annual_income);
  const ratioPct = num(app.rent_to_income_ratio);
  const multiple = ratioPct && ratioPct > 0 ? Math.round((100 / ratioPct) * 10) / 10 : null; // monthly income as a multiple of rent
  const references = Array.isArray(app.references) ? app.references.length : 0;
  const years = num(app.years_at_job);
  return {
    income: income && income > 0 ? income : null,
    ratioPct: ratioPct && ratioPct > 0 ? ratioPct : null,
    multiple,
    landlordReference: !!(app.prev_landlord_name && String(app.prev_landlord_name).trim()),
    references,
    yearsAtJob: years && years > 0 ? years : null,
    ...verificationFacts(applicant && applicant.docVerifications),
    // The realtor called the employer (confirmations.employer, db/screening.sql): that is verification.
    employerConfirmed: !!(applicant && applicant.confirmations && applicant.confirmations.employer),
  };
}

const fmtMultiple = (m) => (Number.isInteger(m) ? `${m}x` : `${m.toFixed(1)}x`);

// Income clause: what is known about the money, and whether documents back it. "Verified" is said
// only once the realtor confirmed the employer; documents that match are "documented"; documents
// that contradict the application say what differs (the card label reads check docs).
function incomeClause(f) {
  if (f.employerConfirmed) return f.multiple ? `Verified income at ${fmtMultiple(f.multiple)} rent` : 'Verified income';
  const statedAt = f.multiple ? `stated income at ${fmtMultiple(f.multiple)} rent` : 'stated income';
  if (f.nameMismatch) return `Name on documents differs, ${statedAt}`;
  if (f.incomeMismatch) return `Documents differ on ${statedAt}`;
  if (f.employerMismatch) return `Documents differ on employer, ${statedAt}`;
  if (f.incomeVerified) return f.multiple ? `Documented income at ${fmtMultiple(f.multiple)} rent` : 'Documented income';
  if (!f.income) return f.documents ? 'Income not stated, documents on file' : 'Income not stated';
  const base = f.multiple ? `Stated income at ${fmtMultiple(f.multiple)} rent` : 'Stated income';
  if (f.documents) return `${base}, unconfirmed by documents`;
  return `${base}, unverified`;
}

// Reference clause: presence only. Nothing here knows what a reference said.
function referenceClause(f) {
  if (f.landlordReference) return 'landlord reference on file';
  if (f.references > 0) return 'no landlord reference'; // other references are listed; the count is in the card
  return 'no reference yet';
}

// The line. Two clauses, joined by a comma, at most twelve words by construction.
export function synthesisLine(applicant) {
  const f = synthesisFacts(applicant);
  return `${incomeClause(f)}, ${referenceClause(f)}`;
}

export const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
