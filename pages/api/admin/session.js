// /api/admin/session — GET → 200 { ok: true } when the request carries a live admin session,
// 401 otherwise. One KV read. The sign-in form polls this after /api/admin/login so the
// dashboard only renders once the session is actually readable (the session store replicates
// asynchronously; the request right after sign-in used to race it and lose).
import { requireAdmin } from '../../../lib/adminAuth';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAdmin(req, res))) return;
  return res.status(200).json({ ok: true });
}
