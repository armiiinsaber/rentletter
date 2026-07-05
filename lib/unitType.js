// lib/unitType.js
// The listing's unit type is stored in the existing `listings.bedrooms` text column so no
// migration is needed: numeric values ('1','2','3','4+') mean bedroom counts, and named
// values ('Studio','Loft','2-storey loft') describe non-standard units (many Toronto lofts
// are two-storey but priced/sized like a 1-bed). formatUnit() renders either cleanly — it only
// appends "bed" to a bare number. Pure, browser + server safe.

export const UNIT_TYPE_OPTIONS = [
  { value: '', label: 'Select unit type…' },
  { value: 'Studio', label: 'Studio' },
  { value: 'Loft', label: 'Loft' },
  { value: '2-storey loft', label: '2-storey loft' },
  { value: '1', label: '1 bed' },
  { value: '2', label: '2 bed' },
  { value: '3', label: '3 bed' },
  { value: '4+', label: '4+ bed' },
];

// Human-readable unit label. Bare number → "N bed"; "4+" → "4+ bed"; named types + any legacy
// free text render as-is (never "Loft bed"). Empty → ''.
export function formatUnit(bedrooms) {
  const b = String(bedrooms == null ? '' : bedrooms).trim();
  if (!b) return '';
  if (/^\d+$/.test(b)) return `${b} bed`;
  if (b === '4+') return '4+ bed';
  return b;
}
