// /api/cron/kpi-snapshot  GET, once a day at 06:00 in Toronto. vercel.json calls it at 10:00 and at
// 11:00 UTC, the two hours that are 06:00 in Toronto across the year (daylight and standard time);
// the run goes ahead only in the one whose Toronto hour is 6, so the row is written once a day.
// Bearer gated with CRON_SECRET like the other crons (lib/documentStore.js cronGate): anything
// else is refused. Counts every metric (lib/kpis.js) and upserts that Toronto date's row in
// public.kpi_daily (db/013-kpi-daily.sql). Before db/013 has run it answers that the table is
// not set up and writes nothing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { writeSnapshot } from '../../../lib/kpiStore';
import { torontoHour } from '../../../lib/kpis';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };
export const SNAPSHOT_HOUR = 6;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const now = Date.now();
  if (torontoHour(now) !== SNAPSHOT_HOUR) return res.status(200).json({ ok: true, skipped: 'not 06:00 in Toronto' });
  try {
    const r = await writeSnapshot(getSupabaseAdminClient(), now);
    return res.status(200).json({ ok: true, stored: r.stored, reason: r.reason || null, day: r.row.day, missing: r.missing });
  } catch (e) {
    logServerError('[cron/kpi-snapshot]', e);
    return res.status(500).json({ error: 'Snapshot run failed.' });
  }
}
