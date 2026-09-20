// lib/listingAddress.js
// One address, everywhere. A listing stores its street in `address`, its short label in `name` and
// its unit in `unit` (db/listing-unit.sql, optional). These join the unit into the address so the
// realtor, the tenant and the landlord all read the same line.
//
//   displayAddress(listing)   the address, with ", Unit 4B" appended when a unit is set
//   displayLabel(listing)     the same for the short label, which most surfaces prefer
//
// A listing whose address already carries the unit (typed into one line before the column existed,
// or written as "Unit 4B" by hand) is left exactly as it is: nothing is parsed and nothing is
// duplicated. Pure, no I/O.

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does this line already carry this unit, however the realtor wrote it? Named forms count anywhere
// in the line, because a city often follows the unit; a bare number only counts at the end, so a
// street number is never mistaken for a unit.
export function carriesUnit(line, unit) {
  const base = clean(line);
  const u = clean(unit);
  if (!base || !u) return false;
  const tail = escapeRe(u);
  return new RegExp(`(?:^|[\\s,])(?:unit|suite|ste\\.?|apt\\.?|apartment|#)\\s*${tail}(?![\\w-])`, 'i').test(base)
    || new RegExp(`(?:^|[\\s,])${tail}$`, 'i').test(base);
}

// The address to show, with the unit joined on when it is not already there.
export function joinUnit(line, unit) {
  const base = clean(line);
  const u = clean(unit);
  if (!u) return base;
  if (!base) return `Unit ${u}`;
  if (carriesUnit(base, u)) return base;
  return `${base}, Unit ${u}`;
}

// The listing's address: the street line, or its short label when there is no street, plus the unit.
export const displayAddress = (listing, fallback = '') => joinUnit(listing?.address || listing?.name || '', listing?.unit) || fallback;
// The listing's short label: the name the realtor gave it, or the street, plus the unit.
export const displayLabel = (listing, fallback = '') => joinUnit(listing?.name || listing?.address || '', listing?.unit) || fallback;
