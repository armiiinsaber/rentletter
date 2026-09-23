// /api/applicants/reconsider  POST { linkId, reason } or { linkId, undo: true }. A realtor write:
// session and entitlement through lib/realtorRoute.js withRealtor, then the explicit ownership
// check and the guarded move inside lib/realtorWrites.js reconsiderApplicant. Moves an applicant
// who was told no to reconsidered, only while the listing is live, with a reason, audited. It
// restores nothing: no document, no access. A refused move answers 409 and writes nothing.
// The re invite goes out from lib/reconsiderInvite.js once the move is stored, never on undo.
// The answer carries invite { sent, reason } and never the applicant's link or token.
import { withRealtor } from '../../../lib/realtorRoute';
import { reconsiderApplicant } from '../../../lib/realtorWrites';
import { Resend } from 'resend';
import { invalidateSignals } from '../../../lib/signalsCache';
export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const r = await reconsiderApplicant({ admin, userId: user.id, userEmail: user.email || null, profile: gate.profile, invalidate: invalidateSignals, resend }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[applicants/reconsider]' });
