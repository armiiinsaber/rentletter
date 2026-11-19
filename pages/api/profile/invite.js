// /api/profile/invite  POST. Invite a realtor: the caller's own invite link and the realtors who
// joined through it (lib/realtorInvite.js). A realtor write, since the first call makes the
// caller's code: session and entitlement through lib/realtorRoute.js withRealtor, then every
// query keyed by the caller's own id inside loadRealtorInvite (the ownership check). Answers
//   { available: true, code, link, invited: [{ name, joinedAt }] }
//   { available: false }   before db/017-realtor-invites.sql has run
// and nothing else about an invited realtor: no email, plan, listing, applicant or number.
import { withRealtor } from '../../../lib/realtorRoute';
import { loadRealtorInvite } from '../../../lib/realtorInvite';
export default withRealtor(async ({ user, admin }, req, res) => {
  const r = await loadRealtorInvite({ admin, userId: user.id });
  return res.status(r.status).json(r.body);
}, { label: '[profile/invite]' });
