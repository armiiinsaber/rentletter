// /api/tenant/sync-application — POST { applicationNumber, ownerToken }
// Called by /apply/[token] right after a successful submission (best-effort, like the mirror):
// attaches the new application to the email's profile and refreshes the profile facts from it.
// Owner token proves ownership, so no session is required. Also usable as a manual "link this
// application to my profile" from the profile page.
import { timingSafeEqual } from 'crypto';
import { kvGet } from '../../../lib/kv';
import { kvReady, attachApplication } from '../../../lib/tenantProfileStore';
import { isApplicationNumber } from '../../../lib/applicationIds';

function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(200).json({ ok: false, skipped: 'kv-unconfigured' });
  const appNum = String(req.body?.applicationNumber || '').trim().toUpperCase();
  if (!isApplicationNumber(appNum)) return res.status(400).json({ error: 'Invalid application number.' });
  const app = await kvGet(`app:${appNum}`);
  if (!app || !safeEqual(app.ownerToken, String(req.body?.ownerToken || '').trim())) return res.status(401).json({ error: 'Invalid owner token.' });
  try {
    const p = await attachApplication(app);
    return res.status(200).json({ ok: !!p, email: p?.email || null });
  } catch (e) {
    console.error('[tenant/sync-application] failed', e?.message || e);
    return res.status(200).json({ ok: false });
  }
}
