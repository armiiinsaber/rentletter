// /api/applicants/reconsider  POST { linkId, reason } or { linkId, undo: true }. A realtor write:
// session and entitlement through lib/realtorRoute.js withRealtor, then the explicit ownership
// check and the guarded move inside lib/realtorWrites.js reconsiderApplicant. Moves an applicant
// who was told no to reconsidered, only while the listing is live, with a reason, audited. It
// restores nothing: no document, no access. A refused move answers 409 and writes nothing.
// TODO: the re invite the applicant receives goes in lib/reconsiderInvite.js (not built yet).
import { withRealtor } from '../../../lib/realtorRoute';
import { reconsiderApplicant } from '../../../lib/realtorWrites';
import { invalidateSignals } from '../../../lib/signalsCache';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await reconsiderApplicant({ admin, userId: user.id, profile: gate.profile, invalidate: invalidateSignals }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[applicants/reconsider]' });
