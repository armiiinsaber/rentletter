import { useState, useEffect } from 'react';
import Head from 'next/head';
import ChatWidget from '../components/ChatWidget';
import { C as THEME, R, SH, EASE, FONT } from '../components/theme';
import { GlobalStyle, Wordmark, Icon, ScrollHeader, ScrollFade } from '../components/ui';

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

const STUDENT_HOUSING_DEMOS = [
  {
    applicationNumber: 'RL-2026-STU-001', createdAt: new Date().toISOString(),
    email: 'aisha.khan@email.com',
    tenant: { fullName: 'Aisha Khan', age: '24', dateOfBirth: '2001-06-30', phone: '(437) 555-0991' },
    employment: { jobTitle: 'PhD Candidate + Research Assistant', employer: 'University of Toronto', yearsAtJob: '2', annualIncome: 42000, monthlyIncome: 3500 },
    rental: { previousAddress: '40 Harbord Street, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Andrew Singh', previousLandlordContact: '416-555-0102', currentRent: 1100 },
    apartment: { address: '212 Madison Avenue, Toronto', description: 'Bachelor near UofT, $1,400/mo', estimatedRent: 1400, rentToIncomeRatio: 40 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Starting third year of PhD, current shared housing situation ending.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, mostly at lab or library. No parties, non-drinker.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dr. Hiroshi Tanaka', relationship: 'PhD supervisor, UofT', contact: 'h.tanaka@utoronto.ca' },
          { name: 'Andrew Singh', relationship: 'Previous landlord (2 years)', contact: '416-555-0102' }
        ],
    disclosures: 'Income reflects PhD stipend. Parents in Karachi co-signing as guarantors with verified assets, documentation available.',
    scorecard: {
      incomeStability: { score: 4, note: 'PhD funding confirmed through 2028' },
      rentAffordability: { score: 3, note: '40% of stipend, but guarantor provided' },
      rentalHistory: { score: 5, note: '2 years with previous landlord reference' },
      longTermIntent: { score: 5, note: 'PhD program 3+ more years in Toronto' },
      disclosures: { score: 4, note: 'Income limitation addressed with guarantor' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-002', createdAt: new Date().toISOString(),
    email: 'mohammed.alrashid@email.com',
    tenant: { fullName: 'Mohammed Al-Rashid', age: '21', dateOfBirth: '2004-03-12', phone: '(647) 555-0512' },
    employment: { jobTitle: 'Undergraduate Student (Computer Science, Year 3)', employer: 'University of Toronto', yearsAtJob: '3', annualIncome: 18000, monthlyIncome: 1500 },
    rental: { previousAddress: 'Family home, Mississauga', yearsAtPrevious: '21', previousLandlordName: 'N/A — parents home', previousLandlordContact: null, currentRent: null },
    apartment: { address: '395 Huron Street, Toronto', description: 'Shared 3BR near UofT, $950/room', estimatedRent: 950, rentToIncomeRatio: 63 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Moving out of family home for first time to be closer to campus for senior-year coursework.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'Two confirmed roommates (signed application separately)', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studious. Mostly at the library or coding. Religious observance, no parties.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dr. Sarah Lin', relationship: 'Academic advisor, UofT CS', contact: 's.lin@utoronto.ca' },
          { name: 'Hassan Al-Rashid', relationship: 'Father (guarantor)', contact: '905-555-0388' }
        ],
    disclosures: 'First-time renter. Father co-signing as guarantor — civil engineer, 22 years at SNC-Lavalin, full income documentation available.',
    scorecard: {
      incomeStability: { score: 2, note: 'Part-time TA income only — relies on parental support' },
      rentAffordability: { score: 3, note: 'Room rent 63% of own income, but guarantor + parents covering' },
      rentalHistory: { score: 3, note: 'First-time renter, alternative documentation' },
      longTermIntent: { score: 4, note: '1 year through graduation, possibly longer for grad school' },
      disclosures: { score: 5, note: 'Guarantor proactively offered' },
      overall: 3.4,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-003', createdAt: new Date().toISOString(),
    email: 'emily.park@email.com',
    tenant: { fullName: 'Emily Park', age: '22', dateOfBirth: '2003-11-08', phone: '(416) 555-0119' },
    employment: { jobTitle: "Master\'s Student + TA", employer: 'University of Toronto', yearsAtJob: '1', annualIncome: 32000, monthlyIncome: 2667 },
    rental: { previousAddress: '256 McCaul Street, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Christine Mok', previousLandlordContact: '416-555-0245', currentRent: 1300 },
    apartment: { address: '108 Howland Avenue, Toronto', description: '1BR basement near UofT, $1,500/mo', estimatedRent: 1500, rentToIncomeRatio: 56 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Starting Masters program at OISE — current basement apartment lease ending.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, studious. Cooks at home most nights. Generally home in evenings.', pets: null },
    vehicle: null,
    references: [
          { name: 'Christine Mok', relationship: 'Previous landlord (4 years undergrad)', contact: '416-555-0245' },
          { name: 'Prof. Rajesh Kumar', relationship: 'OISE program advisor', contact: 'r.kumar@oise.utoronto.ca' }
        ],
    disclosures: 'Income reflects TA stipend + part-time work. OSAP loan covering tuition. Strong rental history of 4 years.',
    scorecard: {
      incomeStability: { score: 3, note: 'TA stipend + part-time work, ~$32K total' },
      rentAffordability: { score: 2, note: '56% of monthly income — needs guarantor or co-signer' },
      rentalHistory: { score: 5, note: '4 years with same previous landlord' },
      longTermIntent: { score: 4, note: '2-year Masters program' },
      disclosures: { score: 4, note: 'Income limitation acknowledged' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-004', createdAt: new Date().toISOString(),
    email: 'liam.oconnor@email.com',
    tenant: { fullName: "Liam O'Connor", age: '20', dateOfBirth: '2005-04-22', phone: '(437) 555-0744' },
    employment: { jobTitle: 'Undergraduate Student (Engineering, Year 2)', employer: 'University of Toronto', yearsAtJob: '2', annualIncome: 22000, monthlyIncome: 1833 },
    rental: { previousAddress: 'Residence — Chestnut Hall', yearsAtPrevious: '1', previousLandlordName: 'UofT Residence Services', previousLandlordContact: 'res.life@utoronto.ca', currentRent: 1600 },
    apartment: { address: '550 Spadina Avenue, Toronto', description: '2BR shared, $1,150/room', estimatedRent: 1150, rentToIncomeRatio: 63 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Moving out of residence into shared apartment with classmate.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Sharing with classmate Tom Riley (separate application)', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studious engineer. Co-op term in 2026, will work 4 months that year.', pets: null },
    vehicle: null,
    references: [
          { name: 'UofT Residence Don', relationship: 'Residence supervisor', contact: 'res.life@utoronto.ca' },
          { name: 'Dr. James Reed', relationship: 'Academic advisor', contact: 'j.reed@utoronto.ca' }
        ],
    disclosures: 'First-time apartment renter (came from residence). Co-op income starting Sept 2026 expected to add $20K. Mother co-signing as guarantor.',
    scorecard: {
      incomeStability: { score: 2, note: 'Part-time tutoring + summer work' },
      rentAffordability: { score: 3, note: '63% of own income, guarantor covers gap' },
      rentalHistory: { score: 3, note: '1 year in residence — not equivalent' },
      longTermIntent: { score: 5, note: '3 more years undergrad + potential grad' },
      disclosures: { score: 5, note: 'Co-op income trajectory disclosed' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-005', createdAt: new Date().toISOString(),
    email: 'zara.williams@email.com',
    tenant: { fullName: 'Zara Williams', age: '25', dateOfBirth: '2000-09-15', phone: '(416) 555-0823' },
    employment: { jobTitle: 'PhD Candidate (Chemistry)', employer: 'University of Toronto', yearsAtJob: '3', annualIncome: 38000, monthlyIncome: 3167 },
    rental: { previousAddress: '88 Beverley Street, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Marina Romano', previousLandlordContact: '416-555-0667', currentRent: 1250 },
    apartment: { address: '212 Madison Avenue, Toronto', description: '1BR, Annex, $1,650/mo', estimatedRent: 1650, rentToIncomeRatio: 52 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Lab moved buildings — need a place closer to the new lab on Spadina.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Lab-focused. Often there until late evening. Very quiet at home.', pets: null },
    vehicle: null,
    references: [
          { name: 'Marina Romano', relationship: 'Current landlord (3 years)', contact: '416-555-0667' },
          { name: 'Dr. Pierre Lemieux', relationship: 'PhD supervisor, Chemistry', contact: 'p.lemieux@utoronto.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '3 years stable PhD funding' },
      rentAffordability: { score: 3, note: '52% of stipend but accustomed to managing' },
      rentalHistory: { score: 5, note: '3 years current landlord, reference confirmed' },
      longTermIntent: { score: 5, note: 'PhD continues 2-3 more years' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.4,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-006', createdAt: new Date().toISOString(),
    email: 'jinho.park@email.com',
    tenant: { fullName: 'Jin-ho Park', age: '23', dateOfBirth: '2002-08-04', phone: '(647) 555-0394' },
    employment: { jobTitle: 'Korean Exchange Student (Business)', employer: 'Rotman School of Management (UofT)', yearsAtJob: '1', annualIncome: 0, monthlyIncome: 0 },
    rental: { previousAddress: 'Seoul, South Korea', yearsAtPrevious: '4', previousLandlordName: 'N/A — family home', previousLandlordContact: null, currentRent: null },
    apartment: { address: '700 Bay Street, Toronto', description: '1BR condo, downtown, $2,200/mo', estimatedRent: 2200, rentToIncomeRatio: 0 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'One-year MBA exchange program at Rotman.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: "Focused, quiet. Doesn\'t party — comes from conservative family.", pets: null },
    vehicle: null,
    references: [
          { name: 'Prof. Min-jun Lee', relationship: 'Home institution professor, SKKU', contact: 'mlee@skku.edu' },
          { name: 'Yong-su Park', relationship: 'Father (guarantor)', contact: '+82-10-555-0102' }
        ],
    disclosures: 'International student — no Canadian credit. Family wires full year of rent upfront ($26,400) via bank transfer. Father is a Samsung executive, 25 years tenure, documentation in Korean + English available.',
    scorecard: {
      incomeStability: { score: 3, note: 'No employment income — full rent paid upfront' },
      rentAffordability: { score: 5, note: 'Year of rent paid in advance' },
      rentalHistory: { score: 4, note: '4 years in family home, residence experience' },
      longTermIntent: { score: 3, note: '1-year exchange program' },
      disclosures: { score: 4, note: 'International status addressed with prepayment' },
      overall: 3.8,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-007', createdAt: new Date().toISOString(),
    email: 'sophia.tanaka@email.com',
    tenant: { fullName: 'Sophia Tanaka', age: '23', dateOfBirth: '2002-10-19', phone: '(437) 555-0511' },
    employment: { jobTitle: "Master\'s Student (Public Health) + TA", employer: 'University of Toronto', yearsAtJob: '1', annualIncome: 28000, monthlyIncome: 2333 },
    rental: { previousAddress: '180 St. George Street, Toronto', yearsAtPrevious: '1', previousLandlordName: 'Tom Greene', previousLandlordContact: '416-555-0822', currentRent: 1400 },
    apartment: { address: '108 Howland Avenue, Toronto', description: 'Shared 2BR near UofT, $1,300/room', estimatedRent: 1300, rentToIncomeRatio: 56 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Continuing MPH program — current sublet ending.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Sharing with confirmed roommate Aanya Patel (separate application)', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Public health student — clean, organized, quiet roommate.', pets: null },
    vehicle: null,
    references: [
          { name: 'Tom Greene', relationship: 'Current landlord, 1 year', contact: '416-555-0822' },
          { name: 'Dr. Linda Yu', relationship: 'MPH program coordinator', contact: 'l.yu@dlsph.utoronto.ca' }
        ],
    disclosures: 'TA stipend covers basic needs. Has small line of credit through parents to cover rent fluctuations.',
    scorecard: {
      incomeStability: { score: 3, note: 'TA + part-time research role' },
      rentAffordability: { score: 2, note: '56% of income, parental support backup' },
      rentalHistory: { score: 4, note: '1 year current with previous-housing references' },
      longTermIntent: { score: 4, note: '~18 more months in program' },
      disclosures: { score: 4, note: 'Income limitations acknowledged' },
      overall: 3.4,
    },
  },
  {
    applicationNumber: 'RL-2026-STU-008', createdAt: new Date().toISOString(),
    email: 'david.nguyen@email.com',
    tenant: { fullName: 'David Nguyen', age: '24', dateOfBirth: '2001-12-03', phone: '(416) 555-0203' },
    employment: { jobTitle: 'Medical Student (Year 3)', employer: 'University of Toronto Faculty of Medicine', yearsAtJob: '2', annualIncome: 25000, monthlyIncome: 2083 },
    rental: { previousAddress: '78 Russell Street, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Property Manager — Akelius', previousLandlordContact: 'tenant.relations@akelius.ca', currentRent: 1450 },
    apartment: { address: '88 Henry Street, Toronto', description: '1BR, Kensington, $1,650/mo', estimatedRent: 1650, rentToIncomeRatio: 79 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Current building going condo conversion.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Med student — long days at the hospital. Rarely home except to sleep.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dr. Anil Patel', relationship: 'Clerkship supervisor, UofT Medicine', contact: 'a.patel@medportal.ca' },
          { name: 'Akelius Property Manager', relationship: 'Current property manager', contact: 'tenant.relations@akelius.ca' }
        ],
    disclosures: 'Income reflects part-time research + summer work. OSAP + LOC covers tuition and living. Will become licensed physician in 2 years.',
    scorecard: {
      incomeStability: { score: 3, note: 'Variable student income, MD trajectory in 2 years' },
      rentAffordability: { score: 1, note: '79% of current income — leveraged on guaranteed future income' },
      rentalHistory: { score: 4, note: '2 years with property manager reference' },
      longTermIntent: { score: 5, note: '2 more years med school + 5 residency in Toronto' },
      disclosures: { score: 3, note: 'Income stretch heavily disclosed' },
      overall: 3.2,
    },
  }
];

const LUXURY_RENTAL_DEMOS = [
  {
    applicationNumber: 'RL-2026-LUX-001', createdAt: new Date().toISOString(),
    email: 'priya.nair@email.com',
    tenant: { fullName: 'Priya Nair', age: '34', dateOfBirth: '1991-11-04', phone: '(437) 555-0312' },
    employment: { jobTitle: 'Senior UX Designer', employer: 'CIBC', yearsAtJob: '5', annualIncome: 115000, monthlyIncome: 9583 },
    rental: { previousAddress: '300 Bloor Street West, Toronto', yearsAtPrevious: '3', previousLandlordName: 'David Wong', previousLandlordContact: '647-555-0199', currentRent: 2400 },
    apartment: { address: '78 Davenport Road, Toronto', description: '2BR luxury, Yorkville, $4,200/mo', estimatedRent: 4200, rentToIncomeRatio: 22 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Partner and I are upgrading from Annex to Yorkville.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Partner and I, both work hybrid.', smoker: 'no' },
    coApplicant: { name: 'Daniel Ross', age: '33', relationship: 'Partner of 4 years', jobTitle: 'Product Manager', employer: 'RBC', annualIncome: 140000 },
    lifestyle: { personality: 'Stable, professional household. Both work hybrid.', pets: 'One indoor cat, 6 years old, vet records available' },
    vehicle: { makeModel: 'Tesla Model Y', year: '2023' },
    references: [
          { name: 'Sarah Martinez', relationship: 'Director at CIBC', contact: '416-555-0445' },
          { name: 'David Wong', relationship: 'Previous landlord (3 years)', contact: '647-555-0199' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '5 years at CIBC + partner 7 years at RBC' },
      rentAffordability: { score: 5, note: '22% of combined household income' },
      rentalHistory: { score: 5, note: '3 years with previous landlord reference' },
      longTermIntent: { score: 4, note: 'Both partners established but career mobility means relocation risk in 2-3 years' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-002', createdAt: new Date().toISOString(),
    email: 'marcus.thompson@email.com',
    tenant: { fullName: 'Marcus Thompson', age: '38', dateOfBirth: '1987-07-14', phone: '(416) 555-0844' },
    employment: { jobTitle: 'General Contractor (sole proprietor)', employer: 'Thompson Renovations Ltd.', yearsAtJob: '8', annualIncome: 185000, monthlyIncome: 15417 },
    rental: { previousAddress: '12 Burlington Street, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Helen Yamamoto', previousLandlordContact: '416-555-0556', currentRent: 2800 },
    apartment: { address: '188 Cumberland Street, Toronto', description: '2BR, Yorkville, $4,500/mo', estimatedRent: 4500, rentToIncomeRatio: 29 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Custody arrangement updated — need a 2BR so my two kids can stay with me on weekends.' },
    household: { numberOfOccupants: '1', occupantsDetails: 'Primary occupant. Two children (ages 8 and 10) on alternate weekends.', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Up early for job sites. Home most evenings. Quiet.', pets: null },
    vehicle: { makeModel: 'Range Rover Sport', year: '2023' },
    references: [
          { name: 'Helen Yamamoto', relationship: 'Current landlord (3 years)', contact: '416-555-0556' },
          { name: 'David Reilly', relationship: 'Long-time client', contact: '416-555-0234' }
        ],
    disclosures: 'Credit score dipped in 2024 due to divorce. Current credit rebuilt (580 to 720 in 18 months). Self-employed income verified by 3 years CRA returns.',
    scorecard: {
      incomeStability: { score: 5, note: '8 years licensed contractor, $185K verified' },
      rentAffordability: { score: 5, note: '29% of income' },
      rentalHistory: { score: 5, note: '3 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'Custody arrangement requires stable address' },
      disclosures: { score: 3, note: 'Credit history disclosed with documentation' },
      overall: 4.6,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-003', createdAt: new Date().toISOString(),
    email: 'dr..elsayed@email.com',
    tenant: { fullName: 'Dr. Yasmin El-Sayed', age: '36', dateOfBirth: '1989-02-28', phone: '(416) 555-0901' },
    employment: { jobTitle: 'Surgeon (Orthopaedic)', employer: 'Mount Sinai Hospital', yearsAtJob: '7', annualIncome: 425000, monthlyIncome: 35417 },
    rental: { previousAddress: '210 Avenue Road, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Albany Property Group', previousLandlordContact: '416-555-0445', currentRent: 3500 },
    apartment: { address: '128 Hazelton Avenue, Toronto', description: '2BR + den, Yorkville, $5,200/mo', estimatedRent: 5200, rentToIncomeRatio: 15 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Moving from a townhouse rental to be closer to Mount Sinai.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Surgeon — long hospital hours. Rarely home except to sleep. Extremely quiet.', pets: null },
    vehicle: { makeModel: 'BMW X5', year: '2024' },
    references: [
          { name: 'Dr. Robert Chen', relationship: 'Department Chief, Mount Sinai Ortho', contact: 'r.chen@sinaihealth.ca' },
          { name: 'Albany Property Group', relationship: 'Current landlord (4 years)', contact: '416-555-0445' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '7 years at Mount Sinai, $425K verified' },
      rentAffordability: { score: 5, note: '15% of monthly income' },
      rentalHistory: { score: 5, note: '4 years with property group reference' },
      longTermIntent: { score: 4, note: 'Strong settled career, though surgeons can be poached to other hospitals/cities' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-004', createdAt: new Date().toISOString(),
    email: 'alexander.volkov@email.com',
    tenant: { fullName: 'Alexander Volkov', age: '42', dateOfBirth: '1983-05-17', phone: '(647) 555-0212' },
    employment: { jobTitle: 'Investment Banker (Managing Director)', employer: 'TD Securities', yearsAtJob: '12', annualIncome: 320000, monthlyIncome: 26667 },
    rental: { previousAddress: '199 Yonge Street, Toronto', yearsAtPrevious: '5', previousLandlordName: 'Concert Properties', previousLandlordContact: '416-555-0667', currentRent: 4100 },
    apartment: { address: '155 Yorkville Avenue, Toronto', description: '3BR penthouse, Yorkville, $7,200/mo', estimatedRent: 7200, rentToIncomeRatio: 27 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: "Wife and I want more space — current 2BR doesn\'t suit our growing professional needs." },
    household: { numberOfOccupants: '2', occupantsDetails: 'My wife Elena and me.', smoker: 'no' },
    coApplicant: { name: 'Elena Volkov', age: '39', relationship: 'Spouse', jobTitle: 'Partner, Corporate Law', employer: 'Stikeman Elliott LLP', annualIncome: 480000 },
    lifestyle: { personality: 'Both professionals. Home is quiet — we travel often.', pets: null },
    vehicle: { makeModel: 'Porsche Cayenne', year: '2024' },
    references: [
          { name: 'Concert Properties Manager', relationship: 'Current landlord (5 years)', contact: '416-555-0667' },
          { name: 'James Hartford', relationship: 'Managing Partner, TD Securities', contact: 'j.hartford@tdsecurities.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '12 years at TD + spouse partnership at Stikeman' },
      rentAffordability: { score: 5, note: '27% of $800K combined household income' },
      rentalHistory: { score: 5, note: '5 years current, exceptional record' },
      longTermIntent: { score: 4, note: 'Career-stable but Volkov family travels often — primary residence may shift internationally' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-005', createdAt: new Date().toISOString(),
    email: 'sarah.chen@email.com',
    tenant: { fullName: 'Sarah Chen', age: '29', dateOfBirth: '1996-08-12', phone: '(416) 555-0181' },
    employment: { jobTitle: 'VP of Marketing', employer: 'Loblaw Companies', yearsAtJob: '4', annualIncome: 187000, monthlyIncome: 15583 },
    rental: { previousAddress: '245 Sherbourne Street, Toronto', yearsAtPrevious: '2.5', previousLandlordName: 'Michael Park', previousLandlordContact: '416-555-0142', currentRent: 2450 },
    apartment: { address: '8 Cumberland Street, Toronto', description: '1BR + den, Yorkville, $3,800/mo', estimatedRent: 3800, rentToIncomeRatio: 24 },
    move: { moveInDate: 'June 15, 2026', reasonForMoving: 'Recent promotion to VP — moving closer to head office on Bloor.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, works from home 3 days a week. Travels for business often.', pets: null },
    vehicle: null,
    references: [
          { name: 'Galen Weston', relationship: 'CEO, Loblaw Companies', contact: 'g.weston@loblaw.ca' },
          { name: 'Michael Park', relationship: 'Current landlord (2.5 years)', contact: '416-555-0142' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '4 years at Loblaw, recent VP promotion' },
      rentAffordability: { score: 5, note: '24% of monthly income' },
      rentalHistory: { score: 5, note: '2.5 years with reference available' },
      longTermIntent: { score: 4, note: 'Career trajectory tied to Toronto HQ, though VP-level roles can lead to interprovince transfers' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-006', createdAt: new Date().toISOString(),
    email: 'robert.hartwell@email.com',
    tenant: { fullName: 'Robert Hartwell', age: '45', dateOfBirth: '1980-01-22', phone: '(416) 555-0334' },
    employment: { jobTitle: 'Hedge Fund Partner', employer: 'West Face Capital', yearsAtJob: '15', annualIncome: 540000, monthlyIncome: 45000 },
    rental: { previousAddress: '88 Scollard Street, Toronto', yearsAtPrevious: '6', previousLandlordName: 'Halmont Properties', previousLandlordContact: '416-555-0778', currentRent: 5200 },
    apartment: { address: '188 Cumberland Street, Toronto', description: '3BR + den, Yorkville, $8,500/mo', estimatedRent: 8500, rentToIncomeRatio: 19 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Children moved out — downsizing from 5BR house to a luxury 3BR with shorter commute.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'My wife and me.', smoker: 'no' },
    coApplicant: { name: 'Diana Hartwell', age: '43', relationship: 'Spouse', jobTitle: 'Board Director', employer: 'Several public companies', annualIncome: 280000 },
    lifestyle: { personality: 'Quiet, private. Travel internationally 6+ weeks per year.', pets: null },
    vehicle: { makeModel: 'Mercedes-Benz S-Class', year: '2024' },
    references: [
          { name: 'Halmont Properties Manager', relationship: 'Current landlord (6 years)', contact: '416-555-0778' },
          { name: 'Anthony Munk', relationship: 'Senior Partner, West Face', contact: 'a.munk@westfacecapital.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '15 years at West Face, partner-level income' },
      rentAffordability: { score: 5, note: '19% of $820K combined income' },
      rentalHistory: { score: 4, note: '6 years current, but only one landlord reference on file' },
      longTermIntent: { score: 5, note: 'Empty-nesters, long-term tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-007', createdAt: new Date().toISOString(),
    email: 'olivia.beaumont@email.com',
    tenant: { fullName: 'Olivia Beaumont', age: '32', dateOfBirth: '1993-04-08', phone: '(647) 555-0556' },
    employment: { jobTitle: 'Founder + CEO', employer: 'Beaumont Wellness (acquired by HelloFresh 2024)', yearsAtJob: '6', annualIncome: 220000, monthlyIncome: 18333 },
    rental: { previousAddress: '50 Wellesley Street East, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Anita Kapoor', previousLandlordContact: '416-555-0119', currentRent: 2900 },
    apartment: { address: '120 Bloor Street East, Toronto', description: '2BR, Yorkville, $4,800/mo', estimatedRent: 4800, rentToIncomeRatio: 26 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Selling my house in Forest Hill, transitioning to rental for next 2-3 years while traveling more.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'outdoor' },
    coApplicant: null,
    lifestyle: { personality: 'Travel often (CEO of acquired company). Home is quiet, no parties.', pets: 'One small indoor poodle, 4 years old, trained and licensed.' },
    vehicle: { makeModel: 'Audi Q5', year: '2023' },
    references: [
          { name: 'Anita Kapoor', relationship: 'Previous landlord (4 years)', contact: '416-555-0119' },
          { name: 'David Berman', relationship: 'Board chair, HelloFresh Canada', contact: 'd.berman@hellofresh.com' }
        ],
    disclosures: 'Recently sold the company — net worth from acquisition adds $4.2M in liquid assets, separate from $220K W-2 income.',
    scorecard: {
      incomeStability: { score: 5, note: 'Strong W-2 + $4M+ liquid post-acquisition' },
      rentAffordability: { score: 5, note: '26% of W-2 alone, vast cushion' },
      rentalHistory: { score: 5, note: '4 years previous landlord reference' },
      longTermIntent: { score: 4, note: '2-3 year horizon stated, may extend' },
      disclosures: { score: 5, note: 'Asset documentation provided' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-LUX-008', createdAt: new Date().toISOString(),
    email: 'ryan.oreilly@email.com',
    tenant: { fullName: "Ryan & Jennifer Park-O'Reilly", age: '34 & 36', dateOfBirth: '1991-09-22 (Ryan)', phone: '(416) 555-0445' },
    employment: { jobTitle: 'Plastic Surgeon (Ryan)', employer: 'Toronto Plastic Surgery (private practice)', yearsAtJob: '4', annualIncome: 380000, monthlyIncome: 31667 },
    rental: { previousAddress: '101 Roxborough Street West, Toronto', yearsAtPrevious: '5', previousLandlordName: 'Forest Hill Properties', previousLandlordContact: '416-555-0231', currentRent: 4200 },
    apartment: { address: '230 Bay Street, Toronto', description: '3BR, Bay/Bloor luxury, $6,500/mo', estimatedRent: 6500, rentToIncomeRatio: 21 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Wife pregnant with twins — need a larger condo closer to my downtown practice.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'My wife Jennifer (lawyer) and me. Twins arriving October.', smoker: 'no' },
    coApplicant: { name: "Jennifer Park-O\'Reilly", age: '36', relationship: 'Spouse', jobTitle: 'Real Estate Lawyer', employer: 'Aird & Berlis LLP', annualIncome: 245000 },
    lifestyle: { personality: 'Both professionals. Home is quiet — twins arriving will be the main change.', pets: null },
    vehicle: { makeModel: 'Volvo XC90', year: '2024' },
    references: [
          { name: 'Forest Hill Properties', relationship: 'Current landlord (5 years)', contact: '416-555-0231' },
          { name: 'Dr. Andrew Yim', relationship: 'Partner, Toronto Plastic Surgery', contact: 'a.yim@tpsurgery.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '4 years private practice + spouse senior associate' },
      rentAffordability: { score: 5, note: '21% of $625K combined income' },
      rentalHistory: { score: 5, note: '5 years with current landlord reference' },
      longTermIntent: { score: 4, note: 'New babies suggest stability, but tight downtown 3BR may not suit twins after age 2' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  }
];

const FAMILY_HOME_DEMOS = [
  {
    applicationNumber: 'RL-2026-FAM-001', createdAt: new Date().toISOString(),
    email: 'david.liu@email.com',
    tenant: { fullName: 'David Liu', age: '33', dateOfBirth: '1992-04-15', phone: '(647) 555-0445' },
    employment: { jobTitle: 'Grade 4 Teacher', employer: 'Toronto District School Board', yearsAtJob: '7', annualIncome: 82000, monthlyIncome: 6833 },
    rental: { previousAddress: '155 Beecroft Road, North York', yearsAtPrevious: '3', previousLandlordName: 'Robert Chen', previousLandlordContact: '416-555-0772', currentRent: 2100 },
    apartment: { address: '88 Annette Street, Toronto', description: '2BR + den, Junction, $2,650/mo', estimatedRent: 2650, rentToIncomeRatio: 22 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: 'New baby — we need a 2BR with space for a nursery. Closer to my school.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'My partner Emma, our 4-month-old, and me.', smoker: 'no' },
    coApplicant: { name: 'Emma Liu', age: '31', relationship: 'Spouse', jobTitle: 'Freelance Editor', employer: 'Penguin Random House + others', annualIncome: 65000 },
    lifestyle: { personality: 'Family-focused. Both work from home some days. No parties.', pets: null },
    vehicle: { makeModel: 'Subaru Outback', year: '2021' },
    references: [
          { name: 'Robert Chen', relationship: 'Current landlord (3 years)', contact: '416-555-0772' },
          { name: 'Principal Maria Costa', relationship: 'TDSB principal', contact: 'm.costa@tdsb.on.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '7 years at TDSB stable, but spouse income is freelance (more variable)' },
      rentAffordability: { score: 5, note: '22% of combined income' },
      rentalHistory: { score: 5, note: '3 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'New baby — looking for 3+ year tenancy' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-002', createdAt: new Date().toISOString(),
    email: 'hassan.abdelrahman@email.com',
    tenant: { fullName: 'Hassan & Fatima Abdelrahman', age: '35 & 33', dateOfBirth: '1990-06-12', phone: '(416) 555-0237' },
    employment: { jobTitle: 'Civil Engineer (Hassan)', employer: 'WSP Canada', yearsAtJob: '8', annualIncome: 105000, monthlyIncome: 8750 },
    rental: { previousAddress: '88 Elmhurst Avenue, North York', yearsAtPrevious: '5', previousLandlordName: 'Park Lane Holdings', previousLandlordContact: '416-555-0991', currentRent: 2400 },
    apartment: { address: '156 Glen Manor Drive, Toronto', description: '3BR house, The Beaches, $3,800/mo', estimatedRent: 3800, rentToIncomeRatio: 27 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Twins starting school in September — need to be in the right catchment for Williamson Road PS.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Wife Fatima (pharmacist), twins (age 5), me.', smoker: 'no' },
    coApplicant: { name: 'Fatima Abdelrahman', age: '33', relationship: 'Spouse', jobTitle: 'Pharmacist', employer: 'Shoppers Drug Mart', annualIncome: 82000 },
    lifestyle: { personality: 'Family of four. Twins start kindergarten in September. Quiet household.', pets: null },
    vehicle: { makeModel: 'Toyota Sienna', year: '2022' },
    references: [
          { name: 'Park Lane Holdings', relationship: 'Current landlord (5 years)', contact: '416-555-0991' },
          { name: 'Dr. Ahmad Hussein', relationship: 'Family friend, character ref', contact: '416-555-0445' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: 'Engineer 8yr + pharmacist 6yr' },
      rentAffordability: { score: 5, note: '27% of combined income' },
      rentalHistory: { score: 5, note: '5 years with current landlord reference' },
      longTermIntent: { score: 4, note: 'Twins starting kindergarten, but family may want to buy within 2-3 years' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-003', createdAt: new Date().toISOString(),
    email: 'catherine.macleod@email.com',
    tenant: { fullName: 'Catherine MacLeod', age: '41', dateOfBirth: '1984-03-28', phone: '(416) 555-0789' },
    employment: { jobTitle: 'Senior HR Director', employer: 'TELUS', yearsAtJob: '12', annualIncome: 145000, monthlyIncome: 12083 },
    rental: { previousAddress: '99 Hambly Avenue, Toronto', yearsAtPrevious: '8', previousLandlordName: 'James Wright', previousLandlordContact: '416-555-0123', currentRent: 2800 },
    apartment: { address: '34 Glenmount Avenue, Toronto', description: '3BR semi-detached, East York, $3,400/mo', estimatedRent: 3400, rentToIncomeRatio: 28 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Recent separation — staying in the same neighbourhood so kids can keep their school and friends.' },
    household: { numberOfOccupants: '2', occupantsDetails: "Me and my 11-year-old daughter (50/50 custody, so she's here half the time).", smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Established household. Daughter is in grade 6, plays piano.', pets: 'One older indoor cat, 12 years old.' },
    vehicle: { makeModel: 'Mazda CX-5', year: '2020' },
    references: [
          { name: 'James Wright', relationship: 'Previous landlord (8 years)', contact: '416-555-0123' },
          { name: 'Janet Kim', relationship: 'VP HR, TELUS', contact: 'j.kim@telus.com' }
        ],
    disclosures: 'Recent separation — formal custody agreement in place. Income, savings, and credit are mine alone (separated finances years ago).',
    scorecard: {
      incomeStability: { score: 5, note: '12 years at TELUS, senior leadership' },
      rentAffordability: { score: 5, note: '28% of monthly income' },
      rentalHistory: { score: 5, note: '8 years previous landlord, exceptional' },
      longTermIntent: { score: 5, note: "Daughter\'s school stability is top priority" },
      disclosures: { score: 4, note: 'Separation context proactively shared' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-004', createdAt: new Date().toISOString(),
    email: 'mark.patel@email.com',
    tenant: { fullName: 'Mark & Sarah Patel', age: '37 & 35', dateOfBirth: '1988-07-20', phone: '(905) 555-0444' },
    employment: { jobTitle: 'Civil Servant — Director (Mark)', employer: 'Ministry of Health (Ontario)', yearsAtJob: '11', annualIncome: 132000, monthlyIncome: 11000 },
    rental: { previousAddress: '88 Glengarry Avenue, North York', yearsAtPrevious: '4', previousLandlordName: 'Lambourne Property Management', previousLandlordContact: '416-555-0667', currentRent: 2600 },
    apartment: { address: '40 Hillcrest Drive, Toronto', description: '3BR detached house, Wychwood, $4,200/mo', estimatedRent: 4200, rentToIncomeRatio: 24 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Outgrew our current rental — kids are 6 and 9, need more space and a yard.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Wife Sarah (teacher), two kids ages 6 and 9.', smoker: 'no' },
    coApplicant: { name: 'Sarah Patel', age: '35', relationship: 'Spouse', jobTitle: 'Special Education Teacher', employer: 'Toronto District School Board', annualIncome: 78000 },
    lifestyle: { personality: 'Family of four. Kids in soccer and music lessons. Quiet evenings.', pets: 'One Golden Retriever, 4 years old, trained, full vet records.' },
    vehicle: { makeModel: 'Honda Pilot', year: '2022' },
    references: [
          { name: 'Lambourne Property Management', relationship: 'Current landlord (4 years)', contact: '416-555-0667' },
          { name: 'Dr. Sarah Allen', relationship: 'Director, Ministry of Health', contact: 'sarah.allen@ontario.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '11 years public service + spouse 8 years TDSB' },
      rentAffordability: { score: 5, note: '24% of combined income' },
      rentalHistory: { score: 5, note: '4 years with current property management ref' },
      longTermIntent: { score: 5, note: 'Kids growing — looking for 3+ year house' },
      disclosures: { score: 4, note: 'Strong profile overall, no specific disclosures but pet adds wear-and-tear consideration' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-005', createdAt: new Date().toISOString(),
    email: 'anika.bose@email.com',
    tenant: { fullName: 'Anika & Vijay Bose', age: '34 & 36', dateOfBirth: '1991-11-08', phone: '(416) 555-0223' },
    employment: { jobTitle: 'Family Doctor (Anika)', employer: 'Sunnybrook Family Medicine', yearsAtJob: '5', annualIncome: 198000, monthlyIncome: 16500 },
    rental: { previousAddress: '199 Sunnybrook Boulevard, Toronto', yearsAtPrevious: '6', previousLandlordName: 'Concert Real Estate', previousLandlordContact: '416-555-0890', currentRent: 3200 },
    apartment: { address: '180 Bayview Avenue, Toronto', description: '4BR house, Leaside, $5,800/mo', estimatedRent: 5800, rentToIncomeRatio: 22 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Expecting third child — current 3BR will not be enough. Want to stay near Sunnybrook.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Vijay (architect), two kids (4 and 6), baby arriving August. Plus me.', smoker: 'no' },
    coApplicant: { name: 'Vijay Bose', age: '36', relationship: 'Spouse', jobTitle: 'Architect (Partner)', employer: 'WZMH Architects', annualIncome: 125000 },
    lifestyle: { personality: 'Active family. Kids in school and daycare. Quiet professionals.', pets: 'One small indoor dog, 3 years old, trained.' },
    vehicle: { makeModel: 'Mercedes-Benz GLB', year: '2023' },
    references: [
          { name: 'Concert Real Estate', relationship: 'Current landlord (6 years)', contact: '416-555-0890' },
          { name: 'Dr. Patricia Lee', relationship: 'Sunnybrook Department Chief', contact: 'p.lee@sunnybrook.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 5, note: '5 years at Sunnybrook + spouse partner-level architect' },
      rentAffordability: { score: 4, note: '22% of combined income is comfortable, but with 3 kids + dog incidentals add up' },
      rentalHistory: { score: 5, note: '6 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'Growing family, multi-year tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-006', createdAt: new Date().toISOString(),
    email: 'tyler.brennan@email.com',
    tenant: { fullName: 'Tyler & Emma Brennan', age: '38 & 36', dateOfBirth: '1987-05-04', phone: '(905) 555-0667' },
    employment: { jobTitle: 'Electrician (IBEW Local 353)', employer: 'Black & McDonald Limited', yearsAtJob: '14', annualIncome: 115000, monthlyIncome: 9583 },
    rental: { previousAddress: '88 Maple Avenue, Newmarket', yearsAtPrevious: '7', previousLandlordName: 'Bayview Property Management', previousLandlordContact: '905-555-0102', currentRent: 2200 },
    apartment: { address: '420 Bathurst Manor Boulevard, Toronto', description: '3BR townhome, Bathurst Manor, $3,400/mo', estimatedRent: 3400, rentToIncomeRatio: 24 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Moving in from Newmarket — wife is starting a new role in Toronto, and we want to shorten commute.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Wife Emma (HR coordinator), two kids (age 7 and 10).', smoker: 'outdoor' },
    coApplicant: { name: 'Emma Brennan', age: '36', relationship: 'Spouse', jobTitle: 'HR Coordinator', employer: 'Sun Life Financial', annualIncome: 72000 },
    lifestyle: { personality: 'Working family. I do shift work; wife is 9-to-5. Kids in elementary school.', pets: 'One Beagle (6 years), one indoor cat (10 years).' },
    vehicle: { makeModel: 'Ford F-150 (work truck)', year: '2020' },
    references: [
          { name: 'Bayview Property Management', relationship: 'Current landlord (7 years)', contact: '905-555-0102' },
          { name: 'Manny Rodrigues', relationship: 'Foreman, Black & McDonald', contact: 'm.rodrigues@bmlimited.com' }
        ],
    disclosures: 'Outdoor smoker only — never inside the home.',
    scorecard: {
      incomeStability: { score: 5, note: '14 years union electrician, stable trade' },
      rentAffordability: { score: 5, note: '24% of combined income' },
      rentalHistory: { score: 5, note: '7 years with property manager reference' },
      longTermIntent: { score: 5, note: 'School-aged kids, looking for stability' },
      disclosures: { score: 4, note: 'Outdoor smoking proactively disclosed' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-007', createdAt: new Date().toISOString(),
    email: 'rosa.mendoza@email.com',
    tenant: { fullName: 'Rosa & Carlos Mendoza', age: '40 & 42', dateOfBirth: '1985-08-12', phone: '(416) 555-0890' },
    employment: { jobTitle: 'Restaurant Owner (Rosa)', employer: 'La Carnita (multiple locations)', yearsAtJob: '10', annualIncome: 95000, monthlyIncome: 7917 },
    rental: { previousAddress: '290 College Street, Toronto', yearsAtPrevious: '6', previousLandlordName: 'Rita Vega', previousLandlordContact: '416-555-0779', currentRent: 2400 },
    apartment: { address: '92 Pricefield Road, Toronto', description: '3BR, Summerhill, $4,100/mo', estimatedRent: 4100, rentToIncomeRatio: 26 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Business has grown — we can afford a bigger place. Want our daughter to attend Whitney Junior PS.' },
    household: { numberOfOccupants: '3', occupantsDetails: 'My husband Carlos (chef), our 9-year-old daughter, me.', smoker: 'no' },
    coApplicant: { name: 'Carlos Mendoza', age: '42', relationship: 'Spouse', jobTitle: 'Executive Chef', employer: 'La Carnita', annualIncome: 95000 },
    lifestyle: { personality: 'Restaurant family — long days. Daughter at after-school program. Quiet at home.', pets: null },
    vehicle: { makeModel: 'Honda Odyssey', year: '2021' },
    references: [
          { name: 'Rita Vega', relationship: 'Current landlord (6 years)', contact: '416-555-0779' },
          { name: 'Andrew Carrillo', relationship: 'Co-founder, La Carnita', contact: 'a.carrillo@lacarnita.com' }
        ],
    disclosures: 'Income is split between salary and business profits — full T4 + business returns available.',
    scorecard: {
      incomeStability: { score: 4, note: 'Self-employed 10 years, business stable' },
      rentAffordability: { score: 5, note: '26% of combined business income' },
      rentalHistory: { score: 5, note: '6 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'School-aged daughter, multi-year tenancy' },
      disclosures: { score: 4, note: 'Mixed income documented' },
      overall: 4.6,
    },
  },
  {
    applicationNumber: 'RL-2026-FAM-008', createdAt: new Date().toISOString(),
    email: 'jonathan.wright@email.com',
    tenant: { fullName: 'Jonathan Wright', age: '44', dateOfBirth: '1981-02-15', phone: '(416) 555-0998' },
    employment: { jobTitle: 'Software Architect', employer: 'Royal Bank of Canada', yearsAtJob: '15', annualIncome: 175000, monthlyIncome: 14583 },
    rental: { previousAddress: '88 Pleasant Avenue, Toronto', yearsAtPrevious: '9', previousLandlordName: 'Annette Park', previousLandlordContact: '416-555-0223', currentRent: 3100 },
    apartment: { address: '156 Crescent Road, Toronto', description: '4BR house, Rosedale, $5,400/mo', estimatedRent: 5400, rentToIncomeRatio: 26 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'My ex-wife and I are co-parenting — I need a house where my three kids can each have their own room for their weeks with me.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Three kids (ages 8, 11, 14) on alternate weeks. Me solo otherwise.', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Established professional. Cooks at home, hosts family weekends.', pets: 'One older Labrador, 10 years old.' },
    vehicle: { makeModel: 'Tesla Model S', year: '2022' },
    references: [
          { name: 'Annette Park', relationship: 'Current landlord (9 years)', contact: '416-555-0223' },
          { name: 'Janice Lim', relationship: 'VP Technology, RBC', contact: 'j.lim@rbc.com' }
        ],
    disclosures: 'Recent divorce — finances separated, credit and savings are mine alone. Custody agreement is amicable, 50/50 with three kids.',
    scorecard: {
      incomeStability: { score: 5, note: '15 years at RBC, stable career' },
      rentAffordability: { score: 5, note: '26% of monthly income' },
      rentalHistory: { score: 5, note: '9 years with current landlord (exceptional)' },
      longTermIntent: { score: 5, note: 'Custody requires stable Toronto home' },
      disclosures: { score: 4, note: 'Family situation disclosed' },
      overall: 4.8,
    },
  }
];

const CREATIVE_SCENE_DEMOS = [
  {
    applicationNumber: 'RL-2026-CRE-001', createdAt: new Date().toISOString(),
    email: 'tyler.brennan@email.com',
    tenant: { fullName: 'Tyler Brennan', age: '28', dateOfBirth: '1997-01-08', phone: '(416) 555-0667' },
    employment: { jobTitle: 'Bartender + Session Musician', employer: 'The Cameron House + freelance gigs', yearsAtJob: '3', annualIncome: 58000, monthlyIncome: 4833 },
    rental: { previousAddress: '650 King Street West, Toronto', yearsAtPrevious: '1', previousLandlordName: 'Property Manager — Akelius', previousLandlordContact: 'tenant.relations@akelius.ca', currentRent: 1800 },
    apartment: { address: '92 Ossington Avenue, Toronto', description: '1BR, Trinity Bellwoods, $1,950/mo', estimatedRent: 1950, rentToIncomeRatio: 40 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Current building is being converted to short-term rentals.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'outdoor' },
    coApplicant: null,
    lifestyle: { personality: 'Works evenings. Quiet during the day. Practices guitar with headphones.', pets: null },
    vehicle: null,
    references: [
          { name: 'Roy Murphy', relationship: 'Owner, The Cameron House', contact: '416-555-0233' },
          { name: 'Sara Wynn', relationship: 'Bandmate of 5 years', contact: 's.wynn@email.com' }
        ],
    disclosures: 'Income variable — combines bartending and freelance music. 12 months of bank statements show consistent deposits.',
    scorecard: {
      incomeStability: { score: 3, note: '3 years bartending + steady gig income' },
      rentAffordability: { score: 3, note: '40% of monthly income' },
      rentalHistory: { score: 4, note: '1 year at current address' },
      longTermIntent: { score: 4, note: 'Embedded in Toronto music scene' },
      disclosures: { score: 4, note: 'Income variability documented' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-002', createdAt: new Date().toISOString(),
    email: 'yuki.tanaka@email.com',
    tenant: { fullName: 'Yuki Tanaka', age: '23', dateOfBirth: '2002-05-29', phone: '(437) 555-0210' },
    employment: { jobTitle: 'Graphic Designer (Junior)', employer: 'Razer Studios', yearsAtJob: '1', annualIncome: 52000, monthlyIncome: 4333 },
    rental: { previousAddress: '110 Lippincott Street, Toronto', yearsAtPrevious: '1.5', previousLandlordName: 'Patricia Romero', previousLandlordContact: '416-555-0901', currentRent: 1600 },
    apartment: { address: '300 Bathurst Street, Toronto', description: '2BR, Trinity Bellwoods, $2,400/mo', estimatedRent: 2400, rentToIncomeRatio: 27 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Current 3-bedroom is breaking up — moving into a 2BR with one of my current roommates.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Long-time roommate Hana Sato and me.', smoker: 'no' },
    coApplicant: { name: 'Hana Sato', age: '24', relationship: 'Roommate of 2 years', jobTitle: 'UX Researcher', employer: 'TELUS Health', annualIncome: 58000 },
    lifestyle: { personality: 'Both early-career creatives. Work hybrid.', pets: null },
    vehicle: null,
    references: [
          { name: 'Patricia Romero', relationship: 'Current landlord (1.5 years)', contact: '416-555-0901' },
          { name: 'Karim Hassan', relationship: 'My manager, Razer', contact: 'k.hassan@razer.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '1yr + roommate 2yr at TELUS Health' },
      rentAffordability: { score: 5, note: '27% of combined income' },
      rentalHistory: { score: 4, note: '1.5 years with current landlord ref' },
      longTermIntent: { score: 4, note: 'Stable career start' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.4,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-003', createdAt: new Date().toISOString(),
    email: 'imani.johnson@email.com',
    tenant: { fullName: 'Imani Johnson', age: '30', dateOfBirth: '1995-08-19', phone: '(647) 555-0334' },
    employment: { jobTitle: 'Visual Artist + Part-Time Curator', employer: 'AGO + freelance commissions', yearsAtJob: '4', annualIncome: 48000, monthlyIncome: 4000 },
    rental: { previousAddress: '99 Robinson Street, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Marcus Stein', previousLandlordContact: '416-555-0445', currentRent: 1450 },
    apartment: { address: '88 Shaw Street, Toronto', description: '1BR with studio space, Trinity Bellwoods, $1,850/mo', estimatedRent: 1850, rentToIncomeRatio: 46 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Current studio space too small — need somewhere I can paint AND live.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studio at home. Working artist — paints during the day, exhibitions in evenings/weekends.', pets: null },
    vehicle: null,
    references: [
          { name: 'Marcus Stein', relationship: 'Current landlord (3 years)', contact: '416-555-0445' },
          { name: 'Lisa Brown', relationship: 'Curator at AGO', contact: 'l.brown@ago.ca' }
        ],
    disclosures: 'Mixed income — AGO part-time ($30K) + commissions/exhibitions ($18K average). Three years of tax returns available.',
    scorecard: {
      incomeStability: { score: 3, note: '4 years mixed art/curator income, stable' },
      rentAffordability: { score: 3, note: '46% of income — tight but managing' },
      rentalHistory: { score: 5, note: '3 years with current landlord ref' },
      longTermIntent: { score: 5, note: 'Embedded in Toronto art scene' },
      disclosures: { score: 4, note: 'Mixed income transparently documented' },
      overall: 4.0,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-004', createdAt: new Date().toISOString(),
    email: 'marco.rossi@email.com',
    tenant: { fullName: 'Marco Rossi', age: '32', dateOfBirth: '1993-11-22', phone: '(416) 555-0188' },
    employment: { jobTitle: 'Freelance Filmmaker + Cinematographer', employer: 'Various productions (CBC, Netflix, indie)', yearsAtJob: '7', annualIncome: 78000, monthlyIncome: 6500 },
    rental: { previousAddress: '188 Bellwoods Avenue, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Andrea Costa', previousLandlordContact: '416-555-0723', currentRent: 1900 },
    apartment: { address: '78 Argyle Street, Toronto', description: '1BR, West Queen West, $2,150/mo', estimatedRent: 2150, rentToIncomeRatio: 33 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: 'Current landlord is selling. Need to stay in the neighbourhood for client access.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Travel for shoots, but home base is critical. Quiet, organized.', pets: null },
    vehicle: { makeModel: 'Volkswagen Jetta', year: '2019' },
    references: [
          { name: 'Andrea Costa', relationship: 'Current landlord (4 years)', contact: '416-555-0723' },
          { name: 'Robert Lim', relationship: 'Producer, CBC Originals', contact: 'r.lim@cbc.ca' }
        ],
    disclosures: 'Income reflects 3-year average — freelance varies from $60K to $95K. Two years of CRA returns + signed letters from agencies showing pipeline.',
    scorecard: {
      incomeStability: { score: 4, note: '7 years freelance, 3-yr avg $78K' },
      rentAffordability: { score: 4, note: '33% of average income' },
      rentalHistory: { score: 5, note: '4 years with current landlord ref' },
      longTermIntent: { score: 4, note: 'Established in Toronto film scene' },
      disclosures: { score: 4, note: 'Income variability documented' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-005', createdAt: new Date().toISOString(),
    email: 'anna.kowalski@email.com',
    tenant: { fullName: 'Anna Kowalski', age: '27', dateOfBirth: '1998-04-11', phone: '(437) 555-0445' },
    employment: { jobTitle: 'Tattoo Artist', employer: 'Black Line Studio (booth rental)', yearsAtJob: '4', annualIncome: 72000, monthlyIncome: 6000 },
    rental: { previousAddress: '88 Ossington Avenue, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Robert Yoon', previousLandlordContact: '416-555-0998', currentRent: 1700 },
    apartment: { address: '156 Dovercourt Road, Toronto', description: '1BR, Dovercourt, $1,800/mo', estimatedRent: 1800, rentToIncomeRatio: 30 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Want a quieter street — current place is on a busy corner.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'outdoor' },
    coApplicant: null,
    lifestyle: { personality: 'Works booth rental at a tattoo studio. Mostly daytime. Comes home, hangs out, paints at home in evenings.', pets: null },
    vehicle: null,
    references: [
          { name: 'Robert Yoon', relationship: 'Current landlord (2 years)', contact: '416-555-0998' },
          { name: 'Mark Sanders', relationship: 'Studio owner, Black Line', contact: 'm.sanders@blacklinetattoo.ca' }
        ],
    disclosures: 'Self-employed tattoo artist, booth rental. T2125 self-employment returns available. Strong client base built over 4 years.',
    scorecard: {
      incomeStability: { score: 4, note: '4 years tattooing, strong returning clients' },
      rentAffordability: { score: 5, note: '30% of monthly income' },
      rentalHistory: { score: 4, note: '2 years current landlord, ref strong' },
      longTermIntent: { score: 4, note: 'Embedded in Toronto art/tattoo scene' },
      disclosures: { score: 4, note: 'Self-employed income documented' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-006', createdAt: new Date().toISOString(),
    email: 'liam.murphy@email.com',
    tenant: { fullName: "Liam Murphy & James O'Donnell", age: '29 & 31', dateOfBirth: '1996-09-15', phone: '(416) 555-0667' },
    employment: { jobTitle: 'Indie Music Producer (Liam)', employer: 'Self-employed (own studio)', yearsAtJob: '5', annualIncome: 65000, monthlyIncome: 5417 },
    rental: { previousAddress: '650 Queen Street West, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Property Manager — Akelius', previousLandlordContact: 'tenant.relations@akelius.ca', currentRent: 2200 },
    apartment: { address: '230 Lansdowne Avenue, Toronto', description: '2BR with sound-proofed studio, Bloordale, $2,650/mo', estimatedRent: 2650, rentToIncomeRatio: 26 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Looking for a 2BR where we can have a proper home studio set up.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Partner James (sound engineer at Studio Mix) and me.', smoker: 'no' },
    coApplicant: { name: "James O\'Donnell", age: '31', relationship: 'Partner of 6 years', jobTitle: 'Sound Engineer', employer: 'Studio Mix Toronto', annualIncome: 58000 },
    lifestyle: { personality: 'Music production duo. Quiet recording during the day. Sound-proofed studio.', pets: null },
    vehicle: null,
    references: [
          { name: 'Property Manager — Akelius', relationship: 'Current property manager (3 years)', contact: 'tenant.relations@akelius.ca' },
          { name: 'Marcus White', relationship: 'Owner, Studio Mix Toronto', contact: 'm.white@studiomix.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '5yr self-employed producer + partner 4yr studio job' },
      rentAffordability: { score: 5, note: '26% of combined income' },
      rentalHistory: { score: 5, note: '3 years current with property manager ref' },
      longTermIntent: { score: 5, note: 'Career embedded in Toronto music scene' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 4.8,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-007', createdAt: new Date().toISOString(),
    email: 'sofia.vasquez@email.com',
    tenant: { fullName: 'Sofia Vasquez', age: '26', dateOfBirth: '1999-07-30', phone: '(647) 555-0223' },
    employment: { jobTitle: 'Stylist (Fashion Editorial)', employer: 'Freelance (Vogue Canada, Flare, brands)', yearsAtJob: '4', annualIncome: 62000, monthlyIncome: 5167 },
    rental: { previousAddress: '388 Adelaide Street West, Toronto', yearsAtPrevious: '2', previousLandlordName: 'Mariana Costa', previousLandlordContact: '416-555-0334', currentRent: 1850 },
    apartment: { address: '92 Niagara Street, Toronto', description: '1BR loft, King West, $2,200/mo', estimatedRent: 2200, rentToIncomeRatio: 35 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Loft for the natural light — important for my work and Instagram presence.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Travels for shoots. Home is quiet — usually working out of laptop or doing client fittings.', pets: null },
    vehicle: null,
    references: [
          { name: 'Mariana Costa', relationship: 'Current landlord (2 years)', contact: '416-555-0334' },
          { name: 'Aniko Black', relationship: 'Editor-in-Chief, Flare', contact: 'a.black@flarecanada.com' }
        ],
    disclosures: 'Income mix: editorial styling (60%) + brand campaigns (40%). 12 months of stripe deposits + agency 1099s available.',
    scorecard: {
      incomeStability: { score: 3, note: '4 years freelance styling, growing' },
      rentAffordability: { score: 4, note: '35% of income' },
      rentalHistory: { score: 5, note: '2 years current landlord, ref strong' },
      longTermIntent: { score: 4, note: 'Career rooted in Toronto fashion scene' },
      disclosures: { score: 4, note: 'Mixed income transparent' },
      overall: 4.0,
    },
  },
  {
    applicationNumber: 'RL-2026-CRE-008', createdAt: new Date().toISOString(),
    email: 'akira.watanabe@email.com',
    tenant: { fullName: 'Akira Watanabe', age: '34', dateOfBirth: '1991-12-04', phone: '(437) 555-0667' },
    employment: { jobTitle: 'DJ / Music Producer', employer: 'Self-employed (residencies + tours)', yearsAtJob: '7', annualIncome: 95000, monthlyIncome: 7917 },
    rental: { previousAddress: '88 Niagara Street, Toronto', yearsAtPrevious: '5', previousLandlordName: 'Park West Properties', previousLandlordContact: '416-555-0119', currentRent: 2200 },
    apartment: { address: '125 Stewart Street, Toronto', description: '1BR + studio, King West, $2,650/mo', estimatedRent: 2650, rentToIncomeRatio: 33 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Current place sold. Want to stay in the area for my regular residency at Lavelle.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Performs Friday/Saturday nights. Home recording during weekdays. Sound-proofed studio.', pets: null },
    vehicle: null,
    references: [
          { name: 'Park West Properties', relationship: 'Current landlord (5 years)', contact: '416-555-0119' },
          { name: 'Daniel Park', relationship: 'Co-founder, Lavelle', contact: 'd.park@lavelle.ca' }
        ],
    disclosures: 'Self-employed: residency income + bookings + production fees. 5-year T1 history shows consistent $80K-$110K range. Manager can vouch for upcoming 2026 bookings.',
    scorecard: {
      incomeStability: { score: 4, note: '7 years performing + steady residencies' },
      rentAffordability: { score: 5, note: '33% of stable income' },
      rentalHistory: { score: 5, note: '5 years current landlord, ref strong' },
      longTermIntent: { score: 5, note: 'Career rooted in Toronto nightlife' },
      disclosures: { score: 4, note: 'Self-employed income documented thoroughly' },
      overall: 4.6,
    },
  }
];

const MIXED_DEMOS = [
  {
    applicationNumber: 'RL-2026-MIX-001', createdAt: new Date().toISOString(),
    email: 'daniel.vance@email.com',
    tenant: { fullName: 'Daniel Vance', age: '29', dateOfBirth: '1996-04-18', phone: '(416) 555-0801' },
    employment: { jobTitle: 'Senior Quant Trader', employer: 'TD Securities', yearsAtJob: '2.5', annualIncome: 285000, monthlyIncome: 23750 },
    rental: { previousAddress: null, yearsAtPrevious: null, previousLandlordName: null, previousLandlordContact: null, currentRent: null },
    apartment: { address: '199 Yonge Street, Toronto', description: '1BR luxury condo, downtown core, $3,400/mo', estimatedRent: 3400, rentToIncomeRatio: 14 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Moving out of family home in Markham — first apartment, ready to live downtown near work.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Works long hours, mostly home to sleep. Quiet, no parties.', pets: null },
    vehicle: { makeModel: 'BMW M3', year: '2024' },
    references: [
          { name: 'Sarah Klein', relationship: 'Managing Director, TD Securities', contact: 's.klein@tdsecurities.com' },
          { name: 'Rakesh Vance', relationship: 'Father (character reference)', contact: '905-555-0344' }
        ],
    disclosures: 'First-time renter — coming from family home. Strong income trajectory and bonus structure.',
    scorecard: {
      incomeStability: { score: 5, note: 'Top-tier income, 2.5 years at TD Securities' },
      rentAffordability: { score: 5, note: '14% of monthly income — vast buffer' },
      rentalHistory: { score: 2, note: 'No previous rental history — first-time renter' },
      longTermIntent: { score: 2, note: 'Young, mobile career path, may relocate to NYC/Chicago' },
      disclosures: { score: 4, note: 'First-time renter status disclosed openly' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-002', createdAt: new Date().toISOString(),
    email: 'jessica.wu@email.com',
    tenant: { fullName: 'Jessica Wu', age: '31', dateOfBirth: '1994-08-22', phone: '(647) 555-0234' },
    employment: { jobTitle: 'Investment Banking VP', employer: 'Goldman Sachs Canada', yearsAtJob: '1', annualIncome: 340000, monthlyIncome: 28333 },
    rental: { previousAddress: '88 Park Avenue West, Toronto', yearsAtPrevious: '1', previousLandlordName: 'Corporate housing (short-term)', previousLandlordContact: 'corp@cushwake.ca', currentRent: 3800 },
    apartment: { address: '188 Cumberland Street, Toronto', description: '2BR Yorkville luxury, $4,800/mo', estimatedRent: 4800, rentToIncomeRatio: 17 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Corporate-housing contract ending — need to find a real apartment.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Investment banking hours. Home is for sleep.', pets: null },
    vehicle: null,
    references: [
          { name: 'Andrew Lee', relationship: 'Partner, Goldman Sachs', contact: 'a.lee@goldman.com' },
          { name: 'Corporate Housing Manager', relationship: 'Cushman & Wakefield', contact: 'corp@cushwake.ca' }
        ],
    disclosures: 'Came from NYC office 12 months ago — limited Canadian credit, but employer letter and US history available.',
    scorecard: {
      incomeStability: { score: 5, note: 'IB VP at Goldman, $340K confirmed' },
      rentAffordability: { score: 5, note: '17% of monthly income' },
      rentalHistory: { score: 2, note: 'Only corporate housing in Toronto — no traditional rental history here' },
      longTermIntent: { score: 2, note: 'Recently relocated from NYC, IB roles globally mobile' },
      disclosures: { score: 4, note: 'Credit thin-file disclosed, US history offered' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-003', createdAt: new Date().toISOString(),
    email: 'michael.ostrowski@email.com',
    tenant: { fullName: 'Michael Ostrowski', age: '34', dateOfBirth: '1991-12-09', phone: '(416) 555-0667' },
    employment: { jobTitle: 'Tech Founder (Series B)', employer: 'Lumen Health Inc.', yearsAtJob: '4', annualIncome: 220000, monthlyIncome: 18333 },
    rental: { previousAddress: '101 King Street West, Toronto', yearsAtPrevious: '0.5', previousLandlordName: 'Airbnb host', previousLandlordContact: 'host@airbnb.ca', currentRent: 4500 },
    apartment: { address: '50 Wellesley Street East, Toronto', description: '2BR + den condo, $4,200/mo', estimatedRent: 4200, rentToIncomeRatio: 23 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: 'Living out of Airbnbs for 6 months while between sublets — ready for stability.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Works from home most days. Has occasional remote-team visitors.', pets: null },
    vehicle: { makeModel: 'Tesla Model Y', year: '2023' },
    references: [
          { name: 'Karen Wong', relationship: 'Board Chair, Lumen Health', contact: 'k.wong@lumenhealth.io' },
          { name: 'Jaime Park', relationship: 'Previous co-founder', contact: 'jaime@parkventures.com' }
        ],
    disclosures: 'Highly variable founder income — $220K base + equity. 6 months of nomadic living between sublets.',
    scorecard: {
      incomeStability: { score: 5, note: 'Founder of well-funded Series B startup, $220K base' },
      rentAffordability: { score: 5, note: '23% of monthly income, plus $2M+ liquid equity' },
      rentalHistory: { score: 2, note: 'Last 6 months on Airbnb, no current landlord' },
      longTermIntent: { score: 2, note: 'Startup might require relocation if next round leads to expansion' },
      disclosures: { score: 4, note: 'Nomadic lifestyle and variable income disclosed' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-004', createdAt: new Date().toISOString(),
    email: 'aisha.mahmood@email.com',
    tenant: { fullName: 'Aisha Mahmood', age: '27', dateOfBirth: '1998-03-15', phone: '(437) 555-0119' },
    employment: { jobTitle: 'Corporate Lawyer (1st-year associate)', employer: 'McCarthy Tétrault LLP', yearsAtJob: '1', annualIncome: 195000, monthlyIncome: 16250 },
    rental: { previousAddress: 'Family home, Mississauga', yearsAtPrevious: '21', previousLandlordName: 'Parents', previousLandlordContact: 'mahmood.family@email.com', currentRent: null },
    apartment: { address: '320 King Street West, Toronto', description: '1BR luxury near Bay Street, $3,200/mo', estimatedRent: 3200, rentToIncomeRatio: 20 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Just called to the Ontario bar — moving out of family home for the first time.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, religious, no parties. Home most evenings working remotely.', pets: null },
    vehicle: null,
    references: [
          { name: 'Sandra Khoury', relationship: 'Partner, McCarthy Tétrault', contact: 's.khoury@mccarthy.ca' },
          { name: 'Anwar Mahmood', relationship: 'Father (engineer, 23 years at WSP)', contact: '905-555-0455' }
        ],
    disclosures: 'First-time renter coming from family home. Father willing to co-sign as guarantor.',
    scorecard: {
      incomeStability: { score: 5, note: '1st-year associate at top-tier firm, $195K + bonus' },
      rentAffordability: { score: 5, note: '20% of monthly income' },
      rentalHistory: { score: 2, note: 'No rental history — coming from family home' },
      longTermIntent: { score: 2, note: 'Big-law associate, future could include partnership move or BigLaw shuffle' },
      disclosures: { score: 4, note: 'First-time renter status disclosed with guarantor offer' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-005', createdAt: new Date().toISOString(),
    email: 'carlos.mendoza@email.com',
    tenant: { fullName: 'Carlos Mendoza', age: '32', dateOfBirth: '1993-06-04', phone: '(416) 555-0399' },
    employment: { jobTitle: 'Plastic Surgeon (recently licensed)', employer: 'Toronto Aesthetic Group', yearsAtJob: '0.5', annualIncome: 380000, monthlyIncome: 31667 },
    rental: { previousAddress: null, yearsAtPrevious: null, previousLandlordName: null, previousLandlordContact: null, currentRent: null },
    apartment: { address: '256 King Street East, Toronto', description: '2BR condo near St. Mike\'s Hospital, $4,300/mo', estimatedRent: 4300, rentToIncomeRatio: 14 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Just completed fellowship in Boston — moving back to Toronto for new practice role.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Long hospital hours. Home is quiet.', pets: null },
    vehicle: { makeModel: 'Audi Q5', year: '2024' },
    references: [
          { name: 'Dr. Jennifer Roy', relationship: 'Senior Partner, Toronto Aesthetic Group', contact: 'j.roy@aestheticgroup.ca' },
          { name: 'Dr. Robert Henderson', relationship: 'Fellowship director, MGH Boston', contact: 'r.henderson@partners.org' }
        ],
    disclosures: 'Just relocated from Boston after 2-year fellowship — no current Canadian rental history. Strong recent US history available.',
    scorecard: {
      incomeStability: { score: 5, note: 'New private practice partner, $380K guaranteed' },
      rentAffordability: { score: 5, note: '14% of monthly income' },
      rentalHistory: { score: 2, note: 'Recent return from Boston — no current Canadian rental record' },
      longTermIntent: { score: 2, note: 'New practice partnership but medicine careers can require hospital changes' },
      disclosures: { score: 4, note: 'US-only recent rental history disclosed proactively' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-006', createdAt: new Date().toISOString(),
    email: 'margaret.odonnell@email.com',
    tenant: { fullName: 'Margaret O\'Donnell', age: '52', dateOfBirth: '1973-09-12', phone: '(416) 555-0444' },
    employment: { jobTitle: 'Senior Administrative Assistant', employer: 'University Health Network', yearsAtJob: '18', annualIncome: 78000, monthlyIncome: 6500 },
    rental: { previousAddress: '88 College Street, Toronto', yearsAtPrevious: '12', previousLandlordName: 'Frank Romano', previousLandlordContact: '416-555-0234', currentRent: 2100 },
    apartment: { address: '120 Carlton Street, Toronto', description: '1BR Cabbagetown, $2,400/mo', estimatedRent: 2400, rentToIncomeRatio: 37 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Current building going condo — landlord has been incredibly fair for 12 years but is selling.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Lives alone, quiet, plant lover. Walks to UHN every morning.', pets: 'One cat, 14 years old' },
    vehicle: null,
    references: [
          { name: 'Frank Romano', relationship: 'Current landlord (12 years)', contact: '416-555-0234' },
          { name: 'Patricia Wong', relationship: 'UHN HR Director', contact: 'p.wong@uhn.ca' }
        ],
    disclosures: '37% rent-to-income ratio is high — but I\'ve managed comfortably at this level for years.',
    scorecard: {
      incomeStability: { score: 3, note: '$78K solid public-sector pay, 18 years stable' },
      rentAffordability: { score: 3, note: '37% of income — tight by guideline but managed for years' },
      rentalHistory: { score: 5, note: '12 years with same landlord — exceptional reference' },
      longTermIntent: { score: 5, note: 'Long-term Cabbagetown resident — wants to stay 10+ years' },
      disclosures: { score: 5, note: 'Affordability ratio disclosed proactively' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-007', createdAt: new Date().toISOString(),
    email: 'robert.lim@email.com',
    tenant: { fullName: 'Robert & Susan Lim', age: '58 & 56', dateOfBirth: '1967-02-28', phone: '(416) 555-0922' },
    employment: { jobTitle: 'High School Principal (Robert)', employer: 'Toronto District School Board', yearsAtJob: '22', annualIncome: 138000, monthlyIncome: 11500 },
    rental: { previousAddress: '88 Glenholme Avenue, Toronto', yearsAtPrevious: '15', previousLandlordName: 'Estate of M. Hoffman', previousLandlordContact: 'estate.contact@email.com', currentRent: 2800 },
    apartment: { address: '156 Glen Park Avenue, Toronto', description: '3BR house Cedarvale, $3,500/mo', estimatedRent: 3500, rentToIncomeRatio: 30 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: '15 years in current house — landlord passed away, estate is selling. Want to stay in the area.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Wife Susan (retired teacher), one adult son occasionally visiting from grad school', smoker: 'no' },
    coApplicant: { name: 'Susan Lim', age: '56', relationship: 'Spouse', jobTitle: 'Retired Teacher', employer: 'TDSB (retired 2024)', annualIncome: 42000 },
    lifestyle: { personality: 'Quiet empty-nesters. Cooking, walking, book club. No parties.', pets: 'One dog, 8 years old, well-trained Lab' },
    vehicle: { makeModel: 'Honda CR-V', year: '2019' },
    references: [
          { name: 'Estate of M. Hoffman', relationship: 'Previous landlord (15 years, now estate)', contact: 'estate.contact@email.com' },
          { name: 'Dr. Karen Mathieson', relationship: 'TDSB Superintendent', contact: 'k.mathieson@tdsb.on.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 3, note: 'Strong combined household but mid by luxury standards' },
      rentAffordability: { score: 3, note: '30% of $180K combined income' },
      rentalHistory: { score: 5, note: '15 years with same landlord — never missed a payment' },
      longTermIntent: { score: 5, note: 'Empty-nesters, want to stay in Cedarvale 10+ years' },
      disclosures: { score: 5, note: 'No items to disclose' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-008', createdAt: new Date().toISOString(),
    email: 'thelma.reyes@email.com',
    tenant: { fullName: 'Thelma Reyes', age: '47', dateOfBirth: '1978-11-04', phone: '(647) 555-0801' },
    employment: { jobTitle: 'Registered Nurse', employer: 'Mount Sinai Hospital', yearsAtJob: '14', annualIncome: 92000, monthlyIncome: 7667 },
    rental: { previousAddress: '290 Bathurst Street, Toronto', yearsAtPrevious: '11', previousLandlordName: 'Anita Kapoor', previousLandlordContact: '416-555-0119', currentRent: 1950 },
    apartment: { address: '88 Henry Street, Toronto', description: '2BR Kensington area, $2,800/mo', estimatedRent: 2800, rentToIncomeRatio: 36 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: '11 years in current place. Landlord retiring and selling. Want to stay in walkable downtown.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'Me and my mother (who I care for part-time)', smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Shift worker. Quiet at home, cooking and reading. Mom in early 70s, mobile but I\'m her support.', pets: null },
    vehicle: null,
    references: [
          { name: 'Anita Kapoor', relationship: 'Current landlord (11 years)', contact: '416-555-0119' },
          { name: 'Dr. James Patterson', relationship: 'Mount Sinai nursing supervisor', contact: 'j.patterson@sinaihealth.ca' }
        ],
    disclosures: '36% rent-to-income is high — but I\'ve never had any issues making payments. Mother contributes occasionally.',
    scorecard: {
      incomeStability: { score: 3, note: '14 years stable RN income, $92K' },
      rentAffordability: { score: 3, note: '36% of monthly income — tight but proven' },
      rentalHistory: { score: 5, note: '11 years with same landlord, exceptional reference' },
      longTermIntent: { score: 5, note: 'Caregiving for mother, want stable home long-term' },
      disclosures: { score: 5, note: 'Affordability concern disclosed openly' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-009', createdAt: new Date().toISOString(),
    email: 'patrick.chen@email.com',
    tenant: { fullName: 'Patrick & Diane Chen', age: '45 & 44', dateOfBirth: '1980-05-20', phone: '(416) 555-0556' },
    employment: { jobTitle: 'Senior Software Developer (Patrick)', employer: 'Royal Bank of Canada', yearsAtJob: '13', annualIncome: 158000, monthlyIncome: 13167 },
    rental: { previousAddress: '420 Sherbourne Street, Toronto', yearsAtPrevious: '10', previousLandlordName: 'Wing-On Lee', previousLandlordContact: '416-555-0998', currentRent: 2600 },
    apartment: { address: '88 Greensides Avenue, Toronto', description: '3BR semi-detached, Wychwood, $3,800/mo', estimatedRent: 3800, rentToIncomeRatio: 28 },
    move: { moveInDate: 'August 15, 2026', reasonForMoving: 'Family of 4. Want to stay in the same school catchment for our kids.' },
    household: { numberOfOccupants: '4', occupantsDetails: 'Wife Diane (part-time teacher), two kids (ages 9 and 12)', smoker: 'no' },
    coApplicant: { name: 'Diane Chen', age: '44', relationship: 'Spouse', jobTitle: 'Part-time Teacher', employer: 'TDSB', annualIncome: 35000 },
    lifestyle: { personality: 'Family-focused. Kids in piano, soccer. Quiet evenings.', pets: 'One indoor cat, 6 years old' },
    vehicle: { makeModel: 'Toyota Highlander', year: '2020' },
    references: [
          { name: 'Wing-On Lee', relationship: 'Current landlord (10 years)', contact: '416-555-0998' },
          { name: 'Anna Macedo', relationship: 'VP Technology, RBC', contact: 'a.macedo@rbc.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 3, note: 'Strong combined household, $193K — mid by tech standards' },
      rentAffordability: { score: 3, note: '28% of combined income — comfortable' },
      rentalHistory: { score: 5, note: '10 years with same landlord — kids grew up here' },
      longTermIntent: { score: 5, note: 'Kids in school catchment — multi-year stability required' },
      disclosures: { score: 5, note: 'No items to disclose' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-010', createdAt: new Date().toISOString(),
    email: 'helen.kowalski@email.com',
    tenant: { fullName: 'Helen Kowalski', age: '63', dateOfBirth: '1962-07-08', phone: '(416) 555-0712' },
    employment: { jobTitle: 'Retired Civil Servant (former Director, MOH)', employer: 'Ontario Public Service (Pensioner)', yearsAtJob: '32', annualIncome: 76000, monthlyIncome: 6333 },
    rental: { previousAddress: '88 Coxwell Avenue, Toronto', yearsAtPrevious: '20', previousLandlordName: 'Family Brennan', previousLandlordContact: 'brennan.family@email.com', currentRent: 1850 },
    apartment: { address: '156 Carlaw Avenue, Toronto', description: '1BR Leslieville, $2,200/mo', estimatedRent: 2200, rentToIncomeRatio: 35 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: '20 years in current building. Owner family is selling building to developer. Heartbroken but moving on.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Retired, well-established life. Volunteering, reading, gardening, grandkids on weekends.', pets: null },
    vehicle: null,
    references: [
          { name: 'Mike Brennan', relationship: 'Previous landlord (20 years)', contact: 'brennan.family@email.com' },
          { name: 'Dr. Sarah Cohen', relationship: 'Former colleague, MOH', contact: 's.cohen@ontario.ca' }
        ],
    disclosures: '35% rent-to-income is high but I have $310K in retirement savings and OAS+CPP income on top of pension.',
    scorecard: {
      incomeStability: { score: 3, note: 'Pension income $76K — fixed but indexed to inflation' },
      rentAffordability: { score: 3, note: '35% of pension income — but $310K retirement buffer' },
      rentalHistory: { score: 5, note: '20 years with same family of landlords' },
      longTermIntent: { score: 5, note: 'Retired and rooted in Toronto — wants final long-term home' },
      disclosures: { score: 5, note: 'Affordability + retirement assets disclosed openly' },
      overall: 4.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-011', createdAt: new Date().toISOString(),
    email: 'jamal.whitfield@email.com',
    tenant: { fullName: 'Jamal Whitfield', age: '24', dateOfBirth: '2001-10-15', phone: '(437) 555-0445' },
    employment: { jobTitle: 'Software Engineer (recent grad)', employer: 'Shopify', yearsAtJob: '0.5', annualIncome: 95000, monthlyIncome: 7917 },
    rental: { previousAddress: 'Family home, Brampton', yearsAtPrevious: '24', previousLandlordName: 'Parents', previousLandlordContact: 'whitfield.family@email.com', currentRent: null },
    apartment: { address: '180 Front Street West, Toronto', description: '1BR Liberty Village, $2,400/mo', estimatedRent: 2400, rentToIncomeRatio: 30 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Recently started at Shopify after graduating from Waterloo. First time on my own.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, mostly home gaming and coding. No parties.', pets: null },
    vehicle: null,
    references: [
          { name: 'Sarah Liu', relationship: 'Engineering Manager, Shopify', contact: 's.liu@shopify.com' },
          { name: 'Marcus Whitfield', relationship: 'Father (sergeant, Peel Regional Police)', contact: '905-555-0223' }
        ],
    disclosures: 'First-time renter — coming from family home in Brampton. Father offered to co-sign as guarantor.',
    scorecard: {
      incomeStability: { score: 4, note: '$95K + bonus at Shopify — early career but strong trajectory' },
      rentAffordability: { score: 4, note: '30% of monthly income' },
      rentalHistory: { score: 1, note: 'No rental history — first apartment' },
      longTermIntent: { score: 4, note: 'Tech career rooted in Toronto, wants 2-3 years stability' },
      disclosures: { score: 5, note: 'Proactively offered guarantor + acknowledged first-timer status' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-012', createdAt: new Date().toISOString(),
    email: 'priya.chandra@email.com',
    tenant: { fullName: 'Priya Chandrasekhar', age: '23', dateOfBirth: '2002-04-30', phone: '(647) 555-0667' },
    employment: { jobTitle: 'Marketing Associate (1st job)', employer: 'Procter & Gamble Canada', yearsAtJob: '0.5', annualIncome: 68000, monthlyIncome: 5667 },
    rental: { previousAddress: 'University of Waterloo residence', yearsAtPrevious: '1', previousLandlordName: 'UW Housing Office', previousLandlordContact: 'housing@uwaterloo.ca', currentRent: null },
    apartment: { address: '88 Eastern Avenue, Toronto', description: '2BR shared, Corktown, $1,400/room', estimatedRent: 1400, rentToIncomeRatio: 25 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Graduated 4 months ago. Lived in residence for 4 years. Sharing with classmate Anjali.' },
    household: { numberOfOccupants: '2', occupantsDetails: 'My friend Anjali Khan (separate application — also entry-level professional)', smoker: 'no' },
    coApplicant: { name: 'Anjali Khan', age: '23', relationship: 'Friend / co-tenant', jobTitle: 'Junior Analyst', employer: 'KPMG', annualIncome: 65000 },
    lifestyle: { personality: 'Quiet, focused on building career. Yoga, cooking, occasional book club.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dr. Lisa Tremblay', relationship: 'P&G Manager (4 months)', contact: 'l.tremblay@pg.com' },
          { name: 'Vivek Chandrasekhar', relationship: 'Father (engineer, OPG, 21 years)', contact: '905-555-0119' }
        ],
    disclosures: 'First-time renter — only residence experience. Parents available as guarantors.',
    scorecard: {
      incomeStability: { score: 4, note: 'New grad, strong CPG employer' },
      rentAffordability: { score: 4, note: '25% of own income, plus roommate income' },
      rentalHistory: { score: 1, note: '4 years residence only — no traditional rental history' },
      longTermIntent: { score: 4, note: 'P&G typically 2-3 year postings, then moves up' },
      disclosures: { score: 5, note: 'Career stage disclosed openly with guarantor offer' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-013', createdAt: new Date().toISOString(),
    email: 'ethan.brennan@email.com',
    tenant: { fullName: 'Ethan Brennan', age: '22', dateOfBirth: '2003-01-18', phone: '(416) 555-0833' },
    employment: { jobTitle: 'Graduate Student (Computer Science Master\'s)', employer: 'University of Toronto', yearsAtJob: '0.5', annualIncome: 35000, monthlyIncome: 2917 },
    rental: { previousAddress: 'Family home, Newmarket', yearsAtPrevious: '22', previousLandlordName: 'Parents', previousLandlordContact: 'brennan.family.ca@email.com', currentRent: null },
    apartment: { address: '256 McCaul Street, Toronto', description: '1BR near UofT, $1,650/mo', estimatedRent: 1650, rentToIncomeRatio: 57 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Starting Master\'s at UofT this fall. Family home is too far to commute.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studious, mostly at the lab. Lab + library + home only.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dr. Anwar Khan', relationship: 'UofT thesis supervisor', contact: 'a.khan@cs.toronto.edu' },
          { name: 'Patricia Brennan', relationship: 'Mother (paralegal, 14 years at Aird & Berlis)', contact: '905-555-0234' }
        ],
    disclosures: 'TA + RA stipend only. Parents are co-signing as guarantors. 2-year program then PhD planned.',
    scorecard: {
      incomeStability: { score: 4, note: 'Graduate stipend $35K secured 2 years' },
      rentAffordability: { score: 4, note: '57% of own income — guarantor covering gap' },
      rentalHistory: { score: 1, note: 'No rental history' },
      longTermIntent: { score: 4, note: '2-year Master\'s, planning to continue to PhD' },
      disclosures: { score: 5, note: 'Affordability disclosed openly with guarantor + program details' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-014', createdAt: new Date().toISOString(),
    email: 'sasha.petrov@email.com',
    tenant: { fullName: 'Sasha Petrov', age: '26', dateOfBirth: '1999-08-05', phone: '(437) 555-0223' },
    employment: { jobTitle: 'Software Developer (newcomer to Canada)', employer: 'EA Sports Toronto', yearsAtJob: '0.5', annualIncome: 88000, monthlyIncome: 7333 },
    rental: { previousAddress: 'Moscow, Russia', yearsAtPrevious: '6', previousLandlordName: 'Family apartment (owned)', previousLandlordContact: null, currentRent: null },
    apartment: { address: '255 Front Street East, Toronto', description: '1BR Distillery District, $2,300/mo', estimatedRent: 2300, rentToIncomeRatio: 31 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Just immigrated to Canada (Express Entry, PR holder). Starting at EA Sports.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, working hybrid. Cooking at home most nights. New to Toronto, exploring.', pets: null },
    vehicle: null,
    references: [
          { name: 'Dmitri Volkov', relationship: 'EA Engineering Manager (hired me)', contact: 'd.volkov@ea.com' },
          { name: 'Anna Petrova', relationship: 'Mother (in Moscow)', contact: '+7-495-555-0119' }
        ],
    disclosures: 'New immigrant — no Canadian credit yet. Has $45K in liquid savings + family wire transfer support.',
    scorecard: {
      incomeStability: { score: 4, note: 'New EA hire, $88K + relocation package' },
      rentAffordability: { score: 4, note: '31% of monthly income, savings buffer' },
      rentalHistory: { score: 1, note: 'Family-owned home in Russia, no rental history' },
      longTermIntent: { score: 4, note: 'New PR holder rooted in Toronto for the long term' },
      disclosures: { score: 5, note: 'Immigration + credit + history transparently disclosed' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-015', createdAt: new Date().toISOString(),
    email: 'olivia.hartman@email.com',
    tenant: { fullName: 'Olivia Hartman', age: '23', dateOfBirth: '2002-12-14', phone: '(416) 555-0667' },
    employment: { jobTitle: 'Junior Architect', employer: 'Quadrangle Architects', yearsAtJob: '0.5', annualIncome: 62000, monthlyIncome: 5167 },
    rental: { previousAddress: 'Family home, Burlington', yearsAtPrevious: '23', previousLandlordName: 'Parents', previousLandlordContact: 'hartman.family@email.com', currentRent: null },
    apartment: { address: '550 Queen Street West, Toronto', description: '1BR loft, Trinity Bellwoods, $2,000/mo', estimatedRent: 2000, rentToIncomeRatio: 39 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Started full-time at Quadrangle 5 months ago after undergrad. Time to leave the parents\' house.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Creative, quiet. Loves trying restaurants, gallery openings on weekends.', pets: null },
    vehicle: null,
    references: [
          { name: 'Marcus Quattrocchi', relationship: 'Principal, Quadrangle Architects', contact: 'm.quattrocchi@quadrangle.ca' },
          { name: 'Edward Hartman', relationship: 'Father (psychiatrist, 28 years private practice)', contact: '905-555-0445' }
        ],
    disclosures: 'First-time renter from family home. 39% rent-to-income — stretching, but father is co-signing.',
    scorecard: {
      incomeStability: { score: 4, note: 'Junior at established architecture firm, $62K + raises ahead' },
      rentAffordability: { score: 4, note: '39% stretched, guarantor covers gap' },
      rentalHistory: { score: 1, note: 'No rental history' },
      longTermIntent: { score: 4, note: 'Architecture careers reward staying — wants 3+ year base' },
      disclosures: { score: 5, note: 'Stretched affordability + first-timer status disclosed' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-016', createdAt: new Date().toISOString(),
    email: 'marco.ferraro@email.com',
    tenant: { fullName: 'Marco Ferraro', age: '34', dateOfBirth: '1991-03-22', phone: '(416) 555-0890' },
    employment: { jobTitle: 'Freelance Film Director', employer: 'Self-employed (Netflix, CBC, indie)', yearsAtJob: '8', annualIncome: 75000, monthlyIncome: 6250 },
    rental: { previousAddress: '88 Bellwoods Avenue, Toronto', yearsAtPrevious: '5', previousLandlordName: 'Andrea Costa', previousLandlordContact: '416-555-0723', currentRent: 1900 },
    apartment: { address: '420 Adelaide Street West, Toronto', description: '1BR + studio, King West, $2,300/mo', estimatedRent: 2300, rentToIncomeRatio: 37 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: 'Building is being torn down for condos. Need new place near production hub.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Travels for shoots 6-8 weeks/year. Quiet otherwise — editing room at home.', pets: null },
    vehicle: { makeModel: 'Honda Civic', year: '2018' },
    references: [
          { name: 'Andrea Costa', relationship: 'Current landlord (5 years)', contact: '416-555-0723' },
          { name: 'Sarah Birmingham', relationship: 'Producer, Three Floor Productions', contact: 's.birmingham@threefloor.ca' }
        ],
    disclosures: 'Income varies $60K-$95K depending on project flow. 3 years of CRA returns available + signed letters from 4 production companies for 2026.',
    scorecard: {
      incomeStability: { score: 2, note: '8 years freelance — 3-yr avg $75K, but variability is high' },
      rentAffordability: { score: 2, note: '37% of average income — tight on lean months' },
      rentalHistory: { score: 4, note: '5 years with current landlord — strong reference' },
      longTermIntent: { score: 4, note: 'Career embedded in Toronto film scene' },
      disclosures: { score: 4, note: 'Income variability extensively documented' },
      overall: 3.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-017', createdAt: new Date().toISOString(),
    email: 'imani.joseph@email.com',
    tenant: { fullName: 'Imani Joseph', age: '29', dateOfBirth: '1996-06-11', phone: '(647) 555-0334' },
    employment: { jobTitle: 'Visual Artist + Part-Time Curator', employer: 'AGO + commissions', yearsAtJob: '5', annualIncome: 52000, monthlyIncome: 4333 },
    rental: { previousAddress: '180 Robinson Street, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Marcus Stein', previousLandlordContact: '416-555-0445', currentRent: 1450 },
    apartment: { address: '88 Shaw Street, Toronto', description: '1BR with studio space, Trinity Bellwoods, $1,950/mo', estimatedRent: 1950, rentToIncomeRatio: 45 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Current building going condo. Need new place with room to paint.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Studio at home. Painting days, gallery evenings/weekends.', pets: null },
    vehicle: null,
    references: [
          { name: 'Marcus Stein', relationship: 'Current landlord (4 years)', contact: '416-555-0445' },
          { name: 'Lisa Brown', relationship: 'Curator, AGO', contact: 'l.brown@ago.ca' }
        ],
    disclosures: 'Mixed income — AGO part-time ($30K) + commissions/exhibitions ($22K avg). Three years tax returns ready.',
    scorecard: {
      incomeStability: { score: 2, note: 'Mixed art/curator income — $52K, lumpy' },
      rentAffordability: { score: 2, note: '45% of income — tight, manages by absorbing dry spells' },
      rentalHistory: { score: 4, note: '4 years with current landlord — strong reference' },
      longTermIntent: { score: 4, note: 'Embedded in Toronto art scene long-term' },
      disclosures: { score: 4, note: 'Mixed income openly documented' },
      overall: 3.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-018', createdAt: new Date().toISOString(),
    email: 'tyler.brennan.mix@email.com',
    tenant: { fullName: 'Tyler Brennan', age: '28', dateOfBirth: '1997-01-08', phone: '(416) 555-0188' },
    employment: { jobTitle: 'Bartender + Session Musician', employer: 'The Cameron House + freelance gigs', yearsAtJob: '4', annualIncome: 58000, monthlyIncome: 4833 },
    rental: { previousAddress: '88 Ossington Avenue, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Property Manager — Akelius', previousLandlordContact: 'tenant.relations@akelius.ca', currentRent: 1900 },
    apartment: { address: '660 King Street West, Toronto', description: '1BR, West Queen West, $2,100/mo', estimatedRent: 2100, rentToIncomeRatio: 43 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Building converting to short-term rentals.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'outdoor' },
    coApplicant: null,
    lifestyle: { personality: 'Evenings working. Quiet at home. Practices guitar with headphones.', pets: null },
    vehicle: null,
    references: [
          { name: 'Roy Murphy', relationship: 'Owner, The Cameron House', contact: '416-555-0233' },
          { name: 'Property Manager — Akelius', relationship: 'Current landlord (3 years)', contact: 'tenant.relations@akelius.ca' }
        ],
    disclosures: 'Variable income — bartending base + gig income. 12 months of bank statements show consistent deposits despite variability.',
    scorecard: {
      incomeStability: { score: 2, note: 'Mixed bartending + gig income, ~$58K' },
      rentAffordability: { score: 2, note: '43% of monthly income — tight' },
      rentalHistory: { score: 4, note: '3 years with current property manager' },
      longTermIntent: { score: 4, note: 'Career embedded in Toronto music scene' },
      disclosures: { score: 4, note: 'Income variability documented thoroughly' },
      overall: 3.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-019', createdAt: new Date().toISOString(),
    email: 'anna.kowalska@email.com',
    tenant: { fullName: 'Anna Kowalska', age: '30', dateOfBirth: '1995-09-18', phone: '(437) 555-0445' },
    employment: { jobTitle: 'Tattoo Artist', employer: 'Black Line Studio (booth rental)', yearsAtJob: '5', annualIncome: 70000, monthlyIncome: 5833 },
    rental: { previousAddress: '88 Dovercourt Road, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Robert Yoon', previousLandlordContact: '416-555-0998', currentRent: 1700 },
    apartment: { address: '156 Lansdowne Avenue, Toronto', description: '1BR Bloordale, $1,900/mo', estimatedRent: 1900, rentToIncomeRatio: 33 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Want a quieter street and bigger kitchen.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'outdoor' },
    coApplicant: null,
    lifestyle: { personality: 'Works booth rental — daytime mostly. Paints at home in evenings.', pets: null },
    vehicle: null,
    references: [
          { name: 'Robert Yoon', relationship: 'Current landlord (3 years)', contact: '416-555-0998' },
          { name: 'Mark Sanders', relationship: 'Studio owner, Black Line', contact: 'm.sanders@blacklinetattoo.ca' }
        ],
    disclosures: 'Self-employed booth rental, $70K avg. T2125 returns available. Strong returning-client base.',
    scorecard: {
      incomeStability: { score: 2, note: 'Self-employed 5 years, ~$70K but variable' },
      rentAffordability: { score: 2, note: '33% of average income' },
      rentalHistory: { score: 4, note: '3 years with current landlord — strong reference' },
      longTermIntent: { score: 4, note: 'Embedded in Toronto tattoo/art scene' },
      disclosures: { score: 4, note: 'Self-employed income documented' },
      overall: 3.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-020', createdAt: new Date().toISOString(),
    email: 'daniel.kim@email.com',
    tenant: { fullName: 'Daniel Kim', age: '36', dateOfBirth: '1989-04-25', phone: '(416) 555-0556' },
    employment: { jobTitle: 'Freelance Photographer (commercial + weddings)', employer: 'Self-employed', yearsAtJob: '12', annualIncome: 82000, monthlyIncome: 6833 },
    rental: { previousAddress: '290 Niagara Street, Toronto', yearsAtPrevious: '6', previousLandlordName: 'Sophie Tremblay', previousLandlordContact: '416-555-0334', currentRent: 2050 },
    apartment: { address: '88 Strachan Avenue, Toronto', description: '1BR + studio loft, King West, $2,400/mo', estimatedRent: 2400, rentToIncomeRatio: 35 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Current landlord retiring and selling.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Travels for shoots. Studio at home. Quiet, organized.', pets: null },
    vehicle: { makeModel: 'Subaru Outback', year: '2019' },
    references: [
          { name: 'Sophie Tremblay', relationship: 'Current landlord (6 years)', contact: '416-555-0334' },
          { name: 'Christopher Williams', relationship: 'Art Director (regular client)', contact: 'c.williams@adagencyca.com' }
        ],
    disclosures: 'Self-employed 12 years. Annual income $70K-$95K. CRA returns available.',
    scorecard: {
      incomeStability: { score: 2, note: '12 years self-employed, $82K avg but seasonal' },
      rentAffordability: { score: 2, note: '35% of average — wedding season helps' },
      rentalHistory: { score: 4, note: '6 years with current landlord — strong reference' },
      longTermIntent: { score: 4, note: 'Career rooted in Toronto, established client base' },
      disclosures: { score: 4, note: 'Self-employed income openly documented' },
      overall: 3.2,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-021', createdAt: new Date().toISOString(),
    email: 'vincent.russo@email.com',
    tenant: { fullName: 'Vincent Russo', age: '38', dateOfBirth: '1987-02-14', phone: '(647) 555-0119' },
    employment: { jobTitle: 'Sales Director', employer: 'CBRE Real Estate', yearsAtJob: '7', annualIncome: 165000, monthlyIncome: 13750 },
    rental: { previousAddress: '88 King Street West, Toronto', yearsAtPrevious: '4', previousLandlordName: 'Park Place Properties', previousLandlordContact: '416-555-0445', currentRent: 2800 },
    apartment: { address: '200 Bay Street, Toronto', description: '2BR Financial District, $3,800/mo', estimatedRent: 3800, rentToIncomeRatio: 28 },
    move: { moveInDate: 'July 1, 2026', reasonForMoving: 'Career upgrade, moving closer to office.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet professional.', pets: null },
    vehicle: { makeModel: 'BMW X3', year: '2022' },
    references: [
          { name: 'Park Place Properties', relationship: 'Current landlord (4 years)', contact: '416-555-0445' },
          { name: 'Sandra Chen', relationship: 'CBRE VP', contact: 's.chen@cbre.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '7 years at CBRE, $165K' },
      rentAffordability: { score: 4, note: '28% of monthly income' },
      rentalHistory: { score: 4, note: '4 years current — solid reference' },
      longTermIntent: { score: 4, note: 'Stable career, 3+ year horizon' },
      disclosures: { score: 2, note: 'No disclosures provided — unclear background' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-022', createdAt: new Date().toISOString(),
    email: 'anastasia.volkov@email.com',
    tenant: { fullName: 'Anastasia Volkov', age: '32', dateOfBirth: '1993-06-30', phone: '(437) 555-0223' },
    employment: { jobTitle: 'Marketing Manager', employer: 'Sephora Canada', yearsAtJob: '5', annualIncome: 110000, monthlyIncome: 9167 },
    rental: { previousAddress: '88 Queen Street East, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Property Manager — Killam', previousLandlordContact: 'tenant.relations@killam.ca', currentRent: 2600 },
    apartment: { address: '156 Front Street West, Toronto', description: '1BR + den condo, $3,300/mo', estimatedRent: 3300, rentToIncomeRatio: 30 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Moving for shorter commute.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Works hybrid, quiet at home.', pets: null },
    vehicle: null,
    references: [
          { name: 'Killam Property Management', relationship: 'Current landlord (3 years)', contact: 'tenant.relations@killam.ca' },
          { name: 'Maria Lopez', relationship: 'Sephora Director', contact: 'm.lopez@sephora.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '5 years at Sephora, $110K' },
      rentAffordability: { score: 4, note: '30% of income' },
      rentalHistory: { score: 4, note: '3 years with property manager' },
      longTermIntent: { score: 4, note: 'Career-stable in Toronto' },
      disclosures: { score: 2, note: 'Application contains no disclosures section — applicant declined to add context' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-023', createdAt: new Date().toISOString(),
    email: 'brendan.walsh@email.com',
    tenant: { fullName: 'Brendan Walsh', age: '41', dateOfBirth: '1984-09-09', phone: '(416) 555-0777' },
    employment: { jobTitle: 'Operations Manager', employer: 'Magna International', yearsAtJob: '11', annualIncome: 132000, monthlyIncome: 11000 },
    rental: { previousAddress: '88 Royal York Road, Toronto', yearsAtPrevious: '6', previousLandlordName: 'Greenfield Properties', previousLandlordContact: '416-555-0223', currentRent: 2900 },
    apartment: { address: '156 Bloor Street West, Toronto', description: '2BR Annex, $3,600/mo', estimatedRent: 3600, rentToIncomeRatio: 27 },
    move: { moveInDate: 'July 15, 2026', reasonForMoving: 'Family change, downsizing.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Quiet, works shift schedule.', pets: null },
    vehicle: { makeModel: 'Ford Edge', year: '2020' },
    references: [
          { name: 'Greenfield Properties', relationship: 'Current landlord (6 years)', contact: '416-555-0223' },
          { name: 'Dave Tanaka', relationship: 'Magna Plant Manager', contact: 'd.tanaka@magna.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '11 years at Magna, $132K' },
      rentAffordability: { score: 4, note: '27% of income' },
      rentalHistory: { score: 4, note: '6 years with current landlord' },
      longTermIntent: { score: 4, note: 'Long Magna career — Toronto-based' },
      disclosures: { score: 2, note: 'Reason for moving vague — no context on family change' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-024', createdAt: new Date().toISOString(),
    email: 'sophie.tremblay@email.com',
    tenant: { fullName: 'Sophie Tremblay', age: '35', dateOfBirth: '1990-11-12', phone: '(416) 555-0556' },
    employment: { jobTitle: 'Senior Designer', employer: 'Bensimon Byrne (agency)', yearsAtJob: '6', annualIncome: 98000, monthlyIncome: 8167 },
    rental: { previousAddress: '290 Bathurst Street, Toronto', yearsAtPrevious: '4', previousLandlordName: 'James Chen', previousLandlordContact: '416-555-0998', currentRent: 2300 },
    apartment: { address: '180 Queen Street West, Toronto', description: '1BR loft, Queen West, $2,750/mo', estimatedRent: 2750, rentToIncomeRatio: 34 },
    move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Looking for a change of scenery.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Designer life — works hybrid.', pets: null },
    vehicle: null,
    references: [
          { name: 'James Chen', relationship: 'Current landlord (4 years)', contact: '416-555-0998' },
          { name: 'Anita Singh', relationship: 'Creative Director, Bensimon Byrne', contact: 'a.singh@bensimon.ca' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '6 years at agency, $98K' },
      rentAffordability: { score: 4, note: '34% — slightly stretched but proven' },
      rentalHistory: { score: 4, note: '4 years with current landlord' },
      longTermIntent: { score: 4, note: 'Career rooted in Toronto creative scene' },
      disclosures: { score: 2, note: 'Reason for moving generic — no detail or context' },
      overall: 3.6,
    },
  },
  {
    applicationNumber: 'RL-2026-MIX-025', createdAt: new Date().toISOString(),
    email: 'connor.davies@email.com',
    tenant: { fullName: 'Connor Davies', age: '29', dateOfBirth: '1996-08-25', phone: '(437) 555-0801' },
    employment: { jobTitle: 'Project Manager', employer: 'Aecon Construction', yearsAtJob: '4', annualIncome: 115000, monthlyIncome: 9583 },
    rental: { previousAddress: '88 College Street, Toronto', yearsAtPrevious: '3', previousLandlordName: 'Riverview Properties', previousLandlordContact: '416-555-0667', currentRent: 2400 },
    apartment: { address: '320 Front Street East, Toronto', description: '1BR Distillery, $3,000/mo', estimatedRent: 3000, rentToIncomeRatio: 31 },
    move: { moveInDate: 'September 1, 2026', reasonForMoving: 'Personal preference.' },
    household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
    coApplicant: null,
    lifestyle: { personality: 'Construction project manager — variable hours.', pets: null },
    vehicle: { makeModel: 'Ford F-150', year: '2021' },
    references: [
          { name: 'Riverview Properties', relationship: 'Current landlord (3 years)', contact: '416-555-0667' },
          { name: 'Mark Phillips', relationship: 'Aecon Senior PM', contact: 'm.phillips@aecon.com' }
        ],
    disclosures: null,
    scorecard: {
      incomeStability: { score: 4, note: '4 years at Aecon, $115K' },
      rentAffordability: { score: 4, note: '31% of monthly income' },
      rentalHistory: { score: 4, note: '3 years with current landlord' },
      longTermIntent: { score: 4, note: 'Toronto-rooted construction career' },
      disclosures: { score: 2, note: 'Move reason "personal preference" — no real context' },
      overall: 3.6,
    },
  }
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

export default function LandlordDashboard() {
  const [appNumberInput, setAppNumberInput] = useState('');
  const [applications, setApplications] = useState([]);
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
  const [unit, setUnit] = useState({
    address: '',
    monthlyRent: '',
    bedrooms: '',
    allowsPets: 'any',     // 'any' | 'yes' | 'no'
    allowsSmoking: 'no',   // 'yes' | 'no'
    parkingIncluded: 'no', // 'yes' | 'no'
  });
  const [unitCardExpanded, setUnitCardExpanded] = useState(false);
  const unitIsSet = !!(unit.address || unit.monthlyRent || unit.bedrooms);

  // ── MULTI-LISTING STATE ──
  // listings[]: each entry has { id, name, applications[], decisions{}, unit{}, createdAt }
  // activeListingId: which listing is currently being viewed/edited
  // applications/decisions/unit above are the "in-view" values, mirrored from the active listing.
  const [listings, setListings] = useState([]);
  const [activeListingId, setActiveListingId] = useState(null);
  const [listingsSwitcherOpen, setListingsSwitcherOpen] = useState(false);
  const [renamingListingId, setRenamingListingId] = useState(null);
  const [renameInput, setRenameInput] = useState('');

  // ── REALTOR PROFILE state ──
  // Optional. If user identifies as a realtor, their info brands exports + emails.
  const [realtorProfile, setRealtorProfile] = useState({
    isRealtor: true,
    fullName: '',
    brokerage: '',
    phone: '',
    licenseNumber: '', // optional RECO license
  });
  const [realtorOnboardingShown, setRealtorOnboardingShown] = useState(false);
  const [realtorEditOpen, setRealtorEditOpen] = useState(false);

  // ── DEMO/SANDBOX MODE ──
  // When ?demo=pmc is in the URL, we bypass sign-in, pre-load demo data,
  // and disable backend sync. Used for sales demos to property managers.
  const [demoMode, setDemoMode] = useState(false);

  // ── AI rationale generation state ──
  const [rationaleLoading, setRationaleLoading] = useState({}); // keyed by appNumber
  const [rationaleError, setRationaleError] = useState('');

  // ── SHORTLIST + NOTES state (keyed by application number) ──
  // status: 'none' | 'shortlist' | 'reject'
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
  const [workspaceReady, setWorkspaceReady] = useState(false);
  // While true: show a loading state instead of empty-state hero (prevents flash for returning users)
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  // Whether the user has dismissed the "welcome back" returning-user card this session
  const [welcomeBackDismissed, setWelcomeBackDismissed] = useState(false);
  // Sync status: 'idle' | 'syncing' | 'synced' | 'error'
  const [syncStatus, setSyncStatus] = useState('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [signinEmailInput, setSigninEmailInput] = useState('');
  const [signinLinkSent, setSigninLinkSent] = useState(false);
  // After magic-link verifies, show a brief "You're signed in!" celebration
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState('');
  const [exporting, setExporting] = useState(false);
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
    if (filters.decision === 'shortlist-only' && dec !== 'shortlist') return false;
    if (filters.decision === 'hide-rejected' && dec === 'reject') return false;
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

  // Load saved applications + decisions from session storage on mount, plus magic-link detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect magic-link sign-in token in URL (for sign-in on a DIFFERENT device than where the email was requested)
    const params = new URLSearchParams(window.location.search);
    const signinTok = params.get('signin');
    // Pre-select realtor mode if user came from the realtors landing page
    const fromRealtors = params.get('from') === 'realtors';
    if (fromRealtors) {
      setRealtorProfile(prev => ({ ...prev, isRealtor: true }));
    }
    // Demo/sandbox mode for sales calls — pre-populate dashboard, bypass sign-in
    const demoParam = params.get('demo');
    if (demoParam === 'pmc') {
      setDemoMode(true);
      // Use setTimeout to ensure state initializes before loading demo
      setTimeout(() => loadPMCDemo(), 0);
      return; // Skip everything else in this effect
    }
    if (signinTok) {
      setWorkspaceLoading(true);

      (async () => {
        const safetyTimer = setTimeout(() => {
          console.error('[verify-link] Safety timeout');
          setError('Sign-in is taking longer than expected. Please refresh and try again.');
          setWorkspaceReady(true);
          setWorkspaceLoading(false);
        }, 15000);
        try {
          const r = await fetch('/api/landlord/auth/verify-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkToken: signinTok }),
          });
          const bodyText = await r.text();
          let json = null;
          try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {
            throw new Error(`Server returned ${r.status}. ${bodyText ? bodyText.slice(0, 100) : ''}`);
          }
          if (!r.ok) {
            throw new Error(json?.error || `Sign-in failed (HTTP ${r.status})`);
          }
          if (!json?.sessionToken || !json?.email) {
            throw new Error('Sign-in response missing token or email.');
          }
          setSessionToken(json.sessionToken);
          setSignedInEmail(json.email);
          localStorage.setItem('rentletter_landlord_session', json.sessionToken);
          localStorage.setItem('rentletter_landlord_email', json.email);
          window.history.replaceState({}, '', '/landlord');
          setJustSignedIn(true);
          setTimeout(() => setJustSignedIn(false), 5000);
          // Load the user's workspace from server. This device starts fresh — no merge.
          await loadWorkspace(json.sessionToken);
          console.log('[verify-link] Signed in as', json.email);
        } catch (e) {
          console.error('[verify-link] Magic link failed:', e?.message || e);
          setError(`Sign-in link failed: ${e?.message || 'unknown error'}. Please request a new one from your other device.`);
          setWorkspaceReady(true);
          setWorkspaceLoading(false);
        } finally {
          clearTimeout(safetyTimer);
        }
      })();
      return;
    }

    // Otherwise check for existing session
    const storedSession = localStorage.getItem('rentletter_landlord_session');
    const storedEmail = localStorage.getItem('rentletter_landlord_email');
    if (storedSession && storedEmail) {
      setSessionToken(storedSession);
      setSignedInEmail(storedEmail);
      setWorkspaceLoading(true);
      loadWorkspace(storedSession);
      // workspaceReady will be set to true at the end of loadWorkspace
    } else {
      // Fall back to session-only storage
      const saved = sessionStorage.getItem('landlord_apps');
      if (saved) {
        try { setApplications(JSON.parse(saved)); } catch (e) {}
      }
      const savedDecisions = sessionStorage.getItem('landlord_decisions');
      if (savedDecisions) {
        try { setDecisions(JSON.parse(savedDecisions)); } catch (e) {}
      }
      // No server load needed — mark ready immediately so future sign-in syncs properly
      setWorkspaceReady(true);
    }

    // Unit context (independent of sign-in)
    const savedUnit = sessionStorage.getItem('landlord_unit');
    if (savedUnit) {
      try { setUnit(JSON.parse(savedUnit)); } catch (e) {}
    }

    // Simple-mode preference (persists across visits — local to browser, not synced)
    const savedSimple = localStorage.getItem('landlord_simple_mode');
    if (savedSimple !== null) {
      setSimpleMode(savedSimple === 'true');
    }
  }, []);

  // Persist simple mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('landlord_simple_mode', String(simpleMode));
  }, [simpleMode]);

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

  // DIAGNOSTIC: Check what the server actually has saved for this user.
  // Surfaces the result in an alert so we can see if there's a save vs. load mismatch.
  const checkServerState = async () => {
    if (!sessionToken) {
      alert('You must be signed in first.');
      return;
    }
    try {
      const r = await fetch('/api/landlord/workspace', {
        method: 'GET',
        headers: { 'x-rl-session': sessionToken },
      });
      const bodyText = await r.text();
      let json = null;
      try { json = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}
      if (!r.ok) {
        alert(`Server fetch failed: HTTP ${r.status}\n${bodyText?.slice(0, 200) || ''}`);
        return;
      }
      const apps = Array.isArray(json?.applications) ? json.applications : [];
      const decs = json?.decisions && typeof json.decisions === 'object' ? json.decisions : {};
      const unitData = json?.unit;
      const shortlistedCount = apps.filter(a => decs[a.applicationNumber]?.status === 'shortlist').length;
      const updatedAt = json?.updatedAt ? new Date(json.updatedAt).toLocaleString() : 'never';
      const localShortlistCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'shortlist').length;
      alert(
        `SERVER STATE (signed in as ${signedInEmail}):\n\n` +
        `Applications on server: ${apps.length}\n` +
        `Shortlisted on server: ${shortlistedCount}\n` +
        `Decisions on server: ${Object.keys(decs).length}\n` +
        `Unit set on server: ${unitData ? 'yes' : 'no'}\n` +
        `Server last updated: ${updatedAt}\n\n` +
        `LOCAL STATE (this device):\n\n` +
        `Applications on this device: ${applications.length}\n` +
        `Shortlisted on this device: ${localShortlistCount}\n` +
        `Sync status: ${syncStatus}`
      );
    } catch (e) {
      alert(`Could not check server: ${e?.message || e}`);
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

  // Create a new empty listing and switch to it
  const createNewListing = (name) => {
    // Save current state to the current listing first
    const updatedListings = listings.map(l =>
      l.id === activeListingId
        ? { ...l, applications, decisions, unit }
        : l
    );
    const newListing = makeListing({ name: name || `Listing ${listings.length + 1}` });
    setListings([...updatedListings, newListing]);
    setActiveListingId(newListing.id);
    setApplications([]);
    setDecisions({});
    setUnit({ address: '', monthlyRent: '', bedrooms: '', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
    setReviewIdx(0);
    setView('review');
    setListingsSwitcherOpen(false);
    setWelcomeBackDismissed(true); // skip welcome for empty new listing
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
  const requestSigninLink = async () => {
    setSigninError('');
    const cleaned = String(signinEmailInput || '').trim();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setSigninError('Enter a valid email.');
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

  // Export shortlisted applicants as a PDF
  const exportShortlistPdf = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await fetch('/api/landlord/export-shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applications, decisions, realtorProfile }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Export failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rentletter-shortlist-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
    setExporting(false);
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

  // ─── DEV: Load demo applications for instant testing ─────────
  // ─── DEV: Neighborhood-specific demo scenarios ───────────────
  // Each scenario loads tenants matched to that property type.
  // Loading a new scenario clears any existing decisions to keep things clean.
  const loadDemoApplications = (scenario = 'mixed') => {
    let demos = [];

    if (scenario === 'student') {
      demos = STUDENT_HOUSING_DEMOS;
    } else if (scenario === 'luxury') {
      demos = LUXURY_RENTAL_DEMOS;
    } else if (scenario === 'family') {
      demos = FAMILY_HOME_DEMOS;
    } else if (scenario === 'creative') {
      demos = CREATIVE_SCENE_DEMOS;
    } else {
      demos = MIXED_DEMOS;
    }

    setApplications(demos);
    setActiveAppIdx(0);
    // Loading a new scenario = fresh start. Clear any leftover decisions/review progress.
    setDecisions({});
    setReviewIdx(0);
    setReviewExpanded(false);
    setView(simpleMode ? 'review' : 'detail');
  };

  // ─── PMC SANDBOX LOADER ───
  // Populates a realistic property-management-company workspace:
  // 3 listings (student, luxury, family), each pre-populated with applicants and decisions.
  // Triggered by ?demo=pmc in the URL. Used for sales demos to PMCs/operators.
  const loadPMCDemo = () => {
    // Build decisions for each demo set — varied accept/reject/shortlist patterns to look real
    const buildDecisions = (apps, pattern) => {
      const result = {};
      apps.forEach((a, idx) => {
        const action = pattern[idx % pattern.length];
        if (action === 'shortlist') {
          result[a.applicationNumber] = {
            status: 'shortlist',
            priority: idx === 0 || idx === 2 ? 'top' : 'normal',
            notes: idx === 0 ? 'Strong income, references checked, available for early move-in.' : '',
            statusChangedAt: new Date(Date.now() - (Math.random() * 86400000 * 3)).toISOString(),
            reasonCode: 'fit',
          };
        } else if (action === 'reject') {
          result[a.applicationNumber] = {
            status: 'reject',
            priority: null,
            notes: '',
            statusChangedAt: new Date(Date.now() - (Math.random() * 86400000 * 5)).toISOString(),
            reasonCode: 'income_insufficient',
          };
        }
        // 'none' = no decision yet, leave undefined
      });
      return result;
    };

    // 3 listings, each pre-built
    const studentListing = {
      id: 'L_demo_student',
      name: '124 Spadina Ave (Student Housing)',
      applications: STUDENT_HOUSING_DEMOS,
      decisions: buildDecisions(STUDENT_HOUSING_DEMOS, ['shortlist', 'reject', 'shortlist', 'none', 'reject', 'shortlist', 'none', 'reject']),
      unit: { address: '124 Spadina Ave, Unit 802', monthlyRent: '1850', bedrooms: '1', allowsPets: 'no', allowsSmoking: 'no', parkingIncluded: 'no' },
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    };

    const luxuryListing = {
      id: 'L_demo_luxury',
      name: '88 Bloor East (Luxury Condo)',
      applications: LUXURY_RENTAL_DEMOS,
      decisions: buildDecisions(LUXURY_RENTAL_DEMOS, ['shortlist', 'shortlist', 'none', 'reject', 'shortlist', 'none', 'reject', 'none']),
      unit: { address: '88 Bloor East, Unit 2401', monthlyRent: '4200', bedrooms: '2', allowsPets: 'yes', allowsSmoking: 'no', parkingIncluded: 'yes' },
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    };

    const familyListing = {
      id: 'L_demo_family',
      name: '42 Maple Crescent (Family Home)',
      applications: FAMILY_HOME_DEMOS,
      decisions: buildDecisions(FAMILY_HOME_DEMOS, ['shortlist', 'reject', 'none', 'shortlist', 'none', 'reject', 'shortlist', 'reject']),
      unit: { address: '42 Maple Crescent, North York', monthlyRent: '3650', bedrooms: '3', allowsPets: 'yes', allowsSmoking: 'no', parkingIncluded: 'yes' },
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    };

    const demoListings = [studentListing, luxuryListing, familyListing];

    // Set realtor/PM profile so all branding features show
    setRealtorProfile({
      isRealtor: true,
      fullName: 'Demo Property Manager',
      brokerage: 'Sample Property Management Co.',
      phone: '(416) 555-0123',
      licenseNumber: '',
    });
    setRealtorOnboardingShown(true);

    // Hydrate the listings + active one
    setListings(demoListings);
    setActiveListingId(studentListing.id);
    setApplications(studentListing.applications);
    setDecisions(studentListing.decisions);
    setUnit(studentListing.unit);

    // Skip empty-state stuff
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
        <title>Landlord Dashboard — Rentletter</title>
        <meta name="description" content="Verify, compare, and rank tenant applications. Free for landlords and realtors." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>

        {/* ── DEMO MODE BANNER — shown when ?demo=pmc is in the URL ── */}
        {demoMode && (
          <div style={{
            background: C.ink, color: C.paper,
            padding: '10px 32px', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.06em', textAlign: 'center',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px',
                background: C.red, color: C.paper, fontSize: 9, fontWeight: 800,
                letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>
                Sandbox
              </span>
              <span style={{ opacity: 0.85 }}>Live demo with sample data. Nothing is saved.</span>
            </div>
            <a href="/landlord" style={{ color: C.paper, opacity: 0.85, textDecoration: 'underline', fontSize: 12 }}>
              Exit demo →
            </a>
          </div>
        )}

        {/* ── TOP STRIP ─────────────────────────────────────── */}
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
                  <button onClick={checkServerState} className="rl-btn" title="Diagnostic: check what's actually saved on the server"
                    style={{ background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: R.ctrl, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="search" size={13} color={C.inkSoft} /> Check
                  </button>
                  <button onClick={signOut}
                    style={{ background: 'transparent', color: C.inkMute, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    Sign out
                  </button>
                </>
              ) : (
                <button onClick={() => { setSigninLinkSent(false); setSigninEmailInput(''); setSigninError(''); setSigninModalOpen(true); }}
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
                  {signinError && (
                    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink, textAlign: 'left' }}>
                      {signinError}
                    </div>
                  )}
                  <button
                    onClick={requestSigninLink}
                    disabled={signinLoading || !signinEmailInput}
                    style={{
                      width: '100%',
                      background: (signinLoading || !signinEmailInput) ? '#c8c2b3' : C.red,
                      color: C.paper, border: 'none', padding: '18px',
                      fontSize: 16, fontWeight: 700,
                      cursor: (signinLoading || !signinEmailInput) ? 'not-allowed' : 'pointer',
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

          {/* All dashboard content below only renders when signed in OR loading */}
          {(sessionToken || workspaceLoading) && (
          <>

          {/* ── JUST-SIGNED-IN CELEBRATION ──────────────── */}
          {justSignedIn && (
            <section style={{ padding: 'clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px) 0' }}>
              <div style={{
                background: C.green,
                color: C.paper,
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
              <section style={{ marginBottom: 32 }}>
                <div style={{
                  background: C.ink, color: C.paper,
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
                    <div style={{ padding: '14px 12px', background: '#1a1a1c', borderLeft: `3px solid ${C.green}` }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: C.green, lineHeight: 1 }}>{shortlistedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 4, letterSpacing: '0.04em' }}>SHORTLISTED</div>
                    </div>
                    <div style={{ padding: '14px 12px', background: '#1a1a1c', borderLeft: `3px solid ${C.inkMute}` }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: C.paper, lineHeight: 1 }}>{undecidedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 4, letterSpacing: '0.04em' }}>TO REVIEW</div>
                    </div>
                    <div style={{ padding: '14px 12px', background: '#1a1a1c', borderLeft: `3px solid ${C.red}` }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#f0b8bb', lineHeight: 1 }}>{rejectedCount}</div>
                      <div style={{ fontSize: 11, color: '#c8c2b3', marginTop: 4, letterSpacing: '0.04em' }}>REJECTED</div>
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
                        style={{
                          background: C.red, color: C.paper, border: 'none',
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
                        onClick={() => { setView('compare'); setWelcomeBackDismissed(true); }}
                        style={{
                          background: C.green, color: C.paper, border: 'none',
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
                      style={{
                        background: 'transparent', color: C.paper,
                        border: `1px solid ${C.paper}`,
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

          {/* ── INTRO HERO — red full-bleed magazine cover when empty ── */}
          {!workspaceLoading && applications.length === 0 && (
            <section style={{ background: C.red, color: C.paper, position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
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
                      onClick={() => { setSigninLinkSent(false); setSigninEmailInput(''); setSigninError(''); setSigninModalOpen(true); }}
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

          {/* ── How it works (only when no apps loaded) ── */}
          {!workspaceLoading && applications.length === 0 && (
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
          <div style={{ padding: applications.length === 0 ? '0 32px 80px' : '40px 32px 80px' }}>

          {/* ── HUMAN RIGHTS / COMPLIANCE — collapsed, unobtrusive ── */}
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

          {/* ── UNSIGNED WORK-AT-RISK BANNER ──────────────────── */}
          {/* Only shows when: user has done some work, is NOT signed in, hasn't dismissed */}
          {applications.length > 0 && !sessionToken && !unsignedBannerDismissed && (
            <section style={{ marginBottom: 20 }}>
              <div style={{
                background: '#fef7e6',
                border: `1px solid #f0c95a`,
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
                    onClick={() => { setSigninLinkSent(false); setSigninEmailInput(''); setSigninError(''); setSigninModalOpen(true); }}
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
              <div style={{
                background: C.paper,
                border: `1px solid ${C.rule}`,
                position: 'relative',
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
                    <span style={{
                      fontSize: 14, color: C.inkSoft, fontWeight: 600,
                      transform: listingsSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>
                      ▾
                    </span>
                  </button>
                  <button
                    onClick={() => createNewListing()}
                    title="Add new listing"
                    style={{
                      background: C.red, color: C.paper, border: 'none',
                      padding: '14px 20px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                    }}>
                    + New listing
                  </button>
                </div>

                {/* Dropdown of all listings */}
                {listingsSwitcherOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: C.paper,
                    border: `1px solid ${C.rule}`, borderTop: 'none',
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
                      onClick={createOrGetInviteLink}
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

            {/* Sample data loader — single button, single realistic Toronto scenario */}
            {applications.length === 0 && (
              <div style={{ marginTop: 14 }}>
                <button onClick={() => loadDemoApplications('mixed')}
                  style={{
                    background: 'transparent', color: C.inkSoft,
                    border: `1px solid ${C.rule}`,
                    padding: '12px 18px', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = C.ink; e.currentTarget.style.color = C.ink; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = C.rule; e.currentTarget.style.color = C.inkSoft; }}>
                  Load sample data to explore
                </button>
              </div>
            )}
            {error && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
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
                  style={{
                    background: filtersOpen ? C.ink : 'transparent',
                    color: filtersOpen ? C.paper : C.ink,
                    border: `1px solid ${C.ink}`,
                    padding: '10px 18px', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span style={{
                      background: C.red, color: C.paper,
                      padding: '2px 8px', fontSize: 11, fontWeight: 700,
                      borderRadius: 10, minWidth: 22, textAlign: 'center',
                    }}>
                      {activeFilterCount}
                    </span>
                  )}
                  <span style={{ fontSize: 10 }}>{filtersOpen ? '▲' : '▼'}</span>
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
                <div style={{
                  background: '#fafaf5', border: `1px solid ${C.rule}`,
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
                    <FilterRadio name="decision" value="shortlist-only" current={filters.decision}
                      onChange={() => setFilters({ ...filters, decision: 'shortlist-only' })}>Shortlisted only</FilterRadio>
                    <FilterRadio name="decision" value="hide-rejected" current={filters.decision}
                      onChange={() => setFilters({ ...filters, decision: 'hide-rejected' })}>Hide rejected</FilterRadio>
                  </FilterGroup>
                </div>
              )}
            </section>
          )}

          {/* ── VIEW SWITCHER ────────────────────────────────── */}
          {applications.length > 0 && (
            <section style={{ marginBottom: 32, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>

              {/* SIMPLE / DETAILED MODE TOGGLE */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 20, flexWrap: 'wrap', gap: 12,
              }}>
                <div style={{ fontSize: 12, color: C.inkMute, letterSpacing: '0.04em' }}>
                  {applications.length} applicant{applications.length === 1 ? '' : 's'} loaded
                </div>
                <button
                  onClick={() => {
                    setSimpleMode(!simpleMode);
                    // Switch view to a sensible default for the mode
                    setView(!simpleMode ? 'review' : 'detail');
                  }}
                  className="rl-btn"
                  style={{
                    background: C.card, border: `1px solid ${C.ruleDark}`, borderRadius: R.pill,
                    color: C.inkSoft, padding: '8px 16px', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer',
                  }}>
                  {simpleMode ? 'Switch to detailed view →' : 'Switch to simple view →'}
                </button>
              </div>

              {/* TABS — simplified to Review + My picks only */}
              <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 32, overflowX: 'auto' }}>
                {[
                  { id: 'review', label: 'All applicants', enabled: true },
                  { id: 'ranked', label: 'My shortlist', enabled: filteredApplications.length >= 1 },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => tab.enabled && setView(tab.id)}
                    disabled={!tab.enabled}
                    style={{
                      background: 'transparent', border: 'none',
                      padding: '16px 24px', fontSize: 16,
                      fontWeight: view === tab.id ? 700 : 500,
                      color: view === tab.id ? C.ink : (tab.enabled ? C.inkSoft : C.inkMute),
                      borderBottom: view === tab.id ? `3px solid ${C.red}` : '3px solid transparent',
                      cursor: tab.enabled ? 'pointer' : 'not-allowed',
                      opacity: tab.enabled ? 1 : 0.4,
                      marginBottom: -1,
                      whiteSpace: 'nowrap',
                      minHeight: 48,
                    }}
                  >
                    {tab.label}
                    {!simpleMode && tab.id !== 'detail' && !tab.enabled && (
                      <span style={{ fontSize: 11, color: C.inkMute, marginLeft: 8 }}>
                        (need 2+)
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── REVIEW VIEW (simple mode default) ──────── */}
              {view === 'review' && simpleMode && (
                <ReviewView
                  applications={applications}
                  reviewIdx={reviewIdx}
                  setReviewIdx={setReviewIdx}
                  expanded={reviewExpanded}
                  setExpanded={setReviewExpanded}
                  getDecision={getDecision}
                  setDecisionStatus={setDecisionStatus}
                  decisions={decisions}
                  unit={unit}
                  onJumpToDetail={(idx) => { setActiveAppIdx(idx); setSimpleMode(false); setView('detail'); }}
                  onJumpToFavourites={() => { setView('compare'); }}
                  onExportPdf={exportShortlistPdf}
                  exporting={exporting}
                />
              )}

              {/* ── DETAIL VIEW (detailed mode) ─────────────── */}
              {view === 'detail' && !simpleMode && (
                <DetailView
                  applications={applications}
                  activeIdx={activeAppIdx}
                  setActiveIdx={setActiveAppIdx}
                  onRemove={removeApplication}
                  getDecision={getDecision}
                  setDecisionStatus={setDecisionStatus}
                  setDecisionNotes={setDecisionNotes}
                  setDecisionReason={setDecisionReason}
                  setMethodologyOpen={setMethodologyOpen}
                  unit={unit}
                  rationaleLoading={rationaleLoading}
                  setRationaleLoading={setRationaleLoading}
                  rationaleError={rationaleError}
                  setRationaleError={setRationaleError}
                />
              )}

              {/* ── COMPARE VIEW ────────────────────────────── */}
              {view === 'compare' && (() => {
                // Auto-filter Compare to shortlisted-only if any shortlisted exist
                const shortlistedApps = filteredApplications.filter(
                  a => decisions[a.applicationNumber]?.status === 'shortlist'
                );
                const hasShortlist = shortlistedApps.length > 0;
                const compareList = hasShortlist ? shortlistedApps : filteredApplications;

                if (compareList.length < 2) {
                  return (
                    <div style={{ padding: 40, textAlign: 'center', color: C.inkSoft, border: `1px dashed ${C.ruleDark}`, borderRadius: R.card, background: C.paperDeep }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
                        {hasShortlist ? 'Shortlist 2 or more applicants to compare them.' : 'Add 2 or more applications to compare.'}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMute }}>
                        {hasShortlist
                          ? `You currently have ${shortlistedApps.length} shortlisted applicant${shortlistedApps.length === 1 ? '' : 's'}.`
                          : 'Look up application numbers above, then shortlist your top candidates.'}
                      </div>
                    </div>
                  );
                }

                return (
                  <>
                    {hasShortlist && (
                      <div style={{
                        marginBottom: 16,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexWrap: 'wrap', gap: 12,
                      }}>
                        <div style={{
                          flex: 1, minWidth: 220,
                          padding: '10px 14px',
                          background: '#f0f7f3', borderLeft: `3px solid ${C.green}`,
                          fontSize: 13, color: C.inkSoft,
                        }}>
                          <span style={{ color: C.green, fontWeight: 700 }}>✓ Your {shortlistedApps.length} favourite{shortlistedApps.length === 1 ? '' : 's'}.</span>
                          {' '}
                          <span style={{ color: C.inkMute }}>Remove favourite to take them out of this view.</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                          {sessionToken && realtorProfile.isRealtor && (
                            <button
                              onClick={() => { setSendToLandlordEmail(''); setSendToLandlordNote(''); setSendToLandlordSent(false); setSendToLandlordOpen(true); }}
                              style={{
                                background: C.red, color: C.paper, border: 'none',
                                padding: '12px 18px', fontSize: 14, fontWeight: 700,
                                cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                              }}>
                              ✉ Send to landlord client →
                            </button>
                          )}
                          {sessionToken && (
                            <button onClick={emailSummary}
                              disabled={emailingSummary}
                              style={{
                                background: emailSummarySent ? C.green : C.ink, color: C.paper, border: 'none',
                                padding: '12px 18px', fontSize: 14, fontWeight: 700,
                                cursor: emailingSummary ? 'wait' : 'pointer',
                                opacity: emailingSummary ? 0.6 : 1,
                                minHeight: 44,
                                whiteSpace: 'nowrap',
                              }}>
                              {emailingSummary ? 'Sending...' : emailSummarySent ? '✓ Sent to your inbox' : '✉ Email me a copy'}
                            </button>
                          )}
                          <button onClick={exportShortlistPdf}
                            disabled={exporting}
                            style={{
                              background: C.red, color: C.paper, border: 'none',
                              padding: '12px 20px', fontSize: 14, fontWeight: 700,
                              cursor: exporting ? 'wait' : 'pointer',
                              opacity: exporting ? 0.6 : 1,
                              minHeight: 44,
                              whiteSpace: 'nowrap',
                            }}>
                            {exporting ? 'Building PDF...' : '⬇ Save as PDF'}
                          </button>
                        </div>
                      </div>
                    )}
                    <CompareView
                      applications={compareList}
                      onRemove={removeApplication}
                      getDecision={getDecision}
                      setDecisionStatus={setDecisionStatus}
                    />
                  </>
                );
              })()}

              {/* ── RANKED VIEW (detailed) or SIMPLE LIST (simple) ── */}
              {view === 'ranked' && simpleMode && (
                <AllApplicantsList
                  applications={filteredApplications}
                  decisions={decisions}
                  unit={unit}
                  setDecisionStatus={setDecisionStatus}
                  onJumpToReview={(idx) => { setReviewIdx(idx); setView('review'); }}
                />
              )}
              {view === 'ranked' && !simpleMode && filteredApplications.length >= 2 && (
                <RankedView
                  applications={filteredApplications}
                  weights={weights}
                  setWeights={setWeights}
                  onRemove={removeApplication}
                />
              )}
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
              onClick={() => setPreferencesOpen(false)}
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
                    Listing setup
                  </div>
                  <h3 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 0, lineHeight: 1.2 }}>
                    Unit basics and landlord preferences
                  </h3>
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
                <div style={{ margin: '16px clamp(20px, 4vw, 28px)', padding: '12px 14px', background: C.info, borderLeft: `4px solid ${C.infoBorder}`, fontSize: 12, color: C.infoInk, lineHeight: 1.55 }}>
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
                <div style={{ padding: 'clamp(16px, 3vw, 22px) clamp(20px, 4vw, 28px)', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setPreferencesOpen(false)}
                    style={{
                      background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`,
                      padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Cancel
                  </button>
                  <button
                    onClick={() => setPreferencesOpen(false)}
                    style={{
                      background: C.red, color: C.paper, border: 'none',
                      padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                    Save
                  </button>
                </div>
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
                      <div style={{ background: '#fafaf5', border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
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

                    <div style={{ background: C.paperDeep, padding: 14, marginBottom: 16, fontSize: 12, color: C.inkSoft, lineHeight: 1.6 }}>
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
        {signinModalOpen && (
          <div
            onClick={() => setSigninModalOpen(false)}
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
                background: C.paper, maxWidth: 480, width: '100%',
              }}>
              <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Sign in
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>
                    Save your work on this device.
                  </h3>
                  <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>
                    Enter your email. We'll sign you in instantly on this device and email you a link so you can also sign in on your phone or other devices later.
                  </p>
                </div>
                <button onClick={() => setSigninModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '24px 32px' }}>
                <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Your email
                </label>
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={signinEmailInput}
                  onChange={e => setSigninEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && requestSigninLink()}
                  placeholder="you@example.com"
                  autoFocus
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: 15,
                    border: `1px solid ${C.ink}`, background: C.paper, color: C.ink,
                    outline: 'none', marginBottom: 14,
                  }}
                />
                {signinError && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
                    {signinError}
                  </div>
                )}
                <button
                  onClick={requestSigninLink}
                  disabled={signinLoading || !signinEmailInput}
                  style={{
                    width: '100%',
                    background: (signinLoading || !signinEmailInput) ? '#c8c2b3' : C.red,
                    color: C.paper, border: 'none', padding: '16px',
                    fontSize: 15, fontWeight: 700,
                    cursor: (signinLoading || !signinEmailInput) ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.01em',
                  }}>
                  {signinLoading ? 'Signing you in...' : 'Sign in →'}
                </button>
                <p style={{ fontSize: 11, color: C.inkMute, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
                  No password needed. You'll be signed in instantly.
                </p>
              </div>
            </div>
          </div>
        )}

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
function AllApplicantsList({ applications, decisions, unit, setDecisionStatus, onJumpToReview }) {
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

          const statusBorderColor = dec.status === 'shortlist' ? C.green : dec.status === 'reject' ? C.red : C.rule;
          const statusBg = dec.status === 'shortlist' ? '#f0f7f3' : dec.status === 'reject' ? '#fef2f0' : C.paper;

          return (
            <div key={app.applicationNumber} style={{
              background: statusBg,
              border: `1px solid ${C.rule}`,
              borderLeft: `4px solid ${statusBorderColor}`,
              padding: 'clamp(14px, 3vw, 18px)',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 14,
              alignItems: 'center',
              minWidth: 0,
            }}>
              <div
                onClick={() => onJumpToReview(idx)}
                style={{ cursor: 'pointer', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <div style={{ fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>
                    {app.tenant?.fullName}
                  </div>
                  {dec.status === 'shortlist' && (
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
function ReviewView({ applications, reviewIdx, setReviewIdx, expanded, setExpanded, getDecision, setDecisionStatus, decisions, unit, onJumpToDetail, onJumpToFavourites, onExportPdf, exporting }) {
  const total = applications.length;

  // Count decisions
  const shortlistedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'shortlist').length;
  const rejectedCount = applications.filter(a => decisions[a.applicationNumber]?.status === 'reject').length;
  const undecidedCount = total - shortlistedCount - rejectedCount;

  // ─── END OF STACK SUMMARY ─────────────────────────────
  if (reviewIdx >= total) {
    return (
      <div style={{ background: C.paper, border: `1px solid ${C.rule}`, padding: 'clamp(32px, 6vw, 60px) clamp(20px, 4vw, 40px)', textAlign: 'center' }}>
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
          <div style={{ padding: '18px 14px', background: '#f0f7f3', borderLeft: `4px solid ${C.green}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.green }}>{shortlistedCount}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Shortlisted</div>
          </div>
          <div style={{ padding: '18px 14px', background: '#fafaf5', borderLeft: `4px solid ${C.inkMute}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.inkMute }}>{undecidedCount}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginTop: 2 }}>Skipped</div>
          </div>
          <div style={{ padding: '18px 14px', background: '#fef2f0', borderLeft: `4px solid ${C.red}` }}>
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
            <>
              <button onClick={() => onJumpToFavourites()}
                style={{
                  background: C.green, color: C.paper, border: 'none',
                  padding: '14px 24px', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', minHeight: 48,
                }}>
                See your favourites →
              </button>
              <button onClick={onExportPdf}
                disabled={exporting}
                style={{
                  background: C.red, color: C.paper, border: 'none',
                  padding: '14px 24px', fontSize: 15, fontWeight: 700,
                  cursor: exporting ? 'wait' : 'pointer',
                  opacity: exporting ? 0.6 : 1,
                  minHeight: 48,
                }}>
                {exporting ? 'Building PDF...' : '⬇ Save favourites as PDF'}
              </button>
            </>
          )}
        </div>
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
        <div style={{ height: 4, background: C.rule, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${((reviewIdx + 1) / total) * 100}%`,
            background: C.red,
            transition: 'width 0.2s',
          }} />
        </div>
      </div>

      {/* THE CARD */}
      <div style={{
        background: C.paper, border: `1px solid ${C.rule}`,
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
          padding: '14px 18px', background: '#fafaf5',
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
            padding: '10px 16px', marginBottom: 20,
            background: fitSummary.color, color: C.paper,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
          }}>
            {fitSummary.label === 'Strong fit for your unit' && '✓ '}
            {fitSummary.label === 'Fits with caveats' && '! '}
            {fitSummary.label === 'Does not fit' && '✗ '}
            {fitSummary.label}
          </div>
        )}

        {/* Quick contact row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {app.tenant?.phone && (
            <a href={`tel:${app.tenant.phone.replace(/\D/g, '')}`}
              style={{
                background: C.ink, color: C.paper, textDecoration: 'none',
                padding: '12px 18px', fontSize: 15, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                minHeight: 44,
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
                display: 'inline-flex', alignItems: 'center', gap: 8,
                minHeight: 44,
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
                        padding: '10px 12px', background: '#fafaf5', borderLeft: `3px solid ${color}`,
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
                    background: '#fafaf5',
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
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 12, color: C.ink }}>
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
              The Landlord Scorecard
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

            <div style={{ marginTop: 24, padding: 20, background: C.ink, color: C.paper }}>
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
function CompareView({ applications, onRemove, getDecision, setDecisionStatus }) {
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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + applications.length * 200 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: 200 }}></th>
            {applications.map(app => {
              const dec = getDecision ? getDecision(app.applicationNumber) : { status: 'none' };
              const isShortlisted = dec.status === 'shortlist';
              return (
                <th key={app.applicationNumber} style={thStyle}>
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
          marginTop: 14, fontSize: 13, color: C.inkSoft,
          fontStyle: 'italic', lineHeight: 1.5,
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
        <div style={{ background: C.paper, border: `2px solid ${C.ink}`, position: 'sticky', top: 20 }}>
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
              border: 'none', borderTop: `1px solid ${C.rule}`,
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
                      padding: '4px 10px',
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
                              textTransform: 'uppercase',
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
            <div style={{ marginTop: 32, background: C.paper, border: `2px solid ${C.ink}` }}>
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
