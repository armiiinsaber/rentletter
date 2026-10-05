// /api/party/self  The party's own side (lib/parties.js), authenticated ONLY by the party's token,
// the one thing in their URL (/party/{token}). It never reads or returns anything of the
// primary's beyond their first name, the unit and the realtor's name: no income, no documents, no
// owner_token. The wrong token answers 401 and nothing else.
//   GET  ?token=            -> { role, name, email, status, listingName, realtorName, primaryFirst, province, docRequest? }
//                              (an invited party that opens the form moves to in_progress)
//   POST { token, action: 'submit', form }   -> writes the party's own row and income_sources, mints
//                              their own document request, moves a submitted application to
//                              docs_pending, records party_submitted; answers { ok, docRequest }
//   POST { token, action: 'decline' }        -> status declined, the primary is told
//   POST { token, action: 'withdraw' }       -> status withdrawn, the primary is told
import { Resend } from 'resend';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvReady, kvGetJson, mintRequest, appKey } from '../../../lib/docRequest';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { recordForListing } from '../../../lib/events';
import { recordPartyProgress, transitionApplicationIfAllowed } from '../../../lib/applicationTransitions';
import { APPLICATION_STATE, ACTOR_TYPE } from '../../../lib/application-state';
import { partyByToken, updateParty, writeIncomeSources, isPartyToken, partyLeftEmail, partyFrom } from '../../../lib/partyStore';
import { PARTY_STATUS, partyRowFromForm, partyFormErrors, ROLE_LABEL } from '../../../lib/parties';
import { applicationUrl } from '../../../lib/reconsiderInvite';
import { normalizeProvince } from '../../../lib/provinces';
import { displayLabel } from '../../../lib/listingAddress';
import { logServerError } from '../../../lib/serverLog';

const NOT_FOUND = 'This link is not valid.';

// The application, its first junction row, the listing and the realtor behind a party. Nothing of
// the primary's facts leaves this function beyond the first name.
async function contextFor(admin, party) {
  const { data: application } = await admin.from('applications').select('id, application_number, full_name, email, owner_token').eq('id', party.application_id).maybeSingle();
  if (!application) return null;
  const { data: links } = await admin.from('listing_applicants').select('*').eq('application_id', application.id);
  const junction = (links || [])[0] || null;
  const { data: listing } = junction ? await admin.from('listings').select('*').eq('id', junction.listing_id).maybeSingle() : { data: null };
  const { data: profile } = listing && listing.profile_id ? await admin.from('profiles').select('full_name, brokerage, province, email').eq('id', listing.profile_id).maybeSingle() : { data: null };
  return { application, junction, listing, profile };
}
const publicView = (party, ctx, docRequest) => ({
  role: party.role, roleLabel: ROLE_LABEL[party.role] || party.role, name: party.full_name || '', email: party.email || '', status: party.status || PARTY_STATUS.INVITED,
  listingName: ctx && ctx.listing ? displayLabel(ctx.listing) : null, realtorName: ctx && ctx.profile && ctx.profile.full_name ? ctx.profile.full_name : null,
  primaryFirst: ctx && ctx.application && ctx.application.full_name ? String(ctx.application.full_name).trim().split(/\s+/)[0] : null,
  province: normalizeProvince(ctx && ctx.profile ? ctx.profile.province : null),
  form: { fullName: party.full_name || '', phone: party.phone || '', address: party.address || '', employmentType: party.employment_type || 'full-time', jobTitle: party.job_title || '', employer: party.employer || party.business_name || '', yearsAtJob: party.years_at_job || '', annualIncome: party.annual_income != null ? String(party.annual_income) : '' },
  docRequest: docRequest || null,
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
  const token = String((req.method === 'GET' ? req.query.token : req.body && req.body.token) || '').trim().toUpperCase();
  if (!isPartyToken(token)) return res.status(401).json({ error: NOT_FOUND });
  try {
    const admin = getSupabaseAdminClient();
    const party = await partyByToken(admin, token);
    if (!party) return res.status(401).json({ error: NOT_FOUND });
    const ctx = await contextFor(admin, party);
    if (!ctx) return res.status(401).json({ error: NOT_FOUND });
    const pointer = ctx.junction && kvReady() ? await kvGetJson(appKey(ctx.junction.id, party.id)) : null;
    const docRequest = pointer && pointer.token ? { token: pointer.token, status: pointer.status || 'requested' } : null;

    if (req.method === 'GET') {
      if (party.status === PARTY_STATUS.INVITED) { await updateParty(admin, party.id, { status: PARTY_STATUS.IN_PROGRESS, started_at: new Date().toISOString() }); party.status = PARTY_STATUS.IN_PROGRESS; }
      return res.status(200).json(publicView(party, ctx, docRequest));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `partyself:${token.slice(0, 8)}`, ip: clientIp, scope: 'party' });
    if (!limited.ok) return res.status(429).json({ error: limited.message });
    const { action } = req.body || {};
    const closed = party.status === PARTY_STATUS.DECLINED || party.status === PARTY_STATUS.WITHDRAWN;
    const tellPrimary = async (what) => {
      try {
        const to = String(ctx.application.email || '').trim();
        if (!process.env.RESEND_API_KEY || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
        const url = ctx.application.application_number && ctx.application.owner_token ? applicationUrl(ctx.application.application_number, ctx.application.owner_token) : null;
        const mail = partyLeftEmail({ action: what, partyName: party.full_name, role: party.role, listingName: ctx.listing ? displayLabel(ctx.listing) : null, url });
        const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: partyFrom(), to, subject: mail.subject, html: mail.html, text: mail.text });
        if (r && r.error) throw new Error(r.error.message || 'send failed');
        return true;
      } catch (e) { logServerError('[party/self] primary notice', e, { partyId: party.id }); return false; }
    };
    const progress = async (reason, type) => {
      if (!ctx.junction || !ctx.listing) return;
      await recordForListing(admin, ctx.listing.id, type, { applicationId: ctx.application.id, linkId: ctx.junction.id, payload: { applicantName: ctx.application.full_name || null, partyName: party.full_name || null, role: party.role } });
      await recordPartyProgress(admin, { junction: ctx.junction, listing: ctx.listing, partyId: party.id, reason });
    };

    if (action === 'decline' || action === 'withdraw') {
      if (closed) return res.status(200).json({ ok: true, status: party.status });
      const next = action === 'decline' ? PARTY_STATUS.DECLINED : PARTY_STATUS.WITHDRAWN;
      const err = await updateParty(admin, party.id, { status: next, [action === 'decline' ? 'declined_at' : 'withdrawn_at']: new Date().toISOString() });
      if (err) throw err;
      await progress(`party_${next}`, `party_${next}`);
      const told = await tellPrimary(next);
      return res.status(200).json({ ok: true, status: next, primaryTold: told });
    }
    if (action !== 'submit') return res.status(400).json({ error: 'Unknown action.' });
    if (closed) return res.status(409).json({ error: 'This invite was closed.' });
    const form = req.body && req.body.form && typeof req.body.form === 'object' ? req.body.form : {};
    const errors = partyFormErrors(form, party.role);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
    const { incomeKind, ...row } = partyRowFromForm(form, party.role);
    const now = new Date().toISOString();
    const err = await updateParty(admin, party.id, { ...row, status: PARTY_STATUS.SUBMITTED, submitted_at: party.submitted_at || now, consented_at: now });
    if (err) throw err;
    const incErr = await writeIncomeSources(admin, party.id, row.annual_income != null ? [{ kind: incomeKind, amount: row.annual_income, payer: row.employer || row.business_name || null }] : []);
    if (incErr) logServerError('[party/self] income sources', incErr, { partyId: party.id });
    await progress('party_submitted', 'party_submitted');
    // Their own document request, their own reminders; a submitted application waits on documents.
    let minted = null;
    if (ctx.junction && ctx.listing && kvReady()) {
      try {
        minted = await mintRequest({ listingId: ctx.listing.id, linkId: ctx.junction.id, applicationId: ctx.application.id, tenantName: row.full_name || party.full_name, listingName: displayLabel(ctx.listing), address: ctx.listing.address || '', realtorName: ctx.profile && ctx.profile.full_name ? ctx.profile.full_name : 'The listing realtor', brokerage: ctx.profile && ctx.profile.brokerage ? ctx.profile.brokerage : '', askCreditReport: !!ctx.listing.pref_ask_credit_report, partyId: party.id });
        await transitionApplicationIfAllowed(admin, { junction: ctx.junction, listing: ctx.listing, to: APPLICATION_STATE.DOCS_PENDING, onlyFrom: [APPLICATION_STATE.SUBMITTED], actor: party.id, actorType: ACTOR_TYPE.APPLICANT, reason: 'party_documents_requested' });
      } catch (e) { logServerError('[party/self] document request', e, { partyId: party.id }); }
    }
    return res.status(200).json({ ok: true, status: PARTY_STATUS.SUBMITTED, docRequest: minted ? { token: minted.token, askCreditReport: !!minted.askCreditReport } : null });
  } catch (e) {
    logServerError('[party/self]', e, { token: token.slice(0, 6) });
    return res.status(500).json({ error: 'Could not do that. Try again.' });
  }
}
