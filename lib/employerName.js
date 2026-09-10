// lib/employerName.js  PURE, no imports. One way to compare two employer names.
//   normalizeEmployer("Live Nation Canada Inc") -> "livenation"
//     lower case, accents removed, everything that is not a letter or digit dropped, and these
//     tokens removed before joining: inc, incorporated, ltd, limited, corp, corporation, co,
//     company, canada, the, llc, llp, plc, group, holdings.
//   employerStatus(stated, found) -> 'match' when the forms are equal, 'close' when one contains
//     the other, 'mismatch' otherwise, 'not_found' when either side is empty.
//   employerRowStatus(row) -> the status of a stored Employer comparison row, recomputed from its
//     stated and found values at read time, so older reports read the same way as new ones.
export const EMPLOYER_NOISE = Object.freeze(['inc', 'incorporated', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'canada', 'the', 'llc', 'llp', 'plc', 'group', 'holdings']);
const NOISE = new Set(EMPLOYER_NOISE);

export function normalizeEmployer(name) {
  return String(name == null ? '' : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !NOISE.has(t))
    .join('');
}

export function employerStatus(stated, found) {
  const a = normalizeEmployer(stated), b = normalizeEmployer(found);
  if (!a || !b) return 'not_found';
  if (a === b) return 'match';
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 'close';
  return 'mismatch';
}

// A stored Employer row: { stated, found, status }. With both values present the status is
// recomputed; without them the stored status stands.
export function employerRowStatus(row) {
  if (!row) return null;
  const s = String(row.stated == null ? '' : row.stated).trim(), f = String(row.found == null ? '' : row.found).trim();
  if (s && f) return employerStatus(s, f);
  return row.status || null;
}
