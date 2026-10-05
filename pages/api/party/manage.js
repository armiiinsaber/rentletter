// /api/party/manage  POST { applicationNumber, ownerToken, action: 'list' | 'invite', role?, name?, email? }
// The primary's side of the parties on their application (lib/parties.js). Authenticated ONLY by
// the primary's owner token, compared constant time against the KV app:{RL} record the way
// pages/api/application/manage.js does; the token is never read from a URL here and never
// returned. The application row is found by its number through the service role.
//   list    -> { parties: [{ id, role, roleLabel, name, status, statusLabel, invitedAt, ... }], acceptsGuarantor, canInvite }
//   invite  -> inserts the party with its own token, emails them their own link, records
//              party_invited on the timeline and in application_events, answers the list.
// The primary never receives a party's token, income or documents: the list carries role, name,
// email and standing only.
import { timingSafeEqual } from 'crypto';
import { Resend } from 'resend';
import { kvGet, kvIncr, kvExpire } from '../../../lib/kv';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { isValidEmail } from '../../../lib/validation';
import { recordForListing } from '../../../lib/events';
import { recordPartyProgress } from '../../../lib/applicationTransitions';
import { partiesFor, insertParty, inviteEmail, partyFrom, partyUrl } from '../../../lib/partyStore';
import { canInviteRole, listingAcceptsGuarantor, INVITABLE_ROLES, ROLE_LABEL, STATUS_LABEL } from '../../../lib/parties';
import { displayLabel } from '../../../lib/listingAddress';
import { logServerError } from '../../../lib/serverLog';

const safeEqual = (a, b) => { const x = Buffer.from(String(a || ''), 'utf8'); const y = Buffer.from(String(b || ''), 'utf8'); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); };
// What the primary sees of each party: standing, never a token, never their facts.
const forPrimary = ({ id, role, full_name, email, status, invited_at: invitedAt = null, submitted_at: submittedAt = null, declined_at: declinedAt = null, withdrawn_at: withdrawnAt = null }) => ({ id, role, roleLabel: ROLE_LABEL[role] || role, name: full_name, email: email || null, status: status || 'invited', statusLabel: STATUS_LABEL[status] || STATUS_LABEL.invited, invitedAt, submittedAt, declinedAt, withdrawnAt });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { applicationNumber, ownerToken, action = 'list', role, name, email } = req.body || {};
  if (!applicationNumber || !ownerToken) return res.status(400).json({ error: 'Application number and owner token required.' });
  const appNum = String(applicationNumber).trim().toUpperCase();
  if (!isApplicationNumber(appNum)) return res.status(400).json({ error: 'Invalid application number format.' });
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });

  try {
    const record = await kvGet(`app:${appNum}`);
    if (!record) return res.status(404).json({ error: 'Application not found.' });
    if (!safeEqual(record.ownerToken, String(ownerToken).trim())) return res.status(401).json({ error: 'Invalid owner token.' });
    const admin = getSupabaseAdminClient();
    const { data: application } = await admin.from('applications').select('id, application_number, full_name, email').eq('application_number', appNum).maybeSingle();
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    // The listing this application is on (the first junction row): its guarantor setting and its realtor.
    const { data: links } = await admin.from('listing_applicants').select('id, listing_id').eq('application_id', application.id);
    const link = (links || [])[0] || null;
    const { data: listing } = link ? await admin.from('listings').select('id, name, address, profile_id, pref_guarantor_accepted').eq('id', link.listing_id).maybeSingle() : { data: null };
    const { byApplication, absent } = await partiesFor(admin, [application.id]);
    if (absent) return res.status(503).json({ error: 'Co applicants are not set up yet (run db/002 and db/008).' });
    const parties = byApplication.get(String(application.id)) || [];
    const answer = () => ({ parties: parties.map(forPrimary), acceptsGuarantor: listingAcceptsGuarantor(listing), canInvite: Object.fromEntries(INVITABLE_ROLES.map((r) => [r, canInviteRole(r, listing, parties).ok])) });

    if (action === 'list') return res.status(200).json(answer());
    if (action !== 'invite') return res.status(400).json({ error: 'Unknown action.' });

    // Invite: a rate limit under the application's own key, the role allowed here, a name and a
    // real email that is not the primary's own.
    const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `party:${appNum}`, ip: clientIp, scope: 'party' });
    if (!limited.ok) return res.status(429).json({ error: limited.message });
    const allowed = canInviteRole(role, listing, parties);
    if (!allowed.ok) return res.status(400).json({ error: allowed.reason === 'guarantor_not_accepted' ? 'This listing does not take a guarantor.' : allowed.reason === 'one_guarantor' ? 'One guarantor per application.' : allowed.reason === 'full' ? 'Up to three people beside you.' : 'Choose co applicant or guarantor.' });
    const cleanName = String(name || '').trim().slice(0, 120);
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 200);
    if (cleanName.length < 2) return res.status(400).json({ error: 'Their full name.' });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'A valid email for them.' });
    if (cleanEmail === String(application.email || '').trim().toLowerCase()) return res.status(400).json({ error: 'That is your own email. Use theirs.' });
    if (parties.some((p) => String(p.email || '').toLowerCase() === cleanEmail && p.status !== 'declined' && p.status !== 'withdrawn')) return res.status(400).json({ error: 'They are already invited.' });

    const { party, absent: gone } = await insertParty(admin, { applicationId: application.id, role, name: cleanName, email: cleanEmail });
    if (gone || !party) return res.status(503).json({ error: 'Co applicants are not set up yet (run db/002 and db/008).' });
    parties.push(party);

    // Their own email with their own link. The realtor's name is on it; nothing of the primary's beyond their name.
    let emailed = false;
    try {
      const { data: profile } = listing && listing.profile_id ? await admin.from('profiles').select('full_name').eq('id', listing.profile_id).maybeSingle() : { data: null };
      const mail = inviteEmail({ role, partyName: cleanName, primaryName: application.full_name || 'Someone', listingName: listing ? displayLabel(listing) : null, realtorName: profile && profile.full_name ? profile.full_name : null, url: partyUrl(party.party_token) });
      if (process.env.RESEND_API_KEY) { const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: partyFrom(), to: cleanEmail, reply_to: application.email || undefined, subject: mail.subject, html: mail.html, text: mail.text }); if (r && r.error) throw new Error(r.error.message || 'send failed'); emailed = true; }
    } catch (e) { logServerError('[party/manage] invite email', e, { partyId: party.id }); }
    if (link && listing) {
      await recordForListing(admin, listing.id, 'party_invited', { applicationId: application.id, linkId: link.id, payload: { applicantName: application.full_name || null, partyName: cleanName, role } });
      const { data: junction } = await admin.from('listing_applicants').select('*').eq('id', link.id).maybeSingle();
      if (junction) await recordPartyProgress(admin, { junction, listing, partyId: party.id, reason: 'party_invited' });
    }
    return res.status(200).json({ ...answer(), invited: { id: party.id, emailed } });
  } catch (e) {
    logServerError('[party/manage]', e, { applicationNumber: appNum, action });
    return res.status(500).json({ error: 'Could not do that. Try again.' });
  }
}
