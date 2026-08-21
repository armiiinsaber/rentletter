// /api/tenant/verify?t=… — the magic link. Consumes the single-use token, opens a 30-day
// session (httpOnly cookie), and redirects to the profile. Expired/used → back with a reason.
import { kvReady, consumeMagicLink, ensureProfileForEmail, blankProfile, saveProfile, createSession, setSessionCookie } from '../../../lib/tenantProfileStore';

export default async function handler(req, res) {
  if (!kvReady()) return res.redirect(302, '/my-application?link=unavailable');
  const email = await consumeMagicLink(String(req.query.t || ''));
  if (!email) return res.redirect(302, '/my-application?link=expired');
  try {
    let profile = await ensureProfileForEmail(email);
    if (!profile) profile = await saveProfile(blankProfile(email));
    const token = await createSession(profile.id);
    setSessionCookie(res, token);
    return res.redirect(302, '/my-application');
  } catch (e) {
    console.error('[tenant/verify] failed', e?.message || e);
    return res.redirect(302, '/my-application?link=error');
  }
}
