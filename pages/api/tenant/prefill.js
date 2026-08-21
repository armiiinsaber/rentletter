// /api/tenant/prefill — GET (session cookie). The signed-in tenant's durable facts, shaped as
// the apply form, for "apply in seconds". Listing fields are blank by construction.
import { sessionProfile, cleanFacts } from '../../../lib/tenantProfileStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.' });
  if (!p.facts) return res.status(404).json({ error: 'No saved details yet.' });
  const form = cleanFacts(p.facts);
  form.email = p.email;
  const last = p.applications?.[0] || null;
  return res.status(200).json({ ok: true, form, email: p.email, lastListingAddress: last?.listingAddress || null, lastApplicationNumber: last?.applicationNumber || null });
}
