// lib/fitScore.js
// Fit: how well an applicant's income and record fit THIS unit's rent and the realtor's stated
// criteria, and whether we verified it. Derived at read time (never stored), pure, isomorphic.
// Design: docs/audit-2026-09.md, Part 1c. The formula, weights and copy there are fixed.
//
//   computeFit({ application, listing, verification }) -> null | {
//     score, label, A, E, R, ratio, incomeUsed, incomeSource, criteria, model: 'fit-v2' }
//
//   application   the applications row as attached to a junction row (annual_income,
//                 co_applicant, prev_landlord_name, references, years_at_job)
//   listing       { monthly_rent, pref_rent_to_income_max_pct, pref_min_annual_income,
//                   pref_min_years_at_job, pref_requires_landlord_reference,
//                   pref_requires_employer_verification }
//   verification  the ACTIVE document report (what attachDocVerifications puts in
//                 docVerifications[0]); an array is accepted and its first entry used. May be null.
//
// Screenable facts only: income, rent share, tenure, landlord reference, references, and what
// documents verified. Nothing from any free text answer is read here.
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
// "$92,000" or "92000/yr" -> 92000; anything without digits -> null
const parseMoney = (s) => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// The document report, read the way lib/applicantSynthesis.js and lib/listingReportData.js read
// it: at least one analyzed document, a name that belongs to this applicant, and only a 'match'
// comparison counts. state: 'none' | 'mismatch' | 'unclear' | 'ok'.
export function readVerification(verification) {
  const r = Array.isArray(verification) ? verification[0] : verification;
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true) : [];
  if (!r || typeof r !== 'object' || docs.length === 0) return { state: 'none', incomeMatched: false, employerMatched: false, incomeFound: null };
  if (r.nameMatch === 'mismatch' || r.nameMatch === 'unclear') return { state: r.nameMatch, incomeMatched: false, employerMatched: false, incomeFound: null };
  const comparisons = Array.isArray(r.comparisons) ? r.comparisons : [];
  const matchOf = (re) => comparisons.find((c) => c && re.test(String(c.field || '')) && c.status === 'match');
  const incomeM = matchOf(/income/i);
  const employerM = matchOf(/employer/i);
  return { state: 'ok', incomeMatched: !!incomeM, employerMatched: !!employerM, incomeFound: incomeM ? parseMoney(incomeM.found || incomeM.stated) : null };
}

export function computeFit({ application, listing, verification } = {}) {
  const app = application || {};
  const l = listing || {};
  const rent = num(l.monthly_rent);
  const v = readVerification(verification);

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
  if (requiresEmployer && !v.employerMatched) E = Math.min(E, 2.0);

  // R. Record.
  const landlordRef = !!(app.prev_landlord_name && String(app.prev_landlord_name).trim());
  const refs = Array.isArray(app.references) ? app.references.length : 0;
  const years = parseFloat(app.years_at_job) || 0;
  const minYears = num(l.pref_min_years_at_job) > 0 ? num(l.pref_min_years_at_job) : 1;
  const tenureMet = years >= minYears;
  let R = clamp(2.5 + (landlordRef ? 1.5 : 0) + 0.5 * Math.min(refs, 2) + (tenureMet ? 0.5 : 0), 1, 5);
  const requiresRef = !!l.pref_requires_landlord_reference;
  if (requiresRef && !landlordRef) R = Math.min(R, 2.0);

  A = round1(A); E = round1(E); R = round1(R);
  const score = round1(0.5 * A + 0.3 * E + 0.2 * R);
  const label = E >= 4.5 ? 'verified' : 'stated';

  // The realtor's criteria, one entry per pref_ column set on the listing.
  const criteria = [];
  if (num(l.pref_rent_to_income_max_pct) > 0) criteria.push({ key: 'pref_rent_to_income_max_pct', label: 'Rent share', status: ratio <= T ? 'met' : 'missed', detail: `Rent share ${ratio}% · your max ${T}%` });
  if (minIncome > 0) criteria.push({ key: 'pref_min_annual_income', label: 'Minimum income', status: householdIncome >= minIncome ? 'met' : 'missed', detail: householdIncome >= minIncome ? `Income ${moneyK(householdIncome)} · your min ${moneyK(minIncome)}` : `Below your ${moneyK(minIncome)} minimum` });
  if (num(l.pref_min_years_at_job) > 0) criteria.push({ key: 'pref_min_years_at_job', label: 'Tenure', status: tenureMet ? 'met' : 'missed', detail: `${years} yrs at employer · your min ${minYears}` });
  if (requiresRef) criteria.push({ key: 'pref_requires_landlord_reference', label: 'Landlord reference', status: landlordRef ? 'met' : 'missed', detail: landlordRef ? 'Landlord reference on file' : 'No landlord reference' });
  if (requiresEmployer) criteria.push({ key: 'pref_requires_employer_verification', label: 'Employer verification', status: v.employerMatched ? 'met' : (v.state === 'none' || v.state === 'unclear') ? 'unverified' : 'missed', detail: v.employerMatched ? 'Employer verified' : 'Employer not verified' });

  return { score, label, A, E, R, ratio, incomeUsed: householdIncome, incomeSource, criteria, model: FIT_MODEL };
}

// Convenience for a dashboard applicant object: { ..., application, docVerifications: [active] }.
export function fitFor(applicant, listing) {
  const app = applicant && applicant.application;
  if (!app) return null;
  const verification = Array.isArray(applicant.docVerifications) ? applicant.docVerifications[0] || null : null;
  return computeFit({ application: app, listing, verification });
}
