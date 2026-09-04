// /api/cron/retention  GET, daily at 03:30 (vercel.json). Bearer gated with CRON_SECRET like
// the documents cron (lib/documentStore.js cronGate). Dry run unless RETENTION_ENFORCE=true:
// logs the counts and the oldest ten application numbers, deletes nothing. See lib/retention.js.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { runRetention } from '../../../lib/retention';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  try {
    const enforce = process.env.RETENTION_ENFORCE === 'true';
    const result = await runRetention(getSupabaseAdminClient(), { enforce });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logServerError('[cron/retention]', e);
    return res.status(500).json({ error: 'Retention run failed.' });
  }
}
