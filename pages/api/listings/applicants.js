// /api/listings/applicants?listingId=...
// Realtor-authenticated read of a listing's applicants. Authorizes ownership via
// RLS (realtor session), then reads the junction + joined application bodies with
// the service-role client (applications has no realtor RLS). owner_token stripped.
// Used to refresh the dashboard after adding an applicant.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { fetchListingApplicants } from '../../../lib/supabaseBridge';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const listingId = String(req.query.listingId || '');
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });

  // Authorize: realtor must own the listing (RLS — only owner can read it).
  const { data: listing, error: listErr } = await supabase
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle();
  if (listErr || !listing) return res.status(404).json({ error: 'Listing not found.' });

  try {
    const admin = getSupabaseAdminClient();
    const applicants = await fetchListingApplicants(admin, listing.id);
    return res.status(200).json({ applicants });
  } catch (e) {
    console.error('[listings/applicants] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load applicants.' });
  }
}
