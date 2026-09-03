// /api/applicants/confirm  POST { linkId, key, on }
// The realtor confirms a screenable fact for one applicant: key in id | employer | landlord |
// reference; on true records { at: now, by: display name }, on false removes it. Realtor
// authenticated, entitlement gated, explicit ownership check (the junction row's listing must
// carry profile_id === user.id, lib/ownApplicant.js), written through the service role into listing_applicants.confirmations
// (db/screening.sql). Records applicant_confirmed on the timeline. Returns the new object.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { invalidateSignals } from '../../../lib/signalsCache';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { recordEvent } from '../../../lib/events';
import { ownedApplicant, realtorName } from '../../../lib/ownApplicant';
import { logServerError } from '../../../lib/serverLog';

const KEYS = ['id', 'employer', 'landlord', 'reference'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;

  const { linkId, key, on } = req.body || {};
  if (!linkId || !KEYS.includes(key) || typeof on !== 'boolean') return res.status(400).json({ error: 'linkId, a known key and on are required.' });

  try {
    const admin = getSupabaseAdminClient();
    // Explicit ownership: the junction row's listing must carry profile_id === user.id.
    const own = await ownedApplicant(admin, linkId, user.id);
    if (!own) return res.status(own === null ? 404 : 403).json({ error: own === null ? 'Applicant not found.' : 'Not your applicant.' });
    const { junction, listing: owned } = own;

    const by = realtorName(gate.profile, user);
    const current = junction.confirmations && typeof junction.confirmations === 'object' ? junction.confirmations : {};
    const next = { ...current };
    if (on) next[key] = { at: new Date().toISOString(), by }; else delete next[key];

    const { error: upErr } = await admin.from('listing_applicants').update({ confirmations: next }).eq('id', junction.id);
    if (upErr) {
      logServerError('[applicants/confirm]', upErr, { linkId, key, on, userId: user.id });
      const missing = /confirmations/.test(String(upErr.message || ''));
      return res.status(missing ? 503 : 500).json({ error: missing ? 'Confirmations are not set up yet (run db/screening.sql).' : 'Could not save that. Try again.' });
    }
    let applicantName = null;
    try { const { data: app } = await admin.from('applications').select('full_name').eq('id', junction.application_id).maybeSingle(); applicantName = app?.full_name || null; } catch (e) { /* name is decoration on the event */ }
    await recordEvent(admin, { profileId: user.id, listingId: owned.id, applicationId: junction.application_id, type: 'applicant_confirmed', payload: { key, on, applicantName, listingName: owned.name || owned.address || null, linkId: junction.id } });
    invalidateSignals(user.id);
    return res.status(200).json({ ok: true, confirmations: next });
  } catch (e) {
    logServerError('[applicants/confirm]', e, { linkId, key, on, userId: user.id });
    return res.status(500).json({ error: 'Could not save that. Try again.' });
  }
}
