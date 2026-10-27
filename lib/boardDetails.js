// lib/boardDetails.js  PURE, isomorphic. The listing fields the board's forms ask for and the
// realtor types once here (db/012-board-details.sql, docs/form-data.md): the MLS number, the two
// brokerages and the commission, possession and term, the utilities, parking, locker, furnished,
// and the deposits the province allows. Every field is optional. None of them is a criterion,
// none is read by Fit (lib/fitScore.js reads none of these columns), and none goes to a tenant.
//
//   BOARD_FIELDS                 the listing columns, in the order the sheet shows them
//   PROFILE_BOARD_FIELDS         the profile columns beside brokerage and license_number
//   BOARD_OPTIONS                the boards a realtor can pick on the profile
//   depositRules(province)       which deposits the province allows and their caps
//   normalizeBoardDetails(body, { province, monthlyRent })  -> { values, error }
//       the typed values cleaned for the row, or one sentence saying what the province refuses
//   boardRows(listing, province) -> [[label, value]] for the listing page's Details fold
import { normalizeProvince } from './provinces.js';

export const BOARD_FIELDS = Object.freeze([
  'mls_number',
  'listing_brokerage_name', 'listing_brokerage_address', 'listing_brokerage_phone',
  'coop_brokerage_name', 'coop_commission',
  'possession_date', 'lease_term_months',
  'utilities_heat', 'utilities_hydro', 'utilities_water',
  'parking_spaces', 'locker', 'furnished',
  'deposit_last_month', 'deposit_key', 'deposit_security', 'deposit_pet',
]);
export const PROFILE_BOARD_FIELDS = Object.freeze(['brokerage_address', 'board']);
export const BOARD_OPTIONS = Object.freeze([
  { value: 'trreb', label: 'TRREB' },
  { value: 'mississauga', label: 'Mississauga' },
  { value: 'hamilton', label: 'Hamilton' },
  { value: 'ottawa', label: 'Ottawa' },
  { value: 'greater_vancouver', label: 'Greater Vancouver' },
  { value: 'fraser_valley', label: 'Fraser Valley' },
  { value: 'other', label: 'Other' },
]);
export const boardLabel = (value) => (BOARD_OPTIONS.find((o) => o.value === value) || {}).label || null;

const TEXT = Object.freeze({ mls_number: 40, listing_brokerage_name: 160, listing_brokerage_address: 200, listing_brokerage_phone: 40, coop_brokerage_name: 160, coop_commission: 200, locker: 60 });
const BOOL = Object.freeze(['utilities_heat', 'utilities_hydro', 'utilities_water']);
const INT = Object.freeze(['lease_term_months', 'parking_spaces', 'deposit_last_month', 'deposit_key', 'deposit_security', 'deposit_pet']);

// Ontario (Residential Tenancies Act, s. 105 and 106): a rent deposit of at most one month's
// rent, applied to the last month, and a refundable key deposit, nothing else. British Columbia
// (Residential Tenancy Act, s. 19): a security deposit and a pet damage deposit, each at most
// half a month's rent. The sheet shows the province's deposits alone, and the write refuses more.
export function depositRules(province) {
  const p = normalizeProvince(province);
  if (p === 'BC') {
    return {
      province: p,
      fields: [
        { key: 'deposit_security', label: 'Security deposit', cap: 'half', note: 'At most half a month’s rent.' },
        { key: 'deposit_pet', label: 'Pet damage deposit', cap: 'half', note: 'At most half a month’s rent.' },
      ],
      cleared: ['deposit_last_month', 'deposit_key'],
      line: 'In British Columbia a security deposit and a pet damage deposit may each be at most half a month’s rent.',
    };
  }
  return {
    province: p,
    fields: [
      { key: 'deposit_last_month', label: 'Last month’s rent deposit', cap: 'month', note: 'At most one month’s rent, applied to the last month.' },
      { key: 'deposit_key', label: 'Key deposit', cap: null, note: 'Refundable, no more than the cost of replacing the keys.' },
    ],
    cleared: ['deposit_security', 'deposit_pet'],
    line: 'In Ontario only a rent deposit of at most one month’s rent and a refundable key deposit may be taken.',
  };
}

const intOrNull = (v) => { if (v === '' || v == null) return null; const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const textOrNull = (v, n) => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, n) : null; };
const dateOrNull = (v) => { const s = v == null ? '' : String(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const boolOrNull = (v) => (v === true || v === 'yes' || v === 'true' ? true : v === false || v === 'no' || v === 'false' ? false : null);

// The cap a deposit must not exceed, in dollars, or null when the province sets none in dollars.
export function depositCap(cap, monthlyRent) {
  const rent = Number(monthlyRent);
  if (!Number.isFinite(rent) || rent <= 0) return null;
  if (cap === 'half') return Math.floor(rent / 2);
  if (cap === 'month') return rent;
  return null;
}

// Only the board fields present in body are returned, cleaned. A deposit the province does not
// allow is cleared; one above its cap is refused with the sentence the sheet shows too.
export function normalizeBoardDetails(body, { province, monthlyRent } = {}) {
  const src = body || {};
  const values = {};
  for (const k of BOARD_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (k in TEXT) values[k] = textOrNull(v, TEXT[k]);
    else if (BOOL.includes(k)) values[k] = v === true || v === 'true' || v === 'yes';
    else if (k === 'furnished') values[k] = boolOrNull(v);
    else if (k === 'possession_date') values[k] = dateOrNull(v);
    else if (INT.includes(k)) { const n = intOrNull(v); values[k] = n == null || n < 0 ? null : n; }
  }
  const rules = depositRules(province);
  // Any deposit written clears the other province's deposits, so a row never carries both sets.
  if (rules.fields.some((f) => f.key in values) || rules.cleared.some((c) => c in values)) for (const k of rules.cleared) values[k] = null;
  for (const f of rules.fields) {
    if (!(f.key in values) || values[f.key] == null) continue;
    const cap = depositCap(f.cap, monthlyRent);
    if (cap != null && values[f.key] > cap) return { values, error: `${f.label} is above what ${rules.province === 'BC' ? 'British Columbia' : 'Ontario'} allows: at most $${cap.toLocaleString('en-CA')} on this rent.` };
  }
  return { values, error: null };
}

export const money = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString('en-CA')}`);
// A date column (YYYY-MM-DD) as the realtor reads it, never shifted by the time zone.
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export const months = (n) => (n == null ? null : `${n} month${Number(n) === 1 ? '' : 's'}`);
export const spaces = (n) => (n == null ? null : `${n} space${Number(n) === 1 ? '' : 's'}`);
export const included = (b) => (b ? 'Included' : 'Not included');
export const yesNo = (b) => (b === true ? 'Yes' : b === false ? 'No' : null);

// The rows the listing page's Details fold shows: entered values only.
export function boardRows(listing, province) {
  const l = listing || {};
  const rows = [
    ['MLS number', l.mls_number || null],
    ['Listing brokerage', [l.listing_brokerage_name, l.listing_brokerage_address, l.listing_brokerage_phone].filter(Boolean).join(', ') || null],
    ['Cooperating brokerage', l.coop_brokerage_name || null],
    ['Commission', l.coop_commission || null],
    ['Possession', longDate(l.possession_date)],
    ['Lease term', months(l.lease_term_months)],
    ['Utilities included', ['heat', 'hydro', 'water'].filter((u) => l[`utilities_${u}`]).map((u) => u[0].toUpperCase() + u.slice(1)).join(', ') || null],
    ['Parking spaces', l.parking_spaces == null ? null : String(l.parking_spaces)],
    ['Locker', l.locker || null],
    ['Furnished', yesNo(l.furnished)],
    ...depositRules(province).fields.map((f) => [f.label, money(l[f.key])]),
  ];
  return rows.filter(([, v]) => v != null && v !== '');
}
