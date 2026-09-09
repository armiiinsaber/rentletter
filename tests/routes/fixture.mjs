// The realtor a paying customer is: one profile, two listings, five applicants, the tables every
// route reads. Shared by the six route level tests. Invented people; no real data.
export const DAY = 86400000;
export const NOW = Date.parse('2026-09-08T12:00:00Z');
export const ago = (d) => new Date(NOW - d * DAY).toISOString();
export const USER = { id: 'realtor-1', email: 'sarah@example.com', user_metadata: {} };
export const OTHER = { id: 'realtor-2', email: 'other@example.com', user_metadata: {} };
export const INVITE_TOKEN = 'a1b2c3d4e5f6a7b8c9d0';

export const profile = (over = {}) => ({ id: USER.id, email: USER.email, full_name: 'Sarah Chen', brokerage: 'Demo Realty', province: 'ON', plan: 'founding', created_at: ago(40), notifications_last_seen: ago(3), ...over });

export function tables({ plan = 'founding', profileOver = {} } = {}) {
  const listings = [
    { id: 'L1', profile_id: USER.id, name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', allows_pets: 'no', allows_smoking: 'no', parking_included: 'no', landlord_name: 'Marco Rossi', landlord_email: 'marco@example.com', pref_rent_to_income_max_pct: 40, pref_min_annual_income: null, pref_min_years_at_job: 1, pref_requires_landlord_reference: true, pref_requires_employer_verification: false, status: 'active', invite_token: INVITE_TOKEN, invite_url: `https://rentletter.ca/apply/${INVITE_TOKEN}`, created_at: ago(30) },
    { id: 'L2', profile_id: USER.id, name: '88 Harbour St, Unit 2104', address: '88 Harbour St, Unit 2104, Toronto', monthly_rent: 3100, bedrooms: '2', landlord_name: null, landlord_email: null, pref_rent_to_income_max_pct: 35, status: 'active', invite_token: null, invite_url: null, created_at: ago(20) },
    { id: 'L9', profile_id: OTHER.id, name: '1 Elsewhere Rd', address: '1 Elsewhere Rd, Toronto', monthly_rent: 2000, status: 'active', created_at: ago(10) },
  ];
  const app = (id, n, over = {}) => ({ id, application_number: `RL-2026-TEST-${n}`, full_name: `Applicant ${n}`, email: `a${n}@example.com`, phone: `416 555 0${String(n.charCodeAt(1) % 10)}${String(n.charCodeAt(0) % 10)}${String(n.charCodeAt(3) % 10)}`, job_title: 'Analyst', employer: `Employer ${n}`, years_at_job: '3', annual_income: 90000, prev_landlord_name: 'A. Owner', prev_address: '1 Old St', years_at_previous: '2', references: [{ name: 'R One' }], co_applicant: null, owner_token: `OWNERTOKENSECRET${n}${n}${n}${n}`, cover_letter: 'secret cover letter', created_at: ago(5), ...over });
  const applications = [
    app('A1', 'A1A1', { annual_income: 92000, years_at_job: '5', phone: '416 555 0111' }),
    app('A2', 'B2B2', { annual_income: 117000, years_at_job: '12' }),
    app('A3', 'C3C3', { annual_income: 61000, years_at_job: '1' }),
    app('A4', 'D4D4', { annual_income: null, years_at_job: '' }), // no income: no Fit
    app('A5', 'E5E5', { annual_income: 99000, phone: '416 555 0111', email: 'a1.work@example.com', full_name: 'Applicant A1A1' }), // the same person as A1 (phone): duplicate
    app('A6', 'F6F6', { annual_income: 80000 }),
  ];
  const report = { active: { analyzedAt: ago(2), nameMatch: 'match', documents: [{ documentType: 'employment letter', extracted: { applicantName: 'Applicant A1A1', employer: 'Employer A1A1', annualSalaryPrinted: 92000 } }], comparisons: [{ field: 'Employer', status: 'match', found: 'Employer A1A1' }, { field: 'Income', status: 'match', annual: 92000, found: '$92,000 a year as printed on the employment letter' }] }, archived: [] };
  const listing_applicants = [
    { id: 'J1', listing_id: 'L1', application_id: 'A1', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(5), doc_verifications: report, reviewed_at: ago(4), withdrawn_at: null, confirmations: { employer: { at: ago(3), by: 'You' } }, last_sent_at: null },
    { id: 'J2', listing_id: 'L1', application_id: 'A2', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(4), doc_verifications: null, reviewed_at: null, withdrawn_at: null, confirmations: {}, last_sent_at: null },
    { id: 'J3', listing_id: 'L1', application_id: 'A3', decision_status: 'reject', decision_priority: null, decision_notes: '', decision_reason_code: 'income_below_min', decision_changed_at: ago(1), added_via: 'invite', created_at: ago(3), doc_verifications: null, reviewed_at: ago(2), withdrawn_at: null, confirmations: {}, last_sent_at: null },
    { id: 'J4', listing_id: 'L1', application_id: 'A4', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(2), doc_verifications: null, reviewed_at: null, withdrawn_at: null, confirmations: {}, last_sent_at: null },
    { id: 'J5', listing_id: 'L1', application_id: 'A5', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(1), doc_verifications: null, reviewed_at: null, withdrawn_at: null, confirmations: {}, last_sent_at: null },
    { id: 'J6', listing_id: 'L2', application_id: 'A6', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(6), doc_verifications: null, reviewed_at: null, withdrawn_at: null, confirmations: {}, last_sent_at: null },
    { id: 'J9', listing_id: 'L9', application_id: 'A6', decision_status: 'none', decision_priority: null, decision_notes: '', decision_reason_code: null, decision_changed_at: null, added_via: 'invite', created_at: ago(6), doc_verifications: null, reviewed_at: null, withdrawn_at: null, confirmations: {}, last_sent_at: null },
  ];
  const profiles = [profile({ plan, ...profileOver }), { id: OTHER.id, email: OTHER.email, full_name: 'Other Realtor', plan: 'founding', province: 'ON' }];
  return {
    profiles, listings, applications, listing_applicants,
    events: [{ id: 'e1', profile_id: USER.id, listing_id: 'L1', type: 'applicant_applied', created_at: ago(5), payload: {} }],
    applicant_documents: [],
    report_snapshots: [],
    reference_responses: [{ id: 'RR1', listing_applicant_id: 'J1', profile_id: USER.id, token: 'r'.repeat(32), status: 'answered', answers: { stillRent: 'no', paidOnTime: 'always', damage: 'none', complaints: 'no', rentAgain: 'yes' }, sent_to: 'a.owner@example.com', sent_at: ago(4), answered_at: ago(3), created_at: ago(4) }],
    pipeline_consents: [{ id: 'PC1', profile_id: USER.id, listing_id: 'L2', application_id: 'A6', email: 'a6@example.com', status: 'consented', consented_at: ago(9), expires_at: new Date(NOW + 51 * DAY).toISOString(), invites: [] }],
  };
}
