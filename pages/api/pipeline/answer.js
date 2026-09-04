// /api/pipeline/answer  POST { token, answer: 'yes' | 'no' }
// PUBLIC. The tap on /keep/{token}. Flips the pipeline_consents row to consented (with
// consented_at) or declined; refuses expired rows and rows already answered. Nothing flips on a
// page load, only here. Rate limited like the application form (lib/rateLimit.js). Sandbox
// tokens (demo…) answer without writing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { flipConsent, statusTableAbsent } from '../../../lib/listingStatus';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, answer } = req.body || {};
  const t = String(token || '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(t)) return res.status(400).json({ error: 'This link is not valid.' });
  if (!['yes', 'no'].includes(answer)) return res.status(400).json({ error: 'answer must be yes or no.' });
  const status = answer === 'yes' ? 'consented' : 'declined';
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `answer:${t}`, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
  if (/^demo/.test(t)) {
    if (t === 'demo-expired') return res.status(410).json({ error: 'This link has expired. Nothing was saved.' });
    if (t === 'demo-answered') return res.status(409).json({ error: 'Already answered. Nothing changed.' });
    return res.status(200).json({ ok: true, status, sandbox: true });
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
  try {
    const r = await flipConsent(getSupabaseAdminClient(), t, status);
    if (!r.found) return res.status(404).json({ error: 'This link is not valid.' });
    if (r.expired) return res.status(410).json({ error: 'This link has expired. Nothing was saved.' });
    if (r.answered) return res.status(409).json({ error: 'Already answered. Nothing changed.' });
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    if (statusTableAbsent(e)) return res.status(503).json({ error: 'Not available yet.' });
    logServerError('[pipeline/answer]', e, { token: t });
    return res.status(500).json({ error: 'Could not save that. Please try again.' });
  }
}
