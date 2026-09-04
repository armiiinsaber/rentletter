// /api/listings/report-text  POST { listingId }
// Realtor authenticated, entitlement gated. The paste ready message for the landlord, a template
// over the same payload a send freezes (lib/reportText.js): no model call. When the listing has a
// sent snapshot, the message carries that page's link; otherwise it carries no link.
import { recordEvent } from '../../../lib/events';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadReportContext } from '../../../lib/listingReportData';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { buildSnapshot } from '../../../lib/reportSnapshot';
import { reportText } from '../../../lib/reportText';
import { latestSnapshots } from '../../../lib/reportSnapshotStore';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  if (!(await requireEntitlement(req, res, supabase, user))) return;
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });
  try {
    const admin = getSupabaseAdminClient();
    const ctx = await loadReportContext(supabase, admin, listingId, user.id);
    if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
    if (ctx.active.length === 0) return res.status(400).json({ error: 'No applicants to present yet.' });
    const payload = buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: { ...ctx.profile, email: ctx.profile?.email || user.email } });
    const latest = (await latestSnapshots(admin, [ctx.listing.id])).get(String(ctx.listing.id));
    const pageUrl = latest ? `https://rentletter.ca/r/${latest.meta.token}` : null;
    const text = reportText(payload, { pageUrl });
    await recordEvent(admin, { profileId: user.id, listingId: ctx.listing.id, type: 'report_generated', payload: { listingName: ctx.listing.name || ctx.listing.address || null, format: 'text' } });
    return res.status(200).json({ text });
  } catch (e) {
    logServerError('[listings/report-text]', e, { listingId });
    return res.status(500).json({ error: 'Could not compose the message. Please try again.' });
  }
}
