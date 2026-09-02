// /api/documents/delete  POST { listingApplicantId }
// The realtor deletes every held document for one applicant: files removed from the bucket,
// rows marked deleted_at with deleted_by = the realtor's display name, document_deleted recorded
// with the count. The analysis results are untouched. Session, entitlement, explicit ownership.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { ownedApplicant, realtorName } from '../../../lib/ownApplicant';
import { recordEvent } from '../../../lib/events';
import { logServerError } from '../../../lib/serverLog';
import { purgeStoredDocuments } from '../../../lib/documentStore';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;

  const { listingApplicantId } = req.body || {};
  if (!listingApplicantId || typeof listingApplicantId !== 'string') return res.status(400).json({ error: 'listingApplicantId is required.' });

  try {
    const admin = getSupabaseAdminClient();
    // Explicit ownership: the junction row's listing must belong to this user.
    const own = await ownedApplicant(admin, listingApplicantId, user.id);
    if (!own) return res.status(own === null ? 404 : 403).json({ error: own === null ? 'Applicant not found.' : 'Not your applicant.' });

    const deletedBy = realtorName(gate.profile, user);
    const { count, absent } = await purgeStoredDocuments(admin, { linkId: own.junction.id, deletedBy });
    if (absent) return res.status(503).json({ error: 'Documents are not set up yet (run db/documents.sql).' });
    const deletedAt = new Date().toISOString();
    if (count > 0) await recordEvent(admin, { profileId: user.id, listingId: own.listing.id, applicationId: own.junction.application_id, type: 'document_deleted', payload: { count, linkId: own.junction.id, listingName: own.listing.name || own.listing.address || null } });
    return res.status(200).json({ ok: true, deleted: count, deletedAt, deletedBy });
  } catch (e) {
    logServerError('[documents/delete]', e, { listingApplicantId, userId: user.id });
    return res.status(500).json({ error: 'Could not delete those documents. Try again.' });
  }
}
