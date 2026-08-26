// /api/admin/promos — founder only (admin session, server-checked).
//   GET                                      → { codes, lifetimeActive, cap, migrationMissing }
//   POST { action: 'check', code }           → { available, reason }
//   POST { action: 'create', ...fields }     → { code }
//   POST { action: 'revoke', id }            → { code }   (active = false; existing grants stay)
import { requireAdmin, audit } from '../../../lib/adminAuth';
import { listPromoCodes, codeAvailable, createPromoCode, revokePromoCode, LIFETIME_CAP } from '../../../lib/promos';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Database not configured.' });
  try {
    if (req.method === 'GET') { const r = await listPromoCodes(); return res.status(200).json({ ...r, cap: LIFETIME_CAP }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.action === 'check') { const r = await codeAvailable(b.code); return res.status(200).json({ available: r.ok, reason: r.reason }); }
    if (b.action === 'create') { const code = await createPromoCode(b); await audit(req, 'promo_create', { code: code.code, grantType: code.grant_type, label: code.label }); return res.status(200).json({ code }); }
    if (b.action === 'revoke') { if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ''))) return res.status(400).json({ error: 'Bad id.' }); const code = await revokePromoCode(b.id); await audit(req, 'promo_revoke', { code: code.code }); return res.status(200).json({ code }); }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[admin/promos]', e, { action: req.body?.action });
    return res.status(400).json({ error: e?.message || 'That didn’t save.' });
  }
}
