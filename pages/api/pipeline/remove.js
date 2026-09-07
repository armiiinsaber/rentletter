// /api/pipeline/remove  POST { consentId }. A realtor write: session and entitlement through
// lib/realtorRoute.js withRealtor, the consent row's profile_id must equal user.id
// (lib/pipeline.js removePerson). Deletes the row, records pipeline_removed, clears the cache.
import { withRealtor } from '../../../lib/realtorRoute';
import { removePerson } from '../../../lib/pipeline';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';

export default withRealtor(async ({ user, admin }, req, res) => {
  const r = await removePerson({ admin, userId: user.id }, req.body || {});
  if (r.status !== 200) return res.status(r.status).json(r.body);
  invalidateSignals(user.id);
  await recordEvent(admin, { profileId: user.id, listingId: r.consent.listing_id || null, applicationId: r.consent.application_id || null, type: 'pipeline_removed', payload: { applicantName: r.consent.email } });
  return res.status(200).json({ ok: true });
}, { label: '[pipeline/remove]' });
