// pages/api/notifications.js
// Realtor-authenticated notification center — DERIVED, on-load (no realtime/websockets).
//
// GET  -> { items, unreadCount, lastSeen }   built by lib/notificationsFeed.js (shared with the
//         dashboard's server load, so the first paint already carries the feed)
//     * NEW application -> listing_applicants.created_at
//     * WITHDRAWAL      -> listing_applicants.withdrawn_at (db/listing-applicants-vocabulary.sql)
//     * DOCUMENTS       -> listing_applicants.docs_submitted_at
//   "unread" = event timestamp newer than the realtor's profiles.notifications_last_seen marker.
// POST -> { ok:true }  marks everything seen (sets notifications_last_seen = now).
//
// Ownership is enforced by scoping to the realtor's own listings (RLS select on listings, then
// admin reads only those listing_ids). A realtor never sees another realtor's notifications.
// owner_token is never selected or returned.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { notificationsFor, EMPTY_FEED } from '../../lib/notificationsFeed';

export default async function handler(req, res) {
  // Degrade quietly when Supabase isn't configured — the bell just shows nothing.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (req.method === 'POST') return res.status(200).json({ ok: true });
    return res.status(200).json({ ...EMPTY_FEED });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  if (req.method === 'POST') {
    try {
      await supabase.from('profiles').update({ notifications_last_seen: new Date().toISOString() }).eq('id', user.id);
    } catch (e) {
      // Best-effort: if the column isn't migrated yet, the count simply reappears on reload.
      console.error('[notifications] mark-seen failed:', e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    return res.status(200).json(await notificationsFor({ supabase, admin: getSupabaseAdminClient(), userId: user.id }));
  } catch (e) {
    console.error('[notifications] load failed:', e?.message || e);
    return res.status(200).json({ ...EMPTY_FEED });
  }
}
