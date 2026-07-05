// lib/provinces.js
// Province is stored on the realtor's profile (profiles.province) as a 2-letter code
// ('ON' | 'BC'). Province-dependent behaviour keys off it — starting with the tenant
// age-of-majority gate (Ontario 18, British Columbia 19), compliance copy next.
// Pure data + helpers, browser + server safe, no imports.

export const PROVINCES = {
  ON: { code: 'ON', name: 'Ontario', ageOfMajority: 18 },
  BC: { code: 'BC', name: 'British Columbia', ageOfMajority: 19 },
};

// Only the two launch provinces, in display order.
export const PROVINCE_OPTIONS = [
  { value: 'ON', label: 'Ontario' },
  { value: 'BC', label: 'British Columbia' },
];

export const DEFAULT_PROVINCE = 'ON';

// Normalize any stored/entered value to a supported code. Anything unknown/empty
// (including existing accounts with no province set) defaults to Ontario.
export function normalizeProvince(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'BC' || s === 'BRITISH COLUMBIA' || s === 'B.C.') return 'BC';
  if (s === 'ON' || s === 'ONTARIO') return 'ON';
  return DEFAULT_PROVINCE;
}

export function provinceName(v) {
  return PROVINCES[normalizeProvince(v)].name;
}

export function ageOfMajority(v) {
  return PROVINCES[normalizeProvince(v)].ageOfMajority;
}
