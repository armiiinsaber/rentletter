// /api/admin/brokerages  Founder only (admin session, server checked). The office review of
// brokerage records (lib/brokerage.js; docs/design/profile-and-circle.md section 9.5).
//   GET                              -> { available, brokerages }
//   POST { action: 'approve', id }   -> confirmed, only where the broker of record has confirmed
//   POST { action: 'suspend', id }   -> suspended
import { requireAdmin, audit } from '../../../lib/adminAuth';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { listBrokeragesForReview, approveBrokerage, suspendBrokerage } from '../../../lib/brokerage';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Database not configured.' });
  try {
    const admin = getSupabaseAdminClient();
    if (req.method === 'GET') return res.status(200).json(await listBrokeragesForReview(admin));
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {}; const id = String(b.id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).json({ error: 'Bad id.' });
    if (b.action === 'approve') { const r = await approveBrokerage(admin, id); if (r.status === 200) await audit(req, 'brokerage_approve', { id }); return res.status(r.status).json(r.body); }
    if (b.action === 'suspend') { const r = await suspendBrokerage(admin, id); if (r.status === 200) await audit(req, 'brokerage_suspend', { id }); return res.status(r.status).json(r.body); }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[admin/brokerages]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'That did not save.' });
  }
}
