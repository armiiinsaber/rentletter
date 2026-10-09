// lib/fitScore.js
// Fit v2: three pillars, each with a value and a coverage flag, scored only over what was assessed.
// Derived at read time (never stored), pure, isomorphic. Design: docs/fit-v2.md. Two rules the
// law sets and one the product sets, honoured by construction:
//   Ontario Regulation 290/98: a rent to income ratio is never the sole reason, so Ability alone
//     never shows a number (the first guardrail), and income is read with references and history.
//   OHRC Policy on Human Rights and Rental Housing: a missing history is excluded, never scored
//     as zero; job tenure does not enter; a guarantor is the listing's setting, never asked here.
//     The exclusion covers Ability (no income at all) and Conduct (no tenancy or reference), the
//     things a newcomer may genuinely not have. Truth is always assessed: every applicant has a
//     confirmation level for their facts, and stated is its lowest value, never not assessed.
//   Now over then: every dated fact in Ability and Conduct carries a recency weight: the last 12
//     months full, 12 to 24 months half, older never scored (context only).
//
//   computeFit({ application, listing, verification, confirmations }) -> null | {
//     score, scoreExact, label, model, assessed, of, notAssessed, basis, pillars, flags,
//     A, E, R, ratio, incomeUsed, incomeSource, criteria, confirmations, evidence, incomplete }
//     score is null while Ability is the only assessed pillar (incomplete names what would complete it).
//   compareFit(a, b)        the one sort order: scoreExact desc, no score last, earlier applicant first on a tie
//   fitReason(lower, upper) the reason line under an applicant on the report
//   recencyWeight(at, now)  1, 0.5 or 0 by the fact's age
//
//   application   the applications row as attached to a junction row: annual_income, employer,
//                 prev_landlord_name, prev_address, years_at_previous, created_at, profile_updated_at
//   listing       { monthly_rent, pref_rent_to_income_max_pct,
//                   pref_requires_landlord_reference, pref_requires_employer_verification }
//   verification  the ACTIVE document report (docVerifications[0]); an array is accepted. May be null.
//   confirmations the realtor's own confirmations (db/screening.sql): { id?, employer?, landlord?,
//                 reference?, landlord_reference? : { at, by, ... } }. The previous landlord's emailed
//                 answers ride on landlord_reference (lib/referenceStore.js): rentOnTime, damage,
//                 again, from, to. 'verified' is said only once `employer` exists.
//
// Never read here, by construction and by tests/fitForbidden.test.mjs: a co applicant's or a
// guarantor's income, a credit report field, job tenure, age, family or marital status, occupants,
// the kind of income, citizenship or time in Canada, or any free text.
import { editedAfterReport, confirmationCounts } from './editedAfter.js';
import { STATE_LABELS, SOURCE_LABELS } from './stateLabels.js';
import { employerRowStatus } from './employerName.js';
import { DEFAULT_RENT_SHARE_CAP } from './listingForm.js';
import { isCreditKind } from './creditShared.js';
import { parseDate } from './incomeAnnualize.js';

export const FIT_MODEL = 'fit-v2';
export const PILLARS = Object.freeze(['ability', 'truth', 'conduct']);
export const PILLAR_LABEL = Object.freeze({ ability: 'Ability', truth: 'Truth', conduct: 'Conduct' });
export const PILLAR_WEIGHT = Object.freeze({ ability: 0.5, truth: 0.3, conduct: 0.2 });
export const INCOMPLETE_LINE = 'Not enough to score yet';
export const RECENCY = Object.freeze({ fullMonths: 12, halfMonths: 24 });

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
// Years columns are text: "3 years" and "3+" read as 3, "three" reads as 0 (no digits).
export const parseYears = (s) => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const parseMoney = (s) => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const ts = (v) => { const d = v instanceof Date ? v : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : parseDate(v)); const t = d ? d.getTime() : NaN; return Number.isFinite(t) ? t : null; };
const monthsBetween = (a, b) => (b - a) / (30.4375 * 86400000);
const latest = (...dates) => dates.filter((d) => ts(d) != null).sort((a, b) => ts(b) - ts(a))[0] || dates.find(Boolean) || null;
const shortDate = (t) => (t == null ? null : new Date(t).toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' }));

// The recency weight of a dated fact: 1 within 12 months, 0.5 within 24, 0 beyond (shown as
// context, never scored). An undated fact weighs 1: it was stated now.
export function recencyWeight(at, now = Date.now()) {
  const t = ts(at); if (t == null) return 1;
  const months = monthsBetween(t, ts(now) ?? Date.now());
  if (months <= RECENCY.fullMonths) return 1;
  if (months <= RECENCY.halfMonths) return 0.5;
  return 0;
}
// A fact's contribution to its pillar: the value pulled toward the neutral midpoint by what the
// weight withholds, so a half weight fact moves the pillar half as far as a current one.
const weighted = (value, w) => 3 + w * (value - 3);

// The document report, read the way lib/applicantSynthesis.js and lib/listingReportData.js read
// it: at least one analyzed document, a name that belongs to this applicant, and only a 'match'
// comparison counts. state: 'none' | 'mismatch' | 'unclear' | 'ok'.
export function readVerification(verification, { ignoreName = false } = {}) {
  const r = Array.isArray(verification) ? verification[0] : verification;
  // A credit report the applicant shared (lib/creditShared.js) is not evidence here: a report
  // holding one alone reads as no report, and one beside the letter changes nothing.
  const docs = r && Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized !== true && !isCreditKind(d)) : [];
  if (!r || typeof r !== 'object' || docs.length === 0) return { state: 'none', incomeMatched: false, employerMatched: false, incomeFound: null, incomeMismatch: false, employerMismatch: false, incomeClose: false, employerAlsoSeen: [], employerSince: null, documentDate: null, unreadable: 0, discrepancies: [] };
  const unreadable = Array.isArray(r.documents) ? r.documents.filter((d) => d && d.unrecognized === true).length : 0;
  const discrepancies = Array.isArray(r.crossReference) ? r.crossReference.filter((c) => c && c.status === 'discrepancy').map((c) => String(c.field || 'Documents')) : [];
  // The newest date printed on an income document: the pay date, the period end, the letter's date.
  const dates = docs.map((d) => { const ex = d.extracted || {}; return ts(ex.payDate) ?? ts(ex.periodEnd) ?? ts(ex.documentDate); }).filter((t) => t != null);
  const documentDate = dates.length ? new Date(Math.max(...dates)).toISOString() : (r.analyzedAt || null);
  if (!ignoreName && (r.nameMatch === 'mismatch' || r.nameMatch === 'unclear')) return { state: r.nameMatch, incomeMatched: false, employerMatched: false, incomeFound: null, incomeMismatch: false, employerMismatch: false, incomeClose: false, employerAlsoSeen: [], employerSince: null, documentDate, unreadable, discrepancies };
  const comparisons = Array.isArray(r.comparisons) ? r.comparisons : [];
  const matchOf = (re) => comparisons.find((c) => c && re.test(String(c.field || '')) && c.status === 'match');
  const differs = (re) => comparisons.some((c) => c && re.test(String(c.field || '')) && c.status === 'mismatch');
  const closeOn = (re) => comparisons.some((c) => c && re.test(String(c.field || '')) && c.status === 'close');
  const incomeM = matchOf(/income/i);
  // The employer status is recomputed from the stored row through the current normalization
  // (lib/employerName.js), so an older report reads matched today without a re analysis.
  const employerRow0 = comparisons.find((c) => c && /employer/i.test(String(c.field || '')));
  const employerStatusNow = employerRowStatus(employerRow0);
  const employerM = employerStatusNow === 'match' ? employerRow0 : null;
  const incomeRow = comparisons.find((c) => c && /income/i.test(String(c.field || '')));
  const employerRow = employerRow0;
  return {
    state: 'ok', incomeMatched: !!incomeM, employerMatched: !!employerM,
    incomeFound: incomeM ? (incomeM.annual != null ? Number(incomeM.annual) : parseMoney(incomeM.found || incomeM.stated)) : null,
    incomeExplanation: incomeRow ? (incomeRow.explanation || incomeRow.found || null) : null,
    incomeMismatch: !incomeM && differs(/income/i), employerMismatch: employerStatusNow === 'mismatch',
    incomeClose: !incomeM && !differs(/income/i) && closeOn(/income/i),
    employerAlsoSeen: employerRow && Array.isArray(employerRow.alsoSeen) ? employerRow.alsoSeen : [],
    employerSince: employerRow && employerRow.since ? employerRow.since : null,
    documentDate, unreadable, discrepancies,
    nameMatched: r.nameMatch === 'match',
    // Liquid savings, when a bank statement printed a closing balance (lib/applicantAnalysis.js).
    savings: (() => { const b = docs.filter((d) => /bank statement/i.test(String(d.documentType || '')) && d.extracted && d.extracted.closingBalance != null).map((d) => ({ balance: num(d.extracted.closingBalance), at: d.extracted.documentDate || r.analyzedAt || null })).sort((a, b) => (ts(b.at) || 0) - (ts(a.at) || 0))[0]; return b && b.balance > 0 ? b : null; })(),
  };
}

// The rent share cap: the listing's, or 40 when null (lib/listingForm.js DEFAULT_RENT_SHARE_CAP).
export const capOf = (l) => (num(l && l.pref_rent_to_income_max_pct) > 0 ? num(l.pref_rent_to_income_max_pct) : DEFAULT_RENT_SHARE_CAP);
// No income floor exists anywhere in the product (docs/fit-v2.md): absolute income beyond this
// unit's rent is not Ability, not a criterion and not a row.

// Where a stated fact is dated: the latest edit, else the submission, else now.
const statedAt = (app) => app.profile_updated_at || app.created_at || app.createdAt || null;
const RENT_ON_TIME = Object.freeze({ always: 5, mostly: 3.5, often_late: 1.5 });
const DAMAGE = Object.freeze({ none: 5, minor: 3.5, significant: 1.5 });
const AGAIN = Object.freeze({ yes: 5, no: 2 });
// A month point { m, y } from the reference answers, as the last day of that month.
const monthPoint = (p) => (p && p.y && p.m ? Date.UTC(Number(p.y), Number(p.m), 0) : null);

// The pillar from its dated facts: the recency weighted mean of each fact's contribution. A pillar
// with no fact inside 24 months is not assessed; older facts stay as context.
function pillarFrom(name, facts) {
  const scored = facts.filter((f) => f.weight > 0);
  if (!scored.length) return { name, label: PILLAR_LABEL[name], assessed: false, value: null, facts };
  const value = round1(scored.reduce((s, f) => s + weighted(f.value, f.weight) * (f.share || 1), 0) / scored.reduce((s, f) => s + (f.share || 1), 0));
  return { name, label: PILLAR_LABEL[name], assessed: true, value: clamp(value, 1, 5), facts };
}
// context: the fact is older than 24 months and is shown with its date, never scored.
const fact = (text, value, at, now, { share = 1 } = {}) => { const weight = recencyWeight(at, now); return { text, value, at: at || null, date: shortDate(ts(at)), weight, share, context: weight === 0 && !!at }; };

export function computeFit({ application, listing, verification, confirmations, now = Date.now() } = {}) {
  const app = application || {};
  const l = listing || {};
  const conf = confirmations && typeof confirmations === 'object' ? confirmations : {};
  // An edit after the documents: the report no longer describes the application. The documents
  // read as if none existed and the label reads check docs, until the realtor confirms the employer
  // again. Confirmations dated before the edit do not count; those dated after do.
  const reportObj = Array.isArray(verification) ? verification[0] : verification;
  const editedAt = editedAfterReport(app, reportObj);
  const idConfirmed = confirmationCounts(conf.id, editedAt), employerConfirmed = confirmationCounts(conf.employer, editedAt);
  const edited = !!editedAt && !employerConfirmed;
  const rent = num(l.monthly_rent);
  const v = edited ? readVerification(null) : readVerification(verification, { ignoreName: idConfirmed });
  const raw = readVerification(verification); // the flags read the report as it is, edit or not

  // ── Ability: this unit's rent against the primary applicant's current income, plus savings. ──
  const stated = num(app.annual_income);
  // The income fact is dated by the newest of the statement, the document and the confirmation:
  // a document never makes a current statement older.
  let income = stated; let incomeSource = 'stated'; let incomeAt = statedAt(app);
  if (v.incomeMatched) { incomeSource = 'verified'; if (v.incomeFound != null && v.incomeFound >= 12000) income = v.incomeFound; incomeAt = latest(incomeAt, v.documentDate); }
  if (employerConfirmed) incomeAt = latest(incomeAt, conf.employer.at);
  if (rent <= 0 || income <= 0) return null;
  const monthly = Math.round(income / 12);
  if (monthly <= 0) return null;
  const ratio = Math.round((100 * rent) / monthly);
  const T = capOf(l); // a null cap reads 40
  const abilityValue = interp(ratio / T, [[0, 5], [0.75, 5], [1.0, 4.0], [1.25, 2.5], [1.5, 1.5], [2.0, 1.0]]);
  const incomeWord = employerConfirmed ? 'Current income confirmed' : v.incomeMatched ? 'Current income matches documents' : 'Stated income';
  const abilityFacts = [fact(`${incomeWord}, rent share ${ratio}%`, abilityValue, incomeAt, now)];
  const savingsMonths = v.savings ? Math.floor(v.savings.balance / rent) : 0;
  if (v.savings) abilityFacts.push(fact(`Savings cover ${savingsMonths} month${savingsMonths === 1 ? '' : 's'} of rent`, clamp(3 + savingsMonths * 0.5, 3, 5), v.savings.at, now, { share: 0.5 }));
  const ability = pillarFrom('ability', abilityFacts);

  // ── Truth: how far each fact is confirmed. stated 2, matches documents 4, confirmed at the
  // source 4.5 (the reserved labels, none feeding the number yet), realtor confirmed 5. Always
  // assessed once a fact exists: stated is the lowest level, never an absence. Not recency weighted. ──
  const level = (statedOk, docsOk, confirmedOk) => (confirmedOk ? 5 : docsOk ? 4 : statedOk ? 2 : null);
  const incomeLevel = level(stated > 0, v.incomeMatched, employerConfirmed);
  const employerLevel = level(!!String(app.employer || '').trim(), v.employerMatched, employerConfirmed);
  // Identity on the documents is a docs level fact; once the realtor confirmed the employer it adds
  // nothing, so a document never lowers a confirmed Truth. ID confirmed by the realtor is 5.
  const identityLevel = idConfirmed ? 5 : v.state === 'ok' && v.nameMatched && !employerConfirmed ? 4 : null;
  const truthFacts = [];
  if (incomeLevel != null) truthFacts.push({ ...fact(`Income ${incomeLevel === 5 ? 'confirmed by you' : incomeLevel === 4 ? 'matches documents' : 'stated'}`, incomeLevel, incomeLevel === 5 ? conf.employer.at : incomeLevel === 4 ? v.documentDate : statedAt(app), now, { share: 2 }), weight: 1, context: false });
  if (employerLevel != null) truthFacts.push({ ...fact(`Employer ${employerLevel === 5 ? 'confirmed by you' : employerLevel === 4 ? 'matches documents' : 'stated'}`, employerLevel, employerLevel === 5 ? conf.employer.at : employerLevel === 4 ? v.documentDate : statedAt(app), now), weight: 1, context: false });
  if (identityLevel != null) truthFacts.push({ ...fact(identityLevel === 5 ? 'Identity confirmed by you' : 'Identity matches documents', identityLevel, identityLevel === 5 ? conf.id.at : v.documentDate, now), weight: 1, context: false });
  const truth = pillarFrom('truth', truthFacts);
  if (truth.assessed) truth.value = round1(truth.facts.filter((f) => f.weight > 0).reduce((s, f) => s + f.value * f.share, 0) / truth.facts.filter((f) => f.weight > 0).reduce((s, f) => s + f.share, 0));

  // ── Conduct: reference outcomes the product captured, and tenancy length when a tenancy exists.
  // Every fact dated; the previous landlord's months read one by one, so a late month 30 months
  // ago never enters beside eight clean recent ones. ──
  const conductFacts = [];
  // One entry per answered reference: the store writes one, an older one may ride beside it as a list.
  const refs = (Array.isArray(conf.landlord_reference) ? conf.landlord_reference : [conf.landlord_reference]).filter((x) => x && typeof x === 'object');
  for (const lr of refs) {
    const to = monthPoint(lr.to) ?? ts(lr.at), from = monthPoint(lr.from);
    if (lr.rentOnTime && RENT_ON_TIME[lr.rentOnTime] != null && to != null) {
      const months = from != null && from < to ? Math.min(36, Math.max(1, Math.round(monthsBetween(from, to)))) : 1;
      for (let i = 0; i < months; i++) {
        const at = new Date(to - i * 30.4375 * 86400000).toISOString();
        conductFacts.push(fact(`Rent ${lr.rentOnTime === 'always' ? 'paid on time' : lr.rentOnTime === 'mostly' ? 'mostly on time' : 'often late'}`, RENT_ON_TIME[lr.rentOnTime], at, now, { share: 1 / Math.max(1, Math.min(months, 12)) }));
      }
    }
    if (lr.damage && DAMAGE[lr.damage] != null) conductFacts.push(fact(`Damage: ${lr.damage}`, DAMAGE[lr.damage], to != null ? new Date(to).toISOString() : lr.at, now, { share: 0.5 }));
    if (lr.again && AGAIN[lr.again] != null) conductFacts.push(fact(lr.again === 'yes' ? 'Landlord would rent again' : 'Landlord would not rent again', AGAIN[lr.again], to != null ? new Date(to).toISOString() : lr.at, now, { share: 0.5 }));
  }
  if (conf.landlord && conf.landlord.at !== undefined) conductFacts.push(fact('Previous landlord called by you', 4, conf.landlord.at, now, { share: 0.5 }));
  if (conf.reference && conf.reference.at !== undefined) conductFacts.push(fact('Reference called by you', 4, conf.reference.at, now, { share: 0.5 }));
  const landlordRef = !!(app.prev_landlord_name && String(app.prev_landlord_name).trim());
  const yearsPrev = parseYears(app.years_at_previous);
  if (landlordRef && yearsPrev > 0) conductFacts.push(fact(`Tenancy of ${yearsPrev} year${yearsPrev === 1 ? '' : 's'} stated`, interp(clamp(yearsPrev, 0, 4), [[0, 3], [1, 3.5], [2, 4], [4, 4.5]]), statedAt(app), now, { share: 0.5 }));
  const conduct = pillarFrom('conduct', conductFacts);

  // ── The score, over the pillars present. Ability alone shows no number. ──
  const pillars = [ability, truth, conduct];
  const assessedPillars = pillars.filter((p) => p.assessed);
  const assessed = assessedPillars.length;
  const notAssessed = pillars.filter((p) => !p.assessed).map((p) => p.label);
  const onlyAbility = assessed === 1 && ability.assessed;
  const wsum = assessedPillars.reduce((s, p) => s + PILLAR_WEIGHT[p.name], 0);
  const scoreExact = onlyAbility || !assessed ? null : assessedPillars.reduce((s, p) => s + PILLAR_WEIGHT[p.name] * p.value, 0) / wsum;
  const score = scoreExact == null ? null : round1(scoreExact);

  // The label: what the number rests on. 'check docs' only when the documents contradict the
  // application (income or employer status mismatch, or the name gate failed and no ID was seen).
  const hasReport = v.state !== 'none';
  const contradicted = v.state === 'mismatch' || v.state === 'unclear' || v.incomeMismatch || v.employerMismatch;
  const label = employerConfirmed ? 'verified' : edited ? 'check docs' : !hasReport ? 'stated' : contradicted ? 'check docs' : (v.incomeMatched || v.incomeClose) ? 'docs match' : 'stated';
  if (Object.values(SOURCE_LABELS).includes(label)) throw new Error('a source label is not a Fit label');

  // The flags: shown as check docs items, never subtracted from the number.
  const flags = [];
  if (raw.state === 'mismatch' || raw.state === 'unclear') flags.push({ key: 'identity', text: idConfirmed ? 'Name on documents differed, ID confirmed by you' : 'Name on documents did not match' });
  if (raw.incomeMismatch) flags.push({ key: 'income_mismatch', text: 'Income on documents differs from stated' });
  if (raw.employerMismatch) flags.push({ key: 'employer_mismatch', text: 'Employer on documents differs from stated' });
  for (const field of raw.discrepancies || []) flags.push({ key: 'documents_disagree', text: `${field} differs between documents` });
  if (raw.unreadable > 0) flags.push({ key: 'unreadable', text: `${raw.unreadable} document${raw.unreadable === 1 ? '' : 's'} could not be read` });
  if (editedAt) flags.push({ key: 'edited', text: employerConfirmed ? 'Profile edited after documents, employer confirmed since' : 'Profile edited after documents' });

  // The basis, from named facts only.
  const recentMonths = conductFacts.filter((f) => f.weight > 0 && /^Rent/.test(f.text)).length;
  const basisParts = [`${incomeWord}.`];
  const recentRent = conductFacts.find((f) => f.weight > 0 && /^Rent/.test(f.text));
  if (recentRent) basisParts.push(`${recentRent.text}, last ${recentMonths} month${recentMonths === 1 ? '' : 's'}.`);
  else if (conf.landlord && conf.landlord.at !== undefined && recencyWeight(conf.landlord.at, now) > 0) basisParts.push('Previous landlord called.');
  else if (landlordRef && yearsPrev > 0) basisParts.push(`Tenancy of ${yearsPrev} year${yearsPrev === 1 ? '' : 's'} stated.`);
  const basis = basisParts.join(' ');
  const notAssessedLine = notAssessed.length ? `${notAssessed.join(' and ')} not assessed: ${notAssessed.map((n) => (n === 'Conduct' ? 'no reference outcome or tenancy yet' : 'no current income')).join(', ')}.` : null;
  const incomplete = onlyAbility ? { line: INCOMPLETE_LINE, next: 'Documents or a confirmation would complete it, or a landlord reference.' } : null;
  // A source label (lib/stateLabels.js) names where a fact came from; none is ever a fact or a basis here.
  for (const p of pillars) for (const f of p.facts) if (Object.values(SOURCE_LABELS).includes(f.text)) throw new Error('a source label is not a Fit fact');

  // The realtor's criteria, one entry per rule in force: the rent share cap always (40 when unset),
  // the rest when set. value and rule carry the numbers the landlord report prints. None moves the number.
  const requiresRef = !!l.pref_requires_landlord_reference;
  const requiresEmployer = !!l.pref_requires_employer_verification;
  const employerOk = employerConfirmed || v.employerMatched;
  const criteria = [];
  criteria.push({ key: 'pref_rent_to_income_max_pct', label: 'Rent share', status: ratio <= T ? 'met' : 'missed', detail: `Rent share ${ratio}% · your max ${T}%`, value: ratio, rule: T });
  if (requiresRef) criteria.push({ key: 'pref_requires_landlord_reference', label: 'Landlord reference', status: landlordRef ? 'met' : 'missed', detail: landlordRef ? 'Landlord reference on file' : 'No landlord reference', value: landlordRef });
  if (requiresEmployer) criteria.push({ key: 'pref_requires_employer_verification', label: 'Employer verification', status: employerOk ? 'met' : (v.state === 'none' || v.state === 'unclear') ? 'unverified' : 'missed', detail: employerOk ? 'Employer verified' : 'Employer not verified', value: employerOk, how: employerConfirmed ? 'confirmed' : v.employerMatched ? 'documents' : null });

  const evidence = { hasReport: hasReport || edited, contradicted: contradicted || edited, edited, employerConfirmed, incomeCapped: false };
  return {
    score, scoreExact, label, model: FIT_MODEL,
    assessed, of: pillars.length, notAssessed, notAssessedLine, basis, incomplete,
    pillars, flags,
    // The pillar values under the old names, for the readers that print them (null when not assessed).
    A: ability.assessed ? ability.value : null, E: truth.assessed ? truth.value : null, R: conduct.assessed ? conduct.value : null,
    ratio, incomeUsed: income, incomeSource, savingsMonths, criteria, confirmations: conf,
    parts: { landlordRef, yearsAtPrevious: yearsPrev, recentMonths, refCount: Array.isArray(app.references) ? app.references.length : 0 },
    evidence,
  };
}

// Sort order for dashboard applicant objects ({ application: { fit, created_at } }): scoreExact
// descending, no score last, ties by the earlier applicant first. The one comparator every list uses.
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

// One line, at most eight words, naming what places `lower` below `upper` in the ranking: each
// pillar's gap weighted by its share, two facts at most, none within 0.02. Never the income level.
export function fitReason(lower, upper) {
  if (!lower || !upper || lower.scoreExact == null || upper.scoreExact == null) return null;
  if (Math.abs(upper.scoreExact - lower.scoreExact) < 0.02) return null;
  const le = lower.evidence || {}, ue = upper.evidence || {};
  const pv = (f, name) => { const p = (f.pillars || []).find((x) => x.name === name); return p && p.assessed ? p.value : null; };
  const facts = [];
  const lt = pv(lower, 'truth'), ut = pv(upper, 'truth');
  if (ut != null && (lt == null || ut > lt)) {
    const d = PILLAR_WEIGHT.truth * (ut - (lt == null ? 2 : lt));
    if (!le.hasReport && !le.employerConfirmed) facts.push([STATE_LABELS.new.reason, d]);
    else if (le.edited) facts.push([STATE_LABELS.edited.reason, d]);
    else if (le.contradicted) facts.push([STATE_LABELS.checked.reason, d]);
    else if (ue.employerConfirmed && !le.employerConfirmed) facts.push([STATE_LABELS.matched.reason, d]);
  }
  const la = pv(lower, 'ability'), ua = pv(upper, 'ability');
  if (la != null && ua != null && ua > la && lower.ratio != null && upper.ratio != null && lower.ratio > upper.ratio) facts.push(['higher rent share', PILLAR_WEIGHT.ability * (ua - la)]);
  const lc = pv(lower, 'conduct'), uc = pv(upper, 'conduct');
  if (uc != null && (lc == null || uc > lc)) {
    const d = PILLAR_WEIGHT.conduct * (uc - (lc == null ? 3 : lc));
    if (lc == null) facts.push(['no reference outcome yet', d]);
    else if ((lower.parts || {}).recentMonths < (upper.parts || {}).recentMonths) facts.push(['fewer months on time', d]);
    else if (!(lower.parts || {}).landlordRef && (upper.parts || {}).landlordRef) facts.push(['no landlord reference', d]);
    else facts.push(['weaker reference outcome', d]);
  }
  if (!facts.length) return null;
  facts.sort((x, y) => y[1] - x[1]);
  const line = facts.slice(0, 2).map((f) => f[0]).join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// Convenience for a dashboard applicant object: { ..., application, docVerifications: [active] }.
export function fitFor(applicant, listing) {
  if (!applicant || !applicant.application) return null;
  return computeFit({ application: applicant.application, listing, verification: applicant.docVerifications || null, confirmations: applicant.confirmations || {} });
}

// "Fit 4.4 on 2 of 3", or the incomplete line, for every surface that prints the number. Reads the
// live object and the frozen one (lib/reportSnapshot.js, where incomplete is the line itself).
export function fitLine(fit) {
  if (!fit) return null;
  if (fit.score == null) return fit.incomplete ? (typeof fit.incomplete === 'string' ? fit.incomplete : fit.incomplete.line) : null;
  if (fit.assessed == null || fit.of == null) return `Fit ${Number(fit.score).toFixed(1)}`;
  return `Fit ${Number(fit.score).toFixed(1)} on ${fit.assessed} of ${fit.of}`;
}
// The two lines the landlord report and the PDF carry under the number: the coverage, then the
// basis. Empty for a Fit frozen before v2, which keeps the words it was sent with.
export function fitLines(fit) {
  if (!fit || fit.assessed == null) return [];
  const na = Array.isArray(fit.notAssessed) && fit.notAssessed.length ? `, ${fit.notAssessed.join(' and ')} not assessed` : '';
  if (fit.score == null) return [fitLine(fit)].filter(Boolean);
  return [`${fitLine(fit)}${na}`, fit.basis || null].filter(Boolean);
}
