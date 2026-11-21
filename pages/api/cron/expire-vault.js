// /api/cron/expire-vault  GET, daily at 03:15 (vercel.json). Vercel sends
// Authorization: Bearer ${CRON_SECRET}; anything else is refused (lib/documentStore.js cronGate:
// 503 and one log line when the secret is unset, 401 on a wrong bearer).
// The tenant's vault (lib/tenantVault.js): every stored document past its expiry is deleted,
// file and row content, and a document_expired line is written to its tenant's log; a profile
// idle for twelve months loses its stored documents, the facts read from them and its photo
// (the file, then its three columns, with photo_removed in the tenant's log); a file the
// bucket did not confirm removed is tried again, and a deleted row past 30 days is removed.
// It deletes, by default: there is no dry run. TENANT_VAULT_ENABLED=false never stops it: the
// kill switch stops new storage, and what is stored still expires on time.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { cronGate } from '../../../lib/documentStore';
import { expireVaultDocuments, expireIdleVaults, reconcileVault } from '../../../lib/tenantVault';
import { profileActivity, photoHolders, clearPhoto } from '../../../lib/tenantProfileStore';
import { logServerError } from '../../../lib/serverLog';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const refused = cronGate(req);
  if (refused) return res.status(refused.status).json({ error: refused.status === 503 ? 'CRON_SECRET is not set.' : 'Unauthorized.' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  try {
    const admin = getSupabaseAdminClient();
    const expired = await expireVaultDocuments(admin);
    let idle = null; let reconcile = null;
    if (!expired.absent) {
      try { idle = await expireIdleVaults(admin, { activityFor: profileActivity, photos: { holders: photoHolders, clear: clearPhoto } }); } catch (e) { logServerError('[cron/expire-vault] idle', e); }
      try { reconcile = await reconcileVault(admin); } catch (e) { logServerError('[cron/expire-vault] reconcile', e); }
    }
    console.log('[cron/expire-vault] expired=%d profiles=%d idle=%d', expired.expired, expired.profiles, idle ? idle.profiles : 0);
    return res.status(200).json({ ok: true, ...expired, idle, reconcile });
  } catch (e) {
    logServerError('[cron/expire-vault]', e);
    return res.status(500).json({ error: 'Expiry failed.' });
  }
}
