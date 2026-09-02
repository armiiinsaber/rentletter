// lib/demoFixture.js
// The /demo/dashboard sample data — FAKE people, fake listings, never real tenants. Records are
// kept in the KV application shape generate.js writes, then run through kvAppToRow so the demo
// renders EXACTLY the Supabase-row shape the real dashboard renders (annual_income, net_income,
// employment_type, business_name, referral_meta, profile_updated_at, reviewed_at …).
// ISOMORPHIC: used by the client-side demo adapter and the demo-only report routes.
import { kvAppToRow } from './applicationMap';
import { DECISION_STATUS, DECISION_PRIORITY, ADDED_VIA } from './listingApplicantsVocabulary';
import { DEMO_BRAND_NAME, DEMO_BRAND_BROKERAGE, DEMO_BRAND_LOGO_PNG } from './demoBranding';

const DAY = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * DAY - h * 3600e3).toISOString();

// ── the cast (from the previous demo, upgraded to the current application shape) ──
const SAMPLE_APPLICATIONS = [
  {
    applicationNumber: 'RL-2026-1A2B-3C4D', createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    email: 'priya.sharma@email.com',
    tenant: { fullName: 'Priya Sharma', age: '31', dateOfBirth: '1994-08-14', phone: '(416) 555-0142' },
    employment: { jobTitle: 'Registered Nurse', employer: 'Sunnybrook Health Sciences Centre', yearsAtJob: '5', annualIncome: 92000, monthlyIncome: 7667 },
    rental: { previousAddress: '54 Boston Ave, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Gail Mercer', previousLandlordContact: '416-555-0110', currentRent: 1950 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 34 },
    move: { moveInDate: 'October 1, 2026', reasonForMoving: 'Current building is being sold; looking for a longer-term home closer to the hospital.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, works rotating shifts. Keeps to herself, tidy.', pets: 'One indoor cat, spayed, vet records available' },
    vehicle: { makeModel: 'Honda Civic', year: '2019' },
    references: [
      { name: 'Gail Mercer', relationship: 'Previous landlord (4 years)', contact: '416-555-0110' },
      { name: 'Donna Reyes', relationship: 'Nurse manager, Sunnybrook', contact: 'd.reyes@email.com' },
    ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '5 years permanent full-time at a major hospital' },
      rentAffordability: { score: 4.7, note: '34% of monthly income' },
      rentalHistory: { score: 5, note: '4 years, landlord reference confirmed' },
      overall: 4.9,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-2B3C-4D5E', createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    email: 'marc.tremblay@email.com',
    tenant: { fullName: 'Marc Tremblay', age: '38', dateOfBirth: '1987-03-22', phone: '(647) 555-0233' },
    employment: { jobTitle: 'Red Seal Electrician', employer: 'PowerLine Electric', yearsAtJob: '9', annualIncome: 85000, monthlyIncome: 7083 },
    rental: { previousAddress: '12 Pinegrove Rd, Scarborough', yearsAtPrevious: '6', previousLandlordName: 'Anil Kapoor', previousLandlordContact: '416-555-0188', currentRent: 2200 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 20 },
    move: { moveInDate: 'September 15, 2026', reasonForMoving: 'Growing family; need a second bedroom and want to stay in the east end.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'Couple with one child (age 4)', smoker: 'no' },
    coApplicant: { name: 'Janelle Tremblay', age: '36', jobTitle: 'Dental Hygienist', employer: 'Beaches Dental', annualIncome: 74000 },
    lifestyle: { personality: 'Easygoing family, home most evenings and weekends.', pets: null },
    vehicle: { makeModel: 'Ford F-150 (work truck)', year: '2021' },
    references: [
      { name: 'Anil Kapoor', relationship: 'Current landlord (6 years)', contact: '416-555-0188' },
      { name: 'Steve Whitfield', relationship: 'Foreman, PowerLine Electric', contact: '647-555-0901' },
    ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '9 years in a licensed trade; dual income' },
      rentAffordability: { score: 5, note: '20% of combined household income' },
      rentalHistory: { score: 4, note: '6 years, strong landlord reference' },
      overall: 4.7,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-3C4D-5E6F', createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    email: 'wei.chen@email.com',
    tenant: { fullName: 'Wei Chen', age: '27', dateOfBirth: '1998-11-05', phone: '(437) 555-0377' },
    employment: { jobTitle: 'Software Developer', employer: 'Shopify', yearsAtJob: '1.5', annualIncome: 115000, monthlyIncome: 9583 },
    rental: { previousAddress: '88 Blue Jays Way, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Harbourview Property Mgmt', previousLandlordContact: 'leasing@email.com', currentRent: 2400 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 27 },
    move: { moveInDate: 'October 1, 2026', reasonForMoving: 'Wants a quieter neighbourhood and a home office now that work is hybrid.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Works hybrid, codes evenings, no parties. Cooks at home.', pets: null },
    vehicle: null,
    references: [
      { name: 'Harbourview Property Mgmt', relationship: 'Current landlord (2 years)', contact: 'leasing@email.com' },
      { name: 'Rachel Adeyemi', relationship: 'Engineering manager, Shopify', contact: 'r.adeyemi@email.com' },
    ],
    disclosures: 'Relatively short tenure at current employer (18 months) — offer letter and recent pay stubs available.',
    scorecard: {
      incomeStability: { score: 4, note: 'Strong income; 18 months at current employer' },
      rentAffordability: { score: 5, note: '27% of monthly income' },
      rentalHistory: { score: 3, note: '2 years with a property manager, limited personal reference' },
      overall: 4.0,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-4D5E-6F70', createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    email: 'tasha.okafor@email.com',
    tenant: { fullName: 'Tasha Okafor', age: '34', dateOfBirth: '1991-06-19', phone: '(905) 555-0414' },
    employment: { jobTitle: 'Store Manager', employer: 'Canadian Tire', yearsAtJob: '7', annualIncome: 61000, monthlyIncome: 5083 },
    rental: { previousAddress: '300 Burnhamthorpe Rd, Mississauga', yearsAtPrevious: '5', previousLandlordName: 'Westdale Properties', previousLandlordContact: '905-555-0260', currentRent: 2100 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 51 },
    move: { moveInDate: 'November 1, 2026', reasonForMoving: 'Relocating closer to her kids new school and her store.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'Single parent with two children (ages 7 and 9)', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Organized, home-focused. Kids in school and activities.', pets: null },
    vehicle: { makeModel: 'Toyota RAV4', year: '2018' },
    references: [
      { name: 'Westdale Properties', relationship: 'Current landlord (5 years)', contact: '905-555-0260' },
      { name: 'Greg Lalonde', relationship: 'District manager, Canadian Tire', contact: '905-555-0712' },
    ],
    disclosures: 'One late rent payment two years ago during a job transition; caught up the same month. Can provide guarantor if helpful.',
    scorecard: {
      incomeStability: { score: 3, note: '7 years with one employer; single income' },
      rentAffordability: { score: 3.4, note: '51% of income on rent alone — stretched without a guarantor' },
      rentalHistory: { score: 4, note: '5 years, one disclosed late payment since resolved' },
      overall: 3.5,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-5E6F-7081', createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    email: 'david.kowalski@email.com',
    tenant: { fullName: 'David Kowalski', age: '41', dateOfBirth: '1984-02-28', phone: '(416) 555-0529' },
    employment: { jobTitle: 'Secondary School Teacher', employer: 'Toronto District School Board', yearsAtJob: '12', annualIncome: 79000, monthlyIncome: 6583 },
    rental: { previousAddress: '21 Wedgewood Dr, North York', yearsAtPrevious: '8', previousLandlordName: 'Maria Santos', previousLandlordContact: '416-555-0333', currentRent: 2300 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 27 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Downsizing after kids changed schools; want to be near transit.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'Couple with one teenager', smoker: 'no' },
    coApplicant: { name: 'Aisha Mohamed', age: '39', jobTitle: 'Library Technician (part-time)', employer: 'Toronto Public Library', annualIncome: 38000 },
    lifestyle: { personality: 'Quiet household, long-term renters, no parties.', pets: 'One older dog, well-trained' },
    vehicle: { makeModel: 'Subaru Outback', year: '2017' },
    references: [
      { name: 'Maria Santos', relationship: 'Previous landlord (8 years)', contact: '416-555-0333' },
      { name: 'Paul Nguyen', relationship: 'Vice-principal, TDSB', contact: 'p.nguyen@email.com' },
    ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '12 years public-sector tenure; dual income' },
      rentAffordability: { score: 5, note: '27% of combined household income' },
      rentalHistory: { score: 4, note: '8 years with one landlord, excellent reference' },
      overall: 4.7,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-6F70-8192', createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    email: 'sofia.russo@email.com',
    tenant: { fullName: 'Sofia Russo', age: '45', dateOfBirth: '1980-09-30', phone: '(647) 555-0648' },
    employment: { jobTitle: 'Owner / Operator', employer: "Sofia's Cafe (small business)", yearsAtJob: '8', annualIncome: 68000, monthlyIncome: 5667 },
    rental: { previousAddress: '160 Donlands Ave, East York', yearsAtPrevious: '10', previousLandlordName: 'Frank Iannuzzi', previousLandlordContact: '416-555-0451', currentRent: 1700 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 46 },
    move: { moveInDate: 'October 15, 2026', reasonForMoving: 'Long-time apartment is no longer available; wants to stay near her cafe.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Early riser, runs a neighbourhood cafe. Calm, reliable.', pets: null },
    vehicle: { makeModel: 'Mazda CX-5', year: '2016' },
    references: [
      { name: 'Frank Iannuzzi', relationship: 'Previous landlord (10 years)', contact: '416-555-0451' },
      { name: 'Lena Park', relationship: 'Accountant', contact: 'l.park@email.com' },
    ],
    disclosures: 'Self-employed — income varies by season. Two years of Notice of Assessment and business statements available.',
    scorecard: {
      incomeStability: { score: 3, note: 'Self-employed; income varies but 8-year track record' },
      rentAffordability: { score: 3.8, note: '46% of declared income — verify with NOAs' },
      rentalHistory: { score: 4, note: '10 years with one landlord, strong reference' },
      overall: 3.6,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-7081-92A3', createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    email: 'omar.haddad@email.com',
    tenant: { fullName: 'Omar Haddad', age: '26', dateOfBirth: '1999-12-11', phone: '(437) 555-0763' },
    employment: { jobTitle: 'PhD Candidate + Research Assistant', employer: 'York University', yearsAtJob: '2', annualIncome: 34000, monthlyIncome: 2833 },
    rental: { previousAddress: '55 Sentinel Rd, North York', yearsAtPrevious: '2', previousLandlordName: 'Campus Living Co.', previousLandlordContact: 'rentals@email.com', currentRent: 950 },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 92 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Sharing a larger unit with a fellow grad student to cut commute time.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Two graduate students sharing', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studious, mostly on campus or at the library. No parties.', pets: null },
    vehicle: null,
    references: [
      { name: 'Campus Living Co.', relationship: 'Current landlord (2 years)', contact: 'rentals@email.com' },
      { name: 'Dr. Helen Brar', relationship: 'PhD supervisor, York University', contact: 'h.brar@email.com' },
    ],
    disclosures: 'Stipend-based income. Parent is co-signing as guarantor with verified income; documentation available.',
    scorecard: {
      incomeStability: { score: 2, note: 'Stipend income; relies on a guarantor' },
      rentAffordability: { score: 1, note: 'Rent is 92% of own income — guarantor required' },
      rentalHistory: { score: 3, note: '2 years in student housing' },
      overall: 2.0,
      model: 'scorecard-v2',
    },
  },
  {
    applicationNumber: 'RL-2026-8192-A3B4', createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    email: 'lucia.fernandez@email.com',
    tenant: { fullName: 'Lucia Fernandez', age: '33', dateOfBirth: '1992-04-07', phone: '(647) 555-0884' },
    employment: { jobTitle: 'Mechanical Engineer (signed offer)', employer: 'Magna International', yearsAtJob: '0', annualIncome: 98000, monthlyIncome: 8167 },
    rental: { previousAddress: 'Madrid, Spain', yearsAtPrevious: '5', previousLandlordName: 'Inmobiliaria Centro', previousLandlordContact: 'contacto@email.com', currentRent: null },
    apartment: { address: '210 Carlaw Ave, Unit 4, Toronto', description: '2BR in Leslieville, $2,600/mo', estimatedRent: 2600, rentToIncomeRatio: 32 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Recently relocated to Canada for a new engineering role; settling with her partner.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Couple, newly arrived in Canada', smoker: 'no' },
    coApplicant: { name: 'Diego Fernandez', age: '34', relationship: 'Spouse', jobTitle: 'Graphic Designer (job searching)', employer: 'Freelance / seeking employment', annualIncome: 0 },
    lifestyle: { personality: 'New to the city, quiet, eager to settle into a long-term home.', pets: null },
    vehicle: null,
    references: [
      { name: 'Inmobiliaria Centro', relationship: 'Previous landlord, Madrid (5 years)', contact: 'contacto@email.com' },
      { name: 'James Okoro', relationship: 'Hiring manager, Magna International', contact: 'j.okoro@email.com' },
    ],
    disclosures: 'Newcomer to Canada — limited local rental and credit history. Signed employment offer, first and last month, and international references available.',
    scorecard: {
      incomeStability: { score: 4, note: 'Signed full-time offer; partner currently job searching' },
      rentAffordability: { score: 4.8, note: '32% of primary income' },
      rentalHistory: { score: 2, note: 'Strong international history; limited Canadian record' },
      overall: 3.6,
      model: 'scorecard-v2',
    },
  },
];

const SAMPLE_DOCINTEL = {
  analyzedAt: '2026-08-12T15:00:00Z',
  documentCount: 4,
  documents: [
    { filename: 'paystub-may.pdf', documentType: 'pay stub', extracted: { applicantName: 'Priya Sharma', income: '$3,540 net / semi-monthly', payFrequency: 'Semi-monthly', employer: 'Sunnybrook Health Sciences Centre', employmentType: 'Full-time', jobTitle: 'Data Analyst', documentDate: 'May 31, 2026' }, notes: 'Gross annualizes to ~$92,000.' },
    { filename: 'employment-letter.pdf', documentType: 'employment letter', extracted: { applicantName: 'Priya Sharma', income: '$92,000 / year', employer: 'Sunnybrook Health Sciences Centre', employmentType: 'Full-time, permanent', jobTitle: 'Data Analyst', documentDate: 'Jun 2, 2026' }, notes: 'Signed by HR; confirms salary and start date.' },
    { filename: 'equifax-report.pdf', documentType: 'credit report', extracted: { applicantName: 'Priya Sharma', creditScore: 748, scoreBand: 'Very Good', bureau: 'Equifax', reportDate: 'Aug 1, 2026', accountsCount: 6, delinquencies: 'None reported', collections: 'None reported', employer: 'Sunnybrook Health Sciences Centre' }, notes: 'Consumer credit report.' },
    { filename: 'id-front.jpg', documentType: 'government ID', extracted: { applicantName: 'Priya Sharma' }, notes: 'Name used only to confirm identity across documents.' },
  ],
  crossReference: [
    { field: 'Applicant name', status: 'consistent', detail: 'Matches across the pay stub, employment letter, credit report, and ID.' },
    { field: 'Employer', status: 'consistent', detail: 'Sunnybrook Health Sciences Centre on the pay stub, employment letter, and credit report.' },
    { field: 'Income', status: 'consistent', detail: 'Pay stub annualizes to ~$92,000, matching the employment letter.' },
  ],
  comparisons: [
    { field: 'Income', stated: '$92,000', found: '$92,000', status: 'match' },
    { field: 'Employer', stated: 'Sunnybrook Health Sciences Centre', found: 'Sunnybrook Health Sciences Centre', status: 'match' },
    { field: 'Job title', stated: 'Registered Nurse', found: 'Registered Nurse', status: 'match' },
  ],
  overallSummary: 'Income, employer, and job title on the application are corroborated by the pay stub and employment letter; the Equifax credit report shows a score of 748 (Very Good) with no reported delinquencies or collections; and the applicant name is consistent across all four documents.',
  confidence: 'high',
};

export const SAMPLE_DOCINTEL_SOURCE = 'realtor';
const SAMPLE_INSIGHT = 'On the stated $92,000 income, rent of $2,600 works out to roughly 34% rent-to-income, within a typical range for this unit. Employment reads as stable — a full-time, permanent Data Analyst role at Northbridge Analytics, corroborated by both a pay stub and a signed employment letter, with figures consistent across the documents. Two references were provided, including a previous landlord. The uploaded documents confirm the application’s income, employer, and job title with no discrepancies, and the applicant name matches across the pay stub, letter, and ID.';

export { SAMPLE_DOCINTEL, SAMPLE_INSIGHT };

// Upgrades: employment type / business name / after-tax income / tenancy-profile contact split.
const UPGRADES = {
  'RL-2026-1A2B-3C4D': { employment: { employmentType: 'full-time', netIncome: 68400, netIncomeSource: 'estimated' }, rental: { previousLandlordContact: 'gail.mercer@email.com · (416) 555-0110' } },
  'RL-2026-2B3C-4D5E': { employment: { employmentType: 'full-time', netIncome: 63900, netIncomeSource: 'stated' } },
  'RL-2026-3C4D-5E6F': { employment: { employmentType: 'full-time', netIncome: 83600, netIncomeSource: 'estimated' } },
  'RL-2026-4D5E-6F70': { employment: { employmentType: 'full-time', netIncome: 47900, netIncomeSource: 'estimated' } },
  'RL-2026-5E6F-7081': { employment: { employmentType: 'full-time', netIncome: 59700, netIncomeSource: 'estimated' } },
  'RL-2026-6F70-8192': { employment: { employmentType: 'self-employed', businessName: "Sofia's Cafe Inc.", employer: "Sofia's Cafe Inc.", netIncome: 52800, netIncomeSource: 'stated' } },
  'RL-2026-7081-92A3': { employment: { employmentType: 'part-time', netIncome: 30100, netIncomeSource: 'estimated' } },
  'RL-2026-8192-A3B4': { employment: { employmentType: 'contract', netIncome: 71800, netIncomeSource: 'estimated' } },
};

export const DEMO_PROFILE = {
  id: 'demo-realtor', full_name: DEMO_BRAND_NAME, brokerage: DEMO_BRAND_BROKERAGE, email: 'sarah@demo-realty.example',
  province: 'ON', logo_url: DEMO_BRAND_LOGO_PNG, brand_color: '#1f3a5f', brand_color_secondary: '#b07818',
  is_founder: false, plan: 'paid', subscription_status: 'active', billing_interval: 'year', created_at: ago(40),
};

export const DEMO_LISTINGS = [
  { id: 'demo-carlaw', profile_id: 'demo-realtor', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', province: 'ON',
    landlord_name: 'Marco Rossi', landlord_email: 'marco.rossi@example.com', invite_token: 'demo0000000000000001', invite_url: 'https://rentletter.ca/apply/demo0000000000000001',
    pref_min_annual_income: 75000, pref_rent_to_income_max_pct: 40, pref_min_years_at_job: 1, pref_min_lease_term_months: 12, pref_max_occupants: 3,
    pref_requires_landlord_reference: true, pref_requires_employer_verification: false, pref_guarantor_accepted: true,
    pref_employment_full_time: true, pref_employment_contract: true, pref_employment_self_employed: true, pref_employment_part_time: false,
    pref_notes: 'Quiet building; landlord prefers a 12-month lease to start.', created_at: ago(18) },
  { id: 'demo-harbour', profile_id: 'demo-realtor', name: '88 Harbour St, Unit 2104', address: '88 Harbour St, Unit 2104, Toronto', monthly_rent: 3100, bedrooms: '2', province: 'ON',
    landlord_name: null, landlord_email: null, invite_token: null, invite_url: null,
    pref_min_annual_income: 90000, pref_rent_to_income_max_pct: 35, pref_min_years_at_job: 2, pref_min_lease_term_months: 12, pref_max_occupants: 2,
    pref_requires_landlord_reference: false, pref_requires_employer_verification: true, pref_guarantor_accepted: false,
    pref_employment_full_time: true, pref_employment_contract: false, pref_employment_self_employed: false, pref_employment_part_time: false,
    pref_notes: null, created_at: ago(3) },
];

// Which applicant sits where, with the process state the demo should SHOW.
//   reviewedAt null → unreviewed dot; docs → active verification; edited → profile edited after docs
const PLACEMENT = [
  { rl: 'RL-2026-1A2B-3C4D', listing: 'demo-carlaw', linkId: 'demo-link-1', reviewedAt: ago(6), docs: true, finalist: true },
  { rl: 'RL-2026-2B3C-4D5E', listing: 'demo-carlaw', linkId: 'demo-link-2', reviewedAt: ago(6) },
  { rl: 'RL-2026-3C4D-5E6F', listing: 'demo-carlaw', linkId: 'demo-link-3', reviewedAt: ago(5), edited: true, docs: true },
  { rl: 'RL-2026-4D5E-6F70', listing: 'demo-carlaw', linkId: 'demo-link-4', reviewedAt: ago(5), decision: DECISION_STATUS.REJECT, reason: 'income_below_threshold' },
  { rl: 'RL-2026-5E6F-7081', listing: 'demo-carlaw', linkId: 'demo-link-5', reviewedAt: null },
  { rl: 'RL-2026-6F70-8192', listing: 'demo-carlaw', linkId: 'demo-link-6', reviewedAt: null },
  { rl: 'RL-2026-7081-92A3', listing: 'demo-harbour', linkId: 'demo-link-7', reviewedAt: ago(1) },
  { rl: 'RL-2026-8192-A3B4', listing: 'demo-harbour', linkId: 'demo-link-8', reviewedAt: null, referred: true },
];

function upgraded(app) {
  const u = UPGRADES[app.applicationNumber] || {};
  return { ...app, employment: { ...app.employment, ...(u.employment || {}) }, rental: { ...app.rental, ...(u.rental || {}) }, ownerToken: 'DEMO-OWNER-TOKEN-NEVER-REAL' };
}

// Build the dashboard-shaped applicants (what fetchListingApplicants + attachDocVerifications return).
export function buildDemoApplicants() {
  const out = {};
  for (const p of PLACEMENT) {
    const src = SAMPLE_APPLICATIONS.find((a) => a.applicationNumber === p.rl);
    const app = upgraded({ ...src });
    const listing = DEMO_LISTINGS.find((l) => l.id === p.listing);
    app.apartment = { address: listing.address, description: `${listing.bedrooms} BR · $${listing.monthly_rent.toLocaleString('en-CA')}/mo`, estimatedRent: listing.monthly_rent, rentToIncomeRatio: Math.round(listing.monthly_rent / (app.employment.annualIncome / 12) * 100) };
    if (p.edited) { app.updatedAt = ago(2); app.profileRevision = 1; app.employment = { ...app.employment, annualIncome: app.employment.annualIncome + 5000 }; }
    if (p.referred) app.referral = { id: 'demo-ref-1', fromName: 'Priya Patel', fromBrokerage: 'Harbourfront Realty', approvedAt: ago(1), note: 'Great applicant — wrong budget for my unit.', factsSource: 'profile', verification: { analyzedAt: ago(9), verified: true, incomeVerified: true, incomeFigure: '$98,000', employmentVerified: true, employerName: 'Magna International', credit: null, documentsCount: 2, forListing: '15 Fort York Blvd' } };
    const row = { id: `demo-app-${p.linkId.slice(-1)}`, ...kvAppToRow(app), created_at: src.createdAt };
    delete row.owner_token; delete row.cover_letter;
    const docs = p.docs ? [{ ...SAMPLE_DOCINTEL, analyzedAt: p.edited ? ago(4) : SAMPLE_DOCINTEL.analyzedAt, source: 'realtor' }] : [];
    (out[p.listing] = out[p.listing] || []).push({
      linkId: p.linkId, decisionStatus: p.decision || DECISION_STATUS.NONE, decisionPriority: p.finalist ? DECISION_PRIORITY.TOP : DECISION_PRIORITY.NORMAL, withdrawnAt: null, decisionNotes: '', decisionReasonCode: p.reason || null,
      decisionChangedAt: p.decision ? ago(4) : null, addedVia: p.referred ? ADDED_VIA.REFERRAL : ADDED_VIA.INVITE, reviewedAt: p.reviewedAt, reviewTracking: true,
      application: row, docVerifications: docs, docArchived: [], aiInsight: p.docs && !p.edited ? SAMPLE_INSIGHT : null,
    });
  }
  return out;
}

export const DEMO_NOTIFICATIONS = [
  { id: 'new:demo-link-6', type: 'new', name: 'Sofia Russo', listingId: 'demo-carlaw', listingName: '210 Carlaw Ave, Unit 4', title: 'New application from Sofia Russo', ts: Date.now() - 5 * 3600e3, unread: true },
  { id: 'new:demo-link-5', type: 'new', name: 'David Kowalski', listingId: 'demo-carlaw', listingName: '210 Carlaw Ave, Unit 4', title: 'New application from David Kowalski', ts: Date.now() - 20 * 3600e3, unread: true },
  { id: 'docs:demo-link-3', type: 'docs', name: 'Wei Chen', listingId: 'demo-carlaw', listingName: '210 Carlaw Ave, Unit 4', title: 'Wei Chen sent documents', ts: Date.now() - 4 * DAY, unread: false },
];

// A referral already approved by its applicant, waiting to be assigned (the "received" state),
// and one the demo realtor sent that is awaiting consent.
export const DEMO_REFERRAL_INBOX = [{
  id: 'demo-ref-inbox', status: 'approved', from: { name: 'Priya Patel', brokerage: 'Harbourfront Realty' }, note: 'Solid applicant, looking east of Yonge at ~$2,600.', approvedAt: ago(1), createdAt: ago(2),
  assignedListingId: null, assignedAt: null, factsSource: 'profile', applicationNumber: 'RL-2026-9A0B-C1D2',
  verification: { analyzedAt: ago(12), verified: true, incomeVerified: true, incomeFigure: '$88,000', employmentVerified: true, employerName: 'City of Toronto', credit: null, documentsCount: 2, forListing: '30 Bay St' },
  applicant: { name: 'Amara Okonkwo', jobTitle: 'Urban Planner', employer: 'City of Toronto', employmentType: 'full-time', annualIncome: 88000, netIncome: 65900, moveInDate: 'November 1, 2026', yearsAtJob: '4', rentalYears: '3', hasLandlordRef: true, pets: null, occupants: '1' },
  revoked: false,
}];
export const DEMO_REFERRALS_SENT = { 'demo-link-2': { id: 'demo-ref-sent', status: 'pending', to: { name: 'Dan Li', email: 'dan.li@example.com', hasAccount: false }, createdAt: ago(3), decidedAt: null, assigned: false } };

// Referral inbox applicant as a full application (for "Assign & rank").
export function referredApplicationForAssign() {
  const app = upgraded({
    applicationNumber: 'RL-2026-9A0B-C1D2', createdAt: ago(2), email: 'amara.okonkwo@email.com',
    tenant: { fullName: 'Amara Okonkwo', age: '34', dateOfBirth: '1992-02-11', phone: '(416) 555-0199' },
    employment: { jobTitle: 'Urban Planner', employer: 'City of Toronto', yearsAtJob: '4', annualIncome: 88000, monthlyIncome: 7333, employmentType: 'full-time', netIncome: 65900, netIncomeSource: 'estimated' },
    rental: { previousAddress: '12 Sumach St, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Leo Park', previousLandlordContact: 'leo@example.com', currentRent: 2300 },
    apartment: { address: null, description: null, estimatedRent: null, rentToIncomeRatio: null },
    move: { moveInDate: 'November 1, 2026', reasonForMoving: 'Lease ending; moving closer to work downtown.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no', evParkingNeeded: 'no' }, coApplicant: null,
    lifestyle: { personality: 'Early riser, cyclist, mostly at work or the library.', pets: '' }, vehicle: null,
    references: [{ name: 'Leo Park', relationship: 'Previous landlord (3 years)', contact: 'leo@example.com' }], disclosures: null,
    scorecard: { incomeStability: { score: 4.8, note: '4 years at employer' }, rentAffordability: { score: 4.4, note: '35% of monthly income' }, rentalHistory: { score: 4.5, note: '3 years with reference' }, overall: 4.6, model: 'scorecard-v2' },
  });
  app.referral = DEMO_REFERRAL_INBOX[0];
  return app;
}
