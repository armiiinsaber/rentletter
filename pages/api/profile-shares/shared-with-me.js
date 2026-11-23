// /api/profile-shares/shared-with-me  POST { action }
// A listing agent's view of the profiles tenants shared with them (db/024-share-roles.sql;
// lib/profileShares.js; lib/profileShareStore.js, the one reader). Session and entitlement
// (lib/realtorRoute.js withRealtor), then the explicit ownership check: the share names THIS
// realtor as its recipient, as listing agent. A realtor cannot make, approve or change a share
// here or anywhere: this route only reads, through shares a tenant made themselves.
//   list                       the shares given to this realtor as listing agent: the unit and
//                              the date, nothing of the tenant. Reads no profile, writes no log.
//   view { shareId }           the same view the tenant's realtor has: the whitelisted facts, the
//                              facts read from documents, the photo, the tenant's own words and
//                              offer (with the English version they approved, db/026), the
//                              files open for 14 days (never the ID), and the
//                              screening score the application holds on that unit. Written to
//                              the tenant's log first; a read that cannot be logged is refused.
//   open { shareId, documentId }   one income or employment document, for 60 seconds.
// Never the tenant's profile strength: nothing here, or in anything it calls, reads it.
import { withRealtor } from '../../../lib/realtorRoute';
import { readSharedProfile, openSharedDocument } from '../../../lib/profileShareStore';
import { sharesForListingAgent, listingAgentShare, screeningForShare, expireShare, shareLive, ROLE } from '../../../lib/profileShares';

const ENDED = Object.freeze({ stopped: 'The tenant stopped sharing their profile.', ended: 'This share has ended.' });

export default withRealtor(async ({ user, admin }, req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.action === 'list') {
    const out = await sharesForListingAgent(admin, user.id);
    return res.status(200).json({ available: out.available, shares: out.shares });
  }
  if (body.action !== 'view' && body.action !== 'open') return res.status(400).json({ error: 'Unknown action.' });
  const shareId = typeof body.shareId === 'string' ? body.shareId : '';
  if (!shareId) return res.status(400).json({ error: 'shareId is required.' });
  const found = await listingAgentShare(admin, { id: shareId, recipientProfileId: user.id });
  // Not there, or not this realtor's: one answer.
  if (!found) return res.status(404).json({ error: 'Nothing is shared with you here.' });
  const { share } = found;
  if (String(share.recipient_profile_id) !== String(user.id)) return res.status(404).json({ error: 'Nothing is shared with you here.' });
  if (share.status === 'revoked') return res.status(body.action === 'open' ? 403 : 200).json(body.action === 'open' ? { error: ENDED.stopped } : { shared: true, role: ROLE.LISTING_AGENT, ended: 'stopped', message: ENDED.stopped });
  if (shareLive(share) && !found.open) await expireShare(admin, share);
  if (!shareLive(share) || !found.open) return res.status(body.action === 'open' ? 403 : 200).json(body.action === 'open' ? { error: ENDED.ended } : { shared: true, role: ROLE.LISTING_AGENT, ended: 'ended', message: ENDED.ended });
  const { data: me } = await admin.from('profiles').select('full_name, brokerage').eq('id', user.id).maybeSingle();
  const viewer = { id: user.id, label: [String(me?.full_name || '').trim() || 'A realtor', String(me?.brokerage || '').trim(), 'listing agent'].filter(Boolean).join(', ') };

  if (body.action === 'open') {
    const documentId = typeof body.documentId === 'string' ? body.documentId : '';
    if (!documentId) return res.status(400).json({ error: 'documentId is required.' });
    const out = await openSharedDocument(admin, { share, viewer, documentId });
    if (!out.ok) return res.status(out.reason === 'missing' ? 404 : out.reason === 'not logged' || out.reason === 'failed' ? 503 : 403).json({ error: out.reason === 'closed' ? 'The 14 days to open this tenant’s documents are over.' : 'That document could not be opened.' });
    return res.status(200).json({ url: out.url, mime: out.mime, kind: out.kind });
  }
  const read = await readSharedProfile(admin, { share, viewer });
  if (!read.ok) return res.status(read.reason === 'not logged' || read.reason === 'failed' ? 503 : 403).json({ error: 'The shared profile could not be opened. Try again.' });
  const screening = await screeningForShare(admin, share);
  return res.status(200).json({ shared: true, role: ROLE.LISTING_AGENT, ended: null, sharedAt: share.approved_at, facts: read.payload.facts, checks: read.payload.checks, documents: read.documents, documentsUntil: read.documentsUntil, about: read.personal.about, aboutEnglish: read.personal.aboutEnglish, prepayMonths: read.personal.prepayMonths, photo: read.personal.photo, screening });
}, { label: '[profile-shares/shared-with-me]' });
