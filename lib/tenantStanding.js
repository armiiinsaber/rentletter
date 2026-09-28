// lib/tenantStanding.js  SERVER ONLY (takes the service role client). Where one application
// stands, as its own applicant may read it (pages/api/application/manage.js view, shown on
// pages/my-application/[rl].js). The application row by number, its newest listing_applicants
// row, and the listing that row sits on; the line comes from lib/applicantState.js TENANT_LINES
// through applicantStanding (the state first, the old columns as the fallback). Nothing about
// the realtor's notes, the score, the reason or anyone else leaves here.
//
//   standingForApplication(admin, applicationNumber) -> { state, line, since } | null
// null when the application never reached a listing, or the tables are not there yet.
import { applicantStanding } from './application-state.js';
import { tenantLine } from './applicantState.js';

export async function standingForApplication(admin, applicationNumber) {
  if (!admin || !applicationNumber) return null;
  try {
    const { data: app } = await admin.from('applications').select('id').eq('application_number', String(applicationNumber).toUpperCase()).maybeSingle();
    if (!app) return null;
    // The state column arrives with db/002, withdrawn_at with db/listing-applicants-vocabulary.sql.
    const q = (cols) => admin.from('listing_applicants').select(`id, listing_id, decision_status, decision_priority, decision_changed_at, created_at${cols}`).eq('application_id', app.id).order('created_at', { ascending: false }).limit(1);
    let r = await q(', withdrawn_at, state');
    if (r.error) r = await q(', withdrawn_at');
    if (r.error) r = await q('');
    const junction = r.data && r.data[0];
    if (!junction) return null;
    let listing = null;
    if (junction.listing_id) {
      const l = (cols) => admin.from('listings').select(cols).eq('id', junction.listing_id).maybeSingle();
      let lr = await l('id, status, closed_at, rented_link_id, state');
      if (lr.error) lr = await l('id, status, closed_at, rented_link_id');
      if (lr.error) lr = await l('id');
      listing = lr.data || null;
    }
    const st = applicantStanding(junction, listing);
    return { state: st.state, line: tenantLine(junction, listing), since: st.withdrawnSince || st.changedAt || null };
  } catch (e) {
    return null;
  }
}
