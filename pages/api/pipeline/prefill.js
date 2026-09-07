// /api/pipeline/prefill  POST { token }. PUBLIC. The apply page calls it once its submission
// succeeded: the prefill token is single use and is deleted here (lib/pipeline.js
// consumePrefill). It reveals nothing: the answer is the same for a token that never existed.
import { consumePrefill, isPrefillToken } from '../../../lib/pipeline';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = String((req.body || {}).token || '');
  if (!isPrefillToken(token)) return res.status(200).json({ ok: true });
  try { await consumePrefill(token); } catch (e) { /* best effort: the key expires on its own in 14 days */ }
  return res.status(200).json({ ok: true });
}
