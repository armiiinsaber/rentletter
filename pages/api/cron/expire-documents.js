// /api/cron/expire-documents  GET, daily at 03:00 (vercel.json). Vercel sends
// Authorization: Bearer ${CRON_SECRET}; anything else is refused (lib/documentStore.js cronGate:
// 503 and one log line when the secret is unset, 401 on a wrong bearer). Deletes every held file
// past its expiry in batches of 100, marks the rows expired, records documents_expired per
// applicant.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate, expireDocuments } from '../../../lib/documentStore';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  try {
    const result = await expireDocuments(getSupabaseAdminClient());
    console.log('[cron/expire-documents] expired=%d applicants=%d', result.expired, result.applicants);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logServerError('[cron/expire-documents]', e);
    return res.status(500).json({ error: 'Expiry failed.' });
  }
}
