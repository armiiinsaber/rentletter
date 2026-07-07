// pages/api/notifications.js
// Realtor-authenticated notification center — DERIVED, on-load (no realtime/websockets).
//
// GET  -> { items, unreadCount, lastSeen }
//   Notifications are computed from existing listing_applicants timestamps for listings the
//   signed-in realtor OWNS:
//     * NEW application -> listing_applicants.created_at
//     * WITHDRAWAL      -> decision_status = 'withdrawn' AND decision_changed_at
//   "unread" = event timestamp newer than the realtor's profiles.notifications_last_seen marker.
// POST -> { ok:true }  marks everything seen (sets notifications_last_seen = now).
//
// Ownership is enforced by scoping to the realtor's own listings (RLS select on listings, then
// admin reads only those listing_ids). A realtor never sees another realtor's notifications.
// owner_token is never selected or returned.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';

// First-run window: with no marker yet, only surface activity from the last 14 days as unread
// (so an established realtor isn't greeted by "9+" for their entire back-catalogue).
const FIRST_RUN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 60;   // bound the query
const MAX_ITEMS = 40;  // bound the returned list

export default async function handler(req, res) {
  // Degrade quietly when Supabase isn't configured — the bell just shows nothing.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (req.method === 'POST') return res.status(200).json({ ok: true });
    return res.status(200).json({ items: [], unreadCount: 0, lastSeen: null });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  // ── POST: mark everything seen ──────────────────────────────────────────────────────────
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
    // 1. The realtor's OWN listings (RLS: profile_id = auth.uid()).
    const { data: listings } = await supabase
      .from('listings').select('id, name, address').eq('profile_id', user.id);
    const owned = listings || [];
    if (owned.length === 0) return res.status(200).json({ items: [], unreadCount: 0, lastSeen: null });
    const listingIds = owned.map((l) => l.id);
    const listingName = Object.fromEntries(owned.map((l) => [String(l.id), l.name || l.address || 'your listing']));

    // 2. The last-seen marker (graceful if the column doesn't exist yet).
    let lastSeenIso = null;
    try {
      const { data: profile } = await supabase
        .from('profiles').select('notifications_last_seen').eq('id', user.id).maybeSingle();
      lastSeenIso = profile?.notifications_last_seen || null;
    } catch (e) { lastSeenIso = null; }
    const lastSeen = lastSeenIso ? new Date(lastSeenIso).getTime() : (Date.now() - FIRST_RUN_WINDOW_MS);

    // 3. Applicant links for the owned listings (service-role; already ownership-constrained).
    const admin = getSupabaseAdminClient();
    const { data: rows } = await admin
      .from('listing_applicants')
      .select('id, listing_id, application_id, created_at, decision_status, decision_changed_at')
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    const links = rows || [];

    // 4. Resolve applicant display names (never select owner_token).
    const appIds = [...new Set(links.map((r) => r.application_id).filter((v) => v != null))];
    let nameById = {};
    if (appIds.length) {
      const { data: apps } = await admin.from('applications').select('id, full_name').in('id', appIds);
      nameById = Object.fromEntries((apps || []).map((a) => [String(a.id), a.full_name || 'An applicant']));
    }

    // 5. Build events. A withdrawn applicant yields both their original "new" event and a
    //    "withdrew" event — each judged unread independently against last_seen.
    const items = [];
    for (const r of links) {
      const name = nameById[String(r.application_id)] || 'An applicant';
      const lname = listingName[String(r.listing_id)] || 'your listing';
      const createdTs = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (createdTs) {
        items.push({
          id: `new:${r.id}`, type: 'new', name, listingId: r.listing_id, listingName: lname,
          title: `New application from ${name}`, ts: createdTs, unread: createdTs > lastSeen,
        });
      }
      if (r.decision_status === 'withdrawn' && r.decision_changed_at) {
        const wTs = new Date(r.decision_changed_at).getTime();
        items.push({
          id: `wd:${r.id}`, type: 'withdrawn', name, listingId: r.listing_id, listingName: lname,
          title: `${name} withdrew`, ts: wTs, unread: wTs > lastSeen,
        });
      }
    }

    // 5b. Tenant document uploads (GROUP 3): derive a "documents received (& verified)" event
    //     from the docs_submitted_at marker /api/upload/finalize sets on the applicant's row —
    //     the same derived-from-timestamps model as the new/withdrawal events above. Isolated +
    //     best-effort so a not-yet-migrated docs_submitted_at/docs_verified column can't break
    //     the whole bell.
    try {
      const { data: docRows } = await admin
        .from('listing_applicants')
        .select('id, listing_id, application_id, docs_submitted_at, docs_verified')
        .in('listing_id', listingIds)
        .not('docs_submitted_at', 'is', null)
        .order('docs_submitted_at', { ascending: false })
        .limit(MAX_ROWS);
      const drows = docRows || [];
      // Resolve any applicant names not already known from the events above.
      const missing = [...new Set(drows.map((r) => r.application_id).filter((v) => v != null && !(String(v) in nameById)))];
      if (missing.length) {
        const { data: apps2 } = await admin.from('applications').select('id, full_name').in('id', missing);
        for (const a of (apps2 || [])) nameById[String(a.id)] = a.full_name || 'An applicant';
      }
      for (const r of drows) {
        const ts = r.docs_submitted_at ? new Date(r.docs_submitted_at).getTime() : 0;
        if (!ts) continue;
        const name = nameById[String(r.application_id)] || 'An applicant';
        const lname = listingName[String(r.listing_id)] || 'your listing';
        items.push({
          id: `docs:${r.id}`, type: 'docs', name, listingId: r.listing_id, listingName: lname,
          title: r.docs_verified ? `Documents received & verified for ${name}` : `Documents received for ${name}`,
          ts, unread: ts > lastSeen,
        });
      }
    } catch (e) {
      console.warn('[notifications] docs events skipped:', e?.message || e);
    }

    items.sort((a, b) => b.ts - a.ts);
    const unreadCount = items.filter((i) => i.unread).length;
    return res.status(200).json({ items: items.slice(0, MAX_ITEMS), unreadCount, lastSeen: lastSeenIso });
  } catch (e) {
    console.error('[notifications] load failed:', e?.message || e);
    return res.status(200).json({ items: [], unreadCount: 0, lastSeen: null });
  }
}
