// lib/jointIncome.js  PURE. The legacy joint income label on the realtor's card and checklist:
// an application that still carries co_applicant (the old jsonb) shows the household figure
// labelled joint, beside the applicant alone. Display only: nothing here is read by Fit
// (lib/fitScore.js reads the primary's income and nothing of anyone else, docs/fit-v2.md).
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const coIncomeOf = (app) => (app && app.co_applicant ? num(app.co_applicant.annualIncome ?? app.co_applicant.annual_income) : 0);
export const incomeIsJoint = (app) => coIncomeOf(app) > 0;
export const householdIncomeOf = (app) => num(app && app.annual_income) + coIncomeOf(app);
