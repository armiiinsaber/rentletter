// /api/listings/archive  POST { listingIds: [...], archived: true | false }. Archive or restore the
// realtor's listings (db/025-listing-archive.sql). A realtor write: the session and the entitlement
// through lib/realtorRoute.js withRealtor, then lib/listingArchive.js archiveListings checks that
// EVERY listing id is the realtor's own; one that is not fails the whole request and nothing is
// written. Only listings.archived_at changes: applications, shares, events and reports are as they
// were. Before db/025 has run it answers 503 { available: false }.
import { withRealtor } from '../../../lib/realtorRoute';
import { archiveListings } from '../../../lib/listingArchive';
import { invalidateSignals } from '../../../lib/signalsCache';
export default withRealtor(async ({ user, admin }, req, res) => {
  const r = await archiveListings({ admin, userId: user.id, invalidate: invalidateSignals }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[listings/archive]' });
