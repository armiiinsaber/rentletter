// /api/tenant/verify  The magic link's action. GET writes nothing: it sends the tenant to
// /my-application/confirm?t=…, which reads the token and shows one button. POST (the button)
// consumes the single use token, opens a 30 day session (httpOnly cookie) and redirects to the
// profile. Mail scanners follow GETs, never POST a form, so a scanned link no longer signs in.
import { kvReady, consumeMagicLink, ensureProfileForEmail, blankProfile, saveProfile, createSession, setSessionCookie } from '../../../lib/tenantProfileStore';

export function createHandler({ ready = kvReady, consume = consumeMagicLink, ensure = ensureProfileForEmail, save = saveProfile, session = createSession, setCookie = setSessionCookie } = {}) {
  return async function handler(req, res) {
    const t = String((req.method === 'POST' ? req.body?.t : req.query?.t) || '');
    if (req.method === 'GET') return res.redirect(302, `/my-application/confirm?t=${encodeURIComponent(t)}`);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!ready()) return res.redirect(303, '/my-application?link=unavailable');
    const email = await consume(t);
    if (!email) return res.redirect(303, '/my-application?link=expired');
    try {
      let profile = await ensure(email);
      if (!profile) profile = await save(blankProfile(email));
      const token = await session(profile.id);
      setCookie(res, token);
      return res.redirect(303, '/my-application');
    } catch (e) {
      console.error('[tenant/verify] failed', e?.message || e);
      return res.redirect(303, '/my-application?link=error');
    }
  };
}
export default createHandler();
