// /api/applicants/manage-analysis
// Realtor-authenticated. Archive / delete a document analysis on ONE applicant's own
// listing_applicants row. SAME authorization + strict two-key binding (linkId + applicationId)
// as analyze-documents / clear-analysis, so a realtor can only act on an applicant of a listing
// they own, and only the exact intended row is ever written.
//
// Actions (validated server-side):
//   archive         → move the ACTIVE report (+ its ai_insight) into archived[]; clear active +
//                     ai_insight; docs_verified = false.
//   delete          → permanently drop the ACTIVE report; clear active + ai_insight;
//                     docs_verified = false. Archived history is NOT touched.
//   delete-archived → remove ONE archived entry by id. Active is NOT touched.
// The jsonb is stored in the {active,archived} shape (see lib/docVerifications); old rows upgrade
// transparently. owner_token is never selected or returned.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant } from '../../../lib/applicantAnalysis';
import { normalizeDocV, withArchivedActive, withoutActive, withoutArchived } from '../../../lib/docVerifications';

const ACTIONS = new Set(['archive', 'delete', 'delete-archived']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, applicationId, action, archivedId } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unknown action.' });
  if (action === 'delete-archived' && !archivedId) return res.status(400).json({ error: 'Missing archived reference.' });

  // Authorize: realtor must own the listing AND this link must be on it.
  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[manage-analysis] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  // STRICT per-applicant binding: only write the row that matches BOTH the linkId AND the
  // intended application — never a different applicant's row.
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    console.error('[manage-analysis] applicant binding mismatch — linkId row application_id',
      ctx.junction.application_id, '!== expected', applicationId, '(refusing to write)');
    return res.status(409).json({ error: 'Applicant reference mismatch — please reload the page and try again.' });
  }

  const raw = ctx.junction.doc_verifications;
  let newDocV;
  let clearInsight = false;
  if (action === 'archive') { newDocV = withArchivedActive(raw, ctx.junction.ai_insight || null); clearInsight = true; }
  else if (action === 'delete') { newDocV = withoutActive(raw); clearInsight = true; }
  else { newDocV = withoutArchived(raw, archivedId); } // delete-archived — active untouched

  try {
    const admin = getSupabaseAdminClient();
    // Primary write: doc_verifications (+ clear the active ai_insight for archive/delete). Both
    // columns exist, so this is the durable part of the change.
    const update = { doc_verifications: newDocV };
    if (clearInsight) update.ai_insight = null;
    const { error: upErr } = await admin.from('listing_applicants').update(update).eq('id', linkId);
    if (upErr) {
      console.error('[manage-analysis] write error:', upErr.message);
      return res.status(500).json({ error: 'Could not update the analysis. Please try again.' });
    }

    // Best-effort, ISOLATED: drop the tenant-notification "verified" flag when the active report
    // goes away. Separate update so a not-yet-migrated docs_verified column can't fail the change.
    if (clearInsight) {
      try { await admin.from('listing_applicants').update({ docs_verified: false }).eq('id', linkId); }
      catch (e) { console.warn('[manage-analysis] docs_verified reset skipped:', e?.message || e); }
    }
  } catch (e) {
    console.error('[manage-analysis] write exception:', e?.message || e);
    return res.status(500).json({ error: 'Could not update the analysis. Please try again.' });
  }

  // Return the fresh state the client needs (display array for the active report + archive list).
  const n = normalizeDocV(newDocV);
  return res.status(200).json({
    ok: true,
    docVerifications: n.active ? [n.active] : [],
    docArchived: n.archived,
    aiInsight: clearInsight ? null : (ctx.junction.ai_insight || null),
  });
}
