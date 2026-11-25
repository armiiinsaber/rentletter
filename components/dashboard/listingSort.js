// components/dashboard/listingSort.js  PURE, browser and tests.
// The order of the realtor's listings on the dashboard (components/dashboard/HomeView.js): the
// column headings of the table at 1024 and wider (components/dashboard/ListingsTable.js), the Sort
// sheet above the cards under 1024 and the Sort menu beside the Active and Archived switch; and the
// search that shows past eight listings. Everything works on the rows the dashboard already builds
// (components/dashboard/homeData.js rowOf); nothing here reads or asks for anything.
//   SORT_CHOICES               the eight orders the sheet and the menu offer
//   DEFAULT_SORT               Latest activity, newest first
//   sortRows(rows, sort)       a sorted copy. Ties go by latest activity, then by address, then by
//                              id, so the order never changes between renders. A row with no
//                              value for the order (no move in date, no applicants) goes last
//                              whichever way the order runs.
//   orderIds(rows, sort), arrange(rows, ids), rowSet(rows)   an order held while the rows' data
//                              changes, set again when the order or the set of rows does
//   headingSort(sort, column)  the order a click on a column heading gives: its first direction,
//                              or the same column the other way
//   sortName(sort), sameSort(a, b), choicesFor(sort)
//   attentionOf(row)           Needs attention first: { rank, n }, rank 1 the most urgent, from the
//                              row's next step (components/dashboard/board.js)
//   addressParts(text)         { street, number, suffix, unit, rest } for the address order
//   bedsValue(bedrooms)        a number for the beds order, null when it says none
//   readSort(storage, shelf), writeSort(storage, shelf, sort)   the order kept on this device,
//                              one for Active and one for Archived
//   SEARCH_FROM, matchRows(rows, query)   the search: from nine listings in the view, by address
//                              and unit, any case, every word typed
import { displayLabel } from '../../lib/listingAddress.js';

const collator = new Intl.Collator('en-CA', { sensitivity: 'base', numeric: true });
const time = (iso) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };
const num = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The address as a realtor reads it: the street, then the number on it, then the unit. A unit
// is named ("Unit 4301", "Suite 200", "Apt 3", "#12") anywhere in the line, or written before the
// street number ("4301-888 Bay St"). A line with no number (a name the realtor gave the listing)
// is its own street.
export function addressParts(text) {
  let s = String(text == null ? '' : text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let unit = '';
  const named = s.match(/(?:^|[\s,])(?:(?:unit|suite|ste|apt|apartment|penthouse|ph)(?:\.\s*|\s+)|#\s*)([a-z0-9][\w-]*)/);
  if (named) { unit = named[1]; s = `${s.slice(0, named.index)} ${s.slice(named.index + named[0].length)}`; }
  const lead = !unit && s.match(/^([a-z0-9]+)\s*-\s*(\d+[a-z]?)\b\s*(.*)$/);
  if (lead) { unit = lead[1]; s = `${lead[2]} ${lead[3]}`; }
  s = s.replace(/\s*,(\s*,)+/g, ',').replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  const m = s.match(/^(\d+)([a-z]?)\b[\s,]*(.*)$/);
  const rest = m ? m[3] : s;
  return { street: rest.split(',')[0].trim(), number: m ? Number(m[1]) : null, suffix: m ? m[2] : '', unit, rest };
}
function compareAddress(a, b) {
  return collator.compare(a.street, b.street)
    || (a.number == null ? (b.number == null ? 0 : 1) : b.number == null ? -1 : num(a.number, b.number))
    || collator.compare(a.suffix, b.suffix)
    || (a.unit ? (b.unit ? collator.compare(a.unit, b.unit) : 1) : b.unit ? -1 : 0)
    || collator.compare(a.rest, b.rest);
}
const placeOf = (row) => addressParts(displayLabel(row, ''));

// The unit type kept in listings.bedrooms (lib/unitType.js): a count, "4+", Studio, Loft or a
// two storey loft, or older free text such as "1+den". Studio first, then the lofts, then by count.
export function bedsValue(bedrooms) {
  const b = String(bedrooms == null ? '' : bedrooms).trim().toLowerCase();
  if (!b) return null;
  if (/^(studio|bachelor)/.test(b)) return 0;
  if (b === 'loft') return 0.5;
  if (/loft/.test(b)) return 0.75;
  const m = b.match(/^(\d+)\s*(\+\s*den|\+)?/);
  return m ? Number(m[1]) + (m[2] && /den/.test(m[2]) ? 0.5 : 0) : null;
}

// Needs attention first: the order of the cards' one main action (components/dashboard/board.js,
// the same next step the card, the tiles and Needs you read), counted from the row's next step:
//   1 a report ready to send
//   2 documents to check
//   3 applicants to ask for documents
//   4 an employer to call
//   5 anything else (something that opens the listing, or nothing waiting; rented or closed)
// Within a rank the listing with more applicants at that step comes first.
const ATTENTION = { send: 1, check: 2, ask: 3, call: 4 };
export function attentionOf(row) {
  const next = row && row.next;
  if (!row || row.open === false || !next || !ATTENTION[next.kind]) return { rank: 5, n: 0 };
  return { rank: ATTENTION[next.kind], n: Number(next.n) || 0 };
}

// Each order: the value it reads from a row (null for none) and how two values compare. first:
// the direction of a first click on the column heading.
const REPORT_RANK = { not_sent: 0, sent: 1, closed: 2 };
const ORDERS = {
  address: { first: 'asc', value: placeOf, compare: compareAddress },
  rent: { first: 'desc', value: (r) => (Number(r.rent) > 0 ? Number(r.rent) : null), compare: num },
  beds: { first: 'desc', value: (r) => bedsValue(r.bedrooms), compare: num },
  move: { first: 'asc', value: (r) => time(r.moveIn), compare: num },
  applicants: { first: 'desc', value: (r) => (Number(r.applicants) > 0 ? Number(r.applicants) : null), compare: num },
  newest: { first: 'desc', value: (r) => (r.newest ? time(r.newest.at) : null), compare: num },
  // With no applicant there is nothing to count as verified.
  verified: { first: 'desc', value: (r) => (Number(r.applicants) > 0 ? Number(r.verified) || 0 : null), compare: num },
  // With no applicant there is no report to send ("none").
  report: { first: 'asc', value: (r) => (r.report in REPORT_RANK ? REPORT_RANK[r.report] : null), compare: num },
  when: { first: 'desc', value: (r) => time(r.lastAt), compare: num },
  // The two orders no column holds, each one way only.
  created: { first: 'desc', only: 'desc', value: (r) => time(r.createdAt), compare: num },
  attention: { first: 'asc', only: 'asc', value: attentionOf, compare: (a, b) => num(a.rank, b.rank) || num(b.n, a.n) },
};
export const SORT_KEYS = Object.freeze(Object.keys(ORDERS));
// The columns of the table a heading sorts (components/dashboard/ListingsTable.js COLUMNS keys).
export const COLUMN_KEYS = Object.freeze(['address', 'rent', 'beds', 'move', 'applicants', 'newest', 'verified', 'report', 'when']);

export const DEFAULT_SORT = Object.freeze({ key: 'when', dir: 'desc' });
export function validSort(sort) {
  const o = sort && ORDERS[sort.key];
  if (!o || !Object.prototype.hasOwnProperty.call(ORDERS, sort.key)) return DEFAULT_SORT;
  const dir = o.only || (sort.dir === 'asc' || sort.dir === 'desc' ? sort.dir : o.first);
  return { key: sort.key, dir };
}
export const sameSort = (a, b) => !!a && !!b && a.key === b.key && validSort(a).dir === validSort(b).dir;

// Latest activity first, then the address, then the id: the same order on every render.
function byWhen(a, b) {
  const x = time(a.lastAt); const y = time(b.lastAt);
  return x == null ? (y == null ? 0 : 1) : y == null ? -1 : num(y, x);
}
function byPlace(a, b) {
  const x = placeOf(a); const y = placeOf(b);
  return x == null ? (y == null ? 0 : 1) : y == null ? -1 : compareAddress(x, y);
}
const tie = (a, b) => byWhen(a, b) || byPlace(a, b) || String(a.id).localeCompare(String(b.id));

export function sortRows(rows, sort) {
  const s = validSort(sort); const o = ORDERS[s.key]; const sign = s.dir === 'asc' ? 1 : -1;
  return (rows || []).map((r) => ({ r, v: o.value(r) })).sort((a, b) => {
    const am = a.v == null; const bm = b.v == null;
    if (am !== bm) return am ? 1 : -1;
    return (am ? 0 : sign * o.compare(a.v, b.v)) || tie(a.r, b.r);
  }).map((x) => x.r);
}

// The rows in an order already set (ids, as sortRows gave them): the dashboard holds an order
// while the rows' data changes under it (the server's answer taking over a screen seen before,
// fresh signals), so no card moves under a finger; a row the order does not hold goes last.
export const orderIds = (rows, sort) => sortRows(rows, sort).map((r) => r.id);
export function arrange(rows, ids) {
  const at = new Map((ids || []).map((id, i) => [id, i]));
  const held = (rows || []).filter((r) => at.has(r.id)).sort((a, b) => at.get(a.id) - at.get(b.id));
  return [...held, ...(rows || []).filter((r) => !at.has(r.id))];
}
// The set of rows, whatever their order: a listing that comes or goes sets the order again.
export const rowSet = (rows) => (rows || []).map((r) => String(r.id)).sort().join('|');

export function headingSort(sort, column) {
  const o = ORDERS[column];
  if (!o) return validSort(sort);
  const s = validSort(sort);
  return s.key === column ? { key: column, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: column, dir: o.first };
}

// The orders the sheet and the menu offer, in this order.
export const SORT_CHOICES = Object.freeze([
  { id: 'latest', label: 'Latest activity', key: 'when', dir: 'desc' },
  { id: 'newest', label: 'Newest listing', key: 'created', dir: 'desc' },
  { id: 'rent-high', label: 'Rent high to low', key: 'rent', dir: 'desc' },
  { id: 'rent-low', label: 'Rent low to high', key: 'rent', dir: 'asc' },
  { id: 'applicants', label: 'Most applicants', key: 'applicants', dir: 'desc' },
  { id: 'attention', label: 'Needs attention first', key: 'attention', dir: 'asc' },
  { id: 'move', label: 'Move in date soonest', key: 'move', dir: 'asc' },
  { id: 'address', label: 'Address A to Z', key: 'address', dir: 'asc' },
].map((c) => Object.freeze(c)));
// The words for the orders a column heading gives that the choices do not hold.
const OTHER_NAMES = {
  'address:desc': 'Address Z to A',
  'beds:desc': 'Most bedrooms', 'beds:asc': 'Fewest bedrooms',
  'move:desc': 'Move in date latest',
  'applicants:asc': 'Fewest applicants',
  'newest:desc': 'Newest applicant, latest first', 'newest:asc': 'Newest applicant, earliest first',
  'verified:desc': 'Most verified', 'verified:asc': 'Fewest verified',
  'report:asc': 'Report not sent first', 'report:desc': 'Report sent first',
  'when:asc': 'Oldest activity',
};
export function sortName(sort) {
  const s = validSort(sort);
  const choice = SORT_CHOICES.find((c) => sameSort(c, s));
  return choice ? choice.label : OTHER_NAMES[`${s.key}:${s.dir}`] || SORT_CHOICES[0].label;
}
// The choices, one of them the current order: an order set by a column heading that the eight do
// not hold comes first, by its name.
export function choicesFor(sort) {
  const s = validSort(sort);
  return SORT_CHOICES.some((c) => sameSort(c, s)) ? SORT_CHOICES : [{ id: 'column', label: sortName(s), key: s.key, dir: s.dir }, ...SORT_CHOICES];
}

// The order kept on this device, one for each shelf. Storage that is missing, full, blocked or
// holding something else gives the default.
export const SORT_STORE = Object.freeze({ active: 'rl-listing-sort-active', archived: 'rl-listing-sort-archived' });
export function readSort(storage, shelf) {
  try {
    const raw = storage ? storage.getItem(SORT_STORE[shelf] || SORT_STORE.active) : null;
    return raw ? validSort(JSON.parse(raw)) : DEFAULT_SORT;
  } catch (e) { return DEFAULT_SORT; }
}
export function writeSort(storage, shelf, sort) {
  try { if (!storage) return false; const s = validSort(sort); storage.setItem(SORT_STORE[shelf] || SORT_STORE.active, JSON.stringify(s)); return true; } catch (e) { return false; }
}

// The search shows once the view holds more than eight listings.
export const SEARCH_FROM = 9;
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const searchWords = (query) => fold(query).split(/[\s,]+/).filter(Boolean);
// The rows whose address or unit holds every word typed, any case; all of them for no words.
export function matchRows(rows, query) {
  const words = searchWords(query);
  if (!words.length) return rows || [];
  return (rows || []).filter((r) => {
    const text = fold([displayLabel(r, ''), r.address, r.unit ? `unit ${r.unit}` : ''].join(' '));
    return words.every((w) => text.includes(w));
  });
}
