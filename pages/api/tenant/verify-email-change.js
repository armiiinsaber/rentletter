// /api/tenant/verify-email-change  Clicked from the NEW address. GET writes nothing and sends
// the tenant to /my-application/confirm?t=…&k=email; POST (the button there) consumes the token
// and re keys the profile.
import { kvReady, consumeEmailChange, applyEmailChange } from '../../../lib/tenantProfileStore';

export function createHandler({ ready = kvReady, consume = consumeEmailChange, apply = applyEmailChange } = {}) {
  return async function handler(req, res) {
    const t = String((req.method === 'POST' ? req.body?.t : req.query?.t) || '');
    if (req.method === 'GET') return res.redirect(302, `/my-application/confirm?t=${encodeURIComponent(t)}&k=email`);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!ready()) return res.redirect(303, '/my-application?email=unavailable');
    const rec = await consume(t);
    if (!rec) return res.redirect(303, '/my-application?email=expired');
    const r = await apply(rec.profileId, rec.newEmail);
    if (!r.ok) return res.redirect(303, `/my-application?email=${r.reason === 'taken' ? 'taken' : 'error'}`);
    return res.redirect(303, '/my-application?email=changed');
  };
}
export default createHandler();
