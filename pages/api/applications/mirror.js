// /api/applications/mirror
// PUBLIC bridge endpoint, called by /apply/[token] AFTER the tenant's submission
// was written to KV (generate.js) and linked to the invite (tag-invite-submission.js).
// It mirrors the KV app:{RL} into Supabase `applications` (service-role) and links
// it to the invite's listing via `listing_applicants` (added_via='invite').
//
// Non-blocking by design: if Supabase isn't configured it no-ops with 200 so the
// tenant flow is never affected. KV remains the source of truth for the tenant path.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvGet, kvLrange } from '../../../lib/kv';
import { upsertApplication, linkApplicantToListing } from '../../../lib/supabaseBridge';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, applicationNumber } = req.body || {};
  if (!token || !/^[a-f0-9]{20}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid invite token.' });
  }
  const appNum = String(applicationNumber || '').trim().toUpperCase();
  if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(appNum)) {
    return res.status(400).json({ error: 'Invalid application number.' });
  }

  // No-op (not an error) when Supabase isn't set up — keeps the tenant flow intact.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ ok: false, skipped: 'supabase-unconfigured' });
  }

  // Legitimacy: the RL must actually have been submitted through THIS invite.
  const subs = await kvLrange(`invite_submissions:${token}`);
  if (!subs.map(String).includes(appNum)) {
    return res.status(403).json({ error: 'Application is not associated with this invite.' });
  }

  const app = await kvGet(`app:${appNum}`);
  if (!app) return res.status(404).json({ error: 'Application not found in KV.' });

  try {
    const admin = getSupabaseAdminClient();
    // Resolve the Supabase listing this invite belongs to (invite_token was written
    // onto the listing by /api/listings/invite).
    const { data: listing } = await admin
      .from('listings')
      .select('id')
      .eq('invite_token', token)
      .maybeSingle();

    const applicationId = await upsertApplication(admin, app);
    let linked = false;
    if (listing?.id) {
      await linkApplicantToListing(admin, listing.id, applicationId, 'invite');
      linked = true;
    }
    return res.status(200).json({ ok: true, mirrored: true, linked });
  } catch (e) {
    console.error('[applications/mirror] error:', e?.message || e);
    return res.status(500).json({ error: 'Mirror failed.' });
  }
}
