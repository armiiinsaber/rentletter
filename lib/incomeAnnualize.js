// lib/incomeAnnualize.js  PURE, isomorphic. Income annualization is arithmetic done here, from
// the fields the model read off each pay document, across every stub. The model never returns
// an annual, monthly or yearly figure (lib/applicantAnalysis.js prompt); this module decides the
// pay frequency from the period dates, detects partial periods from the hours or the gross, and
// annualizes the median full period. One sentence explains the result to the realtor.
//
//   annualizeFromStubs(stubs, statedAnnual) -> { annual, basis, stubsUsed, partial, confidence, explanation }
//   incomeComparison(documents, statedAnnual) -> the Income comparison row for the report
const FREQ = Object.freeze({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 });
const STANDARD_HOURS = Object.freeze({ weekly: 40, biweekly: 80, semimonthly: 86.67, monthly: 173.33 });
const LABEL = Object.freeze({ weekly: 'weekly', biweekly: 'biweekly', semimonthly: 'semi monthly', monthly: 'monthly' });
export const MATCH_PCT = 5;
export const CLOSE_PCT = 15;
export const PARTIAL_RATIO = 0.7;

const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${Math.round(Number(n)).toLocaleString('en-CA')}`;
// The median gross; an even count takes the lower middle value, so a one off stipend or overtime on
// one of two stubs never lifts the figure (two stubs at 3,541.67 and 3,631.67 read 3,541.67).
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : s[m - 1]; };

// A date as printed: ISO, or month day year in words or digits. null when unreadable.
export function parseDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const t = Date.parse(s.replace(/(\d)(st|nd|rd|th)\b/g, '$1'));
  if (Number.isNaN(t)) return null;
  const d = new Date(t); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const lastDayOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

// The pay frequency from the period dates, else the printed frequency, else null.
export function frequencyOf(stub) {
  const start = parseDate(stub?.periodStart), end = parseDate(stub?.periodEnd);
  if (start && end && end >= start) {
    const span = daysBetween(start, end) + 1; // inclusive days
    const sd = start.getUTCDate(), ed = end.getUTCDate(), sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
    if (sameMonth && sd === 1 && ed === 15) return 'semimonthly';
    if (sameMonth && sd === 16 && ed === lastDayOfMonth(end)) return 'semimonthly';
    if (sameMonth && sd === 1 && ed === lastDayOfMonth(end)) return 'monthly';
    if (span === 14) return 'biweekly';
    if (span === 7) return 'weekly';
    if (span >= 15 && span <= 16) return 'semimonthly';
    if (span >= 28 && span <= 31) return 'monthly';
  }
  const printed = String(stub?.payFrequency || '').toLowerCase().replace(/[^a-z]/g, '');
  if (/^(weekly|week)$/.test(printed)) return 'weekly';
  if (/^(biweekly|fortnightly|everytwoweeks)$/.test(printed)) return 'biweekly';
  if (/^(semimonthly|twiceamonth|bimonthly)$/.test(printed)) return 'semimonthly';
  if (/^(monthly|month)$/.test(printed)) return 'monthly';
  return null;
}

// stubs: [{ periodStart, periodEnd, payDate, grossForPeriod, regularRate, hours, payFrequency }]
export function annualizeFromStubs(stubs, statedAnnual = null) {
  void statedAnnual; // the stated figure never enters the arithmetic; the caller compares afterwards
  const rows = (stubs || []).map((s) => ({ freq: frequencyOf(s), gross: num(s?.grossForPeriod), hours: num(s?.hours), rate: num(s?.regularRate) })).filter((r) => r.gross != null && r.gross > 0);
  if (!rows.length) return { annual: null, basis: null, stubsUsed: 0, partial: 0, confidence: 'low', explanation: 'no readable gross pay on the stubs' };
  const dated = rows.filter((r) => r.freq);
  if (!dated.length) return { annual: null, basis: null, stubsUsed: 0, partial: 0, confidence: 'low', explanation: 'pay period dates and frequency could not be read' };
  // One frequency: the most common among the dated stubs.
  const counts = {}; for (const r of dated) counts[r.freq] = (counts[r.freq] || 0) + 1;
  const freq = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const same = dated.filter((r) => r.freq === freq);
  const std = STANDARD_HOURS[freq];
  // Partial periods: hours under 70% of standard, or gross under 70% of the median gross of the others.
  const isPartial = (r, i) => {
    if (r.hours != null && r.hours < PARTIAL_RATIO * std) return true;
    const others = same.filter((_, j) => j !== i).map((o) => o.gross);
    if (others.length && r.gross < PARTIAL_RATIO * median(others)) return true;
    return false;
  };
  const flags = same.map(isPartial);
  const full = same.filter((_, i) => !flags[i]);
  const partialCount = same.length - full.length;
  const total = same.length;
  if (full.length) {
    const per = median(full.map((r) => r.gross));
    const annual = Math.round(per * FREQ[freq]);
    const excluded = partialCount ? `; ${partialCount} partial period${partialCount === 1 ? '' : 's'} excluded` : '';
    return { annual, basis: full.length > 1 ? 'median full period' : 'one full period', stubsUsed: full.length, partial: partialCount, confidence: full.length > 1 ? 'high' : 'medium', explanation: `${money(per)} ${LABEL[freq]} × ${FREQ[freq]} from ${full.length} of ${total} stub${total === 1 ? '' : 's'}${excluded}` };
  }
  // Only partial periods: the hourly rate times standard hours, when a rate is printed.
  const rated = same.find((r) => r.rate != null && r.rate > 0 && r.rate < 500);
  if (rated) {
    const annual = Math.round(rated.rate * std * FREQ[freq]);
    return { annual, basis: 'single partial period', stubsUsed: 0, partial: total, confidence: 'low', explanation: `${money(rated.rate)}/hour × ${std} hours ${LABEL[freq]} × ${FREQ[freq]}; only partial periods on file (${total} stub${total === 1 ? '' : 's'})` };
  }
  return { annual: null, basis: 'single partial period', stubsUsed: 0, partial: total, confidence: 'low', explanation: 'only partial periods' };
}

const isPayDoc = (d) => d && d.unrecognized !== true && /pay\s*stub|pay\s*statement|earnings|payslip/i.test(String(d.documentType || ''));
const isLetter = (d) => d && d.unrecognized !== true && /employment letter|offer letter/i.test(String(d.documentType || ''));

// The Income comparison for the report: stated versus what the stubs (or a letter's printed
// salary) support. Within 5% match, within 15% close, else mismatch; never mismatch on a single
// partial period. The found string is the explanation, and annual carries the number for Fit.
export function incomeComparison(documents, statedAnnual) {
  const docs = Array.isArray(documents) ? documents : [];
  const stubs = docs.filter(isPayDoc).map((d) => d.extracted || {});
  const stated = num(statedAnnual);
  let result = annualizeFromStubs(stubs, stated);
  if (result.annual == null) {
    const letter = docs.filter(isLetter).map((d) => num(d.extracted?.annualSalaryPrinted)).find((n) => n != null && n > 0);
    if (letter) result = { annual: Math.round(letter), basis: 'employment letter', stubsUsed: 0, partial: 0, confidence: 'medium', explanation: `${money0(letter)} a year as printed on the employment letter` };
  }
  const base = { field: 'Income', stated: stated != null ? money0(stated) : null, found: result.annual != null ? result.explanation : null, annual: result.annual, basis: result.basis, explanation: result.explanation };
  if (result.annual == null || stated == null || stated <= 0) return { ...base, status: 'not_found' };
  const diffPct = Math.abs(result.annual - stated) / stated * 100;
  let status = diffPct <= MATCH_PCT ? 'match' : diffPct <= CLOSE_PCT ? 'close' : 'mismatch';
  if (status === 'mismatch' && result.basis === 'single partial period') status = 'close';
  return { ...base, status };
}
