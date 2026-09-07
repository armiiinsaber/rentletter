// lib/pipelinePrefill.js  PURE. The invited person's stored application → the apply form.
// Surviving fields only: nothing about occupants, household or any field the form no longer
// has is read from the row. The apartment fields stay blank: they come from the invite.
import { EMPTY_FORM } from './tenantProfile.js';

const s = (v) => (v == null ? '' : String(v));

export function rowToForm(row) {
  const a = row || {};
  const f = { ...EMPTY_FORM };
  f.email = s(a.email);
  f.fullName = s(a.full_name); f.dateOfBirth = s(a.date_of_birth); f.phone = s(a.phone);
  f.jobTitle = s(a.job_title); f.employer = s(a.employer); f.yearsAtJob = s(a.years_at_job); f.annualIncome = s(a.annual_income);
  f.employmentType = ['full-time', 'part-time', 'contract', 'self-employed'].includes(a.employment_type) ? a.employment_type : '';
  f.businessName = s(a.business_name); f.netIncome = s(a.net_income); f.netIncomeSource = a.net_income_source === 'stated' ? 'stated' : 'estimated';
  f.previousAddress = s(a.prev_address); f.yearsAtPrevious = s(a.years_at_previous);
  f.previousLandlordName = s(a.prev_landlord_name); f.previousLandlordContact = s(a.prev_landlord_contact);
  f.currentRent = s(a.current_rent);
  f.rentalStatus = (f.previousAddress || f.previousLandlordName || f.yearsAtPrevious) ? 'current' : 'none';
  for (const part of f.previousLandlordContact.split(' · ').map((x) => x.trim()).filter(Boolean)) {
    if (/@/.test(part)) f.prevLandlordEmail = part; else if (/\d{3}/.test(part)) f.prevLandlordPhone = part;
  }
  const yrs = parseFloat(f.yearsAtPrevious);
  if (Number.isFinite(yrs) && yrs > 0) { const whole = Math.floor(yrs), months = Math.round((yrs - whole) * 12); f.tenureYears = String(Math.min(whole, 10)); f.tenureMonths = months > 0 && months < 12 ? String(months) : ''; }
  f.moveInDate = /^\d{4}-\d{2}-\d{2}$/.test(s(a.move_in_date)) ? s(a.move_in_date) : '';
  const co = a.co_applicant && typeof a.co_applicant === 'object' ? a.co_applicant : null;
  if (co) { f.hasCoApplicant = true; f.coApplicantName = s(co.name); f.coApplicantAge = s(co.age); f.coApplicantRelationship = s(co.relationship); f.coApplicantJobTitle = s(co.jobTitle); f.coApplicantEmployer = s(co.employer); f.coApplicantIncome = s(co.annualIncome ?? co.annual_income); }
  f.pets = s(a.pets); f.hasPets = !!f.pets;
  const refs = Array.isArray(a.references) ? a.references : [];
  if (refs[0]) { f.reference1Name = s(refs[0].name); f.reference1Relationship = s(refs[0].relationship); f.reference1Contact = s(refs[0].contact); }
  if (refs[1]) { f.reference2Name = s(refs[1].name); f.reference2Relationship = s(refs[1].relationship); f.reference2Contact = s(refs[1].contact); }
  return f;
}

