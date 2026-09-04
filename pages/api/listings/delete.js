// /api/listings/delete  POST. A realtor write: session and entitlement through lib/realtorRoute.js
// withRealtor, then the explicit ownership check, the event, the signals cache and the pending
// nudge set inside lib/realtorWrites.js deleteListing. The browser never writes this table itself.
import { withRealtor } from '../../../lib/realtorRoute';
import { deleteListing } from '../../../lib/realtorWrites';
import { invalidateSignals } from '../../../lib/signalsCache';
import { kvSrem } from '../../../lib/docRequest';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await deleteListing({ admin, userId: user.id, profile: gate.profile, invalidate: invalidateSignals, srem: kvSrem }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[listings/delete]' });
