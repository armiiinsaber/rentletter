// lib/setAsideReasons.js
// Fixed list of OHRC-safe, SCREENABLE reasons a realtor may record when setting an
// applicant aside (de-prioritizing). These map to financial fit, references, tenure,
// occupancy, and completeness — never protected grounds. A set-aside REQUIRES one of
// these codes; it is the defensible paper trail, not a rejection.
export const SET_ASIDE_REASONS = [
  { code: 'income_below_min', label: 'Income below the stated minimum' },
  { code: 'rent_to_income_high', label: 'Rent-to-income above the stated maximum' },
  { code: 'insufficient_tenure', label: 'Employment tenure below the stated minimum' },
  { code: 'no_references', label: 'No references provided' },
  { code: 'no_landlord_reference', label: 'No previous-landlord reference' },
  { code: 'occupants_exceed', label: 'Occupants exceed the unit maximum' },
  { code: 'incomplete_application', label: 'Application incomplete / unverifiable' },
  { code: 'other_screenable', label: 'Other screenable reason (note required)' },
];

export function reasonLabel(code) {
  if (!code) return 'Set aside';
  const m = SET_ASIDE_REASONS.find((r) => r.code === code);
  return m ? m.label : String(code);
}

export const isValidSetAsideReason = (code) => SET_ASIDE_REASONS.some((r) => r.code === code);
