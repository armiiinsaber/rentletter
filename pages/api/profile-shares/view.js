// /api/profile-shares/view  POST { linkId, peek? }
// A realtor's view of the profile a tenant shared with them for one of their own applicants
// (lib/profileShareStore.js, the one reader; lib/profileShares.js; db/019-profile-shares.sql).
// Session, entitlement (lib/realtorRoute.js withRealtor), then the explicit ownership check
// (lib/ownApplicant.js: the applicant's listing is the signed in realtor's). The share must name
// this realtor as its recipient, be approved by the tenant and not have ended.
//   peek: true     says only whether there is a share and whether it has ended. Reads nothing of
//                  the tenant's and writes no log line.
//   otherwise      the whitelisted facts and the facts read from documents, each with its source
//                  and date, and the files the realtor may open for 14 days. Every such read is
//                  written to the tenant's log first; a read that cannot be logged is refused.
// Never the Fit score, a rank, a note, household size or any answer outside the whitelist: the
// payload is built from lib/profileFacts.js alone and checked before it leaves.
// A share the tenant stopped answers { shared: true, ended: 'stopped' } and nothing else. An
// application that is no longer open ends its share here, on its own.
import { withRealtor } from '../../../lib/realtorRoute';
import { shareForRealtorApplicant } from '../../../lib/profileShareRoutes';
import { readSharedProfile } from '../../../lib/profileShareStore';
import { applicationOpen, expireShare, shareLive } from '../../../lib/profileShares';

export const ENDED = Object.freeze({ stopped: 'The tenant stopped sharing their profile.', ended: 'This share has ended.' });

export default withRealtor(async ({ user, admin }, req, res) => {
  const found = await shareForRealtorApplicant(admin, { linkId: req.body?.linkId, user });
  if (found.status) return res.status(found.status).json({ error: found.error });
  const { share, junction, viewer } = found;
  if (!share) return res.status(200).json({ shared: false });
  if (share.status === 'revoked') return res.status(200).json({ shared: true, ended: 'stopped', message: ENDED.stopped });
  if (shareLive(share) && !applicationOpen(junction)) { await expireShare(admin, share); return res.status(200).json({ shared: true, ended: 'ended', message: ENDED.ended }); }
  if (!shareLive(share)) return res.status(200).json({ shared: true, ended: 'ended', message: ENDED.ended });
  if (req.body?.peek === true) return res.status(200).json({ shared: true, ended: null });
  const read = await readSharedProfile(admin, { share, viewer });
  if (!read.ok) return res.status(read.reason === 'not logged' || read.reason === 'failed' ? 503 : 403).json({ error: 'The shared profile could not be opened. Try again.' });
  return res.status(200).json({ shared: true, ended: null, sharedAt: share.approved_at, facts: read.payload.facts, checks: read.payload.checks, documents: read.documents, documentsUntil: read.documentsUntil });
}, { label: '[profile-shares/view]' });
