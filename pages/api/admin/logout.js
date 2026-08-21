import { destroyAdminSession, setAdminCookie } from '../../../lib/adminAuth';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await destroyAdminSession(req);
  setAdminCookie(res, '', { clear: true });
  return res.status(200).json({ ok: true });
}
