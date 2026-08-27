// /api/events  GET ?before=<iso>&limit=<n>: the realtor's timeline, newest first, one page at a
// time, plus their read watermark. Reads run under the realtor's own session (RLS: own rows).
// Nothing here writes; there is no update or delete route for events anywhere.
import { requireRealtor } from '../../../lib/realtorAuth';

const PAGE = 30;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  const limit = Math.min(60, Math.max(5, Number(req.query.limit) || PAGE));
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
  try {
    let q = ctx.supabase.from('events').select('id, listing_id, application_id, type, payload, created_at').order('created_at', { ascending: false }).limit(limit + 1);
    if (before) q = q.lt('created_at', before);
    const [{ data: rows, error }, { data: read }] = await Promise.all([q, ctx.supabase.from('event_reads').select('last_read_at').eq('profile_id', ctx.user.id).maybeSingle()]);
    if (error) throw error;
    const events = (rows || []).slice(0, limit);
    const more = (rows || []).length > limit;
    return res.status(200).json({ events, lastReadAt: read?.last_read_at || null, nextBefore: more && events.length ? events[events.length - 1].created_at : null });
  } catch (e) {
    // Before db/events.sql has run the tables are absent: an empty timeline, not an error.
    console.warn('[events] list failed:', e?.message || e);
    return res.status(200).json({ events: [], lastReadAt: null, nextBefore: null });
  }
}
