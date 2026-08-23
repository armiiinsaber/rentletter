// /api/admin/crm — the founder CRM's only route. Session-checked server-side on every call.
//   GET                                  → { brokerages, leads, notes, generatedAt }
//   POST { action: 'save_lead', ...fields }         → upsert (id present = edit, incl. stage moves)
//   POST { action: 'delete_lead', id }
//   POST { action: 'save_brokerage', ...fields }
//   POST { action: 'delete_brokerage', id }          (leads stay, unlinked)
//   POST { action: 'add_note', leadId | brokerageId, body }   (append-only)
//   POST { action: 'delete_note', id }
// Pre-migration: every call answers 503 { code: 'migration_missing', migration: 'db/crm.sql' }.
import { requireAdmin, audit } from '../../../lib/adminAuth';
import { readAll, saveLead, deleteLead, saveBrokerage, deleteBrokerage, addNote, deleteNote } from '../../../lib/crmStore';
import { logServerError } from '../../../lib/serverLog';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return res.status(503).json({ error: 'Database not configured.' });
  const action = req.method === 'GET' ? 'read' : req.body?.action;
  try {
    if (req.method === 'GET') return res.status(200).json({ ...(await readAll()), generatedAt: new Date().toISOString() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    const id = b.id != null ? String(b.id) : null;
    if (['delete_lead', 'delete_brokerage', 'delete_note'].includes(action) && !UUID.test(id || '')) return res.status(400).json({ error: 'Bad id.' });
    switch (action) {
      case 'save_lead': { const lead = await saveLead(b); if (!b.id) await audit(req, 'crm_lead_created', { id: lead.id }); return res.status(200).json({ ok: true, lead }); }
      case 'delete_lead': await deleteLead(id); await audit(req, 'crm_lead_deleted', { id }); return res.status(200).json({ ok: true });
      case 'save_brokerage': return res.status(200).json({ ok: true, brokerage: await saveBrokerage(b) });
      case 'delete_brokerage': await deleteBrokerage(id); await audit(req, 'crm_brokerage_deleted', { id }); return res.status(200).json({ ok: true });
      case 'add_note': return res.status(200).json({ ok: true, note: await addNote({ leadId: b.leadId, brokerageId: b.brokerageId, body: b.body }) });
      case 'delete_note': await deleteNote(id); return res.status(200).json({ ok: true });
      default: return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (e) {
    if (e?.code === 'migration_missing') return res.status(503).json({ error: e.message, code: 'migration_missing', migration: 'db/crm.sql' });
    logServerError('[admin/crm]', e, { action });
    return res.status(e?.message && /required|empty|Unknown|not found|needs/i.test(e.message) ? 400 : 500).json({ error: e?.message || 'Action failed.' });
  }
}
