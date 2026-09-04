// lib/fitScore.js
// Fit: how well an applicant's income and record fit THIS unit's rent and the realtor's stated
// criteria, and whether we verified it. Derived at read time (never stored), pure, isomorphic.
// Design: docs/audit-2026-09.md, Part 1c. The formula, weights and copy there are fixed.
//
//   computeFit({ application, listing, verification, confirmations }) -> null | {
//     score, scoreExact, label, A, E, R, ratio, incomeUsed, incomeSource, criteria, confirmations,
//     parts, model: 'fit-v2' }
//   compareFit(a, b)        the one sort order: scoreExact desc, no Fit last, earlier applicant first on a tie
//   fitReason(lower, upper) the reason line under an applicant on the report
//
//   application   the applications row as attached to a junction row (annual_income,
//                 co_applicant, prev_landlord_name, references, years_at_job)
//   listing       { monthly_rent, pref_rent_to_income_max_pct, pref_min_annual_income,
//                   pref_min_years_at_job, pref_requires_landlord_reference,
//                   pref_requires_employer_verification }
//   verification  the ACTIVE document report (what attachDocVerifications puts in
//                 docVerifications[0]); an array is accepted and its first entry used. May be null.
//   confirmations the realtor's own confirmations from the junction row (db/screening.sql):
//                 { id?, employer?, landlord?, reference? : { at, by } }. The realtor verifies;
//                 the documents only match. 'verified' is said only once `employer` exists.
//
// Screenable facts only: income, rent share, tenure, landlord reference, references, and what
// documents verified. Nothing from any free text answer is read here.
import { editedAfterReport, confirmationCounts } from './editedAfter.js';

export const FIT_MODEL = 'fit-v2';

// lib/scoring.js does not export its helpers and must not change, so these are copied. round1
// adds a tolerance because 0.5 * 4.7 + 0.3 * 2 + 0.2 * 5 is 3.9499999999999997 in floating point
// and must round to 4.0, and 4.85 must round to 4.9.
const round1 = (v) => Math.round(v * 10 + 1e-9) / 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function interp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }
  return last[1];
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const moneyK = (n) => `$${Math.round(n / 1000)}k`;
// Years columns are text: "3 years" and "3+" read as 3, "three" reads as 0 (no digits).
export const parseYears = (s) => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
// "$92,000" or "92000/yr" -> 92000; anything without digits -> null
const parseMoney = (s) => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// The document report, read the way lib/applicantSynthesis.js and lib/listingReportData.js read
// it: at least one analyzed document, a name that belongs to this applicant, and only a 'match'
// comparison counts. state: 'none' | 'mismatch' | 'unclear' | 'ok'.
export function readVerification(verification, { ignoreName = false } = {}) {
  const r = Array.isArray(verification) ? verification[0] : verification;
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true) : [];
  if (!r || typeof r !== 'object' || docs.length === 0) return { state: 'none', incomeMatched: false, employerMatched: false, incomeFound: null, incomeMismatch: false, employerMismatch: false };
  // ignoreName: the realtor saw ID (confirmations.id), so a name mismatch on the documents no
  // longer applies and the documents are scored as usual.
  if (!ignoreName && (r.nameMatch === 'mismatch' || r.nameMatch === 'unclear')) return { state: r.nameMatch, incomeMatched: false, employerMatched: false, incomeFound: null, incomeMismatch: false, employerMismatch: false };
  const comparisons = Array.isArray(r.comparisons) ? r.comparisons : [];
  const matchOf = (re) => comparisons.find((c) => c && re.test(String(c.field || '')) && c.status === 'match');
  // A figure was found and differs (mismatch or close): the documents contradict the application.
  const differs = (re) => comparisons.some((c) => c && re.test(String(c.field || '')) && (c.status === 'mismatch' || c.status === 'close'));
  const incomeM = matchOf(/income/i);
  const employerM = matchOf(/employer/i);
  return { state: 'ok', incomeMatched: !!incomeM, employerMatched: !!employerM, incomeFound: incomeM ? parseMoney(incomeM.found || incomeM.stated) : null, incomeMismatch: !incomeM && differs(/income/i), employerMismatch: !employerM && differs(/employer/i) };
}

export function computeFit({ application, listing, verification, confirmations } = {}) {
  const app = application || {};
  const l = listing || {};
  const conf = confirmations && typeof confirmations === 'object' ? confirmations : {};
  // An edit after the documents: the report no longer describes the application. E is scored as
  // if no report existed and the label reads check docs, until the realtor confirms the employer
  // again. Confirmations dated before the edit do not count for E; those dated after do.
  const reportObj = Array.isArray(verification) ? verification[0] : verification;
  const editedAt = editedAfterReport(app, reportObj);
  const idConfirmed = confirmationCounts(conf.id, editedAt), employerConfirmed = confirmationCounts(conf.employer, editedAt), landlordConfirmed = !!conf.landlord;
  const edited = !!editedAt && !employerConfirmed;
  const rent = num(l.monthly_rent);
  const v = edited ? readVerification(null) : readVerification(verification, { ignoreName: idConfirmed });

  // Income: the verified figure when the documents matched income (a figure that reads as a
  // monthly or biweekly amount falls back to the stated annual figure, which the match confirmed).
  const stated = num(app.annual_income);
  let primaryIncome = stated; let incomeSource = 'stated';
  if (v.incomeMatched) { incomeSource = 'verified'; if (v.incomeFound != null && v.incomeFound >= 12000) primaryIncome = v.incomeFound; }
  const co = app.co_applicant ? num(app.co_applicant.annualIncome ?? app.co_applicant.annual_income) : 0;
  const householdIncome = primaryIncome + co;
  if (rent <= 0 || householdIncome <= 0) return null;
  const monthly = Math.round(householdIncome / 12);
  if (monthly <= 0) return null;
  const ratio = Math.round((100 * rent) / monthly);

  // A. Affordability against this unit.
  const T = num(l.pref_rent_to_income_max_pct) > 0 ? num(l.pref_rent_to_income_max_pct) : 40;
  const x = ratio / T;
  let A = interp(x, [[0, 5], [0.75, 5], [1.0, 4.0], [1.25, 2.5], [1.5, 1.5], [2.0, 1.0]]);
  const minIncome = num(l.pref_min_annual_income);
  if (minIncome > 0 && householdIncome < minIncome) A = Math.min(A, 2.0);

  // E. Evidence.
  let E = 2.0;
  if (v.state === 'mismatch' || v.state === 'unclear') E = 1.0;
  else if (v.state === 'ok') E = v.incomeMatched && v.employerMatched ? 5.0 : v.incomeMatched ? 4.5 : 2.5;
  const requiresEmployer = !!l.pref_requires_employer_verification;
  const employerOk = employerConfirmed || v.employerMatched;
  if (requiresEmployer && !employerOk) E = Math.min(E, 2.0);
  if (employerConfirmed) E = 5.0; // the realtor called the employer: that is verification, whatever the documents said

  // R. Record, continuous: tenure at the job and length of the previous tenancy are read as
  // numbers, the landlord name, the previous address, the references and the realtor's calls
  // add fixed amounts. 1.5 base, at most 5.
  const landlordRef = !!(app.prev_landlord_name && String(app.prev_landlord_name).trim());
  const prevAddress = !!(app.prev_address && String(app.prev_address).trim());
  const refCount = Array.isArray(app.references) ? app.references.length : 0;
  const years = parseYears(app.years_at_job);
  const yearsPrev = parseYears(app.years_at_previous);
  const tenure = interp(clamp(years, 0, 5), [[0, 0], [0.5, 0.3], [1, 0.6], [2, 0.9], [3, 1.1], [5, 1.3]]);
  const tenancy = Math.min(1.5, (landlordRef ? interp(clamp(yearsPrev, 0, 4), [[0, 0.6], [1, 0.9], [2, 1.2], [4, 1.4]]) : prevAddress ? 0.2 : 0) + (landlordConfirmed ? 0.3 : 0));
  const refs = 0.4 * Math.min(refCount, 2) + (conf.reference ? 0.2 : 0);
  let R = clamp(1.5 + tenure + tenancy + refs, 1, 5);
  const minYears = num(l.pref_min_years_at_job) > 0 ? num(l.pref_min_years_at_job) : 0;
  const tenureMet = minYears <= 0 || years >= minYears;
  if (!tenureMet) R = Math.min(R, 3.0);
  const requiresRef = !!l.pref_requires_landlord_reference;
  if (requiresRef && !landlordRef) R = Math.min(R, 2.0);

  // A and E sit on a 0.1 grid; R stays exact in the score so order never rests on a rounding tie.
  A = round1(A); E = round1(E);
  const scoreExact = 0.5 * A + 0.3 * E + 0.2 * R;
  const score = round1(scoreExact);
  R = round1(R);
  // The label: what the number rests on. 'check docs' whenever the documents contradict the
  // application (income or employer differs, or the name did not match and no ID was seen).
  const hasReport = v.state !== 'none';
  const contradicted = v.state === 'mismatch' || v.state === 'unclear' || v.incomeMismatch || v.employerMismatch;
  const label = employerConfirmed ? 'verified' : edited ? 'check docs' : !hasReport ? 'stated' : contradicted ? 'check docs' : v.incomeMatched ? 'docs match' : 'stated';

  // The realtor's criteria, one entry per pref_ column set on the listing.
  const criteria = [];
  if (num(l.pref_rent_to_income_max_pct) > 0) criteria.push({ key: 'pref_rent_to_income_max_pct', label: 'Rent share', status: ratio <= T ? 'met' : 'missed', detail: `Rent share ${ratio}% · your max ${T}%` });
  if (minIncome > 0) criteria.push({ key: 'pref_min_annual_income', label: 'Minimum income', status: householdIncome >= minIncome ? 'met' : 'missed', detail: householdIncome >= minIncome ? `Income ${moneyK(householdIncome)} · your min ${moneyK(minIncome)}` : `Below your ${moneyK(minIncome)} minimum` });
  if (minYears > 0) criteria.push({ key: 'pref_min_years_at_job', label: 'Tenure', status: tenureMet ? 'met' : 'missed', detail: `${years} yrs at employer · your min ${minYears}` });
  if (requiresRef) criteria.push({ key: 'pref_requires_landlord_reference', label: 'Landlord reference', status: landlordRef ? 'met' : 'missed', detail: landlordRef ? 'Landlord reference on file' : 'No landlord reference' });
  if (requiresEmployer) criteria.push({ key: 'pref_requires_employer_verification', label: 'Employer verification', status: employerOk ? 'met' : (v.state === 'none' || v.state === 'unclear') ? 'unverified' : 'missed', detail: employerOk ? 'Employer verified' : 'Employer not verified' });

  // evidence: what E rests on, for the reason line. incomeCapped: A was held at 2.0 by pref_min_annual_income.
  const evidence = { hasReport: hasReport || edited, contradicted: contradicted || edited, edited, employerConfirmed, incomeCapped: minIncome > 0 && householdIncome < minIncome };
  return { score, scoreExact, label, A, E, R, ratio, incomeUsed: householdIncome, incomeSource, criteria, confirmations: conf, parts: { tenure, tenancy, refs, landlordRef, yearsAtJob: years, yearsAtPrevious: yearsPrev, refCount }, evidence, model: FIT_MODEL };
}

// Sort order for dashboard applicant objects ({ application: { fit, created_at } }): scoreExact
// descending, no Fit last, ties by the earlier applicant first. The one comparator every list uses.
const createdOf = (a) => String((a && a.application && (a.application.created_at || a.application.createdAt)) || (a && a.createdAt) || '');
export function compareFit(a, b) {
  const fa = a && a.application && a.application.fit, fb = b && b.application && b.application.fit;
  const sa = fa && fa.scoreExact != null ? fa.scoreExact : fa && fa.score != null ? fa.score : null;
  const sb = fb && fb.scoreExact != null ? fb.scoreExact : fb && fb.score != null ? fb.score : null;
  if (sa == null && sb != null) return 1;
  if (sb == null && sa != null) return -1;
  if (sa != null && sb != null && sa !== sb) return sb - sa;
  return createdOf(a).localeCompare(createdOf(b));
}

// One line, at most eight words, naming what places `lower` below `upper` in the ranking. All
// three parts are compared, each fact weighted by that part's share of the exact gap, two facts
// at most, none within 0.02. Never the income level.
//   E gap: no report            "No documents yet"
//          report contradicted  "Documents did not match"
//          upper confirmed      "Employer not confirmed"
//   A gap: capped by minimum    "Below your income minimum", otherwise "Higher rent share"
//   R gap: shorter tenure, shorter tenancy, no landlord reference, fewer references
export function fitReason(lower, upper) {
  if (!lower || !upper || lower.scoreExact == null || upper.scoreExact == null) return null;
  if (Math.abs(upper.scoreExact - lower.scoreExact) < 0.02) return null;
  const lp = lower.parts || {}, up = upper.parts || {};
  const le = lower.evidence || {}, ue = upper.evidence || {};
  const facts = [];
  // E: the evidence gap, one fact, by what this applicant lacks.
  const dE = 0.3 * (upper.E - lower.E);
  if (dE > 0) {
    if (!le.hasReport && !le.employerConfirmed) facts.push(['no documents yet', dE]);
    else if (le.edited) facts.push(['profile edited after documents', dE]);
    else if (le.contradicted) facts.push(['documents did not match', dE]);
    else if (ue.employerConfirmed && !le.employerConfirmed) facts.push(['employer not confirmed', dE]);
  }
  // A: the affordability gap against this unit.
  const dA = 0.5 * (upper.A - lower.A);
  if (dA > 0) {
    if (le.incomeCapped && !ue.incomeCapped) facts.push(['below your income minimum', dA]);
    else if (lower.ratio != null && upper.ratio != null && lower.ratio > upper.ratio) facts.push(['higher rent share', dA]);
  }
  // R: the record facts.
  if ((lp.tenure || 0) < (up.tenure || 0)) facts.push(['shorter tenure', 0.2 * (up.tenure - lp.tenure)]);
  if (!lp.landlordRef && up.landlordRef) facts.push(['no landlord reference', 0.2 * Math.max((up.tenancy || 0) - (lp.tenancy || 0), 0.1)]);
  else if ((lp.tenancy || 0) < (up.tenancy || 0)) facts.push(['shorter tenancy', 0.2 * (up.tenancy - lp.tenancy)]);
  if ((lp.refs || 0) < (up.refs || 0)) facts.push(['fewer references', 0.2 * (up.refs - lp.refs)]);
  if (!facts.length) return null;
  facts.sort((x, y) => y[1] - x[1]);
  const line = facts.slice(0, 2).map((f) => f[0]).join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// Convenience for a dashboard applicant object: { ..., application, docVerifications: [active] }.
export function fitFor(applicant, listing) {
  const app = applicant && applicant.application;
  if (!app) return null;
  const verification = Array.isArray(applicant.docVerifications) ? applicant.docVerifications[0] || null : null;
  return computeFit({ application: app, listing, verification, confirmations: applicant.confirmations || {} });
}
