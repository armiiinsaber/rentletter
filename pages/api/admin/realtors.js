// /api/admin/realtors — POST { action, ids, ... }. Session-checked server-side on every call.
//   preview  { ids }                                  → cascade counts for the confirm modal
//   suspend | unsuspend { ids }                       → reversible flag + auth ban/unban
//   delete   { ids, confirmEmails, deleteOrphanApplications } → HARD delete; confirmEmails must
//            contain every account's email (typed by the founder) or nothing happens.
import { requireAdmin, audit } from '../../../lib/adminAuth';
import { cascadePreview, deleteRealtors, setSuspended } from '../../../lib/adminData';
import { logServerError } from '../../../lib/serverLog';

const norm = (e) => String(e || '').trim().toLowerCase();

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAdmin(req, res))) return;
  const { action } = req.body || {};
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s)))];
  if (!ids.length) return res.status(400).json({ error: 'No accounts selected.' });
  if (ids.length > 50) return res.status(400).json({ error: 'At most 50 accounts per action.' });
  try {
    if (action === 'preview') return res.status(200).json(await cascadePreview(ids).then(({ _internal, ...p }) => p));
    if (action === 'suspend' || action === 'unsuspend') {
      const r = await setSuspended(ids, action === 'suspend');
      await audit(req, action, { ids, updated: r.updated, banned: r.banned, errors: r.errors });
      return res.status(200).json({ ok: true, ...r });
    }
    if (action === 'delete') {
      const pre = await cascadePreview(ids);
      const typed = new Set((Array.isArray(req.body?.confirmEmails) ? req.body.confirmEmails : []).map(norm).filter(Boolean));
      const missing = pre.accounts.filter((a) => !a.email || !typed.has(norm(a.email)));
      if (missing.length) return res.status(400).json({ error: `Type the email of every account to confirm (${missing.length} missing).`, code: 'confirm_mismatch' });
      const out = await deleteRealtors(ids, { deleteOrphanApplications: !!req.body?.deleteOrphanApplications });
      await audit(req, 'delete', { accounts: out.preview.accounts.map((a) => ({ id: a.id, email: a.email, name: a.name })), ...out.result, deleteOrphanApplications: !!req.body?.deleteOrphanApplications });
      return res.status(200).json({ ok: true, ...out });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[admin/realtors]', e, { action, ids });
    return res.status(500).json({ error: e?.message || 'Action failed.' });
  }
}
