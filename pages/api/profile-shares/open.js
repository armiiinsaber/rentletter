// /api/profile-shares/open  POST { linkId, documentId }
// A 60 second link to one of a tenant's stored documents, for the realtor the tenant shared
// their profile with by applying to that realtor's listing (lib/profileShareStore.js
// openSharedDocument). Session, entitlement (withRealtor), the explicit ownership check on the
// applicant, then the share: this realtor is its recipient, the tenant approved it, it has not
// ended, the application is still open, documents are in it and its 14 days are running. The
// open is written to the tenant's log first; an open that cannot be logged is refused.
// Returns { url, mime, kind }: a signed storage link, never a path, never an owner token.
import { withRealtor } from '../../../lib/realtorRoute';
import { shareForRealtorApplicant } from '../../../lib/profileShareRoutes';
import { openSharedDocument } from '../../../lib/profileShareStore';
import { applicationOpen, expireShare, shareLive } from '../../../lib/profileShares';

export default withRealtor(async ({ user, admin }, req, res) => {
  const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : '';
  if (!documentId) return res.status(400).json({ error: 'documentId is required.' });
  const found = await shareForRealtorApplicant(admin, { linkId: req.body?.linkId, user });
  if (found.status) return res.status(found.status).json({ error: found.error });
  const { share, junction, viewer } = found;
  if (!share) return res.status(404).json({ error: 'Nothing is shared for this applicant.' });
  if (shareLive(share) && !applicationOpen(junction)) await expireShare(admin, share);
  if (!shareLive(share) || !applicationOpen(junction)) return res.status(403).json({ error: share.status === 'revoked' ? 'The tenant stopped sharing their profile.' : 'This share has ended.' });
  const out = await openSharedDocument(admin, { share, viewer, documentId });
  if (!out.ok) return res.status(out.reason === 'missing' ? 404 : out.reason === 'closed' ? 403 : out.reason === 'not logged' || out.reason === 'failed' ? 503 : 403).json({ error: out.reason === 'closed' ? 'The 14 days to open this tenant’s documents are over.' : out.reason === 'missing' ? 'That document is no longer held.' : 'Could not open that document. Try again.' });
  return res.status(200).json({ url: out.url, mime: out.mime, kind: out.kind });
}, { label: '[profile-shares/open]' });
