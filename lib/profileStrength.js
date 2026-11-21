// lib/profileStrength.js  PURE, isomorphic. Profile strength: a percent and a list of next steps,
// shown to the tenant on their own profile page and to nobody else. It is answered only by
// pages/api/tenant/personal.js under the tenant's own session; no share payload, realtor view,
// landlord report or application carries it, and nothing in Fit reads it
// (tests/routes/fullTenantProfile.test.mjs).
//   profileStrength({ facts, documentKinds, checkKinds, hasPhoto, hasAbout, prepayMonths, creditShared })
//     -> { percent, done, total, steps: [{ key, title, adds, done, optional }] }
// What it is counted from: which typed details are filled, which kinds of document are stored,
// which facts were read from them, and whether there is a photo and a few words. Never from who
// the tenant is: no age, no study or work status, no citizenship, no origin, no family. The
// suggestion to offer prepaid rent has ONE condition: the tenant has not shared a Canadian
// credit report on any application. It is a suggestion, never counted in the percent.
const has = (v) => v != null && String(v).trim() !== '';

export const STRENGTH_STEPS = Object.freeze([
  Object.freeze({ key: 'details', title: 'Fill in your details', adds: 'Your name, phone, job and income, typed once.' }),
  Object.freeze({ key: 'photo', title: 'Add a photo', adds: 'Puts a face to your name.' }),
  Object.freeze({ key: 'about', title: 'Write about me', adds: 'A few words in your own voice.' }),
  Object.freeze({ key: 'id', title: 'Add your ID', adds: 'Shows your name matches your ID.' }),
  Object.freeze({ key: 'income', title: 'Add proof of income', adds: 'Your income, read from a document.' }),
  Object.freeze({ key: 'employment', title: 'Add an employment letter', adds: 'Your employer, read from a document.' }),
  Object.freeze({ key: 'reference', title: 'Add a landlord reference', adds: 'Someone who can speak to your tenancy.' }),
  Object.freeze({ key: 'prepay', title: 'Offer to prepay rent', adds: 'Your own offer, if you want to make one.', optional: true }),
]);

export function profileStrength({ facts = null, documentKinds = [], checkKinds = [], hasPhoto = false, hasAbout = false, prepayMonths = null, creditShared = false } = {}) {
  const f = facts && typeof facts === 'object' ? facts : {};
  const docs = new Set(documentKinds || []); const checks = new Set(checkKinds || []);
  const done = {
    details: has(f.fullName) && has(f.phone) && has(f.employer) && has(f.jobTitle) && has(f.annualIncome),
    photo: !!hasPhoto,
    about: !!hasAbout,
    id: docs.has('id') || checks.has('identity_name_matches'),
    income: docs.has('income') || checks.has('income_annual_gross'),
    employment: docs.has('employment') || checks.has('employer_name'),
    reference: has(f.previousLandlordName) && has(f.previousLandlordContact),
    prepay: prepayMonths != null,
  };
  // The one condition on the prepay suggestion: no Canadian credit report shared.
  const steps = STRENGTH_STEPS.filter((s) => s.key !== 'prepay' || creditShared !== true || done.prepay).map((s) => ({ key: s.key, title: s.title, adds: s.adds, done: !!done[s.key], optional: !!s.optional }));
  const counted = steps.filter((s) => !s.optional);
  const n = counted.filter((s) => s.done).length;
  return { percent: Math.round((n / counted.length) * 100), done: n, total: counted.length, steps };
}
