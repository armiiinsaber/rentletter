// lib/documentAuthority.js  PURE, isomorphic. Each document speaks only for the facts it is
// authoritative for, and the strongest source wins. A letter from the employer is the authority
// on employer, title, salary and start date; a pay stub on employer and period pay; a credit
// report on nothing the product scores, so its employer line is shown as historical and never
// compared. Every comparison to the application is computed here, in code, never by the model.
//
//   AUTHORITY                         document kind × fact -> level (3 strongest, 0 never compared)
//   resolveFact(fact, documents)      the value from the strongest source, plus "also seen"
//   resolveNameMatch(name, documents) 'match' | 'mismatch' | 'unclear', authority aware
//   authorityComparisons(documents, stated, { now }) -> the Employer, Job title and Income rows
//   crossReference(documents)         consistency across the documents that may speak to a fact
import { annualizeFromStubs, parseDate, MATCH_PCT, CLOSE_PCT } from './incomeAnnualize.js';

export const AUTHORITY = Object.freeze({
  'employment letter': Object.freeze({ employer: 3, title: 3, 'annual salary': 3, 'start date': 3, name: 2 }),
  'pay stub': Object.freeze({ employer: 3, 'period gross': 3, name: 2 }),
  'tax slip': Object.freeze({ 'annual income': 2, employer: 1, name: 2 }), // T4 or notice of assessment
  'bank statement': Object.freeze({ deposits: 1, name: 2 }),
  'government ID': Object.freeze({ name: 3 }),
  'credit report': Object.freeze({ name: 2, employer: 0, income: 0 }), // employer and income: never compared
  other: Object.freeze({}),
});
// The extracted field each fact reads.
const FACT_FIELD = Object.freeze({
  employer: 'employer', title: 'jobTitle', 'annual salary': 'annualSalaryPrinted', 'start date': 'startDate', name: 'applicantName',
  'period gross': 'grossForPeriod', 'annual income': 'annualSalaryPrinted', deposits: 'deposits', income: 'annualSalaryPrinted',
});
const KIND_RANK = Object.freeze({ 'employment letter': 0, 'pay stub': 1, 'tax slip': 2, 'government ID': 3, 'bank statement': 4, 'credit report': 5 });
const KIND_LABEL = Object.freeze({ 'employment letter': 'employment letter', 'pay stub': 'pay stub', 'tax slip': 'T4 or notice of assessment', 'bank statement': 'bank statement', 'government ID': 'government ID', 'credit report': 'credit report', other: 'document' });

// The kind of a document from the model's type label. Unrecognized documents are 'other'.
export function kindOf(doc) {
  if (!doc || doc.unrecognized === true) return 'other';
  const t = String(doc.documentType || '').toLowerCase();
  const ex = doc.extracted || {};
  if (/credit\s*report/.test(t) || ex.creditScore != null || ex.scoreBand != null) return 'credit report';
  if (/employment letter|offer letter|letter of employment|employment confirmation/.test(t)) return 'employment letter';
  if (/pay\s*stub|pay\s*statement|earnings|payslip/.test(t)) return 'pay stub';
  if (/\bt4\b|notice of assessment|\bnoa\b|tax (document|slip|return)/.test(t)) return 'tax slip';
  if (/bank statement/.test(t)) return 'bank statement';
  if (/government id|passport|driver|licen[cs]e|photo id|\bid\b/.test(t)) return 'government ID';
  return 'other';
}
export const levelOf = (doc, fact) => (AUTHORITY[kindOf(doc)] || {})[fact] ?? 0;

// ── Value normalization ────────────────────────────────────────────────────────────────────────
const ORG_NOISE = new Set(['inc', 'incorporated', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'llc', 'llp', 'plc', 'the', 'and', 'of', 'group', 'ulc', 'ltee', 'cie']);
export const orgTokens = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !ORG_NOISE.has(t));
const NAME_NOISE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'jr', 'sr', 'ii', 'iii', 'iv']);
export function nameTokens(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s'\-.]/g, ' ').replace(/[.'\-]/g, ' ').split(/\s+/).filter(Boolean).filter((t) => !NAME_NOISE.has(t));
}
function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true; // an initial against the full name
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}
// One document name against the applicant's: true (same person), false (a different person),
// null (not enough to tell, a single name part). Tolerant of case, accents, order, middle names.
export function nameOnDocMatches(applicantName, docName) {
  const A = nameTokens(applicantName), B = nameTokens(docName);
  if (!A.length || !B.length) return null;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const used = new Set(); let matched = 0;
  for (const t of short) { for (let i = 0; i < long.length; i++) { if (used.has(i)) continue; if (tokenMatch(t, long[i])) { matched++; used.add(i); break; } } }
  if (short.length === 1) return matched >= 1 ? null : false;
  return matched >= 2; // a real match needs two aligned parts, first and last, order free
}
const numOf = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
// Two values of one fact are the same when they normalize alike.
function sameValue(fact, a, b) {
  if (fact === 'name') return nameTokens(a).join(' ') === nameTokens(b).join(' ');
  if (fact === 'employer' || fact === 'title') return orgTokens(a).join(' ') === orgTokens(b).join(' ');
  const na = numOf(a), nb = numOf(b);
  if (na != null && nb != null) return na === nb;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
const present = (v) => v != null && String(v).trim() !== '';

// The strongest source of a fact. Every lower source that disagrees is "also seen", never a
// mismatch; a level 0 source (a credit report's employer line) is historical. No authoritative
// source at all (level 0 everywhere): "not on documents".
export function resolveFact(fact, documents) {
  const field = FACT_FIELD[fact];
  const seen = (Array.isArray(documents) ? documents : [])
    .map((d) => ({ value: d && d.extracted ? d.extracted[field] : null, kind: kindOf(d), filename: d && d.filename ? d.filename : null, level: levelOf(d, fact) }))
    .filter((e) => present(e.value) && e.kind !== 'other');
  // Equal levels: the employer's own letter outranks a stub, a stub outranks a tax slip.
  const ranked = [...seen].sort((a, b) => (b.level - a.level) || ((KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)));
  const winner = ranked.find((e) => e.level >= 1) || null;
  if (!winner) return { fact, value: null, source: null, status: 'not on documents', alsoSeen: [] };
  const alsoSeen = ranked.filter((e) => e !== winner && !sameValue(fact, e.value, winner.value)).map((e) => ({
    value: e.value, kind: e.kind, filename: e.filename, level: e.level, historical: e.level === 0,
    line: e.level === 0 ? `${KIND_LABEL[e.kind]} lists ${e.value} (historical)` : `${KIND_LABEL[e.kind]} shows ${e.value}`,
  }));
  return { fact, value: winner.value, source: { kind: winner.kind, filename: winner.filename, level: winner.level }, status: 'resolved', alsoSeen };
}

// Name: any document at level 2 or 3; the strongest that matches wins, and a lower level mismatch
// never overrides a level 3 match (a bank statement in another name cannot undo matching ID).
// A mismatch at the same level as the best match still reads mismatch.
export function resolveNameMatch(applicantName, documents) {
  if (!String(applicantName || '').trim()) return 'unclear';
  let bestMatch = null, bestMiss = null;
  for (const d of (Array.isArray(documents) ? documents : [])) {
    const level = levelOf(d, 'name');
    if (level < 2) continue;
    const printed = d && d.extracted ? d.extracted.applicantName : null;
    if (!present(printed)) continue;
    const r = nameOnDocMatches(applicantName, printed);
    if (r === true) bestMatch = Math.max(bestMatch ?? 0, level);
    else if (r === false) bestMiss = Math.max(bestMiss ?? 0, level);
  }
  if (bestMatch != null && (bestMiss == null || bestMatch > bestMiss)) return 'match';
  if (bestMiss != null) return 'mismatch';
  return 'unclear';
}

// ── Comparisons to the application ─────────────────────────────────────────────────────────────
// Employer: the same after normalization is a match; a shared significant word is close; else a
// mismatch. Nothing resolved is not_found.
export function textStatus(stated, found) {
  if (!present(found)) return 'not_found';
  if (!present(stated)) return 'not_found';
  const a = orgTokens(stated), b = orgTokens(found);
  if (!a.length || !b.length) return 'not_found';
  if (a.join(' ') === b.join(' ')) return 'match';
  const setB = new Set(b);
  if (a.some((t) => t.length >= 3 && setB.has(t))) return 'close';
  return 'mismatch';
}
const money0 = (n) => `$${Math.round(Number(n)).toLocaleString('en-CA')}`;
const monthYear = (d) => d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const TENURE_TOLERANCE_YEARS = 1;

// Income: the annualized stubs and the letter's printed salary are both authority 3. Both present
// and within 5%: "letter and pay stubs agree". They disagree: the letter is the figure and both
// are shown. One of them: that one. Neither: a T4 or notice of assessment (level 2). The status
// against the stated figure: within 5% match, within 15% close, else mismatch, and never mismatch
// on a single partial period.
export function incomeComparison(documents, statedAnnual) {
  const docs = Array.isArray(documents) ? documents : [];
  const stated = numOf(statedAnnual);
  const stubRows = docs.filter((d) => levelOf(d, 'period gross') === 3).map((d) => d.extracted || {});
  const stubs = annualizeFromStubs(stubRows, stated);
  const letterFact = resolveFact('annual salary', docs);
  const letter = letterFact.source && letterFact.source.level === 3 ? numOf(letterFact.value) : null;
  let annual = null, basis = null, explanation = stubs.explanation, confidence = 'low';
  if (letter != null && letter > 0 && stubs.annual != null) {
    const agree = Math.abs(stubs.annual - letter) / letter * 100 <= MATCH_PCT;
    annual = Math.round(letter);
    basis = agree ? 'letter and pay stubs agree' : 'employment letter';
    confidence = agree ? 'high' : 'medium';
    explanation = agree
      ? `${money0(letter)} a year on the letter, pay stubs annualize to ${money0(stubs.annual)} (letter and pay stubs agree)`
      : `${money0(letter)} a year on the letter; pay stubs annualize to ${money0(stubs.annual)} (${stubs.explanation})`;
  } else if (letter != null && letter > 0) {
    annual = Math.round(letter); basis = 'employment letter'; confidence = 'medium';
    explanation = `${money0(letter)} a year as printed on the employment letter`;
  } else if (stubs.annual != null) {
    annual = stubs.annual; basis = stubs.basis; confidence = stubs.confidence; explanation = stubs.explanation;
  } else {
    const slip = resolveFact('annual income', docs);
    const t4 = slip.source ? numOf(slip.value) : null;
    if (t4 != null && t4 > 0) { annual = Math.round(t4); basis = 'tax slip'; confidence = 'medium'; explanation = `${money0(t4)} employment income on the T4 or notice of assessment`; }
    else if (!stubRows.length) explanation = 'no pay stub or employment letter on file';
  }
  const base = {
    field: 'Income', stated: stated != null ? money0(stated) : null, found: annual != null ? explanation : null, annual, basis, explanation, confidence,
    stubs: stubs.annual != null ? { annual: stubs.annual, explanation: stubs.explanation, basis: stubs.basis } : null,
    letter: letter != null && letter > 0 ? { annual: Math.round(letter) } : null,
  };
  if (annual == null || stated == null || stated <= 0) return { ...base, status: 'not_found' };
  const diffPct = Math.abs(annual - stated) / stated * 100;
  let status = diffPct <= MATCH_PCT ? 'match' : diffPct <= CLOSE_PCT ? 'close' : 'mismatch';
  if (status === 'mismatch' && basis === 'single partial period') status = 'close';
  return { ...base, status };
}

// The Employer row: the resolved employer against the stated one; lower sources that differ ride
// along as alsoSeen lines; the letter's start date reads "since Mar 2026" when it sits within a
// year of the stated years at job, else "letter says since Mar 2026". Neither moves Fit.
export function employerComparison(documents, stated, { now = new Date() } = {}) {
  const docs = Array.isArray(documents) ? documents : [];
  const r = resolveFact('employer', docs);
  const row = { field: 'Employer', stated: present(stated.statedEmployer) ? String(stated.statedEmployer) : null, found: r.value, status: textStatus(stated.statedEmployer, r.value), source: r.source ? r.source.kind : null, alsoSeen: r.alsoSeen.map((e) => e.line) };
  const start = resolveFact('start date', docs);
  const startDate = start.source ? parseDate(start.value) : null;
  if (startDate) {
    const yearsOnLetter = (new Date(now).getTime() - startDate.getTime()) / (365.25 * 86400000);
    const statedYears = numOf(stated.statedEmploymentTenureYears);
    const gap = statedYears != null && Math.abs(yearsOnLetter - statedYears) > TENURE_TOLERANCE_YEARS;
    row.since = gap ? `letter says since ${monthYear(startDate)}` : `since ${monthYear(startDate)}`;
    row.sinceGap = !!gap;
    row.startDate = start.value;
  }
  return row;
}

// Job title: the letter only, informational (Fit never reads it).
export function titleComparison(documents, stated) {
  const r = resolveFact('title', documents);
  return { field: 'Job title', stated: present(stated.statedJobTitle) ? String(stated.statedJobTitle) : null, found: r.value, status: textStatus(stated.statedJobTitle, r.value), source: r.source ? r.source.kind : null, informational: true };
}

// stated: the screenableFacts shape (statedEmployer, statedJobTitle, statedAnnualIncome,
// statedEmploymentTenureYears), or a bare annual income number from an older caller.
export function authorityComparisons(documents, stated, opts = {}) {
  const s = stated && typeof stated === 'object' ? stated : { statedAnnualIncome: stated ?? null };
  return [employerComparison(documents, s, opts), titleComparison(documents, s), incomeComparison(documents, s.statedAnnualIncome)];
}

// Consistency across the documents that may speak to a fact: names across level 2 and 3 sources,
// employers across level 1 and up (a credit report's employer line never enters). Both values are
// shown on a discrepancy, factually, never as an accusation.
export function crossReference(documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const out = [];
  const names = docs.filter((d) => levelOf(d, 'name') >= 2).map((d) => d.extracted && d.extracted.applicantName).filter(present);
  if (names.length >= 2) {
    const same = names.every((n) => sameValue('name', n, names[0]));
    out.push({ field: 'Applicant name', status: same ? 'consistent' : 'discrepancy', detail: same ? `Name matches across ${names.length} documents.` : `Names differ across documents: ${[...new Set(names)].join(' vs ')}.` });
  }
  const employers = docs.filter((d) => levelOf(d, 'employer') >= 1).map((d) => d.extracted && d.extracted.employer).filter(present);
  if (employers.length >= 2) {
    const same = employers.every((e) => sameValue('employer', e, employers[0]));
    out.push({ field: 'Employer', status: same ? 'consistent' : 'discrepancy', detail: same ? `Employer matches across documents (${employers[0]}).` : `Employer differs across documents: ${[...new Set(employers)].join(' vs ')}.` });
  }
  return out;
}
