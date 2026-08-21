import { requireAdmin, readAudit } from '../../../lib/adminAuth';
import { loadOverview } from '../../../lib/adminData';
import { logServerError } from '../../../lib/serverLog';
export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  try { const data = await loadOverview(); data.audit = await readAudit(40); return res.status(200).json(data); }
  catch (e) { logServerError('[admin/overview]', e); return res.status(500).json({ error: e?.message || 'Failed to load.' }); }
}
