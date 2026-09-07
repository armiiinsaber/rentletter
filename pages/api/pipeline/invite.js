// /api/pipeline/invite  POST { consentId, listingId }. A realtor write: session and entitlement
// through lib/realtorRoute.js withRealtor, then the explicit ownership of BOTH rows (the consent
// row's profile_id and the listing's profile_id equal user.id, lib/pipeline.js prepareInvite).
// Refuses a listing that is not active, a second invite to the same listing, and an ended
// consent. Mints the prefill token (KV prefill:{token}, 14 days), appends to invites, records
// pipeline_invited, clears the signals cache, sends the invite in the realtor's name.
import { Resend } from 'resend';
import { withRealtor } from '../../../lib/realtorRoute';
import { prepareInvite, inviteEmail, pipelineFrom } from '../../../lib/pipeline';
import { realtorName } from '../../../lib/ownApplicant';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';
import { logServerError } from '../../../lib/serverLog';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await prepareInvite({ admin, userId: user.id }, req.body || {});
  if (r.status !== 200) return res.status(r.status).json(r.body);
  const { consent, listing, application, prefillToken, at } = r;
  invalidateSignals(user.id);
  const name = realtorName(gate.profile, user);
  const to = String(consent.email || application?.email || '').trim();
  const applyUrl = `${siteBase()}/apply/${listing.invite_token || ''}${prefillToken ? `?from=${prefillToken}` : ''}`;
  const mail = inviteEmail({ listing, realtorName: name, applicantName: application?.full_name, email: to, applyUrl, prefilled: !!prefillToken });
  await recordEvent(admin, { profileId: user.id, listingId: listing.id, applicationId: consent.application_id || null, type: 'pipeline_invited', payload: { applicantName: application?.full_name || to, listingName: listing.name || listing.address || null, listingId: listing.id } });
  let emailed = false;
  if (process.env.RESEND_API_KEY && to && listing.invite_token) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const out = await resend.emails.send({ from: pipelineFrom(name), to, reply_to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      if (out?.error) throw new Error(out.error.message || 'send failed');
      emailed = true;
    } catch (e) { logServerError('[pipeline/invite] email', e, { consentId: consent.id, listingId: listing.id }); }
  }
  return res.status(200).json({ ok: true, invitedAt: at, emailed, prefilled: !!prefillToken });
}, { label: '[pipeline/invite]' });
