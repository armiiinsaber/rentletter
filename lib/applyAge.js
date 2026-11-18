// lib/applyAge.js  PURE, isomorphic. THE age rule for applying to rent, in one place: the apply
// page (pages/apply/[token].js), the party form (pages/party/[token].js) and both submit routes
// (pages/api/generate.js, pages/api/party/self.js) take every age decision from here, so the page
// and the server can never disagree.
//
// Who may apply, by the listing's province (the owning realtor's, lib/provinces.js) and role:
//   Ontario, the applicant or a co applicant   18 or over, or 16 or 17 and withdrawn from parental
//                                              control (Human Rights Code s. 4). One plain yes or
//                                              no question, asked only when the date of birth
//                                              makes them 16 or 17; nothing further about why.
//   British Columbia, the applicant or a co    19 or over, the age of majority.
//   applicant
//   A guarantor, in either province            the age of majority (18, 19): a guarantor is not
//                                              renting the home, so s. 4 does not apply.
// The date of birth never leaves the device. What travels is the answer: ageConfirmed (the rule is
// met) and, for the applicant, withdrawnFromParentalControl when s. 4 is the basis. The server
// cannot see the date, so its check is that the request carries an explicit yes (submittedAge).
// Neither answer, nor the age, is ever shown to a realtor, a landlord or in a report.
//
// A yes stored on an earlier application or the tenant's profile (form.ageConfirmed === true, from
// lib/applicationMap.js ageConfirmedOf through lib/pipelinePrefill.js or the profile's facts)
// records no province. Any yes meets Ontario's rule, so in Ontario it counts and the step is not
// asked again; in British Columbia it may have come from someone under 19, so the date is asked on
// this visit. A party never has a stored yes.
import { ageFromDob } from './tenantProfile.js';
import { normalizeProvince, ageOfMajority, provinceName } from './provinces.js';

export const AGE_ROLE = Object.freeze({ APPLICANT: 'applicant', CO_APPLICANT: 'co_applicant', GUARANTOR: 'guarantor' });
// Human Rights Code s. 4: the youngest age at which withdrawal from parental control counts.
export const S4_MIN_AGE = 16;
// The server's answer to a request without an explicit yes.
export const AGE_NOT_CONFIRMED = 'Confirm your age with your date of birth, then submit again.';
// What the tenant's own review shows for any yes: from a date of birth, from s. 4 or stored, in
// either province. It never says which.
export const AGE_MET = 'Age requirement met';
// What a British Columbia applicant or co applicant under 19 is told.
export const BC_UNDER_AGE = 'Applications in British Columbia are open to people 19 or older.';

// The rule for one person on one listing. role: an AGE_ROLE value, or a party role
// (lib/application-state.js PARTY_ROLE); anything other than a guarantor rents the home.
export function ageRuleFor(province, role = AGE_ROLE.APPLICANT) {
  const p = normalizeProvince(province);
  const r = role === AGE_ROLE.GUARANTOR ? AGE_ROLE.GUARANTOR : role === AGE_ROLE.CO_APPLICANT ? AGE_ROLE.CO_APPLICANT : AGE_ROLE.APPLICANT;
  const renting = r !== AGE_ROLE.GUARANTOR;
  return Object.freeze({ province: p, role: r, majority: ageOfMajority(p), s4: p === 'ON' && renting, storedYesCounts: p === 'ON' && renting });
}

// What the date of birth says, on this device only:
//   'of_age'  at or over the age of majority
//   's4'      Ontario, renting, 16 or 17: the rule is met only with a yes to the s. 4 question
//   'under'   too young under this rule (or a date that is not a date)
//   null      no date entered on this visit
export function ageBand(form, rule) {
  const dob = form && form.dateOfBirth;
  if (!dob) return null;
  const age = ageFromDob(dob);
  if (age == null) return 'under';
  if (age >= rule.majority) return 'of_age';
  if (rule.s4 && age >= S4_MIN_AGE) return 's4';
  return 'under';
}
// The s. 4 question is shown.
export const asksWithdrawn = (form, rule) => ageBand(form, rule) === 's4';

// The step is complete: the date entered on this visit decides; without one, a stored yes, where
// it counts.
export function ageStepValid(form, rule) {
  const band = ageBand(form, rule);
  if (band === 'of_age') return true;
  if (band === 's4') return form.withdrawnFromParentalControl === true;
  if (band === 'under') return false;
  return rule.storedYesCounts && !!form && form.ageConfirmed === true;
}
// What the submission sends as ageConfirmed.
export const ageForSubmit = (form, rule) => ageStepValid(form, rule);
// What the submission sends as withdrawnFromParentalControl: true when s. 4 is the basis on this
// visit, nothing otherwise (an answer left over from an earlier date never travels).
export const withdrawnForSubmit = (form, rule) => (ageBand(form, rule) === 's4' && form.withdrawnFromParentalControl === true ? true : undefined);

// The hint under the date of birth.
export function ageHint(rule) {
  const where = provinceName(rule.province);
  if (rule.role === AGE_ROLE.GUARANTOR) return `A guarantor must be ${rule.majority} or over (${where} age of majority). The date stays on this device.`;
  const act = rule.role === AGE_ROLE.APPLICANT ? 'to apply on your own' : 'to apply';
  if (rule.s4) return `You must be ${rule.majority} or over ${act} in ${where}, or 16 or 17 if you have withdrawn from parental control. The date stays on this device.`;
  return `You must be ${rule.majority} or over (${where} age of majority) ${act}. The date stays on this device.`;
}
// The s. 4 question, as asked.
export const WITHDRAWN_QUESTION = 'Have you withdrawn from parental control?';

// What is wrong with the step, or '' when it is complete.
export function ageProblem(form, rule) {
  if (ageStepValid(form, rule)) return '';
  const band = ageBand(form, rule);
  const where = provinceName(rule.province);
  if (band === null) return 'Date of birth is required.';
  if (band === 's4') return form.withdrawnFromParentalControl === false ? `In ${where} you can apply at 16 or 17 only if you have withdrawn from parental control.` : 'Answer the question below.';
  if (rule.role === AGE_ROLE.GUARANTOR) return `A guarantor must be at least ${rule.majority} (the age of majority in ${where}).`;
  if (rule.s4) return `In ${where} you must be at least ${S4_MIN_AGE} to apply, and ${rule.majority} unless you have withdrawn from parental control.`;
  if (rule.province === 'BC') return BC_UNDER_AGE;
  return `You must be at least ${rule.majority} (the age of majority in ${where}) to apply.`;
}

// The review screen's line, shown to the tenant alone: AGE_MET for any yes, never which kind.
export function ageReviewLine(form, rule) {
  if (ageStepValid(form, rule)) return AGE_MET;
  return ageBand(form, rule) === null ? 'not set' : 'Under the age of majority';
}

// Where an applicant starts. An invited one with every answer already filled starts on the review
// (the last step), unless the stored age answer is not an explicit yes, or does not count in this
// province: then on the step that asks it. steps: the page's STEPS ([{ keys }]). Without a rule
// (the first render, before the invite says the province) a stored yes counts, as in Ontario.
export function startStep(invited, steps, rule = null) {
  if (!invited || !invited.form) return 1;
  if (invited.form.ageConfirmed === true && (!rule || rule.storedYesCounts)) return steps.length;
  const at = steps.findIndex((s) => Array.isArray(s.keys) && s.keys.includes('dateOfBirth'));
  return at >= 0 ? at + 1 : 1;
}

// THE server's check (pages/api/generate.js, pages/api/party/self.js). The request carries the
// page's answer, never the date: an explicit ageConfirmed === true or it is refused. The s. 4
// answer is kept only where s. 4 applies (Ontario, renting); anywhere else it is no basis and is
// dropped. Returns { ok: true, withdrawnFromParentalControl: true | undefined } or
// { ok: false, error }.
export function submittedAge(body, rule) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.ageConfirmed !== true) return { ok: false, error: AGE_NOT_CONFIRMED };
  return { ok: true, withdrawnFromParentalControl: rule.s4 && b.withdrawnFromParentalControl === true ? true : undefined };
}
