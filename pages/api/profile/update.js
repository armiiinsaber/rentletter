// /api/profile/update  POST. A realtor write: session and entitlement through lib/realtorRoute.js
// withRealtor, then the explicit ownership check, the event, the signals cache and the pending
// nudge set inside lib/realtorWrites.js updateProfile. The browser never writes this table itself.
import { withRealtor } from '../../../lib/realtorRoute';
import { updateProfile } from '../../../lib/realtorWrites';
import { invalidateSignals } from '../../../lib/signalsCache';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await updateProfile({ admin, userId: user.id, profile: gate.profile, invalidate: invalidateSignals }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[profile/update]' });
