// /api/cron/nudges  GET, daily at 13:00 UTC (vercel.json), which is 09:00 in Toronto during
// daylight time and 08:00 in winter. Bearer gated with CRON_SECRET like the other crons
// (lib/documentStore.js cronGate). Reads the docreq-pending set and sends the 48 hour and 5 day
// reminders in the realtor's name (lib/nudges.js). Nothing else changes.
import { Resend } from 'resend';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { runNudges } from '../../../lib/nudges';
import { recordEvent } from '../../../lib/events';
import { kvReady, kvSmembers, kvMgetJson, kvSetJson, kvSrem, appKey, uploadUrl, DOCREQ_TTL } from '../../../lib/docRequest';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY || !kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email is not configured.' });
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const result = await runNudges({
      admin: getSupabaseAdminClient(),
      kv: { smembers: kvSmembers, mget: kvMgetJson, set: kvSetJson, srem: kvSrem, appKey, uploadUrl, ttl: DOCREQ_TTL },
      send: async (mail) => { const r = await resend.emails.send(mail); if (r?.error) throw new Error(r.error.message || 'send failed'); },
      recordEvent,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logServerError('[cron/nudges]', e);
    return res.status(500).json({ error: 'Nudge run failed.' });
  }
}
