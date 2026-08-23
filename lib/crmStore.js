// lib/crmStore.js
// SERVER-ONLY. Founder CRM data layer over the service-role client (db/crm.sql). Called only by
// /api/admin/crm after requireAdmin(). Validates every write against fixed vocabularies so the
// tables never hold a stage/source the UI doesn't know. Detects the pre-migration state
// (tables missing) and reports it instead of throwing.
import { getSupabaseAdminClient } from './supabase/admin';

export const STAGES = ['new', 'contacted', 'demo_booked', 'demo_done', 'follow_up_later', 'client', 'set_aside'];
export const SOURCES = ['referral', 'instagram', 'cold', 'other'];

const MISSING = (e) => e && (e.code === '42P01' || /relation .* does not exist|could not find the table|schema cache/i.test(e.message || ''));
export class MigrationMissing extends Error { constructor() { super('CRM tables are missing — run db/crm.sql.'); this.code = 'migration_missing'; } }
const check = (res) => { if (res.error) { if (MISSING(res.error)) throw new MigrationMissing(); throw new Error(res.error.message); } return res.data; };

const str = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);
const nameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isoDate = (v) => { if (!v) return null; const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const isoTs = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

// Everything the page needs, in one read (founder scale: hundreds of rows at most).
export async function readAll() {
  const sb = getSupabaseAdminClient();
  const [brokerages, leads, notes] = await Promise.all([
    sb.from('crm_brokerages').select('*').order('name', { ascending: true }).then(check),
    sb.from('crm_leads').select('*').order('updated_at', { ascending: false }).then(check),
    sb.from('crm_notes').select('*').order('created_at', { ascending: false }).then(check),
  ]);
  return { brokerages: brokerages || [], leads: leads || [], notes: notes || [] };
}

// Find-or-create a brokerage by name (case/space-insensitive). Returns the row or null.
export async function ensureBrokerage(sb, name) {
  const key = nameKey(name); if (!key) return null;
  const existing = check(await sb.from('crm_brokerages').select('*').eq('name_key', key).maybeSingle());
  if (existing) return existing;
  return check(await sb.from('crm_brokerages').insert({ name: String(name).trim().slice(0, 160), name_key: key }).select().single());
}

export function leadPatchFrom(body) {
  const p = {};
  if ('name' in body) p.name = str(body.name, 160);
  if ('email' in body) p.email = str(body.email, 200)?.toLowerCase() ?? null;
  if ('phone' in body) p.phone = str(body.phone, 40);
  if ('instagram' in body) p.instagram = str(String(body.instagram || '').replace(/^@+/, ''), 60);
  if ('source' in body) p.source = SOURCES.includes(body.source) ? body.source : 'other';
  if ('referred_by' in body) p.referred_by = str(body.referred_by, 160);
  if ('stage' in body) { if (!STAGES.includes(body.stage)) throw new Error('Unknown stage.'); p.stage = body.stage; }
  if ('demo_at' in body) p.demo_at = isoTs(body.demo_at);
  if ('follow_up_at' in body) p.follow_up_at = isoDate(body.follow_up_at);
  if ('follow_up_email_sent' in body) p.follow_up_email_sent = !!body.follow_up_email_sent;
  if ('follow_up_email_sent_at' in body) p.follow_up_email_sent_at = isoDate(body.follow_up_email_sent_at);
  if ('stage_changed_at' in body) p.stage_changed_at = isoTs(body.stage_changed_at);
  return p;
}

export async function saveLead(body) {
  const sb = getSupabaseAdminClient();
  const patch = leadPatchFrom(body);
  if (!body.id && !patch.name) throw new Error('A name is required.');
  if (body.id && 'name' in patch && !patch.name) throw new Error('A name is required.');
  if ('brokerage' in body || 'brokerage_id' in body) {
    if (body.brokerage_id === null || (body.brokerage != null && !nameKey(body.brokerage))) patch.brokerage_id = null;
    else if (body.brokerage_id) patch.brokerage_id = String(body.brokerage_id);
    else if (body.brokerage) patch.brokerage_id = (await ensureBrokerage(sb, body.brokerage))?.id || null;
  }
  patch.updated_at = new Date().toISOString();
  if (body.id) {
    const current = check(await sb.from('crm_leads').select('stage').eq('id', String(body.id)).maybeSingle());
    if (!current) throw new Error('Lead not found.');
    if (patch.stage && patch.stage !== current.stage && !patch.stage_changed_at) patch.stage_changed_at = patch.updated_at;
    return check(await sb.from('crm_leads').update(patch).eq('id', String(body.id)).select().single());
  }
  return check(await sb.from('crm_leads').insert({ stage: 'new', source: 'other', ...patch }).select().single());
}

export async function deleteLead(id) {
  const sb = getSupabaseAdminClient();
  check(await sb.from('crm_leads').delete().eq('id', String(id)));
  return true;
}

export async function saveBrokerage(body) {
  const sb = getSupabaseAdminClient();
  const patch = { updated_at: new Date().toISOString() };
  if ('name' in body) { patch.name = str(body.name, 160); if (!patch.name) throw new Error('A name is required.'); patch.name_key = nameKey(patch.name); }
  if ('website' in body) patch.website = str(body.website, 200);
  if (body.id) return check(await sb.from('crm_brokerages').update(patch).eq('id', String(body.id)).select().single());
  return check(await sb.from('crm_brokerages').insert(patch).select().single());
}

export async function deleteBrokerage(id) {
  const sb = getSupabaseAdminClient();
  check(await sb.from('crm_brokerages').delete().eq('id', String(id))); // leads keep their rows (brokerage_id → null)
  return true;
}

export async function addNote({ leadId, brokerageId, body }) {
  const sb = getSupabaseAdminClient();
  const text = String(body || '').trim().slice(0, 4000);
  if (!text) throw new Error('The note is empty.');
  if (!leadId && !brokerageId) throw new Error('A note needs a lead or a brokerage.');
  return check(await sb.from('crm_notes').insert({ lead_id: leadId ? String(leadId) : null, brokerage_id: brokerageId ? String(brokerageId) : null, body: text }).select().single());
}

export async function deleteNote(id) {
  const sb = getSupabaseAdminClient();
  check(await sb.from('crm_notes').delete().eq('id', String(id)));
  return true;
}
