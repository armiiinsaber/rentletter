// /api/tenant/verify-email-change?t=… — clicked from the NEW address. Re-keys the profile.
import { kvReady, consumeEmailChange, applyEmailChange } from '../../../lib/tenantProfileStore';

export default async function handler(req, res) {
  if (!kvReady()) return res.redirect(302, '/my-application?email=unavailable');
  const rec = await consumeEmailChange(String(req.query.t || ''));
  if (!rec) return res.redirect(302, '/my-application?email=expired');
  const r = await applyEmailChange(rec.profileId, rec.newEmail);
  if (!r.ok) return res.redirect(302, `/my-application?email=${r.reason === 'taken' ? 'taken' : 'error'}`);
  return res.redirect(302, '/my-application?email=changed');
}
