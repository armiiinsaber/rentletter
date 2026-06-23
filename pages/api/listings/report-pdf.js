// /api/listings/report-pdf?listingId=...
// Realtor-authenticated, white-label landlord report PDF download. Authorizes
// listing ownership via RLS, reads the shortlist (service-role, owner_token
// stripped), and streams a branded PDF. GET so it can be opened/downloaded directly.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadReportContext } from '../../../lib/listingReportData';
import { buildLandlordReportPdf } from '../../../lib/landlordReportPdf';

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

  try {
    const admin = getSupabaseAdminClient();
    const ctx = await loadReportContext(supabase, admin, listingId, user.id);
    if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
    if (ctx.shortlisted.length === 0) {
      return res.status(400).json({ error: 'Shortlist some applicants first.' });
    }
    const bytes = await buildLandlordReportPdf(ctx);
    const slug = String(ctx.listing.name || ctx.listing.address || 'listing').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    const filename = `shortlist-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', bytes.length);
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    console.error('[listings/report-pdf] error:', e?.message || e);
    return res.status(500).json({ error: 'Failed to generate PDF.' });
  }
}
