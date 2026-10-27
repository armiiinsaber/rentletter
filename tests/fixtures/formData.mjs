// The Form data fixture (tests/formData.test.mjs, tests/routes/formData.test.mjs): one listing with
// every board field, the realtor, the accepted applicant, a co applicant, a guarantor and a declined
// party, and the exact Copy all text they produce (lib/formData.js). Invented people; no real data.
export const LISTING = {
  id: 'L1', address: '210 Carlaw Ave, Toronto', unit: '4', monthly_rent: 2600, parking_included: 'no',
  landlord_name: 'Marco Rossi', landlord_email: 'marco@example.com', landlord_phone: '416 555 0133',
  mls_number: 'C1234567', listing_brokerage_name: 'Demo Realty', listing_brokerage_address: '8 Sample Ave, Toronto', listing_brokerage_phone: '416 555 0100',
  coop_brokerage_name: 'Other Realty', coop_commission: 'Half a month’s rent plus HST', possession_date: '2026-12-01', lease_term_months: 12,
  utilities_heat: true, utilities_hydro: false, utilities_water: true, parking_spaces: 1, locker: 'B12', furnished: false,
  deposit_last_month: 2600, deposit_key: 50, deposit_security: null, deposit_pet: null,
};
export const PROFILE = { full_name: 'Sarah Chen', brokerage: 'Demo Realty', license_number: 'RECO 1234567', province: 'ON', owner_token: 'never' };
export const APPLICATION = { id: 'A1', full_name: 'Applicant A1A1', email: 'aA1A1@example.com', phone: '416 555 0111', prev_address: '1 Old St', annual_income: 92000, owner_token: 'secret-token' };
export const PARTIES = [
  { id: 'P1', role: 'co_applicant', status: 'submitted', full_name: 'Jordan Lee', email: 'jordan@example.com', phone: '416 555 0142', address: null, annual_income: 64000, employer: 'Northwind Sample Clinic Inc.' },
  { id: 'P2', role: 'guarantor', status: 'submitted', full_name: 'Pat Guarantor', email: 'pat@example.com', phone: '416 555 0199', address: '14 Sample Cres, Toronto', annual_income: 85000, employer: 'Northwind Sample Clinic Inc.' },
  { id: 'P3', role: 'co_applicant', status: 'declined', full_name: 'Nobody Here', email: 'no@example.com', phone: '416 555 0000' },
];
export const COPY_ALL = [
  'Landlord', 'Name: Marco Rossi', 'Email: marco@example.com', 'Phone: 416 555 0133', '',
  'Tenants', 'Tenant 1 name: Applicant A1A1', 'Tenant 1 email: aA1A1@example.com', 'Tenant 1 phone: 416 555 0111', 'Tenant 1 current address: 1 Old St', 'Tenant 2 name: Jordan Lee', 'Tenant 2 email: jordan@example.com', 'Tenant 2 phone: 416 555 0142', '',
  'Guarantor', 'Name: Pat Guarantor', 'Address: 14 Sample Cres, Toronto', 'Phone: 416 555 0199', '',
  'Premises', 'MLS number: C1234567', 'Address: 210 Carlaw Ave, Toronto', 'Unit: 4', 'Parking: 1 space', 'Locker: B12', '',
  'Term', 'Start: December 1, 2026', 'Length: 12 months', '',
  'Rent and deposits', 'Monthly rent: $2,600', 'Last month’s rent deposit: $2,600', 'Key deposit: $50', '',
  'Utilities and inclusions', 'Heat: Included', 'Hydro: Not included', 'Water: Included', 'Furnished: No', '',
  'Brokerages and commission', 'Listing brokerage: Demo Realty', 'Listing brokerage address: 8 Sample Ave, Toronto', 'Listing brokerage phone: 416 555 0100', 'Listing salesperson: Sarah Chen', 'RECO registration number: RECO 1234567', 'Cooperating brokerage: Other Realty', 'Commission to the cooperating brokerage: Half a month’s rent plus HST',
].join('\n');

