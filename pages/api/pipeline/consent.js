// /api/pipeline/consent  POST { inviteToken, email }
// PUBLIC. A tenant who reached a rented invite link asks the realtor to keep them in mind. The
// token must resolve to an invite record; the listing (by invite_token) gives the realtor. Writes
// one PENDING pipeline_consents row per email and listing with a 60 day expiry and mails the
// /keep/{token} link in the realtor's name: the consent is the tap on that page
// (pages/api/pipeline/answer.js), never the typed email. A second ask for the same listing writes
// no second row: a pending row gets its link mailed again, an answered one is left alone. No
// account is created. Rate limited like the application form (lib/rateLimit.js). Sandbox tokens
// (demo…) answer without writing.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSandboxToken } from '../../../lib/features';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { Resend } from 'resend';
import { newConsentToken, consentExpiry, statusTableAbsent, existingConsent, keepConfirmEmail, notSelectedFrom, KEEP_CONFIRM_MESSAGE } from '../../../lib/listingStatus';
import { displayLabel } from '../../../lib/listingAddress';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
import { logServerError } from '../../../lib/serverLog';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { inviteToken, email } = req.body || {};
  const token = String(inviteToken || '');
  // Sandbox first: no limiter, no client, no write (lib/features.js isSandboxToken).
  if (isSandboxToken(token)) return res.status(200).json({ ok: true, message: KEEP_CONFIRM_MESSAGE, sandbox: true });
  if (!/^[a-f0-9]{20}$/.test(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: `consent:${token}`, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
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
    const email = String(req.body.email).trim().toLowerCase();
    let row;
    try {
      row = listing?.id ? await existingConsent(admin, { listingId: listing.id, email }) : null;
    } catch (e) { if (statusTableAbsent(e)) return res.status(503).json({ error: 'Not available yet.' }); throw e; }
    if (row && row.status !== 'pending') return res.status(200).json({ ok: true, message: KEEP_CONFIRM_MESSAGE, answered: true }); // already answered: nothing changes, nothing is said
    if (!row) {
      const { data: made, error } = await admin.from('pipeline_consents').insert({ profile_id: profileId, listing_id: listing?.id || null, application_id: null, email, token: newConsentToken(), status: 'pending', expires_at: consentExpiry() }).select('id, status, token, expires_at').single();
      if (error) { if (statusTableAbsent(error)) return res.status(503).json({ error: 'Not available yet.' }); throw error; }
      row = made;
    }
    // The confirmation, in the realtor's name, reply to the realtor: the tap on /keep confirms.
    const { data: realtor } = await admin.from('profiles').select('full_name, email').eq('id', profileId).maybeSingle();
    const realtorName = realtor?.full_name || record.realtorName || 'Your realtor';
    const mail = keepConfirmEmail({ listingName: displayLabel(listing, record.listingName || 'the unit'), realtorName, keepUrl: `${siteBase()}/keep/${row.token}` });
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: notSelectedFrom(realtorName), to: email, reply_to: realtor?.email || undefined, subject: mail.subject, html: mail.html, text: mail.text });
    }
    return res.status(200).json({ ok: true, message: KEEP_CONFIRM_MESSAGE });
  } catch (e) {
    logServerError('[pipeline/consent]', e, { token: token.slice(0, 6) });
    return res.status(500).json({ error: 'Could not save that. Please try again.' });
  }
}
