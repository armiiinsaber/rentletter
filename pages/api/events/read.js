// /api/events/read  POST: the realtor opened the assistant panel. One watermark per realtor
// (event_reads.last_read_at = now), written by the service role for the signed in realtor only.
import { requireRealtor } from '../../../lib/realtorAuth';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  const at = new Date().toISOString();
  try {
    const { error } = await getSupabaseAdminClient().from('event_reads').upsert({ profile_id: ctx.user.id, last_read_at: at }, { onConflict: 'profile_id' });
    if (error) throw error;
  } catch (e) { console.warn('[events/read] failed:', e?.message || e); }
  return res.status(200).json({ ok: true, lastReadAt: at });
}
