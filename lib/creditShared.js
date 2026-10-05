// lib/creditShared.js  PURE, isomorphic. A credit report the applicant shares themselves: one more
// document in the set, read for a short list of facts, shown as plain text, never scored.
//
// The legal frame (docs/credit-shared.md): the OHRC says a landlord may ask for a credit report
// and that a lack of credit history must never count against anyone; Ontario Regulation 290/98
// says income is never the sole criterion. So this module stores only CREDIT_FIELDS, writes no
// judgement word, never feeds Fit (lib/fitScore.js reads none of it), and the label it carries is
// the reserved source label SOURCE_LABELS.creditShared (lib/stateLabels.js). "Verified" is said
// only when the realtor confirmed something themselves; no credit fact can ever carry it.
//
//   isCreditKind(doc)                      the analysis typed this document a credit report
//   shapeCreditDocument(doc, { statedAddress, now })
//                                          the document with its extracted facts cut to CREDIT_FIELDS
//   creditRejection(doc, applicantName, { now, expected })
//                                          null, or { code, message } when the file must be refused
//   creditFacts(report)                    the shared facts from the active report, or null
//   creditLines(report)                    { shared, label, lines } for every surface that shows the row
//   creditSentence(report)                 the same as one line of text (the PDF, the paste text)
import { kindOf, nameOnDocMatches } from './documentAuthority.js';
import { parseDate } from './incomeAnnualize.js';
import { RETENTION_DAYS } from './documentRetention.js';
import { SOURCE_LABELS } from './stateLabels.js';

export const CREDIT_SHARED_LABEL = SOURCE_LABELS.creditShared;
export const CREDIT_NONE_LINE = 'No credit report shared';
export const CREDIT_MAX_AGE_DAYS = 90;
export const CREDIT_KIND = 'credit report';
// The one line under the credit row of the set, on the apply page and the upload page.
export const CREDIT_OPTIONAL_LINE = 'Optional. Your own report from Equifax, TransUnion, Borrowell or your bank.';
// The one sentence of consent on the tenant's upload step: what is read, for how long it is held.
export const CREDIT_CONSENT_LINE = `A credit report is read for the provider, the date, the name, the score and its scale, open accounts, collections, a bankruptcy or consumer proposal, and late payments in the last 24 months. Nothing else is kept, and the file is held for ${RETENTION_DAYS} days.`;
// The switch on the listing criteria: it changes the order of the set, never whether anything is required.
export const CREDIT_ASK_LABEL = 'Ask for a credit report';

// EXACTLY what is persisted from a credit report. Everything else the model returns is dropped
// before the run leaves lib/applicantAnalysis.js (tests/creditShared.test.mjs holds this list).
export const CREDIT_FIELDS = Object.freeze([
  'applicantName',          // the name as printed, to confirm the report is the applicant's own
  'provider',               // Equifax, TransUnion, Borrowell, Credit Karma, a bank's app
  'reportDate',             // as printed
  'creditScore',            // the number
  'scoreScale',             // the scale it is on, as printed ("300 to 900")
  'openAccounts',           // a count
  'collections',            // a count
  'bankruptcyOrProposal',   // true, false or null
  'latePayments',           // ["YYYY-MM"] in the last 24 months
  'addressMatches',         // true, false or null: computed in code, the address itself is not kept
]);
// The words the rejection messages use, plain and short.
export const CREDIT_REJECTIONS = Object.freeze({
  not_credit: 'That file does not read as a credit report. Add a report from Equifax, TransUnion, Borrowell or your bank.',
  no_name: 'We could not read a name on that credit report, so we cannot confirm it is yours.',
  name: 'The name on that credit report does not match your application, so it was not kept.',
  no_date: 'We could not read the date on that credit report. Add a report that shows its date.',
  stale: `That credit report is older than ${CREDIT_MAX_AGE_DAYS} days. Add a recent one.`,
});

export const isCreditKind = (doc) => kindOf(doc) === CREDIT_KIND;

const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const int = (v) => { const n = num(v); return n == null ? null : Math.max(0, Math.round(n)); };
const bool = (v) => (v === true || v === false ? v : typeof v === 'string' && /^(yes|true)$/i.test(v.trim()) ? true : typeof v === 'string' && /^(no|false|none)$/i.test(v.trim()) ? false : null);
const str = (v, n) => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, n) : null; };
// "2025-03", "March 2025", "2025-03-14" all read as the month; anything else is dropped.
export function monthKey(v) {
  const s = String(v == null ? '' : v).trim();
  const ym = s.match(/^(\d{4})-(\d{1,2})/);
  if (ym) { const m = Number(ym[2]); return m >= 1 && m <= 12 ? `${ym[1]}-${String(m).padStart(2, '0')}` : null; }
  const d = parseDate(s) || parseDate(`1 ${s}`);
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : null;
}
const addrTokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !/^(unit|apt|suite|ste|st|ave|rd|dr|blvd|on|bc|canada|the)$/.test(t));
// The current address on the report against the one the application states: a match needs the
// street number and two more parts in common. Only the verdict is kept, never the address.
export function addressMatches(onReport, stated) {
  const a = addrTokens(onReport), b = addrTokens(stated);
  if (!a.length || !b.length) return null;
  const numberA = a.find((t) => /^\d+$/.test(t)), numberB = b.find((t) => /^\d+$/.test(t));
  if (!numberA || !numberB || numberA !== numberB) return false;
  const common = a.filter((t) => !/^\d+$/.test(t) && b.includes(t)).length;
  return common >= 1;
}

// The document as it is persisted: the type, the file name, and the facts above, nothing else.
export function shapeCreditDocument(doc, { statedAddress = null } = {}) {
  const ex = (doc && doc.extracted) || {};
  const late = Array.isArray(ex.latePayments) ? ex.latePayments.map((p) => monthKey(p && typeof p === 'object' ? (p.month || p.date || p.when) : p)).filter(Boolean) : [];
  const extracted = {
    applicantName: str(ex.applicantName, 120),
    provider: str(ex.provider || ex.bureau, 60),
    reportDate: str(ex.reportDate || ex.documentDate, 40),
    creditScore: int(ex.creditScore),
    scoreScale: str(ex.scoreScale, 20),
    openAccounts: int(ex.openAccounts),
    collections: int(ex.collections),
    bankruptcyOrProposal: bool(ex.bankruptcyOrProposal),
    latePayments: [...new Set(late)].sort().slice(0, 24),
    addressMatches: addressMatches(ex.currentAddress, statedAddress),
  };
  return { filename: str(doc && doc.filename, 120) || 'document', documentType: CREDIT_KIND, unrecognized: false, extracted, notes: '' };
}

// Why a credit report is refused: not one at all (when one was expected), no name or the wrong
// name, no legible date, or a date past CREDIT_MAX_AGE_DAYS. The whole file is dropped with it.
export function creditRejection(doc, applicantName, { now = new Date(), expected = false } = {}) {
  if (!isCreditKind(doc)) return expected ? { code: 'not_credit', message: CREDIT_REJECTIONS.not_credit } : null;
  const ex = (doc && doc.extracted) || {};
  if (!str(ex.applicantName, 120)) return { code: 'no_name', message: CREDIT_REJECTIONS.no_name };
  if (nameOnDocMatches(applicantName, ex.applicantName) === false) return { code: 'name', message: CREDIT_REJECTIONS.name };
  const date = parseDate(ex.reportDate || ex.documentDate);
  if (!date) return { code: 'no_date', message: CREDIT_REJECTIONS.no_date };
  const age = (new Date(now).getTime() - date.getTime()) / 86400000;
  if (age > CREDIT_MAX_AGE_DAYS) return { code: 'stale', message: CREDIT_REJECTIONS.stale };
  return null;
}

const activeOf = (report) => { const r = Array.isArray(report) ? report[0] : report; return r && typeof r === 'object' ? (r.active && typeof r.active === 'object' ? r.active : r) : null; };

// The shared facts from the active report: the newest credit report in it, or null. A report stored
// before this module (score, band and bureau) reads through the same keys.
export function creditFacts(report) {
  const r = activeOf(report);
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true && isCreditKind(d)) : [];
  if (!docs.length) return null;
  const ex = docs[docs.length - 1].extracted || {};
  return {
    name: str(ex.applicantName, 120),
    provider: str(ex.provider || ex.bureau, 60),
    reportDate: str(ex.reportDate || ex.documentDate, 40),
    score: int(ex.creditScore),
    scale: str(ex.scoreScale, 20),
    openAccounts: int(ex.openAccounts),
    collections: int(ex.collections),
    bankruptcyOrProposal: bool(ex.bankruptcyOrProposal),
    latePayments: Array.isArray(ex.latePayments) ? [...new Set(ex.latePayments.map(monthKey).filter(Boolean))].sort() : [],
    addressMatches: ex.addressMatches === true || ex.addressMatches === false ? ex.addressMatches : null,
  };
}

const longDate = (v) => { const d = parseDate(v); return d ? d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : String(v || '').trim(); };
const monthLabel = (ym) => { const [y, m] = String(ym).split('-'); return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const count = (n, one, many) => (n == null ? null : n === 0 ? 'none' : `${n} ${n === 1 ? one : many}`);

// The row every surface shows, in the same words: the label, then one fact per line. No colour, no
// judgement word, a missing fact is left out rather than guessed.
export function creditLines(report) {
  const f = creditFacts(report);
  if (!f) return { shared: false, label: CREDIT_NONE_LINE, lines: [] };
  const lines = [];
  const head = [f.provider, f.reportDate ? longDate(f.reportDate) : null].filter(Boolean).join(', ');
  if (head) lines.push(head);
  if (f.score != null) lines.push(`Score ${f.score}${f.scale ? ` on a ${f.scale} scale` : ''}`);
  if (f.openAccounts != null) lines.push(`Open accounts: ${f.openAccounts}`);
  if (f.collections != null) lines.push(`Collections: ${count(f.collections, 'account', 'accounts')}`);
  if (f.bankruptcyOrProposal != null) lines.push(`Bankruptcy or consumer proposal: ${f.bankruptcyOrProposal ? 'yes' : 'none'}`);
  lines.push(`Late payments in the last 24 months: ${f.latePayments.length ? f.latePayments.map(monthLabel).join(', ') : 'none'}`);
  if (f.addressMatches != null) lines.push(f.addressMatches ? 'Address matches the application' : 'Address differs from the application');
  return { shared: true, label: CREDIT_SHARED_LABEL, lines };
}

// One line of text: "credit shared by applicant: Equifax, Aug 30, 2026; Score 712 on a 300 to 900 scale; ..."
export function creditSentence(report) {
  const c = creditLines(report);
  return c.shared ? `${c.label}: ${c.lines.join('; ')}` : c.label;
}
