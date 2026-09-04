// lib/reportSnapshot.js  PURE. The frozen landlord report.
//   buildSnapshot({ listing, applicants, profile, now }) -> payload
//     listing: address, rent, bedrooms, the five criteria as set; realtor: name, brokerage, phone,
//     email, logo url, the signature line; applicants (active only, scoreExact order) with rank,
//     first and last name, Fit score and label, the four numbers, landlord reference on file,
//     confirmations (dates and the realtor's name), the reason line and the fact sentence; counts;
//     generatedAt. linkId rides along for the realtor's side and is stripped before the page.
//   forLandlordPage(payload) -> the same without linkId.
//   confirmedSummary(confirmations) -> "Confirmed by Sarah: employer, previous landlord · Sep 2"
//   answerLine(answer) -> "wants to meet" | "not for me"
import { compareFit, fitReason, parseYears } from './fitScore.js';
import { isWithdrawn, isSetAside } from './listingApplicantsVocabulary.js';
import { signingName } from './reportSignature.js';
import { formatUnit } from './unitType.js';
import { reportSentence } from './reportSentence.js';

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_DAYS = 90;

export function confirmedSummary(confirmations) {
  const c = confirmations && typeof confirmations === 'object' ? confirmations : {};
  const LABELS = [['id', 'ID'], ['employer', 'employer'], ['landlord', 'previous landlord'], ['reference', 'a reference']];
  const present = LABELS.filter(([k]) => c[k] && typeof c[k] === 'object');
  if (!present.length) return null;
  const by = present.map(([k]) => c[k].by).find(Boolean) || 'the realtor';
  const latest = present.map(([k]) => c[k].at).filter(Boolean).sort().pop();
  const when = latest ? new Date(latest).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : null;
  return `Confirmed by ${by}: ${present.map(([, l]) => l).join(', ')}${when ? ` · ${when}` : ''}`;
}

const moneyK = (n) => `$${Math.round(Number(n) / 1000)}k`;
export function criteriaLine(l) {
  return [
    Number(l?.pref_min_annual_income) > 0 ? `min ${moneyK(l.pref_min_annual_income)}` : null,
    Number(l?.pref_rent_to_income_max_pct) > 0 ? `max ${Number(l.pref_rent_to_income_max_pct)}% rent share` : null,
    Number(l?.pref_min_years_at_job) > 0 ? `${Number(l.pref_min_years_at_job)} yr${Number(l.pref_min_years_at_job) === 1 ? '' : 's'} at job` : null,
    l?.pref_requires_landlord_reference ? 'landlord reference' : null,
    l?.pref_requires_employer_verification ? 'employer verification' : null,
  ].filter(Boolean).join(' · ');
}

const splitName = (full) => { const w = String(full || '').trim().split(/\s+/).filter(Boolean); return { firstName: w[0] || 'Applicant', lastName: w.slice(1).join(' ') }; };
// The realtor's own confirmations read "You" on the dashboard; the landlord sees the realtor's name.
const pickConf = (c, who) => { const out = {}; for (const k of ['id', 'employer', 'landlord', 'reference']) if (c && c[k] && typeof c[k] === 'object') out[k] = { at: c[k].at || null, by: c[k].by === 'You' || !c[k].by ? who : c[k].by }; return out; };

export function buildSnapshot({ listing, applicants, profile, now = new Date() } = {}) {
  const l = listing || {};
  const active = (applicants || []).filter((a) => a && !isWithdrawn(a) && !isSetAside(a)).sort(compareFit);
  const p0 = profile || {};
  const who = signingName(p0, 'Your realtor');
  const rows = active.map((a, i) => {
    const app = a.application || {};
    const fit = app.fit || null;
    const prevFit = i > 0 ? (active[i - 1].application || {}).fit || null : null;
    const years = parseYears(app.years_at_job);
    const ratio = fit && fit.ratio != null ? fit.ratio : (app.rent_to_income_ratio != null ? Number(app.rent_to_income_ratio) : null);
    const landlordReference = !!(app.prev_landlord_name && String(app.prev_landlord_name).trim());
    const { firstName, lastName } = splitName(app.full_name);
    return {
      rank: i + 1, firstName, lastName, name: `${firstName}${lastName ? ` ${lastName}` : ''}`,
      fit: fit ? { score: fit.score, label: fit.label } : null,
      jobTitle: app.job_title || null, employer: app.employer || null,
      numbers: { annualIncome: fit && fit.incomeUsed ? fit.incomeUsed : (Number(app.annual_income) || null), rentSharePct: ratio, yearsAtJob: years || null, references: Array.isArray(app.references) ? app.references.length : 0 },
      landlordReference,
      confirmations: pickConf(a.confirmations, who),
      confirmedLine: confirmedSummary(pickConf(a.confirmations, who)),
      reason: i > 0 ? fitReason(fit, prevFit) : null,
      sentence: reportSentence({ jobTitle: app.job_title, employer: app.employer, yearsAtJob: years, rentSharePct: ratio, landlordReference }),
      linkId: a.linkId || null,
    };
  });
  const p = profile || {};
  const name = signingName(p, 'Your realtor');
  const brokerage = String(p.brokerage || '').slice(0, 120) || null;
  const phone = String(p.phone || '').slice(0, 40) || null;
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date(now).toISOString(),
    listing: {
      address: l.address || l.name || null, name: l.name || l.address || null, rent: l.monthly_rent != null ? Number(l.monthly_rent) : null, bedrooms: l.bedrooms || null, bedroomsLabel: formatUnit(l.bedrooms) || null,
      criteria: { minAnnualIncome: Number(l.pref_min_annual_income) > 0 ? Number(l.pref_min_annual_income) : null, maxRentSharePct: Number(l.pref_rent_to_income_max_pct) > 0 ? Number(l.pref_rent_to_income_max_pct) : null, minYearsAtJob: Number(l.pref_min_years_at_job) > 0 ? Number(l.pref_min_years_at_job) : null, landlordReference: !!l.pref_requires_landlord_reference, employerVerification: !!l.pref_requires_employer_verification },
      criteriaLine: criteriaLine(l),
      landlordName: l.landlord_name || null,
    },
    realtor: { name, brokerage, phone, email: p.email || null, logoUrl: p.logo_url || null, signature: [name, brokerage, phone].filter(Boolean).join(' · '), province: p.province || null, brandColor: p.brand_color || null, brandPalette: p.brand_palette && typeof p.brand_palette === 'object' ? p.brand_palette : null, brandFonts: p.brand_fonts && typeof p.brand_fonts === 'object' ? p.brand_fonts : null },
    applicants: rows,
    counts: { applicants: rows.length, verified: rows.filter((r) => r.fit && r.fit.label === 'verified').length },
  };
}

// The page's copy of the payload: the realtor side mapping (linkId) never reaches the landlord.
export function forLandlordPage(payload) {
  if (!payload) return null;
  return { ...payload, applicants: (payload.applicants || []).map(({ linkId, ...rest }) => rest) };
}

export const answerLine = (answer) => (answer === 'meet' ? 'wants to meet' : answer === 'pass' ? 'not for me' : null);
export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');

// The one line under "Present to landlord" for the latest snapshot.
export function snapshotLine(meta) {
  if (!meta || !meta.sentAt) return null;
  const answers = meta.answers && typeof meta.answers === 'object' ? Object.keys(meta.answers).length : 0;
  const opened = Number(meta.openedCount) || 0;
  return `Sent to ${meta.sentToName || 'the landlord'} · ${shortDate(meta.sentAt)} · opened ${opened} time${opened === 1 ? '' : 's'} · ${answers} answer${answers === 1 ? '' : 's'}`;
}
