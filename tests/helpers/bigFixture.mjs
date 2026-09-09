// The measurement fixture for the dashboard load tests (moved out of fakeSupabase.mjs unchanged).
// The measurement fixture: N listings for one realtor, K applicants each. Every third applicant
// has a document report, every third a document request pointer in KV, one per listing is set
// aside (the first). Applications carry owner_token and cover_letter so the strip is exercised.
export function bigFixture({ listings = 12, perListing = 3, profileId = 'p-1' } = {}) {
  const day = 86400000; const base = Date.parse('2026-09-01T12:00:00Z');
  const t = (d) => new Date(base - d * day).toISOString();
  const L = [], J = [], A = [], docs = [], kv = {};
  let n = 0;
  for (let i = 0; i < listings; i++) {
    const lid = `L${i + 1}`;
    L.push({ id: lid, profile_id: profileId, name: `${100 + i} Main St, Unit ${i + 1}`, address: `${100 + i} Main St, Toronto`, monthly_rent: 2000 + i * 100, landlord_email: i % 2 ? `ll${i}@example.com` : null, landlord_name: i % 2 ? `Landlord ${i}` : null, pref_rent_to_income_max_pct: 40, pref_min_annual_income: 60000, pref_min_years_at_job: 1, pref_requires_landlord_reference: false, pref_requires_employer_verification: false, created_at: t(30 - i) });
    for (let k = 0; k < perListing; k++) {
      n++;
      const aid = `A${n}`, jid = `J${n}`;
      A.push({ id: aid, application_number: `RL-2026-${String(n).padStart(4, '0')}`, full_name: `Applicant ${n}`, email: `a${n}@example.com`, annual_income: 60000 + (n % 5) * 9000, years_at_job: String(1 + (n % 4)), employer: `Employer ${n}`, job_title: 'Analyst', prev_landlord_name: n % 2 ? 'L. Wong' : null, years_at_previous: String(n % 3), references: n % 3 ? [{ name: 'r' }] : [], rent_to_income_ratio: 30, owner_token: `ot_${n}_secret`, cover_letter: 'private', created_at: t(10 - (n % 10)) });
      const report = n % 3 === 0 ? { active: { analyzedAt: t(2), nameMatch: 'match', documents: [{ documentType: 'pay stub' }], comparisons: [{ field: 'Income', status: 'match', found: '$90,000' }, { field: 'Employer', status: 'match' }] }, archived: [] } : null;
      J.push({ id: jid, listing_id: lid, application_id: aid, decision_status: k === 0 ? 'reject' : 'none', decision_priority: null, decision_notes: '', decision_reason_code: k === 0 ? 'income_below_min' : null, decision_changed_at: k === 0 ? t(1) : null, added_via: 'invite', created_at: t(10 - (n % 10)), doc_verifications: report, reviewed_at: t(3), withdrawn_at: null, confirmations: {}, last_sent_at: null, docs_submitted_at: report ? t(2) : null, docs_verified: !!report });
      if (n % 3 === 2) kv[`docreq-app:${jid}`] = { status: 'requested', requestedAt: t(4), receivedAt: null };
      if (report) docs.push({ id: `D${n}`, listing_applicant_id: jid, profile_id: profileId, storage_path: `${profileId}/${jid}/x.pdf`, kind: 'pay stub', mime: 'application/pdf', bytes: 1000, uploaded_by: 'realtor', uploaded_at: t(2), expires_at: t(-12), deleted_at: null, deleted_by: null, opened_count: 0, last_opened_at: null });
    }
  }
  const tables = { listings: L, listing_applicants: J, applications: A, applicant_documents: docs, profiles: [{ id: profileId, full_name: 'Test Realtor', notifications_last_seen: t(5) }], events: [{ id: 'e1', profile_id: profileId, created_at: t(1) }] };
  return { tables, kv, listings: L };
}
