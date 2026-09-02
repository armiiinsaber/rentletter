// /api/documents/open  POST { documentId }
// A 60 second signed URL to one held document, for the owning realtor's in app viewer. Session,
// entitlement, then the explicit ownership check (the junction row's listing.profile_id must be
// the signed in user, lib/ownApplicant.js). Counts the open and records document_opened.
// Returns { url, mime, kind }. The URL is a signed storage URL: no owner_token, no path in the
// response beyond what the browser needs to fetch the file once.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { ownedApplicant } from '../../../lib/ownApplicant';
import { recordEvent } from '../../../lib/events';
import { logServerError } from '../../../lib/serverLog';
import { DOCUMENTS_BUCKET, tableAbsent } from '../../../lib/documentStore';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Read of a held document: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;

  const { documentId } = req.body || {};
  if (!documentId || typeof documentId !== 'string') return res.status(400).json({ error: 'documentId is required.' });

  try {
    const admin = getSupabaseAdminClient();
    const { data: doc, error } = await admin.from('applicant_documents').select('*').eq('id', documentId).maybeSingle();
    if (error) { if (tableAbsent(error)) return res.status(503).json({ error: 'Documents are not set up yet (run db/documents.sql).' }); throw error; }
    if (!doc || doc.deleted_at) return res.status(404).json({ error: 'That document is no longer held.' });
    // Explicit ownership: the junction row's listing must belong to this user.
    const own = await ownedApplicant(admin, doc.listing_applicant_id, user.id);
    if (!own) return res.status(own === null ? 404 : 403).json({ error: own === null ? 'Applicant not found.' : 'Not your applicant.' });
    if (String(doc.profile_id) !== String(user.id)) return res.status(403).json({ error: 'Not your applicant.' });

    const { data: signed, error: sErr } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 60, { download: false });
    if (sErr || !signed?.signedUrl) { logServerError('[documents/open] signed url', sErr || new Error('no url'), { documentId }); return res.status(500).json({ error: 'Could not open that document. Try again.' }); }

    const openedAt = new Date().toISOString();
    const { error: upErr } = await admin.from('applicant_documents').update({ opened_count: (doc.opened_count || 0) + 1, last_opened_at: openedAt }).eq('id', doc.id);
    if (upErr) logServerError('[documents/open] count', upErr, { documentId });
    await recordEvent(admin, { profileId: user.id, listingId: own.listing.id, applicationId: own.junction.application_id, type: 'document_opened', payload: { kind: doc.kind || 'unknown', linkId: own.junction.id, listingName: own.listing.name || own.listing.address || null } });
    return res.status(200).json({ url: signed.signedUrl, mime: doc.mime || null, kind: doc.kind || 'unknown' });
  } catch (e) {
    logServerError('[documents/open]', e, { documentId, userId: user.id });
    return res.status(500).json({ error: 'Could not open that document. Try again.' });
  }
}
