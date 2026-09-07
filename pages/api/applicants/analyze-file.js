// /api/applicants/analyze-file  POST { listingId, linkId, applicationId, index, total, file }.
// Phase 1 of the realtor's document upload: ONE file per request, the realtor variant of
// pages/api/upload/analyze-file.js. Session and entitlement through lib/realtorRoute.js
// withRealtor, ownership inside lib/realtorUpload.js analyzeOneFile (the listing carries
// profile_id === user.id, the junction row sits on it, the applicationId matches). The same
// engine (lib/applicantAnalysis.js), the same per file cap (4MB decoded, about 3MB on disk), the
// same store of the original after the analysis succeeded. The facts are staged in KV under
// rstage:{userId}:{linkId}; nothing is written to listing_applicants until finalize-analysis.
import { withRealtor } from '../../../lib/realtorRoute';
import { analyzeOneFile } from '../../../lib/realtorUpload';
import { runDocumentAnalysis } from '../../../lib/applicantAnalysis';
import { storeAnalyzedDocuments } from '../../../lib/documentStore';
import { kvReady, kvGetJson, kvSetJson, kvDel } from '../../../lib/docRequest';

// A single base64 file (at most 4MB decoded, about 5.4MB encoded) plus a few ids: well under
// Vercel's 4.5MB request body cap is impossible to promise for the encoding, so the client caps
// each file at 3MB on disk (4MB encoded). One vision call per request.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } }, maxDuration: 30 };

export default withRealtor(async ({ user, admin }, req, res) => {
  if (!kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });
  const r = await analyzeOneFile({
    admin, userId: user.id,
    kv: { get: kvGetJson, set: kvSetJson, del: kvDel },
    analyze: runDocumentAnalysis,
    store: (args) => storeAnalyzedDocuments(admin, args),
  }, req.body || {});
  if (req.body) req.body.file = null;
  return res.status(r.status).json(r.body);
}, { label: '[applicants/analyze-file]' });
