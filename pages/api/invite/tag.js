// /api/invite/tag  POST { token, applicationNumber }. PUBLIC, called by the tenant client after a
// successful submission through /apply/[token]. Records that this application was submitted
// through this invite (invite_submissions:{token}), so the mirror route can trust the pair.
// Rate limited per token and per IP (lib/rateLimit.js). The number must be a real one
// (lib/applicationIds.js) with an app:{RL} record; the invite record is rewritten with its
// remaining TTL intact.
import { kvGet, kvIncr, kvExpire, kvTtl, kvCommand } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { isApplicationNumber, normalizeApplicationNumber } from '../../../lib/applicationIds';

export function createHandler({ kv = { get: kvGet, incr: kvIncr, expire: kvExpire, ttl: kvTtl, command: kvCommand }, configured = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN), now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { token, applicationNumber } = req.body || {};
    if (!token || !/^[a-f0-9]{20}$/.test(String(token))) return res.status(400).json({ error: 'Invalid invite token.' });
    const appNum = normalizeApplicationNumber(applicationNumber);
    if (!isApplicationNumber(appNum)) return res.status(400).json({ error: 'Invalid application number.' });
    if (!configured()) return res.status(503).json({ error: 'Service unavailable.' });
    const clientIp = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const limited = await checkSubmitLimits({ incr: kv.incr, expire: kv.expire }, { token: `tag:${token}`, ip: clientIp, now: now() });
    if (!limited.ok) return res.status(429).json({ error: limited.message });
    try {
      const invite = await kv.get(`linvite:${token}`);
      if (!invite) return res.status(404).json({ error: 'Invite not found.' });
      const app = await kv.get(`app:${appNum}`);
      if (!app) return res.status(404).json({ error: 'Application not found.' });
      await kv.command(['lpush', `invite_submissions:${token}`, appNum]);
      await kv.command(['ltrim', `invite_submissions:${token}`, '0', '199']);
      // Rewrite the counters and keep the record's remaining life (a plain SET drops the TTL).
      const remaining = await kv.ttl(`linvite:${token}`);
      const next = { ...invite, submissionCount: (Number(invite.submissionCount) || 0) + 1, lastSubmissionAt: new Date(now()).toISOString() };
      await kv.command(['set', `linvite:${token}`], next);
      if (typeof remaining === 'number' && remaining > 0) await kv.expire(`linvite:${token}`, remaining);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[tag-invite-submission] error:', e?.message || e);
      return res.status(500).json({ error: 'Could not tag submission.' });
    }
  };
}

export default createHandler();
