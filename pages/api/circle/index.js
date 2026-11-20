// /api/circle  POST { action }. The realtor circle (lib/circle.js, db/021-realtor-circle.sql).
// A realtor route: session and entitlement through lib/realtorRoute.js withRealtor, then every
// function is handed the caller's own id from that session and checks whose row it is before it
// writes. No id of the caller is ever read from the request.
//   load                      the Circle screen: requests, sent, connections, settings, invite link, brokerage
//   count                     { pending }: requests waiting for the caller (the badge)
//   search   { q }            realtors by name or brokerage: name, brokerage, initials and how the pair stands
//   request  { profileId }    ask to connect (rate limited)
//   accept | decline { id }   only the realtor who was asked
//   remove | block | unblock { id }   only one of the two; unblock only the one who blocked
//   settings { findable, doesRentals, serviceAreas }   the caller's own profile row
// Before db/021 has run every action answers { available: false }.
import { withRealtor } from '../../../lib/realtorRoute';
import { loadCircle, pendingCount, searchRealtors, requestConnection, acceptConnection, declineConnection, removeConnection, blockConnection, unblockConnection, saveCircleSettings } from '../../../lib/circle';

export default withRealtor(async ({ user, admin }, req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ctx = { admin, userId: user.id };
  const id = typeof body.id === 'string' ? body.id : '';
  let r;
  switch (body.action) {
    case 'load': r = await loadCircle(ctx); break;
    case 'count': r = await pendingCount(ctx); break;
    case 'search': r = await searchRealtors({ ...ctx, q: typeof body.q === 'string' ? body.q : '' }); break;
    case 'request': r = await requestConnection({ ...ctx, targetId: typeof body.profileId === 'string' ? body.profileId : '' }); break;
    case 'accept': r = await acceptConnection({ ...ctx, id }); break;
    case 'decline': r = await declineConnection({ ...ctx, id }); break;
    case 'remove': r = await removeConnection({ ...ctx, id }); break;
    case 'block': r = await blockConnection({ ...ctx, id }); break;
    case 'unblock': r = await unblockConnection({ ...ctx, id }); break;
    case 'settings': r = await saveCircleSettings({ ...ctx, body }); break;
    default: return res.status(400).json({ error: 'Unknown action.' });
  }
  return res.status(r.status).json(r.body);
}, { label: '[circle]' });
