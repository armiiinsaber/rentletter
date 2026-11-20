// /api/circle/brokerage  POST { action }. The caller's own brokerage record (lib/brokerage.js,
// db/021-realtor-circle.sql). A realtor route: session and entitlement through
// lib/realtorRoute.js withRealtor; the record written is the one the caller is the active
// member of and entered themselves, found from the caller's own id and never from the request.
//   save   { legalName, address, phone, brokerName, brokerEmail, hstNumber }
//                             saves it and emails the broker of record their single use link
//   resend                    sends the broker of record a fresh link
import { withRealtor } from '../../../lib/realtorRoute';
import { saveBrokerage, resendConfirmation } from '../../../lib/brokerage';

export default withRealtor(async ({ user, admin }, req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ctx = { admin, userId: user.id };
  let r;
  if (body.action === 'save') r = await saveBrokerage({ ...ctx, body });
  else if (body.action === 'resend') r = await resendConfirmation(ctx);
  else return res.status(400).json({ error: 'Unknown action.' });
  return res.status(r.status).json(r.body);
}, { label: '[circle/brokerage]' });
