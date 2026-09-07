// /api/references/request  POST { linkId }. A realtor write: session and entitlement through
// lib/realtorRoute.js withRealtor, the explicit ownership check (lib/ownApplicant.js), then one
// reference_responses row with a 14 day expiry (lib/referenceStore.js createRequest, which refuses
// while a pending request is under 5 days old), the reference_requested event, the signals cache,
// and the email to the previous landlord in the realtor's name. The tenant is never emailed.
import { Resend } from 'resend';
import { withRealtor } from '../../../lib/realtorRoute';
import { ownedApplicant, realtorName } from '../../../lib/ownApplicant';
import { createRequest } from '../../../lib/referenceStore';
import { emailIn, referenceEmail, referenceFrom } from '../../../lib/referenceQuestions';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';
import { logServerError } from '../../../lib/serverLog';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const { linkId } = req.body || {};
  if (!linkId) return res.status(400).json({ error: 'linkId is required.' });
  const own = await ownedApplicant(admin, linkId, user.id);
  if (!own) return res.status(own === null ? 404 : 403).json({ error: own === null ? 'Applicant not found.' : 'Not your applicant.' });
  const { junction, listing } = own;
  const { data: app } = await admin.from('applications').select('id, full_name, prev_landlord_contact, prev_landlord_name').eq('id', junction.application_id).maybeSingle();
  const to = emailIn(app?.prev_landlord_contact);
  if (!to) return res.status(400).json({ error: 'No email on file for the previous landlord.' });
  const r = await createRequest(admin, { linkId: junction.id, profileId: user.id, sentTo: to });
  if (r.status !== 200) return res.status(r.status).json(r.body);
  invalidateSignals(user.id);
  const name = realtorName(gate.profile, user);
  await recordEvent(admin, { profileId: user.id, listingId: listing.id, applicationId: junction.application_id, type: 'reference_requested', payload: { applicantName: app?.full_name || null, listingName: listing.name || listing.address || null, linkId: junction.id } });
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const mail = referenceEmail({ applicantName: app?.full_name, realtorName: name, brokerage: gate.profile?.brokerage || null, answerUrl: `${siteBase()}/ref/${r.token}` });
      const out = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: referenceFrom(name), to, reply_to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      if (out?.error) throw new Error(out.error.message || 'send failed');
      emailed = true;
    } catch (e) { logServerError('[references/request] email', e, { linkId: junction.id }); }
  }
  return res.status(200).json({ ...r.body, emailed });
}, { label: '[references/request]' });
