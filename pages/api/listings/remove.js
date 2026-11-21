// /api/listings/remove  POST { listingIds: [...] }. Delete the realtor's listings that have no real
// application, with their test applications (lib/listingArchive.js deleteCheck: a +test address is
// a test). A realtor write: the session and the entitlement through lib/realtorRoute.js
// withRealtor, then lib/listingArchive.js removeListings checks that EVERY listing id is the
// realtor's own; one that is not fails the whole request and nothing is deleted. A listing with a
// real application is skipped and counted; asked for alone, it answers 409 with the line that says
// why. Each delete is lib/realtorWrites.js deleteListing: its documents purged, the event recorded.
import { withRealtor } from '../../../lib/realtorRoute';
import { removeListings } from '../../../lib/listingArchive';
import { invalidateSignals } from '../../../lib/signalsCache';
import { kvSrem } from '../../../lib/docRequest';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const r = await removeListings({ admin, userId: user.id, profile: gate.profile, invalidate: invalidateSignals, srem: kvSrem }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[listings/remove]' });
