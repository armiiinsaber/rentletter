// /api/applicants/doc-request-status
// Realtor-authenticated. Returns the tenant document-request status for ONE applicant so the
// realtor UI can show "requested — pending" / "received". Reads the per-applicant KV pointer.
// No files or tenant secrets are exposed — just the status, the link, and timestamps.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant } from '../../../lib/applicantAnalysis';
import { kvReady, kvGetJson, appKey, isDocReqToken } from '../../../lib/docRequest';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const listingId = String(req.query.listingId || '');
  const linkId = String(req.query.linkId || '');
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });

  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  const tenantEmail = String(ctx.application?.email || '').trim().toLowerCase() || null;

  if (!kvReady()) return res.status(200).json({ status: null, tenantEmail });

  const ptr = await kvGetJson(appKey(linkId));
  if (!ptr || !isDocReqToken(ptr.token)) {
    return res.status(200).json({ status: null, tenantEmail });
  }
  return res.status(200).json({
    status: ptr.status || 'requested',
    token: ptr.token,
    url: `https://rentletter.ca/upload/${ptr.token}`,
    requestedAt: ptr.requestedAt || null,
    receivedAt: ptr.receivedAt || null,
    fileCount: ptr.fileCount || 0,
    tenantEmail,
  });
}
