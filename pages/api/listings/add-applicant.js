// /api/listings/add-applicant
// Realtor-authenticated "add by RL number" path. The realtor pastes an existing
// RL onto one of their listings. We authorize ownership of the listing (RLS via
// the realtor's session), read app:{RL} from KV, mirror it into Supabase
// `applications` (service-role), and link it via `listing_applicants`
// (added_via='lookup'). Mirrors lookup.js semantics (rejects revoked apps).
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { kvGet } from '../../../lib/kv';
import { upsertApplication, linkApplicantToListing } from '../../../lib/supabaseBridge';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, applicationNumber } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });
  const appNum = String(applicationNumber || '').trim().toUpperCase();
  if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(appNum)) {
    return res.status(400).json({ error: 'Invalid application number. Expected RL-YYYY-XXXX-XXXX.' });
  }

  // Authorize: the realtor must own this listing (RLS — only the owner can read it).
  const { data: listing, error: listErr } = await supabase
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle();
  if (listErr || !listing) return res.status(404).json({ error: 'Listing not found.' });

  const app = await kvGet(`app:${appNum}`);
  if (!app) return res.status(404).json({ error: 'Application not found. Check the number and try again.' });
  if (app.revoked) return res.status(410).json({ error: 'This application has been revoked by the tenant.' });

  try {
    const admin = getSupabaseAdminClient();
    const applicationId = await upsertApplication(admin, app);
    await linkApplicantToListing(admin, listing.id, applicationId, 'lookup');
    return res.status(200).json({ ok: true, applicationNumber: appNum });
  } catch (e) {
    console.error('[listings/add-applicant] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not add applicant.' });
  }
}
