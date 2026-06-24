import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import ChatWidget from '../../components/ChatWidget';
import { C as THEME, R, SH, EASE, FONT } from '../../components/theme';
import { GlobalStyle, Wordmark, Icon, ScrollHeader, ScrollFade, useReveal } from '../../components/ui';
import { DEMO_BRAND_NAME, DEMO_BRAND_BROKERAGE, DEMO_BRAND_LOGO_PNG, DEMO_LOGO_CONCEPTS } from '../../lib/demoBranding';
import { SET_ASIDE_REASONS, reasonLabel } from '../../lib/setAsideReasons';

// ─── DESIGN TOKENS ──────────────────────────────────────────
// Shared brand tokens, extended with the legacy "info" keys this page used
// for policy/notice boxes — now re-toned onto the paper palette so the blue
// no longer breaks the paper/ink/red brand.
const C = {
  ...THEME,
  info: THEME.paperDeep,
  infoBorder: THEME.rule,
  infoInk: THEME.inkSoft,
};


// ════════════════════════════════════════════════════════════
// DEMO DATA — Neighborhood-specific tenant scenarios
// Each scenario represents 8 applicants you'd see for that property type.
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// DEMO DATA — a believable, MIXED cross-section of Canadian renters.
// Demo-only (sample data shown on /demo/dashboard). Same field shape the
// dashboard already renders. Respectful, non-stereotyped; varied occupation,
// income, age, household type, employer and neighbourhood.
// ════════════════════════════════════════════════════════════
const MIXED_RENTERS = [
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
      rentAffordability: { score: 4, note: '34% of monthly income' },
      rentalHistory: { score: 5, note: '4 years, landlord reference confirmed' },
      longTermIntent: { score: 4, note: 'Wants a stable long-term home near work' },
      disclosures: { score: 5, note: 'Nothing to address' },
      overall: 4.6,
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
    coApplicant: { name: 'Janelle Tremblay', age: '36', relationship: 'Spouse', jobTitle: 'Dental Hygienist', employer: 'Beaches Dental', annualIncome: 74000 },
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
      longTermIntent: { score: 5, note: 'Family settling in the east end long-term' },
      disclosures: { score: 5, note: 'Nothing to address' },
      overall: 4.8,
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
      longTermIntent: { score: 3, note: 'Open-ended; comfortable with a 1-year lease' },
      disclosures: { score: 5, note: 'Proactively addressed short tenure' },
      overall: 4.0,
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
      rentAffordability: { score: 2, note: '51% of income on rent alone — stretched without a guarantor' },
      rentalHistory: { score: 4, note: '5 years, one disclosed late payment since resolved' },
      longTermIntent: { score: 4, note: 'Moving for school stability; likely long-term' },
      disclosures: { score: 4, note: 'Disclosed the late payment and offered a guarantor' },
      overall: 3.4,
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
    coApplicant: { name: 'Aisha Mohamed', age: '39', relationship: 'Spouse', jobTitle: 'Library Technician (part-time)', employer: 'Toronto Public Library', annualIncome: 38000 },
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
      longTermIntent: { score: 5, note: 'Long-term renters by track record' },
      disclosures: { score: 5, note: 'Nothing to address' },
      overall: 4.8,
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
      rentAffordability: { score: 3, note: '46% of declared income — verify with NOAs' },
      rentalHistory: { score: 4, note: '10 years with one landlord, strong reference' },
      longTermIntent: { score: 4, note: 'Roots in the neighbourhood via her business' },
      disclosures: { score: 4, note: 'Offered NOAs and business statements upfront' },
      overall: 3.6,
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
      rentAffordability: { score: 2, note: 'Rent is 92% of own income — guarantor required' },
      rentalHistory: { score: 3, note: '2 years in student housing' },
      longTermIntent: { score: 3, note: 'Likely 2-3 more years in the program' },
      disclosures: { score: 5, note: 'Guarantor offered proactively' },
      overall: 3.0,
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
      rentAffordability: { score: 4, note: '32% of primary income' },
      rentalHistory: { score: 2, note: 'Strong international history; limited Canadian record' },
      longTermIntent: { score: 4, note: 'Relocated for a permanent role; settling long-term' },
      disclosures: { score: 4, note: 'Offered offer letter, first/last, and references upfront' },
      overall: 3.6,
    },
  },
];


// ─── STAR DISPLAY ────────────────────────────────────────────
const Stars = ({ score, size = 14 }) => {
  const full = Math.floor(score);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <span key={i} style={{ color: i < full ? C.red : C.rule, fontSize: size, lineHeight: 1 }}>
        ★
      </span>
    );
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>;
};

// ─── DEFAULT WEIGHT SETTINGS ─────────────────────────────────
const DEFAULT_WEIGHTS = {
  incomeStability: 1.0,
  rentAffordability: 1.0,
  rentalHistory: 1.0,
  longTermIntent: 1.0,
  disclosures: 1.0,
};

const calculateWeightedScore = (scorecard, weights) => {
  if (!scorecard) return 0;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  const weighted =
    scorecard.incomeStability.score * weights.incomeStability +
    scorecard.rentAffordability.score * weights.rentAffordability +
    scorecard.rentalHistory.score * weights.rentalHistory +
    scorecard.longTermIntent.score * weights.longTermIntent +
    scorecard.disclosures.score * weights.disclosures;
  return Math.round((weighted / totalWeight) * 10) / 10;
};

// Demo workspace constants — used both to seed initial state synchronously (so the
// first paint already shows the sample dashboard, never an empty/real-looking frame)
// and by loadPMCDemo().
const DEMO_UNIT = { address: '210 Carlaw Ave, Unit 4, Toronto', monthlyRent: '2600', bedrooms: '2', allowsPets: 'yes', allowsSmoking: 'no', parkingIncluded: 'no' };
const DEMO_LISTING = {
  id: 'L_demo_mixed',
  name: '210 Carlaw Ave, Unit 4',
  applications: MIXED_RENTERS,
  decisions: {},
  unit: DEMO_UNIT,
  createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
};
const DEMO_REALTOR = { isRealtor: true, fullName: 'Demo Realtor', brokerage: 'Sample Realty', phone: '(416) 555-0123', licenseNumber: '' };

export default function LandlordDashboard() {
  const [appNumberInput, setAppNumberInput] = useState('');
  // Seed with the demo data so the FIRST paint is already the sample dashboard —
  // no empty/real-looking frame flashes before the effect runs.
  const [applications, setApplications] = useState(DEMO_LISTING.applications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('review'); // 'review' | 'detail' | 'compare' | 'ranked'
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [activeAppIdx, setActiveAppIdx] = useState(0);
  // Simple mode = card-by-card review (for non-savvy users, default on)
  // Detailed mode = the existing dense dashboard (for power users)
  const [simpleMode, setSimpleMode] = useState(true);
  // Queue position for review mode
  const [reviewIdx, setReviewIdx] = useState(0);
  // Whether the simplified card has been expanded to show full details
  const [reviewExpanded, setReviewExpanded] = useState(false);

  // ── UNIT CONTEXT (the unit being rented out) ──
  // Lets the dashboard show "Fits your unit?" for each applicant.
  const [unit, setUnit] = useState(DEMO_UNIT);
  const [unitCardExpanded, setUnitCardExpanded] = useState(false);
  const unitIsSet = !!(unit.address || unit.monthlyRent || unit.bedrooms);

  // ── MULTI-LISTING STATE ──
  // listings[]: each entry has { id, name, applications[], decisions{}, unit{}, createdAt }
  // activeListingId: which listing is currently being viewed/edited
  // applications/decisions/unit above are the "in-view" values, mirrored from the active listing.
  const [listings, setListings] = useState([DEMO_LISTING]);
  const [activeListingId, setActiveListingId] = useState(DEMO_LISTING.id);
  const [listingsSwitcherOpen, setListingsSwitcherOpen] = useState(false);
  const [renamingListingId, setRenamingListingId] = useState(null);
  const [renameInput, setRenameInput] = useState('');

  // ── REALTOR PROFILE state ──
  // Optional. If user identifies as a realtor, their info brands exports + emails.
  const [realtorProfile, setRealtorProfile] = useState(DEMO_REALTOR);
  const [realtorOnboardingShown, setRealtorOnboardingShown] = useState(true);
  const [realtorEditOpen, setRealtorEditOpen] = useState(false);

  // ── DEMO/SANDBOX MODE ──
  // This page IS the public sample dashboard (/demo/dashboard). Demo mode is ON
  // from the first render so the sign-in gate never shows AND the dashboard content
  // wrapper (which requires session/loading/demo) renders; the mount effect then
  // loads the sample tenants client-side, with NO session, NO Supabase, NO redirect.
  const [demoMode, setDemoMode] = useState(true);

  // ── AI rationale generation state ──
  const [rationaleLoading, setRationaleLoading] = useState({}); // keyed by appNumber
  const [rationaleError, setRationaleError] = useState('');

  // ── DECISIONS state (keyed by application number) ──
  // status: 'ranked' (default/in list) | 'set_aside' (+ reasonCode) | 'withdrawn'
  const [decisions, setDecisions] = useState({});

  // ── Request-application modal ──
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  // ── Methodology popover ──
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // ── Sign-in state ──
  const [sessionToken, setSessionToken] = useState('');
  const [signedInEmail, setSignedInEmail] = useState('');
  const [signinModalOpen, setSigninModalOpen] = useState(false);
  // Whether user dismissed the "you're not signed in" banner this session
  const [unsignedBannerDismissed, setUnsignedBannerDismissed] = useState(false);
  // CRITICAL: don't sync to server until we've finished loading existing workspace.
  // Otherwise a fresh page-load races: we POST empty state and wipe out the laptop's saved work.
  const [workspaceReady, setWorkspaceReady] = useState(true);
  // While true: show a loading state instead of empty-state hero (prevents flash for returning users)
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  // Whether the user has dismissed the "welcome back" returning-user card this session
  const [welcomeBackDismissed, setWelcomeBackDismissed] = useState(true);
  // Sync status: 'idle' | 'syncing' | 'synced' | 'error'
  const [syncStatus, setSyncStatus] = useState('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [signinEmailInput, setSigninEmailInput] = useState('');
  const [signinLinkSent, setSigninLinkSent] = useState(false);
  // After magic-link verifies, show a brief "You're signed in!" celebration
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState('');
  const [emailingSummary, setEmailingSummary] = useState(false);
  const [emailSummarySent, setEmailSummarySent] = useState(false);

  // ── FILTER STATE ──
  const [filters, setFilters] = useState({
    smokerStatus: 'any', // 'any' | 'non-smoker' | 'no-indoor'
    pets: 'any', // 'any' | 'no-pets' | 'with-pets'
    coApplicant: 'any', // 'any' | 'single' | 'with-co'
    minIncome: 0,
    maxRentToIncome: 100,
    decision: 'any', // 'any' | 'shortlist-only' | 'hide-rejected'
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Helpers for shortlist/notes
  const setDecisionStatus = (appNum, status) => {
    setDecisions(prev => ({
      ...prev,
      [appNum]: {
        ...(prev[appNum] || { notes: '', reasonCode: '' }),
        status,
        statusChangedAt: new Date().toISOString(),
      },
    }));
  };
  const setDecisionNotes = (appNum, notes) => {
    setDecisions(prev => ({
      ...prev,
      [appNum]: { ...(prev[appNum] || { status: 'none' }), notes },
    }));
  };
  const setDecisionReason = (appNum, reasonCode) => {
    setDecisions(prev => ({
      ...prev,
      [appNum]: { ...(prev[appNum] || { status: 'none', notes: '' }), reasonCode },
    }));
  };
  const getDecision = (appNum) => decisions[appNum] || { status: 'none', notes: '', reasonCode: '', statusChangedAt: null };

  // Apply filters to applications list (used for Compare and Ranked views)
  const filteredApplications = applications.filter(app => {
    if (filters.smokerStatus === 'non-smoker' && app.household?.smoker !== 'no') return false;
    if (filters.smokerStatus === 'no-indoor' && app.household?.smoker === 'yes') return false;
    if (filters.pets === 'no-pets' && app.lifestyle?.pets && app.lifestyle.pets.toLowerCase() !== 'none' && app.lifestyle.pets.trim() !== '') return false;
    if (filters.pets === 'with-pets' && (!app.lifestyle?.pets || app.lifestyle.pets.toLowerCase() === 'none' || app.lifestyle.pets.trim() === '')) return false;
    if (filters.coApplicant === 'single' && app.coApplicant) return false;
    if (filters.coApplicant === 'with-co' && !app.coApplicant) return false;
    const totalIncome = (app.employment?.annualIncome || 0) + (app.coApplicant?.annualIncome || 0);
    if (totalIncome < filters.minIncome) return false;
    if (app.apartment?.rentToIncomeRatio && app.apartment.rentToIncomeRatio > filters.maxRentToIncome) return false;
    // Decision filter
    const dec = decisions[app.applicationNumber]?.status || 'none';
    if (filters.decision === 'set-aside-only' && dec !== 'set_aside') return false;
    if (filters.decision === 'hide-set-aside' && dec === 'set_aside') return false;
    return true;
  });

  const resetFilters = () => setFilters({
    smokerStatus: 'any', pets: 'any', coApplicant: 'any',
    minIncome: 0, maxRentToIncome: 100, decision: 'any',
  });

  const activeFilterCount = [
    filters.smokerStatus !== 'any',
    filters.pets !== 'any',
    filters.coApplicant !== 'any',
    filters.minIncome > 0,
    filters.maxRentToIncome < 100,
    filters.decision !== 'any',
  ].filter(Boolean).length;

  // DEMO-ONLY ROUTE (/demo/dashboard): always load the sample tenants on mount and
  // bypass sign-in entirely. No query param required, no session, no Supabase, no
  // redirect — this route exists purely to showcase the dashboard with fake data
  // to logged-out visitors. The real realtor dashboard lives at /landlord.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // State is already seeded synchronously from DEMO_* constants (no flash); this
    // just re-affirms demo mode on mount.
    setDemoMode(true);
  }, []);

  // Persist simple mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('landlord_simple_mode', String(simpleMode));
  }, [simpleMode]);

  // Subtle scroll-reveal entrance animations (matches the homepage). Re-scans
  // whenever the visible content changes. No-ops under prefers-reduced-motion.
  useReveal(`${view}-${applications.length}-${workspaceLoading}-${signedInEmail}`);

  // Reset review queue when applications change OR when entering review mode
  useEffect(() => {
    if (reviewIdx >= applications.length) {
      setReviewIdx(0);
    }
    setReviewExpanded(false);
  }, [applications.length, view]);

  // Save to session storage as a backup (works signed-out too)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_apps', JSON.stringify(applications));
  }, [applications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_decisions', JSON.stringify(decisions));
  }, [decisions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_unit', JSON.stringify(unit));
  }, [unit]);

  // When signed in AND workspace finished loading, sync to server (debounced)
  // workspaceReady gate prevents a race: without it, fresh page-load syncs empty state
  // and overwrites the workspace the laptop saved.
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionToken || !workspaceReady) return;
    setSyncStatus('syncing');
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/landlord/workspace', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-rl-session': sessionToken,
          },
          body: JSON.stringify({ applications, decisions, unit, realtorProfile, listings, activeListingId }),
        });
        const bodyText = await r.text();
        let json = null;
        try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}
        if (r.ok && json?.ok) {
          setSyncStatus('synced');
          setLastSyncedAt(new Date());
          console.log('[sync] Saved', json.bytesSaved ? `(${json.bytesSaved} bytes)` : '');
        } else {
          setSyncStatus('error');
          console.error('[sync] Save failed:', r.status, json?.error, json?.detail);
        }
      } catch (err) {
        setSyncStatus('error');
        console.error('[sync] Workspace sync exception:', err);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [applications, decisions, unit, realtorProfile, listings, activeListingId, sessionToken, workspaceReady]);

  // Force a sync immediately (for the explicit "Save now" button)
  const forceSyncNow = async () => {
    if (!sessionToken) return;
    setSyncStatus('syncing');
    try {
      const r = await fetch('/api/landlord/workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({ applications, decisions, unit, realtorProfile, listings, activeListingId }),
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}
      if (r.ok && json?.ok) {
        setSyncStatus('synced');
        setLastSyncedAt(new Date());
        console.log('[sync] Force-saved', json.bytesSaved ? `(${json.bytesSaved} bytes)` : '');
      } else {
        setSyncStatus('error');
        const msg = json?.error || `HTTP ${r.status}`;
        const detail = json?.detail ? ` (${json.detail})` : '';
        console.error('[sync] Force save failed:', msg, detail);
        setError(`Could not save your work to the server. ${msg}${detail}`);
      }
    } catch (e) {
      setSyncStatus('error');
      console.error('[sync] Force sync exception:', e);
      setError('Could not save your work. Please check your internet and try again.');
    }
  };

  // ─── LISTINGS MANAGEMENT ────────────────────────
  // Build a default listing wrapping current flat data (used during migration)
  const makeListing = (overrides = {}) => ({
    id: 'L_' + Math.random().toString(36).slice(2, 11),
    name: overrides.name || 'My listing',
    applications: overrides.applications || [],
    decisions: overrides.decisions || {},
    unit: overrides.unit || {
      address: '', monthlyRent: '', bedrooms: '',
      allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no',
    },
    // Landlord stated preferences — what the landlord told the realtor they want.
    // ONLY legal screening criteria (OHRC compliant). No protected grounds.
    preferences: overrides.preferences || {
      minAnnualIncome: '',           // number
      rentToIncomeMaxPct: 30,        // % — rent ≤ this % of monthly income
      minYearsAtJob: '',             // years at current employer
      acceptableEmployment: { fullTime: true, contract: true, selfEmployed: false, partTime: false },
      earliestMoveIn: '',            // date string
      latestMoveIn: '',              // date string
      minLeaseTermMonths: 12,        // 12 = 1 year
      maxOccupants: '',              // number
      smokingAllowed: false,
      petsPolicy: 'case-by-case',    // 'yes' | 'no' | 'case-by-case'
      parkingSpots: '',              // number of available spots
      requiresLandlordReference: true,
      requiresEmployerVerification: true,
      guarantorAccepted: true,
      notes: '',                     // free-text — but flagged "no discriminatory criteria"
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  // Generate a descriptive name for a listing based on its unit
  const listingDisplayName = (listing) => {
    if (!listing) return 'Untitled listing';
    if (listing.name && listing.name !== 'My listing') return listing.name;
    if (listing.unit?.address) return listing.unit.address.slice(0, 50);
    if (listing.unit?.monthlyRent) return `$${listing.unit.monthlyRent}/mo unit`;
    return listing.name || 'Untitled listing';
  };

  // Switch to a different listing. Saves current in-view state into the previous listing first.
  const switchToListing = (newListingId) => {
    if (newListingId === activeListingId) {
      setListingsSwitcherOpen(false);
      return;
    }
    // Save current state into the currently-active listing
    const updatedListings = listings.map(l =>
      l.id === activeListingId
        ? { ...l, applications, decisions, unit }
        : l
    );
    // Find the new listing and load its data
    const target = updatedListings.find(l => l.id === newListingId);
    if (target) {
      setApplications(target.applications || []);
      setDecisions(target.decisions || {});
      setUnit(target.unit || { address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
      setActiveListingId(newListingId);
      // Reset view to start of review for the new listing
      setReviewIdx(0);
      setView('review');
    }
    setListings(updatedListings);
    setListingsSwitcherOpen(false);
    setWelcomeBackDismissed(false); // re-show welcome for new context
  };

  // "New listing" → open the Listing Setup modal in CREATE mode. A draft listing
  // is created up-front and switched to (so the modal's existing unit/preferences
  // bindings work), but Cancel discards it entirely — so cancelling creates
  // nothing, and only Save (gated on address + rent + bedrooms) keeps it.
  const createNewListing = () => {
    // Save current state to the current listing first
    const updatedListings = listings.map(l =>
      l.id === activeListingId
        ? { ...l, applications, decisions, unit }
        : l
    );
    const newListing = makeListing({ name: 'New listing' });
    setListings([...updatedListings, newListing]);
    setPreCreateListingId(activeListingId);
    setActiveListingId(newListing.id);
    setApplications([]);
    setDecisions({});
    setUnit({ address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
    setReviewIdx(0);
    setView('review');
    setListingsSwitcherOpen(false);
    setWelcomeBackDismissed(true); // skip welcome for empty new listing
    setCreatingListing(true);
    setPreferencesOpen(true);
  };

  // Commit the draft listing created by "New listing" (unit is already mirrored
  // into the listing by the auto-sync effect; just name it from its address).
  const saveListingSetup = () => {
    if (creatingListing) {
      const name = (unit.address && unit.address.trim()) ? unit.address.trim() : 'New listing';
      setListings(prev => prev.map(l => l.id === activeListingId ? { ...l, name, unit } : l));
      setCreatingListing(false);
      setPreCreateListingId(null);
      setWelcomeBackDismissed(false); // show the guided dashboard for the new listing
    }
    setPreferencesOpen(false);
  };

  // Close the Listing Setup modal. In create mode this discards the draft listing
  // and restores the previously-active listing, so cancelling creates nothing.
  const cancelListingSetup = () => {
    if (creatingListing) {
      const remaining = listings.filter(l => l.id !== activeListingId);
      setListings(remaining);
      const restore = remaining.find(l => l.id === preCreateListingId) || remaining[remaining.length - 1] || null;
      if (restore) {
        setActiveListingId(restore.id);
        setApplications(restore.applications || []);
        setDecisions(restore.decisions || {});
        setUnit(restore.unit || { address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
      } else {
        setActiveListingId(null);
        setApplications([]);
        setDecisions({});
        setUnit({ address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
      }
      setReviewIdx(0);
      setView('review');
      setCreatingListing(false);
      setPreCreateListingId(null);
    }
    setPreferencesOpen(false);
  };

  // Rename a listing
  const renameListing = (listingId, newName) => {
    const cleaned = String(newName || '').trim().slice(0, 80);
    if (!cleaned) return;
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, name: cleaned } : l));
    setRenamingListingId(null);
    setRenameInput('');
  };

  // Delete a listing (with safety: can't delete the last one)
  const deleteListing = (listingId) => {
    if (listings.length <= 1) {
      alert('You need at least one listing. Create a new one before deleting this.');
      return;
    }
    const wasActive = listingId === activeListingId;
    const remaining = listings.filter(l => l.id !== listingId);
    setListings(remaining);
    if (wasActive) {
      // Switch to the first remaining listing
      const next = remaining[0];
      setActiveListingId(next.id);
      setApplications(next.applications || []);
      setDecisions(next.decisions || {});
      setUnit(next.unit || { address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
      setReviewIdx(0);
      setView('review');
    }
    setListingsSwitcherOpen(false);
  };

  // Sync the in-view state back into the active listing automatically whenever it changes.
  // This keeps the listings array as the source of truth.
  useEffect(() => {
    if (!activeListingId || listings.length === 0) return;
    setListings(prev => prev.map(l =>
      l.id === activeListingId
        ? { ...l, applications, decisions, unit }
        : l
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, decisions, unit]);

  // Load workspace from server when signed in
  // Optional opts.mergeApps / mergeDecisions / mergeUnit: data from local sessionStorage that
  // existed BEFORE sign-in. We merge it into the server response so unsigned work isn't lost.
  const loadWorkspace = async (token, opts = {}) => {
    const { mergeApps = [], mergeDecisions = {}, mergeUnit = null } = opts;
    console.log('[workspace] Loading workspace from server...');
    let serverApps = [];
    let serverDecisions = {};
    let serverUnit = null;
    try {
      const r = await fetch('/api/landlord/workspace', {
        method: 'GET',
        headers: { 'x-rl-session': token },
      });
      console.log('[workspace] Response status:', r.status);
      if (!r.ok) {
        // 503 = transient server error — keep the session, just bail out gracefully
        if (r.status === 503) {
          console.warn('[workspace] Transient error 503 — keeping session, will retry on next interaction');
          setWorkspaceReady(true);
          setWorkspaceLoading(false);
          return;
        }
        // 401 = session genuinely invalid/expired — only NOW wipe the session
        if (r.status === 401) {
          console.warn('[workspace] Session 401 — signing out');
          localStorage.removeItem('rentletter_landlord_session');
          localStorage.removeItem('rentletter_landlord_email');
          setSessionToken('');
          setSignedInEmail('');
        }
        setWorkspaceReady(true);
        setWorkspaceLoading(false);
        return;
      }
      const json = await r.json();
      console.log('[workspace] Server returned:', {
        appsCount: json.applications?.length || 0,
        decisionsCount: json.decisions ? Object.keys(json.decisions).length : 0,
        hasUnit: !!json.unit,
      });
      if (json.applications && Array.isArray(json.applications)) serverApps = json.applications;
      if (json.decisions && typeof json.decisions === 'object') serverDecisions = json.decisions;
      if (json.unit && typeof json.unit === 'object') serverUnit = json.unit;
      // Load realtor profile from server if present
      if (json.realtorProfile && typeof json.realtorProfile === 'object') {
        setRealtorProfile(prev => ({ ...prev, ...json.realtorProfile }));
        if (json.realtorProfile.isRealtor === true || json.realtorProfile.isRealtor === false) {
          setRealtorOnboardingShown(true);
        }
      }
      // Load multi-listing data if present
      if (json.listings && Array.isArray(json.listings) && json.listings.length > 0) {
        const validListings = json.listings.filter(l => l && l.id && typeof l === 'object');
        if (validListings.length > 0) {
          // Use server's listings
          const targetActive = json.activeListingId && validListings.find(l => l.id === json.activeListingId)
            ? json.activeListingId
            : validListings[0].id;
          const active = validListings.find(l => l.id === targetActive) || validListings[0];
          setListings(validListings);
          setActiveListingId(active.id);
          // Hydrate in-view state from the active listing
          setApplications(active.applications || []);
          setDecisions(active.decisions || {});
          setUnit(active.unit || { address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
          setWorkspaceReady(true);
          setWorkspaceLoading(false);
          console.log('[workspace] Loaded', validListings.length, 'listings, active:', active.name);
          return; // Skip the flat-data merge path below
        }
      }
    } catch (e) {
      console.error('[workspace] Load error:', e);
    }

    // Merge local-pending work with server workspace (flat-data path; runs only when no multi-listing data exists)
    // Apps: union by applicationNumber (server wins for conflicts since they're newer if updated)
    // Decisions: server wins for any keys it has, local fills gaps
    // Unit: server wins if set, otherwise use local
    const appsByNumber = new Map();
    for (const a of mergeApps) {
      if (a?.applicationNumber) appsByNumber.set(a.applicationNumber, a);
    }
    for (const a of serverApps) {
      if (a?.applicationNumber) appsByNumber.set(a.applicationNumber, a);
    }
    const mergedApps = Array.from(appsByNumber.values());
    const mergedDecisions = { ...mergeDecisions, ...serverDecisions };
    const serverUnitHasData = serverUnit && (serverUnit.address || serverUnit.monthlyRent || serverUnit.bedrooms);
    const mergedUnit = serverUnitHasData ? serverUnit : (mergeUnit || serverUnit);

    console.log('[workspace] Merged (flat):', {
      localApps: mergeApps.length,
      serverApps: serverApps.length,
      mergedApps: mergedApps.length,
      localDecisions: Object.keys(mergeDecisions).length,
      serverDecisions: Object.keys(serverDecisions).length,
      mergedDecisions: Object.keys(mergedDecisions).length,
    });

    if (mergedApps.length > 0) setApplications(mergedApps);
    if (Object.keys(mergedDecisions).length > 0) setDecisions(mergedDecisions);
    if (mergedUnit) setUnit(mergedUnit);

    // MIGRATION: If user has flat data but no listings, wrap it in a default listing
    const migratedListing = makeListing({
      name: mergedUnit?.address ? mergedUnit.address.slice(0, 50) : 'My first listing',
      applications: mergedApps,
      decisions: mergedDecisions,
      unit: mergedUnit || { address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' },
    });
    setListings([migratedListing]);
    setActiveListingId(migratedListing.id);

    setWorkspaceReady(true);
    setWorkspaceLoading(false);
  };

  // Send a sign-in request. The server returns a session token immediately so THIS device
  // is signed in without needing the email. The email is also sent so the user can sign in
  // on OTHER devices later (phone, etc.)
  // Frontend email validation for the sign-in screen. Trim + standard format
  // regex; the server still re-validates. Used to gate the "Sign in" button.
  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
  const signinEmailValid = isValidEmail(signinEmailInput);

  const requestSigninLink = async () => {
    setSigninError('');
    const cleaned = String(signinEmailInput || '').trim();
    if (!isValidEmail(cleaned)) {
      setSigninError('Enter a valid email address.');
      return;
    }
    setSigninLoading(true);
    let response = null;
    let bodyText = null;
    try {
      response = await fetch('/api/landlord/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleaned }),
      });
      bodyText = await response.text();

      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (parseErr) {
        console.error('[sign-in] Non-JSON response:', { status: response.status, bodyText });
        throw new Error(`Server returned ${response.status} ${response.statusText}. ${bodyText ? bodyText.slice(0, 120) : ''}`);
      }

      if (!response.ok) {
        console.error('[sign-in] HTTP error:', { status: response.status, json });
        throw new Error(json?.error || `Sign-in failed (HTTP ${response.status})`);
      }
      if (json?.error) {
        console.error('[sign-in] Server returned error:', json.error);
        throw new Error(json.error);
      }

      // SUCCESS — server returned a session token. Sign in THIS device immediately.
      if (json?.sessionToken && json?.email) {
        const previousEmail = localStorage.getItem('rentletter_landlord_email');
        const isDifferentAccount = previousEmail && previousEmail.toLowerCase() !== json.email.toLowerCase();

        // If switching to a DIFFERENT account, wipe all local state so we don't
        // leak the previous user's applicants, decisions, listings, or realtor profile.
        if (isDifferentAccount) {
          console.log('[sign-in] Different account — clearing previous local state');
          try {
            sessionStorage.removeItem('landlord_apps');
            sessionStorage.removeItem('landlord_decisions');
            sessionStorage.removeItem('landlord_unit');
          } catch (e) {}
          setApplications([]);
          setDecisions({});
          setUnit({ address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
          setListings([]);
          setActiveListingId(null);
          setRealtorProfile({ isRealtor: true, fullName: '', brokerage: '', phone: '', licenseNumber: '' });
          setRealtorOnboardingShown(false);
        }

        // Capture any pre-signin local work before workspace load.
        // Only do this for a FRESH sign-in (same account or no prior account) —
        // never carry one account's work into a different account.
        let pendingLocalApps = [];
        let pendingLocalDecisions = {};
        let pendingLocalUnit = null;
        if (!isDifferentAccount) {
          try {
            const s = sessionStorage.getItem('landlord_apps');
            if (s) pendingLocalApps = JSON.parse(s) || [];
          } catch (e) {}
          try {
            const s = sessionStorage.getItem('landlord_decisions');
            if (s) pendingLocalDecisions = JSON.parse(s) || {};
          } catch (e) {}
          try {
            const s = sessionStorage.getItem('landlord_unit');
            if (s) pendingLocalUnit = JSON.parse(s);
          } catch (e) {}
        }

        // Set session state
        setSessionToken(json.sessionToken);
        setSignedInEmail(json.email);
        localStorage.setItem('rentletter_landlord_session', json.sessionToken);
        localStorage.setItem('rentletter_landlord_email', json.email);

        // Show celebration
        setJustSignedIn(true);
        setTimeout(() => setJustSignedIn(false), 5000);

        // Close modal and reset its state
        setSigninModalOpen(false);
        setSigninLinkSent(false);

        // Track whether email was actually sent so user knows
        if (json.emailSent === false) {
          console.warn('[sign-in] Signed in but email send failed:', json.emailError);
        }

        // Load workspace + merge any pre-signin local work
        await loadWorkspace(json.sessionToken, {
          mergeApps: pendingLocalApps,
          mergeDecisions: pendingLocalDecisions,
          mergeUnit: pendingLocalUnit,
        });
        console.log('[sign-in] Signed in instantly on this device as', json.email);
      } else {
        // Old API response format that doesn't return session token — just show "check email"
        setSigninLinkSent(true);
      }
    } catch (e) {
      console.error('[sign-in] Caught error:', e, { status: response?.status, bodyText });
      const msg = e?.message || 'Could not send sign-in link.';
      if (/did not match the expected pattern/i.test(msg)) {
        setSigninError(`Could not connect to the sign-in service. (HTTP ${response?.status || '?'}) Please try again, or contact support if this keeps happening.`);
      } else {
        setSigninError(msg);
      }
    }
    setSigninLoading(false);
  };

  const signOut = () => {
    // Clear auth
    localStorage.removeItem('rentletter_landlord_session');
    localStorage.removeItem('rentletter_landlord_email');
    setSessionToken('');
    setSignedInEmail('');
    // Clear all working data so the next sign-in starts clean (no data leak between accounts)
    try {
      sessionStorage.removeItem('landlord_apps');
      sessionStorage.removeItem('landlord_decisions');
      sessionStorage.removeItem('landlord_unit');
    } catch (e) {}
    setApplications([]);
    setDecisions({});
    setUnit({ address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
    setListings([]);
    setActiveListingId(null);
    setRealtorProfile({ isRealtor: true, fullName: '', brokerage: '', phone: '', licenseNumber: '' });
    setRealtorOnboardingShown(false);
    setView('review');
    setReviewIdx(0);
    setWelcomeBackDismissed(false);
    setWorkspaceReady(false);
  };

  const lookupApplication = async () => {
    setError('');
    if (!appNumberInput.trim()) {
      setError('Please enter an application number.');
      return;
    }
    const normalized = appNumberInput.trim().toUpperCase();
    if (applications.find(a => a.applicationNumber === normalized)) {
      setError('That application is already loaded.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/landlord/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationNumber: normalized }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setApplications(prev => [...prev, json.application]);
      setAppNumberInput('');
      setActiveAppIdx(applications.length);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const removeApplication = (appNumber) => {
    setApplications(prev => prev.filter(a => a.applicationNumber !== appNumber));
    if (activeAppIdx >= applications.length - 1) {
      setActiveAppIdx(Math.max(0, applications.length - 2));
    }
  };

  const clearAll = () => {
    if (!confirm('Clear all loaded applications? Your decisions will also be cleared.')) return;
    setApplications([]);
    setActiveAppIdx(0);
    setDecisions({});
    setReviewIdx(0);
    setReviewExpanded(false);
    setView(simpleMode ? 'review' : 'detail');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('landlord_apps');
      sessionStorage.removeItem('landlord_decisions');
    }
  };

  // Email the signed-in user a summary of their current shortlist + decisions.
  // Useful for forwarding to a co-owner or business partner.
  const emailSummary = async () => {
    if (!sessionToken) {
      setError('Please sign in first to receive an email summary.');
      return;
    }
    setEmailingSummary(true);
    setEmailSummarySent(false);
    setError('');
    try {
      const r = await fetch('/api/landlord/email-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({ applications, decisions, unit, realtorProfile, listings, activeListingId }),
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}
      if (r.ok && json?.ok) {
        setEmailSummarySent(true);
        // Auto-clear the success state after 5 seconds
        setTimeout(() => setEmailSummarySent(false), 5000);
      } else {
        setError(json?.error || 'Could not send the summary email. Please try again.');
      }
    } catch (e) {
      setError('Could not send the summary email. Please check your connection.');
      console.error('[email-summary] error:', e);
    }
    setEmailingSummary(false);
  };

  // ─── REALTOR: Send shortlist to landlord client ─────
  // Sends a co-branded email to a landlord with the shortlist + optional personal note
  const [sendToLandlordOpen, setSendToLandlordOpen] = useState(false);
  const [sendToLandlordEmail, setSendToLandlordEmail] = useState('');
  const [sendToLandlordNote, setSendToLandlordNote] = useState('');
  const [sendToLandlordLoading, setSendToLandlordLoading] = useState(false);
  const [sendToLandlordSent, setSendToLandlordSent] = useState(false);

  // ── Invite link state ──
  // Each listing can have its own invite token stored in the listing record.
  // Realtors share rentletter.ca/apply/[token] with tenants.
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // ── Landlord preferences modal state ──
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  // When the preferences modal is opened in CREATE mode (via "New listing"),
  // a draft listing is created up-front; Cancel discards it (so cancel = create
  // nothing) and Save commits it. preCreateListingId remembers which listing to
  // restore to if the user cancels.
  const [creatingListing, setCreatingListing] = useState(false);
  const [preCreateListingId, setPreCreateListingId] = useState(null);

  // ── Account status (founder / trial / lapsed) ──
  // Fetched after sign-in. Drives the dashboard banner + paywall.
  const [accountStatus, setAccountStatus] = useState(null); // { status, daysLeft, locked, signupNumber }
  const [accountStatusLoaded, setAccountStatusLoaded] = useState(false);

  useEffect(() => {
    if (!sessionToken) {
      setAccountStatus(null);
      setAccountStatusLoaded(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch('/api/landlord/account-status', {
          method: 'GET',
          headers: { 'x-rl-session': sessionToken },
        });
        const json = await r.json();
        if (r.ok) {
          setAccountStatus(json);
        }
      } catch (e) {
        console.error('[account-status]', e);
      } finally {
        setAccountStatusLoaded(true);
      }
    })();
  }, [sessionToken]);

  // Update preferences on the active listing
  const updateActivePreferences = (patch) => {
    setListings(prev => prev.map(l => {
      if (l.id !== activeListingId) return l;
      return {
        ...l,
        preferences: { ...(l.preferences || {}), ...patch },
      };
    }));
  };

  // Helper: get current active listing's preferences (or defaults if missing)
  const getActivePreferences = () => {
    const al = listings.find(l => l.id === activeListingId);
    return al?.preferences || {
      minAnnualIncome: '', rentToIncomeMaxPct: 30, minYearsAtJob: '',
      acceptableEmployment: { fullTime: true, contract: true, selfEmployed: false, partTime: false },
      earliestMoveIn: '', latestMoveIn: '', minLeaseTermMonths: 12,
      maxOccupants: '', smokingAllowed: false, petsPolicy: 'case-by-case', parkingSpots: '',
      requiresLandlordReference: true, requiresEmployerVerification: true,
      guarantorAccepted: true, notes: '',
    };
  };

  // Count how many preferences are set (for "0 of N preferences set" badge)
  const countPreferencesSet = (prefs) => {
    if (!prefs) return 0;
    let n = 0;
    if (prefs.minAnnualIncome) n++;
    if (prefs.minYearsAtJob) n++;
    if (prefs.earliestMoveIn) n++;
    if (prefs.latestMoveIn) n++;
    if (prefs.maxOccupants) n++;
    if (prefs.parkingSpots) n++;
    if (prefs.notes) n++;
    return n;
  };

  const createOrGetInviteLink = async () => {
    if (!sessionToken) {
      setError('Sign in first.');
      return;
    }
    const activeListing = listings.find(l => l.id === activeListingId);
    if (!activeListing) {
      setError('Pick a listing first.');
      return;
    }
    setInviteLoading(true);
    setError('');
    try {
      const r = await fetch('/api/landlord/create-invite-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({
          listingId: activeListing.id,
          listingName: listingDisplayName(activeListing),
          unit: activeListing.unit,
          realtorProfile,
          existingInvite: activeListing.inviteToken || null,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json?.error || 'Could not create invite link.');
        setInviteLoading(false);
        return;
      }
      // Save the invite token into the listing record so it persists
      setListings(prev => prev.map(l =>
        l.id === activeListingId
          ? { ...l, inviteToken: json.token, inviteUrl: json.url }
          : l
      ));
      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(json.url);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 3000);
      } catch (e) { /* clipboard may not be available */ }
    } catch (e) {
      setError('Could not create invite link.');
      console.error('[invite-link]', e);
    }
    setInviteLoading(false);
  };

  // Pull invite submissions on dashboard load — auto-populate listings with submitted RL numbers
  useEffect(() => {
    if (!sessionToken || !workspaceReady || listings.length === 0) return;
    const tokens = listings.map(l => l.inviteToken).filter(Boolean);
    if (tokens.length === 0) return;

    (async () => {
      try {
        const r = await fetch('/api/landlord/get-invite-submissions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-rl-session': sessionToken,
          },
          body: JSON.stringify({ inviteTokens: tokens }),
        });
        const json = await r.json();
        if (!r.ok || !json.submissions) return;

        // For each invite, check if any submitted RL numbers aren't yet in that listing.
        // If so, look them up and add them.
        for (const [token, sub] of Object.entries(json.submissions)) {
          const targetListing = listings.find(l => l.inviteToken === token);
          if (!targetListing) continue;
          const existingNumbers = new Set((targetListing.applications || []).map(a => a.applicationNumber));
          const newNumbers = (sub.applicationNumbers || []).filter(n => !existingNumbers.has(n));
          if (newNumbers.length === 0) continue;

          // Look up each new number via /api/landlord/lookup
          for (const appNum of newNumbers) {
            try {
              const lookupRes = await fetch('/api/landlord/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationNumber: appNum }),
              });
              const lookupJson = await lookupRes.json();
              if (lookupRes.ok && lookupJson.application) {
                // Add to the listing
                setListings(prev => prev.map(l => {
                  if (l.id !== targetListing.id) return l;
                  const existing = new Set((l.applications || []).map(a => a.applicationNumber));
                  if (existing.has(appNum)) return l;
                  return { ...l, applications: [...(l.applications || []), lookupJson.application] };
                }));
                // If it's the currently-active listing, also update in-view state
                if (targetListing.id === activeListingId) {
                  setApplications(prev => {
                    if (prev.find(a => a.applicationNumber === appNum)) return prev;
                    return [...prev, lookupJson.application];
                  });
                }
              }
            } catch (e) { /* skip */ }
          }
        }
      } catch (e) {
        console.error('[get-invite-submissions]', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, workspaceReady, listings.map(l => l.inviteToken).filter(Boolean).join(',')]);

  const sendShortlistToLandlord = async () => {
    if (!sessionToken) {
      setError('Please sign in first.');
      return;
    }
    const cleanedEmail = String(sendToLandlordEmail || '').trim();
    if (!cleanedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      setError('Enter a valid email for your landlord client.');
      return;
    }
    setSendToLandlordLoading(true);
    setError('');

    // Shortlisted apps only
    const shortlistedApps = applications.filter(a => decisions?.[a.applicationNumber]?.status === 'shortlist');
    const shortlistedNumbers = shortlistedApps.map(a => a.applicationNumber);

    if (shortlistedNumbers.length === 0) {
      setError('Shortlist some applicants first before sending.');
      setSendToLandlordLoading(false);
      return;
    }

    try {
      // Check if this listing was already shared with this landlord — if so, update existing share
      const activeListing = listings.find(l => l.id === activeListingId);
      const existingShare = activeListing?.shareToken && activeListing?.sharedWithEmail === cleanedEmail
        ? activeListing.shareToken
        : null;

      // Step 1: Create or update the share token
      const tokenRes = await fetch('/api/landlord/create-share-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({
          existingToken: existingShare,
          applicationNumbers: shortlistedNumbers,
          applicants: shortlistedApps, // Full applicant snapshots — survives demo data + tenant revocation
          decisions,
          realtorProfile,
          landlordEmail: cleanedEmail,
          unit,
          listingId: activeListingId,
          preferences: activeListing?.preferences || null,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.ok) {
        setError(tokenJson?.error || 'Could not create share link.');
        setSendToLandlordLoading(false);
        return;
      }
      const shareUrl = tokenJson.url;
      const shareToken = tokenJson.token;

      // Step 2: Send the email with the shareUrl included
      const r = await fetch('/api/landlord/send-to-landlord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({
          applications,
          decisions,
          unit,
          realtorProfile,
          landlordEmail: cleanedEmail,
          note: String(sendToLandlordNote || '').slice(0, 1000),
          shareUrl,
          isUpdate: !!existingShare,
        }),
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}
      if (r.ok && json?.ok) {
        // Step 3: Save the share token + landlord email into the active listing so future sends update it
        setListings(prev => prev.map(l =>
          l.id === activeListingId
            ? { ...l, shareToken, sharedWithEmail: cleanedEmail, sharedAt: new Date().toISOString() }
            : l
        ));
        setSendToLandlordSent(true);
        setTimeout(() => {
          setSendToLandlordSent(false);
          setSendToLandlordOpen(false);
          setSendToLandlordEmail('');
          setSendToLandlordNote('');
        }, 2500);
      } else {
        setError(json?.error || 'Could not send to landlord. Please try again.');
      }
    } catch (e) {
      setError('Could not send to landlord. Please check your connection.');
      console.error('[send-to-landlord] error:', e);
    }
    setSendToLandlordLoading(false);
  };

  // ─── DEMO SANDBOX LOADER ───
  // One listing pre-populated with a mixed cross-section of sample applicants.
  // The demo starts with ZERO decisions — the visitor reviews under All applicants
  // and favourites/rejects themselves, which is the only way My shortlist fills.
  // Runs on the /demo/dashboard route. No session, no Supabase, no writes.
  // Re-seed the demo workspace to its initial state (used by a "reset demo" affordance
  // if present). State is already seeded from DEMO_* on first render.
  const loadPMCDemo = () => {
    setRealtorProfile(DEMO_REALTOR);
    setRealtorOnboardingShown(true);
    setListings([DEMO_LISTING]);
    setActiveListingId(DEMO_LISTING.id);
    setApplications(DEMO_LISTING.applications);
    setDecisions({}); // My shortlist starts empty
    setUnit(DEMO_UNIT);
    setReviewIdx(0);
    setView('review');
    setWorkspaceReady(true);
    setWorkspaceLoading(false);
    setWelcomeBackDismissed(true);
  };

  // ════════════════════════════════════════════════════════════
  // PAGE LAYOUT
  // ════════════════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>Sample Dashboard (Demo) — Rentletter</title>
        <meta name="description" content="Verify, compare, and rank tenant applications. Built for realtors." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>

        {/* ── DEMO MODE BAR — the single top bar for the /demo sample dashboard ── */}
        {demoMode && (
          <div style={{
            background: C.ink, color: C.paper,
            padding: '9px clamp(14px, 4vw, 24px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: 'clamp(8px, 2vw, 14px)', flexWrap: 'wrap', textAlign: 'center',
          }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: R.pill,
              background: C.red, color: C.paper, fontSize: 9.5, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              Sandbox
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 500, opacity: 0.9 }}>Sample data — nothing is saved.</span>
            <a href="/" style={{ color: C.paper, fontWeight: 600, fontSize: 12.5, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
              Exit demo →
            </a>
          </div>
        )}

        {/* ── TOP STRIP ─────────────────────────────────────── */}
        {/* Hidden in demo mode so the sample dashboard shows a single clean bar. */}
        {!demoMode && (
        <div style={{
          background: C.ink, color: C.inkInverse,
          padding: '9px clamp(20px, 4vw, 32px)', fontSize: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="rl-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red }}>Dashboard</span>
            <span style={{ color: C.inkInverse }}>Free for realtors during launch</span>
          </span>
          <a href="/" style={{ color: C.inkInverse, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Back to Rentletter
          </a>
        </div>
        )}

        {/* ── HEADER ─────────────────────────────────────────── */}
        <ScrollHeader maxWidth={1400}>
            <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}>
              <Wordmark />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.inkMute, flexWrap: 'wrap' }}>
              {signedInEmail ? (
                <>
                  {/* Account identity */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.inkSoft, fontWeight: 500 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                    {signedInEmail}
                  </span>
                  {/* Realtor profile pill */}
                  {realtorProfile.isRealtor && (
                    <button onClick={() => setRealtorEditOpen(true)} className="rl-btn" title="Edit your realtor profile"
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: R.pill,
                        background: C.ink, color: C.paper,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                      }}>
                      <span style={{ fontSize: 9, opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Realtor</span>
                      {realtorProfile.fullName || 'Add details'}
                      {realtorProfile.brokerage && (
                        <span style={{ opacity: 0.65 }}>· {realtorProfile.brokerage.length > 22 ? realtorProfile.brokerage.slice(0, 22) + '…' : realtorProfile.brokerage}</span>
                      )}
                    </button>
                  )}
                  {/* Sync status pill */}
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: R.pill,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: syncStatus === 'synced' ? C.greenTint : syncStatus === 'error' ? C.redTint : C.paperDeep,
                    color: syncStatus === 'synced' ? C.green : syncStatus === 'error' ? C.red : C.inkMute,
                    border: `1px solid ${syncStatus === 'synced' ? C.green : syncStatus === 'error' ? C.red : C.rule}`,
                  }}>
                    {syncStatus === 'synced' && <><Icon name="check" size={13} color={C.green} strokeWidth={2} /> Saved</>}
                    {syncStatus === 'syncing' && 'Saving…'}
                    {syncStatus === 'error' && <><Icon name="x" size={13} color={C.red} strokeWidth={2} /> Not saved</>}
                    {syncStatus === 'idle' && '—'}
                  </span>
                  {(syncStatus === 'error' || syncStatus === 'idle') && (
                    <button onClick={forceSyncNow} className="rl-btn"
                      style={{ background: C.red, color: C.paper, padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: R.ctrl }}>
                      Save now
                    </button>
                  )}
                  <button onClick={signOut}
                    style={{ background: 'transparent', color: C.inkMute, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    Sign out
                  </button>
                </>
              ) : (
                <button onClick={() => { window.location.href = '/signin'; }}
                  className="rl-btn" style={{
                    background: C.ink, color: C.paper, padding: '11px 18px', fontSize: 13, fontWeight: 600,
                    borderRadius: R.ctrl, display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                  <Icon name="mail" size={15} /> Sign in &amp; save on all devices
                </button>
              )}
            </div>
        </ScrollHeader>

        <div style={{
          maxWidth: 1400, margin: '0 auto',
          padding: (applications.length === 0 && !workspaceLoading) ? '0' : 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 40px',
          minWidth: 0,
        }}>

          {/* ── SIGN-IN GATE — shown when not signed in and not loading. SKIPPED in demo mode. ── */}
          {!sessionToken && !workspaceLoading && !demoMode && (
            <section style={{
              minHeight: 'calc(100vh - 200px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 'clamp(32px, 8vw, 80px) clamp(20px, 4vw, 40px)',
              textAlign: 'center',
            }}>
              <div style={{ maxWidth: 540 }}>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>
                  Rentletter dashboard
                </div>
                <h1 style={{
                  fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 800,
                  color: C.ink, letterSpacing: '-0.035em', lineHeight: 1.05,
                  marginBottom: 18,
                }}>
                  Sign in to your dashboard.
                </h1>
                <p style={{
                  fontSize: 'clamp(15px, 3.2vw, 17px)', color: C.inkSoft,
                  lineHeight: 1.55, marginBottom: 32,
                }}>
                  Enter your email. We sign you in right here. Your listings and applicants stay on your account across devices.
                </p>

                {/* The actual sign-in input inline (no modal needed for first-time) */}
                <div style={{ maxWidth: 420, margin: '0 auto' }}>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={signinEmailInput}
                    onChange={e => setSigninEmailInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && requestSigninLink()}
                    placeholder="your email address"
                    style={{
                      width: '100%', padding: '16px 18px', fontSize: 16,
                      border: `1px solid ${C.ink}`, background: C.paper, color: C.ink,
                      outline: 'none', marginBottom: 12,
                      textAlign: 'center',
                    }}
                  />
                  {(signinError || (signinEmailInput.trim() && !signinEmailValid)) && (
                    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink, textAlign: 'left' }}>
                      {signinError || 'Enter a valid email address.'}
                    </div>
                  )}
                  <button
                    onClick={requestSigninLink}
                    disabled={signinLoading || !signinEmailValid}
                    style={{
                      width: '100%',
                      background: (signinLoading || !signinEmailValid) ? '#c8c2b3' : C.red,
                      color: C.paper, border: 'none', padding: '18px',
                      fontSize: 16, fontWeight: 700,
                      cursor: (signinLoading || !signinEmailValid) ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.01em', minHeight: 56,
                    }}>
                    {signinLoading ? 'Signing you in...' : 'Sign in →'}
                  </button>
                  <p style={{ fontSize: 12, color: C.inkMute, marginTop: 14, lineHeight: 1.5 }}>
                    No password. We'll also email you a link for signing in on other devices.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* All dashboard content below only renders when signed in, loading, OR
              in demo mode (the /demo sample dashboard has no session). */}
          {(sessionToken || workspaceLoading || demoMode) && (
          <>

          {/* ── JUST-SIGNED-IN CELEBRATION ──────────────── */}
          {justSignedIn && (
            <section style={{ padding: 'clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px) 0' }}>
              <div style={{
                background: C.green,
                color: C.paper,
                borderRadius: R.card,
                padding: 'clamp(16px, 4vw, 22px) clamp(18px, 4vw, 26px)',
                display: 'flex', alignItems: 'center', gap: 14,
                flexWrap: 'wrap',
                animation: 'slideIn 0.4s ease-out',
              }}>
                <div style={{
                  background: C.paper, color: C.green,
                  width: 36, height: 36, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 800,
                  flexShrink: 0,
                }}>
                  ✓
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 'clamp(15px, 3.5vw, 17px)', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    You're signed in.
                  </div>
                  <div style={{ fontSize: 'clamp(12px, 2.8vw, 13px)', opacity: 0.92, marginTop: 3 }}>
                    Your work now syncs across all your devices automatically.
                  </div>
                </div>
                <button onClick={() => setJustSignedIn(false)}
                  style={{ background: 'transparent', border: 'none', color: C.paper, fontSize: 22, cursor: 'pointer', opacity: 0.7, padding: 4, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <style jsx>{`
                @keyframes slideIn {
                  from { opacity: 0; transform: translateY(-12px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </section>
          )}

          {/* ── ERROR BANNER — always visible if there's an error ── */}
          {error && (
            <section style={{ padding: 'clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px) 0' }}>
              <div style={{
                background: '#fef2f0',
                border: `1px solid ${C.red}`,
                borderRadius: R.ctrl,
                borderLeft: `4px solid ${C.red}`,
                padding: '14px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{ flex: 1, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
                  {error}
                </div>
                <button onClick={() => setError('')}
                  style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
            </section>
          )}

          {/* ── ACCOUNT STATUS BANNER ──────────────────────── */}
          {/* Shows founder badge, trial countdown, or lapsed message. */}
          {accountStatus && (
            <section style={{ padding: 'clamp(12px, 2.5vw, 18px) clamp(16px, 4vw, 32px) 0' }}>
              {accountStatus.status === 'founder' && (
                <ScrollFade>
                  <div style={{
                    background: C.greenTint, border: `1px solid ${C.green}`, borderRadius: R.card,
                    padding: 'clamp(13px, 3vw, 17px) clamp(16px, 4vw, 22px)',
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  }}>
                    <span style={{
                      background: C.green, color: C.paper, borderRadius: R.pill,
                      padding: '5px 12px', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      <Icon name="check" size={13} strokeWidth={2.5} /> Founding member{accountStatus.signupNumber ? ` · #${accountStatus.signupNumber} of 50` : ''}
                    </span>
                    <span style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
                      You're one of the first realtors on Rentletter. Free forever — thank you for being early.
                    </span>
                  </div>
                </ScrollFade>
              )}

              {accountStatus.status === 'trial' && (
                <div style={{
                  background: C.amberTint,
                  border: `1px solid ${C.amber}`,
                  borderLeft: `4px solid ${C.amber}`,
                  borderRadius: R.card,
                  padding: 'clamp(13px, 3vw, 17px) clamp(16px, 4vw, 22px)',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                    <span style={{
                      background: C.amber, color: C.paper, borderRadius: R.pill,
                      padding: '5px 12px', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      Trial · {accountStatus.daysLeft} {accountStatus.daysLeft === 1 ? 'day' : 'days'} left
                    </span>
                    <span style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
                      $49.99/month (HST included) when your trial ends.
                    </span>
                  </div>
                  <a className="rl-btn"
                    href="mailto:info@rentletter.ca?subject=Subscribe%20to%20Rentletter&body=Hi%20Rentletter%20team%2C%0A%0AI%27d%20like%20to%20subscribe%20to%20Rentletter%20at%20%2449.99%2Fmonth.%0A%0AMy%20email%3A%20%0AMy%20brokerage%3A%20%0A%0AThanks!"
                    style={{
                      background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl,
                      padding: '11px 20px', fontSize: 13, fontWeight: 600,
                      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                    Subscribe <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
                  </a>
                </div>
              )}

              {accountStatus.status === 'lapsed' && accountStatus.locked && (
                <div style={{
                  background: C.redTint,
                  border: `1px solid ${C.red}`,
                  borderLeft: `4px solid ${C.red}`,
                  borderRadius: R.card,
                  padding: 'clamp(16px, 3vw, 22px) clamp(18px, 4vw, 24px)',
                }}>
                  <div style={{ fontSize: 10, color: C.red, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Trial ended
                  </div>
                  <div className="rl-serif" style={{ fontSize: 'clamp(20px, 3vw, 26px)', color: C.ink, letterSpacing: '-0.015em', marginBottom: 8 }}>
                    Your 7-day trial has ended.
                  </div>
                  <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6, marginBottom: 16, maxWidth: 560 }}>
                    To keep using Rentletter, subscribe for $49.99/month (HST included). Email us and we'll set you up — your listings and applicants are saved.
                  </div>
                  <a className="rl-btn"
                    href="mailto:info@rentletter.ca?subject=Subscribe%20to%20Rentletter&body=Hi%20Rentletter%20team%2C%0A%0AMy%20trial%20has%20ended%20and%20I%27d%20like%20to%20subscribe%20to%20Rentletter%20at%20%2449.99%2Fmonth.%0A%0AMy%20email%3A%20%0AMy%20brokerage%3A%20%0A%0AThanks!"
                    style={{
                      background: C.red, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl,
                      padding: '13px 24px', fontSize: 14, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                    <Icon name="mail" size={16} /> Email info@rentletter.ca to subscribe
                  </a>
                </div>
              )}
            </section>
          )}

          {/* ── WORKSPACE LOADING STATE ──────────────────── */}
          {/* Shown while we fetch the user's saved workspace. Prevents flash of empty hero. */}
          {workspaceLoading && (
            <section style={{
              minHeight: '60vh',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 'clamp(20px, 4vw, 40px)',
            }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
                One moment
              </div>
              <h2 style={{
                fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800,
                color: C.ink, letterSpacing: '-0.025em',
                marginBottom: 10, textAlign: 'center',
              }}>
                Loading your dashboard.
              </h2>
              <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, textAlign: 'center', maxWidth: 380 }}>
                Fetching your saved applications and decisions.
              </p>
              {/* Subtle animated dots */}
              <div style={{ marginTop: 24, display: 'flex', gap: 6 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: C.red,
                    animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                    display: 'inline-block',
                  }} />
                ))}
              </div>
              <style jsx>{`
                @keyframes pulse {
                  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                  40% { opacity: 1; transform: scale(1.1); }
                }
              `}</style>
            </section>
          )}

          {/* ── RETURNING-USER WELCOME — signed in + has saved work ── */}
          {/* Shows a focused dashboard for signed-in users with applications already loaded. */}
          {!workspaceLoading && signedInEmail && applications.length > 0 && view === 'review' && reviewIdx === 0 && !welcomeBackDismissed && (() => {
            const shortlistedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'shortlist').length;
            const rejectedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'reject').length;
            const undecidedCount = applications.length - shortlistedCount - rejectedCount;

            return (
              <section className="rl-reveal" style={{ marginBottom: 8 }}>
                <div className="rl-card" style={{
                  background: C.ink, color: C.paper, border: 'none',
                  padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 36px)',
                  position: 'relative',
                }}>
                  <button
                    onClick={() => setWelcomeBackDismissed(true)}
                    title="Dismiss"
                    style={{
                      position: 'absolute', top: 12, right: 12,
                      background: 'transparent', border: 'none', color: C.paper,
                      fontSize: 20, opacity: 0.6, cursor: 'pointer',
                      padding: 4, lineHeight: 1,
                    }}>
                    ×
                  </button>
                  <div style={{ fontSize: 11, color: '#f0b8bb', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                    Welcome back
                  </div>
                  <h2 style={{
                    fontSize: 'clamp(26px, 5.5vw, 40px)', fontWeight: 800,
                    color: C.paper, letterSpacing: '-0.025em', lineHeight: 1.1,
                    marginBottom: 8,
                  }}>
                    Your dashboard.
                  </h2>
                  <p style={{ fontSize: 'clamp(14px, 3vw, 16px)', color: '#c8c2b3', lineHeight: 1.5, marginBottom: 24 }}>
                    {applications.length} application{applications.length === 1 ? '' : 's'} loaded.
                    {shortlistedCount > 0 && ` ${shortlistedCount} on your shortlist.`}
                    {undecidedCount > 0 && ` ${undecidedCount} still to review.`}
                  </p>

                  {/* Stat row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                    gap: 10, marginBottom: 24, maxWidth: 540,
                  }}>
                    <div style={{ padding: '14px 16px', background: '#1a1a1c', borderRadius: R.ctrl, borderLeft: `3px solid ${C.inkInverse}` }}>
                      <div className="rl-serif" style={{ fontSize: 28, color: C.paper, lineHeight: 1 }}>{applications.length}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 5, letterSpacing: '0.06em' }}>APPLICANTS</div>
                    </div>
                    <div style={{ padding: '14px 16px', background: '#1a1a1c', borderRadius: R.ctrl, borderLeft: `3px solid ${C.green}` }}>
                      <div className="rl-serif" style={{ fontSize: 28, color: C.green, lineHeight: 1 }}>{shortlistedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 5, letterSpacing: '0.06em' }}>SHORTLISTED</div>
                    </div>
                    <div style={{ padding: '14px 16px', background: '#1a1a1c', borderRadius: R.ctrl, borderLeft: `3px solid ${C.inkMute}` }}>
                      <div className="rl-serif" style={{ fontSize: 28, color: C.paper, lineHeight: 1 }}>{undecidedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 5, letterSpacing: '0.06em' }}>TO REVIEW</div>
                    </div>
                    <div style={{ padding: '14px 16px', background: '#1a1a1c', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}` }}>
                      <div className="rl-serif" style={{ fontSize: 28, color: '#f0b8bb', lineHeight: 1 }}>{rejectedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 5, letterSpacing: '0.06em' }}>REJECTED</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10, maxWidth: 720,
                  }}>
                    {undecidedCount > 0 && (
                      <button
                        onClick={() => {
                          // Find first undecided applicant and jump there
                          const firstUndecided = applications.findIndex(
                            a => !decisions[a.applicationNumber]?.status || decisions[a.applicationNumber].status === 'none'
                          );
                          setReviewIdx(firstUndecided >= 0 ? firstUndecided : 0);
                          setView('review');
                          setWelcomeBackDismissed(true);
                        }}
                        className="rl-btn"
                        style={{
                          background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl,
                          padding: '16px 20px', fontSize: 15, fontWeight: 700,
                          cursor: 'pointer', minHeight: 56, textAlign: 'left',
                        }}>
                        Continue reviewing →
                        <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 4 }}>
                          {undecidedCount} left to decide
                        </div>
                      </button>
                    )}
                    {shortlistedCount > 0 && (
                      <button
                        onClick={() => { setView('ranked'); setWelcomeBackDismissed(true); }}
                        className="rl-btn"
                        style={{
                          background: C.green, color: C.paper, border: 'none', borderRadius: R.ctrl,
                          padding: '16px 20px', fontSize: 15, fontWeight: 700,
                          cursor: 'pointer', minHeight: 56, textAlign: 'left',
                        }}>
                        See my shortlist →
                        <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.9, marginTop: 4 }}>
                          {shortlistedCount} favourite{shortlistedCount === 1 ? '' : 's'}
                        </div>
                      </button>
                    )}
                    <button
                      onClick={() => setWelcomeBackDismissed(true)}
                      className="rl-btn"
                      style={{
                        background: 'transparent', color: C.paper,
                        border: `1px solid rgba(250,248,243,0.4)`, borderRadius: R.ctrl,
                        padding: '16px 20px', fontSize: 15, fontWeight: 600,
                        cursor: 'pointer', minHeight: 56, textAlign: 'left',
                      }}>
                      + Add another application
                      <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginTop: 4 }}>
                        New tenant just applied
                      </div>
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── GUIDED ONBOARDING — signed-in realtor with no applicants yet ── */}
          {sessionToken && realtorProfile.isRealtor && applications.length === 0 && !workspaceLoading && (
            <section className="rl-reveal" style={{ marginBottom: 28 }}>
              <div className="rl-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 36px)', borderBottom: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                    Getting started
                  </div>
                  <h2 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10 }}>
                    {activeListingId ? 'Share your invite link to get applicants.' : 'Add your first listing.'}
                  </h2>
                  <p style={{ fontSize: 'clamp(14px, 3vw, 16px)', color: C.inkSoft, lineHeight: 1.55, maxWidth: 560, marginBottom: 22 }}>
                    {activeListingId
                      ? 'Your listing is set up. Send its invite link to prospective tenants — their applications will appear here automatically.'
                      : 'A listing holds one unit, its invite link, and every application that comes in. Create one to get your shareable link.'}
                  </p>
                  <button
                    onClick={() => activeListingId ? setPreferencesOpen(true) : createNewListing()}
                    className="rl-btn"
                    style={{
                      background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl,
                      padding: '15px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 52,
                    }}>
                    <Icon name="plus" size={17} />
                    {activeListingId ? 'Open listing setup' : 'Add your first listing'}
                  </button>
                </div>
                {/* How it works — four steps */}
                <ol style={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, margin: 0 }}>
                  {[
                    { n: '1', t: 'Add a listing', d: 'Enter the unit address, rent, and your landlord client\'s preferences.' },
                    { n: '2', t: 'Share the invite link', d: 'Send one link to prospective tenants. No accounts needed.' },
                    { n: '3', t: 'Applicants appear here', d: 'Standardized applications land in this dashboard automatically.' },
                    { n: '4', t: 'Review & shortlist', d: 'Mark your top picks, add notes, and send a report to your landlord.' },
                  ].map((s, i) => (
                    <li key={s.n} style={{
                      padding: 'clamp(18px, 4vw, 24px) clamp(20px, 4vw, 28px)',
                      borderTop: `1px solid ${C.rule}`,
                      borderLeft: i % 2 === 1 ? `1px solid ${C.rule}` : 'none',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.08em', marginBottom: 8 }}>STEP {s.n}</div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{s.t}</div>
                      <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>{s.d}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {/* ── INTRO HERO — red full-bleed magazine cover (logged-out visitors) ── */}
          {!sessionToken && !workspaceLoading && applications.length === 0 && (
            <section style={{ background: C.red, color: C.paper, position: 'relative', overflow: 'hidden', marginBottom: 0, borderRadius: R.card }}>
              {/* Oversized number decorations */}
              <div style={{
                position: 'absolute',
                top: 40, right: '5%',
                fontSize: 'clamp(180px, 28vw, 380px)',
                lineHeight: 0.85, fontWeight: 900,
                color: C.redDark, opacity: 0.45,
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '-0.05em',
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                10
              </div>
              <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px 100px', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                  <div style={{ width: 32, height: 1, background: C.paper }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                    For landlords + realtors
                  </span>
                </div>

                <h1 style={{
                  fontSize: 'clamp(40px, 7.5vw, 96px)',
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  color: C.paper, fontWeight: 800,
                  marginBottom: 32, maxWidth: 900,
                }}>
                  Pick the right tenant<br />
                  in 10 minutes,<br />
                  not 10 days.
                </h1>

                <p style={{ fontSize: 19, lineHeight: 1.5, color: C.paper, opacity: 0.9, maxWidth: 620, marginBottom: 32 }}>
                  Paste any Rentletter application number to verify the tenant, see their full profile, and compare them side-by-side. <strong style={{ color: C.paper, opacity: 1 }}>Free</strong> for landlords and realtors.
                </p>

                {/* Sign-in CTA — primary path when not signed in */}
                {!sessionToken && (
                  <div style={{ marginBottom: 28, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => { window.location.href = '/signin'; }}
                      style={{
                        background: C.paper, color: C.red, border: 'none',
                        padding: '14px 22px', fontSize: 15, fontWeight: 700,
                        cursor: 'pointer', letterSpacing: '0.01em', minHeight: 48,
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}>
                      ✉ Sign in and save on all devices
                    </button>
                    <span style={{ fontSize: 13, color: C.paper, opacity: 0.85 }}>
                      Applications arrive over days — sign in keeps your shortlist synced across phone + laptop.
                    </span>
                  </div>
                )}

                {/* Inline tags */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {['Free', 'No password', 'Sync across devices', 'Private to you'].map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: C.paper, border: `1px solid ${C.paper}`,
                      padding: '6px 14px', opacity: 0.85,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── How it works (logged-out visitors, no apps loaded) ── */}
          {!sessionToken && !workspaceLoading && applications.length === 0 && (
            <section style={{ padding: '48px 32px 40px', maxWidth: 860, margin: '0 auto' }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 24 }}>
                Getting started
              </div>
              <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { n: '1', t: 'Edit your listing', d: 'Add the unit address, rent, and landlord preferences.' },
                  { n: '2', t: 'Copy your invite link', d: 'Send it to applicants. Applications route here automatically.' },
                  { n: '3', t: 'Review and shortlist', d: 'Mark your top picks. Add notes. Filter by any criteria.' },
                  { n: '4', t: 'Send to your landlord', d: 'One click — a co-branded report with your name on it.' },
                ].map((s, i, arr) => (
                  <li key={s.n} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 20,
                    padding: '18px 0',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.rule}` : 'none',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.red,
                      letterSpacing: '0.05em', minWidth: 20, paddingTop: 2,
                    }}>
                      {s.n}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{s.t}</div>
                      <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>{s.d}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Outer padded container for input + below */}
          {/* Hidden when trial has lapsed — banner above explains how to subscribe */}
          {!workspaceLoading && !(accountStatus?.locked) && (
          <>
          <div style={{ padding: applications.length === 0 ? '0 clamp(16px, 4vw, 32px) 40px' : '20px clamp(16px, 4vw, 32px) 0' }}>

          {/* ── HUMAN RIGHTS / COMPLIANCE — collapsed, unobtrusive ── */}
          {/* Hidden in demo mode only; the real dashboard always shows it. */}
          {!demoMode && (
          <section style={{ marginBottom: 20 }}>
            <details style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card, overflow: 'hidden' }}>
              <summary style={{
                listStyle: 'none', cursor: 'pointer',
                padding: '11px 16px', fontSize: 12.5, color: C.inkSoft, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 9,
              }}>
                <Icon name="shield" size={15} color={C.inkMute} />
                <span style={{ flex: 1 }}>Ontario Human Rights Code — screening reminder</span>
                <span style={{ fontSize: 11, color: C.inkMute }}>Read</span>
              </summary>
              <div style={{ padding: '0 16px 16px', fontSize: 13, color: C.inkSoft, lineHeight: 1.6, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
                Under the Ontario Human Rights Code, landlords cannot screen on race, ancestry, place of origin, citizenship, ethnic origin, creed, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance. Rentletter helps you focus on financial fit, history, and stated intent — never on protected grounds.
                {' '}
                <a href="https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing" target="_blank" rel="noopener noreferrer" style={{ color: C.red, textDecoration: 'underline', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  OHRC policy →
                </a>
              </div>
            </details>
          </section>
          )}

          {/* ── UNSIGNED WORK-AT-RISK BANNER ──────────────────── */}
          {/* Only shows when: user has done some work, is NOT signed in, hasn't dismissed.
              Never in demo mode (the sample dashboard has no real work to lose). */}
          {applications.length > 0 && !sessionToken && !unsignedBannerDismissed && !demoMode && (
            <section style={{ marginBottom: 20 }}>
              <div style={{
                background: '#fef7e6',
                border: `1px solid #f0c95a`,
                borderRadius: R.ctrl,
                borderLeft: `4px solid #d4941a`,
                padding: 'clamp(14px, 3vw, 18px) clamp(16px, 4vw, 22px)',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 'clamp(14px, 3.2vw, 15px)', fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                    ⚠ Your work isn't saved across devices.
                  </div>
                  <div style={{ fontSize: 'clamp(12px, 2.8vw, 13px)', color: C.inkSoft, lineHeight: 1.5 }}>
                    Applications arrive over days. Sign in now so your shortlist, notes, and unit details are here when you check from your phone.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => { window.location.href = '/signin'; }}
                    style={{
                      background: C.red, color: C.paper, border: 'none',
                      padding: '11px 16px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', minHeight: 44,
                      whiteSpace: 'nowrap',
                    }}>
                    Sign in →
                  </button>
                  <button
                    onClick={() => setUnsignedBannerDismissed(true)}
                    title="Dismiss for this session"
                    style={{
                      background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`,
                      padding: '11px 14px', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', minHeight: 44,
                    }}>
                    Later
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── LISTINGS SWITCHER — only shown when user has 2+ listings OR is a realtor ── */}
          {sessionToken && (listings.length > 1 || realtorProfile.isRealtor) && (
            <section style={{ marginBottom: 16 }}>
              <div className="rl-card" style={{
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Active listing display + switcher */}
                <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setListingsSwitcherOpen(!listingsSwitcherOpen)}
                    style={{
                      flex: 1, minWidth: 200,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '14px 18px', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
                    }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
                        Active listing {listings.length > 1 && `· ${listings.findIndex(l => l.id === activeListingId) + 1} of ${listings.length}`}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {listingDisplayName(listings.find(l => l.id === activeListingId))}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkMute, marginTop: 2 }}>
                        {applications.length} applicant{applications.length === 1 ? '' : 's'}
                        {Object.values(decisions).filter(d => d?.status === 'shortlist').length > 0 && ` · ${Object.values(decisions).filter(d => d?.status === 'shortlist').length} shortlisted`}
                      </div>
                    </div>
                    <span className={`rl-chev${listingsSwitcherOpen ? ' rl-chev-open' : ''}`} style={{ color: C.inkSoft, display: 'inline-flex' }}>
                      <Icon name="chevronD" size={18} />
                    </span>
                  </button>
                  <button
                    onClick={() => createNewListing()}
                    title="Add new listing"
                    className="rl-btn"
                    style={{
                      background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl,
                      margin: 10, padding: '12px 18px', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                    }}>
                    <Icon name="plus" size={15} /> New listing
                  </button>
                </div>

                {/* Dropdown of all listings */}
                {listingsSwitcherOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: C.paper,
                    border: `1px solid ${C.rule}`, borderTop: 'none',
                    borderRadius: `0 0 ${R.card}px ${R.card}px`, overflow: 'hidden',
                    boxShadow: '0 12px 36px rgba(15, 15, 16, 0.12)',
                    zIndex: 20,
                    maxHeight: 380, overflowY: 'auto',
                  }}>
                    {listings.map((l, idx) => {
                      const isActive = l.id === activeListingId;
                      const shortlistCount = Object.values(l.decisions || {}).filter(d => d?.status === 'shortlist').length;
                      const appsCount = (l.applications || []).length;
                      const isRenaming = renamingListingId === l.id;
                      return (
                        <div key={l.id} style={{
                          padding: '12px 18px',
                          background: isActive ? C.paperDeep : C.paper,
                          borderBottom: idx < listings.length - 1 ? `1px solid ${C.rule}` : 'none',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          {isRenaming ? (
                            <>
                              <input
                                type="text"
                                value={renameInput}
                                onChange={e => setRenameInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') renameListing(l.id, renameInput);
                                  if (e.key === 'Escape') { setRenamingListingId(null); setRenameInput(''); }
                                }}
                                autoFocus
                                style={{
                                  flex: 1, padding: '8px 10px', fontSize: 14,
                                  border: `1px solid ${C.ink}`, background: C.paper, color: C.ink, outline: 'none',
                                }}
                              />
                              <button onClick={() => renameListing(l.id, renameInput)}
                                style={{ background: C.red, color: C.paper, border: 'none', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                Save
                              </button>
                              <button onClick={() => { setRenamingListingId(null); setRenameInput(''); }}
                                style={{ background: 'transparent', color: C.inkSoft, border: 'none', padding: '8px', fontSize: 12, cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => switchToListing(l.id)}
                                style={{
                                  flex: 1, background: 'transparent', border: 'none',
                                  padding: '4px 0', textAlign: 'left', cursor: 'pointer',
                                }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                                  {isActive && <span style={{ color: C.green, marginRight: 8 }}>●</span>}
                                  {listingDisplayName(l)}
                                </div>
                                <div style={{ fontSize: 11, color: C.inkMute }}>
                                  {appsCount} applicant{appsCount === 1 ? '' : 's'}
                                  {shortlistCount > 0 && ` · ${shortlistCount} shortlisted`}
                                </div>
                              </button>
                              <button onClick={() => { setRenamingListingId(l.id); setRenameInput(l.name || ''); }}
                                title="Rename"
                                style={{ background: 'transparent', border: 'none', padding: 6, fontSize: 12, cursor: 'pointer', color: C.inkSoft }}>
                                ✎
                              </button>
                              {listings.length > 1 && (
                                <button onClick={() => {
                                  if (confirm(`Delete "${listingDisplayName(l)}"? Its applicants and decisions will be lost.`)) {
                                    deleteListing(l.id);
                                  }
                                }}
                                  title="Delete listing"
                                  style={{ background: 'transparent', border: 'none', padding: 6, fontSize: 14, cursor: 'pointer', color: C.inkMute }}>
                                  ×
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    {listings.length >= 30 && (
                      <div style={{ padding: '10px 18px', fontSize: 11, color: C.inkMute, background: C.paperDeep }}>
                        Maximum 30 listings per workspace.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── LISTING SETUP CARD — unit basics + landlord preferences merged ── */}
          {sessionToken && realtorProfile.isRealtor && activeListingId && (() => {
            const activeListing = listings.find(l => l.id === activeListingId);
            if (!activeListing) return null;
            const prefs = activeListing.preferences || {};
            const prefsCount = countPreferencesSet(prefs);
            const u = activeListing.unit || unit;
            const listingIsSet = !!(u.address || u.monthlyRent || u.bedrooms);
            return (
              <section style={{ marginBottom: 16 }}>
                <div className="rl-card rl-card-lift" style={{ padding: 'clamp(16px, 3vw, 22px) clamp(18px, 3vw, 24px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkMute, marginBottom: 10 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>1</span>
                        Listing setup
                      </div>
                      {listingIsSet ? (
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 6 }}>
                          {u.address || 'Untitled unit'}
                          {u.monthlyRent && <span style={{ color: C.inkSoft, fontWeight: 400 }}> · ${u.monthlyRent}/mo</span>}
                          {u.bedrooms && <span style={{ color: C.inkSoft, fontWeight: 400 }}> · {u.bedrooms} bed</span>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: C.inkMute, marginBottom: 6 }}>
                          Add unit address, rent, and landlord preferences.
                        </div>
                      )}
                      {prefsCount > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {prefs.minAnnualIncome && (
                            <span style={{ fontSize: 11.5, color: C.inkSoft, background: C.paperDeep, padding: '4px 11px', borderRadius: R.pill, border: `1px solid ${C.rule}` }}>
                              Min income ${Number(prefs.minAnnualIncome).toLocaleString()}
                            </span>
                          )}
                          {prefs.petsPolicy && prefs.petsPolicy !== 'case-by-case' && (
                            <span style={{ fontSize: 11.5, color: C.inkSoft, background: C.paperDeep, padding: '4px 11px', borderRadius: R.pill, border: `1px solid ${C.rule}` }}>
                              Pets: {prefs.petsPolicy === 'yes' ? 'allowed' : 'not allowed'}
                            </span>
                          )}
                          {prefs.smokingAllowed === false && (
                            <span style={{ fontSize: 11.5, color: C.inkSoft, background: C.paperDeep, padding: '4px 11px', borderRadius: R.pill, border: `1px solid ${C.rule}` }}>
                              No smoking
                            </span>
                          )}
                          {prefsCount > 3 && (
                            <span style={{ fontSize: 11, color: C.inkMute, padding: '3px 4px' }}>+{prefsCount - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setPreferencesOpen(true)}
                      className="rl-btn"
                      style={{
                        background: C.ink, color: C.paper, borderRadius: R.ctrl,
                        padding: '9px 18px', fontSize: 13, fontWeight: 600,
                        whiteSpace: 'nowrap', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                      }}>
                      <Icon name="edit" size={14} /> Edit
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── INVITE TENANTS CARD — realtor-only, shown when they have a listing ── */}
          {sessionToken && realtorProfile.isRealtor && activeListingId && (() => {
            const activeListing = listings.find(l => l.id === activeListingId);
            if (!activeListing) return null;
            const inviteUrl = activeListing.inviteToken ? `https://rentletter.ca/apply/${activeListing.inviteToken}` : null;
            return (
              <section style={{ marginBottom: 16 }}>
                <div className="rl-card" style={{ background: C.ink, color: C.paper, padding: 'clamp(18px, 3vw, 24px)' }}>
                  {/* Header + description — full width */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f0b8bb', marginBottom: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.red, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>2</span>
                    Invite tenants to apply
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6, color: C.paper }}>
                    Listing-specific application link
                  </div>
                  <div style={{ fontSize: 13, color: C.inkInverse, lineHeight: 1.6 }}>
                    Share this link with prospective tenants. They'll see this listing's info, fill the application, and their RL number will appear here automatically.
                  </div>
                  {/* Link + action — one aligned row, link fills the width */}
                  <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
                    {inviteUrl && (
                      <div style={{ flex: 1, minWidth: 240, padding: '13px 16px', background: '#1a1a1c', borderRadius: R.ctrl, fontFamily: 'monospace', fontSize: 12.5, color: C.paper, wordBreak: 'break-all', borderLeft: `3px solid ${C.red}`, display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Icon name="link" size={15} color="#f0b8bb" /> <span style={{ minWidth: 0 }}>{inviteUrl}</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        // If a link already exists, copy the COMPLETE displayed URL directly
                        // (don't re-fetch). Otherwise generate one.
                        if (inviteUrl) {
                          navigator.clipboard.writeText(inviteUrl);
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 3000);
                        } else {
                          createOrGetInviteLink();
                        }
                      }}
                      disabled={inviteLoading}
                      className="rl-btn"
                      style={{
                        background: inviteCopied ? C.green : C.red, color: C.paper, borderRadius: R.ctrl,
                        padding: '13px 22px', fontSize: 13, fontWeight: 600, minHeight: 48,
                        cursor: inviteLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                        opacity: inviteLoading ? 0.6 : 1, flex: inviteUrl ? '0 0 auto' : '1',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                      {inviteLoading
                        ? 'Creating…'
                        : inviteCopied
                          ? <><Icon name="check" size={15} strokeWidth={2.5} /> Copied</>
                          : inviteUrl
                            ? <><Icon name="copy" size={15} /> Copy link</>
                            : <><Icon name="plus" size={15} /> Get invite link</>}
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── SHARED-WITH-LANDLORD STATUS CARD — realtor only, when active listing has been shared ── */}
          {sessionToken && realtorProfile.isRealtor && (() => {
            const activeListing = listings.find(l => l.id === activeListingId);
            if (!activeListing?.shareToken || !activeListing?.sharedWithEmail) return null;
            const shareUrl = `https://rentletter.ca/shortlist/${activeListing.shareToken}`;
            const shortlistedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'shortlist').length;
            return (
              <section style={{ marginBottom: 16 }}>
                <div className="rl-card" style={{ background: C.green, color: C.paper, border: 'none', padding: 'clamp(18px, 3vw, 24px) clamp(18px, 3vw, 24px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.92, marginBottom: 10 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} strokeWidth={3} /></span>
                        Shared with landlord client
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
                        {activeListing.sharedWithEmail}
                      </div>
                      <div style={{ fontSize: 12.5, opacity: 0.9, lineHeight: 1.55 }}>
                        {shortlistedCount} candidate{shortlistedCount === 1 ? '' : 's'} currently shortlisted ·
                        Sent {activeListing.sharedAt ? new Date(activeListing.sharedAt).toLocaleDateString('en-CA', { dateStyle: 'medium' }) : 'recently'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Share link copied to clipboard.'); }}
                        className="rl-btn"
                        style={{ background: 'transparent', color: C.paper, border: `1px solid rgba(255,255,255,0.5)`, borderRadius: R.ctrl, padding: '11px 16px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Icon name="copy" size={14} /> Copy link
                      </button>
                      <button
                        onClick={() => { setSendToLandlordEmail(activeListing.sharedWithEmail); setSendToLandlordNote(''); setSendToLandlordSent(false); setSendToLandlordOpen(true); }}
                        className="rl-btn"
                        style={{ background: C.paper, color: C.green, borderRadius: R.ctrl, padding: '11px 16px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Icon name="send" size={14} color={C.green} /> Send update
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}


          {/* ── INPUT BAR ────────────────────────────────────── */}
          <section style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Already have an application number? Add it here
            </label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                value={appNumberInput}
                onChange={e => setAppNumberInput(e.target.value)}
                placeholder="RL-2026-XXXX-XXXX"
                onKeyDown={e => e.key === 'Enter' && lookupApplication()}
                style={{
                  flex: 1, minWidth: 280,
                  padding: '15px 18px', fontSize: 16,
                  fontFamily: 'monospace', letterSpacing: '0.04em',
                  border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl,
                  background: C.card, color: C.ink,
                }}
              />
              <button
                onClick={lookupApplication}
                disabled={loading || !appNumberInput.trim()}
                className="rl-btn"
                style={{
                  background: C.ink, color: C.paper, borderRadius: R.ctrl,
                  padding: '0 32px', fontSize: 14, fontWeight: 600,
                  cursor: (loading || !appNumberInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !appNumberInput.trim()) ? 0.5 : 1,
                  minHeight: 52, display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                {loading ? 'Loading...' : 'Look up →'}
              </button>
              {applications.length > 0 && (
                <button onClick={clearAll} className="rl-btn"
                  style={{
                    background: C.card, color: C.inkSoft,
                    border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl,
                    padding: '0 20px', fontSize: 13, fontWeight: 500, minHeight: 52,
                  }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Sample/demo data is never loaded into a signed-in workspace. The
                only place to explore fake applicants is the homepage demo entry
                point (→ /landlord?demo=pmc), which runs in a non-syncing sandbox. */}
            {error && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
                {error}
              </div>
            )}
            {applications.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: C.inkMute }}>
                {applications.length} application{applications.length === 1 ? '' : 's'} loaded · Sessions are private, data clears when you close this tab
              </div>
            )}
          </section>

          {/* ── FILTER BAR ────────────────────────────────────── */}
          {applications.length >= 2 && (
            <section style={{ marginBottom: 24, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: filtersOpen ? 20 : 0 }}>
                <button
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  className="rl-btn"
                  style={{
                    background: filtersOpen ? C.ink : C.card,
                    color: filtersOpen ? C.paper : C.ink,
                    border: `1px solid ${filtersOpen ? C.ink : C.ruleDark}`, borderRadius: R.ctrl,
                    padding: '10px 18px', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <span style={{ display: 'inline-flex' }}><Icon name="list" size={15} /></span>
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span style={{
                      background: C.red, color: C.paper,
                      padding: '2px 8px', fontSize: 11, fontWeight: 700,
                      borderRadius: R.pill, minWidth: 22, textAlign: 'center',
                    }}>
                      {activeFilterCount}
                    </span>
                  )}
                  <span className={`rl-chev${filtersOpen ? ' rl-chev-open' : ''}`} style={{ display: 'inline-flex' }}><Icon name="chevronD" size={15} /></span>
                </button>
                <span style={{ fontSize: 12, color: C.inkMute }}>
                  {filteredApplications.length} of {applications.length} match{activeFilterCount > 0 ? ' your filters' : ''}
                </span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    style={{
                      background: 'transparent', border: 'none',
                      color: C.red, fontSize: 12, fontWeight: 600,
                      textDecoration: 'underline',
                    }}>
                    Clear filters
                  </button>
                )}
              </div>

              {filtersOpen && (
                <div className="rl-card" style={{
                  background: C.paperDeep,
                  padding: 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 28px)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 28,
                }}>
                  {/* Smoker status */}
                  <FilterGroup label="Smoker status">
                    <FilterRadio name="smoker" value="any" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="smoker" value="non-smoker" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'non-smoker' })}>Non-smokers only</FilterRadio>
                    <FilterRadio name="smoker" value="no-indoor" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'no-indoor' })}>No indoor smoking</FilterRadio>
                  </FilterGroup>

                  {/* Pets */}
                  <FilterGroup label="Pets">
                    <FilterRadio name="pets" value="any" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="pets" value="no-pets" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'no-pets' })}>No pets only</FilterRadio>
                    <FilterRadio name="pets" value="with-pets" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'with-pets' })}>Pet owners only</FilterRadio>
                  </FilterGroup>

                  {/* Co-applicant */}
                  <FilterGroup label="Applicant type">
                    <FilterRadio name="co" value="any" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="co" value="single" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'single' })}>Single applicants only</FilterRadio>
                    <FilterRadio name="co" value="with-co" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'with-co' })}>Joint applicants only</FilterRadio>
                  </FilterGroup>

                  {/* Min income */}
                  <FilterGroup label={`Min combined income: $${filters.minIncome.toLocaleString()}`}>
                    <input
                      type="range"
                      min="0" max="200000" step="5000"
                      value={filters.minIncome}
                      onChange={e => setFilters({ ...filters, minIncome: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: C.red }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                      <span>$0</span>
                      <span>$200k+</span>
                    </div>
                  </FilterGroup>

                  {/* Max rent-to-income */}
                  <FilterGroup label={`Max rent-to-income: ${filters.maxRentToIncome}%`}>
                    <input
                      type="range"
                      min="10" max="100" step="5"
                      value={filters.maxRentToIncome}
                      onChange={e => setFilters({ ...filters, maxRentToIncome: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: C.red }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                      <span>10%</span>
                      <span>100%</span>
                    </div>
                  </FilterGroup>

                  {/* Your decision filter */}
                  <FilterGroup label="Your decision">
                    <FilterRadio name="decision" value="any" current={filters.decision}
                      onChange={() => setFilters({ ...filters, decision: 'any' })}>Show all</FilterRadio>
                    <FilterRadio name="decision" value="set-aside-only" current={filters.decision}
                      onChange={() => setFilters({ ...filters, decision: 'set-aside-only' })}>Set aside only</FilterRadio>
                    <FilterRadio name="decision" value="hide-set-aside" current={filters.decision}
                      onChange={() => setFilters({ ...filters, decision: 'hide-set-aside' })}>Hide set aside</FilterRadio>
                  </FilterGroup>
                </div>
              )}
            </section>
          )}

          {/* ── VIEW SWITCHER ────────────────────────────────── */}
          {applications.length > 0 && (
            <section className="rl-reveal" style={{ marginBottom: 32, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>

              {/* Single ranked-list view — teaches the new ranked-everyone model */}
              <DemoRankedList
                applications={filteredApplications}
                decisions={decisions}
                unit={unit}
                realtorProfile={realtorProfile}
                setDecisionStatus={setDecisionStatus}
                setDecisionReason={setDecisionReason}
                setDecisionNotes={setDecisionNotes}
              />
            </section>
          )}

          {/* ── FOOTER NOTE ─────────────────────────────────── */}
          <footer style={{ marginTop: 48, paddingTop: 28, borderTop: `1px solid ${C.rule}` }}>
            <p style={{ fontSize: 12, color: C.inkMute, maxWidth: 760, lineHeight: 1.6, marginBottom: 18 }}>
              Rentletter applications are generated by tenants and stored privately. The Scorecard reflects honest, factual assessment based on tenant inputs — not promotional self-rating. Free for landlords and realtors. If you find this useful, share it with other landlords.
            </p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href="/" style={{ fontSize: 12, color: C.inkSoft, textDecoration: 'underline' }}>For tenants</a>
              <a href="/faq" style={{ fontSize: 12, color: C.inkSoft, textDecoration: 'underline' }}>FAQ</a>
              <a href="/privacy" style={{ fontSize: 12, color: C.inkSoft, textDecoration: 'underline' }}>Privacy</a>
              <a href="/terms" style={{ fontSize: 12, color: C.inkSoft, textDecoration: 'underline' }}>Terms</a>
              <a href="mailto:info@rentletter.ca" style={{ fontSize: 12, color: C.inkSoft, textDecoration: 'underline' }}>Contact</a>
              <span style={{ fontSize: 12, color: C.inkMute }}>Toronto · Not legal advice</span>
            </div>
          </footer>
          </div>{/* close inner padded wrapper */}
          </>
          )}{/* close !workspaceLoading wrap */}

          </>
          )}{/* close sign-in gate wrap */}
        </div>


        {/* ════════════════════════════════════════════════════════ */}
        {/* LANDLORD PREFERENCES MODAL */}
        {/* ════════════════════════════════════════════════════════ */}
        {preferencesOpen && (() => {
          const prefs = getActivePreferences();
          const activeListing = listings.find(l => l.id === activeListingId);
          return (
            <div
              onClick={cancelListingSetup}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(15, 15, 16, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'clamp(16px, 4vw, 32px)',
                zIndex: 100,
              }}>
              <div onClick={e => e.stopPropagation()}
                className="rl-modal"
                style={{
                  background: C.paper,
                  maxWidth: 640, width: '100%',
                  maxHeight: '90vh', overflowY: 'auto',
                  border: `1px solid ${C.rule}`,
                }}>
                {/* Header */}
                <div style={{ padding: 'clamp(20px, 4vw, 28px)', borderBottom: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {creatingListing ? 'New listing' : 'Listing setup'}
                  </div>
                  <h3 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 0, lineHeight: 1.2 }}>
                    Unit basics and landlord preferences
                  </h3>
                  {creatingListing && (
                    <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, marginTop: 8 }}>
                      Add the unit's address, monthly rent, and bedrooms to create the listing. Cancel won't create anything.
                    </p>
                  )}
                </div>

                {/* UNIT BASICS */}
                <div style={{ padding: 'clamp(16px, 3vw, 24px) clamp(20px, 4vw, 28px) 0' }}>
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Unit</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 4 }}>
                    <label>
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</span>
                      <input
                        type="text"
                        value={unit.address}
                        onChange={e => setUnit({ ...unit, address: e.target.value })}
                        placeholder="88 Bay Street"
                        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                      />
                    </label>
                    <label>
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Monthly rent (CAD)</span>
                      <input
                        type="text" inputMode="numeric"
                        value={unit.monthlyRent}
                        onChange={e => setUnit({ ...unit, monthlyRent: e.target.value.replace(/[^\d]/g, '') })}
                        placeholder="2400"
                        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                      />
                    </label>
                    <label>
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Bedrooms</span>
                      <input
                        type="text"
                        value={unit.bedrooms}
                        onChange={e => setUnit({ ...unit, bedrooms: e.target.value })}
                        placeholder="2"
                        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                {/* OHRC notice — info-color box */}
                <div style={{ margin: '16px clamp(20px, 4vw, 28px)', padding: '12px 14px', background: C.info, borderRadius: R.ctrl, borderLeft: `4px solid ${C.infoBorder}`, fontSize: 12, color: C.infoInk, lineHeight: 1.55 }}>
                  <strong>Why some fields aren't here:</strong> Ontario's Human Rights Code prohibits screening tenants on gender, age, family status, race, religion, disability, or receipt of public assistance. The fields below are legally screenable criteria. Stating discriminatory preferences in writing can trigger HRTO complaints — for both you and your landlord client.
                </div>

                {/* Form fields */}
                <div style={{ padding: 'clamp(8px, 2vw, 16px) clamp(20px, 4vw, 28px) clamp(20px, 4vw, 28px)' }}>

                  {/* FINANCIAL */}
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 14, marginBottom: 10 }}>Financial</div>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Minimum annual income</span>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={prefs.minAnnualIncome || ''}
                      onChange={e => updateActivePreferences({ minAnnualIncome: e.target.value })}
                      placeholder="e.g. 80000"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                  </label>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Max rent-to-income ratio (%)</span>
                    <input
                      type="number" inputMode="numeric" min="0" max="100"
                      value={prefs.rentToIncomeMaxPct || 30}
                      onChange={e => updateActivePreferences({ rentToIncomeMaxPct: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                    <span style={{ fontSize: 11, color: C.inkMute, marginTop: 4, display: 'block' }}>CMHC guideline is ≤30%</span>
                  </label>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Minimum years at current employer</span>
                    <input
                      type="number" inputMode="numeric" min="0" step="0.5"
                      value={prefs.minYearsAtJob || ''}
                      onChange={e => updateActivePreferences({ minYearsAtJob: e.target.value })}
                      placeholder="e.g. 1"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                  </label>

                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 8 }}>Acceptable employment types</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {[
                        { k: 'fullTime', l: 'Full-time' },
                        { k: 'contract', l: 'Contract' },
                        { k: 'selfEmployed', l: 'Self-employed' },
                        { k: 'partTime', l: 'Part-time' },
                      ].map(o => (
                        <label key={o.k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={prefs.acceptableEmployment?.[o.k] !== false}
                            onChange={e => updateActivePreferences({
                              acceptableEmployment: { ...(prefs.acceptableEmployment || {}), [o.k]: e.target.checked },
                            })}
                          />
                          {o.l}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* MOVE-IN TIMING */}
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Move-in timing</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                    <label>
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Earliest move-in</span>
                      <input
                        type="date"
                        value={prefs.earliestMoveIn || ''}
                        onChange={e => updateActivePreferences({ earliestMoveIn: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                      />
                    </label>
                    <label>
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Latest move-in</span>
                      <input
                        type="date"
                        value={prefs.latestMoveIn || ''}
                        onChange={e => updateActivePreferences({ latestMoveIn: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                      />
                    </label>
                  </div>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Minimum lease term (months)</span>
                    <input
                      type="number" inputMode="numeric" min="1" max="60"
                      value={prefs.minLeaseTermMonths || 12}
                      onChange={e => updateActivePreferences({ minLeaseTermMonths: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                  </label>

                  {/* PROPERTY-SPECIFIC */}
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Property-specific</div>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Maximum occupants</span>
                    <input
                      type="number" inputMode="numeric" min="1" max="20"
                      value={prefs.maxOccupants || ''}
                      onChange={e => updateActivePreferences({ maxOccupants: e.target.value })}
                      placeholder="e.g. 2"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                    <span style={{ fontSize: 11, color: C.inkMute, marginTop: 4, display: 'block' }}>Building or fire code occupancy limit, not a preference about family size</span>
                  </label>

                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 6 }}>Smoking</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={prefs.smokingAllowed === true}
                        onChange={e => updateActivePreferences({ smokingAllowed: e.target.checked })}
                      />
                      Smoking allowed
                    </label>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 6 }}>Pets</span>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {[
                        { v: 'yes', l: 'Allowed' },
                        { v: 'no', l: 'Not allowed' },
                        { v: 'case-by-case', l: 'Case by case' },
                      ].map(o => (
                        <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}>
                          <input
                            type="radio" name="pets"
                            checked={prefs.petsPolicy === o.v}
                            onChange={() => updateActivePreferences({ petsPolicy: o.v })}
                          />
                          {o.l}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Parking spots available</span>
                    <input
                      type="number" inputMode="numeric" min="0" max="10"
                      value={prefs.parkingSpots || ''}
                      onChange={e => updateActivePreferences({ parkingSpots: e.target.value })}
                      placeholder="e.g. 1"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }}
                    />
                  </label>

                  {/* VERIFICATION */}
                  <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Verification required</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                    {[
                      { k: 'requiresLandlordReference', l: 'Previous landlord reference' },
                      { k: 'requiresEmployerVerification', l: 'Employer verification' },
                      { k: 'guarantorAccepted', l: 'Guarantor / co-signer accepted' },
                    ].map(o => (
                      <label key={o.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={prefs[o.k] !== false}
                          onChange={e => updateActivePreferences({ [o.k]: e.target.checked })}
                        />
                        {o.l}
                      </label>
                    ))}
                  </div>

                  {/* NOTES */}
                  <label style={{ display: 'block', marginTop: 22 }}>
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 }}>Additional notes (optional)</span>
                    <textarea
                      value={prefs.notes || ''}
                      onChange={e => updateActivePreferences({ notes: e.target.value })}
                      rows={3}
                      placeholder="e.g. Quiet building, no home business, long-term tenant preferred."
                      style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
                    />
                    <span style={{ fontSize: 11, color: C.red, marginTop: 4, display: 'block' }}>
                      Reminder: do NOT include preferences about gender, age, family status, race, religion, disability, or income source. These can trigger HRTO complaints.
                    </span>
                  </label>

                </div>

                {/* Footer */}
                {(() => {
                  // In create mode, require address + monthly rent + bedrooms before the listing can be saved.
                  const canSave = !creatingListing || !!(unit.address && unit.address.trim() && unit.monthlyRent && unit.bedrooms && String(unit.bedrooms).trim());
                  return (
                <div style={{ padding: 'clamp(16px, 3vw, 22px) clamp(20px, 4vw, 28px)', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    onClick={cancelListingSetup}
                    style={{
                      background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`,
                      padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Cancel
                  </button>
                  <button
                    onClick={saveListingSetup}
                    disabled={!canSave}
                    title={canSave ? '' : 'Add address, monthly rent, and bedrooms first'}
                    style={{
                      background: canSave ? C.red : C.ruleDark, color: C.paper, border: 'none',
                      padding: '12px 24px', fontSize: 13, fontWeight: 700,
                      cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.7,
                    }}>
                    {creatingListing ? 'Create listing' : 'Save'}
                  </button>
                </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

        {/* ════════════════════════════════════════════════════════ */}
        {/* REALTOR PROFILE EDIT MODAL */}
        {/* ════════════════════════════════════════════════════════ */}
        {realtorEditOpen && (
          <div
            onClick={() => setRealtorEditOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(15, 15, 16, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'clamp(16px, 4vw, 32px)',
              zIndex: 100,
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                background: C.paper,
                maxWidth: 520, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
                borderRadius: R.modal,
                boxShadow: '0 24px 64px rgba(15, 15, 16, 0.22)',
                border: `1px solid ${C.rule}`,
              }}>
              <div style={{
                padding: 'clamp(20px, 4vw, 28px) clamp(24px, 5vw, 32px)',
                borderBottom: `1px solid ${C.rule}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Realtor profile
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
                    Your branding details.
                  </h3>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                    These appear on PDF exports and email summaries you send to landlord clients. All optional.
                  </p>
                </div>
                <button onClick={() => setRealtorEditOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>

              <div style={{ padding: 'clamp(20px, 4vw, 28px) clamp(24px, 5vw, 32px)' }}>
                {[
                  { key: 'fullName', label: 'Your full name', placeholder: 'Sarah Chen', autoComplete: 'name' },
                  { key: 'brokerage', label: 'Brokerage', placeholder: 'Royal LePage Signature Realty', autoComplete: 'organization' },
                  { key: 'phone', label: 'Phone', placeholder: '(416) 555-0199', autoComplete: 'tel' },
                  { key: 'licenseNumber', label: 'RECO license number (optional)', placeholder: 'RECO 1234567', autoComplete: 'off' },
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                      {field.label}
                    </label>
                    <input
                      type="text"
                      autoComplete={field.autoComplete}
                      value={realtorProfile[field.key] || ''}
                      onChange={e => setRealtorProfile(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{
                        width: '100%', padding: '12px 14px', fontSize: 14,
                        border: `1px solid ${C.rule}`, background: C.paper, color: C.ink,
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}

                <button
                  onClick={() => {
                    setRealtorProfile(prev => ({ ...prev, isRealtor: true }));
                    setRealtorEditOpen(false);
                  }}
                  style={{
                    width: '100%',
                    background: C.red, color: C.paper, border: 'none',
                    padding: '14px', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', marginTop: 8,
                  }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SEND TO LANDLORD MODAL — realtor sends shortlist to their landlord client */}
        {/* ════════════════════════════════════════════════════════ */}
        {sendToLandlordOpen && (
          <div
            onClick={() => !sendToLandlordLoading && setSendToLandlordOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(15, 15, 16, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'clamp(16px, 4vw, 32px)',
              zIndex: 100,
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                background: C.paper,
                maxWidth: 540, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
                borderRadius: R.modal,
                boxShadow: '0 24px 64px rgba(15, 15, 16, 0.22)',
                border: `1px solid ${C.rule}`,
              }}>
              <div style={{ padding: 'clamp(20px, 4vw, 28px) clamp(24px, 5vw, 32px)', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Send to your landlord client
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
                    Share your shortlist.
                  </h3>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                    A co-branded email with your name + brokerage, your shortlisted candidates, and an optional personal note. Replies come directly to your inbox.
                  </p>
                </div>
                <button onClick={() => !sendToLandlordLoading && setSendToLandlordOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>

              <div style={{ padding: 'clamp(20px, 4vw, 28px) clamp(24px, 5vw, 32px)' }}>
                {sendToLandlordSent ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.green, marginBottom: 6 }}>
                      Sent to your landlord.
                    </div>
                    <div style={{ fontSize: 13, color: C.inkSoft }}>
                      A copy was also sent to your inbox.
                    </div>
                  </div>
                ) : (
                  <>
                    {(!realtorProfile.isRealtor || !realtorProfile.fullName) && (
                      <div style={{ background: '#fafaf5', border: `1px solid ${C.rule}`, borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                        Set up your realtor profile first so the landlord knows who's sending this.
                        <button onClick={() => { setSendToLandlordOpen(false); setRealtorEditOpen(true); }}
                          style={{ background: 'transparent', border: 'none', color: C.red, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, marginLeft: 6, textDecoration: 'underline' }}>
                          Add your details →
                        </button>
                      </div>
                    )}

                    <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Your landlord client's email
                    </label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={sendToLandlordEmail}
                      onChange={e => setSendToLandlordEmail(e.target.value)}
                      placeholder="landlord@example.com"
                      autoFocus
                      style={{
                        width: '100%', padding: '12px 14px', fontSize: 14,
                        border: `1px solid ${C.ink}`, background: C.paper, color: C.ink,
                        outline: 'none', marginBottom: 16,
                      }}
                    />

                    <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Personal note (optional)
                    </label>
                    <textarea
                      value={sendToLandlordNote}
                      onChange={e => setSendToLandlordNote(e.target.value)}
                      placeholder="Hi John, here are my three top candidates for your unit. Happy to discuss when you have time..."
                      rows={4}
                      style={{
                        width: '100%', padding: '12px 14px', fontSize: 14,
                        border: `1px solid ${C.rule}`, background: C.paper, color: C.ink,
                        outline: 'none', marginBottom: 16, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />

                    <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: 14, marginBottom: 16, fontSize: 12, color: C.inkSoft, lineHeight: 1.6 }}>
                      Will include: {applications.filter(a => decisions?.[a.applicationNumber]?.status === 'shortlist').length} shortlisted candidate{applications.filter(a => decisions?.[a.applicationNumber]?.status === 'shortlist').length === 1 ? '' : 's'}
                      {unit?.address && ` · for ${String(unit.address).slice(0, 60)}`}
                      {realtorProfile.fullName && ` · branded as ${realtorProfile.fullName}${realtorProfile.brokerage ? ` (${realtorProfile.brokerage})` : ''}`}
                    </div>

                    <button
                      onClick={sendShortlistToLandlord}
                      disabled={sendToLandlordLoading || !sendToLandlordEmail || !realtorProfile.fullName}
                      className="rl-btn"
                      style={{
                        width: '100%',
                        background: (sendToLandlordLoading || !sendToLandlordEmail || !realtorProfile.fullName) ? '#c8c2b3' : C.red,
                        color: C.paper, border: 'none',
                        padding: '16px', fontSize: 15, fontWeight: 700,
                        cursor: (sendToLandlordLoading || !sendToLandlordEmail || !realtorProfile.fullName) ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.01em',
                      }}>
                      {sendToLandlordLoading ? 'Sending...' : 'Send shortlist →'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* SIGN-IN MODAL */}
        {/* ════════════════════════════════════════════════════════ */}
        {/* Old magic-link sign-in modal removed — all sign-in entry points now route to
            the single Supabase password flow at /signin. */}

        {/* ════════════════════════════════════════════════════════ */}
        {/* REQUEST-APPLICATION MODAL */}
        {/* ════════════════════════════════════════════════════════ */}

        {/* ════════════════════════════════════════════════════════ */}
        {/* METHODOLOGY POPOVER */}
        {/* ════════════════════════════════════════════════════════ */}
        {methodologyOpen && (
          <div
            onClick={() => setMethodologyOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(15,15,16,0.65)',
              zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: C.info, maxWidth: 700, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
                borderRadius: R.modal,
                borderLeft: `4px solid ${C.infoBorder}`,
              }}>
              <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.infoBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.infoInk, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Scorecard methodology
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>
                    How the Scorecard is calculated.
                  </h3>
                </div>
                <button onClick={() => setMethodologyOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '24px 32px' }}>
                <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6, marginBottom: 24 }}>
                  Each application is scored on five dimensions, all from tenant-submitted data. The scorecard is a starting point — never a substitute for your own verification of references and income.
                </p>

                {[
                  { name: 'Income stability', desc: 'Years at current employer + employer type. Higher score for longer tenure and traditional W-2 employment. Self-employed tenants score lower unless they provide 2+ years of CRA returns.', max: '5 / 5 = 5+ years at established employer' },
                  { name: 'Rent affordability', desc: 'Monthly rent as a percentage of monthly gross income (or combined household if co-applicant). Standard CMHC guideline is ≤30%.', max: '5 / 5 = under 25% of monthly income' },
                  { name: 'Rental history', desc: 'Years at current address + presence of previous landlord reference. First-time renters receive lower scores unless they provide a guarantor.', max: '5 / 5 = 2+ years with contactable landlord reference' },
                  { name: 'Long-term intent', desc: 'Inferred from reason for moving + life stage. A new baby, school catchment, or job relocation suggests multi-year stability. Short-term moves score lower.', max: '5 / 5 = stated 3+ year horizon backed by life context' },
                  { name: 'Disclosures', desc: 'How openly the tenant addresses weaknesses (credit, gaps, variable income). Proactive disclosure with documentation scores higher than silence.', max: '5 / 5 = no items to address, or items addressed with documentation' },
                ].map(d => (
                  <div key={d.name} style={{ marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{d.name}</div>
                    <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 6 }}>{d.desc}</div>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.02em' }}>{d.max}</div>
                  </div>
                ))}

                <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.55, marginTop: 20 }}>
                  Overall score is a weighted average. You can adjust the weights yourself in the Ranked view to reflect what matters most for your property. The score is for prioritization, not a final decision — always verify references and follow Ontario Human Rights Code requirements.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <ChatWidget />
    </>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW — single tenant deep dive
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// ALL APPLICANTS LIST — simple scrollable list for simple-mode "All applicants" tab
// Plain rows, no weight sliders. Tap any row → opens that tenant in Review mode.
// ════════════════════════════════════════════════════════════
// ─── DEMO: Send-to-landlord PREVIEW ──────────────────────────
// Demo-only mirror of the real dashboard's send-to-landlord area. NO network:
// the text is composed client-side from the favourited sample applicants, the PDF
// is generated client-side by reusing the real white-label builder with demo data
// (logo_url null → no fetch), and Email is purely illustrative.
// Demo-only branding preview. 100% hardcoded samples — NO Anthropic/Supabase calls.
// Shows the finalized brand (logo on light/dark), pre-made "AI concepts", and makes
// clear that real realtors generate their own after signing in.
function DemoBrandingPreview() {
  const Swatch = ({ children, bg, label }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ background: bg, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, overflow: 'hidden' }}>
        {children}
      </div>
      <div style={{ fontSize: 9.5, color: C.inkMute, textAlign: 'center', marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
  return (
    <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 28px)', marginTop: 16 }}>
      <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Your brand</div>
      <div style={{ fontSize: 11.5, color: C.inkMute, fontStyle: 'italic', marginBottom: 16 }}>This is a preview — your real brand is created after you sign in.</div>

      {/* Finalized letterhead brand card (sample) */}
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 16, background: C.paperDeep, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 120, height: 56, borderRadius: 8, background: '#fff', border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, padding: 6 }}>
            <img src={DEMO_BRAND_LOGO_PNG} alt="Sample logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{DEMO_BRAND_NAME}</div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 1 }}>{DEMO_BRAND_BROKERAGE}</div>
          </div>
        </div>
      </div>

      {/* Uploaded logo — contrast check */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Sample uploaded logo</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <Swatch bg="#ffffff" label="On light"><img src={DEMO_BRAND_LOGO_PNG} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></Swatch>
        <Swatch bg="#0f0f10" label="On dark"><img src={DEMO_BRAND_LOGO_PNG} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></Swatch>
      </div>

      {/* Pre-made AI concepts (samples) */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>AI logo concepts (samples)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        {DEMO_LOGO_CONCEPTS.map((c) => (
          <div key={c.label} style={{ border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: 10, background: C.paper }}>
            <div style={{ background: '#fff', borderRadius: 6, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, overflow: 'hidden' }}>
              <div style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }} dangerouslySetInnerHTML={{ __html: c.svg }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.inkSoft, textAlign: 'center', marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.55, background: C.paperDeep, border: `1px dashed ${C.ruleDark}`, borderRadius: R.ctrl, padding: '10px 12px' }}>
        Signed-in realtors generate their own logo with AI from a short brief, then upload or refine it. These are pre-made samples — the demo doesn’t call the AI.
      </div>
    </section>
  );
}

// Demo-only single RANKED LIST that teaches the new model: everyone ranked best-fit-
// first, top 5 highlighted, "Set aside" requires an OHRC-safe reason (sorts to bottom),
// "Withdrew" removes. Then the branding preview + the full-ranked sample deliverable.
// No API/Supabase calls.
function DemoRankedList({ applications, decisions, unit, realtorProfile, setDecisionStatus, setDecisionReason, setDecisionNotes }) {
  const [setAsideFor, setSetAsideFor] = useState(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');

  const norm = (s) => (s === 'set_aside' ? 'set_aside' : s === 'withdrawn' ? 'withdrawn' : 'ranked');
  const byScore = (a, b) => (b.scorecard?.overall ?? 0) - (a.scorecard?.overall ?? 0);
  const active = applications.filter((a) => norm(decisions[a.applicationNumber]?.status) === 'ranked').sort(byScore);
  const setAsideApps = applications.filter((a) => norm(decisions[a.applicationNumber]?.status) === 'set_aside').sort(byScore);
  const total = active.length + setAsideApps.length;
  const initials = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '—';

  const openSetAside = (a) => { setSetAsideFor(a.applicationNumber); setCode(''); setNote(''); };
  const confirmSetAside = () => {
    if (!code || (code === 'other_screenable' && !note.trim())) return;
    setDecisionStatus(setAsideFor, 'set_aside');
    setDecisionReason(setAsideFor, code);
    setDecisionNotes(setAsideFor, note.trim());
    setSetAsideFor(null);
  };
  const restore = (a) => { setDecisionStatus(a.applicationNumber, 'ranked'); setDecisionReason(a.applicationNumber, ''); };
  const withdraw = (a) => { if (typeof window !== 'undefined' && window.confirm(`Mark ${a.tenant?.fullName || 'this applicant'} as withdrawn? Use this only if the tenant withdrew.`)) setDecisionStatus(a.applicationNumber, 'withdrawn'); };

  const card = (a, { rank, top5, isSetAside }) => {
    const sc = a.scorecard?.overall;
    const money = (n) => (n != null ? `$${Number(n).toLocaleString()}` : null);
    const details = [
      ['Income', a.employment?.annualIncome ? `${money(a.employment.annualIncome)}/yr` : null],
      ['Tenure', a.employment?.yearsAtJob ? `${a.employment.yearsAtJob} yrs` : null],
      ['Rent-to-income', a.apartment?.rentToIncomeRatio != null ? `${a.apartment.rentToIncomeRatio}%` : null],
      ['References', (a.references || []).length ? `${a.references.length} provided` : null],
      ['Occupants', a.household?.numberOfOccupants != null ? String(a.household.numberOfOccupants) : null],
      ['Pets', a.lifestyle?.pets || 'None'],
    ].filter(([, v]) => v != null);
    const rc = decisions[a.applicationNumber]?.reasonCode;
    const rn = decisions[a.applicationNumber]?.notes;
    return (
      <div key={a.applicationNumber} style={{
        background: isSetAside ? C.paperDeep : C.card, border: `1px solid ${top5 ? C.red : C.rule}`, borderLeft: `4px solid ${isSetAside ? C.ruleDark : top5 ? C.red : C.green}`,
        borderRadius: R.card, padding: 'clamp(14px, 3vw, 18px)', opacity: isSetAside ? 0.94 : 1, boxShadow: top5 ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {rank != null && (
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: top5 ? C.red : C.paperDeep, color: top5 ? C.paper : C.inkSoft, border: `1px solid ${top5 ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{rank}</span>
          )}
          <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: isSetAside ? C.inkMute : C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{initials(a.tenant?.fullName)}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{a.tenant?.fullName || 'Applicant'}</span>
              {top5 && <span style={{ fontSize: 10, color: C.paper, background: C.red, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>TOP 5</span>}
              {isSetAside && <span style={{ fontSize: 10, color: C.inkSoft, background: C.rule, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>SET ASIDE</span>}
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>
              {[a.employment?.jobTitle, a.employment?.employer].filter(Boolean).join(' · ') || 'Role not listed'}
              {a.employment?.annualIncome ? ` · ${money(a.employment.annualIncome)}/yr` : ''}
            </div>
            {isSetAside && (
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6, padding: '6px 10px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
                <strong style={{ color: C.ink }}>Set aside:</strong> {reasonLabel(rc)}{rn ? ` — ${rn}` : ''}
              </div>
            )}
          </div>
          {sc != null && (
            <div style={{ textAlign: 'right', minWidth: 54 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, lineHeight: 1 }}>{Number(sc).toFixed(1)}<span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}> / 5</span></div>
              <div style={{ fontSize: 9, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>Scorecard</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {isSetAside ? (
              <button onClick={() => restore(a)} style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Restore</button>
            ) : (
              <button onClick={() => openSetAside(a)} title="Record a screenable reason" style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Set aside</button>
            )}
            <button onClick={() => withdraw(a)} title="Tenant withdrew" style={{ background: 'transparent', color: C.inkMute, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Withdrew</button>
          </div>
        </div>
        {details.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.rule}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px 18px' }}>
            {details.map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', marginTop: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>Ranked applicants — best fit first</div>
        <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
          Everyone who applied, ranked against the unit's criteria. Your <strong>top 5</strong> are highlighted. To de-prioritize someone, <strong>Set aside</strong> with a screenable reason — they stay in the list, sorted below.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {active.map((a, idx) => (
          <React.Fragment key={a.applicationNumber}>
            {idx === 5 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: C.rule }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Below your top 5</span>
                <div style={{ flex: 1, height: 1, background: C.rule }} />
              </div>
            )}
            {card(a, { rank: idx + 1, top5: idx < 5, isSetAside: false })}
          </React.Fragment>
        ))}
      </div>

      {setAsideApps.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Set aside ({setAsideApps.length})</div>
          <p style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>De-prioritized for the screenable reasons noted. Still shown to your landlord, at the bottom.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {setAsideApps.map((a) => card(a, { rank: null, top5: false, isSetAside: true }))}
          </div>
        </div>
      )}

      <DemoBrandingPreview />
      <DemoSendToLandlord
        active={active}
        setAside={setAsideApps.map((a) => ({ app: a, reasonCode: decisions[a.applicationNumber]?.reasonCode }))}
        unit={unit} realtor={realtorProfile}
        brand={{ name: DEMO_BRAND_NAME, brokerage: DEMO_BRAND_BROKERAGE, logoPng: DEMO_BRAND_LOGO_PNG }}
      />

      {/* Set-aside reason modal — OHRC-safe reason REQUIRED */}
      {setAsideFor && (() => {
        const a = applications.find((x) => x.applicationNumber === setAsideFor);
        return (
          <div onClick={() => setSetAsideFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,32px)', zIndex: 1000 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: C.paper, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}`, borderRadius: R.modal, padding: 'clamp(20px,4vw,28px)' }}>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Set aside</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>{a?.tenant?.fullName || 'Applicant'}</h3>
              <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 16 }}>Choose a screenable reason. They stay in the list (sorted to the bottom) with this reason recorded — your defensible paper trail. This is not a rejection.</p>
              <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Reason (required)</label>
              <select value={code} onChange={(e) => setCode(e.target.value)} style={{ width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', marginBottom: 14 }}>
                <option value="">Select a reason…</option>
                {SET_ASIDE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
              <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Note {code === 'other_screenable' ? '(required)' : '(optional)'}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. stated income $42k vs $60k minimum" style={{ width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={confirmSetAside} disabled={!code || (code === 'other_screenable' && !note.trim())} style={{ flex: 1, background: (!code || (code === 'other_screenable' && !note.trim())) ? C.ruleDark : C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px', fontSize: 14, fontWeight: 700, cursor: (!code || (code === 'other_screenable' && !note.trim())) ? 'not-allowed' : 'pointer' }}>Set aside</button>
                <button onClick={() => setSetAsideFor(null)} style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '13px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

function DemoSendToLandlord({ active = [], setAside = [], unit, realtor, brand }) {
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState('');
  const [emailNote, setEmailNote] = useState(false);

  const realtorName = brand?.name || realtor?.fullName || 'Demo Realtor';
  const brokerage = brand?.brokerage || realtor?.brokerage || 'Sample Realty';
  const realtorPhone = realtor?.phone || '';
  const unitLabel = unit?.address || 'the unit';
  const total = active.length + setAside.length;

  // Map a KV-shaped demo applicant into the white-label PDF builder's row shape.
  const toRow = (a, reasonCode) => ({
    decisionNotes: '',
    decisionReasonCode: reasonCode || null,
    application: {
      application_number: a.applicationNumber,
      full_name: a.tenant?.fullName,
      job_title: a.employment?.jobTitle,
      employer: a.employment?.employer,
      annual_income: a.employment?.annualIncome,
      co_applicant: a.coApplicant ? { name: a.coApplicant.name, annualIncome: a.coApplicant.annualIncome } : null,
      rent_to_income_ratio: a.apartment?.rentToIncomeRatio,
      references: a.references || [],
      scorecard: a.scorecard,
    },
  });

  // Full ranked list as fussy plain text: TOP MATCHES (top 5) + ALSO RANKED + SET ASIDE.
  // NO emojis, NO markdown. OHRC-safe: screenable facts + recorded reasons only.
  const composeText = () => {
    const RULE = '—'.repeat(28);
    const INDENT = '       ';
    const leader = (label, value) => `${INDENT}${label} ${'.'.repeat(Math.max(2, 15 - label.length))} ${value}`;
    const fitPhrase = (a) => {
      const r = a.apartment?.rentToIncomeRatio;
      if (r != null) return r <= 30 ? 'comfortable on income' : r <= 35 ? 'within typical range' : 'tighter on income';
      const o = a.scorecard?.overall;
      if (o != null) return o >= 4.5 ? 'strong overall' : o >= 3.5 ? 'solid overall' : 'mixed signals';
      return 'see application';
    };
    const block = (a, rank) => {
      const out = [];
      const role = [a.employment?.jobTitle, a.employment?.employer].filter(Boolean).join(', ');
      out.push(`[ ${rank} ]  ${(a.tenant?.fullName || 'Applicant').toUpperCase()}${role ? ` — ${role}` : ''}`);
      if (a.employment?.annualIncome) {
        const r2i = a.apartment?.rentToIncomeRatio;
        out.push(leader('Income', `$${Number(a.employment.annualIncome).toLocaleString()}/yr${r2i != null ? `  (${r2i}% rent-to-income)` : ''}`));
      }
      const yrs = a.employment?.yearsAtJob;
      if (yrs) out.push(leader('Tenure', `${yrs} yr${String(yrs) === '1' ? '' : 's'}`));
      const refs = (a.references || []).length;
      if (refs) out.push(leader('References', `${refs} provided`));
      out.push(leader('Fit', fitPhrase(a)));
      return out.join('\n');
    };

    const unitBits = [unitLabel, unit?.monthlyRent ? `$${Number(unit.monthlyRent).toLocaleString()}/mo` : null, unit?.bedrooms ? `${unit.bedrooms}BR` : null].filter(Boolean).join(' · ');
    const lines = [];
    lines.push(`RENTLETTER  |  ${unitBits}`);
    lines.push(`Ranked applicants from ${[realtorName, brokerage].filter(Boolean).join(', ')} — ${total} total, best fit first`);

    const top = active.slice(0, 5);
    const rest = active.slice(5);
    if (top.length) {
      lines.push('');
      lines.push('TOP MATCHES');
      lines.push('');
      lines.push(top.map((a, i) => block(a, i + 1)).join(`\n\n${RULE}\n\n`));
    }
    if (rest.length) {
      lines.push('');
      lines.push('ALSO RANKED');
      lines.push('');
      lines.push(rest.map((a, i) => block(a, i + 6)).join(`\n\n${RULE}\n\n`));
    }
    if (setAside.length) {
      lines.push('');
      lines.push('SET ASIDE');
      setAside.forEach((s) => lines.push(`- ${(s.app.tenant?.fullName || 'Applicant').toUpperCase()} — ${reasonLabel(s.reasonCode)}`));
    }
    lines.push('');
    lines.push(RULE);
    lines.push('Reply to set up viewings. Figures are applicant-reported.');
    lines.push([realtorName, brokerage, realtorPhone].filter(Boolean).join(' · '));
    return lines.join('\n');
  };

  const copyText = async () => {
    setPdfErr('');
    try {
      await navigator.clipboard.writeText(composeText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) { setPdfErr('Could not copy to clipboard.'); }
  };

  const generatePdf = async () => {
    setPdfBusy(true); setPdfErr('');
    try {
      // Reuse the real white-label PDF builder with demo data. No auth/Supabase/network.
      const { buildLandlordReportPdf } = await import('../../lib/landlordReportPdf');
      const activeRows = active.map((a) => toRow(a));
      const setAsideRows = setAside.map((s) => toRow(s.app, s.reasonCode));
      // brand.logoPng is a local PNG data URI → embeds in the PDF with NO network call.
      const profile = { full_name: realtorName, brokerage, phone: realtorPhone, logo_url: brand?.logoPng || null };
      const listing = { name: unitLabel, monthly_rent: unit?.monthlyRent ? Number(unit.monthlyRent) : null, bedrooms: unit?.bedrooms };
      const bytes = await buildLandlordReportPdf({ profile, listing, active: activeRows, setAside: setAsideRows });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'sample-ranked-applicants.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[demo pdf] error', e);
      setPdfErr('Could not generate the sample PDF.');
    }
    setPdfBusy(false);
  };

  return (
    <section className="rl-card" style={{ padding: 'clamp(18px, 3vw, 28px)', marginTop: 16 }}>
      <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Present to landlord</div>
      <div style={{ fontSize: 11.5, color: C.inkMute, fontStyle: 'italic', marginBottom: 14 }}>Sample — the full ranked list (top 5 highlighted) your landlord receives.</div>

      <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: C.inkMute, fontWeight: 600 }}>Landlord client: </span>
        <span style={{ color: C.ink }}>Jordan Lee · jordan@example.com · (416) 555-0188</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={generatePdf} disabled={pdfBusy} className="rl-btn"
          style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: pdfBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="doc" size={16} color={C.paper} /> {pdfBusy ? 'Generating…' : 'Generate PDF'}
        </button>
        <button onClick={copyText} className="rl-btn"
          style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="copy" size={16} /> {copied ? 'Copied!' : 'Copy text for landlord'}
        </button>
        <button onClick={() => setEmailNote(true)} className="rl-btn"
          style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="mail" size={16} color={C.inkSoft} /> Email report
        </button>
      </div>
      {emailNote && (
        <div style={{ marginTop: 12, fontSize: 13, color: C.inkSoft }}>Available once you're signed in.</div>
      )}
      {pdfErr && (
        <div style={{ marginTop: 12, fontSize: 13, color: C.red }}>{pdfErr}</div>
      )}
    </section>
  );
}

function AllApplicantsList({ applications, decisions, unit, setDecisionStatus, onJumpToReview, ranked }) {
  if (!applications.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.inkSoft, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card, background: C.paperDeep }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
          No applicants to show.
        </div>
        <div style={{ fontSize: 12, color: C.inkMute }}>
          Look up application numbers above to add applicants.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 16, lineHeight: 1.5 }}>
        Tap any applicant to review them. Use the favourite (✓) or reject (✗) buttons to decide quickly.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {applications.map((app, idx) => {
          const dec = decisions[app.applicationNumber] || { status: 'none' };
          const overall = app.scorecard?.overall || 0;
          const fitChecks = computeUnitFit(app, unit);
          const fitSummary = unitFitSummary(fitChecks);

          const topPick = ranked && idx === 0;
          const rank = idx + 1;
          const statusBorderColor = topPick ? C.red : dec.status === 'shortlist' ? C.green : dec.status === 'reject' ? C.red : C.rule;
          const statusBg = dec.status === 'shortlist' ? '#f0f7f3' : dec.status === 'reject' ? '#fef2f0' : C.paper;

          return (
            <div key={app.applicationNumber} style={{
              background: statusBg,
              border: `1px solid ${topPick ? C.red : C.rule}`,
              borderRadius: R.card,
              borderLeft: `4px solid ${statusBorderColor}`,
              padding: 'clamp(14px, 3vw, 18px)',
              display: 'grid',
              gridTemplateColumns: ranked ? 'auto 1fr auto' : '1fr auto',
              gap: 14,
              alignItems: 'center',
              minWidth: 0,
              boxShadow: topPick ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
            }}>
              {ranked && (
                <span aria-label={`Rank ${rank}`} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: topPick ? C.red : C.paperDeep, color: topPick ? C.paper : C.inkSoft, border: `1px solid ${topPick ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
                  {rank}
                </span>
              )}
              <div
                onClick={() => onJumpToReview(idx, app)}
                style={{ cursor: 'pointer', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <div style={{ fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>
                    {app.tenant?.fullName}
                  </div>
                  {topPick && (
                    <span style={{ fontSize: 10, color: C.paper, background: C.red, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>
                      TOP PICK
                    </span>
                  )}
                  {dec.status === 'shortlist' && !topPick && (
                    <span style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: '0.08em' }}>
                      ✓ FAVOURITE
                    </span>
                  )}
                  {dec.status === 'reject' && (
                    <span style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: '0.08em' }}>
                      ✗ REJECTED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, overflowWrap: 'break-word', marginBottom: 4 }}>
                  {app.employment?.jobTitle} at {app.employment?.employer}
                </div>
                <div style={{ fontSize: 12, color: C.inkMute, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>${(app.employment?.annualIncome || 0).toLocaleString()}/yr</span>
                  <span>·</span>
                  <span style={{ color: C.red, fontWeight: 600 }}>
                    {'●'.repeat(Math.round(overall))}{'○'.repeat(5 - Math.round(overall))}
                  </span>
                  {fitSummary && (
                    <>
                      <span>·</span>
                      <span style={{ color: fitSummary.color, fontWeight: 600 }}>
                        {fitSummary.label === 'Strong fit for your unit' && '✓ Fits unit'}
                        {fitSummary.label === 'Fits with caveats' && '! Caveats'}
                        {fitSummary.label === 'Does not fit' && '✗ Does not fit'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setDecisionStatus(app.applicationNumber, dec.status === 'reject' ? 'none' : 'reject')}
                  title="Reject"
                  style={{
                    background: dec.status === 'reject' ? C.red : 'transparent',
                    color: dec.status === 'reject' ? C.paper : C.red,
                    border: `1px solid ${C.red}`,
                    padding: '10px 14px', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', minHeight: 44, minWidth: 44,
                  }}>
                  ✗
                </button>
                <button
                  onClick={() => setDecisionStatus(app.applicationNumber, dec.status === 'shortlist' ? 'none' : 'shortlist')}
                  title="Favourite"
                  style={{
                    background: dec.status === 'shortlist' ? C.green : 'transparent',
                    color: dec.status === 'shortlist' ? C.paper : C.green,
                    border: `1px solid ${C.green}`,
                    padding: '10px 14px', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', minHeight: 44, minWidth: 44,
                  }}>
                  ✓
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// REVIEW VIEW — simplified card-by-card review for non-power users
// Designed for older landlords/realtors. One tenant per screen.
// Three big choices: Yes / Maybe / No. Tap → next.
// ════════════════════════════════════════════════════════════
function ReviewView({ applications, reviewIdx, setReviewIdx, expanded, setExpanded, getDecision, setDecisionStatus, decisions, unit, onJumpToDetail, onJumpToFavourites }) {
  const total = applications.length;

  // Count decisions
  const shortlistedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'shortlist').length;
  const rejectedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'reject').length;
  const undecidedCount = total - shortlistedCount - rejectedCount;

  // ─── END OF STACK SUMMARY ─────────────────────────────
  if (reviewIdx >= total) {
    return (
      <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(32px, 6vw, 60px) clamp(20px, 4vw, 40px)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
          You're done reviewing.
        </div>
        <h2 style={{
          fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 800,
          color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.1,
          marginBottom: 28,
        }}>
          {shortlistedCount === 0
            ? 'No favorites yet.'
            : `${shortlistedCount} favourite${shortlistedCount === 1 ? '' : 's'} of ${total}.`}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, maxWidth: 520, margin: '0 auto 32px',
        }}>
          <div style={{ padding: '18px 14px', background: C.paperDeep, borderRadius: R.ctrl, borderLeft: `4px solid ${C.ink}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.ink }}>{total}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Applicants</div>
          </div>
          <div style={{ padding: '18px 14px', background: '#f0f7f3', borderRadius: R.ctrl, borderLeft: `4px solid ${C.green}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.green }}>{shortlistedCount}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Shortlisted</div>
          </div>
          <div style={{ padding: '18px 14px', background: '#fafaf5', borderRadius: R.ctrl, borderLeft: `4px solid ${C.inkMute}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.inkMute }}>{undecidedCount}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Skipped</div>
          </div>
          <div style={{ padding: '18px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `4px solid ${C.red}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.red }}>{rejectedCount}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Rejected</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setReviewIdx(0)}
            style={{
              background: 'transparent', color: C.ink,
              border: `1px solid ${C.ink}`,
              padding: '14px 24px', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', minHeight: 48,
            }}>
            ↻ Start over
          </button>
          {shortlistedCount > 0 && (
            <button onClick={() => onJumpToFavourites()}
              style={{
                background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl,
                padding: '16px 28px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em',
                cursor: 'pointer', minHeight: 52, boxShadow: '0 1px 0 rgba(168,22,28,0.5)',
              }}>
              Review your shortlist ({shortlistedCount}) →
            </button>
          )}
        </div>
        {shortlistedCount > 0 && (
          <div style={{ fontSize: 12.5, color: C.inkMute, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            Next: compare your top picks ranked best-fit-first, then send the PDF or a paste-ready text to your landlord.
          </div>
        )}
      </div>
    );
  }

  // ─── ACTIVE CARD ─────────────────────────────────────
  const app = applications[reviewIdx];
  if (!app) return null;
  const decision = getDecision(app.applicationNumber);
  const fitChecks = computeUnitFit(app, unit);
  const fitSummary = unitFitSummary(fitChecks);

  // Make the decision then advance
  const decide = (status) => {
    setDecisionStatus(app.applicationNumber, status);
    setExpanded(false);
    setTimeout(() => setReviewIdx(reviewIdx + 1), 80);
  };
  const skip = () => {
    setExpanded(false);
    setReviewIdx(reviewIdx + 1);
  };

  // Build the one-line summary
  const monthlyIncome = (app.employment?.annualIncome || 0) / 12 + (app.coApplicant?.annualIncome || 0) / 12;
  const incomeStr = `$${Math.round(monthlyIncome).toLocaleString()}/month`;
  const yearsAtJob = app.employment?.yearsAtJob ? `${app.employment.yearsAtJob} yr` : 'new';
  const summaryLine = `${app.employment?.jobTitle || 'No job listed'} at ${app.employment?.employer || 'employer not listed'}`;
  const incomeLine = `${incomeStr} household income · ${yearsAtJob} at current job`;

  // Big visual score (out of 5)
  const overall = app.scorecard?.overall || 0;
  const dots = '●'.repeat(Math.round(overall)) + '○'.repeat(5 - Math.round(overall));

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500 }}>
            Applicant {reviewIdx + 1} of {total}
          </span>
          <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>
            ✓ {shortlistedCount} favourite{shortlistedCount === 1 ? '' : 's'} so far
          </span>
        </div>
        <div style={{ height: 4, background: C.rule, position: 'relative', borderRadius: R.pill, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${((reviewIdx + 1) / total) * 100}%`,
            background: C.red,
            borderRadius: R.pill,
            transition: 'width 0.2s',
          }} />
        </div>
      </div>

      {/* THE CARD */}
      <div style={{
        background: C.paper, border: `1px solid ${C.rule}`,
        borderRadius: R.card, overflow: 'hidden',
        padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4vw, 36px)',
      }}>
        {/* Name + score */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontSize: 'clamp(28px, 6vw, 44px)', fontWeight: 800,
            color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05,
            marginBottom: 10,
          }}>
            {app.tenant?.fullName}
            {app.tenant?.age && (
              <span style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: C.inkMute, fontWeight: 500, marginLeft: 12 }}>
                {app.tenant.age}
              </span>
            )}
          </h2>
          <div style={{
            fontSize: 'clamp(15px, 3.5vw, 17px)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 4,
          }}>
            {summaryLine}
          </div>
          <div style={{
            fontSize: 'clamp(14px, 3.2vw, 16px)', color: C.ink, fontWeight: 600, lineHeight: 1.5,
          }}>
            {incomeLine}
          </div>
        </div>

        {/* Score as dots + label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '14px 18px', background: '#fafaf5', borderRadius: R.ctrl,
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 26, color: C.red, letterSpacing: 4, lineHeight: 1 }}>
            {dots}
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              {overall >= 4.5 ? 'Very strong fit overall' :
                overall >= 3.5 ? 'Solid candidate' :
                overall >= 2.5 ? 'Has some concerns' : 'Significant concerns'}
            </div>
            <div style={{ fontSize: 11, color: C.inkMute, marginTop: 2 }}>
              Based on tenant's own answers
            </div>
          </div>
        </div>

        {/* Unit fit summary chip */}
        {fitSummary && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', marginBottom: 20, borderRadius: R.pill,
            background: fitSummary.color, color: C.paper,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
          }}>
            {fitSummary.label === 'Strong fit for your unit' && '✓ '}
            {fitSummary.label === 'Fits with caveats' && '! '}
            {fitSummary.label === 'Does not fit' && '✗ '}
            {fitSummary.label}
          </div>
        )}

        {/* Quick contact row — balanced, full-width action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {app.tenant?.phone && (
            <a href={`tel:${app.tenant.phone.replace(/\D/g, '')}`}
              style={{
                background: C.ink, color: C.paper, textDecoration: 'none',
                padding: '12px 18px', fontSize: 15, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 48, borderRadius: R.ctrl,
              }}>
              📞 Call {app.tenant.phone}
            </a>
          )}
          {app.email && (
            <a href={`mailto:${app.email}`}
              style={{
                background: 'transparent', color: C.ink,
                border: `1px solid ${C.ink}`,
                textDecoration: 'none',
                padding: '11px 18px', fontSize: 15, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 48, borderRadius: R.ctrl,
              }}>
              ✉ Email
            </a>
          )}
        </div>

        {/* See more / less */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent', color: C.inkSoft,
            border: 'none', padding: '4px 0',
            fontSize: 14, fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}>
          {expanded ? 'Hide full details ↑' : 'See full details ↓'}
        </button>

        {/* EXPANDED DETAILS */}
        {expanded && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
            {/* Fit checks detail */}
            {fitChecks.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Fit for your unit
                </h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  {fitChecks.map((check, idx) => {
                    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '!';
                    const color = check.status === 'pass' ? C.green : check.status === 'fail' ? C.red : '#a8161c';
                    return (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '10px 12px', background: '#fafaf5', borderRadius: R.ctrl, borderLeft: `3px solid ${color}`,
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: color, color: C.paper,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700, flexShrink: 0,
                        }}>
                          {icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                            {check.label}
                          </div>
                          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
                            {check.note}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Key facts */}
            <div style={{ marginBottom: 22 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                The basics
              </h4>
              <div style={{ display: 'grid', gap: 10, fontSize: 15, lineHeight: 1.55 }}>
                <SimpleFact label="Moving in" value={app.move?.moveInDate || 'Not specified'} />
                <SimpleFact label="Reason for moving" value={app.move?.reasonForMoving || 'Not specified'} />
                <SimpleFact label="Household" value={`${app.household?.numberOfOccupants || 1} occupant${(app.household?.numberOfOccupants || 1) == 1 ? '' : 's'}${app.household?.occupantsDetails ? ' · ' + app.household.occupantsDetails : ''}`} />
                {app.lifestyle?.pets && app.lifestyle.pets.toLowerCase() !== 'none' && (
                  <SimpleFact label="Pets" value={app.lifestyle.pets} />
                )}
                <SimpleFact label="Smoker" value={app.household?.smoker === 'no' ? 'Non-smoker' : app.household?.smoker === 'outdoor' ? 'Outdoor only' : 'Yes'} />
                {app.rental?.previousAddress && (
                  <SimpleFact
                    label="Last home"
                    value={`${app.rental.yearsAtPrevious || '?'} years at ${app.rental.previousAddress}${app.rental.previousLandlordName ? ' — landlord: ' + app.rental.previousLandlordName : ''}`}
                  />
                )}
                {app.coApplicant && (
                  <SimpleFact
                    label="Co-applicant"
                    value={`${app.coApplicant.name} · ${app.coApplicant.jobTitle || 'job not listed'}${app.coApplicant.annualIncome ? ' · $' + app.coApplicant.annualIncome.toLocaleString() + '/yr' : ''}`}
                  />
                )}
                {app.disclosures && (
                  <SimpleFact label="They disclosed" value={app.disclosures} />
                )}
              </div>
            </div>

            <button onClick={() => onJumpToDetail(reviewIdx)}
              style={{
                background: 'transparent', color: C.red,
                border: `1px solid ${C.red}`,
                padding: '10px 16px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}>
              Open full detailed view →
            </button>
          </div>
        )}
      </div>

      {/* THE THREE DECISION BUTTONS — always one even row, even at 375px */}
      <div style={{
        marginTop: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'clamp(8px, 2vw, 12px)',
      }}>
        <button
          onClick={() => decide('reject')}
          className="rl-btn"
          style={{
            background: decision.status === 'reject' ? C.red : C.card,
            color: decision.status === 'reject' ? C.paper : C.red,
            border: `1.5px solid ${C.red}`, borderRadius: R.card,
            padding: 'clamp(14px, 3vw, 20px) 8px',
            fontSize: 'clamp(14px, 3.5vw, 17px)', fontWeight: 700,
            cursor: 'pointer', minHeight: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
          <Icon name="x" size={18} strokeWidth={2.5} /> No
        </button>
        <button
          onClick={skip}
          className="rl-btn"
          style={{
            background: C.card, color: C.inkSoft,
            border: `1.5px solid ${C.ruleDark}`, borderRadius: R.card,
            padding: 'clamp(14px, 3vw, 20px) 8px',
            fontSize: 'clamp(14px, 3.5vw, 17px)', fontWeight: 700,
            cursor: 'pointer', minHeight: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          Skip
        </button>
        <button
          onClick={() => decide('shortlist')}
          className="rl-btn"
          style={{
            background: decision.status === 'shortlist' ? C.green : C.card,
            color: decision.status === 'shortlist' ? C.paper : C.green,
            border: `1.5px solid ${C.green}`, borderRadius: R.card,
            padding: 'clamp(14px, 3vw, 20px) 8px',
            fontSize: 'clamp(14px, 3.5vw, 17px)', fontWeight: 700,
            cursor: 'pointer', minHeight: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
          <Icon name="check" size={18} strokeWidth={2.5} /> Yes
        </button>
      </div>

      {/* Footer helpers */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <button
          onClick={() => { if (reviewIdx > 0) { setExpanded(false); setReviewIdx(reviewIdx - 1); } }}
          disabled={reviewIdx === 0}
          style={{
            background: 'transparent', border: 'none',
            color: reviewIdx === 0 ? C.inkMute : C.inkSoft,
            padding: '8px 4px', fontSize: 13, fontWeight: 500,
            cursor: reviewIdx === 0 ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
          }}>
          ← Previous applicant
        </button>
        <div style={{ fontSize: 11, color: C.inkMute, lineHeight: 1.5, textAlign: 'right' }}>
          {decision.status === 'shortlist' && '✓ Currently on your favourites'}
          {decision.status === 'reject' && '✗ Currently rejected'}
        </div>
      </div>
    </div>
  );
}

function SimpleFact({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5, overflowWrap: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW — single tenant deep dive (power users / detailed mode)
// ════════════════════════════════════════════════════════════
function DetailView({ applications, activeIdx, setActiveIdx, onRemove, getDecision, setDecisionStatus, setDecisionNotes, setDecisionReason, setMethodologyOpen, unit, rationaleLoading, setRationaleLoading, rationaleError, setRationaleError }) {
  const app = applications[activeIdx];
  if (!app) return null;
  const decision = getDecision(app.applicationNumber);
  const fitChecks = computeUnitFit(app, unit);
  const fitSummary = unitFitSummary(fitChecks);

  // AI rationale generator
  const generateRationale = async () => {
    setRationaleError('');
    setRationaleLoading(prev => ({ ...prev, [app.applicationNumber]: true }));
    try {
      const res = await fetch('/api/landlord/reasoning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application: app,
          decision: decision.status,
          unit,
          existingNotes: decision.notes || '',
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const existing = decision.notes || '';
      const combined = existing ? `${existing}\n\n${json.rationale}` : json.rationale;
      setDecisionNotes(app.applicationNumber, combined);
    } catch (e) {
      setRationaleError(e.message || 'Could not generate rationale.');
    }
    setRationaleLoading(prev => ({ ...prev, [app.applicationNumber]: false }));
  };

  const REASON_OPTIONS = [
    { v: '', l: '— Select a reason —' },
    { v: 'income_strength', l: 'Income stability' },
    { v: 'affordability', l: 'Rent affordability' },
    { v: 'rental_history', l: 'Strong rental history / references' },
    { v: 'long_term_fit', l: 'Long-term fit for the unit' },
    { v: 'disclosures', l: 'Disclosures / transparency' },
    { v: 'unit_fit', l: 'Best fit for this specific unit' },
    { v: 'other', l: 'Other (see notes)' },
  ];

  return (
    <div>
      {/* Applicant picker — dropdown (replaces the all-names-at-once button grid) */}
      {applications.length > 1 && (() => {
        // Order options: shortlisted first, then undecided, then rejected.
        const withIdx = applications.map((a, idx) => ({ a, idx, dec: getDecision(a.applicationNumber) }));
        const rank = s => (s === 'shortlist' ? 0 : s === 'reject' ? 2 : 1);
        const ordered = [...withIdx].sort((x, y) => rank(x.dec.status) - rank(y.dec.status));
        const statusLabel = s => (s === 'shortlist' ? '★ Shortlisted' : s === 'reject' ? '✕ Rejected' : 'Not yet decided');
        const shortlistedCount = withIdx.filter(x => x.dec.status === 'shortlist').length;
        const dec = getDecision(app.applicationNumber);
        const accent = dec.status === 'shortlist' ? C.green : dec.status === 'reject' ? C.red : C.ruleDark;

        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <label htmlFor="rl-applicant-picker" style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Reviewing applicant
              </label>
              <span style={{ fontSize: 12, color: C.inkMute }}>
                {activeIdx + 1} of {applications.length}{shortlistedCount > 0 ? ` · ${shortlistedCount} shortlisted` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <select
                  id="rl-applicant-picker"
                  value={activeIdx}
                  onChange={e => setActiveIdx(Number(e.target.value))}
                  style={{
                    width: '100%', appearance: 'none', cursor: 'pointer',
                    padding: '14px 44px 14px 16px', fontSize: 15, fontWeight: 600,
                    color: C.ink, background: C.card,
                    border: `1.5px solid ${accent}`, borderRadius: R.ctrl, outline: 'none',
                  }}>
                  {ordered.map(({ a, idx, dec }) => (
                    <option key={a.applicationNumber} value={idx}>
                      {a.tenant.fullName} — {statusLabel(dec.status)}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'inline-flex' }}>
                  <Icon name="chevronD" size={18} color={C.inkSoft} />
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setActiveIdx(activeIdx === 0 ? applications.length - 1 : activeIdx - 1)}
                  className="rl-btn" aria-label="Previous applicant"
                  style={{ background: C.card, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '0 16px', minHeight: 50, color: C.ink, display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                </button>
                <button
                  onClick={() => setActiveIdx(activeIdx === applications.length - 1 ? 0 : activeIdx + 1)}
                  className="rl-btn" aria-label="Next applicant"
                  style={{ background: C.card, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: '0 16px', minHeight: 50, color: C.ink, display: 'inline-flex', alignItems: 'center' }}>
                  <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={17} /></span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Card */}
      <div className="rl-card" style={{ overflow: 'hidden' }}>
        {/* Top bar with name + actions */}
        <div style={{ padding: 'clamp(18px, 4vw, 24px) clamp(16px, 4vw, 28px)', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace' }}>
              {app.applicationNumber}
              <span style={{
                marginLeft: 10, padding: '2px 8px',
                background: '#fff3cd', color: '#856404',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', borderRadius: 2,
              }}>
                Self-reported data
              </span>
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {app.tenant.fullName}
              {app.tenant.age && <span style={{ fontSize: 18, color: C.inkMute, fontWeight: 500, marginLeft: 12 }}>{app.tenant.age}</span>}
            </h2>
            <div style={{ marginTop: 8, fontSize: 14, color: C.inkSoft }}>
              {app.employment.jobTitle} at {app.employment.employer}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ScoreBadge score={app.scorecard.overall} />
            <button onClick={() => onRemove(app.applicationNumber)}
              style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, padding: '8px 14px', fontSize: 12, fontWeight: 500 }}>
              Remove
            </button>
            <button onClick={() => setMethodologyOpen(true)}
              style={{
                background: 'transparent', border: 'none',
                color: C.inkMute, fontSize: 11, fontWeight: 500,
                textDecoration: 'underline', cursor: 'pointer', padding: 0,
                width: '100%', textAlign: 'right', marginTop: 2,
              }}>
              How is this calculated?
            </button>
          </div>
        </div>

        {/* CONTACT + DECISION BAR (NEW) */}
        <div style={{
          padding: 'clamp(14px, 3vw, 18px) clamp(16px, 4vw, 28px)',
          borderBottom: `1px solid ${C.rule}`,
          background: C.paper,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 24,
          alignItems: 'center',
        }}>
          {/* CONTACT */}
          <div>
            <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Reach the tenant
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {app.tenant.phone && (
                <a href={`tel:${app.tenant.phone.replace(/\D/g, '')}`}
                  style={{
                    background: C.ink, color: C.paper, textDecoration: 'none',
                    padding: '8px 14px', fontSize: 13, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: R.ctrl,
                  }}>
                  📞 {app.tenant.phone}
                </a>
              )}
              {app.email && (
                <a href={`mailto:${app.email}?subject=Re: Your rental application (${app.applicationNumber})&body=Hi ${app.tenant.fullName},%0D%0A%0D%0A`}
                  style={{
                    background: 'transparent', color: C.ink, textDecoration: 'none',
                    border: `1px solid ${C.ink}`,
                    padding: '7px 14px', fontSize: 13, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: R.ctrl,
                  }}>
                  ✉ Email
                </a>
              )}
              {!app.tenant.phone && !app.email && (
                <span style={{ fontSize: 12, color: C.inkMute, fontStyle: 'italic' }}>
                  Tenant did not provide direct contact info.
                </span>
              )}
            </div>
          </div>

          {/* DECISION */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Your decision
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: 6 }}>
              {[
                { val: 'none', label: '—', bg: 'transparent', color: C.inkSoft },
                { val: 'shortlist', label: '✓ Shortlist', bg: C.green, color: C.paper },
                { val: 'reject', label: '✗ Reject', bg: C.inkMute, color: C.paper },
              ].map(opt => {
                const selected = decision.status === opt.val;
                return (
                  <button
                    key={opt.val}
                    onClick={() => setDecisionStatus(app.applicationNumber, opt.val)}
                    style={{
                      background: selected ? opt.bg : 'transparent',
                      color: selected ? opt.color : C.inkSoft,
                      border: `1px solid ${selected ? opt.bg : C.rule}`,
                      padding: '8px 6px', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* UNIT-FIT PANEL — only renders if the landlord set up unit context */}
        {fitChecks.length > 0 && (
          <div style={{
            padding: 'clamp(14px, 3vw, 18px) clamp(16px, 4vw, 28px)', borderBottom: `1px solid ${C.rule}`,
            background: C.paper,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Fit for your unit
              </div>
              {fitSummary && (
                <span style={{
                  background: fitSummary.color, color: C.paper,
                  padding: '3px 10px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {fitSummary.label}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {fitChecks.map((check, idx) => {
                const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : check.status === 'warn' ? '!' : '?';
                const color = check.status === 'pass' ? C.green : check.status === 'fail' ? C.red : check.status === 'warn' ? '#a8161c' : C.inkMute;
                return (
                  <div key={idx} style={{
                    padding: '10px 12px',
                    background: '#fafaf5', borderRadius: R.ctrl,
                    borderLeft: `3px solid ${color}`,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: color, color: C.paper,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
                        {check.label}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkSoft, lineHeight: 1.4 }}>
                        {check.note}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NOTES + DECISION RATIONALE (audit trail) */}
        <div style={{ padding: 'clamp(14px, 3vw, 18px) clamp(16px, 4vw, 28px)', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Notes (private)
              </div>
              <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4, lineHeight: 1.5 }}>
                Add anything you want to remember about this applicant.
              </div>
            </div>
          </div>

          <textarea
            value={decision.notes}
            onChange={e => setDecisionNotes(app.applicationNumber, e.target.value)}
            placeholder="Notes for your own records (optional)."
            rows={3}
            style={{
              width: '100%', padding: '10px 12px',
              border: `1px solid ${C.rule}`, background: C.paper, color: C.ink,
              fontSize: 13, fontFamily: "'Inter', sans-serif",
              resize: 'vertical', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = C.ink}
            onBlur={e => e.target.style.borderColor = C.rule}
          />
          {rationaleError && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 12, color: C.ink }}>
              {rationaleError}
            </div>
          )}
          {decision.statusChangedAt && (
            <div style={{ marginTop: 8, fontSize: 10, color: C.inkMute, letterSpacing: '0.02em' }}>
              Decision logged: {new Date(decision.statusChangedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>

          {/* LEFT: Profile facts */}
          <div style={{ padding: 'clamp(16px, 4vw, 28px)', borderRight: `1px solid ${C.rule}`, minWidth: 0 }}>
            <DataSection title="Employment">
              <DataRow label="Position" value={`${app.employment.jobTitle} at ${app.employment.employer}`} />
              <DataRow label="Tenure" value={app.employment.yearsAtJob ? `${app.employment.yearsAtJob} years` : 'Not specified'} />
              <DataRow label="Annual income" value={`$${(app.employment.annualIncome || 0).toLocaleString()} CAD`} />
              <DataRow label="Monthly income" value={`$${(app.employment.monthlyIncome || 0).toLocaleString()} CAD`} />
            </DataSection>

            {/* CO-APPLICANT — only if exists */}
            {app.coApplicant && (
              <DataSection title="Co-applicant">
                <DataRow label="Name" value={`${app.coApplicant.name}${app.coApplicant.age ? `, age ${app.coApplicant.age}` : ''}`} />
                <DataRow label="Relationship" value={app.coApplicant.relationship || 'Not specified'} />
                <DataRow label="Position" value={`${app.coApplicant.jobTitle || 'Not specified'} at ${app.coApplicant.employer || 'Not specified'}`} />
                {app.coApplicant.annualIncome && (
                  <DataRow label="Their income" value={`$${app.coApplicant.annualIncome.toLocaleString()} CAD`} />
                )}
                <DataRow
                  label="Combined household"
                  value={`$${((app.employment.annualIncome || 0) + (app.coApplicant.annualIncome || 0)).toLocaleString()} CAD/year`}
                  highlight
                />
              </DataSection>
            )}

            <DataSection title="Current rental">
              {app.rental.previousAddress ? (
                <>
                  <DataRow label="Current address" value={app.rental.previousAddress} />
                  <DataRow label="Years there" value={app.rental.yearsAtPrevious || 'Not specified'} />
                  {app.rental.currentRent && (
                    <DataRow label="Current rent" value={`$${app.rental.currentRent.toLocaleString()}/mo`} />
                  )}
                  <DataRow label="Current landlord" value={app.rental.previousLandlordName || 'Not specified'} />
                  <DataRow label="Contact" value={app.rental.previousLandlordContact || 'Available on request'} />
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.inkSoft, fontStyle: 'italic' }}>
                  First-time renter or rental history not provided
                </div>
              )}
            </DataSection>

            <DataSection title="Apartment they're applying for">
              <DataRow label="Address" value={app.apartment.address || 'Not specified'} />
              <DataRow label="Details" value={app.apartment.description || 'Not specified'} />
              {app.apartment.rentToIncomeRatio && (
                <DataRow label="Rent-to-income" value={`${app.apartment.rentToIncomeRatio}%${app.coApplicant ? ' (combined)' : ''}`} highlight={app.apartment.rentToIncomeRatio <= 30} />
              )}
            </DataSection>

            <DataSection title="Move details">
              <DataRow label="Move-in" value={app.move.moveInDate} />
              <DataRow label="Reason" value={app.move.reasonForMoving || 'Not specified'} multiline />
            </DataSection>

            {/* HOUSEHOLD */}
            {app.household && (
              <DataSection title="Household">
                <DataRow label="Occupants" value={app.household.numberOfOccupants || '1'} />
                <DataRow
                  label="Smoker"
                  value={
                    app.household.smoker === 'no' ? 'Non-smoker' :
                    app.household.smoker === 'outdoor' ? 'Outdoor only' :
                    app.household.smoker === 'yes' ? 'Yes' : '—'
                  }
                  highlight={app.household.smoker === 'no'}
                />
                {app.household.occupantsDetails && (
                  <DataRow label="Details" value={app.household.occupantsDetails} multiline />
                )}
              </DataSection>
            )}

            {(app.lifestyle.personality || app.lifestyle.pets) && (
              <DataSection title="Lifestyle">
                {app.lifestyle.personality && <DataRow label="Personality" value={app.lifestyle.personality} multiline />}
                {app.lifestyle.pets && <DataRow label="Pets" value={app.lifestyle.pets} />}
              </DataSection>
            )}

            {/* VEHICLE */}
            {app.vehicle && (
              <DataSection title="Vehicle">
                <DataRow label="Make/Model" value={`${app.vehicle.makeModel || 'Not specified'}${app.vehicle.year ? ` (${app.vehicle.year})` : ''}`} />
              </DataSection>
            )}

            {/* REFERENCES */}
            {app.references && app.references.length > 0 && (
              <DataSection title="References (named)">
                {app.references.map((ref, idx) => (
                  <div key={idx} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: idx < app.references.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{ref.name}</div>
                    <div style={{ fontSize: 12, color: C.inkSoft }}>
                      {ref.relationship}{ref.contact ? ` · ${ref.contact}` : ''}
                    </div>
                  </div>
                ))}
              </DataSection>
            )}

            {app.disclosures && (
              <DataSection title="Disclosures" highlightRed>
                <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                  {app.disclosures}
                </div>
              </DataSection>
            )}
          </div>

          {/* RIGHT: Landlord Scorecard */}
          <div style={{ padding: 'clamp(16px, 4vw, 28px)', background: C.paper, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              The Rentletter Scorecard
            </div>
            <p style={{ fontSize: 12, color: C.inkMute, marginBottom: 24, lineHeight: 1.5 }}>
              Calculated by Rentletter from the tenant's inputs. Honest, not promotional.
            </p>

            {[
              { key: 'incomeStability', label: 'Income stability' },
              { key: 'rentAffordability', label: 'Rent affordability' },
              { key: 'rentalHistory', label: 'Rental history' },
              { key: 'longTermIntent', label: 'Long-term intent' },
              { key: 'disclosures', label: 'Disclosures' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
                  <Stars score={app.scorecard[key].score} />
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>
                  {app.scorecard[key].note}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 24, padding: 20, background: C.ink, color: C.paper, borderRadius: R.card }}>
              <div style={{ fontSize: 11, color: '#a4adbb', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Overall score
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {app.scorecard.overall} <span style={{ fontSize: 16, color: '#a4adbb', fontWeight: 500 }}>/ 5</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPARE VIEW — side-by-side table
// ════════════════════════════════════════════════════════════
function CompareView({ applications, onRemove, getDecision, setDecisionStatus, ranked }) {
  const factors = [
    { label: 'Annual income', get: a => `$${(a.employment.annualIncome || 0).toLocaleString()}` },
    { label: 'Combined household income', get: a => {
      const total = (a.employment.annualIncome || 0) + (a.coApplicant?.annualIncome || 0);
      return a.coApplicant ? `$${total.toLocaleString()} (joint)` : `$${total.toLocaleString()}`;
    }},
    { label: 'Job tenure', get: a => a.employment.yearsAtJob ? `${a.employment.yearsAtJob} years` : '—' },
    { label: 'Employer', get: a => a.employment.employer },
    { label: 'Rental history', get: a => a.rental.previousAddress ? `${a.rental.yearsAtPrevious || '?'} yrs` : 'First-time' },
    { label: 'Current rent', get: a => a.rental?.currentRent ? `$${a.rental.currentRent.toLocaleString()}` : '—' },
    { label: 'Previous landlord', get: a => a.rental.previousLandlordName || '—' },
    { label: 'Rent-to-income', get: a => a.apartment.rentToIncomeRatio ? `${a.apartment.rentToIncomeRatio}%` : '—' },
    { label: 'Move-in date', get: a => a.move.moveInDate },
    { label: 'Occupants', get: a => a.household?.numberOfOccupants || '1' },
    { label: 'Smoker', get: a => {
      const s = a.household?.smoker;
      return s === 'no' ? 'Non-smoker' : s === 'outdoor' ? 'Outdoor' : s === 'yes' ? 'Yes' : '—';
    }},
    { label: 'Co-applicant', get: a => a.coApplicant ? `${a.coApplicant.name} (${a.coApplicant.relationship || '—'})` : 'Single' },
    { label: 'Pets', get: a => a.lifestyle.pets || 'None' },
    { label: 'Vehicle', get: a => a.vehicle ? `${a.vehicle.makeModel || 'Yes'}${a.vehicle.year ? ` (${a.vehicle.year})` : ''}` : 'None' },
    { label: 'Named references', get: a => a.references && a.references.length > 0 ? `${a.references.length} provided` : 'On request' },
    { label: 'Disclosures', get: a => a.disclosures ? 'Yes — see detail' : 'None' },
  ];

  const scorecardRows = [
    { key: 'incomeStability', label: 'Income stability' },
    { key: 'rentAffordability', label: 'Rent affordability' },
    { key: 'rentalHistory', label: 'Rental history' },
    { key: 'longTermIntent', label: 'Long-term intent' },
    { key: 'disclosures', label: 'Disclosures' },
  ];

  return (
    <>
      {/* ── DESKTOP: side-by-side comparison table ── */}
      <div className="rl-cmp-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + applications.length * 200 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: 200 }}></th>
              {applications.map((app, idx) => {
                const dec = getDecision ? getDecision(app.applicationNumber) : { status: 'none' };
                const isShortlisted = dec.status === 'shortlist';
                return (
                  <th key={app.applicationNumber} style={thStyle}>
                    {ranked && (
                      <div style={{ fontSize: 11, fontWeight: 800, color: idx === 0 ? C.red : C.inkMute, letterSpacing: '0.08em', marginBottom: 6 }}>
                        {idx === 0 ? 'TOP PICK · #1' : `#${idx + 1}`}
                      </div>
                    )}
                    <div style={{ marginBottom: 8 }}>
                      <ScoreBadge score={app.scorecard.overall} small />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 2 }}>
                      {app.tenant.fullName}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkMute, fontFamily: 'monospace', marginBottom: 8 }}>
                      {app.applicationNumber}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {isShortlisted && setDecisionStatus ? (
                        <button onClick={() => setDecisionStatus(app.applicationNumber, 'none')}
                          title="Take off shortlist (keeps the applicant loaded)"
                          style={{ background: 'transparent', border: `1px solid ${C.green}`, color: C.green, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                          ✓ On shortlist — remove
                        </button>
                      ) : (
                        <button onClick={() => onRemove(app.applicationNumber)}
                          style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, padding: '4px 10px', fontSize: 11, fontWeight: 500 }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {/* Profile facts */}
            <tr><td colSpan={applications.length + 1} style={{ padding: '20px 0 8px', fontSize: 11, fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Profile</td></tr>
            {factors.map(f => (
              <tr key={f.label}>
                <td style={tdLabelStyle}>{f.label}</td>
                {applications.map(app => (
                  <td key={app.applicationNumber} style={tdStyle}>
                    {f.get(app)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Scorecard */}
            <tr><td colSpan={applications.length + 1} style={{ padding: '20px 0 8px', fontSize: 11, fontWeight: 600, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Scorecard</td></tr>
            {scorecardRows.map(({ key, label }) => (
              <tr key={key}>
                <td style={tdLabelStyle}>{label}</td>
                {applications.map(app => (
                  <td key={app.applicationNumber} style={tdStyle}>
                    <Stars score={app.scorecard[key].score} size={12} />
                    <div style={{ fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                      {app.scorecard[key].note}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td style={{ ...tdLabelStyle, fontWeight: 700, color: C.ink }}>Overall</td>
              {applications.map(app => (
                <td key={app.applicationNumber} style={{ ...tdStyle, fontWeight: 800, color: C.ink, fontSize: 20 }}>
                  {app.scorecard.overall} <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 500 }}>/ 5</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── MOBILE: each applicant as a full-width labelled card (no overflow) ── */}
      <div className="rl-cmp-cards">
        {applications.map((app, idx) => {
          const dec = getDecision ? getDecision(app.applicationNumber) : { status: 'none' };
          const isShortlisted = dec.status === 'shortlist';
          const topPick = ranked && idx === 0;
          return (
            <div key={app.applicationNumber} style={{
              background: C.paper, border: `1px solid ${topPick ? C.red : C.rule}`,
              borderLeft: `4px solid ${topPick ? C.red : C.green}`, borderRadius: R.card,
              padding: 'clamp(14px, 4vw, 18px)', boxShadow: topPick ? '0 0 0 1px rgba(215,32,39,0.18)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                {ranked && (
                  <span aria-label={`Rank ${idx + 1}`} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: topPick ? C.red : C.paperDeep, color: topPick ? C.paper : C.inkSoft, border: `1px solid ${topPick ? C.red : C.ruleDark}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
                    {idx + 1}
                  </span>
                )}
                <span style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{app.tenant.fullName}</span>
                {topPick && <span style={{ fontSize: 10, color: C.paper, background: C.red, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: R.pill }}>TOP PICK</span>}
                <span style={{ marginLeft: 'auto' }}><ScoreBadge score={app.scorecard.overall} small /></span>
              </div>
              <div style={{ fontSize: 10, color: C.inkMute, fontFamily: 'monospace', marginBottom: 12 }}>{app.applicationNumber}</div>

              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Profile</div>
              <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                {factors.map(f => (
                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13, lineHeight: 1.4 }}>
                    <span style={{ color: C.inkMute, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{f.get(app)}</span>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Scorecard</div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {scorecardRows.map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13 }}>
                    <span style={{ color: C.inkMute, flexShrink: 0 }}>{label}</span>
                    <span style={{ textAlign: 'right' }}>
                      <Stars score={app.scorecard[key].score} size={12} />
                      <div style={{ fontSize: 10, color: C.inkMute, marginTop: 2, overflowWrap: 'anywhere' }}>{app.scorecard[key].note}</div>
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 14, paddingTop: 6, borderTop: `1px solid ${C.rule}` }}>
                  <span style={{ color: C.ink, fontWeight: 700 }}>Overall</span>
                  <span style={{ color: C.ink, fontWeight: 800 }}>{app.scorecard.overall} <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 500 }}>/ 5</span></span>
                </div>
              </div>

              {isShortlisted && setDecisionStatus ? (
                <button onClick={() => setDecisionStatus(app.applicationNumber, 'none')}
                  style={{ width: '100%', background: 'transparent', border: `1px solid ${C.green}`, color: C.green, borderRadius: R.ctrl, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                  ✓ On shortlist — remove
                </button>
              ) : (
                <button onClick={() => onRemove(app.applicationNumber)}
                  style={{ width: '100%', background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, borderRadius: R.ctrl, padding: '10px', fontSize: 13, fontWeight: 500, cursor: 'pointer', minHeight: 44 }}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .rl-cmp-cards { display: none; }
        @media (max-width: 640px) {
          .rl-cmp-table { display: none; }
          .rl-cmp-cards { display: grid; gap: 14px; }
        }
      `}</style>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// RANKED VIEW — the crown jewel
// Weighted decision engine with presets, animation, and defensible output
// ════════════════════════════════════════════════════════════

// ── Unit-fit helper ────────────────────────────────────────
// Compares an applicant against the landlord's unit context.
// Returns an array of { label, status: 'pass'|'fail'|'warn'|'unknown', note }
function computeUnitFit(app, unit) {
  if (!unit || (!unit.address && !unit.monthlyRent && !unit.bedrooms)) return [];

  const checks = [];

  // Rent affordability against the unit's actual rent
  if (unit.monthlyRent) {
    const unitRent = parseInt(unit.monthlyRent);
    const monthlyIncome = (app.employment?.annualIncome || 0) / 12 + (app.coApplicant?.annualIncome || 0) / 12;
    if (monthlyIncome > 0) {
      const ratio = Math.round((unitRent / monthlyIncome) * 100);
      let status = 'pass';
      let note = `Rent is ${ratio}% of household income`;
      if (ratio > 40) { status = 'fail'; note = `${ratio}% rent-to-income — over 40% threshold`; }
      else if (ratio > 30) { status = 'warn'; note = `${ratio}% rent-to-income — slightly stretched`; }
      checks.push({ label: 'Affordable for them', status, note });
    }
  }

  // Pets policy
  if (unit.allowsPets === 'no') {
    const pets = app.lifestyle?.pets;
    const hasPets = pets && pets.toLowerCase() !== 'none' && pets.trim() !== '';
    checks.push({
      label: 'No-pets policy',
      status: hasPets ? 'fail' : 'pass',
      note: hasPets ? `Applicant has: ${pets.slice(0, 40)}` : 'Applicant reports no pets',
    });
  } else if (unit.allowsPets === 'yes') {
    const pets = app.lifestyle?.pets;
    const hasPets = pets && pets.toLowerCase() !== 'none' && pets.trim() !== '';
    checks.push({
      label: 'Pet policy',
      status: 'pass',
      note: hasPets ? `Has pets (allowed): ${pets.slice(0, 40)}` : 'No pets (also fine)',
    });
  }

  // Smoking policy
  if (unit.allowsSmoking === 'no') {
    const smoker = app.household?.smoker;
    if (smoker === 'yes') {
      checks.push({ label: 'Non-smoking unit', status: 'fail', note: 'Applicant smokes' });
    } else if (smoker === 'outdoor') {
      checks.push({ label: 'Non-smoking unit', status: 'warn', note: 'Outdoor smoker only' });
    } else {
      checks.push({ label: 'Non-smoking unit', status: 'pass', note: 'Non-smoker' });
    }
  }

  // Parking
  if (unit.parkingIncluded === 'no' && app.vehicle?.makeModel) {
    checks.push({
      label: 'No parking included',
      status: 'warn',
      note: `Applicant has ${app.vehicle.makeModel} — may need street parking`,
    });
  }

  // Occupancy fit (rough — bedrooms vs occupants)
  if (unit.bedrooms) {
    const beds = parseFloat(unit.bedrooms);
    const occupants = parseInt(app.household?.numberOfOccupants || '1');
    if (!isNaN(beds) && !isNaN(occupants)) {
      let status = 'pass';
      let note = `${occupants} occupant${occupants === 1 ? '' : 's'} for ${beds}BR`;
      // Reasonable rule: occupants should not exceed beds + 1
      if (occupants > beds + 1) { status = 'warn'; note = `${occupants} occupants in ${beds}BR — tight`; }
      checks.push({ label: 'Occupancy fit', status, note });
    }
  }

  return checks;
}

function unitFitSummary(checks) {
  if (!checks.length) return null;
  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  if (fails > 0) return { label: 'Does not fit', color: '#d72027' };
  if (warns > 0) return { label: 'Fits with caveats', color: '#a8161c' };
  return { label: 'Strong fit for your unit', color: '#2d7d4a' };
}

const PRIORITY_PRESETS = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'All factors weighted equally — a fair starting point.',
    weights: { incomeStability: 1.0, rentAffordability: 1.0, rentalHistory: 1.0, longTermIntent: 1.0, disclosures: 1.0 },
  },
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'For high-value properties. Income, references, and clean disclosures matter most.',
    weights: { incomeStability: 3.0, rentAffordability: 2.0, rentalHistory: 3.0, longTermIntent: 1.0, disclosures: 3.0 },
  },
  {
    id: 'affordability',
    label: 'Affordability-focused',
    description: 'For value properties. Make sure they can comfortably afford rent without stretching.',
    weights: { incomeStability: 2.0, rentAffordability: 3.0, rentalHistory: 2.0, longTermIntent: 2.0, disclosures: 2.0 },
  },
  {
    id: 'longterm',
    label: 'Long-term tenant',
    description: 'For family homes or units you want stable for 2+ years. Stability over short-term metrics.',
    weights: { incomeStability: 2.0, rentAffordability: 2.0, rentalHistory: 3.0, longTermIntent: 3.0, disclosures: 2.0 },
  },
  {
    id: 'risk',
    label: 'Risk-averse',
    description: 'For first-time landlords or shared buildings. Heavy weight on history and disclosures.',
    weights: { incomeStability: 2.0, rentAffordability: 2.0, rentalHistory: 3.0, longTermIntent: 2.0, disclosures: 3.0 },
  },
];

// ── 5 discrete weight stops ────────────────────────────────────
// Values are mapped to the existing 0-3 weight scale used by calculateWeightedScore.
const WEIGHT_STOPS = [
  { value: 0,   label: 'Ignore',   shortLabel: 'Ignore' },
  { value: 0.5, label: 'Light',    shortLabel: 'Light' },
  { value: 1.0, label: 'Normal',   shortLabel: 'Normal' },
  { value: 2.0, label: 'Heavy',    shortLabel: 'Heavy' },
  { value: 3.0, label: 'Critical', shortLabel: 'Critical' },
];

// Snap any continuous weight to the nearest of our 5 stops
function snapToStop(value) {
  let nearest = WEIGHT_STOPS[0];
  let minDiff = Math.abs(value - nearest.value);
  for (let i = 1; i < WEIGHT_STOPS.length; i++) {
    const diff = Math.abs(value - WEIGHT_STOPS[i].value);
    if (diff < minDiff) { minDiff = diff; nearest = WEIGHT_STOPS[i]; }
  }
  return nearest;
}

const FACTOR_DEFS = [
  { key: 'incomeStability', label: 'Income stability', short: 'income', help: 'How reliable their paycheck is. High for long tenure at stable employers.' },
  { key: 'rentAffordability', label: 'Rent affordability', short: 'affordability', help: 'Rent vs. monthly income. Below 30% is the lending standard.' },
  { key: 'rentalHistory', label: 'Rental history', short: 'history', help: 'Previous landlord references and length of past tenancies.' },
  { key: 'longTermIntent', label: 'Long-term intent', short: 'commitment', help: 'How likely they are to stay 1-2+ years vs. leave early.' },
  { key: 'disclosures', label: 'Disclosures', short: 'transparency', help: 'Honesty about credit, gaps, or other potential concerns.' },
];

function RankedView({ applications, weights, setWeights, onRemove }) {
  const [previousOrder, setPreviousOrder] = useState({});
  const [activePreset, setActivePreset] = useState('balanced');
  const [recentlyChanged, setRecentlyChanged] = useState({});

  // Calculate ranked applications with weighted scores + per-factor contributions
  const ranked = [...applications]
    .map(app => {
      const score = calculateWeightedScore(app.scorecard, weights);
      // Find which factors are pulling the score up the most
      const contributions = FACTOR_DEFS.map(f => ({
        key: f.key, label: f.label, short: f.short,
        contribution: app.scorecard[f.key].score * weights[f.key],
        rawScore: app.scorecard[f.key].score,
        weight: weights[f.key],
      })).sort((a, b) => b.contribution - a.contribution);

      return {
        ...app,
        weightedScore: score,
        topFactors: contributions.slice(0, 2),
        weakFactor: contributions[contributions.length - 1],
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);

  // Track movement for animation
  useEffect(() => {
    const newOrder = {};
    ranked.forEach((app, idx) => {
      newOrder[app.applicationNumber] = idx;
    });

    // Determine which applications changed position
    if (Object.keys(previousOrder).length > 0) {
      const changes = {};
      ranked.forEach((app, idx) => {
        const previousIdx = previousOrder[app.applicationNumber];
        if (previousIdx !== undefined && previousIdx !== idx) {
          changes[app.applicationNumber] = previousIdx > idx ? 'up' : 'down';
        }
      });
      if (Object.keys(changes).length > 0) {
        setRecentlyChanged(changes);
        const timer = setTimeout(() => setRecentlyChanged({}), 1800);
        return () => clearTimeout(timer);
      }
    }
    setPreviousOrder(newOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  // Generate human-readable summary of weights
  const getPrioritySentence = () => {
    const sorted = FACTOR_DEFS
      .map(f => ({ ...f, weight: weights[f.key] }))
      .sort((a, b) => b.weight - a.weight);

    // Find factors that are meaningfully above average
    const avg = Object.values(weights).reduce((a, b) => a + b, 0) / 5;
    const high = sorted.filter(f => f.weight > avg * 1.3);
    const low = sorted.filter(f => f.weight < avg * 0.5);

    if (high.length === 0 && low.length === 0) {
      return 'All factors weighted equally — looking for a well-rounded tenant.';
    }
    let parts = [];
    if (high.length > 0) {
      const names = high.map(f => f.short);
      parts.push(`prioritizing ${formatList(names)}`);
    }
    if (low.length > 0) {
      const names = low.map(f => f.short);
      parts.push(`deprioritizing ${formatList(names)}`);
    }
    return parts.join(', ') + '.';
  };

  // Apply preset
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setWeights(preset.weights);
  };

  // Detect if current weights match a preset
  useEffect(() => {
    const matching = PRIORITY_PRESETS.find(p =>
      Object.keys(p.weights).every(k => Math.abs(p.weights[k] - weights[k]) < 0.05)
    );
    if (matching) {
      setActivePreset(matching.id);
    } else {
      setActivePreset('custom');
    }
  }, [weights]);

  // Calculate max weight for chart visualization
  const maxWeight = Math.max(...Object.values(weights), 1);

  return (
    <div>

      {/* ── PRESETS BAR ─────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Step 1 · Choose your priorities
          </div>
          <div style={{ fontSize: 12, color: C.inkMute }}>
            Pick a preset or adjust manually below
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 8,
        }}>
          {PRIORITY_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              title={preset.description}
              style={{
                background: activePreset === preset.id ? C.ink : C.paper,
                color: activePreset === preset.id ? C.paper : C.ink,
                border: `1px solid ${activePreset === preset.id ? C.ink : C.rule}`,
                padding: '10px 12px', fontSize: 13, fontWeight: 600,
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                position: 'relative',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                textAlign: 'center',
              }}>
              {preset.label}
              {activePreset === preset.id && (
                <span style={{ marginLeft: 6, color: C.red, fontSize: 10 }}>●</span>
              )}
            </button>
          ))}
          {/* Custom Weights — always visible, sibling preset button */}
          <button
            onClick={() => setActivePreset('custom')}
            title="Set each weight manually"
            style={{
              background: activePreset === 'custom' ? C.ink : C.paper,
              color: activePreset === 'custom' ? C.paper : C.red,
              border: `1px ${activePreset === 'custom' ? 'solid' : 'dashed'} ${activePreset === 'custom' ? C.ink : C.red}`,
              padding: '10px 12px', fontSize: 13, fontWeight: 600,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              position: 'relative',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              textAlign: 'center',
            }}>
            Custom Weights
            {activePreset === 'custom' && (
              <span style={{ marginLeft: 6, color: C.red, fontSize: 10 }}>●</span>
            )}
          </button>
        </div>
        {/* Active preset description — fixed slot below, doesn't shift the grid */}
        <p style={{
          margin: '16px auto', maxWidth: 560, fontSize: 13, color: C.inkSoft,
          fontStyle: 'italic', lineHeight: 1.5, textAlign: 'center',
          minHeight: 36,
        }}>
          {activePreset === 'custom'
            ? 'Set each factor weight yourself using the sliders below.'
            : PRIORITY_PRESETS.find(p => p.id === activePreset)?.description}
        </p>
      </div>

      {/* ── MAIN TWO-COLUMN LAYOUT ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 32, alignItems: 'start' }}
           className="ranked-grid">

        {/* ╔══ LEFT: WEIGHT CONTROLS ══════════════════════════╗ */}
        <div style={{ background: C.paper, border: `2px solid ${C.ink}`, borderRadius: R.card, overflow: 'hidden', position: 'sticky', top: 20 }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: `2px solid ${C.ink}`, background: C.ink, color: C.paper }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.red, marginBottom: 4 }}>
              Step 2 · Fine-tune
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Weight each factor
            </div>
          </div>

          {/* Sliders */}
          <div style={{ padding: '20px 24px' }}>
            {FACTOR_DEFS.map((f, idx) => {
              const currentValue = weights[f.key];
              const currentStopIdx = WEIGHT_STOPS.findIndex(s => Math.abs(s.value - currentValue) < 0.05);
              const safeStopIdx = currentStopIdx >= 0 ? currentStopIdx : 2; // default to Normal
              const stop = WEIGHT_STOPS[safeStopIdx];
              const pct = (safeStopIdx / (WEIGHT_STOPS.length - 1)) * 100;
              const isHigh = safeStopIdx >= 3; // Heavy or Critical
              const isLow = safeStopIdx <= 1;  // Ignore or Light
              const fillColor = isHigh ? C.red : C.ink;
              return (
                <div key={f.key} style={{ marginBottom: idx === FACTOR_DEFS.length - 1 ? 0 : 26 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                      {f.label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: isHigh ? C.red : isLow ? C.inkMute : C.ink,
                    }}>
                      {stop.label}
                    </span>
                  </div>
                  {/* Single chunky slider — track + thumb, no duplicate bars */}
                  <input
                    type="range"
                    min="0"
                    max={WEIGHT_STOPS.length - 1}
                    step="1"
                    value={safeStopIdx}
                    onChange={e => {
                      const newStop = WEIGHT_STOPS[parseInt(e.target.value)];
                      setWeights({ ...weights, [f.key]: newStop.value });
                    }}
                    className={`rl-slider rl-slider-${f.key}`}
                    style={{
                      width: '100%',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      height: 28,
                      background: 'transparent',
                      cursor: 'pointer',
                      outline: 'none',
                      margin: 0,
                      padding: 0,
                    }}
                  />
                  {/* Per-slider injected CSS so each one's fill color matches its current intensity */}
                  <style dangerouslySetInnerHTML={{ __html: `
                    .rl-slider-${f.key} {
                      --fill: ${fillColor};
                      --pct: ${pct}%;
                    }
                    .rl-slider-${f.key}::-webkit-slider-runnable-track {
                      height: 8px;
                      border-radius: 4px;
                      background: linear-gradient(to right, var(--fill) 0%, var(--fill) var(--pct), ${C.rule} var(--pct), ${C.rule} 100%);
                    }
                    .rl-slider-${f.key}::-moz-range-track {
                      height: 8px;
                      border-radius: 4px;
                      background: ${C.rule};
                    }
                    .rl-slider-${f.key}::-moz-range-progress {
                      height: 8px;
                      border-radius: 4px;
                      background: var(--fill);
                    }
                    .rl-slider-${f.key}::-webkit-slider-thumb {
                      -webkit-appearance: none;
                      appearance: none;
                      width: 28px;
                      height: 28px;
                      border-radius: 50%;
                      background: ${C.paper};
                      border: 3px solid var(--fill);
                      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
                      cursor: grab;
                      margin-top: -10px;
                      transition: transform 0.1s;
                    }
                    .rl-slider-${f.key}::-webkit-slider-thumb:active {
                      cursor: grabbing;
                      transform: scale(1.1);
                    }
                    .rl-slider-${f.key}::-moz-range-thumb {
                      width: 28px;
                      height: 28px;
                      border-radius: 50%;
                      background: ${C.paper};
                      border: 3px solid var(--fill);
                      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
                      cursor: grab;
                    }
                  `}} />
                </div>
              );
            })}
          </div>

          {/* Priority sentence */}
          <div style={{ padding: '18px 24px', background: '#fafaf5', borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Your weighting reads as
            </div>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontWeight: 500 }}>
              You're {getPrioritySentence()}
            </p>
          </div>

          <button onClick={() => applyPreset(PRIORITY_PRESETS[0])}
            style={{
              width: '100%', background: 'transparent',
              border: 'none', borderTop: `1px solid ${C.rule}`, borderRadius: 0,
              padding: 14, fontSize: 12, fontWeight: 500, color: C.inkSoft,
            }}>
            ↺ Reset to balanced
          </button>
        </div>

        {/* ╔══ RIGHT: RANKED CARDS ════════════════════════════╗ */}
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Step 3 · See the ranking
            </div>
            <div style={{ fontSize: 12, color: C.inkMute }}>
              {ranked.length} tenants · Ranked by your priorities
            </div>
          </div>

          {/* The animated ranked list */}
          <div style={{ position: 'relative' }}>
            {ranked.map((app, idx) => {
              const movement = recentlyChanged[app.applicationNumber];
              const isFirst = idx === 0;
              const isSecond = idx === 1;
              const gap = app.weightedScore - (ranked[idx + 1]?.weightedScore ?? 0);

              return (
                <div
                  key={app.applicationNumber}
                  style={{
                    background: isFirst ? C.ink : isSecond ? '#fafaf5' : C.paper,
                    color: isFirst ? C.paper : C.ink,
                    border: isFirst
                      ? `2px solid ${C.red}`
                      : isSecond
                      ? `1px solid ${C.ink}`
                      : `1px solid ${C.rule}`,
                    padding: '24px 28px', marginBottom: 14,
                    borderRadius: R.card,
                    position: 'relative', overflow: 'hidden',
                    transition: 'transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1), background 0.3s, border-color 0.3s',
                    transform: movement ? (movement === 'up' ? 'translateY(-2px)' : 'translateY(2px)') : 'translateY(0)',
                    animation: movement === 'up' ? 'glowUp 1.5s ease-out' : movement === 'down' ? 'glowDown 1.5s ease-out' : 'none',
                  }}>

                  {/* Movement indicator */}
                  {movement && (
                    <div style={{
                      position: 'absolute', top: 14, right: 14,
                      background: movement === 'up' ? C.red : C.inkMute,
                      color: C.paper, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: R.pill,
                      animation: 'fadeOut 1.8s ease-out forwards',
                    }}>
                      {movement === 'up' ? '↑ Moved up' : '↓ Moved down'}
                    </div>
                  )}

                  {/* Top section: rank, name, score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                      <div style={{
                        fontSize: isFirst ? 48 : 36,
                        fontWeight: 900,
                        lineHeight: 0.9,
                        color: isFirst ? C.red : C.inkMute,
                        letterSpacing: '-0.04em',
                        minWidth: isFirst ? 70 : 54,
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        #{idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                          {app.tenant.fullName}
                          {isFirst && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                              marginLeft: 12, padding: '3px 8px',
                              background: C.red, color: C.paper,
                              textTransform: 'uppercase', borderRadius: R.pill,
                              verticalAlign: 'middle',
                            }}>
                              Top pick
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: isFirst ? '#a4adbb' : C.inkSoft, marginBottom: 2 }}>
                          {app.employment.jobTitle} at {app.employment.employer}
                        </div>
                        <div style={{ fontSize: 11, color: isFirst ? '#7a8392' : C.inkMute, fontFamily: 'monospace' }}>
                          {app.applicationNumber}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 110 }}>
                      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: isFirst ? C.paper : C.ink, letterSpacing: '-0.02em' }}>
                        {app.weightedScore.toFixed(1)}
                        <span style={{ fontSize: 14, fontWeight: 500, color: isFirst ? '#a4adbb' : C.inkMute, marginLeft: 2 }}>
                          / 5
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: isFirst ? '#a4adbb' : C.inkMute, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                        Weighted score
                      </div>
                      {idx < ranked.length - 1 && gap > 0 && (
                        <div style={{ fontSize: 10, color: isFirst ? '#a4adbb' : C.inkMute, marginTop: 2 }}>
                          +{gap.toFixed(1)} over next
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Why this ranking — top contributing factors */}
                  <div style={{
                    padding: '14px 16px',
                    background: isFirst ? 'rgba(255,255,255,0.06)' : '#fafaf5',
                    borderLeft: `3px solid ${C.red}`,
                    borderRadius: R.ctrl,
                    fontSize: 12,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isFirst ? C.red : C.red, marginBottom: 8 }}>
                      Why this ranking
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {app.topFactors.map(f => (
                        <div key={f.key} style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 11, color: isFirst ? '#a4adbb' : C.inkMute, marginBottom: 2 }}>
                            Strong: {f.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isFirst ? C.paper : C.ink }}>
                            {f.rawScore} / 5 × {f.weight.toFixed(1)} weight
                          </div>
                        </div>
                      ))}
                      {app.weakFactor && app.weakFactor.rawScore < 4 && (
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 11, color: isFirst ? '#a4adbb' : C.inkMute, marginBottom: 2 }}>
                            Weakest: {app.weakFactor.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isFirst ? '#ffa8a8' : C.red }}>
                            {app.weakFactor.rawScore} / 5 × {app.weakFactor.weight.toFixed(1)} weight
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remove button */}
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => onRemove(app.applicationNumber)}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${isFirst ? '#3a3a3c' : C.rule}`,
                        color: isFirst ? '#a4adbb' : C.inkSoft,
                        padding: '6px 12px', fontSize: 11, fontWeight: 500,
                      }}>
                      Remove from list
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── DECISION SUMMARY — defensible, copyable ───── */}
          {ranked.length >= 2 && (
            <div style={{ marginTop: 32, background: C.paper, border: `2px solid ${C.ink}`, borderRadius: R.card, overflow: 'hidden' }}>
              <div style={{
                padding: '14px 20px', background: C.red, color: C.paper,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>Step 4 · Your defensible decision</span>
                <button
                  onClick={() => {
                    const summary = buildDecisionSummary(ranked, weights, activePreset);
                    navigator.clipboard.writeText(summary);
                    alert('Decision summary copied to clipboard');
                  }}
                  style={{
                    background: C.paper, color: C.red, border: 'none',
                    padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                  }}>
                  Copy summary
                </button>
              </div>
              <div style={{ padding: '22px 24px' }}>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink, marginBottom: 14 }}>
                  Based on the priorities you've set <span style={{ fontStyle: 'italic', color: C.inkSoft }}>({getPrioritySentence()})</span>, the recommended tenant is{' '}
                  <strong style={{ color: C.red }}>{ranked[0].tenant.fullName}</strong> with a weighted score of{' '}
                  <strong>{ranked[0].weightedScore.toFixed(1)} / 5</strong>.
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: C.inkSoft }}>
                  Strongest factors driving this ranking:{' '}
                  <strong style={{ color: C.ink }}>
                    {ranked[0].topFactors.map(f => f.label.toLowerCase()).join(' and ')}
                  </strong>
                  {ranked[1] && (
                    <>
                      . Second-ranked is <strong style={{ color: C.ink }}>{ranked[1].tenant.fullName}</strong> at {ranked[1].weightedScore.toFixed(1)} / 5
                      {' '}— gap of {(ranked[0].weightedScore - ranked[1].weightedScore).toFixed(1)} points.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes glowUp {
          0% { box-shadow: 0 0 0 0 rgba(215, 32, 39, 0); }
          50% { box-shadow: 0 0 0 6px rgba(215, 32, 39, 0.25); }
          100% { box-shadow: 0 0 0 0 rgba(215, 32, 39, 0); }
        }
        @keyframes glowDown {
          0% { box-shadow: 0 0 0 0 rgba(134, 134, 139, 0); }
          50% { box-shadow: 0 0 0 6px rgba(134, 134, 139, 0.2); }
          100% { box-shadow: 0 0 0 0 rgba(134, 134, 139, 0); }
        }
        @keyframes fadeOut {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 900px) {
          .ranked-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers for RankedView ───────────────────────────────
function formatList(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];
}

function buildDecisionSummary(ranked, weights, activePreset) {
  const presetName = activePreset === 'custom' ? 'a custom priority weighting' : `the "${PRIORITY_PRESETS.find(p => p.id === activePreset)?.label}" priority preset`;
  let summary = `TENANT EVALUATION — DECISION SUMMARY\n`;
  summary += `Generated by Rentletter (rentletter.ca/landlord)\n`;
  summary += `Date: ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;

  summary += `METHODOLOGY\n`;
  summary += `Tenants evaluated using ${presetName}, with the following factor weights:\n`;
  FACTOR_DEFS.forEach(f => {
    summary += `  - ${f.label}: ${weights[f.key].toFixed(1)}× weight\n`;
  });
  summary += `\n`;

  summary += `RANKING (${ranked.length} applicants)\n`;
  summary += `\n`;
  ranked.forEach((app, idx) => {
    summary += `#${idx + 1}  ${app.tenant.fullName} — ${app.weightedScore.toFixed(1)} / 5\n`;
    summary += `    Application: ${app.applicationNumber}\n`;
    summary += `    ${app.employment.jobTitle} at ${app.employment.employer}\n`;
    summary += `    Income: $${(app.employment.annualIncome || 0).toLocaleString()} CAD/year\n`;
    if (app.apartment.rentToIncomeRatio) summary += `    Rent-to-income: ${app.apartment.rentToIncomeRatio}%\n`;
    summary += `    Top factors: ${app.topFactors.map(f => `${f.label} (${f.rawScore}/5)`).join(', ')}\n`;
    summary += `\n`;
  });

  summary += `RECOMMENDATION\n`;
  summary += `Based on the priority weighting applied, ${ranked[0].tenant.fullName} (${ranked[0].applicationNumber}) is the recommended applicant.\n`;
  if (ranked[1]) {
    const gap = ranked[0].weightedScore - ranked[1].weightedScore;
    summary += `Margin over second-ranked applicant (${ranked[1].tenant.fullName}): ${gap.toFixed(1)} points.\n`;
  }
  summary += `\nThis evaluation reflects the priorities of the decision-maker as expressed via the weight settings above.\n`;
  summary += `Rentletter Scorecard values are calculated from tenant-provided data and reflect honest factual assessment.\n`;

  return summary;
}

// ─── HELPERS ──────────────────────────────────────────────
const thStyle = {
  padding: '20px 16px 16px',
  textAlign: 'left',
  verticalAlign: 'top',
  borderBottom: `2px solid ${C.ink}`,
  background: C.paper,
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 13,
  color: C.inkSoft,
  borderBottom: `1px solid ${C.rule}`,
  verticalAlign: 'top',
};

const tdLabelStyle = {
  ...tdStyle,
  fontWeight: 600,
  color: C.ink,
  fontSize: 12,
  background: '#fafaf5',
};

function DataSection({ title, highlightRed, children }) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{
        fontSize: 12.5, fontWeight: 800,
        color: highlightRed ? C.red : C.ink,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <span style={{ width: 4, height: 13, borderRadius: 2, background: highlightRed ? C.red : C.ruleDark, display: 'inline-block' }} />
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function DataRow({ label, value, multiline, highlight }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: multiline ? '1fr' : 'minmax(0, 130px) minmax(0, 1fr)',
      gap: multiline ? 5 : 14,
      width: '100%',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 12.5, color: C.inkMute, fontWeight: 600,
        minWidth: 0,
        overflowWrap: 'break-word',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13.5, color: highlight ? C.green : C.ink,
        fontWeight: highlight ? 700 : 500,
        lineHeight: 1.55,
        minWidth: 0,
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}>
        {value}
      </div>
    </div>
  );
}

function ScoreBadge({ score, small }) {
  let color = C.inkMute;
  if (score >= 4.5) color = C.green;
  else if (score >= 3.5) color = C.ink;
  else if (score >= 2.5) color = C.inkSoft;
  else color = C.red;

  return (
    <div style={{
      background: color, color: C.paper, borderRadius: R.pill,
      padding: small ? '4px 11px' : '6px 15px',
      fontSize: small ? 12 : 14, fontWeight: 700,
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
    }}>
      {score} <span style={{ fontSize: small ? 10 : 11, fontWeight: 500, opacity: 0.7 }}>/ 5</span>
    </div>
  );
}

// ─── Unit context helpers ───────────────────────────────
function UnitField({ label, value, onChange, placeholder, dark, inputMode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: dark ? '#a4adbb' : C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          border: `1px solid ${dark ? '#3a3a3c' : C.rule}`,
          background: dark ? '#1a1a1c' : C.paper,
          color: dark ? C.paper : C.ink,
          outline: 'none',
        }}
      />
    </div>
  );
}

function UnitSelect({ label, value, onChange, options, dark }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: dark ? '#a4adbb' : C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          border: `1px solid ${dark ? '#3a3a3c' : C.rule}`,
          background: dark ? '#1a1a1c' : C.paper,
          color: dark ? C.paper : C.ink,
          outline: 'none',
        }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

// ─── Filter helpers ─────────────────────────────────────
function FilterGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function FilterRadio({ name, value, current, onChange, children }) {
  const selected = current === value;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onChange}
        style={{ accentColor: C.red, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13, color: selected ? C.ink : C.inkSoft, fontWeight: selected ? 600 : 400 }}>
        {children}
      </span>
    </label>
  );
}
