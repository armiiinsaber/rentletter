// lib/documentIntegrity.js  PURE, isomorphic. Whether a set of documents is consistent with
// itself, read from the fields the document read already extracts (lib/applicantAnalysis.js).
// Every finding is a check docs item: one sentence of fact the realtor can check against the
// document, with the document it came from. A finding never changes Fit (lib/fitScore.js never
// reads it) and is raised only on clear evidence: a field that is missing or a date that cannot be
// read without guessing never raises anything.
//
//   integrityFindings(items, { applicantName, statedEmployer, uploadedAt }) -> finding[]
//     items: the staged per file entries { document, documentId, fileEdited }
//     finding: { type, documentId, sentence, at }   (nothing else is stored, lib/uploadCombine.js)
//   isNote(finding)          a note is shown, never a check docs flag (an older employment letter)
//   stripIntegrityFields(d)  the document without the fields only these checks read
//   docDate, money           the strict readers the checks use
//
// The checks, and the tolerance each one states:
//   a. pay stub arithmetic: gross less deductions equals net within $1 (all three printed);
//      year to date gross at least the period's gross; a later stub's year to date at least the
//      earlier one's plus the later gross (same year); and at most three times the periods so far
//      at this gross (bonuses, overtime, vacation pay and raises sit well inside three times).
//   b. pay dates: regular stubs (a printed period that fits the pay frequency) sit a whole number
//      of pay periods apart, within 2 days weekly, 3 biweekly, 4 semi monthly, 5 monthly; no pay
//      date more than 3 days after the upload; the most recent stub within 60 days of the upload.
//   c. same person: the name on each document that speaks to the name against the applicant,
//      allowing initials, middle names, accents, hyphens, apostrophes and name order.
//   d. same employer: pay stubs and the employment letter against the letter, else the
//      application, allowing legal suffixes, accents and abbreviations (CIBC, TD Bank).
//   e. dates: no document dated more than 3 days after the upload; an employment letter older than
//      90 days is noted, never flagged.
//   f. file history: a PDF saved in a general purpose editor after it was created never raises a
//      finding on its own; it adds one line to a finding from a to d on the same document.
//   g. the same file twice: found by content hash, per realtor, at finalize
//      (lib/documentIntegrityStore.js), never across realtors.
import { kindOf, levelOf, nameOnDocMatches, nameTokens } from './documentAuthority.js';
import { EMPLOYER_NOISE } from './employerName.js';

export const INTEGRITY = Object.freeze({
  PAY_ARITHMETIC: 'pay_arithmetic',
  PAY_YTD: 'pay_ytd',
  PAY_SCHEDULE: 'pay_schedule',
  PAY_FUTURE: 'pay_future',
  PAY_STALE: 'pay_stale',
  NAME: 'name',
  EMPLOYER: 'employer',
  FUTURE_DATE: 'future_date',
  LETTER_AGE: 'letter_age',
  SAME_FILE: 'same_file',
});
export const INTEGRITY_TYPES = Object.freeze(Object.values(INTEGRITY));
const NOTES = new Set([INTEGRITY.LETTER_AGE]);
export const isNote = (f) => !!f && NOTES.has(f.type);
// The checks a to d: the ones a file history line may join.
const JOINABLE = new Set([INTEGRITY.PAY_ARITHMETIC, INTEGRITY.PAY_YTD, INTEGRITY.PAY_SCHEDULE, INTEGRITY.PAY_FUTURE, INTEGRITY.PAY_STALE, INTEGRITY.NAME, INTEGRITY.EMPLOYER]);
export const TOLERANCE = Object.freeze({ netDollars: 1, ytdTimesPeriods: 3, futureDays: 3, staleDays: 60, letterDays: 90, scheduleDays: { weekly: 2, biweekly: 3, semimonthly: 4, monthly: 5 } });
export const FILE_HISTORY_LINE = 'The file was last saved in a general purpose PDF editor after it was created.';
// Read only by these checks, kept in the staging store for the length of an upload, never persisted.
export const INTEGRITY_ONLY_FIELDS = Object.freeze(['deductionsForPeriod', 'netForPeriod', 'ytdGross']);

export function stripIntegrityFields(doc) {
  if (!doc || !doc.extracted) return doc;
  const extracted = { ...doc.extracted };
  for (const k of INTEGRITY_ONLY_FIELDS) delete extracted[k];
  return { ...doc, extracted };
}

// ── Strict readers ─────────────────────────────────────────────────────────────────────────────
// A printed amount: 3541.67, "3,541.67", "$3 541,67", "3 541,67 $" (French), "(12.00)". null when
// it cannot be read.
export function money(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s  ]/g, '').replace(/CAD|\$/gi, '');
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()\-+]/g, '');
  if (!s) return null;
  const m = s.match(/^(.*?)([.,])(\d{1,2})$/);
  const intPart = (m ? m[1] : s).replace(/[.,']/g, '');
  const dec = m ? m[3] : '';
  if (!/^\d*$/.test(intPart) || (!intPart && !dec)) return null;
  const n = Number(`${intPart || '0'}.${dec || '0'}`);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const MONTHS = { jan: 0, january: 0, janvier: 0, janv: 0, feb: 1, february: 1, fevrier: 1, fevr: 1, fev: 1, mar: 2, march: 2, mars: 2, apr: 3, april: 3, avril: 3, avr: 3, may: 4, mai: 4, jun: 5, june: 5, juin: 5, jul: 6, july: 6, juillet: 6, juil: 6, aug: 7, august: 7, aout: 7, sep: 8, sept: 8, september: 8, septembre: 8, oct: 9, october: 9, octobre: 9, nov: 10, november: 10, novembre: 10, dec: 11, december: 11, decembre: 11 };
const utc = (y, mo, d) => { const t = new Date(Date.UTC(y, mo, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === mo && t.getUTCDate() === d ? t : null; };
// A printed date, read only when it cannot mean two days: ISO, a month in words (English or
// French), or digits where one part is over 12. 05/06/2026 is null, never a guess.
export function docDate(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d)(st|nd|rd|th|er)\b/g, '$1').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/ ](\d{1,2})[-/ ](\d{1,2})\b/);
  if (m) return utc(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { const a = +m[1], b = +m[2], y = +m[3]; if (a > 12 && b <= 12) return utc(y, b - 1, a); if (b > 12 && a <= 12) return utc(y, a - 1, b); return null; }
  const parts = s.split(' ');
  const mi = parts.findIndex((p) => MONTHS[p] != null);
  if (mi < 0) return null;
  const nums = parts.filter((p, i) => i !== mi && /^\d+$/.test(p)).map(Number);
  const year = nums.find((n) => n >= 1900 && n <= 2100); const day = nums.find((n) => n >= 1 && n <= 31);
  return year != null && day != null ? utc(year, MONTHS[parts[mi]], day) : null;
}

const DAY = 86400000;
const days = (a, b) => Math.round((b - a) / DAY);
const lastDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
const dayOfYear = (d) => days(Date.UTC(d.getUTCFullYear(), 0, 1), d.getTime()) + 1;
const fmtDay = (d) => d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const fmtFull = (d) => d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtMoney = (n) => { const a = Math.abs(n); return a >= 10 ? `$${Math.round(a).toLocaleString('en-CA')}` : `$${a.toFixed(2)}`; };
const PERIOD_DAYS = Object.freeze({ weekly: 7, biweekly: 14, semimonthly: 365.25 / 24, monthly: 365.25 / 12 });
const LABEL = Object.freeze({ weekly: 'weekly', biweekly: 'biweekly', semimonthly: 'semi monthly', monthly: 'monthly' });
const KIND_LABEL = Object.freeze({ 'employment letter': 'employment letter', 'pay stub': 'pay stub', 'tax slip': 'T4 or notice of assessment', 'bank statement': 'bank statement', 'government ID': 'ID', 'credit report': 'credit report', other: 'document' });

// The frequency a printed period shows (start and end both read), or null.
export function periodFrequency(ex) {
  const s = docDate(ex && ex.periodStart), e = docDate(ex && ex.periodEnd);
  if (!s || !e || e < s) return null;
  const span = days(s, e) + 1;
  const same = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (same && s.getUTCDate() === 1 && e.getUTCDate() === 15) return 'semimonthly';
  if (same && s.getUTCDate() === 16 && e.getUTCDate() === lastDay(e)) return 'semimonthly';
  if (same && s.getUTCDate() === 1 && e.getUTCDate() === lastDay(e)) return 'monthly';
  if (span === 7) return 'weekly';
  if (span === 14) return 'biweekly';
  if (span >= 15 && span <= 16) return 'semimonthly';
  if (span >= 28 && span <= 31) return 'monthly';
  return null;
}
function printedFrequency(ex) {
  const p = String((ex && ex.payFrequency) || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  if (/^(weekly|hebdomadaire)$/.test(p)) return 'weekly';
  if (/^(biweekly|fortnightly|everytwoweeks|auxdeuxsemaines|bihebdomadaire)$/.test(p)) return 'biweekly';
  if (/^(semimonthly|twiceamonth|bimensuel|bimensuelle)$/.test(p)) return 'semimonthly';
  if (/^(monthly|mensuel|mensuelle)$/.test(p)) return 'monthly';
  return null;
}
// The most pay periods that can have been paid by this pay date in its year.
function periodsSoFar(freq, payDate) {
  const doy = dayOfYear(payDate);
  if (freq === 'weekly') return Math.ceil(doy / 7) + 1;
  if (freq === 'biweekly') return Math.ceil(doy / 14) + 1;
  if (freq === 'semimonthly') return payDate.getUTCMonth() * 2 + 2;
  if (freq === 'monthly') return payDate.getUTCMonth() + 1;
  return null;
}

// ── Same person ────────────────────────────────────────────────────────────────────────────────
// true, false, or null (not enough to tell). Never false on a single name part.
export function sameName(applicant, printed) {
  const r = nameOnDocMatches(applicant, printed);
  if (r !== false) return r;
  const A = nameTokens(applicant), B = nameTokens(printed);
  if (A.join('') === B.join('')) return true; // O'Brien and OBrien, Mc Donald and McDonald
  const joinedA = new Set([A.join('')]), joinedB = new Set([B.join('')]);
  for (let i = 0; i + 1 < A.length; i++) joinedA.add(A[i] + A[i + 1]);
  for (let i = 0; i + 1 < B.length; i++) joinedB.add(B[i] + B[i + 1]);
  const both = [...joinedA].some((t) => B.includes(t) || joinedB.has(t)) || [...joinedB].some((t) => A.includes(t));
  return both ? null : false;
}

// ── Same employer ──────────────────────────────────────────────────────────────────────────────
const EMP_NOISE = new Set([...EMPLOYER_NOISE, 'ltee', 'cie', 'senc', 'sencrl', 'inc', 'of', 'and', 'du', 'de', 'des', 'la', 'le', 'les', 'et']);
const empTokens = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !EMP_NOISE.has(t));
const initials = (ts) => ts.map((t) => t[0]).join('');
// One side's abbreviation spells a run of the other side's words, and the rest of that side is
// either inside the other or the run is the whole other name (CIBC, TD Bank).
function acronymAgrees(A, B) {
  for (const t of A) {
    if (t.length < 2 || t.length > 6) continue;
    for (let i = 0; i + t.length <= B.length; i++) {
      if (initials(B.slice(i, i + t.length)) !== t) continue;
      const rest = A.filter((x) => x !== t);
      if (t.length === B.length || rest.every((x) => B.includes(x))) return true;
    }
  }
  return false;
}
export function sameEmployer(a, b) {
  const A = empTokens(a), B = empTokens(b);
  if (!A.length || !B.length) return null;
  const ja = A.join(''), jb = B.join('');
  if (ja === jb) return true;
  if (ja.length >= 3 && jb.length >= 3 && (ja.includes(jb) || jb.includes(ja))) return true;
  if (acronymAgrees(A, B) || acronymAgrees(B, A)) return true;
  return false;
}

// ── The checks ─────────────────────────────────────────────────────────────────────────────────
const present = (v) => v != null && String(v).trim() !== '';
const stubLabel = (ex) => { const d = docDate(ex.payDate) || docDate(ex.periodEnd); return d ? `the ${fmtDay(d)} stub` : 'one pay stub'; };

export function integrityFindings(items, { applicantName = '', statedEmployer = null, uploadedAt = new Date() } = {}) {
  const at = new Date(uploadedAt).toISOString();
  const now = new Date(uploadedAt).getTime();
  const out = [];
  const add = (type, documentId, sentence) => out.push({ type, documentId: documentId || null, sentence, at });
  const docs = (Array.isArray(items) ? items : []).filter((it) => it && it.document && it.document.unrecognized !== true)
    .map((it) => ({ id: it.documentId || null, edited: it.fileEdited === true, doc: it.document, ex: it.document.extracted || {}, kind: kindOf(it.document) }))
    .filter((d) => d.kind !== 'other' && d.kind !== 'credit report');
  const stubs = docs.filter((d) => d.kind === 'pay stub');

  // a. Arithmetic on each stub, then year to date.
  for (const s of stubs) {
    const g = money(s.ex.grossForPeriod), dd = money(s.ex.deductionsForPeriod), n = money(s.ex.netForPeriod);
    if (g != null && dd != null && n != null && g > 0) {
      const diff = g - dd - n;
      if (Math.abs(diff) > TOLERANCE.netDollars) add(INTEGRITY.PAY_ARITHMETIC, s.id, `The net pay on ${stubLabel(s.ex)} does not equal gross less deductions (${fmtMoney(diff)} apart).`);
    }
    const ytd = money(s.ex.ytdGross);
    if (ytd != null && g != null && g > 0) {
      if (ytd + TOLERANCE.netDollars < g) add(INTEGRITY.PAY_YTD, s.id, `The year to date gross on ${stubLabel(s.ex)} (${fmtMoney(ytd)}) is less than that period's gross (${fmtMoney(g)}).`);
      else {
        const freq = periodFrequency(s.ex) || printedFrequency(s.ex); const pd = docDate(s.ex.payDate);
        const most = freq && pd ? periodsSoFar(freq, pd) : null;
        if (most && ytd > g * most * TOLERANCE.ytdTimesPeriods + TOLERANCE.netDollars) add(INTEGRITY.PAY_YTD, s.id, `The year to date gross on ${stubLabel(s.ex)} (${fmtMoney(ytd)}) is more than three times ${most} ${LABEL[freq]} periods at that stub's gross.`);
      }
    }
  }
  // A later stub's year to date holds the earlier one plus its own gross (same year).
  const dated = stubs.map((s) => ({ ...s, pd: docDate(s.ex.payDate), ytd: money(s.ex.ytdGross), g: money(s.ex.grossForPeriod) })).filter((s) => s.pd && s.ytd != null && s.g != null).sort((x, y) => x.pd - y.pd);
  for (let i = 1; i < dated.length; i++) {
    const a = dated[i - 1], b = dated[i];
    if (a.pd.getUTCFullYear() !== b.pd.getUTCFullYear() || a.pd.getTime() === b.pd.getTime()) continue;
    if (b.ytd + TOLERANCE.netDollars < a.ytd + b.g) add(INTEGRITY.PAY_YTD, b.id, `The year to date gross does not carry from the ${fmtDay(a.pd)} stub (${fmtMoney(a.ytd)}) to the ${fmtDay(b.pd)} stub (${fmtMoney(b.ytd)}).`);
  }

  // b. Pay dates: the schedule across regular stubs, the future, the most recent.
  const regular = stubs.map((s) => ({ ...s, pd: docDate(s.ex.payDate), freq: periodFrequency(s.ex) })).filter((s) => s.pd && s.freq);
  const freqs = [...new Set(regular.map((s) => s.freq))];
  if (regular.length >= 2 && freqs.length === 1) {
    const f = freqs[0]; const P = PERIOD_DAYS[f]; const tol = TOLERANCE.scheduleDays[f];
    const sorted = [...regular].sort((x, y) => x.pd - y.pd);
    for (let i = 1; i < sorted.length; i++) {
      const gap = days(sorted[i - 1].pd, sorted[i].pd);
      if (gap === 0) continue; // the same pay date twice is the same run, never a schedule
      const k = Math.max(1, Math.round(gap / P));
      if (Math.abs(gap - k * P) > tol) add(INTEGRITY.PAY_SCHEDULE, sorted[i].id, `The pay dates ${fmtDay(sorted[i - 1].pd)} and ${fmtDay(sorted[i].pd)} are ${gap} days apart, which does not fit the ${LABEL[f]} pay periods printed on these stubs.`);
    }
  }
  const stubDates = stubs.map((s) => ({ ...s, pd: docDate(s.ex.payDate) })).filter((s) => s.pd);
  for (const s of stubDates) if (days(now, s.pd.getTime()) > TOLERANCE.futureDays) add(INTEGRITY.PAY_FUTURE, s.id, `A pay stub shows a pay date of ${fmtFull(s.pd)}, after the day it was uploaded.`);
  const past = stubDates.filter((s) => days(now, s.pd.getTime()) <= TOLERANCE.futureDays).sort((x, y) => y.pd - x.pd);
  if (past.length && days(past[0].pd.getTime(), now) > TOLERANCE.staleDays) add(INTEGRITY.PAY_STALE, past[0].id, `The most recent pay stub is dated ${fmtFull(past[0].pd)}, more than ${TOLERANCE.staleDays} days before it was uploaded.`);

  // c. The same person on every document that speaks to the name.
  if (present(applicantName)) {
    for (const d of docs) {
      if (levelOf(d.doc, 'name') < 2 || !present(d.ex.applicantName)) continue;
      if (sameName(applicantName, d.ex.applicantName) === false) add(INTEGRITY.NAME, d.id, `The name on the ${KIND_LABEL[d.kind]} (${String(d.ex.applicantName).trim()}) does not match the applicant (${String(applicantName).trim()}).`);
    }
  }

  // d. The same employer: against the letter when there is one, else the application.
  const letter = docs.find((d) => d.kind === 'employment letter' && present(d.ex.employer));
  const reference = letter ? { name: String(letter.ex.employer).trim(), where: 'the employment letter' } : present(statedEmployer) ? { name: String(statedEmployer).trim(), where: 'the application' } : null;
  if (reference) {
    for (const d of docs) {
      if (!(d.kind === 'pay stub' || d.kind === 'employment letter') || d === letter || !present(d.ex.employer)) continue;
      if (sameEmployer(d.ex.employer, reference.name) === false) add(INTEGRITY.EMPLOYER, d.id, `The employer on ${d.kind === 'pay stub' ? stubLabel(d.ex) : 'the employment letter'} (${String(d.ex.employer).trim()}) differs from ${reference.where} (${reference.name}).`);
    }
    if (letter && present(statedEmployer) && sameEmployer(letter.ex.employer, statedEmployer) === false) add(INTEGRITY.EMPLOYER, letter.id, `The employer on the employment letter (${String(letter.ex.employer).trim()}) differs from the application (${String(statedEmployer).trim()}).`);
  }

  // e. Dates on the other documents: none after the upload; an older letter is a note.
  for (const d of docs) {
    if (d.kind === 'pay stub') continue;
    const dt = docDate(d.ex.documentDate);
    if (!dt) continue;
    const ahead = days(now, dt.getTime());
    if (ahead > TOLERANCE.futureDays) add(INTEGRITY.FUTURE_DATE, d.id, `The ${KIND_LABEL[d.kind]} is dated ${fmtFull(dt)}, after the day it was uploaded.`);
    else if (d.kind === 'employment letter' && -ahead > TOLERANCE.letterDays) add(INTEGRITY.LETTER_AGE, d.id, `The employment letter is dated ${fmtFull(dt)}, more than ${TOLERANCE.letterDays} days before it was uploaded.`);
  }

  // f. File history joins a finding from a to d on the same document, once; alone it is nothing.
  const editedIds = new Set(docs.filter((d) => d.edited && d.id).map((d) => d.id));
  const joined = new Set();
  for (const f of out) {
    if (!JOINABLE.has(f.type) || !editedIds.has(f.documentId) || joined.has(f.documentId)) continue;
    f.sentence = `${f.sentence} ${FILE_HISTORY_LINE}`;
    joined.add(f.documentId);
  }
  return [...out.filter((f) => !isNote(f)), ...out.filter(isNote)];
}

// Only the four stored fields, and only known types: what a report may carry.
export function storedFindings(list) {
  return (Array.isArray(list) ? list : []).filter((f) => f && INTEGRITY_TYPES.includes(f.type) && typeof f.sentence === 'string' && f.sentence.trim())
    .map((f) => ({ type: f.type, documentId: f.documentId || null, sentence: String(f.sentence).slice(0, 400), at: f.at || null }));
}
// The flags and notes of the active report, for the card and the checklist.
export function integrityOf(report) {
  const all = storedFindings(report && report.integrity);
  return { flags: all.filter((f) => !isNote(f)), notes: all.filter(isNote) };
}
