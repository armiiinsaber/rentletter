// /api/report/answer  POST { token, rank, answer: 'meet' | 'pass' }
// PUBLIC. The landlord's answer on the report page. The token is the credential: it names one
// snapshot; the answer lands in answers[rank] with a time, landlord_answered is recorded under
// the realtor's profile, and the realtor's signals cache is cleared. Rate limited like the
// application form. Sandbox tokens (DEMO…) answer without writing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { isReportToken } from '../../../lib/applicationIds';
import { snapshotByToken } from '../../../lib/reportSnapshotStore';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, rank, answer } = req.body || {};
  const t = String(token || '');
  const r = Number(rank);
  if (!isReportToken(t) && !/^DEMO-[a-z0-9-]{1,40}$/.test(t)) return res.status(400).json({ error: 'This link is not valid.' });
  if (!Number.isInteger(r) || r < 1 || r > 50) return res.status(400).json({ error: 'rank is required.' });
  if (!['meet', 'pass'].includes(answer)) return res.status(400).json({ error: 'answer must be meet or pass.' });
  const at = new Date().toISOString();
  // Sandbox: nothing is written and nothing is counted.
  if (t.startsWith('DEMO-')) return res.status(200).json({ ok: true, rank: r, answer, at, sandbox: true });
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `answer:${t}`, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
  try {
    const admin = getSupabaseAdminClient();
    const row = await snapshotByToken(admin, t);
    if (!row) return res.status(404).json({ error: 'This report is not available.' });
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'This report has expired.' });
    const applicant = ((row.payload && row.payload.applicants) || []).find((a) => Number(a.rank) === r);
    if (!applicant) return res.status(400).json({ error: 'No applicant at that rank.' });
    const answers = { ...(row.answers && typeof row.answers === 'object' ? row.answers : {}), [String(r)]: { answer, at } };
    const { error } = await admin.from('report_snapshots').update({ answers }).eq('id', row.id);
    if (error) throw error;
    await recordEvent(admin, { profileId: row.profile_id, listingId: row.listing_id || null, type: 'landlord_answered', payload: { rank: r, answer, applicantName: applicant.name || null, listingName: row.payload?.listing?.address || null, sentToName: row.sent_to_name || null, snapshotId: row.id } });
    invalidateSignals(row.profile_id);
    return res.status(200).json({ ok: true, rank: r, answer, at });
  } catch (e) {
    logServerError('[report/answer]', e, { token: t.slice(0, 6) });
    return res.status(500).json({ error: 'Could not save that. Please try again.' });
  }
}
