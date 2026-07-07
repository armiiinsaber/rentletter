// /api/upload/resolve
// PUBLIC. The tenant document-upload page (/upload/[token]) calls this to resolve its token
// and show WHOSE application it's for (their name + the unit) so they know the link is theirs.
// Returns only tenant-safe fields — never owner_token, internal ids, or the realtor's email.
import { kvReady, kvGetJson, reqKey, isDocReqToken } from '../../../lib/docRequest';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.query.token || '');
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  const rec = await kvGetJson(reqKey(token));
  if (!rec) {
    // Missing or expired (KV TTL) — friendly, not a 404 page.
    return res.status(404).json({ error: 'This upload link has expired or is no longer active. Please ask your realtor for a new one.' });
  }

  return res.status(200).json({
    tenantName: rec.tenantName || '',
    listingName: rec.listingName || '',
    address: rec.address || '',
    realtorName: rec.realtorName || '',
    brokerage: rec.brokerage || '',
    status: rec.status || 'requested', // 'requested' | 'received'
    receivedAt: rec.receivedAt || null,
  });
}
