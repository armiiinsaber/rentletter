// /api/admin/login — POST { password }. 5 attempts / 15 min / IP. Same response shape for
// wrong password and rate-limited, no detail. Never logs the password.
import { adminConfigured, passwordMatches, loginRateLimited, createAdminSession, setAdminCookie, audit } from '../../../lib/adminAuth';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!adminConfigured()) return res.status(503).json({ error: 'Admin is not configured (ADMIN_PASSWORD / KV).' });
  if (await loginRateLimited(req)) {
    await audit(req, 'login.rate_limited');
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  if (!passwordMatches(req.body?.password)) {
    await audit(req, 'login.failed');
    return res.status(401).json({ error: 'That’s not it.' });
  }
  const token = await createAdminSession();
  setAdminCookie(res, token);
  await audit(req, 'login.ok');
  return res.status(200).json({ ok: true });
}
