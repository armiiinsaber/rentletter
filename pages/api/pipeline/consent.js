// /api/pipeline/consent  POST { inviteToken, email }
// PUBLIC. A tenant who reached a rented invite link asks the realtor to keep them in mind. The
// token must resolve to an invite record; the listing (by invite_token) gives the realtor. Writes
// one pipeline_consents row with status consented and a 60 day expiry. No account is created.
// Rate limited like the application form (lib/rateLimit.js). Sandbox tokens (demo…) answer
// without writing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { newConsentToken, consentExpiry, statusTableAbsent } from '../../../lib/listingStatus';
import { logServerError } from '../../../lib/serverLog';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const done = (name) => `Done. ${name || 'Your realtor'} will be in touch if something fits.`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { inviteToken, email } = req.body || {};
  const token = String(inviteToken || '');
  if (!/^[a-f0-9]{20}$/.test(token) && !/^demo\d{16}$/.test(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `consent:${token}`, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
  if (/^demo\d{16}$/.test(token)) return res.status(200).json({ ok: true, message: done('Sarah Chen'), sandbox: true });
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
  try {
    const base = process.env.KV_REST_API_URL.replace(/\/+$/, '');
    const r = await fetch(`${base}/get/linvite:${token}`, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
    const d = await r.json();
    if (!d?.result) return res.status(404).json({ error: 'This link has expired.' });
    const record = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
    const admin = getSupabaseAdminClient();
    const { data: listing } = await admin.from('listings').select('id, profile_id, name, address').eq('invite_token', token).maybeSingle();
    const profileId = listing?.profile_id || record.profileId || null;
    if (!profileId) return res.status(409).json({ error: 'This link can no longer take requests.' });
    const { error } = await admin.from('pipeline_consents').insert({ profile_id: profileId, listing_id: listing?.id || null, application_id: null, email: String(email).trim().toLowerCase(), token: newConsentToken(), status: 'consented', consented_at: new Date().toISOString(), expires_at: consentExpiry() });
    if (error) { if (statusTableAbsent(error)) return res.status(503).json({ error: 'Not available yet.' }); throw error; }
    return res.status(200).json({ ok: true, message: done(record.realtorName) });
  } catch (e) {
    logServerError('[pipeline/consent]', e, { token });
    return res.status(500).json({ error: 'Could not save that. Please try again.' });
  }
}
