// /api/cron/pipeline  GET, daily at 13:30 UTC (vercel.json). Bearer gated with CRON_SECRET like
// the other crons (lib/documentStore.js cronGate). Sends the one renewal email 7 days before a
// consent ends, and sets rows past expires_at to expired (lib/pipeline.js runPipelineCron).
import { Resend } from 'resend';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { runPipelineCron } from '../../../lib/pipeline';
import { recordEvent } from '../../../lib/events';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email is not configured.' });
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const result = await runPipelineCron({
      admin: getSupabaseAdminClient(),
      send: async (mail) => { const r = await resend.emails.send(mail); if (r?.error) throw new Error(r.error.message || 'send failed'); },
      recordEvent,
      siteBase: siteBase(),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logServerError('[cron/pipeline]', e);
    return res.status(500).json({ error: 'Pipeline run failed.' });
  }
}
