// /api/upload/submit
// PUBLIC. The tenant submits their documents from the secure /upload/[token] page.
//
// PROCESS-AND-DISCARD (Stage 1): the raw file bytes are received into this function's memory
// ONLY. They are NEVER written to disk, a Storage bucket, or logs, and are dropped as soon as
// this handler returns. Stage 1 simply RECEIVES the upload and marks the request "received";
// Stage 2 will hand these transient bytes to the analysis pipeline. Nothing raw is persisted.
import { kvReady, kvGetJson, kvSetJson, reqKey, appKey, isDocReqToken, DOCREQ_TTL } from '../../../lib/docRequest';

// Accept the base64 batch through Next's default 1MB body cap (matches analyze-documents).
export const config = { api: { bodyParser: { sizeLimit: '26mb' } } };

const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB decoded, across all files
// Document-oriented types (superset of what the analyzer reads; broad here so tenants aren't
// blocked — Stage 2 categorizes/validates for analysis).
const OK_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  let { token, files } = req.body || {};
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Add at least one document.' });
  if (files.length > MAX_FILES) return res.status(400).json({ error: `Up to ${MAX_FILES} files at a time.` });

  // Validate size/type without storing anything. Byte count is derived from the base64 length.
  let totalBytes = 0;
  const names = [];
  for (const f of files) {
    const data = String(f?.data || '');
    if (!data || data.length < 16) return res.status(400).json({ error: 'One of the files looks empty.' });
    const mime = String(f?.type || '').toLowerCase();
    if (mime && !OK_MIME.has(mime)) return res.status(400).json({ error: 'Please upload PDF, image, or Word documents.' });
    totalBytes += Math.floor((data.length * 3) / 4);
    names.push(String(f?.name || 'document').slice(0, 120));
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: 'Those documents are too large together (max 25MB). Try fewer or smaller files.' });
  }

  const rec = await kvGetJson(reqKey(token));
  if (!rec) return res.status(404).json({ error: 'This upload link has expired or is no longer active.' });

  // ── Stage 2 will analyze here (the transient `files` bytes are available in memory now). ──
  // Stage 1: acknowledge receipt only. Explicitly drop all references to the raw bytes.
  const fileCount = files.length;
  for (const f of files) { if (f) f.data = null; }
  files = null;
  req.body.files = null;

  const receivedAt = new Date().toISOString();
  try {
    await kvSetJson(reqKey(token), { ...rec, status: 'received', receivedAt, fileCount }, DOCREQ_TTL);
    if (rec.linkId) {
      const ptr = await kvGetJson(appKey(rec.linkId));
      await kvSetJson(appKey(rec.linkId), { ...(ptr || {}), token, status: 'received', requestedAt: (ptr && ptr.requestedAt) || rec.requestedAt || null, receivedAt, fileCount }, DOCREQ_TTL);
    }
  } catch (e) {
    console.error('[upload/submit] status write error:', e?.message || e);
    // The tenant's docs were received; a status-write hiccup shouldn't error them out.
  }

  return res.status(200).json({ ok: true, received: fileCount });
}
