// lib/applyAge.js  PURE, isomorphic. The age of majority step of the apply page
// (pages/apply/[token].js), in one place so it can be tested without a browser.
//
// The answer is confirmed on THIS visit by a date of birth that makes the applicant of age, or it
// was confirmed before and the stored application says so explicitly (form.ageConfirmed === true,
// from lib/applicationMap.js ageConfirmedOf through lib/pipelinePrefill.js). Nothing else counts:
// a stored row that says null, false or nothing leaves the step open, and the applicant confirms
// it before the review screen or the submit. The date never leaves the device; only the answer does.
import { ageFromDob } from './tenantProfile.js';

const ofAge = (form, minAge) => { const age = ageFromDob(form && form.dateOfBirth); return !!(form && form.dateOfBirth) && age != null && age >= minAge; };
// The step is complete.
export const ageStepValid = (form, minAge) => (!!form && form.ageConfirmed === true) || ofAge(form, minAge);
// What the submission sends as ageConfirmed.
export const ageForSubmit = (form, minAge) => ageStepValid(form, minAge);
// The review screen's line.
export function ageReviewLine(form, minAge) {
  if (form && form.dateOfBirth) return ofAge(form, minAge) ? `Confirmed ${minAge} or over` : 'Under the age of majority';
  return form && form.ageConfirmed === true ? `Confirmed ${minAge} or over` : 'not set';
}
// Where an applicant starts. An invited one with every answer already filled starts on the review
// (the last step), unless the stored age answer is not an explicit yes: then on the step that
// asks it. steps: the page's STEPS ([{ keys }]).
export function startStep(invited, steps) {
  if (!invited || !invited.form) return 1;
  if (invited.form.ageConfirmed === true) return steps.length;
  const at = steps.findIndex((s) => Array.isArray(s.keys) && s.keys.includes('dateOfBirth'));
  return at >= 0 ? at + 1 : 1;
}
