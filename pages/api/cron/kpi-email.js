// /api/cron/kpi-email  GET, once a day at 08:00 in Toronto. vercel.json calls it at 12:00 and at
// 13:00 UTC (08:00 in Toronto in daylight and in standard time); the run goes ahead only in the
// one whose Toronto hour is 8. Bearer gated with CRON_SECRET (lib/documentStore.js cronGate):
// when the check fails nothing is sent. Sends the six numbers and their targets (lib/kpiEmail.js)
// through Resend to the address in KPI_EMAIL_TO, which is never written in the code: unset, the
// run is skipped. The numbers are counted at send time (lib/kpis.js), the same as the office shows.
import { Resend } from 'resend';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { loadCommitment } from '../../../lib/kpiStore';
import { kpiEmail } from '../../../lib/kpiEmail';
import { torontoHour } from '../../../lib/kpis';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };
export const EMAIL_HOUR = 8;
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  const to = String(process.env.KPI_EMAIL_TO || '').trim();
  if (!to) return res.status(200).json({ ok: true, skipped: 'KPI_EMAIL_TO is not set' });
  const now = Date.now();
  if (torontoHour(now) !== EMAIL_HOUR) return res.status(200).json({ ok: true, skipped: 'not 08:00 in Toronto' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email is not configured.' });
  try {
    const { kpis } = await loadCommitment(getSupabaseAdminClient(), now);
    const mail = kpiEmail({ kpis, officeUrl: `${siteBase()}/admin` });
    const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Rentletter <hello@rentletter.ca>', to, subject: mail.subject, text: mail.text, html: mail.html });
    if (r?.error) throw new Error(r.error.message || 'send failed');
    return res.status(200).json({ ok: true, sent: true, day: kpis.dayNumber });
  } catch (e) {
    logServerError('[cron/kpi-email]', e);
    return res.status(500).json({ error: 'Email run failed.' });
  }
}
