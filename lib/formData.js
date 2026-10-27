// lib/formData.js  PURE, isomorphic. The Form data view (docs/form-data.md): once a tenant is
// accepted on a listing, every value an agreement to lease asks for, grouped the way such an
// agreement is organized, each one ready to copy into whatever forms tool the realtor uses.
// Rentletter never draws, copies or names the board's own form (it is OREA's copyrighted form);
// these are Rentletter's own values under plain group names.
//
//   buildFormData({ listing, profile, application, parties }) -> { groups }
//     groups: [{ key, title, items: [{ key, label, value }] }], value null when not entered
//   itemLine(item)        "Label: value"
//   groupText(group)      the group's title and its entered lines, '' when nothing is entered
//   formDataText(groups)  every group with something entered, a blank line between groups
//
// What never appears here: a document, a credit fact, a Fit number, a check docs item, anyone's
// income, a guarantor's anything beyond name, address and phone, a protected ground, owner_token.
import { depositRules, longDate, money, months, spaces, included, yesNo } from './boardDetails.js';
import { normalizeProvince } from './provinces.js';
import { displayAddress } from './listingAddress.js';

const text = (v) => { const s = v == null ? '' : String(v).trim(); return s || null; };
const item = (key, label, value) => ({ key, label, value: value == null || value === '' ? null : String(value) });

export function buildFormData({ listing, profile, application, parties } = {}) {
  const l = listing || {}; const p = profile || {}; const a = application || {};
  const province = normalizeProvince(p.province);
  const live = (parties || []).filter((x) => x && x.status === 'submitted');
  const tenants = [a, ...live.filter((x) => x.role === 'co_applicant')];
  const guarantor = live.find((x) => x.role === 'guarantor') || null;
  const rules = depositRules(province);
  const groups = [
    { key: 'landlord', title: 'Landlord', items: [
      item('landlord_name', 'Name', text(l.landlord_name)),
      item('landlord_email', 'Email', text(l.landlord_email)),
      item('landlord_phone', 'Phone', text(l.landlord_phone)),
    ] },
    { key: 'tenants', title: 'Tenants', items: tenants.flatMap((t, i) => {
      const n = tenants.length === 1 ? 'Tenant' : `Tenant ${i + 1}`;
      return [
        item(`tenant_${i + 1}_name`, `${n} name`, text(t.full_name)),
        item(`tenant_${i + 1}_email`, `${n} email`, text(t.email)),
        item(`tenant_${i + 1}_phone`, `${n} phone`, text(t.phone)),
        // The address they gave as where they live now (lib/applicationMap.js prev_address); a
        // co applicant's form has no address field.
        ...(i === 0 ? [item('tenant_1_address', `${n} current address`, text(t.prev_address))] : []),
      ];
    }) },
    // A guarantor: name, address and phone, the three things the agreement names. Never their
    // income, employer or documents.
    { key: 'guarantor', title: 'Guarantor', items: [
      item('guarantor_name', 'Name', guarantor ? text(guarantor.full_name) : null),
      item('guarantor_address', 'Address', guarantor ? text(guarantor.address) : null),
      item('guarantor_phone', 'Phone', guarantor ? text(guarantor.phone) : null),
    ] },
    { key: 'premises', title: 'Premises', items: [
      item('mls_number', 'MLS number', text(l.mls_number)),
      item('address', 'Address', text(l.address)),
      item('unit', 'Unit', text(l.unit)),
      item('parking', 'Parking', l.parking_spaces != null ? spaces(l.parking_spaces) : l.parking_included === 'yes' ? 'Included' : null),
      item('locker', 'Locker', text(l.locker)),
    ] },
    { key: 'term', title: 'Term', items: [
      item('start', 'Start', longDate(l.possession_date)),
      item('length', 'Length', months(l.lease_term_months)),
    ] },
    { key: 'rent', title: 'Rent and deposits', items: [
      item('monthly_rent', 'Monthly rent', money(l.monthly_rent)),
      ...rules.fields.map((f) => item(f.key, f.label, money(l[f.key]))),
    ] },
    { key: 'utilities', title: 'Utilities and inclusions', items: [
      item('heat', 'Heat', l.utilities_heat == null ? null : included(l.utilities_heat)),
      item('hydro', 'Hydro', l.utilities_hydro == null ? null : included(l.utilities_hydro)),
      item('water', 'Water', l.utilities_water == null ? null : included(l.utilities_water)),
      item('furnished', 'Furnished', yesNo(l.furnished)),
    ] },
    { key: 'brokerages', title: 'Brokerages and commission', items: [
      item('listing_brokerage_name', 'Listing brokerage', text(l.listing_brokerage_name)),
      item('listing_brokerage_address', 'Listing brokerage address', text(l.listing_brokerage_address)),
      item('listing_brokerage_phone', 'Listing brokerage phone', text(l.listing_brokerage_phone)),
      item('salesperson', 'Listing salesperson', text(p.full_name)),
      item('reco', 'RECO registration number', text(p.license_number)),
      item('coop_brokerage_name', 'Cooperating brokerage', text(l.coop_brokerage_name)),
      item('coop_commission', 'Commission to the cooperating brokerage', text(l.coop_commission)),
    ] },
  ];
  return { groups, province, premisesLabel: displayAddress(l) || text(l.address) || null };
}

export const itemLine = (it) => `${it.label}: ${it.value}`;
export function groupText(group) {
  const lines = (group && group.items ? group.items : []).filter((it) => it.value != null).map(itemLine);
  return lines.length ? [group.title, ...lines].join('\n') : '';
}
export function formDataText(groups) {
  return (groups || []).map(groupText).filter(Boolean).join('\n\n');
}
