// /api/applicants/finalize-analysis  POST { listingId, linkId, applicationId }. Phase 2 of the
// realtor's document upload, called once after every file went through analyze-file: combines
// the staged facts into one report (lib/uploadCombine.js), writes doc_verifications on the owned
// junction row, records verification_completed or verification_failed, clears the signals cache
// and the staging key. Session and entitlement through withRealtor, ownership in
// lib/realtorUpload.js finalizeAnalysis. No bytes in this request.
import { withRealtor } from '../../../lib/realtorRoute';
import { finalizeAnalysis } from '../../../lib/realtorUpload';
import { kvReady, kvGetJson, kvSetJson, kvDel } from '../../../lib/docRequest';
import { listStoredDocuments, toClientDocument } from '../../../lib/documentStore';
import { recordEvent } from '../../../lib/events';
import { invalidateSignals } from '../../../lib/signalsCache';

export const config = { maxDuration: 30 };

export default withRealtor(async ({ user, admin }, req, res) => {
  if (!kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const r = await finalizeAnalysis({
    admin, userId: user.id,
    kv: { get: kvGetJson, set: kvSetJson, del: kvDel },
    listHeld: async (linkId) => { const { byLink } = await listStoredDocuments(admin, [linkId]); return (byLink.get(linkId) || []).map(toClientDocument); },
    recordEvent, invalidate: invalidateSignals,
  }, req.body || {});
  return res.status(r.status).json(r.body);
}, { label: '[applicants/finalize-analysis]' });
