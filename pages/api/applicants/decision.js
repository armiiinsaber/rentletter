// /api/applicants/decision  POST. A realtor write: session and entitlement through lib/realtorRoute.js
// withRealtor, then the explicit ownership check, the event, the signals cache and the pending
// nudge set inside lib/realtorWrites.js decideApplicant. The browser never writes this table itself.
import { withRealtor } from '../../../lib/realtorRoute';
import { decideApplicant } from '../../../lib/realtorWrites';
import { invalidateSignals } from '../../../lib/signalsCache';
import { kvSrem } from '../../../lib/docRequest';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await decideApplicant({ admin, userId: user.id, profile: gate.profile, invalidate: invalidateSignals, srem: kvSrem }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[applicants/decision]' });
