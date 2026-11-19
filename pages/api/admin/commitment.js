// /api/admin/commitment  GET. The founder office's Commitment section (components/admin/
// Commitment.js): every metric counted now (lib/kpis.js), and the chart's twelve months from
// public.kpi_daily when db/013 has run (history.exists false before that). Behind the office's one
// gate (lib/adminAuth.js requireAdmin). Numbers only: no realtor's or tenant's name, email or row.
// partner: the Lead Realtor Partner counts (lib/kpiStore.js partnerSection), or { configured:
// false } when KPI_PARTNER_PROFILE_ID is not set. Counted from KPI_PARTNER_START when it is set.
import { requireAdmin } from '../../../lib/adminAuth';
import { adminDb } from '../../../lib/adminData';
import { loadCommitment } from '../../../lib/kpiStore';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAdmin(req, res))) return;
  try {
    const admin = adminDb();
    if (!admin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const { kpis, history, missing, partner } = await loadCommitment(admin);
    return res.status(200).json({ generatedAt: new Date().toISOString(), kpis, history, missing, partner });
  } catch (e) { logServerError('[admin/commitment]', e); return res.status(500).json({ error: 'The commitment could not be counted.' }); }
}
