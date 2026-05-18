import { useState, useEffect } from 'react';
import Head from 'next/head';

// ─── DESIGN TOKENS (matching main site) ──────────────────────
const C = {
  paper: '#faf8f3',
  paperDeep: '#f2eee3',
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',
  redDark: '#a8161c',
  green: '#2d7d4a',
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
      longTermIntent: { score: 5, note: 'Settling — likely 3+ year tenancy' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      longTermIntent: { score: 5, note: 'Settled career, long-term tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      longTermIntent: { score: 5, note: 'Career-stable, kids in private school' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      longTermIntent: { score: 5, note: 'Career trajectory tied to Toronto HQ' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      rentalHistory: { score: 5, note: '6 years with current property manager' },
      longTermIntent: { score: 5, note: 'Empty-nesters, long-term tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      longTermIntent: { score: 5, note: 'New babies, 3+ year tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      incomeStability: { score: 5, note: '7 years at TDSB + spouse freelance' },
      rentAffordability: { score: 5, note: '22% of combined income' },
      rentalHistory: { score: 5, note: '3 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'New baby — looking for 3+ year tenancy' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      longTermIntent: { score: 5, note: 'School-aged kids, multi-year tenancy' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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
      rentAffordability: { score: 5, note: '22% of $323K combined income' },
      rentalHistory: { score: 5, note: '6 years with current landlord reference' },
      longTermIntent: { score: 5, note: 'Growing family, multi-year tenancy expected' },
      disclosures: { score: 5, note: 'No items to address' },
      overall: 5.0,
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

const MIXED_DEMOS = STUDENT_HOUSING_DEMOS.slice(0, 3).concat(LUXURY_RENTAL_DEMOS.slice(0, 2)).concat(FAMILY_HOME_DEMOS.slice(0, 3)).concat(CREATIVE_SCENE_DEMOS.slice(0, 2));


const GlobalStyle = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${C.paper}; color: ${C.ink};
      font-family: 'Inter', -apple-system, sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    button, input, textarea, select { font-family: 'Inter', sans-serif; }
    button { cursor: pointer; }
    input:focus { outline: none; }
    ::selection { background: ${C.red}; color: ${C.paper}; }
  `}</style>
);

const Wordmark = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
    <div style={{ width: 3, height: 20, background: C.red }} />
    <span style={{ fontSize: 17, color: C.ink, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
      Rentletter
    </span>
  </div>
);

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
  const [view, setView] = useState('detail'); // 'detail' | 'compare' | 'ranked'
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [activeAppIdx, setActiveAppIdx] = useState(0);

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
  const [signinEmailInput, setSigninEmailInput] = useState('');
  const [signinLinkSent, setSigninLinkSent] = useState(false);
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState('');
  const [exporting, setExporting] = useState(false);

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
      [appNum]: { ...(prev[appNum] || { notes: '' }), status },
    }));
  };
  const setDecisionNotes = (appNum, notes) => {
    setDecisions(prev => ({
      ...prev,
      [appNum]: { ...(prev[appNum] || { status: 'none' }), notes },
    }));
  };
  const getDecision = (appNum) => decisions[appNum] || { status: 'none', notes: '' };

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

    // Detect magic-link sign-in token in URL
    const params = new URLSearchParams(window.location.search);
    const signinTok = params.get('signin');
    if (signinTok) {
      // Verify and start a session
      (async () => {
        try {
          const r = await fetch('/api/landlord/auth/verify-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkToken: signinTok }),
          });
          const json = await r.json();
          if (json.error) throw new Error(json.error);
          setSessionToken(json.sessionToken);
          setSignedInEmail(json.email);
          localStorage.setItem('rentletter_landlord_session', json.sessionToken);
          localStorage.setItem('rentletter_landlord_email', json.email);
          window.history.replaceState({}, '', '/landlord');
          // Load workspace from server
          await loadWorkspace(json.sessionToken);
        } catch (e) {
          console.error('Magic link failed:', e);
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
      loadWorkspace(storedSession);
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
    }
  }, []);

  // Save to session storage as a backup (works signed-out too)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_apps', JSON.stringify(applications));
  }, [applications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_decisions', JSON.stringify(decisions));
  }, [decisions]);

  // When signed in, also sync to server (debounced)
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionToken) return;
    const t = setTimeout(() => {
      fetch('/api/landlord/workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rl-session': sessionToken,
        },
        body: JSON.stringify({ applications, decisions }),
      }).catch(err => console.error('Workspace sync failed:', err));
    }, 800);
    return () => clearTimeout(t);
  }, [applications, decisions, sessionToken]);

  // Load workspace from server when signed in
  const loadWorkspace = async (token) => {
    try {
      const r = await fetch('/api/landlord/workspace', {
        method: 'GET',
        headers: { 'x-rl-session': token },
      });
      if (!r.ok) {
        if (r.status === 401) {
          localStorage.removeItem('rentletter_landlord_session');
          localStorage.removeItem('rentletter_landlord_email');
          setSessionToken('');
          setSignedInEmail('');
        }
        return;
      }
      const json = await r.json();
      if (json.applications && Array.isArray(json.applications)) {
        setApplications(json.applications);
      }
      if (json.decisions && typeof json.decisions === 'object') {
        setDecisions(json.decisions);
      }
    } catch (e) {
      console.error('Load workspace error:', e);
    }
  };

  // Send a magic-link sign-in email
  const requestSigninLink = async () => {
    setSigninError('');
    const cleaned = String(signinEmailInput || '').trim();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setSigninError('Enter a valid email.');
      return;
    }
    setSigninLoading(true);
    try {
      const r = await fetch('/api/landlord/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleaned }),
      });
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setSigninLinkSent(true);
    } catch (e) {
      setSigninError(e.message || 'Could not send sign-in link.');
    }
    setSigninLoading(false);
  };

  const signOut = () => {
    localStorage.removeItem('rentletter_landlord_session');
    localStorage.removeItem('rentletter_landlord_email');
    setSessionToken('');
    setSignedInEmail('');
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
    if (!confirm('Clear all loaded applications?')) return;
    setApplications([]);
    setActiveAppIdx(0);
  };

  // Export shortlisted applicants as a PDF
  const exportShortlistPdf = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await fetch('/api/landlord/export-shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applications, decisions }),
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

  // ─── DEV: Load demo applications for instant testing ─────────
  // ─── DEV: Neighborhood-specific demo scenarios ───────────────
  // Each scenario loads 8-10 tenants matched to that property type.
  // Designed for landlord walkthroughs — "what your applicants would actually look like."

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

      <div style={{ minHeight: '100vh', background: C.paper }}>

        {/* ── RED COMMAND BAR at top ────────────────────────── */}
        <div style={{
          background: C.red, color: C.paper,
          padding: '8px 32px', fontSize: 11,
          fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: C.paper, animation: 'pulseRed 2s ease-in-out infinite',
            }} />
            Landlord Dashboard · Live
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ opacity: 0.85 }}>Free for landlords + realtors</span>
            <a href="/" style={{ color: C.paper, textDecoration: 'none', opacity: 0.85 }}>
              ← Back to Rentletter
            </a>
          </div>
          <style jsx>{`
            @keyframes pulseRed {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.85); }
            }
          `}</style>
        </div>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <header style={{ borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href="/" style={{ textDecoration: 'none' }}>
              <Wordmark />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: C.inkMute }}>
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                {applications.length > 0
                  ? `${applications.length} application${applications.length === 1 ? '' : 's'} loaded`
                  : 'Ready to verify'}
              </span>
              {signedInEmail ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.green, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                    Signed in · {signedInEmail}
                  </span>
                  <button onClick={signOut}
                    style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                    Sign out
                  </button>
                </div>
              ) : (
                <button onClick={() => { setSigninLinkSent(false); setSigninEmailInput(''); setSigninError(''); setSigninModalOpen(true); }}
                  style={{
                    background: C.ink, color: C.paper, border: 'none',
                    padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                  Sign in (save across devices)
                </button>
              )}
            </div>
          </div>
        </header>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: applications.length === 0 ? '0' : '40px 32px 80px' }}>

          {/* ── INTRO HERO — red full-bleed magazine cover when empty ── */}
          {applications.length === 0 && (
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

                <p style={{ fontSize: 19, lineHeight: 1.5, color: C.paper, opacity: 0.9, maxWidth: 620, marginBottom: 40 }}>
                  Paste any Rentletter application number to verify the tenant, see their full profile, and compare them side-by-side with other applicants. <strong style={{ color: C.paper, opacity: 1 }}>Free</strong> for landlords and realtors. No account required.
                </p>

                {/* Inline "free" tags */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {['No login', 'No credit card', 'Unlimited applications', 'Session-private'].map(tag => (
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
          {applications.length === 0 && (
            <section style={{ padding: '64px 32px 48px', maxWidth: 1100, margin: '0 auto' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 32,
              }}>
                {[
                  { n: '01', t: 'Paste application numbers', d: 'Tenants share their number (RL-2026-XXXX-XXXX) with you.' },
                  { n: '02', t: 'See the full picture', d: 'Income, history, references, lifestyle, and our honest Scorecard.' },
                  { n: '03', t: 'Compare and rank', d: 'Side-by-side comparison. Weight what matters most to you.' },
                  { n: '04', t: 'Make the call', d: 'Defensible decision in minutes. Reach out to your top pick.' },
                ].map(s => (
                  <div key={s.n}>
                    <div style={{ fontSize: 12, color: C.red, marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em' }}>{s.n}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{s.t}</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.5, color: C.inkSoft }}>{s.d}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Outer padded container for input + below */}
          <div style={{ padding: applications.length === 0 ? '0 32px 80px' : '40px 32px 80px' }}>

          {/* ── HUMAN RIGHTS / COMPLIANCE BANNER ────────────────── */}
          <section style={{ marginBottom: 24 }}>
            <div style={{
              background: '#fafaf5', border: `1px solid ${C.rule}`,
              padding: '16px 20px',
              display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{
                background: C.ink, color: C.paper,
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
              }}>
                Compliance reminder
              </div>
              <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, flex: 1, minWidth: 280 }}>
                Under the Ontario Human Rights Code, landlords cannot screen on race, ancestry, place of origin, citizenship, ethnic origin, creed, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance. Rentletter helps you focus on financial fit, history, and stated intent — never on protected grounds.
                {' '}
                <a href="https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing" target="_blank" rel="noopener noreferrer" style={{ color: C.red, textDecoration: 'underline', fontWeight: 600 }}>
                  OHRC policy →
                </a>
              </div>
            </div>
          </section>

          {/* ── INPUT BAR ────────────────────────────────────── */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Add application number
              </label>
              <button
                onClick={() => setRequestModalOpen(true)}
                style={{
                  background: 'transparent', color: C.red,
                  border: 'none', padding: 0,
                  fontSize: 12, fontWeight: 600,
                  textDecoration: 'underline', cursor: 'pointer',
                  letterSpacing: '0.02em',
                }}>
                ➜ Get an email template to request from a tenant
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                value={appNumberInput}
                onChange={e => setAppNumberInput(e.target.value)}
                placeholder="RL-2026-XXXX-XXXX"
                onKeyDown={e => e.key === 'Enter' && lookupApplication()}
                style={{
                  flex: 1, minWidth: 280,
                  padding: '16px 20px', fontSize: 16,
                  fontFamily: 'monospace', letterSpacing: '0.04em',
                  border: `1px solid ${C.ink}`,
                  background: C.paper, color: C.ink,
                }}
              />
              <button
                onClick={lookupApplication}
                disabled={loading || !appNumberInput.trim()}
                style={{
                  background: C.ink, color: C.paper, border: 'none',
                  padding: '0 32px', fontSize: 14, fontWeight: 600,
                  cursor: (loading || !appNumberInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !appNumberInput.trim()) ? 0.5 : 1,
                  minHeight: 52,
                }}
              >
                {loading ? 'Loading...' : 'Look up →'}
              </button>
              {applications.length > 0 && (
                <button onClick={clearAll}
                  style={{
                    background: 'transparent', color: C.inkSoft,
                    border: `1px solid ${C.rule}`,
                    padding: '0 20px', fontSize: 13, fontWeight: 500,
                  }}>
                  Clear all
                </button>
              )}
              {applications.length > 0 && Object.values(decisions).some(d => d?.status === 'shortlist') && (
                <button onClick={exportShortlistPdf}
                  disabled={exporting}
                  style={{
                    background: C.red, color: C.paper,
                    border: 'none',
                    padding: '0 20px', fontSize: 13, fontWeight: 600,
                    cursor: exporting ? 'wait' : 'pointer',
                    opacity: exporting ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  {exporting ? 'Building PDF...' : '⬇ Export shortlist (PDF)'}
                </button>
              )}
            </div>

            {/* Dev demo loader — neighborhood-specific scenarios */}
            {applications.length === 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Don't have application numbers yet? Try a demo scenario
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <button onClick={() => loadDemoApplications('student')}
                    style={{
                      background: 'transparent', color: C.ink,
                      border: `1px solid ${C.rule}`,
                      padding: '14px 16px', fontSize: 12, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.background = '#fef2f0'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.rule; e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Student housing</div>
                    <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 400 }}>Near UofT · 8 applicants</div>
                  </button>
                  <button onClick={() => loadDemoApplications('luxury')}
                    style={{
                      background: 'transparent', color: C.ink,
                      border: `1px solid ${C.rule}`,
                      padding: '14px 16px', fontSize: 12, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.background = '#fef2f0'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.rule; e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Luxury rental</div>
                    <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 400 }}>Yorkville · 8 applicants</div>
                  </button>
                  <button onClick={() => loadDemoApplications('family')}
                    style={{
                      background: 'transparent', color: C.ink,
                      border: `1px solid ${C.rule}`,
                      padding: '14px 16px', fontSize: 12, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.background = '#fef2f0'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.rule; e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Family home</div>
                    <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 400 }}>Junction / Leaside · 8 applicants</div>
                  </button>
                  <button onClick={() => loadDemoApplications('creative')}
                    style={{
                      background: 'transparent', color: C.ink,
                      border: `1px solid ${C.rule}`,
                      padding: '14px 16px', fontSize: 12, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.background = '#fef2f0'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.rule; e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Creative scene</div>
                    <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 400 }}>Queen West · 8 applicants</div>
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => loadDemoApplications('mixed')}
                    style={{
                      background: 'transparent', color: C.red,
                      border: 'none', padding: '4px 0',
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textDecoration: 'underline',
                    }}>
                    Or load a mixed sample (10 applicants) →
                  </button>
                </div>
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
                  padding: '24px 28px',
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
            <section style={{ marginBottom: 32, borderTop: `1px solid ${C.rule}`, paddingTop: 32 }}>
              <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 32 }}>
                {[
                  { id: 'detail', label: 'Detail', enabled: true },
                  { id: 'compare', label: 'Compare', enabled: filteredApplications.length >= 2 },
                  { id: 'ranked', label: 'Ranked by weights', enabled: filteredApplications.length >= 2 },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => tab.enabled && setView(tab.id)}
                    disabled={!tab.enabled}
                    style={{
                      background: 'transparent', border: 'none',
                      padding: '14px 24px', fontSize: 14,
                      fontWeight: view === tab.id ? 700 : 500,
                      color: view === tab.id ? C.ink : (tab.enabled ? C.inkSoft : C.inkMute),
                      borderBottom: view === tab.id ? `2px solid ${C.red}` : '2px solid transparent',
                      cursor: tab.enabled ? 'pointer' : 'not-allowed',
                      opacity: tab.enabled ? 1 : 0.4,
                      marginBottom: -1,
                    }}
                  >
                    {tab.label}
                    {tab.id !== 'detail' && !tab.enabled && (
                      <span style={{ fontSize: 11, color: C.inkMute, marginLeft: 8 }}>
                        (need 2+)
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── DETAIL VIEW ─────────────────────────────── */}
              {view === 'detail' && (
                <DetailView
                  applications={applications}
                  activeIdx={activeAppIdx}
                  setActiveIdx={setActiveAppIdx}
                  onRemove={removeApplication}
                  getDecision={getDecision}
                  setDecisionStatus={setDecisionStatus}
                  setDecisionNotes={setDecisionNotes}
                  setMethodologyOpen={setMethodologyOpen}
                />
              )}

              {/* ── COMPARE VIEW ────────────────────────────── */}
              {view === 'compare' && filteredApplications.length >= 2 && (
                <CompareView
                  applications={filteredApplications}
                  onRemove={removeApplication}
                  getDecision={getDecision}
                  setDecisionStatus={setDecisionStatus}
                />
              )}

              {/* ── RANKED VIEW ─────────────────────────────── */}
              {view === 'ranked' && filteredApplications.length >= 2 && (
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
          <footer style={{ marginTop: 80, paddingTop: 32, borderTop: `1px solid ${C.rule}` }}>
            <p style={{ fontSize: 12, color: C.inkMute, maxWidth: 760, lineHeight: 1.6 }}>
              Rentletter applications are generated by tenants and stored privately. The Scorecard reflects honest, factual assessment based on tenant inputs — not promotional self-rating. Free for landlords and realtors. If you find this useful, share it with other landlords.
            </p>
          </footer>
          </div>{/* close inner padded wrapper */}
        </div>

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
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    {signinLinkSent ? 'Check your email.' : 'Save your work across devices.'}
                  </h3>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                    {signinLinkSent
                      ? `We sent a sign-in link to ${signinEmailInput}. Click it to access your saved applications and decisions on any device.`
                      : 'We\'ll email you a sign-in link. No password — your applications and decisions will sync to this email.'}
                  </p>
                </div>
                <button onClick={() => setSigninModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '24px 32px' }}>
                {!signinLinkSent && (
                  <>
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
                        background: (signinLoading || !signinEmailInput) ? '#c8c2b3' : C.ink,
                        color: C.paper, border: 'none', padding: '14px',
                        fontSize: 14, fontWeight: 600,
                        cursor: (signinLoading || !signinEmailInput) ? 'not-allowed' : 'pointer',
                      }}>
                      {signinLoading ? 'Sending...' : 'Send me a sign-in link →'}
                    </button>
                  </>
                )}
                {signinLinkSent && (
                  <button
                    onClick={() => setSigninModalOpen(false)}
                    style={{
                      width: '100%',
                      background: C.ink, color: C.paper, border: 'none', padding: '14px',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Got it
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* REQUEST-APPLICATION MODAL */}
        {/* ════════════════════════════════════════════════════════ */}
        {requestModalOpen && (
          <div
            onClick={() => setRequestModalOpen(false)}
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
                background: C.paper, maxWidth: 640, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
                position: 'relative',
              }}>
              <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Request a Rentletter application
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    Standardize how you receive applications.
                  </h3>
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                    Copy this template and email or text it to every applicant. They'll come back with a Rentletter number you can verify here.
                  </p>
                </div>
                <button onClick={() => setRequestModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '24px 32px' }}>
                <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Email / Text template
                </div>
                <div id="rl-request-template" style={{
                  background: C.paper, border: `1px solid ${C.ink}`,
                  padding: '20px', fontSize: 14, lineHeight: 1.6,
                  color: C.ink, fontFamily: "'Inter', sans-serif",
                  whiteSpace: 'pre-wrap',
                }}>
{`Hi,

Thanks for your interest in the unit. To make screening fair and quick for every applicant, I'm asking everyone to submit through Rentletter.

It's a 10-minute form that gives me a standardized application with a verified format. You'll get a unique application number to share back with me.

→ rentletter.ca

Once you're done, just reply with your application number (looks like RL-2026-XXXX-XXXX) and I'll review.

Looking forward to it,`}
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      const text = document.getElementById('rl-request-template').innerText;
                      navigator.clipboard.writeText(text);
                      alert('Template copied to clipboard.');
                    }}
                    style={{
                      background: C.ink, color: C.paper, border: 'none',
                      padding: '12px 22px', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer',
                    }}>
                    Copy to clipboard
                  </button>
                  <a
                    href={`mailto:?subject=Your%20rental%20application&body=${encodeURIComponent(`Hi,\n\nThanks for your interest in the unit. To make screening fair and quick for every applicant, I'm asking everyone to submit through Rentletter.\n\nIt's a 10-minute form that gives me a standardized application with a verified format. You'll get a unique application number to share back with me.\n\n→ rentletter.ca\n\nOnce you're done, just reply with your application number (looks like RL-2026-XXXX-XXXX) and I'll review.\n\nLooking forward to it,`)}`}
                    style={{
                      background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`,
                      padding: '11px 22px', fontSize: 13, fontWeight: 600,
                      textDecoration: 'none', cursor: 'pointer',
                    }}>
                    Open in mail app
                  </a>
                </div>
                <div style={{ marginTop: 20, padding: '14px 18px', background: '#fafaf5', borderLeft: `3px solid ${C.red}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
                  <strong style={{ color: C.ink }}>Tip:</strong> Send this to every applicant equally. Using a single intake process is one of the best ways to stay compliant with Ontario Human Rights Code and to make consistent decisions you can defend.
                </div>
              </div>
            </div>
          </div>
        )}

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
                background: C.paper, maxWidth: 700, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
              }}>
              <div style={{ padding: '28px 32px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
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
    </>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW — single tenant deep dive
// ════════════════════════════════════════════════════════════
function DetailView({ applications, activeIdx, setActiveIdx, onRemove, getDecision, setDecisionStatus, setDecisionNotes, setMethodologyOpen }) {
  const app = applications[activeIdx];
  if (!app) return null;
  const decision = getDecision(app.applicationNumber);

  return (
    <div>
      {/* Application tabs (only show if multiple) */}
      {applications.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {applications.map((a, idx) => {
            const aDec = getDecision(a.applicationNumber);
            const tagColor = aDec.status === 'shortlist' ? C.green : aDec.status === 'reject' ? C.inkMute : null;
            return (
              <button
                key={a.applicationNumber}
                onClick={() => setActiveIdx(idx)}
                style={{
                  background: activeIdx === idx ? C.ink : 'transparent',
                  color: activeIdx === idx ? C.paper : C.inkSoft,
                  border: `1px solid ${activeIdx === idx ? C.ink : C.rule}`,
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 8,
                  textDecoration: aDec.status === 'reject' ? 'line-through' : 'none',
                  opacity: aDec.status === 'reject' ? 0.6 : 1,
                }}
              >
                {tagColor && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor, display: 'inline-block' }} />
                )}
                {a.tenant.fullName}
              </button>
            );
          })}
        </div>
      )}

      {/* Card */}
      <div style={{ border: `1px solid ${C.rule}`, background: '#fafaf5' }}>
        {/* Top bar with name + actions */}
        <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
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
          padding: '18px 28px',
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

        {/* NOTES (NEW) */}
        <div style={{ padding: '18px 28px', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Private notes (only you see these)
          </div>
          <textarea
            value={decision.notes}
            onChange={e => setDecisionNotes(app.applicationNumber, e.target.value)}
            placeholder="e.g., Spoke with Sarah Friday — confirmed move-in date works. Waiting on landlord ref."
            rows={2}
            style={{
              width: '100%', padding: '10px 12px',
              border: `1px solid ${C.rule}`, background: C.paper, color: C.ink,
              fontSize: 13, fontFamily: "'Inter', sans-serif",
              resize: 'vertical', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = C.ink}
            onBlur={e => e.target.style.borderColor = C.rule}
          />
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>

          {/* LEFT: Profile facts */}
          <div style={{ padding: '28px', borderRight: `1px solid ${C.rule}` }}>
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
          <div style={{ padding: '28px', background: C.paper }}>
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
function CompareView({ applications, onRemove }) {
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
            {applications.map(app => (
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
                <button onClick={() => onRemove(app.applicationNumber)}
                  style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, padding: '4px 10px', fontSize: 11, fontWeight: 500 }}>
                  Remove
                </button>
              </th>
            ))}
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
        </div>
        {/* Custom weights pill — fixed-height slot so layout doesn't jump when it appears/disappears */}
        <div style={{ marginTop: 10, minHeight: 30 }}>
          {activePreset === 'custom' && (
            <span style={{
              display: 'inline-block',
              padding: '6px 14px', fontSize: 11,
              color: C.red, border: `1px dashed ${C.red}`,
              fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Custom weights
            </span>
          )}
        </div>
        {/* Active preset description — fixed slot below, doesn't shift the grid */}
        {activePreset !== 'custom' && (
          <p style={{
            marginTop: 4, fontSize: 13, color: C.inkSoft,
            fontStyle: 'italic', lineHeight: 1.5,
            minHeight: 36, // reserve space so the layout doesn't bounce when switching presets
          }}>
            {PRIORITY_PRESETS.find(p => p.id === activePreset)?.description}
          </p>
        )}
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
              return (
                <div key={f.key} style={{ marginBottom: idx === FACTOR_DEFS.length - 1 ? 0 : 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                      {f.label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: isHigh ? C.red : isLow ? C.inkMute : C.ink,
                    }}>
                      {stop.label}
                    </span>
                  </div>
                  {/* Visual weight bar */}
                  <div style={{ height: 4, background: C.rule, marginBottom: 8, position: 'relative' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: isHigh ? C.red : C.ink,
                      transition: 'width 0.2s, background 0.2s',
                    }} />
                  </div>
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
                    style={{ width: '100%', accentColor: C.red, cursor: 'pointer' }}
                  />
                  {/* All 5 stop labels evenly distributed */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.inkMute, marginTop: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {WEIGHT_STOPS.map((s, i) => (
                      <span key={s.value} style={{
                        color: i === safeStopIdx ? (isHigh ? C.red : C.ink) : C.inkMute,
                        fontWeight: i === safeStopIdx ? 700 : 500,
                      }}>
                        {s.shortLabel}
                      </span>
                    ))}
                  </div>
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
    <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: highlightRed ? C.red : C.inkMute,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 16,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function DataRow({ label, value, multiline, highlight }) {
  return (
    <div style={{ display: multiline ? 'block' : 'flex', gap: 12 }}>
      <div style={{ fontSize: 12, color: C.inkMute, minWidth: 110, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, color: highlight ? C.green : C.ink,
        fontWeight: highlight ? 600 : 400,
        lineHeight: 1.55, marginTop: multiline ? 4 : 0,
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
      background: color, color: C.paper,
      padding: small ? '4px 10px' : '6px 14px',
      fontSize: small ? 12 : 14, fontWeight: 700,
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
    }}>
      {score} <span style={{ fontSize: small ? 10 : 11, fontWeight: 500, opacity: 0.7 }}>/ 5</span>
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
