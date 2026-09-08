// /api/references/answer  POST { token, answers }. PUBLIC. The tap on /ref/{token}: writes the
// closed answers and answered_at, sets status answered, sets confirmations.landlord_reference on
// the junction row (lib/referenceStore.js answerRequest), records reference_answered and clears
// the realtor's signals cache. Refuses expired and already answered rows. Rate limited like the
// application form. Nothing is written on a page load, only here. Sandbox tokens (demo-ref…)
// answer without writing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { answerRequest, isReferenceToken, tableAbsent } from '../../../lib/referenceStore';
import { normalizeAnswers } from '../../../lib/referenceQuestions';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, answers } = req.body || {};
  const t = String(token || '');
  if (!isReferenceToken(t)) return res.status(400).json({ error: 'This link is not valid.' });
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `ref:${t}`, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
  if (/^demo-ref/.test(t)) {
    if (t === 'demo-ref-expired') return res.status(410).json({ error: 'This link has expired. Nothing was saved.' });
    if (t === 'demo-ref-answered') return res.status(409).json({ error: 'Already answered. Nothing changed.' });
    if (!normalizeAnswers(answers)) return res.status(400).json({ error: 'Please use the options on the page.' });
    return res.status(200).json({ ok: true, realtorName: 'Sarah Chen', sandbox: true });
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
  try {
    const admin = getSupabaseAdminClient();
    const r = await answerRequest(admin, t, answers);
    if (r.status !== 200) return res.status(r.status).json(r.body);
    if (r.junction) await recordEvent(admin, { profileId: r.row.profile_id, listingId: r.junction.listing_id || null, applicationId: r.junction.application_id || null, type: 'reference_answered', payload: { applicantName: r.applicantName, linkId: r.junction.id, notTheirTenant: !!r.row.answers?.notTheirTenant } });
    invalidateSignals(r.row.profile_id);
    return res.status(200).json(r.body);
  } catch (e) {
    if (tableAbsent(e)) return res.status(503).json({ error: 'Not available yet.' });
    logServerError('[references/answer]', e, { token: t.slice(0, 6) });
    return res.status(500).json({ error: 'Could not save that. Please try again.' });
  }
}
