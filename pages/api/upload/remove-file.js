// /api/upload/remove-file
// PUBLIC. A tenant can take a file back until they submit. Each file is analysed and held for the
// realtor the moment it is added (analyze-file.js), so removing it here deletes that file's staged
// facts, its stored object and marks its row (deleted_by 'tenant removed', lib/documentStore.js
// purgeStoredDocument). The docreq token is the authorization, as in analyze-file; the same
// limiter applies under its own key so removals never eat the analysis budget. After finalize the
// request is received and nothing can be removed here: the realtor holds the files from then on.
// The realtor's own upload path has no equivalent, the realtor is the holder and deletes from the
// Documents held list.
//
//   POST { token, index }  ->  { ok, removed, staged, set }   set: lib/documentSet.js setStatus
import { kvReady, kvGetJson, kvSetJson, reqKey, stagingKey, isDocReqToken, STAGING_TTL } from '../../../lib/docRequest';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { purgeStoredDocument } from '../../../lib/documentStore';
import { setStatus } from '../../../lib/documentSet';

const defaultAdmin = () => (isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null);

export function createHandler({ ready = kvReady, getJson = kvGetJson, setJson = kvSetJson, limiter = { incr: kvIncr, expire: kvExpire }, getAdmin = defaultAdmin, purge = purgeStoredDocument } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!ready()) return res.status(503).json({ error: 'Service unavailable.' });
    const { token, index } = req.body || {};
    if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });
    const idx = Number(index);
    if (!Number.isFinite(idx)) return res.status(400).json({ error: 'Which file?' });
    const clientIp = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const limited = await checkSubmitLimits(limiter, { token: `remove:${token}`, ip: clientIp });
    if (!limited.ok) return res.status(429).json({ error: limited.message });

    const rec = await getJson(reqKey(token));
    if (!rec) return res.status(404).json({ error: 'This upload link has expired or is no longer active.' });
    if (rec.status === 'received') return res.status(409).json({ error: 'Your documents were already sent. Ask your realtor to remove a file.' });

    const staging = (await getJson(stagingKey(token))) || {};
    const items = staging.items && typeof staging.items === 'object' ? staging.items : {};
    const fkey = Object.keys(items).find((k) => Number(items[k] && items[k].index) === idx);
    if (!fkey) return res.status(404).json({ error: 'That file is not in this submission.' });
    const item = items[fkey];
    delete items[fkey];

    // The held object and row, scoped to this applicant. A missing table or row is not an error
    // for the tenant: the staged facts are gone either way.
    let purged = 0;
    if (item.documentId && rec.linkId) {
      try { const admin = getAdmin(); if (admin) purged = (await purge(admin, { id: item.documentId, linkId: rec.linkId, deletedBy: 'tenant removed' })).count || 0; }
      catch (e) { console.error('[upload/remove-file] purge error:', e?.message || e); }
    }

    staging.items = items;
    staging.updatedAt = new Date().toISOString();
    await setJson(stagingKey(token), staging, STAGING_TTL);
    const set = setStatus(Object.values(items).map((it) => it && it.document).filter(Boolean));
    return res.status(200).json({ ok: true, removed: idx, purged, staged: Object.keys(items).length, set });
  };
}

export default createHandler();
