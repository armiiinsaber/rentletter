// /api/brokerage/confirm  POST { token, answer }. The broker of record's one answer to the link
// in their email (lib/brokerage.js answerConfirmation): confirm, or not_ours ("this is not our
// agent"). No session: the link is the credential, it is single use and it expires. The answer
// is limited by connection, and a used, unknown or expired link gets one answer: 410.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { answerConfirmation } from '../../../lib/brokerage';
import { logServerError } from '../../../lib/serverLog';

const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  try {
    const key = `brokerage:answer:${ipOf(req).replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 60)}:${Math.floor(Date.now() / 3600000)}`;
    const n = await kvIncr(key); if (n === 1) await kvExpire(key, 3605);
    if (n !== null && n > 30) return res.status(429).json({ error: 'Too many requests. Try again in an hour.' });
    const r = await answerConfirmation(getSupabaseAdminClient(), String(req.body?.token || ''), String(req.body?.answer || ''));
    return res.status(r.status).json(r.body);
  } catch (e) {
    logServerError('[brokerage/confirm]', e, {});
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
